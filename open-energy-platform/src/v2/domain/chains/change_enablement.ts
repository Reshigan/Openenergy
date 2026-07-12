// change_enablement — ITIL change request (RFC) lifecycle as data.
//
// A requester logs an RFC against affected systems; a change manager (CAB) runs
// assessment → approval → scheduling; a named implementer executes it inside the
// window; the change manager runs the post-implementation review and closes it.
//
// The governance spine is structural, not a guard: begin_implementation leaves
// ONLY `scheduled`, and the ONLY path into `scheduled` is `schedule` from
// `approved`. So a change can NEVER be implemented before it is CAB-approved AND
// a window is booked — the state graph enforces it. A critical-priority change
// also crosses to the regulator: `approve` is guarded by regulatorPresentIfCritical
// (energy-exchange changes to trading/settlement systems are NERSA-facing).
//
// NO claim key. An RFC is not permanent consumption of a resource — the same
// system is changed again next release. Concurrent-change exclusion (freeze
// windows) is a scheduling concern the domain does not yet model.
//
// settles:false — a change record is an operational governance control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure risk-tier bucketing off the numeric score (0..10). No clock, no env.
const riskTier = (score: Json | undefined): string => {
  if (typeof score !== 'number') return 'unassessed';
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
};

export const changeEnablement: ChainDecl = {
  key: 'change_enablement',
  noun: 'Change request',
  refPrefix: 'CHAN',
  title: (f) => `${(f.change_type as string) ?? 'normal'} change — ${(f.change_title as string) ?? 'untitled'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'controlled change to market/settlement systems', effect: 'requires' },
    { instrument: 'ISO/IEC 20000-1', provision: 'change management control', effect: 'requires' },
  ],
  roles: ['requester', 'change_manager', 'implementer', 'regulator'],

  fields: {
    change_number: { type: 'string', label: 'Change number' },
    requester_party: { type: 'party', role: 'requester', label: 'Requester' },
    change_manager_party: { type: 'party', role: 'change_manager', label: 'Change manager (CAB)' },
    implementer_party: { type: 'party', role: 'implementer', label: 'Implementer' },
    change_title: { type: 'string', required: true, label: 'Change title' },
    change_type: { type: 'string', required: true, label: 'Type (normal/standard/emergency)' },
    priority: { type: 'string', required: true, label: 'Priority (low/medium/high/critical)' },
    systems_affected: { type: 'string', required: true, label: 'Systems affected' },
    change_description: { type: 'string', label: 'Change description' },
    rollout_plan_ref: { type: 'string', label: 'Rollout plan ref' },
    backout_plan_ref: { type: 'string', label: 'Backout plan ref' },
    cab_ref: { type: 'string', label: 'CAB decision ref' },
    risk_score: { type: 'number', min: 0, max: 10, label: 'Risk score (0-10)' },
    risk_tier: { type: 'string', label: 'Risk tier' },
    planned_start: { type: 'string', label: 'Planned window start' },
    planned_end: { type: 'string', label: 'Planned window end' },
    // written by derive, never by the client
    assessed_at: { type: 'string', label: 'Assessed at' },
    approved_at: { type: 'string', label: 'Approved at' },
    scheduled_at: { type: 'string', label: 'Scheduled at' },
    impl_started_at: { type: 'string', label: 'Implementation started at' },
    impl_completed_at: { type: 'string', label: 'Implementation completed at' },
    closed_at_chg: { type: 'string', label: 'Change closed at' },
  },

  initial: 'submitted',

  states: {
    submitted: { label: 'Submitted', terminal: false, holder: 'change_manager', sla: { hours: 8 } },
    assessing: { label: 'Assessing', terminal: false, holder: 'change_manager', sla: { hours: 24 } },
    approved: { label: 'CAB approved', terminal: false, holder: 'change_manager', sla: { hours: 24 } },
    scheduled: { label: 'Scheduled', terminal: false, holder: 'implementer' },
    implementing: { label: 'Implementing', terminal: false, holder: 'implementer', sla: { hours: 8 } },
    review: { label: 'Post-implementation review', terminal: false, holder: 'change_manager', sla: { hours: 24 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    rolled_back: { label: 'Rolled back', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'submitted',
      by: ['requester'],
      actorBecomes: 'requester',
      label: 'Submit change request',
      intent: 'primary',
      input: {
        change_title: { type: 'string', required: true },
        change_type: { type: 'string', required: true },
        priority: { type: 'string', required: true },
        systems_affected: { type: 'string', required: true },
        change_description: { type: 'string' },
        rollout_plan_ref: { type: 'string' },
        backout_plan_ref: { type: 'string' },
        change_manager_party: { type: 'party', role: 'change_manager' },
        implementer_party: { type: 'party', role: 'implementer' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'assess',
      from: 'submitted',
      to: 'assessing',
      by: ['change_manager'],
      label: 'Begin risk assessment',
      intent: 'primary',
      input: { risk_score: { type: 'number', min: 0, max: 10 } },
      guards: [],
      derive: (f, at: Instant) => ({ risk_tier: riskTier(f.risk_score), assessed_at: isoUtc(at) }),
    },
    {
      id: 'approve',
      from: 'assessing',
      to: 'approved',
      by: ['change_manager'],
      label: 'CAB approve',
      intent: 'primary',
      input: { cab_ref: { type: 'string', required: true } },
      // critical-priority changes cross to the regulator — one must be a party.
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'schedule',
      from: 'approved',
      to: 'scheduled',
      by: ['change_manager'],
      label: 'Book change window',
      intent: 'primary',
      input: {
        planned_start: { type: 'string', required: true },
        planned_end: { type: 'string', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ scheduled_at: isoUtc(at) }),
    },
    {
      // structural governance gate: the ONLY edge into `implementing`, and it can
      // only fire from `scheduled` — which only `schedule` (from `approved`)
      // reaches. A change therefore cannot implement before it is approved AND
      // scheduled. No guard.
      id: 'begin_implementation',
      from: 'scheduled',
      to: 'implementing',
      by: ['implementer'],
      label: 'Begin implementation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ impl_started_at: isoUtc(at) }),
    },
    {
      id: 'complete_implementation',
      from: 'implementing',
      to: 'review',
      by: ['implementer', 'change_manager'],
      label: 'Complete implementation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ impl_completed_at: isoUtc(at) }),
    },
    {
      id: 'close_change',
      from: 'review',
      to: 'closed',
      by: ['change_manager'],
      label: 'Close change',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_chg: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: ['submitted', 'assessing', 'approved'],
      to: 'rejected',
      by: ['change_manager'],
      label: 'Reject change',
      intent: 'destructive',
      requiresReason: ['unacceptable_risk', 'insufficient_backout', 'freeze_window', 'business_case_weak', 'cab_declined'],
      guards: [],
    },
    {
      id: 'rollback',
      from: ['implementing', 'review'],
      to: 'rolled_back',
      by: ['implementer', 'change_manager'],
      label: 'Roll back change',
      intent: 'destructive',
      requiresReason: ['failed_verification', 'incident_triggered', 'window_overrun', 'unexpected_impact'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['submitted', 'assessing'],
      to: 'withdrawn',
      by: ['requester'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'superseded', 'deferred'],
      guards: [],
    },
  ],
};
