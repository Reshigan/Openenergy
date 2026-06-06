// ═══════════════════════════════════════════════════════════════════════════
// Layer C — Cross-Role Push HTTP surface.
// Reads/mutates oe_role_action_queue for the CURRENT user's role. Every query
// is scoped to (target_role = caller.role) AND (row is role-wide OR addressed
// to the caller's participant id) so a participant-targeted row never leaks
// across tenants. Writes (acknowledge/action/dismiss) are scoped the same way —
// a caller can only mutate rows in their own role+participant scope.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { pendingCountForRole, pendingCacheKey } from '../utils/role-actions';

const roleActions = new Hono<HonoEnv>();
roleActions.use('*', authMiddleware);

// Visibility predicate. Binds (target_role, participant_id).
const SCOPE = `target_role = ? AND (target_participant_id IS NULL OR target_participant_id = ?)`;

function safeParse(s: unknown): unknown {
  if (!s || typeof s !== 'string') return null;
  try { return JSON.parse(s); } catch { return null; }
}

function decodeRow(r: Record<string, unknown>): Record<string, unknown> {
  return { ...r, body: safeParse(r.body_json), cross_option: safeParse(r.cross_option_json) };
}

// GET / — actions for the caller's role (newest first). Optional ?status= filter.
roleActions.get('/', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const sql =
    `SELECT id, target_role, target_participant_id, source_event, source_chain_key,
            source_entity_type, source_entity_id, title, body_json, cross_option_json,
            priority, status, sla_due_at, actioned_by, actioned_at, created_at, updated_at
       FROM oe_role_action_queue
      WHERE ${SCOPE}${status ? ' AND status = ?' : ''}
      ORDER BY created_at DESC LIMIT 200`;
  const binds = status ? [user.role, user.id, status] : [user.role, user.id];
  const rows = await c.env.DB.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  return c.json({ items: (rows.results ?? []).map(decodeRow) });
});

// GET /count — pending badge count for the caller's role, scoped to their participant id (KV-cached via util).
roleActions.get('/count', async (c) => {
  const user = getCurrentUser(c);
  const pending = await pendingCountForRole(c.env, user.role, user.id);
  return c.json({ pending });
});

async function transitionStatus(c: Context<HonoEnv>, next: 'acknowledged' | 'actioned' | 'dismissed') {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const now = new Date().toISOString();
  // actioned_by/actioned_at are only stamped on the terminal 'actioned' transition to avoid
  // false matches on downstream WHERE actioned_by IS NOT NULL queries.
  const actoredBy = next === 'actioned' ? user.id : null;
  const actoredAt = next === 'actioned' ? now : null;
  const res = await c.env.DB.prepare(
    `UPDATE oe_role_action_queue
        SET status = ?, actioned_by = ?, actioned_at = ?, updated_at = ?
      WHERE id = ? AND ${SCOPE}`,
  ).bind(next, actoredBy, actoredAt, now, id, user.role, user.id).run();
  const changes = (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;
  if (!changes) return c.json({ error: 'not_found' }, 404);
  // Invalidate both the role-only key and the caller's participant-scoped key.
  try { await c.env.KV.delete(pendingCacheKey(user.role)); } catch { /* best-effort */ }
  try { await c.env.KV.delete(pendingCacheKey(user.role, user.id)); } catch { /* best-effort */ }
  return c.json({ id, status: next });
}

roleActions.post('/:id/acknowledge', (c) => transitionStatus(c, 'acknowledged'));
roleActions.post('/:id/action', (c) => transitionStatus(c, 'actioned'));
roleActions.post('/:id/dismiss', (c) => transitionStatus(c, 'dismissed'));

export default roleActions;
