// ═══════════════════════════════════════════════════════════════════════════
// Wave 171 — IPP Heritage Resources Assessment (HRA) & Permit
//
// National Heritage Resources Act (NHRA) Act 25 of 1999 + SAHRA (South
// African Heritage Resources Agency) + Provincial Heritage Resources
// Authorities (PHRAs). IPP projects encounter archaeological sites, graves,
// shipwrecks, historical structures, and cultural landscapes that trigger
// HRA obligations under NHRA ss.38-39. The HRA process runs in parallel
// with (and feeds into) the EA process. A SAHRA permit or Section 38(3)
// comment is typically required before ground disturbance.
//
// Mounted at /api/ipp-hra.
//
// INVERTED SLA: larger projects disturb more ground, encounter more heritage
// resources, require deeper excavation/field survey → MORE time.
//
// 12-state chain:
//   hra_triggered → desktop_study → field_survey
//   → hra_report_preparation → hra_submitted → sahra_review
//   → public_participation → specialist_assessment → final_review
//   → hra_approved (terminal)
//   → hra_refused (terminal)
//   → heritage_watchlist (terminal — conditional approval + ongoing monitoring)
//
// Signature reportability:
//   refuse_hra          → EVERY tier (project ground-disturb blocked; EA risk)
//   add_to_watchlist    → utility + strategic (ongoing SAHRA monitoring
//                          conditions material to NERSA licence)
//   approve_hra         → utility + strategic (NERSA + lender CP satisfied)
// ═══════════════════════════════════════════════════════════════════════════

export type HraStatus =
  | 'hra_triggered'
  | 'desktop_study'
  | 'field_survey'
  | 'hra_report_preparation'
  | 'hra_submitted'
  | 'sahra_review'
  | 'public_participation'
  | 'specialist_assessment'
  | 'final_review'
  | 'hra_approved'       // TERMINAL
  | 'hra_refused'        // TERMINAL
  | 'heritage_watchlist'; // TERMINAL

export type HraAction =
  | 'commence_desktop_study'
  | 'commence_field_survey'
  | 'prepare_hra_report'
  | 'submit_hra'
  | 'commence_sahra_review'
  | 'open_public_participation'
  | 'commence_specialist_assessment'
  | 'commence_final_review'
  | 'approve_hra'
  | 'refuse_hra'
  | 'add_to_watchlist';

export type HraCapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

export type HraTriggerCategory =
  | 'new_development'
  | 'scope_change'
  | 'layout_modification'
  | 'access_road'
  | 'substation_addition'
  | 'transmission_line';

export type HraCategory =
  | 'phase_1_desktop'
  | 'phase_2_field'
  | 'phase_3_excavation'
  | 'heritage_impact'
  | 'mitigation_plan';

// ─── Tier derivation (keyed on capacity_mw) ─────────────────────────────────

export function deriveHraCapacityTier(capacity_mw: number): HraCapacityTier {
  if (capacity_mw < 10)   return 'small';
  if (capacity_mw < 50)   return 'medium';
  if (capacity_mw < 200)  return 'large';
  if (capacity_mw < 500)  return 'utility';
  return 'strategic';
}

// ─── INVERTED SLA (larger capacity → more ground disturbance → more time) ────

export const SLA_DAYS: Record<HraCapacityTier, number> = {
  small:     30,
  medium:    45,
  large:     60,
  utility:   90,
  strategic: 120,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<HraStatus>([
  'hra_approved',
  'hra_refused',
  'heritage_watchlist',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  HraAction,
  { from: HraStatus[] }
> = {
  commence_desktop_study:         { from: ['hra_triggered'] },
  commence_field_survey:          { from: ['desktop_study'] },
  prepare_hra_report:             { from: ['field_survey'] },
  submit_hra:                     { from: ['hra_report_preparation'] },
  commence_sahra_review:          { from: ['hra_submitted'] },
  open_public_participation:      { from: ['sahra_review'] },
  commence_specialist_assessment: { from: ['public_participation'] },
  commence_final_review:          { from: ['specialist_assessment'] },
  approve_hra:                    { from: ['final_review'] },
  refuse_hra:                     { from: ['final_review'] },
  add_to_watchlist:               { from: ['final_review', 'specialist_assessment'] },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: HraCapacityTier[] = ['small', 'medium', 'large', 'utility', 'strategic'];
const UTILITY_PLUS: HraCapacityTier[] = ['utility', 'strategic'];

export function crossesIntoRegulator(
  action: HraAction,
  tier: HraCapacityTier,
): boolean {
  switch (action) {
    case 'refuse_hra':       return ALL_TIERS.includes(tier);
    case 'add_to_watchlist': return UTILITY_PLUS.includes(tier);
    case 'approve_hra':      return UTILITY_PLUS.includes(tier);
    default:                 return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: HraCapacityTier): boolean {
  return UTILITY_PLUS.includes(tier);
}
