// ipp_rfi — a construction Request for Information (RFI) as data.
//
// A contractor/IPP raises a question, doc control triages it and routes it to
// a responder, who researches, drafts, and (for multi-discipline questions)
// coordinates a cross-discipline review before returning the answer. The
// requester then either closes it out, converts it into a costed change order
// (a real commitment, gated by complianceHaltClear), or the answer leaves it
// needing further clarification — which still closes the same way once
// resolved. An overdue or contested RFI escalates instead.
//
// Legacy parity note (chain-registry-meridian.ts ipp_rfi): every v1 action's
// roles array is exactly ['admin', 'ipp_developer'] and counterpartyCol is
// null — no distinct responder/reviewer party is modelled in this chain
// (unlike ipp_document_control's originator/controller/reviewer split);
// 'admin' proxies doc-control/responder-side steps, matching ipp_ael's shape.
//
// The answer spine is STRUCTURAL: close_out and convert_to_change_order are
// reachable ONLY from answer_returned or clarification_requested — an RFI can
// never be closed out before it has been answered.
//
// SLA note: v1's sla_deadline_at becomes a real timer — an RFI left sitting
// in `submitted` (never triaged) for 3 days auto-escalates.
//
// settles:false — an RFI is a construction-control record, never a payment
// (R-S5-1); convert_to_change_order names cost/schedule impact but the money
// itself settles through the linked change-order chain, not here.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

// states an RFI can still be actively worked in — shared by escalate/void so
// either exit is reachable from anywhere in the live workflow.
const ACTIVE_STATES = [
  'submitted',
  'triage',
  'assigned_to_responder',
  'research_in_progress',
  'response_drafted',
  'cross_discipline_review',
  'answer_returned',
  'clarification_requested',
];

