// W152 — IPP Commissioning Test Protocol & Performance Certificate
// IEC 61724-1 + NERSA Grid Code §C-5 + REIPPPP Schedule 12; PAC/FAC framework
import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type CommissioningStatus, type CommissioningAction, type CapacityTier,
  deriveCapacityTier, crossesIntoRegulator, HARD_TERMINALS, VALID_TRANSITIONS, SLA_DAYS,
} from '../utils/ipp-commissioning-test-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);
const WRITE_ROLES = ['admin', 'ipp_developer'];

export async function ippCommissioningTestSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const breaches = await env.DB
    .prepare(`SELECT id, capacity_tier FROM oe_ipp_commissioning_test
              WHERE sla_due_at IS NOT NULL AND sla_breached = 0
                AND chain_status NOT IN ('performance_cert_issued','test_failed','withdrawn')
                AND sla_due_at <= ?`)
    .bind(now).all<{ id: string; capacity_tier: string }>();
  for (const row of breaches.results ?? []) {
    await env.DB.prepare(`UPDATE oe_ipp_commissioning_test SET sla_breached=1, updated_at=? WHERE id=?`)
      .bind(now, row.id).run();
    await fireCascade({ event: 'ipp_ct.sla_breached', actor_id: 'system',
      entity_type: 'ipp_commissioning_test', entity_id: row.id,
      data: { capacity_tier: row.capacity_tier }, env });
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const { project_id, status, tier, page = '1', per_page = '50' } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(per_page);
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (!['admin', 'support', 'regulator'].includes(user.role)) { clauses.push('participant_id = ?'); binds.push(user.id); }
  if (project_id) { clauses.push('project_id = ?'); binds.push(project_id); }
  if (status) { clauses.push('chain_status = ?'); binds.push(status); }
  if (tier) { clauses.push('capacity_tier = ?'); binds.push(tier); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows, total, kpis] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM oe_ipp_commissioning_test ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, parseInt(per_page), offset).all<Record<string, unknown>>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM oe_ipp_commissioning_test ${where}`).bind(...binds).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as total,
        SUM(CASE WHEN chain_status NOT IN ('performance_cert_issued','test_failed','withdrawn') THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN chain_status='performance_cert_issued' THEN 1 ELSE 0 END) as certified_count,
        SUM(CASE WHEN chain_status='pac_issued' THEN 1 ELSE 0 END) as pac_count,
        SUM(CASE WHEN chain_status IN ('punch_list_issued') THEN 1 ELSE 0 END) as punch_list_count,
        SUM(CASE WHEN chain_status='test_failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN sla_breached=1 THEN 1 ELSE 0 END) as breached_count
      FROM oe_ipp_commissioning_test ${where}`).bind(...binds).first<Record<string, unknown>>(),
  ]);
  return c.json({ success: true, data: { items: rows.results ?? [], pagination: { page: parseInt(page), per_page: parseInt(per_page), total: total?.n ?? 0 }, kpis } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_commissioning_test WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support', 'regulator'].includes(user.role) && row.participant_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  const audit = await c.env.DB.prepare(`SELECT * FROM audit_events WHERE entity_type='ipp_commissioning_test' AND entity_id=? ORDER BY created_at ASC`).bind(id).all<Record<string, unknown>>();
  return c.json({ success: true, data: { ...row, audit_trail: audit.results ?? [] } });
});

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{
    project_id: string;
    capacity_mw: number;
    test_category?: string;
    contractor_firm?: string;
    ie_firm?: string;
    description?: string;
  }>();
  if (!body.project_id || body.capacity_mw == null) return c.json({ error: 'project_id, capacity_mw required' }, 400);
  const tier = deriveCapacityTier(body.capacity_mw);
  const now = new Date().toISOString();
  const id = `ippct_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const slaAt = new Date(Date.now() + SLA_DAYS[tier] * 24 * 3_600_000).toISOString();
  await c.env.DB.prepare(`INSERT INTO oe_ipp_commissioning_test
      (id,participant_id,project_id,capacity_mw,capacity_tier,test_category,contractor_firm,ie_firm,description,chain_status,sla_due_at,sla_breached,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'test_plan_submitted',?,0,?,?)`)
    .bind(id, user.id, body.project_id, body.capacity_mw, tier,
      body.test_category ?? null, body.contractor_firm ?? null, body.ie_firm ?? null,
      body.description ?? null, slaAt, now, now).run();
  await fireCascade({ event: 'ipp_ct.created', actor_id: user.id, entity_type: 'ipp_commissioning_test', entity_id: id, data: { tier, capacity_mw: body.capacity_mw }, env: c.env });
  return c.json({ success: true, data: { id, tier } }, 201);
});

app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const { id } = c.req.param();
  const body = await c.req.json<{ action: CommissioningAction; reason?: string; cert_reference?: string }>();
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_commissioning_test WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support'].includes(user.role) && row.participant_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  const current = row.chain_status as CommissioningStatus;
  if (HARD_TERMINALS.includes(current)) return c.json({ error: `Status ${current} is terminal` }, 409);

  const ACTION_STATE_MAP: Partial<Record<CommissioningAction, CommissioningStatus>> = {
    commence_witness_inspection:   'witness_inspection',
    open_hold_point:               'hold_point_open',
    clear_hold_point:              'hold_point_cleared',
    start_performance_test:        'performance_test_running',
    issue_punch_list:              'punch_list_issued',
    clear_punch_list:              'punch_list_cleared',
    recommend_pac:                 'pac_recommended',
    issue_pac:                     'pac_issued',
    start_post_pac_test:           'performance_test_running_post_pac',
    recommend_fac:                 'fac_recommended',
    issue_performance_cert:        'performance_cert_issued',
    declare_test_failure:          'test_failed',
    withdraw:                      'withdrawn',
    flag_sla_breach:               current,
  };

  const nextStatus = ACTION_STATE_MAP[body.action];
  if (!nextStatus) return c.json({ error: `Unknown action: ${body.action}` }, 400);
  if (nextStatus !== current && !VALID_TRANSITIONS[current]?.includes(nextStatus)) return c.json({ error: `Cannot transition ${current} → ${nextStatus}` }, 409);

  const now = new Date().toISOString();
  const tier = row.capacity_tier as CapacityTier;
  const extraCols: Record<string, unknown> = {};
  if (body.action === 'commence_witness_inspection') extraCols.witness_inspection_at = now;
  if (body.action === 'open_hold_point') extraCols.hold_point_opened_at = now;
  if (body.action === 'clear_hold_point') extraCols.hold_point_cleared_at = now;
  if (body.action === 'start_performance_test') extraCols.performance_test_started_at = now;
  if (body.action === 'issue_punch_list') extraCols.punch_list_issued_at = now;
  if (body.action === 'clear_punch_list') extraCols.punch_list_cleared_at = now;
  if (body.action === 'issue_pac') extraCols.pac_issued_at = now;
  if (body.action === 'issue_performance_cert') {
    extraCols.performance_cert_issued_at = now;
    if (body.cert_reference) extraCols.cert_reference = body.cert_reference;
  }
  if (body.action === 'declare_test_failure') extraCols.test_failed_at = now;
  if (body.action === 'flag_sla_breach') extraCols.sla_breached = 1;

  const setCols = ['chain_status = ?', 'updated_at = ?', ...Object.keys(extraCols).map(k => `${k} = ?`)];
  await c.env.DB.prepare(`UPDATE oe_ipp_commissioning_test SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(nextStatus, now, ...Object.values(extraCols), id).run();

  const reportable = crossesIntoRegulator(body.action, tier);
  await fireCascade({ event: `ipp_ct.${body.action}` as never, actor_id: user.id, entity_type: 'ipp_commissioning_test', entity_id: id, data: { from: current, to: nextStatus, reason: body.reason, tier, is_reportable: reportable }, env: c.env });
  return c.json({ success: true, data: { id, status: nextStatus, is_reportable: reportable } });
});

export default app;
