// ─────────────────────────────────────────────────────────────────────────
// Wave 65 — Carbon ERPA (Emission Reduction Purchase Agreement) Forward
// Delivery & Make-Good chain (P6)
//
// An ERPA is the commercial FORWARD-SALE contract that sits on top of the carbon
// credit lifecycle. A buyer agrees today to purchase a contracted volume of
// emission reductions from a project's future issuance; the seller (project
// developer) must DELIVER that volume over a delivery schedule. If a scheduled
// delivery falls short of the contracted volume, a MAKE-GOOD provision obliges
// the seller to deliver replacement reductions (or the contract settles the
// shortfall in damages). This is the commercial counterpart to the regulatory /
// methodological carbon chains: where [[project-wave37-carbon-registration-chain]]
// registers a project, [[project-wave11-carbon-mrv-chain]] verifies each
// monitoring period, [[project-wave56-crediting-renewal-chain]] re-validates the
// crediting period, [[project-wave17-carbon-retirement-chain]] retires the credit
// and [[project-wave48-carbon-offset-claim-chain]] monetises the tax offset, THIS
// chain governs how the reductions are SOLD FORWARD and physically delivered
// against a binding purchase agreement.
//
//   erpa_drafted → erpa_executed → delivery_scheduled → delivery_initiated
//     → delivery_verified → settled → completed              (clean delivery)
//
// Shortfall / make-good branch (delivered volume < contracted volume):
//   delivery_initiated → shortfall_flagged → make_good_pending
//     → (initiate_delivery) → delivery_initiated → …          (re-deliver)
//   shortfall_flagged | make_good_pending → settled            (settle the gap)
//
// Dispute branch (either side contests a verified delivery or a settlement):
//   delivery_verified | settled → disputed → (resolve_dispute) → settled
//
// Branches / terminals:
//   completed  — the ERPA has been fully delivered and settled. [from settled]
//   terminated — early exit of an executed contract (default, force majeure,
//                non-delivery). [from erpa_executed | delivery_scheduled |
//                delivery_initiated | delivery_verified | shortfall_flagged |
//                make_good_pending | disputed]
//   withdrawn  — pulled before performance begins. [from erpa_drafted | erpa_executed]
//
// Tiers (5) by CONTRACTED VOLUME (tCO2e) — drive SLA + reportability:
//   minor <10k / moderate <100k / material <500k / major <2m / mega >=2m
//
// SLA matrix is INVERTED — the LARGER the contracted volume, the LONGER every
// window (a high-volume forward sale warrants a longer delivery and verification
// horizon). Same flavour as the rest of the carbon family
// ([[project-wave56-crediting-renewal-chain]] /
// [[project-wave48-carbon-offset-claim-chain]]).
//
// Reportability — the W65 SIGNATURE is CORRESPONDING-ADJUSTMENT driven. An ERPA
// carries a transfer_type: an Article 6.2/6.4 international transfer (ITMO) needs
// a CORRESPONDING ADJUSTMENT applied to the host country NDC accounting at the
// point the reductions are delivered — that is the double-counting / environmental-
// integrity event the DFFE DNA must see. So:
//   verify_delivery crosses for EVERY tier when the transfer requires a
//          corresponding adjustment (transfer_type === 'article6') — the
//          distinctive "a delivery confirmation is itself reportable" crossing;
//          else it crosses only for the large tiers (major + mega).
//   terminate crosses for the large tiers (major + mega) — an aborted high-volume
//          forward sale strands material contracted issuance and is notifiable.
//   sla_breached crosses for the large tiers (major + mega).
//
// Single carbon-fund desk write {admin, carbon_fund} — the desk records the whole
// ERPA lifecycle (same single-party model as every carbon chain: W37 / W11 / W17 /
// W42 / W48 / W56). actor_party tags the contractual function performing each step
// (seller / buyer / registry) for audit attribution only, NOT access.
// ─────────────────────────────────────────────────────────────────────────

export type ErpaStatus =
  | 'erpa_drafted'
  | 'erpa_executed'
  | 'delivery_scheduled'
  | 'delivery_initiated'
  | 'delivery_verified'
  | 'shortfall_flagged'
  | 'make_good_pending'
  | 'settled'
  | 'completed'
  | 'disputed'
  | 'terminated'
  | 'withdrawn';

