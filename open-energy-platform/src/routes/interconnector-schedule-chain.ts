import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { badEnum } from '../utils/validation';
import {
  IcsStatus,
  IcsAction,
  ICS_VALID_TRANSITIONS,
  ICS_STATE_TRANSITIONS,
  ICS_HARD_TERMINALS,
  crossesIcsIntoRegulator,
  deriveCapacityTier,
  deriveIcsSlaWindowDays,
} from '../utils/interconnector-schedule-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = new Set(['admin', 'grid_operator']);

function slaDeadline(tier: ReturnType<typeof deriveCapacityTier>): string {
  const d = new Date();
  d.setDate(d.getDate() + deriveIcsSlaWindowDays(tier));
  return d.toISOString();
}

// GET / — list with stats
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM oe_interconnector_schedules WHERE tenant_id = ? ORDER BY delivery_start DESC LIMIT 200`
  ).bind(user.tenant_id).all();

  const rows = results as Record<string, unknown>[];
  const now = new Date().toISOString();
  const stats = {
    total: rows.length,
    active: rows.filter(r => r.chain_status === 'operating' || r.chain_status === 'agreed').length,
    completed: rows.filter(r => r.chain_status === 'completed').length,
    in_dispute: rows.filter(r => r.chain_status === 'dispute' || r.chain_status === 'deviated').length,
    overdue: rows.filter(r => r.sla_deadline && (r.sla_deadline as string) < now && !ICS_HARD_TERMINALS.has(r.chain_status as IcsStatus)).length,
  };

  return c.json({ data: { schedules: rows, stats } });
});

// GET /:id
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const row = await c.env.DB.prepare(
    `SELECT * FROM oe_interconnector_schedules WHERE id = ? AND tenant_id = ?`
  ).bind(c.req.param('id'), user.tenant_id).first();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ data: row });
});

// POST / — create new schedule
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json() as Record<string, unknown>;
  const {
    interconnector_id, interconnector_name, neighbour_utility, neighbour_country,
    direction, scheduled_mw, delivery_start, delivery_end, product_type,
    price_per_mwh, currency = 'USD', counterparty_ref,
  } = body;

  if (!interconnector_id || !interconnector_name || !neighbour_utility || !neighbour_country ||
      !direction || !scheduled_mw || !delivery_start || !delivery_end || !product_type) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const enumErr =
    badEnum('neighbour_country', neighbour_country, ['ZW','MZ','BW','NA','LS','SZ','ZM']) ??
    badEnum('direction', direction, ['export','import','wheeling']) ??
    badEnum('product_type', product_type, ['day_ahead','intraday','week_ahead','bilateral']);
  if (enumErr) return c.json({ error: enumErr }, 400);

  const mw = Number(scheduled_mw);
  const tier = deriveCapacityTier(mw);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO oe_interconnector_schedules
      (id,tenant_id,interconnector_id,interconnector_name,neighbour_utility,neighbour_country,
       direction,capacity_tier,scheduled_mw,delivery_start,delivery_end,product_type,
       price_per_mwh,currency,counterparty_ref,chain_status,sla_deadline,actor_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'schedule_draft',?,?,?,?)
  `).bind(
    id, user.tenant_id, interconnector_id, interconnector_name, neighbour_utility,
    neighbour_country, direction, tier, mw, delivery_start, delivery_end, product_type,
    price_per_mwh ?? null, currency, counterparty_ref ?? null,
    slaDeadline(tier), user.id, now, now,
  ).run();

  await fireCascade({
    event: 'ics_evt_created',
    actor_id: user.id,
    entity_type: 'interconnector_schedule',
    entity_id: id,
    data: { interconnector_id, direction, scheduled_mw: mw, tier },
    env: c.env,
  });

  return c.json({ data: { id } }, 201);
});

// POST /:id/action
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    `SELECT * FROM oe_interconnector_schedules WHERE id = ? AND tenant_id = ?`
  ).bind(c.req.param('id'), user.tenant_id).first() as Record<string, unknown> | null;
  if (!row) return c.json({ error: 'Not found' }, 404);

  const { action, reason_code, reason_detail } = await c.req.json() as {
    action: IcsAction;
    reason_code?: string;
    reason_detail?: string;
  };

  const currentStatus = row.chain_status as IcsStatus;
  const allowed = ICS_VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(action)) {
    return c.json({ error: `Action ${action} not allowed from ${currentStatus}` }, 400);
  }

  const newStatus = ICS_STATE_TRANSITIONS[action];
  const tier = row.capacity_tier as ReturnType<typeof deriveCapacityTier>;
  const crossesRegulator = crossesIcsIntoRegulator(action, tier);
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    UPDATE oe_interconnector_schedules
    SET chain_status=?, reason_code=?, reason_detail=?,
        nersa_notified=CASE WHEN ? THEN 1 ELSE nersa_notified END,
        actor_id=?, updated_at=?
    WHERE id=?
  `).bind(newStatus, reason_code ?? null, reason_detail ?? null, crossesRegulator ? 1 : 0, user.id, now, row.id).run();

  const eventMap: Record<IcsAction, string> = {
    submit_to_sapp: 'ics_evt_submitted',
    sapp_acknowledge: 'ics_evt_sapp_review',
    receive_counter_schedule: 'ics_evt_counter_received',
    open_negotiation: 'ics_evt_negotiation',
    agree_schedule: 'ics_evt_agreed',
    commence_delivery: 'ics_evt_operating',
    flag_deviation: 'ics_evt_deviated',
    resolve_deviation: 'ics_evt_deviation_resolved',
    complete_delivery: 'ics_evt_completed',
    raise_dispute: 'ics_evt_dispute',
    cancel: 'ics_evt_cancelled',
  };

  await fireCascade({
    event: eventMap[action] as Parameters<typeof fireCascade>[0]['event'],
    actor_id: user.id,
    entity_type: 'interconnector_schedule',
    entity_id: row.id as string,
    data: { prev_status: currentStatus, new_status: newStatus, tier, crosses_regulator: crossesRegulator },
    env: c.env,
  });

  return c.json({ data: { id: row.id, status: newStatus } });
});

export async function interconnectorScheduleSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(`
    SELECT id, tenant_id, capacity_tier, chain_status
    FROM oe_interconnector_schedules
    WHERE chain_status NOT IN ('completed','cancelled')
      AND sla_deadline IS NOT NULL AND sla_deadline < ?
  `).bind(now).all();

  for (const row of results as Record<string, unknown>[]) {
    await env.DB.prepare(`
      UPDATE oe_interconnector_schedules SET chain_status='cancelled', reason_code='sla_breach',
      updated_at=? WHERE id=?
    `).bind(now, row.id).run();
    await fireCascade({
      event: 'ics_evt_sla_breach',
      actor_id: 'system',
      entity_type: 'interconnector_schedule',
      entity_id: row.id as string,
      data: { tier: row.capacity_tier, status_at_breach: row.chain_status },
      env,
    });
  }
}

export default app;
