// ═══════════════════════════════════════════════════════════════════════════
// Wave 175 — IPP REIPPPP Milestone Certification
//
// Mounted at /api/ipp-milestone-certs.
// INVERTED SLA: larger projects (higher MW) → more documentation complexity
// → longer review windows. Strategic (>500 MW) gets the longest SLA.
// WRITE: admin | ipp_developer
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  deriveMcProjectTier,
  SLA_DAYS,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-milestone-cert-spec';
import type { McStatus, McAction, McProjectTier } from '../utils/ipp-milestone-cert-spec';
import { badEnum } from '../utils/validation';

// Migration 418 CHECKs — reject before D1 500s.
const MC_MILESTONE_TYPES = ['financial_close', 'construction_start', 'test_cod', 'cod', 'grid_connection', 'commissioning_complete', 'performance_test_complete'];
const MC_ENERGY_TYPES = ['solar_pv', 'wind_onshore', 'wind_offshore', 'biomass', 'small_hydro', 'csp', 'battery_storage'];

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippMilestoneCertSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, project_tier FROM oe_ipp_milestone_certifications
       WHERE sla_due_date IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_date <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; project_tier: McProjectTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_milestone_certifications SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_mc.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_mc',
      entity_id: row.id,
      data: {
        project_tier: row.project_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.project_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.project_tier),
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
    project_tier,
    milestone_type,
    energy_type,
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
  if (chain_status)   { clauses.push('chain_status = ?');   binds.push(chain_status); }
  if (project_tier)   { clauses.push('project_tier = ?');   binds.push(project_tier); }
  if (milestone_type) { clauses.push('milestone_type = ?'); binds.push(milestone_type); }
  if (energy_type)    { clauses.push('energy_type = ?');    binds.push(energy_type); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_milestone_certifications ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_milestone_certifications ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'milestone_certified' THEN 1 ELSE 0 END) as certified_count,
           SUM(CASE WHEN chain_status = 'milestone_rejected' THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN chain_status = 'milestone_lapsed' THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_milestone_certifications ${where}`,
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

// ─── POST / — create a new milestone certification record ─────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_ref: string;
    milestone_type: string;
    project_mw: number;
    energy_type?: string | null;
    scheduled_date?: string | null;
    ie_report_ref?: string | null;
    notes?: string | null;
  }>();

  if (
    !body.project_ref ||
    !body.milestone_type ||
    body.project_mw == null
  ) {
    return c.json(
      {
        success: false,
        error: 'project_ref, milestone_type, project_mw are required',
      },
      400,
    );
  }

  const enumErr =
    badEnum('milestone_type', body.milestone_type, MC_MILESTONE_TYPES) ??
    badEnum('energy_type', body.energy_type, MC_ENERGY_TYPES);
  if (enumErr) return c.json({ success: false, error: enumErr }, 400);

  const tier = deriveMcProjectTier(body.project_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_milestone_certifications
         (id, project_ref, milestone_type, project_mw, project_tier, energy_type,
          scheduled_date, ie_report_ref,
          chain_status, sla_due_date, sla_breached, is_reportable,
          actor_party, reason, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,0,?,NULL,?,?,?)`,
    )
    .bind(
      id,
      body.project_ref,
      body.milestone_type,
      body.project_mw,
      tier,
      body.energy_type ?? 'solar_pv',
      body.scheduled_date ?? null,
      body.ie_report_ref ?? null,
      'milestone_triggered',
      slaDueDate,
      user.id,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_mc.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_mc',
    entity_id: id,
    data: {
      project_tier: tier,
      project_ref: body.project_ref,
      milestone_type: body.milestone_type,
      project_mw: body.project_mw,
      energy_type: body.energy_type ?? 'solar_pv',
      scheduled_date: body.scheduled_date ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, project_tier: tier } }, 201);
});

// ─── GET /:id — single row + is_reportable + audit trail ─────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_milestone_certifications WHERE id = ?')
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
       WHERE entity_type = 'ipp_mc' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  const lastAction = (audit.results ?? []).at(-1);
  const isReportable = lastAction
    ? crossesIntoRegulator(
        lastAction.action as McAction,
        row.project_tier as McProjectTier,
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
    action: McAction;
    reason?: string;
    notes?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_milestone_certifications WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as McStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const action = body.action as McAction;
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

  const tier = row.project_tier as McProjectTier;
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

  await c.env.DB
    .prepare(
      `UPDATE oe_ipp_milestone_certifications
       SET chain_status = ?, sla_due_date = ?, reason = ?, notes = ?,
           is_reportable = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(nextSt, slaDueDate, body.reason ?? null, body.notes ?? null, reportable ? 1 : 0, nowIso, id)
    .run();

  await fireCascade({
    event: `mc_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_mc',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      project_tier: tier,
      project_mw: row.project_mw,
      milestone_type: row.milestone_type,
      project_ref: row.project_ref,
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
