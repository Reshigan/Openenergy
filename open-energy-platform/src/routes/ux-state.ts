// ════════════════════════════════════════════════════════════════════════
// ux-state — per-user UI state surfaces:
//   • Saved filters per workstation surface (name + JSON)
//   • First-run onboarding completion ticks
//   • Inline help / tooltip dismissals
//
// Mounted at /api/ux-state. All endpoints scoped to the caller.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ─── Saved filters ─────────────────────────────────────────────────────
r.get('/filters', async (c) => {
  const user = getCurrentUser(c);
  const surface = c.req.query('surface');
  const own = await c.env.DB.prepare(`
    SELECT id, surface, name, filter_json, shared, created_at, updated_at
    FROM oe_saved_filters
    WHERE user_id = ? ${surface ? 'AND surface = ?' : ''}
    ORDER BY updated_at DESC
  `).bind(...(surface ? [user.id, surface] : [user.id])).all().catch(() => ({ results: [] as any[] }));
  const shared = await c.env.DB.prepare(`
    SELECT id, surface, name, filter_json, shared, created_at, updated_at, user_id AS owner_id
    FROM oe_saved_filters
    WHERE shared = 1 AND (shared_role = ? OR shared_role IS NULL) AND user_id <> ?
      ${surface ? 'AND surface = ?' : ''}
    ORDER BY updated_at DESC
  `).bind(...(surface ? [user.role, user.id, surface] : [user.role, user.id])).all().catch(() => ({ results: [] as any[] }));
  return c.json({ success: true, data: { own: own.results || [], shared: shared.results || [] } });
});

r.post('/filters', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.surface || !b.name || !b.filter_json) {
    return c.json({ success: false, error: 'surface + name + filter_json required' }, 400);
  }
  const id = genId('flt');
  // Upsert by (user_id, surface, name).
  await c.env.DB.prepare(`
    INSERT INTO oe_saved_filters (id, user_id, surface, name, filter_json, shared, shared_role)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id, surface, name) DO UPDATE SET
      filter_json = excluded.filter_json,
      shared = excluded.shared,
      shared_role = excluded.shared_role,
      updated_at = datetime('now')
  `).bind(
    id, user.id, b.surface, String(b.name).slice(0, 100), JSON.stringify(b.filter_json),
    b.shared ? 1 : 0, b.shared ? (b.shared_role || user.role) : null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

r.delete('/filters/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const res = await c.env.DB.prepare(
    `DELETE FROM oe_saved_filters WHERE id = ? AND user_id = ?`
  ).bind(id, user.id).run();
  if (!res.meta.changes) return c.json({ success: false, error: 'not found or not owner' }, 404);
  return c.json({ success: true });
});

// ─── Onboarding ────────────────────────────────────────────────────────
r.get('/onboarding', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(
    `SELECT step_key, completed_at FROM oe_onboarding_state WHERE user_id = ?`
  ).bind(user.id).all().catch(() => ({ results: [] as any[] }));
  const completed = new Set(((rows.results || []) as Array<{ step_key: string }>).map((r) => r.step_key));
  return c.json({ success: true, data: { completed: [...completed] } });
});

r.post('/onboarding/:step_key/complete', async (c) => {
  const user = getCurrentUser(c);
  const step = c.req.param('step_key');
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO oe_onboarding_state (user_id, step_key) VALUES (?,?)`
  ).bind(user.id, step).run();
  return c.json({ success: true });
});

// ─── Inline help dismissals ────────────────────────────────────────────
r.get('/help-dismissals', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(
    `SELECT help_key, dismissed_at FROM oe_help_dismissals WHERE user_id = ?`
  ).bind(user.id).all().catch(() => ({ results: [] as any[] }));
  const dismissed = new Set(((rows.results || []) as Array<{ help_key: string }>).map((r) => r.help_key));
  return c.json({ success: true, data: { dismissed: [...dismissed] } });
});

r.post('/help-dismissals/:help_key', async (c) => {
  const user = getCurrentUser(c);
  const key = c.req.param('help_key');
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO oe_help_dismissals (user_id, help_key) VALUES (?,?)`
  ).bind(user.id, key).run();
  return c.json({ success: true });
});

r.delete('/help-dismissals/:help_key', async (c) => {
  const user = getCurrentUser(c);
  const key = c.req.param('help_key');
  await c.env.DB.prepare(
    `DELETE FROM oe_help_dismissals WHERE user_id = ? AND help_key = ?`
  ).bind(user.id, key).run();
  return c.json({ success: true });
});

export default r;
