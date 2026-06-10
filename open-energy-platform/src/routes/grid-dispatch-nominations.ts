// ═══════════════════════════════════════════════════════════════════════════
// Wave 13 — Grid operator dispatch nomination chain routes.
//
// Flat-mounted at /api/grid/dispatch-nominations.
//
// Wraps the day-ahead BRP nomination → SO acceptance → activation →
// performance → settlement workflow as a P6 audit chain.
//
// States: nominated → accepted → activated → performance_recorded →
// settled → closed   (+ nomination_rejected / disputed branches)
//
// Per-stage SLAs:
//   nominated            →  15 m (SO accept/reject)
//   accepted             →  30 m (publish to dispatch instructions)
//   activated            →  60 m (record performance post-delivery)
//   performance_recorded → 5 d  (settlement run)
//   settled              → 15 d (close out window)
//   disputed             → 10 d (resolve dispute)
//
// Rejections, dispute raises and SLA breaches cross into the regulator inbox.
//
// Roles:
//   READ:          admin, support, ipp, grid, regulator, trader
//   PARTICIPANT:   admin, support, ipp, trader  (nominate via brp routes;
//                  here only raise_dispute is participant-write)
//   GRID-OPERATOR: admin, support, grid         (accept/reject/activate/
//                                                record/settle/close)
//   REGULATOR:     admin, support, regulator    (resolve_dispute, close_disputed)
//
// 15-minute cron sweep (wired in src/index.ts) breaches SLAs.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  advance,
  slaDueAt,
  minutesUntilDeadline,
  isSlaBreached,
  isTerminal,
  hasSlaWindow,
  crossesIntoRegulator,
  STATUS_LABEL,
  type NominationStatus,
  type NominationAction,
} from '../utils/dispatch-nomination-spec';

