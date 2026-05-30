// ═══════════════════════════════════════════════════════════════════════════
// Wave 111 — Trader Daily P&L Attribution & Risk-Adjusted Returns Chain
// (P6). 11th Trader chain. Mounted at /api/trader/pnl-attribution/chain.
//
// EOD P&L decomposition + risk-decomp + benchmark comparison + IFRS9
// stage classification engine that runs every trading day per book and
// turns four numbers (MTM/realised/unrealised/total) into a stratified
// attribution (delta/gamma/vega/theta/FX/carry/residual), a risk-decomp
// (VaR contribution / scenario impact / KRI exceedances), a benchmark
// comparison (alpha / tracking error / information ratio), a 4-step
// authority ladder, a 17-field LIVE battery (incl. Sharpe / Sortino /
// Information / max-drawdown), and signature regulator crossings when
// restatements stack or attribution gaps blow out.
//
// Distinct from W2 (rolling VaR), W9 (MM-compliance), W29 (position
// limits), W36 (best-execution), W44 (trade reporting), W52 (market-
// abuse), W60 (algo-cert), W68 (counterparty-margin), W76 (trade-
// allocation), W107 (pre-trade credit).
//
// Beats Murex MX.3 / Calypso / Bloomberg PORT / FIS Adaptiv / OpenLink
// Endur / OneTick / Imagine Risk / Kondor+ / Front Arena / SunGard
// FastVal.
//
// Standards: FMA Ch.X + FSCA Conduct Standard 1/2020 + IFRS 9 + IFRS 13
// + Basel III FRTB IMA + SA + GIPS 2020 + MAR.
//
// Write {admin, trader}. READ all 9 personas. actor_party split:
//   trader              : open_day, run_mtm, compute_realised,
//                         compute_unrealised
//   risk_analyst        : decompose_attribution, decompose_risk,
//                         compare_to_benchmark, submit_to_review,
//                         flag_variance_investigation
//   desk_head           : approve_pnl, hold_for_review, override_hold
//   market_risk_manager : publish_pnl
//   finance             : reconcile, archive_pnl
//   CFO                 : restate_pnl
//
// SIGNATURE regulator crossings:
//   restate_pnl                 -> regulator EVERY tier when
//                                   restated_within_30d (W111 SIGNATURE
//                                   SECOND-RESTATEMENT hard line)
//   flag_variance_investigation -> regulator material+systemic when
//                                   attribution_gap_pct>=10%
//   approve_pnl                 -> regulator systemic only when
//                                   stress_period_active
//   publish_pnl                 -> regulator systemic only when FRTB_IMA
//   sla_breached                -> regulator material+systemic
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
  slaWindowHours,
  tierForNotional,
  effectiveTier,
  countFloorFlags,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  regulatorFilingWindowHours,
  bridgesToTradingRiskChain,
  bridgesToPretradeCreditChain,
  bridgesToTradeReportingChain,
  sharpeRatio,
  sortinoRatio,
  informationRatio,
  maxDrawdownPct,
  attributionGapPct,
  totalDailyPnlZar,
  ifrs9StageClassification,
  pnlCompletenessIndex,
  isVarianceInvestigationImminent,
  isRestateRisk,
  type PnaStatus,
  type PnaAction,
  type PnaTier,
} from '../utils/pnl-attribution-spec';

const READ_ROLES = new Set([
  'admin', 'trader',
  'ipp_developer', 'offtaker', 'grid_operator', 'regulator', 'lender', 'support', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'trader']);

interface PnaRow {
  id: string;
  pnl_number: string;

  book_id: string;
  book_label: string | null;
  desk_id: string | null;
  business_date: string;
  gross_notional_zar: number;

  trading_risk_ref: string | null;
  pretrade_credit_ref: string | null;
  trade_reporting_ref: string | null;

  mtm_zar: number;
  realised_pnl_zar: number;
  unrealised_pnl_zar: number;
  total_daily_pnl_zar: number;
  mtd_pnl_zar: number;
  ytd_pnl_zar: number;

  delta_zar: number;
  gamma_zar: number;
  vega_zar: number;
  theta_zar: number;
  fx_zar: number;
  carry_zar: number;
  residual_zar: number;
  attribution_gap_pct: number;

  var_contribution_zar: number;
  scenario_impact_zar: number;
  kri_exceedance_count: number;

