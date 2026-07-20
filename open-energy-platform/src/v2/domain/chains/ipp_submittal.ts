// ipp_submittal — an IPP construction document submittal (shop drawing, O&M
// manual, material approval, or critical-safety package) run through the
// standard document-control review cycle, as data. A contractor assembles a
// package and submits it; the doc-control desk screens it, assigns a
// reviewer, and the reviewer either works it straight through or routes it
// via multi-discipline coordination before drafting a response. The response
// either stamps the package back (clean or "approved with comments"), which
// the contractor then closes out, or sends it back for resubmission.
//
// Legacy parity note (chain-registry-meridian.ts ipp_submittal): every v1
// action's roles array is exactly ['admin', 'ipp_developer'] and
// counterpartyCol is null — the reviewer/doc-controller is not modelled as a
// distinct txn party, same precedent as ipp_om_handover / ipp_ael. 'admin'
// acts as the platform-side proxy for the review-desk steps (screen, assign,
// review, coordinate, draft response, stamp). No reviewer/regulator role or
// guard is introduced here since there is no party field to satisfy one.
//
// resubmission_requested is left without a v1-modelled way back into the
// package-assembly loop — v1's actions array never targets a state that
// re-enters review from it — so, same precedent as ipp_om_handover's
// conditional_acceptance, it only exits via the terminal edges (reject /
// void / archive). The contractor remains responsible for a fresh submittal
// outside this transaction's modelled flow.
//
// capacity_mw carries v1's `project_capacity_mw` initiation field under the
// name used platform-wide (ipp_evm / ipp_schedule / ipp_om_handover) so it
// composes with anything that ranks IPP work by MW.
//
// The SLA time-bar on under_review escalates a submittal review that sits
// unworked for 14 days — same sweep pattern as the deadlineCol v1 declares
// (sla_deadline_at) but never wires an automatic consequence to.
//
// settles:false — a document-control review cycle is a construction-control
// record, never a payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const num = (v: Json | undefined): number => (typeof v === 'number' ? v : 0);

