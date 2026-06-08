// ═══════════════════════════════════════════════════════════════════════════
// Wave 230 — REIPPPP Community Benefit Trust (CBT) &
// Socio-Economic Development (SED) Annual Compliance Reporting
//
// Mounted at /api/ipp/cbt-sed
//
// Every REIPPPP IPP must: (a) establish a Community Benefit Trust (CBT) holding
// a minimum equity stake in the project SPV, (b) make annual SED expenditures
// as a percentage of project revenue, and (c) achieve prescribed local-content
// percentages. This chain formalises the annual DMRE reporting lifecycle —
// opening the window → data collection → draft → formal submission → DMRE
// review → possible queries/responses → approval or non-compliance/escalation.
// None of the existing IPP chains (W19 procurement, W20 COD, W27 ED commitment,
// W212 DSCR) model the CBT/SED annual-reporting workflow.
//
// Forward path:
//   reporting_period_open → data_collection → report_drafted → submitted
//     → under_review → approved
//
// Query cycle:
//   under_review → queries_issued → response_submitted → under_review (loop)
//
// Non-compliance path:
//   under_review → non_compliant → remediation_submitted
//     → (accept_remediation) under_review | escalated
//
// Admin exits: cancel (pre-submission) / escalate (enforcement)
//
// Tiers (INVERTED SLA — larger CBT = longer DMRE review window):
//   micro (<R500k/yr) — 14d · small (R500k-R5M) — 21d
//   medium (R5M-R50M) — 30d · major (>R50M) — 45d
//
// Legal: REIPPPP RfP Sch.2, DMRE CBT/SED Guidelines,
//        Trust Property Control Act 57/1988, BBBEE Act 53/2003
//
// Regulator crossings:
//   escalate + issue_non_compliance — ALWAYS
//   approve_report — medium + major
//   sla_breached — medium + major
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  deriveCbtTier,
  cbtSlaDeadlineFor,
  crossesCbtIntoRegulator,
  cbtSlaBreachCrossesIntoRegulator,
  CBT_VALID_TRANSITIONS,
  CBT_STATE_TRANSITIONS,
  CBT_HARD_TERMINALS,
  CBT_ADMIN_ONLY_ACTIONS,
  type CbtStatus,
  type CbtAction,
  type CbtTier,
} from '../utils/cbt-sed-spec';

