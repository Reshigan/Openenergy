// ═══════════════════════════════════════════════════════════════════════════════
// W219 — Offtaker Wheeling Access Application & Third-Party Access Agreement
// NERSA Grid Code §10 + ERA §21
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  WheelStatus, WheelAction, WheelTier,
  deriveWheelSla, WHEEL_HARD_TERMINALS,
  WHEEL_VALID_TRANSITIONS, WHEEL_STATE_TRANSITIONS,
  wheelCrossesIntoRegulator, wheelSlaBreachCrossesIntoRegulator,
} from '../utils/wheeling-access-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'offtaker', 'grid_operator', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function wheelSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_wheeling_access
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('terminated','expired','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_wheeling_access SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (wheelSlaBreachCrossesIntoRegulator(row.wheel_tier as WheelTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'wheeling_access', row.id,
          'wheel_sla_breach',
          `Wheeling access SLA breached — ${row.wheel_tier} — ${row.requested_capacity_mw ?? '?'}MW`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'wheel_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'wheeling_access', entity_id: row.id as string,
      data: { wheel_tier: row.wheel_tier, ipp_ref: row.ipp_ref },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'offtaker', 'grid_operator', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_wheeling_access WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    active: all.filter(r => r.chain_status === 'active').length,
    in_progress: all.filter(r => ['access_application','feasibility_study','impact_assessment','terms_proposed','negotiation','agreement_signed'].includes(r.chain_status as string)).length,
    renewal_due: all.filter(r => r.chain_status === 'renewal_due').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_wheeling_access WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'offtaker', 'grid_operator', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'wheeling_access' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    wheel_tier?: WheelTier;
    requested_capacity_mw?: number;
    wheeling_distance_km?: number;
    voltage_level_kv?: number;
    ipp_ref?: string;
    gca_ref?: string;
    ppa_ref?: string;
    wheeling_route_description?: string;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.wheel_tier ?? 'medium_distributed';

  const now = new Date().toISOString();
  const slaDays = deriveWheelSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_wheeling_access
      (id, participant_id, wheel_tier, requested_capacity_mw, wheeling_distance_km,
       voltage_level_kv, ipp_ref, gca_ref, ppa_ref, wheeling_route_description,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'access_application',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier,
      body.requested_capacity_mw ?? null, body.wheeling_distance_km ?? null,
      body.voltage_level_kv ?? null, body.ipp_ref ?? null,
      body.gca_ref ?? null, body.ppa_ref ?? null,
      body.wheeling_route_description ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'wheel_created' as EventType,
    actor_id: user.id, entity_type: 'wheeling_access', entity_id: id,
    data: { wheel_tier: tier, ipp_ref: body.ipp_ref },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_wheeling_access WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: WheelAction;
    reason?: string;
    feasibility_ref?: string;
    impact_study_ref?: string;
    network_constraints?: string;
    indicative_terms_ref?: string;
    agreement_ref?: string;
    agreement_expiry?: string;
    wheeling_charge_tariff?: string;
    modification_description?: string;
    renewal_due_date?: string;
    termination_reason?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_wheeling_access WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as WheelStatus;
  if (WHEEL_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Agreement in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = WHEEL_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = WHEEL_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_wheeling_access SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'commence_feasibility') { extra.push('feasibility_ref = ?'); eb.push(body.feasibility_ref ?? null); }
  if (action === 'commence_impact_assessment') { extra.push('impact_study_ref = ?'); eb.push(body.impact_study_ref ?? null); }
  if (body.network_constraints) { extra.push('network_constraints = ?'); eb.push(body.network_constraints); }
  if (action === 'issue_terms') {
    extra.push('terms_issued_at = ?', 'indicative_terms_ref = ?');
    eb.push(now, body.indicative_terms_ref ?? null);
  }
  if (action === 'commence_negotiation') { extra.push('negotiation_started_at = ?'); eb.push(now); }
  if (action === 'execute_agreement') {
    extra.push('agreement_signed_at = ?', 'agreement_ref = ?', 'agreement_expiry = ?', 'wheeling_charge_tariff = ?');
    eb.push(now, body.agreement_ref ?? null, body.agreement_expiry ?? null, body.wheeling_charge_tariff ?? null);
  }
  if (action === 'request_modification') {
    extra.push('modification_description = ?', 'modification_requested_at = ?');
    eb.push(body.modification_description ?? null, now);
  }
  if (action === 'flag_renewal' && body.renewal_due_date) { extra.push('renewal_due_date = ?'); eb.push(body.renewal_due_date); }
  if (action === 'terminate') {
    extra.push('terminated_at = ?', 'termination_reason = ?');
    eb.push(now, body.termination_reason ?? null);
  }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_wheeling_access SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (wheelCrossesIntoRegulator(action, row.wheel_tier as WheelTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'wheeling_access', id,
        `wheel_${action}`,
        `Wheeling access ${action.replace(/_/g, ' ')} — ${row.wheel_tier} — ${row.requested_capacity_mw ?? '?'}MW`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_wheeling_access SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `wheel_${action}` as EventType,
    actor_id: user.id, entity_type: 'wheeling_access', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, wheel_tier: row.wheel_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_wheeling_access WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'offtaker', 'grid_operator', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await wheelSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
