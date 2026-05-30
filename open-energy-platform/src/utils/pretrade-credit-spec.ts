// ─────────────────────────────────────────────────────────────────────────
// Wave 107 — Trader Pre-Trade Credit Check & Settlement-Risk Exposure (P6)
//
// 10th Trader chain. Pre-trade GATE is the synchronous front-end every
// other Trader chain assumes was cleared: W2 trading-risk, W9 MM compliance,
// W29 position-limit, W36 best-execution, W44 trade-reporting, W52 market-
// abuse, W60 algo-cert, W68 counterparty-margin, W76 trade-allocation —
// each models post-execution behaviour. W107 makes the PRE side a 12-state
// P6 chain: kyc → credit-line → settlement-risk → concentration → halt →
// mark-age → cleared → archived, plus rejected / held_for_review /
// manually_cleared / manually_rejected / override branches.
//
// Beats Numerix CrossAsset Pre-Trade / Calypso Pre-Trade Limits / Bloomberg
// AIM Pre-Trade Compliance / Murex MX.3 PFE / FIS Front Arena / OpenLink
// Endur Pre-Deal / SAS Risk Management / Misys Kondor+ / Wall Street
// Systems Front-Arena — these vendors surface pre-trade as one large
// blocking rule-set evaluator. W107 turns it into a 12-state state machine
// with LIVE composite battery, FLOOR-AT-MATERIAL tier overlay, URGENT
// sub-second SLA (systemic 500ms, material 2s, standard 10s, micro 30s),
// 4-step authority ladder (junior_trader → desk_head → market_risk_manager
// → CRO), 14-field LIVE battery with 3-bridge architecture to W2/W29/W68,
// and signature regulator crossings.
//
// Standards: FMA Ch.X §50 + FSCA Conduct Standard 1/2020 + BIS PFMI §3.5
// (CCP credit risk) + CFTC Reg 1.73 (clearing FCM risk) + MiFID II Art 17
// (algorithmic trading pre-trade controls).
//
// Forward path (clean clear):
//   order_submitted → kyc_verified → credit_line_checked
//     → settlement_risk_assessed → concentration_checked
//     → halt_status_verified → mark_age_validated → cleared (soft terminal)
//     → archived (hard terminal)
//
// Branches:
//   any pre-clear gate → rejected (hard terminal)
//   any pre-clear gate → held_for_review (SLA-trigger or borderline)
//     → manually_cleared → cleared
//     OR manually_rejected → rejected
//   rejected → cleared (via override_rejection — compliance override)
//
// 4 tiers RE-DERIVED on every transition from notional_exposure_zar +
// 5 floor flags. FLOOR-AT-MATERIAL on any of:
//   - cross_border_settlement
//   - counterparty_credit_grade_below_B
//   - concentration_above_25pct
//   - halted_underlying
//   - first_trade_with_counterparty
// FLOOR-AT-SYSTEMIC on cross_border_settlement OR
// counterparty_credit_grade_below_B (each is a systemic-level signal).
//
// URGENT SLA polarity stored as sla_target_ms BIGINT for sub-second
// precision: order_submitted systemic 500ms / material 2s / standard 10s
// / micro 30s. SLA breach itself routes the row to held_for_review.
//
// SIGNATURE regulator crossings (FMA Ch.X §50 + FSCA Conduct Standard 1/2020
// + BIS PFMI §3.5 + CFTC Reg 1.73 + MiFID II Art 17):
//   reject_order        → regulator EVERY tier when
//                          counterparty_credit_grade_below_B=TRUE
//                          (B-grade hard line — W107 signature; sister of
//                          W104 reject EVERY tier on regulator_relevant,
//                          W105 raise_dispute EVERY tier on HV_brp,
//                          W106 impose_sanction EVERY tier on
//                          licence_revocation)
//   override_rejection  → regulator EVERY tier (compliance override is
//                          itself reportable)
//   hold_for_review     → regulator material+systemic when SLA-triggered
//   sla_breached        → regulator systemic only (BIS PFMI §3.5)
//
// Write {admin, trader}. READ all 9 personas. actor_party split:
//   trader writes: submit_order, acknowledge_clearance
//   risk system (auto) writes: verify_kyc, check_credit_line,
//     assess_settlement_risk, check_concentration, verify_halt_status,
//     validate_mark_age, clear_order
//   compliance writes: hold_for_review, manually_clear, manually_reject,
//     override_rejection, archive_check
// ─────────────────────────────────────────────────────────────────────────

