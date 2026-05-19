// ════════════════════════════════════════════════════════════════════════
// status-deep — incidents, maintenance windows, subscribers, uptime
// history. Drives the L2 /status page to L4/L5 ops-grade depth.
//
// Two routers exported:
//   admin  — auth-protected incident & maintenance & policy mgmt
//   pub    — read-only public surface (uptime history, current incidents,
//             upcoming maintenance, subscriber confirm/unsub by token)
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

export const admin = new Hono<HonoEnv>();
admin.use('*', authMiddleware);

export const pub = new Hono<HonoEnv>();

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const VALID_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved', 'postmortem_published'];

// ─── Incidents (admin) ───────────────────────────────────────────────────
admin.get('/incidents', async (c) => {
  const days = Math.min(180, Math.max(1, Number(c.req.query('days') || 30)));
  const rows = await c.env.DB.prepare(`
    SELECT * FROM oe_status_incidents
    WHERE started_at >= datetime('now', ? || ' days')
    ORDER BY started_at DESC LIMIT 100
  `).bind(`-${days}`).all();
  return c.json({ success: true, data: rows.results || [] });
});

admin.post('/incidents', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.title || !b.severity || !b.affected_components) return c.json({ success: false, error: 'title + severity + affected_components required' }, 400);
  if (!['info', 'minor', 'major', 'critical'].includes(b.severity)) return c.json({ success: false, error: 'invalid severity' }, 400);
  const id = genId('inc');
  await c.env.DB.prepare(`
    INSERT INTO oe_status_incidents
      (id, title, body, severity, status, affected_components, created_by)
    VALUES (?,?,?,?,?,?,?)
  `).bind(
    id, b.title, b.body || null, b.severity,
    b.status || 'investigating',
    JSON.stringify(b.affected_components),
    user.id,
  ).run();
  await c.env.DB.prepare(`
    INSERT INTO oe_status_incident_updates (id, incident_id, status, message, author_id)
    VALUES (?,?,?,?,?)
  `).bind(genId('upd'), id, b.status || 'investigating', b.body || 'Investigating', user.id).run();
  return c.json({ success: true, data: { id } }, 201);
});

admin.post('/incidents/:id/update', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.status || !b.message) return c.json({ success: false, error: 'status + message required' }, 400);
  if (!VALID_STATUSES.includes(b.status)) return c.json({ success: false, error: 'invalid status' }, 400);
  // Get current status to validate transition
  const cur = await c.env.DB.prepare(`SELECT status FROM oe_status_incidents WHERE id = ?`).bind(id).first<any>();
  if (!cur) return c.json({ success: false, error: 'not found' }, 404);
  const isResolution = ['resolved', 'postmortem_published'].includes(b.status);
  const updateSql = isResolution
    ? `UPDATE oe_status_incidents SET status = ?, resolved_at = COALESCE(resolved_at, datetime('now')), updated_at = datetime('now') WHERE id = ?`
    : `UPDATE oe_status_incidents SET status = ?, updated_at = datetime('now') WHERE id = ?`;
  await c.env.DB.prepare(updateSql).bind(b.status, id).run();
  await c.env.DB.prepare(`
    INSERT INTO oe_status_incident_updates (id, incident_id, status, message, author_id)
    VALUES (?,?,?,?,?)
  `).bind(genId('upd'), id, b.status, b.message, user.id).run();
  return c.json({ success: true });
});

admin.post('/incidents/:id/postmortem', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE oe_status_incidents SET status = 'postmortem_published',
      postmortem_url = ?, postmortem_body = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(b.url || null, b.body || null, id).run();
  return c.json({ success: true });
});

admin.get('/incidents/:id', async (c) => {
  const id = c.req.param('id');
  const inc = await c.env.DB.prepare(`SELECT * FROM oe_status_incidents WHERE id = ?`).bind(id).first<any>();
  if (!inc) return c.json({ success: false, error: 'not found' }, 404);
  const ups = await c.env.DB.prepare(`SELECT * FROM oe_status_incident_updates WHERE incident_id = ? ORDER BY created_at ASC`).bind(id).all();
  return c.json({ success: true, data: { incident: inc, updates: ups.results || [] } });
});

