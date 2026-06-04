// W151 — IPP Environmental Compliance Closure & NEMA Closure Certificate
// NEMA 107/1998 §24G + EIA Regulations 2014 (GN R982) + DFFE
import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type EnvClosureStatus, type EnvClosureAction, type AreaTier,
  deriveAreaTier, crossesIntoRegulator, HARD_TERMINALS, VALID_TRANSITIONS, SLA_DAYS,
} from '../utils/ipp-env-closure-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);
const WRITE_ROLES = ['admin', 'ipp_developer'];

export async function ippEnvClosureSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const breaches = await env.DB
    .prepare(`SELECT id, area_tier FROM oe_ipp_env_closure
              WHERE sla_due_at IS NOT NULL AND sla_breached = 0
                AND chain_status NOT IN ('closure_issued','rejected','withdrawn')
                AND sla_due_at <= ?`)
    .bind(now).all<{ id: string; area_tier: string }>();
  for (const row of breaches.results ?? []) {
    await env.DB.prepare(`UPDATE oe_ipp_env_closure SET sla_breached=1, updated_at=? WHERE id=?`)
      .bind(now, row.id).run();
    await fireCascade({ event: 'ipp_ec.sla_breached', actor_id: 'system',
      entity_type: 'ipp_env_closure', entity_id: row.id,
      data: { area_tier: row.area_tier }, env });
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
  if (tier) { clauses.push('area_tier = ?'); binds.push(tier); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows, total, kpis] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM oe_ipp_env_closure ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, parseInt(per_page), offset).all<Record<string, unknown>>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM oe_ipp_env_closure ${where}`).bind(...binds).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as total,
        SUM(CASE WHEN chain_status NOT IN ('closure_issued','rejected','withdrawn') THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN chain_status='closure_issued' THEN 1 ELSE 0 END) as issued_count,
        SUM(CASE WHEN chain_status='remediation_required' THEN 1 ELSE 0 END) as remediation_count,
        SUM(CASE WHEN chain_status='rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN chain_status='nema_review' THEN 1 ELSE 0 END) as nema_review_count,
        SUM(CASE WHEN sla_breached=1 THEN 1 ELSE 0 END) as breached_count
      FROM oe_ipp_env_closure ${where}`).bind(...binds).first<Record<string, unknown>>(),
  ]);
  return c.json({ success: true, data: { items: rows.results ?? [], pagination: { page: parseInt(page), per_page: parseInt(per_page), total: total?.n ?? 0 }, kpis } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_env_closure WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support', 'regulator'].includes(user.role) && row.participant_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  const audit = await c.env.DB.prepare(`SELECT * FROM audit_events WHERE entity_type='ipp_env_closure' AND entity_id=? ORDER BY created_at ASC`).bind(id).all<Record<string, unknown>>();
  return c.json({ success: true, data: { ...row, audit_trail: audit.results ?? [] } });
});

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{
    project_id: string;
    disturbed_area_ha: number;
    eia_category?: string;
    ea_reference?: string;
    emp_reference?: string;
    auditor_firm?: string;
    description?: string;
  }>();
  if (!body.project_id || body.disturbed_area_ha == null) return c.json({ error: 'project_id, disturbed_area_ha required' }, 400);
  const tier = deriveAreaTier(body.disturbed_area_ha);
  const now = new Date().toISOString();
  const id = `ippec_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const slaAt = new Date(Date.now() + SLA_DAYS[tier] * 24 * 3_600_000).toISOString();
  await c.env.DB.prepare(`INSERT INTO oe_ipp_env_closure
      (id,participant_id,project_id,disturbed_area_ha,area_tier,eia_category,ea_reference,emp_reference,auditor_firm,description,chain_status,sla_due_at,sla_breached,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'emp_audit_initiated',?,0,?,?)`)
    .bind(id, user.id, body.project_id, body.disturbed_area_ha, tier,
      body.eia_category ?? null, body.ea_reference ?? null, body.emp_reference ?? null,
      body.auditor_firm ?? null, body.description ?? null, slaAt, now, now).run();
  await fireCascade({ event: 'ipp_ec.created', actor_id: user.id, entity_type: 'ipp_env_closure', entity_id: id, data: { tier, disturbed_area_ha: body.disturbed_area_ha }, env: c.env });
  return c.json({ success: true, data: { id, tier } }, 201);
});

app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const { id } = c.req.param();
  const body = await c.req.json<{ action: EnvClosureAction; reason?: string; cert_reference?: string }>();
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_env_closure WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support'].includes(user.role) && row.participant_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  const current = row.chain_status as EnvClosureStatus;
  if (HARD_TERMINALS.includes(current)) return c.json({ error: `Status ${current} is terminal` }, 409);

  const ACTION_STATE_MAP: Partial<Record<EnvClosureAction, EnvClosureStatus>> = {
    commence_inspection:          'site_inspection',
    draft_report:                 'audit_report_drafted',
    commence_stakeholder_review:  'stakeholder_review',
    raise_remediation:            'remediation_required',
    confirm_remediation:          'remediation_complete',
    recommend_closure:            'closure_recommended',
    submit_to_nema:               'nema_submission',
    nema_commence_review:         'nema_review',
    issue_closure_cert:           'closure_issued',
    reject_application:           'rejected',
    withdraw:                     'withdrawn',
    flag_sla_breach:              current,
  };

  const nextStatus = ACTION_STATE_MAP[body.action];
  if (!nextStatus) return c.json({ error: `Unknown action: ${body.action}` }, 400);
  if (nextStatus !== current && !VALID_TRANSITIONS[current]?.includes(nextStatus)) return c.json({ error: `Cannot transition ${current} → ${nextStatus}` }, 409);

  const now = new Date().toISOString();
  const tier = row.area_tier as AreaTier;
  const extraCols: Record<string, unknown> = {};
  if (body.action === 'commence_inspection') extraCols.inspection_started_at = now;
  if (body.action === 'draft_report') extraCols.audit_report_at = now;
  if (body.action === 'commence_stakeholder_review') extraCols.stakeholder_review_at = now;
  if (body.action === 'raise_remediation') extraCols.remediation_required_at = now;
  if (body.action === 'confirm_remediation') extraCols.remediation_complete_at = now;
  if (body.action === 'recommend_closure') extraCols.closure_recommended_at = now;
  if (body.action === 'submit_to_nema') extraCols.nema_submitted_at = now;
  if (body.action === 'nema_commence_review') extraCols.nema_review_at = now;
  if (body.action === 'issue_closure_cert') {
    extraCols.closure_issued_at = now;
    if (body.cert_reference) extraCols.closure_cert_reference = body.cert_reference;
  }
  if (body.action === 'reject_application') extraCols.rejected_at = now;
  if (body.action === 'withdraw') extraCols.withdrawn_at = now;
  if (body.action === 'flag_sla_breach') extraCols.sla_breached = 1;

  const setCols = ['chain_status = ?', 'updated_at = ?', ...Object.keys(extraCols).map(k => `${k} = ?`)];
  await c.env.DB.prepare(`UPDATE oe_ipp_env_closure SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(nextStatus, now, ...Object.values(extraCols), id).run();

  const reportable = crossesIntoRegulator(body.action, tier);
  await fireCascade({ event: `ipp_ec.${body.action}` as never, actor_id: user.id, entity_type: 'ipp_env_closure', entity_id: id, data: { from: current, to: nextStatus, reason: body.reason, tier, is_reportable: reportable }, env: c.env });
  return c.json({ success: true, data: { id, status: nextStatus, is_reportable: reportable } });
});

export default app;