export type PtcStatus =
  | 'order_submitted'
  | 'kyc_verified'
  | 'credit_line_checked'
  | 'settlement_risk_assessed'
  | 'concentration_checked'
  | 'halt_status_verified'
  | 'mark_age_validated'
  | 'cleared'
  | 'archived'
  | 'rejected'
  | 'held_for_review'
  | 'manually_cleared'
  | 'manually_rejected';

export type PtcAction =
  | 'submit_order'
  | 'verify_kyc'
  | 'check_credit_line'
  | 'assess_settlement_risk'
  | 'check_concentration'
  | 'verify_halt_status'
  | 'validate_mark_age'
  | 'clear_order'
  | 'hold_for_review'
  | 'manually_clear'
  | 'manually_reject'
  | 'reject_order'
  | 'override_rejection'
  | 'archive_check';

export type PtcTier = 'micro' | 'standard' | 'material' | 'systemic';

export type PtcParty =
  | 'trader'
  | 'risk_system'
  | 'compliance'
  | 'archiver';

export type PtcEvent =
  | 'pretrade_credit.order_submitted'
  | 'pretrade_credit.kyc_verified'
  | 'pretrade_credit.credit_line_checked'
  | 'pretrade_credit.settlement_risk_assessed'
  | 'pretrade_credit.concentration_checked'
  | 'pretrade_credit.halt_status_verified'
  | 'pretrade_credit.mark_age_validated'
  | 'pretrade_credit_cleared'
  | 'pretrade_credit.archived'
  | 'pretrade_credit_rejected'
  | 'pretrade_credit_held_for_review'
  | 'pretrade_credit.manually_cleared'
  | 'pretrade_credit.manually_rejected'
  | 'pretrade_credit_overridden'
  | 'pretrade_credit_sla_breached';

// Hard terminals reject every action. cleared is a SOFT terminal — UI-
// treated as terminal-ish on filters but still accepts archive_check to
// reach the hard terminal archived. rejected is also soft (allows
// override). archived + manually_cleared + manually_rejected are hard.
// (manually_cleared funnels into cleared via the manually_clear handler
// itself returning cleared as `to`.)
const HARD_TERMINALS = new Set<PtcStatus>([
  'archived',
]);

// UI terminals — flags row reached an outcome operator no longer actions.
// cleared + rejected + archived all read as terminal-ish on filters.
const UI_TERMINALS = new Set<PtcStatus>([
  'cleared',
  'archived',
  'rejected',
]);