// ─── Maintenance windows ────────────────────────────────────────────────
admin.get('/maintenance', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT * FROM oe_status_maintenance_windows
    WHERE ends_at >= datetime('now', '-30 days')
    ORDER BY starts_at DESC LIMIT 100
  `).all();
  return c.json({ success: true, data: rows.results || [] });
});

admin.post('/maintenance', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.title || !b.starts_at || !b.ends_at || !b.affected_components) {
    return c.json({ success: false, error: 'title + starts_at + ends_at + affected_components required' }, 400);
  }
  const id = genId('mwn');
  await c.env.DB.prepare(`
    INSERT INTO oe_status_maintenance_windows
      (id, title, body, affected_components, starts_at, ends_at, status, created_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    id, b.title, b.body || null,
    JSON.stringify(b.affected_components),
    b.starts_at, b.ends_at,
    'scheduled', user.id,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

admin.post('/maintenance/:id/transition', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const to = String(b.to || '');
  if (!['in_progress', 'completed', 'cancelled'].includes(to)) {
    return c.json({ success: false, error: 'invalid transition' }, 400);
  }
  await c.env.DB.prepare(`UPDATE oe_status_maintenance_windows SET status = ? WHERE id = ?`).bind(to, id).run();
  return c.json({ success: true });
});

// ─── Subscribers (admin) ────────────────────────────────────────────────
admin.get('/subscribers', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const rows = await c.env.DB.prepare(`SELECT id, channel, destination, components, verified, unsubscribed_at, created_at FROM oe_status_subscribers ORDER BY created_at DESC LIMIT 500`).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ─── Public — for the /status page ──────────────────────────────────────
pub.get('/incidents', async (c) => {
  const days = Math.min(180, Math.max(1, Number(c.req.query('days') || 30)));
  const inc = await c.env.DB.prepare(`
    SELECT id, title, body, severity, status, affected_components, started_at, resolved_at, postmortem_url
    FROM oe_status_incidents
    WHERE started_at >= datetime('now', ? || ' days')
    ORDER BY started_at DESC LIMIT 50
  `).bind(`-${days}`).all<any>();
  return c.json({ success: true, data: inc.results || [] });
});

pub.get('/incidents/:id', async (c) => {
  const id = c.req.param('id');
  const inc = await c.env.DB.prepare(`SELECT * FROM oe_status_incidents WHERE id = ?`).bind(id).first<any>();
  if (!inc) return c.json({ success: false, error: 'not found' }, 404);
  const ups = await c.env.DB.prepare(`SELECT id, status, message, created_at FROM oe_status_incident_updates WHERE incident_id = ? ORDER BY created_at ASC`).bind(id).all();
  return c.json({ success: true, data: { incident: inc, updates: ups.results || [] } });
});

pub.get('/maintenance', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, title, body, affected_components, starts_at, ends_at, status
    FROM oe_status_maintenance_windows
    WHERE (status = 'scheduled' AND starts_at <= datetime('now', '+30 days'))
       OR (status = 'in_progress')
       OR (status = 'completed' AND ends_at >= datetime('now', '-7 days'))
    ORDER BY starts_at DESC LIMIT 30
  `).all();
  return c.json({ success: true, data: rows.results || [] });
});

pub.get('/uptime', async (c) => {
  const days = Math.min(90, Math.max(1, Number(c.req.query('days') || 30)));
  const rows = await c.env.DB.prepare(`
    SELECT * FROM oe_status_uptime_daily
    WHERE day >= date('now', ? || ' days')
    ORDER BY day ASC
  `).bind(`-${days}`).all();
  return c.json({ success: true, data: rows.results || [] });
});

pub.post('/subscribe', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  const channel = String(b.channel || 'email');
  const destination = String(b.destination || '').trim();
  if (!destination) return c.json({ success: false, error: 'destination required' }, 400);
  if (!['email', 'webhook'].includes(channel)) return c.json({ success: false, error: 'channel must be email|webhook' }, 400);
  // De-dup
  const existing = await c.env.DB.prepare(`SELECT id FROM oe_status_subscribers WHERE destination = ? AND unsubscribed_at IS NULL`).bind(destination).first<any>();
  if (existing) return c.json({ success: true, data: { id: existing.id, message: 'already subscribed' } });
  const id = genId('sub');
  const verifyTok = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const unsubTok  = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
  await c.env.DB.prepare(`
    INSERT INTO oe_status_subscribers
      (id, channel, destination, components, verified, verification_token, unsubscribe_token)
    VALUES (?,?,?,?,?,?,?)
  `).bind(
    id, channel, destination,
    b.components ? JSON.stringify(b.components) : null,
    0, verifyTok, unsubTok,
  ).run();
  return c.json({ success: true, data: { id, verification_url: `/status/verify?token=${verifyTok}` } });
});

pub.get('/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ success: false, error: 'token required' }, 400);
  const row = await c.env.DB.prepare(`SELECT id FROM oe_status_subscribers WHERE verification_token = ? AND verified = 0`).bind(token).first<any>();
  if (!row) return c.json({ success: false, error: 'invalid or already-verified token' }, 404);
  await c.env.DB.prepare(`UPDATE oe_status_subscribers SET verified = 1 WHERE id = ?`).bind(row.id).run();
  return c.json({ success: true, data: { message: 'Subscribed. You will receive incident notifications.' } });
});

pub.get('/unsubscribe', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ success: false, error: 'token required' }, 400);
  const row = await c.env.DB.prepare(`SELECT id FROM oe_status_subscribers WHERE unsubscribe_token = ?`).bind(token).first<any>();
  if (!row) return c.json({ success: false, error: 'invalid token' }, 404);
  await c.env.DB.prepare(`UPDATE oe_status_subscribers SET unsubscribed_at = datetime('now') WHERE id = ?`).bind(row.id).run();
  return c.json({ success: true });
});

export default admin;
