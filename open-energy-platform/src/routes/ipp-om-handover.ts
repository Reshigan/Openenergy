// W149 — IPP O&M Handover Pack & H&S File
// OHSA §8 + IEC 62446-1 + NERSA Grid Code §C-5
// GET  /api/ipp-om-handover        — list + KPIs
// GET  /api/ipp-om-handover/:id    — detail + audit trail
// POST /api/ipp-om-handover        — create handover pack
// PUT  /api/ipp-om-handover/:id/action — state transition

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type HandoverStatus,
  type HandoverAction,
  type HandoverTier,
  deriveCapacityTier,
  crossesIntoRegulator,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  SLA_DAYS,
} from '../utils/ipp-om-handover-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

export async function ippOmHandoverSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const breaches = await env.DB
    .prepare(`SELECT id, capacity_tier FROM oe_ipp_om_handover
              WHERE sla_due_at IS NOT NULL AND sla_breached = 0
                AND chain_status NOT IN ('accepted','rejected','superseded','archived','withdrawn')
                AND sla_due_at <= ?`)
    .bind(now)
    .all<{ id: string; capacity_tier: string }>();
  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_om_handover SET sla_breached=1, updated_at=? WHERE id=?`)
      .bind(now, row.id).run();
    await fireCascade({ event: 'ipp_omh.sla_breached', actor_id: 'system',
      entity_type: 'ipp_om_handover', entity_id: row.id,
      data: { capacity_tier: row.capacity_tier }, env });
  }
}

// ── GET / ──────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const env = c.env;
  const { project_id, status, tier, page = '1', per_page = '50' } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(per_page);

  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?'); binds.push(user.id);
  }
  if (project_id) { clauses.push('project_id = ?'); binds.push(project_id); }
  if (status) { clauses.push('chain_status = ?'); binds.push(status); }
  if (tier) { clauses.push('capacity_tier = ?'); binds.push(tier); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [rows, total, kpis] = await Promise.all([
    env.DB.prepare(`SELECT * FROM oe_ipp_om_handover ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, parseInt(per_page), offset).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) as n FROM oe_ipp_om_handover ${where}`)
      .bind(...binds).first<{ n: number }>(),
    env.DB.prepare(`SELECT
        COUNT(*) as total,
        SUM(CASE WHEN chain_status NOT IN ('accepted','rejected','superseded','archived','withdrawn') THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN chain_status = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
        SUM(CASE WHEN chain_status = 'conditional_acceptance' THEN 1 ELSE 0 END) as conditional_count,
        SUM(CASE WHEN chain_status = 'deficiencies_raised' THEN 1 ELSE 0 END) as deficiencies_count,
        SUM(CASE WHEN chain_status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count
      FROM oe_ipp_om_handover ${where}`)
      .bind(...binds).first<Record<string, unknown>>(),
  ]);

  return c.json({ success: true, data: {
    items: rows.results ?? [],
    pagination: { page: parseInt(page), per_page: parseInt(per_page), total: total?.n ?? 0 },
    kpis,
  }});
});

// ── GET /:id ───────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_om_handover WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support', 'regulator'].includes(user.role) && row.participant_id !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const audit = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type='ipp_om_handover' AND entity_id=? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();
  return c.json({ success: true, data: { ...row, audit_trail: audit.results ?? [] } });
});

// ── POST / ────────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const env = c.env;

  const body = await c.req.json<{
    project_id: string;
    capacity_mw: number;
    category: string;
    title: string;
    document_count?: number;
    description?: string;
  }>();

  if (!body.project_id || body.capacity_mw == null || !body.category || !body.title) {
    return c.json({ error: 'project_id, capacity_mw, category, title required' }, 400);
  }

  const tier = deriveCapacityTier(body.capacity_mw);
  const slaAt = new Date(Date.now() + SLA_DAYS[tier] * 24 * 3_600_000).toISOString();
  const now = new Date().toISOString();
  const id = `ippomh_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  await env.DB
    .prepare(`INSERT INTO oe_ipp_om_handover
        (id, participant_id, project_id, capacity_mw, capacity_tier, category,
         title, document_count, description,
         chain_status, sla_due_at, sla_breached, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'compilation',?,0,?,?)`)
    .bind(id, user.id, body.project_id, body.capacity_mw, tier, body.category,
      body.title, body.document_count ?? null, body.description ?? null,
      slaAt, now, now)
    .run();

  await fireCascade({ event: 'ipp_omh.created', actor_id: user.id,
    entity_type: 'ipp_om_handover', entity_id: id,
    data: { tier, capacity_mw: body.capacity_mw, category: body.category }, env });

  return c.json({ success: true, data: { id, tier } }, 201);
});

