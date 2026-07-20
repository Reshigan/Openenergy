// ipp_doc_control — IPP engineering-drawing document-control lifecycle as data.
//
// An IPP developer uploads a drawing, indexes its metadata, opens a working
// revision, assigns it into inter-discipline check (IDC), transmits it for
// review, and the review cycle (start → comment → revise) repeats until it's
// approved, issued for construction, and finally finalised as-built and
// archived. The pipeline is a straight-line spine — each action is the only
// path onto the next state — so a drawing can never skip IDC or reach
// "issued for construction" without having been through review.
//
// Approval is gated by completenessEvidencePresent: an approver must cite the
// IDC completeness checklist ref, else the sign-off is refused (same gate as
// the sibling ipp_document_control chain — a real completeness check, not
// fabricated for this chain).
//
// hold/resume: hold is reachable from any live review-cycle state but resume
// always returns to `transmitted` (the review-queue checkpoint) — the same
// single-target simplification punch_list uses for put_on_hold/resume; the
// exact pre-hold state is not preserved, only that review needs to restart.
//
// A transmitted drawing left without a review start for 14 days is a stale
// SLA breach (legacy sla_deadline_at) — the sweep rejects it.
//
// settles:false — document control is an assurance/QA record, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc, addDuration } from '../time';

const nextRevisionCount = (n: Json | undefined): number => (typeof n === 'number' ? n : 0) + 1;

