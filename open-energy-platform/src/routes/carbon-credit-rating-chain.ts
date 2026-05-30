// ═══════════════════════════════════════════════════════════════════════════
// Wave 109 — Carbon Credit Quality Rating & Continuous Re-rating Chain.
// 11th Carbon chain. Mounted at /api/carbon/credit-rating/chain.
//
// Buyer-side due-diligence rating engine bridging W37 (registration PDD),
// W11 (MRV verification), and W42 (reversal / buffer pool). Sylvera / BeZero
// / Pachama / Renoster / Calyx publish a single static letter; W109 turns
// rating into a 12-state P6 chain with INVERTED SLA polarity, FLOOR-AT-
// PREMIUM tier overlay, 4-step authority ladder, 17-field LIVE battery
// (composite + 5 sub-scores + S&P-style 8-band + 3 bridges + ICROA bonus),
// continuous monitoring with auto re-rating, and signature regulator
// crossings.
//
// 12-state P6 lifecycle:
//   rating_requested → desk_review → methodology_score → additionality_score
//     → permanence_score → leakage_score → cobenefit_score → composite_score
//     → published → monitoring → re_rating_triggered → re_rated
//     (hard terminal)
//
// Branches:
//   monitoring | re_rating_triggered → downgraded (soft terminal — issuer
//                                       can re-enter via remediate)
//   any pre-published state → withdrawn (hard terminal)
//   any non-terminal state → escalated_to_integrity (hard terminal —
//                                                     fraud hands off to W42)
//   downgraded → monitoring (remediate re-entry)
//
// Standards: CCP Core Carbon Principles + ICROA Code of Best Practice +
// Article 6.4 Methodologies + ISO 14064-3 + VCS / Verra integrity.
//
// Write {admin, carbon_fund}. READ all 9 personas. actor_party split:
//   rater writes:  start_desk_review, score_methodology, score_additionality,
//                  score_permanence, score_leakage, score_cobenefits,
//                  compute_composite, publish_rating, start_monitoring,
//                  trigger_rerating, rerate, downgrade, withdraw,
//                  escalate_to_integrity
//   issuer writes: request_rating (create), remediate (re-entry)
//
// SIGNATURE crossings:
//   downgrade              → regulator EVERY tier on composite_drop_pct
//                             >=20% OR rating_band drops to CCC/D
//                             (W109 SIGNATURE)
//   escalate_to_integrity  → regulator EVERY tier (fraud → W42 reversal)
//   publish_rating         → regulator premium+institutional when Article 6
//   withdraw               → regulator EVERY tier when issuer_disputed
//   sla_breached           → premium+institutional only
//
// Tier RE-DERIVED on every transition from scope_scale_tonnes +
// multi_vintage (basic <50k / standard 50k-500k / premium 500k-5m /
// institutional >=5m) with FLOOR-AT-PREMIUM on any 1 floor flag OR Art 6,
// FLOOR-AT-INSTITUTIONAL on 2+ flags OR ccp_aligned_project OR
// institutional_buyer.
//
// INVERTED SLA polarity (institutional = LONGEST runway) stored as HOURS.
// rating_requested window: basic 30d / standard 60d / premium 120d /
// institutional 180d. Re-rating tighter at basic 14d / institutional 90d.
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
  tierForScale,
  effectiveTier,
  countFloorFlags,
  computeCompositeScore,
  deriveRatingBand,
  compositeDropPct,
  downgradeImminent,
  isMaterialDowngrade,
  isInvestmentGrade,
  isDistressedBand,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  regulatorFilingWindowHours,
  vintageAgeYears,
  monitoringFreshnessDays,
  monitoringDataStale,
  bridgesToRegistrationChain,
  bridgesToMrvChain,
  bridgesToReversalChain,
  ratingCompletenessIndex,
  reratingTriggerCount30d,
  SLA_HOURS,
  MONITORING_STALE_DAYS,
  type CcrStatus,
  type CcrAction,
  type CcrTier,
  type CcrRatingBand,
} from '../utils/carbon-credit-rating-spec';

const READ_ROLES = new Set([
  'admin', 'carbon_fund',
  'ipp_developer', 'offtaker', 'regulator', 'trader', 'lender',
  'support', 'grid_operator',
]);

const WRITE_ROLES = new Set(['admin', 'carbon_fund']);

