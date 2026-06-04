// ═══════════════════════════════════════════════════════════════════════════
// Wave 170 — IPP Water Use License (WUL) Application & Compliance
//
// National Water Act (NWA) Act 36 of 1998 + DWS (Department of Water &
// Sanitation) licensing process. IPP projects trigger Section 21 WUL
// requirements for: cooling water abstraction (solar thermal / CCGT),
// dust suppression, panel washing, process water, and impeding flow in
// watercourses. A valid WUL is a lender CP and a NERSA condition for many
// generation licences. WUL renewal is required periodically (typically
// every 5 years for major users).
//
// Mounted at /api/ipp-wul.
//
// INVERTED SLA: larger water users (correlated with plant size) face more
// complex hydrological assessments and more stakeholder engagement → MORE
// time for DWS processing.
//
// 12-state chain:
//   wul_application_triggered → site_assessment → application_preparation
//   → application_submitted → dws_completeness_review
//   → public_participation_open → public_participation_closed
//   → technical_assessment → dws_final_review
//   → wul_granted (terminal)
//   → wul_refused (terminal)
//   → wul_lapsed (terminal — renewal failure / non-compliance pathway)
//
// Signature reportability:
//   wul_refused    → EVERY tier (project blocked; NERSA/lender condition
//                     unmet; possibly triggering EA review)
//   wul_lapsed     → utility + strategic (large plant WUL lapse signals
//                     compliance failure requiring lender + NERSA notification)
//   grant_wul      → utility + strategic (NERSA + lender CP satisfied at
//                     large scale; reportable completion)
// ═══════════════════════════════════════════════════════════════════════════

export type WulStatus =
  | 'wul_application_triggered'
  | 'site_assessment'
  | 'application_preparation'
  | 'application_submitted'
  | 'dws_completeness_review'
  | 'public_participation_open'
  | 'public_participation_closed'
  | 'technical_assessment'
  | 'dws_final_review'
  | 'wul_granted'   // TERMINAL
  | 'wul_refused'   // TERMINAL
  | 'wul_lapsed';   // TERMINAL

export type WulAction =
  | 'commence_site_assessment'
  | 'commence_application_preparation'
  | 'submit_application'
  | 'accept_for_review'
  | 'open_public_participation'
  | 'close_public_participation'
  | 'commence_technical_assessment'
  | 'commence_final_review'
  | 'grant_wul'
  | 'refuse_wul'
  | 'lapse_wul';

export type WulCapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

export type WulTriggerCategory =
  | 'new_application'
  | 'renewal'
  | 'amendment'
  | 'transfer'
  | 'rectification';

export type WulSection21Category =
  | 's21_a_diversion'
  | 's21_b_storage'
  | 's21_c_impeding_flow'
  | 's21_g_discharge'
  | 's21_h_disposal';

// ─── Tier derivation (keyed on capacity_mw) ─────────────────────────────────

export function deriveWulCapacityTier(capacity_mw: number): WulCapacityTier {
  if (capacity_mw < 10)   return 'small';
  if (capacity_mw < 50)   return 'medium';
  if (capacity_mw < 200)  return 'large';
  if (capacity_mw < 500)  return 'utility';
  return 'strategic';
}

// ─── INVERTED SLA (larger capacity → more complex WUL → more time) ───────────

export const SLA_DAYS: Record<WulCapacityTier, number> = {
  small:     45,
  medium:    60,
  large:     90,
  utility:   120,
  strategic: 180,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<WulStatus>([
  'wul_granted',
  'wul_refused',
  'wul_lapsed',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  WulAction,
  { from: WulStatus[] }
> = {
  commence_site_assessment:        { from: ['wul_application_triggered'] },
  commence_application_preparation:{ from: ['site_assessment'] },
  submit_application:              { from: ['application_preparation'] },
  accept_for_review:               { from: ['application_submitted'] },
  open_public_participation:       { from: ['dws_completeness_review'] },
  close_public_participation:      { from: ['public_participation_open'] },
  commence_technical_assessment:   { from: ['public_participation_closed'] },
  commence_final_review:           { from: ['technical_assessment'] },
  grant_wul:                       { from: ['dws_final_review'] },
  refuse_wul:                      { from: ['dws_final_review'] },
  lapse_wul:                       { from: ['dws_completeness_review', 'public_participation_open', 'dws_final_review'] },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: WulCapacityTier[] = ['small', 'medium', 'large', 'utility', 'strategic'];
const UTILITY_PLUS: WulCapacityTier[] = ['utility', 'strategic'];

export function crossesIntoRegulator(
  action: WulAction,
  tier: WulCapacityTier,
): boolean {
  switch (action) {
    case 'refuse_wul':  return ALL_TIERS.includes(tier);
    case 'lapse_wul':   return UTILITY_PLUS.includes(tier);
    case 'grant_wul':   return UTILITY_PLUS.includes(tier);
    default:            return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: WulCapacityTier): boolean {
  return UTILITY_PLUS.includes(tier);
}
