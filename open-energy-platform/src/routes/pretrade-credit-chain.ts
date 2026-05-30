// ═══════════════════════════════════════════════════════════════════════════
// Wave 107 — Trader Pre-Trade Credit Check & Settlement-Risk Exposure (P6).
// 10th Trader chain. Mounted at /api/trader/pretrade-credit/chain.
//
// PRE-TRADE GATE upstream of W2 trading-risk, W9 MM compliance, W29 position-
// limit, W36 best-execution, W44 trade-reporting, W52 market-abuse, W60 algo-
// cert, W68 counterparty-margin, W76 trade-allocation — every one of those
// chains assumes the synchronous front-end was cleared. W107 turns that
// implicit "rule-set evaluator" into a 12-state P6 chain with sub-second
// SLA, LIVE 14-field battery, FLOOR-AT-MATERIAL tier overlay, 4-step
// authority ladder, 3-bridge architecture, and signature regulator
// crossings.
//
// Beats Numerix CrossAsset Pre-Trade / Calypso Pre-Trade Limits / Bloomberg
// AIM Pre-Trade Compliance / Murex MX.3 PFE / FIS Front Arena / OpenLink
// Endur Pre-Deal / SAS Risk Management / Misys Kondor+ / Wall Street Systems
// Front-Arena.
//
// Standards: FMA Ch.X §50 + FSCA Conduct Standard 1/2020 + BIS PFMI §3.5
// (CCP credit risk) + CFTC Reg 1.73 (clearing FCM risk) + MiFID II Art 17
// (algorithmic trading pre-trade controls).
//
// Write {admin, trader}. READ all 9 personas. actor_party split:
//   trader writes:       submit_order
//   risk system writes:  verify_kyc, check_credit_line,
//                        assess_settlement_risk, check_concentration,
//                        verify_halt_status, validate_mark_age, clear_order
//   compliance writes:   hold_for_review, manually_clear, manually_reject,
//                        reject_order, override_rejection
//   archiver writes:     archive_check
//
// SIGNATURE crossings:
//   reject_order        crosses regulator EVERY tier when
//                        counterparty_credit_grade_below_B=TRUE
//                        (W107 signature — B-grade hard line)
//   override_rejection  crosses regulator EVERY tier (override is reportable)
//   hold_for_review     crosses regulator material+systemic when
//                        hold_triggered_by_sla=TRUE
//   sla_breached        crosses regulator systemic only (BIS PFMI §3.5)
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaDeadlineFor,
  tierForNotional,
  effectiveTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  pretradeGateCompletenessIndex,
  creditLineUtilizationPct,
  settlementRiskScore,
  concentrationRatioPct,
  kycRecencyDays,
  markAgeSeconds,
  haltStatusBand,
  slaSecondsRemaining,
  urgencyBand,
  breachImminentFlag,
  authorityRequired,
  regulatorFilingWindowHours,
  bridgesToTradingRiskChain,
  bridgesToPositionLimitChain,
  bridgesToCounterpartyMarginChain,
  SLA_MS,
  type PtcStatus,
  type PtcAction,
  type PtcTier,
} from '../utils/pretrade-credit-spec';

const READ_ROLES = new Set([
  'admin', 'trader',
  'ipp_developer', 'offtaker', 'regulator', 'lender',
  'support', 'carbon_fund', 'grid_operator',
]);

const WRITE_ROLES = new Set(['admin', 'trader']);