// ── PUT /:id/action ────────────────────────────────────────────────────────────
app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const env = c.env;

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: HandoverAction;
    reason?: string;
    deficiency_count?: number;
    conditions?: string;
  }>();

  const row = await env.DB
    .prepare('SELECT * FROM oe_ipp_om_handover WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support'].includes(user.role) && row.participant_id !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as HandoverStatus;
  if (HARD_TERMINALS.includes(current)) return c.json({ error: `Status ${current} is terminal` }, 409);

  const ACTION_STATE_MAP: Partial<Record<HandoverAction, HandoverStatus>> = {
    submit_for_internal_review: 'internal_review',
    approve_internal:           'submitted_to_om',
    submit_to_om:               'om_review',
    raise_deficiencies:         'deficiencies_raised',
    resolve_deficiencies:       'deficiencies_resolved',
    accept_handover:            'accepted',
    conditionally_accept:       'conditional_acceptance',
    reject_handover:            'rejected',
    supersede:                  'superseded',
    archive:                    'archived',
    withdraw:                   'withdrawn',
    flag_sla_breach:            current,
  };

  const nextStatus = ACTION_STATE_MAP[body.action];
  if (!nextStatus) return c.json({ error: `Unknown action: ${body.action}` }, 400);
  if (nextStatus !== current && !VALID_TRANSITIONS[current]?.includes(nextStatus)) {
    return c.json({ error: `Cannot transition ${current} → ${nextStatus}` }, 409);
  }

  const now = new Date().toISOString();
  const tier = row.capacity_tier as HandoverTier;
  const extraCols: Record<string, unknown> = {};

  if (body.action === 'submit_for_internal_review') extraCols.internal_review_at = now;
  if (body.action === 'approve_internal') extraCols.approved_internal_at = now;
  if (body.action === 'submit_to_om') extraCols.submitted_to_om_at = now;
  if (body.action === 'raise_deficiencies') {
    extraCols.deficiencies_raised_at = now;
    if (body.deficiency_count != null) extraCols.deficiency_count = body.deficiency_count;
  }
  if (body.action === 'resolve_deficiencies') extraCols.deficiencies_resolved_at = now;
  if (body.action === 'accept_handover') extraCols.accepted_at = now;
  if (body.action === 'conditionally_accept') {
    extraCols.conditional_at = now;
    if (body.conditions) extraCols.conditions = body.conditions;
  }
  if (body.action === 'reject_handover') extraCols.rejected_at = now;
  if (body.action === 'flag_sla_breach') extraCols.sla_breached = 1;

  const setCols = ['chain_status = ?', 'updated_at = ?', ...Object.keys(extraCols).map(k => `${k} = ?`)];
  await env.DB
    .prepare(`UPDATE oe_ipp_om_handover SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(nextStatus, now, ...Object.values(extraCols), id).run();

  const reportable = crossesIntoRegulator(body.action, tier);
  await fireCascade({ event: `ipp_omh.${body.action}` as never, actor_id: user.id,
    entity_type: 'ipp_om_handover', entity_id: id,
    data: { from: current, to: nextStatus, reason: body.reason, tier, is_reportable: reportable }, env });

  return c.json({ success: true, data: { id, status: nextStatus, is_reportable: reportable } });
});

export default app;
