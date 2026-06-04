// ═══════════════════════════════════════════════════════════════════════════
// Wave 184 — IPP Annual NERSA Licence Compliance Return
//
// Mounted at /api/ipp-licence-returns.
// INVERTED SLA: larger licensed capacity = more complex compliance obligations
// = NERSA grants more time to compile and review.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  deriveLcrCapacityTier,
  SLA_DAYS,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-licence-return-spec';
import type { LcrStatus, LcrAction, LcrCapacityTier } from '../utils/ipp-licence-return-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippLicenceReturnSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, capacity_tier FROM oe_ipp_licence_returns
       WHERE sla_due_date IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_date <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; capacity_tier: LcrCapacityTier }>();

  for (const row of breaches.results ?? []) {
    const reportable = slaBreachCrossesIntoRegulator(row.capacity_tier);

    await env.DB
      .prepare(
        `UPDATE oe_ipp_licence_returns
         SET sla_breached = 1, is_reportable = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_acr.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_acr',
      entity_id: row.id,
      data: {
        capacity_tier: row.capacity_tier,
        is_reportable: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });

    await fireCascade({
      event: 'acr_evt_flag_sla_breach' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_acr',
      entity_id: row.id,
      data: {
        capacity_tier: row.capacity_tier,
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
    capacity_tier,
    return_type,
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

  if (status)        { clauses.push('chain_status = ?');  binds.push(status); }
  if (capacity_tier) { clauses.push('capacity_tier = ?'); binds.push(capacity_tier); }
  if (return_type)   { clauses.push('return_type = ?');   binds.push(return_type); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_licence_returns ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_licence_returns ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'return_accepted' THEN 1 ELSE 0 END) as accepted_count,
           SUM(CASE WHEN chain_status = 'return_rejected' THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN chain_status = 'return_lapsed'   THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_licence_returns ${where}`,
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

// ─── POST / — create a new licence return record ──────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_ref: string;
    licence_number?: string | null;
    financial_year_end: string;
    licensed_mw: number;
    return_type?: string | null;
    notes?: string | null;
  }>();

  if (!body.project_ref || !body.financial_year_end || body.licensed_mw == null) {
    return c.json(
      {
        success: false,
        error: 'project_ref, financial_year_end, and licensed_mw are required',
      },
      400,
    );
  }

  const tier = deriveLcrCapacityTier(body.licensed_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_acr_${crypto.randomUUID()}`;

  const slaDays = SLA_DAYS[tier];
  const slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  const returnType = body.return_type ?? 'annual_standard';

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_licence_returns
         (id, project_ref, licence_number, financial_year_end, licensed_mw, capacity_tier,
          return_type, chain_status, sla_due_date, sla_breached, is_reportable,
          actor_party, reason, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,0,?,NULL,?,?,?)`,
    )
    .bind(
      id,
      body.project_ref,
      body.licence_number ?? null,
      body.financial_year_end,
      body.licensed_mw,
      tier,
      returnType,
      'return_triggered',
      slaDueDate,
      user.id,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_acr.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_acr',
    entity_id: id,
    data: {
      capacity_tier: tier,
      project_ref: body.project_ref,
      licence_number: body.licence_number ?? null,
      financial_year_end: body.financial_year_end,
      licensed_mw: body.licensed_mw,
      return_type: returnType,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, capacity_tier: tier } }, 201);
});

// ─── GET /:id — single row + audit trail ─────────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_licence_returns WHERE id = ?')
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
       WHERE entity_type = 'ipp_acr' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  const lastAction = (audit.results ?? []).at(-1);
  const isReportable = lastAction
    ? crossesIntoRegulator(
        lastAction.action as LcrAction,
        row.capacity_tier as LcrCapacityTier,
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
    action: LcrAction;
    reason?: string;
    notes?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_licence_returns WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as LcrStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status ${current} is terminal` }, 409);
  }

  const action = body.action as LcrAction;
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

  const tier = row.capacity_tier as LcrCapacityTier;
  const now = new Date();
  const nowIso = now.toISOString();

  const reportable = crossesIntoRegulator(action, tier);

  await c.env.DB
    .prepare(
      `UPDATE oe_ipp_licence_returns
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
    event: `acr_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_acr',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      capacity_tier: tier,
      licensed_mw: row.licensed_mw,
      project_ref: row.project_ref,
      licence_number: row.licence_number ?? null,
      financial_year_end: row.financial_year_end,
      return_type: row.return_type,
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
