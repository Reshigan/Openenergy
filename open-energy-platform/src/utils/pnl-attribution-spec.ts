// ─────────────────────────────────────────────────────────────────────────
// Wave 111 — Daily P&L Attribution & Risk-Adjusted Returns chain.
//
// 11th Trader chain. Distinct from W2 (rolling VaR), W9 (MM-compliance),
// W29 (position limits), W36 (best-execution), W44 (trade reporting),
// W52 (market-abuse surveillance), W60 (algo certification), W68
// (counterparty margin), W76 (trade allocation), W107 (pre-trade credit).
// W111 is the EOD P&L decomposition / risk-adjusted-returns / IFRS9-stage
// engine that runs every trading day per book and turns four numbers
// (MTM / realised / unrealised / total) into a stratified attribution
// (delta / gamma / vega / theta / FX / carry / residual), a risk-decomp
// (VaR contribution / scenario impact / KRI exceedances), a benchmark
// comparison (alpha / tracking error / information ratio), a 4-step
// authority ladder, a 17-field LIVE battery (incl. Sharpe / Sortino /
// Information / max-drawdown), and signature regulator crossings when
// restatements stack or attribution gaps blow out.
//
// Beats Murex MX.3 / Calypso / Bloomberg PORT / FIS Adaptiv / OpenLink
// Endur / OneTick / Imagine Risk / Kondor+ / Front Arena / SunGard
// FastVal — each surfaces daily P&L as a flat MTM tape + an Excel-glued
// attribution; W111 turns it into a 12-state P6 chain with URGENT SLA
// polarity (higher notional = TIGHTER review window), FLOOR-AT-MATERIAL
// tier overlay on 5 contextual flags, 4-step authority ladder, 17-field
// LIVE battery, signature SECOND-RESTATEMENT hard line, and 3-bridge
// architecture to W2 trading risk + W107 pre-trade credit + W44 trade
// reporting.
//
// Standards: FMA Ch.X (financial-markets governance) + FSCA Conduct
// Standard 1/2020 (governance + risk control) + IFRS 9 (Stage 1/2/3
// ECL classification on credit-sensitive positions) + IFRS 13 (Level
// 1/2/3 fair-value hierarchy) + Basel III FRTB IMA + SA (Standardised
// Approach) + GIPS 2020 (performance presentation) + MAR (market-abuse
// crossover).
//
// Forward path (clean day):
//   day_open → mtm_run → realised_computed → unrealised_computed
//     → attribution_decomposed → risk_decomposed → benchmark_compared
//     → reviewed → approved → published → reconciled → archived
//                                                      (HARD-terminal)
//
// Branches:
//   reviewed                  → held_for_review            (loop —
//                                                            override
//                                                            back to
//                                                            reviewed)
//   attribution_decomposed    → variance_investigation     (loop — back
//                                                            to
//                                                            attribution
//                                                            _decomposed)
//   any post-published        → restated                   (loop — back
//                                                            to mtm_run;
//                                                            W111
//                                                            SIGNATURE
//                                                            when within
//                                                            30d of
//                                                            previous
//                                                            restate)
//
// Tier RE-DERIVED on every transition from gross_notional_zar with
// FLOOR-AT-MATERIAL on 5 contextual flags:
//   - stress_period_active            (book is inside a flagged
//                                       stress-test window)
//   - restated_within_30d             (previous restatement within 30d)
//   - large_attribution_gap_pct_5_plus(attribution residual >= 5% of
//                                       gross P&L)
//   - regulatory_book_FRTB_IMA        (FRTB IMA book — internal model
//                                       approval)
//   - cross_border_consolidation      (book consolidates across
//                                       jurisdictions)
//
// 4 tiers:
//   minor    : < R10m gross notional
//   standard : R10m – R500m
//   material : R500m – R5b OR 1 floor flag
//   systemic : >= R5b OR 2+ floor flags OR FRTB_IMA OR cross-border
//
// URGENT SLA polarity stored as HOURS. Anchor on day_open (the EOD
// trigger window):
//   minor    × day_open = 24 hrs
//   standard × day_open = 18 hrs
//   material × day_open = 12 hrs
//   systemic × day_open =  6 hrs
//
// SIGNATURE regulator crossings (FMA Ch.X + FSCA CS 1/2020 + IFRS 9):
//   restate_pnl              → regulator EVERY tier when
//                               restated_within_30d (W111 SIGNATURE
//                               SECOND-RESTATEMENT hard line — second
//                               restatement within 30d is always
//                               reportable to FSCA + the audit
//                               committee; sister of W110 emergency_
//                               cancel + W109 downgrade composite_
//                               drop>=20% + W108 escalate_to_default +
//                               W107 reject_order counterparty_below_B)
//   flag_variance_investigation → regulator material + systemic when
//                                  attribution_gap_pct >= 10%
//   approve_pnl              → regulator systemic only when
//                               stress_period_active
//   publish_pnl              → regulator systemic only when
//                               FRTB_IMA
//   sla_breached             → material + systemic
//
// Write {admin, trader}. READ all 9 personas. actor_party split:
//   trader                : open_day, run_mtm, compute_realised,
//                            compute_unrealised
//   risk_analyst          : decompose_attribution, decompose_risk,
//                            flag_variance_investigation,
//                            compare_to_benchmark, submit_to_review
//   desk_head             : approve_pnl, hold_for_review,
//                            override_hold
//   market_risk_manager   : publish_pnl
//   finance               : reconcile, archive_pnl
//   CFO                   : restate_pnl
//
// Event prefix: `pnl_attribution_evt_`. AUDIT_PREFIX_MAP:
// pnl_attribution → 'trader'. Two crons:
//   - */15 * * * *   SLA sweep
//   - 0 18 * * *     T+1 EOD trigger (18:00 SAST) — opens a new
//                     day_open row per active book
// ─────────────────────────────────────────────────────────────────────────

