// security_margin — transmission outage security-margin assessment lifecycle.
//
// Grid Operator chain (REBUILD_FUNCTIONAL_FLOOR "security-margin": Transmission
// security margin %, securityMarginPct(), bound to an outage txn). A requester
// (asset owner / maintenance crew) asks to take a transmission element out of
// service; the grid operator computes the resulting security margin %, approves
// or rejects, then the element goes out and is restored.
//
// The reliability spine is STRUCTURAL, not a guard: commence_outage leaves ONLY
// outage_approved, and the ONLY path into outage_approved is approve_outage from
// margin_assessed. So an element can NEVER be de-energised before its security
// margin has been assessed and the outage approved — the state graph enforces
// it, no guard needed. A critical-priority outage additionally crosses to the
// regulator: approve_outage is guarded by regulatorPresentIfCritical.
//
// NO claim key. An outage is while-active exclusivity over a network element,
// not permanent consumption — the same element is scheduled out again next
// window. A permanent claim would wrongly block the element forever (same call
// as permit_to_work).
//
// settles:false — an outage authorisation is a network-security control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure reserve-margin %: how much firm headroom remains once the outaged
// capacity is removed and forecast peak is served. No clock, no env.
const securityMarginPct = (f: Record<string, Json>): number | null => {
  const firm = f.firm_capacity_mw;
  const out = f.outage_capacity_mw;
  const peak = f.forecast_peak_mw;
  if (typeof firm !== 'number' || typeof out !== 'number' || typeof peak !== 'number' || peak <= 0) return null;
  return Math.round(((firm - out - peak) / peak) * 1000) / 10;
};

// pure margin-tier bucketing off the computed %.
const marginTier = (pct: number | null): string => {
  if (typeof pct !== 'number') return 'unassessed';
  if (pct < 0) return 'breach';
  if (pct < 5) return 'critical';
  if (pct < 15) return 'tight';
  return 'adequate';
};

export const securityMargin: ChainDecl = {
  key: 'security_margin',
  noun: 'Transmission outage',
  refPrefix: 'SM',
  title: (f) => `${(f.outage_type as string) ?? 'planned'} outage — ${(f.element_name as string) ?? 'unnamed element'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'network security & outage planning', effect: 'requires' },
    { instrument: 'ERA 2006', provision: 's34 system operation & security of supply', effect: 'requires' },
  ],
  roles: ['requester', 'grid', 'regulator', 'operator'],

  fields: {
    outage_ref: { type: 'string', label: 'Outage reference' },
    requester_party: { type: 'party', role: 'requester', label: 'Outage requester' },
    grid_party: { type: 'party', role: 'grid', label: 'Grid operator' },
    element_name: { type: 'string', required: true, label: 'Transmission element' },
    element_tag: { type: 'string', label: 'Element tag' },
    voltage_kv: { type: 'number', min: 0, label: 'Voltage (kV)' },
    outage_type: { type: 'string', required: true, label: 'Type (planned/forced/emergency)' },
    priority: { type: 'string', label: 'Priority (normal/high/critical)' },
    reason_description: { type: 'string', required: true, label: 'Reason for outage' },
    window_start: { type: 'string', label: 'Requested window start' },
    window_end: { type: 'string', label: 'Requested window end' },
    firm_capacity_mw: { type: 'number', min: 0, label: 'Firm capacity (MW)' },
    outage_capacity_mw: { type: 'number', min: 0, label: 'Capacity removed by outage (MW)' },
    forecast_peak_mw: { type: 'number', min: 0, label: 'Forecast peak demand (MW)' },
    // written by derive, never by the client
    security_margin_pct: { type: 'number', label: 'Security margin (%)' },
    margin_tier: { type: 'string', label: 'Margin tier' },
    assessed_at: { type: 'string', label: 'Margin assessed at' },
    approved_at: { type: 'string', label: 'Outage approved at' },
    commenced_at: { type: 'string', label: 'Element out at' },
    restored_at: { type: 'string', label: 'Element restored at' },
    closed_at_outage: { type: 'string', label: 'Outage closed at' },
  },

  initial: 'outage_requested',

  states: {
    outage_requested: { label: 'Outage requested', terminal: false, holder: 'grid', sla: { hours: 8 } },
    margin_assessed: { label: 'Margin assessed', terminal: false, holder: 'grid', sla: { hours: 4 } },
    outage_approved: { label: 'Outage approved', terminal: false, holder: 'grid', sla: { hours: 4 } },
    element_out: { label: 'Element out of service', terminal: false, holder: 'grid' },
    element_restored: { label: 'Element restored', terminal: false, holder: 'grid', sla: { hours: 4 } },
    outage_closed: { label: 'Outage closed', terminal: true, holder: 'none' },
    outage_rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    outage_withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'outage_requested',
      by: ['requester', 'operator'],
      actorBecomes: 'requester',
      label: 'Request outage',
      intent: 'primary',
      input: {
        element_name: { type: 'string', required: true },
        element_tag: { type: 'string' },
        voltage_kv: { type: 'number', min: 0 },
        outage_type: { type: 'string', required: true },
        priority: { type: 'string' },
        reason_description: { type: 'string', required: true },
        window_start: { type: 'string' },
        window_end: { type: 'string' },
        firm_capacity_mw: { type: 'number', min: 0 },
        outage_capacity_mw: { type: 'number', min: 0 },
        forecast_peak_mw: { type: 'number', min: 0 },
        grid_party: { type: 'party', role: 'grid' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'assess_margin',
      from: 'outage_requested',
      to: 'margin_assessed',
      by: ['grid', 'operator'],
      label: 'Assess security margin',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => {
        const pct = securityMarginPct(f);
        return { security_margin_pct: pct, margin_tier: marginTier(pct), assessed_at: isoUtc(at) };
      },
    },
    {
      id: 'approve_outage',
      from: 'margin_assessed',
      to: 'outage_approved',
      by: ['grid'],
      label: 'Approve outage',
      intent: 'primary',
      // a critical-priority outage crosses to the regulator: one must be a party.
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      // structural reliability gate: the ONLY edge into element_out, and it can
      // only fire from outage_approved — which only approve_outage reaches, and
      // only from margin_assessed. An element therefore cannot go out of service
      // before its margin is assessed and the outage approved. No guard.
      id: 'commence_outage',
      from: 'outage_approved',
      to: 'element_out',
      by: ['grid'],
      label: 'Take element out of service',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ commenced_at: isoUtc(at) }),
    },
    {
      id: 'restore_element',
      from: 'element_out',
      to: 'element_restored',
      by: ['grid'],
      label: 'Restore element to service',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ restored_at: isoUtc(at) }),
    },
    {
      id: 'close_outage',
      from: 'element_restored',
      to: 'outage_closed',
      by: ['grid'],
      label: 'Close outage',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_outage: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_outage',
      from: ['outage_requested', 'margin_assessed'],
      to: 'outage_rejected',
      by: ['grid', 'regulator'],
      label: 'Reject outage',
      intent: 'destructive',
      requiresReason: ['margin_breach', 'window_conflict', 'insufficient_justification', 'competing_outage'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['outage_requested', 'margin_assessed'],
      to: 'outage_withdrawn',
      by: ['requester'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['work_cancelled', 'rescheduled', 'no_longer_required'],
      guards: [],
    },
  ],
};
