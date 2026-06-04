// ═══════════════════════════════════════════════════════════════════════════
// Wave 183 — IPP Lender Information Covenant & Reporting Package
//
// Mounted at /api/ipp-lender-reporting.
// URGENT SLA: more lenders = tighter deadline (consortium=7d, sole=30d).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  deriveLrepLenderTier,
  SLA_DAYS,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-lender-reporting-spec';
import type { LrepStatus, LrepAction, LrepLenderTier } from '../utils/ipp-lender-reporting-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippLenderReportingSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, lender_tier FROM oe_ipp_lender_reporting
       WHERE sla_due_date IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_date <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; lender_tier: LrepLenderTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_lender_reporting SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_lrep.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_lrep',
      entity_id: row.id,
      data: {
        lender_tier: row.lender_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.lender_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.lender_tier),
      },
      env,
    });
  }
}

// ─── GET / — list all + KPIs ─────────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    project_ref,
    chain_status,
    lender_tier,
    report_type,
    report_period,
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
  } else if (project_ref) {
    clauses.push('project_ref = ?');
    binds.push(project_ref);
  }
  if (chain_status)  { clauses.push('chain_status = ?');  binds.push(chain_status); }
  if (lender_tier)   { clauses.push('lender_tier = ?');   binds.push(lender_tier); }
  if (report_type)   { clauses.push('report_type = ?');   binds.push(report_type); }
  if (report_period) { clauses.push('report_period = ?'); binds.push(report_period); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_lender_reporting ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_lender_reporting ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'package_acknowledged' THEN 1 ELSE 0 END) as acknowledged_count,
           SUM(CASE WHEN chain_status = 'package_disputed' THEN 1 ELSE 0 END) as disputed_count,
           SUM(CASE WHEN chain_status = 'covenant_breach' THEN 1 ELSE 0 END) as breach_count
         FROM oe_ipp_lender_reporting ${where}`,
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

// ─── POST / — create a new lender reporting record ───────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_ref: string;
    report_period: string;
    lender_count: number;
    report_type?: string;
    agent_bank?: string | null;
    due_date?: string | null;
    notes?: string | null;
  }>();

  if (!body.project_ref || !body.report_period || body.lender_count == null) {
    return c.json(
      {
        success: false,
        error: 'project_ref, report_period, and lender_count are required',
      },
      400,
    );
  }

  const tier = deriveLrepLenderTier(body.lender_count);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  const reportType = body.report_type ?? 'quarterly_report';

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_lender_reporting
         (id, project_ref, report_period, lender_count, lender_tier,
          report_type, agent_bank, due_date,
          chain_status, sla_due_date, sla_breached, is_reportable,
          actor_party, reason, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,0,?,NULL,?,?,?)`,
    )
    .bind(
      id,
      body.project_ref,
      body.report_period,
      body.lender_count,
      tier,
      reportType,
      body.agent_bank ?? null,
      body.due_date ?? null,
      'reporting_triggered',
      slaDueDate,
      user.id,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_lrep.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_lrep',
    entity_id: id,
    data: {
      lender_tier: tier,
      project_ref: body.project_ref,
      report_period: body.report_period,
      lender_count: body.lender_count,
      report_type: reportType,
      agent_bank: body.agent_bank ?? null,
      due_date: body.due_date ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, lender_tier: tier } }, 201);
});

// ─── GET /:id — single row + is_reportable + audit trail ─────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_lender_reporting WHERE id = ?')
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
       WHERE entity_type = 'ipp_lrep' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  const lastAction = (audit.results ?? []).at(-1);
  const isReportable = lastAction
    ? crossesIntoRegulator(
        lastAction.action as LrepAction,
        row.lender_tier as LrepLenderTier,
      )
    : false;

  return c.json({
    success: true,
    data: { ...row, is_reportable: isReportable ? 1 : 0, audit_trail: audit.results ?? [] },
  });
});

// ─── PUT /:id/action — state machine dispatch ─────────────────────────────────

router.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: LrepAction;
    reason?: string;
    notes?: string;
    agent_bank?: string | null;
    due_date?: string | null;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_lender_reporting WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as LrepStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const action = body.action as LrepAction;
  const nextSt = STATE_TRANSITIONS[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  const rule = VALID_TRANSITIONS[action];
  if (!rule || !rule.from.includes(current)) {
    return c.json(
      { success: false, error: `Cannot transition '${current}' → '${action}'` },
      409,
    );
  }

  const tier = row.lender_tier as LrepLenderTier;
  const now = new Date();
  const nowIso = now.toISOString();

  let slaDueDate: string | null = null;
  if (!HARD_TERMINALS.has(nextSt)) {
    const slaDays = SLA_DAYS[tier] ?? 0;
    if (slaDays > 0) {
      slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();
    }
  }

  const reportable = crossesIntoRegulator(action, tier);

  const updatedAgentBank = body.agent_bank !== undefined ? body.agent_bank : (row.agent_bank ?? null);
  const updatedDueDate   = body.due_date   !== undefined ? body.due_date   : (row.due_date   ?? null);

  await c.env.DB
    .prepare(
      `UPDATE oe_ipp_lender_reporting
       SET chain_status = ?, sla_due_date = ?, reason = ?, notes = ?,
           is_reportable = ?, agent_bank = ?, due_date = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextSt,
      slaDueDate,
      body.reason ?? null,
      body.notes ?? null,
      reportable ? 1 : 0,
      updatedAgentBank,
      updatedDueDate,
      nowIso,
      id,
    )
    .run();

  await fireCascade({
    event: `lrep_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_lrep',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      lender_tier: tier,
      lender_count: row.lender_count,
      project_ref: row.project_ref,
      report_period: row.report_period,
      report_type: row.report_type,
      agent_bank: updatedAgentBank,
      due_date: updatedDueDate,
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

export default router;