export type PnaStatus =
  | 'day_open'
  | 'mtm_run'
  | 'realised_computed'
  | 'unrealised_computed'
  | 'attribution_decomposed'
  | 'risk_decomposed'
  | 'benchmark_compared'
  | 'reviewed'
  | 'approved'
  | 'published'
  | 'reconciled'
  | 'archived'
  | 'held_for_review'
  | 'variance_investigation'
  | 'restated';

export type PnaAction =
  | 'open_day'
  | 'run_mtm'
  | 'compute_realised'
  | 'compute_unrealised'
  | 'decompose_attribution'
  | 'decompose_risk'
  | 'compare_to_benchmark'
  | 'submit_to_review'
  | 'approve_pnl'
  | 'hold_for_review'
  | 'override_hold'
  | 'publish_pnl'
  | 'reconcile'
  | 'archive_pnl'
  | 'flag_variance_investigation'
  | 'restate_pnl';

export type PnaTier =
  | 'minor'
  | 'standard'
  | 'material'
  | 'systemic';

export type PnaParty =
  | 'trader'
  | 'risk_analyst'
  | 'desk_head'
  | 'market_risk_manager'
  | 'finance'
  | 'CFO';

export type PnaEvent =
  | 'pnl_attribution_day_opened'
  | 'pnl_attribution_mtm_ran'
  | 'pnl_attribution_realised_computed'
  | 'pnl_attribution_unrealised_computed'
  | 'pnl_attribution_attribution_decomposed'
  | 'pnl_attribution_risk_decomposed'
  | 'pnl_attribution_benchmark_compared'
  | 'pnl_attribution_submitted_to_review'
  | 'pnl_attribution_approved'
  | 'pnl_attribution_held_for_review'
  | 'pnl_attribution_hold_overridden'
  | 'pnl_attribution_published'
  | 'pnl_attribution_reconciled'
  | 'pnl_attribution_archived'
  | 'pnl_attribution_variance_flagged'
  | 'pnl_attribution_restated'
  | 'pnl_attribution_sla_breached';

// archived is the only HARD terminal — the chain officially closes
// there. restated loops back to mtm_run (re-run the day).
const HARD_TERMINALS = new Set<PnaStatus>([
  'archived',
]);

