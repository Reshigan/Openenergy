// ipp_lcr — IPP Local Content & Socio-Economic Development (SED) reporting
// lifecycle, as data.
//
// Every REIPPPP Implementation Agreement carries quarterly local-content (LC)
// and SED spend commitments; the IPP collects and internally verifies its own
// spend data, lodges a report, and the platform runs it through a
// completeness check and (where clarification is needed) a technical
// assessment before a compliance outcome is confirmed. Ported 1:1 from the v1
// oe_ipp_lc_reports state machine (chain-registry-meridian.ts, wave 174) — 12
// states, 11 actions, single driving party (ipp_developer, per v1's
// counterpartyCol).
//
// Structural honesty (fidelity to v1, not a rewrite):
//  - v1 has no distinct "regulator reviewer" role — every action's roles
//    array is exactly ['admin', 'ipp_developer'], so the completeness check
//    and technical assessment are recorded BY the IPP developer (or admin,
//    mapped to `operator`, per the ipp_bbbee/ipp_document_control
//    convention), not by a separate party. No reviewer role is invented here.
//  - commence_technical_assessment is reachable from BOTH completeness_check
//    (clarification wasn't needed) and clarification_submitted (it was) — v1
//    lists request_clarification/submit_clarification as an optional detour,
//    not a mandatory gate, and gives commence_technical_assessment no
//    from-state restriction narrower than "after completeness is settled".
//  - the three closing actions (confirm_compliant, confirm_non_compliance,
//    grant_conditional_compliance) all fire from technical_assessment only —
//    v1 lists them consecutively with no separate outcome-specific state.
//  - grant_conditional_compliance carries requiresReason: it is a qualified
//    close (conditions attached), not the clean pass confirm_compliant is —
//    mirroring how ipp_evm's reject_reforecast demands a reason for a
//    qualified/negative outcome even though v1's action shorthand never
//    surfaces field-level detail for any edge (confirmed against the parallel
//    ipp_bbbee block, whose declare_non_compliant also gets requiresReason
//    here despite the same shorthand).
//
// No SLA time-bar timer: v1's sla_due_date exists but there is no dedicated
// "lapsed" terminal state to fire into (unlike ipp_bbbee's certificate_lapsed)
// — inventing one would add a compliance outcome v1 never names, so the SLA
// stays a display-only countdown for now.
//
// settles:false — an LC/SED report certifies compliance against a spend
// commitment; it never moves money itself (R-S5-1). The ZAR figure it
// carries (sed_achieved_zar) is a reported fact, settled (if at all) by
// whatever payment chain funded the spend.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippLcr: ChainDecl = {
  key: 'ipp_lcr',
  noun: 'IPP local content & SED report',
  refPrefix: 'LCR',
  title: (f) => `LC/SED report — ${(f.project_ref as string) ?? 'project'} (${(f.report_quarter as string) ?? 'quarter TBC'})`,
  visibility: 'owner',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Implementation Agreement', provision: 'local content & socio-economic development (SED) spend commitments', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'generation licence compliance reporting', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'operator'],

  fields: {
    project_ref: { type: 'string', required: true, label: 'Project ref' },
    report_quarter: { type: 'string', required: true, label: 'Report quarter' },
    lc_commitment_pct: { type: 'number', required: true, min: 0, max: 100, label: 'LC commitment (%)' },
    lc_content_type: { type: 'string', required: true, label: 'LC content type (goods/services/labour/sed/enterprise_dev/ownership)' },
    lc_achieved_pct: { type: 'number', min: 0, max: 100, label: 'LC achieved (%)' },
    sed_achieved_zar: { type: 'number', min: 0, label: 'SED achieved (ZAR)' },
    clarification_response: { type: 'string', label: 'Clarification response' },
    compliance_conditions: { type: 'string', label: 'Conditions attached (conditional compliance)' },
    // written by derive, never by the client
    collection_commenced_at: { type: 'string', label: 'Collection commenced at' },
    report_submitted_at: { type: 'string', label: 'Report submitted at' },
    clarification_requested_at: { type: 'string', label: 'Clarification requested at' },
    technical_assessment_commenced_at: { type: 'string', label: 'Technical assessment commenced at' },
    compliant_at: { type: 'string', label: 'Confirmed compliant at' },
    non_compliant_at: { type: 'string', label: 'Confirmed non-compliant at' },
    conditional_compliance_at: { type: 'string', label: 'Conditional compliance granted at' },
  },

  initial: 'period_open',

  states: {
    period_open: { label: 'Reporting period open', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    data_collection: { label: 'Data collection', terminal: false, holder: 'ipp_developer', sla: { days: 15 } },
    internal_verification: { label: 'Internal verification', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    report_preparation: { label: 'Report preparation', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    report_submitted: { label: 'Report submitted', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    completeness_check: { label: 'Completeness check', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    clarification_requested: { label: 'Clarification requested', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    clarification_submitted: { label: 'Clarification submitted', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    technical_assessment: { label: 'Technical assessment', terminal: false, holder: 'ipp_developer', sla: { days: 15 } },
    compliant: { label: 'Compliant', terminal: true, holder: 'none' },
    non_compliant: { label: 'Non-compliant', terminal: true, holder: 'none' },
    conditional_compliance: { label: 'Conditional compliance', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'period_open',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Open LC/SED report',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        report_quarter: { type: 'string', required: true },
        lc_commitment_pct: { type: 'number', required: true, min: 0, max: 100 },
        lc_content_type: { type: 'string', required: true },
      },
      guards: [],
    },
    {
      id: 'commence_collection',
      from: 'period_open',
      to: 'data_collection',
      by: ['ipp_developer', 'operator'],
      label: 'Commence collection',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ collection_commenced_at: isoUtc(at) }),
    },
    {
      id: 'submit_for_verification',
      from: 'data_collection',
      to: 'internal_verification',
      by: ['ipp_developer', 'operator'],
      label: 'Submit for verification',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'prepare_report',
      from: 'internal_verification',
      to: 'report_preparation',
      by: ['ipp_developer', 'operator'],
      label: 'Prepare report',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_report',
      from: 'report_preparation',
      to: 'report_submitted',
      by: ['ipp_developer', 'operator'],
      label: 'Submit report',
      intent: 'primary',
      input: {
        lc_achieved_pct: { type: 'number', min: 0, max: 100 },
        sed_achieved_zar: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ report_submitted_at: isoUtc(at) }),
    },
    {
      id: 'accept_for_review',
      from: 'report_submitted',
      to: 'completeness_check',
      by: ['ipp_developer', 'operator'],
      label: 'Accept for review',
      intent: 'primary',
      guards: [],
    },
    {
      // optional detour, not a mandatory gate — commence_technical_assessment
      // can also fire straight off completeness_check (see below).
      id: 'request_clarification',
      from: 'completeness_check',
      to: 'clarification_requested',
      by: ['ipp_developer', 'operator'],
      label: 'Request clarification',
      intent: 'secondary',
      requiresReason: ['data_gap', 'unsupported_figures', 'methodology_query', 'evidence_missing'],
      guards: [],
      derive: (_f, at: Instant) => ({ clarification_requested_at: isoUtc(at) }),
    },
    {
      id: 'submit_clarification',
      from: 'clarification_requested',
      to: 'clarification_submitted',
      by: ['ipp_developer', 'operator'],
      label: 'Submit clarification',
      intent: 'primary',
      input: { clarification_response: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'commence_technical_assessment',
      from: ['completeness_check', 'clarification_submitted'],
      to: 'technical_assessment',
      by: ['ipp_developer', 'operator'],
      label: 'Commence technical assessment',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ technical_assessment_commenced_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'confirm_compliant',
      from: 'technical_assessment',
      to: 'compliant',
      by: ['ipp_developer', 'operator'],
      label: 'Confirm compliant',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ compliant_at: isoUtc(at) }),
    },
    {
      id: 'confirm_non_compliance',
      from: 'technical_assessment',
      to: 'non_compliant',
      by: ['ipp_developer', 'operator'],
      label: 'Confirm non-compliance',
      intent: 'destructive',
      requiresReason: ['commitment_not_met', 'documentation_deficient', 'sed_spend_shortfall', 'methodology_rejected'],
      guards: [],
      derive: (_f, at: Instant) => ({ non_compliant_at: isoUtc(at) }),
    },
    {
      id: 'grant_conditional_compliance',
      from: 'technical_assessment',
      to: 'conditional_compliance',
      by: ['ipp_developer', 'operator'],
      label: 'Grant conditional compliance',
      intent: 'secondary',
      requiresReason: ['remediation_plan_accepted', 'partial_shortfall', 'catch_up_commitment'],
      input: { compliance_conditions: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ conditional_compliance_at: isoUtc(at) }),
    },
  ],
};
