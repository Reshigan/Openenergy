// Pipeline Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const pipeline = new Hono<HonoEnv>();
pipeline.use('*', authMiddleware);

// GET /pipeline
pipeline.get('/', async (c) => {
  const deals = await c.env.DB.prepare('SELECT * FROM pipeline_deals ORDER BY created_at DESC').all();
  return c.json({ success: true, data: deals.results || [] });
});

// POST /pipeline/deals
pipeline.post('/deals', async (c) => {
  const user = getCurrentUser(c);
  const { title, value_cents, stage, counterparty } = await c.req.json();
  const id = 'pd_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO pipeline_deals (id, created_by, title, value_cents, stage, counterparty, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
  `).bind(id, user.id, title, value_cents, stage || 'qualification', counterparty, new Date().toISOString()).run();
  return c.json({ success: true, data: { id } }, 201);
});

// PUT /pipeline/deals/:id/stage
pipeline.put('/deals/:id/stage', async (c) => {
  const id = c.req.param('id');
  const { stage } = await c.req.json();
  await c.env.DB.prepare('UPDATE pipeline_deals SET stage = ? WHERE id = ?').bind(stage, id).run();
  return c.json({ success: true });
});

export default pipeline;
