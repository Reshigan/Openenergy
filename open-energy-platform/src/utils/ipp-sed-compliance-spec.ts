// ═══════════════════════════════════════════════════════════════════════════
// Wave 181 — IPP REIPPPP Socio-Economic Development (SED) Annual Spend
//
// REIPPPP Bid Conditions require IPPs to spend a minimum percentage of
// revenue on Socio-Economic Development (SED) annually — typically 1–2%
// of gross revenue on education, healthcare, infrastructure, and skills
// development in host communities. This is distinct from CEP (equity
// participation, W180) — SED is cash spend on community upliftment programmes.
//
// Annual SED reports must be filed with the DMRE IPP Office and verified
// by an independent auditor appointed in terms of the PPA. Failure to
// comply or submit triggers a DMRE Default Notice. Persistent non-compliance
// is grounds for PPA termination.
//
// Mounted at /api/ipp-sed-compliance.
//
// INVERTED SLA: larger-revenue projects have larger SED obligations, more
// beneficiaries, more programmes to verify, and more complex audit trails,
// warranting additional time to complete the annual cycle.
//
// 12-state chain:
//   sed_triggered → beneficiary_identification → programme_planning
//   → board_approval → spend_execution → expenditure_verification
//   → independent_audit → audit_complete → dmre_submission
//   → sed_compliant     (terminal)
//   → sed_non_compliant (terminal)
//   → sed_lapsed        (terminal)
//
// Signature reportability:
//   declare_non_compliant → ALL tiers (SED failure = mandatory DMRE default)
//   lapse_sed             → ALL tiers (lapse = immediate PPA default event)
//   confirm_compliant     → large + major (large SED confirmations feed DMRE
//                            national community benefit register)
// ═══════════════════════════════════════════════════════════════════════════

export type SedStatus =
  | 'sed_triggered'
  | 'beneficiary_identification'
  | 'programme_planning'
  | 'board_approval'
  | 'spend_execution'
  | 'expenditure_verification'
  | 'independent_audit'
  | 'audit_complete'
  | 'dmre_submission'
  | 'sed_compliant'      // TERMINAL
  | 'sed_non_compliant'  // TERMINAL
  | 'sed_lapsed';        // TERMINAL

export type SedAction =
  | 'identify_beneficiaries'
  | 'plan_programme'
  | 'obtain_board_approval'
  | 'execute_spend'
  | 'verify_expenditure'
  | 'commence_audit'
  | 'complete_audit'
  | 'submit_to_dmre'
  | 'confirm_compliant'
  | 'declare_non_compliant'
  | 'lapse_sed';

// INVERTED SLA — annual revenue tier
export type SedRevenueTier = 'micro' | 'small' | 'medium' | 'large' | 'major';

// SED programme focus area
export type SedFocusArea =
  | 'education'              // schools, bursaries, STEM programmes
  | 'healthcare'             // clinics, medical supplies, community health
  | 'infrastructure'         // roads, water, sanitation, electrification
  | 'skills_development'     // vocational training, learnerships
  | 'enterprise_development' // SMME support, supplier development
  | 'environmental'          // environmental stewardship, conservation
  | 'comprehensive';         // multiple focus areas combined

// ─── Tier derivation (keyed on annual_revenue_zar) ──────────────────────────

export function deriveSedRevenueTier(annual_revenue_zar: number): SedRevenueTier {
  if (annual_revenue_zar < 10_000_000)   return 'micro';
  if (annual_revenue_zar < 50_000_000)   return 'small';
  if (annual_revenue_zar < 200_000_000)  return 'medium';
  if (annual_revenue_zar < 600_000_000)  return 'large';
  return 'major';
}

// ─── INVERTED SLA (higher revenue → more SED obligation → more time) ─────────

export const SLA_DAYS: Record<SedRevenueTier, number> = {
  micro:  21,
  small:  30,
  medium: 45,
  large:  60,
  major:  90,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<SedStatus>([
  'sed_compliant',
  'sed_non_compliant',
  'sed_lapsed',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<SedAction, { from: SedStatus[] }> = {
  identify_beneficiaries:  { from: ['sed_triggered'] },
  plan_programme:          { from: ['beneficiary_identification'] },
  obtain_board_approval:   { from: ['programme_planning'] },
  execute_spend:           { from: ['board_approval'] },
  verify_expenditure:      { from: ['spend_execution'] },
  commence_audit:          { from: ['expenditure_verification'] },
  complete_audit:          { from: ['independent_audit'] },
  submit_to_dmre:          { from: ['audit_complete'] },
  confirm_compliant:       { from: ['dmre_submission'] },
  declare_non_compliant:   { from: ['dmre_submission'] },
  lapse_sed:               {
    from: [
      'sed_triggered', 'beneficiary_identification', 'programme_planning',
      'board_approval', 'spend_execution', 'expenditure_verification',
      'independent_audit', 'audit_complete', 'dmre_submission',
    ],
  },
};

// ─── State machine ───────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<SedAction, SedStatus> = {
  identify_beneficiaries:  'beneficiary_identification',
  plan_programme:          'programme_planning',
  obtain_board_approval:   'board_approval',
  execute_spend:           'spend_execution',
  verify_expenditure:      'expenditure_verification',
  commence_audit:          'independent_audit',
  complete_audit:          'audit_complete',
  submit_to_dmre:          'dmre_submission',
  confirm_compliant:       'sed_compliant',
  declare_non_compliant:   'sed_non_compliant',
  lapse_sed:               'sed_lapsed',
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: SedRevenueTier[] = ['micro', 'small', 'medium', 'large', 'major'];
const LARGE_PLUS: SedRevenueTier[] = ['large', 'major'];

export function crossesIntoRegulator(
  action: SedAction,
  tier: SedRevenueTier,
): boolean {
  switch (action) {
    case 'declare_non_compliant': return ALL_TIERS.includes(tier);
    case 'lapse_sed':             return ALL_TIERS.includes(tier);
    case 'confirm_compliant':     return LARGE_PLUS.includes(tier);
    default:                      return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: SedRevenueTier): boolean {
  return LARGE_PLUS.includes(tier);
}
