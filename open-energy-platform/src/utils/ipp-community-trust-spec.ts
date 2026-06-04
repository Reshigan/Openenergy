// ═══════════════════════════════════════════════════════════════════════════
// Wave 164 — IPP Community Trust Annual Disbursement Report spec
//
// REIPPPP Schedule 3B (Community Equity & Socio-Economic Development) +
// Companies Act 71/2008 (trust company compliance) + DTIC B-BBEE verification
// requirements. Every REIPPPP project must transfer 2.5–5% equity to a
// community trust whose beneficiaries are members of the host community.
// The IPP is required to submit an annual report to DMRE and DTIC confirming
// disbursements, trust governance, and beneficiary upliftment spend.
//
// Mounted at /api/ipp-community-trust.
//
// INVERTED SLA: larger disbursement quantum → more DTIC scrutiny → MORE time.
//
// 12-state chain:
//   report_due → data_preparation → trustee_review → report_drafted
//   → ipp_review → submitted_to_dtic → dtic_review → queries_raised
//   → responses_submitted → report_accepted (terminal)
//   → report_rejected (terminal)
//   → appeal_filed → appeal_determined (terminal)
//
// Signature reportability:
//   reject_report     → EVERY tier (non-compliance always reportable)
//   accept_report     → major + material (large disbursements NERSA disclosure)
//   determine_appeal  → EVERY tier
// ═══════════════════════════════════════════════════════════════════════════

export type CommunityTrustStatus =
  | 'report_due'
  | 'data_preparation'
  | 'trustee_review'
  | 'report_drafted'
  | 'ipp_review'
  | 'submitted_to_dtic'
  | 'dtic_review'
  | 'queries_raised'
  | 'responses_submitted'
  | 'report_accepted'     // TERMINAL
  | 'report_rejected'     // TERMINAL
  | 'appeal_filed'
  | 'appeal_determined';  // TERMINAL

export type CommunityTrustAction =
  | 'commence_data_preparation'
  | 'submit_to_trustees'
  | 'complete_trustee_review'
  | 'complete_ipp_review'
  | 'submit_to_dtic'
  | 'commence_dtic_review'
  | 'raise_queries'
  | 'submit_responses'
  | 'accept_report'
  | 'reject_report'
  | 'file_appeal'
  | 'determine_appeal';

export type DisbursementTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

export type TrustCategory =
  | 'equity_dividend'
  | 'socio_economic_development'
  | 'enterprise_development'
  | 'education_bursary'
  | 'infrastructure_upliftment';

// ─── Tier derivation (keyed on disbursement_amount_zar) ──────────────────────

export function deriveDisbursementTier(disbursement_amount_zar: number): DisbursementTier {
  if (disbursement_amount_zar < 1_000_000)    return 'minor';
  if (disbursement_amount_zar < 5_000_000)    return 'moderate';
  if (disbursement_amount_zar < 20_000_000)   return 'significant';
  if (disbursement_amount_zar < 100_000_000)  return 'major';
  return 'material';
}

// ─── INVERTED SLA (larger disbursement → more scrutiny → more time) ──────────

export const SLA_DAYS: Record<DisbursementTier, number> = {
  minor:       21,
  moderate:    30,
  significant: 45,
  major:       60,
  material:    90,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<CommunityTrustStatus>([
  'report_accepted',
  'report_rejected',
  'appeal_determined',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  CommunityTrustAction,
  { from: CommunityTrustStatus[] }
> = {
  commence_data_preparation: { from: ['report_due'] },
  submit_to_trustees:        { from: ['data_preparation'] },
  complete_trustee_review:   { from: ['trustee_review'] },
  complete_ipp_review:       { from: ['report_drafted', 'ipp_review'] },
  submit_to_dtic:            { from: ['ipp_review'] },
  commence_dtic_review:      { from: ['submitted_to_dtic'] },
  raise_queries:             { from: ['dtic_review'] },
  submit_responses:          { from: ['queries_raised'] },
  accept_report:             { from: ['dtic_review', 'responses_submitted'] },
  reject_report:             { from: ['dtic_review', 'responses_submitted'] },
  file_appeal:               { from: ['report_rejected'] },
  determine_appeal:          { from: ['appeal_filed'] },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: DisbursementTier[] = ['minor', 'moderate', 'significant', 'major', 'material'];
const MAJOR_PLUS: DisbursementTier[] = ['major', 'material'];

export function crossesIntoRegulator(
  action: CommunityTrustAction,
  tier: DisbursementTier,
): boolean {
  switch (action) {
    case 'reject_report':    return ALL_TIERS.includes(tier);
    case 'accept_report':    return MAJOR_PLUS.includes(tier);
    case 'determine_appeal': return ALL_TIERS.includes(tier);
    default:                 return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: DisbursementTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
