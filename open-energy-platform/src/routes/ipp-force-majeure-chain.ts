// ═══════════════════════════════════════════════════════════════════════════
// Wave 194 — IPP Force Majeure Notification & Relief (PPA-based chain)
//
// Regulatory: PPA force majeure clause + ERA 4/2006 s34 + REIPPPP Schedule 4
// Primary actor: ipp_developer (submits), admin (adjudicates)
// Secondary: offtaker / regulator (acknowledge)
//
// SLA polarity — URGENT (more severe / time-critical categories get LESS time):
//   extreme_weather   2 days
//   severe_storm      3 days
//   network_fault     7 days
//   regulatory_action 14 days
//   general           21 days
//
// Regulator crossings:
//   period_active  → ALL tiers
//   relief_granted → extreme_weather | severe_storm | network_fault
//   sla_breach     → ALL tiers
//
// Mounted at /api/ipp-force-majeure-chain.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  ForceMajeureStatus,
  ForceMajeureAction,
  FmEventCategory,
  deriveFmChainSla,
  FM_CHAIN_HARD_TERMINALS,
  FM_CHAIN_VALID_TRANSITIONS,
  FM_CHAIN_STATE_TRANSITIONS,
  fmChainCrossesIntoRegulator,
  fmChainSlaBreachCrossesIntoRegulator,
} from '../utils/ipp-force-majeure-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer', 'offtaker', 'regulator'];

// ─── SLA sweep (exported — called by cron) ───────────────────────────────────

