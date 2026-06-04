// ═══════════════════════════════════════════════════════════════════════════
// Wave 182 — IPP REIPPPP BBBEE Annual Compliance Verification
//
// REIPPPP Bid Conditions require IPPs to maintain minimum BBBEE (Broad-Based
// Black Economic Empowerment) ownership levels and overall scores annually.
// An independent BBBEE verification agency accredited by the South African
// National Accreditation System (SANAS) or the Independent Regulatory Board
// for Auditors (IRBA) must issue a valid BBBEE Verification Certificate.
//
// Failure to maintain minimum ownership (typically 26% black equity for
// Ownership element) or minimum BBBEE level (typically Level 4 or better)
// triggers a DMRE Default Notice under the PPA Bid Conditions. Loss of BBBEE
// status is a compliance event reportable to the DMRE.
//
// Mounted at /api/ipp-bbbee-verification.
//
// URGENT SLA: higher BBBEE equity target = more complex ownership verification
// = greater DMRE scrutiny = TIGHTER deadline to renew before certificate lapses.
// Exemplary projects (>75% black equity) face the most stringent annual review.
//
// 12-state chain:
//   verification_triggered → documentation_preparation → agency_engagement
//   → data_submission → agency_assessment → preliminary_score_issued
//   → ipp_review → final_assessment → certificate_issued
//   → bbbee_verified     (terminal)
//   → bbbee_non_compliant (terminal)
//   → certificate_lapsed  (terminal)
//
// Signature reportability:
//   declare_non_compliant → ALL tiers (BBBEE failure = mandatory DMRE default)
//   lapse_certificate     → ALL tiers (lapse = immediate PPA compliance event)
//   confirm_verified      → majority + transformative + exemplary (high-ownership
//                            verifications feed DMRE national BBBEE register)
// ═══════════════════════════════════════════════════════════════════════════

export type BbbeeStatus =
  | 'verification_triggered'
  | 'documentation_preparation'
  | 'agency_engagement'
  | 'data_submission'
  | 'agency_assessment'
  | 'preliminary_score_issued'
  | 'ipp_review'
  | 'final_assessment'
  | 'certificate_issued'
  | 'bbbee_verified'       // TERMINAL
  | 'bbbee_non_compliant'  // TERMINAL
  | 'certificate_lapsed';  // TERMINAL

export type BbbeeAction =
  | 'prepare_documentation'
  | 'engage_agency'
  | 'submit_data'
  | 'commence_assessment'
  | 'issue_preliminary_score'
  | 'commence_ipp_review'
  | 'commence_final_assessment'
  | 'issue_certificate'
  | 'confirm_verified'
  | 'declare_non_compliant'
  | 'lapse_certificate';

// URGENT SLA — BBBEE equity target tier (higher target = tighter deadline)
export type BbbeeEquityTier =
  | 'standard'       // < 26% black equity required
  | 'enhanced'       // 26–40%
  | 'majority'       // 40–51%
  | 'transformative' // 51–75%
  | 'exemplary';     // > 75%

// BBBEE verification agency accreditation body
export type BbbeeVerificationAgency =
  | 'sanas_accredited'  // SANAS-accredited verification agency
  | 'irba_accredited'   // IRBA-registered auditor
  | 'bvsa'              // BBBEE Verification South Africa
  | 'other_accredited'; // Other SANAS/IRBA accredited body

// ─── Tier derivation (keyed on bbbee_target_pct) ────────────────────────────

export function deriveBbbeeEquityTier(bbbee_target_pct: number): BbbeeEquityTier {
  if (bbbee_target_pct < 26) return 'standard';
  if (bbbee_target_pct < 40) return 'enhanced';
  if (bbbee_target_pct < 51) return 'majority';
  if (bbbee_target_pct < 75) return 'transformative';
  return 'exemplary';
}

// ─── URGENT SLA (higher equity target → more scrutiny → tighter deadline) ───

export const SLA_DAYS: Record<BbbeeEquityTier, number> = {
  standard:       60,
  enhanced:       45,
  majority:       30,
  transformative: 21,
  exemplary:      14,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<BbbeeStatus>([
  'bbbee_verified',
  'bbbee_non_compliant',
  'certificate_lapsed',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<BbbeeAction, { from: BbbeeStatus[] }> = {
  prepare_documentation:       { from: ['verification_triggered'] },
  engage_agency:               { from: ['documentation_preparation'] },
  submit_data:                 { from: ['agency_engagement'] },
  commence_assessment:         { from: ['data_submission'] },
  issue_preliminary_score:     { from: ['agency_assessment'] },
  commence_ipp_review:         { from: ['preliminary_score_issued'] },
  commence_final_assessment:   { from: ['ipp_review'] },
  issue_certificate:           { from: ['final_assessment'] },
  confirm_verified:            { from: ['certificate_issued'] },
  declare_non_compliant:       { from: ['certificate_issued'] },
  lapse_certificate:           {
    from: [
      'verification_triggered', 'documentation_preparation', 'agency_engagement',
      'data_submission', 'agency_assessment', 'preliminary_score_issued',
      'ipp_review', 'final_assessment', 'certificate_issued',
    ],
  },
};

// ─── State machine ───────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<BbbeeAction, BbbeeStatus> = {
  prepare_documentation:       'documentation_preparation',
  engage_agency:               'agency_engagement',
  submit_data:                 'data_submission',
  commence_assessment:         'agency_assessment',
  issue_preliminary_score:     'preliminary_score_issued',
  commence_ipp_review:         'ipp_review',
  commence_final_assessment:   'final_assessment',
  issue_certificate:           'certificate_issued',
  confirm_verified:            'bbbee_verified',
  declare_non_compliant:       'bbbee_non_compliant',
  lapse_certificate:           'certificate_lapsed',
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: BbbeeEquityTier[] = ['standard', 'enhanced', 'majority', 'transformative', 'exemplary'];
const MAJORITY_PLUS: BbbeeEquityTier[] = ['majority', 'transformative', 'exemplary'];

export function crossesIntoRegulator(
  action: BbbeeAction,
  tier: BbbeeEquityTier,
): boolean {
  switch (action) {
    case 'declare_non_compliant': return ALL_TIERS.includes(tier);
    case 'lapse_certificate':     return ALL_TIERS.includes(tier);
    case 'confirm_verified':      return MAJORITY_PLUS.includes(tier);
    default:                      return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: BbbeeEquityTier): boolean {
  return MAJORITY_PLUS.includes(tier);
}
