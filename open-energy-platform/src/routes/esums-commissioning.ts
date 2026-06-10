// ═══════════════════════════════════════════════════════════════════════════
// Wave 12 — Esums site commissioning chain routes.
//
// Flat-mounted at /api/esums/commissioning.
//
// Deepens the L2 om_sites schema (migration 058) into a regulator-grade
// site onboarding state machine (migration 114):
//
//   planned → site_registered → devices_registered → ingestion_wired
//     → first_telemetry_ok → energised → in_om
//                          (+ commissioning_failed terminal branch)
//                          (+ decommissioned terminal)
//
// Per-state SLAs:
//   • site_registered    → 14d to register_devices
//   • devices_registered → 14d to wire_ingestion
//   • ingestion_wired    →  7d to first_telemetry
//   • first_telemetry_ok → 30d to energise
//
// commissioning_failed + SLA breaches cross into regulator inbox.
//
// Roles (per [[feedback_role_ux_depth]]):
//   • READ_ROLES: admin/support/ipp/grid/regulator
//   • PARTICIPANT writes: ipp + admin/support (full onboarding chain)
//   • REGULATOR writes: regulator (mark_failed, decommission)
//
// Every state-changing mutation fires the matching esums.* cascade.
// Daily 05:00 UTC cron sweep (wired in src/index.ts) breaches SLAs.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  advance,
  slaDueAt,
  daysUntilDeadline,
  isSlaBreached,
  isTerminal,
  hasSlaWindow,
  crossesIntoRegulator,
  STATUS_LABEL,
  type CommissioningStatus,
  type CommissioningAction,
} from '../utils/site-commissioning-spec';