export type ErpaAction =
  | 'execute_erpa'
  | 'schedule_delivery'
  | 'initiate_delivery'
  | 'verify_delivery'
  | 'flag_shortfall'
  | 'initiate_make_good'
  | 'settle'
  | 'complete'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'terminate'
  | 'withdraw';

export type ErpaTier = 'minor' | 'moderate' | 'material' | 'major' | 'mega';

export type ErpaParty = 'seller' | 'buyer' | 'registry';

export type ErpaTransferType = 'article6' | 'voluntary' | 'compliance';

export type ErpaEvent =
  | 'carbon_erpa.executed'
  | 'carbon_erpa.delivery_scheduled'
  | 'carbon_erpa.delivery_initiated'
  | 'carbon_erpa.delivery_verified'
  | 'carbon_erpa.shortfall_flagged'
  | 'carbon_erpa.make_good_pending'
  | 'carbon_erpa.settled'
  | 'carbon_erpa.completed'
  | 'carbon_erpa.disputed'
  | 'carbon_erpa.terminated'
  | 'carbon_erpa.withdrawn'
  | 'carbon_erpa.sla_breached';

const TERMINALS = new Set<ErpaStatus>(['completed', 'terminated', 'withdrawn']);

const WITHDRAWABLE = new Set<ErpaStatus>(['erpa_drafted', 'erpa_executed']);

