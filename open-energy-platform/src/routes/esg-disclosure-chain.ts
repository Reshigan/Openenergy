// ═══════════════════════════════════════════════════════════════════════════
// Wave 103 — ESG Disclosure Lifecycle & Assurance Chain (P6).
// 10th Carbon chain. Cross-mounts on Esums + Regulator.
//
// Mounted at /api/carbon/esg-disclosure/chain.
//
// USER DIRECTIVE OVERRIDE 2026-05-30: bring ESG reporting from L2
// (src/routes/esg-reports.ts — template list + basic generate) to L4-L5
// (state machine, INVERTED SLA, FLOOR-AT-MATERIAL, LIVE 4-framework
// completeness battery, 15-cat Scope 3, 4-step authority ladder, signature
// regulator crossings).
//
// 12-state P6 lifecycle (+ disputed + cancelled branches):
//   period_open -> data_collected -> boundary_verified -> metrics_computed
//   -> draft_compiled -> internal_review -> assurance_engaged
//   -> assurance_in_progress -> assured -> published -> filed -> archived
//   raise_dispute from {draft_compiled, internal_review, assured} -> disputed
//   resolve_dispute -> internal_review
//   restate_disclosure from filed -> draft_compiled (REOPENS — regulator
//                                                    hard line, every tier)
//   cancel_year from any non-terminal -> cancelled
//
// LIVE battery decorates every fetch — scope3_total_15cat / total_emissions /
// reduction_vs_baseline / sbti_alignment_score / tcfd-gri-cdp-jse_srl-king_iv-
// issb_s1_s2 completeness pcts / assurance_confidence / esg_disclosure_index
// 0-130 / regulator_filing_window_days / sla_days_remaining / urgency_band /
// authority_required (esg_analyst→sustainability_director→audit_committee_chair
// →board_chair).
//
// Beats Workiva ESG / Sphera SpheraCloud / SAP Sustainability Control
// Tower / Microsoft Sustainability Manager / IBM Envizi / Salesforce Net
// Zero Cloud / Greenstone / EcoVadis / Persefoni / Watershed / Diligent
// ESG / Bloomberg ESG / Refinitiv Lipper ESG by making annual disclosure a
// 12-state state-machine with INVERTED SLA + auto-tier from
// scope×exposure×assurance with material-floor on 5 flags + 4-framework
// completeness composed live + universal restate hard line.
//
// Write {admin, carbon_fund}. READ all 9 personas. actor_party functional:
// esg_analyst / sustainability_director / audit_committee_chair /
// board_chair / external_auditor / regulator_observer.
//
// SIGNATURE — JSE SRL §8.62 + Companies Act + SAICA Code 8 + Carbon Tax §6:
//   restate_disclosure   -> regulator EVERY tier (universal hard line —
//                            re-statement of public ESG disclosure ALWAYS
//                            reportable)
//   complete_assurance   -> regulator material+strategic when
//                            assurance_opinion in (qualified|adverse|disclaimer)
//   cancel_year          -> regulator EVERY tier when
//                            year_had_listed_disclosure = true
//   sla_breached         -> regulator strategic only (filing-deadline miss)
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForDisclosure,
  floorAtMaterial,
  effectiveTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  scope3Total15CatTco2e,
  totalEmissionsTco2e,
  reductionPctVsBaseline,
  sbtiAlignmentScore,
  tcfdCompletenessPct,
  cdpScoreBand,
  assuranceConfidence,
  esgDisclosureIndex,
  slaDaysRemaining,
  regulatorFilingWindowDays,
  urgencyBand,
  authorityRequired,
  SLA_MINUTES,
  type EsgStatus,
  type EsgAction,
} from '../utils/esg-disclosure-spec';

const READ_ROLES = new Set([
  'admin', 'carbon_fund',
  'ipp_developer', 'offtaker', 'trader', 'regulator', 'lender', 'grid_operator', 'support',
]);

const WRITE_ROLES = new Set(['admin', 'carbon_fund']);

