// ─────────────────────────────────────────────────────────────────────────
// Wave 46 — Offtaker PPA Curtailment / Deemed-Energy Compensation chain (P6)
//
// REIPPPP / bilateral PPA curtailment-compensation regime + NERSA Grid Code
// economic-dispatch curtailment. When the buyer or the System Operator curtails
// an AVAILABLE plant — for economic, system-security, or grid-constraint reasons
// not attributable to the IPP — the PPA compensates the seller for "deemed
// energy" (a.k.a. compensated / avoided energy): the MWh the plant WOULD have
// generated had it not been curtailed, valued at the PPA tariff.
//
// This is the SUPPLY-side mirror of [[project-wave32-take-or-pay-chain]] (a
// take-or-pay shortfall is the buyer failing to OFFTAKE contracted volume on the
// demand side; a curtailment claim is the buyer/SO preventing the seller from
// DELIVERING energy it was able to produce). It settles against the same PPA set
// up by [[project-wave22-ppa-contract-chain]], at the tariff repriced by
// [[project-wave39-tariff-indexation-chain]], and is triggered by the same
// load-shedding / dispatch curtailment instructions that drive the Grid
// [[project-wave34-load-curtailment-chain]] (W34 is the SO's instruction to
// shed; W46 is the buyer's deemed-energy COMPENSATION settlement that follows).
//
//   curtailment_logged → classification_review → claim_prepared
//     → claim_submitted → validation_underway → quantum_proposed
//     → quantum_agreed → compensation_settled                  (paid)
//
// Classification gate (the distinguishing business rule):
//   classification_review → non_compensable                    (IPP-fault / force
//                              majeure / scheduled — no deemed energy owed)
//
// Dispute branch:
//   quantum_proposed|quantum_agreed → disputed → quantum_proposed   (recalculate)
//                                              → arbitrated           (referred)
//   any active → withdrawn                                     (seller withdraws)
//
// Tiers (facility scale — drive SLA + reportability), consistent with the rest
// of the Offtaker family:
//   utility_scale — grid-scale IPP; debt-service dependent on the cash flow
//   commercial    — mid
//   embedded      — behind-the-meter / SSEG; smallest
//
// SLA matrix is URGENT — utility_scale gets the TIGHTEST windows (a large IPP's
// debt service depends on deemed-energy cash flow, so its claims resolve
// fastest). Reportability:
//   - refer_arbitration crosses for EVERY tier (a formal arbitration referral is
//     always notifiable — the universal hard line)
//   - reject_non_compensable (a denied claim — dispute risk) + settle_compensation
//     (a large system-cost settlement) cross for utility_scale + commercial only
//   - SLA breaches cross for utility_scale + commercial only
//
// actor_party (seller / buyer / arbiter) is derived from the ACTION, not the JWT
// role — same model as [[project-wave45-loan-default-chain]]. The seller (IPP)
// prepares + submits the claim, disputes a quantum, and may withdraw; the buyer
// (offtaker) classifies, validates, proposes/recalculates/agrees quantum, and
// settles; an arbitration referral moves the claim to the arbiter. The
// seller-write set is guarded server-side.
// ─────────────────────────────────────────────────────────────────────────

export type CurtailmentStatus =
  | 'curtailment_logged'
  | 'classification_review'
  | 'claim_prepared'
  | 'claim_submitted'
  | 'validation_underway'
  | 'quantum_proposed'
  | 'quantum_agreed'
  | 'compensation_settled'
  | 'disputed'
  | 'arbitrated'
  | 'non_compensable'
  | 'withdrawn';

export type CurtailmentAction =
  | 'begin_classification'
  | 'confirm_compensable'
  | 'reject_non_compensable'
  | 'submit_claim'
  | 'begin_validation'
  | 'propose_quantum'
  | 'agree_quantum'
  | 'settle_compensation'
  | 'dispute'
  | 'recalculate'
  | 'refer_arbitration'
  | 'withdraw';

export type CurtailmentTier = 'utility_scale' | 'commercial' | 'embedded';

export type CurtailmentEvent =
  | 'curtailment_claim.classification_review'
  | 'curtailment_claim.claim_prepared'
  | 'curtailment_claim.claim_submitted'
  | 'curtailment_claim.validation_underway'
  | 'curtailment_claim.quantum_proposed'
  | 'curtailment_claim.quantum_agreed'
  | 'curtailment_claim.compensation_settled'
  | 'curtailment_claim.disputed'
  | 'curtailment_claim.arbitrated'
  | 'curtailment_claim.non_compensable'
  | 'curtailment_claim.withdrawn'
  | 'curtailment_claim.sla_breached';

const TERMINALS = new Set<CurtailmentStatus>([
  'compensation_settled', 'arbitrated', 'non_compensable', 'withdrawn',
]);

export function isTerminal(s: CurtailmentStatus): boolean {
  return TERMINALS.has(s);
}

// Active states a seller may withdraw from (anything pre-terminal).
const WITHDRAWABLE = new Set<CurtailmentStatus>([
  'curtailment_logged', 'classification_review', 'claim_prepared', 'claim_submitted',
  'validation_underway', 'quantum_proposed', 'quantum_agreed', 'disputed',
]);

