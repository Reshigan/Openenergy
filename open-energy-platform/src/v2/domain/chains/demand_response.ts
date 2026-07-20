// demand_response — a System Operator demand-response (load curtailment) event
// as data.
//
// The grid (System Operator) calls a DR event on an enrolled offtaker / large
// consumer: notice → acknowledge → activate dispatch → offtaker sheds load →
// SO meters & verifies the delivered curtailment → compensation is instructed
// (record only). A large consumer earns an incentive for the MW it took off the
// grid at a peak; falling short lands in non_performance.
//
// STRUCTURAL performance spine (permit_to_work / curtailment_claim pattern):
// compensation can ONLY be instructed from `performance_verified`, which is only
// reachable from `load_shed`, which is only reachable from `activated`. So an
// incentive can NEVER be instructed before the load was actually shed and the
// delivered MW metered & verified. No guard enforces this — the state graph does.
//
// Regulatory gate: a `critical` (grid-emergency) DR call crosses a reporting
// line — regulatorPresentIfCritical requires NERSA (a live `regulator` party) on
// the txn at open. Normal peak-clip calls register freely. A regulator can only
// be a party if attached at open, so regulator_party is an open-input party
// field. counterpartyDistinct also blocks the SO calling a DR event on itself.
//
// settles:false — this chain RECORDS a compensation instruction; it moves no
// money. Terminal money state is `compensated_instructed` and export always
// carries the record-only custody notice (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure delivered/requested performance, 1 d.p. No clock, no env. null when the
// inputs can't produce a ratio (never divides by zero).
const performancePct = (requested: Json | undefined, delivered: Json | undefined): number | null => {
  if (typeof requested !== 'number' || typeof delivered !== 'number' || requested <= 0) return null;
  return Math.round((delivered / requested) * 1000) / 10;
};

