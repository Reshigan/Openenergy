// complaint_resolution — a regulated complaint lifecycle as data.
//
// A complainant lodges a complaint against a respondent (a licensed entity); a
// handler (regulator/ombud desk) acknowledges, investigates, and proposes a
// remedy the complainant then accepts or rejects. The fairness spine is
// structural: a complaint can NEVER be marked resolved without an
// investigation. accept_resolution leaves ONLY resolution_proposed, and the
// ONLY path into resolution_proposed is propose_resolution from
// under_investigation. So there is no shortcut from lodged/acknowledged to
// resolved — no guard needed, the state graph forbids it. reject_resolution
// bounces back to under_investigation for a fresh remedy.
//
// No claim key: a complaint is not exclusive consumption of a finite resource,
// the same participant may be complained about again. No guard fits either —
// distinctness of complainant vs respondent is a party-shape concern the
// counterpartyDistinct guard (built for two-party trade edges) does not model
// cleanly across a multi-field lodge. Business rules ride the graph + reason
// codes instead.
//
// settles:false — a complaint outcome is a regulatory record, never a payment
// (R-S5-1). Any redress payment is a separate settling chain.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const complaintResolution: ChainDecl = {
  key: 'complaint_resolution',
  noun: 'Complaint',
  refPrefix: 'COM',
  title: (f) => `Complaint — ${(f.subject as string) ?? 'unspecified'} (${(f.category as string) ?? 'general'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 'complaint handling & dispute resolution', effect: 'requires' },
    { instrument: 'NERSA Complaints Procedures', provision: 'acknowledge / investigate / resolve', effect: 'requires' },
    { instrument: 'POPIA', provision: 's5 data-subject participation', effect: 'requires' },
  ],
  roles: ['complainant', 'handler', 'respondent', 'regulator'],

  fields: {
    complainant_party: { type: 'party', role: 'complainant', label: 'Complainant' },
    handler_party: { type: 'party', role: 'handler', label: 'Handling desk' },
    respondent_party: { type: 'party', role: 'respondent', label: 'Respondent (licensed entity)' },
    subject: { type: 'string', required: true, label: 'Subject' },
    category: { type: 'string', required: true, label: 'Category (billing/service/conduct/access/other)' },
    description: { type: 'string', required: true, label: 'Description' },
    severity: { type: 'string', label: 'Severity (low/medium/high)' },
    channel: { type: 'string', label: 'Lodged via (portal/email/phone/walk-in)' },
    desired_outcome: { type: 'string', label: 'Desired outcome' },
    // written by handler during investigation
    finding: { type: 'string', label: 'Investigation finding' },
    remedy: { type: 'string', label: 'Proposed remedy' },
    reopen_count: { type: 'number', label: 'Times bounced back for re-investigation' },
    // written by derive, never by the client
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    investigation_opened_at: { type: 'string', label: 'Investigation opened at' },
    resolution_proposed_at: { type: 'string', label: 'Resolution proposed at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
  },

  initial: 'lodged',

  states: {
    lodged: { label: 'Lodged', terminal: false, holder: 'handler', sla: { hours: 48 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'handler', sla: { days: 5 } },
    under_investigation: { label: 'Under investigation', terminal: false, holder: 'handler', sla: { days: 20 } },
    resolution_proposed: { label: 'Resolution proposed', terminal: false, holder: 'complainant', sla: { days: 10 } },
    resolved: { label: 'Resolved', terminal: true, holder: 'none' },
    escalated: { label: 'Escalated', terminal: true, holder: 'none' },
    dismissed: { label: 'Dismissed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'lodged',
      by: ['complainant'],
      actorBecomes: 'complainant',
      label: 'Lodge complaint',
      intent: 'primary',
      input: {
        subject: { type: 'string', required: true },
        category: { type: 'string', required: true },
        description: { type: 'string', required: true },
        severity: { type: 'string' },
        channel: { type: 'string' },
        desired_outcome: { type: 'string' },
        handler_party: { type: 'party', role: 'handler' },
        respondent_party: { type: 'party', role: 'respondent' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'acknowledge',
      from: 'lodged',
      to: 'acknowledged',
      by: ['handler'],
      label: 'Acknowledge receipt',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'open_investigation',
      from: 'acknowledged',
      to: 'under_investigation',
      by: ['handler'],
      label: 'Open investigation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ investigation_opened_at: isoUtc(at) }),
    },
    {
      // structural fairness gate: the ONLY edge into resolution_proposed, and it
      // can only fire from under_investigation. A remedy therefore cannot be
      // proposed (and so a complaint cannot resolve) without an investigation.
      id: 'propose_resolution',
      from: 'under_investigation',
      to: 'resolution_proposed',
      by: ['handler'],
      label: 'Propose resolution',
      intent: 'primary',
      input: { finding: { type: 'string', required: true }, remedy: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ resolution_proposed_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into resolved — from resolution_proposed alone.
      id: 'accept_resolution',
      from: 'resolution_proposed',
      to: 'resolved',
      by: ['complainant'],
      label: 'Accept resolution',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
    {
      id: 'reject_resolution',
      from: 'resolution_proposed',
      to: 'under_investigation',
      by: ['complainant'],
      label: 'Reject resolution — re-investigate',
      intent: 'secondary',
      requiresReason: ['remedy_inadequate', 'finding_disputed', 'outcome_insufficient', 'new_evidence'],
      guards: [],
      derive: (f, _at: Instant) => ({ reopen_count: (typeof f.reopen_count === 'number' ? f.reopen_count : 0) + 1 }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'escalate',
      from: ['lodged', 'acknowledged', 'under_investigation', 'resolution_proposed'],
      to: 'escalated',
      by: ['complainant', 'handler', 'regulator', 'system'],
      label: 'Escalate',
      intent: 'destructive',
      requiresReason: ['unresolved_deadlock', 'regulatory_referral', 'ombud_referral', 'sla_breach'],
      guards: [],
    },
    {
      id: 'dismiss',
      from: ['lodged', 'acknowledged', 'under_investigation'],
      to: 'dismissed',
      by: ['handler'],
      label: 'Dismiss complaint',
      intent: 'destructive',
      requiresReason: ['out_of_scope', 'frivolous', 'duplicate', 'insufficient_information', 'time_barred'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['lodged', 'acknowledged', 'under_investigation', 'resolution_proposed'],
      to: 'withdrawn',
      by: ['complainant'],
      label: 'Withdraw complaint',
      intent: 'destructive',
      requiresReason: ['resolved_directly', 'no_longer_pursuing', 'lodged_in_error'],
      guards: [],
    },
  ],

  // acknowledgement SLA: a complaint left un-acknowledged past 72 hours (the
  // 48h lodged SLA plus a day's grace) escalates as an sla_breach.
  timers: [{ onState: 'lodged', after: { hours: 72 }, fire: 'escalate', kind: 'sla', reason: 'sla_breach' }],
};