const UI_TERMINALS = new Set<PnaStatus>([
  'archived',
]);

export function isTerminal(s: PnaStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: PnaStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// All non-terminal states.
export const ALL_NON_TERMINAL: PnaStatus[] = [
  'day_open',
  'mtm_run',
  'realised_computed',
  'unrealised_computed',
  'attribution_decomposed',
  'risk_decomposed',
  'benchmark_compared',
  'reviewed',
  'approved',
  'published',
  'reconciled',
  'held_for_review',
  'variance_investigation',
  'restated',
];

// Post-published states can be restated. Until then there's nothing
// published to restate.
const POST_PUBLISHED: PnaStatus[] = [
  'published',
  'reconciled',
];

export const TRANSITIONS: Record<PnaAction, { from: PnaStatus[]; to: PnaStatus }> = {
  open_day:                    { from: ['day_open'],                                  to: 'day_open' },
  run_mtm:                     { from: ['day_open', 'restated'],                     to: 'mtm_run' },
  compute_realised:            { from: ['mtm_run'],                                   to: 'realised_computed' },
  compute_unrealised:          { from: ['realised_computed'],                         to: 'unrealised_computed' },
  decompose_attribution:       { from: ['unrealised_computed', 'variance_investigation'], to: 'attribution_decomposed' },
  decompose_risk:              { from: ['attribution_decomposed'],                    to: 'risk_decomposed' },
  compare_to_benchmark:        { from: ['risk_decomposed'],                           to: 'benchmark_compared' },
  submit_to_review:            { from: ['benchmark_compared'],                        to: 'reviewed' },
  approve_pnl:                 { from: ['reviewed'],                                  to: 'approved' },
  hold_for_review:             { from: ['reviewed'],                                  to: 'held_for_review' },
  override_hold:               { from: ['held_for_review'],                           to: 'reviewed' },
  publish_pnl:                 { from: ['approved'],                                  to: 'published' },
  reconcile:                   { from: ['published'],                                 to: 'reconciled' },
  archive_pnl:                 { from: ['reconciled'],                                to: 'archived' },
  flag_variance_investigation: { from: ['attribution_decomposed'],                    to: 'variance_investigation' },
  restate_pnl:                 { from: POST_PUBLISHED,                                to: 'restated' },
};

export function nextStatus(current: PnaStatus, action: PnaAction): PnaStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'open_day' && current !== 'day_open') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: PnaStatus): PnaAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: PnaAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [PnaAction, typeof TRANSITIONS[PnaAction]][]) {
    if (a === 'open_day') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// URGENT SLA polarity stored as HOURS. 0 == no SLA.
const HOUR = 1;
const DAY = 24 * HOUR;

export const SLA_HOURS: Record<PnaStatus, Record<PnaTier, number>> = {
  day_open:                { minor: 24, standard: 18, material: 12, systemic: 6 },
  mtm_run:                 { minor: 12, standard: 9,  material: 6,  systemic: 3 },
  realised_computed:       { minor: 8,  standard: 6,  material: 4,  systemic: 2 },
  unrealised_computed:     { minor: 8,  standard: 6,  material: 4,  systemic: 2 },
  attribution_decomposed:  { minor: 12, standard: 9,  material: 6,  systemic: 3 },
  risk_decomposed:         { minor: 8,  standard: 6,  material: 4,  systemic: 2 },
  benchmark_compared:      { minor: 8,  standard: 6,  material: 4,  systemic: 2 },
  reviewed:                { minor: 24, standard: 18, material: 12, systemic: 6 },
  approved:                { minor: 12, standard: 9,  material: 6,  systemic: 3 },
  published:               { minor: 1 * DAY, standard: 18, material: 12, systemic: 6 },
  reconciled:              { minor: 3 * DAY, standard: 2 * DAY, material: 1 * DAY, systemic: 12 },
  archived:                { minor: 0, standard: 0, material: 0, systemic: 0 },
  held_for_review:         { minor: 12, standard: 9,  material: 6,  systemic: 3 },
  variance_investigation:  { minor: 24, standard: 18, material: 12, systemic: 6 },
  restated:                { minor: 6,  standard: 4,  material: 3,  systemic: 2 },
};

export function slaWindowHours(status: PnaStatus, tier: PnaTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: PnaStatus, tier: PnaTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from gross_notional_zar.
//   < R10m         : minor
//   R10m – R500m   : standard
//   R500m – R5b    : material
//   >= R5b         : systemic
const R_10M = 10_000_000;
const R_500M = 500_000_000;
const R_5B = 5_000_000_000;

export function tierForNotional(grossNotionalZar: number | null | undefined): PnaTier {
  const n = Number(grossNotionalZar ?? 0);
  if (!isFinite(n) || n < 0) return 'minor';
  if (n >= R_5B) return 'systemic';
  if (n >= R_500M) return 'material';
  if (n >= R_10M) return 'standard';
  return 'minor';
}

export interface PnaFloorFlags {
  stress_period_active?: boolean | number | null;
  restated_within_30d?: boolean | number | null;
  large_attribution_gap_pct_5_plus?: boolean | number | null;
  regulatory_book_FRTB_IMA?: boolean | number | null;
  cross_border_consolidation?: boolean | number | null;
}

export function countFloorFlags(args: PnaFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.stress_period_active) +
    t(args.restated_within_30d) +
    t(args.large_attribution_gap_pct_5_plus) +
    t(args.regulatory_book_FRTB_IMA) +
    t(args.cross_border_consolidation)
  );
}

