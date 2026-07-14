// availability_guarantee — availability-guarantee claim lifecycle as data.
//
// An IPP (provider) opens a guarantee period against an asset with a
// contracted availability %. The period is measured, then the buyer (offtaker)
// assesses the measurement against the guarantee: a met period CLOSES; a
// shortfall period computes the gap and the provider instructs a remedy
// (liquidated damages / service credit / make-good). A disputed shortfall goes
// to the operator to uphold or waive.
//
// STRUCTURAL settlement-honesty gate: instruct_remedy is the ONLY edge into
// remedy_instructed, and it fires ONLY from shortfall_computed. assess_met goes
// straight to the terminal met_closed. So a period that met its guarantee can
// NEVER have a remedy instructed against it — the state graph enforces it, no
// guard needed. (Mirrors permit_to_work's isolation gate.)
//
// settles:false — this chain RECORDS a remedy INSTRUCTION, it never moves money.
// remedy_instructed carries the *_instructed suffix and NO settlement finality:
// the actual credit/damages payment settles on a money rail outside this chain.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure shortfall computation off the carried fields (percentage points). No clock.
const shortfallPct = (f: Record<string, Json>): Record<string, Json> => {
  const g = f['guaranteed_availability_pct'];
  const m = f['measured_availability_pct'];
  return typeof g === 'number' && typeof m === 'number' ? { shortfall_pct: g - m } : {};
};

