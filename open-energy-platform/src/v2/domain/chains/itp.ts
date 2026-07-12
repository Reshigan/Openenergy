// itp — Inspection & Test Plan lifecycle as data (IPP construction QA/QC).
//
// A contractor drafts an ITP against a work package; an engineer reviews and
// approves the plan, inspections are carried out against its hold/witness
// points, and only once the inspection is signed off complete can the ITP be
// closed. The QA spine is structural: close_itp leaves ONLY inspection_complete,
// and the ONLY path into inspection_complete is complete_inspections — which is
// only reachable from an approved, in-progress plan. So an ITP can NEVER be
// closed before its inspections are actually signed off. No guard needed; the
// state graph enforces it.
//
// The completion sign-off itself is evidence-gated: complete_inspections is
// guarded by completenessEvidencePresent, so an inspection cannot be declared
// complete without a named completeness-evidence ref (the QA record).
//
// NO claim key. An ITP is a per-work-package quality record, not a claim over a
// finite resource; the same asset is re-inspected each work package.
//
// settles:false — an ITP is a construction quality control, never a payment
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure inspection-tier bucketing off the hold-point count. No clock, no env.
const inspectionTier = (holdPoints: Json | undefined): string => {
  if (typeof holdPoints !== 'number') return 'unassessed';
  if (holdPoints >= 5) return 'intensive';
  if (holdPoints >= 1) return 'standard';
  return 'documentary';
};

export const itp: ChainDecl = {
  key: 'itp',
  noun: 'Inspection & test plan',
  refPrefix: 'ITP',
  title: (f) => `${(f.discipline as string) ?? 'general'} ITP — ${(f.work_package as string) ?? (f.asset_name as string) ?? 'unnamed'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'connection & commissioning quality assurance', effect: 'requires' },
    { instrument: 'REIPPPP Implementation Agreement', provision: 'construction QA/QC & inspection regime', effect: 'requires' },
  ],
  roles: ['contractor', 'engineer', 'regulator', 'operator'],

  fields: {
    itp_number: { type: 'string', label: 'ITP number' },
    contractor_party: { type: 'party', role: 'contractor', label: 'Contractor' },
    engineer_party: { type: 'party', role: 'engineer', label: "Engineer / owner's rep" },
    asset_name: { type: 'string', required: true, label: 'Asset' },
    work_package: { type: 'string', required: true, label: 'Work package' },
    discipline: { type: 'string', required: true, label: 'Discipline (civil/mechanical/electrical)' },
    inspection_class: { type: 'string', required: true, label: 'Class (hold_point/witness_point/review_point)' },
    spec_ref: { type: 'string', label: 'Specification ref' },
    hold_point_count: { type: 'number', min: 0, label: 'Hold points' },
    witness_point_count: { type: 'number', min: 0, label: 'Witness points' },
    signed_point_count: { type: 'number', min: 0, label: 'Signed-off points' },
    inspection_tier: { type: 'string', label: 'Inspection tier' },
    ncr_count: { type: 'number', label: 'Non-conformances raised' },
    // written by derive, never by the client
    approved_at: { type: 'string', label: 'Plan approved at' },
    inspections_started_at: { type: 'string', label: 'Inspections started at' },
    completed_at: { type: 'string', label: 'Inspection completed at' },
    closed_at_itp: { type: 'string', label: 'ITP closed at' },
  },

  initial: 'itp_drafted',

  states: {
    itp_drafted: { label: 'ITP drafted', terminal: false, holder: 'contractor', sla: { hours: 24 } },
    under_review: { label: 'Under review', terminal: false, holder: 'engineer', sla: { hours: 48 } },
    itp_approved: { label: 'ITP approved', terminal: false, holder: 'contractor', sla: { days: 7 } },
    inspection_in_progress: { label: 'Inspection in progress', terminal: false, holder: 'engineer', sla: { days: 14 } },
    inspection_complete: { label: 'Inspection complete', terminal: false, holder: 'engineer', sla: { hours: 48 } },
    itp_closed: { label: 'ITP closed', terminal: true, holder: 'none' },
    itp_rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'itp_drafted',
      by: ['contractor', 'operator'],
      actorBecomes: 'contractor',
      label: 'Draft ITP',
      intent: 'primary',
      input: {
        asset_name: { type: 'string', required: true },
        work_package: { type: 'string', required: true },
        discipline: { type: 'string', required: true },
        inspection_class: { type: 'string', required: true },
        spec_ref: { type: 'string' },
        engineer_party: { type: 'party', role: 'engineer' },
      },
      guards: [],
    },
    {
      id: 'submit_for_review',
      from: 'itp_drafted',
      to: 'under_review',
      by: ['contractor'],
      label: 'Submit for review',
      intent: 'primary',
      input: { hold_point_count: { type: 'number', min: 0 }, witness_point_count: { type: 'number', min: 0 } },
      guards: [],
      derive: (f, _at: Instant) => ({ inspection_tier: inspectionTier(f.hold_point_count) }),
    },
    {
      id: 'approve_itp',
      from: 'under_review',
      to: 'itp_approved',
      by: ['engineer'],
      label: 'Approve ITP',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'begin_inspections',
      from: 'itp_approved',
      to: 'inspection_in_progress',
      by: ['engineer', 'contractor'],
      label: 'Begin inspections',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ inspections_started_at: isoUtc(at) }),
    },
    {
      // evidence-gated completion: the engineer signs off the inspection only
      // against a named completeness-evidence ref (the QA record set).
      id: 'complete_inspections',
      from: 'inspection_in_progress',
      to: 'inspection_complete',
      by: ['engineer'],
      label: 'Sign off inspection complete',
      intent: 'primary',
      // completeness_ref is enforced by completenessEvidencePresent, not a
      // required-field check, so the guard's code surfaces on absence.
      input: { completeness_ref: { type: 'string' }, signed_point_count: { type: 'number', min: 0 } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ completed_at: isoUtc(at) }),
    },
    {
      // structural QA gate: the ONLY edge into itp_closed, and it can only fire
      // from inspection_complete — which only complete_inspections reaches. An
      // ITP therefore cannot close before its inspections are signed off. No guard.
      id: 'close_itp',
      from: 'inspection_complete',
      to: 'itp_closed',
      by: ['engineer'],
      label: 'Close ITP',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_itp: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_itp',
      from: ['itp_drafted', 'under_review'],
      to: 'itp_rejected',
      by: ['engineer'],
      label: 'Reject ITP',
      intent: 'destructive',
      requiresReason: ['scope_inadequate', 'hold_points_missing', 'spec_noncompliant', 'competency_lacking'],
      guards: [],
    },
    {
      id: 'raise_ncr',
      from: ['inspection_in_progress'],
      to: 'under_review',
      by: ['engineer'],
      label: 'Raise NCR (return for rework)',
      intent: 'secondary',
      requiresReason: ['nonconformance', 'failed_test', 'defect_found', 'documentation_gap'],
      guards: [],
      derive: (f, _at: Instant) => ({ ncr_count: (typeof f.ncr_count === 'number' ? f.ncr_count : 0) + 1 }),
    },
    {
      id: 'withdraw',
      from: ['itp_drafted', 'under_review', 'itp_approved'],
      to: 'withdrawn',
      by: ['contractor'],
      label: 'Withdraw ITP',
      intent: 'destructive',
      requiresReason: ['work_cancelled', 'superseded', 'no_longer_required'],
      guards: [],
    },
  ],
};
