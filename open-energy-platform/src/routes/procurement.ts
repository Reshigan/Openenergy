// Procurement Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const procurement = new Hono<HonoEnv>();
procurement.use('*', authMiddleware);

// GET /procurement/rfps
procurement.get('/rfps', async (c) => {
  const rfps = await c.env.DB.prepare('SELECT * FROM procurement_rfps ORDER BY created_at DESC').all();
  return c.json({ success: true, data: rfps.results || [] });
});

// POST /procurement/rfps
procurement.post('/rfps', async (c) => {
  const user = getCurrentUser(c);
  const { title, description, closing_date } = await c.req.json();
  const id = 'rfp_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO procurement_rfps (id, created_by, title, description, closing_date, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?)
  `).bind(id, user.id, title, description, closing_date, new Date().toISOString()).run();
  return c.json({ success: true, data: { id } }, 201);
});

// GET /procurement/bids
procurement.get('/bids', async (c) => {
  const user = getCurrentUser(c);
  const bids = await c.env.DB.prepare('SELECT * FROM procurement_bids WHERE bidder_id = ? ORDER BY created_at DESC').bind(user.id).all();
  return c.json({ success: true, data: bids.results || [] });
});

// POST /procurement/bids
procurement.post('/bids', async (c) => {
  const user = getCurrentUser(c);
  const { rfp_id, amount_cents, notes } = await c.req.json();
  const id = 'bid_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO procurement_bids (id, rfp_id, bidder_id, amount_cents, notes, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'submitted', ?)
  `).bind(id, rfp_id, user.id, amount_cents, notes, new Date().toISOString()).run();
  return c.json({ success: true, data: { id } }, 201);
});

// POST /procurement/awards
procurement.post('/awards', async (c) => {
  const { bid_id } = await c.req.json();
  await c.env.DB.prepare('UPDATE procurement_bids SET status = ? WHERE id = ?').bind('awarded', bid_id).run();
  const bid = await c.env.DB.prepare('SELECT * FROM procurement_bids WHERE id = ?').bind(bid_id).first();
  return c.json({ success: true, data: bid });
});

export default procurement;
