// ═══════════════════════════════════════════════════════════════════════════
// Wave 195 — Lender ESAP Compliance Monitoring
//
// Environmental and Social Action Plan (ESAP) monitoring is a mandatory
// obligation under IFC Performance Standards 2012, Equator Principles 4,
// and SARB prudential guidance for project finance lending to energy
// infrastructure in South Africa.  The ESAP is a binding annex to the loan
// agreement; lenders must verify that IPP developers meet E&S commitments
// throughout the project lifecycle — from construction through full
// operations, and sometimes through decommissioning.
//
// Under Equator Principles 4 (EP4, 2020), designated-country projects in
// Category A and B must:
//   - Submit periodic ESAP implementation reports to their lender's
//     Environmental & Social Monitor (ES Monitor)
//   - Allow on-site verification visits at least annually for Category A,
//     biennially for Category B
//   - Notify lenders within 30 days of a material non-compliance event
//   - Produce an action plan for any Major Finding within 30 days of the
//     lender's review, with remediation completed within the agreed plan
//
// Under IFC Performance Standards (PS 2012), the borrower must:
//   - Maintain an ESAP that remains current and reflects any changing
//     project risks
//   - Report E&S performance to the IFC-appointed Independent E&S Advisor
//     at the frequency stipulated in the loan agreement
//
// Under OHSA s8 (Occupational Health and Safety Act 85/1993), every
// employer (including project company operator) must provide and maintain
// a working environment that is safe and without risk to health — the ESAP
// typically captures the H&S commitments that feed this obligation.
//
// SARB prudential expectations (BA 2017-01 and subsequent guidance) require
// SA banks providing project finance to demonstrate ongoing monitoring of
// environmental, social, and governance (ESG) risks in their loan book.
// Failure to maintain adequate ESAP monitoring records is treated as a
// credit risk management deficiency.
//
// Workflow overview
// ─────────────────
// The lender's ES Monitor opens a monitoring period (typically annual or
// semi-annual) by opening a new record.  The IPP developer submits
// operational E&S data.  The ES Monitor carries out a site verification
// visit.  A draft monitoring report is prepared.  The lender reviews the
// draft.  Two outcomes emerge:
//
//   Accept path  → minor_findings → accepted (clean close)
//   Major path   → major_findings → action_plan_required
//                → action_plan_submitted → verified (clean close)
//
// If the IPP developer refuses to remediate or the lender cannot confirm
// remediation, breach_declared is entered — triggering a loan covenant
// breach event, which feeds Wave 38 (Lender Covenant Certificate) and
// Wave 45 (Lender Loan Default & Enforcement).
//
// SLA polarity — INVERTED (higher commitment tier = MORE time):
//   systemic    90 days — systemic exposure to E&S risk (Category A+);
//                         SARB large-exposure + IFC apex lender; maximum
//                         scrutiny; complex multi-site, multi-PS verification
//   major       60 days — Category A single-project; EP4 mandatory IE;
//                         includes biodiversity offset verification, FPIC
//   significant 45 days — Category B / EP4 basic reporting; limited
//                         biodiversity exposure; routine H&S verification
//   minor       30 days — Category C / small embedded generation;
//                         no IFC PS beyond PS1 and PS2
//   routine     21 days — internal monitoring update; below Category C;
//                         admin-initiated; schedule 2 exemption review
//
// Regulator crossings:
//   breach_declared → ALL tiers (SARB credit-risk notification; NERSA
//                      licence condition breach; DFFE NEMA s30 where
//                      environmental non-compliance is involved)
//   major_findings  → major + systemic (EP4 / IFC PS mandatory disclosure
//                      to DFI; SARB prudential filing)
//   sla_breach      → major + systemic (SARB credit-risk; DFI loan covenant)
//
// Entity prefix: esap_compliance
// Event prefix:  esap_evt_
//
// Mounted at /api/esap-compliance.
// ═══════════════════════════════════════════════════════════════════════════

export type EsapComplianceStatus =
  | 'monitoring_period_open'
  | 'data_collection'
  | 'site_verification'
  | 'draft_report'
  | 'lender_review'
  | 'minor_findings'
  | 'accepted'               // TERMINAL + (clean close)
  | 'major_findings'
  | 'action_plan_required'
  | 'action_plan_submitted'
  | 'verified'               // TERMINAL + (post-remediation close)
  | 'breach_declared';       // TERMINAL - (covenant breach)

export type EsapComplianceAction =
  | 'open_monitoring_period'
  | 'submit_data'
  | 'verify_site'
  | 'prepare_draft'
  | 'complete_lender_review'
  | 'accept_report'
  | 'flag_major_findings'
  | 'submit_action_plan'
  | 'verify_remediation'
  | 'declare_breach';

// INVERTED SLA — higher commitment = MORE time (deeper scrutiny required)
export type CommitmentTier = 'systemic' | 'major' | 'significant' | 'minor' | 'routine';

// ─── SLA derivation (keyed on commitment_tier; INVERTED polarity) ─────────────

export const SLA_DAYS: Record<CommitmentTier, number> = {
  systemic:    90,
  major:       60,
  significant: 45,
  minor:       30,
  routine:     21,
};

export function deriveEsapSla(tier: CommitmentTier): number {
  return SLA_DAYS[tier];
}

// ─── Hard terminals ───────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<EsapComplianceStatus>([
  'accepted',
  'verified',
  'breach_declared',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<EsapComplianceAction, { from: EsapComplianceStatus[] }> = {
  open_monitoring_period: { from: ['monitoring_period_open'] },
  submit_data:            { from: ['data_collection'] },
  verify_site:            { from: ['site_verification'] },
  prepare_draft:          { from: ['draft_report'] },
  complete_lender_review: { from: ['lender_review'] },
  accept_report:          { from: ['minor_findings'] },
  flag_major_findings:    { from: ['lender_review'] },
  submit_action_plan:     { from: ['action_plan_required'] },
  verify_remediation:     { from: ['action_plan_submitted'] },
  declare_breach:         {
    from: [
      'monitoring_period_open', 'data_collection', 'site_verification',
      'draft_report', 'lender_review', 'minor_findings',
      'major_findings', 'action_plan_required', 'action_plan_submitted',
    ],
  },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<EsapComplianceAction, EsapComplianceStatus> = {
  open_monitoring_period: 'data_collection',
  submit_data:            'site_verification',
  verify_site:            'draft_report',
  prepare_draft:          'lender_review',
  complete_lender_review: 'minor_findings',
  accept_report:          'accepted',
  flag_major_findings:    'major_findings',
  submit_action_plan:     'action_plan_submitted',
  verify_remediation:     'verified',
  declare_breach:         'breach_declared',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const ALL_TIERS: CommitmentTier[]      = ['systemic', 'major', 'significant', 'minor', 'routine'];
const MAJOR_PLUS: CommitmentTier[]     = ['systemic', 'major'];

export function crossesIntoRegulator(
  action: EsapComplianceAction,
  tier: CommitmentTier,
): boolean {
  switch (action) {
    case 'declare_breach':    return ALL_TIERS.includes(tier);
    case 'flag_major_findings': return MAJOR_PLUS.includes(tier);
    default:                  return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: CommitmentTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
