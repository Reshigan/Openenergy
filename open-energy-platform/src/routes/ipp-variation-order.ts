// W146 — IPP Variation Order Management
// JBCC 6.2 Cl.38-39 / NEC4 Cl.60-62
// GET  /api/ipp-variation-order        — list + KPIs
// GET  /api/ipp-variation-order/:id    — detail + audit trail
// POST /api/ipp-variation-order        — create
// PUT  /api/ipp-variation-order/:id/action — state transition

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { badEnum } from '../utils/validation';
import {
  type VariationOrderStatus,
  type VariationOrderAction,
  type ValueTier,
  deriveValueTier,
  crossesIntoRegulator,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  SLA_DAYS,
} from '../utils/ipp-variation-order-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

export async function ippVariationOrderSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const rows = await env.DB
    .prepare(`SELECT id, sla_due_at, chain_status, value_tier FROM oe_ipp_variation_orders
              WHERE sla_due_at IS NOT NULL AND sla_breached = 0
                AND chain_status NOT IN ('paid','rejected','adjudicated','cancelled')
                AND sla_due_at <= ?`)
    .bind(now)
    .all<{ id: string; sla_due_at: string; chain_status: string; value_tier: string }>();

  for (const row of rows.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_variation_orders SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();
    await fireCascade({
      event: 'ipp_vo.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_variation_order',
      entity_id: row.id,
      data: { sla_due_at: row.sla_due_at, chain_status: row.chain_status, value_tier: row.value_tier },
      env,
    });
  }
}

