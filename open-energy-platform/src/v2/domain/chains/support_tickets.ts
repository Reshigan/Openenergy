// support_tickets — ITIL-style support ticket lifecycle as data (W14).
//
// A reporter raises a ticket; support triages it (priority-tiered SLA arms),
// picks it up, and either resolves it directly or parks it awaiting the
// reporter. Resolved tickets close (or reopen on reporter pushback from
// resolved OR closed). Any non-terminal state can escalate — a P1 (urgent)
// or compliance-category escalation is a regulator-inbox crossing in the v1
// route (crossesIntoRegulator in support-ticket-spec.ts), so escalate takes
// an optional regulator_party to record that crossing on the txn.
//
// Structural honesty (no invented guards):
//  - There is no registry guard for "priority===urgent or category===compliance"
//    (regulatorPresentIfCritical/regulatorPresentIfHighHazard check different
//    literal values — 'critical' / 'confined_space' — that never occur on this
//    chain). The regulator crossing here is a notify/visibility concern
//    (fireCascade → regulator inbox), not a hard admission gate, so escalate
//    carries guards:[] rather than a guard that would silently never fire.
//  - reopen and user_responded additionally list 'reporter' in `by`: the v1
//    route's REPORTER_WRITE band lets the ticket's own reporter push these two
//    actions (canWriteAsReporter), unlike the other five agent-side actions
//    (triage/pick_up/wait_for_user/resolve/close) which stay support/operator-only.
//
// settles:false — a support ticket records case status, not a payment or a
// quantum obligation (R-S5-1).
//
// timers: omitted. The real SLA window is priority-tiered (slaDueAt in
// support-ticket-spec.ts: 1h/2h/4h/8h triage, up to 15d resolution for P4) —
// a single fixed Duration here would misstate it. The 15-minute cron sweep
// already owns SLA-breach recording against next_sla_due_at.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const supportTickets: ChainDecl = {
  key: 'support_tickets',
  noun: 'Support ticket',
  refPrefix: 'TKT',
  title: (f) => `Ticket — ${(f.subject as string) ?? 'untitled'} (${(f.priority as string) ?? 'normal'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'POPIA', provision: 's19 security safeguards — cross-tenant support access accountability', effect: 'requires' },
  ],
  roles: ['reporter', 'support', 'regulator', 'operator'],

  fields: {
    reporter_party: { type: 'party', role: 'reporter', label: 'Reporter' },
    support_party: { type: 'party', role: 'support', label: 'Assigned support agent' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (P1/compliance crossing)' },
    ticket_number: { type: 'string', label: 'Ticket number' },
    subject: { type: 'string', required: true, label: 'Subject' },
    category: { type: 'string', required: true, label: 'Category (access/billing/feature_question/bug/data_issue/compliance/other)' },
    description: { type: 'string', label: 'Description' },
    priority: { type: 'string', label: 'Priority (urgent/high/normal/low)' },
    tenant_id: { type: 'string', label: 'Tenant' },
    // written by derive, never by the client
    triaged_at: { type: 'string', label: 'Triaged at' },
    first_responded_at: { type: 'string', label: 'First response at' },
    waiting_since: { type: 'string', label: 'Waiting since' },
    resolved_at: { type: 'string', label: 'Resolved at' },
    reopened_at: { type: 'string', label: 'Reopened at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
  },

  initial: 'open',

  states: {
    open: { label: 'Open (untriaged)', terminal: false, holder: 'support' },
    triaged: { label: 'Triaged', terminal: false, holder: 'support' },
    in_progress: { label: 'In progress', terminal: false, holder: 'support' },
    awaiting_user: { label: 'Awaiting user', terminal: false, holder: 'reporter' },
    resolved: { label: 'Resolved', terminal: false, holder: 'support' },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    escalated: { label: 'Escalated', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'raise',
      from: '@new',
      to: 'open',
      by: ['reporter', 'support', 'operator'],
      actorBecomes: 'reporter',
      label: 'Raise support ticket',
      intent: 'primary',
      input: {
        subject: { type: 'string', required: true },
        category: { type: 'string', required: true },
        description: { type: 'string' },
        priority: { type: 'string' },
        tenant_id: { type: 'string' },
        reporter_party: { type: 'party', role: 'reporter' },
      },
      guards: [],
    },
    {
      id: 'triage',
      from: 'open',
      to: 'triaged',
      by: ['support', 'operator'],
      label: 'Triage',
      intent: 'primary',
      input: { priority: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ triaged_at: isoUtc(at) }),
    },
    {
      id: 'pick_up',
      from: 'triaged',
      to: 'in_progress',
      by: ['support', 'operator'],
      label: 'Pick up',
      intent: 'primary',
      input: { support_party: { type: 'party', role: 'support' } },
      guards: [],
      derive: (_f, at: Instant) => ({ first_responded_at: isoUtc(at) }),
    },
    {
      id: 'wait_for_user',
      from: 'in_progress',
      to: 'awaiting_user',
      by: ['support', 'operator'],
      label: 'Wait for user',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ waiting_since: isoUtc(at) }),
    },
    {
      id: 'user_responded',
      from: 'awaiting_user',
      to: 'in_progress',
      by: ['reporter', 'support', 'operator'],
      label: 'User responded',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'resolve',
      from: ['in_progress', 'awaiting_user'],
      to: 'resolved',
      by: ['support', 'operator'],
      label: 'Resolve',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
    {
      // resolved is the only door into closed — a ticket can never close
      // without first being resolved.
      id: 'close',
      from: 'resolved',
      to: 'closed',
      by: ['support', 'operator'],
      label: 'Close',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'reopen',
      from: ['resolved', 'closed'],
      to: 'in_progress',
      by: ['reporter', 'support', 'operator'],
      label: 'Reopen',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ reopened_at: isoUtc(at) }),
    },
    {
      id: 'escalate',
      from: ['open', 'triaged', 'in_progress', 'awaiting_user'],
      to: 'escalated',
      by: ['support', 'operator'],
      label: 'Escalate',
      intent: 'destructive',
      input: { regulator_party: { type: 'party', role: 'regulator' } },
      requiresReason: ['sla_breach', 'customer_escalation', 'severity_upgrade', 'beyond_first_line_scope', 'regulatory_or_compliance_risk'],
      guards: [],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
  ],
};
