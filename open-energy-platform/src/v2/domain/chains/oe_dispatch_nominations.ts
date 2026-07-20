// oe_dispatch_nominations — day-ahead BRP dispatch nomination → SO acceptance
// → activation → performance → imbalance settlement, as data.
//
// A Balance Responsible Party (BRP) nominates a dispatch schedule for a
// trading day; the System Operator (SO) ACKs (accept/reject) inside a tight
// 15-minute window, activates the accepted schedule pre-gate-closure, records
// delivered performance post-gate, and settles the resulting imbalance
// charge. A settled nomination carries a 15-day dispute window before it
// closes out; a raised dispute crosses to the regulator to resolve.
//
// Structural honesty (no invented guards):
//  - `settle` is only reachable from `performance_recorded`, and the only
//    edge into `performance_recorded` is `record_performance` from
//    `activated` — so an imbalance charge can NEVER be settled without a
//    recorded delivery figure to compute it from. No guard needed.
//  - `nominate` is guarded by counterpartyDistinct (BRP ≠ SO — no
//    self-nomination) and complianceHaltClear (no new dispatch commitments
//    under a platform-wide compliance halt).
//  - every downstream edge (accept/reject/activate/settle/dispute/close) is
//    unguarded: these are SO/regulator operational decisions the state graph
//    already gates by position, not admissibility checks.
//
// settles:true — `charge_zar` is the actual imbalance settlement amount this
// chain computes and posts (quantumCol in the legacy descriptor); unlike
// ppa_nomination (a pre-delivery schedule commitment with no money movement),
// this chain IS the downstream imbalance-settlement leg.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure: actual vs scheduled MWh. null until both figures exist (no clock, no env).
const computeImbalance = (scheduled: Json | undefined, actual: Json | undefined): number | null => {
  if (typeof scheduled !== 'number' || typeof actual !== 'number') return null;
  return actual - scheduled;
};

