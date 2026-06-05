// ═══════════════════════════════════════════════════════════════════════════
// Wave 192 — IPP Conditions Precedent (CP) Tracker
//
// Mounted at /api/ipp-cp-tracker.
// INVERTED SLA: higher-tier CPs receive MORE time because verification and
// sign-off processes involve more stakeholders and longer statutory consultation
// windows. Strategic CPs (REIPPPP award, ministerial consent) receive 60 days.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  CPTrackerStatus,
  CPTrackerAction,
  CPTier,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  deriveSla,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-cp-tracker-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp', 'ipp_developer', 'wind', 'regulator'];

// ─── SLA sweep (exported — called by cron) ───────────────────────────────────

export async function ippCpTrackerSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ swept: number }> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, cp_tier FROM oe_cp_tracker
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; cp_tier: CPTier }>();

  const rows = breaches.results ?? [];

  for (const row of rows) {
    const reportable = slaBreachCrossesIntoRegulator(row.cp_tier);

    await env.DB
      .prepare(
        `UPDATE oe_cp_tracker
         SET sla_breached = 1,
             regulator_notified = CASE WHEN ? = 1 THEN 1 ELSE regulator_notified END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    await fireCascade({
      event: 'cp_evt_sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'cp_tracker',
      entity_id: row.id,
      data: {
        cp_tier: row.cp_tier,
        regulator_notified: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });
  }

  return { swept: rows.length };
}

// ─── GET / — list records + KPIs ─────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    status,
    cp_tier,
    sla_breached,
    project_ref,
    page = '1',
    per_page = '50',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const pageNum = Math.max(1, parseInt(page) || 1);
  const off     = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  // Scope to participant unless admin/support/regulator
  if (['admin', 'support', 'regulator'].includes(user.role)) {
    if (project_ref) {
      clauses.push('project_ref = ?');
      binds.push(project_ref);
    }
  } else {
    clauses.push('actor_id = ?');
    binds.push(user.id);
  }

  if (status)      { clauses.push('chain_status = ?'); binds.push(status); }
  if (cp_tier)     { clauses.push('cp_tier = ?');      binds.push(cp_tier); }
  if (sla_breached !== undefined && sla_breached !== '') {
    clauses.push('sla_breached = ?');
    binds.push(sla_breached === '1' || sla_breached === 'true' ? 1 : 0);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_cp_tracker ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_cp_tracker ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'satisfied' THEN 1 ELSE 0 END) as satisfied_count,
           SUM(CASE WHEN chain_status = 'waived'    THEN 1 ELSE 0 END) as waived_count,
           SUM(CASE WHEN chain_status = 'lapsed'    THEN 1 ELSE 0 END) as lapsed_count,
           SUM(CASE WHEN chain_status = 'rejected'  THEN 1 ELSE 0 END) as rejected_count
         FROM oe_cp_tracker ${where}`,
      )
      .bind(...[...HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  const total = totalRow?.n ?? 0;

  return c.json({
    success: true,
    data: {
      items: rows.results ?? [],
      pagination: {
        page: pageNum,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
      kpis,
    },
  });
});

// ─── POST / — create a new CP tracker record ─────────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    cp_title: string;
    cp_tier: CPTier;
    project_ref?: string | null;
    lender_ref?: string | null;
    gate_ref?: string | null;
    description?: string | null;
  }>();

  if (!body.cp_title || !body.cp_tier) {
    return c.json(
      {
        success: false,
        error: 'cp_title and cp_tier are required',
      },
      400,
    );
  }

  const validTiers: CPTier[] = ['operational', 'commercial', 'financial', 'regulatory', 'strategic'];
  if (!validTiers.includes(body.cp_tier)) {
    return c.json(
      {
        success: false,
        error: `cp_tier must be one of: ${validTiers.join(', ')}`,
      },
      400,
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const id = `cp_tracker_${crypto.randomUUID()}`;

  const slaDays = deriveSla(body.cp_tier);
  const slaDeadline = new Date(now.getTime() + slaDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await c.env.DB
    .prepare(
      `INSERT INTO oe_cp_tracker
         (id, cp_title, cp_tier, project_ref, lender_ref, gate_ref, description,
          chain_status,
          sla_deadline, sla_breached, regulator_notified,
          actor_id,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,'identified',?,0,0,?,?,?)`,
    )
    .bind(
      id,
      body.cp_title,
      body.cp_tier,
      body.project_ref ?? null,
      body.lender_ref ?? null,
      body.gate_ref ?? null,
      body.description ?? null,
      slaDeadline,
      user.id,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'cp_evt_identified' as EventType,
    actor_id: user.id,
    entity_type: 'cp_tracker',
    entity_id: id,
    data: {
      cp_title: body.cp_title,
      cp_tier: body.cp_tier,
      sla_deadline: slaDeadline,
      project_ref: body.project_ref ?? null,
      gate_ref: body.gate_ref ?? null,
    },
    env: c.env,
  });

  return c.json(
    { success: true, data: { id, cp_tier: body.cp_tier, sla_deadline: slaDeadline } },
    201,
  );
});

// ─── GET /:id — single record + audit trail ──────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_cp_tracker WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const audit = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'cp_tracker' AND entity_id = ?
       ORDER BY created_at DESC LIMIT 20`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST /:id/action — state machine transition ──────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: CPTrackerAction;
    reason?: string | null;
  }>();

  if (!body.action) {
    return c.json({ success: false, error: 'action is required' }, 400);
  }

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_cp_tracker WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as CPTrackerStatus;

  if (HARD_TERMINALS.has(current)) {
    return c.json(
      {
        success: false,
        error: `Status '${current}' is terminal — no further transitions allowed`,
      },
      400,
    );
  }

  const action = body.action as CPTrackerAction;

  const rule = VALID_TRANSITIONS[action];
  if (!rule) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  if (!rule.from.includes(current)) {
    return c.json(
      {
        success: false,
        error: `Cannot apply action '${action}' from status '${current}'`,
      },
      400,
    );
  }

  const nextStatus = STATE_TRANSITIONS[action];
  const tier = row.cp_tier as CPTier;
  const now = new Date();
  const nowIso = now.toISOString();

  const reportable = crossesIntoRegulator(action, tier);

  // SLA breach detection
  const slaDeadline   = row.sla_deadline as string | null;
  const alreadyBreached = (row.sla_breached as number) === 1;
  let slaBreached = alreadyBreached ? 1 : 0;
  let regulatorNotified = (row.regulator_notified as number) === 1 ? 1 : (reportable ? 1 : 0);

  if (slaDeadline && !alreadyBreached && nowIso > slaDeadline) {
    slaBreached = 1;
    if (slaBreachCrossesIntoRegulator(tier)) {
      regulatorNotified = 1;
    }
  }

  await c.env.DB
    .prepare(
      `UPDATE oe_cp_tracker
       SET chain_status = ?,
           reason = ?,
           actor_id = ?,
           sla_breached = ?,
           regulator_notified = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextStatus,
      body.reason ?? null,
      user.id,
      slaBreached,
      regulatorNotified,
      nowIso,
      id,
    )
    .run();

  await fireCascade({
    event: `cp_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'cp_tracker',
    entity_id: id,
    data: {
      action,
      from_status: current,
      to_status: nextStatus,
      reason: body.reason ?? null,
      cp_tier: tier,
      cp_title: row.cp_title,
      project_ref: row.project_ref ?? null,
      gate_ref: row.gate_ref ?? null,
      regulator_notified: reportable,
      crosses_into_regulator: reportable,
    },
    env: c.env,
  });

  return c.json({
    success: true,
    data: {
      id,
      status: nextStatus,
      regulator_notified: regulatorNotified === 1,
    },
  });
});

// ─── POST /sla-sweep — internal cron endpoint ────────────────────────────────

router.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden — admin only' }, 403);
  }

  const result = await ippCpTrackerSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export const ippCpTrackerRoutes = router;
export default router;
