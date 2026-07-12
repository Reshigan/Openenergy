// handover_dossier — IPP construction-to-operations handover package as data.
//
// At mechanical completion the contractor compiles the handover dossier
// (as-builts, O&M manuals, test certificates, warranties, spares list) and
// submits it to the asset owner for review. The owner either sends it back for
// rectification (deficiency list) or accepts it. Acceptance is a completeness
// sign-off, so accept_dossier is guarded by completenessEvidencePresent — the
// owner must cite a completeness-evidence ref. Only after acceptance does the
// dossier transfer to the operations team.
//
// Structural gate: the ONLY path into handed_over is transfer_to_operations,
// which can fire ONLY from accepted; the ONLY path into accepted is
// accept_dossier, guarded by completeness evidence. So a dossier can NEVER be
// handed to operations without a documented completeness sign-off — the state
// graph, not a caller, enforces the ordering.
//
// settles:false — a document-handover control, never a payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const handoverDossier: ChainDecl = {
  key: 'handover_dossier',
  noun: 'Handover dossier',
  refPrefix: 'HD',
  title: (f) => `${(f.facility_name as string) ?? 'facility'} handover dossier — ${(f.project_name as string) ?? 'project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Implementation Agreement', provision: 'completion & handover deliverables', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'as-built & commissioning records', effect: 'requires' },
  ],
  roles: ['contractor', 'owner', 'operator'],

  fields: {
    project_name: { type: 'string', required: true, label: 'Project' },
    facility_name: { type: 'string', required: true, label: 'Facility' },
    contractor_party: { type: 'party', role: 'contractor', label: 'Contractor' },
    owner_party: { type: 'party', role: 'owner', label: 'Asset owner' },
    dossier_scope: { type: 'string', label: 'Scope (mechanical/electrical/civil/full)' },
    discipline: { type: 'string', label: 'Discipline' },
    document_count: { type: 'number', min: 0, label: 'Document count' },
    completeness_pct: { type: 'number', min: 0, max: 100, label: 'Completeness (%)' },
    as_built_ref: { type: 'string', label: 'As-built ref' },
    om_manual_ref: { type: 'string', label: 'O&M manual ref' },
    warranty_ref: { type: 'string', label: 'Warranty ref' },
    test_certificate_ref: { type: 'string', label: 'Test certificate ref' },
    spares_list_ref: { type: 'string', label: 'Spares list ref' },
    completeness_ref: { type: 'string', label: 'Completeness-evidence ref' },
    rectification_count: { type: 'number', label: 'Times returned for rectification' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    handed_over_at: { type: 'string', label: 'Handed over at' },
  },

  initial: 'dossier_drafting',

  states: {
    dossier_drafting: { label: 'Drafting', terminal: false, holder: 'contractor', sla: { days: 30 } },
    submitted_for_review: { label: 'Submitted for review', terminal: false, holder: 'owner', sla: { days: 5 } },
    under_review: { label: 'Under review', terminal: false, holder: 'owner', sla: { days: 10 } },
    rectification_required: { label: 'Rectification required', terminal: false, holder: 'contractor', sla: { days: 14 } },
    accepted: { label: 'Accepted', terminal: false, holder: 'owner', sla: { days: 3 } },
    handed_over: { label: 'Handed over to operations', terminal: true, holder: 'none' },
    dossier_rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'dossier_drafting',
      by: ['contractor', 'operator'],
      actorBecomes: 'contractor',
      label: 'Start dossier',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        facility_name: { type: 'string', required: true },
        dossier_scope: { type: 'string' },
        discipline: { type: 'string' },
        owner_party: { type: 'party', role: 'owner' },
      },
      guards: [],
    },
    {
      id: 'submit_dossier',
      from: 'dossier_drafting',
      to: 'submitted_for_review',
      by: ['contractor'],
      label: 'Submit for review',
      intent: 'primary',
      input: {
        document_count: { type: 'number', min: 0 },
        completeness_pct: { type: 'number', min: 0, max: 100 },
        as_built_ref: { type: 'string', required: true },
        om_manual_ref: { type: 'string' },
        warranty_ref: { type: 'string' },
        test_certificate_ref: { type: 'string' },
        spares_list_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'begin_review',
      from: 'submitted_for_review',
      to: 'under_review',
      by: ['owner'],
      label: 'Begin review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'request_rectification',
      from: 'under_review',
      to: 'rectification_required',
      by: ['owner'],
      label: 'Request rectification',
      intent: 'secondary',
      requiresReason: ['missing_documents', 'as_built_discrepancy', 'incomplete_warranties', 'test_gaps', 'spares_shortfall'],
      guards: [],
      derive: (f, _at: Instant) => ({ rectification_count: (typeof f.rectification_count === 'number' ? f.rectification_count : 0) + 1 }),
    },
    {
      id: 'resubmit',
      from: 'rectification_required',
      to: 'submitted_for_review',
      by: ['contractor'],
      label: 'Resubmit dossier',
      intent: 'primary',
      input: {
        document_count: { type: 'number', min: 0 },
        completeness_pct: { type: 'number', min: 0, max: 100 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      // completeness sign-off: the ONLY edge into accepted, and it demands a
      // named completeness-evidence ref (completenessEvidencePresent).
      id: 'accept_dossier',
      from: 'under_review',
      to: 'accepted',
      by: ['owner'],
      label: 'Accept dossier',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      // structural handover gate: only path into handed_over, only from accepted.
      id: 'transfer_to_operations',
      from: 'accepted',
      to: 'handed_over',
      by: ['owner', 'operator'],
      label: 'Transfer to operations',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ handed_over_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_dossier',
      from: ['submitted_for_review', 'under_review'],
      to: 'dossier_rejected',
      by: ['owner'],
      label: 'Reject dossier',
      intent: 'destructive',
      requiresReason: ['scope_not_met', 'fundamentally_incomplete', 'wrong_facility', 'superseded'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['dossier_drafting', 'submitted_for_review', 'rectification_required'],
      to: 'withdrawn',
      by: ['contractor'],
      label: 'Withdraw dossier',
      intent: 'destructive',
      requiresReason: ['project_descoped', 'contract_terminated', 'superseded'],
      guards: [],
    },
  ],
};
