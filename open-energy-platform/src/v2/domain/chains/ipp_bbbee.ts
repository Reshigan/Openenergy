// ipp_bbbee — IPP B-BBEE verification lifecycle, as data.
//
// Every REIPPPP Implementation Agreement carries annual B-BBEE ownership /
// economic-development commitments; a SANAS-accredited verification agency
// scores the IPP against those commitments and issues (or withholds) the
// compliance certificate. Ported 1:1 from the v1 oe_ipp_bbbee_verification
// state machine (chain-registry-meridian.ts, wave 182) — 12 states, 11
// actions, single driving party (ipp_developer, per v1's counterpartyCol).
//
// Structural honesty (fidelity to v1, not a rewrite):
//  - v1 has no distinct "verification agency" role — every action's roles
//    array is exactly ['admin', 'ipp_developer'], so the agency's own
//    engagement/assessment/scoring steps are recorded BY the IPP developer
//    (or admin, mapped to `operator` per the cp_tracker/ipp_document_control
//    convention), not by a separate party. No agency role is invented here.
//  - declare_non_compliant is reachable from every assessment-stage state
//    (agency_assessment onward) — v1's action list gives it no from-state
//    restriction narrower than "anywhere the agency could flag a failure".
//  - lapse_certificate exits from certificate_issued, not from the terminal
//    bbbee_verified state: v1 lists bbbee_verified as terminal, so a lapse of
//    an already-confirmed certificate is a NEW annual verification txn, not a
//    reopening of this one. What lapses here is a certificate issued but
//    never confirmed within the SLA window (the sla_due_date backstop).
//  - confirm_verified is the one admission edge gated by complianceHaltClear,
//    mirroring how cp_tracker / ccp_assessment block admissions (not exits)
//    under a platform-wide compliance halt; declare_non_compliant and
//    lapse_certificate are never blocked — a verification must always be
//    closeable as failed or lapsed.
//
// settles:false — a B-BBEE verification certifies compliance, it never moves
// money itself (v1's quantumCol is null) (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippBbbee: ChainDecl = {
  key: 'ipp_bbbee',
  noun: 'IPP B-BBEE verification',
  refPrefix: 'BBBEE',
  title: (f) => `BBBEE verification — ${(f.project_ref as string) ?? 'project'} (${(f.verification_year as string) ?? 'year TBC'})`,
  visibility: 'owner',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Implementation Agreement', provision: 'B-BBEE ownership & economic-development commitments', effect: 'requires' },
    { instrument: 'Broad-Based Black Economic Empowerment Act 53 of 2003', provision: 'annual B-BBEE verification & certification', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'operator'],

  fields: {
    project_ref: { type: 'string', required: true, label: 'Project ref' },
    verification_year: { type: 'string', required: true, label: 'Verification year' },
    bbbee_target_pct: { type: 'number', required: true, min: 0, max: 100, label: 'BBBEE target (%)' },
    preliminary_score: { type: 'number', min: 0, max: 100, label: 'Preliminary score (%)' },
    certificate_ref: { type: 'string', label: 'Certificate ref' },
    final_score: { type: 'number', min: 0, max: 100, label: 'Final verified score (%)' },
    bbbee_level: { type: 'string', label: 'BBBEE contribution level (1-8)' },
    // written by derive, never by the client
    triggered_at: { type: 'string', label: 'Verification triggered at' },
    certificate_issued_at: { type: 'string', label: 'Certificate issued at' },
    verified_at: { type: 'string', label: 'Verified at' },
    non_compliant_at: { type: 'string', label: 'Declared non-compliant at' },
    lapsed_at: { type: 'string', label: 'Certificate lapsed at' },
  },

  initial: 'verification_triggered',

  states: {
    verification_triggered: { label: 'Verification triggered', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    documentation_preparation: { label: 'Documentation preparation', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    agency_engagement: { label: 'Agency engagement', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    data_submission: { label: 'Data submission', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    agency_assessment: { label: 'Agency assessment', terminal: false, holder: 'ipp_developer', sla: { days: 15 } },
    preliminary_score_issued: { label: 'Preliminary score issued', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    ipp_review: { label: 'IPP review', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    final_assessment: { label: 'Final assessment', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    certificate_issued: { label: 'Certificate issued', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    bbbee_verified: { label: 'BBBEE verified', terminal: true, holder: 'none' },
    bbbee_non_compliant: { label: 'BBBEE non-compliant', terminal: true, holder: 'none' },
    certificate_lapsed: { label: 'Certificate lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'verification_triggered',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Trigger verification',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        verification_year: { type: 'string', required: true },
        bbbee_target_pct: { type: 'number', required: true, min: 0, max: 100 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ triggered_at: isoUtc(at) }),
    },
    {
      id: 'prepare_documentation',
      from: 'verification_triggered',
      to: 'documentation_preparation',
      by: ['ipp_developer', 'operator'],
      label: 'Prepare documentation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'engage_agency',
      from: 'documentation_preparation',
      to: 'agency_engagement',
      by: ['ipp_developer', 'operator'],
      label: 'Engage agency',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_data',
      from: 'agency_engagement',
      to: 'data_submission',
      by: ['ipp_developer', 'operator'],
      label: 'Submit data',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'commence_assessment',
      from: 'data_submission',
      to: 'agency_assessment',
      by: ['ipp_developer', 'operator'],
      label: 'Commence assessment',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'issue_preliminary_score',
      from: 'agency_assessment',
      to: 'preliminary_score_issued',
      by: ['ipp_developer', 'operator'],
      label: 'Issue preliminary score',
      intent: 'primary',
      input: { preliminary_score: { type: 'number', min: 0, max: 100 } },
      guards: [],
    },
    {
      id: 'commence_ipp_review',
      from: 'preliminary_score_issued',
      to: 'ipp_review',
      by: ['ipp_developer', 'operator'],
      label: 'Commence IPP review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'commence_final_assessment',
      from: 'ipp_review',
      to: 'final_assessment',
      by: ['ipp_developer', 'operator'],
      label: 'Commence final assessment',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'issue_certificate',
      from: 'final_assessment',
      to: 'certificate_issued',
      by: ['ipp_developer', 'operator'],
      label: 'Issue certificate',
      intent: 'primary',
      input: {
        certificate_ref: { type: 'string', required: true },
        final_score: { type: 'number', min: 0, max: 100 },
        bbbee_level: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ certificate_issued_at: isoUtc(at) }),
    },
    {
      // the one admission edge — blocked under a platform-wide compliance halt,
      // mirroring cp_tracker's satisfy_cp/waive_cp disposition.
      id: 'confirm_verified',
      from: 'certificate_issued',
      to: 'bbbee_verified',
      by: ['ipp_developer', 'operator'],
      label: 'Confirm verified',
      intent: 'primary',
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      // never blocked by a halt — a verification must always be closeable as
      // failed once the agency (or IPP review) flags non-compliance.
      id: 'declare_non_compliant',
      from: ['agency_assessment', 'preliminary_score_issued', 'ipp_review', 'final_assessment'],
      to: 'bbbee_non_compliant',
      by: ['ipp_developer', 'operator'],
      label: 'Declare non-compliant',
      intent: 'destructive',
      requiresReason: ['target_not_met', 'documentation_deficient', 'agency_flagged_non_compliance', 'ownership_structure_ineligible'],
      guards: [],
      derive: (_f, at: Instant) => ({ non_compliant_at: isoUtc(at) }),
    },
    {
      // timer-fired backstop (see timers below): a certificate issued but never
      // confirmed within the SLA window lapses.
      id: 'lapse_certificate',
      from: 'certificate_issued',
      to: 'certificate_lapsed',
      by: ['ipp_developer', 'operator', 'system'],
      label: 'Lapse certificate',
      intent: 'destructive',
      requiresReason: ['sla_deadline_missed', 'certificate_expired', 'compliance_lapsed'],
      guards: [],
      derive: (_f, at: Instant) => ({ lapsed_at: isoUtc(at) }),
    },
  ],

  // a certificate issued but never confirmed within 30 days lapses (v1's
  // sla_due_date backstop, per the ipp_document_control resubmission-timer
  // pattern).
  timers: [{ onState: 'certificate_issued', after: { days: 30 }, fire: 'lapse_certificate', kind: 'time_bar', reason: 'sla_deadline_missed' }],
};