interface CcrRow {
  id: string;
  rating_number: string;
  project_id: string;
  project_name: string | null;
  issuer_id: string;
  issuer_name: string | null;
  rater_id: string;
  rater_name: string | null;
  buyer_id: string | null;
  buyer_name: string | null;
  registration_chain_ref: string | null;
  mrv_chain_ref: string | null;
  reversal_chain_ref: string | null;
  credit_vintage_year: number;
  multi_vintage: number;
  scope_scale_tonnes: number;
  methodology_id: string | null;
  methodology_name: string | null;
  registry_name: string | null;
  methodology_score: number | null;
  additionality_score: number | null;
  permanence_score: number | null;
  leakage_score: number | null;
  cobenefit_score: number | null;
  composite_score: number | null;
  rating_band: CcrRatingBand | null;
  prior_composite_score: number | null;
  prior_rating_band: CcrRatingBand | null;
  composite_drop_pct: number;
  icroa_aligned: number;
  afolu_high_reversal_risk: number;
  methodology_under_review: number;
  external_credit_red_flag: number;
  ccp_aligned_project: number;
  article_6_authorised: number;
  institutional_buyer: number;
  issuer_disputed: number;
  current_tier: CcrTier;
  authority_required: string | null;
  urgency_band: string | null;
  rating_completeness_index: number;
  rerating_count_30d: number;
  monitoring_freshness_days: number | null;
  monitoring_data_stale: number;
  vintage_age_years: number;
  last_monitoring_data_at: string | null;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  withdraw_reason: string | null;
  downgrade_reason: string | null;
  integrity_reason: string | null;
  remediation_narrative: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: CcrStatus;
  rating_requested_at: string | null;
  desk_review_at: string | null;
  methodology_score_at: string | null;
  additionality_score_at: string | null;
  permanence_score_at: string | null;
  leakage_score_at: string | null;
  cobenefit_score_at: string | null;
  composite_score_at: string | null;
  published_at: string | null;
  monitoring_at: string | null;
  re_rating_triggered_at: string | null;
  re_rated_at: string | null;
  downgraded_at: string | null;
  withdrawn_at: string | null;
  escalated_to_integrity_at: string | null;
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

interface CcrEventRow {
  id: string;
  rating_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<CcrStatus, keyof CcrRow | null> = {
  rating_requested:        'rating_requested_at',
  desk_review:             'desk_review_at',
  methodology_score:       'methodology_score_at',
  additionality_score:     'additionality_score_at',
  permanence_score:        'permanence_score_at',
  leakage_score:           'leakage_score_at',
  cobenefit_score:         'cobenefit_score_at',
  composite_score:         'composite_score_at',
  published:               'published_at',
  monitoring:              'monitoring_at',
  re_rating_triggered:     're_rating_triggered_at',
  re_rated:                're_rated_at',
  downgraded:              'downgraded_at',
  withdrawn:               'withdrawn_at',
  escalated_to_integrity:  'escalated_to_integrity_at',
};

function statusEnteredAt(row: CcrRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.rating_requested_at ? new Date(row.rating_requested_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.rating_requested_at ? new Date(row.rating_requested_at) : null);
}

function decorate(row: CcrRow, events: CcrEventRow[], now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;

  const hoursUntilSla = row.sla_deadline_at
    ? Math.round((new Date(row.sla_deadline_at).getTime() - now.getTime()) / (3600 * 1000))
    : null;

  const entered = statusEnteredAt(row);
  const slaLeftHrs = slaHoursRemaining(status, tier, entered, now);
  const urgency = urgencyBand(tier, slaLeftHrs);
  const authority = authorityRequired(tier);
  const regFilingHours = regulatorFilingWindowHours(tier);

  const floorFlags = {
    afolu_high_reversal_risk: !!row.afolu_high_reversal_risk,
    methodology_under_review: !!row.methodology_under_review,
    external_credit_red_flag: !!row.external_credit_red_flag,
    ccp_aligned_project:      !!row.ccp_aligned_project,
    article_6_authorised:     !!row.article_6_authorised,
  };
  const floorFlagCount = countFloorFlags(floorFlags);

  const vintageAge = vintageAgeYears(row.credit_vintage_year, now);
  const monFresh = monitoringFreshnessDays(row.last_monitoring_data_at, now);
  const monStale = monitoringDataStale(row.last_monitoring_data_at, now);

  const completeness = ratingCompletenessIndex({
    methodology:   row.methodology_score != null,
    additionality: row.additionality_score != null,
    permanence:    row.permanence_score != null,
    leakage:       row.leakage_score != null,
    cobenefit:     row.cobenefit_score != null,
    composite:     row.composite_score != null,
    published:     !!row.published_at,
    monitoring:    !!row.monitoring_at,
  });

  const rerCount = reratingTriggerCount30d(
    (events || []).map((e) => ({ event_type: e.event_type, created_at: e.created_at })),
    now,
  );

  const dropPct = compositeDropPct(row.prior_composite_score, row.composite_score);
  const downgImminent = downgradeImminent(dropPct);
  const matDown = isMaterialDowngrade(dropPct, row.rating_band ?? 'D');
  const band = row.rating_band || (row.composite_score != null ? deriveRatingBand(row.composite_score) : null);

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    hours_until_sla: hoursUntilSla,
    sla_breached_live: hoursUntilSla != null && hoursUntilSla < 0,
    sla_window_hours: SLA_HOURS[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    // ─── LIVE battery (17-field decoration) ───────────────────────────────
    sla_hours_remaining_live:           slaLeftHrs,
    urgency_band_live:                  urgency,
    authority_required_live:            authority,
    regulator_filing_window_hours_live: regFilingHours,
    floor_flag_count_live:              floorFlagCount,
    rating_completeness_index_live:     completeness,
    rerating_count_30d_live:            rerCount,
    monitoring_freshness_days_live:     monFresh,
    monitoring_data_stale_live:         monStale,
    vintage_age_years_live:             vintageAge,
    composite_drop_pct_live:            dropPct,
    downgrade_imminent_live:            downgImminent,
    is_material_downgrade_live:         matDown,
    rating_band_live:                   band,
    investment_grade_live:              band ? isInvestmentGrade(band) : false,
    distressed_live:                    band ? isDistressedBand(band) : false,
    bridges_to_registration_chain_live: bridgesToRegistrationChain(row.registration_chain_ref),
    bridges_to_mrv_chain_live:          bridgesToMrvChain(row.mrv_chain_ref),
    bridges_to_reversal_chain_live:     bridgesToReversalChain(status, row.reversal_chain_ref),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier        = c.req.query('tier');
  const status      = c.req.query('status');
  const project     = c.req.query('project_id');
  const issuer      = c.req.query('issuer_id');
  const rater       = c.req.query('rater_id');
  const breached    = c.req.query('breached');
  const reportable  = c.req.query('reportable');
  const band        = c.req.query('rating_band');
  const distressed  = c.req.query('distressed');

  let sql = 'SELECT * FROM oe_carbon_credit_rating WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)     { sql += ' AND current_tier = ?';   binds.push(tier); }
  if (status)   { sql += ' AND chain_status = ?';   binds.push(status); }
  if (project)  { sql += ' AND project_id = ?';     binds.push(project); }
  if (issuer)   { sql += ' AND issuer_id = ?';      binds.push(issuer); }
  if (rater)    { sql += ' AND rater_id = ?';       binds.push(rater); }
  if (band)     { sql += ' AND rating_band = ?';    binds.push(band); }
  sql += ' ORDER BY datetime(rating_requested_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<CcrRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, [], now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live || r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);
  if (distressed === 'true') items = items.filter((r) => r.distressed_live);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_band: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    if (i.rating_band_live) by_band[i.rating_band_live] = (by_band[i.rating_band_live] || 0) + 1;
  }

  const active_count       = items.filter((i) => !i.is_terminal).length;
  const published_count    = items.filter((i) => i.chain_status === 'published').length;
  const monitoring_count   = items.filter((i) => i.chain_status === 'monitoring').length;
  const re_rated_count     = items.filter((i) => i.chain_status === 're_rated').length;
  const downgraded_count   = items.filter((i) => i.chain_status === 'downgraded').length;
  const withdrawn_count    = items.filter((i) => i.chain_status === 'withdrawn').length;
  const integrity_count    = items.filter((i) => i.chain_status === 'escalated_to_integrity').length;
  const institutional_count = items.filter((i) => i.current_tier === 'institutional').length;
  const premium_count      = items.filter((i) => i.current_tier === 'premium').length;
  const breached_count     = items.filter((i) => (i.sla_breached_live || i.sla_breached) && !i.is_terminal).length;
  const reportable_total   = items.filter((i) => i.is_reportable_flag).length;
  const downgrade_imminent_count = items.filter((i) => i.downgrade_imminent_live).length;
  const material_downgrade_count = items.filter((i) => i.is_material_downgrade_live).length;
  const investment_grade_count   = items.filter((i) => i.investment_grade_live).length;
  const distressed_count   = items.filter((i) => i.distressed_live).length;
  const article_6_count    = items.filter((i) => !!i.article_6_authorised).length;
  const ccp_aligned_count  = items.filter((i) => !!i.ccp_aligned_project).length;
  const stale_count        = items.filter((i) => i.monitoring_data_stale_live).length;
  const registration_bridged = items.filter((i) => i.bridges_to_registration_chain_live).length;
  const mrv_bridged        = items.filter((i) => i.bridges_to_mrv_chain_live).length;
  const reversal_bridged   = items.filter((i) => i.bridges_to_reversal_chain_live).length;
  const total_scope_tonnes = items.reduce((s, i) => s + (i.scope_scale_tonnes || 0), 0);
  const avg_composite      = items.filter((i) => i.composite_score != null).reduce((s, i) => s + (i.composite_score || 0), 0) /
                              Math.max(1, items.filter((i) => i.composite_score != null).length);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_band,
      active_count,
      published_count,
      monitoring_count,
      re_rated_count,
      downgraded_count,
      withdrawn_count,
      integrity_count,
      institutional_count,
      premium_count,
      breached: breached_count,
      reportable_total,
      downgrade_imminent_count,
      material_downgrade_count,
      investment_grade_count,
      distressed_count,
      article_6_count,
      ccp_aligned_count,
      stale_count,
      registration_bridged_count: registration_bridged,
      mrv_bridged_count:          mrv_bridged,
      reversal_bridged_count:     reversal_bridged,
      total_scope_tonnes,
      avg_composite_score: Math.round(avg_composite * 100) / 100,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, rating_band, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_carbon_credit_rating GROUP BY chain_status, current_tier, rating_band, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; rating_band: string | null;
    regulator_relevant: number; sla_breached: number;
    n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_band: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.rating_band) by_band[r.rating_band] = (by_band[r.rating_band] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({ success: true, data: { total, by_status, by_tier, by_band, by_regulator_relevant, by_sla_breached } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_carbon_credit_rating WHERE id = ?').bind(id).first<CcrRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_carbon_credit_rating_events WHERE rating_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<CcrEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, ev.results || [], new Date()),
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
  project_id?: string;
  project_name?: string;
  issuer_id?: string;
  issuer_name?: string;
  rater_id?: string;
  rater_name?: string;
  buyer_id?: string;
  buyer_name?: string;
  registration_chain_ref?: string;
  mrv_chain_ref?: string;
  reversal_chain_ref?: string;
  credit_vintage_year?: number;
  multi_vintage?: boolean | number;
  scope_scale_tonnes?: number;
  methodology_id?: string;
  methodology_name?: string;
  registry_name?: string;
  icroa_aligned?: boolean | number;
  afolu_high_reversal_risk?: boolean | number;
  methodology_under_review?: boolean | number;
  external_credit_red_flag?: boolean | number;
  ccp_aligned_project?: boolean | number;
  article_6_authorised?: boolean | number;
  institutional_buyer?: boolean | number;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

interface ScoreSubBody extends CommonBody { score?: number; }
interface ComputeCompositeBody extends CommonBody {}
interface PublishRatingBody extends CommonBody {}
interface StartMonitoringBody extends CommonBody { last_monitoring_data_at?: string; }
interface TriggerReratingBody extends CommonBody {}
interface RerateBody extends CommonBody {
  methodology_score?: number;
  additionality_score?: number;
  permanence_score?: number;
  leakage_score?: number;
  cobenefit_score?: number;
}
interface DowngradeBody extends CommonBody { downgrade_reason?: string; }
interface WithdrawBody extends CommonBody {
  withdraw_reason?: string;
  issuer_disputed?: boolean | number;
}
interface EscalateBody extends CommonBody { integrity_reason?: string; }
interface RemediateBody extends CommonBody { remediation_narrative?: string; }

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<CcrRow>): Partial<CcrRow> {
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

// ─── Create endpoint (request_rating) ─────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `ccr-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `CCR-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const scale = Number(body.scope_scale_tonnes ?? 0);
  const vintage = Number(body.credit_vintage_year ?? 0);
  const mv = toFlag(body.multi_vintage) ?? 0;

  const flags = {
    afolu_high_reversal_risk: toFlag(body.afolu_high_reversal_risk) ?? 0,
    methodology_under_review: toFlag(body.methodology_under_review) ?? 0,
    external_credit_red_flag: toFlag(body.external_credit_red_flag) ?? 0,
    ccp_aligned_project:      toFlag(body.ccp_aligned_project) ?? 0,
    article_6_authorised:     toFlag(body.article_6_authorised) ?? 0,
  };
  const instBuyer = toFlag(body.institutional_buyer) ?? 0;

  const rawTier = tierForScale(scale, !!mv);
  const tier = effectiveTier(rawTier, {
    afolu_high_reversal_risk: !!flags.afolu_high_reversal_risk,
    methodology_under_review: !!flags.methodology_under_review,
    external_credit_red_flag: !!flags.external_credit_red_flag,
    ccp_aligned_project:      !!flags.ccp_aligned_project,
    article_6_authorised:     !!flags.article_6_authorised,
  }, !!instBuyer);

  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('rating_requested', tier, now);
  const slaTargetHours = SLA_HOURS['rating_requested'][tier] ?? 0;
  const vintageAge = vintageAgeYears(vintage, now);

  await c.env.DB.prepare(
    `INSERT INTO oe_carbon_credit_rating (
      id, rating_number,
      project_id, project_name,
      issuer_id, issuer_name,
      rater_id, rater_name,
      buyer_id, buyer_name,
      registration_chain_ref, mrv_chain_ref, reversal_chain_ref,
      credit_vintage_year, multi_vintage, scope_scale_tonnes,
      methodology_id, methodology_name, registry_name,
      composite_drop_pct, icroa_aligned,
      afolu_high_reversal_risk, methodology_under_review,
      external_credit_red_flag, ccp_aligned_project,
      article_6_authorised, institutional_buyer, issuer_disputed,
      current_tier, authority_required,
      urgency_band, rating_completeness_index,
      rerating_count_30d, monitoring_data_stale, vintage_age_years,
      title, narrative,
      current_ball_in_court_party,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, rating_requested_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.project_id ?? `cproj-${id}`, body.project_name ?? null,
    body.issuer_id ?? 'issuer-unknown', body.issuer_name ?? null,
    body.rater_id ?? user.id, body.rater_name ?? null,
    body.buyer_id ?? null, body.buyer_name ?? null,
    body.registration_chain_ref ?? null, body.mrv_chain_ref ?? null, body.reversal_chain_ref ?? null,
    vintage, mv, scale,
    body.methodology_id ?? null, body.methodology_name ?? null, body.registry_name ?? null,
    0, toFlag(body.icroa_aligned) ?? 0,
    flags.afolu_high_reversal_risk, flags.methodology_under_review,
    flags.external_credit_red_flag, flags.ccp_aligned_project,
    flags.article_6_authorised, instBuyer, 0,
    tier, authorityRequired(tier),
    urgencyBand(tier, slaTargetHours), 0,
    0, 0, vintageAge,
    body.title ?? null, body.narrative ?? null,
    'rater',
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'rating_requested', nowIso,
    slaTargetHours, sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `carbon_rating_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_carbon_credit_rating_events (id, rating_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'carbon_rating_requested', null, 'rating_requested',
    user.id, partyForAction('request_rating'),
    typeof body.narrative === 'string' ? body.narrative : null,
    JSON.stringify({ action: 'request_rating', tier, scope_scale_tonnes: scale }),
    nowIso,
  ).run();

  await fireCascade({
    event: 'carbon_rating_requested',
    actor_id: user.id,
    entity_type: 'carbon_credit_rating',
    entity_id: id,
    data: {
      id,
      rating_number: num,
      chain_status: 'rating_requested',
      current_tier: tier,
      scope_scale_tonnes: scale,
      action: 'request_rating',
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_carbon_credit_rating WHERE id = ?').bind(id).first<CcrRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, [], now) : null } });
});

async function transition(
  c: Context<HonoEnv>,
  action: CcrAction,
  bodyHandler?: (row: CcrRow, body: Record<string, unknown>) => Partial<CcrRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_carbon_credit_rating WHERE id = ?').bind(id).first<CcrRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from scope_scale_tonnes + multi_vintage + 5 floor flags.
  const scale = (overrides.scope_scale_tonnes as number | undefined) ?? row.scope_scale_tonnes;
  const mv = Boolean((overrides.multi_vintage as number | undefined) ?? row.multi_vintage);
  const rawTier = tierForScale(scale, mv);
  const floorFlags = {
    afolu_high_reversal_risk:
      Boolean((overrides.afolu_high_reversal_risk as number | undefined) ?? row.afolu_high_reversal_risk),
    methodology_under_review:
      Boolean((overrides.methodology_under_review as number | undefined) ?? row.methodology_under_review),
    external_credit_red_flag:
      Boolean((overrides.external_credit_red_flag as number | undefined) ?? row.external_credit_red_flag),
    ccp_aligned_project:
      Boolean((overrides.ccp_aligned_project as number | undefined) ?? row.ccp_aligned_project),
    article_6_authorised:
      Boolean((overrides.article_6_authorised as number | undefined) ?? row.article_6_authorised),
  };
  const instBuyer = Boolean((overrides.institutional_buyer as number | undefined) ?? row.institutional_buyer);
  const tier = effectiveTier(rawTier, floorFlags, instBuyer);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaTargetHours = SLA_HOURS[to]?.[tier] ?? 0;

  overrides.sla_target_hours = slaTargetHours;
  overrides.urgency_band = urgencyBand(tier, slaTargetHours);

  // Re-compute composite + band whenever a sub-score is updated or compute_composite fires.
  const subs = {
    methodology_score:   (overrides.methodology_score as number | undefined) ?? row.methodology_score,
    additionality_score: (overrides.additionality_score as number | undefined) ?? row.additionality_score,
    permanence_score:    (overrides.permanence_score as number | undefined) ?? row.permanence_score,
    leakage_score:       (overrides.leakage_score as number | undefined) ?? row.leakage_score,
    cobenefit_score:     (overrides.cobenefit_score as number | undefined) ?? row.cobenefit_score,
  };
  const icroa = Boolean((overrides.icroa_aligned as number | undefined) ?? row.icroa_aligned);

  let compositeForCrossing = row.composite_score;
  let bandForCrossing: CcrRatingBand | null = row.rating_band;

  if (action === 'compute_composite' || action === 'rerate') {
    if (
      subs.methodology_score != null &&
      subs.additionality_score != null &&
      subs.permanence_score != null &&
      subs.leakage_score != null &&
      subs.cobenefit_score != null
    ) {
      const newComposite = computeCompositeScore({
        methodology_score:   subs.methodology_score,
        additionality_score: subs.additionality_score,
        permanence_score:    subs.permanence_score,
        leakage_score:       subs.leakage_score,
        cobenefit_score:     subs.cobenefit_score,
        icroa_aligned:       icroa,
      });
      const newBand = deriveRatingBand(newComposite);
      // Snapshot prior into prior_* on rerate.
      if (action === 'rerate' && row.composite_score != null) {
        overrides.prior_composite_score = row.composite_score;
        overrides.prior_rating_band = row.rating_band;
      }
      overrides.composite_score = newComposite;
      overrides.rating_band = newBand;
      overrides.composite_drop_pct = compositeDropPct(
        action === 'rerate' ? row.composite_score : row.prior_composite_score,
        newComposite,
      );
      compositeForCrossing = newComposite;
      bandForCrossing = newBand;
    }
  }

  // For downgrade action, ensure band + drop pct reflect current state.
  if (action === 'downgrade') {
    if (overrides.composite_score == null && row.composite_score != null) {
      compositeForCrossing = row.composite_score;
    }
    if (overrides.rating_band == null) {
      bandForCrossing = row.rating_band || (compositeForCrossing != null ? deriveRatingBand(compositeForCrossing) : 'D');
      overrides.rating_band = bandForCrossing;
    } else {
      bandForCrossing = overrides.rating_band as CcrRatingBand;
    }
    // composite_drop_pct may have been pre-set by body; otherwise carry current.
    if (overrides.composite_drop_pct == null) {
      overrides.composite_drop_pct = row.composite_drop_pct;
    }
  }

  // SIGNATURE crossings.
  const crosses = crossesIntoRegulator(action, tier, {
    composite_drop_pct:   (overrides.composite_drop_pct as number | undefined) ?? row.composite_drop_pct,
    rating_band:          bandForCrossing,
    article_6_authorised: floorFlags.article_6_authorised,
    issuer_disputed:      Boolean((overrides.issuer_disputed as number | undefined) ?? row.issuer_disputed),
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  // Re-compute completeness index using fresh data.
  const stamps = {
    published_at: (overrides.published_at as string | null | undefined) ?? row.published_at,
    monitoring_at: (overrides.monitoring_at as string | null | undefined) ?? row.monitoring_at,
  };
  if (tsCol && to !== row.chain_status) {
    if (tsCol === 'published_at')   stamps.published_at = nowIso;
    if (tsCol === 'monitoring_at')  stamps.monitoring_at = nowIso;
  }
  overrides.rating_completeness_index = ratingCompletenessIndex({
    methodology:   subs.methodology_score != null,
    additionality: subs.additionality_score != null,
    permanence:    subs.permanence_score != null,
    leakage:       subs.leakage_score != null,
    cobenefit:     subs.cobenefit_score != null,
    composite:     ((overrides.composite_score as number | undefined) ?? row.composite_score) != null,
    published:     !!stamps.published_at,
    monitoring:    !!stamps.monitoring_at,
  });

  // Vintage age.
  overrides.vintage_age_years = vintageAgeYears(row.credit_vintage_year, now);

  // Monitoring freshness when start_monitoring stamps last_monitoring_data_at.
  const lastData = (overrides.last_monitoring_data_at as string | undefined) ?? row.last_monitoring_data_at;
  if (lastData) {
    overrides.monitoring_freshness_days = monitoringFreshnessDays(lastData, now);
    overrides.monitoring_data_stale = monitoringDataStale(lastData, now) ? 1 : 0;
  }

  // Party tracking.
  const party = partyForAction(action);
  overrides.last_responder_party = party;
  if (action === 'start_desk_review')     overrides.current_ball_in_court_party = 'rater';
  if (action === 'score_methodology')     overrides.current_ball_in_court_party = 'rater';
  if (action === 'score_additionality')   overrides.current_ball_in_court_party = 'rater';
  if (action === 'score_permanence')      overrides.current_ball_in_court_party = 'rater';
  if (action === 'score_leakage')         overrides.current_ball_in_court_party = 'rater';
  if (action === 'score_cobenefits')      overrides.current_ball_in_court_party = 'rater';
  if (action === 'compute_composite')     overrides.current_ball_in_court_party = 'rater';
  if (action === 'publish_rating')        overrides.current_ball_in_court_party = 'rater';
  if (action === 'start_monitoring')      overrides.current_ball_in_court_party = 'rater';
  if (action === 'trigger_rerating')      overrides.current_ball_in_court_party = 'rater';
  if (action === 'rerate')                overrides.current_ball_in_court_party = 'rater';
  if (action === 'downgrade')             overrides.current_ball_in_court_party = 'issuer';
  if (action === 'withdraw')              overrides.current_ball_in_court_party = null;
  if (action === 'escalate_to_integrity') overrides.current_ball_in_court_party = null;
  if (action === 'remediate')             overrides.current_ball_in_court_party = 'rater';

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
    `UPDATE oe_carbon_credit_rating SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `carbon_rating_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_carbon_credit_rating_events (id, rating_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventName,
    row.chain_status,
    to,
    user.id,
    party,
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'carbon_credit_rating',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_carbon_credit_rating WHERE id = ?').bind(id).first<CcrRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, [], now) : null } });
}

// ─── 15 action endpoints (request_rating is the create above) ─────────────
app.post('/:id/start-desk-review', async (c) =>
  transition(c, 'start_desk_review', (_row, body) => applyCommon(body as Partial<CommonBody>, {})),
);

app.post('/:id/score-methodology', async (c) => transition(c, 'score_methodology', (_row, body) => {
  const b = body as Partial<ScoreSubBody>;
  const out: Partial<CcrRow> = {};
  if (typeof b.score === 'number') out.methodology_score = b.score;
  return applyCommon(b, out);
}));

app.post('/:id/score-additionality', async (c) => transition(c, 'score_additionality', (_row, body) => {
  const b = body as Partial<ScoreSubBody>;
  const out: Partial<CcrRow> = {};
  if (typeof b.score === 'number') out.additionality_score = b.score;
  return applyCommon(b, out);
}));

app.post('/:id/score-permanence', async (c) => transition(c, 'score_permanence', (_row, body) => {
  const b = body as Partial<ScoreSubBody>;
  const out: Partial<CcrRow> = {};
  if (typeof b.score === 'number') out.permanence_score = b.score;
  return applyCommon(b, out);
}));

app.post('/:id/score-leakage', async (c) => transition(c, 'score_leakage', (_row, body) => {
  const b = body as Partial<ScoreSubBody>;
  const out: Partial<CcrRow> = {};
  if (typeof b.score === 'number') out.leakage_score = b.score;
  return applyCommon(b, out);
}));

app.post('/:id/score-cobenefits', async (c) => transition(c, 'score_cobenefits', (_row, body) => {
  const b = body as Partial<ScoreSubBody>;
  const out: Partial<CcrRow> = {};
  if (typeof b.score === 'number') out.cobenefit_score = b.score;
  return applyCommon(b, out);
}));

app.post('/:id/compute-composite', async (c) =>
  transition(c, 'compute_composite', (_row, body) => applyCommon(body as Partial<ComputeCompositeBody>, {})),
);

app.post('/:id/publish-rating', async (c) =>
  transition(c, 'publish_rating', (_row, body) => applyCommon(body as Partial<PublishRatingBody>, {})),
);

app.post('/:id/start-monitoring', async (c) => transition(c, 'start_monitoring', (_row, body) => {
  const b = body as Partial<StartMonitoringBody>;
  const out: Partial<CcrRow> = {};
  if (typeof b.last_monitoring_data_at === 'string') out.last_monitoring_data_at = b.last_monitoring_data_at;
  return applyCommon(b, out);
}));

app.post('/:id/trigger-rerating', async (c) =>
  transition(c, 'trigger_rerating', (_row, body) => applyCommon(body as Partial<TriggerReratingBody>, {})),
);

app.post('/:id/rerate', async (c) => transition(c, 'rerate', (_row, body) => {
  const b = body as Partial<RerateBody>;
  const out: Partial<CcrRow> = {};
  if (typeof b.methodology_score === 'number')   out.methodology_score = b.methodology_score;
  if (typeof b.additionality_score === 'number') out.additionality_score = b.additionality_score;
  if (typeof b.permanence_score === 'number')    out.permanence_score = b.permanence_score;
  if (typeof b.leakage_score === 'number')       out.leakage_score = b.leakage_score;
  if (typeof b.cobenefit_score === 'number')     out.cobenefit_score = b.cobenefit_score;
  return applyCommon(b, out);
}));

app.post('/:id/downgrade', async (c) => transition(c, 'downgrade', (_row, body) => {
  const b = body as Partial<DowngradeBody>;
  const out: Partial<CcrRow> = {};
  if (typeof b.downgrade_reason === 'string') out.downgrade_reason = b.downgrade_reason;
  return applyCommon(b, out);
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<CcrRow> = {};
  if (typeof b.withdraw_reason === 'string') out.withdraw_reason = b.withdraw_reason;
  const dispFlag = toFlag(b.issuer_disputed);
  if (dispFlag !== undefined) out.issuer_disputed = dispFlag;
  return applyCommon(b, out);
}));

app.post('/:id/escalate-to-integrity', async (c) => transition(c, 'escalate_to_integrity', (_row, body) => {
  const b = body as Partial<EscalateBody>;
  const out: Partial<CcrRow> = {};
  if (typeof b.integrity_reason === 'string') out.integrity_reason = b.integrity_reason;
  return applyCommon(b, out);
}));

app.post('/:id/remediate', async (c) => transition(c, 'remediate', (_row, body) => {
  const b = body as Partial<RemediateBody>;
  const out: Partial<CcrRow> = {};
  if (typeof b.remediation_narrative === 'string') out.remediation_narrative = b.remediation_narrative;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
//
// INVERTED SLA polarity stored in HOURS. Sweeps every 15 min for active
// rows past sla_deadline_at. SLA breaches cross regulator on
// premium+institutional per CCP + ICROA disclosure rules.
export async function carbonCreditRatingSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_carbon_credit_rating
     WHERE chain_status NOT IN ('re_rated','withdrawn','escalated_to_integrity','downgraded')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<CcrRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_carbon_credit_rating
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `carbon_rating_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_carbon_credit_rating_events (id, rating_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'carbon_rating_sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'rater',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier}, ${row.sla_target_hours}h target)`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at, sla_target_hours: row.sla_target_hours }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'carbon_rating_sla_breached',
        actor_id: 'system',
        entity_type: 'carbon_credit_rating',
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

// ─── Cron: Monitoring-freshness scan (daily 05:00) ────────────────────────
//
// Walks every monitoring row. If last_monitoring_data_at is older than the
// 90d MONITORING_STALE_DAYS threshold, transition the row to
// re_rating_triggered (auto trigger_rerating). Refresh monitoring_freshness
// and stale flag for fresh rows so the LIVE battery stays current.
export async function carbonCreditRatingMonitoringFreshnessScan(env: HonoEnv['Bindings']): Promise<{ scanned: number; auto_triggered: number; freshness_updated: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_carbon_credit_rating
     WHERE chain_status = 'monitoring'`,
  ).all<CcrRow>();

  const rows = rs.results || [];
  let auto_triggered = 0;
  let freshness_updated = 0;

  for (const row of rows) {
    const freshDays = monitoringFreshnessDays(row.last_monitoring_data_at, now);
    const stale = monitoringDataStale(row.last_monitoring_data_at, now);

    // Update the freshness fields whenever they drift.
    if (
      freshDays !== row.monitoring_freshness_days ||
      (stale ? 1 : 0) !== row.monitoring_data_stale
    ) {
      await env.DB.prepare(
        `UPDATE oe_carbon_credit_rating
         SET monitoring_freshness_days = ?, monitoring_data_stale = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(freshDays, stale ? 1 : 0, nowIso, row.id).run();
      freshness_updated++;
    }

    // Auto-trigger re-rating when data is stale.
    if (stale) {
      const tier = row.current_tier;
      const sla = slaDeadlineFor('re_rating_triggered', tier, now);
      const slaTargetHours = SLA_HOURS['re_rating_triggered'][tier] ?? 0;
      await env.DB.prepare(
        `UPDATE oe_carbon_credit_rating
         SET chain_status = 're_rating_triggered',
             re_rating_triggered_at = ?,
             sla_target_hours = ?, sla_deadline_at = ?,
             urgency_band = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(
        nowIso, slaTargetHours, sla ? sla.toISOString() : null,
        urgencyBand(tier, slaTargetHours), nowIso, row.id,
      ).run();

      const evtId = `carbon_rating_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      await env.DB.prepare(
        'INSERT INTO oe_carbon_credit_rating_events (id, rating_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        evtId, row.id, 'carbon_rating_rerating_triggered',
        'monitoring', 're_rating_triggered',
        'system', 'rater',
        `Auto-trigger: monitoring data ${freshDays}d stale (threshold ${MONITORING_STALE_DAYS}d)`,
        JSON.stringify({
          last_monitoring_data_at: row.last_monitoring_data_at,
          monitoring_freshness_days: freshDays,
          MONITORING_STALE_DAYS,
          tier,
        }),
        nowIso,
      ).run();

      await fireCascade({
        event: 'carbon_rating_rerating_triggered',
        actor_id: 'system',
        entity_type: 'carbon_credit_rating',
        entity_id: row.id,
        data: {
          ...row,
          chain_status: 're_rating_triggered',
          from_status: 'monitoring',
          action: 'trigger_rerating',
          auto_triggered: true,
        },
        env,
      });
      auto_triggered++;
    }
  }
  return { scanned: rows.length, auto_triggered, freshness_updated };
}

export default app;