export const ippRfi: ChainDecl = {
  key: 'ipp_rfi',
  noun: 'RFI',
  refPrefix: 'RFI',
  title: (f) => `RFI — ${(f.question_short as string) ?? 'untitled question'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Implementation Agreement', provision: 'construction RFI / query resolution', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin'],

  fields: {
    rfi_number: { type: 'string', label: 'RFI number' },
    project_id: { type: 'string', required: true, label: 'Project' },
    rfi_class: { type: 'string', label: 'RFI class' },
    question_short: { type: 'string', required: true, label: 'Question (short)' },
    discipline: { type: 'string', label: 'Discipline' },
    contractor_name: { type: 'string', label: 'Contractor' },
    cost_impact_zar: { type: 'number', min: 0, label: 'Cost impact (ZAR)' },
    schedule_impact_days: { type: 'number', label: 'Schedule impact (days)' },
    safety_hazard_identified: { type: 'boolean', label: 'Safety hazard identified' },
    doc_controller_name: { type: 'string', label: 'Doc controller name' },
    coordination_disciplines: { type: 'string', label: 'Coordination disciplines' },
    comments_summary: { type: 'string', label: 'Comments summary' },
    linked_change_order_ref: { type: 'string', label: 'Linked change order ref' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted at' },
    answered_at: { type: 'string', label: 'Answered at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
    closed_at_rfi: { type: 'string', label: 'Closed at' },
  },

  initial: 'question_drafted',

  states: {
    question_drafted: { label: 'Question drafted', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    submitted: { label: 'Submitted', terminal: false, holder: 'admin', sla: { days: 3 } },
    triage: { label: 'Triage', terminal: false, holder: 'admin', sla: { hours: 24 } },
    assigned_to_responder: { label: 'Assigned to responder', terminal: false, holder: 'admin', sla: { hours: 24 } },
    research_in_progress: { label: 'Research in progress', terminal: false, holder: 'admin', sla: { days: 5 } },
    response_drafted: { label: 'Response drafted', terminal: false, holder: 'admin', sla: { days: 2 } },
    cross_discipline_review: { label: 'Cross-discipline review', terminal: false, holder: 'admin', sla: { days: 3 } },
    answer_returned: { label: 'Answer returned', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    clarification_requested: { label: 'Clarification requested', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    closed_out: { label: 'Closed out', terminal: true, holder: 'none' },
    escalated: { label: 'Escalated', terminal: false, holder: 'admin', sla: { days: 2 } },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    void: { label: 'Void', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'question_drafted',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Draft RFI',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        rfi_class: { type: 'string' },
        question_short: { type: 'string', required: true },
        discipline: { type: 'string' },
        contractor_name: { type: 'string' },
        cost_impact_zar: { type: 'number', min: 0 },
        schedule_impact_days: { type: 'number' },
        safety_hazard_identified: { type: 'boolean' },
      },
      guards: [],
    },
    {
      id: 'submit',
      from: 'question_drafted',
      to: 'submitted',
      by: ['ipp_developer', 'admin'],
      label: 'Submit',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'triage',
      from: 'submitted',
      to: 'triage',
      by: ['admin', 'ipp_developer'],
      label: 'Triage',
      intent: 'primary',
      input: { doc_controller_name: { type: 'string' } },
      guards: [],
    },
    {
      id: 'assign_responder',
      from: 'triage',
      to: 'assigned_to_responder',
      by: ['admin', 'ipp_developer'],
      label: 'Assign responder',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'commence_research',
      from: 'assigned_to_responder',
      to: 'research_in_progress',
      by: ['admin', 'ipp_developer'],
      label: 'Commence research',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'draft_response',
      from: 'research_in_progress',
      to: 'response_drafted',
      by: ['admin', 'ipp_developer'],
      label: 'Draft response',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'coordinate_review',
      from: 'response_drafted',
      to: 'cross_discipline_review',
      by: ['admin', 'ipp_developer'],
      label: 'Coordinate review',
      intent: 'secondary',
      input: { coordination_disciplines: { type: 'string' } },
      guards: [],
    },
    {
      id: 'return_answer',
      from: 'cross_discipline_review',
      to: 'answer_returned',
      by: ['admin', 'ipp_developer'],
      label: 'Return answer',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ answered_at: isoUtc(at) }),
    },
    {
      // the responder can still need more from the requester either mid-research
      // or after coordinating the review — both are pre-answer states.
      id: 'request_clarification',
      from: ['research_in_progress', 'cross_discipline_review'],
      to: 'clarification_requested',
      by: ['admin', 'ipp_developer'],
      label: 'Request clarification',
      intent: 'secondary',
      input: { comments_summary: { type: 'string', required: true } },
      guards: [],
    },
    {
      // structural: closing is reachable ONLY once the RFI has an answer on
      // the table (answer_returned) or a clarification round completed
      // (clarification_requested) — never straight off an unanswered state.
      id: 'close_out',
      from: ['answer_returned', 'clarification_requested'],
      to: 'closed_out',
      by: ['admin', 'ipp_developer'],
      label: 'Close out',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_rfi: isoUtc(at) }),
    },
    {
      // a real commitment (cost/schedule impact becomes a change order) —
      // gated same as other IPP admission edges.
      id: 'convert_to_change_order',
      from: ['answer_returned', 'clarification_requested'],
      to: 'closed_out',
      by: ['admin', 'ipp_developer'],
      label: 'Convert to change order',
      intent: 'secondary',
      input: {
        linked_change_order_ref: { type: 'string', required: true },
        cost_impact_zar: { type: 'number', min: 0 },
        schedule_impact_days: { type: 'number' },
      },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ closed_at_rfi: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      // no required input and no reason — the SLA timer below fires this edge.
      id: 'escalate',
      from: ACTIVE_STATES,
      to: 'escalated',
      by: ['admin', 'ipp_developer', 'system'],
      label: 'Escalate',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
    {
      id: 'link_to_dispute',
      from: ACTIVE_STATES,
      to: 'escalated',
      by: ['admin', 'ipp_developer'],
      label: 'Link to dispute',
      intent: 'secondary',
      input: { comments_summary: { type: 'string' } },
      requiresReason: ['answer_contested', 'cost_impact_disputed', 'schedule_impact_disputed', 'unresolved_after_escalation'],
      guards: [],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
    {
      id: 'reject',
      from: ['question_drafted', 'submitted', 'triage'],
      to: 'rejected',
      by: ['admin', 'ipp_developer'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['invalid_question', 'duplicate_rfi', 'out_of_scope', 'insufficient_detail'],
      guards: [],
    },
    {
      id: 'void',
      from: [...ACTIVE_STATES, 'question_drafted', 'escalated'],
      to: 'void',
      by: ['admin', 'ipp_developer'],
      label: 'Void',
      intent: 'destructive',
      requiresReason: ['duplicate_entry', 'data_error', 'wrong_project', 'superseded_rfi'],
      guards: [],
    },
    {
      id: 'archive',
      from: ['closed_out', 'escalated'],
      to: 'archived',
      by: ['admin', 'ipp_developer'],
      label: 'Archive',
      intent: 'secondary',
      guards: [],
    },
  ],

  // stalled-intake SLA: an RFI never triaged within 3 days of submission
  // auto-escalates (ipp_ael lapse pattern, sla not time_bar since it doesn't
  // terminate the txn).
  timers: [{ onState: 'submitted', after: { days: 3 }, fire: 'escalate', kind: 'sla' }],
};
