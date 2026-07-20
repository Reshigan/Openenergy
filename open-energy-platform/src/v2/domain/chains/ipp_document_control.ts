// ipp_document_control — engineering document-control (IDC) lifecycle as data.
//
// An originator (EPC/contractor) transmits a project document; a document
// controller routes it into inter-discipline check (IDC) review; a reviewer
// completes the check and either approves it or returns it for revision. The
// document-control spine is STRUCTURAL: issue_for_construction leaves ONLY
// `approved`, and the ONLY path into `approved` is complete_review from
// `under_review`. So a document can NEVER be issued for construction before its
// IDC review completes — no guard needed, the state graph enforces it. Approval
// itself is gated by completenessEvidencePresent: the reviewer must cite the IDC
// completeness checklist ref, else the sign-off is refused.
//
// The IDC matrix is a projection over these txns, NOT a nightly cron
// (REBUILD_FUNCTIONAL_FLOOR §IPP: "IDC matrix is a projection, not a nightly
// cron"). settles:false — document control is an assurance record, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const nextRevisionCount = (n: Json | undefined): number => (typeof n === 'number' ? n : 0) + 1;

export const ippDocumentControl: ChainDecl = {
  key: 'ipp_document_control',
  noun: 'IPP document control',
  refPrefix: 'IDC',
  title: (f) =>
    `${(f.discipline as string) ?? 'general'} doc ${(f.document_number as string) ?? '—'} — ${(f.doc_title as string) ?? 'untitled'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ISO 9001', provision: 'cl.7.5 control of documented information', effect: 'requires' },
    { instrument: 'REIPPPP Implementation Agreement', provision: 'design document review & approval', effect: 'requires' },
  ],
  roles: ['originator', 'controller', 'reviewer', 'regulator'],

  fields: {
    document_number: { type: 'string', required: true, label: 'Document number' },
    doc_title: { type: 'string', required: true, label: 'Document title' },
    discipline: { type: 'string', required: true, label: 'Discipline (electrical/civil/mechanical)' },
    revision_code: { type: 'string', label: 'Revision code (A/B/C…)' },
    transmittal_ref: { type: 'string', label: 'Transmittal ref' },
    safety_critical: { type: 'boolean', label: 'Safety-critical document' },
    originator_party: { type: 'party', role: 'originator', label: 'Originator' },
    controller_party: { type: 'party', role: 'controller', label: 'Document controller' },
    reviewer_party: { type: 'party', role: 'reviewer', label: 'IDC reviewer' },
    completeness_ref: { type: 'string', label: 'IDC completeness checklist ref' },
    revision_count: { type: 'number', min: 0, label: 'Times returned for revision' },
    // written by derive, never by the client
    reviewed_at: { type: 'string', label: 'IDC review completed at' },
    resubmitted_at: { type: 'string', label: 'Last resubmitted at' },
    issued_at: { type: 'string', label: 'Issued for construction at' },
  },

  initial: 'document_submitted',

  states: {
    document_submitted: { label: 'Document submitted', terminal: false, holder: 'controller', sla: { hours: 24 } },
    under_review: { label: 'Under IDC review', terminal: false, holder: 'reviewer', sla: { hours: 48 } },
    revision_required: { label: 'Revision required', terminal: false, holder: 'originator', sla: { days: 5 } },
    approved: { label: 'Approved', terminal: false, holder: 'controller', sla: { hours: 24 } },
    issued_for_construction: { label: 'Issued for construction', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    superseded: { label: 'Superseded', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'document_submitted',
      by: ['originator', 'controller'],
      actorBecomes: 'originator',
      label: 'Transmit document',
      intent: 'primary',
      input: {
        document_number: { type: 'string', required: true },
        doc_title: { type: 'string', required: true },
        discipline: { type: 'string', required: true },
        revision_code: { type: 'string' },
        transmittal_ref: { type: 'string' },
        safety_critical: { type: 'boolean' },
        controller_party: { type: 'party', role: 'controller' },
        reviewer_party: { type: 'party', role: 'reviewer' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'start_review',
      from: 'document_submitted',
      to: 'under_review',
      by: ['controller', 'reviewer'],
      label: 'Start IDC review',
      intent: 'primary',
      guards: [],
    },
    {
      // structural gate: complete_review is the ONLY edge into `approved`, and it
      // can only fire from `under_review`. The IDC completeness checklist ref is
      // mandatory — you cannot sign off an approval without the check evidence.
      id: 'complete_review',
      from: 'under_review',
      to: 'approved',
      by: ['reviewer'],
      label: 'Complete IDC review',
      intent: 'primary',
      // completeness_ref is NOT input-required: the guard (not the engine's
      // required-field check) is what rejects a missing IDC checklist ref, so the
      // rejection surfaces as MISSING_COMPLETENESS_EVIDENCE rather than a field error.
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ reviewed_at: isoUtc(at) }),
    },
    {
      id: 'return_for_revision',
      from: 'under_review',
      to: 'revision_required',
      by: ['reviewer'],
      label: 'Return for revision',
      intent: 'secondary',
      requiresReason: ['idc_comments', 'incomplete_scope', 'wrong_template', 'clash_detected', 'code_noncompliance'],
      guards: [],
    },
    {
      id: 'resubmit',
      from: 'revision_required',
      to: 'document_submitted',
      by: ['originator'],
      label: 'Resubmit revised document',
      intent: 'primary',
      input: { revision_code: { type: 'string' }, transmittal_ref: { type: 'string' } },
      guards: [],
      derive: (f, at: Instant) => ({ revision_count: nextRevisionCount(f.revision_count), resubmitted_at: isoUtc(at) }),
    },
    {
      // structural safety gate: the ONLY edge into issued_for_construction, and it
      // can only fire from `approved`. A document therefore cannot be issued for
      // construction before IDC review completes. No guard.
      id: 'issue_for_construction',
      from: 'approved',
      to: 'issued_for_construction',
      by: ['controller'],
      label: 'Issue for construction',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ issued_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      // revision_required included so the 21-day resubmission time-bar can fire
      from: ['document_submitted', 'under_review', 'revision_required'],
      to: 'rejected',
      by: ['reviewer', 'controller', 'system'],
      label: 'Reject document',
      intent: 'destructive',
      requiresReason: ['unacceptable_quality', 'out_of_scope', 'duplicate_submission', 'contract_noncompliance', 'resubmission_deadline_missed'],
      guards: [],
    },
    {
      id: 'supersede',
      from: ['revision_required', 'approved'],
      to: 'superseded',
      by: ['controller'],
      label: 'Supersede document',
      intent: 'destructive',
      requiresReason: ['newer_revision_issued', 'scope_removed', 'design_change'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['document_submitted', 'revision_required'],
      to: 'withdrawn',
      by: ['originator'],
      label: 'Withdraw document',
      intent: 'destructive',
      requiresReason: ['issued_in_error', 'no_longer_required', 'consolidated_elsewhere'],
      guards: [],
    },
  ],

  // revision-required resubmission time-bar: a document returned for revision that
  // is never resubmitted stales out and is rejected. record-only stub; the sweep
  // computes the real bar off state sla days (permit_to_work pattern).
  timers: [{ onState: 'revision_required', after: { days: 21 }, fire: 'reject', kind: 'time_bar', reason: 'resubmission_deadline_missed' }],
};