export function isTerminal(s: PtcStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: PtcStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// Pre-clear gates — states from which the gate-rails can fire hold/reject.
const PRE_CLEAR_GATES: PtcStatus[] = [
  'order_submitted',
  'kyc_verified',
  'credit_line_checked',
  'settlement_risk_assessed',
  'concentration_checked',
  'halt_status_verified',
  'mark_age_validated',
];

export const TRANSITIONS: Record<PtcAction, { from: PtcStatus[]; to: PtcStatus }> = {
  submit_order:           { from: ['order_submitted'],                                    to: 'order_submitted' },
  verify_kyc:             { from: ['order_submitted'],                                    to: 'kyc_verified' },
  check_credit_line:      { from: ['kyc_verified'],                                       to: 'credit_line_checked' },
  assess_settlement_risk: { from: ['credit_line_checked'],                                to: 'settlement_risk_assessed' },
  check_concentration:    { from: ['settlement_risk_assessed'],                           to: 'concentration_checked' },
  verify_halt_status:     { from: ['concentration_checked'],                              to: 'halt_status_verified' },
  validate_mark_age:      { from: ['halt_status_verified'],                               to: 'mark_age_validated' },
  clear_order:            { from: ['mark_age_validated', 'manually_cleared'],             to: 'cleared' },
  hold_for_review:        { from: PRE_CLEAR_GATES,                                        to: 'held_for_review' },
  manually_clear:         { from: ['held_for_review'],                                    to: 'manually_cleared' },
  manually_reject:        { from: ['held_for_review'],                                    to: 'manually_rejected' },
  reject_order:           { from: [...PRE_CLEAR_GATES, 'held_for_review', 'manually_rejected'], to: 'rejected' },
  override_rejection:     { from: ['rejected'],                                           to: 'cleared' },
  archive_check:          { from: ['cleared', 'rejected'],                                to: 'archived' },
};

export function nextStatus(current: PtcStatus, action: PtcAction): PtcStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  // submit_order is the create action — not a state transition once entered.
  if (action === 'submit_order' && current !== 'order_submitted') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: PtcStatus): PtcAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: PtcAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [PtcAction, typeof TRANSITIONS[PtcAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// URGENT SLA polarity. Sub-second windows on order_submitted: systemic
// 500ms / material 2s / standard 10s / micro 30s. Stored as milliseconds
// BIGINT (sla_target_ms). 0 means no SLA (terminal states).
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

export const SLA_MS: Record<PtcStatus, Record<PtcTier, number>> = {
  order_submitted:          { micro: 30 * SEC, standard: 10 * SEC, material: 2 * SEC,  systemic: 500 },
  kyc_verified:             { micro: 60 * SEC, standard: 30 * SEC, material: 10 * SEC, systemic: 2 * SEC },
  credit_line_checked:      { micro: 60 * SEC, standard: 30 * SEC, material: 10 * SEC, systemic: 2 * SEC },
  settlement_risk_assessed: { micro: 60 * SEC, standard: 30 * SEC, material: 10 * SEC, systemic: 2 * SEC },
  concentration_checked:    { micro: 60 * SEC, standard: 30 * SEC, material: 10 * SEC, systemic: 2 * SEC },
  halt_status_verified:     { micro: 60 * SEC, standard: 30 * SEC, material: 10 * SEC, systemic: 2 * SEC },
  mark_age_validated:       { micro: 60 * SEC, standard: 30 * SEC, material: 10 * SEC, systemic: 2 * SEC },
  held_for_review:          { micro: 24 * HOUR, standard: 4 * HOUR, material: 1 * HOUR, systemic: 15 * MIN },
  manually_cleared:         { micro: 60 * SEC, standard: 30 * SEC, material: 10 * SEC, systemic: 2 * SEC },
  manually_rejected:        { micro: 60 * SEC, standard: 30 * SEC, material: 10 * SEC, systemic: 2 * SEC },
  cleared:                  { micro: 0,         standard: 0,        material: 0,        systemic: 0 },
  rejected:                 { micro: 0,         standard: 0,        material: 0,        systemic: 0 },
  archived:                 { micro: 0,         standard: 0,        material: 0,        systemic: 0 },
};

export function slaWindowMs(status: PtcStatus, tier: PtcTier): number {
  return SLA_MS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: PtcStatus, tier: PtcTier, enteredAt: Date): Date | null {
  const ms = SLA_MS[status]?.[tier];
  if (!ms) return null;
  return new Date(enteredAt.getTime() + ms);
}

// Tier RE-DERIVED from notional_exposure_zar.
//   micro    : <R1m
//   standard : R1m-R10m
//   material : R10m-R100m
//   systemic : >=R100m
export function tierForNotional(notionalZar: number | null | undefined): PtcTier {
  const v = Number(notionalZar ?? 0);
  if (!isFinite(v) || v < 0) return 'micro';
  if (v >= 100_000_000) return 'systemic';
  if (v >= 10_000_000)  return 'material';
  if (v >= 1_000_000)   return 'standard';
  return 'micro';
}

export interface PtcFloorFlags {
  cross_border_settlement?: boolean | number | null;
  counterparty_credit_grade_below_B?: boolean | number | null;
  concentration_above_25pct?: boolean | number | null;
  halted_underlying?: boolean | number | null;
  first_trade_with_counterparty?: boolean | number | null;
}

export function countFloorFlags(args: PtcFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.cross_border_settlement) +
    t(args.counterparty_credit_grade_below_B) +
    t(args.concentration_above_25pct) +
    t(args.halted_underlying) +
    t(args.first_trade_with_counterparty)
  );
}

