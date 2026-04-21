// Trading Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { ask } from '../utils/ai';

const trading = new Hono<HonoEnv>();
trading.use('*', authMiddleware);

// GET /trading/orders — my orders
trading.get('/orders', async (c) => {
  const user = getCurrentUser(c);
  const orders = await c.env.DB.prepare(
    'SELECT * FROM trade_orders WHERE participant_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(user.id).all();
  return c.json({ success: true, data: orders.results || [] });
});

// GET /trading/orderbook — open orders visible to all participants (public book)
trading.get('/orderbook', async (c) => {
  const side = c.req.query('side');
  const energyType = c.req.query('energy_type');
  const filters: string[] = [`o.status = 'open'`];
  const bindings: unknown[] = [];
  if (side) { filters.push('o.side = ?'); bindings.push(side); }
  if (energyType) { filters.push('o.energy_type = ?'); bindings.push(energyType); }
  const orders = await c.env.DB.prepare(
    `SELECT o.*, p.name as participant_name FROM trade_orders o
     LEFT JOIN participants p ON o.participant_id = p.id
     WHERE ${filters.join(' AND ')}
     ORDER BY o.created_at DESC LIMIT 200`
  ).bind(...bindings).all();
  return c.json({ success: true, data: orders.results || [] });
});

// GET /trading/matches — my matched trades
trading.get('/matches', async (c) => {
  const user = getCurrentUser(c);
  const matches = await c.env.DB.prepare(`
    SELECT m.*,
           b.participant_id as buyer_id, s.participant_id as seller_id,
           b.energy_type, b.delivery_date, b.delivery_point,
           bp.name as buyer_name, sp.name as seller_name
    FROM trade_matches m
    JOIN trade_orders b ON m.buy_order_id = b.id
    JOIN trade_orders s ON m.sell_order_id = s.id
    LEFT JOIN participants bp ON b.participant_id = bp.id
    LEFT JOIN participants sp ON s.participant_id = sp.id
    WHERE b.participant_id = ? OR s.participant_id = ?
    ORDER BY m.matched_at DESC LIMIT 100
  `).bind(user.id, user.id).all();
  return c.json({ success: true, data: matches.results || [] });
});

// POST /trading/orders — place a new order
trading.post('/orders', async (c) => {
  const user = getCurrentUser(c);
  const { side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type } = await c.req.json();

  if (!side || !energy_type || !volume_mwh) {
    return c.json({ success: false, error: 'side, energy_type, volume_mwh are required' }, 400);
  }

  const orderId = 'ord_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).bind(orderId, user.id, side, energy_type, volume_mwh, price_min || null, price_max || null, delivery_date || null, delivery_point || null, market_type || 'bilateral', now, now).run();

  await fireCascade({
    event: 'trade.order_placed',
    actor_id: user.id,
    entity_type: 'trade_orders',
    entity_id: orderId,
    data: { side, energy_type, volume_mwh },
    env: c.env,
  });

  return c.json({ success: true, data: { id: orderId, status: 'open' } }, 201);
});

// POST /trading/orders/:id/cancel — cancel own order
trading.post('/orders/:id/cancel', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const order = await c.env.DB.prepare('SELECT participant_id, status FROM trade_orders WHERE id = ?').bind(id).first();
  if (!order) return c.json({ success: false, error: 'Order not found' }, 404);
  if (order.participant_id !== user.id) return c.json({ success: false, error: 'Not authorized' }, 403);
  if (order.status !== 'open') return c.json({ success: false, error: `Cannot cancel order in status '${order.status}'` }, 400);

  await c.env.DB.prepare(`UPDATE trade_orders SET status = 'cancelled', updated_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), id).run();

  await fireCascade({
    event: 'trade.cancelled',
    actor_id: user.id,
    entity_type: 'trade_orders',
    entity_id: id,
    data: {},
    env: c.env,
  });

  return c.json({ success: true, data: { id, status: 'cancelled' } });
});

// POST /trading/match — match a buy order against a sell order (fires trade.matched cascade)
// Body: { buy_order_id, sell_order_id, volume_mwh, price_per_mwh? }
trading.post('/match', async (c) => {
  const user = getCurrentUser(c);
  const { buy_order_id, sell_order_id, volume_mwh, price_per_mwh } = await c.req.json();

  if (!buy_order_id || !sell_order_id || !volume_mwh) {
    return c.json({ success: false, error: 'buy_order_id, sell_order_id, volume_mwh are required' }, 400);
  }

  const buy = await c.env.DB.prepare('SELECT * FROM trade_orders WHERE id = ?').bind(buy_order_id).first();
  const sell = await c.env.DB.prepare('SELECT * FROM trade_orders WHERE id = ?').bind(sell_order_id).first();
  if (!buy || !sell) return c.json({ success: false, error: 'Order(s) not found' }, 404);
  if (buy.side !== 'buy' || sell.side !== 'sell') return c.json({ success: false, error: 'Mismatched sides' }, 400);
  if (buy.status !== 'open' || sell.status !== 'open') return c.json({ success: false, error: 'Only open orders can be matched' }, 400);
  // Only one of the two parties (or admin) can call match
  if (user.id !== buy.participant_id && user.id !== sell.participant_id && user.role !== 'admin') {
    return c.json({ success: false, error: 'Not a counterparty to either order' }, 403);
  }

  const matchId = 'mt_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const price = Number(price_per_mwh ?? sell.price_min ?? buy.price_max ?? 0);
  const total_value = price * Number(volume_mwh);
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO trade_matches (id, buy_order_id, sell_order_id, matched_volume_mwh, matched_price, matched_at, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).bind(matchId, buy_order_id, sell_order_id, volume_mwh, price, now).run();

  await c.env.DB.prepare(`UPDATE trade_orders SET status = 'matched', updated_at = ? WHERE id IN (?, ?)`)
    .bind(now, buy_order_id, sell_order_id).run();

  await fireCascade({
    event: 'trade.matched',
    actor_id: user.id,
    entity_type: 'trade_matches',
    entity_id: matchId,
    data: {
      match_id: matchId,
      buyer_id: buy.participant_id,
      seller_id: sell.participant_id,
      volume_mwh,
      price_per_mwh: price,
      total_value,
      delivery_date: buy.delivery_date || sell.delivery_date,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id: matchId, total_value } }, 201);
});

// POST /trading/recommend — AI trader copilot
// Body: { side?, energy_type?, delivery_point?, max_recommendations? }
// Returns top-N opportunities the trader should match/hedge today.
trading.post('/recommend', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    side?: 'buy' | 'sell';
    energy_type?: string;
    delivery_point?: string;
    max_recommendations?: number;
  };

  const filters: string[] = [`o.status = 'open'`];
  const bindings: unknown[] = [];
  if (body.side) { filters.push('o.side = ?'); bindings.push(body.side); }
  if (body.energy_type) { filters.push('o.energy_type = ?'); bindings.push(body.energy_type); }
  if (body.delivery_point) { filters.push('o.delivery_point = ?'); bindings.push(body.delivery_point); }

  const book = await c.env.DB.prepare(`
    SELECT o.id, o.side, o.energy_type, o.volume_mwh, o.price_min, o.price_max,
           o.delivery_date, o.delivery_point, o.market_type, p.name as participant_name,
           o.participant_id
    FROM trade_orders o
    LEFT JOIN participants p ON o.participant_id = p.id
    WHERE ${filters.join(' AND ')}
    ORDER BY o.created_at DESC LIMIT 60
  `).bind(...bindings).all();

  const myOrders = await c.env.DB.prepare(
    `SELECT id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point
     FROM trade_orders WHERE participant_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 30`,
  ).bind(user.id).all();

  const result = await ask(c.env, {
    intent: 'trader.order_recommendation',
    role: user.role,
    prompt:
      `Recommend the top ${body.max_recommendations || 5} matching or hedging actions for me.
Return a JSON array of { action: 'match'|'hedge'|'place', my_order_id?, counterparty_order_id?,
volume_mwh, indicative_price, rationale, estimated_pnl_zar }.`,
    context: {
      my_orders: myOrders.results || [],
      order_book: book.results || [],
    },
  });

  return c.json({ success: true, data: result });
});

export default trading;