export const availabilityGuarantee: ChainDecl = {
  key: 'availability_guarantee',
  noun: 'Availability guarantee claim',
  refPrefix: 'AVGT',
  title: (f) =>
    `Availability guarantee — ${(f.asset_name as string) ?? 'unnamed asset'} @ ${
      typeof f.guaranteed_availability_pct === 'number' ? `${f.guaranteed_availability_pct}%` : 'n/a'
    }`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP PPA', provision: 'availability guarantee & liquidated-damages schedule', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'network availability reporting', effect: 'requires' },
  ],
  roles: ['provider', 'buyer', 'regulator', 'operator'],

  fields: {
    asset_name: { type: 'string', required: true, label: 'Asset' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    guaranteed_availability_pct: { type: 'number', required: true, min: 0, max: 100, label: 'Guaranteed availability (%)' },
    period_start: { type: 'string', required: true, label: 'Period start' },
    period_end: { type: 'string', required: true, label: 'Period end' },
    buyer_party: { type: 'party', role: 'buyer', label: 'Buyer / offtaker' },
    measured_availability_pct: { type: 'number', min: 0, max: 100, label: 'Measured availability (%)' },
    remedy_ref: { type: 'string', label: 'Remedy reference' },
    remedy_zar: { type: 'number', min: 0, label: 'Remedy value (ZAR)' },
    // written by derive, never by the client
    shortfall_pct: { type: 'number', label: 'Shortfall (pct points)' },
    measured_at: { type: 'string', label: 'Measured at' },
    computed_at: { type: 'string', label: 'Shortfall computed at' },
    met_at: { type: 'string', label: 'Guarantee met at' },
    instructed_at: { type: 'string', label: 'Remedy instructed at' },
  },

  initial: 'period_open',

  states: {
    period_open: { label: 'Period open', terminal: false, holder: 'provider', sla: { days: 30 } },
    measured: { label: 'Measured', terminal: false, holder: 'buyer', sla: { days: 14 } },
    shortfall_computed: { label: 'Shortfall computed', terminal: false, holder: 'provider', sla: { days: 30 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'operator', sla: { days: 30 } },
    // NO SETTLEMENT FINALITY — RECORD ONLY. The remedy payment settles elsewhere.
    remedy_instructed: { label: 'Remedy instructed', terminal: true, holder: 'none' },
    met_closed: { label: 'Met — closed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'period_open',
      by: ['provider', 'operator'],
      actorBecomes: 'provider',
      label: 'Open guarantee period',
      intent: 'primary',
      input: {
        asset_name: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        guaranteed_availability_pct: { type: 'number', required: true, min: 0, max: 100 },
        period_start: { type: 'string', required: true },
        period_end: { type: 'string', required: true },
        buyer_party: { type: 'party', role: 'buyer' },
      },
      guards: ['counterpartyDistinct'],
    },

    // --- measurement + assessment ------------------------------------------
    {
      id: 'measure',
      from: 'period_open',
      to: 'measured',
      by: ['provider', 'operator'],
      label: 'Record measured availability',
      intent: 'primary',
      input: { measured_availability_pct: { type: 'number', required: true, min: 0, max: 100 } },
      guards: [],
      derive: (_f, at: Instant) => ({ measured_at: isoUtc(at) }),
    },
    {
      id: 'assess_shortfall',
      from: 'measured',
      to: 'shortfall_computed',
      by: ['buyer', 'operator'],
      label: 'Assess — shortfall',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => ({ ...shortfallPct(f), computed_at: isoUtc(at) }),
    },
    {
      id: 'assess_met',
      from: 'measured',
      to: 'met_closed',
      by: ['buyer', 'operator'],
      label: 'Assess — guarantee met',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ met_at: isoUtc(at) }),
    },

    // --- remedy (RECORD ONLY) ----------------------------------------------
    {
      // structural gate: the ONLY edge into remedy_instructed, only from
      // shortfall_computed — a met period can never reach here. Strategic assets
      // (≥100 MW) additionally need a regulator on the txn.
      id: 'instruct_remedy',
      from: 'shortfall_computed',
      to: 'remedy_instructed',
      by: ['provider', 'operator', 'system'],
      label: 'Instruct remedy',
      intent: 'primary',
      input: {
        // optional: the time-bar sweep fires this edge with no input; derive
        // defaults the ref to the contractual LD-schedule remedy.
        remedy_ref: { type: 'string' },
        remedy_zar: { type: 'number', min: 0 },
      },
      requiresReason: ['liquidated_damages', 'service_credit', 'make_good', 'capacity_replacement'],
      guards: ['regulatorPresentIfStrategic'],
      derive: (f, at: Instant) => ({
        instructed_at: isoUtc(at),
        ...(typeof f['remedy_ref'] === 'string' && f['remedy_ref'] ? {} : { remedy_ref: 'PPA-LD-SCHEDULE-DEFAULT' }),
      }),
    },

    // --- dispute loop ------------------------------------------------------
    {
      id: 'dispute',
      from: 'shortfall_computed',
      to: 'disputed',
      by: ['buyer', 'provider'],
      label: 'Dispute shortfall',
      intent: 'destructive',
      requiresReason: ['measurement_error', 'force_majeure', 'grid_curtailment', 'scheduled_outage'],
      guards: [],
    },
    { id: 'uphold', from: 'disputed', to: 'shortfall_computed', by: ['operator', 'regulator'], label: 'Uphold shortfall', intent: 'primary', guards: [] },
    {
      id: 'waive',
      from: 'disputed',
      to: 'met_closed',
      by: ['operator', 'regulator'],
      label: 'Waive shortfall',
      intent: 'secondary',
      requiresReason: ['measurement_corrected', 'excused_outage', 'mutual_agreement'],
      guards: [],
      derive: (_f, at: Instant) => ({ met_at: isoUtc(at) }),
    },

    // --- exits -------------------------------------------------------------
    {
      id: 'withdraw',
      from: 'period_open',
      to: 'withdrawn',
      by: ['provider'],
      label: 'Withdraw period',
      intent: 'destructive',
      requiresReason: ['opened_in_error', 'asset_decommissioned', 'period_superseded'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['period_open', 'measured'],
      to: 'cancelled',
      by: ['buyer', 'operator'],
      label: 'Cancel period',
      intent: 'destructive',
      requiresReason: ['duplicate_period', 'contract_terminated', 'data_unavailable'],
      guards: [],
    },
  ],

  // remedy time-bar: a computed shortfall left un-instructed for 60 days defaults
  // to the PPA liquidated-damages schedule remedy (derive fills remedy_ref).
  timers: [{ onState: 'shortfall_computed', after: { days: 60 }, fire: 'instruct_remedy', kind: 'time_bar', reason: 'liquidated_damages' }],
};
