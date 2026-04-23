// Trading Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { ask } from '../utils/ai';
import { withLock, LockBusyError } from '../utils/locks';
import { deriveShardKey, MatchingOrder } from '../utils/matching';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

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

// POST /trading/orders — place a new order.
//
// Two behaviours:
//   - `auto_match: true` (new): persist the order with remaining_volume_mwh
//     set, then route it into the OrderBook Durable Object for immediate
//     price-time-priority matching. DO returns fills; DB rows mutate via the
//     DO writing back through D1.
//   - default: legacy bilateral-order behaviour — persisted open, matched
//     manually via POST /trading/match. Preserved so existing UI flows still
//     work.
//
// Body: { side, energy_type, volume_mwh, price?, price_min?, price_max?,
//         delivery_date?, delivery_point?, market_type?, order_type?,
//         time_in_force?, auto_match?, external_ref? }
trading.post('/orders', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();
  const {
    side, energy_type, volume_mwh,
    price, price_min, price_max,
    delivery_date, delivery_point, market_type,
    order_type, time_in_force,
    auto_match, external_ref,
  } = body as Record<string, unknown>;

  if (!side || !energy_type || !volume_mwh) {
    return c.json({ success: false, error: 'side, energy_type, volume_mwh are required' }, 400);
  }

  // Idempotency: if an external_ref was supplied and we've seen it, return
  // the existing order row.
  if (typeof external_ref === 'string' && external_ref.length > 0) {
    const existing = await c.env.DB.prepare(
      `SELECT id, status FROM trade_orders WHERE external_ref = ? AND participant_id = ?`,
    ).bind(external_ref, user.id).first();
    if (existing) {
      return c.json({ success: true, data: existing, idempotent: true });
    }
  }

  const effectivePrice =
    price != null ? Number(price)
    : price_min != null ? Number(price_min)
    : price_max != null ? Number(price_max)
    : null;

  const orderId = 'ord_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();
  const shardKey = deriveShardKey(String(energy_type), delivery_date as string | null | undefined);
  const vol = Number(volume_mwh);
  const orderType = (order_type as string) || 'limit';

  await c.env.DB.prepare(`
    INSERT INTO trade_orders
      (id, participant_id, side, energy_type, volume_mwh, remaining_volume_mwh,
       price, price_min, price_max, delivery_date, delivery_point, market_type,
       order_type, time_in_force, shard_key, external_ref,
       status, created_at, updated_at, posted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `).bind(
    orderId, user.id, side, energy_type, vol, vol,
    effectivePrice,
    price_min == null ? null : Number(price_min),
    price_max == null ? null : Number(price_max),
    delivery_date || null, delivery_point || null, (market_type as string) || 'bilateral',
    orderType, (time_in_force as string) || 'gtc', shardKey, external_ref || null,
    now, now, now,
  ).run();

  await fireCascade({
    event: 'trade.order_placed',
    actor_id: user.id,
    entity_type: 'trade_orders',
    entity_id: orderId,
    data: { side, energy_type, volume_mwh: vol },
    env: c.env,
  });

  // Auto-match via the OrderBook DO if requested.
  if (auto_match === true) {
    const doMatch = await routeThroughOrderBook(c.env, shardKey, {
      id: orderId,
      participant_id: user.id,
      side: side as 'buy' | 'sell',
      price: effectivePrice,
      volume_mwh: vol,
      remaining_volume_mwh: vol,
      posted_at: now,
      order_type: orderType as MatchingOrder['order_type'],
      shard_key: shardKey,
    });
    return c.json({
      success: true,
      data: { id: orderId, status: doMatch?.taker_status || 'open', fills: doMatch?.fills || [] },
    }, 201);
  }

  return c.json({ success: true, data: { id: orderId, status: 'open' } }, 201);
});

