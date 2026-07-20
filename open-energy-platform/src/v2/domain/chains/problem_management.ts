// problem_management — ITIL problem lifecycle as data.
//
// A requester logs a problem (the underlying cause behind one or more
// incidents); a problem manager triages it, investigates, identifies a root
// cause, optionally registers a known error (documented workaround), applies a
// permanent fix, and closes it.
//
// The governance spine is structural, NOT a guard: `resolve` leaves ONLY the
// post-RCA states (root_cause_identified / known_error), and `close_problem`
// leaves ONLY `resolved`. So a problem can NEVER be resolved before its root
// cause is identified, and can NEVER be closed before it is resolved — the
// state graph enforces "no closure without a root cause", no guard needed.
//
// NO claim key. A problem is not exclusive consumption of a unique resource;
// two problems can name the same service. Duplicate detection is a manager
// judgement (reject with reason 'duplicate'), not a domain uniqueness index.
//
// settles:false — an operational quality control, never a payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure severity bucketing off the numeric impact score (0..10). No clock/env.
const severityTier = (score: Json | undefined): string => {
  if (typeof score !== 'number') return 'untriaged';
  if (score >= 8) return 'critical';
  if (score >= 5) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
};

export const problemManagement: ChainDecl = {
  key: 'problem_management',
  noun: 'Problem record',
  refPrefix: 'PM',
  title: (f) => `${(f.severity_tier as string) ?? 'untriaged'} problem — ${(f.affected_service as string) ?? 'unspecified service'}`,
  visibility: 'party',
  roles: ['requester', 'manager', 'operator'],
  settles: false,

  fields: {
    problem_ref: { type: 'string', label: 'Problem reference' },
    requester_party: { type: 'party', role: 'requester', label: 'Raised by' },
    manager_party: { type: 'party', role: 'manager', label: 'Problem manager' },
    summary: { type: 'string', required: true, label: 'Summary' },
    affected_service: { type: 'string', required: true, label: 'Affected service' },
    description: { type: 'string', required: true, label: 'Description' },
    related_incidents: { type: 'string', label: 'Related incident refs' },
    impact_score: { type: 'number', min: 0, max: 10, label: 'Impact score (0-10)' },
    severity_tier: { type: 'string', label: 'Severity tier' },
    root_cause: { type: 'string', label: 'Root cause' },
    workaround: { type: 'string', label: 'Workaround' },
    permanent_fix: { type: 'string', label: 'Permanent fix' },
    change_ref: { type: 'string', label: 'Linked change ref' },
    reopen_count: { type: 'number', label: 'Times reopened' },
    // written by derive, never by the client
    investigated_at: { type: 'string', label: 'Investigation started at' },
    rca_at: { type: 'string', label: 'Root cause identified at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
    closed_at_pm: { type: 'string', label: 'Closed at' },
  },

  initial: 'problem_logged',

  states: {
    problem_logged: { label: 'Problem logged', terminal: false, holder: 'manager', sla: { hours: 24 } },
    under_investigation: { label: 'Under investigation', terminal: false, holder: 'manager', sla: { days: 5 } },
    root_cause_identified: { label: 'Root cause identified', terminal: false, holder: 'manager', sla: { days: 3 } },
    known_error: { label: 'Known error (workaround live)', terminal: false, holder: 'manager' },
    resolved: { label: 'Resolved', terminal: false, holder: 'requester', sla: { hours: 48 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'problem_logged',
      by: ['requester', 'operator'],
      actorBecomes: 'requester',
      label: 'Log problem',
      intent: 'primary',
      input: {
        summary: { type: 'string', required: true },
        affected_service: { type: 'string', required: true },
        description: { type: 'string', required: true },
        related_incidents: { type: 'string' },
        impact_score: { type: 'number', min: 0, max: 10 },
        manager_party: { type: 'party', role: 'manager' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ severity_tier: severityTier(f.impact_score) }),
    },
    {
      id: 'begin_investigation',
      from: 'problem_logged',
      to: 'under_investigation',
      by: ['manager'],
      label: 'Begin investigation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ investigated_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into root_cause_identified — so it is the sole gate a
      // problem must pass before it can be resolved or a known error registered.
      id: 'identify_root_cause',
      from: 'under_investigation',
      to: 'root_cause_identified',
      by: ['manager'],
      label: 'Identify root cause',
      intent: 'primary',
      input: { root_cause: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ rca_at: isoUtc(at) }),
    },
    {
      id: 'register_known_error',
      from: 'root_cause_identified',
      to: 'known_error',
      by: ['manager'],
      label: 'Register known error',
      intent: 'secondary',
      input: { workaround: { type: 'string', required: true } },
      guards: [],
    },
    {
      // structural gate: resolve leaves ONLY post-RCA states, so a problem can
      // never be resolved before its root cause is identified. No guard.
      id: 'resolve',
      from: ['root_cause_identified', 'known_error'],
      to: 'resolved',
      by: ['manager'],
      label: 'Apply permanent fix',
      intent: 'primary',
      input: { permanent_fix: { type: 'string', required: true }, change_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
    {
      id: 'close_problem',
      from: 'resolved',
      to: 'closed',
      by: ['manager', 'requester'],
      label: 'Close problem',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_pm: isoUtc(at) }),
    },
    {
      id: 'reopen',
      from: 'resolved',
      to: 'under_investigation',
      by: ['manager', 'requester'],
      label: 'Reopen',
      intent: 'secondary',
      requiresReason: ['fix_ineffective', 'recurrence', 'incomplete_fix'],
      guards: [],
      derive: (f, _at: Instant) => ({ reopen_count: (typeof f.reopen_count === 'number' ? f.reopen_count : 0) + 1 }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: 'problem_logged',
      to: 'rejected',
      by: ['manager'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['duplicate', 'not_a_problem', 'insufficient_information', 'out_of_scope'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['problem_logged', 'under_investigation'],
      to: 'withdrawn',
      by: ['requester'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['no_longer_reproducible', 'raised_in_error', 'superseded'],
      guards: [],
    },
  ],
};
