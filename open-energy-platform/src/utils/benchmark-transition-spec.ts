// ─────────────────────────────────────────────────────────────────────────
// Wave 90 — Trader JIBAR Cessation Benchmark Transition & Fallback chain
// (P6) — 10th Trader chain.
//
// The TRANSITION-INTEGRITY engine of the trading book. JIBAR (Johannesburg
// Interbank Average Rate) is being permanently retired in favour of
// ZARONIA (South African Overnight Index Average) under SARB's Market
// Practitioners Group (MPG) reform roadmap. Every legacy JIBAR-referencing
// contract — IRS, basis swaps, FRAs, syndicated loans, FRNs, structured
// notes — must be transitioned to a ZARONIA-based replacement rate before
// the formal cessation date or fall through to the ISDA 2020 IBOR
// Fallbacks Protocol waterfall.
//
// This chain governs that lifecycle end-to-end PER REFERENCING CONTRACT:
//   inventoried -> impact_assessed -> classified -> notified ->
//   responded -> amendment_drafted -> amendment_executed -> vt_settled ->
//   transitioned_clean (terminal)
//
// Branches:
//   disputed             (any open -> returns to prior state on resolve)
//   on_hold              (any open -> returns to prior state on resume)
//
// Terminal alternatives:
//   terminated_legacy    — counterparty refuses repapering; legacy trade
//                          terminated/closed-out at fallback rate (loss
//                          recognised). ALWAYS regulator-crossing (SARB
//                          MPG transition-failure reporting).
//   cancelled            — pre-execution withdraw (inventoried only).
//
// Regulatory frame: SARB MPG Reform Plan (Communique 2024-12) + ISDA 2020
// IBOR Fallbacks Protocol (SA Annex) + FSCA Conduct Standard 1/2020
// (best-execution extends to transition mechanics) + FMA Chapter X
// (transparency on rate transitions) + JSE-SRL Schedule SC (settlement
// discipline through transition) + IFRS 9 hedge-accounting Phase 2 relief.
//
// DISTINCT from every other Trader chain by FUNCTION:
//   - [[project_wave2_trading_risk]]              VaR / portfolio risk.
//   - [[project_wave9_trader_mm]]                 market-making compliance.
//   - [[project_wave29_poslimit_chain]]           position-limit gate.
//   - [[project_wave36_best_execution_chain]]     best-execution proof.
//   - [[project_wave44_trade_reporting_chain]]    trade-repository reporting.
//   - [[project_wave52_market_abuse_chain]]       surveillance / STOR.
//   - [[project_wave60_algo_cert_chain]]          algo-trading certification.
//   - [[project_wave68_counterparty_margin_chain]] margin-call & default.
//   - [[project_wave76_trade_allocation_chain]]   institutional allocation.
//   - [[project_wave85_settlement_fail_chain]]    settlement-fails / CSDR.
//
// W90 is the BENCHMARK-REFORM repapering layer orthogonal to ALL other
// trader chains. Every IBOR-referencing trade in W76 allocation flows here
// before cessation; failed transitions feed W85 settlement-fail watch and
// W68 counterparty-margin (basis-risk re-grade). Once transitioned_clean
// the trade returns to BAU; once terminated_legacy the loss feeds W2 VaR.
//
// W90 is FOUNDATIONAL L5 — beats Bloomberg AIBOR/IBOR Transition module /
// ICE Benchmark Administration fallback service / ISDA 2020 IBOR Fallbacks
// Protocol adherence tracker / LCH SwapAgent transition / CME LIBOR
// Conversion Service / Murex MX.3 IBOR Transition / Calypso (Adenza)
// Benchmark Reform module / SoFi Reference Rate Transition Manager /
// Excel-based transition trackers — all of which are batch processors with
// manual amendment drafting and no live cessation-aware urgency. Edge:
// LIVE transition-integrity battery — PV01 ZAR, value-transfer ZAR
// (discounted cashflow differential), fallback basis spread bps (ISDA
// credit + term adjustment), days_to_cessation countdown, counterparty
// response rate, protocol adherence flag, compounded ZARONIA replacement
// rate, urgency band (cessation-aware), dispute concentration, predicted
// resolution days — re-derived on every transition so the numbers match
// across the lifecycle and feed W68 / W2 / W85.
//
// Tiers (4) by absolute notional_zar — drive SLA + reportability:
//   minor      < R10m       (single-name retail / SME)
//   standard   < R100m      (mid-size institutional)
//   material   < R1bn       (large institutional book)
//   systemic   >= R1bn      (systemic-instrument or interbank)
//
// FLOOR: an INTERBANK flag (counterparty is a SARB-registered bank) OR a
// transition with <30 days to cessation floors at 'material' regardless
// of notional — interbank exposures + last-minute transitions cascade
// systemic basis risk.
//
// SLA matrix is URGENT — the LARGER the notional, the TIGHTER every
// window. A systemic interbank transition must clear in days; a small
// retail JIBAR-FRN can take weeks. Same urgency family as W34 / W50 /
// W67 / W75 / W84 / W85.
//
// Reportability — the W90 SIGNATURE is TRANSITION-INTEGRITY-driven (a
// terminated legacy trade is ALWAYS a regulatory event regardless of
// size — SARB MPG must know about every missed transition):
//   terminate_legacy           crosses for EVERY tier — failed
//                              transition is ALWAYS a SARB/FSCA
//                              reportable event (W90 hard line, same
//                              family as W85 write_off / W82 dispute /
//                              W84 fail_drill / W83 withdraw_notice /
//                              W89 cancel_campaign).
//   complete_transition        crosses for material + systemic — large
//                              transitions trigger SARB MPG completion
//                              ledger.
//   raise_dispute              crosses for systemic — ISDA
//                              Determinations Committee referral on
//                              systemic-tier transitions only.
//   sla_breached               crosses for material + systemic — large-
//                              notional schedule slippage is reportable.
//
// Single trader desk write {admin, trader} — the trader desk + middle
// office records the whole lifecycle (same single-party model as W76
// allocation / W68 margin / W85 settlement-fail). actor_party tags the
// function performing each step (transition_desk / counterparty_credit /
// docs_legal / risk_validation) for audit attribution only, NOT access.
// ─────────────────────────────────────────────────────────────────────────