// ── GET / ──────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const env = c.env;
  const { project_id, status, tier, type, page = '1', per_page = '50' } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(per_page);

  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?');
    binds.push(user.id);
  }
  if (project_id) { clauses.push('project_id = ?'); binds.push(project_id); }
  if (status) { clauses.push('chain_status = ?'); binds.push(status); }
  if (tier) { clauses.push('value_tier = ?'); binds.push(tier); }
  if (type) { clauses.push('variation_type = ?'); binds.push(type); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [rows, total, kpis] = await Promise.all([
    env.DB.prepare(`SELECT * FROM oe_ipp_variation_orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, parseInt(per_page), offset)
      .all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) as n FROM oe_ipp_variation_orders ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    env.DB.prepare(`SELECT
        COUNT(*) as total,
        SUM(CASE WHEN chain_status NOT IN ('paid','rejected','adjudicated','cancelled') THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN value_tier IN ('major','material') THEN 1 ELSE 0 END) as high_value_count,
        SUM(CASE WHEN chain_status = 'disputed_pricing' THEN 1 ELSE 0 END) as disputed_count,
        SUM(CASE WHEN chain_status = 'adjudicated' THEN 1 ELSE 0 END) as adjudicated_count,
        SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
        SUM(CASE WHEN chain_status = 'paid' THEN 1 ELSE 0 END) as paid_count,
        COALESCE(SUM(CASE WHEN chain_status = 'paid' THEN agreed_value_zar ELSE 0 END), 0) as total_paid_zar,
        COALESCE(SUM(CASE WHEN chain_status NOT IN ('paid','rejected','adjudicated','cancelled') THEN instructed_value_zar ELSE 0 END), 0) as open_value_zar
      FROM oe_ipp_variation_orders ${where}`)
      .bind(...binds)
      .first<Record<string, unknown>>(),
  ]);

  return c.json({
    success: true,
    data: {
      items: rows.results ?? [],
      pagination: { page: parseInt(page), per_page: parseInt(per_page), total: total?.n ?? 0 },
      kpis,
    },
  });
});

// ── GET /:id ───────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const env = c.env;
  const { id } = c.req.param();

  const row = await env.DB
    .prepare('SELECT * FROM oe_ipp_variation_orders WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support', 'regulator'].includes(user.role) && row.participant_id !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const audit = await env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'ipp_variation_order' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({ success: true, data: { ...row, audit_trail: audit.results ?? [] } });
});

// ── POST / ────────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const env = c.env;

  const body = await c.req.json<{
    project_id: string;
    title: string;
    description: string;
    variation_type: string;
    instructed_value_zar?: number;
    issued_by?: string;
    site_ref?: string;
  }>();

  if (!body.project_id || !body.title || !body.variation_type) {
    return c.json({ error: 'project_id, title, variation_type required' }, 400);
  }

  const enumErr = badEnum('variation_type', body.variation_type, ['scope_change','time_extension','cost_adjustment','design_change','statutory_change','provisional_sum']);
  if (enumErr) return c.json({ error: enumErr }, 400);

  const tier = deriveValueTier(body.instructed_value_zar ?? null);
  const slaHours = SLA_DAYS[tier] * 24;
  const now = new Date().toISOString();
  const slaAt = new Date(Date.now() + slaHours * 3_600_000).toISOString();
  const id = `ippvo_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  await env.DB
    .prepare(`INSERT INTO oe_ipp_variation_orders
        (id, participant_id, project_id, title, description, variation_type, value_tier,
         instructed_value_zar, issued_by, site_ref, chain_status, sla_due_at, sla_breached,
         instructed_at, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'instructed',?,0,?,?,?)`)
    .bind(id, user.id, body.project_id, body.title, body.description ?? '',
      body.variation_type, tier, body.instructed_value_zar ?? null,
      body.issued_by ?? user.id, body.site_ref ?? null, slaAt, now, now, now)
    .run();

  await fireCascade({
    event: 'ipp_vo.instructed',
    actor_id: user.id,
    entity_type: 'ipp_variation_order',
    entity_id: id,
    data: { title: body.title, variation_type: body.variation_type, tier, instructed_value_zar: body.instructed_value_zar },
    env,
  });

  return c.json({ success: true, data: { id } }, 201);
});

// ── PUT /:id/action ────────────────────────────────────────────────────────────
app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const env = c.env;

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: VariationOrderAction;
    reason?: string;
    agreed_value_zar?: number;
    instructed_value_zar?: number;
    quotation_notes?: string;
  }>();

  const row = await env.DB
    .prepare('SELECT * FROM oe_ipp_variation_orders WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support'].includes(user.role) && row.participant_id !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as VariationOrderStatus;
  if (HARD_TERMINALS.includes(current)) {
    return c.json({ error: `Status ${current} is terminal` }, 409);
  }

  const ACTION_STATE_MAP: Partial<Record<VariationOrderAction, VariationOrderStatus>> = {
    acknowledge_instruction:   'acknowledged',
    submit_quotation:          'quotation_submitted',
    review_quotation:          'quotation_reviewed',
    approve_variation:         'approved',
    reject_variation:          'rejected',
    commence_work:             'in_progress',
    complete_work:             'completed_pending_payment',
    certify_payment:           'paid',
    dispute_pricing:           'disputed_pricing',
    resolve_dispute:           'quotation_reviewed',
    refer_adjudication:        'adjudicated',
    cancel_instruction:        'cancelled',
    flag_sla_breach:           current,  // no state change, just marks breach
  };

  const nextStatus = ACTION_STATE_MAP[body.action];
  if (!nextStatus) return c.json({ error: `Unknown action: ${body.action}` }, 400);

  if (nextStatus !== current && !VALID_TRANSITIONS[current]?.includes(nextStatus)) {
    return c.json({ error: `Cannot transition ${current} → ${nextStatus}` }, 409);
  }

  const now = new Date().toISOString();
  const tier = row.value_tier as ValueTier;

  // Timestamp columns per action
  const extraCols: Record<string, unknown> = {};
  if (body.action === 'acknowledge_instruction') extraCols.acknowledged_at = now;
  if (body.action === 'submit_quotation') extraCols.quotation_submitted_at = now;
  if (body.action === 'review_quotation') extraCols.quotation_reviewed_at = now;
  if (body.action === 'approve_variation') {
    extraCols.approved_at = now;
    if (body.agreed_value_zar != null) extraCols.agreed_value_zar = body.agreed_value_zar;
  }
  if (body.action === 'reject_variation') extraCols.rejected_at = now;
  if (body.action === 'complete_work') extraCols.completed_at = now;
  if (body.action === 'certify_payment') extraCols.paid_at = now;
  if (body.action === 'refer_adjudication') extraCols.adjudicated_at = now;
  if (body.action === 'cancel_instruction') extraCols.cancelled_at = now;
  if (body.action === 'flag_sla_breach') extraCols.sla_breached = 1;
  if (body.instructed_value_zar != null) {
    extraCols.instructed_value_zar = body.instructed_value_zar;
    const newTier = deriveValueTier(body.instructed_value_zar);
    if (newTier !== tier) {
      extraCols.value_tier = newTier;
      extraCols.sla_due_at = new Date(Date.now() + SLA_DAYS[newTier] * 24 * 3_600_000).toISOString();
    }
  }
  if (body.quotation_notes) extraCols.quotation_notes = body.quotation_notes;

  const setCols = ['chain_status = ?', 'updated_at = ?', ...Object.keys(extraCols).map(k => `${k} = ?`)];
  await env.DB
    .prepare(`UPDATE oe_ipp_variation_orders SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(nextStatus, now, ...Object.values(extraCols), id)
    .run();

  const reportable = crossesIntoRegulator(body.action, tier);

  await fireCascade({
    event: `ipp_vo.${body.action}`,
    actor_id: user.id,
    entity_type: 'ipp_variation_order',
    entity_id: id,
    data: { from: current, to: nextStatus, reason: body.reason, tier, is_reportable: reportable },
    env,
  });

  return c.json({ success: true, data: { id, status: nextStatus, is_reportable: reportable } });
});

export default app;
