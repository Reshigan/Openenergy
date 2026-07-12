// support_ticket — IT service-management ticket lifecycle as data.
//
// A reporter (any role) raises a ticket against the support team; an agent
// triages → works → resolves it, and the reporter confirms the close (or
// reopens). The closure spine is structural: close_ticket leaves ONLY
// `resolved`, and the only path into `resolved` is `resolve`. So a ticket can
// NEVER be closed while an agent is still mid-fix or before a resolution is
// offered — no guard needed, the state graph enforces it.
//
// Critical-priority (P1) escalation crosses to the regulator: escalate_p1 is
// guarded by regulatorPresentIfCritical, so a P1 cannot be escalated without a
// regulator on the txn (W14 regulator crossing for P1/compliance).
//
// settles:false — a support ticket is an operational service record, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure priority → SLA tier bucketing. No clock, no env.
const slaTier = (priority: Json | undefined): string => {
  switch (priority) {
    case 'critical':
      return 'P1';
    case 'high':
      return 'P2';
    case 'normal':
      return 'P3';
    case 'low':
      return 'P4';
    default:
      return 'untriaged';
  }
};

export const supportTicket: ChainDecl = {
  key: 'support_ticket',
  noun: 'Support ticket',
  refPrefix: 'SUPP',
  title: (f) => `[${(f.priority as string) ?? 'P?'}] ${(f.subject as string) ?? 'support ticket'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'POPIA 2013', provision: 's19 security safeguards / incident handling', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'operational support & incident response', effect: 'requires' },
  ],
  roles: ['reporter', 'agent', 'regulator', 'operator'],

  fields: {
    ticket_number: { type: 'string', label: 'Ticket number' },
    reporter_party: { type: 'party', role: 'reporter', label: 'Reporter' },
    agent_party: { type: 'party', role: 'agent', label: 'Assigned agent' },
    subject: { type: 'string', required: true, label: 'Subject' },
    description: { type: 'string', required: true, label: 'Description' },
    category: { type: 'string', required: true, label: 'Category (incident/access/billing/compliance)' },
    priority: { type: 'string', label: 'Priority (low/normal/high/critical)' },
    channel: { type: 'string', label: 'Channel (web/email/phone)' },
    resolution_summary: { type: 'string', label: 'Resolution summary' },
    reopen_count: { type: 'number', label: 'Times reopened' },
    // written by derive, never by the client
    sla_tier: { type: 'string', label: 'SLA tier' },
    triaged_at: { type: 'string', label: 'Triaged at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
    closed_at_ticket: { type: 'string', label: 'Ticket closed at' },
  },

  initial: 'reported',

  states: {
    reported: { label: 'Reported', terminal: false, holder: 'agent', sla: { hours: 4 } },
    triaged: { label: 'Triaged', terminal: false, holder: 'agent', sla: { hours: 8 } },
    in_progress: { label: 'In progress', terminal: false, holder: 'agent' },
    awaiting_reporter: { label: 'Awaiting reporter', terminal: false, holder: 'reporter', sla: { hours: 48 } },
    escalated: { label: 'Escalated', terminal: false, holder: 'agent', sla: { hours: 2 } },
    resolved: { label: 'Resolved', terminal: false, holder: 'reporter', sla: { hours: 24 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'reported',
      by: ['reporter', 'operator'],
      actorBecomes: 'reporter',
      label: 'Raise ticket',
      intent: 'primary',
      input: {
        subject: { type: 'string', required: true },
        description: { type: 'string', required: true },
        category: { type: 'string', required: true },
        priority: { type: 'string' },
        channel: { type: 'string' },
        agent_party: { type: 'party', role: 'agent' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ sla_tier: slaTier(f.priority) }),
    },
    {
      id: 'triage',
      from: 'reported',
      to: 'triaged',
      by: ['agent', 'operator'],
      label: 'Triage ticket',
      intent: 'primary',
      input: { priority: { type: 'string', required: true } },
      guards: [],
      derive: (f, at: Instant) => ({ sla_tier: slaTier(f.priority), triaged_at: isoUtc(at) }),
    },
    { id: 'start_work', from: 'triaged', to: 'in_progress', by: ['agent'], label: 'Start work', intent: 'primary', guards: [] },
    { id: 'request_info', from: 'in_progress', to: 'awaiting_reporter', by: ['agent'], label: 'Request reporter info', intent: 'secondary', guards: [] },
    { id: 'provide_info', from: 'awaiting_reporter', to: 'in_progress', by: ['reporter', 'operator'], label: 'Provide info', intent: 'primary', guards: [] },
    {
      // P1 escalation crosses to the regulator: a critical ticket cannot be
      // escalated without a regulator on the txn.
      id: 'escalate_p1',
      from: ['triaged', 'in_progress'],
      to: 'escalated',
      by: ['agent'],
      label: 'Escalate (P1)',
      intent: 'secondary',
      guards: ['regulatorPresentIfCritical'],
    },
    {
      id: 'resolve',
      from: ['in_progress', 'escalated'],
      to: 'resolved',
      by: ['agent'],
      label: 'Resolve ticket',
      intent: 'primary',
      input: { resolution_summary: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
    {
      // structural closure gate: the ONLY edge into `closed`, firing ONLY from
      // `resolved` — which only `resolve` reaches. A ticket therefore cannot be
      // closed while work is still in progress. No guard.
      id: 'close_ticket',
      from: 'resolved',
      to: 'closed',
      by: ['reporter', 'operator'],
      label: 'Confirm & close',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_ticket: isoUtc(at) }),
    },
    {
      id: 'reopen',
      from: 'resolved',
      to: 'in_progress',
      by: ['reporter', 'operator'],
      label: 'Reopen ticket',
      intent: 'secondary',
      requiresReason: ['not_fixed', 'recurred', 'partial_fix', 'wrong_resolution'],
      guards: [],
      derive: (f, _at: Instant) => ({ reopen_count: (typeof f.reopen_count === 'number' ? f.reopen_count : 0) + 1 }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_ticket',
      from: ['reported', 'triaged'],
      to: 'rejected',
      by: ['agent', 'operator'],
      label: 'Reject ticket',
      intent: 'destructive',
      requiresReason: ['duplicate', 'invalid', 'spam', 'out_of_scope'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['reported', 'triaged', 'in_progress', 'awaiting_reporter'],
      to: 'withdrawn',
      by: ['reporter'],
      label: 'Withdraw ticket',
      intent: 'destructive',
      requiresReason: ['resolved_externally', 'no_longer_needed', 'raised_in_error'],
      guards: [],
    },
  ],

  // resolved-ticket auto-close: a resolution left unconfirmed by the reporter
  // ages out and closes. record-only stub; the sweep computes the real bar off
  // the `resolved` state's sla hours (permit_to_work pattern).
  timers: [{ onState: 'resolved', after: { hours: 0 }, fire: 'close_ticket', kind: 'sla' }],
};