// FLOOR-AT-MATERIAL on any one of the 5 contextual flags.
export function floorAtMaterial(args: PnaFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-SYSTEMIC on:
//   - 2+ floor flags
//   - FRTB IMA (always systemic — internal model approval book)
//   - cross-border consolidation (always systemic)
export function floorAtSystemic(args: PnaFloorFlags): boolean {
  if (countFloorFlags(args) >= 2) return true;
  if (args.regulatory_book_FRTB_IMA) return true;
  if (args.cross_border_consolidation) return true;
  return false;
}

export function effectiveTier(
  rawTier: PnaTier,
  flags: PnaFloorFlags,
): PnaTier {
  if (floorAtSystemic(flags)) return 'systemic';
  if (floorAtMaterial(flags)) {
    if (rawTier === 'minor' || rawTier === 'standard') return 'material';
    return rawTier;
  }
  return rawTier;
}

// Heavy tiers — material + systemic. Where reportability + signature
// crossings attach when not on universal hard lines.
const HEAVY_TIERS = new Set<PnaTier>(['material', 'systemic']);

export function isHeavyTier(tier: PnaTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: PnaTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
export function crossesIntoRegulator(
  action: PnaAction,
  tier: PnaTier,
  args: {
    restated_within_30d?: boolean | number | null;
    stress_period_active?: boolean | number | null;
    regulatory_book_FRTB_IMA?: boolean | number | null;
    attribution_gap_pct?: number | null;
  },
): boolean {
  const secondRestate = Boolean(args.restated_within_30d);
  const stress = Boolean(args.stress_period_active);
  const frtbIma = Boolean(args.regulatory_book_FRTB_IMA);
  const gap = Number(args.attribution_gap_pct ?? 0);

  // W111 SIGNATURE: restate_pnl crosses EVERY tier when within 30d of
  // a previous restatement (second-restatement hard line).
  if (action === 'restate_pnl') {
    return secondRestate;
  }

  // flag_variance_investigation crosses material + systemic when
  // attribution gap >= 10%.
  if (action === 'flag_variance_investigation') {
    if (!HEAVY_TIERS.has(tier)) return false;
    return gap >= 10;
  }

  // approve_pnl crosses systemic only when stress_period_active.
  if (action === 'approve_pnl') {
    if (tier !== 'systemic') return false;
    return stress;
  }

  // publish_pnl crosses systemic only when FRTB IMA book.
  if (action === 'publish_pnl') {
    if (tier !== 'systemic') return false;
    return frtbIma;
  }

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: PnaTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<PnaAction, PnaParty> = {
  open_day:                    'trader',
  run_mtm:                     'trader',
  compute_realised:            'trader',
  compute_unrealised:          'trader',
  decompose_attribution:       'risk_analyst',
  decompose_risk:              'risk_analyst',
  compare_to_benchmark:        'risk_analyst',
  submit_to_review:            'risk_analyst',
  approve_pnl:                 'desk_head',
  hold_for_review:             'desk_head',
  override_hold:               'desk_head',
  publish_pnl:                 'market_risk_manager',
  reconcile:                   'finance',
  archive_pnl:                 'finance',
  flag_variance_investigation: 'risk_analyst',
  restate_pnl:                 'CFO',
};

export function partyForAction(action: PnaAction): PnaParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: PnaAction): PnaEvent | null {
  switch (action) {
    case 'open_day':                    return 'pnl_attribution_day_opened';
    case 'run_mtm':                     return 'pnl_attribution_mtm_ran';
    case 'compute_realised':            return 'pnl_attribution_realised_computed';
    case 'compute_unrealised':          return 'pnl_attribution_unrealised_computed';
    case 'decompose_attribution':       return 'pnl_attribution_attribution_decomposed';
    case 'decompose_risk':              return 'pnl_attribution_risk_decomposed';
    case 'compare_to_benchmark':        return 'pnl_attribution_benchmark_compared';
    case 'submit_to_review':            return 'pnl_attribution_submitted_to_review';
    case 'approve_pnl':                 return 'pnl_attribution_approved';
    case 'hold_for_review':             return 'pnl_attribution_held_for_review';
    case 'override_hold':               return 'pnl_attribution_hold_overridden';
    case 'publish_pnl':                 return 'pnl_attribution_published';
    case 'reconcile':                   return 'pnl_attribution_reconciled';
    case 'archive_pnl':                 return 'pnl_attribution_archived';
    case 'flag_variance_investigation': return 'pnl_attribution_variance_flagged';
    case 'restate_pnl':                 return 'pnl_attribution_restated';
  }
}

// ─── LIVE battery (17-field decoration) ─────────────────────────────────

export function slaHoursRemaining(
  status: PnaStatus,
  tier: PnaTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type PnaUrgency = 'critical' | 'high' | 'medium' | 'low';

// URGENT polarity: systemic tier has the tightest urgency thresholds.
export function urgencyBand(
  tier: PnaTier,
  slaHoursLeft: number,
): PnaUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'systemic') {
    if (slaHoursLeft < 1) return 'critical';
    if (slaHoursLeft < 3) return 'high';
    if (slaHoursLeft < 6) return 'medium';
    return 'low';
  }
  if (tier === 'material') {
    if (slaHoursLeft < 2)  return 'critical';
    if (slaHoursLeft < 6)  return 'high';
    if (slaHoursLeft < 12) return 'medium';
    return 'low';
  }
  if (tier === 'standard') {
    if (slaHoursLeft < 4)  return 'critical';
    if (slaHoursLeft < 9)  return 'high';
    if (slaHoursLeft < 18) return 'medium';
    return 'low';
  }
  // minor
  if (slaHoursLeft < 6)   return 'critical';
  if (slaHoursLeft < 12)  return 'high';
  if (slaHoursLeft < 24)  return 'medium';
  return 'low';
}

// 4-step authority ladder driven by effective tier.
export type PnaAuthority =
  | 'trader'
  | 'desk_head'
  | 'market_risk_manager'
  | 'CFO';

export function authorityRequired(tier: PnaTier): PnaAuthority {
  switch (tier) {
    case 'minor':    return 'trader';
    case 'standard': return 'desk_head';
    case 'material': return 'market_risk_manager';
    case 'systemic': return 'CFO';
  }
}

// Regulator filing window hours — how fast a regulator-crossing event
// must be filed.
export function regulatorFilingWindowHours(tier: PnaTier): number {
  switch (tier) {
    case 'systemic': return 1;
    case 'material': return 4;
    case 'standard': return 24;
    case 'minor':    return 72;
  }
}

// ─── 3-bridge architecture ──────────────────────────────────────────────
// W2 trading risk (rolling VaR / scenario) / W107 pre-trade credit
// (pre-trade gate) / W44 trade reporting (post-trade reporting).
export function bridgesToTradingRiskChain(
  tradingRiskRef: string | null | undefined,
): boolean {
  return !!tradingRiskRef;
}

export function bridgesToPretradeCreditChain(
  pretradeCreditRef: string | null | undefined,
): boolean {
  return !!pretradeCreditRef;
}

export function bridgesToTradeReportingChain(
  tradeReportingRef: string | null | undefined,
): boolean {
  return !!tradeReportingRef;
}

// ─── Performance ratios (GIPS 2020) ─────────────────────────────────────

// Sharpe ratio = (return - risk_free) / stdev. Risk-free defaults to
// SARB repo rate proxy (8.25% annualised expressed daily). We work in
// daily returns so the comparable proxy is 8.25% / 252.
const DAILY_RISK_FREE_PROXY = 0.0825 / 252;

export function sharpeRatio(
  meanDailyReturn: number | null | undefined,
  stdevDailyReturn: number | null | undefined,
  dailyRiskFree?: number | null,
): number {
  const r = Number(meanDailyReturn ?? 0);
  const s = Number(stdevDailyReturn ?? 0);
  if (!isFinite(r) || !isFinite(s) || s <= 0) return 0;
  const rf = Number(dailyRiskFree ?? DAILY_RISK_FREE_PROXY);
  const sharpe = (r - rf) / s;
  if (!isFinite(sharpe)) return 0;
  return Math.round(sharpe * 10000) / 10000;
}

// Sortino ratio = (return - risk_free) / downside_stdev. Same input
// shape as Sharpe but stdev is downside-only.
export function sortinoRatio(
  meanDailyReturn: number | null | undefined,
  downsideStdevDailyReturn: number | null | undefined,
  dailyRiskFree?: number | null,
): number {
  const r = Number(meanDailyReturn ?? 0);
  const s = Number(downsideStdevDailyReturn ?? 0);
  if (!isFinite(r) || !isFinite(s) || s <= 0) return 0;
  const rf = Number(dailyRiskFree ?? DAILY_RISK_FREE_PROXY);
  const sortino = (r - rf) / s;
  if (!isFinite(sortino)) return 0;
  return Math.round(sortino * 10000) / 10000;
}

// Information ratio = (return - benchmark) / tracking_error.
export function informationRatio(
  meanDailyReturn: number | null | undefined,
  benchmarkDailyReturn: number | null | undefined,
  trackingError: number | null | undefined,
): number {
  const r = Number(meanDailyReturn ?? 0);
  const b = Number(benchmarkDailyReturn ?? 0);
  const te = Number(trackingError ?? 0);
  if (!isFinite(r) || !isFinite(b) || !isFinite(te) || te <= 0) return 0;
  const ir = (r - b) / te;
  if (!isFinite(ir)) return 0;
  return Math.round(ir * 10000) / 10000;
}

// Max drawdown pct — peak-to-trough loss as % of peak equity.
export function maxDrawdownPct(
  peakEquity: number | null | undefined,
  troughEquity: number | null | undefined,
): number {
  const p = Number(peakEquity ?? 0);
  const t = Number(troughEquity ?? 0);
  if (!isFinite(p) || !isFinite(t) || p <= 0) return 0;
  if (t >= p) return 0;
  const dd = ((p - t) / p) * 100;
  if (!isFinite(dd)) return 0;
  return Math.round(dd * 100) / 100;
}

// Attribution gap pct — residual / |gross P&L|.
export function attributionGapPct(
  residualZar: number | null | undefined,
  grossPnlZar: number | null | undefined,
): number {
  const r = Math.abs(Number(residualZar ?? 0));
  const g = Math.abs(Number(grossPnlZar ?? 0));
  if (!isFinite(r) || !isFinite(g) || g <= 0) return 0;
  const gap = (r / g) * 100;
  if (!isFinite(gap)) return 0;
  return Math.round(gap * 100) / 100;
}

// Total daily P&L = realised + unrealised. ZAR.
export function totalDailyPnlZar(
  realised: number | null | undefined,
  unrealised: number | null | undefined,
): number {
  const r = Number(realised ?? 0);
  const u = Number(unrealised ?? 0);
  return Math.round((r + u) * 100) / 100;
}

// IFRS 9 stage classification — Stage 1 (performing) / Stage 2
// (significant increase in credit risk) / Stage 3 (credit-impaired).
// Driven by attribution_gap, restate-history, and stress flag.
export type Ifrs9Stage = 'stage_1' | 'stage_2' | 'stage_3';

export function ifrs9StageClassification(args: {
  attribution_gap_pct?: number | null;
  restated_within_30d?: boolean | number | null;
  stress_period_active?: boolean | number | null;
  total_daily_pnl_zar?: number | null;
}): Ifrs9Stage {
  const gap = Number(args.attribution_gap_pct ?? 0);
  const restate = Boolean(args.restated_within_30d);
  const stress = Boolean(args.stress_period_active);
  const total = Number(args.total_daily_pnl_zar ?? 0);

  // Stage 3 = credit-impaired. Second restatement OR gap >= 20% OR
  // catastrophic loss day combined with stress.
  if (restate && gap >= 10) return 'stage_3';
  if (gap >= 20) return 'stage_3';
  if (stress && total < -100_000_000) return 'stage_3';

  // Stage 2 = significant increase. gap >= 10% OR stress period OR
  // single restatement signal OR negative material P&L.
  if (gap >= 10) return 'stage_2';
  if (stress) return 'stage_2';
  if (restate) return 'stage_2';
  if (total < -10_000_000) return 'stage_2';

  return 'stage_1';
}

// P&L completeness index 0-130 — how many key milestones are stamped.
export function pnlCompletenessIndex(args: {
  mtm_run?: boolean | number | null;
  realised_computed?: boolean | number | null;
  unrealised_computed?: boolean | number | null;
  attribution_decomposed?: boolean | number | null;
  risk_decomposed?: boolean | number | null;
  benchmark_compared?: boolean | number | null;
  reviewed?: boolean | number | null;
  approved?: boolean | number | null;
  published?: boolean | number | null;
  reconciled?: boolean | number | null;
  archived?: boolean | number | null;
  no_hold_bonus?: boolean | number | null;
  no_variance_bonus?: boolean | number | null;
  no_restate_bonus?: boolean | number | null;
  ifrs9_stage1_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.mtm_run)                * 10;
  score += t(args.realised_computed)      * 10;
  score += t(args.unrealised_computed)    * 10;
  score += t(args.attribution_decomposed) * 15;
  score += t(args.risk_decomposed)        * 10;
  score += t(args.benchmark_compared)     * 10;
  score += t(args.reviewed)               * 10;
  score += t(args.approved)               * 10;
  score += t(args.published)              * 10;
  score += t(args.reconciled)             * 10;
  score += t(args.archived)               * 5;
  score += t(args.no_hold_bonus)          * 5;
  score += t(args.no_variance_bonus)      * 6;
  score += t(args.no_restate_bonus)       * 10;
  score += t(args.ifrs9_stage1_bonus)     * 9;
  if (score > 130) score = 130;
  return score;
}

// Variance investigation imminent? Within 1pct of the 10% signature
// threshold AND attribution decomposed but not yet flagged.
export function isVarianceInvestigationImminent(
  status: PnaStatus,
  attributionGap: number,
): boolean {
  if (status !== 'attribution_decomposed') return false;
  return attributionGap >= 9 && attributionGap < 10;
}

// Restate risk? On published / reconciled and attribution gap >= 5%.
export function isRestateRisk(
  status: PnaStatus,
  attributionGap: number,
): boolean {
  if (status !== 'published' && status !== 'reconciled') return false;
  return attributionGap >= 5;
}
