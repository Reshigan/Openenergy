// submittal_rfi — construction submittal / Request-For-Information review cycle
// as data.
//
// An originator (contractor) raises an RFI/submittal against a spec section and
// routes it to a reviewer (engineer of record / consultant). The reviewer takes
// it under review and either answers it (a documented response), or bounces it
// back "revise & resubmit". The originator resubmits and the cycle repeats. Only
// an answered RFI can be closed out.
//
// The document-control spine is STRUCTURAL: close_rfi leaves ONLY the `answered`
// state, and the ONLY path into `answered` is answer_rfi (by the reviewer). So an
// RFI can NEVER be closed without a recorded response — no guard needed, the
// state graph enforces it. Closing an unanswered RFI is an ILLEGAL_TRANSITION.
//
// NO guards fit this chain: an RFI is a coordination artefact, not a
// credit/serial/regulator crossing. Business rules are enforced structurally
// (the answered→closed gate) and via requiresReason[] on the bounce/void exits.
//
// RFI aging is a timer (functional-floor row): an SLA on `under_review` that the
// nightly sweep computes off the state sla hours. Record-only stub here.
//
// settles:false — an RFI is a coordination record, never a payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const submittalRfi: ChainDecl = {
  key: 'submittal_rfi',
  noun: 'Submittal / RFI',
  refPrefix: 'SR',
  title: (f) => `${(f.doc_type as string) ?? 'RFI'} — ${(f.subject as string) ?? 'untitled'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NEC/JBCC construction contract', provision: 'RFI & submittal procedure', effect: 'requires' },
  ],
  roles: ['originator', 'reviewer', 'coordinator'],

  fields: {
    rfi_number: { type: 'string', label: 'RFI number' },
    originator_party: { type: 'party', role: 'originator', label: 'Originator' },
    reviewer_party: { type: 'party', role: 'reviewer', label: 'Reviewer' },
    doc_type: { type: 'string', required: true, label: 'Type (rfi/submittal)' },
    subject: { type: 'string', required: true, label: 'Subject' },
    discipline: { type: 'string', label: 'Discipline (civil/electrical/structural/…)' },
    question: { type: 'string', required: true, label: 'Question / description' },
    spec_section: { type: 'string', label: 'Spec section' },
    drawing_ref: { type: 'string', label: 'Drawing reference' },
    priority: { type: 'string', label: 'Priority (routine/urgent)' },
    response_ref: { type: 'string', label: 'Response document ref' },
    disposition: { type: 'string', label: 'Disposition (approved/approved_as_noted/rejected)' },
    revision_count: { type: 'number', label: 'Resubmission count' },
    // written by derive, never by the client
    answered_at: { type: 'string', label: 'Answered at' },
    closed_at_rfi: { type: 'string', label: 'Closed at' },
  },

  initial: 'submitted',

  states: {
    submitted: { label: 'Submitted', terminal: false, holder: 'reviewer', sla: { days: 2 } },
    under_review: { label: 'Under review', terminal: false, holder: 'reviewer', sla: { days: 7 } },
    revision_requested: { label: 'Revision requested', terminal: false, holder: 'originator', sla: { days: 5 } },
    answered: { label: 'Answered', terminal: false, holder: 'originator', sla: { days: 3 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    voided: { label: 'Voided', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'submitted',
      by: ['originator', 'coordinator'],
      actorBecomes: 'originator',
      label: 'Raise RFI',
      intent: 'primary',
      input: {
        doc_type: { type: 'string', required: true },
        subject: { type: 'string', required: true },
        discipline: { type: 'string' },
        question: { type: 'string', required: true },
        spec_section: { type: 'string' },
        drawing_ref: { type: 'string' },
        priority: { type: 'string' },
        reviewer_party: { type: 'party', role: 'reviewer' },
      },
      guards: [],
    },
    {
      id: 'begin_review',
      from: 'submitted',
      to: 'under_review',
      by: ['reviewer', 'coordinator'],
      label: 'Begin review',
      intent: 'primary',
      guards: [],
    },
    {
      // structural gate: the ONLY edge into `answered`. close_rfi can only fire
      // from `answered`, so an RFI cannot be closed without a recorded response.
      id: 'answer_rfi',
      from: 'under_review',
      to: 'answered',
      by: ['reviewer'],
      label: 'Answer RFI',
      intent: 'primary',
      input: {
        response_ref: { type: 'string', required: true },
        disposition: { type: 'string', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ answered_at: isoUtc(at) }),
    },
    {
      id: 'request_revision',
      from: 'under_review',
      to: 'revision_requested',
      by: ['reviewer'],
      label: 'Revise & resubmit',
      intent: 'secondary',
      requiresReason: ['insufficient_detail', 'wrong_spec_section', 'noncompliant', 'superseded_drawing'],
      guards: [],
    },
    {
      id: 'resubmit',
      from: 'revision_requested',
      to: 'submitted',
      by: ['originator', 'coordinator'],
      label: 'Resubmit',
      intent: 'primary',
      guards: [],
      derive: (f, _at: Instant) => ({ revision_count: (typeof f.revision_count === 'number' ? f.revision_count : 0) + 1 }),
    },
    {
      id: 'close_rfi',
      from: 'answered',
      to: 'closed',
      by: ['originator', 'coordinator'],
      label: 'Close RFI',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_rfi: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'withdraw',
      from: ['submitted', 'under_review', 'revision_requested'],
      to: 'withdrawn',
      by: ['originator'],
      label: 'Withdraw RFI',
      intent: 'destructive',
      requiresReason: ['duplicate', 'resolved_offline', 'no_longer_required'],
      guards: [],
    },
    {
      id: 'void_rfi',
      from: ['submitted', 'under_review', 'revision_requested', 'answered'],
      to: 'voided',
      by: ['reviewer', 'coordinator', 'system'],
      label: 'Void RFI',
      intent: 'destructive',
      requiresReason: ['raised_in_error', 'out_of_scope', 'contract_terminated', 'response_deadline_missed'],
      guards: [],
    },
  ],

  // RFI aging SLA: an RFI left under review past its response window ages out.
  // The timer must NOT auto-answer (that would fabricate a reviewer response);
  // it administratively voids the stale RFI with an honest deadline code.
  timers: [{ onState: 'under_review', after: { days: 14 }, fire: 'void_rfi', kind: 'sla', reason: 'response_deadline_missed' }],
};
