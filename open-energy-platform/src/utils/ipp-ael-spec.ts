// ═══════════════════════════════════════════════════════════════════════════
// Wave 172 — IPP Atmospheric Emission Licence (AEL) Application & Renewal
//
// National Environmental Management: Air Quality Act (NEMAQA) Act 39 of
// 2004 + DFFE / Municipal Licensing Authorities. IPP projects require an
// AEL for: gas turbines, diesel backup generators, flue gas desulphurisation
// units, and any listed activity under Section 21 of NEMAQA. The AEL is a
// separate licensing track from the EA, typically processed by the relevant
// municipality (< 25 MW) or provincial authority (> 25 MW) or DFFE for
// major activities. AEL renewal runs on a fixed term (typically 5 years).
//
// Mounted at /api/ipp-ael.
//
// INVERTED SLA: larger plants have more complex emissions inventories,
// require dispersion modelling, public participation → MORE time.
//
// 12-state chain:
//   ael_triggered → emissions_inventory → application_preparation
//   → application_submitted → authority_completeness_review
//   → public_participation_open → public_participation_closed
//   → technical_assessment → authority_final_review
//   → ael_granted (terminal)
//   → ael_refused (terminal)
//   → ael_lapsed (terminal — renewal failure / non-compliance)
//
// Signature reportability:
//   refuse_ael → EVERY tier (project may be blocked; generation can't
//                 commence without AEL for listed activities)
//   lapse_ael  → utility + strategic (large plant AEL lapse = NERSA licence
//                 condition breach; lender notification required)
//   grant_ael  → utility + strategic (NERSA + lender CP closure for large
//                 plants; material environmental permit)
// ═══════════════════════════════════════════════════════════════════════════

export type AelStatus =
  | 'ael_triggered'
  | 'emissions_inventory'
  | 'application_preparation'
  | 'application_submitted'
  | 'authority_completeness_review'
  | 'public_participation_open'
  | 'public_participation_closed'
  | 'technical_assessment'
  | 'authority_final_review'
  | 'ael_granted'   // TERMINAL
  | 'ael_refused'   // TERMINAL
  | 'ael_lapsed';   // TERMINAL

export type AelAction =
  | 'commence_emissions_inventory'
  | 'prepare_application'
  | 'submit_application'
  | 'accept_for_review'
  | 'open_public_participation'
  | 'close_public_participation'
  | 'commence_technical_assessment'
  | 'commence_final_review'
  | 'grant_ael'
  | 'refuse_ael'
  | 'lapse_ael';

export type AelCapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

export type AelTriggerCategory =
  | 'new_installation'
  | 'capacity_increase'
  | 'fuel_change'
  | 'technology_substitution'
  | 'renewal'
  | 'amendment';

export type AelCategory =
  | 'category_1_major'
  | 'category_2_minor'
  | 's21_listed_activity'
  | 'point_source'
  | 'fugitive_emission';

// ─── Tier derivation (keyed on capacity_mw) ─────────────────────────────────

export function deriveAelCapacityTier(capacity_mw: number): AelCapacityTier {
  if (capacity_mw < 10)   return 'small';
  if (capacity_mw < 50)   return 'medium';
  if (capacity_mw < 200)  return 'large';
  if (capacity_mw < 500)  return 'utility';
  return 'strategic';
}

// ─── INVERTED SLA (larger plant → more complex AEL → more time) ─────────────

export const SLA_DAYS: Record<AelCapacityTier, number> = {
  small:     30,
  medium:    45,
  large:     60,
  utility:   90,
  strategic: 120,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<AelStatus>([
  'ael_granted',
  'ael_refused',
  'ael_lapsed',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  AelAction,
  { from: AelStatus[] }
> = {
  commence_emissions_inventory:  { from: ['ael_triggered'] },
  prepare_application:           { from: ['emissions_inventory'] },
  submit_application:            { from: ['application_preparation'] },
  accept_for_review:             { from: ['application_submitted'] },
  open_public_participation:     { from: ['authority_completeness_review'] },
  close_public_participation:    { from: ['public_participation_open'] },
  commence_technical_assessment: { from: ['public_participation_closed'] },
  commence_final_review:         { from: ['technical_assessment'] },
  grant_ael:                     { from: ['authority_final_review'] },
  refuse_ael:                    { from: ['authority_final_review'] },
  lapse_ael:                     {
    from: ['authority_completeness_review', 'public_participation_open', 'authority_final_review'],
  },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: AelCapacityTier[] = ['small', 'medium', 'large', 'utility', 'strategic'];
const UTILITY_PLUS: AelCapacityTier[] = ['utility', 'strategic'];

export function crossesIntoRegulator(
  action: AelAction,
  tier: AelCapacityTier,
): boolean {
  switch (action) {
    case 'refuse_ael': return ALL_TIERS.includes(tier);
    case 'lapse_ael':  return UTILITY_PLUS.includes(tier);
    case 'grant_ael':  return UTILITY_PLUS.includes(tier);
    default:           return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: AelCapacityTier): boolean {
  return UTILITY_PLUS.includes(tier);
}
