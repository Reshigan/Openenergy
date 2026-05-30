// ═══════════════════════════════════════════════════════════════════════════
// Wave 91 — ICVCM CCP-eligibility Assessment & Label Lifecycle chain (P6).
//
// Mounted at /api/ccp-assessment/chain.
//
// The QUALITY-LABEL "rating" layer of the carbon-credit market — orthogonal
// to issuance (W82) / retirement (W17) / MRV (W11). After a project is
// registered (W37), the ICVCM (Integrity Council for the Voluntary Carbon
// Market) and aligned bodies run an independent integrity assessment that
// awards the CCP-eligible label — the "investment-grade" mark that unlocks
// premium pricing AND CORSIA Phase-2 eligibility (mandatory for airline
// emissions retirements from 2027).
//
// DISTINCTIVE move (beat Sylvera / BeZero Carbon / Calyx Global / Renoster /
// Pachama — all of which publish credit ratings using opaque proprietary
// methodologies and lag the market): LIVE calculated CCP-criteria scoring
// exposed on every record — 10-criterion aggregate, weakest-criterion
// identification, CORSIA Phase-2 eligibility derivation, market premium-
// pricing uplift, Sylvera-equivalent grade mapping, and integrity-floor
// crossing flag — all derived from the same inputs each transition.
//
// Write model — SINGLE carbon-fund desk {admin, carbon_fund} (same single-
// party model as W37/W11/W17/W42/W48/W56/W65/W73/W82). READ all nine
// personas. actor_party (proponent / icvcm / vvb / quality_assessor) records
// the functional owner per step, not the JWT role.
//
// Reportability (the W91 SIGNATURE is INTEGRITY-MARK driven):
//   deny_ccp_label    crosses for EVERY tier — public market-rejection
//                     signal (sister of W82 raise_dispute, W90 terminate_
//                     legacy, W77 declare_breach, W68 declare_default,
//                     W45 write_off).
//   grant_ccp_label   crosses for EVERY tier when CONDITIONAL; else
//                     major+mega only.
//   raise_dispute     crosses for major+mega only (concentration).
//   sla_breached      crosses for major+mega only.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForAssessment,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  ccpAggregateScore,
  weakestCriterion,
  gapCount,
  crossesIntegrityFloor,
  labelClassForScores,
  corsiaPhase2Eligible,
  sylveraGradeEquivalent,
  premiumPricingUpliftPct,
  predictedAssessmentDays,
  isHighIntegrityRisk,
  SLA_MINUTES,
  type CcpAssessmentStatus,
  type CcpAssessmentAction,
  type CcpAssessmentTier,
  type CcpSector,
  type CcpLabelClass,
  type CcpScoreCard,
} from '../utils/ccp-assessment-spec';

const READ_ROLES = new Set([
  'admin', 'carbon_fund',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'support',
]);

const WRITE_ROLES = new Set(['admin', 'carbon_fund']);