export const demandResponse: ChainDecl = {
  key: 'demand_response',
  noun: 'Demand-response event',
  refPrefix: 'DR',
  title: (f) =>
    `DR event — ${(f.dr_programme as string) ?? 'programme'} on ${
      (f.offtaker_name as string) ?? 'consumer'
    } (${typeof f.requested_mw === 'number' ? f.requested_mw : '?'} MW)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'System Operations Code — demand-side participation & load curtailment', effect: 'authorises' },
    { instrument: 'ERA 2006', provision: 's34 dispatch determination', effect: 'authorises' },
    { instrument: 'NRS 048', provision: 'demand-response performance metering', effect: 'requires' },
  ],
  roles: ['grid', 'offtaker', 'regulator', 'operator'],

  fields: {
    event_ref: { type: 'string', label: 'SO activation instruction ref' },
    offtaker_name: { type: 'string', label: 'Offtaker / large consumer' },
    dr_programme: { type: 'string', required: true, label: 'Programme (real_time/day_ahead/interruptible_tariff/frequency_response)' },
    priority: { type: 'string', label: 'Priority (normal/critical)' },
    event_date: { type: 'string', required: true, label: 'Event date (ISO)' },
    notice_type: { type: 'string', label: 'Notice type (day_ahead/real_time/test)' },
    requested_mw: { type: 'number', required: true, min: 0, label: 'Requested curtailment (MW)' },
    incentive_rate_zar_mw: { type: 'number', min: 0, label: 'Incentive rate (ZAR/MW)' },
    offtaker_party: { type: 'party', role: 'offtaker', label: 'Offtaker / large consumer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    activation_start: { type: 'string', label: 'Activation start (ISO)' },
    activation_end: { type: 'string', label: 'Activation end (ISO)' },
    actual_mw_shed: { type: 'number', min: 0, label: 'Metered MW shed' },
    metering_ref: { type: 'string', label: 'Metering ref' },
    incentive_amount_zar: { type: 'number', min: 0, label: 'Incentive amount (ZAR)' },
    // written by derive, never by the client
    performance_pct: { type: 'number', label: 'Performance (delivered/requested %)' },
    called_at: { type: 'string', label: 'Called at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    activated_at: { type: 'string', label: 'Activated at' },
    shed_at: { type: 'string', label: 'Load shed reported at' },
    verified_at: { type: 'string', label: 'Performance verified at' },
    instructed_at: { type: 'string', label: 'Compensation instructed at' },
  },

  initial: 'called',

  states: {
    called: { label: 'Event called', terminal: false, holder: 'offtaker', sla: { hours: 4 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'offtaker', sla: { hours: 2 } },
    activated: { label: 'Activated (dispatch issued)', terminal: false, holder: 'offtaker', sla: { hours: 2 } },
    load_shed: { label: 'Load shed reported', terminal: false, holder: 'grid', sla: { days: 2 } },
    performance_verified: { label: 'Performance verified', terminal: false, holder: 'grid', sla: { days: 5 } },
    // NO SETTLEMENT FINALITY — RECORD ONLY
    compensated_instructed: { label: 'Compensation instructed', terminal: true, holder: 'none' },
    non_performance: { label: 'Non-performance', terminal: true, holder: 'none' },
    declined: { label: 'Declined', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed (no acknowledgement)', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'called',
      by: ['grid', 'operator'],
      actorBecomes: 'grid',
      label: 'Call DR event',
      intent: 'primary',
      input: {
        event_ref: { type: 'string' },
        offtaker_name: { type: 'string' },
        dr_programme: { type: 'string', required: true },
        priority: { type: 'string' },
        event_date: { type: 'string', required: true },
        notice_type: { type: 'string' },
        requested_mw: { type: 'number', required: true, min: 0 },
        incentive_rate_zar_mw: { type: 'number', min: 0 },
        offtaker_party: { type: 'party', role: 'offtaker' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // SO can't call DR on itself; a critical grid-emergency call needs NERSA on the txn.
      guards: ['counterpartyDistinct', 'regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ called_at: isoUtc(at) }),
    },
    {
      id: 'acknowledge',
      from: 'called',
      to: 'acknowledged',
      by: ['offtaker', 'operator'],
      label: 'Acknowledge call',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'activate',
      from: 'acknowledged',
      to: 'activated',
      by: ['grid', 'operator'],
      label: 'Activate dispatch',
      intent: 'primary',
      input: { activation_start: { type: 'string' }, activation_end: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ activated_at: isoUtc(at) }),
    },
    {
      id: 'shed_load',
      from: 'activated',
      to: 'load_shed',
      by: ['offtaker', 'operator'],
      label: 'Report load shed',
      intent: 'primary',
      input: { actual_mw_shed: { type: 'number', required: true, min: 0 }, metering_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ shed_at: isoUtc(at) }),
    },
    {
      // structural gate: performance can ONLY be verified from load_shed — an
      // incentive can never rest on curtailment that was never metered as shed.
      id: 'verify_performance',
      from: 'load_shed',
      to: 'performance_verified',
      by: ['grid', 'operator'],
      label: 'Verify performance',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => ({ performance_pct: performancePct(f.requested_mw, f.actual_mw_shed), verified_at: isoUtc(at) }),
    },
    {
      // structural money edge: only reachable from performance_verified.
      id: 'instruct_compensation',
      from: 'performance_verified',
      to: 'compensated_instructed',
      by: ['grid', 'operator'],
      label: 'Instruct compensation (record only)',
      intent: 'primary',
      input: { incentive_amount_zar: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ instructed_at: isoUtc(at) }),
    },

    // --- non-performance + exits ---------------------------------------------
    {
      id: 'record_non_performance',
      from: ['activated', 'load_shed', 'performance_verified'],
      to: 'non_performance',
      by: ['grid', 'operator'],
      label: 'Record non-performance',
      intent: 'destructive',
      requiresReason: ['no_shed', 'below_threshold', 'metering_failure', 'reconnected_early'],
      guards: [],
    },
    {
      id: 'decline',
      from: ['called', 'acknowledged'],
      to: 'declined',
      by: ['offtaker', 'operator'],
      label: 'Decline call',
      intent: 'destructive',
      requiresReason: ['plant_unavailable', 'safety_constraint', 'opt_out_window', 'process_critical_load'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['called', 'acknowledged', 'activated'],
      to: 'cancelled',
      by: ['grid', 'operator'],
      label: 'Cancel event',
      intent: 'destructive',
      requiresReason: ['grid_recovered', 'called_in_error', 'superseded_instruction', 'system_normal'],
      guards: [],
    },
    // a called event not acknowledged within the notice window lapses (time-bar
    // stub; the sweep computes the real bar off the `called` state sla).
    {
      id: 'auto_lapse',
      from: 'called',
      to: 'lapsed',
      by: ['system'],
      label: 'Auto-lapse (notice window expired)',
      intent: 'secondary',
      guards: [],
    },
  ],

  timers: [{ onState: 'called', after: { hours: 4 }, fire: 'auto_lapse', kind: 'time_bar' }],
};