export const oeDispatchNominations: ChainDecl = {
  key: 'oe_dispatch_nominations',
  noun: 'Dispatch nomination',
  refPrefix: 'DISN',
  title: (f) =>
    `Dispatch nomination ${(f.trading_day as string) ?? '?'} — ${(f.scheduled_mwh as number) ?? '?'} MWh`,
  visibility: 'party',
  settles: true,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'System Operations Code — dispatch nomination, activation & imbalance settlement', effect: 'requires' },
  ],
  roles: ['brp', 'grid', 'regulator', 'operator'],

  fields: {
    trading_day: { type: 'string', required: true, label: 'Trading day (ISO date)' },
    schedule_type: { type: 'string', label: 'Schedule type (day_ahead/intra_day/re_nomination/balancing)' },
    scheduled_mwh: { type: 'number', min: 0, label: 'Nominated energy (MWh)' },
    actual_mwh: { type: 'number', min: 0, label: 'Delivered energy (MWh)' },
    imbalance_mwh: { type: 'number', label: 'Imbalance (actual − scheduled MWh)' },
    charge_zar: { type: 'number', min: 0, label: 'Imbalance settlement charge (ZAR)' },
    notes: { type: 'string', label: 'Notes' },
    dispute_resolution: { type: 'string', label: 'Dispute resolution' },
    brp_party: { type: 'party', role: 'brp', label: 'Balance Responsible Party (nominator)' },
    grid_party: { type: 'party', role: 'grid', label: 'System Operator' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    // written by derive, never by the client
    nominated_at: { type: 'string', label: 'Nominated at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    activated_at: { type: 'string', label: 'Activated at' },
    performance_recorded_at: { type: 'string', label: 'Performance recorded at' },
    settled_at: { type: 'string', label: 'Settled at' },
    closed_at: { type: 'string', label: 'Closed at' },
    dispute_raised_at: { type: 'string', label: 'Dispute raised at' },
    dispute_resolved_at: { type: 'string', label: 'Dispute resolved at' },
    closed_disputed_at: { type: 'string', label: 'Closed (disputed) at' },
  },

  initial: 'nominated',

  states: {
    // 15-minute ACK window per NERSA System Operations Code.
    nominated: { label: 'Nominated', terminal: false, holder: 'grid', sla: { minutes: 15 } },
    accepted: { label: 'Accepted', terminal: false, holder: 'grid', sla: { minutes: 30 } },
    activated: { label: 'Activated', terminal: false, holder: 'grid', sla: { hours: 1 } },
    performance_recorded: { label: 'Performance recorded', terminal: false, holder: 'grid', sla: { days: 5 } },
    // dispute window is the BRP's to use; SO closes it out once it lapses.
    settled: { label: 'Settled', terminal: false, holder: 'brp', sla: { days: 15 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'regulator', sla: { days: 10 } },
    dispute_resolved: { label: 'Dispute resolved', terminal: false, holder: 'regulator' },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    nomination_rejected: { label: 'Nomination rejected', terminal: true, holder: 'none' },
    closed_disputed: { label: 'Closed (disputed)', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'nominate',
      from: '@new',
      to: 'nominated',
      by: ['brp', 'operator'],
      actorBecomes: 'brp',
      label: 'Submit dispatch nomination',
      intent: 'primary',
      input: {
        trading_day: { type: 'string', required: true },
        schedule_type: { type: 'string' },
        scheduled_mwh: { type: 'number', min: 0 },
        // grid & regulator fire later edges — they must be live parties from @new.
        grid_party: { type: 'party', role: 'grid' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ nominated_at: isoUtc(at) }),
    },

    // --- ACK gate ---------------------------------------------------------
    {
      id: 'accept',
      from: 'nominated',
      to: 'accepted',
      by: ['grid', 'operator'],
      label: 'Accept nomination',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      id: 'reject',
      from: 'nominated',
      to: 'nomination_rejected',
      by: ['grid', 'operator', 'system'],
      label: 'Reject nomination',
      intent: 'destructive',
      requiresReason: ['grid_constraint', 'insufficient_capacity', 'data_error', 'schedule_conflict', 'non_compliant_brp', 'ack_window_missed'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },

    // --- happy path (structural: settle only reachable via record_performance) ---
    {
      id: 'activate',
      from: 'accepted',
      to: 'activated',
      by: ['grid', 'operator'],
      label: 'Activate dispatch',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ activated_at: isoUtc(at) }),
    },
    {
      id: 'record_performance',
      from: 'activated',
      to: 'performance_recorded',
      by: ['grid', 'operator'],
      label: 'Record performance',
      intent: 'primary',
      input: {
        actual_mwh: { type: 'number', required: true, min: 0 },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (f, at: Instant) => ({
        performance_recorded_at: isoUtc(at),
        imbalance_mwh: computeImbalance(f.scheduled_mwh, f.actual_mwh),
      }),
    },
    {
      id: 'settle',
      from: 'performance_recorded',
      to: 'settled',
      by: ['grid', 'operator'],
      label: 'Settle imbalance',
      intent: 'primary',
      input: {
        charge_zar: { type: 'number', required: true, min: 0 },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ settled_at: isoUtc(at) }),
    },

    // --- post-settlement: dispute window then close-out --------------------
    {
      id: 'raise_dispute',
      from: 'settled',
      to: 'disputed',
      by: ['brp', 'operator'],
      label: 'Raise dispute',
      intent: 'destructive',
      requiresReason: ['imbalance_calc_error', 'metering_discrepancy', 'charge_disputed', 'schedule_misrecorded'],
      guards: [],
      derive: (_f, at: Instant) => ({ dispute_raised_at: isoUtc(at) }),
    },
    {
      // by:system so the 15-day dispute-window-lapse timer can dispatch it.
      id: 'close',
      from: 'settled',
      to: 'closed',
      by: ['grid', 'operator', 'system'],
      label: 'Close out',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
    {
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'dispute_resolved',
      by: ['regulator', 'operator'],
      label: 'Resolve dispute',
      intent: 'primary',
      input: { dispute_resolution: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ dispute_resolved_at: isoUtc(at) }),
    },
    {
      id: 'close_disputed',
      from: 'dispute_resolved',
      to: 'closed_disputed',
      by: ['regulator', 'operator'],
      label: 'Close disputed',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_disputed_at: isoUtc(at) }),
    },
  ],

  timers: [
    // ACK-window breach auto-rejects rather than leaving the nomination stuck
    // ahead of gate closure — matches reject's own requiresReason vocabulary.
    { onState: 'nominated', after: { minutes: 15 }, fire: 'reject', kind: 'time_bar', reason: 'ack_window_missed' },
    // dispute-window lapse into a routine close-out (ppa_contract auto_expire pattern).
    { onState: 'settled', after: { days: 15 }, fire: 'close', kind: 'time_bar' },
  ],
};
