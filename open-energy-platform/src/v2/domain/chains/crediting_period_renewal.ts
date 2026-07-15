// crediting_period_renewal — W56 crediting-period renewal & baseline
// reassessment (Verra/Gold Standard/Article 6.4 style registries).
//
// A carbon project's registered crediting period nears expiry. The proponent
// files a renewal application; the registry screens it for completeness
// before the baseline reassessment ever opens; an incomplete filing is
// bounced back for revision and re-enters the SAME completeness gate on
// resubmission — it never gets a shortcut around the screen. Only a complete
// filing proceeds through baseline reassessment → additionality retest → VVB
// validation → standard review, where the registry either renews the period
// on the reassessed baseline or refuses it.
//
// Structural honesty (no invented guards):
//  - `renew` and `refuse` are ONLY reachable from `standard_review`, and the
//    ONLY path into `standard_review` is `validate`, which itself is only
//    reachable after `complete_additionality` and `complete_baseline`. So a
//    period can NEVER be renewed on a baseline that was never reassessed, or
//    without a VVB validation opinion on file — the state graph enforces the
//    full evidence chain, no guard needed.
//  - `check_completeness` is guarded by completenessEvidencePresent: a
//    completeness screen needs a named evidence ref, not just a rubber stamp.
//  - `submit_application` is guarded by complianceHaltClear: a platform-wide
//    compliance halt (POPIA / NERSA directive) blocks new renewal filings,
//    but never blocks refuse/withdraw/lapse (de-risking exits stay open).
//
// Consolidated evidence fields: v1 carried a paired "_ref" + "_basis" evidence
// field per action; both meant "the supporting document for this step", so
// this decl keeps one evidence field per transition instead of two synonyms.
//
// NO claim key. A renewal is a periodic reassessment against a serial project
// ref, not a one-time consumption of a serial/asset range.
//
// settles:false — a crediting-period renewal is a registry control decision,
// never a payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const creditingPeriodRenewal: ChainDecl = {
  key: 'crediting_period_renewal',
  noun: 'Crediting-period renewal application',
  refPrefix: 'CPR',
  title: (f) => `${(f.project_name as string) ?? 'unnamed project'} — crediting period #${(f.crediting_period_number as number) ?? '?'} renewal`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act 2019', provision: 's13 offset eligibility', effect: 'requires' },
    { instrument: 'Verra VCS Standard', provision: 'crediting period renewal & baseline reassessment', effect: 'requires' },
  ],
  roles: ['admin', 'carbon_fund'],

  fields: {
    project_name: { type: 'string', required: true, label: 'Project name' },
    application_ref: { type: 'string', label: 'Application ref' },
    methodology_id: { type: 'string', label: 'Methodology (e.g. VM0042)' },
    vvb_name: { type: 'string', label: 'VVB name' },
    crediting_period_number: { type: 'number', min: 1, label: 'Crediting period #' },
    annual_issuance_tco2e: { type: 'number', min: 0, label: 'Annual issuance (tCO2e)' },
    submission_basis: { type: 'string', label: 'Submission basis / evidence' },
    completeness_ref: { type: 'string', label: 'Completeness-check evidence ref' },
    revision_basis: { type: 'string', label: 'Revision-request basis / evidence' },
    resubmission_ref: { type: 'string', label: 'Resubmission ref' },
    baseline_ref: { type: 'string', label: 'Baseline reassessment ref' },
    revised_baseline_tco2e: { type: 'number', min: 0, label: 'Revised baseline (tCO2e)' },
    additionality_ref: { type: 'string', label: 'Additionality retest ref' },
    validation_ref: { type: 'string', label: 'VVB validation ref' },
    decision_ref: { type: 'string', label: 'Decision ref' },
    renewed_period_start: { type: 'string', label: 'Renewed period start (date)' },
    renewed_period_end: { type: 'string', label: 'Renewed period end (date)' },
    renewal_summary: { type: 'string', label: 'Renewal summary' },
    refusal_ref: { type: 'string', label: 'Refusal ref' },
    withdrawal_basis: { type: 'string', label: 'Withdrawal basis / evidence' },
    lapse_basis: { type: 'string', label: 'Lapse basis / evidence' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted at' },
    completeness_checked_at: { type: 'string', label: 'Completeness checked at' },
    revision_requested_at: { type: 'string', label: 'Revision requested at' },
    resubmitted_at: { type: 'string', label: 'Resubmitted at' },
    baseline_begun_at: { type: 'string', label: 'Baseline reassessment begun at' },
    baseline_completed_at: { type: 'string', label: 'Baseline reassessment completed at' },
    additionality_completed_at: { type: 'string', label: 'Additionality retest completed at' },
    validated_at: { type: 'string', label: 'VVB validated at' },
    renewed_at: { type: 'string', label: 'Renewed at' },
    refused_at: { type: 'string', label: 'Refused at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
    lapsed_at: { type: 'string', label: 'Lapsed at' },
  },

  initial: 'renewal_due',

  states: {
    renewal_due: { label: 'Renewal due', terminal: false, holder: 'carbon_fund', sla: { days: 60 } },
    application_submitted: { label: 'Application submitted', terminal: false, holder: 'admin', sla: { days: 14 } },
    completeness_check: { label: 'Completeness check', terminal: false, holder: 'admin', sla: { days: 14 } },
    revision_requested: { label: 'Revision requested', terminal: false, holder: 'carbon_fund', sla: { days: 30 } },
    baseline_reassessment: { label: 'Baseline reassessment', terminal: false, holder: 'carbon_fund', sla: { days: 45 } },
    additionality_retest: { label: 'Additionality retest', terminal: false, holder: 'carbon_fund', sla: { days: 30 } },
    vvb_validation: { label: 'VVB validation', terminal: false, holder: 'carbon_fund', sla: { days: 45 } },
    standard_review: { label: 'Standard review', terminal: false, holder: 'admin', sla: { days: 30 } },
    renewed: { label: 'Renewed', terminal: true, holder: 'none' },
    refused: { label: 'Refused', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      // a crediting period nearing expiry is flagged onto the platform before
      // any application exists — the real-world entry point v1's `lapse`
      // action targets when nothing is ever filed.
      id: 'open',
      from: '@new',
      to: 'renewal_due',
      by: ['admin', 'carbon_fund'],
      actorBecomes: 'carbon_fund',
      label: 'Flag renewal due',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        crediting_period_number: { type: 'number', min: 1 },
        vvb_name: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'submit_application',
      from: 'renewal_due',
      to: 'application_submitted',
      by: ['admin', 'carbon_fund'],
      label: 'Submit application',
      intent: 'primary',
      input: {
        application_ref: { type: 'string' },
        methodology_id: { type: 'string' },
        annual_issuance_tco2e: { type: 'number', min: 0 },
        submission_basis: { type: 'string' },
      },
      // no new filings while the platform is under a compliance halt.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      // screens the filing before the baseline reassessment ever opens.
      id: 'check_completeness',
      from: 'application_submitted',
      to: 'completeness_check',
      by: ['admin', 'carbon_fund'],
      label: 'Check completeness',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ completeness_checked_at: isoUtc(at) }),
    },
    {
      id: 'request_revision',
      from: ['application_submitted', 'completeness_check'],
      to: 'revision_requested',
      by: ['admin', 'carbon_fund'],
      label: 'Request revision',
      intent: 'secondary',
      requiresReason: ['missing_monitoring_data', 'incomplete_methodology_evidence', 'missing_vvb_name', 'other'],
      input: { revision_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ revision_requested_at: isoUtc(at) }),
    },
    {
      // resubmission re-enters the SAME completeness gate — no shortcut.
      id: 'resubmit',
      from: 'revision_requested',
      to: 'completeness_check',
      by: ['admin', 'carbon_fund'],
      label: 'Resubmit application',
      intent: 'primary',
      input: { resubmission_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ resubmitted_at: isoUtc(at) }),
    },
    {
      id: 'begin_baseline',
      from: 'completeness_check',
      to: 'baseline_reassessment',
      by: ['admin', 'carbon_fund'],
      label: 'Begin baseline reassessment',
      intent: 'primary',
      input: { baseline_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ baseline_begun_at: isoUtc(at) }),
    },
    {
      id: 'complete_baseline',
      from: 'baseline_reassessment',
      to: 'additionality_retest',
      by: ['admin', 'carbon_fund'],
      label: 'Complete baseline reassessment',
      intent: 'primary',
      input: { revised_baseline_tco2e: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ baseline_completed_at: isoUtc(at) }),
    },
    {
      id: 'complete_additionality',
      from: 'additionality_retest',
      to: 'vvb_validation',
      by: ['admin', 'carbon_fund'],
      label: 'Complete additionality retest',
      intent: 'primary',
      input: { additionality_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ additionality_completed_at: isoUtc(at) }),
    },
    {
      // structural gate: the ONLY door into standard_review, so renew/refuse
      // can never fire without a recorded VVB validation opinion.
      id: 'validate',
      from: 'vvb_validation',
      to: 'standard_review',
      by: ['admin', 'carbon_fund'],
      label: 'Validate (VVB)',
      intent: 'primary',
      input: { validation_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ validated_at: isoUtc(at) }),
    },
    {
      id: 'renew',
      from: 'standard_review',
      to: 'renewed',
      by: ['admin', 'carbon_fund'],
      label: 'Renew crediting period',
      intent: 'primary',
      input: {
        decision_ref: { type: 'string' },
        renewed_period_start: { type: 'string' },
        renewed_period_end: { type: 'string' },
        revised_baseline_tco2e: { type: 'number', min: 0 },
        renewal_summary: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ renewed_at: isoUtc(at) }),
    },
    {
      id: 'refuse',
      from: 'standard_review',
      to: 'refused',
      by: ['admin', 'carbon_fund'],
      label: 'Refuse renewal',
      intent: 'destructive',
      requiresReason: ['revalidation_failed', 'baseline_invalid', 'additionality_lost', 'methodology_noncompliance'],
      input: { refusal_ref: { type: 'string' }, decision_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ refused_at: isoUtc(at) }),
    },

    // --- exits ------------------------------------------------------------
    {
      id: 'withdraw',
      from: [
        'application_submitted', 'completeness_check', 'revision_requested',
        'baseline_reassessment', 'additionality_retest', 'vvb_validation', 'standard_review',
      ],
      to: 'withdrawn',
      by: ['admin', 'carbon_fund'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['proponent_withdrawal', 'project_retired', 'not_pursuing_renewal'],
      input: { withdrawal_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
    {
      id: 'lapse',
      from: 'renewal_due',
      to: 'lapsed',
      by: ['admin', 'carbon_fund'],
      label: 'Lapse renewal',
      intent: 'destructive',
      requiresReason: ['window_expired', 'no_application_filed'],
      input: { lapse_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ lapsed_at: isoUtc(at) }),
    },
  ],
};
