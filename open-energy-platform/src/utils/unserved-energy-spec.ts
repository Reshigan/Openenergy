// ═══════════════════════════════════════════════════════════════════════════
// Wave 197 — Offtaker Unserved Energy Compensation Claim (USE Claim)
//
// When a supply interruption results in unserved energy (power not delivered
// under a contracted supply agreement), the affected offtaker may file a
// compensation claim against the responsible grid operator.  The claim
// quantifies the shortfall in MWh, attaches a NRS 048-2 quality-of-supply
// reference, and progresses through a regulated dispute and settlement chain.
//
// Regulatory basis
// ────────────────────────────────────────────────────────────────────────────
// NERSA electricity supply quality standards, ERA s29 (supply obligations),
// NRS 048-2 (quality of supply — limits and measurement methods),
// NEMA s28 (environmental and service continuity obligations).
//
// Three-party flow
// ────────────────────────────────────────────────────────────────────────────
//   offtaker      — files the initial claim; provides metering data; accepts
//                   or disputes the settlement offer.
//   grid_operator — responds to the claim; may contest liability; makes a
//                   settlement offer or enters formal adjudication.
//   admin         — adjudicates where the parties cannot agree; makes the
//                   award; routes formal outcomes to regulator_inbox.
//
// Customer categories and SLA polarity — URGENT
// ────────────────────────────────────────────────────────────────────────────
// Shorter SLA = tighter = higher urgency (industrial customers are most
// operationally exposed; residential customers have more slack).
//
//   industrial   7d  — continuous-process industry; every hour offline costs
//   commercial  14d  — retail, hospitality, offices; significant but recoverable
//   municipal   21d  — bulk municipal supply; regulated utility supply chain
//   residential 30d  — domestic consumers; protected but lower financial exposure
//   scheduled   45d  — pre-notified load-shedding curtailment; lowest urgency
//
// 12-state chain:
//   claim_submitted        — offtaker lodges the claim with metering evidence
//   metering_data_verified — platform verifies meter readings against NRS 048-2
//   liability_assessed     — admin/grid_operator assesses which party is liable
//   preliminary_quantum    — initial financial quantum calculated
//   grid_operator_response — grid_operator formally responds
//   negotiation            — parties enter bilateral negotiation
//   settlement_offer       — grid_operator makes a settlement offer
//   claim_settled          — TERMINAL+ — claim resolved by agreement
//   claim_disputed         — offtaker disputes the response / offer
//   formal_adjudication    — admin-led formal adjudication
//   award_made             — TERMINAL+ — adjudicator makes binding award
//   claim_withdrawn        — TERMINAL  — offtaker withdraws the claim
//
// Regulator crossing rules:
//   formal_adjudication → ALL customer categories (market integrity; always
//                          reportable — signals bilateral resolution failed)
//   arbitration         → ALL customer categories (here modelled as
//                          formal_adjudication reaching award_made)
//   sla_breach          → industrial + commercial only (small commercial
//                          exposure upward; residential/municipal/scheduled
//                          handled through consumer protection channels)
//
// Entity prefix: uec
// Event prefix:  uec_evt_
//
// Mounted at /api/unserved-energy-claims.
// ═══════════════════════════════════════════════════════════════════════════

export type UecStatus =
  | 'claim_submitted'
  | 'metering_data_verified'
  | 'liability_assessed'
  | 'preliminary_quantum'
  | 'grid_operator_response'
  | 'negotiation'
  | 'settlement_offer'
  | 'claim_settled'       // TERMINAL +
  | 'claim_disputed'
  | 'formal_adjudication'
  | 'award_made'          // TERMINAL +
  | 'claim_withdrawn';    // TERMINAL

export type UecAction =
  | 'verify_metering_data'
  | 'assess_liability'
  | 'determine_quantum'
  | 'submit_grid_response'
  | 'enter_negotiation'
  | 'make_settlement_offer'
  | 'accept_settlement'
  | 'dispute_claim'
  | 'commence_adjudication'
  | 'make_award';

// URGENT SLA — higher urgency (industrial) gets LESS time (tighter SLA)
export type CustomerCategory =
  | 'industrial'
  | 'commercial'
  | 'municipal'
  | 'residential'
  | 'scheduled';

// ─── SLA derivation (keyed on customer_category; URGENT polarity) ─────────────

export const SLA_DAYS: Record<CustomerCategory, number> = {
  industrial:   7,
  commercial:  14,
  municipal:   21,
  residential: 30,
  scheduled:   45,
};

export function deriveUecSla(category: CustomerCategory): number {
  return SLA_DAYS[category];
}

// ─── Hard terminals ────────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<UecStatus>([
  'claim_settled',
  'award_made',
  'claim_withdrawn',
]);

// ─── Valid transitions ──────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<UecAction, { from: UecStatus[] }> = {
  verify_metering_data: {
    from: ['claim_submitted'],
  },
  assess_liability: {
    from: ['metering_data_verified'],
  },
  determine_quantum: {
    from: ['liability_assessed'],
  },
  submit_grid_response: {
    from: ['preliminary_quantum'],
  },
  enter_negotiation: {
    from: ['grid_operator_response', 'claim_disputed'],
  },
  make_settlement_offer: {
    from: ['negotiation', 'grid_operator_response'],
  },
  accept_settlement: {
    from: ['settlement_offer'],
  },
  dispute_claim: {
    from: ['grid_operator_response', 'settlement_offer', 'preliminary_quantum'],
  },
  commence_adjudication: {
    from: ['claim_disputed', 'negotiation', 'formal_adjudication'],
  },
  make_award: {
    from: ['formal_adjudication'],
  },
};

// ─── State machine ──────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<UecAction, UecStatus> = {
  verify_metering_data:   'metering_data_verified',
  assess_liability:       'liability_assessed',
  determine_quantum:      'preliminary_quantum',
  submit_grid_response:   'grid_operator_response',
  enter_negotiation:      'negotiation',
  make_settlement_offer:  'settlement_offer',
  accept_settlement:      'claim_settled',
  dispute_claim:          'claim_disputed',
  commence_adjudication:  'formal_adjudication',
  make_award:             'award_made',
};

// ─── Regulator crossing rules ───────────────────────────────────────────────────

const ALL_CATEGORIES: CustomerCategory[] = [
  'industrial', 'commercial', 'municipal', 'residential', 'scheduled',
];

const SLA_BREACH_CATEGORIES: CustomerCategory[] = ['industrial', 'commercial'];

export function crossesIntoRegulator(
  action: UecAction,
  category: CustomerCategory,
): boolean {
  switch (action) {
    // formal_adjudication → ALL tiers (bilateral resolution failed; market
    // integrity concern regardless of customer class)
    case 'commence_adjudication': return ALL_CATEGORIES.includes(category);
    // award_made → ALL tiers (binding adjudication outcome is always reportable)
    case 'make_award':            return ALL_CATEGORIES.includes(category);
    default:                      return false;
  }
}

export function slaBreachCrossesIntoRegulator(category: CustomerCategory): boolean {
  return SLA_BREACH_CATEGORIES.includes(category);
}
