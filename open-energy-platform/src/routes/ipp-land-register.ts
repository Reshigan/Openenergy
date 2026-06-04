// W150 — IPP As-Built Survey & Land Register Update
// Deeds Registries Act 47/1937 + NERSA Grid Code §C-5 + SPLUMA 16/2013
import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type LandRegisterStatus, type LandRegisterAction, type LandTier,
  deriveAreaTier, crossesIntoRegulator, HARD_TERMINALS, VALID_TRANSITIONS, SLA_DAYS,
} from '../utils/ipp-land-register-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);
const WRITE_ROLES = ['admin', 'ipp_developer'];

export async function ippLandRegisterSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const breaches = await env.DB
    .prepare(`SELECT id, area_tier FROM oe_ipp_land_register
              WHERE sla_due_at IS NOT NULL AND sla_breached = 0
                AND chain_status NOT IN ('deeds_registered','abandoned','superseded')
                AND sla_due_at <= ?`)
    .bind(now).all<{ id: string; area_tier: string }>();
  for (const row of breaches.results ?? []) {
    await env.DB.prepare(`UPDATE oe_ipp_land_register SET sla_breached=1, updated_at=? WHERE id=?`)
      .bind(now, row.id).run();
    await fireCascade({ event: 'ipp_lr.sla_breached', actor_id: 'system',
      entity_type: 'ipp_land_register', entity_id: row.id,
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
    c.env.DB.prepare(`SELECT * FROM oe_ipp_land_register ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, parseInt(per_page), offset).all<Record<string, unknown>>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM oe_ipp_land_register ${where}`).bind(...binds).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as total,
        SUM(CASE WHEN chain_status NOT IN ('deeds_registered','abandoned','superseded') THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN chain_status='deeds_registered' THEN 1 ELSE 0 END) as registered_count,
        SUM(CASE WHEN chain_status='defective_title' THEN 1 ELSE 0 END) as defective_count,
        SUM(CASE WHEN chain_status='survey_rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN sla_breached=1 THEN 1 ELSE 0 END) as breached_count
      FROM oe_ipp_land_register ${where}`).bind(...binds).first<Record<string, unknown>>(),
  ]);
  return c.json({ success: true, data: { items: rows.results ?? [], pagination: { page: parseInt(page), per_page: parseInt(per_page), total: total?.n ?? 0 }, kpis } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_land_register WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support', 'regulator'].includes(user.role) && row.participant_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  const audit = await c.env.DB.prepare(`SELECT * FROM audit_events WHERE entity_type='ipp_land_register' AND entity_id=? ORDER BY created_at ASC`).bind(id).all<Record<string, unknown>>();
  return c.json({ success: true, data: { ...row, audit_trail: audit.results ?? [] } });
});

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{ project_id: string; area_ha: number; erf_count?: number; servitude_count?: number; surveyor_firm?: string; description?: string }>();
  if (!body.project_id || body.area_ha == null) return c.json({ error: 'project_id, area_ha required' }, 400);
  const tier = deriveAreaTier(body.area_ha);
  const now = new Date().toISOString();
  const id = `ipplr_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const slaAt = new Date(Date.now() + SLA_DAYS[tier] * 24 * 3_600_000).toISOString();
  await c.env.DB.prepare(`INSERT INTO oe_ipp_land_register
      (id,participant_id,project_id,area_ha,area_tier,erf_count,servitude_count,surveyor_firm,description,chain_status,sla_due_at,sla_breached,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'survey_commissioned',?,0,?,?)`)
    .bind(id, user.id, body.project_id, body.area_ha, tier, body.erf_count ?? null, body.servitude_count ?? null, body.surveyor_firm ?? null, body.description ?? null, slaAt, now, now).run();
  await fireCascade({ event: 'ipp_lr.survey_commissioned', actor_id: user.id, entity_type: 'ipp_land_register', entity_id: id, data: { tier, area_ha: body.area_ha }, env: c.env });
  return c.json({ success: true, data: { id, tier } }, 201);
});

app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const { id } = c.req.param();
  const body = await c.req.json<{ action: LandRegisterAction; reason?: string; deeds_reference?: string }>();
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_land_register WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support'].includes(user.role) && row.participant_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  const current = row.chain_status as LandRegisterStatus;
  if (HARD_TERMINALS.includes(current)) return c.json({ error: `Status ${current} is terminal` }, 409);

  const ACTION_STATE_MAP: Partial<Record<LandRegisterAction, LandRegisterStatus>> = {
    commence_field_survey:    'field_survey',
    submit_diagram:           'diagram_drafted',
    sg_approve:               'sg_approved',
    notarise_servitude:       'servitude_notarised',
    lodge_deeds:              'deeds_lodged',
    confirm_registration:     'deeds_registered',
    raise_defective_title:    'defective_title',
    resolve_defective_title:  'deeds_lodged',
    reject_survey:            'survey_rejected',
    abandon:                  'abandoned',
    supersede:                'superseded',
    flag_sla_breach:          current,
  };

  const nextStatus = ACTION_STATE_MAP[body.action];
  if (!nextStatus) return c.json({ error: `Unknown action: ${body.action}` }, 400);
  if (nextStatus !== current && !VALID_TRANSITIONS[current]?.includes(nextStatus)) return c.json({ error: `Cannot transition ${current} → ${nextStatus}` }, 409);

  const now = new Date().toISOString();
  const tier = row.area_tier as LandTier;
  const extraCols: Record<string, unknown> = {};
  if (body.action === 'commence_field_survey') extraCols.field_survey_at = now;
  if (body.action === 'submit_diagram') extraCols.diagram_submitted_at = now;
  if (body.action === 'sg_approve') extraCols.sg_approved_at = now;
  if (body.action === 'notarise_servitude') extraCols.servitude_notarised_at = now;
  if (body.action === 'lodge_deeds' || body.action === 'resolve_defective_title') {
    extraCols.deeds_lodged_at = now;
    if (body.deeds_reference) extraCols.deeds_reference = body.deeds_reference;
  }
  if (body.action === 'confirm_registration') extraCols.deeds_registered_at = now;
  if (body.action === 'raise_defective_title') extraCols.defective_title_at = now;
  if (body.action === 'reject_survey') extraCols.rejected_at = now;
  if (body.action === 'flag_sla_breach') extraCols.sla_breached = 1;

  const setCols = ['chain_status = ?', 'updated_at = ?', ...Object.keys(extraCols).map(k => `${k} = ?`)];
  await c.env.DB.prepare(`UPDATE oe_ipp_land_register SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(nextStatus, now, ...Object.values(extraCols), id).run();

  const reportable = crossesIntoRegulator(body.action, tier);
  await fireCascade({ event: `ipp_lr.${body.action}` as never, actor_id: user.id, entity_type: 'ipp_land_register', entity_id: id, data: { from: current, to: nextStatus, reason: body.reason, tier, is_reportable: reportable }, env: c.env });
  return c.json({ success: true, data: { id, status: nextStatus, is_reportable: reportable } });
});

export default app;