// FLOOR-AT-MATERIAL on any one floor flag.
export function floorAtMaterial(args: PtcFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-SYSTEMIC on cross_border_settlement OR
// counterparty_credit_grade_below_B (each is a systemic-level signal).
export function floorAtSystemic(args: PtcFloorFlags): boolean {
  return Boolean(
    args.cross_border_settlement ||
    args.counterparty_credit_grade_below_B,
  );
}

// Compose raw notional-tier + floor flags into effective tier.
export function effectiveTier(rawTier: PtcTier, flags: PtcFloorFlags): PtcTier {
  if (floorAtSystemic(flags)) return 'systemic';
  const count = countFloorFlags(flags);
  if (count >= 2) return 'systemic';
  if (count === 1) {
    if (rawTier === 'micro' || rawTier === 'standard') return 'material';
    return rawTier;
  }
  return rawTier;
}

// Heavy tiers — where reportability + signature crossings attach.
const HEAVY_TIERS = new Set<PtcTier>(['material', 'systemic']);

export function isHeavyTier(tier: PtcTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: PtcTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// SIGNATURE regulator crossings (FMA Ch.X §50 + FSCA Conduct Standard 1/2020
// + BIS PFMI §3.5 + CFTC Reg 1.73 + MiFID II Art 17):
//   reject_order        → EVERY tier when
//                          counterparty_credit_grade_below_B=TRUE
//   override_rejection  → EVERY tier
//   hold_for_review     → material+systemic when SLA-triggered
export function crossesIntoRegulator(
  action: PtcAction,
  tier: PtcTier,
  args: {
    counterparty_credit_grade_below_B?: boolean | number | null;
    hold_triggered_by_sla?: boolean | number | null;
  },
): boolean {
  const belowB = Boolean(args.counterparty_credit_grade_below_B);
  if (action === 'reject_order') return belowB;
  if (action === 'override_rejection') return true;
  if (action === 'hold_for_review') {
    return HEAVY_TIERS.has(tier) && Boolean(args.hold_triggered_by_sla);
  }
  return false;
}

// SLA-breach crosses regulator on systemic only (BIS PFMI §3.5).
export function slaBreachCrossesIntoRegulator(tier: PtcTier): boolean {
  return tier === 'systemic';
}

// Party each action represents.
const ACTION_PARTY: Record<PtcAction, PtcParty> = {
  submit_order:           'trader',
  verify_kyc:             'risk_system',
  check_credit_line:      'risk_system',
  assess_settlement_risk: 'risk_system',
  check_concentration:    'risk_system',
  verify_halt_status:     'risk_system',
  validate_mark_age:      'risk_system',
  clear_order:            'risk_system',
  hold_for_review:        'compliance',
  manually_clear:         'compliance',
  manually_reject:        'compliance',
  reject_order:           'compliance',
  override_rejection:     'compliance',
  archive_check:          'archiver',
};

export function partyForAction(action: PtcAction): PtcParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: PtcAction): PtcEvent | null {
  switch (action) {
    case 'submit_order':           return 'pretrade_credit.order_submitted';
    case 'verify_kyc':             return 'pretrade_credit.kyc_verified';
    case 'check_credit_line':      return 'pretrade_credit.credit_line_checked';
    case 'assess_settlement_risk': return 'pretrade_credit.settlement_risk_assessed';
    case 'check_concentration':    return 'pretrade_credit.concentration_checked';
    case 'verify_halt_status':     return 'pretrade_credit.halt_status_verified';
    case 'validate_mark_age':      return 'pretrade_credit.mark_age_validated';
    case 'clear_order':            return 'pretrade_credit_cleared';
    case 'hold_for_review':        return 'pretrade_credit_held_for_review';
    case 'manually_clear':         return 'pretrade_credit.manually_cleared';
    case 'manually_reject':        return 'pretrade_credit.manually_rejected';
    case 'reject_order':           return 'pretrade_credit_rejected';
    case 'override_rejection':     return 'pretrade_credit_overridden';
    case 'archive_check':          return 'pretrade_credit.archived';
  }
}

// ─── LIVE battery (decorates every fetch) ───────────────────────────────

// Pretrade gate completeness 0-130. Components:
//   kyc_verified                 15
//   credit_line_checked          15
//   settlement_risk_assessed     15
//   concentration_checked        15
//   halt_status_verified         10
//   mark_age_validated           10
//   cleared                      20
//   clean_concentration_bonus    10 (concentration_ratio_pct <= 15)
//   clean_halt_bonus              5 (halt_status_band = none)
//   fresh_kyc_bonus               5 (kyc_recency_days < 90)
//   fresh_mark_bonus              5 (mark_age_seconds < 60)
//   sub_sla_decision_bonus        5 (decision within SLA)
// Capped at 130.
export function pretradeGateCompletenessIndex(args: {
  kyc_verified?: boolean | number | null;
  credit_line_checked?: boolean | number | null;
  settlement_risk_assessed?: boolean | number | null;
  concentration_checked?: boolean | number | null;
  halt_status_verified?: boolean | number | null;
  mark_age_validated?: boolean | number | null;
  cleared?: boolean | number | null;
  clean_concentration_bonus?: boolean | number | null;
  clean_halt_bonus?: boolean | number | null;
  fresh_kyc_bonus?: boolean | number | null;
  fresh_mark_bonus?: boolean | number | null;
  sub_sla_decision_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.kyc_verified)              * 15;
  score += t(args.credit_line_checked)       * 15;
  score += t(args.settlement_risk_assessed)  * 15;
  score += t(args.concentration_checked)     * 15;
  score += t(args.halt_status_verified)      * 10;
  score += t(args.mark_age_validated)        * 10;
  score += t(args.cleared)                   * 20;
  score += t(args.clean_concentration_bonus) * 10;
  score += t(args.clean_halt_bonus)          *  5;
  score += t(args.fresh_kyc_bonus)           *  5;
  score += t(args.fresh_mark_bonus)          *  5;
  score += t(args.sub_sla_decision_bonus)    *  5;
  if (score > 130) score = 130;
  return score;
}

// Credit-line utilisation pct. Live computation from used / limit.
export function creditLineUtilizationPct(
  used: number | null | undefined,
  limit: number | null | undefined,
): number {
  const u = Number(used ?? 0);
  const l = Number(limit ?? 0);
  if (l <= 0) return 0;
  return Math.round((u / l) * 10000) / 100;
}

// Settlement risk score 0-100. Composite of:
//   counterparty grade (40 pts when below_B)
//   DvP/PvP unavailable (25 pts)
//   currency mismatch (20 pts)
//   tenor > 30d (15 pts)
export function settlementRiskScore(args: {
  counterparty_credit_grade_below_B?: boolean | number | null;
  dvp_pvp_unavailable?: boolean | number | null;
  currency_mismatch?: boolean | number | null;
  tenor_days?: number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.counterparty_credit_grade_below_B) * 40;
  score += t(args.dvp_pvp_unavailable)               * 25;
  score += t(args.currency_mismatch)                 * 20;
  score += (Number(args.tenor_days ?? 0) > 30 ? 1 : 0) * 15;
  if (score > 100) score = 100;
  return score;
}

// Concentration ratio (single-name as % of book value).
export function concentrationRatioPct(
  singleNameExposure: number | null | undefined,
  bookValue: number | null | undefined,
): number {
  const s = Number(singleNameExposure ?? 0);
  const b = Number(bookValue ?? 0);
  if (b <= 0) return 0;
  return Math.round((s / b) * 10000) / 100;
}

// KYC recency days from kyc_verified_at.
export function kycRecencyDays(kycVerifiedAt: string | Date | null | undefined, now: Date): number {
  if (!kycVerifiedAt) return 9999;
  const t = new Date(kycVerifiedAt);
  if (isNaN(t.getTime())) return 9999;
  const ms = now.getTime() - t.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (24 * 3600 * 1000));
}

