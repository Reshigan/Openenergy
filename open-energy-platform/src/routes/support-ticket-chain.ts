// ═══════════════════════════════════════════════════════════════════════════
// Wave 14 — Support ticket P6 chain routes.
//
// Flat-mounted at /api/support/ticket-chain.
//
// Deepens the L2 support_tickets surface (mig 056) into a regulator-grade
// state machine with priority-tiered SLA windows and audit chain events.
//
// States: open → triaged → in_progress → awaiting_user → resolved → closed
//                                      + escalated (terminal, regulator-inbox
//                                                   crossing for P1/compliance)
//
// Per-priority SLA windows (NIST-/CSAT-aligned, in minutes):
//   priority       triage   first_response   resolution
//   urgent (P1)      60         120              240
//   high   (P2)     120         240             1440
//   normal (P3)     240         480             7200
//   low    (P4)     480        1440            21600
//
// Cross-tenant access from support is audited via support_cross_tenant_access
// (mig 056). Escalations + SLA breaches with P1 or compliance category
// cascade into the regulator inbox via regulator-inbox-spec.
//
// Roles:
//   READ:           admin, support, regulator
//   REPORTER_WRITE: admin, support, + ticket reporter   (user_responded, reopen)
//   SUPPORT_WRITE:  admin, support                      (triage/pick_up/wait/
//                                                        resolve/close/escalate)
//
// 15-minute cron sweep (wired in src/index.ts) records SLA breaches.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  advance,
  slaDueAt,
  slaWindowFor,
  minutesUntilDeadline,
  isSlaBreached,
  isTerminal,
  hasSlaWindow,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  STATUS_LABEL,
  PRIORITY_LABEL,
  type TicketStatus,
  type TicketAction,
  type TicketPriority,
} from '../utils/support-ticket-spec';

