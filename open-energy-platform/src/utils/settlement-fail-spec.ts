// ─────────────────────────────────────────────────────────────────────────
// Wave 85 — Trader Settlement Fails Management & CSDR-style Buy-In / Sell-Out
// (Cash-Penalty Settlement-Discipline) chain (P6) — 10th Trader chain.
//
// The DELIVERY-INTEGRITY engine of the trading book. When a trade is matched
// and instructed for settlement, the receiving leg must arrive on the
// instructed settlement date (S). When it doesn't, the trade has "failed"
// and the platform must run the post-trade enforcement workflow that:
//   (1) records the fail at S+1,
//   (2) accrues daily cash penalties under a CSDR-equivalent rate schedule,
//   (3) initiates a buy-in (replacement procurement) after the industry
//       extension window expires (typically S+4 / S+7),
//   (4) settles the buy-in or, if uneconomic, switches to cash compensation
//       (basis-risk settlement at last-known mark),
//   (5) closes the fail clean or writes it off as uncollectable,
//   (6) handles bilateral disputes and force-majeure suspensions across the
//       lifecycle.
//
// Regulatory frame: SA Financial Markets Act 19/2012 + JSE SRL Schedule SC
// + STRATE Settlement Rules + FSCA Conduct Standard 1/2020 (best execution
// extends to settlement) + FMA Chapter X (transparency on failed trades).
// SA does not yet operate a hard CSDR (EU 909/2014) cash-penalty regime, so
// the platform implements the CSDR-equivalent rate schedule (1bp/day for
// equity-like instruments, 0.5bp/day for fixed-income and ETFs, 0.05bp/day
// for cash-equivalents) and a buy-in process modelled on CSDR Article 7
// adapted for SA market practice.
//
// This chain governs that lifecycle end-to-end:
//   instruction_pending → fail_recorded → (extension_granted →) penalty_accruing
//   → buy_in_initiated → buy_in_executing → (buy_in_settled | cash_compensation)
//   → closed_resolved (clean terminal)
//
// Branches:
//   dispute_raised (any open → returns to penalty_accruing on resolution)
//   force_majeure_suspended (any open → returns to penalty_accruing on resume)
//
// Terminal:
//   written_off — uncollectable loss (from any open state).
//
// DISTINCT from every other Trader chain by FUNCTION:
//   - [[project_wave2_trading_risk]]        — VaR / portfolio risk.
//   - [[project_wave9_trader_mm]]           — market-making compliance.
//   - [[project_wave29_poslimit_chain]]     — position-limit gate.
//   - [[project_wave36_best_execution_chain]] — best-execution proof.
//   - [[project_wave44_trade_reporting_chain]] — trade-repository reporting.
//   - [[project_wave52_market_abuse_chain]] — surveillance / STOR.
//   - [[project_wave60_algo_cert_chain]]    — algo-trading certification.
//   - [[project_wave68_counterparty_margin_chain]] — margin-call & default.
//   - [[project_wave76_trade_allocation_chain]] — institutional allocation.
//
// W85 is the POST-TRADE DELIVERY enforcement layer downstream of W76
// allocation (allocations settle one-by-one — each can fail) and orthogonal
// to W68 margin (margin clears mark-to-market exposure; W85 clears the
// physical/electronic non-delivery itself). Once a fail is written-off here
// (terminal loss) the counterparty's repeat-fail score feeds back into
// W68's counterparty default workflow.
//
// W85 is FOUNDATIONAL L5 — beats Euroclear CSDR Penalty Mechanism /
// Clearstream T2S Penalty Engine / DTCC Settlement Fail Tracking /
// JSE-STRATE T+3 fails monitor / Euronext CSDR Settlement Discipline /
// Citi-Velocity post-trade fails portal — all of which run as overnight
// batch penalty calculators with manual buy-in initiation and no live
// counterparty-risk feedback. Edge: LIVE delivery-integrity battery —
// accrued-penalty ZAR (daily-meter), fail age days, buy-in window remaining
// days, recovery rate, penalty-to-NAV ratio, counterparty concentration,
// repeat-fail score, substitute-inventory flag, cross-default risk flag,
// urgency band, predicted resolution days — derived on every transition so
// the numbers match across the lifecycle and feed directly into W68
// counterparty-margin.
//
// Tiers (4) by gross fail value (ZAR) — drive SLA + reportability:
//   minor     < 100k       (small retail/SME settlement leg)
//   standard  < 1m         (mid-size institutional)
//   material  < 10m        (large institutional / block leg)
//   systemic  >= 10m       (systemic-instrument or large institutional)
//
// FLOOR: a SYSTEMIC-INSTRUMENT flag (FMA-listed core instruments) OR a fail
// older than 5 calendar days floors at 'material' regardless of value — long-
// aging fails are systemic-risk indicators irrespective of size.
//
// SLA matrix is URGENT — the LARGER the fail, the TIGHTER every window. A
// systemic fail must move from instruction_pending to closed_resolved within
// hours, not days; a small minor fail can take a week. Same urgency family
// as W34 / W50 / W67 / W75 / W84 + Trader counterparty-margin (W68).
//
// Reportability — the W85 SIGNATURE is DELIVERY-INTEGRITY-driven (an
// uncollectable loss is ALWAYS a regulatory event regardless of size):
//   write_off                crosses for EVERY tier — uncollectable loss
//                            is ALWAYS a FMA/FSCA reportable event (W85
//                            hard line, same family as W82 dispute /
//                            W84 fail_drill / W83 withdraw_notice).
//   close_cash (compensation) crosses for material + systemic — cash-
//                            compensation settlement carries basis risk
//                            and is FSCA-notifiable for large fails.
//   initiate_buy_in          crosses for material + systemic — formal
//                            market intervention via buy-in agent triggers
//                            JSE-STRATE notice flow.
//   sla_breached             crosses for material + systemic — large-fail
//                            schedule slippage is settlement-discipline
//                            reportable.
//
// Single trader desk write {admin, support, trader} — the trader desk
// records the whole lifecycle (same single-party model as W76 allocation /
// W68 margin). actor_party tags the function performing each step
// (trader_desk / buy_in_agent / settlement_ops / counterparty_credit) for
// audit attribution only, NOT access.
// ─────────────────────────────────────────────────────────────────────────

