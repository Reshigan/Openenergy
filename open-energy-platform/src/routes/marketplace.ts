// Marketplace Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware } from '../middleware/auth';

const marketplace = new Hono<HonoEnv>();
marketplace.use('*', authMiddleware);

// GET /marketplace/listings
marketplace.get('/listings', async (c) => {
  const listings = await c.env.DB.prepare('SELECT * FROM marketplace_listings WHERE status = ? ORDER BY created_at DESC').bind('active').all();
  return c.json({ success: true, data: listings.results || [] });
});

// POST /marketplace/listings
marketplace.post('/listings', async (c) => {
  const body = await c.req.json();
  const { seller_id, listing_type, title, description, price_cents, energy_type } = body;
  const id = 'ml_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO marketplace_listings (id, seller_id, listing_type, title, description, price_cents, energy_type, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).bind(id, seller_id, listing_type, title, description, price_cents, energy_type, new Date().toISOString()).run();
  return c.json({ success: true, data: { id } }, 201);
});

export default marketplace;