export function isTerminal(s: ErpaStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: ErpaStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export const TRANSITIONS: Record<ErpaAction, { from: ErpaStatus[]; to: ErpaStatus }> = {
  execute_erpa:       { from: ['erpa_drafted'],                                   to: 'erpa_executed' },
  schedule_delivery:  { from: ['erpa_executed'],                                  to: 'delivery_scheduled' },
  initiate_delivery:  { from: ['delivery_scheduled', 'make_good_pending'],        to: 'delivery_initiated' },
  verify_delivery:    { from: ['delivery_initiated'],                             to: 'delivery_verified' },
  flag_shortfall:     { from: ['delivery_initiated'],                             to: 'shortfall_flagged' },
  initiate_make_good: { from: ['shortfall_flagged'],                              to: 'make_good_pending' },
  settle:             { from: ['delivery_verified', 'shortfall_flagged', 'make_good_pending'], to: 'settled' },
  complete:           { from: ['settled'],                                        to: 'completed' },
  raise_dispute:      { from: ['delivery_verified', 'settled'],                   to: 'disputed' },
  resolve_dispute:    { from: ['disputed'],                                       to: 'settled' },
  terminate:          { from: ['erpa_executed', 'delivery_scheduled', 'delivery_initiated', 'delivery_verified', 'shortfall_flagged', 'make_good_pending', 'disputed'], to: 'terminated' },
  withdraw:           { from: ['erpa_drafted', 'erpa_executed'],                  to: 'withdrawn' },
};

export function nextStatus(current: ErpaStatus, action: ErpaAction): ErpaStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: ErpaStatus): ErpaAction[] {
  const acts: ErpaAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [ErpaAction, typeof TRANSITIONS[ErpaAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const DAY = 24 * 60 * MIN;

// INVERTED matrix — the LARGER the contracted volume, the LONGER every window.
// Strictly increasing minor → mega per graded state. Terminals carry no deadline.
export const SLA_MINUTES: Record<ErpaStatus, Record<ErpaTier, number>> = {
  erpa_drafted: {
    minor: 14 * DAY, moderate: 21 * DAY, material: 30 * DAY, major: 45 * DAY, mega: 60 * DAY,
  },
  erpa_executed: {
    minor: 14 * DAY, moderate: 21 * DAY, material: 30 * DAY, major: 45 * DAY, mega: 60 * DAY,
  },
  delivery_scheduled: {
    minor: 30 * DAY, moderate: 45 * DAY, material: 60 * DAY, major: 90 * DAY, mega: 120 * DAY,
  },
  delivery_initiated: {
    minor: 7 * DAY, moderate: 10 * DAY, material: 14 * DAY, major: 21 * DAY, mega: 30 * DAY,
  },
  delivery_verified: {
    minor: 7 * DAY, moderate: 10 * DAY, material: 14 * DAY, major: 21 * DAY, mega: 30 * DAY,
  },
  shortfall_flagged: {
    minor: 10 * DAY, moderate: 14 * DAY, material: 21 * DAY, major: 30 * DAY, mega: 45 * DAY,
  },
  make_good_pending: {
    minor: 30 * DAY, moderate: 45 * DAY, material: 60 * DAY, major: 90 * DAY, mega: 120 * DAY,
  },
  settled: {
    minor: 7 * DAY, moderate: 10 * DAY, material: 14 * DAY, major: 21 * DAY, mega: 30 * DAY,
  },
  disputed: {
    minor: 14 * DAY, moderate: 21 * DAY, material: 30 * DAY, major: 45 * DAY, mega: 60 * DAY,
  },
  completed:  { minor: 0, moderate: 0, material: 0, major: 0, mega: 0 },
  terminated: { minor: 0, moderate: 0, material: 0, major: 0, mega: 0 },
  withdrawn:  { minor: 0, moderate: 0, material: 0, major: 0, mega: 0 },
};

export function slaWindowMinutes(status: ErpaStatus, tier: ErpaTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: ErpaStatus, tier: ErpaTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// 5 tiers by contracted volume in tCO2e.
export function tierForContractedVolume(tco2e: number): ErpaTier {
  if (tco2e < 10000) return 'minor';
  if (tco2e < 100000) return 'moderate';
  if (tco2e < 500000) return 'material';
  if (tco2e < 2000000) return 'major';
  return 'mega';
}

// An Article 6.2/6.4 international transfer (ITMO) requires a CORRESPONDING
// ADJUSTMENT to the host-country NDC accounting at delivery — the double-counting
// safeguard. Voluntary and compliance transfers do not.
export function requiresCorrespondingAdjustment(transferType: ErpaTransferType): boolean {
  return transferType === 'article6';
}

// The large-exposure tiers — reportability for terminations and SLA breaches
// attaches here; smaller forward sales sit below the notification threshold.
const LARGE_TIERS = new Set<ErpaTier>(['major', 'mega']);

export function isLargeTier(tier: ErpaTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportability matrix (the W65 signature):
//   - verify_delivery crosses for EVERY tier when the transfer requires a
//     corresponding adjustment (Article 6) — the distinctive crossing where a
//     delivery confirmation is itself reportable; else only for the large tiers.
//   - terminate crosses for the large tiers (major + mega) only.
export function crossesIntoRegulator(action: ErpaAction, tier: ErpaTier, requiresCA = false): boolean {
  if (action === 'verify_delivery') return requiresCA || LARGE_TIERS.has(tier);
  if (action === 'terminate')       return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: ErpaTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true when the
// transfer requires a corresponding adjustment OR the contracted volume is large.
export function isReportable(tier: ErpaTier, requiresCA: boolean): boolean {
  return requiresCA || LARGE_TIERS.has(tier);
}

// Party each action represents (contractual function), not the login role. The
// SELLER (project developer) drafts / executes / schedules / delivers / makes good
// / terminates / withdraws; the BUYER verifies receipt, flags a shortfall, settles
// payment and raises a dispute; the REGISTRY resolves disputes and closes out a
// fully-performed ERPA. Audit attribution only — same single-party model as W48 /
// W56.
const ACTION_PARTY: Record<ErpaAction, ErpaParty> = {
  execute_erpa:       'seller',
  schedule_delivery:  'seller',
  initiate_delivery:  'seller',
  verify_delivery:    'buyer',
  flag_shortfall:     'buyer',
  initiate_make_good: 'seller',
  settle:             'buyer',
  complete:           'registry',
  raise_dispute:      'buyer',
  resolve_dispute:    'registry',
  terminate:          'seller',
  withdraw:           'seller',
};

export function partyForAction(action: ErpaAction): ErpaParty {
  return ACTION_PARTY[action];
}
