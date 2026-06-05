// ═══════════════════════════════════════════════════════════════════════════════
// W213 — Carbon Project Methodology Deviation & Amendment
// Verra VCS/VM0038 + Gold Standard Protocol Amendment + Article 6.4 ERD
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  MaStatus, MaAction, AmendmentTier,
  deriveMaSla, MA_HARD_TERMINALS,
  MA_VALID_TRANSITIONS, MA_STATE_TRANSITIONS,
  maCrossesIntoRegulator, maSlaBreachCrossesIntoRegulator,
} from '../utils/methodology-amendment-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'carbon_fund', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function maSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_methodology_amendments
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('amendment_approved','amendment_rejected','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_methodology_amendments SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (maSlaBreachCrossesIntoRegulator(row.amendment_tier as AmendmentTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'methodology_amendment', row.id,
          'ma_sla_breach',
          `Methodology amendment SLA breached — ${row.amendment_tier} — ${row.methodology_id}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'ma_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'methodology_amendment', entity_id: row.id as string,
      data: { amendment_tier: row.amendment_tier, methodology_id: row.methodology_id },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_methodology_amendments WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    approved: all.filter(r => r.chain_status === 'amendment_approved').length,
    in_progress: all.filter(r => !['amendment_approved', 'amendment_rejected', 'withdrawn'].includes(r.chain_status as string)).length,
    rejected: all.filter(r => r.chain_status === 'amendment_rejected').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_methodology_amendments WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'methodology_amendment' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    project_ref?: string;
    methodology_id: string;
    methodology_version?: string;
    amendment_tier?: AmendmentTier;
    deviation_type?: string;
    deviation_description: string;
    estimated_impact_tco2e?: number;
    reason?: string;
  }>();

  if (!body.methodology_id || !body.deviation_description) {
    return c.json({ success: false, error: 'methodology_id and deviation_description required' }, 422);
  }

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.amendment_tier ?? 'moderate_change';

  const now = new Date().toISOString();
  const slaDays = deriveMaSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_methodology_amendments
      (id, participant_id, project_ref, methodology_id, methodology_version,
       amendment_tier, deviation_type, deviation_description, estimated_impact_tco2e,
       deviation_discovered_at,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'deviation_identified',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, body.project_ref ?? null, body.methodology_id, body.methodology_version ?? null,
      tier, body.deviation_type ?? null, body.deviation_description,
      body.estimated_impact_tco2e ?? null, now,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'ma_created' as EventType,
    actor_id: user.id, entity_type: 'methodology_amendment', entity_id: id,
    data: { amendment_tier: tier, methodology_id: body.methodology_id },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_methodology_amendments WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: MaAction;
    reason?: string;
    materiality_rationale?: string;
    is_material?: boolean;
    amendment_description?: string;
    new_methodology_version?: string;
    dna_name?: string;
    dna_notification_ref?: string;
    validator_name?: string;
    validator_ref?: string;
    validator_findings?: string;
    rejection_reason?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_methodology_amendments WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as MaStatus;
  if (MA_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Amendment in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = MA_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = MA_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && row.sla_deadline < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_methodology_amendments SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.materiality_rationale) { extra.push('materiality_rationale = ?'); eb.push(body.materiality_rationale); }
  if (body.is_material != null) { extra.push('is_material = ?'); eb.push(body.is_material ? 1 : 0); }
  if (body.amendment_description) { extra.push('amendment_description = ?'); eb.push(body.amendment_description); }
  if (body.new_methodology_version) { extra.push('new_methodology_version = ?'); eb.push(body.new_methodology_version); }
  if (action === 'submit_amendment') { extra.push('amendment_submitted_at = ?'); eb.push(now); }
  if (body.dna_name) { extra.push('dna_name = ?'); eb.push(body.dna_name); }
  if (body.dna_notification_ref) { extra.push('dna_notification_ref = ?'); eb.push(body.dna_notification_ref); }
  if (action === 'notify_dna') { extra.push('dna_notified_at = ?'); eb.push(now); }
  if (body.validator_name) { extra.push('validator_name = ?'); eb.push(body.validator_name); }
  if (body.validator_ref) { extra.push('validator_ref = ?'); eb.push(body.validator_ref); }
  if (action === 'start_revalidation') { extra.push('revalidation_started_at = ?'); eb.push(now); }
  if (body.validator_findings) { extra.push('validator_findings = ?'); eb.push(body.validator_findings); }
  if (action === 'approve_amendment') { extra.push('approved_at = ?', 'revalidation_completed_at = ?'); eb.push(now, now); }
  if (action === 'reject_amendment') { extra.push('rejected_at = ?', 'revalidation_completed_at = ?'); eb.push(now, now); }
  if (body.rejection_reason) { extra.push('rejection_reason = ?'); eb.push(body.rejection_reason); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_methodology_amendments SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (maCrossesIntoRegulator(action, row.amendment_tier as AmendmentTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'methodology_amendment', id,
        `ma_${action}`,
        `Methodology ${action.replace(/_/g, ' ')} — ${row.amendment_tier} — ${row.methodology_id}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_methodology_amendments SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `ma_${action}` as EventType,
    actor_id: user.id, entity_type: 'methodology_amendment', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, amendment_tier: row.amendment_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_methodology_amendments WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'carbon_fund', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await maSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
