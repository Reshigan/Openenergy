// ═══════════════════════════════════════════════════════════════════════════
// Wave 178 — IPP Annual Insurance Renewal & Coverage Confirmation
//
// REIPPPP Power Purchase Agreements (Schedule 8) and Financing Documents
// require IPPs to maintain specific insurance coverage at all times:
// contractor's all-risk (CAR), operational all-risk, third-party liability,
// business interruption, directors' & officers' (D&O), and environmental
// impairment liability. Annual renewal must be confirmed to the DMRE IPP
// Office and lenders before policy expiry. Coverage lapse constitutes an
// immediate PPA default event.
//
// Mounted at /api/ipp-insurance-renewals.
//
// INVERTED SLA: higher premium projects involve more complex risk placement
// (multiple underwriter towers, specialist markets, reinsurance layers)
// requiring more time to complete. Flagship projects (>R100M premium) may
// require Lloyd's market placement and international capacity.
//
// 12-state chain:
//   renewal_triggered → coverage_gap_analysis → broker_instruction
//   → market_placement → terms_received → ipp_lender_review
//   → documentation_preparation → documents_submitted
//   → lender_confirmation_requested
//   → confirmed_adequate (terminal)
//   → confirmed_inadequate (terminal)
//   → coverage_lapsed (terminal)
//
// Signature reportability:
//   confirm_inadequate → ALL tiers (insurance shortfall = PPA contractual
//                         default notification to NERSA/DMRE mandatory)
//   lapse_coverage     → ALL tiers (lapse = immediate default event; regulator
//                         must be notified regardless of project size)
//   confirm_adequate   → major + flagship (high-premium confirmations feed
//                         the national energy project insurance registry)
// ═══════════════════════════════════════════════════════════════════════════

export type InsrStatus =
  | 'renewal_triggered'
  | 'coverage_gap_analysis'
  | 'broker_instruction'
  | 'market_placement'
  | 'terms_received'
  | 'ipp_lender_review'
  | 'documentation_preparation'
  | 'documents_submitted'
  | 'lender_confirmation_requested'
  | 'confirmed_adequate'    // TERMINAL
  | 'confirmed_inadequate'  // TERMINAL
  | 'coverage_lapsed';      // TERMINAL

export type InsrAction =
  | 'commence_gap_analysis'
  | 'instruct_broker'
  | 'place_in_market'
  | 'receive_terms'
  | 'commence_lender_review'
  | 'prepare_documentation'
  | 'submit_documents'
  | 'request_lender_confirmation'
  | 'confirm_adequate'
  | 'confirm_inadequate'
  | 'lapse_coverage';

// INVERTED SLA — annual insurance premium tier
export type InsrPremiumTier = 'small' | 'medium' | 'large' | 'major' | 'flagship';

// Insurance line classification
export type InsrLineType =
  | 'contractors_all_risk'      // CAR — construction phase
  | 'operational_all_risk'      // OAR — operational phase
  | 'third_party_liability'     // TPL / public liability
  | 'business_interruption'     // BI / loss of revenue
  | 'directors_officers'        // D&O
  | 'environmental_impairment'  // EIL
  | 'comprehensive_package';    // all lines bundled

// ─── Tier derivation (keyed on annual_premium_zar) ──────────────────────────

export function deriveInsrPremiumTier(annual_premium_zar: number): InsrPremiumTier {
  if (annual_premium_zar < 2_000_000)   return 'small';
  if (annual_premium_zar < 10_000_000)  return 'medium';
  if (annual_premium_zar < 30_000_000)  return 'large';
  if (annual_premium_zar < 100_000_000) return 'major';
  return 'flagship';
}

// ─── INVERTED SLA (higher premium → more complex placement → more time) ──────

export const SLA_DAYS: Record<InsrPremiumTier, number> = {
  small:    30,
  medium:   45,
  large:    60,
  major:    90,
  flagship: 120,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<InsrStatus>([
  'confirmed_adequate',
  'confirmed_inadequate',
  'coverage_lapsed',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<InsrAction, { from: InsrStatus[] }> = {
  commence_gap_analysis:         { from: ['renewal_triggered'] },
  instruct_broker:               { from: ['coverage_gap_analysis'] },
  place_in_market:               { from: ['broker_instruction'] },
  receive_terms:                 { from: ['market_placement'] },
  commence_lender_review:        { from: ['terms_received'] },
  prepare_documentation:         { from: ['ipp_lender_review'] },
  submit_documents:              { from: ['documentation_preparation'] },
  request_lender_confirmation:   { from: ['documents_submitted'] },
  confirm_adequate:              { from: ['lender_confirmation_requested'] },
  confirm_inadequate:            { from: ['lender_confirmation_requested'] },
  lapse_coverage:                {
    from: [
      'renewal_triggered', 'coverage_gap_analysis', 'broker_instruction',
      'market_placement', 'terms_received', 'ipp_lender_review',
      'documentation_preparation', 'documents_submitted',
      'lender_confirmation_requested',
    ],
  },
};

// ─── State machine ───────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<InsrAction, InsrStatus> = {
  commence_gap_analysis:        'coverage_gap_analysis',
  instruct_broker:              'broker_instruction',
  place_in_market:              'market_placement',
  receive_terms:                'terms_received',
  commence_lender_review:       'ipp_lender_review',
  prepare_documentation:        'documentation_preparation',
  submit_documents:             'documents_submitted',
  request_lender_confirmation:  'lender_confirmation_requested',
  confirm_adequate:             'confirmed_adequate',
  confirm_inadequate:           'confirmed_inadequate',
  lapse_coverage:               'coverage_lapsed',
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: InsrPremiumTier[] = ['small', 'medium', 'large', 'major', 'flagship'];
const MAJOR_PLUS: InsrPremiumTier[] = ['major', 'flagship'];

export function crossesIntoRegulator(
  action: InsrAction,
  tier: InsrPremiumTier,
): boolean {
  switch (action) {
    case 'confirm_inadequate': return ALL_TIERS.includes(tier);
    case 'lapse_coverage':     return ALL_TIERS.includes(tier);
    case 'confirm_adequate':   return MAJOR_PLUS.includes(tier);
    default:                   return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: InsrPremiumTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
