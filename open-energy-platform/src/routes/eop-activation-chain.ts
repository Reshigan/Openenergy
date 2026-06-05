// ═══════════════════════════════════════════════════════════════════════════════
// W215 — Grid Emergency Operations Plan (EOP) Activation & Post-Event Review
// NERSA Grid Code §G.4 + NTCSA SOC Emergency Procedures + NRS 048-2
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  EopStatus, EopAction, EopTier,
  deriveEopSla, EOP_HARD_TERMINALS,
  EOP_VALID_TRANSITIONS, EOP_STATE_TRANSITIONS,
  eopCrossesIntoRegulator, eopSlaBreachCrossesIntoRegulator,
} from '../utils/eop-activation-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'grid_operator', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function eopSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_eop_activations
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('per_completed','per_outstanding','escalated_to_regulator','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_eop_activations SET sla_breached = 1, chain_status = 'per_outstanding', updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (eopSlaBreachCrossesIntoRegulator(row.eop_tier as EopTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'eop_activation', row.id,
          'eop_sla_breach',
          `EOP PER SLA breached — ${row.eop_tier} — ${row.contingency_type ?? row.affected_region}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'eop_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'eop_activation', entity_id: row.id as string,
      data: { eop_tier: row.eop_tier, affected_mw: row.affected_mw },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'grid_operator', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_eop_activations WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    active: all.filter(r => !['per_completed', 'per_outstanding', 'escalated_to_regulator', 'withdrawn'].includes(r.chain_status as string)).length,
    completed: all.filter(r => r.chain_status === 'per_completed').length,
    escalated: all.filter(r => r.chain_status === 'escalated_to_regulator').length,
    per_outstanding: all.filter(r => r.chain_status === 'per_outstanding').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_eop_activations WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'grid_operator', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'eop_activation' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    eop_tier?: EopTier;
    contingency_type?: string;
    contingency_description: string;
    affected_mw?: number;
    affected_region?: string;
    load_shedding_stage?: number;
    contingency_at?: string;
    ntcsa_incident_ref?: string;
    so_incident_ref?: string;
    reason?: string;
  }>();

  if (!body.contingency_description) {
    return c.json({ success: false, error: 'contingency_description required' }, 422);
  }

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.eop_tier ?? 'n1_significant';

  const now = new Date().toISOString();
  const slaHours = deriveEopSla(tier);
  const slaDeadline = new Date(Date.now() + slaHours * 3600000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_eop_activations
      (id, participant_id, eop_tier, contingency_type, contingency_description,
       affected_mw, affected_region, load_shedding_stage, contingency_at,
       ntcsa_incident_ref, so_incident_ref,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'contingency_detected',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier, body.contingency_type ?? null, body.contingency_description,
      body.affected_mw ?? null, body.affected_region ?? null, body.load_shedding_stage ?? null,
      body.contingency_at ?? now,
      body.ntcsa_incident_ref ?? null, body.so_incident_ref ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'eop_created' as EventType,
    actor_id: user.id, entity_type: 'eop_activation', entity_id: id,
    data: { eop_tier: tier, contingency_type: body.contingency_type, affected_mw: body.affected_mw },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_eop_activations WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: EopAction;
    reason?: string;
    load_shedding_stage?: number;
    affected_mw?: number;
    per_lead_name?: string;
    root_cause?: string;
    contributing_factors?: string;
    lessons_learned?: string;
    action_items?: string;
    nersa_notification_ref?: string;
    escalation_reason?: string;
    total_outage_duration_min?: number;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_eop_activations WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as EopStatus;
  if (EOP_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `EOP in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = EOP_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = EOP_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_eop_activations SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'activate_eop') { extra.push('eop_activated_at = ?'); eb.push(now); }
  if (action === 'alert_operations_centre') { extra.push('operations_centre_alerted_at = ?'); eb.push(now); }
  if (action === 'assess_load_shedding' && body.load_shedding_stage != null) { extra.push('load_shedding_stage = ?', 'load_shedding_started_at = ?'); eb.push(body.load_shedding_stage, now); }
  if (action === 'commence_restoration') { extra.push('restoration_started_at = ?'); eb.push(now); }
  if (action === 'restore_normal_operations') { extra.push('normal_ops_restored_at = ?'); eb.push(now); }
  if (body.total_outage_duration_min != null) { extra.push('total_outage_duration_min = ?'); eb.push(body.total_outage_duration_min); }
  if (body.affected_mw != null) { extra.push('affected_mw = ?'); eb.push(body.affected_mw); }
  if (action === 'initiate_per') { extra.push('per_initiated_at = ?'); eb.push(now); }
  if (action === 'complete_per') { extra.push('per_completed_at = ?'); eb.push(now); }
  if (body.per_lead_name) { extra.push('per_lead_name = ?'); eb.push(body.per_lead_name); }
  if (body.root_cause) { extra.push('root_cause = ?'); eb.push(body.root_cause); }
  if (body.contributing_factors) { extra.push('contributing_factors = ?'); eb.push(body.contributing_factors); }
  if (body.lessons_learned) { extra.push('lessons_learned = ?'); eb.push(body.lessons_learned); }
  if (body.action_items) { extra.push('action_items = ?'); eb.push(body.action_items); }
  if (body.nersa_notification_ref) { extra.push('nersa_notification_ref = ?'); eb.push(body.nersa_notification_ref); }
  if (body.escalation_reason) { extra.push('escalation_reason = ?'); eb.push(body.escalation_reason); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_eop_activations SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (eopCrossesIntoRegulator(action, row.eop_tier as EopTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'eop_activation', id,
        `eop_${action}`,
        `EOP ${action.replace(/_/g, ' ')} — ${row.eop_tier} — ${row.contingency_type ?? row.affected_region}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_eop_activations SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `eop_${action}` as EventType,
    actor_id: user.id, entity_type: 'eop_activation', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, eop_tier: row.eop_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_eop_activations WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'grid_operator', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await eopSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