const PARTICIPANT_WRITE = new Set(['admin', 'support', 'ipp', 'ipp_developer']);
const REGULATOR_WRITE   = new Set(['admin', 'support', 'regulator']);
const READ_ROLES        = new Set(['admin', 'support', 'ipp', 'ipp_developer', 'regulator', 'grid', 'grid_operator']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface SiteRow {
  id: string;
  name: string;
  participant_id: string | null;
  project_id: string | null;
  technology: string | null;
  capacity_mw: number;
  province: string | null;
  status: string;
  commissioning_status: CommissioningStatus;
  commissioning_due_at: string | null;
  commissioning_owner_id: string | null;
  commissioning_started_at: string | null;
  devices_registered_at: string | null;
  ingestion_wired_at: string | null;
  first_telemetry_at: string | null;
  energised_at: string | null;
  in_om_at: string | null;
  commissioning_failed_at: string | null;
  commissioning_failure_reason: string | null;
  last_commissioning_sla_breach_at: string | null;
  created_at: string;
}

interface EventRow {
  id: string;
  site_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string;
  actor_id: string;
  notes: string | null;
  evidence_r2_key: string | null;
  body_json: string | null;
  created_at: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function decorate(row: SiteRow, now: Date) {
  const cs = row.commissioning_status;
  const deadline = hasSlaWindow(cs) ? row.commissioning_due_at : null;
  return {
    ...row,
    commissioning_status_label: STATUS_LABEL[cs] ?? cs,
    is_terminal: isTerminal(cs),
    has_sla_window: hasSlaWindow(cs),
    sla_deadline_at: deadline,
    days_until_sla: daysUntilDeadline(deadline, now),
    sla_breached: isSlaBreached(deadline, now),
  };
}

// ─── List sites (+ filter by commissioning_status, participant_id) ─────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const cs = c.req.query('commissioning_status');
  const part = c.req.query('participant_id');
  let sql = 'SELECT * FROM om_sites WHERE 1=1';
  const params: unknown[] = [];

  if (cs)   { sql += ' AND commissioning_status = ?'; params.push(cs); }
  if (part) { sql += ' AND participant_id = ?'; params.push(part); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const now = new Date();
  const rs = await c.env.DB.prepare(sql).bind(...params).all<SiteRow>();
  const rows = (rs.results || []).map((r) => decorate(r, now));

  const by_status: Record<string, number> = {};
  let breached = 0;
  for (const r of rows) {
    by_status[r.commissioning_status] = (by_status[r.commissioning_status] ?? 0) + 1;
    if (r.sla_breached) breached++;
  }

  return c.json({
    success: true,
    data: {
      items: rows,
      total: rows.length,
      by_status,
      breached,
    },
  });
});

// ─── Drill-down: site + event history ──────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const site = await c.env.DB
    .prepare('SELECT * FROM om_sites WHERE id = ?')
    .bind(id)
    .first<SiteRow>();
  if (!site) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB
    .prepare('SELECT * FROM oe_site_commissioning_events WHERE site_id = ? ORDER BY datetime(created_at) DESC LIMIT 200')
    .bind(id)
    .all<EventRow>();

  return c.json({
    success: true,
    data: {
      site: decorate(site, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────
async function loadSite(env: HonoEnv['Bindings'], id: string): Promise<SiteRow | null> {
  const row = await env.DB
    .prepare('SELECT * FROM om_sites WHERE id = ?')
    .bind(id)
    .first<SiteRow>();
  return row ?? null;
}

async function parseBody<T extends object>(req: { json: <U>() => Promise<U> }): Promise<Partial<T>> {
  return req.json<Partial<T>>().catch(() => ({} as Partial<T>));
}

interface RecordOpts {
  env: HonoEnv['Bindings'];
  siteId: string;
  siteName: string;
  fromStatus: CommissioningStatus | null;
  toStatus: CommissioningStatus;
  eventType: string;
  actorId: string;
  notes?: string | null;
  bodyJson?: Record<string, unknown> | null;
  cascadeEvent: string;
  cascadeData: Record<string, unknown>;
}

async function recordTransition(opts: RecordOpts): Promise<void> {
  const id = newId('site_comm_evt');
  await opts.env.DB.prepare(`
    INSERT INTO oe_site_commissioning_events (
      id, site_id, event_type, from_status, to_status,
      actor_id, notes, body_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, opts.siteId, opts.eventType, opts.fromStatus, opts.toStatus,
    opts.actorId, opts.notes ?? null,
    opts.bodyJson ? JSON.stringify(opts.bodyJson) : null,
  ).run();

  await fireCascade({
    event: opts.cascadeEvent as never,
    actor_id: opts.actorId,
    entity_type: 'om_sites',
    entity_id: opts.siteId,
    data: { site_name: opts.siteName, ...opts.cascadeData },
    env: opts.env as never,
  });
}

async function applyAdvance(
  c: { env: HonoEnv['Bindings']; req: { param: (k: string) => string; json: <U>() => Promise<U> } },
  user: { id: string; role: string },
  action: CommissioningAction,
  eventType: string,
  cascadeEvent: string,
  setExtra: (now: Date, nowIso: string, due: string | null) => { sql: string; binds: unknown[] },
  extraCascade?: (row: SiteRow) => Record<string, unknown>,
) {
  const id = c.req.param('id');
  const body = await parseBody<{ notes?: string; evidence_r2_key?: string }>(c.req);
  const row = await loadSite(c.env, id);
  if (!row) return { kind: 'not_found' as const };

  const r = advance({ current: row.commissioning_status, action });
  if (!r.ok) return { kind: 'invalid' as const, error: r.error ?? 'Invalid transition' };

  const now = new Date();
  const nowIso = now.toISOString();
  const due = slaDueAt(r.next, now);
  const upd = setExtra(now, nowIso, due);

  await c.env.DB.prepare(`UPDATE om_sites SET commissioning_status = ?, commissioning_due_at = ?${upd.sql} WHERE id = ?`)
    .bind(r.next, due, ...upd.binds, id).run();

  await recordTransition({
    env: c.env, siteId: id, siteName: row.name,
    fromStatus: row.commissioning_status, toStatus: r.next,
    eventType, actorId: user.id, notes: body.notes ?? null,
    bodyJson: { evidence_r2_key: body.evidence_r2_key ?? null, ...(extraCascade ? extraCascade(row) : {}) },
    cascadeEvent,
    cascadeData: {
      commissioning_status: r.next,
      crossed_into_regulator: crossesIntoRegulator(row.commissioning_status, r.next),
      ...(extraCascade ? extraCascade(row) : {}),
    },
  });

  return { kind: 'ok' as const, id, chain_status: r.next, sla_deadline_at: due };
}

// ─── POST /:id/register-site (planned → site_registered) ───────────────────
app.post('/:id/register-site', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !PARTICIPANT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(
    c, user, 'register_site', 'site_registered', 'esums.site_registered',
    (_now, nowIso) => ({
      sql: ', commissioning_started_at = COALESCE(commissioning_started_at, ?)',
      binds: [nowIso],
    }),
  );
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: out.error }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/register-devices ────────────────────────────────────────────
app.post('/:id/register-devices', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !PARTICIPANT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(
    c, user, 'register_devices', 'devices_registered', 'esums.devices_registered',
    (_now, nowIso) => ({ sql: ', devices_registered_at = ?', binds: [nowIso] }),
  );
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: out.error }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/wire-ingestion ──────────────────────────────────────────────
app.post('/:id/wire-ingestion', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !PARTICIPANT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(
    c, user, 'wire_ingestion', 'ingestion_wired', 'esums.ingestion_wired',
    (_now, nowIso) => ({ sql: ', ingestion_wired_at = ?', binds: [nowIso] }),
  );
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: out.error }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/first-telemetry ─────────────────────────────────────────────
app.post('/:id/first-telemetry', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !PARTICIPANT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(
    c, user, 'first_telemetry', 'first_telemetry_ok', 'esums.first_telemetry_ok',
    (_now, nowIso) => ({ sql: ', first_telemetry_at = ?', binds: [nowIso] }),
  );
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: out.error }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/energise ────────────────────────────────────────────────────
app.post('/:id/energise', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !PARTICIPANT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(
    c, user, 'energise', 'energised', 'esums.site_energised',
    (_now, nowIso) => ({
      sql: ', energised_at = ?, status = CASE WHEN status = \'construction\' THEN \'operational\' ELSE status END',
      binds: [nowIso],
    }),
  );
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: out.error }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/handover-om ─────────────────────────────────────────────────
app.post('/:id/handover-om', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !PARTICIPANT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(
    c, user, 'handover_om', 'in_om', 'esums.site_in_om',
    (_now, nowIso) => ({ sql: ', in_om_at = ?', binds: [nowIso] }),
  );
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: out.error }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/mark-failed { reason } ──────────────────────────────────────
app.post('/:id/mark-failed', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !REGULATOR_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ reason?: string; notes?: string }>(c.req);
  if (!body.reason) return c.json({ success: false, error: 'reason required' }, 400);

  const row = await loadSite(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const r = advance({ current: row.commissioning_status, action: 'mark_failed' });
  if (!r.ok) return c.json({ success: false, error: r.error ?? 'Invalid transition' }, 409);

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE om_sites
       SET commissioning_status = ?, commissioning_failed_at = ?, commissioning_failure_reason = ?
     WHERE id = ?
  `).bind(r.next, nowIso, body.reason, id).run();

  await recordTransition({
    env: c.env, siteId: id, siteName: row.name,
    fromStatus: row.commissioning_status, toStatus: r.next,
    eventType: 'commissioning_failed', actorId: user.id, notes: body.notes ?? null,
    bodyJson: { reason: body.reason, failed_at_status: row.commissioning_status },
    cascadeEvent: 'esums.commissioning_failed',
    cascadeData: {
      failed_at_status: row.commissioning_status,
      reason: body.reason,
      crossed_into_regulator: true,
    },
  });

  return c.json({ success: true, data: { id, commissioning_status: r.next, reason: body.reason } });
});

// ─── POST /:id/decommission ────────────────────────────────────────────────
app.post('/:id/decommission', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !REGULATOR_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ notes?: string }>(c.req);
  const row = await loadSite(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const r = advance({ current: row.commissioning_status, action: 'decommission' });
  if (!r.ok) return c.json({ success: false, error: r.error ?? 'Invalid transition' }, 409);

  await c.env.DB.prepare(`UPDATE om_sites SET commissioning_status = ?, status = 'decommissioned' WHERE id = ?`)
    .bind(r.next, id).run();

  await recordTransition({
    env: c.env, siteId: id, siteName: row.name,
    fromStatus: row.commissioning_status, toStatus: r.next,
    eventType: 'decommissioned', actorId: user.id, notes: body.notes ?? null,
    cascadeEvent: 'esums.site_decommissioned',
    cascadeData: {},
  });

  return c.json({ success: true, data: { id, commissioning_status: r.next } });
});

// ─── Daily cron: SLA breach sweep across non-terminal sites ────────────────
export async function siteCommissioningSlaSweep(env: HonoEnv['Bindings']): Promise<{
  evaluated: number; breached: number;
}> {
  const now = new Date();
  const nowIso = now.toISOString();
  let breached = 0;

  const rs = await env.DB.prepare(`
    SELECT * FROM om_sites
     WHERE commissioning_status IN ('site_registered','devices_registered','ingestion_wired','first_telemetry_ok')
       AND (last_commissioning_sla_breach_at IS NULL OR datetime(last_commissioning_sla_breach_at) < datetime(?, '-1 day'))
  `).bind(nowIso).all<SiteRow>();
  const rows = rs.results || [];

  for (const r of rows) {
    const deadline = r.commissioning_due_at;
    if (!isSlaBreached(deadline, now)) continue;

    await env.DB.prepare(`UPDATE om_sites SET last_commissioning_sla_breach_at = ? WHERE id = ?`)
      .bind(nowIso, r.id).run();

    const evId = newId('site_comm_evt');
    await env.DB.prepare(`
      INSERT INTO oe_site_commissioning_events (
        id, site_id, event_type, from_status, to_status, actor_id, notes, body_json
      ) VALUES (?, ?, 'sla_breached', ?, ?, 'system', ?, ?)
    `).bind(
      evId, r.id, r.commissioning_status, r.commissioning_status,
      `SLA breached in ${r.commissioning_status} (deadline ${deadline ?? '?'})`,
      JSON.stringify({ deadline, days_overdue: -(daysUntilDeadline(deadline, now) ?? 0) }),
    ).run();

    await fireCascade({
      event: 'esums.commissioning_sla_breached' as never,
      actor_id: 'system',
      entity_type: 'om_sites',
      entity_id: r.id,
      data: {
        site_name: r.name,
        commissioning_status: r.commissioning_status,
        deadline,
        days_overdue: -(daysUntilDeadline(deadline, now) ?? 0),
      },
      env: env as never,
    });
    breached++;
  }

  return { evaluated: rows.length, breached };
}

export default app;
