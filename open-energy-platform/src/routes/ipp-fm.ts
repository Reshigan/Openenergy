// ═══════════════════════════════════════════════════════════════════════════
// Wave 158 — IPP Force Majeure Declaration & Relief chain (P6)
//
// REIPPPP PPA Schedule 6 (FM notice & relief), ERA §35 (obligation relief),
// FIDIC Sub-Clause 19 (FM consequences), NERSA Grid Code §CSC-1 (grid-driven FM).
//
// Mounted at /api/ipp-fm.
//
// URGENT SLA: larger lost-generation quantum → tighter resolution window.
// WRITE: admin | ipp_developer
//
// Signature reportability:
//   grant_relief      → EVERY tier
//   dispute_claim     → significant + major + material
//   declare_prolonged → EVERY tier
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type FmStatus,
  type FmAction,
  type FmTier,
  type FmCategory,
  deriveFmTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  SLA_DAYS,
} from '../utils/ipp-fm-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ──────────────────────────────────────────────────────────────

export async function ippFmSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, fm_tier FROM oe_ipp_fm
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; fm_tier: FmTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_fm SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_fm.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_fm',
      entity_id: row.id,
      data: {
        fm_tier: row.fm_tier,
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.fm_tier),
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
    fm_category,
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
  if (project_id)   { clauses.push('project_id = ?');   binds.push(project_id); }
  if (status)       { clauses.push('chain_status = ?'); binds.push(status); }
  if (tier)         { clauses.push('fm_tier = ?');      binds.push(tier); }
  if (fm_category)  { clauses.push('fm_category = ?');  binds.push(fm_category); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_fm ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_fm ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status = 'fm_resolved' THEN 1 ELSE 0 END) as resolved_count,
           SUM(CASE WHEN chain_status IN ('fm_disputed','fm_arbitration','fm_arbitration_determined') THEN 1 ELSE 0 END) as disputed_count,
           SUM(CASE WHEN chain_status = 'fm_prolonged_termination' THEN 1 ELSE 0 END) as prolonged_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
           SUM(CASE WHEN chain_status = 'fm_resolved' THEN lost_generation_mwh ELSE 0 END) as total_lost_mwh
         FROM oe_ipp_fm ${where}`,
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
    .prepare('SELECT * FROM oe_ipp_fm WHERE id = ?')
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
       WHERE entity_type = 'ipp_fm' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — declare a Force Majeure event ──────────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    fm_category: FmCategory;
    lost_generation_mwh: number;
    description?: string;
    event_date?: string;
  }>();

  if (!body.project_id || body.lost_generation_mwh == null || !body.fm_category) {
    return c.json(
      { success: false, error: 'project_id, fm_category, lost_generation_mwh are required' },
      400,
    );
  }

  const tier = deriveFmTier(body.lost_generation_mwh);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_fm_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_fm
         (id, participant_id, project_id, fm_category, lost_generation_mwh, fm_tier,
          description, event_date, chain_status, sla_due_at, sla_breached,
          notice_issued_at, notice_verified_at, relief_granted_at, resolved_at,
          arbitration_determined_at, prolonged_declared_at,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0, NULL,NULL,NULL,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.fm_category,
      body.lost_generation_mwh,
      tier,
      body.description ?? null,
      body.event_date ?? null,
      'fm_event_occurred',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_fm.created',
    actor_id: user.id,
    entity_type: 'ipp_fm',
    entity_id: id,
    data: {
      tier,
      fm_category: body.fm_category,
      lost_generation_mwh: body.lost_generation_mwh,
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
    action: FmAction;
    notes?: string;
    reason?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_fm WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as FmStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.fm_tier as FmTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (stays on current status, sets sla_breached=1).
  type AnyAction = FmAction;
  const ACTION_STATE_MAP: Record<AnyAction, FmStatus> = {
    issue_fm_notice:       'fm_notice_issued',
    verify_notice:         'fm_notice_verified',
    grant_relief:          'fm_relief_in_progress',
    commence_monitoring:   'fm_monitoring',
    resolve_event:         'fm_resolved',
    dispute_claim:         'fm_disputed',
    commence_arbitration:  'fm_arbitration',
    determine_arbitration: 'fm_arbitration_determined',
    declare_prolonged:     'fm_prolonged_termination',
    withdraw_claim:        'withdrawn',
    flag_sla_breach:       current,  // self-loop
  };

  const nextSt = ACTION_STATE_MAP[body.action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${body.action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current && body.action !== 'flag_sla_breach') {
    const rule = VALID_TRANSITIONS[body.action];
    if (!rule || !rule.from.includes(current)) {
      return c.json(
        { success: false, error: `Cannot transition '${current}' → '${body.action}'` },
        409,
      );
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const extraCols: Record<string, unknown> = {};

  if (body.action === 'issue_fm_notice')       extraCols.notice_issued_at = nowIso;
  if (body.action === 'verify_notice')         extraCols.notice_verified_at = nowIso;
  if (body.action === 'grant_relief')          extraCols.relief_granted_at = nowIso;
  if (body.action === 'resolve_event')         extraCols.resolved_at = nowIso;
  if (body.action === 'determine_arbitration') extraCols.arbitration_determined_at = nowIso;
  if (body.action === 'declare_prolonged')     extraCols.prolonged_declared_at = nowIso;
  if (body.action === 'flag_sla_breach')       extraCols.sla_breached = 1;

  // Recompute SLA deadline for new non-terminal states; self-loops preserve existing SLA.
  let slaAt: string | null = null;
  if (nextSt !== current && !HARD_TERMINALS.has(nextSt)) {
    const slaDays = SLA_DAYS[tier] ?? 0;
    if (slaDays > 0) {
      slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();
    }
  } else if (nextSt === current) {
    // Self-loop: keep existing sla_due_at by not updating it.
    // We'll omit sla_due_at from the SET clause.
    slaAt = row.sla_due_at as string | null;
  }

  const isSelfLoop = nextSt === current;
  const reportable = body.action !== 'flag_sla_breach'
    ? crossesIntoRegulator(body.action as FmAction, tier)
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
    .prepare(`UPDATE oe_ipp_fm SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `fm_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_fm',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      fm_category: row.fm_category,
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
