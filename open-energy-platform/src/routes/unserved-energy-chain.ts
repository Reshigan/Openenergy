// ═══════════════════════════════════════════════════════════════════════════
// Wave 197 — Unserved Energy Compensation Claim (USE Claim)
//
// Three-party chain: offtaker (files claim), grid_operator (responds),
// admin (adjudicates).
//
// Regulatory basis: NERSA electricity supply quality + ERA s29 +
// NRS 048-2 + NEMA s28.
//
// Mounted at /api/unserved-energy-claims.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  UecStatus,
  UecAction,
  CustomerCategory,
  deriveUecSla,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/unserved-energy-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'offtaker', 'grid_operator'];

// ─── SLA sweep (exported — called by cron) ────────────────────────────────────

export async function unservedEnergySlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ swept: number }> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, customer_category FROM oe_unserved_energy_claims
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; customer_category: CustomerCategory }>();

  const rows = breaches.results ?? [];

  for (const row of rows) {
    const reportable = slaBreachCrossesIntoRegulator(row.customer_category);

    await env.DB
      .prepare(
        `UPDATE oe_unserved_energy_claims
         SET sla_breached = 1,
             regulator_notified = CASE WHEN ? = 1 THEN 1 ELSE regulator_notified END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    if (reportable) {
      const inboxId = `uec_sla_${row.id}_${Date.now()}`;
      await env.DB
        .prepare(
          `INSERT INTO regulator_inbox
             (id, category, priority, subject, body, source_table, source_id,
              source_event, participant_id, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          inboxId,
          'unserved_energy_claim',
          'high',
          `USE Claim SLA Breach — ${row.customer_category}`,
          `Unserved energy claim ${row.id} (${row.customer_category}) has breached its SLA deadline.`,
          'oe_unserved_energy_claims',
          row.id,
          'uec_evt_sla_breached',
          row.id,
          now,
        )
        .run();
    }

    await fireCascade({
      event: 'uec_evt_sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'unserved_energy_claim',
      entity_id: row.id,
      data: {
        customer_category: row.customer_category,
        regulator_notified: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });
  }

  return { swept: rows.length };
}

// ─── GET / — list records + KPIs ──────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    status,
    customer_category,
    offtaker_id,
    page = '1',
    per_page = '50',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const pageNum = Math.max(1, parseInt(page) || 1);
  const off     = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  // Scope by role
  if (user.role === 'offtaker') {
    clauses.push('offtaker_id = ?');
    binds.push(user.id);
  } else if (user.role === 'grid_operator') {
    clauses.push('grid_operator_id = ?');
    binds.push(user.id);
  } else if (!['admin', 'regulator'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  if (status)            { clauses.push('chain_status = ?');      binds.push(status); }
  if (customer_category) { clauses.push('customer_category = ?'); binds.push(customer_category); }
  if (offtaker_id && ['admin', 'regulator'].includes(user.role)) {
    clauses.push('offtaker_id = ?');
    binds.push(offtaker_id);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_unserved_energy_claims ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_unserved_energy_claims ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active_claims,
           SUM(COALESCE(claimed_amount_zar, 0)) as total_claimed_zar,
           SUM(CASE WHEN chain_status = 'claim_settled' THEN COALESCE(settlement_amount_zar, 0) ELSE 0 END) as total_settled_zar,
           AVG(CASE WHEN chain_status IN ('claim_settled','award_made')
               THEN CAST((julianday(updated_at) - julianday(created_at)) AS REAL)
               ELSE NULL END) as avg_resolution_days
         FROM oe_unserved_energy_claims ${where}`,
      )
      .bind(...[...HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  const total = totalRow?.n ?? 0;

  return c.json({
    success: true,
    data: rows.results ?? [],
    kpis: {
      active_claims:      kpis?.active_claims      ?? 0,
      total_claimed_zar:  kpis?.total_claimed_zar  ?? 0,
      total_settled_zar:  kpis?.total_settled_zar  ?? 0,
      avg_resolution_days: kpis?.avg_resolution_days ?? null,
    },
    pagination: {
      page: pageNum,
      per_page: perPage,
      total,
      total_pages: Math.ceil(total / perPage),
    },
  });
});

// ─── GET /:id — single record + timeline ──────────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_unserved_energy_claims WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  // Access control
  if (
    user.role === 'offtaker'      && row.offtaker_id      !== user.id ||
    user.role === 'grid_operator' && row.grid_operator_id !== user.id
  ) {
    if (!['admin', 'regulator'].includes(user.role)) {
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }
  }

  const timeline = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'unserved_energy_claim' AND entity_id = ?
       ORDER BY created_at DESC LIMIT 30`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, timeline: timeline.results ?? [] },
  });
});