// Mark age seconds from last_mark_at.
export function markAgeSeconds(lastMarkAt: string | Date | null | undefined, now: Date): number {
  if (!lastMarkAt) return 9999;
  const t = new Date(lastMarkAt);
  if (isNaN(t.getTime())) return 9999;
  const ms = now.getTime() - t.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / 1000);
}

// Halt status band: none / partial / full.
export type PtcHaltBand = 'none' | 'partial' | 'full';

export function haltStatusBand(args: {
  underlying_halted?: boolean | number | null;
  partial_halt_flag?: boolean | number | null;
}): PtcHaltBand {
  if (args.underlying_halted) return 'full';
  if (args.partial_halt_flag) return 'partial';
  return 'none';
}

// SLA seconds remaining. Negative if breached. Uses ms internally then
// returns seconds for sub-minute precision in the UI.
export function slaSecondsRemaining(
  status: PtcStatus,
  tier: PtcTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / 1000);
}

// Urgency band. critical / high / medium / low.
export type PtcUrgency = 'critical' | 'high' | 'medium' | 'low';

export function urgencyBand(
  tier: PtcTier,
  slaSecondsLeft: number,
): PtcUrgency {
  if (slaSecondsLeft < 0) return 'critical';
  if (tier === 'systemic' || slaSecondsLeft < 2) return 'critical';
  if (tier === 'material' || slaSecondsLeft < 10) return 'high';
  if (tier === 'standard' || slaSecondsLeft < 30) return 'medium';
  return 'low';
}