export const TRANSITIONS: Record<CurtailmentAction, { from: CurtailmentStatus[]; to: CurtailmentStatus }> = {
  begin_classification:   { from: ['curtailment_logged'],                       to: 'classification_review' },
  confirm_compensable:    { from: ['classification_review'],                    to: 'claim_prepared' },
  reject_non_compensable: { from: ['classification_review'],                    to: 'non_compensable' },
  submit_claim:           { from: ['claim_prepared'],                           to: 'claim_submitted' },
  begin_validation:       { from: ['claim_submitted'],                          to: 'validation_underway' },
  propose_quantum:        { from: ['validation_underway'],                      to: 'quantum_proposed' },
  agree_quantum:          { from: ['quantum_proposed'],                         to: 'quantum_agreed' },
  settle_compensation:    { from: ['quantum_agreed'],                           to: 'compensation_settled' },
  dispute:                { from: ['quantum_proposed', 'quantum_agreed'],       to: 'disputed' },
  recalculate:            { from: ['disputed'],                                 to: 'quantum_proposed' },
  refer_arbitration:      { from: ['disputed'],                                 to: 'arbitrated' },
  withdraw:               { from: [...WITHDRAWABLE],                            to: 'withdrawn' },
};

export function nextStatus(current: CurtailmentStatus, action: CurtailmentAction): CurtailmentStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: CurtailmentStatus): CurtailmentAction[] {
  const acts: CurtailmentAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [CurtailmentAction, typeof TRANSITIONS[CurtailmentAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — utility_scale gets the TIGHTEST windows (debt-service-driven).
export const SLA_MINUTES: Record<CurtailmentStatus, Record<CurtailmentTier, number>> = {
  curtailment_logged: {
    utility_scale: 2 * DAY,    // begin classification
    commercial:    3 * DAY,
    embedded:      5 * DAY,
  },
  classification_review: {
    utility_scale: 3 * DAY,    // compensable vs not
    commercial:    5 * DAY,
    embedded:      7 * DAY,
  },
  claim_prepared: {
    utility_scale: 5 * DAY,    // seller assembles + submits the claim
    commercial:    7 * DAY,
    embedded:      10 * DAY,
  },
  claim_submitted: {
    utility_scale: 3 * DAY,    // buyer opens validation
    commercial:    5 * DAY,
    embedded:      7 * DAY,
  },
  validation_underway: {
    utility_scale: 10 * DAY,   // SCADA + resource-model validation
    commercial:    15 * DAY,
    embedded:      20 * DAY,
  },
  quantum_proposed: {
    utility_scale: 5 * DAY,    // agree or dispute
    commercial:    7 * DAY,
    embedded:      10 * DAY,
  },
  quantum_agreed: {
    utility_scale: 10 * DAY,   // settle payment
    commercial:    15 * DAY,
    embedded:      20 * DAY,
  },
  disputed: {
    utility_scale: 15 * DAY,   // recalculate or refer to arbitration
    commercial:    20 * DAY,
    embedded:      30 * DAY,
  },
  compensation_settled: { utility_scale: 0, commercial: 0, embedded: 0 },
  arbitrated:           { utility_scale: 0, commercial: 0, embedded: 0 },
  non_compensable:      { utility_scale: 0, commercial: 0, embedded: 0 },
  withdrawn:            { utility_scale: 0, commercial: 0, embedded: 0 },
};

export function slaDeadlineFor(status: CurtailmentStatus, tier: CurtailmentTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Materiality reportability applies to utility_scale + commercial claims;
// embedded / SSEG curtailment compensation sits below the NERSA threshold.
const REPORTABLE_TIERS = new Set<CurtailmentTier>(['utility_scale', 'commercial']);

export function isReportableTier(tier: CurtailmentTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

// The decisive / resolving actions that may touch the regulator: denying a claim
// (reject_non_compensable), settling compensation (settle_compensation), and
// referring a dispute to arbitration (refer_arbitration).
export function isResolutionAction(action: CurtailmentAction): boolean {
  return action === 'reject_non_compensable' || action === 'settle_compensation' || action === 'refer_arbitration';
}

// Reportability matrix:
//   - refer_arbitration crosses for EVERY tier — the universal hard line (a
//     formal arbitration referral is always notifiable)
//   - reject_non_compensable (denied claim → dispute risk) + settle_compensation
//     (large system-cost settlement) cross for utility_scale + commercial only
export function crossesIntoRegulator(action: CurtailmentAction, tier: CurtailmentTier): boolean {
  if (action === 'refer_arbitration') return true;
  if (action === 'reject_non_compensable' || action === 'settle_compensation') return REPORTABLE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: CurtailmentTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

// Party each action represents (contractual function), not the login role.
// The seller (IPP) submits / disputes / withdraws; the buyer (offtaker) runs
// classification, validation, quantum and settlement; an arbitration referral
// moves the matter to the arbiter.
const ACTION_PARTY: Record<CurtailmentAction, 'seller' | 'buyer' | 'arbiter'> = {
  submit_claim:           'seller',
  dispute:                'seller',
  withdraw:               'seller',
  begin_classification:   'buyer',
  confirm_compensable:    'buyer',
  reject_non_compensable: 'buyer',
  begin_validation:       'buyer',
  propose_quantum:        'buyer',
  recalculate:            'buyer',
  agree_quantum:          'buyer',
  settle_compensation:    'buyer',
  refer_arbitration:      'arbiter',
};

export function partyForAction(action: CurtailmentAction): 'seller' | 'buyer' | 'arbiter' {
  return ACTION_PARTY[action];
}

// Seller-side write set (guarded server-side via the seller-write split). The
// seller prepares + submits its claim, can dispute the buyer's quantum, and may
// withdraw the claim entirely.
const SELLER_ACTIONS = new Set<CurtailmentAction>(['submit_claim', 'dispute', 'withdraw']);

export function isSellerAction(action: CurtailmentAction): boolean {
  return SELLER_ACTIONS.has(action);
}