export type BenchmarkTransitionStatus =
  | 'inventoried'
  | 'impact_assessed'
  | 'classified'
  | 'notified'
  | 'responded'
  | 'amendment_drafted'
  | 'amendment_executed'
  | 'vt_settled'
  | 'transitioned_clean'
  | 'disputed'
  | 'on_hold'
  | 'terminated_legacy'
  | 'cancelled';

export type BenchmarkTransitionAction =
  | 'assess_impact'
  | 'classify_fallback'
  | 'notify_counterparty'
  | 'record_response'
  | 'draft_amendment'
  | 'execute_amendment'
  | 'settle_vt'
  | 'complete_transition'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'place_on_hold'
  | 'resume'
  | 'terminate_legacy'
  | 'cancel';

export type BenchmarkTransitionTier = 'minor' | 'standard' | 'material' | 'systemic';

export type BenchmarkTransitionParty =
  | 'transition_desk'
  | 'counterparty_credit'
  | 'docs_legal'
  | 'risk_validation';

export type LegacyBenchmark =
  | 'jibar_1m'
  | 'jibar_3m'
  | 'jibar_6m'
  | 'jibar_12m';

export type ReplacementRate =
  | 'zaronia_overnight'
  | 'compounded_zaronia_1m'
  | 'compounded_zaronia_3m'
  | 'compounded_zaronia_6m'
  | 'term_zaronia_1m'
  | 'term_zaronia_3m'
  | 'term_zaronia_6m';