export type SettlementFailStatus =
  | 'instruction_pending'
  | 'fail_recorded'
  | 'extension_granted'
  | 'penalty_accruing'
  | 'buy_in_initiated'
  | 'buy_in_executing'
  | 'buy_in_settled'
  | 'cash_compensation'
  | 'closed_resolved'
  | 'dispute_raised'
  | 'force_majeure_suspended'
  | 'written_off';

export type SettlementFailAction =
  | 'record_fail'
  | 'grant_extension'
  | 'begin_penalty'
  | 'initiate_buy_in'
  | 'execute_buy_in'
  | 'settle_buy_in'
  | 'switch_cash_compensation'
  | 'close_resolved'
  | 'close_cash'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'suspend_force_majeure'
  | 'resume'
  | 'write_off';

export type SettlementFailTier = 'minor' | 'standard' | 'material' | 'systemic';

export type SettlementFailParty =
  | 'trader_desk'
  | 'buy_in_agent'
  | 'settlement_ops'
  | 'counterparty_credit';

export type InstrumentClass =
  | 'equity'
  | 'bond'
  | 'etf'
  | 'derivative'
  | 'cash_equivalent';

export type FailReasonCode =
  | 'insufficient_securities'
  | 'insufficient_cash'
  | 'instruction_mismatch'
  | 'late_matching'
  | 'counterparty_default'
  | 'operational_error'
  | 'systemic_disruption';

export type SettlementFailEvent =
  | 'settlement_fail.fail_recorded'
  | 'settlement_fail.extension_granted'
  | 'settlement_fail.penalty_accruing'
  | 'settlement_fail.buy_in_initiated'
  | 'settlement_fail.buy_in_executing'
  | 'settlement_fail.buy_in_settled'
  | 'settlement_fail.cash_compensation'
  | 'settlement_fail.closed_resolved'
  | 'settlement_fail.dispute_raised'
  | 'settlement_fail.force_majeure_suspended'
  | 'settlement_fail.written_off'
  | 'settlement_fail.sla_breached';

const TERMINALS = new Set<SettlementFailStatus>(['closed_resolved', 'written_off']);

