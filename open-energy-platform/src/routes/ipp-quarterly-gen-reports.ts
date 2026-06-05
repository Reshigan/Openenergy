// ═══════════════════════════════════════════════════════════════════════════
// Wave 187 — IPP DMRE Quarterly Generation & Operations Report
//
// Mounted at /api/ipp-quarterly-gen-reports.
// INVERTED SLA: larger project (MW) = more data to compile + more
// stakeholders to consult + more complex O&M and environmental records =
// MORE time granted by the IPP Office. Flagship plants (> 200 MW) receive
// 49 days from the quarter-end trigger.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  QgrStatus,
  QgrAction,
  QgrProjectTier,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  SLA_DAYS,
  deriveQgrProjectTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-quarterly-gen-report-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippQuarterlyGenReportSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, project_tier FROM oe_ipp_quarterly_gen_reports
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; project_tier: QgrProjectTier }>();

  for (const row of breaches.results ?? []) {
    const reportable = slaBreachCrossesIntoRegulator(row.project_tier);

    await env.DB
      .prepare(
        `UPDATE oe_ipp_quarterly_gen_reports
         SET sla_breached = 1, updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_qgr.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_qgr',
      entity_id: row.id,
      data: {
        project_tier: row.project_tier,
        regulator_notified: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });

    await fireCascade({
      event: 'qgr_evt_flag_sla_breach' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_qgr',
      entity_id: row.id,
      data: {
        project_tier: row.project_tier,
        regulator_notified: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });
  }
}

// ─── GET / — list all records + KPIs ─────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    status,
    project_tier,
    quarter,
    limit = '50',
    offset = '0',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const off     = Math.max(0, parseInt(offset) || 0);

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?');
    binds.push(user.id);
  }

  if (status)       { clauses.push('chain_status = ?');  binds.push(status); }
  if (project_tier) { clauses.push('project_tier = ?');  binds.push(project_tier); }
  if (quarter)      { clauses.push('quarter = ?');        binds.push(quarter); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_quarterly_gen_reports ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_quarterly_gen_reports ${where}`)
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
         FROM oe_ipp_quarterly_gen_reports ${where}`,
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

// ─── POST / — create a new quarterly gen report record ───────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id?: string | null;
    quarter: string;
    report_period_start: string;
    report_period_end: string;
    project_mw: number;
    mwh_contracted?: number | null;
    mwh_actual?: number | null;
    availability_pct?: number | null;
    capacity_factor_pct?: number | null;
    ed_spend_qtd_zar?: number | null;
    sed_spend_qtd_zar?: number | null;
    actor_party?: string | null;
    notes?: string | null;
  }>();

  if (
    !body.quarter ||
    !body.report_period_start ||
    !body.report_period_end ||
    body.project_mw == null
  ) {
    return c.json(
      {
        success: false,
        error: 'quarter, report_period_start, report_period_end, and project_mw are required',
      },
      400,
    );
  }

  const tier = deriveQgrProjectTier(body.project_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_qgr_${crypto.randomUUID()}`;

  const slaDays = SLA_DAYS[tier];
  const slaDeadline = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_quarterly_gen_reports
         (id, participant_id, project_id, quarter,
          report_period_start, report_period_end,
          project_mw, mwh_contracted, mwh_actual,
          availability_pct, capacity_factor_pct,
          ed_spend_qtd_zar, sed_spend_qtd_zar,
          project_tier, chain_status,
          sla_days, sla_deadline, sla_breached,
          actor_id, actor_party, notes,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id ?? null,
      body.quarter,
      body.report_period_start,
      body.report_period_end,
      body.project_mw,
      body.mwh_contracted ?? 0,
      body.mwh_actual ?? 0,
      body.availability_pct ?? 0,
      body.capacity_factor_pct ?? 0,
      body.ed_spend_qtd_zar ?? 0,
      body.sed_spend_qtd_zar ?? 0,
      tier,
      'report_quarter_opened',
      slaDays,
      slaDeadline,
      user.id,
      body.actor_party ?? null,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_qgr.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_qgr',
    entity_id: id,
    data: {
      project_tier: tier,
      quarter: body.quarter,
      report_period_start: body.report_period_start,
      report_period_end: body.report_period_end,
      project_mw: body.project_mw,
      mwh_contracted: body.mwh_contracted ?? 0,
      mwh_actual: body.mwh_actual ?? 0,
      availability_pct: body.availability_pct ?? 0,
      capacity_factor_pct: body.capacity_factor_pct ?? 0,
      ed_spend_qtd_zar: body.ed_spend_qtd_zar ?? 0,
      sed_spend_qtd_zar: body.sed_spend_qtd_zar ?? 0,
      sla_days: slaDays,
      sla_deadline: slaDeadline,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, project_tier: tier } }, 201);
});

// ─── GET /:id — single record + audit trail ──────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_quarterly_gen_reports WHERE id = ?')
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
       WHERE entity_type = 'ipp_qgr' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── PUT /:id/action — state machine transition ───────────────────────────────

router.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: QgrAction;
    notes?: string | null;
    actor_party?: string | null;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_quarterly_gen_reports WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as QgrStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json(
      { success: false, error: `Status ${current} is terminal — no further transitions allowed` },
      400,
    );
  }

  const action = body.action as QgrAction;

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

  const nextSt = STATE_TRANSITIONS[action];
  const tier = row.project_tier as QgrProjectTier;
  const now = new Date();
  const nowIso = now.toISOString();

  const reportable = crossesIntoRegulator(action, tier);

  await c.env.DB
    .prepare(
      `UPDATE oe_ipp_quarterly_gen_reports
       SET chain_status = ?, notes = ?,
           actor_id = ?, actor_party = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextSt,
      body.notes ?? row.notes ?? null,
      user.id,
      body.actor_party ?? row.actor_party ?? null,
      nowIso,
      id,
    )
    .run();

  await fireCascade({
    event: `qgr_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_qgr',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      project_tier: tier,
      quarter: row.quarter,
      report_period_start: row.report_period_start,
      report_period_end: row.report_period_end,
      project_mw: row.project_mw,
      mwh_contracted: row.mwh_contracted,
      mwh_actual: row.mwh_actual,
      availability_pct: row.availability_pct,
      capacity_factor_pct: row.capacity_factor_pct,
      ed_spend_qtd_zar: row.ed_spend_qtd_zar,
      sed_spend_qtd_zar: row.sed_spend_qtd_zar,
      notes: body.notes ?? null,
      regulator_notified: reportable,
      crosses_into_regulator: reportable,
    },
    env: c.env,
  });

  return c.json({
    success: true,
    data: { id, status: nextSt, regulator_notified: reportable },
  });
});

// ─── POST /sla-sweep — internal admin-only sweep ─────────────────────────────

router.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden — admin only' }, 403);
  }

  await ippQuarterlyGenReportSlaSweep(c.env);
  return c.json({ success: true, data: { swept: true } });
});

export default router;
