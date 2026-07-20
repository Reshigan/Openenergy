// change_request — ITIL change enablement / RFC lifecycle as data (v1 table
// oe_change_requests, wave 47).
//
// The third member of the ITIL service-management family on the support profile:
//   - support_ticket    : restore service for ONE incident (incident mgmt).
//   - problem_management: root-cause of recurring incidents (problem mgmt).
//   - change_request     : authorise, schedule, deploy and review a CHANGE to a
//                          service / configuration item (THIS chain). Receives a
//                          raise_change handoff from problem_management.
//
// Forward path: change_requested → assessment → cab_review → approved →
//   scheduled → implementing → implemented → pir → closed.
// Emergency fast-path (ECAB): assessment → approved (emergency_approve) bypasses
//   full CAB — an emergency_change tier authorises out-of-band.
// Rejection: cab_review → rejected (CAB declines authorisation).
// Backout: implementing | implemented → rolled_back (the change failed, or its
//   PIR is unacceptable — execute the documented backout plan).
// Early cancel: change_requested | assessment | cab_review | approved |
//   scheduled → cancelled (withdrawn before it goes live).
//
// Write model — SINGLE-PARTY {admin, support} at the DB layer: no access split.
// The by-lists below instead encode the ITIL FUNCTIONAL split (change_requester /
// implementer → support; change_authority / CAB → operator) for audit
// attribution and holder semantics — same convention as the sibling
// security_remediation chain, which documents this exact pattern.
//
// Structural honesty: `begin_implementation` leaves ONLY `scheduled`, and the
// ONLY edge into `scheduled` is `schedule` from `approved`. So a change can
// NEVER be implemented before it is CAB- (or ECAB-) approved AND a window is
// booked — the state graph enforces it, no guard needed.
//
// settles:false — a change record is an operational governance control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const changeRequest: ChainDecl = {
  key: 'change_request',
  noun: 'Change request (RFC)',
  refPrefix: 'RFC',
  title: (f) => `${(f.change_class as string) ?? 'normal_change'} — ${(f.service_name as string) ?? 'untitled service'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ISO/IEC 20000-1', provision: '§8.5.1 change management — record, assess, authorise, schedule, implement, review', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'controlled change to regulated market/settlement systems', effect: 'requires' },
  ],
  roles: ['support', 'operator'],

  fields: {
    change_number: { type: 'string', label: 'Change number' },
    service_name: { type: 'string', required: true, label: 'Service' },
    affected_tenant: { type: 'string', label: 'Affected tenant' },
    change_class: { type: 'string', required: true, label: 'Change class (emergency_change/normal_change/standard_change)' },
    change_category: { type: 'string', label: 'Change category' },
    affected_ci_count: { type: 'number', min: 0, label: 'Affected CI count' },
    problem_ref: { type: 'string', label: 'Problem ref (raise_change handoff)' },
    assessment_basis: { type: 'string', label: 'Assessment basis' },
    change_summary: { type: 'string', label: 'Change summary' },
    cab_basis: { type: 'string', label: 'CAB basis' },
    cab_ref: { type: 'string', label: 'CAB reference' },
    approval_basis: { type: 'string', label: 'Approval basis' },
    regulator_ref: { type: 'string', label: 'Regulator reference' },
    schedule_basis: { type: 'string', label: 'Schedule basis' },
    scheduled_start_at: { type: 'string', label: 'Scheduled start' },
    scheduled_end_at: { type: 'string', label: 'Scheduled end' },
    backout_plan: { type: 'string', label: 'Backout plan' },
    implementation_basis: { type: 'string', label: 'Implementation basis' },
    release_ref: { type: 'string', label: 'Release ref' },
    verification_basis: { type: 'string', label: 'Verification basis' },
    rollback_basis: { type: 'string', label: 'Roll-back basis' },
    rollback_ref: { type: 'string', label: 'Roll-back reference' },
    closure_notes: { type: 'string', label: 'Closure notes' },
    // written by derive, never by the client
    assessment_at: { type: 'string', label: 'Assessment started at' },
    cab_review_at: { type: 'string', label: 'Submitted to CAB at' },
    approved_at: { type: 'string', label: 'Approved at' },
    scheduled_at: { type: 'string', label: 'Scheduled at' },
    implementing_at: { type: 'string', label: 'Implementation started at' },
    implemented_at: { type: 'string', label: 'Implementation completed at' },
    pir_at: { type: 'string', label: 'PIR started at' },
    closed_at: { type: 'string', label: 'Closed at' },
  },

  initial: 'change_requested',

  states: {
    change_requested: { label: 'Change requested', terminal: false, holder: 'support', sla: { hours: 8 } },
    assessment: { label: 'Assessment', terminal: false, holder: 'support', sla: { hours: 12 } },
    cab_review: { label: 'CAB review', terminal: false, holder: 'operator', sla: { hours: 24 } },
    approved: { label: 'Approved', terminal: false, holder: 'support', sla: { hours: 24 } },
    scheduled: { label: 'Scheduled', terminal: false, holder: 'support', sla: { days: 3 } },
    implementing: { label: 'Implementing', terminal: false, holder: 'support', sla: { hours: 12 } },
    implemented: { label: 'Implemented', terminal: false, holder: 'operator', sla: { days: 2 } },
    pir: { label: 'Post-implementation review', terminal: false, holder: 'operator', sla: { days: 3 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    rolled_back: { label: 'Rolled back', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'change_requested',
      by: ['support', 'operator'],
      actorBecomes: 'support',
      label: 'Raise change request',
      intent: 'primary',
      input: {
        service_name: { type: 'string', required: true },
        change_class: { type: 'string', required: true },
        change_category: { type: 'string' },
        affected_tenant: { type: 'string' },
        affected_ci_count: { type: 'number', min: 0 },
        problem_ref: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'assess',
      from: 'change_requested',
      to: 'assessment',
      by: ['support'],
      label: 'Assess change',
      intent: 'primary',
      input: {
        assessment_basis: { type: 'string' },
        change_category: { type: 'string' },
        change_summary: { type: 'string' },
        affected_ci_count: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ assessment_at: isoUtc(at) }),
    },
    {
      id: 'submit_to_cab',
      from: 'assessment',
      to: 'cab_review',
      by: ['support'],
      label: 'Submit to CAB',
      intent: 'primary',
      input: { cab_basis: { type: 'string' }, cab_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ cab_review_at: isoUtc(at) }),
    },
    {
      // ECAB fast-path: an emergency change skips CAB review entirely and goes
      // straight from assessment to approved.
      id: 'emergency_approve',
      from: 'assessment',
      to: 'approved',
      by: ['operator'],
      label: 'Emergency approve (ECAB)',
      intent: 'primary',
      input: {
        approval_basis: { type: 'string' },
        cab_ref: { type: 'string' },
        regulator_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'approve',
      from: 'cab_review',
      to: 'approved',
      by: ['operator'],
      label: 'Approve change',
      intent: 'primary',
      input: { approval_basis: { type: 'string' }, cab_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'reject',
      from: 'cab_review',
      to: 'rejected',
      by: ['operator'],
      label: 'Reject change',
      intent: 'destructive',
      requiresReason: ['unacceptable_risk', 'insufficient_backout', 'freeze_window', 'business_case_weak', 'cab_declined'],
      input: { cab_basis: { type: 'string' }, closure_notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'schedule',
      from: 'approved',
      to: 'scheduled',
      by: ['support'],
      label: 'Book change window',
      intent: 'primary',
      input: {
        schedule_basis: { type: 'string' },
        scheduled_start_at: { type: 'string' },
        scheduled_end_at: { type: 'string' },
        backout_plan: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ scheduled_at: isoUtc(at) }),
    },
    {
      // structural governance gate: the ONLY edge into `implementing`, and it can
      // only fire from `scheduled` — which only `schedule` (from `approved`)
      // reaches. A change can never implement before CAB/ECAB approval AND a
      // booked window. No guard.
      id: 'begin_implementation',
      from: 'scheduled',
      to: 'implementing',
      by: ['support'],
      label: 'Begin implementation',
      intent: 'primary',
      input: { implementation_basis: { type: 'string' }, release_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ implementing_at: isoUtc(at) }),
    },
    {
      id: 'complete_implementation',
      from: 'implementing',
      to: 'implemented',
      by: ['support'],
      label: 'Complete implementation',
      intent: 'primary',
      input: { implementation_basis: { type: 'string' }, release_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ implemented_at: isoUtc(at) }),
    },
    {
      id: 'initiate_pir',
      from: 'implemented',
      to: 'pir',
      by: ['operator'],
      label: 'Initiate post-implementation review',
      intent: 'primary',
      input: { verification_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ pir_at: isoUtc(at) }),
    },
    {
      id: 'close',
      from: 'pir',
      to: 'closed',
      by: ['operator'],
      label: 'Close change',
      intent: 'primary',
      input: {
        verification_basis: { type: 'string' },
        regulator_ref: { type: 'string' },
        closure_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },

    // --- exits ------------------------------------------------------------
    {
      id: 'roll_back',
      from: ['implementing', 'implemented'],
      to: 'rolled_back',
      by: ['support'],
      label: 'Roll back change',
      intent: 'destructive',
      requiresReason: ['failed_verification', 'incident_triggered', 'window_overrun', 'unexpected_impact'],
      input: {
        rollback_basis: { type: 'string' },
        rollback_ref: { type: 'string' },
        regulator_ref: { type: 'string' },
        closure_notes: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'cancel',
      from: ['change_requested', 'assessment', 'cab_review', 'approved', 'scheduled'],
      to: 'cancelled',
      by: ['support'],
      label: 'Cancel change',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'superseded', 'deferred'],
      input: { closure_notes: { type: 'string' } },
      guards: [],
    },
  ],
};
