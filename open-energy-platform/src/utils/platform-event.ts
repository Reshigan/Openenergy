// ═══════════════════════════════════════════════════════════════════════════
// PlatformEvent — the canonical cross-platform event contract.
//
// Every state transition fires a fireCascade(ctx) where ctx now carries these
// optional PlatformEventFields. They are what the four ecosystem layers read:
//   Layer A (cascade-registry) routes on `chain_key` + `event`
//   Layer C (role-actions)     pushes to `affected_roles`
//   Layer B (fee-engine)       prices `commercial`
//   Layer D (analytics-sink)   logs the lot
// Zero runtime deps so cascade.ts and every layer can import the types freely.
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_ROLES = [
  'admin', 'ipp_developer', 'trader', 'lender', 'offtaker',
  'carbon_fund', 'grid_operator', 'regulator', 'support',
] as const;

export type PlatformRole = (typeof ALL_ROLES)[number];

export function isPlatformRole(x: unknown): x is PlatformRole {
  return typeof x === 'string' && (ALL_ROLES as readonly string[]).includes(x);
}

// Commercial context for Layer B. entity_value is the ZAR figure a fee is
// computed against (tranche size, credit value, notional). participant_id is
// the default payer when payer_resolution = 'initiator'.
export interface CommercialContext {
  entity_value?: number;
  participant_id?: string;
  billing_period?: string;   // YYYY-MM; defaults to the current month at record time
  tier?: string;             // chain tier, matched against fee_schedule.applicable_tiers
}

// Optional fields layered onto CascadeContext. All optional → every existing
// fireCascade caller compiles unchanged.
export interface PlatformEventFields {
  chain_key?: string;            // e.g. 'ppa_contract' (W22) — Layer A routing key
  source_chain_status?: string;  // the chain_status this transition landed in
  affected_roles?: PlatformRole[];
  cross_impact_hint?: string;    // human string for the cross-option card
  commercial?: CommercialContext;
}
