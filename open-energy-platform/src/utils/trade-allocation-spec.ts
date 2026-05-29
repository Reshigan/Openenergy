// ─────────────────────────────────────────────────────────────────────────
// Wave 76 — Trade Allocation, Give-Up & Confirmation/Affirmation chain (P6)
//
// When an institutional block trade executes on the venue, the trade is NOT
// done — it is the START of a post-execution processing chain. An asset manager
// splits ("allocates") the block across the underlying client / sub-accounts;
// where the executing broker is not the clearing broker the trade is "given up"
// to the clearing broker who must accept it; the executing broker issues a
// CONFIRMATION; the counterparty AFFIRMS it; central matching reconciles the two
// sides; settlement is instructed against standing settlement instructions (SSI)
// and the trade settles at the CSD. Any discrepancy at any step is a BREAK that
// must be flagged, reasoned and resolved — and under a CSDR-style settlement-
// discipline regime EVERY break / settlement fail is reportable to the regulator.
//
// This is the middle-/back-office institutional trade-processing lifecycle —
// distinct from the rest of the trading desk:
//   - [[project-wave2-trading-risk]] measures the venue's own MARKET risk (VaR)
//   - [[project-wave29-poslimit-chain]] caps regulatory POSITION SIZE (FSCA s41)
//   - [[project-wave36-best-execution-chain]] governs ORDER routing / RFQ quality
//   - [[project-wave3-settlement-p6]] is the venue's own atomic DvP settlement run
//   - [[project-wave44-trade-reporting-chain]] reports trades to the trade REPOSITORY
//   - [[project-wave52-market-abuse-chain]] surveils for ABUSE
//   - [[project-wave60-algo-cert-chain]] certifies the trading SYSTEMS
//   - [[project-wave68-counterparty-margin-chain]] manages COLLATERAL / default
// W76 governs the ALLOCATION → CONFIRMATION → AFFIRMATION → MATCH → SETTLEMENT-
// INSTRUCTION leg that turns a single executed block into per-account settled
// positions — the DTCC/Omgeo CTM central-matching and FIX-allocation surface,
// beaten with auto-allocation by standing SSI, same-day-affirmation (SDA) SLAs,
// real-time break detection and structured break reason codes feeding dispute.
//
// Forward path (full institutional life of a block):
//   executed → allocation_pending → allocated → give_up_pending → give_up_accepted
//     → confirmation_issued → affirmed → matched → settlement_instructed → settled
//
// Optional give-up — a self-cleared trade skips the give-up leg:
//   allocated → confirmation_issued (issue_confirmation accepts an allocated block)
//
// Break branch (CSDR settlement discipline) — a discrepancy at any processing step:
//   {allocated, give_up_pending, give_up_accepted, confirmation_issued, affirmed,
//    matched, settlement_instructed} → break_review → confirmation_issued (re-confirm)
//
// Cancel — pull a trade before it locks in (pre-affirmation, or out of a break):
//   {executed, allocation_pending, allocated, give_up_pending, give_up_accepted,
//    confirmation_issued, break_review} → cancelled
//
// Tiers (5) by TRADE NOTIONAL (ZAR):
//   micro <R1m / small <R10m / medium <R50m / large <R250m / block >=R250m
// LARGE_TIERS = {large, block}.
//
// SLA matrix is URGENT — the LARGER the notional, the TIGHTER every window
// (same-day-affirmation discipline: a block trade must affirm/match same day; a
// micro ticket has days). Same flavour as [[project-wave68-counterparty-margin-chain]] /
// [[project-wave34-load-curtailment-chain]] / [[project-wave67-grid-code-compliance-chain]].
//
// Reportability — the W76 SIGNATURE is BREAK-DRIVEN. Under settlement discipline
// every break / settlement fail is notifiable:
//   flag_break crosses for EVERY tier — the distinctive "the break is always
//        reportable" crossing (cf. W68 declare_default, W67 escalate_disconnection,
//        W60 invoke_kill_switch).
//   cancel_trade crosses for the LARGE tiers (large + block) — pulling a large
//        institutional trade post-execution is notifiable.
//   sla_breached crosses for the LARGE tiers (large + block).
//
// Single write — the trading desk / trade-processing ops drives every step;
// counterparties affirm / accept give-ups out-of-band. actor_party tags whether a
// step represents front office, middle office or the counterparty, for the audit
// trail. The route gates every action to the trader write set {admin, trader}.
// ─────────────────────────────────────────────────────────────────────────

