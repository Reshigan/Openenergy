// ═══════════════════════════════════════════════════════════════════════════
// Wave 159 — IPP Annual Regulatory Compliance Report chain (P6)
//
// ERA 2006 §43 + NERSA Annual Returns Guidelines + Electricity Regulation
// Act 4/2006 §13 (compliance obligations). Every licensed IPP must file
// annual returns with NERSA. Non-filing or rejection triggers W40 (NERSA
// Compliance Inspection & Enforcement).
//
// Mounted at /api/ipp-annual-report.
//
// INVERTED SLA: larger installed capacity → more complex reporting obligation
// → MORE time per state.
// WRITE: admin | ipp_developer
//
// Signature reportability:
//   reject_report     → EVERY tier (market-entry compliance denial)
//   lodge_appeal      → EVERY tier
//   determine_appeal  → EVERY tier
//   accept_report     → large + utility + strategic
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type AnnualReportStatus,
  type AnnualReportAction,
  type CapacityTier,
  type ReportCategory,
  deriveCapacityTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  SLA_DAYS,
} from '../utils/ipp-annual-report-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ──────────────────────────────────────────────────────────────

export async function ippAnnualReportSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, capacity_tier FROM oe_ipp_annual_reports
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; capacity_tier: CapacityTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_annual_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_anr.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_anr',
      entity_id: row.id,
      data: {
        capacity_tier: row.capacity_tier,
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.capacity_tier),
      },
      env,
    });
  }
}

// ─── GET / — paginated list + KPIs ────────────────────────────────────────