  benchmark_label: string | null;
  benchmark_return_pct: number;
  alpha_pct: number;
  tracking_error_pct: number;

  sharpe_ratio: number;
  sortino_ratio: number;
  information_ratio: number;
  max_drawdown_pct: number;

  restate_count: number;
  last_restate_at: string | null;
  ifrs9_stage: string | null;

  stress_period_active: number;
  restated_within_30d: number;
  large_attribution_gap_pct_5_plus: number;
  regulatory_book_FRTB_IMA: number;
  cross_border_consolidation: number;

  current_tier: PnaTier;
  authority_required: string | null;
  urgency_band: string | null;
  pnl_completeness_index: number;

  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  hold_reason: string | null;
  variance_reason: string | null;
  restate_reason: string | null;

  current_ball_in_court_party: string | null;
  last_responder_party: string | null;

  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;

  chain_status: PnaStatus;
  day_open_at: string | null;
  mtm_run_at: string | null;
  realised_computed_at: string | null;
  unrealised_computed_at: string | null;
  attribution_decomposed_at: string | null;
  risk_decomposed_at: string | null;
  benchmark_compared_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  reconciled_at: string | null;
  archived_at: string | null;
  held_for_review_at: string | null;
  variance_investigation_at: string | null;
  restated_at: string | null;

  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;

  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;

  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PnaEventRow {
  id: string;
  pnl_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<PnaStatus, keyof PnaRow | null> = {
  day_open:               'day_open_at',
  mtm_run:                'mtm_run_at',
  realised_computed:      'realised_computed_at',
  unrealised_computed:    'unrealised_computed_at',
  attribution_decomposed: 'attribution_decomposed_at',
  risk_decomposed:        'risk_decomposed_at',
  benchmark_compared:     'benchmark_compared_at',
  reviewed:               'reviewed_at',
  approved:               'approved_at',
  published:              'published_at',
  reconciled:             'reconciled_at',
  archived:               'archived_at',
  held_for_review:        'held_for_review_at',
  variance_investigation: 'variance_investigation_at',
  restated:               'restated_at',
};

function statusEnteredAt(row: PnaRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.day_open_at ? new Date(row.day_open_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.day_open_at ? new Date(row.day_open_at) : null);
}

function decorate(row: PnaRow, now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const entered = statusEnteredAt(row);
  const slaHrs = slaHoursRemaining(status, tier, entered, now);
  const urgency = urgencyBand(tier, slaHrs);
  const authority = authorityRequired(tier);
  const regFilingHours = regulatorFilingWindowHours(tier);

  const total = totalDailyPnlZar(row.realised_pnl_zar, row.unrealised_pnl_zar);
  const gap = row.attribution_gap_pct
    ? row.attribution_gap_pct
    : attributionGapPct(row.residual_zar, row.mtm_zar);

  const floorFlags = countFloorFlags({
    stress_period_active:             row.stress_period_active,
    restated_within_30d:              row.restated_within_30d,
    large_attribution_gap_pct_5_plus: row.large_attribution_gap_pct_5_plus,
    regulatory_book_FRTB_IMA:         row.regulatory_book_FRTB_IMA,
    cross_border_consolidation:       row.cross_border_consolidation,
  });

  const ifrs9 = row.ifrs9_stage
    ? row.ifrs9_stage
    : ifrs9StageClassification({
      attribution_gap_pct: gap,
      restated_within_30d: row.restated_within_30d,
      stress_period_active: row.stress_period_active,
      total_daily_pnl_zar: total,
    });

  const completeness = pnlCompletenessIndex({
    mtm_run:                !!row.mtm_run_at,
    realised_computed:      !!row.realised_computed_at,
    unrealised_computed:    !!row.unrealised_computed_at,
    attribution_decomposed: !!row.attribution_decomposed_at,
    risk_decomposed:        !!row.risk_decomposed_at,
    benchmark_compared:     !!row.benchmark_compared_at,
    reviewed:               !!row.reviewed_at,
    approved:               !!row.approved_at,
    published:              !!row.published_at,
    reconciled:             !!row.reconciled_at,
    archived:               !!row.archived_at,
    no_hold_bonus:          status !== 'held_for_review' && !row.held_for_review_at,
    no_variance_bonus:      status !== 'variance_investigation' && !row.variance_investigation_at,
    no_restate_bonus:       (row.restate_count || 0) === 0,
    ifrs9_stage1_bonus:     ifrs9 === 'stage_1',
  });

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached_live: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_hours: slaWindowHours(status, tier),
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    sla_hours_remaining_live: slaHrs,
    urgency_band_live: urgency,
    authority_required_live: authority,
    regulator_filing_window_hours_live: regFilingHours,
    total_daily_pnl_zar_live: total,
    attribution_gap_pct_live: gap,
    ifrs9_stage_live: ifrs9,
    variance_investigation_imminent_live: isVarianceInvestigationImminent(status, gap),
    restate_risk_live: isRestateRisk(status, gap),
    floor_flag_count_live: floorFlags,
    pnl_completeness_index_live: completeness,
    bridges_to_trading_risk_chain_live: bridgesToTradingRiskChain(row.trading_risk_ref),
    bridges_to_pretrade_credit_chain_live: bridgesToPretradeCreditChain(row.pretrade_credit_ref),
    bridges_to_trade_reporting_chain_live: bridgesToTradeReportingChain(row.trade_reporting_ref),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── List ────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier       = c.req.query('tier');
  const status     = c.req.query('status');
  const book       = c.req.query('book_id');
  const desk       = c.req.query('desk_id');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_pnl_attribution WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)   { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status) { sql += ' AND chain_status = ?'; binds.push(status); }
  if (book)   { sql += ' AND book_id = ?';      binds.push(book); }
  if (desk)   { sql += ' AND desk_id = ?';      binds.push(desk); }
  sql += ' ORDER BY datetime(business_date) DESC, datetime(updated_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<PnaRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_ifrs9: Record<string, number> = {};
  const by_book: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_ifrs9[i.ifrs9_stage_live] = (by_ifrs9[i.ifrs9_stage_live] || 0) + 1;
    by_book[i.book_id] = (by_book[i.book_id] || 0) + 1;
  }