// Helper — dispatch a new order to the shard's Durable Object for matching.
// Falls through (returns null) if DO binding isn't available (local dev).
async function routeThroughOrderBook(
  env: HonoEnv['Bindings'],
  shardKey: string,
  order: MatchingOrder,
): Promise<{ taker_status: string; fills: unknown[] } | null> {
  const doBinding = (env as unknown as { ORDER_BOOK?: DurableObjectNamespace }).ORDER_BOOK;
  if (!doBinding) return null;
  const id = doBinding.idFromName(shardKey);
  const stub = doBinding.get(id);
  const resp = await stub.fetch('https://order-book/post', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(order),
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { data?: { taker_status?: string; fills?: unknown[] } };
  return {
    taker_status: data.data?.taker_status || 'open',
    fills: data.data?.fills || [],
  };
}

// GET /trading/orderbook-depth — depth snapshot for a given shard.
// Query: shard_key=solar|2026-04-23
trading.get('/orderbook-depth', async (c) => {
  const shardKey = c.req.query('shard_key');
  if (!shardKey) {
    return c.json({ success: false, error: 'shard_key query param required' }, 400);
  }
  const env = c.env as unknown as { ORDER_BOOK?: DurableObjectNamespace };
  if (env.ORDER_BOOK) {
    const id = env.ORDER_BOOK.idFromName(shardKey);
    const stub = env.ORDER_BOOK.get(id);
    const resp = await stub.fetch('https://order-book/depth', { method: 'GET' });
    if (resp.ok) {
      const data = await resp.json() as { data?: unknown };
      return c.json({ success: true, data: data.data || null });
    }
  }
  // Fallback to last persisted snapshot.
  const row = await c.env.DB.prepare(
    `SELECT * FROM order_book_depth WHERE shard_key = ? ORDER BY snapshot_at DESC LIMIT 1`,
  ).bind(shardKey).first();
  return c.json({ success: true, data: row || null });
});

// GET /trading/prints — public ticker, per shard per minute.
trading.get('/prints', async (c) => {
  const shardKey = c.req.query('shard_key');
  const limit = Math.min(500, Number(c.req.query('limit') || 100));
  const rs = shardKey
    ? await c.env.DB.prepare(
        `SELECT * FROM market_prints WHERE shard_key = ? ORDER BY minute_bucket DESC LIMIT ?`,
      ).bind(shardKey, limit).all()
    : await c.env.DB.prepare(
        `SELECT * FROM market_prints ORDER BY minute_bucket DESC LIMIT ?`,
      ).bind(limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

// GET /trading/fills — my executions with counterparty info.
trading.get('/fills', async (c) => {
  const user = getCurrentUser(c);
  const rs = await c.env.DB.prepare(
    `SELECT f.*, o.participant_id AS owner_id
       FROM trade_fills f JOIN trade_orders o ON o.id = f.order_id
      WHERE o.participant_id = ?
      ORDER BY f.executed_at DESC LIMIT 500`,
  ).bind(user.id).all();
  return c.json({ success: true, data: rs.results || [] });
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
//
// Serialized on the (sorted) order-id pair via an advisory lock so two callers
// can't both observe open/open and both flip the orders to 'matched' — which
// would otherwise produce duplicate trade_matches rows + two escrow + two
// invoice rows from the cascade.
trading.post('/match', async (c) => {
  const user = getCurrentUser(c);
  const { buy_order_id, sell_order_id, volume_mwh, price_per_mwh } = await c.req.json();

  if (!buy_order_id || !sell_order_id || !volume_mwh) {
    return c.json({ success: false, error: 'buy_order_id, sell_order_id, volume_mwh are required' }, 400);
  }

  const [aId, bId] = [String(buy_order_id), String(sell_order_id)].sort();
  const lockKey = `trade:match:${aId}:${bId}`;

  try {
    const body = await withLock(
      c.env,
      lockKey,
      user.id,
      async () => {
        const buy = await c.env.DB.prepare('SELECT * FROM trade_orders WHERE id = ?').bind(buy_order_id).first();
        const sell = await c.env.DB.prepare('SELECT * FROM trade_orders WHERE id = ?').bind(sell_order_id).first();
        if (!buy || !sell) throw new LockBusyError('__not_found__');
        if (buy.side !== 'buy' || sell.side !== 'sell') throw new LockBusyError('__mismatched_sides__');
        if (buy.status !== 'open' || sell.status !== 'open') throw new LockBusyError('__not_open__');
        if (user.id !== buy.participant_id && user.id !== sell.participant_id && user.role !== 'admin') {
          throw new LockBusyError('__not_counterparty__');
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

        return { id: matchId, total_value };
      },
      { ttlSeconds: 15, context: { buy_order_id, sell_order_id } },
    );

    return c.json({ success: true, data: body }, 201);
  } catch (err) {
    if (err instanceof LockBusyError) {
      // Switch on err.key (the raw lock/validation identifier). err.message
      // is the human-readable form ("lock busy: <key>") and won't match.
      switch (err.key) {
        case '__not_found__':
          return c.json({ success: false, error: 'Order(s) not found' }, 404);
        case '__mismatched_sides__':
          return c.json({ success: false, error: 'Mismatched sides' }, 400);
        case '__not_open__':
          return c.json({ success: false, error: 'Only open orders can be matched' }, 400);
        case '__not_counterparty__':
          return c.json({ success: false, error: 'Not a counterparty to either order' }, 403);
        default:
          return c.json({ success: false, error: 'Another match is in progress on these orders — retry in a moment' }, 409);
      }
    }
    throw err;
  }
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
Return ONLY a JSON object of shape { "recommendations": [ { "action": "match"|"hedge"|"place",
"my_order_id"?, "counterparty_order_id"?, "side"?, "energy_type"?, "volume_mwh", "indicative_price",
"rationale", "estimated_pnl_zar" } ] } inside a \`\`\`json block.`,
    context: {
      my_orders: myOrders.results || [],
      order_book: book.results || [],
    },
  });

  // Guarantee structured recommendations even if the LLM returned prose or a
  // top-level JSON array. Build a deterministic list from the real order book
  // so the UI can always one-click.
  const max = Number(body.max_recommendations) > 0 ? Number(body.max_recommendations) : 5;
  const recs = extractOrNormaliseRecommendations(result, {
    myOrders: (myOrders.results || []) as OrderRow[],
    book: (book.results || []) as OrderRow[],
    userId: user.id,
    max,
  });

  const structured = {
    ...(result.structured || {}),
    recommendations: recs,
  };

  return c.json({ success: true, data: { ...result, structured } });
});

// ---------------------------------------------------------------------------
// Deterministic recommendation helpers.
// The LLM can legitimately return any of:
//   - { recommendations: [...] }
//   - [...]  (top-level JSON array)
//   - free-form prose with no JSON
// Callers rely on .structured.recommendations being an array — so normalise.
// ---------------------------------------------------------------------------
type OrderRow = {
  id: string;
  side: 'buy' | 'sell';
  energy_type: string;
  volume_mwh: number;
  price_min: number | null;
  price_max: number | null;
  delivery_date: string | null;
  delivery_point: string | null;
  participant_id?: string;
  participant_name?: string;
};

type TraderRec = {
  action: 'match' | 'hedge' | 'place';
  my_order_id?: string;
  counterparty_order_id?: string;
  side?: 'buy' | 'sell';
  energy_type?: string;
  volume_mwh: number;
  indicative_price: number;
  rationale: string;
  estimated_pnl_zar?: number;
};

function extractOrNormaliseRecommendations(
  result: { text?: string; structured?: Record<string, unknown> },
  args: { myOrders: OrderRow[]; book: OrderRow[]; userId: string; max: number },
): TraderRec[] {
  const fromStruct = pickRecsFromStructured(result.structured);
  if (fromStruct.length > 0) return fromStruct.slice(0, args.max);

  return buildDeterministicRecommendations(args).slice(0, args.max);
}

function pickRecsFromStructured(s?: Record<string, unknown>): TraderRec[] {
  if (!s) return [];
  const candidate = Array.isArray((s as { recommendations?: unknown }).recommendations)
    ? (s as { recommendations: unknown[] }).recommendations
    : Array.isArray(s)
      ? (s as unknown as unknown[])
      : [];
  const out: TraderRec[] = [];
  for (const raw of candidate) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const action = (r.action === 'match' || r.action === 'hedge' || r.action === 'place')
      ? r.action
      : 'place';
    const vol = Number(r.volume_mwh);
    const price = Number(r.indicative_price);
    if (!Number.isFinite(vol) || vol <= 0) continue;
    out.push({
      action,
      my_order_id: typeof r.my_order_id === 'string' ? r.my_order_id : undefined,
      counterparty_order_id: typeof r.counterparty_order_id === 'string' ? r.counterparty_order_id : undefined,
      side: r.side === 'buy' || r.side === 'sell' ? r.side : undefined,
      energy_type: typeof r.energy_type === 'string' ? r.energy_type : undefined,
      volume_mwh: vol,
      indicative_price: Number.isFinite(price) ? price : 0,
      rationale: typeof r.rationale === 'string' ? r.rationale : 'LLM recommendation',
      estimated_pnl_zar: Number.isFinite(Number(r.estimated_pnl_zar)) ? Number(r.estimated_pnl_zar) : undefined,
    });
  }
  return out;
}

function buildDeterministicRecommendations(args: {
  myOrders: OrderRow[];
  book: OrderRow[];
  userId: string;
  max: number;
}): TraderRec[] {
  const out: TraderRec[] = [];

  // 1) Match: for each of my open orders, find the best counterparty on the opposite side.
  for (const mine of args.myOrders) {
    const opp: 'buy' | 'sell' = mine.side === 'buy' ? 'sell' : 'buy';
    const candidates = args.book.filter((b) =>
      b.side === opp &&
      b.energy_type === mine.energy_type &&
      b.participant_id !== args.userId,
    );
    if (candidates.length === 0) continue;
    const best = candidates.sort((a, b) => {
      const pa = mine.side === 'buy' ? Number(a.price_min ?? Infinity) : -Number(a.price_max ?? -Infinity);
      const pb = mine.side === 'buy' ? Number(b.price_min ?? Infinity) : -Number(b.price_max ?? -Infinity);
      return pa - pb;
    })[0];
    const volume = Math.min(Number(mine.volume_mwh) || 0, Number(best.volume_mwh) || 0);
    if (volume <= 0) continue;
    const price = Number(
      mine.side === 'buy' ? best.price_min ?? mine.price_max : best.price_max ?? mine.price_min,
    ) || 0;
    const spread = mine.side === 'buy'
      ? (Number(mine.price_max) || price) - price
      : price - (Number(mine.price_min) || price);
    out.push({
      action: 'match',
      my_order_id: mine.id,
      counterparty_order_id: best.id,
      side: mine.side,
      energy_type: mine.energy_type,
      volume_mwh: volume,
      indicative_price: price,
      rationale: `Opposite-side ${best.energy_type} order from ${best.participant_name || 'counterparty'} at R${price}/MWh for ${volume} MWh.`,
      estimated_pnl_zar: Math.round(spread * volume),
    });
    if (out.length >= args.max) return out;
  }

  // 2) Place: if no match, surface top book opportunities the trader can mirror.
  const visibleBook = args.book.filter((b) => b.participant_id !== args.userId);
  for (const b of visibleBook) {
    if (out.length >= args.max) break;
    const opp: 'buy' | 'sell' = b.side === 'buy' ? 'sell' : 'buy';
    const price = Number(b.price_min ?? b.price_max ?? 0);
    if (!price) continue;
    out.push({
      action: 'place',
      side: opp,
      energy_type: b.energy_type,
      volume_mwh: Number(b.volume_mwh) || 10,
      indicative_price: price,
      rationale: `Place a ${opp} order to meet open ${b.side} from ${b.participant_name || 'counterparty'} at R${price}/MWh.`,
      estimated_pnl_zar: 0,
    });
  }

  return out;
}

export default trading;
