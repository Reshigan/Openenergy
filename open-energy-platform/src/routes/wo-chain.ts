// ═══════════════════════════════════════════════════════════════════════════
// Wave 16 — Work Order dispatch chain (Esums O&M).
//
// Mounted at /api/esums/wo-chain.
//
// 12-state machine layered on om_work_orders, priority-tiered SLAs.
// Critical priority crosses into regulator inbox on cancel or SLA breach.
//
// Roles:
//   READ:  admin, om, esums, ipp, support, regulator
//   WRITE: admin, om, esums
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  advance,
  slaDueAt,
  isTerminal,
  isPriority,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  SLA_MINUTES,
  type WoStatus,
  type WoAction,
  type WoPriority,
} from '../utils/wo-chain-spec';

const READ_ROLES  = new Set(['admin', 'om', 'esums', 'ipp', 'ipp_developer', 'support', 'regulator', 'esco']);
const WRITE_ROLES = new Set(['admin', 'om', 'esums', 'esco']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface WoRow {
  id: string;
  wo_number: string;
  site_id: string;
  fault_id: string | null;
  category: string;
  priority: WoPriority;
  status: WoStatus;
  chain_status: WoStatus;
  assigned_to: string | null;
  contractor_id: string | null;
  title: string | null;
  description: string | null;
  sla_response_minutes: number | null;
  sla_resolve_hours: number | null;
  sla_deadline: string | null;
  sla_breached: number;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_at: string;
  assigned_at: string | null;
  acknowledged_at: string | null;
  en_route_at: string | null;
  on_site_at: string | null;
  completed_at: string | null;
  verified_at: string | null;
  closed_at: string | null;
  resolution_notes: string | null;
}

interface EventRow {
  id: string;
  wo_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function minutesUntil(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  return Math.round((new Date(deadline).getTime() - now.getTime()) / 60000);
}

function decorate(row: WoRow, now: Date) {
  const breach = row.sla_deadline ? new Date(row.sla_deadline).getTime() < now.getTime() : false;
  return {
    ...row,
    is_terminal: isTerminal(row.chain_status),
    minutes_until_sla: minutesUntil(row.sla_deadline, now),
    sla_breached: !!row.sla_breached || (!isTerminal(row.chain_status) && breach),
  };
}

// ─── List WOs (+ filters) ─────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const cs = c.req.query('chain_status');
  const pri = c.req.query('priority');
  const site = c.req.query('site_id');
  const tech = c.req.query('assigned_to');

  let sql = 'SELECT * FROM om_work_orders WHERE 1=1';
  const params: unknown[] = [];
  if (cs)   { sql += ' AND chain_status = ?'; params.push(cs); }
  if (pri)  { sql += ' AND priority = ?';     params.push(pri); }
  if (site) { sql += ' AND site_id = ?';      params.push(site); }
  if (tech) { sql += ' AND assigned_to = ?';  params.push(tech); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const now = new Date();
  const rs = await c.env.DB.prepare(sql).bind(...params).all<WoRow>();
  const rows = (rs.results || []).map((r) => decorate(r, now));

  const by_status: Record<string, number> = {};
  const by_priority: Record<string, number> = {};
  let breached = 0;
  let critical_open = 0;
  let escalated = 0;
  for (const r of rows) {
    by_status[r.chain_status] = (by_status[r.chain_status] ?? 0) + 1;
    by_priority[r.priority]   = (by_priority[r.priority]   ?? 0) + 1;
    if (r.sla_breached) breached++;
    if (r.priority === 'critical' && !isTerminal(r.chain_status)) critical_open++;
    if (r.escalation_level > 0) escalated++;
  }

  return c.json({
    success: true,
    data: {
      items: rows,
      total: rows.length,
      by_status,
      by_priority,
      breached,
      critical_open,
      escalated,
    },
  });
});

// ─── Drill: WO + audit chain ────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM om_work_orders WHERE id = ?').bind(id).first<WoRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM om_wo_chain_events WHERE wo_id = ? ORDER BY datetime(created_at) ASC'
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      wo: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Transition helper ─────────────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  id: string,
  action: WoAction,
  eventType: string,
  notes?: string,
): Promise<Response> {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const row = await c.env.DB.prepare('SELECT * FROM om_work_orders WHERE id = ?').bind(id).first<WoRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  let next: WoStatus;
  try { next = advance(row.chain_status, action); }
  catch { return c.json({ success: false, error: 'invalid_transition' }, 409); }

  const now = new Date();
  const sla = slaDueAt(next, row.priority, now);

  const updates: string[] = ['chain_status = ?', 'status = ?', 'updated_at = ?', 'sla_deadline = ?'];
  const bindings: unknown[] = [next, next, now.toISOString(), sla || null];

  const tsCol: Record<WoAction, string | null> = {
    assign: 'assigned_at',
    acknowledge: 'acknowledged_at',
    depart: 'en_route_at',
    arrive: 'on_site_at',
    diagnose: null,
    repair: null,
    test: null,
    complete: 'completed_at',
    verify: 'verified_at',
    close: 'closed_at',
    cancel: 'closed_at',
  };
  const tsField = tsCol[action];
  if (tsField) {
    updates.push(`${tsField} = ?`);
    bindings.push(now.toISOString());
  }

  bindings.push(id);
  await c.env.DB.prepare(`UPDATE om_work_orders SET ${updates.join(', ')} WHERE id = ?`).bind(...bindings).run();

  const evtId = newId('wo_evt');
  await c.env.DB.prepare(
    'INSERT INTO om_wo_chain_events (id, wo_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(evtId, id, eventType, row.chain_status, next, user.id, notes ?? null, '{}', now.toISOString()).run();

  await fireCascade({
    event: `wo.${eventType}` as never,
    actor_id: user.id,
    entity_type: 'work_order',
    entity_id: id,
    data: {
      wo_number: row.wo_number,
      site_id: row.site_id,
      priority: row.priority,
      from_status: row.chain_status,
      to_status: next,
      crosses_to_regulator: crossesIntoRegulator(action, row.priority),
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, chain_status: next, sla_deadline: sla } });
}

// Transition endpoints
app.post('/:id/assign',      (c) => transition(c, c.req.param('id'), 'assign',      'assigned'));
app.post('/:id/acknowledge', (c) => transition(c, c.req.param('id'), 'acknowledge', 'acknowledged'));
app.post('/:id/depart',      (c) => transition(c, c.req.param('id'), 'depart',      'departed'));
app.post('/:id/arrive',      (c) => transition(c, c.req.param('id'), 'arrive',      'arrived'));
app.post('/:id/diagnose',    (c) => transition(c, c.req.param('id'), 'diagnose',    'diagnosed'));
app.post('/:id/repair',      (c) => transition(c, c.req.param('id'), 'repair',      'repair_started'));
app.post('/:id/test',        (c) => transition(c, c.req.param('id'), 'test',        'tested'));
app.post('/:id/complete',    (c) => transition(c, c.req.param('id'), 'complete',    'completed'));
app.post('/:id/verify',      (c) => transition(c, c.req.param('id'), 'verify',      'verified'));
app.post('/:id/close',       (c) => transition(c, c.req.param('id'), 'close',       'closed'));
app.post('/:id/cancel',      (c) => transition(c, c.req.param('id'), 'cancel',      'cancelled'));

// ─── 15-minute SLA sweep ───────────────────────────────────────────────────
export async function woChainSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM om_work_orders
       WHERE chain_status NOT IN ('closed', 'cancelled')
         AND sla_deadline IS NOT NULL
         AND datetime(sla_deadline) < datetime('now')
         AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(?))`
  ).bind(oneHourAgo).all<WoRow>();

  let breached = 0;
  for (const row of (rs.results || [])) {
    if (!isPriority(row.priority)) continue;

    await env.DB.prepare(
      'UPDATE om_work_orders SET sla_breached = 1, last_sla_breach_at = ?, escalation_level = escalation_level + 1 WHERE id = ?'
    ).bind(now.toISOString(), row.id).run();

    const evtId = newId('wo_evt');
    const slaMins = SLA_MINUTES[row.chain_status]?.[row.priority] ?? 0;
    await env.DB.prepare(
      'INSERT INTO om_wo_chain_events (id, wo_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(evtId, row.id, 'sla_breached', row.chain_status, row.chain_status, 'system', `Breached ${slaMins}m SLA`, '{}', now.toISOString()).run();

    await fireCascade({
      event: 'wo.sla_breached',
      actor_id: 'system',
      entity_type: 'work_order',
      entity_id: row.id,
      data: {
        wo_number: row.wo_number,
        site_id: row.site_id,
        priority: row.priority,
        chain_status: row.chain_status,
        sla_window: `${slaMins}m`,
        crosses_to_regulator: slaBreachCrossesIntoRegulator(row.priority),
      },
      env,
    });
    breached++;
  }

  return { scanned: (rs.results || []).length, breached };
}

export default app;
