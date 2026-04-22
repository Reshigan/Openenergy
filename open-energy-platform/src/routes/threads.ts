// Threads Routes — in-app discussion/commentary on any entity.
// Schema: threads(id, entity_type, entity_id, participant_id, parent_id, content, ...).
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { getTenantId, isAdmin } from '../utils/tenant';

const threads = new Hono<HonoEnv>();
threads.use('*', authMiddleware);

// GET /threads?entity_type=X&entity_id=Y — thread tree for a specific entity.
threads.get('/', async (c) => {
  const entity_type = c.req.query('entity_type');
  const entity_id = c.req.query('entity_id');
  if (!entity_type || !entity_id) {
    return c.json({ success: false, error: 'entity_type and entity_id are required' }, 400);
  }
  const rows = await c.env.DB.prepare(`
    SELECT t.*, p.name AS author_name, p.role AS author_role
    FROM threads t
    JOIN participants p ON t.participant_id = p.id
    WHERE t.entity_type = ? AND t.entity_id = ?
    ORDER BY t.created_at ASC
  `).bind(entity_type, entity_id).all();
  return c.json({ success: true, data: rows.results || [] });
});

// GET /threads/mine — recent comments the caller has participated in or been
// mentioned in. Used by notification drawers.
threads.get('/mine', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(`
    SELECT t.*, p.name AS author_name, p.role AS author_role
    FROM threads t
    JOIN participants p ON t.participant_id = p.id
    WHERE t.participant_id = ? OR t.content LIKE '%@' || (SELECT name FROM participants WHERE id = ?) || '%'
    ORDER BY t.created_at DESC LIMIT 50
  `).bind(user.id, user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

// POST /threads — add a comment.
threads.post('/', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { entity_type, entity_id, content, parent_id } = body as {
    entity_type?: string;
    entity_id?: string;
    content?: string;
    parent_id?: string;
  };
  if (!entity_type || !entity_id || !content || content.trim().length < 1) {
    return c.json({ success: false, error: 'entity_type, entity_id and content are required' }, 400);
  }

  const id = 'th_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO threads (id, entity_type, entity_id, participant_id, parent_id, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, entity_type, entity_id, user.id, parent_id || null, content.trim(), now, now).run();

  // Notify any @mentioned participants (best-effort string match on name).
  // Tenant isolation: only mention targets in the caller's tenant (admins see
  // across tenants).
  const mentionedNames = Array.from(content.matchAll(/@([\w\s]{2,40}?)(?=$|[,\.!\?\s])/g)).map((m) => m[1].trim()).filter(Boolean);
  const notified: string[] = [];
  const callerTenant = getTenantId(c);
  const admin = isAdmin(c);
  for (const name of mentionedNames) {
    const target = admin
      ? await c.env.DB.prepare('SELECT id FROM participants WHERE name = ? LIMIT 1')
          .bind(name).first() as { id?: string } | null
      : await c.env.DB.prepare(
          "SELECT id FROM participants WHERE name = ? AND COALESCE(tenant_id, 'default') = ? LIMIT 1"
        ).bind(name, callerTenant).first() as { id?: string } | null;
    if (target?.id && target.id !== user.id) {
      const nid = 'ntf_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      await c.env.DB.prepare(`
        INSERT INTO notifications (id, participant_id, type, title, body, data, read, email_sent, created_at)
        VALUES (?, ?, 'mention', ?, ?, ?, 0, 0, ?)
      `).bind(nid, target.id, `${user.name || user.id} mentioned you`, content.slice(0, 240), JSON.stringify({ thread_id: id, entity_type, entity_id }), now).run();
      notified.push(target.id);
    }
  }

  await fireCascade({
    event: 'thread.posted',
    actor_id: user.id,
    entity_type,
    entity_id,
    data: { thread_id: id, mentioned: notified },
    env: c.env,
  });

  return c.json({ success: true, data: { id, mentioned: notified } }, 201);
});

// DELETE /threads/:id — author or admin only.
threads.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT participant_id FROM threads WHERE id = ?').bind(id).first() as { participant_id?: string } | null;
  if (!existing) return c.json({ success: false, error: 'Thread not found' }, 404);
  if (existing.participant_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'Not authorized' }, 403);
  }
  await c.env.DB.prepare('DELETE FROM threads WHERE id = ? OR parent_id = ?').bind(id, id).run();
  return c.json({ success: true });
});

export default threads;
