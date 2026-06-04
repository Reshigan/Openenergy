// ═══════════════════════════════════════════════════════════════════════════
// Wave 180 — IPP REIPPPP Community Equity Participation (CEP) Compliance
//
// REIPPPP Bid Conditions require projects above 5MW to include community
// equity participation — typically a Community Trust (CT) or Non-Profit
// Company (NPC) holding a minimum 5% equity stake, with DMRE targets of up
// to 40% community + BBBEE combined. Annual compliance reports must be filed
// with the DMRE IPP Office and lenders confirming:
//   (a) annual cash distributions were made to community beneficiaries,
//   (b) community development spend targets were met,
//   (c) community shareholding structure remains intact.
// Failure to file or non-compliance triggers a DMRE Default Notice under
// the PPA. Persistent non-compliance is a REIPPPP disqualification event.
//
// Mounted at /api/ipp-cep-compliance.
//
// INVERTED SLA: larger projects have larger community obligations, more
// beneficiaries to identify, larger distribution pools, and more complex
// documentation requirements — warranting more time.
//
// 12-state chain:
//   cep_triggered → stakeholder_identification → distribution_calculation
//   → trustee_approval → payment_preparation → distributions_paid
//   → community_dev_verification → documentation_compiled → dmre_submission
//   → cep_compliant     (terminal)
//   → cep_non_compliant (terminal)
//   → cep_lapsed        (terminal)
//
// Signature reportability:
//   declare_non_compliant → ALL tiers (CEP failure = mandatory DMRE
//                            reportable under REIPPPP bid conditions)
//   lapse_cep             → ALL tiers (lapse = immediate PPA default event)
//   confirm_compliant     → major + flagship (large CEP confirmations feed
//                            the DMRE national community benefit register)
// ═══════════════════════════════════════════════════════════════════════════

export type CepStatus =
  | 'cep_triggered'
  | 'stakeholder_identification'
  | 'distribution_calculation'
  | 'trustee_approval'
  | 'payment_preparation'
  | 'distributions_paid'
  | 'community_dev_verification'
  | 'documentation_compiled'
  | 'dmre_submission'
  | 'cep_compliant'      // TERMINAL
  | 'cep_non_compliant'  // TERMINAL
  | 'cep_lapsed';        // TERMINAL

export type CepAction =
  | 'identify_stakeholders'
  | 'calculate_distributions'
  | 'obtain_trustee_approval'
  | 'prepare_payments'
  | 'confirm_distributions_paid'
  | 'verify_community_dev'
  | 'compile_documentation'
  | 'submit_to_dmre'
  | 'confirm_compliant'
  | 'declare_non_compliant'
  | 'lapse_cep';

// INVERTED SLA — project capacity tier
export type CepProjectTier = 'small' | 'medium' | 'large' | 'major' | 'flagship';

// Community participation structure classification
export type CepStructureType =
  | 'community_trust'   // Community Trust (CT) — most common REIPPPP structure
  | 'npc'               // Non-Profit Company (NPC)
  | 'spv'               // Special Purpose Vehicle held by community
  | 'direct_equity'     // direct community equity stake
  | 'blended';          // mix of CT + NPC + direct equity

// ─── Tier derivation (keyed on project_mw) ──────────────────────────────────

export function deriveCepProjectTier(project_mw: number): CepProjectTier {
  if (project_mw < 50)   return 'small';
  if (project_mw < 150)  return 'medium';
  if (project_mw < 300)  return 'large';
  if (project_mw < 600)  return 'major';
  return 'flagship';
}

// ─── INVERTED SLA (larger project → more community obligations → more time) ──

export const SLA_DAYS: Record<CepProjectTier, number> = {
  small:    30,
  medium:   45,
  large:    60,
  major:    90,
  flagship: 120,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<CepStatus>([
  'cep_compliant',
  'cep_non_compliant',
  'cep_lapsed',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<CepAction, { from: CepStatus[] }> = {
  identify_stakeholders:       { from: ['cep_triggered'] },
  calculate_distributions:     { from: ['stakeholder_identification'] },
  obtain_trustee_approval:     { from: ['distribution_calculation'] },
  prepare_payments:            { from: ['trustee_approval'] },
  confirm_distributions_paid:  { from: ['payment_preparation'] },
  verify_community_dev:        { from: ['distributions_paid'] },
  compile_documentation:       { from: ['community_dev_verification'] },
  submit_to_dmre:              { from: ['documentation_compiled'] },
  confirm_compliant:           { from: ['dmre_submission'] },
  declare_non_compliant:       { from: ['dmre_submission'] },
  lapse_cep:                   {
    from: [
      'cep_triggered', 'stakeholder_identification', 'distribution_calculation',
      'trustee_approval', 'payment_preparation', 'distributions_paid',
      'community_dev_verification', 'documentation_compiled', 'dmre_submission',
    ],
  },
};

// ─── State machine ───────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<CepAction, CepStatus> = {
  identify_stakeholders:       'stakeholder_identification',
  calculate_distributions:     'distribution_calculation',
  obtain_trustee_approval:     'trustee_approval',
  prepare_payments:            'payment_preparation',
  confirm_distributions_paid:  'distributions_paid',
  verify_community_dev:        'community_dev_verification',
  compile_documentation:       'documentation_compiled',
  submit_to_dmre:              'dmre_submission',
  confirm_compliant:           'cep_compliant',
  declare_non_compliant:       'cep_non_compliant',
  lapse_cep:                   'cep_lapsed',
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: CepProjectTier[] = ['small', 'medium', 'large', 'major', 'flagship'];
const MAJOR_PLUS: CepProjectTier[] = ['major', 'flagship'];

export function crossesIntoRegulator(
  action: CepAction,
  tier: CepProjectTier,
): boolean {
  switch (action) {
    case 'declare_non_compliant': return ALL_TIERS.includes(tier);
    case 'lapse_cep':             return ALL_TIERS.includes(tier);
    case 'confirm_compliant':     return MAJOR_PLUS.includes(tier);
    default:                      return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: CepProjectTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