  const active_count          = items.filter((i) => !i.is_terminal).length;
  const variance_count        = items.filter((i) => i.chain_status === 'variance_investigation').length;
  const held_count            = items.filter((i) => i.chain_status === 'held_for_review').length;
  const restated_count        = items.filter((i) => i.chain_status === 'restated').length;
  const systemic_count        = items.filter((i) => i.current_tier === 'systemic').length;
  const breached_count        = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total      = items.filter((i) => i.is_reportable_flag).length;
  const stage3_count          = items.filter((i) => i.ifrs9_stage_live === 'stage_3').length;
  const variance_imminent_count = items.filter((i) => i.variance_investigation_imminent_live).length;
  const restate_risk_count    = items.filter((i) => i.restate_risk_live).length;
  const trading_risk_bridged  = items.filter((i) => i.bridges_to_trading_risk_chain_live).length;
  const pretrade_bridged      = items.filter((i) => i.bridges_to_pretrade_credit_chain_live).length;
  const trade_reporting_bridged = items.filter((i) => i.bridges_to_trade_reporting_chain_live).length;
  const total_daily_pnl_zar_sum = items.reduce((s, i) => s + (i.total_daily_pnl_zar_live || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_ifrs9_stage: by_ifrs9,
      by_book,
      active_count,
      variance_count,
      held_count,
      restated_count,
      systemic_count,
      breached: breached_count,
      reportable_total,
      stage3_count,
      variance_imminent_count,
      restate_risk_count,
      trading_risk_bridged_count: trading_risk_bridged,
      pretrade_bridged_count: pretrade_bridged,
      trade_reporting_bridged_count: trade_reporting_bridged,
      total_daily_pnl_zar_sum,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, ifrs9_stage, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_pnl_attribution GROUP BY chain_status, current_tier, ifrs9_stage, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; ifrs9_stage: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_ifrs9: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.ifrs9_stage) by_ifrs9[r.ifrs9_stage] = (by_ifrs9[r.ifrs9_stage] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({ success: true, data: { total, by_status, by_tier, by_ifrs9_stage: by_ifrs9, by_regulator_relevant, by_sla_breached } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_pnl_attribution WHERE id = ?').bind(id).first<PnaRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_pnl_attribution_events WHERE pnl_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<PnaEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Body interfaces ──────────────────────────────────────────────────────
interface CommonBody {
  notes?: string;
  reason_code?: string;
  regulator_ref?: string;
  title?: string;
  narrative?: string;
}

interface CreateBody extends CommonBody {
  book_id?: string;
  book_label?: string;
  desk_id?: string;
  business_date?: string;
  gross_notional_zar?: number;
  trading_risk_ref?: string;
  pretrade_credit_ref?: string;
  trade_reporting_ref?: string;
  benchmark_label?: string;
  stress_period_active?: boolean | number;
  restated_within_30d?: boolean | number;
  large_attribution_gap_pct_5_plus?: boolean | number;
  regulatory_book_FRTB_IMA?: boolean | number;
  cross_border_consolidation?: boolean | number;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

interface MtmRunBody extends CommonBody {
  mtm_zar?: number;
}
interface RealisedBody extends CommonBody {
  realised_pnl_zar?: number;
}
interface UnrealisedBody extends CommonBody {
  unrealised_pnl_zar?: number;
}
interface DecomposeAttribBody extends CommonBody {
  delta_zar?: number;
  gamma_zar?: number;
  vega_zar?: number;
  theta_zar?: number;
  fx_zar?: number;
  carry_zar?: number;
  residual_zar?: number;
}
interface DecomposeRiskBody extends CommonBody {
  var_contribution_zar?: number;
  scenario_impact_zar?: number;
  kri_exceedance_count?: number;
}
interface BenchmarkBody extends CommonBody {
  benchmark_return_pct?: number;
  alpha_pct?: number;
  tracking_error_pct?: number;
  sharpe_ratio?: number;
  sortino_ratio?: number;
  information_ratio?: number;
  max_drawdown_pct?: number;
  mean_daily_return?: number;
  stdev_daily_return?: number;
  downside_stdev_daily_return?: number;
  peak_equity?: number;
  trough_equity?: number;
}
interface SubmitReviewBody extends CommonBody {}
interface ApproveBody extends CommonBody {}
interface HoldBody extends CommonBody {
  hold_reason?: string;
}
interface OverrideHoldBody extends CommonBody {}
interface PublishBody extends CommonBody {}
interface ReconcileBody extends CommonBody {}
interface ArchiveBody extends CommonBody {}
interface FlagVarianceBody extends CommonBody {
  variance_reason?: string;
}
interface RestateBody extends CommonBody {
  restate_reason?: string;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<PnaRow>): Partial<PnaRow> {
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

// ─── Create endpoint ─────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `pna-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `PNA-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const grossNotional = Number(body.gross_notional_zar ?? 0);
  const flags = {
    stress_period_active:             toFlag(body.stress_period_active) ?? 0,
    restated_within_30d:              toFlag(body.restated_within_30d) ?? 0,
    large_attribution_gap_pct_5_plus: toFlag(body.large_attribution_gap_pct_5_plus) ?? 0,
    regulatory_book_FRTB_IMA:         toFlag(body.regulatory_book_FRTB_IMA) ?? 0,
    cross_border_consolidation:       toFlag(body.cross_border_consolidation) ?? 0,
  };
  const rawTier = tierForNotional(grossNotional);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('day_open', tier, now);
  const slaHrs = slaWindowHours('day_open', tier);
  const businessDate = body.business_date ?? nowIso.slice(0, 10);

  await c.env.DB.prepare(
    `INSERT INTO oe_pnl_attribution (
      id, pnl_number,
      book_id, book_label, desk_id, business_date, gross_notional_zar,
      trading_risk_ref, pretrade_credit_ref, trade_reporting_ref,
      benchmark_label,
      stress_period_active, restated_within_30d,
      large_attribution_gap_pct_5_plus, regulatory_book_FRTB_IMA,
      cross_border_consolidation,
      current_tier, authority_required, urgency_band, pnl_completeness_index,
      title, narrative,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, day_open_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.book_id ?? 'book-unknown', body.book_label ?? null, body.desk_id ?? null,
    businessDate, grossNotional,
    body.trading_risk_ref ?? null, body.pretrade_credit_ref ?? null, body.trade_reporting_ref ?? null,
    body.benchmark_label ?? null,
    flags.stress_period_active, flags.restated_within_30d,
    flags.large_attribution_gap_pct_5_plus, flags.regulatory_book_FRTB_IMA,
    flags.cross_border_consolidation,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs), 0,
    body.title ?? null, body.narrative ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'day_open', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  // Emit the create event so the cascade fans out.
  const evtId = `pnl_attribution_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_pnl_attribution_events (id, pnl_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'pnl_attribution_day_opened',
    null, 'day_open', user.id, partyForAction('open_day'),
    null, JSON.stringify({ tier, gross_notional_zar: grossNotional, business_date: businessDate }), nowIso,
  ).run();

  await fireCascade({
    event: 'pnl_attribution_day_opened',
    actor_id: user.id,
    entity_type: 'pnl_attribution',
    entity_id: id,
    data: {
      tier, gross_notional_zar: grossNotional, book_id: body.book_id,
      business_date: businessDate, chain_status: 'day_open',
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_pnl_attribution WHERE id = ?').bind(id).first<PnaRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: PnaAction,
  bodyHandler?: (row: PnaRow, body: Record<string, unknown>) => Partial<PnaRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_pnl_attribution WHERE id = ?').bind(id).first<PnaRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from current gross_notional + 5 floor flags on every
  // transition (notional can grow, stress flag can come into effect, etc.).
  const grossNotional = (overrides.gross_notional_zar as number | undefined) ?? row.gross_notional_zar;
  const rawTier = tierForNotional(grossNotional);
  const floorFlags = {
    stress_period_active:
      (overrides.stress_period_active as number | undefined) ?? row.stress_period_active,
    restated_within_30d:
      (overrides.restated_within_30d as number | undefined) ?? row.restated_within_30d,
    large_attribution_gap_pct_5_plus:
      (overrides.large_attribution_gap_pct_5_plus as number | undefined) ?? row.large_attribution_gap_pct_5_plus,
    regulatory_book_FRTB_IMA:
      (overrides.regulatory_book_FRTB_IMA as number | undefined) ?? row.regulatory_book_FRTB_IMA,
    cross_border_consolidation:
      (overrides.cross_border_consolidation as number | undefined) ?? row.cross_border_consolidation,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaHrs = slaWindowHours(to, tier);
  overrides.sla_target_hours = slaHrs;

  // Action-specific bookkeeping
  if (action === 'restate_pnl') {
    overrides.restate_count = (row.restate_count || 0) + 1;
    overrides.last_restate_at = nowIso;
    // Mark restated_within_30d=1 if a previous restate is within 30 days.
    const prev = row.last_restate_at;
    if (prev) {
      const prevMs = new Date(prev).getTime();
      const thirtyDaysMs = 30 * 24 * 3600 * 1000;
      if (now.getTime() - prevMs <= thirtyDaysMs) {
        overrides.restated_within_30d = 1;
        floorFlags.restated_within_30d = 1;
      }
    }
  }

  // Re-compute total daily P&L if realised/unrealised changed.
  const realised = (overrides.realised_pnl_zar as number | undefined) ?? row.realised_pnl_zar;
  const unrealised = (overrides.unrealised_pnl_zar as number | undefined) ?? row.unrealised_pnl_zar;
  if (realised != null && unrealised != null) {
    overrides.total_daily_pnl_zar = totalDailyPnlZar(realised, unrealised);
  }

  // Re-compute attribution gap pct if residual changed.
  const residual = (overrides.residual_zar as number | undefined) ?? row.residual_zar;
  const mtm = (overrides.mtm_zar as number | undefined) ?? row.mtm_zar;
  if (residual != null && mtm != null) {
    overrides.attribution_gap_pct = attributionGapPct(residual, mtm);
    // Floor flag for >=5% gap
    if ((overrides.attribution_gap_pct as number) >= 5) {
      overrides.large_attribution_gap_pct_5_plus = 1;
      floorFlags.large_attribution_gap_pct_5_plus = 1;
    }
  }

  // Re-compute IFRS9 stage classification on each transition.
  overrides.ifrs9_stage = ifrs9StageClassification({
    attribution_gap_pct: (overrides.attribution_gap_pct as number | undefined) ?? row.attribution_gap_pct,
    restated_within_30d: floorFlags.restated_within_30d,
    stress_period_active: floorFlags.stress_period_active,
    total_daily_pnl_zar: (overrides.total_daily_pnl_zar as number | undefined) ?? row.total_daily_pnl_zar,
  });

  // SIGNATURE crossings (W111 restate_pnl EVERY tier when restated_within_30d,
  // plus flag_variance / approve / publish rules).
  const crosses = crossesIntoRegulator(action, tier, {
    restated_within_30d: floorFlags.restated_within_30d,
    stress_period_active: floorFlags.stress_period_active,
    regulatory_book_FRTB_IMA: floorFlags.regulatory_book_FRTB_IMA,
    attribution_gap_pct: (overrides.attribution_gap_pct as number | undefined) ?? row.attribution_gap_pct,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  overrides.urgency_band = urgencyBand(tier, slaHrs);

  // Recompute completeness on each transition (best-effort projection of
  // what timestamps WILL be set after this update lands).
  const willSetTs = (col: keyof PnaRow): boolean => {
    if (TIMESTAMP_COLUMN[to] === col) return true;
    return !!row[col];
  };
  const ifrs9Stage = overrides.ifrs9_stage;
  overrides.pnl_completeness_index = pnlCompletenessIndex({
    mtm_run:                willSetTs('mtm_run_at'),
    realised_computed:      willSetTs('realised_computed_at'),
    unrealised_computed:    willSetTs('unrealised_computed_at'),
    attribution_decomposed: willSetTs('attribution_decomposed_at'),
    risk_decomposed:        willSetTs('risk_decomposed_at'),
    benchmark_compared:     willSetTs('benchmark_compared_at'),
    reviewed:               willSetTs('reviewed_at'),
    approved:               willSetTs('approved_at'),
    published:              willSetTs('published_at'),
    reconciled:             willSetTs('reconciled_at'),
    archived:               willSetTs('archived_at'),
    no_hold_bonus:          action !== 'hold_for_review',
    no_variance_bonus:      action !== 'flag_variance_investigation',
    no_restate_bonus:       (overrides.restate_count as number | undefined ?? row.restate_count) === 0,
    ifrs9_stage1_bonus:     ifrs9Stage === 'stage_1',
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
    `UPDATE oe_pnl_attribution SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `pnl_attribution_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_pnl_attribution_events (id, pnl_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      entity_type: 'pnl_attribution',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_pnl_attribution WHERE id = ?').bind(id).first<PnaRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; open_day handled by POST /) ────────
app.post('/:id/run-mtm', async (c) => transition(c, 'run_mtm', (_row, body) => {
  const b = body as Partial<MtmRunBody>;
  const out: Partial<PnaRow> = {};
  if (typeof b.mtm_zar === 'number') out.mtm_zar = b.mtm_zar;
  return applyCommon(b, out);
}));

app.post('/:id/compute-realised', async (c) => transition(c, 'compute_realised', (_row, body) => {
  const b = body as Partial<RealisedBody>;
  const out: Partial<PnaRow> = {};
  if (typeof b.realised_pnl_zar === 'number') out.realised_pnl_zar = b.realised_pnl_zar;
  return applyCommon(b, out);
}));

app.post('/:id/compute-unrealised', async (c) => transition(c, 'compute_unrealised', (_row, body) => {
  const b = body as Partial<UnrealisedBody>;
  const out: Partial<PnaRow> = {};
  if (typeof b.unrealised_pnl_zar === 'number') out.unrealised_pnl_zar = b.unrealised_pnl_zar;
  return applyCommon(b, out);
}));

app.post('/:id/decompose-attribution', async (c) => transition(c, 'decompose_attribution', (_row, body) => {
  const b = body as Partial<DecomposeAttribBody>;
  const out: Partial<PnaRow> = {};
  if (typeof b.delta_zar === 'number')    out.delta_zar = b.delta_zar;
  if (typeof b.gamma_zar === 'number')    out.gamma_zar = b.gamma_zar;
  if (typeof b.vega_zar === 'number')     out.vega_zar = b.vega_zar;
  if (typeof b.theta_zar === 'number')    out.theta_zar = b.theta_zar;
  if (typeof b.fx_zar === 'number')       out.fx_zar = b.fx_zar;
  if (typeof b.carry_zar === 'number')    out.carry_zar = b.carry_zar;
  if (typeof b.residual_zar === 'number') out.residual_zar = b.residual_zar;
  return applyCommon(b, out);
}));

app.post('/:id/decompose-risk', async (c) => transition(c, 'decompose_risk', (_row, body) => {
  const b = body as Partial<DecomposeRiskBody>;
  const out: Partial<PnaRow> = {};
  if (typeof b.var_contribution_zar === 'number') out.var_contribution_zar = b.var_contribution_zar;
  if (typeof b.scenario_impact_zar === 'number')  out.scenario_impact_zar = b.scenario_impact_zar;
  if (typeof b.kri_exceedance_count === 'number') out.kri_exceedance_count = b.kri_exceedance_count;
  return applyCommon(b, out);
}));

app.post('/:id/compare-to-benchmark', async (c) => transition(c, 'compare_to_benchmark', (_row, body) => {
  const b = body as Partial<BenchmarkBody>;
  const out: Partial<PnaRow> = {};
  if (typeof b.benchmark_return_pct === 'number') out.benchmark_return_pct = b.benchmark_return_pct;
  if (typeof b.alpha_pct === 'number')             out.alpha_pct = b.alpha_pct;
  if (typeof b.tracking_error_pct === 'number')    out.tracking_error_pct = b.tracking_error_pct;
  if (typeof b.sharpe_ratio === 'number')          out.sharpe_ratio = b.sharpe_ratio;
  if (typeof b.sortino_ratio === 'number')         out.sortino_ratio = b.sortino_ratio;
  if (typeof b.information_ratio === 'number')     out.information_ratio = b.information_ratio;
  if (typeof b.max_drawdown_pct === 'number')      out.max_drawdown_pct = b.max_drawdown_pct;

  // Derive ratios from raw inputs if not provided directly.
  if (out.sharpe_ratio === undefined && typeof b.mean_daily_return === 'number' && typeof b.stdev_daily_return === 'number') {
    out.sharpe_ratio = sharpeRatio(b.mean_daily_return, b.stdev_daily_return);
  }
  if (out.sortino_ratio === undefined && typeof b.mean_daily_return === 'number' && typeof b.downside_stdev_daily_return === 'number') {
    out.sortino_ratio = sortinoRatio(b.mean_daily_return, b.downside_stdev_daily_return);
  }
  if (out.information_ratio === undefined && typeof b.mean_daily_return === 'number' && typeof b.tracking_error_pct === 'number') {
    out.information_ratio = informationRatio(b.mean_daily_return, b.benchmark_return_pct, b.tracking_error_pct);
  }
  if (out.max_drawdown_pct === undefined && typeof b.peak_equity === 'number' && typeof b.trough_equity === 'number') {
    out.max_drawdown_pct = maxDrawdownPct(b.peak_equity, b.trough_equity);
  }
  return applyCommon(b, out);
}));

app.post('/:id/submit-to-review', async (c) => transition(c, 'submit_to_review', (_row, body) =>
  applyCommon(body as Partial<SubmitReviewBody>, {}),
));

app.post('/:id/approve-pnl', async (c) => transition(c, 'approve_pnl', (_row, body) =>
  applyCommon(body as Partial<ApproveBody>, {}),
));

app.post('/:id/hold-for-review', async (c) => transition(c, 'hold_for_review', (_row, body) => {
  const b = body as Partial<HoldBody>;
  const out: Partial<PnaRow> = {};
  if (typeof b.hold_reason === 'string') out.hold_reason = b.hold_reason;
  return applyCommon(b, out);
}));

app.post('/:id/override-hold', async (c) => transition(c, 'override_hold', (_row, body) =>
  applyCommon(body as Partial<OverrideHoldBody>, {}),
));

app.post('/:id/publish-pnl', async (c) => transition(c, 'publish_pnl', (_row, body) =>
  applyCommon(body as Partial<PublishBody>, {}),
));

app.post('/:id/reconcile', async (c) => transition(c, 'reconcile', (_row, body) =>
  applyCommon(body as Partial<ReconcileBody>, {}),
));

app.post('/:id/archive-pnl', async (c) => transition(c, 'archive_pnl', (_row, body) =>
  applyCommon(body as Partial<ArchiveBody>, {}),
));

app.post('/:id/flag-variance-investigation', async (c) => transition(c, 'flag_variance_investigation', (_row, body) => {
  const b = body as Partial<FlagVarianceBody>;
  const out: Partial<PnaRow> = {};
  if (typeof b.variance_reason === 'string') out.variance_reason = b.variance_reason;
  return applyCommon(b, out);
}));

app.post('/:id/restate-pnl', async (c) => transition(c, 'restate_pnl', (_row, body) => {
  const b = body as Partial<RestateBody>;
  const out: Partial<PnaRow> = {};
  if (typeof b.restate_reason === 'string') out.restate_reason = b.restate_reason;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
//
// Walks every active P&L row whose sla_deadline_at has elapsed, flips
// sla_breached=1, bumps escalation_level, fires
// pnl_attribution_sla_breached event. SLA breach crosses regulator on
// material + systemic (FMA Ch.X disclosure rule).
export async function pnlAttributionSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_pnl_attribution
     WHERE chain_status NOT IN ('archived')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<PnaRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_pnl_attribution
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `pnl_attribution_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_pnl_attribution_events (id, pnl_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'pnl_attribution_sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'risk_analyst',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'pnl_attribution_sla_breached',
        actor_id: 'system',
        entity_type: 'pnl_attribution',
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

// ─── Cron: T+1 EOD opener (18:00 SAST) ────────────────────────────────────
//
// At 18:00 SAST every weekday, opens a new day_open row per active book
// that does NOT already have a row for the business_date. This is the
// "trigger" that drives the entire daily attribution lifecycle. It does
// not run on weekends (markets closed).
export async function pnlAttributionT1EodOpener(env: HonoEnv['Bindings']): Promise<{ scanned: number; opened: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const businessDate = nowIso.slice(0, 10);

  // Don't open on weekends (SA market days = Mon-Fri).
  const day = now.getUTCDay();
  if (day === 0 || day === 6) {
    return { scanned: 0, opened: 0 };
  }

  // Find books that had at least one P&L row in the last 7 days.
  const rs = await env.DB.prepare(
    `SELECT DISTINCT book_id, book_label, desk_id, gross_notional_zar,
            regulatory_book_FRTB_IMA, cross_border_consolidation,
            stress_period_active
     FROM oe_pnl_attribution
     WHERE datetime(created_at) > datetime(?, '-7 days')`,
  ).bind(nowIso).all<{
    book_id: string;
    book_label: string | null;
    desk_id: string | null;
    gross_notional_zar: number;
    regulatory_book_FRTB_IMA: number;
    cross_border_consolidation: number;
    stress_period_active: number;
  }>();

  const books = rs.results || [];
  let opened = 0;
  for (const book of books) {
    // Skip if already opened today.
    const existing = await env.DB.prepare(
      `SELECT id FROM oe_pnl_attribution WHERE book_id = ? AND business_date = ? LIMIT 1`,
    ).bind(book.book_id, businessDate).first<{ id: string }>();
    if (existing) continue;

    const id = `pna-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    const num = `PNA-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

    const flags = {
      stress_period_active:             book.stress_period_active,
      restated_within_30d:              0,
      large_attribution_gap_pct_5_plus: 0,
      regulatory_book_FRTB_IMA:         book.regulatory_book_FRTB_IMA,
      cross_border_consolidation:       book.cross_border_consolidation,
    };
    const rawTier = tierForNotional(book.gross_notional_zar);
    const tier = effectiveTier(rawTier, flags);
    const sla = slaDeadlineFor('day_open', tier, now);
    const slaHrs = slaWindowHours('day_open', tier);

    await env.DB.prepare(
      `INSERT INTO oe_pnl_attribution (
        id, pnl_number,
        book_id, book_label, desk_id, business_date, gross_notional_zar,
        stress_period_active, restated_within_30d,
        large_attribution_gap_pct_5_plus, regulatory_book_FRTB_IMA,
        cross_border_consolidation,
        current_tier, authority_required, urgency_band, pnl_completeness_index,
        is_reportable, regulator_relevant,
        chain_status, day_open_at,
        sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, num,
      book.book_id, book.book_label, book.desk_id, businessDate, book.gross_notional_zar,
      flags.stress_period_active, flags.restated_within_30d,
      flags.large_attribution_gap_pct_5_plus, flags.regulatory_book_FRTB_IMA,
      flags.cross_border_consolidation,
      tier, authorityRequired(tier), urgencyBand(tier, slaHrs), 0,
      isReportable(tier) ? 1 : 0, 0,
      'day_open', nowIso,
      slaHrs, sla ? sla.toISOString() : null, 0, 0,
      'system', nowIso, nowIso,
    ).run();

    const evtId = `pnl_attribution_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_pnl_attribution_events (id, pnl_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, id, 'pnl_attribution_day_opened',
      null, 'day_open', 'system', 'trader',
      `T+1 EOD auto-opener: book ${book.book_id} business_date ${businessDate}`,
      JSON.stringify({ tier, gross_notional_zar: book.gross_notional_zar }),
      nowIso,
    ).run();

    opened++;
  }
  return { scanned: books.length, opened };
}

export default app;