// Breach-imminent flag — within 25% of SLA window.
export function breachImminentFlag(
  status: PtcStatus,
  tier: PtcTier,
  slaSecondsLeft: number,
): boolean {
  const window = SLA_MS[status]?.[tier] ?? 0;
  if (window <= 0) return false;
  const windowSec = window / 1000;
  return slaSecondsLeft >= 0 && slaSecondsLeft < windowSec * 0.25;
}

// 4-step authority ladder driven by effective tier.
export type PtcAuthority =
  | 'junior_trader'
  | 'desk_head'
  | 'market_risk_manager'
  | 'CRO';

export function authorityRequired(tier: PtcTier): PtcAuthority {
  switch (tier) {
    case 'micro':    return 'junior_trader';
    case 'standard': return 'desk_head';
    case 'material': return 'market_risk_manager';
    case 'systemic': return 'CRO';
  }
}

// Regulator filing window hours.
export function regulatorFilingWindowHours(tier: PtcTier): number {
  switch (tier) {
    case 'systemic': return 4;
    case 'material': return 24;
    case 'standard': return 72;
    case 'micro':    return 168;
  }
}

// Bridge flag: row links downstream to W2 trading-risk chain (VaR limit
// exceeded by this exposure increment).
export function bridgesToTradingRiskChain(
  notionalZar: number | null | undefined,
  varLimitZar: number | null | undefined,
): boolean {
  const n = Number(notionalZar ?? 0);
  const v = Number(varLimitZar ?? 0);
  if (v <= 0) return false;
  return n > v;
}

// Bridge flag: row links downstream to W29 position-limit chain (post-
// clearing position would breach limit).
export function bridgesToPositionLimitChain(
  currentPositionZar: number | null | undefined,
  incrementZar: number | null | undefined,
  positionLimitZar: number | null | undefined,
): boolean {
  const c = Number(currentPositionZar ?? 0);
  const i = Number(incrementZar ?? 0);
  const l = Number(positionLimitZar ?? 0);
  if (l <= 0) return false;
  return (c + i) > l;
}

// Bridge flag: row links upstream to W68 counterparty-margin chain
// (counterparty already in margin waterfall).
export function bridgesToCounterpartyMarginChain(
  counterpartyMarginRef: string | null | undefined,
): boolean {
  return !!counterpartyMarginRef;
}
