// W148 — IPP Final Completion Certificate & Retention Release
// JBCC 6.2 Cl.27-29 / NEC4 Cl.53-54
// GET  /api/ipp-final-completion        — list + KPIs
// GET  /api/ipp-final-completion/:id    — detail + audit trail
// POST /api/ipp-final-completion        — create application
// PUT  /api/ipp-final-completion/:id/action — state transition

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type FccStatus,
  type FccAction,
  type ContractTier,
  deriveContractTier,
  crossesIntoRegulator,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  SLA_DAYS,
} from '../utils/ipp-final-completion-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

export async function ippFinalCompletionSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const breaches = await env.DB
    .prepare(`SELECT id, contract_tier FROM oe_ipp_final_completion
              WHERE sla_due_at IS NOT NULL AND sla_breached = 0
                AND chain_status NOT IN ('retention_released','adjudicated','withdrawn','rejected')
                AND sla_due_at <= ?`)
    .bind(now)
    .all<{ id: string; contract_tier: string }>();
  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_final_completion SET sla_breached=1, updated_at=? WHERE id=?`)
      .bind(now, row.id)
      .run();
    await fireCascade({ event: 'ipp_fcc.sla_breached', actor_id: 'system',
      entity_type: 'ipp_final_completion', entity_id: row.id,
      data: { contract_tier: row.contract_tier }, env });
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
  if (tier) { clauses.push('contract_tier = ?'); binds.push(tier); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [rows, total, kpis] = await Promise.all([
    env.DB.prepare(`SELECT * FROM oe_ipp_final_completion ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, parseInt(per_page), offset)
      .all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) as n FROM oe_ipp_final_completion ${where}`)
      .bind(...binds).first<{ n: number }>(),
    env.DB.prepare(`SELECT
        COUNT(*) as total,
        SUM(CASE WHEN chain_status NOT IN ('retention_released','adjudicated','withdrawn','rejected') THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN chain_status = 'fcc_issued' THEN 1 ELSE 0 END) as fcc_issued_count,
        SUM(CASE WHEN chain_status = 'retention_released' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN chain_status = 'disputed' THEN 1 ELSE 0 END) as disputed_count,
        SUM(CASE WHEN chain_status = 'defects_outstanding' THEN 1 ELSE 0 END) as defects_outstanding_count,
        SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
        COALESCE(SUM(CASE WHEN chain_status = 'retention_released' THEN retention_amount_zar ELSE 0 END),0) as total_retention_released_zar,
        COALESCE(SUM(CASE WHEN chain_status NOT IN ('retention_released','withdrawn','rejected') THEN retention_amount_zar ELSE 0 END),0) as pending_retention_zar
      FROM oe_ipp_final_completion ${where}`)
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
    .prepare('SELECT * FROM oe_ipp_final_completion WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support', 'regulator'].includes(user.role) && row.participant_id !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const audit = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type='ipp_final_completion' AND entity_id=? ORDER BY created_at ASC`)
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
    contract_value_zar: number;
    retention_amount_zar: number;
    practical_completion_date: string;
    dlp_end_date: string;
    description?: string;
  }>();

  if (!body.project_id || body.contract_value_zar == null || body.retention_amount_zar == null) {
    return c.json({ error: 'project_id, contract_value_zar, retention_amount_zar required' }, 400);
  }

  const tier = deriveContractTier(body.contract_value_zar);
  const slaAt = new Date(Date.now() + SLA_DAYS[tier] * 24 * 3_600_000).toISOString();
  const now = new Date().toISOString();
  const id = `ippfcc_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  await env.DB
    .prepare(`INSERT INTO oe_ipp_final_completion
        (id, participant_id, project_id, contract_value_zar, retention_amount_zar,
         contract_tier, practical_completion_date, dlp_end_date, description,
         chain_status, sla_due_at, sla_breached, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?)`)
    .bind(id, user.id, body.project_id, body.contract_value_zar, body.retention_amount_zar,
      tier, body.practical_completion_date, body.dlp_end_date,
      body.description ?? null, 'application_submitted', slaAt, now, now)
    .run();

  await fireCascade({ event: 'ipp_fcc.application_submitted', actor_id: user.id,
    entity_type: 'ipp_final_completion', entity_id: id,
    data: { tier, contract_value_zar: body.contract_value_zar, retention_amount_zar: body.retention_amount_zar },
    env });

  return c.json({ success: true, data: { id, tier } }, 201);
});

// ── PUT /:id/action ────────────────────────────────────────────────────────────
app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const env = c.env;

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: FccAction;
    reason?: string;
    snag_count?: number;
    fcc_date?: string;
    retention_release_date?: string;
  }>();

  const row = await env.DB
    .prepare('SELECT * FROM oe_ipp_final_completion WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support'].includes(user.role) && row.participant_id !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as FccStatus;
  if (HARD_TERMINALS.includes(current)) return c.json({ error: `Status ${current} is terminal` }, 409);

  const ACTION_STATE_MAP: Partial<Record<FccAction, FccStatus>> = {
    schedule_inspection:  'inspection_scheduled',
    complete_inspection:  'inspection_complete',
    issue_snag_list:      'snag_list_issued',
    clear_snag_list:      'snag_list_cleared',
    issue_fcc:            'fcc_issued',
    release_retention:    'retention_released',
    reject_application:   'rejected',
    dispute_rejection:    'disputed',
    refer_adjudication:   'adjudicated',
    withdraw_application: 'withdrawn',
    flag_sla_breach:      current,
  };

  const nextStatus = ACTION_STATE_MAP[body.action];
  if (!nextStatus) return c.json({ error: `Unknown action: ${body.action}` }, 400);
  if (nextStatus !== current && !VALID_TRANSITIONS[current]?.includes(nextStatus)) {
    return c.json({ error: `Cannot transition ${current} → ${nextStatus}` }, 409);
  }

  const now = new Date().toISOString();
  const tier = row.contract_tier as ContractTier;
  const extraCols: Record<string, unknown> = {};

  if (body.action === 'schedule_inspection') extraCols.inspection_scheduled_at = now;
  if (body.action === 'complete_inspection') extraCols.inspection_completed_at = now;
  if (body.action === 'issue_snag_list') {
    extraCols.snag_list_issued_at = now;
    if (body.snag_count != null) extraCols.snag_count = body.snag_count;
  }
  if (body.action === 'clear_snag_list') extraCols.snag_list_cleared_at = now;
  if (body.action === 'issue_fcc') {
    extraCols.fcc_issued_at = body.fcc_date ?? now;
  }
  if (body.action === 'release_retention') {
    extraCols.retention_released_at = body.retention_release_date ?? now;
  }
  if (body.action === 'reject_application') extraCols.rejected_at = now;
  if (body.action === 'dispute_rejection') extraCols.disputed_at = now;
  if (body.action === 'refer_adjudication') extraCols.adjudicated_at = now;
  if (body.action === 'withdraw_application') extraCols.withdrawn_at = now;
  if (body.action === 'flag_sla_breach') extraCols.sla_breached = 1;

  const setCols = ['chain_status = ?', 'updated_at = ?', ...Object.keys(extraCols).map(k => `${k} = ?`)];
  await env.DB
    .prepare(`UPDATE oe_ipp_final_completion SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(nextStatus, now, ...Object.values(extraCols), id)
    .run();

  const reportable = crossesIntoRegulator(body.action, tier);
  await fireCascade({ event: `ipp_fcc.${body.action}` as never, actor_id: user.id,
    entity_type: 'ipp_final_completion', entity_id: id,
    data: { from: current, to: nextStatus, reason: body.reason, tier, is_reportable: reportable }, env });

  return c.json({ success: true, data: { id, status: nextStatus, is_reportable: reportable } });
});

export default app;