interface EsgRow {
  id: string;
  disclosure_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  reporting_entity_id: string;
  reporting_entity_name: string | null;
  reporting_entity_lei: string | null;
  ticker: string | null;
  financial_year_label: string | null;
  financial_year_end_at: string | null;
  period_opened_at: string | null;
  disclosure_scope: string;
  climate_risk_exposure: string;
  assurance_level: string;
  assurance_opinion: string | null;
  assurance_provider: string | null;
  external_auditor_party_id: string | null;
  jse_listed_strict: number;
  scope3_inclusive_15cat: number;
  climate_scenario_required: number;
  material_topics_count: number;
  sbti_committed_strict: number;
  year_had_listed_disclosure: number;
  scope1_tco2e: number | null;
  scope2_market_tco2e: number | null;
  scope2_location_tco2e: number | null;
  scope3_total_tco2e: number | null;
  baseline_year: number | null;
  baseline_total_tco2e: number | null;
  reduction_pct_vs_baseline: number | null;
  sbti_alignment_score: number | null;
  tcfd_completeness_pct: number | null;
  gri_completeness_pct: number | null;
  cdp_score: number | null;
  cdp_score_band: string | null;
  jse_srl_completeness_pct: number | null;
  king_iv_completeness_pct: number | null;
  issb_s1_s2_completeness_pct: number | null;
  assurance_confidence_level: string | null;
  esg_disclosure_index: number | null;
  regulator_filing_window_days: number | null;
  urgency_band: string | null;
  current_tier: string;
  effective_tier: string | null;
  authority_required: string | null;
  dispute_count: number;
  restate_count: number;
  cancel_count: number;
  parent_disclosure_id: string | null;
  prior_disclosure_id: string | null;
  regulator_ref: string | null;
  jse_sens_ref: string | null;
  cipc_ref: string | null;
  dffe_ref: string | null;
  sars_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  disputed_reason: string | null;
  cancelled_reason: string | null;
  restated_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  analyst_party: string | null;
  director_party: string | null;
  audit_committee_party: string | null;
  board_party: string | null;
  chain_status: EsgStatus;
  period_open_at: string | null;
  data_collected_at: string | null;
  boundary_verified_at: string | null;
  metrics_computed_at: string | null;
  draft_compiled_at: string | null;
  internal_review_at: string | null;
  assurance_engaged_at: string | null;
  assurance_in_progress_at: string | null;
  assured_at: string | null;
  published_at: string | null;
  filed_at: string | null;
  archived_at: string | null;
  disputed_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EsgEventRow {
  id: string;
  disclosure_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<EsgStatus, keyof EsgRow | null> = {
  period_open:           'period_open_at',
  data_collected:        'data_collected_at',
  boundary_verified:     'boundary_verified_at',
  metrics_computed:      'metrics_computed_at',
  draft_compiled:        'draft_compiled_at',
  internal_review:       'internal_review_at',
  assurance_engaged:     'assurance_engaged_at',
  assurance_in_progress: 'assurance_in_progress_at',
  assured:               'assured_at',
  published:             'published_at',
  filed:                 'filed_at',
  archived:              'archived_at',
  disputed:              'disputed_at',
  cancelled:             'cancelled_at',
};

function statusEnteredAt(row: EsgRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.period_open_at ? new Date(row.period_open_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.period_open_at ? new Date(row.period_open_at) : null);
}

function daysInCourt(row: EsgRow, now: Date): number {
  const entered = statusEnteredAt(row);
  if (!entered) return 0;
  const ms = now.getTime() - entered.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function decorate(row: EsgRow, now: Date) {
  const tier = row.current_tier as 'minor' | 'standard' | 'material' | 'strategic';
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  // LIVE battery — composes raw inputs into derived metrics every fetch.
  const scope3Total = row.scope3_total_tco2e
    ?? scope3Total15CatTco2e(null);
  const totalEm = totalEmissionsTco2e(row.scope1_tco2e, row.scope2_market_tco2e, scope3Total);
  const reductionPct = row.reduction_pct_vs_baseline
    ?? reductionPctVsBaseline(totalEm, row.baseline_total_tco2e);
  const sbtiScore = row.sbti_alignment_score
    ?? sbtiAlignmentScore({
      target_set: row.sbti_committed_strict,
      target_validated: row.sbti_committed_strict,
      interim_progress_on_track: reductionPct > 0,
      reduction_above_42pct: reductionPct >= 42,
      scope3_target_set: row.scope3_inclusive_15cat,
    });
  const tcfdPct = row.tcfd_completeness_pct
    ?? tcfdCompletenessPct({
      governance: !!row.board_party,
      strategy: !!row.climate_scenario_required,
      risk_management: !!row.audit_committee_party,
      metrics_targets: !!row.scope1_tco2e,
    });
  const cdpBand = row.cdp_score_band ?? cdpScoreBand(row.cdp_score);
  const conf = assuranceConfidence(row.assurance_level, row.assurance_opinion);
  const restatedRecently = (row.restate_count || 0) > 0;
  const idx = esgDisclosureIndex({
    tcfd_pct: tcfdPct,
    gri_pct: row.gri_completeness_pct,
    cdp_band: cdpBand,
    jse_srl_pct: row.jse_srl_completeness_pct,
    issb_pct: row.issb_s1_s2_completeness_pct,
    king_iv_pct: row.king_iv_completeness_pct,
    sbti_score: sbtiScore,
    assurance_confidence: conf,
    restated_recently: restatedRecently,
  });

  const fyEnd = row.financial_year_end_at ? new Date(row.financial_year_end_at) : null;
  const filingWindow = regulatorFilingWindowDays(fyEnd, now);

  const floorFlag = floorAtMaterial({
    jse_listed_strict: row.jse_listed_strict,
    scope3_inclusive_15cat: row.scope3_inclusive_15cat,
    climate_scenario_required: row.climate_scenario_required,
    material_topics_count_8plus: (row.material_topics_count || 0) >= 8,
    sbti_committed_strict: row.sbti_committed_strict,
  });

  const enteredAt = statusEnteredAt(row);
  const slaLeft = slaDaysRemaining(status, tier, enteredAt, now);
  const urgency = urgencyBand(tier, filingWindow, slaLeft);
  const authority = authorityRequired(tier);
  const dic = daysInCourt(row, now);

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    floor_at_material_flag: floorFlag,
    scope3_total_tco2e_live: scope3Total,
    total_emissions_tco2e_live: totalEm,
    reduction_pct_vs_baseline_live: reductionPct,
    sbti_alignment_score_live: sbtiScore,
    tcfd_completeness_pct_live: tcfdPct,
    cdp_score_band_live: cdpBand,
    assurance_confidence_live: conf,
    esg_disclosure_index_live: idx,
    regulator_filing_window_days_live: filingWindow,
    sla_days_remaining_live: slaLeft,
    urgency_band_live: urgency,
    authority_required_live: authority,
    days_in_court_live: dic,
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
  const entity_id   = c.req.query('entity_id');
  const fy          = c.req.query('fy');
  const breached    = c.req.query('breached');
  const reportable  = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_esg_disclosure WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)      { sql += ' AND current_tier = ?';          binds.push(tier); }
  if (status)    { sql += ' AND chain_status = ?';          binds.push(status); }
  if (entity_id) { sql += ' AND reporting_entity_id = ?';   binds.push(entity_id); }
  if (fy)        { sql += ' AND financial_year_label = ?';  binds.push(fy); }

  sql += ' ORDER BY datetime(period_open_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<EsgRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_entity: Record<string, number> = {};
  const by_assurance: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_entity[i.reporting_entity_id] = (by_entity[i.reporting_entity_id] || 0) + 1;
    by_assurance[i.assurance_level] = (by_assurance[i.assurance_level] || 0) + 1;
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const archived_count   = items.filter((i) => i.chain_status === 'archived').length;
  const filed_count      = items.filter((i) => i.chain_status === 'filed').length;
  const published_count  = items.filter((i) => i.chain_status === 'published').length;
  const assured_count    = items.filter((i) => i.chain_status === 'assured').length;
  const disputed_count   = items.filter((i) => i.chain_status === 'disputed').length;
  const cancelled_count  = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_count   = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total = items.filter((i) => i.is_reportable_flag).length;

  const total_scope1_tco2e   = items.reduce((s, i) => s + (i.scope1_tco2e || 0), 0);
  const total_scope2_tco2e   = items.reduce((s, i) => s + (i.scope2_market_tco2e || 0), 0);
  const total_scope3_tco2e   = items.reduce((s, i) => s + (i.scope3_total_tco2e_live || 0), 0);
  const total_emissions_tco2e = items.reduce((s, i) => s + (i.total_emissions_tco2e_live || 0), 0);
  const avg_reduction_pct    = items.length
    ? Math.round((items.reduce((s, i) => s + (i.reduction_pct_vs_baseline_live || 0), 0) / items.length) * 10) / 10
    : 0;
  const avg_disclosure_index = items.length
    ? Math.round((items.reduce((s, i) => s + (i.esg_disclosure_index_live || 0), 0) / items.length) * 10) / 10
    : 0;
  const avg_tcfd_pct = items.length
    ? Math.round((items.reduce((s, i) => s + (i.tcfd_completeness_pct_live || 0), 0) / items.length) * 10) / 10
    : 0;

  const critical_urgency_count  = items.filter((i) => i.urgency_band_live === 'critical').length;
  const strategic_tier_count    = items.filter((i) => i.current_tier === 'strategic').length;
  const material_tier_count     = items.filter((i) => i.current_tier === 'material').length;
  const floor_at_material_count = items.filter((i) => i.floor_at_material_flag).length;
  const jse_listed_count        = items.filter((i) => !!i.jse_listed_strict).length;
  const qualified_opinion_count = items.filter((i) =>
    i.assurance_opinion === 'qualified' || i.assurance_opinion === 'adverse' || i.assurance_opinion === 'disclaimer',
  ).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_entity,
      by_assurance,
      open_count,
      archived_count,
      filed_count,
      published_count,
      assured_count,
      disputed_count,
      cancelled_count,
      breached: breached_count,
      reportable_total,
      total_scope1_tco2e,
      total_scope2_tco2e,
      total_scope3_tco2e,
      total_emissions_tco2e,
      avg_reduction_pct,
      avg_disclosure_index,
      avg_tcfd_pct,
      critical_urgency_count,
      strategic_tier_count,
      material_tier_count,
      floor_at_material_count,
      jse_listed_count,
      qualified_opinion_count,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_esg_disclosure WHERE id = ?').bind(id).first<EsgRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_esg_disclosure_events WHERE disclosure_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EsgEventRow>();

  return c.json({
    success: true,
    data: {
      disclosure: decorate(row, new Date()),
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
  result_text?: string;
}
interface CollectDataBody extends CommonBody {
  scope1_tco2e?: number;
  scope2_market_tco2e?: number;
  scope2_location_tco2e?: number;
  scope3_total_tco2e?: number;
  baseline_year?: number;
  baseline_total_tco2e?: number;
  scope3_inclusive_15cat?: boolean | number;
}
interface VerifyBoundaryBody extends CommonBody {
  disclosure_scope?: 'entity_only' | 'entity_plus_subsidiaries' | 'group_consolidated';
  climate_risk_exposure?: 'low' | 'medium' | 'high';
  jse_listed_strict?: boolean | number;
}
interface ComputeMetricsBody extends CommonBody {
  tcfd_completeness_pct?: number;
  gri_completeness_pct?: number;
  cdp_score?: number;
  jse_srl_completeness_pct?: number;
  king_iv_completeness_pct?: number;
  issb_s1_s2_completeness_pct?: number;
  sbti_alignment_score?: number;
  material_topics_count?: number;
  climate_scenario_required?: boolean | number;
  sbti_committed_strict?: boolean | number;
}
interface CompileDraftBody extends CommonBody {}
interface SubmitForReviewBody extends CommonBody {}
interface EngageAssuranceBody extends CommonBody {
  assurance_level?: 'none' | 'limited' | 'reasonable';
  assurance_provider?: string;
  external_auditor_party_id?: string;
}
interface StartAssuranceBody extends CommonBody {}
interface CompleteAssuranceBody extends CommonBody {
  assurance_opinion?: 'unqualified' | 'limited' | 'qualified' | 'adverse' | 'disclaimer';
}
interface PublishDisclosureBody extends CommonBody {}
interface FileRegulatorBody extends CommonBody {
  jse_sens_ref?: string;
  cipc_ref?: string;
  dffe_ref?: string;
  sars_ref?: string;
}
interface ArchiveYearBody extends CommonBody {}
interface RaiseDisputeBody extends CommonBody {
  disputed_reason?: string;
}
interface ResolveDisputeBody extends CommonBody {}
interface RestateDisclosureBody extends CommonBody {
  restated_reason?: string;
}
interface CancelYearBody extends CommonBody {
  cancelled_reason?: string;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<EsgRow>): Partial<EsgRow> {
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.title === 'string')         out.title = b.title;
  if (typeof b.narrative === 'string')     out.narrative = b.narrative;
  if (typeof b.result_text === 'string')   out.result_text = b.result_text;
  return out;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

async function transition(
  c: Context<HonoEnv>,
  action: EsgAction,
  bodyHandler?: (row: EsgRow, body: Record<string, unknown>) => Partial<EsgRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_esg_disclosure WHERE id = ?').bind(id).first<EsgRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from freshest scope x exposure x assurance + 5 floor flags.
  const scope = (overrides.disclosure_scope as string | undefined) ?? row.disclosure_scope;
  const exposure = (overrides.climate_risk_exposure as string | undefined) ?? row.climate_risk_exposure;
  const assurance = (overrides.assurance_level as string | undefined) ?? row.assurance_level;
  const rawTier = tierForDisclosure(scope, exposure, assurance);
  const floorFlags = {
    jse_listed_strict:           (overrides.jse_listed_strict as number | undefined) ?? row.jse_listed_strict,
    scope3_inclusive_15cat:      (overrides.scope3_inclusive_15cat as number | undefined) ?? row.scope3_inclusive_15cat,
    climate_scenario_required:   (overrides.climate_scenario_required as number | undefined) ?? row.climate_scenario_required,
    material_topics_count_8plus: ((overrides.material_topics_count as number | undefined) ?? row.material_topics_count) >= 8 ? 1 : 0,
    sbti_committed_strict:       (overrides.sbti_committed_strict as number | undefined) ?? row.sbti_committed_strict,
  };
  const floor = floorAtMaterial(floorFlags);
  const tier = effectiveTier(rawTier, floor);
  overrides.current_tier = tier;
  overrides.effective_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const opinion = (overrides.assurance_opinion as string | undefined) ?? row.assurance_opinion;
  const listed = (overrides.year_had_listed_disclosure as number | undefined) ?? row.year_had_listed_disclosure;
  const crosses = crossesIntoRegulator(action, tier, opinion, listed);
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  if (action === 'raise_dispute')       overrides.dispute_count = (row.dispute_count || 0) + 1;
  if (action === 'cancel_year')         overrides.cancel_count  = (row.cancel_count  || 0) + 1;
  if (action === 'restate_disclosure')  overrides.restate_count = (row.restate_count || 0) + 1;

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
    `UPDATE oe_esg_disclosure SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `esg_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_esg_disclosure_events (id, disclosure_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      entity_type: 'esg_disclosure',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_esg_disclosure WHERE id = ?').bind(id).first<EsgRow>();
  return c.json({ success: true, data: { disclosure: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/collect-data', async (c) => transition(c, 'collect_data', (_row, body) => {
  const b = body as Partial<CollectDataBody>;
  const out: Partial<EsgRow> = {};
  if (typeof b.scope1_tco2e === 'number')         out.scope1_tco2e = b.scope1_tco2e;
  if (typeof b.scope2_market_tco2e === 'number')  out.scope2_market_tco2e = b.scope2_market_tco2e;
  if (typeof b.scope2_location_tco2e === 'number')out.scope2_location_tco2e = b.scope2_location_tco2e;
  if (typeof b.scope3_total_tco2e === 'number')   out.scope3_total_tco2e = b.scope3_total_tco2e;
  if (typeof b.baseline_year === 'number')        out.baseline_year = b.baseline_year;
  if (typeof b.baseline_total_tco2e === 'number') out.baseline_total_tco2e = b.baseline_total_tco2e;
  const s3 = toFlag(b.scope3_inclusive_15cat); if (s3 !== undefined) out.scope3_inclusive_15cat = s3;
  return applyCommon(b, out);
}));

app.post('/:id/verify-boundary', async (c) => transition(c, 'verify_boundary', (_row, body) => {
  const b = body as Partial<VerifyBoundaryBody>;
  const out: Partial<EsgRow> = {};
  if (typeof b.disclosure_scope === 'string')      out.disclosure_scope = b.disclosure_scope;
  if (typeof b.climate_risk_exposure === 'string') out.climate_risk_exposure = b.climate_risk_exposure;
  const jl = toFlag(b.jse_listed_strict); if (jl !== undefined) out.jse_listed_strict = jl;
  return applyCommon(b, out);
}));

app.post('/:id/compute-metrics', async (c) => transition(c, 'compute_metrics', (_row, body) => {
  const b = body as Partial<ComputeMetricsBody>;
  const out: Partial<EsgRow> = {};
  if (typeof b.tcfd_completeness_pct === 'number')      out.tcfd_completeness_pct = b.tcfd_completeness_pct;
  if (typeof b.gri_completeness_pct === 'number')       out.gri_completeness_pct = b.gri_completeness_pct;
  if (typeof b.cdp_score === 'number')                  { out.cdp_score = b.cdp_score; out.cdp_score_band = cdpScoreBand(b.cdp_score); }
  if (typeof b.jse_srl_completeness_pct === 'number')   out.jse_srl_completeness_pct = b.jse_srl_completeness_pct;
  if (typeof b.king_iv_completeness_pct === 'number')   out.king_iv_completeness_pct = b.king_iv_completeness_pct;
  if (typeof b.issb_s1_s2_completeness_pct === 'number')out.issb_s1_s2_completeness_pct = b.issb_s1_s2_completeness_pct;
  if (typeof b.sbti_alignment_score === 'number')       out.sbti_alignment_score = b.sbti_alignment_score;
  if (typeof b.material_topics_count === 'number')      out.material_topics_count = b.material_topics_count;
  const cs = toFlag(b.climate_scenario_required); if (cs !== undefined) out.climate_scenario_required = cs;
  const sb = toFlag(b.sbti_committed_strict);     if (sb !== undefined) out.sbti_committed_strict = sb;
  return applyCommon(b, out);
}));

app.post('/:id/compile-draft', async (c) => transition(c, 'compile_draft', (_row, body) =>
  applyCommon(body as Partial<CompileDraftBody>, {}),
));

app.post('/:id/submit-for-review', async (c) => transition(c, 'submit_for_review', (_row, body) =>
  applyCommon(body as Partial<SubmitForReviewBody>, {}),
));

app.post('/:id/engage-assurance', async (c) => transition(c, 'engage_assurance', (_row, body) => {
  const b = body as Partial<EngageAssuranceBody>;
  const out: Partial<EsgRow> = {};
  if (typeof b.assurance_level === 'string')          out.assurance_level = b.assurance_level;
  if (typeof b.assurance_provider === 'string')       out.assurance_provider = b.assurance_provider;
  if (typeof b.external_auditor_party_id === 'string')out.external_auditor_party_id = b.external_auditor_party_id;
  return applyCommon(b, out);
}));

app.post('/:id/start-assurance', async (c) => transition(c, 'start_assurance', (_row, body) =>
  applyCommon(body as Partial<StartAssuranceBody>, {}),
));

app.post('/:id/complete-assurance', async (c) => transition(c, 'complete_assurance', (_row, body) => {
  const b = body as Partial<CompleteAssuranceBody>;
  const out: Partial<EsgRow> = {};
  if (typeof b.assurance_opinion === 'string') out.assurance_opinion = b.assurance_opinion;
  return applyCommon(b, out);
}));

app.post('/:id/publish-disclosure', async (c) => transition(c, 'publish_disclosure', (_row, body) =>
  applyCommon(body as Partial<PublishDisclosureBody>, {}),
));

app.post('/:id/file-regulator', async (c) => transition(c, 'file_regulator', (_row, body) => {
  const b = body as Partial<FileRegulatorBody>;
  const out: Partial<EsgRow> = {};
  if (typeof b.jse_sens_ref === 'string') out.jse_sens_ref = b.jse_sens_ref;
  if (typeof b.cipc_ref === 'string')     out.cipc_ref = b.cipc_ref;
  if (typeof b.dffe_ref === 'string')     out.dffe_ref = b.dffe_ref;
  if (typeof b.sars_ref === 'string')     out.sars_ref = b.sars_ref;
  return applyCommon(b, out);
}));

app.post('/:id/archive-year', async (c) => transition(c, 'archive_year', (_row, body) =>
  applyCommon(body as Partial<ArchiveYearBody>, {}),
));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (_row, body) => {
  const b = body as Partial<RaiseDisputeBody>;
  const out: Partial<EsgRow> = {};
  if (typeof b.disputed_reason === 'string') out.disputed_reason = b.disputed_reason;
  return applyCommon(b, out);
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) =>
  applyCommon(body as Partial<ResolveDisputeBody>, {}),
));

app.post('/:id/restate-disclosure', async (c) => transition(c, 'restate_disclosure', (_row, body) => {
  const b = body as Partial<RestateDisclosureBody>;
  const out: Partial<EsgRow> = {};
  if (typeof b.restated_reason === 'string') out.restated_reason = b.restated_reason;
  return applyCommon(b, out);
}));

app.post('/:id/cancel-year', async (c) => transition(c, 'cancel_year', (_row, body) => {
  const b = body as Partial<CancelYearBody>;
  const out: Partial<EsgRow> = {};
  if (typeof b.cancelled_reason === 'string') out.cancelled_reason = b.cancelled_reason;
  return applyCommon(b, out);
}));

// Generate-report action snapshots the LIVE battery at the time of
// generation. This is the bridge that makes the existing L2 esg-reports.ts
// generator a child of the L4 chain — instead of standalone template
// rendering, generated reports carry the snapshot of every framework
// completeness pct + emissions ledger + assurance opinion + tier authority.
app.post('/:id/generate-report', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_esg_disclosure WHERE id = ?').bind(id).first<EsgRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  const decorated = decorate(row, new Date());
  const snapshot = {
    disclosure_id: row.id,
    disclosure_number: row.disclosure_number,
    reporting_entity_name: row.reporting_entity_name,
    financial_year_label: row.financial_year_label,
    chain_status: row.chain_status,
    current_tier: row.current_tier,
    snapshot_at: new Date().toISOString(),
    snapshot_by: user.id,
    battery: {
      scope1_tco2e: row.scope1_tco2e,
      scope2_market_tco2e: row.scope2_market_tco2e,
      scope3_total_tco2e: decorated.scope3_total_tco2e_live,
      total_emissions_tco2e: decorated.total_emissions_tco2e_live,
      reduction_pct_vs_baseline: decorated.reduction_pct_vs_baseline_live,
      sbti_alignment_score: decorated.sbti_alignment_score_live,
      tcfd_completeness_pct: decorated.tcfd_completeness_pct_live,
      gri_completeness_pct: row.gri_completeness_pct,
      cdp_score_band: decorated.cdp_score_band_live,
      jse_srl_completeness_pct: row.jse_srl_completeness_pct,
      king_iv_completeness_pct: row.king_iv_completeness_pct,
      issb_s1_s2_completeness_pct: row.issb_s1_s2_completeness_pct,
      assurance_level: row.assurance_level,
      assurance_opinion: row.assurance_opinion,
      assurance_confidence: decorated.assurance_confidence_live,
      esg_disclosure_index: decorated.esg_disclosure_index_live,
      regulator_filing_window_days: decorated.regulator_filing_window_days_live,
      urgency_band: decorated.urgency_band_live,
      authority_required: decorated.authority_required_live,
    },
  };
  return c.json({ success: true, data: { report: snapshot } });
});

export async function esgDisclosureSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_esg_disclosure
     WHERE chain_status NOT IN ('archived','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<EsgRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_esg_disclosure
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `esg_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_esg_disclosure_events (id, disclosure_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'esg_disclosure.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'regulator_observer',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as 'minor' | 'standard' | 'material' | 'strategic')) {
      await fireCascade({
        event: 'esg_disclosure.sla_breached',
        actor_id: 'system',
        entity_type: 'esg_disclosure',
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

export default app;
