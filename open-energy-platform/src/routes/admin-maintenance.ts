// ═══════════════════════════════════════════════════════════════════════════
// Login maintenance mode — mounted at /api/admin/maintenance. Admin only.
//
// auth.ts:/login reads this read-only from KV key 'auth:maintenance'. Any
// truthy value blocks login for every role EXCEPT 'admin' — admin keeps an
// escape hatch so the switch is never a self-lockout, mirroring the halt
// pattern in admin-market-halt.ts (who/why/when lives in a sibling ':meta'
// key). Existing sessions (already-issued JWTs) are unaffected; this only
// gates the /login POST itself.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const KEY = 'auth:maintenance';
const META_KEY = 'auth:maintenance:meta';

type Meta = { reason?: string; actor_id?: string; set_at?: string };

r.get('/', async (c) => {
  const active = !!(await c.env.KV?.get(KEY));
  let meta: Meta = {};
  if (active) {
    try { meta = JSON.parse((await c.env.KV?.get(META_KEY)) || '{}'); } catch { meta = {}; }
  }
  return c.json({ success: true, data: { active, reason: meta.reason || null, set_by: meta.actor_id || null, set_at: meta.set_at || null } });
});

r.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'Admin only' }, 403);
  if (!c.env.KV) return c.json({ success: false, error: 'KV unavailable' }, 503);

  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason || '').trim();
  if (reason.length < 3) return c.json({ success: false, error: 'A reason is required to enable maintenance mode' }, 400);

  const set_at = new Date().toISOString();
  await c.env.KV.put(KEY, 'on');
  await c.env.KV.put(META_KEY, JSON.stringify({ reason, actor_id: user.id, set_at } satisfies Meta));

  await fireCascade({
    event: 'auth.maintenance_enabled',
    actor_id: user.id,
    entity_type: 'platform',
    entity_id: 'login',
    data: { reason },
    env: c.env,
  });

  return c.json({ success: true, data: { active: true, reason, set_by: user.id, set_at } });
});

r.post('/lift', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'Admin only' }, 403);
  if (!c.env.KV) return c.json({ success: false, error: 'KV unavailable' }, 503);

  const prior = await c.env.KV.get(KEY);
  if (!prior) return c.json({ success: false, error: 'Maintenance mode is not active' }, 400);

  await c.env.KV.delete(KEY);
  await c.env.KV.delete(META_KEY);

  await fireCascade({
    event: 'auth.maintenance_lifted',
    actor_id: user.id,
    entity_type: 'platform',
    entity_id: 'login',
    data: {},
    env: c.env,
  });

  return c.json({ success: true, data: { active: false, lifted_by: user.id } });
});

export default r;