// ─── POST / — file a new USE claim ────────────────────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    offtaker_id?: string;
    grid_operator_id: string;
    event_date: string;
    customer_category: CustomerCategory;
    unserved_mwh: number;
    claimed_amount_zar: number;
    nrs048_reference?: string | null;
    load_shedding_stage?: number | null;
    reason?: string | null;
  }>();

  if (!body.grid_operator_id || !body.event_date || !body.customer_category ||
      body.unserved_mwh == null || body.claimed_amount_zar == null) {
    return c.json(
      { success: false, error: 'grid_operator_id, event_date, customer_category, unserved_mwh, and claimed_amount_zar are required' },
      400,
    );
  }

  const validCategories: CustomerCategory[] = ['industrial', 'commercial', 'municipal', 'residential', 'scheduled'];
  if (!validCategories.includes(body.customer_category)) {
    return c.json(
      { success: false, error: `customer_category must be one of: ${validCategories.join(', ')}` },
      400,
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const id = `uec_${crypto.randomUUID()}`;
  const offtakerId = user.role === 'offtaker' ? user.id : (body.offtaker_id ?? user.id);

  const slaDays = deriveUecSla(body.customer_category);
  const slaDeadline = new Date(now.getTime() + slaDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await c.env.DB
    .prepare(
      `INSERT INTO oe_unserved_energy_claims
         (id, offtaker_id, grid_operator_id, event_date, customer_category,
          unserved_mwh, claimed_amount_zar, settlement_amount_zar,
          nrs048_reference, load_shedding_stage,
          chain_status, sla_deadline, sla_breached, regulator_notified,
          actor_id, reason, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,NULL,?,?,
               'claim_submitted',?,0,0,
               ?,?,?,?)`,
    )
    .bind(
      id,
      offtakerId,
      body.grid_operator_id,
      body.event_date,
      body.customer_category,
      body.unserved_mwh,
      body.claimed_amount_zar,
      body.nrs048_reference ?? null,
      body.load_shedding_stage ?? null,
      slaDeadline,
      user.id,
      body.reason ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'uec_evt_claim_submitted' as EventType,
    actor_id: user.id,
    entity_type: 'unserved_energy_claim',
    entity_id: id,
    data: {
      offtaker_id: offtakerId,
      grid_operator_id: body.grid_operator_id,
      customer_category: body.customer_category,
      unserved_mwh: body.unserved_mwh,
      claimed_amount_zar: body.claimed_amount_zar,
      sla_deadline: slaDeadline,
    },
    env: c.env,
  });

  return c.json(
    { success: true, data: { id, customer_category: body.customer_category, sla_deadline: slaDeadline } },
    201,
  );
});

// ─── POST /:id/action — state machine transition ───────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: UecAction;
    reason?: string | null;
    actor_id?: string | null;
    settlement_amount_zar?: number | null;
  }>();

  if (!body.action) {
    return c.json({ success: false, error: 'action is required' }, 400);
  }

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_unserved_energy_claims WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  // Access control — offtaker can only act on their own claims
  if (user.role === 'offtaker' && row.offtaker_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  if (user.role === 'grid_operator' && row.grid_operator_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as UecStatus;
  const action  = body.action as UecAction;

  if (HARD_TERMINALS.has(current)) {
    return c.json(
      { success: false, error: `Status '${current}' is terminal — no further transitions allowed` },
      400,
    );
  }

  const rule = VALID_TRANSITIONS[action];
  if (!rule) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  if (!rule.from.includes(current)) {
    return c.json(
      { success: false, error: `Cannot apply action '${action}' from status '${current}'` },
      400,
    );
  }

  const nextStatus = STATE_TRANSITIONS[action];
  const category   = row.customer_category as CustomerCategory;
  const now        = new Date();
  const nowIso     = now.toISOString();

  const reportable = crossesIntoRegulator(action, category);

  // SLA breach detection
  const slaDeadline     = row.sla_deadline as string | null;
  const alreadyBreached = (row.sla_breached as number) === 1;
  let slaBreached       = alreadyBreached ? 1 : 0;
  let regulatorNotified = (row.regulator_notified as number) === 1 ? 1 : (reportable ? 1 : 0);

  if (slaDeadline && !alreadyBreached && nowIso > slaDeadline) {
    slaBreached = 1;
    if (slaBreachCrossesIntoRegulator(category)) {
      regulatorNotified = 1;
    }
  }

  // Carry settlement amount if provided on accept_settlement / make_award
  const settlementAmount =
    (action === 'accept_settlement' || action === 'make_award') && body.settlement_amount_zar != null
      ? body.settlement_amount_zar
      : (row.settlement_amount_zar as number | null);

  await c.env.DB
    .prepare(
      `UPDATE oe_unserved_energy_claims
       SET chain_status = ?,
           reason = ?,
           actor_id = ?,
           sla_breached = ?,
           regulator_notified = ?,
           settlement_amount_zar = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextStatus,
      body.reason ?? null,
      body.actor_id ?? user.id,
      slaBreached,
      regulatorNotified,
      settlementAmount ?? null,
      nowIso,
      id,
    )
    .run();

  // Regulator inbox insert for crossing actions
  if (reportable) {
    const inboxId = `uec_reg_${id}_${action}_${Date.now()}`;
    await c.env.DB
      .prepare(
        `INSERT INTO regulator_inbox
           (id, category, priority, subject, body, source_table, source_id,
            source_event, participant_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        inboxId,
        'unserved_energy_claim',
        action === 'make_award' ? 'high' : 'medium',
        `USE Claim — ${action.replace(/_/g, ' ')} — ${category}`,
        `Unserved energy claim ${id} (${category}) has reached '${nextStatus}' via action '${action}'. ` +
          (body.reason ? `Reason: ${body.reason}` : ''),
        'oe_unserved_energy_claims',
        id,
        `uec_evt_${action}`,
        row.offtaker_id as string,
        nowIso,
      )
      .run();
  }

  await fireCascade({
    event: `uec_evt_${action}` as EventType,
    actor_id: body.actor_id ?? user.id,
    entity_type: 'unserved_energy_claim',
    entity_id: id,
    data: {
      action,
      from_status: current,
      to_status: nextStatus,
      reason: body.reason ?? null,
      customer_category: category,
      settlement_amount_zar: settlementAmount ?? null,
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

// ─── POST /sla-sweep — internal cron endpoint ─────────────────────────────────

router.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden — admin only' }, 403);
  }

  const result = await unservedEnergySlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export const unservedEnergyRoutes = router;
export default router;
