// ═══════════════════════════════════════════════════════════════════════════
// Wave 176 — IPP DFI Environmental & Social Monitoring Report (ESMR)
//
// Development Finance Institutions (DBSA, IFC, DEG, AfDB, KfW) financing
// REIPPPP projects require semi-annual Environmental & Social Monitoring
// Reports (ESMR) per the Equator Principles 4th Edition and IFC Performance
// Standards PS1–PS8. The IPP's Lender Technical Advisor (TA) compiles the
// report and submits to lenders. A compliance certificate is issued annually
// confirming E&S covenant compliance. Certificate withholding or material
// breach declaration triggers loan covenant remediation obligations.
//
// Mounted at /api/ipp-esmr.
//
// INVERTED SLA: larger project loans attract more DFI scrutiny and require
// more comprehensive E&S monitoring, warranting longer review windows.
// Flagship projects (>R3B loan) may involve multiple DFIs and NGO observers.
//
// 12-state chain:
//   reporting_period_open → data_collection → monitoring_compilation
//   → lender_ta_review → ta_report_preparation → report_submitted
//   → lender_review → clarification_requested → clarification_submitted
//   → certificate_issued (terminal)
//   → certificate_withheld (terminal)
//   → material_breach_declared (terminal)
//
// Signature reportability:
//   declare_material_breach  → ALL tiers (E&S material breach = DMRE/DFFE
//                               and lender notification mandatory)
//   withhold_certificate     → medium+ (non-compliance in significant projects
//                               triggers DFFE/regulatory notification)
//   issue_certificate        → major + flagship (large DFI project E&S
//                               certifications feed national green finance registry)
// ═══════════════════════════════════════════════════════════════════════════

export type EsmrStatus =
  | 'reporting_period_open'
  | 'data_collection'
  | 'monitoring_compilation'
  | 'lender_ta_review'
  | 'ta_report_preparation'
  | 'report_submitted'
  | 'lender_review'
  | 'clarification_requested'
  | 'clarification_submitted'
  | 'certificate_issued'       // TERMINAL
  | 'certificate_withheld'     // TERMINAL
  | 'material_breach_declared'; // TERMINAL

export type EsmrAction =
  | 'commence_data_collection'
  | 'compile_monitoring_report'
  | 'commence_ta_review'
  | 'prepare_ta_report'
  | 'submit_report'
  | 'commence_lender_review'
  | 'request_clarification'
  | 'submit_clarification'
  | 'issue_certificate'
  | 'withhold_certificate'
  | 'declare_material_breach';

// INVERTED SLA — DFI loan size tier
export type EsmrLoanTier = 'small' | 'medium' | 'large' | 'major' | 'flagship';

// Equator Principles reporting period
export type EsmrPeriod = 'H1' | 'H2' | 'annual';

// IFC Performance Standard categories for material breach classification
export type EsmrBreachCategory =
  | 'ps1_assessment'       // E&S assessment and management system failure
  | 'ps2_labour'           // Labour and working conditions breach
  | 'ps3_pollution'        // Resource efficiency and pollution
  | 'ps4_community_health' // Community health, safety, security
  | 'ps5_land_acquisition' // Land acquisition and involuntary resettlement
  | 'ps6_biodiversity'     // Biodiversity conservation and resource management
  | 'ps7_indigenous'       // Indigenous people's rights
  | 'ps8_cultural';        // Cultural heritage

// ─── Tier derivation (keyed on loan_size_zar) ───────────────────────────────

export function deriveEsmrLoanTier(loan_size_zar: number): EsmrLoanTier {
  if (loan_size_zar < 200_000_000)     return 'small';
  if (loan_size_zar < 500_000_000)     return 'medium';
  if (loan_size_zar < 1_000_000_000)   return 'large';
  if (loan_size_zar < 3_000_000_000)   return 'major';
  return 'flagship';
}

// ─── INVERTED SLA (larger loan → more DFI scrutiny → more time) ─────────────

export const SLA_DAYS: Record<EsmrLoanTier, number> = {
  small:    30,
  medium:   45,
  large:    60,
  major:    90,
  flagship: 120,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<EsmrStatus>([
  'certificate_issued',
  'certificate_withheld',
  'material_breach_declared',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<EsmrAction, { from: EsmrStatus[] }> = {
  commence_data_collection:   { from: ['reporting_period_open'] },
  compile_monitoring_report:  { from: ['data_collection'] },
  commence_ta_review:         { from: ['monitoring_compilation'] },
  prepare_ta_report:          { from: ['lender_ta_review'] },
  submit_report:              { from: ['ta_report_preparation'] },
  commence_lender_review:     { from: ['report_submitted'] },
  request_clarification:      { from: ['lender_review'] },
  submit_clarification:       { from: ['clarification_requested'] },
  issue_certificate:          { from: ['lender_review', 'clarification_submitted'] },
  withhold_certificate:       { from: ['lender_review', 'clarification_submitted'] },
  declare_material_breach:    {
    from: [
      'lender_review', 'clarification_requested',
      'clarification_submitted', 'certificate_withheld',
    ],
  },
};

// ─── State machine ───────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<EsmrAction, EsmrStatus> = {
  commence_data_collection:   'data_collection',
  compile_monitoring_report:  'monitoring_compilation',
  commence_ta_review:         'lender_ta_review',
  prepare_ta_report:          'ta_report_preparation',
  submit_report:              'report_submitted',
  commence_lender_review:     'lender_review',
  request_clarification:      'clarification_requested',
  submit_clarification:       'clarification_submitted',
  issue_certificate:          'certificate_issued',
  withhold_certificate:       'certificate_withheld',
  declare_material_breach:    'material_breach_declared',
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: EsmrLoanTier[] = ['small', 'medium', 'large', 'major', 'flagship'];
const MEDIUM_PLUS: EsmrLoanTier[] = ['medium', 'large', 'major', 'flagship'];
const MAJOR_PLUS: EsmrLoanTier[] = ['major', 'flagship'];

export function crossesIntoRegulator(
  action: EsmrAction,
  tier: EsmrLoanTier,
): boolean {
  switch (action) {
    case 'declare_material_breach': return ALL_TIERS.includes(tier);
    case 'withhold_certificate':    return MEDIUM_PLUS.includes(tier);
    case 'issue_certificate':       return MAJOR_PLUS.includes(tier);
    default:                        return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: EsmrLoanTier): boolean {
  return MEDIUM_PLUS.includes(tier);
}
