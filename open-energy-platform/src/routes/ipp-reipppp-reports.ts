// ═══════════════════════════════════════════════════════════════════════════
// Wave 185 — IPP REIPPPP Annual Progress & Compliance Report
//
// Mounted at /api/ipp-reipppp-reports.
// INVERTED SLA: larger project (MW) = more complex REIPPPP obligations
// = more stakeholders to consult = MORE time granted by the IPP Office.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  deriveRprProjectTier,
  SLA_DAYS,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-reipppp-report-spec';
import type { RprStatus, RprAction, RprProjectTier } from '../utils/ipp-reipppp-report-spec';
import { badEnum } from '../utils/validation';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

async function ippReippppReportSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, project_tier FROM oe_ipp_reipppp_reports
       WHERE sla_due_date IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_date <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; project_tier: RprProjectTier }>();

  for (const row of breaches.results ?? []) {
    const reportable = slaBreachCrossesIntoRegulator(row.project_tier);

    await env.DB
      .prepare(
        `UPDATE oe_ipp_reipppp_reports
         SET sla_breached = 1, is_reportable = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_rpr.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_rpr',
      entity_id: row.id,
      data: {
        project_tier: row.project_tier,
        is_reportable: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });

    await fireCascade({
      event: 'rpr_evt_flag_sla_breach' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_rpr',
      entity_id: row.id,
      data: {
        project_tier: row.project_tier,
        is_reportable: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });
  }
}

// ─── GET / — list all + KPIs ─────────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    status,
    project_tier,
    report_type,
    limit = '50',
    offset = '0',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const off     = Math.max(0, parseInt(offset) || 0);

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('actor_party = ?');
    binds.push(user.id);
  }

  if (status)       { clauses.push('chain_status = ?');  binds.push(status); }
  if (project_tier) { clauses.push('project_tier = ?');  binds.push(project_tier); }
  if (report_type)  { clauses.push('report_type = ?');   binds.push(report_type); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_reipppp_reports ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_reipppp_reports ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'report_accepted' THEN 1 ELSE 0 END) as accepted_count,
           SUM(CASE WHEN chain_status = 'report_rejected' THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN chain_status = 'report_lapsed'   THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_reipppp_reports ${where}`,
      )
      .bind(...[...HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  return c.json({
    success: true,
    data: {
      items: rows.results ?? [],
      pagination: {
        limit: perPage,
        offset: off,
        total: totalRow?.n ?? 0,
      },
      kpis,
    },
  });
});

// ─── POST / — create a new REIPPPP report record ──────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_ref: string;
    reipppp_bid_ref?: string | null;
    report_period: string;
    project_mw: number;
    report_type?: string | null;
    local_content_pct?: number | null;
    ed_spend_zar?: number | null;
    jobs_direct?: number | null;
    notes?: string | null;
  }>();

  if (!body.project_ref || !body.report_period || body.project_mw == null) {
    return c.json(
      {
        success: false,
        error: 'project_ref, report_period, and project_mw are required',
      },
      400,
    );
  }

  const reportTypeErr = badEnum('report_type', body.report_type, ['annual_operational', 'annual_construction', 'final_construction', 'remediation_report']);
  if (reportTypeErr) return c.json({ success: false, error: reportTypeErr }, 400);

  const tier = deriveRprProjectTier(body.project_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `rpr_${crypto.randomUUID()}`;

  const slaDays = SLA_DAYS[tier];
  const slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  const reportType = body.report_type ?? 'annual_operational';

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_reipppp_reports
         (id, project_ref, reipppp_bid_ref, report_period, project_mw, project_tier,
          report_type, local_content_pct, ed_spend_zar, jobs_direct,
          chain_status, sla_due_date, sla_breached, is_reportable,
          actor_party, reason, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,NULL,?,?,?)`,
    )
    .bind(
      id,
      body.project_ref,
      body.reipppp_bid_ref ?? null,
      body.report_period,
      body.project_mw,
      tier,
      reportType,
      body.local_content_pct ?? null,
      body.ed_spend_zar ?? null,
      body.jobs_direct ?? null,
      'report_cycle_opened',
      slaDueDate,
      user.id,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_rpr.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_rpr',
    entity_id: id,
    data: {
      project_tier: tier,
      project_ref: body.project_ref,
      reipppp_bid_ref: body.reipppp_bid_ref ?? null,
      report_period: body.report_period,
      project_mw: body.project_mw,
      report_type: reportType,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, project_tier: tier } }, 201);
});

// ─── GET /:id — single row + audit trail ─────────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_reipppp_reports WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const audit = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'ipp_rpr' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  const lastAction = (audit.results ?? []).at(-1);
  const isReportable = lastAction
    ? crossesIntoRegulator(
        lastAction.action as RprAction,
        row.project_tier as RprProjectTier,
      )
    : false;

  return c.json({
    success: true,
    data: { ...row, is_reportable: isReportable ? 1 : 0, audit_trail: audit.results ?? [] },
  });
});

// ─── POST /:id/action — state machine dispatch ────────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: RprAction;
    reason?: string;
    notes?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_reipppp_reports WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as RprStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status ${current} is terminal` }, 409);
  }

  const action = body.action as RprAction;
  const nextSt = STATE_TRANSITIONS[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  const rule = VALID_TRANSITIONS[action];
  if (!rule || !rule.from.includes(current)) {
    return c.json(
      { success: false, error: `Cannot transition ${current} to ${action}` },
      409,
    );
  }

  const tier = row.project_tier as RprProjectTier;
  const now = new Date();
  const nowIso = now.toISOString();

  const reportable = crossesIntoRegulator(action, tier);

  await c.env.DB
    .prepare(
      `UPDATE oe_ipp_reipppp_reports
       SET chain_status = ?, reason = ?, notes = ?,
           is_reportable = ?, actor_party = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextSt,
      body.reason ?? null,
      body.notes ?? null,
      reportable ? 1 : 0,
      user.id,
      nowIso,
      id,
    )
    .run();

  await fireCascade({
    event: `rpr_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_rpr',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      project_tier: tier,
      project_mw: row.project_mw,
      project_ref: row.project_ref,
      reipppp_bid_ref: row.reipppp_bid_ref ?? null,
      report_period: row.report_period,
      report_type: row.report_type,
      reason: body.reason ?? null,
      notes: body.notes ?? null,
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

export { ippReippppReportSlaSweep };
export default router;