const READ_ROLES        = new Set(['admin', 'support', 'ipp', 'ipp_developer', 'grid', 'grid_operator', 'regulator', 'trader']);
const PARTICIPANT_WRITE = new Set(['admin', 'support', 'ipp', 'ipp_developer', 'trader']);
const GRID_WRITE        = new Set(['admin', 'support', 'grid', 'grid_operator']);
const REGULATOR_WRITE   = new Set(['admin', 'support', 'regulator']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface NominationRow {
  id: string;
  participant_id: string;
  trading_day: string;
  schedule_type: string;
  scheduled_mwh: number | null;
  actual_mwh: number | null;
  imbalance_mwh: number | null;
  charge_zar: number | null;
  nomination_status: NominationStatus;
  rejection_reason: string | null;
  dispute_reason: string | null;
  dispute_resolution: string | null;
  nominated_at: string;
  accepted_at: string | null;
  activated_at: string | null;
  performance_recorded_at: string | null;
  settled_at: string | null;
  closed_at: string | null;
  rejected_at: string | null;
  dispute_raised_at: string | null;
  dispute_resolved_at: string | null;
  next_sla_due_at: string | null;
  last_sla_breach_at: string | null;
  submitted_by: string | null;
  accepted_by: string | null;
  activated_by: string | null;
  settled_by: string | null;
  created_at: string;
}

interface EventRow {
  id: string;
  nomination_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload_json: string | null;
  created_at: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function decorate(row: NominationRow, now: Date) {
  const cs = row.nomination_status;
  const deadlineStr = hasSlaWindow(cs) ? row.next_sla_due_at : null;
  const deadline = deadlineStr ? new Date(deadlineStr) : null;
  return {
    ...row,
    nomination_status_label: STATUS_LABEL[cs] ?? cs,
    is_terminal: isTerminal(cs),
    has_sla_window: hasSlaWindow(cs),
    sla_deadline_at: deadlineStr,
    minutes_until_sla: deadline ? minutesUntilDeadline(deadline, now) : null,
    sla_breached: isSlaBreached(deadline, now),
  };
}

// ─── List nominations (+ filter by status, participant_id, trading_day) ────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const status = c.req.query('nomination_status');
  const part = c.req.query('participant_id');
  const day = c.req.query('trading_day');

  let sql = 'SELECT * FROM oe_dispatch_nominations WHERE 1=1';
  const params: unknown[] = [];
  if (status) { sql += ' AND nomination_status = ?'; params.push(status); }
  if (part)   { sql += ' AND participant_id = ?';   params.push(part); }
  if (day)    { sql += ' AND trading_day = ?';      params.push(day); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const now = new Date();
  const rs = await c.env.DB.prepare(sql).bind(...params).all<NominationRow>();
  const rows = (rs.results || []).map((r) => decorate(r, now));

  const by_status: Record<string, number> = {};
  let breached = 0;
  let total_imbalance_mwh = 0;
  let total_charge_zar = 0;
  for (const r of rows) {
    by_status[r.nomination_status] = (by_status[r.nomination_status] ?? 0) + 1;
    if (r.sla_breached) breached++;
    if (typeof r.imbalance_mwh === 'number') total_imbalance_mwh += r.imbalance_mwh;
    if (typeof r.charge_zar === 'number')    total_charge_zar    += r.charge_zar;
  }

  return c.json({
    success: true,
    data: {
      items: rows,
      total: rows.length,
      by_status,
      breached,
      total_imbalance_mwh,
      total_charge_zar,
    },
  });
});

// ─── Drill-down: nomination + event history ────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const nom = await c.env.DB
    .prepare('SELECT * FROM oe_dispatch_nominations WHERE id = ?')
    .bind(id)
    .first<NominationRow>();
  if (!nom) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB
    .prepare('SELECT * FROM oe_dispatch_nomination_events WHERE nomination_id = ? ORDER BY datetime(created_at) DESC LIMIT 200')
    .bind(id)
    .all<EventRow>();

  return c.json({
    success: true,
    data: {
      nomination: decorate(nom, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────
async function loadNom(env: HonoEnv['Bindings'], id: string): Promise<NominationRow | null> {
  const row = await env.DB
    .prepare('SELECT * FROM oe_dispatch_nominations WHERE id = ?')
    .bind(id)
    .first<NominationRow>();
  return row ?? null;
}

async function parseBody<T extends object>(req: { json: <U>() => Promise<U> }): Promise<Partial<T>> {
  return req.json<Partial<T>>().catch(() => ({} as Partial<T>));
}

interface TransitionOpts {
  env: HonoEnv['Bindings'];
  nomId: string;
  fromStatus: NominationStatus | null;
  toStatus: NominationStatus;
  eventType: string;
  actorId: string;
  notes?: string | null;
  payload?: Record<string, unknown> | null;
  cascadeEvent: string;
  cascadeData: Record<string, unknown>;
}

async function recordTransition(opts: TransitionOpts): Promise<void> {
  const id = newId('disp_nom_evt');
  await opts.env.DB.prepare(`
    INSERT INTO oe_dispatch_nomination_events (
      id, nomination_id, event_type, from_status, to_status,
      actor_id, notes, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, opts.nomId, opts.eventType, opts.fromStatus, opts.toStatus,
    opts.actorId, opts.notes ?? null,
    opts.payload ? JSON.stringify(opts.payload) : null,
  ).run();

  await fireCascade({
    event: opts.cascadeEvent as never,
    actor_id: opts.actorId,
    entity_type: 'oe_dispatch_nominations',
    entity_id: opts.nomId,
    data: opts.cascadeData,
    env: opts.env as never,
  });
}

interface AdvanceOpts {
  action: NominationAction;
  eventType: string;
  cascadeEvent: string;
  tsColumn?: keyof NominationRow & string;
  extraSql?: string;
  extraBinds?: unknown[];
  extraCascade?: Record<string, unknown>;
}

async function applyAdvance(
  c: { env: HonoEnv['Bindings']; req: { param: (k: string) => string; json: <U>() => Promise<U> } },
  user: { id: string; role: string },
  opts: AdvanceOpts,
) {
  const id = c.req.param('id');
  const body = await parseBody<{ notes?: string }>(c.req);
  const row = await loadNom(c.env, id);
  if (!row) return { kind: 'not_found' as const };

  let r;
  try {
    r = advance(row.nomination_status, opts.action);
  } catch (err) {
    return { kind: 'invalid' as const };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const due = r.setNextSla ? slaDueAt(r.next, now)?.toISOString() ?? null : null;
  const clearDue = r.clearNextSla;

  const sets: string[] = ['nomination_status = ?'];
  const binds: unknown[] = [r.next];
  if (opts.tsColumn) { sets.push(`${opts.tsColumn} = ?`); binds.push(nowIso); }
  if (due)        { sets.push('next_sla_due_at = ?'); binds.push(due); }
  if (clearDue)   { sets.push('next_sla_due_at = NULL'); }
  if (opts.extraSql) {
    sets.push(opts.extraSql);
    if (opts.extraBinds) binds.push(...opts.extraBinds);
  }
  binds.push(id);
  await c.env.DB.prepare(`UPDATE oe_dispatch_nominations SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds).run();

  await recordTransition({
    env: c.env, nomId: id,
    fromStatus: row.nomination_status, toStatus: r.next,
    eventType: opts.eventType, actorId: user.id, notes: body.notes ?? null,
    payload: { participant_id: row.participant_id, trading_day: row.trading_day, ...(opts.extraCascade ?? {}) },
    cascadeEvent: opts.cascadeEvent,
    cascadeData: {
      participant_id: row.participant_id,
      trading_day: row.trading_day,
      nomination_status: r.next,
      sla_due_at: due,
      crossed_into_regulator: crossesIntoRegulator(opts.action),
      ...(opts.extraCascade ?? {}),
    },
  });

  return { kind: 'ok' as const, id, nomination_status: r.next, sla_deadline_at: due };
}

// ─── POST /:id/accept ──────────────────────────────────────────────────────
app.post('/:id/accept', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !GRID_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'accept', eventType: 'accepted', cascadeEvent: 'dispatch.accepted',
    tsColumn: 'accepted_at',
    extraSql: 'accepted_by = ?', extraBinds: [user.id],
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/reject { reason } ───────────────────────────────────────────
app.post('/:id/reject', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !GRID_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ reason?: string; notes?: string }>(c.req);
  if (!body.reason) return c.json({ success: false, error: 'reason required' }, 400);

  const row = await loadNom(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  let r;
  try { r = advance(row.nomination_status, 'reject'); }
  catch { return c.json({ success: false, error: 'invalid_transition' }, 409); }

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE oe_dispatch_nominations
       SET nomination_status = ?, rejected_at = ?, rejection_reason = ?, next_sla_due_at = NULL
     WHERE id = ?
  `).bind(r.next, nowIso, body.reason, id).run();

  await recordTransition({
    env: c.env, nomId: id,
    fromStatus: row.nomination_status, toStatus: r.next,
    eventType: 'nomination_rejected', actorId: user.id, notes: body.notes ?? null,
    payload: { reason: body.reason, participant_id: row.participant_id, trading_day: row.trading_day },
    cascadeEvent: 'dispatch.nomination_rejected',
    cascadeData: {
      participant_id: row.participant_id,
      trading_day: row.trading_day,
      rejection_reason: body.reason,
      crossed_into_regulator: true,
    },
  });

  return c.json({ success: true, data: { id, nomination_status: r.next, rejection_reason: body.reason } });
});

// ─── POST /:id/activate ────────────────────────────────────────────────────
app.post('/:id/activate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !GRID_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'activate', eventType: 'activated', cascadeEvent: 'dispatch.activated',
    tsColumn: 'activated_at',
    extraSql: 'activated_by = ?', extraBinds: [user.id],
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/record-performance { actual_mwh } ───────────────────────────
app.post('/:id/record-performance', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !GRID_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ actual_mwh?: number; notes?: string }>(c.req);
  if (typeof body.actual_mwh !== 'number') return c.json({ success: false, error: 'actual_mwh required' }, 400);

  const row = await loadNom(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  let r;
  try { r = advance(row.nomination_status, 'record_performance'); }
  catch { return c.json({ success: false, error: 'invalid_transition' }, 409); }

  const now = new Date();
  const nowIso = now.toISOString();
  const due = slaDueAt(r.next, now)?.toISOString() ?? null;
  const imb = (row.scheduled_mwh != null) ? body.actual_mwh - row.scheduled_mwh : null;

  await c.env.DB.prepare(`
    UPDATE oe_dispatch_nominations
       SET nomination_status = ?, performance_recorded_at = ?,
           actual_mwh = ?, imbalance_mwh = ?, next_sla_due_at = ?
     WHERE id = ?
  `).bind(r.next, nowIso, body.actual_mwh, imb, due, id).run();

  await recordTransition({
    env: c.env, nomId: id,
    fromStatus: row.nomination_status, toStatus: r.next,
    eventType: 'performance_recorded', actorId: user.id, notes: body.notes ?? null,
    payload: { actual_mwh: body.actual_mwh, scheduled_mwh: row.scheduled_mwh, imbalance_mwh: imb },
    cascadeEvent: 'dispatch.performance_recorded',
    cascadeData: {
      participant_id: row.participant_id,
      trading_day: row.trading_day,
      actual_mwh: body.actual_mwh, scheduled_mwh: row.scheduled_mwh, imbalance_mwh: imb,
      sla_due_at: due,
    },
  });

  return c.json({ success: true, data: { id, nomination_status: r.next, imbalance_mwh: imb, sla_deadline_at: due } });
});

// ─── POST /:id/settle { charge_zar } ───────────────────────────────────────
app.post('/:id/settle', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !GRID_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ charge_zar?: number; notes?: string }>(c.req);
  if (typeof body.charge_zar !== 'number') return c.json({ success: false, error: 'charge_zar required' }, 400);

  const row = await loadNom(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  let r;
  try { r = advance(row.nomination_status, 'settle'); }
  catch { return c.json({ success: false, error: 'invalid_transition' }, 409); }

  const now = new Date();
  const nowIso = now.toISOString();
  const due = slaDueAt(r.next, now)?.toISOString() ?? null;

  await c.env.DB.prepare(`
    UPDATE oe_dispatch_nominations
       SET nomination_status = ?, settled_at = ?, settled_by = ?,
           charge_zar = ?, next_sla_due_at = ?
     WHERE id = ?
  `).bind(r.next, nowIso, user.id, body.charge_zar, due, id).run();

  await recordTransition({
    env: c.env, nomId: id,
    fromStatus: row.nomination_status, toStatus: r.next,
    eventType: 'settled', actorId: user.id, notes: body.notes ?? null,
    payload: { charge_zar: body.charge_zar, imbalance_mwh: row.imbalance_mwh },
    cascadeEvent: 'dispatch.settled',
    cascadeData: {
      participant_id: row.participant_id,
      trading_day: row.trading_day,
      charge_zar: body.charge_zar,
      imbalance_mwh: row.imbalance_mwh,
      sla_due_at: due,
    },
  });

  return c.json({ success: true, data: { id, nomination_status: r.next, charge_zar: body.charge_zar, sla_deadline_at: due } });
});

// ─── POST /:id/close ───────────────────────────────────────────────────────
app.post('/:id/close', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !GRID_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'close', eventType: 'closed', cascadeEvent: 'dispatch.closed',
    tsColumn: 'closed_at',
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/raise-dispute { reason } ────────────────────────────────────
app.post('/:id/raise-dispute', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !PARTICIPANT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ reason?: string; notes?: string }>(c.req);
  if (!body.reason) return c.json({ success: false, error: 'reason required' }, 400);

  const row = await loadNom(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  let r;
  try { r = advance(row.nomination_status, 'raise_dispute'); }
  catch { return c.json({ success: false, error: 'invalid_transition' }, 409); }

  const now = new Date();
  const nowIso = now.toISOString();
  const due = slaDueAt(r.next, now)?.toISOString() ?? null;

  await c.env.DB.prepare(`
    UPDATE oe_dispatch_nominations
       SET nomination_status = ?, dispute_raised_at = ?,
           dispute_reason = ?, next_sla_due_at = ?
     WHERE id = ?
  `).bind(r.next, nowIso, body.reason, due, id).run();

  await recordTransition({
    env: c.env, nomId: id,
    fromStatus: row.nomination_status, toStatus: r.next,
    eventType: 'dispute_raised', actorId: user.id, notes: body.notes ?? null,
    payload: { reason: body.reason, participant_id: row.participant_id, trading_day: row.trading_day },
    cascadeEvent: 'dispatch.dispute_raised',
    cascadeData: {
      participant_id: row.participant_id,
      trading_day: row.trading_day,
      dispute_reason: body.reason,
      sla_due_at: due,
      crossed_into_regulator: true,
    },
  });

  return c.json({ success: true, data: { id, nomination_status: r.next, dispute_reason: body.reason, sla_deadline_at: due } });
});

// ─── POST /:id/resolve-dispute { resolution } ──────────────────────────────
app.post('/:id/resolve-dispute', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !REGULATOR_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ resolution?: string; notes?: string }>(c.req);
  if (!body.resolution) return c.json({ success: false, error: 'resolution required' }, 400);

  const row = await loadNom(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  let r;
  try { r = advance(row.nomination_status, 'resolve_dispute'); }
  catch { return c.json({ success: false, error: 'invalid_transition' }, 409); }

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE oe_dispatch_nominations
       SET nomination_status = ?, dispute_resolved_at = ?,
           dispute_resolution = ?, next_sla_due_at = NULL
     WHERE id = ?
  `).bind(r.next, nowIso, body.resolution, id).run();

  await recordTransition({
    env: c.env, nomId: id,
    fromStatus: row.nomination_status, toStatus: r.next,
    eventType: 'dispute_resolved', actorId: user.id, notes: body.notes ?? null,
    payload: { resolution: body.resolution },
    cascadeEvent: 'dispatch.dispute_resolved',
    cascadeData: {
      participant_id: row.participant_id,
      trading_day: row.trading_day,
      dispute_resolution: body.resolution,
    },
  });

  return c.json({ success: true, data: { id, nomination_status: r.next, dispute_resolution: body.resolution } });
});

// ─── POST /:id/close-disputed ──────────────────────────────────────────────
app.post('/:id/close-disputed', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !REGULATOR_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'close_disputed', eventType: 'closed_disputed',
    cascadeEvent: 'dispatch.closed_disputed',
    tsColumn: 'closed_at',
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── 15-minute cron: SLA breach sweep across non-terminal nominations ─────
export async function dispatchNominationSlaSweep(env: HonoEnv['Bindings']): Promise<{
  evaluated: number; breached: number;
}> {
  const now = new Date();
  const nowIso = now.toISOString();
  let breached = 0;

  const rs = await env.DB.prepare(`
    SELECT * FROM oe_dispatch_nominations
     WHERE nomination_status IN (
       'nominated','accepted','activated',
       'performance_recorded','settled','disputed'
     )
       AND next_sla_due_at IS NOT NULL
       AND (last_sla_breach_at IS NULL
            OR datetime(last_sla_breach_at) < datetime(?, '-1 hour'))
  `).bind(nowIso).all<NominationRow>();
  const rows = rs.results || [];

  for (const r of rows) {
    const deadline = r.next_sla_due_at ? new Date(r.next_sla_due_at) : null;
    if (!isSlaBreached(deadline, now)) continue;

    await env.DB.prepare('UPDATE oe_dispatch_nominations SET last_sla_breach_at = ? WHERE id = ?')
      .bind(nowIso, r.id).run();

    const evId = newId('disp_nom_evt');
    await env.DB.prepare(`
      INSERT INTO oe_dispatch_nomination_events (
        id, nomination_id, event_type, from_status, to_status, actor_id, notes, payload_json
      ) VALUES (?, ?, 'sla_breached', ?, ?, 'system', ?, ?)
    `).bind(
      evId, r.id, r.nomination_status, r.nomination_status,
      `SLA breached in ${r.nomination_status} (deadline ${r.next_sla_due_at ?? '?'})`,
      JSON.stringify({
        deadline: r.next_sla_due_at,
        minutes_overdue: deadline ? -(minutesUntilDeadline(deadline, now) ?? 0) : null,
      }),
    ).run();

    await fireCascade({
      event: 'dispatch.sla_breached' as never,
      actor_id: 'system',
      entity_type: 'oe_dispatch_nominations',
      entity_id: r.id,
      data: {
        participant_id: r.participant_id,
        trading_day: r.trading_day,
        nomination_status: r.nomination_status,
        deadline: r.next_sla_due_at,
        minutes_overdue: deadline ? -(minutesUntilDeadline(deadline, now) ?? 0) : null,
      },
      env: env as never,
    });
    breached++;
  }

  return { evaluated: rows.length, breached };
}

export default app;