interface PtcRow {
  id: string;
  check_number: string;
  order_ref: string;
  trader_party_id: string;
  trader_party_name: string | null;
  counterparty_id: string;
  counterparty_name: string | null;
  desk: string | null;
  venue: string | null;
  product_class: string | null;
  energy_type: string | null;
  side: string | null;
  volume_mwh: number;
  price_zar_per_mwh: number;
  notional_exposure_zar: number;
  credit_line_limit_zar: number;
  credit_line_used_zar: number;
  credit_line_utilization_pct: number;
  settlement_risk_score: number;
  dvp_pvp_unavailable: number;
  currency_mismatch: number;
  tenor_days: number;
  single_name_exposure_zar: number;
  book_value_zar: number;
  concentration_ratio_pct: number;
  kyc_verified_at: string | null;
  kyc_recency_days: number;
  last_mark_at: string | null;
  mark_age_seconds: number;
  underlying_halted: number;
  partial_halt_flag: number;
  halt_status_band: string | null;
  cross_border_settlement: number;
  counterparty_credit_grade_below_B: number;
  concentration_above_25pct: number;
  halted_underlying: number;
  first_trade_with_counterparty: number;
  hold_triggered_by_sla: number;
  hold_reason: string | null;
  reject_reason: string | null;
  override_reason: string | null;
  override_by: string | null;
  var_limit_zar: number;
  current_position_zar: number;
  position_limit_zar: number;
  counterparty_margin_ref: string | null;
  current_tier: PtcTier;
  authority_required: string | null;
  urgency_band: string | null;
  pretrade_gate_completeness_index: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  cancel_reason: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: PtcStatus;
  order_submitted_at: string | null;
  kyc_verified_state_at: string | null;
  credit_line_checked_at: string | null;
  settlement_risk_assessed_at: string | null;
  concentration_checked_at: string | null;
  halt_status_verified_at: string | null;
  mark_age_validated_at: string | null;
  cleared_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  held_for_review_at: string | null;
  manually_cleared_at: string | null;
  manually_rejected_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_ms: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PtcEventRow {
  id: string;
  check_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<PtcStatus, keyof PtcRow | null> = {
  order_submitted:           'order_submitted_at',
  kyc_verified:              'kyc_verified_state_at',
  credit_line_checked:       'credit_line_checked_at',
  settlement_risk_assessed:  'settlement_risk_assessed_at',
  concentration_checked:     'concentration_checked_at',
  halt_status_verified:      'halt_status_verified_at',
  mark_age_validated:        'mark_age_validated_at',
  cleared:                   'cleared_at',
  archived:                  'archived_at',
  rejected:                  'rejected_at',
  held_for_review:           'held_for_review_at',
  manually_cleared:          'manually_cleared_at',
  manually_rejected:         'manually_rejected_at',
};

function statusEnteredAt(row: PtcRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.order_submitted_at ? new Date(row.order_submitted_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.order_submitted_at ? new Date(row.order_submitted_at) : null);
}

function decorate(row: PtcRow, now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;

  const slaIso = row.sla_deadline_at;
  const msUntilSla = slaIso
    ? new Date(slaIso).getTime() - now.getTime()
    : null;

  const utilLive = creditLineUtilizationPct(row.credit_line_used_zar, row.credit_line_limit_zar);
  const srsLive = settlementRiskScore({
    counterparty_credit_grade_below_B: row.counterparty_credit_grade_below_B,
    dvp_pvp_unavailable:               row.dvp_pvp_unavailable,
    currency_mismatch:                 row.currency_mismatch,
    tenor_days:                        row.tenor_days,
  });
  const concLive = concentrationRatioPct(row.single_name_exposure_zar, row.book_value_zar);
  const kycRecency = kycRecencyDays(row.kyc_verified_at, now);
  const markAge = markAgeSeconds(row.last_mark_at, now);
  const haltBandLive = haltStatusBand({
    underlying_halted: row.underlying_halted,
    partial_halt_flag: row.partial_halt_flag,
  });

  const completeness = pretradeGateCompletenessIndex({
    kyc_verified:              !!row.kyc_verified_state_at,
    credit_line_checked:       !!row.credit_line_checked_at,
    settlement_risk_assessed:  !!row.settlement_risk_assessed_at,
    concentration_checked:     !!row.concentration_checked_at,
    halt_status_verified:      !!row.halt_status_verified_at,
    mark_age_validated:        !!row.mark_age_validated_at,
    cleared:                   !!row.cleared_at,
    clean_concentration_bonus: concLive <= 15,
    clean_halt_bonus:          haltBandLive === 'none',
    fresh_kyc_bonus:           kycRecency < 90,
    fresh_mark_bonus:          markAge < 60,
    sub_sla_decision_bonus:    !row.sla_breached && (msUntilSla == null || msUntilSla > 0),
  });

  const entered = statusEnteredAt(row);
  const slaLeftSec = slaSecondsRemaining(status, tier, entered, now);
  const urgency = urgencyBand(tier, slaLeftSec);
  const authority = authorityRequired(tier);
  const breachImminent = breachImminentFlag(status, tier, slaLeftSec);
  const regFilingHours = regulatorFilingWindowHours(tier);

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    ms_until_sla: msUntilSla,
    sla_breached_live: msUntilSla != null && msUntilSla < 0,
    sla_window_ms: SLA_MS[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    credit_line_utilization_pct_live: utilLive,
    settlement_risk_score_live: srsLive,
    concentration_ratio_pct_live: concLive,
    kyc_recency_days_live: kycRecency,
    mark_age_seconds_live: markAge,
    halt_status_band_live: haltBandLive,
    pretrade_gate_completeness_index_live: completeness,
    sla_seconds_remaining_live: slaLeftSec,
    urgency_band_live: urgency,
    breach_imminent_flag_live: breachImminent,
    regulator_filing_window_hours_live: regFilingHours,
    authority_required_live: authority,
    bridges_to_trading_risk_chain_live: bridgesToTradingRiskChain(row.notional_exposure_zar, row.var_limit_zar),
    bridges_to_position_limit_chain_live: bridgesToPositionLimitChain(row.current_position_zar, row.notional_exposure_zar, row.position_limit_zar),
    bridges_to_counterparty_margin_chain_live: bridgesToCounterpartyMarginChain(row.counterparty_margin_ref),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier       = c.req.query('tier');
  const status     = c.req.query('status');
  const trader     = c.req.query('trader_party_id');
  const cpty       = c.req.query('counterparty_id');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');
  const orderRef   = c.req.query('order_ref');

  let sql = 'SELECT * FROM oe_pretrade_credit_check WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)     { sql += ' AND current_tier = ?';     binds.push(tier); }
  if (status)   { sql += ' AND chain_status = ?';     binds.push(status); }
  if (trader)   { sql += ' AND trader_party_id = ?';  binds.push(trader); }
  if (cpty)     { sql += ' AND counterparty_id = ?';  binds.push(cpty); }
  if (orderRef) { sql += ' AND order_ref = ?';        binds.push(orderRef); }
  sql += ' ORDER BY datetime(order_submitted_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<PtcRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
  }

  const active_count       = items.filter((i) => !i.is_terminal).length;
  const held_count         = items.filter((i) => i.chain_status === 'held_for_review').length;
  const cleared_count      = items.filter((i) => i.chain_status === 'cleared').length;
  const rejected_count     = items.filter((i) => i.chain_status === 'rejected' || i.chain_status === 'manually_rejected').length;
  const systemic_count     = items.filter((i) => i.current_tier === 'systemic').length;
  const breached_count     = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total   = items.filter((i) => i.is_reportable_flag).length;
  const below_b_count      = items.filter((i) => i.counterparty_credit_grade_below_B).length;
  const cross_border_count = items.filter((i) => i.cross_border_settlement).length;
  const overridden_count   = items.filter((i) => !!i.override_by).length;
  const trading_risk_bridged       = items.filter((i) => i.bridges_to_trading_risk_chain_live).length;
  const position_limit_bridged     = items.filter((i) => i.bridges_to_position_limit_chain_live).length;
  const counterparty_margin_bridged = items.filter((i) => i.bridges_to_counterparty_margin_chain_live).length;
  const total_notional_zar = items.reduce((s, i) => s + (i.notional_exposure_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      active_count,
      held_count,
      cleared_count,
      rejected_count,
      systemic_count,
      breached: breached_count,
      reportable_total,
      below_b_count,
      cross_border_count,
      overridden_count,
      trading_risk_bridged_count: trading_risk_bridged,
      position_limit_bridged_count: position_limit_bridged,
      counterparty_margin_bridged_count: counterparty_margin_bridged,
      total_notional_zar,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_pretrade_credit_check GROUP BY chain_status, current_tier, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string;
    regulator_relevant: number; sla_breached: number;
    n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({ success: true, data: { total, by_status, by_tier, by_regulator_relevant, by_sla_breached } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_pretrade_credit_check WHERE id = ?').bind(id).first<PtcRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_pretrade_credit_events WHERE check_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<PtcEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CommonBody {
  notes?: string;
  reason_code?: string;
  regulator_ref?: string;
  title?: string;
  narrative?: string;
}

interface CreateBody extends CommonBody {
  order_ref?: string;
  trader_party_id?: string;
  trader_party_name?: string;
  counterparty_id?: string;
  counterparty_name?: string;
  desk?: string;
  venue?: string;
  product_class?: string;
  energy_type?: string;
  side?: 'buy' | 'sell';
  volume_mwh?: number;
  price_zar_per_mwh?: number;
  notional_exposure_zar?: number;
  credit_line_limit_zar?: number;
  credit_line_used_zar?: number;
  single_name_exposure_zar?: number;
  book_value_zar?: number;
  tenor_days?: number;
  var_limit_zar?: number;
  current_position_zar?: number;
  position_limit_zar?: number;
  counterparty_margin_ref?: string;
  cross_border_settlement?: boolean | number;
  counterparty_credit_grade_below_B?: boolean | number;
  concentration_above_25pct?: boolean | number;
  halted_underlying?: boolean | number;
  first_trade_with_counterparty?: boolean | number;
  dvp_pvp_unavailable?: boolean | number;
  currency_mismatch?: boolean | number;
  underlying_halted?: boolean | number;
  partial_halt_flag?: boolean | number;
  kyc_verified_at?: string;
  last_mark_at?: string;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

interface VerifyKycBody extends CommonBody { kyc_verified_at?: string; }
interface CheckCreditLineBody extends CommonBody {
  credit_line_used_zar?: number;
  credit_line_limit_zar?: number;
}
interface AssessSettlementRiskBody extends CommonBody {
  dvp_pvp_unavailable?: boolean | number;
  currency_mismatch?: boolean | number;
  tenor_days?: number;
}
interface CheckConcentrationBody extends CommonBody {
  single_name_exposure_zar?: number;
  book_value_zar?: number;
}
interface VerifyHaltStatusBody extends CommonBody {
  underlying_halted?: boolean | number;
  partial_halt_flag?: boolean | number;
}
interface ValidateMarkAgeBody extends CommonBody { last_mark_at?: string; }
interface ClearOrderBody extends CommonBody {}
interface HoldForReviewBody extends CommonBody {
  hold_reason?: string;
  hold_triggered_by_sla?: boolean | number;
}
interface ManuallyClearBody extends CommonBody {}
interface ManuallyRejectBody extends CommonBody { reject_reason?: string; }
interface RejectOrderBody extends CommonBody { reject_reason?: string; }
interface OverrideRejectionBody extends CommonBody {
  override_reason?: string;
  override_by?: string;
}
interface ArchiveCheckBody extends CommonBody {}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<PtcRow>): Partial<PtcRow> {
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.title === 'string')         out.title = b.title;
  if (typeof b.narrative === 'string')     out.narrative = b.narrative;
  return out;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

// ─── Create endpoint (submit_order) ──────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `ptc-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `PTC-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const volume = Number(body.volume_mwh ?? 0);
  const price = Number(body.price_zar_per_mwh ?? 0);
  const notional = Number(body.notional_exposure_zar ?? (volume * price));

  const flags = {
    cross_border_settlement:           toFlag(body.cross_border_settlement) ?? 0,
    counterparty_credit_grade_below_B: toFlag(body.counterparty_credit_grade_below_B) ?? 0,
    concentration_above_25pct:         toFlag(body.concentration_above_25pct) ?? 0,
    halted_underlying:                 toFlag(body.halted_underlying) ?? 0,
    first_trade_with_counterparty:     toFlag(body.first_trade_with_counterparty) ?? 0,
  };
  const rawTier = tierForNotional(notional);
  const tier = effectiveTier(rawTier, {
    cross_border_settlement:           !!flags.cross_border_settlement,
    counterparty_credit_grade_below_B: !!flags.counterparty_credit_grade_below_B,
    concentration_above_25pct:         !!flags.concentration_above_25pct,
    halted_underlying:                 !!flags.halted_underlying,
    first_trade_with_counterparty:     !!flags.first_trade_with_counterparty,
  });
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('order_submitted', tier, now);
  const slaTargetMs = SLA_MS['order_submitted'][tier] ?? 0;

  await c.env.DB.prepare(
    `INSERT INTO oe_pretrade_credit_check (
      id, check_number,
      order_ref, trader_party_id, trader_party_name,
      counterparty_id, counterparty_name,
      desk, venue, product_class, energy_type, side,
      volume_mwh, price_zar_per_mwh, notional_exposure_zar,
      credit_line_limit_zar, credit_line_used_zar, credit_line_utilization_pct,
      settlement_risk_score, dvp_pvp_unavailable, currency_mismatch, tenor_days,
      single_name_exposure_zar, book_value_zar, concentration_ratio_pct,
      kyc_verified_at, kyc_recency_days, last_mark_at, mark_age_seconds,
      underlying_halted, partial_halt_flag, halt_status_band,
      cross_border_settlement, counterparty_credit_grade_below_B,
      concentration_above_25pct, halted_underlying, first_trade_with_counterparty,
      var_limit_zar, current_position_zar, position_limit_zar, counterparty_margin_ref,
      current_tier, authority_required, urgency_band, pretrade_gate_completeness_index,
      title, narrative,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, order_submitted_at,
      sla_target_ms, sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.order_ref ?? `ord-${id}`, body.trader_party_id ?? user.id, body.trader_party_name ?? null,
    body.counterparty_id ?? 'cpty-unknown', body.counterparty_name ?? null,
    body.desk ?? null, body.venue ?? null, body.product_class ?? null, body.energy_type ?? null,
    (body.side === 'buy' || body.side === 'sell') ? body.side : null,
    volume, price, notional,
    Number(body.credit_line_limit_zar ?? 0), Number(body.credit_line_used_zar ?? 0), 0,
    0, 0, 0, Number(body.tenor_days ?? 0),
    Number(body.single_name_exposure_zar ?? 0), Number(body.book_value_zar ?? 0), 0,
    body.kyc_verified_at ?? null, 9999, body.last_mark_at ?? null, 9999,
    toFlag(body.underlying_halted) ?? 0, toFlag(body.partial_halt_flag) ?? 0, 'none',
    flags.cross_border_settlement, flags.counterparty_credit_grade_below_B,
    flags.concentration_above_25pct, flags.halted_underlying, flags.first_trade_with_counterparty,
    Number(body.var_limit_zar ?? 0), Number(body.current_position_zar ?? 0), Number(body.position_limit_zar ?? 0),
    body.counterparty_margin_ref ?? null,
    tier, authorityRequired(tier), urgencyBand(tier, Math.floor(slaTargetMs / 1000)), 0,
    body.title ?? null, body.narrative ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'order_submitted', nowIso,
    slaTargetMs, sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `pretrade_credit_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_pretrade_credit_events (id, check_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'pretrade_credit.order_submitted', null, 'order_submitted',
    user.id, partyForAction('submit_order'),
    typeof body.narrative === 'string' ? body.narrative : null,
    JSON.stringify({ action: 'submit_order', tier, notional }),
    nowIso,
  ).run();

  await fireCascade({
    event: 'pretrade_credit.order_submitted',
    actor_id: user.id,
    entity_type: 'pretrade_credit_check',
    entity_id: id,
    data: {
      id,
      check_number: num,
      chain_status: 'order_submitted',
      current_tier: tier,
      notional_exposure_zar: notional,
      action: 'submit_order',
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_pretrade_credit_check WHERE id = ?').bind(id).first<PtcRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
});

async function transition(
  c: Context<HonoEnv>,
  action: PtcAction,
  bodyHandler?: (row: PtcRow, body: Record<string, unknown>) => Partial<PtcRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_pretrade_credit_check WHERE id = ?').bind(id).first<PtcRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from notional + 5 floor flags. Any of the flags may
  // have been updated by this transition's body.
  const notional = (overrides.notional_exposure_zar as number | undefined) ?? row.notional_exposure_zar;
  const rawTier = tierForNotional(notional);
  const floorFlags = {
    cross_border_settlement:
      Boolean((overrides.cross_border_settlement as number | undefined) ?? row.cross_border_settlement),
    counterparty_credit_grade_below_B:
      Boolean((overrides.counterparty_credit_grade_below_B as number | undefined) ?? row.counterparty_credit_grade_below_B),
    concentration_above_25pct:
      Boolean((overrides.concentration_above_25pct as number | undefined) ?? row.concentration_above_25pct),
    halted_underlying:
      Boolean((overrides.halted_underlying as number | undefined) ?? row.halted_underlying),
    first_trade_with_counterparty:
      Boolean((overrides.first_trade_with_counterparty as number | undefined) ?? row.first_trade_with_counterparty),
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaTargetMs = SLA_MS[to]?.[tier] ?? 0;

  overrides.sla_target_ms = slaTargetMs;

  // Re-derive live numeric fields (credit utilization, settlement risk,
  // concentration, kyc recency, mark age, halt band).
  const usedZ = (overrides.credit_line_used_zar as number | undefined) ?? row.credit_line_used_zar;
  const limitZ = (overrides.credit_line_limit_zar as number | undefined) ?? row.credit_line_limit_zar;
  overrides.credit_line_utilization_pct = creditLineUtilizationPct(usedZ, limitZ);

  overrides.settlement_risk_score = settlementRiskScore({
    counterparty_credit_grade_below_B: floorFlags.counterparty_credit_grade_below_B,
    dvp_pvp_unavailable: Boolean((overrides.dvp_pvp_unavailable as number | undefined) ?? row.dvp_pvp_unavailable),
    currency_mismatch:   Boolean((overrides.currency_mismatch as number | undefined) ?? row.currency_mismatch),
    tenor_days:          (overrides.tenor_days as number | undefined) ?? row.tenor_days,
  });

  const sneZ = (overrides.single_name_exposure_zar as number | undefined) ?? row.single_name_exposure_zar;
  const bvZ = (overrides.book_value_zar as number | undefined) ?? row.book_value_zar;
  overrides.concentration_ratio_pct = concentrationRatioPct(sneZ, bvZ);

  const kycAt = (overrides.kyc_verified_at as string | null | undefined) ?? row.kyc_verified_at;
  overrides.kyc_recency_days = kycRecencyDays(kycAt, now);

  const markAt = (overrides.last_mark_at as string | null | undefined) ?? row.last_mark_at;
  overrides.mark_age_seconds = markAgeSeconds(markAt, now);

  overrides.halt_status_band = haltStatusBand({
    underlying_halted: Boolean((overrides.underlying_halted as number | undefined) ?? row.underlying_halted),
    partial_halt_flag: Boolean((overrides.partial_halt_flag as number | undefined) ?? row.partial_halt_flag),
  });

  // SIGNATURE crossings.
  const holdSla = Boolean((overrides.hold_triggered_by_sla as number | undefined) ?? row.hold_triggered_by_sla);
  const crosses = crossesIntoRegulator(action, tier, {
    counterparty_credit_grade_below_B: floorFlags.counterparty_credit_grade_below_B,
    hold_triggered_by_sla: holdSla,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  overrides.urgency_band = urgencyBand(tier, Math.floor(slaTargetMs / 1000));

  // Re-compute completeness index.
  const stamps = {
    kyc_verified_state_at:    (overrides.kyc_verified_state_at as string | null | undefined) ?? row.kyc_verified_state_at,
    credit_line_checked_at:   (overrides.credit_line_checked_at as string | null | undefined) ?? row.credit_line_checked_at,
    settlement_risk_assessed_at: (overrides.settlement_risk_assessed_at as string | null | undefined) ?? row.settlement_risk_assessed_at,
    concentration_checked_at: (overrides.concentration_checked_at as string | null | undefined) ?? row.concentration_checked_at,
    halt_status_verified_at:  (overrides.halt_status_verified_at as string | null | undefined) ?? row.halt_status_verified_at,
    mark_age_validated_at:    (overrides.mark_age_validated_at as string | null | undefined) ?? row.mark_age_validated_at,
    cleared_at:               (overrides.cleared_at as string | null | undefined) ?? row.cleared_at,
  };
  if (tsCol && to !== row.chain_status) {
    if (tsCol === 'kyc_verified_state_at')    stamps.kyc_verified_state_at = nowIso;
    if (tsCol === 'credit_line_checked_at')   stamps.credit_line_checked_at = nowIso;
    if (tsCol === 'settlement_risk_assessed_at') stamps.settlement_risk_assessed_at = nowIso;
    if (tsCol === 'concentration_checked_at') stamps.concentration_checked_at = nowIso;
    if (tsCol === 'halt_status_verified_at')  stamps.halt_status_verified_at = nowIso;
    if (tsCol === 'mark_age_validated_at')    stamps.mark_age_validated_at = nowIso;
    if (tsCol === 'cleared_at')               stamps.cleared_at = nowIso;
  }
  overrides.pretrade_gate_completeness_index = pretradeGateCompletenessIndex({
    kyc_verified:              !!stamps.kyc_verified_state_at,
    credit_line_checked:       !!stamps.credit_line_checked_at,
    settlement_risk_assessed:  !!stamps.settlement_risk_assessed_at,
    concentration_checked:     !!stamps.concentration_checked_at,
    halt_status_verified:      !!stamps.halt_status_verified_at,
    mark_age_validated:        !!stamps.mark_age_validated_at,
    cleared:                   !!stamps.cleared_at,
    clean_concentration_bonus: (overrides.concentration_ratio_pct as number) <= 15,
    clean_halt_bonus:          overrides.halt_status_band === 'none',
    fresh_kyc_bonus:           (overrides.kyc_recency_days as number) < 90,
    fresh_mark_bonus:          (overrides.mark_age_seconds as number) < 60,
    sub_sla_decision_bonus:    !row.sla_breached,
  });

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol && to !== row.chain_status) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_pretrade_credit_check SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `pretrade_credit_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_pretrade_credit_events (id, check_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventName,
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'pretrade_credit_check',
      entity_id: id,
      data: {
        ...row,
        ...overrides,
        current_tier: tier,
        chain_status: to,
        from_status: row.chain_status,
        action,
        crosses_into_regulator: crosses,
      },
      env: c.env,
    });
  }

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_pretrade_credit_check WHERE id = ?').bind(id).first<PtcRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (13 — submit_order is the create above) ────────────
app.post('/:id/verify-kyc', async (c) => transition(c, 'verify_kyc', (_row, body) => {
  const b = body as Partial<VerifyKycBody>;
  const out: Partial<PtcRow> = {};
  if (typeof b.kyc_verified_at === 'string') out.kyc_verified_at = b.kyc_verified_at;
  else out.kyc_verified_at = new Date().toISOString();
  return applyCommon(b, out);
}));

app.post('/:id/check-credit-line', async (c) => transition(c, 'check_credit_line', (_row, body) => {
  const b = body as Partial<CheckCreditLineBody>;
  const out: Partial<PtcRow> = {};
  if (typeof b.credit_line_used_zar === 'number')  out.credit_line_used_zar = b.credit_line_used_zar;
  if (typeof b.credit_line_limit_zar === 'number') out.credit_line_limit_zar = b.credit_line_limit_zar;
  return applyCommon(b, out);
}));

app.post('/:id/assess-settlement-risk', async (c) => transition(c, 'assess_settlement_risk', (_row, body) => {
  const b = body as Partial<AssessSettlementRiskBody>;
  const out: Partial<PtcRow> = {};
  if (b.dvp_pvp_unavailable !== undefined) out.dvp_pvp_unavailable = toFlag(b.dvp_pvp_unavailable) ?? 0;
  if (b.currency_mismatch !== undefined)   out.currency_mismatch = toFlag(b.currency_mismatch) ?? 0;
  if (typeof b.tenor_days === 'number')    out.tenor_days = b.tenor_days;
  return applyCommon(b, out);
}));

app.post('/:id/check-concentration', async (c) => transition(c, 'check_concentration', (_row, body) => {
  const b = body as Partial<CheckConcentrationBody>;
  const out: Partial<PtcRow> = {};
  if (typeof b.single_name_exposure_zar === 'number') out.single_name_exposure_zar = b.single_name_exposure_zar;
  if (typeof b.book_value_zar === 'number')           out.book_value_zar = b.book_value_zar;
  return applyCommon(b, out);
}));

app.post('/:id/verify-halt-status', async (c) => transition(c, 'verify_halt_status', (_row, body) => {
  const b = body as Partial<VerifyHaltStatusBody>;
  const out: Partial<PtcRow> = {};
  if (b.underlying_halted !== undefined) out.underlying_halted = toFlag(b.underlying_halted) ?? 0;
  if (b.partial_halt_flag !== undefined) out.partial_halt_flag = toFlag(b.partial_halt_flag) ?? 0;
  return applyCommon(b, out);
}));

app.post('/:id/validate-mark-age', async (c) => transition(c, 'validate_mark_age', (_row, body) => {
  const b = body as Partial<ValidateMarkAgeBody>;
  const out: Partial<PtcRow> = {};
  if (typeof b.last_mark_at === 'string') out.last_mark_at = b.last_mark_at;
  else out.last_mark_at = new Date().toISOString();
  return applyCommon(b, out);
}));

app.post('/:id/clear-order', async (c) => transition(c, 'clear_order', (_row, body) =>
  applyCommon(body as Partial<ClearOrderBody>, {}),
));

app.post('/:id/hold-for-review', async (c) => transition(c, 'hold_for_review', (_row, body) => {
  const b = body as Partial<HoldForReviewBody>;
  const out: Partial<PtcRow> = {};
  if (typeof b.hold_reason === 'string') out.hold_reason = b.hold_reason;
  if (b.hold_triggered_by_sla !== undefined) out.hold_triggered_by_sla = toFlag(b.hold_triggered_by_sla) ?? 0;
  return applyCommon(b, out);
}));

app.post('/:id/manually-clear', async (c) => transition(c, 'manually_clear', (_row, body) =>
  applyCommon(body as Partial<ManuallyClearBody>, {}),
));

app.post('/:id/manually-reject', async (c) => transition(c, 'manually_reject', (_row, body) => {
  const b = body as Partial<ManuallyRejectBody>;
  const out: Partial<PtcRow> = {};
  if (typeof b.reject_reason === 'string') out.reject_reason = b.reject_reason;
  return applyCommon(b, out);
}));

app.post('/:id/reject-order', async (c) => transition(c, 'reject_order', (_row, body) => {
  const b = body as Partial<RejectOrderBody>;
  const out: Partial<PtcRow> = {};
  if (typeof b.reject_reason === 'string') out.reject_reason = b.reject_reason;
  return applyCommon(b, out);
}));

app.post('/:id/override-rejection', async (c) => transition(c, 'override_rejection', (_row, body) => {
  const b = body as Partial<OverrideRejectionBody>;
  const out: Partial<PtcRow> = {};
  if (typeof b.override_reason === 'string') out.override_reason = b.override_reason;
  if (typeof b.override_by === 'string')     out.override_by = b.override_by;
  return applyCommon(b, out);
}));

app.post('/:id/archive-check', async (c) => transition(c, 'archive_check', (_row, body) =>
  applyCommon(body as Partial<ArchiveCheckBody>, {}),
));

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
//
// Sub-second SLA polarity. We sweep every 15 min anyway because cron min
// granularity is 1 min and we use the 15-min slot. Real near-real-time
// breach detection happens client-side on every read via decorate().
export async function pretradeCreditSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_pretrade_credit_check
     WHERE chain_status NOT IN ('cleared','archived','rejected','manually_cleared','manually_rejected')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<PtcRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_pretrade_credit_check
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `pretrade_credit_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_pretrade_credit_events (id, check_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'pretrade_credit_sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'risk_system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier}, ${row.sla_target_ms}ms target)`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at, sla_target_ms: row.sla_target_ms }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'pretrade_credit_sla_breached',
        actor_id: 'system',
        entity_type: 'pretrade_credit_check',
        entity_id: row.id,
        data: {
          ...row,
          crosses_into_regulator: true,
        },
        env,
      });
    }

    breached++;
  }
  return { scanned: rows.length, breached };
}

// ─── Cron: KYC recency sweep (nightly 05:00) ──────────────────────────────
//
// Refreshes kyc_recency_days + mark_age_seconds on every still-active row
// so dashboards stay honest. Does not change chain_status; just refreshes
// the LIVE counters that the UI shows. Real KYC re-validation happens
// out-of-band; this just makes the recency-day counter accurate.
export async function pretradeCreditKycRecencySweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; refreshed: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_pretrade_credit_check
     WHERE chain_status NOT IN ('cleared','archived','rejected','manually_cleared','manually_rejected')`,
  ).all<PtcRow>();

  const rows = rs.results || [];
  let refreshed = 0;
  for (const row of rows) {
    const kycRecency = kycRecencyDays(row.kyc_verified_at, now);
    const markAge = markAgeSeconds(row.last_mark_at, now);
    if (kycRecency === row.kyc_recency_days && markAge === row.mark_age_seconds) continue;
    await env.DB.prepare(
      `UPDATE oe_pretrade_credit_check
       SET kyc_recency_days = ?, mark_age_seconds = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(kycRecency, markAge, nowIso, row.id).run();
    refreshed++;
  }
  return { scanned: rows.length, refreshed };
}

export default app;
