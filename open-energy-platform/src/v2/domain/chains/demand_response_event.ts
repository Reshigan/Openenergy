// demand_response_event — NERSA demand-response (DR) programme activation and
// incentive settlement, as data.
//
// A grid operator notifies a participant of a DR activation (real_time /
// day_ahead / interruptible_tariff / frequency_response), the participant
// acknowledges and sheds load, metering closes the activation window, and the
// incentive is calculated, agreed (or disputed), and posted. `activate` is a
// direct shortcut into `activated` for real-time/frequency-response programmes
// where a formal notify→acknowledge round-trip doesn't fit the timeframe —
// the legacy descriptor exposes both paths, so both are kept rather than
// picking one and dropping real fidelity.
//
// Structural honesty (no invented guards):
//  - `settled` is reachable only via `post_settlement`, itself only reachable
//    from `settlement_calculated` or `settlement_agreed` — so an incentive can
//    never be posted before a calculated figure exists. No guard needed.
//  - `dispute_settlement` is destructive-toned (matches the legacy "oxide"
//    action tone) but non-terminal: `resolve_dispute` always routes back to
//    `settlement_agreed`, so a dispute can't dead-end the transaction.
//  - none of the ten registry guards target DR-specific fields (no
//    capacity_mw/priority/live_work concept here), so every transition uses
//    guards: [] — the state graph itself is the enforcement.
//
// settles:true — incentive_amount_zar is a real payment the operator owes the
// participant for verified curtailment; this chain is the settlement record.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const demandResponseEvent: ChainDecl = {
  key: 'demand_response_event',
  noun: 'Demand-response event',
  refPrefix: 'DRE',
  title: (f) =>
    `DR event — ${(f.dr_programme as string) ?? 'programme TBC'} (${(f.requested_mw as number) ?? '?'} MW)`,
  visibility: 'party',
  settles: true,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'Demand Response / ancillary-services participation framework', effect: 'authorises' },
  ],
  roles: ['grid_operator', 'support', 'operator'],

  fields: {
    event_date: { type: 'string', required: true, label: 'Event date' },
    dr_programme: { type: 'string', label: 'DR programme (real_time/day_ahead/interruptible_tariff/frequency_response)' },
    requested_mw: { type: 'number', min: 0, label: 'Requested shed (MW)' },
    incentive_rate_per_mw: { type: 'number', min: 0, label: 'Incentive rate (ZAR/MW)' },
    grid_operator_party: { type: 'party', role: 'grid_operator', label: 'Grid operator' },
    activation_ref: { type: 'string', label: 'Activation reference' },
    notification_type: { type: 'string', label: 'Notification type (day_ahead/real_time/test)' },
    reason: { type: 'string', label: 'Notes' },
    activation_start: { type: 'string', label: 'Activation start time' },
    activation_end: { type: 'string', label: 'Activation end time' },
    actual_mw_shed: { type: 'number', min: 0, label: 'Actual MW shed' },
    metering_ref: { type: 'string', label: 'Metering reference' },
    performance_pct: { type: 'number', min: 0, max: 100, label: 'Performance %' },
    incentive_amount_zar: { type: 'number', min: 0, label: 'Incentive amount (ZAR)' },
    settlement_ref: { type: 'string', label: 'Settlement reference' },
    dispute_description: { type: 'string', required: true, label: 'Dispute reason' },
    // written by derive, never by the client
    notified_at: { type: 'string', label: 'Notified at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    activated_at: { type: 'string', label: 'Activated at' },
    metering_closed_at: { type: 'string', label: 'Metering closed at' },
    settlement_calculated_at: { type: 'string', label: 'Settlement calculated at' },
    settlement_agreed_at: { type: 'string', label: 'Settlement agreed at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    resolved_at: { type: 'string', label: 'Dispute resolved at' },
    non_performance_at: { type: 'string', label: 'Non-performance recorded at' },
    cancelled_at: { type: 'string', label: 'Cancelled at' },
    settled_at: { type: 'string', label: 'Settled at' },
  },

  initial: 'scheduled',

  states: {
    scheduled: { label: 'Scheduled', terminal: false, holder: 'grid_operator', sla: { days: 2 } },
    notified: { label: 'Notified', terminal: false, holder: 'grid_operator', sla: { hours: 24 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'grid_operator', sla: { hours: 24 } },
    activated: { label: 'Activated (load shed in progress)', terminal: false, holder: 'grid_operator' },
    metering_closed: { label: 'Metering closed', terminal: false, holder: 'grid_operator', sla: { days: 2 } },
    settlement_calculated: { label: 'Settlement calculated', terminal: false, holder: 'grid_operator', sla: { days: 5 } },
    settlement_agreed: { label: 'Settlement agreed', terminal: false, holder: 'grid_operator', sla: { days: 5 } },
    disputed: { label: 'Settlement disputed', terminal: false, holder: 'grid_operator', sla: { days: 10 } },
    settled: { label: 'Settled', terminal: true, holder: 'none' },
    non_performance: { label: 'Non-performance recorded', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'scheduled',
      by: ['grid_operator', 'support', 'operator'],
      actorBecomes: 'grid_operator',
      label: 'Register demand-response event',
      intent: 'primary',
      input: {
        event_date: { type: 'string', required: true },
        dr_programme: { type: 'string' },
        requested_mw: { type: 'number', min: 0 },
        incentive_rate_per_mw: { type: 'number', min: 0 },
        grid_operator_party: { type: 'party', role: 'grid_operator' },
        activation_ref: { type: 'string' },
        notification_type: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'send_notification',
      from: 'scheduled',
      to: 'notified',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Send notification',
      intent: 'primary',
      input: { reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ notified_at: isoUtc(at) }),
    },
    {
      id: 'acknowledge',
      from: 'notified',
      to: 'acknowledged',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Acknowledge notification',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'confirm_load_shed',
      from: 'acknowledged',
      to: 'activated',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Confirm load shed',
      intent: 'primary',
      input: {
        activation_start: { type: 'string' },
        activation_end: { type: 'string' },
        actual_mw_shed: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ activated_at: isoUtc(at) }),
    },
    {
      // direct activation bypassing notify→acknowledge — legacy path for
      // real-time/frequency-response programmes where the round-trip doesn't
      // fit the timeframe.
      id: 'activate',
      from: ['scheduled', 'notified', 'acknowledged'],
      to: 'activated',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Activate (direct)',
      intent: 'primary',
      input: { reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ activated_at: isoUtc(at) }),
    },
    {
      id: 'close_metering',
      from: 'activated',
      to: 'metering_closed',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Close metering window',
      intent: 'primary',
      input: { metering_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ metering_closed_at: isoUtc(at) }),
    },
    {
      // alt one-step close+verify path for programmes measured by an
      // independent verifier rather than the operator's own metering close.
      id: 'verify_performance',
      from: 'activated',
      to: 'metering_closed',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Verify performance',
      intent: 'secondary',
      input: { reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ metering_closed_at: isoUtc(at) }),
    },
    {
      id: 'calculate_settlement',
      from: 'metering_closed',
      to: 'settlement_calculated',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Calculate settlement',
      intent: 'primary',
      input: {
        performance_pct: { type: 'number', min: 0, max: 100 },
        incentive_amount_zar: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ settlement_calculated_at: isoUtc(at) }),
    },
    {
      id: 'agree_settlement',
      from: 'settlement_calculated',
      to: 'settlement_agreed',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Agree settlement',
      intent: 'primary',
      input: { settlement_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ settlement_agreed_at: isoUtc(at) }),
    },
    {
      // the only edge into `settled` — reachable only once a figure has been
      // calculated, formally agreed or not (interruptible-tariff programmes
      // skip formal agreement).
      id: 'post_settlement',
      from: ['settlement_calculated', 'settlement_agreed'],
      to: 'settled',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Post settlement',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ settled_at: isoUtc(at) }),
    },
    {
      id: 'dispute_settlement',
      from: ['settlement_calculated', 'settlement_agreed'],
      to: 'disputed',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Dispute settlement',
      intent: 'destructive',
      input: { dispute_description: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      // disputes never dead-end: resolution always routes back to
      // settlement_agreed so post_settlement stays the sole terminal door.
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'settlement_agreed',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Resolve dispute',
      intent: 'primary',
      input: { reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
    {
      id: 'record_non_performance',
      from: ['activated', 'metering_closed', 'settlement_calculated'],
      to: 'non_performance',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Record non-performance',
      intent: 'destructive',
      requiresReason: ['no_response', 'partial_curtailment', 'measurement_verification_failed', 'communication_failure'],
      guards: [],
      derive: (_f, at: Instant) => ({ non_performance_at: isoUtc(at) }),
    },
    {
      id: 'cancel',
      from: ['scheduled', 'notified', 'acknowledged'],
      to: 'cancelled',
      by: ['grid_operator', 'support', 'operator'],
      label: 'Cancel',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ cancelled_at: isoUtc(at) }),
    },
  ],
};