export type AllocationStatus =
  | 'executed'
  | 'allocation_pending'
  | 'allocated'
  | 'give_up_pending'
  | 'give_up_accepted'
  | 'confirmation_issued'
  | 'affirmed'
  | 'matched'
  | 'settlement_instructed'
  | 'settled'
  | 'break_review'
  | 'cancelled';

export type AllocationAction =
  | 'prepare_allocation'
  | 'allocate_block'
  | 'designate_give_up'
  | 'accept_give_up'
  | 'issue_confirmation'
  | 'affirm_confirmation'
  | 'match_trade'
  | 'instruct_settlement'
  | 'settle_trade'
  | 'flag_break'
  | 'resolve_break'
  | 'cancel_trade';

export type AllocationTier = 'micro' | 'small' | 'medium' | 'large' | 'block';

export type AllocationParty = 'front_office' | 'middle_office' | 'counterparty';

export type AllocationEvent =
  | 'trade_allocation.allocation_pending'
  | 'trade_allocation.allocated'
  | 'trade_allocation.give_up_pending'
  | 'trade_allocation.give_up_accepted'
  | 'trade_allocation.confirmation_issued'
  | 'trade_allocation.affirmed'
  | 'trade_allocation.matched'
  | 'trade_allocation.settlement_instructed'
  | 'trade_allocation.settled'
  | 'trade_allocation.break_review'
  | 'trade_allocation.cancelled'
  | 'trade_allocation.sla_breached';

const TERMINALS = new Set<AllocationStatus>(['settled', 'cancelled']);

// States from which the trade can still be pulled (cancel_trade). Once a
// counterparty has AFFIRMED, a problem becomes a break — not a cancel.
const CANCELLABLE = new Set<AllocationStatus>([
  'executed',
  'allocation_pending',
  'allocated',
  'give_up_pending',
  'give_up_accepted',
  'confirmation_issued',
  'break_review',
]);

export function isTerminal(s: AllocationStatus): boolean {
  return TERMINALS.has(s);
}

export function isCancellable(s: AllocationStatus): boolean {
  return CANCELLABLE.has(s);
}

export const TRANSITIONS: Record<AllocationAction, { from: AllocationStatus[]; to: AllocationStatus }> = {
  prepare_allocation:  { from: ['executed'],                                     to: 'allocation_pending' },
  allocate_block:      { from: ['allocation_pending'],                           to: 'allocated' },
  designate_give_up:   { from: ['allocated'],                                    to: 'give_up_pending' },
  accept_give_up:      { from: ['give_up_pending'],                              to: 'give_up_accepted' },
  issue_confirmation:  { from: ['allocated', 'give_up_accepted', 'break_review'], to: 'confirmation_issued' },
  affirm_confirmation: { from: ['confirmation_issued'],                          to: 'affirmed' },
  match_trade:         { from: ['affirmed'],                                     to: 'matched' },
  instruct_settlement: { from: ['matched'],                                      to: 'settlement_instructed' },
  settle_trade:        { from: ['settlement_instructed'],                        to: 'settled' },
  flag_break:          { from: ['allocated', 'give_up_pending', 'give_up_accepted', 'confirmation_issued', 'affirmed', 'matched', 'settlement_instructed'], to: 'break_review' },
  resolve_break:       { from: ['break_review'],                                 to: 'confirmation_issued' },
  cancel_trade:        { from: ['executed', 'allocation_pending', 'allocated', 'give_up_pending', 'give_up_accepted', 'confirmation_issued', 'break_review'], to: 'cancelled' },
};

