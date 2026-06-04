// W153 — IPP Independent Engineer (IE) Milestone Certification
// REIPPPP PPA Schedule 5 + LMA IE role; links IPP-PM milestones to W21/W30/W38 drawdowns
import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type IeCertStatus, type IeCertAction, type MilestoneTier,
  deriveMilestoneTier, crossesIntoRegulator, HARD_TERMINALS, VALID_TRANSITIONS, SLA_DAYS,
} from '../utils/ipp-ie-cert-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);
const WRITE_ROLES = ['admin', 'ipp_developer'];

export async function ippIeCertSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const breaches = await env.DB
    .prepare(`SELECT id, milestone_tier FROM oe_ipp_ie_cert
              WHERE sla_due_at IS NOT NULL AND sla_breached = 0
                AND chain_status NOT IN ('cert_issued','cert_rejected','withdrawn')
                AND sla_due_at <= ?`)
    .bind(now).all<{ id: string; milestone_tier: string }>();
  for (const row of breaches.results ?? []) {
    await env.DB.prepare(`UPDATE oe_ipp_ie_cert SET sla_breached=1, updated_at=? WHERE id=?`)
      .bind(now, row.id).run();
    await fireCascade({ event: 'ipp_ie.sla_breached', actor_id: 'system',
      entity_type: 'ipp_ie_cert', entity_id: row.id,
      data: { milestone_tier: row.milestone_tier }, env });
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const { project_id, status, tier, milestone_category, page = '1', per_page = '50' } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(per_page);
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (!['admin', 'support', 'regulator'].includes(user.role)) { clauses.push('participant_id = ?'); binds.push(user.id); }
  if (project_id) { clauses.push('project_id = ?'); binds.push(project_id); }
  if (status) { clauses.push('chain_status = ?'); binds.push(status); }
  if (tier) { clauses.push('milestone_tier = ?'); binds.push(tier); }
  if (milestone_category) { clauses.push('milestone_category = ?'); binds.push(milestone_category); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows, total, kpis] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM oe_ipp_ie_cert ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, parseInt(per_page), offset).all<Record<string, unknown>>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM oe_ipp_ie_cert ${where}`).bind(...binds).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as total,
        SUM(CASE WHEN chain_status NOT IN ('cert_issued','cert_rejected','withdrawn') THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN chain_status='cert_issued' THEN 1 ELSE 0 END) as issued_count,
        SUM(CASE WHEN chain_status='comments_raised' THEN 1 ELSE 0 END) as comments_count,
        SUM(CASE WHEN chain_status='cert_rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN sla_breached=1 THEN 1 ELSE 0 END) as breached_count,
        SUM(CASE WHEN chain_status='cert_issued' THEN milestone_value_zar ELSE 0 END) as total_certified_zar
      FROM oe_ipp_ie_cert ${where}`).bind(...binds).first<Record<string, unknown>>(),
  ]);
  return c.json({ success: true, data: { items: rows.results ?? [], pagination: { page: parseInt(page), per_page: parseInt(per_page), total: total?.n ?? 0 }, kpis } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_ie_cert WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support', 'regulator'].includes(user.role) && row.participant_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  const audit = await c.env.DB.prepare(`SELECT * FROM audit_events WHERE entity_type='ipp_ie_cert' AND entity_id=? ORDER BY created_at ASC`).bind(id).all<Record<string, unknown>>();
  return c.json({ success: true, data: { ...row, audit_trail: audit.results ?? [] } });
});

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{
    project_id: string;
    milestone_value_zar: number;
    milestone_category?: string;
    ie_firm?: string;
    lender_reference?: string;
    description?: string;
  }>();
  if (!body.project_id || body.milestone_value_zar == null) return c.json({ error: 'project_id, milestone_value_zar required' }, 400);
  const tier = deriveMilestoneTier(body.milestone_value_zar);
  const now = new Date().toISOString();
  const id = `ippie_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const slaAt = new Date(Date.now() + SLA_DAYS[tier] * 24 * 3_600_000).toISOString();
  await c.env.DB.prepare(`INSERT INTO oe_ipp_ie_cert
      (id,participant_id,project_id,milestone_value_zar,milestone_tier,milestone_category,ie_firm,lender_reference,description,chain_status,sla_due_at,sla_breached,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'cert_request_submitted',?,0,?,?)`)
    .bind(id, user.id, body.project_id, body.milestone_value_zar, tier,
      body.milestone_category ?? null, body.ie_firm ?? null, body.lender_reference ?? null,
      body.description ?? null, slaAt, now, now).run();
  await fireCascade({ event: 'ipp_ie.created', actor_id: user.id, entity_type: 'ipp_ie_cert', entity_id: id, data: { tier, milestone_value_zar: body.milestone_value_zar }, env: c.env });
  return c.json({ success: true, data: { id, tier } }, 201);
});

app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const { id } = c.req.param();
  const body = await c.req.json<{ action: IeCertAction; reason?: string; cert_number?: string }>();
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_ie_cert WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support'].includes(user.role) && row.participant_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  const current = row.chain_status as IeCertStatus;
  if (HARD_TERMINALS.includes(current)) return c.json({ error: `Status ${current} is terminal` }, 409);

  const ACTION_STATE_MAP: Partial<Record<IeCertAction, IeCertStatus>> = {
    commence_site_visit:        'ie_site_visit',
    prepare_draft:              'draft_report',
    issue_for_borrower_review:  'borrower_review',
    raise_comments:             'comments_raised',
    resolve_comments:           'comments_resolved',
    issue_cert:                 'cert_issued',
    reject_certification:       'cert_rejected',
    withdraw:                   'withdrawn',
    flag_sla_breach:            current,
  };

  const nextStatus = ACTION_STATE_MAP[body.action];
  if (!nextStatus) return c.json({ error: `Unknown action: ${body.action}` }, 400);
  if (nextStatus !== current && !VALID_TRANSITIONS[current]?.includes(nextStatus)) return c.json({ error: `Cannot transition ${current} → ${nextStatus}` }, 409);

  const now = new Date().toISOString();
  const tier = row.milestone_tier as MilestoneTier;
  const extraCols: Record<string, unknown> = {};
  if (body.action === 'commence_site_visit') extraCols.site_visit_at = now;
  if (body.action === 'prepare_draft') extraCols.draft_report_at = now;
  if (body.action === 'issue_for_borrower_review') extraCols.borrower_review_at = now;
  if (body.action === 'raise_comments') extraCols.comments_raised_at = now;
  if (body.action === 'resolve_comments') extraCols.comments_resolved_at = now;
  if (body.action === 'issue_cert') {
    extraCols.cert_issued_at = now;
    if (body.cert_number) extraCols.cert_number = body.cert_number;
  }
  if (body.action === 'reject_certification') extraCols.rejected_at = now;
  if (body.action === 'flag_sla_breach') extraCols.sla_breached = 1;

  const setCols = ['chain_status = ?', 'updated_at = ?', ...Object.keys(extraCols).map(k => `${k} = ?`)];
  await c.env.DB.prepare(`UPDATE oe_ipp_ie_cert SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(nextStatus, now, ...Object.values(extraCols), id).run();

  const reportable = crossesIntoRegulator(body.action, tier);
  await fireCascade({ event: `ipp_ie.${body.action}` as never, actor_id: user.id, entity_type: 'ipp_ie_cert', entity_id: id, data: { from: current, to: nextStatus, reason: body.reason, tier, is_reportable: reportable }, env: c.env });
  return c.json({ success: true, data: { id, status: nextStatus, is_reportable: reportable } });
});

export default app;