app.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    project_id,
    status,
    tier,
    report_category,
    page = '1',
    per_page = '50',
  } = c.req.query();

  const pageNum = Math.max(1, parseInt(page) || 1);
  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const offset  = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  // Non-admin/support/regulator sees only their own rows.
  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?');
    binds.push(user.id);
  }
  if (project_id)     { clauses.push('project_id = ?');      binds.push(project_id); }
  if (status)         { clauses.push('chain_status = ?');     binds.push(status); }
  if (tier)           { clauses.push('capacity_tier = ?');    binds.push(tier); }
  if (report_category){ clauses.push('report_category = ?'); binds.push(report_category); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_annual_reports ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_annual_reports ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status IN ('submitted','under_review','queries_raised','responses_submitted') THEN 1 ELSE 0 END) as submitted_count,
           SUM(CASE WHEN chain_status = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
           SUM(CASE WHEN chain_status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN chain_status IN ('appeal_lodged','appeal_determined') THEN 1 ELSE 0 END) as appeal_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count
         FROM oe_ipp_annual_reports ${where}`,
      )
      .bind(...[...HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  return c.json({
    success: true,
    data: {
      items: rows.results ?? [],
      pagination: {
        page: pageNum,
        per_page: perPage,
        total: totalRow?.n ?? 0,
      },
      kpis,
    },
  });
});

// ─── GET /:id — single row + audit trail ──────────────────────────────────

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_annual_reports WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const audit = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'ipp_anr' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new annual report record ──────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    reporting_year: number;
    capacity_mw: number;
    report_category: ReportCategory;
    description?: string;
  }>();

  if (
    !body.project_id ||
    body.reporting_year == null ||
    body.capacity_mw == null ||
    !body.report_category
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, reporting_year, capacity_mw, report_category are required',
      },
      400,
    );
  }

  const tier = deriveCapacityTier(body.capacity_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_anr_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 18 columns exactly: id, participant_id, project_id, reporting_year, capacity_mw,
  // capacity_tier, report_category, description, chain_status, sla_due_at, sla_breached,
  // submitted_at, accepted_at, rejected_at, appeal_lodged_at, appeal_determined_at,
  // created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_annual_reports
         (id, participant_id, project_id, reporting_year, capacity_mw,
          capacity_tier, report_category, description, chain_status, sla_due_at, sla_breached,
          submitted_at, accepted_at, rejected_at, appeal_lodged_at, appeal_determined_at,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0, NULL,NULL,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.reporting_year,
      body.capacity_mw,
      tier,
      body.report_category,
      body.description ?? null,
      'report_due',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_anr.created',
    actor_id: user.id,
    entity_type: 'ipp_anr',
    entity_id: id,
    data: {
      tier,
      report_category: body.report_category,
      reporting_year: body.reporting_year,
      capacity_mw: body.capacity_mw,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, tier } }, 201);
});

// ─── PUT /:id/action — state machine dispatch ─────────────────────────────

app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: AnnualReportAction;
    notes?: string;
    reason?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_annual_reports WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as AnnualReportStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.capacity_tier as CapacityTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (stays on current status, sets sla_breached=1).
  // Extend the typed action locally to accommodate flag_sla_breach.
  type AnyAction = AnnualReportAction | 'flag_sla_breach';
  const ACTION_STATE_MAP: Record<AnyAction, AnnualReportStatus> = {
    start_drafting:             'report_drafting',
    begin_data_collection:      'data_collection',
    complete_data_collection:   'internal_review',
    submit_for_internal_review: 'internal_review',
    approve_internally:         'submitted',
    submit_report:              'submitted',
    commence_review:            'under_review',
    raise_queries:              'queries_raised',
    submit_responses:           'responses_submitted',
    accept_report:              'accepted',
    reject_report:              'rejected',
    lodge_appeal:               'appeal_lodged',
    determine_appeal:           'appeal_determined',
    flag_sla_breach:            current,  // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current && action !== 'flag_sla_breach') {
    const rule = VALID_TRANSITIONS[body.action];
    if (!rule || !rule.from.includes(current)) {
      return c.json(
        { success: false, error: `Cannot transition '${current}' → '${action}'` },
        409,
      );
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const extraCols: Record<string, unknown> = {};

  if (action === 'submit_report' || action === 'approve_internally') {
    extraCols.submitted_at = nowIso;
  }
  if (action === 'accept_report')     extraCols.accepted_at = nowIso;
  if (action === 'reject_report')     extraCols.rejected_at = nowIso;
  if (action === 'lodge_appeal')      extraCols.appeal_lodged_at = nowIso;
  if (action === 'determine_appeal')  extraCols.appeal_determined_at = nowIso;
  if (action === 'flag_sla_breach')   extraCols.sla_breached = 1;

  // Recompute SLA deadline for new non-terminal states; self-loops preserve existing SLA.
  let slaAt: string | null = null;
  if (nextSt !== current && !HARD_TERMINALS.has(nextSt)) {
    const slaDays = SLA_DAYS[tier] ?? 0;
    if (slaDays > 0) {
      slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();
    }
  } else if (nextSt === current) {
    // Self-loop: keep existing sla_due_at by not updating it.
    slaAt = row.sla_due_at as string | null;
  }

  const isSelfLoop = nextSt === current;
  const reportable = action !== 'flag_sla_breach'
    ? crossesIntoRegulator(body.action, tier)
    : false;

  const setCols = [
    'chain_status = ?',
    'updated_at = ?',
    ...(isSelfLoop ? [] : ['sla_due_at = ?']),
    ...Object.keys(extraCols).map((k) => `${k} = ?`),
  ];

  const setValues = [
    nextSt,
    nowIso,
    ...(isSelfLoop ? [] : [slaAt]),
    ...Object.values(extraCols),
  ];

  await c.env.DB
    .prepare(`UPDATE oe_ipp_annual_reports SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `anr_evt_${action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_anr',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      report_category: row.report_category,
      reporting_year: row.reporting_year,
      notes: body.notes ?? null,
      reason: body.reason ?? null,
      is_reportable: reportable,
      crosses_into_regulator: reportable,
    },
    env: c.env,
  });

  return c.json({
    success: true,
    data: { id, status: nextSt, is_reportable: reportable },
  });
});

export default app;
