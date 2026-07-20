// ipp_tq — IPP construction Technical Query (TQ) lifecycle as data.
//
// A raiser (IPP developer / site) logs a technical query against a drawing or
// spec; it is allocated to the responsible designer, who drafts a response.
// The IPP side approves the draft before it is issued back to the field, then
// closes it once acted on. Two exits: reject (never actioned) or escalate
// (overdue/contested — a side branch that still only exits via close/reject).
//
// The legacy descriptor's `logged`/`under_review`/`acknowledged` statuses are
// bookkeeping shades of `raised`/`allocated`/`response_issued` respectively —
// no distinct v1 action produces them as separate stops, so they are not
// modelled as separate states (structural honesty: a state with no inbound
// edge is dead weight, not fidelity).
//
// Safety-critical crossing: a query flagged safety_critical (or with the
// structural-safety floor tripped) needs the regulator on the txn before its
// response is approved — regulatorPresentIfCritical reads the derived
// `priority` field, same convention as ipp_construction_diary.
//
// allocate_to_designer runs counterpartyDistinct so a designer can't action
// their own raised query (no self-review of a technical query).
//
// SLA: an allocated TQ with no drafted response in 3 days auto-escalates
// (deadlineCol in the legacy descriptor is this SLA, made concrete as a timer).
//
// settles:false — a technical query is a coordination record, never a payment
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const derivePriority = (f: Record<string, Json>): string =>
  f.query_urgency === 'safety_critical' || f.floor_structural_safety === true ? 'critical' : 'normal';

export const ippTq: ChainDecl = {
  key: 'ipp_tq',
  noun: 'IPP technical query',
  refPrefix: 'TQ',
  title: (f) => `TQ ${(f.tq_number as string) ?? ''} — ${(f.tq_title as string) ?? 'untitled'}`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement construction coordination procedure', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'designer', 'regulator', 'admin'],

  fields: {
    tq_number: { type: 'string', label: 'TQ number' },
    tq_title: { type: 'string', required: true, label: 'TQ title' },
    project_id: { type: 'string', required: true, label: 'Project' },
    project_name: { type: 'string', label: 'Project name' },
    query_description: { type: 'string', required: true, label: 'Query description' },
    discipline: { type: 'string', required: true, label: 'Discipline' },
    query_urgency: { type: 'string', required: true, label: 'Query urgency' },
    drawing_ref: { type: 'string', label: 'Drawing reference' },
    specification_ref: { type: 'string', label: 'Specification reference' },
    proposed_solution: { type: 'string', label: 'Proposed solution' },
    contractor_ref: { type: 'string', label: 'Contractor reference' },
    floor_structural_safety: { type: 'boolean', label: 'Structural safety floor' },
    floor_ie_notification_required: { type: 'boolean', label: 'IE notification required floor' },
    raiser_party: { type: 'party', role: 'ipp_developer', label: 'Raiser' },
    designer_party: { type: 'party', role: 'designer', label: 'Assigned designer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    response_text: { type: 'string', label: 'Draft response' },
    response_approval_ref: { type: 'string', label: 'Response approval reference' },
    escalation_reason: { type: 'string', label: 'Escalation narrative' },
    // written by derive, never by the client
    priority: { type: 'string', label: 'Priority (critical/normal)' },
    allocated_at: { type: 'string', label: 'Allocated at' },
    drafted_at: { type: 'string', label: 'Drafted at' },
    approved_at_tq: { type: 'string', label: 'Response approved at' },
    issued_at: { type: 'string', label: 'Response issued at' },
    closed_at_tq: { type: 'string', label: 'Closed at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
  },

  initial: 'raised',

  states: {
    raised: { label: 'TQ raised', terminal: false, holder: 'ipp_developer', sla: { days: 1 } },
    allocated: { label: 'Allocated to designer', terminal: false, holder: 'designer', sla: { days: 3 } },
    response_drafted: { label: 'Response drafted', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    response_approved: { label: 'Response approved', terminal: false, holder: 'designer', sla: { days: 1 } },
    response_issued: { label: 'Response issued', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    escalated: { label: 'Escalated', terminal: false, holder: 'admin', sla: { days: 2 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'raised',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Raise technical query',
      intent: 'primary',
      input: {
        tq_number: { type: 'string' },
        tq_title: { type: 'string', required: true },
        project_id: { type: 'string', required: true },
        project_name: { type: 'string' },
        query_description: { type: 'string', required: true },
        discipline: { type: 'string', required: true },
        query_urgency: { type: 'string', required: true },
        drawing_ref: { type: 'string' },
        specification_ref: { type: 'string' },
        proposed_solution: { type: 'string' },
        contractor_ref: { type: 'string' },
        floor_structural_safety: { type: 'boolean' },
        floor_ie_notification_required: { type: 'boolean' },
        designer_party: { type: 'party', role: 'designer' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f) => ({ priority: derivePriority(f) }),
    },
    {
      // counterpartyDistinct: the designer taking the query can't be the same
      // legal entity as the raiser (no self-review of a technical query).
      id: 'allocate_to_designer',
      from: 'raised',
      to: 'allocated',
      by: ['ipp_developer', 'admin'],
      label: 'Allocate to designer',
      intent: 'primary',
      input: { designer_party: { type: 'party', required: true, role: 'designer' } },
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ allocated_at: isoUtc(at) }),
    },
    {
      id: 'draft_response',
      from: 'allocated',
      to: 'response_drafted',
      by: ['designer', 'admin'],
      label: 'Draft response',
      intent: 'primary',
      input: { response_text: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ drafted_at: isoUtc(at) }),
    },
    {
      // safety-critical crossing: regulator must be on the txn before the
      // draft response is approved for issue.
      id: 'approve_response',
      from: 'response_drafted',
      to: 'response_approved',
      by: ['ipp_developer', 'admin'],
      label: 'Approve response',
      intent: 'primary',
      input: { response_approval_ref: { type: 'string', required: true } },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ approved_at_tq: isoUtc(at) }),
    },
    {
      id: 'issue_response',
      from: 'response_approved',
      to: 'response_issued',
      by: ['designer', 'ipp_developer', 'admin'],
      label: 'Issue response',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ issued_at: isoUtc(at) }),
    },
    {
      id: 'close_tq',
      from: ['response_issued', 'escalated'],
      to: 'closed',
      by: ['ipp_developer', 'admin'],
      label: 'Close TQ',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_tq: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_tq',
      from: ['raised', 'allocated', 'response_drafted', 'response_approved', 'escalated'],
      to: 'rejected',
      by: ['ipp_developer', 'admin'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['duplicate_query', 'out_of_scope', 'withdrawn_by_contractor', 'superseded_by_revision'],
      guards: [],
    },
    {
      // by includes 'system': the SLA timer below fires this edge on a stale
      // `allocated` TQ. No required input — a timer-fired edge can't collect a
      // form field from anyone.
      id: 'escalate_tq',
      from: ['allocated', 'response_drafted', 'response_approved', 'response_issued'],
      to: 'escalated',
      by: ['ipp_developer', 'admin', 'system'],
      label: 'Escalate',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
  ],

  // an allocated TQ with no drafted response in 3 days auto-escalates — the
  // deadlineCol / SLA concept in the legacy descriptor, made concrete.
  timers: [{ onState: 'allocated', after: { days: 3 }, fire: 'escalate_tq', kind: 'sla' }],
};