export function nextStatus(current: AllocationStatus, action: AllocationAction): AllocationStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: AllocationStatus): AllocationAction[] {
  const acts: AllocationAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [AllocationAction, typeof TRANSITIONS[AllocationAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the LARGER the notional, the TIGHTER every window. Strictly
// decreasing micro → block per graded state. Terminals carry no deadline.
export const SLA_MINUTES: Record<AllocationStatus, Record<AllocationTier, number>> = {
  executed: {
    micro: 3 * DAY, small: 2 * DAY, medium: 24 * HOUR, large: 8 * HOUR, block: 4 * HOUR,
  },
  allocation_pending: {
    micro: 2 * DAY, small: 24 * HOUR, medium: 8 * HOUR, large: 4 * HOUR, block: 2 * HOUR,
  },
  allocated: {
    micro: 2 * DAY, small: 24 * HOUR, medium: 8 * HOUR, large: 4 * HOUR, block: 2 * HOUR,
  },
  give_up_pending: {
    micro: 24 * HOUR, small: 12 * HOUR, medium: 6 * HOUR, large: 3 * HOUR, block: 90 * MIN,
  },
  give_up_accepted: {
    micro: 24 * HOUR, small: 12 * HOUR, medium: 6 * HOUR, large: 3 * HOUR, block: 90 * MIN,
  },
  confirmation_issued: {
    micro: 24 * HOUR, small: 8 * HOUR, medium: 4 * HOUR, large: 2 * HOUR, block: 60 * MIN,
  },
  affirmed: {
    micro: 12 * HOUR, small: 6 * HOUR, medium: 3 * HOUR, large: 90 * MIN, block: 45 * MIN,
  },
  matched: {
    micro: 12 * HOUR, small: 6 * HOUR, medium: 3 * HOUR, large: 90 * MIN, block: 45 * MIN,
  },
  settlement_instructed: {
    micro: 2 * DAY, small: 24 * HOUR, medium: 12 * HOUR, large: 6 * HOUR, block: 3 * HOUR,
  },
  break_review: {
    micro: 24 * HOUR, small: 8 * HOUR, medium: 4 * HOUR, large: 2 * HOUR, block: 60 * MIN,
  },
  settled:   { micro: 0, small: 0, medium: 0, large: 0, block: 0 },
  cancelled: { micro: 0, small: 0, medium: 0, large: 0, block: 0 },
};

export function slaWindowMinutes(status: AllocationStatus, tier: AllocationTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: AllocationStatus, tier: AllocationTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Base tier from the trade notional (ZAR).
export function tierForNotionalZar(zar: number): AllocationTier {
  if (zar < 1000000) return 'micro';
  if (zar < 10000000) return 'small';
  if (zar < 50000000) return 'medium';
  if (zar < 250000000) return 'large';
  return 'block';
}

// The LARGE tiers — reportability for cancels and SLA breaches attaches here.
const LARGE_TIERS = new Set<AllocationTier>(['large', 'block']);

export function isLargeTier(tier: AllocationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportability matrix (the W76 signature):
//   - flag_break crosses for EVERY tier — under settlement discipline every break
//     / settlement fail is notifiable to the regulator (FSCA / CSD).
//   - cancel_trade crosses for the LARGE tiers (large + block).
export function crossesIntoRegulator(action: AllocationAction, tier: AllocationTier): boolean {
  if (action === 'flag_break')   return true;
  if (action === 'cancel_trade') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: AllocationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true for the
// LARGE tiers (large + block).
export function isReportable(tier: AllocationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Party each action represents. The trading desk / trade-processing ops drives
// the machinery; affirm_confirmation + accept_give_up represent the counterparty.
// Audit attribution only — the route gates every action to the trader write set.
const ACTION_PARTY: Record<AllocationAction, AllocationParty> = {
  prepare_allocation:  'middle_office',
  allocate_block:      'middle_office',
  designate_give_up:   'middle_office',
  accept_give_up:      'counterparty',
  issue_confirmation:  'middle_office',
  affirm_confirmation: 'counterparty',
  match_trade:         'middle_office',
  instruct_settlement: 'middle_office',
  settle_trade:        'middle_office',
  flag_break:          'middle_office',
  resolve_break:       'middle_office',
  cancel_trade:        'front_office',
};

export function partyForAction(action: AllocationAction): AllocationParty {
  return ACTION_PARTY[action];
}
