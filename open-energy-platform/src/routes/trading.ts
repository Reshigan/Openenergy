// Trading Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const trading = new Hono<HonoEnv>();
trading.use('*', authMiddleware);

// GET /trading/orders
trading.get('/orders', async (c) => {
  const user = getCurrentUser(c);
  const orders = await c.env.DB.prepare('SELECT * FROM trade_orders WHERE participant_id = ? ORDER BY created_at DESC LIMIT 50').bind(user.id).all();
  return c.json({ success: true, data: orders.results || [] });
});

// POST /trading/orders
trading.post('/orders', async (c) => {
  const user = getCurrentUser(c);
  const { side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type } = await c.req.json();
  
  const orderId = 'ord_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  
  await c.env.DB.prepare(`
    INSERT INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).bind(orderId, user.id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type || 'bilateral', new Date().toISOString(), new Date().toISOString()).run();
  
  await fireCascade({ event: 'trade.order_placed', actor_id: user.id, entity_type: 'trade_orders', entity_id: orderId, data: { side, energy_type, volume_mwh }, env: c.env });
  
  return c.json({ success: true, data: { id: orderId, status: 'open' } }, 201);
});

export default trading;
