// ═══════════════════════════════════════════════════════════════════════════
// Wave 169 — IPP Environmental Authorization Amendment & Compliance
//
// NEMA Chapter 5 + EIA Regulations 2014 (GNR.982/983/985) + NEMA s24G
// rectification. IPP projects must maintain a current Environmental
// Authorization (EA) from DFFE. Material scope changes (capacity increase,
// technology substitution, footprint expansion, access route modifications)
// require a formal EA amendment before commencement. Commencing without
// an amendment constitutes an unlawful activity under NEMA s24G.
//
// Mounted at /api/ipp-ea-amendment.
//
// INVERTED SLA: larger projects have more complex EIAs, more I&AP engagement,
// more specialist studies → MORE time for DFFE processing.
//
// 12-state chain:
//   ea_amendment_triggered → scope_defined → application_in_preparation
//   → application_submitted → dffe_completeness_review
//   → public_participation_open → public_participation_closed
//   → specialist_review → dffe_final_review
//   → amendment_granted (terminal)
//   → amendment_refused (terminal)
//   → s24g_referral (terminal — NEMA unlawful-activity pathway)
//
// Signature reportability:
//   refuse_amendment → EVERY tier (project blocked; NERSA/lender impact)
//   refer_s24g       → EVERY tier (NEMA unlawful activity; always reportable)
//   grant_amendment  → utility + strategic (NERSA notification required for
//                       large plants; lender condition precedent satisfied)
// ═══════════════════════════════════════════════════════════════════════════

export type EaAmendmentStatus =
  | 'ea_amendment_triggered'
  | 'scope_defined'
  | 'application_in_preparation'
  | 'application_submitted'
  | 'dffe_completeness_review'
  | 'public_participation_open'
  | 'public_participation_closed'
  | 'specialist_review'
  | 'dffe_final_review'
  | 'amendment_granted'   // TERMINAL
  | 'amendment_refused'   // TERMINAL
  | 's24g_referral';      // TERMINAL

export type EaAmendmentAction =
  | 'define_scope'
  | 'prepare_application'
  | 'submit_application'
  | 'accept_for_review'
  | 'open_public_participation'
  | 'close_public_participation'
  | 'submit_specialist_review'
  | 'commence_final_review'
  | 'grant_amendment'
  | 'refuse_amendment'
  | 'refer_s24g';

export type EaCapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

export type EaTriggerCategory =
  | 'scope_change'
  | 'technology_substitution'
  | 'capacity_increase'
  | 'access_route_change'
  | 'footprint_expansion'
  | 'component_modification';

export type EaAmendmentCategory =
  | 'basic_assessment'
  | 'scoping_and_eia'
  | 'variation_application'
  | 's24g_rectification'
  | 'exemption_application';

// ─── Tier derivation (keyed on capacity_mw) ─────────────────────────────────

export function deriveEaCapacityTier(capacity_mw: number): EaCapacityTier {
  if (capacity_mw < 10)   return 'small';
  if (capacity_mw < 50)   return 'medium';
  if (capacity_mw < 200)  return 'large';
  if (capacity_mw < 500)  return 'utility';
  return 'strategic';
}

// ─── INVERTED SLA (larger capacity → more complex EIA → more time) ───────────

export const SLA_DAYS: Record<EaCapacityTier, number> = {
  small:     60,
  medium:    90,
  large:     120,
  utility:   180,
  strategic: 270,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<EaAmendmentStatus>([
  'amendment_granted',
  'amendment_refused',
  's24g_referral',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  EaAmendmentAction,
  { from: EaAmendmentStatus[] }
> = {
  define_scope:               { from: ['ea_amendment_triggered'] },
  prepare_application:        { from: ['scope_defined'] },
  submit_application:         { from: ['application_in_preparation'] },
  accept_for_review:          { from: ['application_submitted'] },
  open_public_participation:  { from: ['dffe_completeness_review'] },
  close_public_participation: { from: ['public_participation_open'] },
  submit_specialist_review:   { from: ['public_participation_closed'] },
  commence_final_review:      { from: ['specialist_review'] },
  grant_amendment:            { from: ['dffe_final_review'] },
  refuse_amendment:           { from: ['dffe_final_review'] },
  refer_s24g:                 {
    from: ['dffe_completeness_review', 'public_participation_open', 'dffe_final_review'],
  },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: EaCapacityTier[] = ['small', 'medium', 'large', 'utility', 'strategic'];
const UTILITY_PLUS: EaCapacityTier[] = ['utility', 'strategic'];

export function crossesIntoRegulator(
  action: EaAmendmentAction,
  tier: EaCapacityTier,
): boolean {
  switch (action) {
    case 'refuse_amendment': return ALL_TIERS.includes(tier);
    case 'refer_s24g':       return ALL_TIERS.includes(tier);
    case 'grant_amendment':  return UTILITY_PLUS.includes(tier);
    default:                 return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: EaCapacityTier): boolean {
  return UTILITY_PLUS.includes(tier);
}