const ADMIN_ROLES = new Set(['admin', 'support']);
const READ_ROLES  = new Set(['admin', 'support', 'ipp_developer', 'regulator']);
// The IPP submits and responds; admin/regulator/support processes DMRE-side actions
// (further gated per-action via CBT_ADMIN_ONLY_ACTIONS).
const WRITE_ROLES = new Set(['admin', 'support', 'ipp_developer', 'regulator']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface CbtRow {
  id: string;
  ipp_id: string;
  project_name: string;
  reipppp_bid_window: string;
  reporting_year: number;
  cbt_disbursement_tier: CbtTier;
  trust_registration_number: string | null;
  beneficiary_community: string | null;
  beneficiary_count: number | null;
  cbt_equity_percentage: number | null;
  annual_cbt_disbursement_zar: number | null;
  cumulative_cbt_disbursement_zar: number | null;
  sed_spend_zar: number | null;
  sed_spend_percentage: number | null;
  local_content_percentage: number | null;
  report_ref: string | null;
  queries_ref: string | null;
  remediation_plan_ref: string | null;
  non_compliance_reason: string | null;
  escalation_reason: string | null;
  cancellation_reason: string | null;
  chain_status: CbtStatus;
  sla_deadline: string | null;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

function decorate(row: CbtRow, now: Date) {
  const hoursUntilSla = row.sla_deadline
    ? (new Date(row.sla_deadline).getTime() - now.getTime()) / 3_600_000
    : null;
  return {
    ...row,
    is_terminal: CBT_HARD_TERMINALS.has(row.chain_status),
    sla_breached: row.sla_breached === 1 || (hoursUntilSla != null && hoursUntilSla < 0),
    hours_until_sla: hoursUntilSla != null ? Math.round(hoursUntilSla) : null,
  };
}

// ── GET /api/ipp/cbt-sed ──────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const { status, tier, year, bid_window, breached, page = '1', per_page = '50' } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(per_page);
  const now = new Date();

  let whereClause = 'WHERE 1=1';
  const whereParams: (string | number)[] = [];

  if (status)     { whereClause += ' AND chain_status = ?';            whereParams.push(status); }
  if (tier)       { whereClause += ' AND cbt_disbursement_tier = ?';   whereParams.push(tier); }
  if (year)       { whereClause += ' AND reporting_year = ?';          whereParams.push(parseInt(year)); }
  if (bid_window) { whereClause += ' AND reipppp_bid_window = ?';      whereParams.push(bid_window); }
  if (breached === 'true') { whereClause += ' AND sla_breached = 1'; }

  // IPPs only see their own submissions
  if (user.role === 'ipp_developer') {
    whereClause += ' AND ipp_id = ?';
    whereParams.push(user.id);
  }

  const rs = await c.env.DB
    .prepare(`SELECT * FROM oe_cbt_sed_reports ${whereClause} ORDER BY reporting_year DESC, created_at DESC LIMIT ? OFFSET ?`)
    .bind(...whereParams, parseInt(per_page), offset)
    .all<CbtRow>();
  const items = (rs.results || []).map(r => decorate(r, now));

  const aggRow = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN chain_status = 'approved' THEN 1 ELSE 0 END), 0) AS approved,
       COALESCE(SUM(CASE WHEN chain_status = 'non_compliant' THEN 1 ELSE 0 END), 0) AS non_compliant,
       COALESCE(SUM(CASE WHEN chain_status = 'escalated' THEN 1 ELSE 0 END), 0) AS escalated,
       COALESCE(SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END), 0) AS sla_breached_count
     FROM oe_cbt_sed_reports ${whereClause}`,
  ).bind(...whereParams).first<{ total: number; approved: number; non_compliant: number; escalated: number; sla_breached_count: number }>();

  const stats = {
    total:               aggRow?.total ?? 0,
    approved:            aggRow?.approved ?? 0,
    non_compliant:       aggRow?.non_compliant ?? 0,
    escalated:           aggRow?.escalated ?? 0,
    sla_breached_count:  aggRow?.sla_breached_count ?? 0,
  };

  return c.json({ success: true, data: { reports: items, stats } });
});

// ── GET /api/ipp/cbt-sed/:id ──────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare('SELECT * FROM oe_cbt_sed_reports WHERE id = ?')
    .bind(c.req.param('id')).first<CbtRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  if (user.role === 'ipp_developer' && row.ipp_id !== user.id) return c.json({ success: false, error: 'Forbidden' }, 403);

  return c.json({ success: true, data: { report: decorate(row, new Date()) } });
});

// ── POST /api/ipp/cbt-sed/open ────────────────────────────────────────────────
// Opens a new annual CBT/SED reporting period for an IPP project
app.post('/open', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !ADMIN_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    ipp_id: string;
    project_name: string;
    reipppp_bid_window: string;
    reporting_year: number;
    annual_cbt_disbursement_zar: number;
    reason?: string;
  }>();

  if (!body.ipp_id || !body.project_name || !body.reipppp_bid_window || !body.reporting_year || body.annual_cbt_disbursement_zar == null) {
    return c.json({ success: false, error: 'ipp_id, project_name, reipppp_bid_window, reporting_year, annual_cbt_disbursement_zar required' }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT id FROM oe_cbt_sed_reports WHERE ipp_id = ? AND reporting_year = ? AND reipppp_bid_window = ? AND chain_status NOT IN ('cancelled')`,
  ).bind(body.ipp_id, body.reporting_year, body.reipppp_bid_window).first<{ id: string }>();
  if (existing) return c.json({ success: false, error: `CBT/SED report already open for ${body.reporting_year}/${body.reipppp_bid_window}`, existing_id: existing.id }, 409);

  const tier: CbtTier = deriveCbtTier(body.annual_cbt_disbursement_zar);
  const nowIso = new Date().toISOString();
  const id = `cbt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

  await c.env.DB.prepare(
    `INSERT INTO oe_cbt_sed_reports
     (id, ipp_id, project_name, reipppp_bid_window, reporting_year, cbt_disbursement_tier,
      annual_cbt_disbursement_zar, chain_status, actor_id, reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'reporting_period_open', ?, ?, ?, ?)`,
  ).bind(
    id, body.ipp_id, body.project_name, body.reipppp_bid_window, body.reporting_year, tier,
    body.annual_cbt_disbursement_zar, user.id, body.reason ?? null, nowIso, nowIso,
  ).run();

  await fireCascade({
    event: 'cbt_evt_opened',
    actor_id: user.id,
    entity_type: 'cbt_sed_report',
    entity_id: id,
    data: { ipp_id: body.ipp_id, project_name: body.project_name, reipppp_bid_window: body.reipppp_bid_window, reporting_year: body.reporting_year, tier, annual_cbt_disbursement_zar: body.annual_cbt_disbursement_zar },
    env: c.env,
  });

  const row = await c.env.DB.prepare('SELECT * FROM oe_cbt_sed_reports WHERE id = ?').bind(id).first<CbtRow>();
  return c.json({ success: true, data: { report: row ? decorate(row, new Date()) : null } }, 201);
});

// ── POST /api/ipp/cbt-sed/:id/action ─────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const { action, ...body } = await c.req.json<{
    action: CbtAction;
    reason?: string;
    trust_registration_number?: string;
    beneficiary_community?: string;
    beneficiary_count?: number;
    cbt_equity_percentage?: number;
    annual_cbt_disbursement_zar?: number;
    cumulative_cbt_disbursement_zar?: number;
    sed_spend_zar?: number;
    sed_spend_percentage?: number;
    local_content_percentage?: number;
    report_ref?: string;
    queries_ref?: string;
    remediation_plan_ref?: string;
    non_compliance_reason?: string;
    escalation_reason?: string;
    cancellation_reason?: string;
  }>();

  const row = await c.env.DB.prepare('SELECT * FROM oe_cbt_sed_reports WHERE id = ?')
    .bind(c.req.param('id')).first<CbtRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  if (user.role === 'ipp_developer' && row.ipp_id !== user.id) return c.json({ success: false, error: 'Forbidden' }, 403);

  if (CBT_HARD_TERMINALS.has(row.chain_status)) {
    return c.json({ success: false, error: `Report is terminal (${row.chain_status})` }, 409);
  }

  const allowed = CBT_VALID_TRANSITIONS[row.chain_status] ?? [];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not allowed from '${row.chain_status}'` }, 409);
  }

  if (CBT_ADMIN_ONLY_ACTIONS.has(action) && !ADMIN_ROLES.has(user.role) && user.role !== 'regulator') {
    return c.json({ success: false, error: `Action '${action}' requires admin, support or regulator` }, 403);
  }

  const to = CBT_STATE_TRANSITIONS[action];
  const nowIso = new Date().toISOString();
  const tier = row.cbt_disbursement_tier;

  // Re-derive tier if annual_cbt_disbursement_zar is updated during data collection
  let effectiveTier: CbtTier = tier;
  if (body.annual_cbt_disbursement_zar != null) {
    effectiveTier = deriveCbtTier(body.annual_cbt_disbursement_zar);
  }

  // Set SLA deadline when the report is formally submitted to DMRE
  let newSla = row.sla_deadline;
  if (action === 'submit_report') {
    newSla = cbtSlaDeadlineFor(effectiveTier, nowIso);
  }

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'actor_id = ?'];
  const setParams: (string | number | null)[] = [to, nowIso, user.id];

  const optionals: Array<[string, string | number | undefined | null]> = [
    ['trust_registration_number', body.trust_registration_number],
    ['beneficiary_community', body.beneficiary_community],
    ['beneficiary_count', body.beneficiary_count],
    ['cbt_equity_percentage', body.cbt_equity_percentage],
    ['annual_cbt_disbursement_zar', body.annual_cbt_disbursement_zar],
    ['cumulative_cbt_disbursement_zar', body.cumulative_cbt_disbursement_zar],
    ['sed_spend_zar', body.sed_spend_zar],
    ['sed_spend_percentage', body.sed_spend_percentage],
    ['local_content_percentage', body.local_content_percentage],
    ['report_ref', body.report_ref],
    ['queries_ref', body.queries_ref],
    ['remediation_plan_ref', body.remediation_plan_ref],
    ['non_compliance_reason', body.non_compliance_reason],
    ['escalation_reason', body.escalation_reason],
    ['cancellation_reason', body.cancellation_reason],
    ['reason', body.reason],
  ];
  for (const [col, val] of optionals) {
    if (val != null) { setClauses.push(`${col} = ?`); setParams.push(val); }
  }

  if (effectiveTier !== tier) {
    setClauses.push('cbt_disbursement_tier = ?');
    setParams.push(effectiveTier);
  }
  if (newSla !== row.sla_deadline) {
    setClauses.push('sla_deadline = ?');
    setParams.push(newSla);
  }

  if (crossesCbtIntoRegulator(action, effectiveTier)) {
    setClauses.push('regulator_notified = 1');
  }

  await c.env.DB.prepare(
    `UPDATE oe_cbt_sed_reports SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setParams, row.id).run();

  const eventName = `cbt_evt_${action}` as const;
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'cbt_sed_report',
    entity_id: row.id,
    data: {
      ...row,
      chain_status: to,
      from_status: row.chain_status,
      cbt_disbursement_tier: effectiveTier,
      crosses_into_regulator: crossesCbtIntoRegulator(action, effectiveTier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_cbt_sed_reports WHERE id = ?')
    .bind(row.id).first<CbtRow>();
  return c.json({ success: true, data: { report: refreshed ? decorate(refreshed, new Date()) : null } });
});

// ── SLA sweep (exported for cron wiring) ─────────────────────────────────────
export async function cbtSedSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; breached: number }> {
  const nowIso = new Date().toISOString();

  // SLA clock runs from submit_report; breach means DMRE review window expired
  const overdueRs = await env.DB.prepare(
    `SELECT * FROM oe_cbt_sed_reports
     WHERE chain_status IN ('submitted', 'under_review', 'queries_issued', 'response_submitted')
       AND sla_deadline IS NOT NULL
       AND datetime(sla_deadline) < datetime(?)
       AND sla_breached = 0`,
  ).bind(nowIso).all<CbtRow>();

  let breached = 0;
  for (const row of overdueRs.results || []) {
    const tier = row.cbt_disbursement_tier;

    await env.DB.prepare(
      `UPDATE oe_cbt_sed_reports SET chain_status = 'non_compliant', sla_breached = 1, updated_at = ? WHERE id = ?`,
    ).bind(nowIso, row.id).run();

    const crosses = cbtSlaBreachCrossesIntoRegulator(tier);
    if (crosses) {
      await env.DB.prepare(
        `UPDATE oe_cbt_sed_reports SET regulator_notified = 1 WHERE id = ?`,
      ).bind(row.id).run();
    }

    await fireCascade({
      event: 'cbt_evt_sla_breach',
      actor_id: 'system',
      entity_type: 'cbt_sed_report',
      entity_id: row.id,
      data: { ...row, chain_status: 'non_compliant', crosses_into_regulator: crosses },
      env,
    });

    breached++;
  }

  return { scanned: (overdueRs.results || []).length, breached };
}

export default app;
