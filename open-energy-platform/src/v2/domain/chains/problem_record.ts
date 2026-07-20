// problem_record — ITIL 4 / ISO 20000-1 problem-management lifecycle as data
// (v1 table oe_problem_records, wave 41).
//
// Third member of the ITIL service-management family on the support profile:
//   - support_ticket    : restore service for ONE incident (incident mgmt).
//   - problem_management: root-cause of recurring incidents (THIS chain).
//   - change_request     : authorise/schedule/deploy a change; receives the
//                          raise_change handoff from this chain.
//
// SINGLE-PARTY desk record — no counterparty column in v1. Roles are the ITIL
// functional split (problem-owner / investigator → support; sign-off →
// operator), same convention as the sibling change_request chain, not an
// access-control split.
//
// Forward path: problem_logged → categorized → investigating → rca_identified
//   → known_error → fix_proposed → change_raised → fix_deployed →
//   resolution_verified → closed.
// Fast-path resolution: known_error → closed via accept_workaround (the
//   workaround is accepted as the resolution; no RFC needed).
// Exits: escalate (any open state → escalated, out of desk ownership —
//   crosses the regulator queue for major problems per v1 regulator_ref);
//   cancel (any open state → cancelled, record raised in error / superseded).
//
// Structural honesty: `raise_change` only leaves `fix_proposed`, so a problem
// can never hand a fix to the change chain before one has actually been
// proposed — the state graph enforces that order, no guard needed. No
// financial/counterparty guards apply: this is a governance/operational
// record, never a payment and never bilateral (R-S5-1).
//
// settles:false — a problem record tracks investigation and root-cause work;
// it never moves money or quantum.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const problemRecord: ChainDecl = {
  key: 'problem_record',
  noun: 'Problem record',
  refPrefix: 'PRB',
  title: (f) => `Problem — ${(f.service_name as string) ?? 'unnamed service'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ISO/IEC 20000-1', provision: '§8.6.2 problem management — record, diagnose, resolve, review', effect: 'requires' },
  ],
  roles: ['support', 'operator'],

  fields: {
    service_name: { type: 'string', required: true, label: 'Service' },
    problem_category: { type: 'string', label: 'Problem category' },
    problem_summary: { type: 'string', label: 'Problem summary' },
    investigation_basis: { type: 'string', label: 'Investigation basis' },
    rca_basis: { type: 'string', label: 'Root-cause basis' },
    known_error_basis: { type: 'string', label: 'Known error basis' },
    known_error_ref: { type: 'string', label: 'Known error ref' },
    workaround: { type: 'string', label: 'Workaround' },
    fix_basis: { type: 'string', label: 'Fix basis' },
    change_basis: { type: 'string', label: 'Change basis' },
    change_request_ref: { type: 'string', label: 'Linked RFC reference' },
    verification_basis: { type: 'string', label: 'Verification basis' },
    reason_code: { type: 'string', label: 'Reason code' },
    closure_notes: { type: 'string', label: 'Closure notes' },
    major_problem_ref: { type: 'string', label: 'Major-problem reference' },
    regulator_ref: { type: 'string', label: 'Regulator reference' },
    // written by derive, never by the client
    logged_at: { type: 'string', label: 'Logged at' },
    categorized_at: { type: 'string', label: 'Categorized at' },
    investigating_at: { type: 'string', label: 'Investigation started at' },
    rca_identified_at: { type: 'string', label: 'Root cause identified at' },
    known_error_at: { type: 'string', label: 'Known error logged at' },
    fix_proposed_at: { type: 'string', label: 'Fix proposed at' },
    change_raised_at: { type: 'string', label: 'Change raised at' },
    fix_deployed_at: { type: 'string', label: 'Fix deployed at' },
    resolution_verified_at: { type: 'string', label: 'Resolution verified at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
    closed_at: { type: 'string', label: 'Closed at' },
    cancelled_at: { type: 'string', label: 'Cancelled at' },
  },

  initial: 'problem_logged',

  states: {
    problem_logged: { label: 'Problem logged', terminal: false, holder: 'support', sla: { hours: 4 } },
    categorized: { label: 'Categorized', terminal: false, holder: 'support', sla: { hours: 24 } },
    investigating: { label: 'Investigating', terminal: false, holder: 'support', sla: { days: 5 } },
    rca_identified: { label: 'Root cause identified', terminal: false, holder: 'support', sla: { days: 3 } },
    known_error: { label: 'Known error', terminal: false, holder: 'support', sla: { days: 2 } },
    fix_proposed: { label: 'Fix proposed', terminal: false, holder: 'support', sla: { days: 3 } },
    change_raised: { label: 'Change raised', terminal: false, holder: 'support', sla: { days: 5 } },
    fix_deployed: { label: 'Fix deployed', terminal: false, holder: 'support', sla: { days: 2 } },
    resolution_verified: { label: 'Resolution verified', terminal: false, holder: 'support', sla: { days: 2 } },
    escalated: { label: 'Escalated', terminal: true, holder: 'none' },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'log',
      from: '@new',
      to: 'problem_logged',
      by: ['support', 'operator'],
      actorBecomes: 'support',
      label: 'Log problem',
      intent: 'primary',
      input: {
        service_name: { type: 'string', required: true },
        problem_summary: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ logged_at: isoUtc(at) }),
    },
    {
      id: 'categorize',
      from: 'problem_logged',
      to: 'categorized',
      by: ['support', 'operator'],
      label: 'Categorize problem',
      intent: 'primary',
      input: {
        problem_category: { type: 'string' },
        problem_summary: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ categorized_at: isoUtc(at) }),
    },
    {
      id: 'begin_investigation',
      from: 'categorized',
      to: 'investigating',
      by: ['support', 'operator'],
      label: 'Begin investigation',
      intent: 'primary',
      input: { investigation_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ investigating_at: isoUtc(at) }),
    },
    {
      id: 'identify_rca',
      from: 'investigating',
      to: 'rca_identified',
      by: ['support', 'operator'],
      label: 'Identify root cause',
      intent: 'primary',
      input: { rca_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ rca_identified_at: isoUtc(at) }),
    },
    {
      id: 'log_known_error',
      from: 'rca_identified',
      to: 'known_error',
      by: ['support', 'operator'],
      label: 'Log known error',
      intent: 'primary',
      input: {
        known_error_basis: { type: 'string' },
        known_error_ref: { type: 'string' },
        workaround: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ known_error_at: isoUtc(at) }),
    },
    {
      id: 'propose_fix',
      from: 'known_error',
      to: 'fix_proposed',
      by: ['support', 'operator'],
      label: 'Propose fix',
      intent: 'primary',
      input: { fix_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ fix_proposed_at: isoUtc(at) }),
    },
    {
      // fast-path resolution: the workaround itself is accepted as the fix, so
      // this closes directly from known_error without ever raising an RFC.
      id: 'accept_workaround',
      from: 'known_error',
      to: 'closed',
      by: ['support', 'operator'],
      label: 'Accept workaround',
      intent: 'primary',
      input: {
        reason_code: { type: 'string' },
        workaround: { type: 'string' },
        closure_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
    {
      // structural handoff gate: the ONLY edge into change_raised, and it can
      // only fire from fix_proposed — a fix can never be handed to the change
      // chain before one has actually been proposed.
      id: 'raise_change',
      from: 'fix_proposed',
      to: 'change_raised',
      by: ['support', 'operator'],
      label: 'Raise change (RFC)',
      intent: 'primary',
      input: {
        change_basis: { type: 'string' },
        change_request_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ change_raised_at: isoUtc(at) }),
    },
    {
      id: 'deploy_fix',
      from: 'change_raised',
      to: 'fix_deployed',
      by: ['support', 'operator'],
      label: 'Deploy fix',
      intent: 'primary',
      input: { change_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ fix_deployed_at: isoUtc(at) }),
    },
    {
      id: 'verify_resolution',
      from: 'fix_deployed',
      to: 'resolution_verified',
      by: ['support', 'operator'],
      label: 'Verify resolution',
      intent: 'primary',
      input: { verification_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ resolution_verified_at: isoUtc(at) }),
    },
    {
      id: 'close',
      from: 'resolution_verified',
      to: 'closed',
      by: ['support', 'operator'],
      label: 'Close',
      intent: 'primary',
      input: {
        reason_code: { type: 'string' },
        closure_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },

    // --- exits (either can fire from any still-open desk state) ----------
    {
      id: 'escalate',
      from: ['problem_logged', 'categorized', 'investigating', 'rca_identified', 'known_error', 'fix_proposed', 'change_raised', 'fix_deployed', 'resolution_verified'],
      to: 'escalated',
      by: ['support', 'operator'],
      label: 'Escalate',
      intent: 'destructive',
      requiresReason: ['major_incident_trigger', 'sla_breach_risk', 'multiple_recurrence', 'regulatory_notification_required', 'executive_escalation'],
      input: {
        major_problem_ref: { type: 'string' },
        regulator_ref: { type: 'string' },
        closure_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
    {
      id: 'cancel',
      from: ['problem_logged', 'categorized', 'investigating', 'rca_identified', 'known_error', 'fix_proposed', 'change_raised', 'fix_deployed', 'resolution_verified'],
      to: 'cancelled',
      by: ['support', 'operator'],
      label: 'Cancel',
      intent: 'destructive',
      requiresReason: ['duplicate_record', 'no_longer_relevant', 'superseded', 'logged_in_error'],
      input: { closure_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ cancelled_at: isoUtc(at) }),
    },
  ],
};