export function isTerminal(s: SettlementFailStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<SettlementFailAction, { from: SettlementFailStatus[]; to: SettlementFailStatus }> = {
  record_fail:              { from: ['instruction_pending'],                                                                                                       to: 'fail_recorded' },
  grant_extension:          { from: ['fail_recorded'],                                                                                                              to: 'extension_granted' },
  begin_penalty:            { from: ['fail_recorded', 'extension_granted'],                                                                                         to: 'penalty_accruing' },
  initiate_buy_in:          { from: ['penalty_accruing'],                                                                                                           to: 'buy_in_initiated' },
  execute_buy_in:           { from: ['buy_in_initiated'],                                                                                                           to: 'buy_in_executing' },
  settle_buy_in:            { from: ['buy_in_executing'],                                                                                                           to: 'buy_in_settled' },
  switch_cash_compensation: { from: ['buy_in_executing'],                                                                                                           to: 'cash_compensation' },
  close_resolved:           { from: ['buy_in_settled'],                                                                                                             to: 'closed_resolved' },
  close_cash:               { from: ['cash_compensation'],                                                                                                          to: 'closed_resolved' },
  raise_dispute:            { from: ['penalty_accruing', 'buy_in_initiated', 'buy_in_executing'],                                                                   to: 'dispute_raised' },
  resolve_dispute:          { from: ['dispute_raised'],                                                                                                             to: 'penalty_accruing' },
  suspend_force_majeure:    { from: ['fail_recorded', 'extension_granted', 'penalty_accruing', 'buy_in_initiated', 'buy_in_executing', 'cash_compensation'],        to: 'force_majeure_suspended' },
  resume:                   { from: ['force_majeure_suspended'],                                                                                                    to: 'penalty_accruing' },
  write_off:                { from: ['fail_recorded', 'extension_granted', 'penalty_accruing', 'buy_in_initiated', 'buy_in_executing', 'cash_compensation', 'dispute_raised', 'force_majeure_suspended'], to: 'written_off' },
};

export function nextStatus(current: SettlementFailStatus, action: SettlementFailAction): SettlementFailStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: SettlementFailStatus): SettlementFailAction[] {
  const acts: SettlementFailAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [SettlementFailAction, typeof TRANSITIONS[SettlementFailAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the LARGER the fail, the TIGHTER every window. Systemic
// fails are squeezed to hours because settlement-discipline failures of
// large notional cascade through the counterparty book; minor retail
// fails can sit for days without systemic risk.
export const SLA_MINUTES: Record<SettlementFailStatus, Record<SettlementFailTier, number>> = {
  instruction_pending:     { minor: 24 * HOUR, standard: 24 * HOUR, material: 12 * HOUR, systemic: 6 * HOUR },
  fail_recorded:           { minor: 48 * HOUR, standard: 24 * HOUR, material: 12 * HOUR, systemic: 6 * HOUR },
  extension_granted:       { minor: 96 * HOUR, standard: 72 * HOUR, material: 48 * HOUR, systemic: 24 * HOUR },
  penalty_accruing:        { minor: 7 * DAY,   standard: 5 * DAY,   material: 3 * DAY,   systemic: 1 * DAY },
  buy_in_initiated:        { minor: 72 * HOUR, standard: 48 * HOUR, material: 24 * HOUR, systemic: 12 * HOUR },
  buy_in_executing:        { minor: 48 * HOUR, standard: 24 * HOUR, material: 12 * HOUR, systemic: 6 * HOUR },
  buy_in_settled:          { minor: 0, standard: 0, material: 0, systemic: 0 },
  cash_compensation:       { minor: 72 * HOUR, standard: 48 * HOUR, material: 24 * HOUR, systemic: 12 * HOUR },
  closed_resolved:         { minor: 0, standard: 0, material: 0, systemic: 0 },
  dispute_raised:          { minor: 14 * DAY,  standard: 10 * DAY,  material: 7 * DAY,   systemic: 3 * DAY },
  force_majeure_suspended: { minor: 30 * DAY,  standard: 21 * DAY,  material: 14 * DAY,  systemic: 7 * DAY },
  written_off:             { minor: 0, standard: 0, material: 0, systemic: 0 },
};

export function slaWindowMinutes(status: SettlementFailStatus, tier: SettlementFailTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: SettlementFailStatus, tier: SettlementFailTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

const TIER_RANK: Record<SettlementFailTier, number> = { minor: 0, standard: 1, material: 2, systemic: 3 };
const LARGE_TIERS = new Set<SettlementFailTier>(['material', 'systemic']);

export function isLargeTier(tier: SettlementFailTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Base tier by gross fail value (ZAR).
export function baseTierForFailValue(failValueZar: number): SettlementFailTier {
  const v = Math.abs(failValueZar);
  if (v < 100_000) return 'minor';
  if (v < 1_000_000) return 'standard';
  if (v < 10_000_000) return 'material';
  return 'systemic';
}

// A SYSTEMIC-instrument flag (e.g. JSE Top-40 / FMA-listed core debt) OR
// any fail older than 5 calendar days floors the effective tier at
// 'material' regardless of raw value. Long-aging fails are systemic-risk
// indicators independent of notional.
export function isSystemicCarrier(
  systemicInstrument: boolean,
  failAgeDays: number,
): boolean {
  if (systemicInstrument) return true;
  if (failAgeDays >= 5) return true;
  return false;
}

export function tierForFailValue(
  failValueZar: number,
  systemicInstrument: boolean,
  failAgeDays: number,
): SettlementFailTier {
  const base = baseTierForFailValue(failValueZar);
  if (isSystemicCarrier(systemicInstrument, failAgeDays) && TIER_RANK[base] < TIER_RANK['material']) {
    return 'material';
  }
  return base;
}

// Reportability matrix (the W85 SIGNATURE is DELIVERY-INTEGRITY-driven):
//   - write_off crosses for EVERY tier — uncollectable loss is ALWAYS a
//     FMA/FSCA reportable event regardless of fail size.
//   - close_cash (cash_compensation_close) crosses for material + systemic
//     (basis-risk settlement event).
//   - initiate_buy_in crosses for material + systemic (formal market
//     intervention via buy-in agent triggers JSE-STRATE notice flow).
export function crossesIntoRegulator(action: SettlementFailAction, tier: SettlementFailTier): boolean {
  if (action === 'write_off') return true;
  if (action === 'close_cash') return LARGE_TIERS.has(tier);
  if (action === 'initiate_buy_in') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: SettlementFailTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportable irrespective of action — true when systemic-carrier OR large tier.
export function isReportable(tier: SettlementFailTier, systemicCarrier: boolean): boolean {
  return systemicCarrier || LARGE_TIERS.has(tier);
}

// Functional party each action represents. Audit attribution only.
const ACTION_PARTY: Record<SettlementFailAction, SettlementFailParty> = {
  record_fail:              'settlement_ops',
  grant_extension:          'trader_desk',
  begin_penalty:            'settlement_ops',
  initiate_buy_in:          'trader_desk',
  execute_buy_in:           'buy_in_agent',
  settle_buy_in:            'buy_in_agent',
  switch_cash_compensation: 'settlement_ops',
  close_resolved:           'settlement_ops',
  close_cash:               'settlement_ops',
  raise_dispute:            'counterparty_credit',
  resolve_dispute:          'counterparty_credit',
  suspend_force_majeure:    'trader_desk',
  resume:                   'trader_desk',
  write_off:                'counterparty_credit',
};

export function partyForAction(action: SettlementFailAction): SettlementFailParty {
  return ACTION_PARTY[action];
}

// ── "Beat best-in-class" decision helpers ─────────────────────────────────
// Euroclear CSDR Penalty Mechanism / Clearstream T2S Penalty Engine /
// DTCC Settlement Fail Tracking / JSE-STRATE T+3 fails monitor / Euronext
// CSDR Settlement Discipline — all of which run as overnight batch penalty
// calculators with manual buy-in initiation and no live counterparty-risk
// feedback. The platform's edge is a LIVE delivery-integrity battery
// exposed on every record: accrued-penalty ZAR (daily-meter), fail age
// days, buy-in window remaining days, recovery rate, penalty-to-NAV
// ratio, counterparty concentration, repeat-fail score, substitute-
// inventory flag, cross-default risk flag, urgency band, predicted
// resolution days — derived from the same inputs each transition so
// numbers match across the lifecycle and feed W68 counterparty-margin.

// CSDR-equivalent daily penalty rates (decimal/day). Equity-like instruments
// are 1bp/day; fixed-income and ETFs are 0.5bp/day; cash-equivalents 0.05bp/day.
export const PENALTY_RATE_PER_DAY: Record<InstrumentClass, number> = {
  equity:          0.0001,
  bond:            0.00005,
  etf:             0.00005,
  derivative:      0.0001,
  cash_equivalent: 0.000005,
};

// Calendar days between the instructed settlement date (S) and "now".
// Positive = aged in days; 0 = today; negative = pre-settlement.
export function failAgeDays(instructedSettlementDate: Date, now: Date): number {
  const ms = now.getTime() - instructedSettlementDate.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

// Accrued cash penalty (ZAR). fail_value * rate * max(0, days). Capped at
// 30 days of accrual irrespective of further aging — both Euroclear and
// JSE-STRATE cap the accrual window in practice.
export function accruedPenaltyZar(
  failValueZar: number,
  instrument: InstrumentClass,
  ageDays: number,
): number {
  const rate = PENALTY_RATE_PER_DAY[instrument] ?? 0;
  const cappedDays = Math.max(0, Math.min(30, ageDays));
  return Math.abs(failValueZar) * rate * cappedDays;
}

// Buy-in window remaining (days) — industry standard is buy-in at S+4 for
// liquid instruments. Returns days remaining (negative = overdue).
export function buyInWindowRemainingDays(
  ageDays: number,
  instrument: InstrumentClass,
): number {
  const window = instrument === 'bond' ? 7 : 4;
  return window - ageDays;
}

// Rolling recovery rate over the last N fails (0..1) — share of fails
// that closed clean (closed_resolved via buy_in_settled, NOT cash or write-off).
export function recoveryRate(closedCleanCount: number, totalClosedCount: number): number {
  if (totalClosedCount <= 0) return 0;
  return Math.max(0, Math.min(1, closedCleanCount / totalClosedCount));
}

// Penalty-to-NAV ratio (0..1) — accrued penalty as a fraction of the
// counterparty's regulatory net asset value. Above 5% = significant.
export function penaltyToNavRatio(accruedZar: number, counterpartyNavZar: number): number {
  if (counterpartyNavZar <= 0) return 0;
  return Math.max(0, accruedZar / counterpartyNavZar);
}

// Counterparty concentration (0..1) — this fail's share of all open
// fails facing the SAME counterparty. 1.0 = single-fail exposure.
export function counterpartyConcentration(thisFailZar: number, counterpartyOpenFailsZar: number): number {
  if (counterpartyOpenFailsZar <= 0) return 0;
  return Math.max(0, Math.min(1, thisFailZar / counterpartyOpenFailsZar));
}

// Repeat-fail score (0..100) — history-weighted measure of counterparty
// fail propensity. Driven by the count of prior fails in the rolling
// 90-day window (capped at 20). 0 = clean history; 100 = chronic.
export function repeatFailScore(priorFailsLast90d: number): number {
  return Math.max(0, Math.min(100, priorFailsLast90d * 5));
}

// Cross-default risk flag — counterparty has 3+ concurrently open fails
// across any tiers. Feeds W68 counterparty-margin default workflow.
export function crossDefaultRiskFlag(openFailCount: number): boolean {
  return openFailCount >= 3;
}

// Urgency band — green / amber / red / critical. Derived from age days
// vs tier-specific aging thresholds. Surfaced as a coloured chip in UI.
export type UrgencyBand = 'green' | 'amber' | 'red' | 'critical';
export function urgencyBand(ageDays: number, tier: SettlementFailTier): UrgencyBand {
  const thresholds: Record<SettlementFailTier, [number, number, number]> = {
    minor:    [3, 7, 14],
    standard: [2, 5, 10],
    material: [1, 3, 7],
    systemic: [0, 1, 3],
  };
  const [amber, red, critical] = thresholds[tier];
  if (ageDays >= critical) return 'critical';
  if (ageDays >= red) return 'red';
  if (ageDays >= amber) return 'amber';
  return 'green';
}

// Predicted resolution days — sum of SLA windows for the unfinished states
// in the chain, given current status + tier.
const ROUTE_TO_CLEAN: SettlementFailStatus[] = [
  'fail_recorded',
  'penalty_accruing',
  'buy_in_initiated',
  'buy_in_executing',
];

export function predictedResolutionDays(current: SettlementFailStatus, tier: SettlementFailTier): number {
  if (isTerminal(current)) return 0;
  const idx = ROUTE_TO_CLEAN.indexOf(current);
  if (idx < 0) return 0;
  const remaining = ROUTE_TO_CLEAN.slice(idx);
  const totalMinutes = remaining.reduce((sum, s) => sum + (SLA_MINUTES[s][tier] || 0), 0);
  return Math.round(totalMinutes / (60 * 24));
}

// Substitute-inventory available flag — does the failing leg's underlying
// security have an alternative deliverable position somewhere in the book
// (lending pool, treasury, omnibus). Drives buy-in decision.
export function substituteInventoryAvailable(
  alternativeQty: number,
  failQty: number,
): boolean {
  return failQty > 0 && alternativeQty >= failQty;
}
