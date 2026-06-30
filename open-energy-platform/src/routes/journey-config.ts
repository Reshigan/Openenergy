// src/routes/journey-config.ts — journey feature governance + per-action charge.
// Admin crafts, per role, which functionality is required / optional / unavailable
// and what (if anything) an action costs. The cockpit reads its own role's config
// (admin reads any); only admin writes. Stored as overrides over a derived default,
// so the cockpit degrades gracefully when nothing is set.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const jc = new Hono<HonoEnv>();
jc.use('*', authMiddleware);

const isAdmin = (r: string) => r === 'admin';
const STATUS = new Set(['required', 'optional', 'unavailable']);

// GET /api/journey-config/:role → { [feature_key]: {status, charge_zar, charge_event} }
jc.get('/:role', async (c) => {
  const user = getCurrentUser(c);
  const role = c.req.param('role');
  if (user.role !== role && !isAdmin(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const rs = await c.env.DB
    .prepare(`SELECT feature_key, status, charge_zar, charge_event FROM journey_feature_config WHERE role = ?`)
    .bind(role).all().catch(() => ({ results: [] as any[] }));
  const map: Record<string, { status: string; charge_zar: number | null; charge_event: string | null }> = {};
  for (const r of (rs.results || []) as any[]) {
    map[r.feature_key] = { status: r.status, charge_zar: r.charge_zar ?? null, charge_event: r.charge_event ?? null };
  }
  return c.json({ success: true, data: map });
});

// PUT /api/journey-config/:role/:feature — admin upsert of a feature's status + charge.
jc.put('/:role/:feature', async (c) => {
  const user = getCurrentUser(c);
  if (!isAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const role = c.req.param('role');
  const feature = c.req.param('feature');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = STATUS.has(String(b.status)) ? String(b.status) : 'optional';
  const charge_zar = typeof b.charge_zar === 'number' && b.charge_zar >= 0 ? b.charge_zar : null;
  const charge_event = typeof b.charge_event === 'string' && b.charge_event ? b.charge_event.slice(0, 64) : null;
  const id = `jfc_${role}_${feature}`.slice(0, 120);
  await c.env.DB.prepare(
    `INSERT INTO journey_feature_config (id, role, feature_key, status, charge_zar, charge_event, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(role, feature_key) DO UPDATE SET
       status = excluded.status, charge_zar = excluded.charge_zar,
       charge_event = excluded.charge_event, updated_by = excluded.updated_by, updated_at = datetime('now')`,
  ).bind(id, role, feature, status, charge_zar, charge_event, user.id).run();
  return c.json({ success: true, data: { role, feature, status, charge_zar, charge_event } });
});

export default jc;
