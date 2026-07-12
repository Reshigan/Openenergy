// reserve_activation — a System Operator STOR (Short Term Operating Reserve)
// activation on a contracted reserve provider, as data.
//
// The grid (System Operator) instructs a reserve provider to activate contracted
// reserve: instruct → provider acknowledges → dispatch (ramp to output) →
// provider reports delivered MW/MWh → SO meters & verifies delivery against the
// instructed volume → a settlement is instructed (record only). A provider earns
// a utilisation payment for the reserve energy actually delivered; falling short
// lands in non_delivery.
//
// STRUCTURAL delivery spine (demand_response / permit_to_work pattern):
// settlement can ONLY be instructed from `delivery_verified`, which is only
// reachable from `delivered`, which is only reachable from `dispatched`. So a
// utilisation payment can NEVER rest on reserve that was never dispatched and
// metered as delivered. No guard enforces this — the state graph does.
//
// Regulatory gate: a `critical` (system-emergency) activation crosses a reporting
// line — regulatorPresentIfCritical requires NERSA (a live `regulator` party) on
// the txn at open. Routine reserve calls register freely. A regulator can only be
// a party if attached at open, so regulator_party is an open-input party field.
// counterpartyDistinct also blocks the SO instructing reserve on itself.
//
// settles:false — this chain RECORDS a settlement instruction; it moves no money.
// Terminal money state is `settlement_instructed` and export always carries the
// record-only custody notice (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure delivered/instructed performance, 1 d.p. No clock, no env. null when the
// inputs can't produce a ratio (never divides by zero).
const performancePct = (instructed: Json | undefined, delivered: Json | undefined): number | null => {
  if (typeof instructed !== 'number' || typeof delivered !== 'number' || instructed <= 0) return null;
  return Math.round((delivered / instructed) * 1000) / 10;
};