export type InstrumentType =
  | 'irs'
  | 'basis_swap'
  | 'fra'
  | 'syndicated_loan'
  | 'frn'
  | 'structured_note'
  | 'cross_currency_swap';

export type FallbackClass =
  | 'isda_protocol'
  | 'bilateral_amendment'
  | 'tough_legacy'
  | 'pre_cessation';

export type BenchmarkTransitionEvent =
  | 'benchmark_transition.inventoried'
  | 'benchmark_transition.impact_assessed'
  | 'benchmark_transition.classified'
  | 'benchmark_transition.notified'
  | 'benchmark_transition.responded'
  | 'benchmark_transition.amendment_drafted'
  | 'benchmark_transition.amendment_executed'
  | 'benchmark_transition.vt_settled'
  | 'benchmark_transition.transitioned_clean'
  | 'benchmark_transition.disputed'
  | 'benchmark_transition.dispute_resolved'
  | 'benchmark_transition.on_hold'
  | 'benchmark_transition.resumed'
  | 'benchmark_transition.terminated_legacy'
  | 'benchmark_transition.cancelled'
  | 'benchmark_transition.sla_breached';

const TERMINALS = new Set<BenchmarkTransitionStatus>([
  'transitioned_clean',
  'terminated_legacy',
  'cancelled',
]);

export function isTerminal(s: BenchmarkTransitionStatus): boolean {
  return TERMINALS.has(s);
}

const OPEN_NON_TERMINAL: BenchmarkTransitionStatus[] = [
  'inventoried',
  'impact_assessed',
  'classified',
  'notified',
  'responded',
  'amendment_drafted',
  'amendment_executed',
  'vt_settled',
  'disputed',
  'on_hold',
];

const DISPUTE_FROM: BenchmarkTransitionStatus[] = [
  'classified',
  'notified',
  'responded',
  'amendment_drafted',
  'amendment_executed',
];

const HOLD_FROM: BenchmarkTransitionStatus[] = [
  'impact_assessed',
  'classified',
  'notified',
  'responded',
  'amendment_drafted',
];

const TERMINATE_FROM: BenchmarkTransitionStatus[] = [
  'classified',
  'notified',
  'responded',
  'amendment_drafted',
  'disputed',
  'on_hold',
];

export const TRANSITIONS: Record<BenchmarkTransitionAction, { from: BenchmarkTransitionStatus[]; to: BenchmarkTransitionStatus }> = {
  assess_impact:       { from: ['inventoried'],                    to: 'impact_assessed' },
  classify_fallback:   { from: ['impact_assessed'],                to: 'classified' },
  notify_counterparty: { from: ['classified'],                     to: 'notified' },
  record_response:     { from: ['notified'],                       to: 'responded' },
  draft_amendment:     { from: ['responded'],                      to: 'amendment_drafted' },
  execute_amendment:   { from: ['amendment_drafted'],              to: 'amendment_executed' },
  settle_vt:           { from: ['amendment_executed'],             to: 'vt_settled' },
  complete_transition: { from: ['vt_settled'],                     to: 'transitioned_clean' },
  raise_dispute:       { from: DISPUTE_FROM,                       to: 'disputed' },
  resolve_dispute:     { from: ['disputed'],                       to: 'classified' },
  place_on_hold:       { from: HOLD_FROM,                          to: 'on_hold' },
  resume:              { from: ['on_hold'],                        to: 'classified' },
  terminate_legacy:    { from: TERMINATE_FROM,                     to: 'terminated_legacy' },
  cancel:              { from: ['inventoried', 'impact_assessed'], to: 'cancelled' },
};