const READ_ROLES      = new Set(['admin', 'support', 'regulator']);
const SUPPORT_WRITE   = new Set(['admin', 'support']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface TicketRow {
  id: string;
  ticket_number: string;
  reporter_id: string;
  tenant_id: string | null;
  subject: string;
  description: string | null;
  category: string;
  priority: TicketPriority;
  status: string;
  chain_status: TicketStatus;
  triaged_at: string | null;
  first_responded_at: string | null;
  waiting_since: string | null;
  reopened_at: string | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  next_sla_due_at: string | null;
  next_sla_window: string | null;
  last_sla_breach_at: string | null;
  sla_breach_count: number;
  assignee_id: string | null;
  triaged_by: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  ticket_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  sla_window: string | null;
  actor_id: string | null;
  notes: string | null;
  payload_json: string | null;
  created_at: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function decorate(row: TicketRow, now: Date) {
  const cs = row.chain_status;
  const deadlineStr = hasSlaWindow(cs) ? row.next_sla_due_at : null;
  const deadline = deadlineStr ? new Date(deadlineStr) : null;
  return {
    ...row,
    chain_status_label: STATUS_LABEL[cs] ?? cs,
    priority_label: PRIORITY_LABEL[row.priority] ?? row.priority,
    is_terminal: isTerminal(cs),
    has_sla_window: hasSlaWindow(cs),
    sla_window: slaWindowFor(cs),
    sla_deadline_at: deadlineStr,
    minutes_until_sla: deadline ? minutesUntilDeadline(deadline, now) : null,
    sla_breached: isSlaBreached(deadline, now),
  };
}

function canWriteAsReporter(user: { id: string; role: string }, row: TicketRow): boolean {
  return SUPPORT_WRITE.has(user.role) || user.id === row.reporter_id;
}

// ─── List tickets (+ filter by chain_status, priority, category, assignee) ─
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const cs = c.req.query('chain_status');
  const pr = c.req.query('priority');
  const cat = c.req.query('category');
  const ass = c.req.query('assignee_id');

  let sql = 'SELECT * FROM support_tickets WHERE 1=1';
  const params: unknown[] = [];
  if (cs)  { sql += ' AND chain_status = ?'; params.push(cs); }
  if (pr)  { sql += ' AND priority = ?';     params.push(pr); }
  if (cat) { sql += ' AND category = ?';     params.push(cat); }
  if (ass) { sql += ' AND assignee_id = ?';  params.push(ass); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const now = new Date();
  const rs = await c.env.DB.prepare(sql).bind(...params).all<TicketRow>();
  const rows = (rs.results || []).map((r) => decorate(r, now));

  const by_status: Record<string, number> = {};
  const by_priority: Record<string, number> = {};
  let breached = 0;
  let escalated = 0;
  let open_p1 = 0;
  for (const r of rows) {
    by_status[r.chain_status]   = (by_status[r.chain_status]   ?? 0) + 1;
    by_priority[r.priority]     = (by_priority[r.priority]     ?? 0) + 1;
    if (r.sla_breached)                                breached++;
    if (r.chain_status === 'escalated')                escalated++;
    if (r.priority === 'urgent' && !isTerminal(r.chain_status)) open_p1++;
  }

  return c.json({
    success: true,
    data: {
      items: rows,
      total: rows.length,
      by_status,
      by_priority,
      breached,
      escalated,
      open_p1,
    },
  });
});

// ─── Drill: ticket + event history ─────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const tkt = await c.env.DB
    .prepare('SELECT * FROM support_tickets WHERE id = ?')
    .bind(id)
    .first<TicketRow>();
  if (!tkt) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB
    .prepare('SELECT * FROM oe_support_ticket_events WHERE ticket_id = ? ORDER BY datetime(created_at) DESC LIMIT 200')
    .bind(id)
    .all<EventRow>();

  return c.json({
    success: true,
    data: {
      ticket: decorate(tkt, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────
async function loadTicket(env: HonoEnv['Bindings'], id: string): Promise<TicketRow | null> {
  const row = await env.DB
    .prepare('SELECT * FROM support_tickets WHERE id = ?')
    .bind(id)
    .first<TicketRow>();
  return row ?? null;
}

async function parseBody<T extends object>(req: { json: <U>() => Promise<U> }): Promise<Partial<T>> {
  return req.json<Partial<T>>().catch(() => ({} as Partial<T>));
}

interface TransitionOpts {
  env: HonoEnv['Bindings'];
  ticketId: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  eventType: string;
  slaWindow?: string | null;
  actorId: string;
  notes?: string | null;
  payload?: Record<string, unknown> | null;
  cascadeEvent: string;
  cascadeData: Record<string, unknown>;
}

async function recordTransition(opts: TransitionOpts): Promise<void> {
  const id = newId('supp_tkt_evt');
  await opts.env.DB.prepare(`
    INSERT INTO oe_support_ticket_events (
      id, ticket_id, event_type, from_status, to_status,
      sla_window, actor_id, notes, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, opts.ticketId, opts.eventType, opts.fromStatus, opts.toStatus,
    opts.slaWindow ?? null,
    opts.actorId, opts.notes ?? null,
    opts.payload ? JSON.stringify(opts.payload) : null,
  ).run();

  await fireCascade({
    event: opts.cascadeEvent as never,
    actor_id: opts.actorId,
    entity_type: 'support_tickets',
    entity_id: opts.ticketId,
    data: opts.cascadeData,
    env: opts.env as never,
  });
}

interface AdvanceOpts {
  action: TicketAction;
  eventType: string;
  cascadeEvent: string;
  tsColumn?: keyof TicketRow & string;
  extraSql?: string;
  extraBinds?: unknown[];
  extraCascade?: Record<string, unknown>;
  legacyStatus?: 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';
}

async function applyAdvance(
  c: { env: HonoEnv['Bindings']; req: { param: (k: string) => string; json: <U>() => Promise<U> } },
  user: { id: string; role: string },
  opts: AdvanceOpts,
) {
  const id = c.req.param('id');
  const body = await parseBody<{ notes?: string }>(c.req);
  const row = await loadTicket(c.env, id);
  if (!row) return { kind: 'not_found' as const };

  let r;
  try {
    r = advance(row.chain_status, opts.action);
  } catch (err) {
    return { kind: 'invalid' as const, error: (err as Error).message };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const dueAt = r.setNextSla ? slaDueAt(r.next, row.priority, now)?.toISOString() ?? null : null;
  const window = slaWindowFor(r.next);
  const clearDue = r.clearNextSla;

  const sets: string[] = ['chain_status = ?'];
  const binds: unknown[] = [r.next];
  if (opts.legacyStatus) { sets.push('status = ?'); binds.push(opts.legacyStatus); }
  if (opts.tsColumn)     { sets.push(`${opts.tsColumn} = ?`); binds.push(nowIso); }
  if (dueAt) {
    sets.push('next_sla_due_at = ?', 'next_sla_window = ?');
    binds.push(dueAt, window);
  }
  if (clearDue) {
    sets.push('next_sla_due_at = NULL', 'next_sla_window = NULL');
  }
  sets.push('updated_at = ?');
  binds.push(nowIso);
  if (opts.extraSql) {
    sets.push(opts.extraSql);
    if (opts.extraBinds) binds.push(...opts.extraBinds);
  }
  binds.push(id);
  await c.env.DB.prepare(`UPDATE support_tickets SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds).run();

  const crossed = crossesIntoRegulator(opts.action, row.priority, row.category);
  await recordTransition({
    env: c.env, ticketId: id,
    fromStatus: row.chain_status, toStatus: r.next,
    eventType: opts.eventType, slaWindow: window,
    actorId: user.id, notes: body.notes ?? null,
    payload: { priority: row.priority, category: row.category, ...(opts.extraCascade ?? {}) },
    cascadeEvent: opts.cascadeEvent,
    cascadeData: {
      ticket_number: row.ticket_number,
      priority: row.priority,
      category: row.category,
      chain_status: r.next,
      sla_due_at: dueAt,
      sla_window: window,
      crossed_into_regulator: crossed,
      ...(opts.extraCascade ?? {}),
    },
  });

  return {
    kind: 'ok' as const,
    id,
    chain_status: r.next,
    sla_deadline_at: dueAt,
    sla_window: window,
    crossed_into_regulator: crossed,
  };
}

// ─── POST /:id/triage ─────────────────────────────────────────────────────
app.post('/:id/triage', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !SUPPORT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'triage', eventType: 'triaged', cascadeEvent: 'support.ticket_triaged',
    tsColumn: 'triaged_at',
    extraSql: 'triaged_by = ?, assignee_id = COALESCE(assignee_id, ?)',
    extraBinds: [user.id, user.id],
    legacyStatus: 'in_progress',
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: out.error }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/pick-up ────────────────────────────────────────────────────
app.post('/:id/pick-up', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !SUPPORT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'pick_up', eventType: 'picked_up', cascadeEvent: 'support.ticket_picked_up',
    tsColumn: 'first_responded_at',
    extraSql: 'assignee_id = ?', extraBinds: [user.id],
    legacyStatus: 'in_progress',
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: out.error }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/wait-for-user ──────────────────────────────────────────────
app.post('/:id/wait-for-user', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !SUPPORT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'wait_for_user', eventType: 'wait_for_user',
    cascadeEvent: 'support.ticket_awaiting_user',
    tsColumn: 'waiting_since',
    legacyStatus: 'waiting_on_customer',
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: out.error }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/user-responded ─────────────────────────────────────────────
//   Reporter responds (or support records the response). SLA re-arms.
app.post('/:id/user-responded', async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ success: false, error: 'Forbidden' }, 403);
  const id = c.req.param('id');
  const row = await loadTicket(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  if (!canWriteAsReporter(user, row)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const out = await applyAdvance(c, user, {
    action: 'user_responded', eventType: 'user_responded',
    cascadeEvent: 'support.ticket_user_responded',
    extraSql: 'waiting_since = NULL',
    legacyStatus: 'in_progress',
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: out.error }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/resolve  { resolution? } ───────────────────────────────────
app.post('/:id/resolve', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !SUPPORT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ resolution?: string; notes?: string }>(c.req);
  const row = await loadTicket(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  let r;
  try { r = advance(row.chain_status, 'resolve'); }
  catch (err) { return c.json({ success: false, error: (err as Error).message }, 409); }

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE support_tickets
       SET chain_status = ?, status = 'resolved',
           resolved_at = ?, resolved_by = ?,
           resolution = COALESCE(?, resolution),
           next_sla_due_at = NULL, next_sla_window = NULL,
           updated_at = ?
     WHERE id = ?
  `).bind(r.next, nowIso, user.id, body.resolution ?? null, nowIso, id).run();

  await recordTransition({
    env: c.env, ticketId: id,
    fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'resolved', actorId: user.id, notes: body.notes ?? null,
    payload: { resolution: body.resolution ?? null, priority: row.priority, category: row.category },
    cascadeEvent: 'support.ticket_resolved',
    cascadeData: {
      ticket_number: row.ticket_number,
      priority: row.priority,
      category: row.category,
      chain_status: r.next,
      resolution: body.resolution ?? null,
    },
  });

  return c.json({ success: true, data: { id, chain_status: r.next, resolution: body.resolution ?? null } });
});

// ─── POST /:id/close ──────────────────────────────────────────────────────
app.post('/:id/close', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !SUPPORT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'close', eventType: 'closed', cascadeEvent: 'support.ticket_closed',
    extraSql: 'closed_by = ?', extraBinds: [user.id],
    legacyStatus: 'closed',
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: out.error }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/reopen ─────────────────────────────────────────────────────
app.post('/:id/reopen', async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ success: false, error: 'Forbidden' }, 403);
  const id = c.req.param('id');
  const row = await loadTicket(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  if (!canWriteAsReporter(user, row)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const out = await applyAdvance(c, user, {
    action: 'reopen', eventType: 'reopened',
    cascadeEvent: 'support.ticket_reopened',
    tsColumn: 'reopened_at',
    legacyStatus: 'in_progress',
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: out.error }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/escalate { reason } ────────────────────────────────────────
//   POPIA-grade: P1 or compliance-flagged escalations cross to regulator inbox.
app.post('/:id/escalate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !SUPPORT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ reason?: string; notes?: string }>(c.req);
  if (!body.reason) return c.json({ success: false, error: 'reason required' }, 400);

  const row = await loadTicket(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  let r;
  try { r = advance(row.chain_status, 'escalate'); }
  catch (err) { return c.json({ success: false, error: (err as Error).message }, 409); }

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE support_tickets
       SET chain_status = ?, escalated_at = ?, escalation_reason = ?,
           next_sla_due_at = NULL, next_sla_window = NULL,
           updated_at = ?
     WHERE id = ?
  `).bind(r.next, nowIso, body.reason, nowIso, id).run();

  const crossed = crossesIntoRegulator('escalate', row.priority, row.category);
  await recordTransition({
    env: c.env, ticketId: id,
    fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'escalated', actorId: user.id, notes: body.notes ?? null,
    payload: { reason: body.reason, priority: row.priority, category: row.category },
    cascadeEvent: 'support.ticket_escalated',
    cascadeData: {
      ticket_number: row.ticket_number,
      priority: row.priority,
      category: row.category,
      escalation_reason: body.reason,
      crossed_into_regulator: crossed,
    },
  });

  return c.json({
    success: true,
    data: { id, chain_status: r.next, escalation_reason: body.reason, crossed_into_regulator: crossed },
  });
});

// ─── 15-minute cron: SLA breach sweep across non-terminal tickets ─────────
export async function supportTicketSlaSweep(env: HonoEnv['Bindings']): Promise<{
  evaluated: number; breached: number;
}> {
  const now = new Date();
  const nowIso = now.toISOString();
  let breached = 0;

  const rs = await env.DB.prepare(`
    SELECT * FROM support_tickets
     WHERE chain_status IN ('open','triaged','in_progress')
       AND next_sla_due_at IS NOT NULL
       AND (last_sla_breach_at IS NULL
            OR datetime(last_sla_breach_at) < datetime(?, '-1 hour'))
  `).bind(nowIso).all<TicketRow>();
  const rows = rs.results || [];

  for (const r of rows) {
    const deadline = r.next_sla_due_at ? new Date(r.next_sla_due_at) : null;
    if (!isSlaBreached(deadline, now)) continue;

    await env.DB.prepare(`
      UPDATE support_tickets
         SET last_sla_breach_at = ?,
             sla_breach_count   = sla_breach_count + 1,
             updated_at         = ?
       WHERE id = ?
    `).bind(nowIso, nowIso, r.id).run();

    const window = r.next_sla_window ?? slaWindowFor(r.chain_status);
    const minutesOverdue = deadline ? -(minutesUntilDeadline(deadline, now) ?? 0) : null;

    const evId = newId('supp_tkt_evt');
    await env.DB.prepare(`
      INSERT INTO oe_support_ticket_events (
        id, ticket_id, event_type, from_status, to_status,
        sla_window, actor_id, notes, payload_json
      ) VALUES (?, ?, 'sla_breached', ?, ?, ?, 'system', ?, ?)
    `).bind(
      evId, r.id, r.chain_status, r.chain_status, window,
      `SLA breached in ${r.chain_status} (window=${window ?? '?'}, deadline ${r.next_sla_due_at ?? '?'})`,
      JSON.stringify({ window, deadline: r.next_sla_due_at, minutes_overdue: minutesOverdue }),
    ).run();

    const crossed = slaBreachCrossesIntoRegulator(r.priority, r.category);
    await fireCascade({
      event: 'support.ticket_sla_breached' as never,
      actor_id: 'system',
      entity_type: 'support_tickets',
      entity_id: r.id,
      data: {
        ticket_number: r.ticket_number,
        priority: r.priority,
        category: r.category,
        chain_status: r.chain_status,
        sla_window: window,
        deadline: r.next_sla_due_at,
        minutes_overdue: minutesOverdue,
        crossed_into_regulator: crossed,
      },
      env: env as never,
    });
    breached++;
  }

  return { evaluated: rows.length, breached };
}

export default app;
