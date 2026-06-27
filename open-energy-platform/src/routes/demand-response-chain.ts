// ═══════════════════════════════════════════════════════════════════════════════
// W205 — Grid Demand-Response Programme Participation & Settlement
// NERSA Grid Code §CSC + NTCSA DSR + IEC 61968 DR Interface
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import { badEnum } from '../utils/validation';
import {
  DrStatus, DrAction, DrProgramme,
  deriveDrSla, DR_HARD_TERMINALS,
  DR_VALID_TRANSITIONS, DR_STATE_TRANSITIONS,
  drCrossesIntoRegulator, drSlaBreachCrossesIntoRegulator,
} from '../utils/demand-response-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'grid_operator', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function drSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_demand_response_events
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('settled','non_performance','cancelled')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_demand_response_events SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (drSlaBreachCrossesIntoRegulator(row.dr_programme as DrProgramme)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'demand_response_event', row.id,
          'dr_sla_breach',
          `Demand response SLA breached — ${row.event_date} — ${row.dr_programme} programme`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'dr_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'demand_response_event', entity_id: row.id as string,
      data: { event_date: row.event_date, dr_programme: row.dr_programme },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'support', 'regulator', 'grid_operator'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_demand_response_events WHERE participant_id = ? ORDER BY event_date DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    settled: all.filter(r => r.chain_status === 'settled').length,
    active: all.filter(r => ['activated', 'load_shed', 'performance_metering'].includes(r.chain_status as string)).length,
    non_performance: all.filter(r => r.chain_status === 'non_performance').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_demand_response_events WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support', 'regulator', 'grid_operator'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'demand_response_event' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    operator_id?: string;
    dr_programme?: DrProgramme;
    event_date: string;
    requested_mw?: number;
    activation_ref?: string;
    notification_type?: string;
    incentive_rate_per_mw?: number;
    reason?: string;
  }>();

  const enumErr = badEnum('notification_type', body.notification_type, ['day_ahead', 'real_time', 'test']);
  if (enumErr) return c.json({ success: false, error: enumErr }, 400);

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const programme = body.dr_programme ?? 'day_ahead';

  const now = new Date().toISOString();
  // SLA in hours for DR; multiply by 3600000 ms
  const slaSecs = deriveDrSla(programme) * 3600000;
  const slaDeadline = new Date(Date.now() + slaSecs).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_demand_response_events
      (id, participant_id, operator_id, dr_programme, event_date, requested_mw,
       activation_ref, notification_type, incentive_rate_per_mw,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'registered',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, body.operator_id ?? null, programme,
      body.event_date, body.requested_mw ?? null,
      body.activation_ref ?? null, body.notification_type ?? null,
      body.incentive_rate_per_mw ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'dr_event_registered' as EventType,
    actor_id: user.id, entity_type: 'demand_response_event', entity_id: id,
    data: { event_date: body.event_date, dr_programme: programme },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_demand_response_events WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: DrAction;
    reason?: string;
    notification_sent_at?: string;
    acknowledged_at?: string;
    activated_at?: string;
    activation_start?: string;
    activation_end?: string;
    actual_mw_shed?: number;
    metering_ref?: string;
    performance_pct?: number;
    incentive_amount_zar?: number;
    non_performance_penalty_zar?: number;
    dispute_description?: string;
    settlement_ref?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_demand_response_events WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id && row.operator_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as DrStatus;
  if (DR_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `DR event in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = DR_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, DR_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && row.sla_deadline < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_demand_response_events SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'send_notification') { extra.push('notification_sent_at = ?'); eb.push(now); }
  if (action === 'acknowledge') { extra.push('acknowledged_at = ?'); eb.push(now); }
  if (action === 'activate') { extra.push('activated_at = ?'); eb.push(now); }
  if (body.activation_start) { extra.push('activation_start = ?'); eb.push(body.activation_start); }
  if (body.activation_end) { extra.push('activation_end = ?'); eb.push(body.activation_end); }
  if (body.actual_mw_shed != null) { extra.push('actual_mw_shed = ?'); eb.push(body.actual_mw_shed); }
  if (body.metering_ref) { extra.push('metering_ref = ?'); eb.push(body.metering_ref); }
  if (action === 'verify_performance') { extra.push('verified_at = ?'); eb.push(now); }
  if (body.performance_pct != null) { extra.push('performance_pct = ?'); eb.push(body.performance_pct); }
  if (body.incentive_amount_zar != null) { extra.push('incentive_amount_zar = ?'); eb.push(body.incentive_amount_zar); }
  if (body.non_performance_penalty_zar != null) { extra.push('non_performance_penalty_zar = ?'); eb.push(body.non_performance_penalty_zar); }
  if (body.dispute_description) { extra.push('dispute_description = ?'); eb.push(body.dispute_description); }
  if (body.settlement_ref) { extra.push('settlement_ref = ?'); eb.push(body.settlement_ref); }
  if (action === 'post_settlement') { extra.push('settled_at = ?'); eb.push(now); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_demand_response_events SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (drCrossesIntoRegulator(action, row.dr_programme as DrProgramme)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'demand_response_event', id,
        `dr_${action}`,
        `Demand response ${action} — ${row.event_date} — ${row.dr_programme} programme`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_demand_response_events SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `dr_${action}` as EventType,
    actor_id: user.id, entity_type: 'demand_response_event', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, event_date: row.event_date },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_demand_response_events WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await drSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