export const ippDocControl: ChainDecl = {
  key: 'ipp_doc_control',
  noun: 'IPP controlled document',
  refPrefix: 'IDCT',
  title: (f) =>
    `${(f.document_number as string) ?? 'doc'} — ${(f.drawing_title as string) ?? 'untitled drawing'}`,
  visibility: 'owner',
  settles: false,
  legalBasis: [
    { instrument: 'ISO 9001', provision: 'cl.7.5 control of documented information', effect: 'requires' },
    { instrument: 'REIPPPP Implementation Agreement', provision: 'design document review & approval', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'operator'],

  fields: {
    document_number: { type: 'string', required: true, label: 'Document number' },
    drawing_title: { type: 'string', required: true, label: 'Drawing title' },
    document_class: { type: 'string', required: true, label: 'Document class' },
    project_id: { type: 'string', required: true, label: 'Project' },
    discipline: { type: 'string', label: 'Discipline (electrical/civil/mechanical)' },
    revision_code: { type: 'string', label: 'Revision code (A/B/C…)' },
    comments_summary: { type: 'string', label: 'Latest review comments summary' },
    revision_count: { type: 'number', min: 0, label: 'Times revised' },
    completeness_ref: { type: 'string', label: 'IDC completeness checklist ref' },
    // written by derive, never by the client
    sla_deadline_at: { type: 'string', label: 'Review-start SLA deadline' },
    metadata_indexed_at: { type: 'string', label: 'Metadata indexed at' },
    transmitted_at: { type: 'string', label: 'Transmitted at' },
    review_started_at: { type: 'string', label: 'Review started at' },
    revised_at: { type: 'string', label: 'Last revised at' },
    approved_at: { type: 'string', label: 'Approved at' },
    issued_at: { type: 'string', label: 'Issued for construction at' },
    as_built_finalised_at: { type: 'string', label: 'As-built finalised at' },
    archived_at: { type: 'string', label: 'Archived at' },
    held_at: { type: 'string', label: 'Put on hold at' },
    resumed_at: { type: 'string', label: 'Resumed at' },
  },

  initial: 'draft_uploaded',

  states: {
    draft_uploaded: { label: 'Draft uploaded', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    metadata_indexed: { label: 'Metadata indexed', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    revision_open: { label: 'Revision open', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    IDC_assigned: { label: 'IDC assigned', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    transmitted: { label: 'Transmitted', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    reviewed: { label: 'Reviewed', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    commented: { label: 'Commented', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    revised: { label: 'Revised', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    approved: { label: 'Approved', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    issued_for_construction: { label: 'Issued for construction', terminal: false, holder: 'ipp_developer' },
    as_built_finalised: { label: 'As-built finalised', terminal: false, holder: 'ipp_developer' },
    hold: { label: 'On hold', terminal: false, holder: 'ipp_developer' },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft_uploaded',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Upload draft document',
      intent: 'primary',
      input: {
        document_number: { type: 'string', required: true },
        drawing_title: { type: 'string', required: true },
        document_class: { type: 'string', required: true },
        project_id: { type: 'string', required: true },
        discipline: { type: 'string' },
        revision_code: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'index_metadata',
      from: 'draft_uploaded',
      to: 'metadata_indexed',
      by: ['ipp_developer'],
      label: 'Index metadata',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ metadata_indexed_at: isoUtc(at) }),
    },
    {
      id: 'open_revision',
      from: 'metadata_indexed',
      to: 'revision_open',
      by: ['ipp_developer'],
      label: 'Open revision',
      intent: 'primary',
      input: { revision_code: { type: 'string' } },
      guards: [],
    },
    {
      id: 'assign_IDC',
      from: 'revision_open',
      to: 'IDC_assigned',
      by: ['ipp_developer'],
      label: 'Assign IDC',
      intent: 'primary',
      guards: [],
    },
    {
      // the SLA deadline (legacy sla_deadline_at) starts here — a transmitted
      // drawing that never enters review within 14 days is a stale breach.
      id: 'transmit',
      from: 'IDC_assigned',
      to: 'transmitted',
      by: ['ipp_developer'],
      label: 'Transmit',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({
        transmitted_at: isoUtc(at),
        sla_deadline_at: isoUtc(addDuration(at, { days: 14 })),
      }),
    },
    {
      id: 'start_review',
      from: 'transmitted',
      to: 'reviewed',
      by: ['ipp_developer'],
      label: 'Start review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ review_started_at: isoUtc(at) }),
    },
    {
      id: 'comment',
      from: 'reviewed',
      to: 'commented',
      by: ['ipp_developer'],
      label: 'Comment',
      intent: 'secondary',
      input: { comments_summary: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'revise',
      from: 'commented',
      to: 'revised',
      by: ['ipp_developer'],
      label: 'Revise',
      intent: 'primary',
      input: { revision_code: { type: 'string' } },
      guards: [],
      derive: (f, at: Instant) => ({ revision_count: nextRevisionCount(f.revision_count), revised_at: isoUtc(at) }),
    },
    {
      // reachable from a clean review (no comments needed) or after a revision
      // cycle. completeness_ref is NOT input-required: the guard, not the
      // engine's required-field check, is what rejects a missing IDC checklist
      // ref, so the rejection surfaces as MISSING_COMPLETENESS_EVIDENCE.
      id: 'approve',
      from: ['reviewed', 'revised'],
      to: 'approved',
      by: ['ipp_developer'],
      label: 'Approve',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'issue_for_construction',
      from: 'approved',
      to: 'issued_for_construction',
      by: ['ipp_developer'],
      label: 'Issue for construction',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ issued_at: isoUtc(at) }),
    },
    {
      id: 'finalise_as_built',
      from: 'issued_for_construction',
      to: 'as_built_finalised',
      by: ['ipp_developer'],
      label: 'Finalise as-built',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ as_built_finalised_at: isoUtc(at) }),
    },
    {
      id: 'archive',
      from: 'as_built_finalised',
      to: 'archived',
      by: ['ipp_developer'],
      label: 'Archive',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ archived_at: isoUtc(at) }),
    },

    // --- hold / resume ----------------------------------------------------
    {
      id: 'hold',
      from: ['revision_open', 'IDC_assigned', 'transmitted', 'reviewed', 'commented', 'revised'],
      to: 'hold',
      by: ['ipp_developer'],
      label: 'Hold',
      intent: 'secondary',
      requiresReason: ['access_blocked', 'materials_awaited', 'design_query_open', 'scope_change_pending', 'client_hold'],
      guards: [],
      derive: (_f, at: Instant) => ({ held_at: isoUtc(at) }),
    },
    {
      // single resume target (transmitted): the review cycle restarts from the
      // queue checkpoint regardless of which review-cycle state was on hold —
      // same simplification punch_list's put_on_hold/resume pair uses.
      id: 'resume',
      from: 'hold',
      to: 'transmitted',
      by: ['ipp_developer'],
      label: 'Resume',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ resumed_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      // 'transmitted' included so the 14-day review-start SLA time-bar can fire.
      id: 'reject',
      from: ['draft_uploaded', 'metadata_indexed', 'revision_open', 'IDC_assigned', 'transmitted', 'reviewed', 'commented', 'revised', 'approved', 'hold'],
      to: 'rejected',
      by: ['ipp_developer', 'system'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['unacceptable_quality', 'out_of_scope', 'duplicate_submission', 'contract_noncompliance', 'review_deadline_missed'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['draft_uploaded', 'metadata_indexed', 'revision_open', 'IDC_assigned', 'transmitted'],
      to: 'withdrawn',
      by: ['ipp_developer'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['issued_in_error', 'no_longer_required', 'consolidated_elsewhere'],
      guards: [],
    },
  ],

  // review-start SLA time-bar: a drawing transmitted but never taken into
  // review within 14 days is rejected as a stale breach (legacy sla_deadline_at).
  timers: [{ onState: 'transmitted', after: { days: 14 }, fire: 'reject', kind: 'time_bar', reason: 'review_deadline_missed' }],
};