export function nextStatus(current: BenchmarkTransitionStatus, action: BenchmarkTransitionAction): BenchmarkTransitionStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: BenchmarkTransitionStatus): BenchmarkTransitionAction[] {
  const acts: BenchmarkTransitionAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [BenchmarkTransitionAction, typeof TRANSITIONS[BenchmarkTransitionAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the LARGER the notional, the TIGHTER every window.
// Systemic transitions face cessation cliff with material counterparty
// fan-out; minor retail JIBAR notes can be repapered over weeks.
export const SLA_MINUTES: Record<BenchmarkTransitionStatus, Record<BenchmarkTransitionTier, number>> = {
  inventoried:        { minor: 14 * DAY,  standard: 7 * DAY,   material: 3 * DAY,   systemic: 1 * DAY  },
  impact_assessed:    { minor: 14 * DAY,  standard: 7 * DAY,   material: 3 * DAY,   systemic: 1 * DAY  },
  classified:         { minor: 21 * DAY,  standard: 14 * DAY,  material: 7 * DAY,   systemic: 3 * DAY  },
  notified:           { minor: 30 * DAY,  standard: 21 * DAY,  material: 10 * DAY,  systemic: 5 * DAY  },
  responded:          { minor: 21 * DAY,  standard: 14 * DAY,  material: 7 * DAY,   systemic: 3 * DAY  },
  amendment_drafted:  { minor: 14 * DAY,  standard: 10 * DAY,  material: 5 * DAY,   systemic: 2 * DAY  },
  amendment_executed: { minor: 10 * DAY,  standard: 7 * DAY,   material: 3 * DAY,   systemic: 1 * DAY  },
  vt_settled:         { minor: 5 * DAY,   standard: 3 * DAY,   material: 2 * DAY,   systemic: 1 * DAY  },
  transitioned_clean: { minor: 0, standard: 0, material: 0, systemic: 0 },
  disputed:           { minor: 30 * DAY,  standard: 21 * DAY,  material: 14 * DAY,  systemic: 7 * DAY  },
  on_hold:            { minor: 60 * DAY,  standard: 45 * DAY,  material: 30 * DAY,  systemic: 14 * DAY },
  terminated_legacy:  { minor: 0, standard: 0, material: 0, systemic: 0 },
  cancelled:          { minor: 0, standard: 0, material: 0, systemic: 0 },
};

export function slaWindowMinutes(status: BenchmarkTransitionStatus, tier: BenchmarkTransitionTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: BenchmarkTransitionStatus, tier: BenchmarkTransitionTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

const TIER_RANK: Record<BenchmarkTransitionTier, number> = { minor: 0, standard: 1, material: 2, systemic: 3 };
const LARGE_TIERS = new Set<BenchmarkTransitionTier>(['material', 'systemic']);

export function isLargeTier(tier: BenchmarkTransitionTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Base tier by absolute notional (ZAR).
export function baseTierForNotional(notionalZar: number): BenchmarkTransitionTier {
  const v = Math.abs(notionalZar);
  if (v < 10_000_000) return 'minor';
  if (v < 100_000_000) return 'standard';
  if (v < 1_000_000_000) return 'material';
  return 'systemic';
}

// An INTERBANK flag (counterparty is a SARB-registered bank) OR <30 days
// to cessation floors the effective tier at 'material'. Both drive
// systemic basis risk independent of single-trade notional.
export function isSystemicCarrier(
  interbank: boolean,
  daysToCessation: number,
): boolean {
  if (interbank) return true;
  if (daysToCessation >= 0 && daysToCessation < 30) return true;
  return false;
}

export function tierForNotional(
  notionalZar: number,
  interbank: boolean,
  daysToCessation: number,
): BenchmarkTransitionTier {
  const base = baseTierForNotional(notionalZar);
  if (isSystemicCarrier(interbank, daysToCessation) && TIER_RANK[base] < TIER_RANK['material']) {
    return 'material';
  }
  return base;
}

// Reportability matrix (the W90 SIGNATURE is TRANSITION-INTEGRITY-driven):
//   - terminate_legacy crosses for EVERY tier — failed transition is
//     ALWAYS a SARB/FSCA reportable event regardless of notional.
//   - complete_transition crosses for material + systemic — large
//     transitions trigger SARB MPG completion ledger.
//   - raise_dispute crosses for systemic — ISDA Determinations Committee
//     referral on systemic-tier transitions only.
export function crossesIntoRegulator(action: BenchmarkTransitionAction, tier: BenchmarkTransitionTier): boolean {
  if (action === 'terminate_legacy') return true;
  if (action === 'complete_transition') return LARGE_TIERS.has(tier);
  if (action === 'raise_dispute') return tier === 'systemic';
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: BenchmarkTransitionTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportable irrespective of action — true when systemic-carrier OR large tier.
export function isReportable(tier: BenchmarkTransitionTier, systemicCarrier: boolean): boolean {
  return systemicCarrier || LARGE_TIERS.has(tier);
}

// Functional party each action represents. Audit attribution only.
const ACTION_PARTY: Record<BenchmarkTransitionAction, BenchmarkTransitionParty> = {
  assess_impact:       'risk_validation',
  classify_fallback:   'transition_desk',
  notify_counterparty: 'counterparty_credit',
  record_response:     'counterparty_credit',
  draft_amendment:     'docs_legal',
  execute_amendment:   'docs_legal',
  settle_vt:           'transition_desk',
  complete_transition: 'transition_desk',
  raise_dispute:       'counterparty_credit',
  resolve_dispute:     'counterparty_credit',
  place_on_hold:       'transition_desk',
  resume:              'transition_desk',
  terminate_legacy:    'transition_desk',
  cancel:              'transition_desk',
};

export function partyForAction(action: BenchmarkTransitionAction): BenchmarkTransitionParty {
  return ACTION_PARTY[action];
}

// ── "Beat best-in-class" decision helpers ─────────────────────────────────
// Bloomberg AIBOR/IBOR Transition / ICE Benchmark fallback / ISDA Protocol
// adherence tracker / LCH SwapAgent / CME LIBOR Conversion / Murex MX.3 /
// Calypso Benchmark Reform — batch processors with manual amendment
// drafting and no live cessation-aware urgency. Platform edge: a LIVE
// transition-integrity battery exposed on every record: PV01 ZAR, value-
// transfer ZAR (discounted cashflow differential), fallback basis spread
// bps (ISDA credit + term adjustment), days_to_cessation countdown,
// counterparty response rate, protocol adherence flag, compounded ZARONIA
// replacement rate, urgency band (cessation-aware), dispute concentration,
// predicted resolution days — re-derived on every transition so numbers
// match across the lifecycle.

// ISDA 2020 Fallback credit-adjustment spreads (decimal) for ZAR benchmark
// fallback. Anchored to the ISDA Fallbacks Supplement spread floor
// (median of 5y look-back) — values are illustrative SA-anchored proxies.
export const ISDA_SPREAD_BPS: Record<LegacyBenchmark, number> = {
  jibar_1m:  10.5,
  jibar_3m:  18.5,
  jibar_6m:  29.0,
  jibar_12m: 41.5,
};

// PV01 (price value of a basis point) in ZAR for a IRS/FRN. Approximated
// as |notional| * dv01_factor * remaining_years. dv01_factor defaults to
// 0.0001 (1bp) for linear IRS/FRN; basis-swap factor is half-weighted.
export function pv01Zar(
  notionalZar: number,
  remainingYears: number,
  instrument: InstrumentType,
): number {
  const w = instrument === 'basis_swap' ? 0.5 : 1;
  return Math.abs(notionalZar) * 0.0001 * Math.max(0, remainingYears) * w;
}

// Value transfer (ZAR) — discounted cashflow differential between legacy
// JIBAR cashflows and ZARONIA + ISDA-spread replacement cashflows over
// remaining life. Simplified: notional * spread * remaining_years.
export function valueTransferZar(
  notionalZar: number,
  remainingYears: number,
  legacy: LegacyBenchmark,
): number {
  const spread = ISDA_SPREAD_BPS[legacy] / 10000;
  return Math.abs(notionalZar) * spread * Math.max(0, remainingYears);
}

// Fallback basis spread in basis points for the ZARONIA+spread fallback.
export function fallbackBasisBps(legacy: LegacyBenchmark): number {
  return ISDA_SPREAD_BPS[legacy];
}

// Days remaining to formal cessation. Negative = past cessation.
export function daysToCessation(cessationDate: Date, now: Date): number {
  const ms = cessationDate.getTime() - now.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

// Counterparty response rate (0..1) — share of counterparty's open
// transitions that have moved past 'notified' state.
export function counterpartyResponseRate(responded: number, totalNotified: number): number {
  if (totalNotified <= 0) return 0;
  return Math.max(0, Math.min(1, responded / totalNotified));
}

// Protocol adherence flag — true when this transition is being driven
// via the ISDA 2020 IBOR Fallbacks Protocol (vs bilateral amendment).
// Protocol adherence is preferable — single signed Protocol covers the
// whole book.
export function protocolAdherenceFlag(fallbackClass: FallbackClass): boolean {
  return fallbackClass === 'isda_protocol';
}

// Compounded ZARONIA replacement rate (decimal). Simplified: today's
// overnight ZARONIA * (1 + spread). Used by UI/route to show what rate
// would replace the legacy benchmark.
export function compoundedZaroniaRate(
  zaroniaOvernight: number,
  legacy: LegacyBenchmark,
): number {
  return zaroniaOvernight + ISDA_SPREAD_BPS[legacy] / 10000;
}

// Cessation-aware urgency band — green / amber / red / critical.
// Critical when <30d to cessation OR on systemic tier and <90d.
export type UrgencyBand = 'green' | 'amber' | 'red' | 'critical';
export function urgencyBand(daysRemaining: number, tier: BenchmarkTransitionTier): UrgencyBand {
  if (daysRemaining < 0) return 'critical';
  if (daysRemaining < 30) return 'critical';
  if (tier === 'systemic' && daysRemaining < 90) return 'critical';
  if (daysRemaining < 90) return 'red';
  if (daysRemaining < 180) return 'amber';
  return 'green';
}

// Dispute concentration (0..1) — this trade's share of all open disputes
// vs the SAME counterparty. 1.0 = single-dispute exposure.
export function disputeConcentration(thisDisputeZar: number, counterpartyOpenDisputesZar: number): number {
  if (counterpartyOpenDisputesZar <= 0) return 0;
  return Math.max(0, Math.min(1, thisDisputeZar / counterpartyOpenDisputesZar));
}

// Predicted resolution days — sum of SLA windows for the unfinished
// states in the chain given current status + tier.
const ROUTE_TO_CLEAN: BenchmarkTransitionStatus[] = [
  'impact_assessed',
  'classified',
  'notified',
  'responded',
  'amendment_drafted',
  'amendment_executed',
  'vt_settled',
];

export function predictedResolutionDays(current: BenchmarkTransitionStatus, tier: BenchmarkTransitionTier): number {
  if (isTerminal(current)) return 0;
  const idx = ROUTE_TO_CLEAN.indexOf(current);
  if (idx < 0) return 0;
  const remaining = ROUTE_TO_CLEAN.slice(idx);
  const totalMinutes = remaining.reduce((sum, s) => sum + (SLA_MINUTES[s][tier] || 0), 0);
  return Math.round(totalMinutes / (60 * 24));
}

// Hedge-effectiveness flag — IFRS 9 Phase 2 relief requires economic
// equivalence between legacy and replacement legs. Returns true when
// the fallback basis spread is within the IFRS 9 economically-equivalent
// band (under 50 bps).
export function hedgeEffectivenessFlag(legacy: LegacyBenchmark): boolean {
  return ISDA_SPREAD_BPS[legacy] <= 50;
}

// Open / non-terminal helper for cron sweep.
export function isOpen(s: BenchmarkTransitionStatus): boolean {
  return OPEN_NON_TERMINAL.includes(s);
}
