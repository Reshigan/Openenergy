// Threads Routes - Comments on entities
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const threads = new Hono<HonoEnv>();
threads.use('*', authMiddleware);

// GET /threads?entity_type=X&entity_id=Y
threads.get('/', async (c) => {
  const entity_type = c.req.query('entity_type');
  const entity_id = c.req.query('entity_id');
  const threads_list = await c.env.DB.prepare(`
    SELECT t.*, p.name as author_name 
    FROM threads t 
    JOIN participants p ON t.author_id = p.id 
    WHERE t.entity_type = ? AND t.entity_id = ?
    ORDER BY t.created_at ASC
  `).bind(entity_type, entity_id).all();
  return c.json({ success: true, data: threads_list.results || [] });
});

// POST /threads
threads.post('/', async (c) => {
  const user = getCurrentUser(c);
  const { entity_type, entity_id, content } = await c.req.json();
  const id = 'th_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO threads (id, entity_type, entity_id, author_id, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, entity_type, entity_id, user.id, content, new Date().toISOString()).run();
  return c.json({ success: true, data: { id } }, 201);
});

export default threads;
