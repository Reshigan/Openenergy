// ════════════════════════════════════════════════════════════════════════
// Notifications inbox — /api/notifications
//
// Surfaces the notifications table (populated by the cascade engine) as
// a real inbox. /briefing/* was day-shaped (returns unread for the
// current 24h); this is per-user lifecycle (paginated, filter by status,
// mark individually).
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const notif = new Hono<HonoEnv>();
notif.use('*', authMiddleware);

// GET /api/notifications?status=unread|all&limit=50&before=ISO
notif.get('/', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status') || 'unread';
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || 50)));
  const before = c.req.query('before');

  const where: string[] = ['participant_id = ?'];
  const binds: unknown[] = [user.id];
  if (status === 'unread') where.push('read = 0');
  else if (status === 'read') where.push('read = 1');
  if (before) { where.push('created_at < ?'); binds.push(before); }

  const rs = await c.env.DB.prepare(
    `SELECT id, type, title, body, data, read, created_at
       FROM notifications
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ?`,
  ).bind(...binds, limit).all();

  const unreadRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE participant_id = ? AND read = 0`,
  ).bind(user.id).first<{ n: number }>();

  return c.json({
    success: true,
    data: {
      notifications: rs.results || [],
      unread_count: Number(unreadRow?.n || 0),
    },
  });
});

// GET /api/notifications/unread-count — cheap lookup for the bell badge.
notif.get('/unread-count', async (c) => {
  const user = getCurrentUser(c);
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE participant_id = ? AND read = 0`,
  ).bind(user.id).first<{ n: number }>();
  return c.json({ success: true, data: { unread_count: Number(row?.n || 0) } });
});

// POST /api/notifications/:id/read — mark one as read.
notif.post('/:id/read', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE notifications SET read = 1 WHERE id = ? AND participant_id = ?`,
  ).bind(id, user.id).run();
  return c.json({ success: true });
});

// POST /api/notifications/mark-all-read — clears the badge.
notif.post('/mark-all-read', async (c) => {
  const user = getCurrentUser(c);
  await c.env.DB.prepare(
    `UPDATE notifications SET read = 1 WHERE participant_id = ? AND read = 0`,
  ).bind(user.id).run();
  return c.json({ success: true });
});

export default notif;