export async function ippForceMajeureSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ swept: number }> {
  const now = new Date().toISOString();
  const terminalList = [...FM_CHAIN_HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, fm_category FROM oe_ipp_force_majeure_chain
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...FM_CHAIN_HARD_TERMINALS, now)
    .all<{ id: string; fm_category: FmEventCategory }>();

  const rows = breaches.results ?? [];

  for (const row of rows) {
    const reportable = fmChainSlaBreachCrossesIntoRegulator(row.fm_category);

    await env.DB
      .prepare(
        `UPDATE oe_ipp_force_majeure_chain
         SET sla_breached = 1,
             regulator_notified = CASE WHEN ? = 1 THEN 1 ELSE regulator_notified END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    if (reportable) {
      await env.DB
        .prepare(
          `INSERT INTO regulator_inbox
             (id, category, priority, subject, body, source_table, source_id, source_event, participant_id, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          `ri_fmc_sla_${row.id}_${Date.now()}`,
          'force_majeure',
          'high',
          `Force Majeure SLA Breach — ${row.id}`,
          `SLA deadline exceeded for force majeure event ${row.id} (category: ${row.fm_category}). Immediate review required under ERA 4/2006 s34.`,
          'oe_ipp_force_majeure_chain',
          row.id,
          'fm_evt_sla_breach',
          'system',
          now,
        )
        .run();
    }

    await fireCascade({
      event: 'fm_evt_sla_breach' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_force_majeure',
      entity_id: row.id,
      data: {
        fm_category: row.fm_category,
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
    fm_category,
    ppa_id,
    page = '1',
    per_page = '50',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const pageNum = Math.max(1, parseInt(page) || 1);
  const off     = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  // Non-admin/regulator sees only their own records
  if (!['admin', 'regulator'].includes(user.role)) {
    clauses.push('actor_id = ?');
    binds.push(user.id);
  }

  if (status)      { clauses.push('chain_status = ?');  binds.push(status); }
  if (fm_category) { clauses.push('fm_category = ?');   binds.push(fm_category); }
  if (ppa_id)      { clauses.push('ppa_id = ?');        binds.push(ppa_id); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...FM_CHAIN_HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT id, ppa_id, fm_category, chain_status, affected_capacity_mw,
                relief_amount_zar, actor_id, created_at
         FROM oe_ipp_force_majeure_chain ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_force_majeure_chain ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active_events,
           COALESCE(SUM(relief_amount_zar), 0)                                            as relief_claimed_zar,
           ROUND(AVG(
             CASE WHEN fm_end_date IS NOT NULL AND fm_start_date IS NOT NULL
               THEN CAST((julianday(fm_end_date) - julianday(fm_start_date)) AS REAL)
               ELSE NULL END
           ), 2)                                                                           as avg_duration_days,
           SUM(CASE WHEN chain_status = 'disputed' THEN 1 ELSE 0 END)                    as disputed_count
         FROM oe_ipp_force_majeure_chain ${where}`,
      )
      .bind(...[...FM_CHAIN_HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  const total = totalRow?.n ?? 0;

  return c.json({
    success: true,
    data: rows.results ?? [],
    kpis: kpis ?? {},
    pagination: {
      page: pageNum,
      per_page: perPage,
      total,
      total_pages: Math.ceil(total / perPage),
    },
  });
});

// ─── GET /:id — single record + timeline ─────────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_force_majeure_chain WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'regulator'].includes(user.role) &&
    row.actor_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'ipp_force_majeure' AND entity_id = ?
       ORDER BY created_at ASC LIMIT 50`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, timeline: timeline.results ?? [] },
  });
});

// ─── POST / — submit a new FM notification ───────────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    ppa_id: string;
    fm_category: FmEventCategory;
    affected_capacity_mw: number;
    notice_date: string;
    fm_start_date?: string | null;
    fm_end_date?: string | null;
    relief_amount_zar?: number | null;
    quantum_basis?: string | null;
    reason?: string | null;
  }>();

  if (!body.ppa_id || !body.fm_category || body.affected_capacity_mw == null || !body.notice_date) {
    return c.json(
      {
        success: false,
        error: 'ppa_id, fm_category, affected_capacity_mw, and notice_date are required',
      },
      400,
    );
  }

  const validCategories: FmEventCategory[] = [
    'extreme_weather', 'severe_storm', 'network_fault', 'regulatory_action', 'general',
  ];
  if (!validCategories.includes(body.fm_category)) {
    return c.json(
      { success: false, error: `fm_category must be one of: ${validCategories.join(', ')}` },
      400,
    );
  }

  const now      = new Date();
  const nowIso   = now.toISOString();
  const id       = `fmc-${crypto.randomUUID()}`;
  const slaDays  = deriveFmChainSla(body.fm_category);
  const slaDeadline = new Date(now.getTime() + slaDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_force_majeure_chain
         (id, ppa_id, fm_category, affected_capacity_mw, notice_date,
          fm_start_date, fm_end_date, relief_amount_zar, quantum_basis,
          chain_status, sla_deadline, sla_breached, regulator_notified,
          actor_id, reason, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,'fm_submitted',?,0,0,?,?,?,?)`,
    )
    .bind(
      id,
      body.ppa_id,
      body.fm_category,
      body.affected_capacity_mw,
      body.notice_date,
      body.fm_start_date ?? null,
      body.fm_end_date   ?? null,
      body.relief_amount_zar ?? null,
      body.quantum_basis ?? null,
      slaDeadline,
      user.id,
      body.reason ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'fm_evt_submitted' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_force_majeure',
    entity_id: id,
    data: {
      ppa_id: body.ppa_id,
      fm_category: body.fm_category,
      affected_capacity_mw: body.affected_capacity_mw,
      notice_date: body.notice_date,
      sla_deadline: slaDeadline,
    },
    env: c.env,
  });

  return c.json(
    { success: true, data: { id, fm_category: body.fm_category, sla_deadline: slaDeadline } },
    201,
  );
});

// ─── POST /:id/action — state machine transition ──────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: ForceMajeureAction;
    reason?: string | null;
    actor_id?: string | null;
    fm_end_date?: string | null;
    relief_amount_zar?: number | null;
    quantum_basis?: string | null;
  }>();

  if (!body.action) {
    return c.json({ success: false, error: 'action is required' }, 400);
  }

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_force_majeure_chain WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'regulator'].includes(user.role) &&
    row.actor_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as ForceMajeureStatus;

  if (FM_CHAIN_HARD_TERMINALS.has(current)) {
    return c.json(
      {
        success: false,
        error: `Status '${current}' is terminal — no further transitions allowed`,
      },
      400,
    );
  }

  const action = body.action as ForceMajeureAction;
  const rule   = FM_CHAIN_VALID_TRANSITIONS[action];
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

  const nextStatus = FM_CHAIN_STATE_TRANSITIONS[action];
  const category   = row.fm_category as FmEventCategory;
  const now        = new Date();
  const nowIso     = now.toISOString();

  const reportable      = fmChainCrossesIntoRegulator(action, category);
  const alreadyBreached = (row.sla_breached as number) === 1;
  const slaDeadline     = row.sla_deadline as string | null;
  let slaBreached       = alreadyBreached ? 1 : 0;
  let regulatorNotified = (row.regulator_notified as number) === 1 ? 1 : (reportable ? 1 : 0);

  if (slaDeadline && !alreadyBreached && nowIso > slaDeadline) {
    slaBreached = 1;
    if (fmChainSlaBreachCrossesIntoRegulator(category)) {
      regulatorNotified = 1;
    }
  }

  // Collect optional field updates
  const extraSets: string[]   = [];
  const extraVals: unknown[]  = [];

  if (body.fm_end_date != null)       { extraSets.push('fm_end_date = ?');       extraVals.push(body.fm_end_date); }
  if (body.relief_amount_zar != null) { extraSets.push('relief_amount_zar = ?'); extraVals.push(body.relief_amount_zar); }
  if (body.quantum_basis != null)     { extraSets.push('quantum_basis = ?');     extraVals.push(body.quantum_basis); }

  const extraClause = extraSets.length ? `, ${extraSets.join(', ')}` : '';

  await c.env.DB
    .prepare(
      `UPDATE oe_ipp_force_majeure_chain
       SET chain_status = ?,
           reason = ?,
           actor_id = ?,
           sla_breached = ?,
           regulator_notified = ?,
           updated_at = ?
           ${extraClause}
       WHERE id = ?`,
    )
    .bind(
      nextStatus,
      body.reason ?? null,
      user.id,
      slaBreached,
      regulatorNotified,
      nowIso,
      ...extraVals,
      id,
    )
    .run();

  if (reportable) {
    const priority =
      category === 'extreme_weather' || category === 'severe_storm' ? 'critical' :
      category === 'network_fault'   ? 'high' : 'medium';

    await c.env.DB
      .prepare(
        `INSERT INTO regulator_inbox
           (id, category, priority, subject, body, source_table, source_id, source_event, participant_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        `ri_fmc_${action}_${id}_${Date.now()}`,
        'force_majeure',
        priority,
        `Force Majeure ${action.replace(/_/g, ' ')} — PPA ${row.ppa_id ?? id}`,
        `Force majeure event ${id} (PPA: ${row.ppa_id ?? '—'}, category: ${category}) transitioned to '${nextStatus}' via action '${action}'. ${body.reason ?? ''}`.trim(),
        'oe_ipp_force_majeure_chain',
        id,
        `fm_evt_${action}`,
        user.id,
        nowIso,
      )
      .run();
  }

  await fireCascade({
    event: `fm_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_force_majeure',
    entity_id: id,
    data: {
      action,
      from_status: current,
      to_status: nextStatus,
      reason: body.reason ?? null,
      fm_category: category,
      ppa_id: row.ppa_id,
      affected_capacity_mw: row.affected_capacity_mw,
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

  const result = await ippForceMajeureSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export const ippForceMajeureRoutes = router;
export default router;