interface CcpAssessmentRow {
  id: string;
  assessment_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string | null;
  registry_standard: string | null;
  methodology_id: string | null;
  methodology_version: string | null;
  proponent_party_id: string | null;
  proponent_party_name: string | null;
  vvb_name: string | null;
  quality_assessor_name: string | null;
  host_country: string | null;
  sector: CcpSector;
  assessment_tier: CcpAssessmentTier;
  assessed_annual_tco2e: number;
  high_integrity_risk_flag: number;
  effective_governance_score: number | null;
  tracking_system_score: number | null;
  transparency_score: number | null;
  robust_quantification_score: number | null;
  no_double_counting_score: number | null;
  permanence_score: number | null;
  additionality_score: number | null;
  sustainable_development_score: number | null;
  transition_to_net_zero_score: number | null;
  safeguards_score: number | null;
  label_class: CcpLabelClass | null;
  ccp_aggregate_score: number | null;
  gap_count: number;
  weakest_criterion: string | null;
  weakest_score: number | null;
  integrity_floor_cross_flag: number;
  conditional_grant_flag: number;
  corsia_phase2_eligible_flag: number;
  sylvera_grade_equivalent: string | null;
  premium_pricing_uplift_pct: number;
  predicted_assessment_days: number;
  screened_flag: number;
  eligibility_check_ok_flag: number;
  assessment_complete_flag: number;
  vvb_review_complete_flag: number;
  decision_made_flag: number;
  request_ref: string | null;
  screening_ref: string | null;
  eligibility_check_ref: string | null;
  assessment_ref: string | null;
  vvb_review_ref: string | null;
  decision_ref: string | null;
  grant_ref: string | null;
  denial_ref: string | null;
  hold_ref: string | null;
  return_ref: string | null;
  dispute_ref: string | null;
  withdrawal_ref: string | null;
  regulator_ref: string | null;
  corsia_eligibility_ref: string | null;
  request_basis: string | null;
  screening_basis: string | null;
  eligibility_check_basis: string | null;
  assessment_basis: string | null;
  vvb_review_basis: string | null;
  decision_basis: string | null;
  grant_basis: string | null;
  denial_basis: string | null;
  hold_basis: string | null;
  return_basis: string | null;
  dispute_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  conditional_grant_conditions: string | null;
  assessment_summary: string | null;
  chain_status: CcpAssessmentStatus;
  requested_at: string;
  screening_at: string | null;
  eligibility_check_at: string | null;
  assessment_in_progress_at: string | null;
  vvb_review_at: string | null;
  ccp_decision_pending_at: string | null;
  ccp_label_granted_at: string | null;
  on_hold_at: string | null;
  returned_at: string | null;
  disputed_at: string | null;
  ccp_label_denied_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CcpAssessmentEventRow {
  id: string;
  assessment_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<CcpAssessmentStatus, keyof CcpAssessmentRow | null> = {
  requested:              null,
  screening:              'screening_at',
  eligibility_check:      'eligibility_check_at',
  assessment_in_progress: 'assessment_in_progress_at',
  vvb_review:             'vvb_review_at',
  ccp_decision_pending:   'ccp_decision_pending_at',
  ccp_label_granted:      'ccp_label_granted_at',
  on_hold:                'on_hold_at',
  returned:               'returned_at',
  disputed:               'disputed_at',
  ccp_label_denied:       'ccp_label_denied_at',
  withdrawn:              'withdrawn_at',
};

// resume re-enters screening and resubmit also lands in screening, so both
// share the 'ccp_assessment.screening' event name. resolve_dispute lands
// back in vvb_review.
function eventTypeFor(action: CcpAssessmentAction): string {
  switch (action) {
    case 'begin_screening':         return 'ccp_assessment.screening';
    case 'begin_eligibility_check': return 'ccp_assessment.eligibility_check';
    case 'begin_assessment':        return 'ccp_assessment.assessment_in_progress';
    case 'complete_vvb_review':     return 'ccp_assessment.vvb_review';
    case 'submit_for_decision':     return 'ccp_assessment.ccp_decision_pending';
    case 'grant_ccp_label':         return 'ccp_assessment.ccp_label_granted';
    case 'deny_ccp_label':          return 'ccp_assessment.ccp_label_denied';
    case 'place_on_hold':           return 'ccp_assessment.on_hold';
    case 'resume':                  return 'ccp_assessment.screening';
    case 'return_for_remediation':  return 'ccp_assessment.returned';
    case 'resubmit':                return 'ccp_assessment.screening';
    case 'raise_dispute':           return 'ccp_assessment.disputed';
    case 'resolve_dispute':         return 'ccp_assessment.vvb_review';
    case 'withdraw':                return 'ccp_assessment.withdrawn';
  }
}

function rowToScorecard(row: CcpAssessmentRow): Partial<CcpScoreCard> {
  return {
    effective_governance: row.effective_governance_score ?? undefined,
    tracking_system: row.tracking_system_score ?? undefined,
    transparency: row.transparency_score ?? undefined,
    robust_quantification: row.robust_quantification_score ?? undefined,
    no_double_counting: row.no_double_counting_score ?? undefined,
    permanence: row.permanence_score ?? undefined,
    additionality: row.additionality_score ?? undefined,
    sustainable_development: row.sustainable_development_score ?? undefined,
    transition_to_net_zero: row.transition_to_net_zero_score ?? undefined,
    safeguards: row.safeguards_score ?? undefined,
  };
}

function decorate(row: CcpAssessmentRow, now: Date) {
  const tier = row.assessment_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  // Live CCP integrity battery — derived from the same 10 criteria every
  // record so the numbers match across transitions. This is what beats the
  // opaque proprietary methodologies of Sylvera/BeZero/Calyx/Renoster/Pachama.
  const scorecard = rowToScorecard(row);
  const aggregateLive = ccpAggregateScore(scorecard);
  const weakestLive = weakestCriterion(scorecard);
  const gapCountLive = gapCount(scorecard);
  const integrityFloorLive = crossesIntegrityFloor(scorecard);
  const labelClassLive = aggregateLive > 0 ? labelClassForScores(scorecard) : null;
  const corsiaLive = labelClassLive ? corsiaPhase2Eligible(labelClassLive) : false;
  const sylveraLive = aggregateLive > 0 ? sylveraGradeEquivalent(aggregateLive) : null;
  const premiumLive = labelClassLive ? premiumPricingUpliftPct(labelClassLive) : 0;
  const conditionalLive = labelClassLive === 'ccp_conditional';
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    high_integrity_risk_sector_flag: isHighIntegrityRisk(row.sector),
    ccp_aggregate_score_live: aggregateLive,
    weakest_criterion_live: weakestLive?.criterion ?? null,
    weakest_score_live: weakestLive?.score ?? null,
    gap_count_live: gapCountLive,
    integrity_floor_cross_flag_live: integrityFloorLive,
    label_class_live: labelClassLive,
    conditional_grant_flag_live: conditionalLive,
    corsia_phase2_eligible_flag_live: corsiaLive,
    sylvera_grade_equivalent_live: sylveraLive,
    premium_pricing_uplift_pct_live: premiumLive,
    predicted_assessment_days_live: predictedAssessmentDays(tier),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const assessment_tier = c.req.query('assessment_tier');
  const status          = c.req.query('status');
  const sector          = c.req.query('sector');
  const label_class     = c.req.query('label_class');
  const project_id      = c.req.query('project_id');
  const breached        = c.req.query('breached');
  const reportable      = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_ccp_assessments WHERE 1=1';
  const binds: unknown[] = [];
  if (assessment_tier) { sql += ' AND assessment_tier = ?'; binds.push(assessment_tier); }
  if (status)          { sql += ' AND chain_status = ?';    binds.push(status); }
  if (sector)          { sql += ' AND sector = ?';          binds.push(sector); }
  if (label_class)     { sql += ' AND label_class = ?';     binds.push(label_class); }
  if (project_id)      { sql += ' AND project_id = ?';      binds.push(project_id); }

  sql += ' ORDER BY datetime(requested_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<CcpAssessmentRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_sector: Record<string, number> = {};
  const by_label_class: Record<string, number> = {};
  const by_project: Record<string, number> = {};
  for (const a of items) {
    by_status[a.chain_status] = (by_status[a.chain_status] || 0) + 1;
    by_tier[a.assessment_tier] = (by_tier[a.assessment_tier] || 0) + 1;
    by_sector[a.sector] = (by_sector[a.sector] || 0) + 1;
    const labelKey = a.label_class_live ?? 'unscored';
    by_label_class[labelKey] = (by_label_class[labelKey] || 0) + 1;
    by_project[a.project_id] = (by_project[a.project_id] || 0) + 1;
  }

  const open_count            = items.filter((i) => !i.is_terminal).length;
  const granted_count         = items.filter((i) => i.chain_status === 'ccp_label_granted').length;
  const denied_count          = items.filter((i) => i.chain_status === 'ccp_label_denied').length;
  const on_hold_count         = items.filter((i) => i.chain_status === 'on_hold').length;
  const returned_count        = items.filter((i) => i.chain_status === 'returned').length;
  const disputed_count        = items.filter((i) => i.chain_status === 'disputed').length;
  const withdrawn_count       = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count        = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total      = items.filter((i) => i.is_reportable_flag).length;
  const conditional_count     = items.filter((i) => i.conditional_grant_flag_live).length;
  const corsia_eligible_count = items.filter((i) => i.corsia_phase2_eligible_flag_live).length;
  const integrity_floor_cross_count = items.filter((i) => i.integrity_floor_cross_flag_live).length;
  const high_integrity_risk_count = items.filter((i) => i.high_integrity_risk_sector_flag).length;
  const total_assessed_tco2e = items.reduce((sum, i) => sum + (i.assessed_annual_tco2e || 0), 0);
  const granted_assessed_tco2e = items
    .filter((i) => i.chain_status === 'ccp_label_granted')
    .reduce((sum, i) => sum + (i.assessed_annual_tco2e || 0), 0);
  const avg_aggregate_score = (() => {
    const scored = items.filter((i) => i.ccp_aggregate_score_live > 0);
    if (scored.length === 0) return 0;
    return scored.reduce((sum, i) => sum + i.ccp_aggregate_score_live, 0) / scored.length;
  })();

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_sector,
      by_label_class,
      by_project,
      open_count,
      granted_count,
      denied_count,
      on_hold_count,
      returned_count,
      disputed_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      conditional_count,
      corsia_eligible_count,
      integrity_floor_cross_count,
      high_integrity_risk_count,
      total_assessed_tco2e,
      granted_assessed_tco2e,
      avg_aggregate_score,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_ccp_assessments WHERE id = ?').bind(id).first<CcpAssessmentRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ccp_assessments_events WHERE assessment_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<CcpAssessmentEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ScreenBody { screening_basis?: string; screening_ref?: string; notes?: string; }
interface EligibilityBody { eligibility_check_basis?: string; eligibility_check_ref?: string; notes?: string; }
interface AssessmentBody {
  assessment_basis?: string;
  assessment_ref?: string;
  effective_governance_score?: number;
  tracking_system_score?: number;
  transparency_score?: number;
  robust_quantification_score?: number;
  no_double_counting_score?: number;
  permanence_score?: number;
  additionality_score?: number;
  sustainable_development_score?: number;
  transition_to_net_zero_score?: number;
  safeguards_score?: number;
  notes?: string;
}
interface VvbReviewBody { vvb_review_basis?: string; vvb_review_ref?: string; notes?: string; }
interface DecisionBody { decision_basis?: string; decision_ref?: string; notes?: string; }
interface GrantBody {
  grant_basis?: string;
  grant_ref?: string;
  conditional_grant_conditions?: string;
  corsia_eligibility_ref?: string;
  regulator_ref?: string;
  assessment_summary?: string;
  notes?: string;
}
interface DenyBody {
  denial_basis?: string;
  denial_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
  assessment_summary?: string;
  notes?: string;
}
interface HoldBody { hold_basis?: string; hold_ref?: string; reason_code?: string; notes?: string; }
interface ReturnBody { return_basis?: string; return_ref?: string; reason_code?: string; notes?: string; }
interface DisputeBody {
  dispute_basis?: string;
  dispute_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}
interface WithdrawBody { withdrawal_basis?: string; withdrawal_ref?: string; reason_code?: string; notes?: string; }

async function transition(
  c: Context<HonoEnv>,
  action: CcpAssessmentAction,
  bodyHandler?: (row: CcpAssessmentRow, body: Record<string, unknown>) => Partial<CcpAssessmentRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ccp_assessments WHERE id = ?').bind(id).first<CcpAssessmentRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier is RE-DERIVED on every transition from |assessed_annual_tco2e| with
  // sector-driven floor (REDD+/jurisdictional/avoidance floor at major). SLA
  // window and regulator-crossing decision track the CURRENT tier (same
  // INVERTED-SLA family as W19/W20/W43/W49/W56/W65/W70/W73/W81/W82).
  const annualTco2e = (overrides.assessed_annual_tco2e as number | undefined) ?? row.assessed_annual_tco2e;
  const sector = (overrides.sector as CcpSector | undefined) ?? row.sector;
  const tier = tierForAssessment(annualTco2e, sector);
  overrides.assessment_tier = tier;
  overrides.high_integrity_risk_flag = isHighIntegrityRisk(sector) ? 1 : 0;

  // Re-derive the live CCP battery into PERSISTED columns so list endpoints
  // and downstream consumers see the same scoring without recomputing.
  const persistedRow: CcpAssessmentRow = { ...row, ...(overrides as Partial<CcpAssessmentRow>) };
  const scorecard = rowToScorecard(persistedRow);
  const aggregate = ccpAggregateScore(scorecard);
  if (aggregate > 0) {
    const weakest = weakestCriterion(scorecard);
    const labelClass = labelClassForScores(scorecard);
    overrides.ccp_aggregate_score = aggregate;
    overrides.gap_count = gapCount(scorecard);
    overrides.weakest_criterion = weakest?.criterion ?? null;
    overrides.weakest_score = weakest?.score ?? null;
    overrides.integrity_floor_cross_flag = crossesIntegrityFloor(scorecard) ? 1 : 0;
    overrides.label_class = labelClass;
    overrides.conditional_grant_flag = labelClass === 'ccp_conditional' ? 1 : 0;
    overrides.corsia_phase2_eligible_flag = corsiaPhase2Eligible(labelClass) ? 1 : 0;
    overrides.sylvera_grade_equivalent = sylveraGradeEquivalent(aggregate);
    overrides.premium_pricing_uplift_pct = premiumPricingUpliftPct(labelClass);
  }

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const conditionalForReporting = action === 'grant_ccp_label'
    ? (overrides.conditional_grant_flag === 1 || row.conditional_grant_flag === 1)
    : false;
  const crosses = crossesIntoRegulator(action, tier, conditionalForReporting);
  overrides.is_reportable = (isReportable(tier, sector) || crosses) ? 1 : 0;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_ccp_assessments SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `ccp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ccp_assessments_events (id, assessment_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  const eventName = eventTypeFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'ccp_assessment',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      assessment_tier: tier,
      sector,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ccp_assessments WHERE id = ?').bind(id).first<CcpAssessmentRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-screening', async (c) => transition(c, 'begin_screening', (row, body) => {
  const b = body as Partial<ScreenBody>;
  const out: Partial<CcpAssessmentRow> = { screened_flag: 1 };
  if (typeof b.screening_basis === 'string') out.screening_basis = b.screening_basis;
  if (typeof b.screening_ref === 'string')   out.screening_ref = b.screening_ref;
  // Pre-compute the predicted turnaround at screening — ICVCM secretariat can
  // quote a realistic decision date the moment the request enters the desk.
  out.predicted_assessment_days = predictedAssessmentDays(
    tierForAssessment(row.assessed_annual_tco2e, row.sector),
  );
  return out;
}));

app.post('/:id/begin-eligibility-check', async (c) => transition(c, 'begin_eligibility_check', (_row, body) => {
  const b = body as Partial<EligibilityBody>;
  const out: Partial<CcpAssessmentRow> = { eligibility_check_ok_flag: 1 };
  if (typeof b.eligibility_check_basis === 'string') out.eligibility_check_basis = b.eligibility_check_basis;
  if (typeof b.eligibility_check_ref === 'string')   out.eligibility_check_ref = b.eligibility_check_ref;
  return out;
}));

app.post('/:id/begin-assessment', async (c) => transition(c, 'begin_assessment', (_row, body) => {
  const b = body as Partial<AssessmentBody>;
  const out: Partial<CcpAssessmentRow> = { assessment_complete_flag: 1 };
  if (typeof b.assessment_basis === 'string') out.assessment_basis = b.assessment_basis;
  if (typeof b.assessment_ref === 'string')   out.assessment_ref = b.assessment_ref;
  // Persist any of the 10 CCP-criterion scores submitted with the assessment.
  // Live battery (aggregate / weakest / gap / floor / label_class) is
  // re-derived from these in transition().
  const scoreFields: (keyof CcpScoreCard)[] = [
    'effective_governance', 'tracking_system', 'transparency',
    'robust_quantification', 'no_double_counting', 'permanence',
    'additionality', 'sustainable_development', 'transition_to_net_zero',
    'safeguards',
  ];
  for (const f of scoreFields) {
    const k = `${f}_score` as keyof AssessmentBody;
    const v = b[k];
    if (typeof v === 'number') {
      const col = `${f}_score` as keyof CcpAssessmentRow;
      (out as Record<string, unknown>)[col] = v;
    }
  }
  return out;
}));

app.post('/:id/complete-vvb-review', async (c) => transition(c, 'complete_vvb_review', (_row, body) => {
  const b = body as Partial<VvbReviewBody>;
  const out: Partial<CcpAssessmentRow> = { vvb_review_complete_flag: 1 };
  if (typeof b.vvb_review_basis === 'string') out.vvb_review_basis = b.vvb_review_basis;
  if (typeof b.vvb_review_ref === 'string')   out.vvb_review_ref = b.vvb_review_ref;
  return out;
}));

app.post('/:id/submit-for-decision', async (c) => transition(c, 'submit_for_decision', (_row, body) => {
  const b = body as Partial<DecisionBody>;
  const out: Partial<CcpAssessmentRow> = { decision_made_flag: 1 };
  if (typeof b.decision_basis === 'string') out.decision_basis = b.decision_basis;
  if (typeof b.decision_ref === 'string')   out.decision_ref = b.decision_ref;
  return out;
}));

app.post('/:id/grant-ccp-label', async (c) => transition(c, 'grant_ccp_label', (_row, body) => {
  const b = body as Partial<GrantBody>;
  const out: Partial<CcpAssessmentRow> = {};
  if (typeof b.grant_basis === 'string') out.grant_basis = b.grant_basis;
  if (typeof b.grant_ref === 'string')   out.grant_ref = b.grant_ref;
  if (typeof b.conditional_grant_conditions === 'string') out.conditional_grant_conditions = b.conditional_grant_conditions;
  if (typeof b.corsia_eligibility_ref === 'string') out.corsia_eligibility_ref = b.corsia_eligibility_ref;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.assessment_summary === 'string') out.assessment_summary = b.assessment_summary;
  return out;
}));

app.post('/:id/deny-ccp-label', async (c) => transition(c, 'deny_ccp_label', (_row, body) => {
  const b = body as Partial<DenyBody>;
  const out: Partial<CcpAssessmentRow> = {};
  if (typeof b.denial_basis === 'string') out.denial_basis = b.denial_basis;
  if (typeof b.denial_ref === 'string')   out.denial_ref = b.denial_ref;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.assessment_summary === 'string') out.assessment_summary = b.assessment_summary;
  return out;
}));

app.post('/:id/place-on-hold', async (c) => transition(c, 'place_on_hold', (row, body) => {
  const b = body as Partial<HoldBody>;
  const out: Partial<CcpAssessmentRow> = { escalation_level: (row.escalation_level || 0) + 1 };
  if (typeof b.hold_basis === 'string') out.hold_basis = b.hold_basis;
  if (typeof b.hold_ref === 'string')   out.hold_ref = b.hold_ref;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resume', async (c) => transition(c, 'resume'));

app.post('/:id/return-for-remediation', async (c) => transition(c, 'return_for_remediation', (_row, body) => {
  const b = body as Partial<ReturnBody>;
  const out: Partial<CcpAssessmentRow> = {};
  if (typeof b.return_basis === 'string') out.return_basis = b.return_basis;
  if (typeof b.return_ref === 'string')   out.return_ref = b.return_ref;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resubmit', async (c) => transition(c, 'resubmit'));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<CcpAssessmentRow> = { escalation_level: (row.escalation_level || 0) + 1 };
  if (typeof b.dispute_basis === 'string') out.dispute_basis = b.dispute_basis;
  if (typeof b.dispute_ref === 'string')   out.dispute_ref = b.dispute_ref;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute'));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<CcpAssessmentRow> = {};
  if (typeof b.withdrawal_basis === 'string') out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.withdrawal_ref === 'string')   out.withdrawal_ref = b.withdrawal_ref;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

export async function ccpAssessmentSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ccp_assessments
     WHERE chain_status NOT IN ('ccp_label_granted','ccp_label_denied','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<CcpAssessmentRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ccp_assessments
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ccp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ccp_assessments_events (id, assessment_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'ccp_assessment.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.assessment_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.assessment_tier)) {
      await fireCascade({
        event: 'ccp_assessment.sla_breached',
        actor_id: 'system',
        entity_type: 'ccp_assessment',
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
