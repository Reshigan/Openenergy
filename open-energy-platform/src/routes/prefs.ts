// src/routes/prefs.ts — per-user view preferences (Ease customisation engine).
// GET/PUT /api/prefs/:scope — pins/hidden/order for one surface scope_key, scoped
// to the signed-in user (participant_id). Powers useViewPrefs on Horizon + Atlas.
// No cascade: these are personal UI prefs, not auditable domain events.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const prefs = new Hono<HonoEnv>();
prefs.use('*', authMiddleware);

// scope_key allow-list shape (only ever bound as a ? param, but validate anyway).
const SCOPE_RE = /^[a-z0-9:_-]{1,64}$/i;

// Persist only the known pref arrays, capped, stringified — never arbitrary JSON.
function clean(body: any): { pins: string[]; hidden: string[]; order: string[] } {
  const arr = (v: unknown, cap: number) =>
    Array.isArray(v) ? v.slice(0, cap).map((x) => String(x).slice(0, 128)) : [];
  return { pins: arr(body?.pins, 100), hidden: arr(body?.hidden, 200), order: arr(body?.order, 300) };
}

prefs.get('/:scope', async (c) => {
  const user = getCurrentUser(c);
  const scope = c.req.param('scope');
  if (!SCOPE_RE.test(scope)) return c.json({ success: false, error: 'invalid scope' }, 400);
  const row = await c.env.DB
    .prepare(`SELECT prefs_json FROM user_view_prefs WHERE participant_id = ? AND scope_key = ?`)
    .bind(user.id, scope)
    .first<{ prefs_json: string }>()
    .catch(() => null);
  let data: unknown = { pins: [], hidden: [], order: [] };
  if (row?.prefs_json) { try { data = JSON.parse(row.prefs_json); } catch { /* default */ } }
  return c.json({ success: true, data });
});

prefs.put('/:scope', async (c) => {
  const user = getCurrentUser(c);
  const scope = c.req.param('scope');
  if (!SCOPE_RE.test(scope)) return c.json({ success: false, error: 'invalid scope' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const value = clean(body);
  // Deterministic id keyed to (user, scope) so the UNIQUE upsert always targets
  // the one row; tenant_id carried for isolation/reporting.
  const id = `vp_${user.id}_${scope}`.slice(0, 120);
  await c.env.DB
    .prepare(
      `INSERT INTO user_view_prefs (id, participant_id, tenant_id, scope_key, prefs_json, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(participant_id, scope_key)
         DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = datetime('now')`,
    )
    .bind(id, user.id, user.tenant_id ?? null, scope, JSON.stringify(value))
    .run();
  return c.json({ success: true, data: value });
});

export default prefs;