export const reserveActivation: ChainDecl = {
  key: 'reserve_activation',
  noun: 'Reserve activation',
  refPrefix: 'RA',
  title: (f) =>
    `Reserve activation — ${(f.reserve_product as string) ?? 'STOR'} on ${
      (f.provider_name as string) ?? 'provider'
    } (${typeof f.instructed_mw === 'number' ? f.instructed_mw : '?'} MW)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'System Operations Code — ancillary services & operating reserve dispatch', effect: 'authorises' },
    { instrument: 'ERA 2006', provision: 's34 dispatch determination', effect: 'authorises' },
    { instrument: 'NRS 048', provision: 'reserve delivery metering & verification', effect: 'requires' },
  ],
  roles: ['grid', 'provider', 'regulator', 'operator'],

  fields: {
    instruction_ref: { type: 'string', label: 'SO activation instruction ref' },
    provider_name: { type: 'string', label: 'Reserve provider' },
    reserve_product: { type: 'string', required: true, label: 'Product (instantaneous/regulating/ten_minute/supplemental)' },
    priority: { type: 'string', label: 'Priority (normal/critical)' },
    event_date: { type: 'string', required: true, label: 'Activation date (ISO)' },
    instructed_mw: { type: 'number', required: true, min: 0, label: 'Instructed reserve (MW)' },
    utilisation_rate_zar_mwh: { type: 'number', min: 0, label: 'Utilisation rate (ZAR/MWh)' },
    provider_party: { type: 'party', role: 'provider', label: 'Reserve provider' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    activation_start: { type: 'string', label: 'Activation start (ISO)' },
    activation_end: { type: 'string', label: 'Activation end (ISO)' },
    delivered_mw: { type: 'number', min: 0, label: 'Metered delivered (MW)' },
    delivered_mwh: { type: 'number', min: 0, label: 'Metered delivered energy (MWh)' },
    metering_ref: { type: 'string', label: 'Metering ref' },
    settlement_amount_zar: { type: 'number', min: 0, label: 'Settlement amount (ZAR)' },
    // written by derive, never by the client
    performance_pct: { type: 'number', label: 'Performance (delivered/instructed %)' },
    instructed_at: { type: 'string', label: 'Instructed at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    dispatched_at: { type: 'string', label: 'Dispatched at' },
    delivered_at: { type: 'string', label: 'Delivery reported at' },
    verified_at: { type: 'string', label: 'Delivery verified at' },
    settled_at: { type: 'string', label: 'Settlement instructed at' },
  },

  initial: 'instructed',

  states: {
    instructed: { label: 'Reserve instructed', terminal: false, holder: 'provider', sla: { hours: 1 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'provider', sla: { minutes: 15 } },
    dispatched: { label: 'Dispatched (ramping to output)', terminal: false, holder: 'provider', sla: { hours: 1 } },
    delivered: { label: 'Delivery reported', terminal: false, holder: 'grid', sla: { days: 2 } },
    delivery_verified: { label: 'Delivery verified', terminal: false, holder: 'grid', sla: { days: 5 } },
    // NO SETTLEMENT FINALITY — RECORD ONLY
    settlement_instructed: { label: 'Settlement instructed', terminal: true, holder: 'none' },
    non_delivery: { label: 'Non-delivery', terminal: true, holder: 'none' },
    declined: { label: 'Declined', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed (no acknowledgement)', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'instructed',
      by: ['grid', 'operator'],
      actorBecomes: 'grid',
      label: 'Instruct reserve activation',
      intent: 'primary',
      input: {
        instruction_ref: { type: 'string' },
        provider_name: { type: 'string' },
        reserve_product: { type: 'string', required: true },
        priority: { type: 'string' },
        event_date: { type: 'string', required: true },
        instructed_mw: { type: 'number', required: true, min: 0 },
        utilisation_rate_zar_mwh: { type: 'number', min: 0 },
        provider_party: { type: 'party', role: 'provider' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // SO can't instruct reserve on itself; a critical system-emergency call needs NERSA on the txn.
      guards: ['counterpartyDistinct', 'regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ instructed_at: isoUtc(at) }),
    },
    {
      id: 'acknowledge',
      from: 'instructed',
      to: 'acknowledged',
      by: ['provider', 'operator'],
      label: 'Acknowledge instruction',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'dispatch',
      from: 'acknowledged',
      to: 'dispatched',
      by: ['provider', 'operator'],
      label: 'Dispatch (ramp to output)',
      intent: 'primary',
      input: { activation_start: { type: 'string' }, activation_end: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ dispatched_at: isoUtc(at) }),
    },
    {
      id: 'report_delivery',
      from: 'dispatched',
      to: 'delivered',
      by: ['provider', 'operator'],
      label: 'Report delivery',
      intent: 'primary',
      input: {
        delivered_mw: { type: 'number', required: true, min: 0 },
        delivered_mwh: { type: 'number', min: 0 },
        metering_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ delivered_at: isoUtc(at) }),
    },
    {
      // structural gate: delivery can ONLY be verified from `delivered` — a
      // settlement can never rest on reserve that was never metered as delivered.
      id: 'verify_delivery',
      from: 'delivered',
      to: 'delivery_verified',
      by: ['grid', 'operator'],
      label: 'Verify delivery',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => ({ performance_pct: performancePct(f.instructed_mw, f.delivered_mw), verified_at: isoUtc(at) }),
    },
    {
      // structural money edge: only reachable from delivery_verified.
      id: 'instruct_settlement',
      from: 'delivery_verified',
      to: 'settlement_instructed',
      by: ['grid', 'operator'],
      label: 'Instruct settlement (record only)',
      intent: 'primary',
      input: { settlement_amount_zar: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ settled_at: isoUtc(at) }),
    },

    // --- non-delivery + exits ------------------------------------------------
    {
      id: 'record_non_delivery',
      from: ['dispatched', 'delivered', 'delivery_verified'],
      to: 'non_delivery',
      by: ['grid', 'operator'],
      label: 'Record non-delivery',
      intent: 'destructive',
      requiresReason: ['no_response', 'below_threshold', 'metering_failure', 'ramped_late'],
      guards: [],
    },
    {
      id: 'decline',
      from: ['instructed', 'acknowledged'],
      to: 'declined',
      by: ['provider', 'operator'],
      label: 'Decline instruction',
      intent: 'destructive',
      requiresReason: ['plant_unavailable', 'safety_constraint', 'outside_contract_window', 'already_committed'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['instructed', 'acknowledged', 'dispatched'],
      to: 'cancelled',
      by: ['grid', 'operator'],
      label: 'Cancel activation',
      intent: 'destructive',
      requiresReason: ['system_recovered', 'instructed_in_error', 'superseded_instruction', 'frequency_restored'],
      guards: [],
    },
    // an instruction not acknowledged within the reserve-notice window lapses
    // (time-bar stub; the sweep computes the real bar off the `instructed` sla).
    {
      id: 'auto_lapse',
      from: 'instructed',
      to: 'lapsed',
      by: ['system'],
      label: 'Auto-lapse (notice window expired)',
      intent: 'secondary',
      guards: [],
    },
  ],

  timers: [{ onState: 'instructed', after: { hours: 0 }, fire: 'auto_lapse', kind: 'time_bar' }],
};