export const ippSubmittal: ChainDecl = {
  key: 'ipp_submittal',
  noun: 'IPP submittal',
  refPrefix: 'SUB',
  title: (f) =>
    `Submittal — ${(f.drawing_title as string) ?? (f.package_code as string) ?? (f.project_name as string) ?? 'package'} (${(f.submittal_class as string) ?? 'pending'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement construction submittal / shop-drawing review', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin'],

  fields: {
    submittal_number: { type: 'string', label: 'Submittal number' },
    project_id: { type: 'string', required: true, label: 'Project' },
    project_name: { type: 'string', label: 'Project name' },
    capacity_mw: { type: 'number', min: 0, label: 'Project capacity (MW)' },
    submittal_class: { type: 'string', label: 'Submittal class' },
    submittal_type: { type: 'string', label: 'Submittal type' },
    discipline: { type: 'string', label: 'Discipline' },
    contractor_name: { type: 'string', label: 'Contractor' },
    long_lead_item: { type: 'boolean', label: 'Long-lead item' },
    author_party: { type: 'party', role: 'ipp_developer', label: 'Contractor / IPP developer' },
    // package assembly
    package_code: { type: 'string', label: 'Package code' },
    csi_section: { type: 'string', label: 'CSI section' },
    drawing_title: { type: 'string', label: 'Drawing title' },
    // review
    doc_controller_name: { type: 'string', label: 'Doc controller' },
    coordination_disciplines: { type: 'string', label: 'Coordination disciplines' },
    comments_summary: { type: 'string', label: 'Comments summary' },
    comments_open: { type: 'number', min: 0, label: 'Open comments' },
    review_stamp: { type: 'string', label: 'Review stamp (A–E)' },
    resubmission_count: { type: 'number', label: 'Times resubmission requested' },
    escalation_count: { type: 'number', label: 'Times escalated' },
    // derive-stamped timestamps
    submitted_at: { type: 'string', label: 'Submitted at' },
    screened_at: { type: 'string', label: 'Screened at' },
    assigned_at: { type: 'string', label: 'Assigned at' },
    review_commenced_at: { type: 'string', label: 'Review commenced at' },
    coordination_started_at: { type: 'string', label: 'Coordination started at' },
    response_drafted_at: { type: 'string', label: 'Response drafted at' },
    stamped_returned_at: { type: 'string', label: 'Stamped & returned at' },
    resubmission_requested_at: { type: 'string', label: 'Resubmission requested at' },
    closed_out_at: { type: 'string', label: 'Closed out at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
    archived_at: { type: 'string', label: 'Archived at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    void_at: { type: 'string', label: 'Voided at' },
  },

  initial: 'contractor_drafted',

  states: {
    contractor_drafted: { label: 'Drafting package', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    package_assembled: { label: 'Package assembled', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    submitted: { label: 'Submitted', terminal: false, holder: 'admin', sla: { days: 2 } },
    screening: { label: 'Screening', terminal: false, holder: 'admin', sla: { days: 2 } },
    assigned_to_reviewer: { label: 'Assigned to reviewer', terminal: false, holder: 'admin', sla: { days: 1 } },
    under_review: { label: 'Under review', terminal: false, holder: 'admin', sla: { days: 14 } },
    coordination_review: { label: 'Coordination review', terminal: false, holder: 'admin', sla: { days: 7 } },
    response_drafted: { label: 'Response drafted', terminal: false, holder: 'admin', sla: { days: 3 } },
    stamped_returned: { label: 'Stamped & returned', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    // v1 does not model a way back into package assembly from here — the
    // contractor's fresh submittal is a new transaction, not a re-entry edge.
    resubmission_requested: { label: 'Resubmission requested', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    closed_out: { label: 'Closed out', terminal: false, holder: 'admin', sla: { days: 5 } },
    escalated: { label: 'Escalated', terminal: false, holder: 'admin', sla: { days: 3 } },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    void: { label: 'Void', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'contractor_drafted',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Draft submittal package',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        submittal_class: { type: 'string' },
        project_name: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        submittal_type: { type: 'string' },
        discipline: { type: 'string' },
        contractor_name: { type: 'string' },
        long_lead_item: { type: 'boolean' },
      },
      guards: [],
    },

    // --- assembly + intake ------------------------------------------------
    {
      id: 'assemble_package',
      from: 'contractor_drafted',
      to: 'package_assembled',
      by: ['ipp_developer', 'admin'],
      label: 'Assemble package',
      intent: 'primary',
      input: {
        submittal_class: { type: 'string' },
        submittal_type: { type: 'string' },
        discipline: { type: 'string' },
        package_code: { type: 'string', required: true },
        csi_section: { type: 'string' },
        drawing_title: { type: 'string', required: true },
      },
      guards: [],
    },
    {
      id: 'submit',
      from: 'package_assembled',
      to: 'submitted',
      by: ['ipp_developer', 'admin'],
      label: 'Submit for review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'screen',
      from: 'submitted',
      to: 'screening',
      by: ['admin', 'ipp_developer'],
      label: 'Screen',
      intent: 'secondary',
      input: { doc_controller_name: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ screened_at: isoUtc(at) }),
    },
    {
      id: 'assign_reviewer',
      from: 'screening',
      to: 'assigned_to_reviewer',
      by: ['admin', 'ipp_developer'],
      label: 'Assign reviewer',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ assigned_at: isoUtc(at) }),
    },

    // --- review -------------------------------------------------------------
    {
      id: 'commence_review',
      from: 'assigned_to_reviewer',
      to: 'under_review',
      by: ['admin', 'ipp_developer', 'system'],
      label: 'Commence review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ review_commenced_at: isoUtc(at) }),
    },
    {
      id: 'coordinate_review',
      from: 'under_review',
      to: 'coordination_review',
      by: ['admin', 'ipp_developer'],
      label: 'Coordinate review',
      intent: 'secondary',
      input: { coordination_disciplines: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ coordination_started_at: isoUtc(at) }),
    },
    {
      id: 'draft_response',
      from: 'coordination_review',
      to: 'response_drafted',
      by: ['admin', 'ipp_developer'],
      label: 'Draft response',
      intent: 'primary',
      input: {
        comments_summary: { type: 'string' },
        comments_open: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ response_drafted_at: isoUtc(at) }),
    },
    {
      id: 'stamp_return',
      from: 'response_drafted',
      to: 'stamped_returned',
      by: ['admin', 'ipp_developer'],
      label: 'Stamp & return',
      intent: 'primary',
      input: { review_stamp: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ stamped_returned_at: isoUtc(at) }),
    },
    {
      id: 'approve_with_comments',
      from: 'response_drafted',
      to: 'stamped_returned',
      by: ['admin', 'ipp_developer'],
      label: 'Approve with comments',
      intent: 'primary',
      input: { comments_summary: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ stamped_returned_at: isoUtc(at) }),
    },
    {
      id: 'request_resubmission',
      from: ['response_drafted', 'stamped_returned'],
      to: 'resubmission_requested',
      by: ['admin', 'ipp_developer'],
      label: 'Request resubmission',
      intent: 'secondary',
      guards: [],
      derive: (f, at: Instant) => ({
        resubmission_requested_at: isoUtc(at),
        resubmission_count: num(f.resubmission_count) + 1,
      }),
    },
    {
      id: 'close_out',
      from: 'stamped_returned',
      to: 'closed_out',
      by: ['ipp_developer', 'admin'],
      label: 'Close out',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_out_at: isoUtc(at) }),
    },

    // --- escalation -----------------------------------------------------------
    {
      // SLA timer fires this off under_review with reason 'sla_breach'; also
      // manually invocable from any in-flight state (v1's roles are uniform
      // across the whole action set, no state restriction implied).
      id: 'escalate',
      from: [
        'contractor_drafted',
        'package_assembled',
        'submitted',
        'screening',
        'assigned_to_reviewer',
        'under_review',
        'coordination_review',
        'response_drafted',
        'stamped_returned',
        'resubmission_requested',
        'closed_out',
      ],
      to: 'escalated',
      by: ['admin', 'ipp_developer', 'system'],
      label: 'Escalate',
      intent: 'secondary',
      requiresReason: ['sla_breach', 'coordination_conflict', 'critical_safety_issue', 'contractor_non_responsive'],
      guards: [],
      derive: (f, at: Instant) => ({
        escalated_at: isoUtc(at),
        escalation_count: num(f.escalation_count) + 1,
      }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: [
        'contractor_drafted',
        'package_assembled',
        'submitted',
        'screening',
        'assigned_to_reviewer',
        'under_review',
        'coordination_review',
        'response_drafted',
        'stamped_returned',
        'resubmission_requested',
        'escalated',
      ],
      to: 'rejected',
      by: ['admin', 'ipp_developer'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['incomplete_package', 'non_compliant_deviation', 'wrong_project_reference', 'duplicate_submittal', 'specification_conflict'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'void',
      from: [
        'contractor_drafted',
        'package_assembled',
        'submitted',
        'screening',
        'assigned_to_reviewer',
        'under_review',
        'coordination_review',
        'response_drafted',
        'stamped_returned',
        'resubmission_requested',
        'closed_out',
        'escalated',
      ],
      to: 'void',
      by: ['admin', 'ipp_developer'],
      label: 'Void',
      intent: 'destructive',
      requiresReason: ['duplicate_submittal', 'data_error', 'project_cancelled', 'superseded_by_revision'],
      guards: [],
      derive: (_f, at: Instant) => ({ void_at: isoUtc(at) }),
    },
    {
      id: 'archive',
      from: [
        'contractor_drafted',
        'package_assembled',
        'submitted',
        'screening',
        'assigned_to_reviewer',
        'under_review',
        'coordination_review',
        'response_drafted',
        'stamped_returned',
        'resubmission_requested',
        'closed_out',
        'escalated',
      ],
      to: 'archived',
      by: ['admin'],
      label: 'Archive',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ archived_at: isoUtc(at) }),
    },
  ],

  // under_review SLA time-bar: a review left unworked for 14 days escalates
  // automatically. escalate's `by` includes 'system', its `from` includes
  // under_review, it has no required input, and its requiresReason list
  // carries the 'sla_breach' code the timer fires with — bundle-test shape.
  timers: [{ onState: 'under_review', after: { days: 14 }, fire: 'escalate', kind: 'sla', reason: 'sla_breach' }],
};
