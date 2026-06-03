// Trading Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { ask } from '../utils/ai';
import { withLock, LockBusyError } from '../utils/locks';
import { deriveShardKey, MatchingOrder } from '../utils/matching';
import {
  evaluateOrder,
  suggestedSizeMwh,
  notionalFor,
  type ProposedOrder,
  type RiskSnapshot,
} from '../utils/pre-trade-guards';
import { explainRejection } from '../utils/rejection-explainer';
import { logAiDecision } from '../utils/ai-audit';
import { appendAudit } from '../utils/audit-chain';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

const trading = new Hono<HonoEnv>();
trading.use('*', authMiddleware);

// ─── Risk snapshot loader ──────────────────────────────────────────────────
// Pulls everything the pre-trade guards need in a single round-trip set.
// Falls open on missing fields (e.g. no credit limit row → treat as 0) so
// the guards reject explicitly rather than 500ing on null deref.
async function loadRiskSnapshot(
  env: HonoEnv['Bindings'],
  participantId: string,
  energyType: string,
  deliveryDate: string | null,
): Promise<RiskSnapshot> {
  const [participant, limit, exposure, collateral, position, mark, halt, bookSides, marginGate] = await Promise.all([
    env.DB.prepare(`SELECT status, kyc_status FROM participants WHERE id = ?`)
      .bind(participantId).first<{ status: string; kyc_status: string }>(),
    env.DB.prepare(
      `SELECT limit_zar FROM credit_limits
        WHERE participant_id = ?
          AND (effective_to IS NULL OR effective_to >= datetime('now'))
          AND effective_from <= datetime('now')
        ORDER BY effective_from DESC LIMIT 1`,
    ).bind(participantId).first<{ limit_zar: number }>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(remaining_volume_mwh * COALESCE(price, 0)), 0) AS exp
         FROM trade_orders
        WHERE participant_id = ? AND status IN ('open','partially_filled')`,
    ).bind(participantId).first<{ exp: number }>(),
    // Free collateral = sum of active account balances minus reserved margin
    // for orders still open. Both halves are computed in SQLite to keep this
    // a single set of round-trips.
    env.DB.prepare(
      `SELECT
         (SELECT COALESCE(SUM(balance_zar), 0)
            FROM collateral_accounts
           WHERE participant_id = ? AND status = 'active') AS posted,
         (SELECT COALESCE(SUM(amount_zar), 0)
            FROM margin_reservations
           WHERE participant_id = ? AND status = 'reserved') AS reserved`,
    ).bind(participantId, participantId).first<{ posted: number; reserved: number }>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(net_volume_mwh), 0) AS pos
         FROM trader_positions
        WHERE participant_id = ? AND energy_type = ?`,
    ).bind(participantId, energyType).first<{ pos: number }>(),
    env.DB.prepare(
      `SELECT mark_price_zar_mwh,
              CAST((julianday('now') - julianday(computed_at)) * 24 * 60 AS INTEGER) AS age_minutes
         FROM mark_prices
        WHERE energy_type = ?
          AND (delivery_date = ? OR (delivery_date IS NULL AND ? IS NULL))
        ORDER BY mark_date DESC LIMIT 1`,
    ).bind(energyType, deliveryDate, deliveryDate).first<{ mark_price_zar_mwh: number; age_minutes: number }>(),
    // Optional halt — stored in KV so operators can pause a market without
    // a deploy. Key shape: 'market:halt:<energy_type>' or 'market:halt:_all'.
    env.KV?.get(`market:halt:${energyType}`).then((v) => v || (env.KV ? env.KV.get('market:halt:_all') : null)).catch(() => null),
    // Best-bid / best-ask + opposite-side aggregate liquidity for the
    // shard. Computed in one round-trip with two SQL aggregates so the
    // post_only / FOK guards have everything they need from the snapshot.
    // We restrict to delivery-date-matching rows so a 2026-06 buy doesn't
    // spuriously cross a 2026-12 ask.
    env.DB.prepare(
      `SELECT
         (SELECT MAX(price) FROM trade_orders
            WHERE side = 'buy' AND status IN ('open','partial')
              AND energy_type = ?
              AND (delivery_date = ? OR (delivery_date IS NULL AND ? IS NULL))
              AND price IS NOT NULL) AS best_bid,
         (SELECT MIN(price) FROM trade_orders
            WHERE side = 'sell' AND status IN ('open','partial')
              AND energy_type = ?
              AND (delivery_date = ? OR (delivery_date IS NULL AND ? IS NULL))
              AND price IS NOT NULL) AS best_ask,
         (SELECT COALESCE(SUM(remaining_volume_mwh), 0) FROM trade_orders
            WHERE side = 'buy' AND status IN ('open','partial')
              AND energy_type = ?
              AND (delivery_date = ? OR (delivery_date IS NULL AND ? IS NULL))) AS bid_liq,
         (SELECT COALESCE(SUM(remaining_volume_mwh), 0) FROM trade_orders
            WHERE side = 'sell' AND status IN ('open','partial')
              AND energy_type = ?
              AND (delivery_date = ? OR (delivery_date IS NULL AND ? IS NULL))) AS ask_liq`,
    ).bind(
      energyType, deliveryDate, deliveryDate,
      energyType, deliveryDate, deliveryDate,
      energyType, deliveryDate, deliveryDate,
      energyType, deliveryDate, deliveryDate,
    ).first<{ best_bid: number | null; best_ask: number | null; bid_liq: number; ask_liq: number }>(),
    // ── Wave 3: clearing margin enforcement state ────────────────────────
    // Read once here so evaluateOrder can run synchronously on the snapshot.
    // Treat unknown / missing rows as 'clear'.
    env.DB.prepare(`SELECT gate_status FROM margin_enforcement_state WHERE member_id = ?`)
      .bind(participantId).first<{ gate_status: string }>().catch(() => null),
  ]);

  const status = participant?.status as string | undefined;
  const kyc = participant?.kyc_status as string | undefined;
  const participant_status: RiskSnapshot['participant_status'] =
    !participant ? 'unknown'
      : status === 'suspended' ? 'suspended'
      : kyc !== 'approved' ? 'pending_kyc'
      : status === 'active' ? 'active'
      : 'unknown';

  const market_state: RiskSnapshot['market_state'] =
    halt === 'closed' ? 'closed'
      : halt === 'halted_market' ? 'halted_market'
      : halt === 'halted_instrument' ? 'halted_instrument'
      : 'open';

  return {
    participant_status,
    credit_limit_zar: Number(limit?.limit_zar || 0),
    open_exposure_zar: Number(exposure?.exp || 0),
    free_collateral_zar: Math.max(0, Number(collateral?.posted || 0) - Number(collateral?.reserved || 0)),
    current_position_mwh: Number(position?.pos || 0),
    // 0 = no platform-wide position limit configured. Per-participant limits
    // can be plumbed in later via a participant_position_limits table.
    position_limit_mwh: 0,
    market_state,
    mark_price_zar_mwh: mark?.mark_price_zar_mwh != null ? Number(mark.mark_price_zar_mwh) : null,
    mark_age_minutes: mark?.age_minutes != null ? Number(mark.age_minutes) : null,
    // Default 25% band — wide enough to allow live limit orders, tight
    // enough to catch fat-finger price entries.
    price_band_pct: 25,
    best_bid_zar_mwh: bookSides?.best_bid != null ? Number(bookSides.best_bid) : null,
    best_ask_zar_mwh: bookSides?.best_ask != null ? Number(bookSides.best_ask) : null,
    bid_liquidity_mwh: Number(bookSides?.bid_liq || 0),
    ask_liquidity_mwh: Number(bookSides?.ask_liq || 0),
    margin_gate_status: (marginGate?.gate_status as 'clear' | 'warning' | 'blocked' | undefined) || 'clear',
  };
}

// GET /trading/orders — my orders.
//
// COST: Explicit column list instead of SELECT *. The UI needs ~12 of the
// 24 columns on trade_orders; fetching the rest (metadata blobs, large
// text fields) would ~double the per-row bytes. LIMIT 50 is already
// generous for a dashboard widget.
// GET /trading/orders/:id — one order + L4 sub-resources rolled up so
// the SPA Order detail page renders in one round-trip.
trading.get('/orders/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const order = await c.env.DB.prepare(
    `SELECT * FROM trade_orders WHERE id = ?`,
  ).bind(id).first<any>();
  if (!order) return c.json({ success: false, error: 'Order not found' }, 404);
  if (order.participant_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const safe = async (sql: string, binds: unknown[]): Promise<any[]> =>
    c.env.DB.prepare(sql).bind(...binds).all().then(r => (r as any).results || []).catch(() => []);
  const amendments = await safe(
    `SELECT * FROM trade_order_amendments WHERE order_id = ? ORDER BY amended_at DESC`, [id],
  );
  const matches = await safe(
    `SELECT id, matched_volume_mwh, COALESCE(matched_price, matched_price_zar) AS matched_price_zar,
            matched_at, status, buy_order_id, sell_order_id
       FROM trade_matches
      WHERE buy_order_id = ? OR sell_order_id = ?
      ORDER BY matched_at DESC LIMIT 100`,
    [id, id],
  );
  const fees = await safe(
    `SELECT * FROM trade_fees WHERE order_id = ? ORDER BY calculated_at DESC`, [id],
  );
  const allocations = await safe(
    `SELECT * FROM trade_allocations WHERE order_id = ? ORDER BY created_at DESC`, [id],
  );
  const reservations = await safe(
    `SELECT * FROM margin_reservations WHERE order_id = ? ORDER BY reserved_at DESC`, [id],
  );
  const exceptions = await safe(
    `SELECT e.* FROM trade_exceptions e WHERE e.order_id = ? ORDER BY e.reported_at DESC`, [id],
  );
  return c.json({
    success: true,
    data: { order, amendments, matches, fees, allocations, reservations, exceptions },
  });
});

trading.get('/orders', async (c) => {
  const user = getCurrentUser(c);
  const orders = await c.env.DB.prepare(
    `SELECT id, side, energy_type, volume_mwh, remaining_volume_mwh,
            price, price_min, price_max, delivery_date, delivery_point,
            market_type, order_type, status, created_at, updated_at
       FROM trade_orders
      WHERE participant_id = ?
      ORDER BY created_at DESC LIMIT 50`,
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

// POST /trading/orders — place a new order with pre-trade risk gating.
//
// Sequence (added in 049):
//   1. Validate basic shape.
//   2. Idempotency check on external_ref.
//   3. Load risk snapshot (credit limit, open exposure, free collateral,
//      current position, mark price age, market state).
//   4. Run pre-trade guards. On rejection → write a trade_order_rejections
//      row + return HTTP 422 with { reason_code, detail, snapshot, rejection_id }.
//   5. On pass → insert trade_orders + margin_reservations atomically.
//
// Two acceptance behaviours after step 5:
//   - `auto_match: true`: route into the OrderBook DO for immediate matching.
//   - default: stay open until matched manually via POST /trading/match.
//
// The legacy 400 "side/energy_type/volume_mwh are required" path is preserved
// so callers that send malformed bodies still get a 400 (not a 422).
trading.post('/orders', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();
  const {
    side, energy_type, volume_mwh,
    price, price_min, price_max,
    delivery_date, delivery_point, market_type,
    order_type, time_in_force,
    auto_match, external_ref,
    // ─── Phase 2 (migration 050) modifiers + extras ────────────────────
    expires_at, stop_trigger_price, display_size_mwh,
    post_only, reduce_only,
  } = body as Record<string, unknown>;

  if (!side || !energy_type || !volume_mwh) {
    return c.json({ success: false, error: 'side, energy_type, volume_mwh are required' }, 400);
  }
  if (side !== 'buy' && side !== 'sell') {
    return c.json({ success: false, error: 'side must be buy or sell' }, 400);
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
  const vol = Number(volume_mwh);
  const energyType = String(energy_type);
  const deliveryDate = (delivery_date as string | undefined) || null;

  // ── Pre-trade gating ────────────────────────────────────────────────────
  const snapshot = await loadRiskSnapshot(c.env, user.id, energyType, deliveryDate);
  const proposed: ProposedOrder = {
    side: side as 'buy' | 'sell',
    energy_type: energyType,
    volume_mwh: vol,
    price_zar_mwh: effectivePrice,
    delivery_date: deliveryDate,
    order_type: (order_type as ProposedOrder['order_type']) ?? undefined,
    time_in_force: (time_in_force as ProposedOrder['time_in_force']) ?? undefined,
    expires_at: typeof expires_at === 'string' ? expires_at : null,
    stop_trigger_price: stop_trigger_price != null ? Number(stop_trigger_price) : null,
    display_size_mwh: display_size_mwh != null ? Number(display_size_mwh) : null,
    post_only: post_only === true,
    reduce_only: reduce_only === true,
  };
  const decision = evaluateOrder(proposed, snapshot);

  if (!decision.ok) {
    const rejectionId = 'rej_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const notional = notionalFor(proposed, snapshot);
    await c.env.DB.prepare(
      `INSERT INTO trade_order_rejections
         (id, participant_id, reason_code, detail, side, energy_type,
          volume_mwh, price_zar_mwh, notional_zar, snapshot_json, external_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      rejectionId, user.id, decision.reason_code, decision.detail,
      proposed.side, proposed.energy_type, proposed.volume_mwh,
      proposed.price_zar_mwh, notional, JSON.stringify(snapshot),
      typeof external_ref === 'string' ? external_ref : null,
    ).run();
    return c.json({
      success: false,
      error: decision.reason_code,
      data: {
        rejection_id: rejectionId,
        reason_code: decision.reason_code,
        detail: decision.detail,
        snapshot,
        notional_zar: notional,
      },
    }, 422);
  }

  // ── Acceptance: insert order + reserve initial margin ──────────────────
  const orderId = 'ord_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const reservationId = 'res_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();
  const shardKey = deriveShardKey(energyType, deliveryDate);
  const orderType = (order_type as string) || 'limit';

  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO trade_orders
        (id, participant_id, side, energy_type, volume_mwh, remaining_volume_mwh,
         price, price_min, price_max, delivery_date, delivery_point, market_type,
         order_type, time_in_force, good_till, shard_key, external_ref,
         post_only, reduce_only, stop_trigger_price, display_size_mwh,
         status, created_at, updated_at, posted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `).bind(
      orderId, user.id, side, energyType, vol, vol,
      effectivePrice,
      price_min == null ? null : Number(price_min),
      price_max == null ? null : Number(price_max),
      deliveryDate, delivery_point || null, (market_type as string) || 'bilateral',
      orderType, (time_in_force as string) || 'gtc',
      proposed.expires_at || null, shardKey,
      typeof external_ref === 'string' ? external_ref : null,
      proposed.post_only ? 1 : 0,
      proposed.reduce_only ? 1 : 0,
      proposed.stop_trigger_price ?? null,
      proposed.display_size_mwh ?? null,
      now, now, now,
    ),
    c.env.DB.prepare(
      `INSERT INTO margin_reservations
         (id, order_id, participant_id, amount_zar, status, reserved_at)
       VALUES (?, ?, ?, ?, 'reserved', ?)`,
    ).bind(reservationId, orderId, user.id, decision.reserved_margin_zar, now),
  ]);

  await fireCascade({
    event: 'trade.order_placed',
    actor_id: user.id,
    entity_type: 'trade_orders',
    entity_id: orderId,
    data: { side, energy_type: energyType, volume_mwh: vol, reserved_margin_zar: decision.reserved_margin_zar },
    env: c.env,
    skipAudit: true,
  });

  // L5 audit chain — record the placed order. Payload is canonicalised
  // by appendAudit so identical orders hash identically on replay.
  await appendAudit({
    env: c.env, entity_type: 'trading', entity_id: orderId,
    event_type: 'order.placed', actor_id: user.id,
    payload: {
      order_id: orderId, side, energy_type: energyType,
      volume_mwh: vol, price: effectivePrice,
      delivery_date: deliveryDate, order_type: orderType,
      reserved_margin_zar: decision.reserved_margin_zar,
      external_ref: typeof external_ref === 'string' ? external_ref : null,
    },
  }).catch((e) => console.warn('audit_order_placed_failed', (e as Error).message));

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
      data: {
        id: orderId,
        status: doMatch?.taker_status || 'open',
        fills: doMatch?.fills || [],
        reserved_margin_zar: decision.reserved_margin_zar,
      },
    }, 201);
  }

  return c.json({
    success: true,
    data: { id: orderId, status: 'open', reserved_margin_zar: decision.reserved_margin_zar },
  }, 201);
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

// POST /trading/orders/:id/cancel — cancel own order + release any reserved
// initial margin so the freed credit/collateral is immediately re-usable.
trading.post('/orders/:id/cancel', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const order = await c.env.DB.prepare('SELECT participant_id, status FROM trade_orders WHERE id = ?').bind(id).first();
  if (!order) return c.json({ success: false, error: 'Order not found' }, 404);
  if (order.participant_id !== user.id) return c.json({ success: false, error: 'Not authorized' }, 403);
  if (order.status !== 'open') return c.json({ success: false, error: `Cannot cancel order in status '${order.status}'` }, 400);

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE trade_orders SET status = 'cancelled', updated_at = ? WHERE id = ?`)
      .bind(now, id),
    c.env.DB.prepare(
      `UPDATE margin_reservations
          SET status = 'released', resolved_at = ?, resolution_note = 'order_cancelled'
        WHERE order_id = ? AND status = 'reserved'`,
    ).bind(now, id),
  ]);

  await fireCascade({
    event: 'trade.cancelled',
    actor_id: user.id,
    entity_type: 'trade_orders',
    entity_id: id,
    data: {},
    env: c.env,
    skipAudit: true,
  });

  await appendAudit({
    env: c.env, entity_type: 'trading', entity_id: id,
    event_type: 'order.cancelled', actor_id: user.id,
    payload: { order_id: id, prior_status: order.status },
  }).catch((e) => console.warn('audit_order_cancelled_failed', (e as Error).message));

  return c.json({ success: true, data: { id, status: 'cancelled' } });
});

// POST /trading/orders/:id/amend — change price and/or volume on an open or
// partial order. Re-runs pre-trade gating against the *new* order shape so
// an amendment can't smuggle a position past the limits, and writes a
// trade_order_amendments row for the audit trail.
//
// Priority semantics (per the documented convention used in 050):
//   - any price change → loses time priority
//   - volume increase → loses time priority
//   - pure volume decrease → keeps time priority
// Margin reservation is recomputed from scratch at the new notional.
trading.post('/orders/:id/amend', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    price?: number;
    volume_mwh?: number;
    reason?: string;
  };

  const order = await c.env.DB.prepare(
    `SELECT id, participant_id, status, side, energy_type, volume_mwh, remaining_volume_mwh,
            price, delivery_date, post_only, reduce_only, time_in_force, order_type,
            stop_trigger_price, display_size_mwh, good_till
       FROM trade_orders WHERE id = ?`,
  ).bind(id).first<{
    id: string; participant_id: string; status: string; side: 'buy' | 'sell';
    energy_type: string; volume_mwh: number; remaining_volume_mwh: number | null;
    price: number | null; delivery_date: string | null;
    post_only: number; reduce_only: number; time_in_force: string; order_type: string;
    stop_trigger_price: number | null; display_size_mwh: number | null; good_till: string | null;
  }>();

  if (!order) return c.json({ success: false, error: 'Order not found' }, 404);
  if (order.participant_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'Not authorized' }, 403);
  }
  if (order.status !== 'open' && order.status !== 'partial') {
    return c.json({ success: false, error: `Cannot amend order in status '${order.status}'` }, 400);
  }

  const prevPrice = order.price;
  const prevVolume = Number(order.volume_mwh);
  const prevRemaining = Number(order.remaining_volume_mwh ?? order.volume_mwh);
  const filledSoFar = prevVolume - prevRemaining;

  // Resolve the new shape. If a field isn't supplied, it stays the same.
  const newPrice = body.price != null ? Number(body.price) : prevPrice;
  const newVolume = body.volume_mwh != null ? Number(body.volume_mwh) : prevVolume;

  if (!Number.isFinite(newVolume) || newVolume <= 0) {
    return c.json({ success: false, error: 'New volume must be positive' }, 400);
  }
  // Can't shrink below what's already been filled.
  if (newVolume < filledSoFar) {
    return c.json({
      success: false,
      error: `New volume ${newVolume} MWh is less than already-filled ${filledSoFar} MWh`,
    }, 400);
  }
  // No-op amendment.
  if (newPrice === prevPrice && newVolume === prevVolume) {
    return c.json({ success: false, error: 'Amendment is a no-op' }, 400);
  }

  // Re-evaluate the new shape against current risk + book state. We
  // subtract the existing reservation contribution from open exposure
  // first so we don't double-count this order's own headroom.
  const snapshot = await loadRiskSnapshot(c.env, order.participant_id, order.energy_type, order.delivery_date);
  const ownContribution = prevRemaining * Number(prevPrice ?? 0);
  const adjustedSnapshot: RiskSnapshot = {
    ...snapshot,
    open_exposure_zar: Math.max(0, snapshot.open_exposure_zar - ownContribution),
    free_collateral_zar: snapshot.free_collateral_zar
      + (await currentReservationFor(c.env, id) ?? 0),
  };
  const newRemaining = newVolume - filledSoFar;
  const proposed: ProposedOrder = {
    side: order.side,
    energy_type: order.energy_type,
    volume_mwh: newRemaining,            // gating treats remaining as the live exposure
    price_zar_mwh: newPrice,
    delivery_date: order.delivery_date,
    order_type: (order.order_type as ProposedOrder['order_type']) || 'limit',
    time_in_force: (order.time_in_force as ProposedOrder['time_in_force']) || 'gtc',
    expires_at: order.good_till,
    stop_trigger_price: order.stop_trigger_price,
    display_size_mwh: order.display_size_mwh,
    post_only: !!order.post_only,
    reduce_only: !!order.reduce_only,
  };
  const decision = evaluateOrder(proposed, adjustedSnapshot);
  if (!decision.ok) {
    return c.json({
      success: false,
      error: decision.reason_code,
      data: { reason_code: decision.reason_code, detail: decision.detail },
    }, 422);
  }

  // Priority semantics: lose priority on any price change OR volume
  // increase; keep priority on a pure volume decrease.
  const lostPriority = newPrice !== prevPrice || newVolume > prevVolume;
  const now = new Date().toISOString();
  const newPostedAt = lostPriority ? now : null;
  const amendmentId = 'amd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const newReservationId = 'res_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE trade_orders
          SET volume_mwh = ?, price = ?, remaining_volume_mwh = ?,
              amend_count = COALESCE(amend_count, 0) + 1,
              updated_at = ?` +
      (newPostedAt ? `, posted_at = ?` : '') +
      ` WHERE id = ?`,
    ).bind(...(newPostedAt
      ? [newVolume, newPrice, newRemaining, now, newPostedAt, id]
      : [newVolume, newPrice, newRemaining, now, id])),
    c.env.DB.prepare(
      `UPDATE margin_reservations
          SET status = 'released', resolved_at = ?, resolution_note = 'amended'
        WHERE order_id = ? AND status = 'reserved'`,
    ).bind(now, id),
    c.env.DB.prepare(
      `INSERT INTO margin_reservations
         (id, order_id, participant_id, amount_zar, status, reserved_at)
       VALUES (?, ?, ?, ?, 'reserved', ?)`,
    ).bind(newReservationId, id, order.participant_id, decision.reserved_margin_zar, now),
    c.env.DB.prepare(
      `INSERT INTO trade_order_amendments
         (id, order_id, amended_by, amended_at, prev_price, new_price,
          prev_volume_mwh, new_volume_mwh, prev_remaining_mwh, new_remaining_mwh,
          lost_priority, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      amendmentId, id, user.id, now, prevPrice, newPrice,
      prevVolume, newVolume, prevRemaining, newRemaining,
      lostPriority ? 1 : 0, body.reason ?? null,
    ),
  ]);

  await appendAudit({
    env: c.env, entity_type: 'trading', entity_id: id,
    event_type: 'order.amended', actor_id: user.id,
    payload: {
      order_id: id, amendment_id: amendmentId,
      prev_price: prevPrice, new_price: newPrice,
      prev_volume_mwh: prevVolume, new_volume_mwh: newVolume,
      prev_remaining_mwh: prevRemaining, new_remaining_mwh: newRemaining,
      lost_priority: lostPriority,
      reason: body.reason ?? null,
      reserved_margin_zar: decision.reserved_margin_zar,
    },
  }).catch((e) => console.warn('audit_order_amended_failed', (e as Error).message));

  return c.json({
    success: true,
    data: {
      amendment_id: amendmentId,
      order_id: id,
      lost_priority: lostPriority,
      new_price: newPrice,
      new_volume_mwh: newVolume,
      new_remaining_mwh: newRemaining,
      reserved_margin_zar: decision.reserved_margin_zar,
    },
  });
});

// Helper used by /amend to re-add this order's own reservation back into
// free collateral before re-gating, so the trader doesn't artificially
// fail on collateral that's still earmarked for the unchanged order.
async function currentReservationFor(env: HonoEnv['Bindings'], orderId: string): Promise<number | null> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_zar), 0) AS amt FROM margin_reservations
      WHERE order_id = ? AND status = 'reserved'`,
  ).bind(orderId).first<{ amt: number }>();
  return row?.amt != null ? Number(row.amt) : null;
}

// GET /trading/orders/:id/amendments — full amendment history for one order.
trading.get('/orders/:id/amendments', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const order = await c.env.DB.prepare(
    `SELECT participant_id FROM trade_orders WHERE id = ?`,
  ).bind(id).first<{ participant_id: string }>();
  if (!order) return c.json({ success: false, error: 'Order not found' }, 404);
  if (order.participant_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT id, amended_by, amended_at, prev_price, new_price,
            prev_volume_mwh, new_volume_mwh, prev_remaining_mwh, new_remaining_mwh,
            lost_priority, reason
       FROM trade_order_amendments
      WHERE order_id = ?
      ORDER BY amended_at DESC LIMIT 100`,
  ).bind(id).all();
  return c.json({ success: true, data: rs.results || [] });
});

// POST /trading/orders/expire — sweep open/partial orders past good_till
// to 'expired' and release their reserved margin. Admin/cron only; idem-
// potent (only acts on rows that haven't already been swept).
trading.post('/orders/expire', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'support') {
    return c.json({ success: false, error: 'admin only' }, 403);
  }
  const now = new Date().toISOString();
  const candidates = await c.env.DB.prepare(
    `SELECT id, participant_id FROM trade_orders
      WHERE status IN ('open','partial')
        AND good_till IS NOT NULL
        AND good_till <= ?
      LIMIT 500`,
  ).bind(now).all<{ id: string; participant_id: string }>();
  const ids = (candidates.results || []).map((r) => r.id);
  if (ids.length === 0) {
    return c.json({ success: true, data: { expired: 0 } });
  }
  // Static IN-list (we capped at 500 above) — keep it readable.
  const placeholders = ids.map(() => '?').join(',');
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE trade_orders SET status = 'expired', updated_at = ? WHERE id IN (${placeholders})`,
    ).bind(now, ...ids),
    c.env.DB.prepare(
      `UPDATE margin_reservations
          SET status = 'released', resolved_at = ?, resolution_note = 'order_expired'
        WHERE order_id IN (${placeholders}) AND status = 'reserved'`,
    ).bind(now, ...ids),
  ]);
  // Cascade per order so each owner gets their notification.
  await Promise.all((candidates.results || []).map((r) => fireCascade({
    event: 'trade.cancelled',          // closest existing event; no separate trade.expired today
    actor_id: user.id,
    entity_type: 'trade_orders',
    entity_id: r.id,
    data: { reason: 'expired' },
    env: c.env,
  })));
  return c.json({ success: true, data: { expired: ids.length, ids } });
});

// POST /trading/match — match a buy order against a sell order with proper
// partial-fill semantics (Phase 2). The requested volume is clamped to
// min(buy.remaining, sell.remaining, requested); each leg either fully
// fills (status='matched', reservation consumed) or partially fills
// (status='partial', remaining_volume_mwh decremented, reservation
// proportionally consumed with the residual still reserved).
//
// Serialized on the (sorted) order-id pair via an advisory lock so two
// callers can't both observe the same open state and double-fill.
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
        // Both 'open' (untouched) and 'partial' (already fractionally filled)
        // are eligible — 'partial' is now a real lifecycle state.
        const buyOk = buy.status === 'open' || buy.status === 'partial';
        const sellOk = sell.status === 'open' || sell.status === 'partial';
        if (!buyOk || !sellOk) throw new LockBusyError('__not_open__');
        if (user.id !== buy.participant_id && user.id !== sell.participant_id && user.role !== 'admin') {
          throw new LockBusyError('__not_counterparty__');
        }
        // FIX bizlogic-2: self-trade prevention — a participant cannot be
        // both buyer and seller on the same match (wash-trade / VWAP manipulation).
        if (buy.participant_id === sell.participant_id) {
          throw new LockBusyError('__self_trade__');
        }

        // Remaining-volume defaulting: legacy rows may have null in
        // remaining_volume_mwh (only the post-020 path sets it). Treat
        // null as the full volume so existing flows keep working.
        const buyRemaining = Number(buy.remaining_volume_mwh ?? buy.volume_mwh);
        const sellRemaining = Number(sell.remaining_volume_mwh ?? sell.volume_mwh);
        const requested = Number(volume_mwh);
        const fillVol = Math.min(buyRemaining, sellRemaining, requested);
        if (!Number.isFinite(fillVol) || fillVol <= 0) {
          throw new LockBusyError('__nothing_to_fill__');
        }

        const matchId = 'mt_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
        const price = Number(price_per_mwh ?? sell.price_min ?? buy.price_max ?? 0);
        // FIX bizlogic-3: reject non-positive price to prevent inverted settlement direction.
        if (!Number.isFinite(price) || price <= 0) {
          throw new LockBusyError('__invalid_price__');
        }
        const total_value = price * fillVol;
        const now = new Date().toISOString();

        const buyResidual = buyRemaining - fillVol;
        const sellResidual = sellRemaining - fillVol;
        const buyFullyFilled = buyResidual <= 0.0005;       // tiny float epsilon
        const sellFullyFilled = sellResidual <= 0.0005;

        const ops = [
          c.env.DB.prepare(`
            INSERT INTO trade_matches (id, buy_order_id, sell_order_id, matched_volume_mwh, matched_price, matched_at, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
          `).bind(matchId, buy_order_id, sell_order_id, fillVol, price, now),
          // Buy leg
          c.env.DB.prepare(
            `UPDATE trade_orders
                SET status = ?, remaining_volume_mwh = ?, updated_at = ?
              WHERE id = ?`,
          ).bind(buyFullyFilled ? 'matched' : 'partial', Math.max(0, buyResidual), now, buy_order_id),
          // Sell leg
          c.env.DB.prepare(
            `UPDATE trade_orders
                SET status = ?, remaining_volume_mwh = ?, updated_at = ?
              WHERE id = ?`,
          ).bind(sellFullyFilled ? 'matched' : 'partial', Math.max(0, sellResidual), now, sell_order_id),
        ];

        // Margin reservation handling — proportional to the consumed
        // fraction of each order. A fully-filled leg consumes its whole
        // reservation; a partially-filled leg keeps a proportionally
        // smaller residual reservation alive.
        const buyReservation = await c.env.DB.prepare(
          `SELECT id, amount_zar FROM margin_reservations
            WHERE order_id = ? AND status = 'reserved' LIMIT 1`,
        ).bind(buy_order_id).first<{ id: string; amount_zar: number }>();
        const sellReservation = await c.env.DB.prepare(
          `SELECT id, amount_zar FROM margin_reservations
            WHERE order_id = ? AND status = 'reserved' LIMIT 1`,
        ).bind(sell_order_id).first<{ id: string; amount_zar: number }>();

        if (buyReservation) {
          if (buyFullyFilled) {
            ops.push(c.env.DB.prepare(
              `UPDATE margin_reservations
                  SET status = 'consumed', resolved_at = ?, resolution_note = 'order_matched'
                WHERE id = ?`,
            ).bind(now, buyReservation.id));
          } else {
            const consumeRatio = fillVol / buyRemaining;
            const consumedAmt = buyReservation.amount_zar * consumeRatio;
            const residualAmt = buyReservation.amount_zar - consumedAmt;
            const consumedReservationId = 'res_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + 'b';
            // Split: original reservation becomes the consumed slice; a new
            // 'reserved' row is created for the residual so free-collateral
            // arithmetic stays simple (sum of WHERE status='reserved').
            ops.push(
              c.env.DB.prepare(
                `UPDATE margin_reservations
                    SET amount_zar = ?, status = 'consumed', resolved_at = ?, resolution_note = 'partial_fill_consumed'
                  WHERE id = ?`,
              ).bind(consumedAmt, now, buyReservation.id),
              c.env.DB.prepare(
                `INSERT INTO margin_reservations
                   (id, order_id, participant_id, amount_zar, status, reserved_at)
                 VALUES (?, ?, ?, ?, 'reserved', ?)`,
              ).bind(consumedReservationId, buy_order_id, buy.participant_id, residualAmt, now),
            );
          }
        }
        if (sellReservation) {
          if (sellFullyFilled) {
            ops.push(c.env.DB.prepare(
              `UPDATE margin_reservations
                  SET status = 'consumed', resolved_at = ?, resolution_note = 'order_matched'
                WHERE id = ?`,
            ).bind(now, sellReservation.id));
          } else {
            const consumeRatio = fillVol / sellRemaining;
            const consumedAmt = sellReservation.amount_zar * consumeRatio;
            const residualAmt = sellReservation.amount_zar - consumedAmt;
            const consumedReservationId = 'res_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + 's';
            ops.push(
              c.env.DB.prepare(
                `UPDATE margin_reservations
                    SET amount_zar = ?, status = 'consumed', resolved_at = ?, resolution_note = 'partial_fill_consumed'
                  WHERE id = ?`,
              ).bind(consumedAmt, now, sellReservation.id),
              c.env.DB.prepare(
                `INSERT INTO margin_reservations
                   (id, order_id, participant_id, amount_zar, status, reserved_at)
                 VALUES (?, ?, ?, ?, 'reserved', ?)`,
              ).bind(consumedReservationId, sell_order_id, sell.participant_id, residualAmt, now),
            );
          }
        }

        await c.env.DB.batch(ops);

        await fireCascade({
          event: 'trade.matched',
          actor_id: user.id,
          entity_type: 'trade_matches',
          entity_id: matchId,
          data: {
            match_id: matchId,
            buyer_id: buy.participant_id,
            seller_id: sell.participant_id,
            volume_mwh: fillVol,
            requested_volume_mwh: requested,
            price_per_mwh: price,
            total_value,
            delivery_date: buy.delivery_date || sell.delivery_date,
            buy_status: buyFullyFilled ? 'matched' : 'partial',
            sell_status: sellFullyFilled ? 'matched' : 'partial',
            buy_remaining_mwh: Math.max(0, buyResidual),
            sell_remaining_mwh: Math.max(0, sellResidual),
          },
          env: c.env,
        });

        return {
          id: matchId,
          total_value,
          matched_volume_mwh: fillVol,
          buy_status: buyFullyFilled ? 'matched' : 'partial',
          sell_status: sellFullyFilled ? 'matched' : 'partial',
          buy_remaining_mwh: Math.max(0, buyResidual),
          sell_remaining_mwh: Math.max(0, sellResidual),
        };
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
          return c.json({ success: false, error: 'Only open or partial orders can be matched' }, 400);
        case '__not_counterparty__':
          return c.json({ success: false, error: 'Not a counterparty to either order' }, 403);
        case '__self_trade__':
          return c.json({ success: false, error: 'Self-trade not permitted' }, 422);
        case '__nothing_to_fill__':
          return c.json({ success: false, error: 'No remaining volume on either side to fill' }, 400);
        case '__invalid_price__':
          return c.json({ success: false, error: 'price_per_mwh must be a positive number' }, 422);
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

// ════════════════════════════════════════════════════════════════════════
// Pre-trade gating surfaces — rejections log, AI explainer, ghost-text
// size suggestion, risk narrative. All small endpoints that the Trading
// UI calls inline (no dedicated AI tab).
// ════════════════════════════════════════════════════════════════════════

// GET /trading/rejections — my recent rejected order placements.
// Admins/risk officers can pass ?participant_id= to look at someone else's.
trading.get('/rejections', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = user.role === 'admin' || user.role === 'support' || user.role === 'regulator';
  const target = c.req.query('participant_id');
  const pid = target && isOfficer ? target : user.id;
  const rs = await c.env.DB.prepare(
    `SELECT id, attempted_at, reason_code, detail, side, energy_type,
            volume_mwh, price_zar_mwh, notional_zar
       FROM trade_order_rejections
      WHERE participant_id = ?
      ORDER BY attempted_at DESC LIMIT 100`,
  ).bind(pid).all();
  return c.json({ success: true, data: rs.results || [] });
});

// GET /trading/rejections/:id/explain — AI-generated plain-language
// explanation + 1-2 remediation buttons. Cached by snapshot bucket so
// rapid repeat calls are cheap; logs every call to ai_decisions for audit.
trading.get('/rejections/:id/explain', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = user.role === 'admin' || user.role === 'support' || user.role === 'regulator';
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT id, participant_id, reason_code, detail, side, energy_type,
            volume_mwh, price_zar_mwh, notional_zar, snapshot_json
       FROM trade_order_rejections WHERE id = ?`,
  ).bind(id).first<{
    id: string; participant_id: string; reason_code: string; detail: string;
    side: 'buy' | 'sell'; energy_type: string;
    volume_mwh: number; price_zar_mwh: number | null; notional_zar: number;
    snapshot_json: string;
  }>();
  if (!row) return c.json({ success: false, error: 'Rejection not found' }, 404);
  if (row.participant_id !== user.id && !isOfficer) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  let snapshot: Record<string, unknown> = {};
  try { snapshot = JSON.parse(row.snapshot_json || '{}') as Record<string, unknown>; } catch { /* */ }
  const explanation = await explainRejection(c.env, {
    reason_code: row.reason_code as Parameters<typeof explainRejection>[1]['reason_code'],
    detail: row.detail || '',
    participant_id: row.participant_id,
    side: row.side,
    energy_type: row.energy_type,
    volume_mwh: row.volume_mwh,
    price_zar_mwh: row.price_zar_mwh,
    notional_zar: row.notional_zar,
    snapshot,
  }, row.id);
  return c.json({ success: true, data: explanation });
});

// GET /trading/order-suggest — ghost-text size suggestion for the order
// form. Returns the largest size that would still pass the guards at the
// given side+energy_type, plus the snapshot the suggestion is based on so
// the UI can render the "why" tooltip without a second round-trip.
trading.get('/order-suggest', async (c) => {
  const user = getCurrentUser(c);
  const side = (c.req.query('side') || 'buy') as 'buy' | 'sell';
  const energyType = c.req.query('energy_type') || 'solar';
  const deliveryDate = c.req.query('delivery_date') || null;
  const snapshot = await loadRiskSnapshot(c.env, user.id, energyType, deliveryDate);
  const suggested = suggestedSizeMwh(snapshot, side);
  return c.json({
    success: true,
    data: {
      suggested_volume_mwh: suggested,
      side, energy_type: energyType,
      free_collateral_zar: snapshot.free_collateral_zar,
      headroom_zar: Math.max(0, snapshot.credit_limit_zar - snapshot.open_exposure_zar),
      mark_price_zar_mwh: snapshot.mark_price_zar_mwh,
      mark_age_minutes: snapshot.mark_age_minutes,
      market_state: snapshot.market_state,
    },
  });
});

// GET /trading/risk-narrative — one-liner for the Risk tab gauge.
// Combines today's exposure/utilisation with yesterday's snapshot when
// available; calls the LLM for the natural-language line and caches by
// participant for 5 minutes to keep latency tight + costs predictable.
trading.get('/risk-narrative', async (c) => {
  const user = getCurrentUser(c);
  const cacheKey = `ai:risk-narrative:${user.id}`;
  if (c.env.KV) {
    try {
      const hit = await c.env.KV.get(cacheKey);
      if (hit) return c.json({ success: true, data: JSON.parse(hit), cached: true });
    } catch { /* */ }
  }
  // Fresh data each call — cheap (single round-trip set).
  const [exposureRow, marginRow, recentFills] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
         (SELECT COALESCE(SUM(remaining_volume_mwh * COALESCE(price, 0)), 0)
            FROM trade_orders WHERE participant_id = ? AND status IN ('open','partially_filled')) AS open_exp,
         (SELECT limit_zar FROM credit_limits
           WHERE participant_id = ?
             AND (effective_to IS NULL OR effective_to >= datetime('now'))
             AND effective_from <= datetime('now')
           ORDER BY effective_from DESC LIMIT 1) AS limit_zar`,
    ).bind(user.id, user.id).first<{ open_exp: number; limit_zar: number | null }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(shortfall_zar), 0) AS short
         FROM margin_calls WHERE participant_id = ? AND status IN ('open','escalated','breached')`,
    ).bind(user.id).first<{ n: number; short: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(f.matched_volume_mwh * f.matched_price), 0) AS gross
         FROM trade_fills f JOIN trade_orders o ON o.id = f.order_id
        WHERE o.participant_id = ? AND f.executed_at >= datetime('now', '-24 hours')`,
    ).bind(user.id).first<{ n: number; gross: number }>(),
  ]);

  const open = Number(exposureRow?.open_exp || 0);
  const limit = Number(exposureRow?.limit_zar || 0);
  const utilPct = limit > 0 ? (open / limit) * 100 : 0;
  const factsForLLM = {
    open_exposure_zar: Math.round(open),
    limit_zar: Math.round(limit),
    utilisation_pct: Number(utilPct.toFixed(1)),
    open_margin_calls: Number(marginRow?.n || 0),
    margin_shortfall_zar: Math.round(Number(marginRow?.short || 0)),
    fills_24h: Number(recentFills?.n || 0),
    fills_24h_gross_zar: Math.round(Number(recentFills?.gross || 0)),
  };

  const result = await ask(c.env, {
    intent: 'brief.trader',
    role: user.role,
    prompt:
      `Write ONE sentence (max 22 words) summarising this trader's risk posture today. ` +
      `Reference the binding number first (utilisation, margin shortfall, or fills). ` +
      `No greeting, no JSON, just the sentence.`,
    context: factsForLLM,
    max_tokens: 80,
  });

  const headline = (result.text || '').replace(/^["']|["']$/g, '').trim().split('\n')[0].slice(0, 220)
    || `Utilisation ${factsForLLM.utilisation_pct.toFixed(1)}% with ${factsForLLM.fills_24h} fills in 24h.`;

  const data = { headline, facts: factsForLLM, fallback: !!result.fallback };

  await logAiDecision(c.env.DB, {
    surface: 'risk_narrative',
    participant_id: user.id,
    intent: 'brief.trader',
    prompt_summary: 'risk-narrative one-liner',
    response_text: headline,
    response_json: factsForLLM,
    model: result.model,
    fallback: !!result.fallback,
  });

  if (c.env.KV) {
    try { await c.env.KV.put(cacheKey, JSON.stringify(data), { expirationTtl: 300 }); } catch { /* */ }
  }
  return c.json({ success: true, data });
});

// ════════════════════════════════════════════════════════════════════════
// Algo rules — per-trader algorithmic strategy definitions
//
// Persisted in `trader_algo_rules` (auto-created if absent). The matching
// engine cron job reads enabled rules each tick and submits orders when
// triggers fire. The UI is a CRUD over these rows.
// ════════════════════════════════════════════════════════════════════════

async function ensureAlgoTable(env: HonoEnv['Bindings']) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS trader_algo_rules (
      id TEXT PRIMARY KEY,
      trader_id TEXT NOT NULL,
      name TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('buy','sell')),
      energy_type TEXT,
      trigger_below REAL,
      trigger_above REAL,
      size_mwh REAL NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fired_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

trading.get('/algo-rules', async (c) => {
  const user = getCurrentUser(c);
  await ensureAlgoTable(c.env);
  const rows = await c.env.DB.prepare(
    `SELECT id, name, side, energy_type, trigger_below, trigger_above, size_mwh, enabled, last_fired_at, created_at
       FROM trader_algo_rules WHERE trader_id = ? ORDER BY created_at DESC`,
  ).bind(user.id).all();
  // SQLite returns 0/1; serialise as bool for the UI.
  const data = (rows.results || []).map((r) => ({ ...(r as Record<string, unknown>), enabled: !!Number((r as { enabled?: number }).enabled || 0) }));
  return c.json({ success: true, data });
});

trading.post('/algo-rules', async (c) => {
  const user = getCurrentUser(c);
  await ensureAlgoTable(c.env);
  const body = (await c.req.json().catch(() => ({}))) as Partial<{
    name: string; side: 'buy' | 'sell'; energy_type: string;
    trigger_below: number; trigger_above: number; size_mwh: number; enabled: boolean;
  }>;
  if (!body.name || !body.side || !body.size_mwh) {
    return c.json({ success: false, error: 'name, side and size_mwh are required' }, 400);
  }
  if (!body.trigger_below && !body.trigger_above) {
    return c.json({ success: false, error: 'at_least_one_trigger_required' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO trader_algo_rules (id, trader_id, name, side, energy_type, trigger_below, trigger_above, size_mwh, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, user.id, body.name, body.side, body.energy_type || 'solar',
    body.trigger_below || null, body.trigger_above || null, body.size_mwh,
    body.enabled === false ? 0 : 1,
  ).run();
  await fireCascade({
    event: 'trader.algo_rule_created',
    actor_id: user.id, entity_type: 'trader_algo_rules', entity_id: id,
    data: { name: body.name, side: body.side }, env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

trading.put('/algo-rules/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  await ensureAlgoTable(c.env);
  const owner = await c.env.DB.prepare(`SELECT trader_id FROM trader_algo_rules WHERE id = ?`).bind(id).first();
  if (!owner) return c.json({ success: false, error: 'not_found' }, 404);
  if ((owner as { trader_id: string }).trader_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<{
    name: string; side: 'buy' | 'sell'; energy_type: string;
    trigger_below: number | null; trigger_above: number | null; size_mwh: number; enabled: boolean;
  }>;
  await c.env.DB.prepare(
    `UPDATE trader_algo_rules
        SET name = COALESCE(?, name),
            side = COALESCE(?, side),
            energy_type = COALESCE(?, energy_type),
            trigger_below = ?,
            trigger_above = ?,
            size_mwh = COALESCE(?, size_mwh),
            enabled = COALESCE(?, enabled),
            updated_at = datetime('now')
      WHERE id = ?`,
  ).bind(
    body.name ?? null, body.side ?? null, body.energy_type ?? null,
    body.trigger_below ?? null, body.trigger_above ?? null,
    body.size_mwh ?? null,
    body.enabled === undefined ? null : body.enabled ? 1 : 0,
    id,
  ).run();
  return c.json({ success: true });
});

trading.delete('/algo-rules/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  await ensureAlgoTable(c.env);
  const owner = await c.env.DB.prepare(`SELECT trader_id FROM trader_algo_rules WHERE id = ?`).bind(id).first();
  if (!owner) return c.json({ success: false, error: 'not_found' }, 404);
  if ((owner as { trader_id: string }).trader_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  await c.env.DB.prepare(`DELETE FROM trader_algo_rules WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

// ────────────────────────────────────────────────────────────────────────
// L4 endpoints — trade allocations, fees, exceptions, gate state,
// AI amendment suggestion.
//
// Pattern mirrors the settlement L4 surfaces (src/routes/settlement.ts):
// each new table from migration 054 has list + write endpoints, state
// machines reuse the open→investigating→resolved|rejected shape, and
// every AI surface logs to its own audit table on creation + accept.
// ────────────────────────────────────────────────────────────────────────

import { computeTradeFees, type FillShape } from '../utils/trade-fees';
import { gateStateFor, buildD1GateDeps } from '../utils/trade-gate';
import {
  suggestAmendment,
  type OrderSnapshot,
  type MarketSnapshot,
} from '../utils/amendment-suggester';

// GET /trading/gate?trading_day=YYYY-MM-DD&market_zone=ZA
// Pre-trade UI calls this to decide whether to even show the order ticket.
trading.get('/gate', async (c) => {
  const day = c.req.query('trading_day') || new Date().toISOString().slice(0, 10);
  const zone = c.req.query('market_zone') || 'ZA';
  const state = await gateStateFor(day, zone, buildD1GateDeps(c.env.DB));
  return c.json({ success: true, data: { trading_day: day, market_zone: zone, ...state } });
});

// POST /trading/matches/:id/fees/recompute — idempotent fee accrual.
trading.post('/matches/:id/fees/recompute', async (c) => {
  const matchId = c.req.param('id');
  const fill = await c.env.DB.prepare(
    `SELECT m.id AS match_id, m.buy_order_id, m.sell_order_id,
            m.matched_volume_mwh, COALESCE(m.matched_price, m.matched_price_zar) AS matched_price_zar,
            bo.participant_id AS buy_participant_id, bo.market_type AS market_type,
            so.participant_id AS sell_participant_id
       FROM trade_matches m
       INNER JOIN trade_orders bo ON bo.id = m.buy_order_id
       INNER JOIN trade_orders so ON so.id = m.sell_order_id
      WHERE m.id = ?`,
  )
    .bind(matchId)
    .first<FillShape>();
  if (!fill) return c.json({ success: false, error: 'Match not found' }, 404);

  const fees = computeTradeFees(fill);
  let inserted = 0;
  for (const f of fees) {
    const r = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO trade_fees
        (id, match_id, order_id, participant_id, fee_type, basis, amount_zar, reason, calc_rule_version, applied_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        f.id,
        f.match_id,
        f.order_id,
        f.participant_id,
        f.fee_type,
        f.basis,
        f.amount_zar,
        f.reason,
        f.calc_rule_version,
        f.applied_by ?? 'system',
      )
      .run()
      .catch(() => ({ changes: 0 } as any));
    inserted += Number((r as any)?.changes || 0);
  }

  const rows = await c.env.DB.prepare(
    `SELECT id, participant_id, fee_type, basis, amount_zar, reason, calc_rule_version, calculated_at
       FROM trade_fees WHERE match_id = ? ORDER BY calculated_at DESC`,
  )
    .bind(matchId)
    .all();
  return c.json({ success: true, data: { fees: rows.results || [], new_rows: inserted } });
});

// GET /trading/matches/:id/fees
trading.get('/matches/:id/fees', async (c) => {
  const matchId = c.req.param('id');
  const rows = await c.env.DB.prepare(
    `SELECT id, participant_id, fee_type, basis, amount_zar, reason, calc_rule_version, calculated_at
       FROM trade_fees WHERE match_id = ? ORDER BY calculated_at DESC`,
  )
    .bind(matchId)
    .all();
  return c.json({ success: true, data: rows.results || [] });
});

// POST /trading/matches/:id/allocations — attribute a fill to one or more
// internal lots / sub-accounts.
trading.post('/matches/:id/allocations', async (c) => {
  const user = getCurrentUser(c);
  const matchId = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    side?: 'buy' | 'sell';
    splits?: Array<{ participant_id: string; volume_mwh: number; sub_account?: string; lot_id?: string; reason?: string }>;
  };
  if (!body.side || !Array.isArray(body.splits) || body.splits.length === 0) {
    return c.json({ success: false, error: 'side and ≥1 splits required' }, 400);
  }

  const fill = await c.env.DB.prepare(
    `SELECT m.id, m.buy_order_id, m.sell_order_id, m.matched_volume_mwh,
            COALESCE(m.matched_price, m.matched_price_zar) AS matched_price_zar,
            bo.participant_id AS buy_pid, so.participant_id AS sell_pid
       FROM trade_matches m
       INNER JOIN trade_orders bo ON bo.id = m.buy_order_id
       INNER JOIN trade_orders so ON so.id = m.sell_order_id
      WHERE m.id = ?`,
  )
    .bind(matchId)
    .first<any>();
  if (!fill) return c.json({ success: false, error: 'Match not found' }, 404);

  const orderId = body.side === 'buy' ? fill.buy_order_id : fill.sell_order_id;
  const ownerId = body.side === 'buy' ? fill.buy_pid : fill.sell_pid;
  if (ownerId !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden — you do not own this side of the trade' }, 403);
  }

  const totalRequested = body.splits.reduce((s, sp) => s + Number(sp.volume_mwh || 0), 0);
  if (Math.abs(totalRequested - fill.matched_volume_mwh) > 0.001) {
    return c.json(
      {
        success: false,
        error: 'allocation total must equal matched volume',
        detail: { requested_total: totalRequested, matched_volume: fill.matched_volume_mwh },
      },
      422,
    );
  }

  const ids: string[] = [];
  for (const sp of body.splits) {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO trade_allocations
        (id, match_id, order_id, participant_id, allocated_volume_mwh,
         allocated_price_zar, sub_account, lot_id, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        matchId,
        orderId,
        sp.participant_id,
        Number(sp.volume_mwh),
        Number(fill.matched_price_zar),
        sp.sub_account || null,
        sp.lot_id || null,
        sp.reason || null,
        user.id,
      )
      .run();
    ids.push(id);
  }
  return c.json({ success: true, data: { allocation_ids: ids } });
});

// GET /trading/matches/:id/allocations
trading.get('/matches/:id/allocations', async (c) => {
  const matchId = c.req.param('id');
  const rows = await c.env.DB.prepare(
    `SELECT id, order_id, participant_id, allocated_volume_mwh,
            allocated_price_zar, sub_account, lot_id, reason, status, created_at
       FROM trade_allocations WHERE match_id = ?
       ORDER BY created_at DESC`,
  )
    .bind(matchId)
    .all();
  return c.json({ success: true, data: rows.results || [] });
});

// GET /trading/allocations — cross-fill listing for the caller. Returns
// each allocation tied to a fill on one of the caller's orders, plus
// per-row context (matched volume, price, counterparty) so the SPA can
// render a useful table. Also flags fills with NO allocation yet via
// the `unallocated` synthetic group at the top of the response.
trading.get('/allocations', async (c) => {
  const user = getCurrentUser(c);
  // Existing allocations.
  const alloc = await c.env.DB.prepare(
    `SELECT a.id, a.match_id, a.order_id, a.participant_id, a.allocated_volume_mwh,
            a.allocated_price_zar, a.sub_account, a.lot_id, a.reason, a.status, a.created_at,
            m.matched_volume_mwh, COALESCE(m.matched_price, m.matched_price_zar) AS matched_price_zar,
            m.matched_at, o.side AS order_side, o.energy_type
       FROM trade_allocations a
       INNER JOIN trade_matches m ON m.id = a.match_id
       INNER JOIN trade_orders o ON o.id = a.order_id
      WHERE o.participant_id = ?
      ORDER BY m.matched_at DESC, a.created_at DESC
      LIMIT 200`,
  )
    .bind(user.id)
    .all()
    .catch(() => ({ results: [] } as any));

  // Fills that have no allocation yet for the caller's side.
  const pending = await c.env.DB.prepare(
    `SELECT m.id AS match_id, o.id AS order_id, o.side AS order_side, o.energy_type,
            m.matched_volume_mwh, COALESCE(m.matched_price, m.matched_price_zar) AS matched_price_zar,
            m.matched_at
       FROM trade_matches m
       INNER JOIN trade_orders o ON (o.id = m.buy_order_id OR o.id = m.sell_order_id)
      WHERE o.participant_id = ?
        AND NOT EXISTS (SELECT 1 FROM trade_allocations a WHERE a.match_id = m.id AND a.order_id = o.id)
        AND m.matched_at >= datetime('now','-90 days')
      ORDER BY m.matched_at DESC
      LIMIT 100`,
  )
    .bind(user.id)
    .all()
    .catch(() => ({ results: [] } as any));

  return c.json({
    success: true,
    data: {
      allocations: alloc.results || [],
      unallocated: pending.results || [],
    },
  });
});

// GET /trading/fees — cross-fill fee ledger for the caller.
trading.get('/fees', async (c) => {
  const user = getCurrentUser(c);
  const feeType = c.req.query('fee_type');
  const where: string[] = ['f.participant_id = ?'];
  const binds: unknown[] = [user.id];
  if (feeType) { where.push('f.fee_type = ?'); binds.push(feeType); }
  const rows = await c.env.DB.prepare(
    `SELECT f.id, f.match_id, f.order_id, f.fee_type, f.basis, f.amount_zar,
            f.reason, f.calc_rule_version, f.calculated_at,
            m.matched_volume_mwh, COALESCE(m.matched_price, m.matched_price_zar) AS matched_price_zar,
            o.side AS order_side, o.energy_type
       FROM trade_fees f
       INNER JOIN trade_matches m ON m.id = f.match_id
       INNER JOIN trade_orders o ON o.id = f.order_id
      WHERE ${where.join(' AND ')}
      ORDER BY f.calculated_at DESC
      LIMIT 300`,
  )
    .bind(...binds)
    .all()
    .catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

// POST /trading/exceptions — file a trade exception against a fill.
trading.post('/exceptions', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    match_id?: string;
    exception_type?: string;
    severity?: string;
    reason?: string;
    expected_value?: number;
    actual_value?: number;
  };
  if (!body.match_id || !body.exception_type || !body.reason || body.reason.length < 3) {
    return c.json({ success: false, error: 'match_id, exception_type, reason (≥3 chars) required' }, 400);
  }

  // Caller must be a party to the fill.
  const fill = await c.env.DB.prepare(
    `SELECT m.id, m.buy_order_id, m.sell_order_id,
            bo.participant_id AS buy_pid, so.participant_id AS sell_pid
       FROM trade_matches m
       INNER JOIN trade_orders bo ON bo.id = m.buy_order_id
       INNER JOIN trade_orders so ON so.id = m.sell_order_id
      WHERE m.id = ?`,
  )
    .bind(body.match_id)
    .first<any>();
  if (!fill) return c.json({ success: false, error: 'Match not found' }, 404);
  const involved = user.id === fill.buy_pid || user.id === fill.sell_pid || user.role === 'admin';
  if (!involved) return c.json({ success: false, error: 'Forbidden' }, 403);

  // Best-effort: tie the exception to the caller's order side.
  const orderId = user.id === fill.buy_pid ? fill.buy_order_id : fill.sell_order_id;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO trade_exceptions
      (id, match_id, order_id, exception_type, severity, reported_by, reason,
       expected_value, actual_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.match_id,
      orderId,
      body.exception_type,
      body.severity || 'medium',
      user.id,
      body.reason,
      body.expected_value ?? null,
      body.actual_value ?? null,
    )
    .run();
  return c.json({ success: true, data: { id, status: 'open' } });
});

// GET /trading/exceptions — cross-fill listing for the caller, filterable.
trading.get('/exceptions', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const where: string[] = [
    '(bo.participant_id = ? OR so.participant_id = ? OR e.reported_by = ?)',
  ];
  const binds: unknown[] = [user.id, user.id, user.id];
  if (status) { where.push('e.status = ?'); binds.push(status); }
  const rows = await c.env.DB.prepare(
    `SELECT e.id, e.match_id, e.order_id, e.exception_type, e.severity, e.status,
            e.reported_by, e.reported_at, e.reason, e.expected_value, e.actual_value,
            e.resolution_outcome, e.resolution_notes, e.resolved_at,
            m.matched_volume_mwh, COALESCE(m.matched_price, m.matched_price_zar) AS matched_price_zar
       FROM trade_exceptions e
       INNER JOIN trade_matches m ON m.id = e.match_id
       INNER JOIN trade_orders bo ON bo.id = m.buy_order_id
       INNER JOIN trade_orders so ON so.id = m.sell_order_id
      WHERE ${where.join(' AND ')}
      ORDER BY CASE e.severity
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
        e.reported_at DESC
      LIMIT 200`,
  )
    .bind(...binds)
    .all()
    .catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

// POST /trading/exceptions/:id/transition — state machine transition,
// mirroring settlement-breaks transition.
trading.post('/exceptions/:id/transition', async (c) => {
  const user = getCurrentUser(c);
  const exId = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    to?: string;
    outcome?: string;
    notes?: string;
  };
  const to = String(body.to || '').trim();
  if (!['investigating', 'resolved', 'rejected'].includes(to)) {
    return c.json({ success: false, error: 'Invalid transition target' }, 400);
  }

  const ex = await c.env.DB.prepare(
    `SELECT e.id, e.status, e.match_id,
            bo.participant_id AS buy_pid, so.participant_id AS sell_pid
       FROM trade_exceptions e
       INNER JOIN trade_matches m ON m.id = e.match_id
       INNER JOIN trade_orders bo ON bo.id = m.buy_order_id
       INNER JOIN trade_orders so ON so.id = m.sell_order_id
      WHERE e.id = ?`,
  )
    .bind(exId)
    .first<any>();
  if (!ex) return c.json({ success: false, error: 'Exception not found' }, 404);
  const involved = user.id === ex.buy_pid || user.id === ex.sell_pid || user.role === 'admin';
  if (!involved) return c.json({ success: false, error: 'Forbidden' }, 403);
  if (ex.status === 'resolved' || ex.status === 'rejected') {
    return c.json({ success: false, error: `Exception is ${ex.status}; no further transitions` }, 422);
  }
  if (to === 'resolved' && ex.status !== 'investigating') {
    return c.json({ success: false, error: 'Move to investigating before resolving' }, 422);
  }
  if ((to === 'resolved' || to === 'rejected') && (!body.notes || body.notes.length < 3)) {
    return c.json({ success: false, error: 'Notes ≥3 chars required on terminal transitions' }, 400);
  }

  const now = new Date().toISOString();
  const isTerminal = to === 'resolved' || to === 'rejected';
  await c.env.DB.prepare(
    `UPDATE trade_exceptions
       SET status = ?, resolution_outcome = ?, resolution_notes = ?,
           resolved_at = ?, resolved_by = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      to,
      isTerminal ? (body.outcome || (to === 'resolved' ? 'adjusted' : 'no_action')) : null,
      body.notes || null,
      isTerminal ? now : null,
      isTerminal ? user.id : null,
      now,
      exId,
    )
    .run();

  await appendAudit({
    env: c.env, entity_type: 'trading', entity_id: exId,
    event_type: 'exception.transitioned', actor_id: user.id,
    payload: {
      exception_id: exId,
      from_status: ex.status, to_status: to,
      outcome: isTerminal ? (body.outcome || (to === 'resolved' ? 'adjusted' : 'no_action')) : null,
      notes: body.notes || null,
    },
  }).catch((e) => console.warn('audit_exception_transitioned_failed', (e as Error).message));

  return c.json({ success: true, data: { id: exId, status: to } });
});

// POST /trading/orders/:id/amend-suggest — AI inline amendment hint.
// Computes the best deterministic suggestion for an open order and
// records it to ai_trade_amendments. The SPA renders the rationale +
// 1-click accept; the accept endpoint marks accepted_at.
trading.post('/orders/:id/amend-suggest', async (c) => {
  const user = getCurrentUser(c);
  const orderId = c.req.param('id');
  const order = await c.env.DB.prepare(
    `SELECT id, participant_id, side, energy_type, volume_mwh,
            COALESCE(price_min, price_max) AS price_zar_mwh,
            status, time_in_force, posted_at,
            COALESCE(matched_volume_mwh, 0) AS filled_volume_mwh
       FROM trade_orders WHERE id = ?`,
  )
    .bind(orderId)
    .first<OrderSnapshot>()
    .catch(() => null);
  if (!order) return c.json({ success: false, error: 'Order not found' }, 404);
  if (order.participant_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  if (order.status !== 'open' && order.status !== 'partial') {
    return c.json({ success: false, error: `Order is ${order.status}; no amendment applicable` }, 422);
  }

  // Build a market snapshot from the orderbook aggregate.
  const market = await c.env.DB.prepare(
    `SELECT
       (SELECT MAX(COALESCE(price_max, price_min)) FROM trade_orders
         WHERE energy_type = ? AND side = 'buy' AND status IN ('open','partial')) AS best_bid,
       (SELECT MIN(COALESCE(price_min, price_max)) FROM trade_orders
         WHERE energy_type = ? AND side = 'sell' AND status IN ('open','partial')) AS best_ask,
       (SELECT COALESCE(SUM(volume_mwh - COALESCE(matched_volume_mwh,0)), 0) FROM trade_orders
         WHERE energy_type = ? AND side = 'buy' AND status IN ('open','partial')) AS bid_liquidity_mwh,
       (SELECT COALESCE(SUM(volume_mwh - COALESCE(matched_volume_mwh,0)), 0) FROM trade_orders
         WHERE energy_type = ? AND side = 'sell' AND status IN ('open','partial')) AS ask_liquidity_mwh`,
  )
    .bind(order.energy_type, order.energy_type, order.energy_type, order.energy_type)
    .first<MarketSnapshot>()
    .catch(() => null);
  if (!market) return c.json({ success: false, error: 'Market snapshot unavailable' }, 500);

  const suggestion = suggestAmendment(order, market);
  if (!suggestion) return c.json({ success: true, data: { suggestion: null } });

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO ai_trade_amendments
      (id, participant_id, order_id, suggestion_kind, current_state, suggested_state,
       rationale, confidence, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      order.participant_id,
      order.id,
      suggestion.kind,
      JSON.stringify(suggestion.current_state),
      JSON.stringify(suggestion.suggested_state),
      suggestion.rationale,
      suggestion.confidence,
      suggestion.source,
    )
    .run()
    .catch(() => {});

  return c.json({
    success: true,
    data: {
      suggestion_id: id,
      ...suggestion,
    },
  });
});

// POST /trading/amend-suggestions/:id/accept — audit the accept.
trading.post('/amend-suggestions/:id/accept', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE ai_trade_amendments
       SET accepted_at = datetime('now'), accepted_by = ?
     WHERE id = ? AND participant_id = ?`,
  )
    .bind(user.id, id, user.id)
    .run()
    .catch(() => {});
  return c.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════
// L5 — Tamper-evident audit, certified export, external reconciliation.
// ════════════════════════════════════════════════════════════════════════
import { getChainHead, verifyChain } from '../utils/audit-chain';

// GET /trading/audit/head — quick "what's the current chain head" used by
// the workstation badge ("verified · 12 432 events · head 4e2a…b6c1").
trading.get('/audit/head', async (c) => {
  const head = await getChainHead(c.env, 'trading');
  return c.json({ success: true, data: head });
});

// GET /trading/audit/events — paginated tail of the chain for the UI.
trading.get('/audit/events', async (c) => {
  const user = getCurrentUser(c);
  const limit = Math.min(200, Number(c.req.query('limit') || 50));
  const beforeSeq = c.req.query('before_seq');
  const where: string[] = [`entity_type = 'trading'`];
  const binds: unknown[] = [];
  // Non-officers see only events they caused (own participant audit log).
  const isOfficer = user.role === 'admin' || user.role === 'support' || user.role === 'regulator';
  if (!isOfficer) { where.push('actor_id = ?'); binds.push(user.id); }
  if (beforeSeq) { where.push('sequence_no < ?'); binds.push(Number(beforeSeq)); }
  const rs = await c.env.DB.prepare(
    `SELECT id, entity_id, event_type, actor_id, sequence_no,
            content_hash, prev_hash, created_at, payload_json
       FROM audit_events
      WHERE ${where.join(' AND ')}
      ORDER BY sequence_no DESC
      LIMIT ?`,
  ).bind(...binds, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

// POST /trading/audit/verify — walks the chain, recomputes each hash, returns
// the result (and persists last_verified_at into audit_chain_state). Admin
// and regulator only — verification touches every event row and is expensive.
trading.post('/audit/verify', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const fromSeq = Number(c.req.query('from_seq') || 1) || 1;
  const result = await verifyChain(c.env, 'trading', fromSeq);
  return c.json({ success: result.ok, data: result });
});

// POST /trading/audit/export — produces a NERSA-style certified export of
// trades in [from, to]. Streams CSV + manifest.json into R2 under
// audit-exports/trading/<id>/. Manifest includes:
//   • SHA-256 of the CSV bytes
//   • current head_hash of the trading chain
//   • SHA-256 of the manifest itself, signed by chain_head_hash
//
// On submit we return both R2 keys + a signed download URL with 24h TTL.
trading.post('/audit/export', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = body.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = body.to || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return c.json({ success: false, error: 'from/to must be YYYY-MM-DD' }, 400);
  }

  // Collect all matched trades in the window. Use ISO date prefix matching
  // since matched_at is an ISO timestamp.
  const rows = await c.env.DB.prepare(
    `SELECT m.id AS match_id, m.matched_at,
            COALESCE(m.matched_price, m.matched_price_zar) AS price_zar_mwh,
            m.matched_volume_mwh AS volume_mwh,
            b.energy_type, b.delivery_date,
            bp.name AS buyer_name, sp.name AS seller_name,
            b.participant_id AS buyer_id, s.participant_id AS seller_id
       FROM trade_matches m
       INNER JOIN trade_orders b ON b.id = m.buy_order_id
       INNER JOIN trade_orders s ON s.id = m.sell_order_id
       LEFT JOIN participants bp ON bp.id = b.participant_id
       LEFT JOIN participants sp ON sp.id = s.participant_id
      WHERE substr(m.matched_at, 1, 10) BETWEEN ? AND ?
      ORDER BY m.matched_at ASC`,
  ).bind(from, to).all<{
    match_id: string; matched_at: string;
    price_zar_mwh: number; volume_mwh: number;
    energy_type: string; delivery_date: string | null;
    buyer_name: string | null; seller_name: string | null;
    buyer_id: string; seller_id: string;
  }>();
  const data = rows.results || [];

  // NERSA-style trade register CSV (one row per match).
  const header = ['match_id','matched_at','energy_type','delivery_date',
                  'volume_mwh','price_zar_mwh','notional_zar',
                  'buyer_id','buyer_name','seller_id','seller_name'].join(',');
  const csvLines = [header];
  for (const r of data) {
    const notional = Number(r.volume_mwh) * Number(r.price_zar_mwh);
    csvLines.push([
      r.match_id, r.matched_at, r.energy_type, r.delivery_date || '',
      Number(r.volume_mwh).toFixed(4), Number(r.price_zar_mwh).toFixed(2),
      notional.toFixed(2),
      r.buyer_id, csvEscape(r.buyer_name || ''),
      r.seller_id, csvEscape(r.seller_name || ''),
    ].join(','));
  }
  const csv = csvLines.join('\n') + '\n';
  const csvBytes = new TextEncoder().encode(csv);
  const csvSha = await sha256OfBytes(csvBytes);

  const head = await getChainHead(c.env, 'trading');
  const exportId = 'exp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-exports/trading/${exportId}/trades.csv`;
  const manifestKey = `audit-exports/trading/${exportId}/manifest.json`;

  const manifest = {
    export_id: exportId,
    entity_type: 'trading',
    from, to,
    generated_at: new Date().toISOString(),
    generated_by: user.id,
    row_count: data.length,
    csv: { r2_key: csvKey, sha256: csvSha, bytes: csvBytes.byteLength },
    chain: {
      head_hash: head?.head_hash || null,
      head_sequence: head?.head_sequence || 0,
      last_verified_at: head?.last_verified_at || null,
    },
    format: { profile: 'NERSA section 9 trade register v1', encoding: 'utf-8' },
  };
  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestBytes = new TextEncoder().encode(manifestJson);

  // Write both to R2. Best-effort; if R2 fails we still record what would
  // have been written for the auditor to retry.
  try {
    await c.env.R2.put(csvKey, csvBytes, { httpMetadata: { contentType: 'text/csv' } });
    await c.env.R2.put(manifestKey, manifestBytes, { httpMetadata: { contentType: 'application/json' } });
  } catch (e) {
    return c.json({
      success: false,
      error: 'R2 write failed',
      data: { detail: (e as Error).message },
    }, 502);
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_exports
       (id, entity_type, from_ts, to_ts, row_count,
        csv_r2_key, manifest_r2_key, chain_head_hash, generated_by, generated_at)
     VALUES (?, 'trading', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(exportId, from, to, data.length, csvKey, manifestKey,
         head?.head_hash || '', user.id).run();

  await appendAudit({
    env: c.env, entity_type: 'trading', entity_id: exportId,
    event_type: 'audit.export_generated', actor_id: user.id,
    payload: { export_id: exportId, from, to, row_count: data.length, csv_sha256: csvSha },
  }).catch(() => {});

  return c.json({
    success: true,
    data: {
      export_id: exportId, row_count: data.length,
      csv_r2_key: csvKey, manifest_r2_key: manifestKey,
      manifest,
    },
  }, 201);
});

// GET /trading/audit/exports — list past exports for the dashboard.
trading.get('/audit/exports', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, from_ts, to_ts, row_count, csv_r2_key, manifest_r2_key,
            chain_head_hash, generated_by, generated_at
       FROM audit_exports
      WHERE entity_type = 'trading'
      ORDER BY generated_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

// GET /trading/audit/exports/:id/manifest — fetch the manifest JSON inline
// (avoids an R2 signed URL round-trip for the UI). Manifest is small.
trading.get('/audit/exports/:id/manifest', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT manifest_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'trading'`,
  ).bind(id).first<{ manifest_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.manifest_r2_key);
  if (!obj) return c.json({ success: false, error: 'Manifest object missing in R2' }, 404);
  const text = await obj.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* return raw text below */ }
  return c.json({ success: true, data: parsed ?? { raw: text } });

trading.get('/audit/exports/:id/csv', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT csv_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'trading'`,
  ).bind(id).first<{ csv_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.csv_r2_key);
  if (!obj) return c.json({ success: false, error: 'CSV object missing in R2' }, 404);
  return new Response(await obj.arrayBuffer(), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${id}.csv"`,
    },
  });
});
});

// POST /trading/audit/recon — accept a counterparty CSV of trades they
// believe they executed against us, match by external_ref and matched_at
// timestamp, write a recon run + breaks. Body shape:
//   { source: 'counterparty'|'eskom'|'verra', csv: 'header,row1\n…' }
// Expected CSV columns (header-driven):
//   external_ref, matched_at, energy_type, volume_mwh, price_zar_mwh
trading.post('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator' && user.role !== 'trader') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { source?: string; csv?: string };
  const source = (body.source || 'counterparty').toLowerCase();
  if (typeof body.csv !== 'string' || body.csv.length < 10) {
    return c.json({ success: false, error: 'csv body required' }, 400);
  }

  // Parse CSV (simple — no quoted commas; counterparty exports are clean).
  const lines = body.csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return c.json({ success: false, error: 'csv must have header + ≥1 row' }, 400);
  const headers = lines[0].split(',').map((h) => h.trim());
  const need = ['external_ref','matched_at','energy_type','volume_mwh','price_zar_mwh'];
  for (const k of need) {
    if (!headers.includes(k)) {
      return c.json({ success: false, error: `csv missing column: ${k}` }, 400);
    }
  }
  const idxOf = (k: string) => headers.indexOf(k);
  type TheirRow = { external_ref: string; matched_at: string; energy_type: string; volume_mwh: number; price_zar_mwh: number };
  const theirs: TheirRow[] = [];
  for (const ln of lines.slice(1)) {
    const cols = ln.split(',');
    theirs.push({
      external_ref: (cols[idxOf('external_ref')] || '').trim(),
      matched_at:   (cols[idxOf('matched_at')] || '').trim(),
      energy_type:  (cols[idxOf('energy_type')] || '').trim(),
      volume_mwh:   Number(cols[idxOf('volume_mwh')] || 0),
      price_zar_mwh: Number(cols[idxOf('price_zar_mwh')] || 0),
    });
  }

  // Upload the raw CSV to R2 for the audit trail.
  const runId = 'recon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-recon/trading/${runId}/upload.csv`;
  await c.env.R2.put(csvKey, new TextEncoder().encode(body.csv), {
    httpMetadata: { contentType: 'text/csv' },
  }).catch(() => null);

  // Pull our view of trades indexed by external_ref. Counterparty rows lacking
  // external_ref will get matched on (matched_at, volume_mwh, price) as a fallback.
  const ours = await c.env.DB.prepare(
    `SELECT m.id AS match_id, m.matched_at,
            COALESCE(m.matched_price, m.matched_price_zar) AS price_zar_mwh,
            m.matched_volume_mwh AS volume_mwh,
            b.energy_type, b.external_ref AS buyer_ref, s.external_ref AS seller_ref
       FROM trade_matches m
       INNER JOIN trade_orders b ON b.id = m.buy_order_id
       INNER JOIN trade_orders s ON s.id = m.sell_order_id`,
  ).all<{
    match_id: string; matched_at: string; price_zar_mwh: number;
    volume_mwh: number; energy_type: string;
    buyer_ref: string | null; seller_ref: string | null;
  }>();

  type OurRow = (typeof ours)['results'][number];
  const ourByRef = new Map<string, OurRow>();
  for (const r of (ours.results || []) as OurRow[]) {
    if (r.buyer_ref) ourByRef.set(r.buyer_ref, r);
    if (r.seller_ref) ourByRef.set(r.seller_ref, r);
  }
  const matchedRefs = new Set<string>();

  type Break = { type: string; external_ref: string | null; our: unknown; their: unknown; field: string | null };
  const breaks: Break[] = [];

  for (const t of theirs) {
    if (!t.external_ref) {
      breaks.push({ type: 'missing_in_ours', external_ref: null, our: null, their: t, field: null });
      continue;
    }
    const o = ourByRef.get(t.external_ref);
    if (!o) {
      breaks.push({ type: 'missing_in_ours', external_ref: t.external_ref, our: null, their: t, field: null });
      continue;
    }
    matchedRefs.add(t.external_ref);
    const eps = 1e-4;
    if (Math.abs(Number(o.volume_mwh) - Number(t.volume_mwh)) > eps) {
      breaks.push({ type: 'field_mismatch', external_ref: t.external_ref, our: o, their: t, field: 'volume_mwh' });
    }
    if (Math.abs(Number(o.price_zar_mwh) - Number(t.price_zar_mwh)) > 0.01) {
      breaks.push({ type: 'field_mismatch', external_ref: t.external_ref, our: o, their: t, field: 'price_zar_mwh' });
    }
    if ((o.energy_type || '').toLowerCase() !== (t.energy_type || '').toLowerCase()) {
      breaks.push({ type: 'field_mismatch', external_ref: t.external_ref, our: o, their: t, field: 'energy_type' });
    }
  }
  // Anything in ours that isn't in theirs (excluding rows we just matched).
  for (const [ref, o] of ourByRef.entries()) {
    if (matchedRefs.has(ref)) continue;
    if (!theirs.some((t) => t.external_ref === ref)) {
      breaks.push({ type: 'missing_in_theirs', external_ref: ref, our: o, their: null, field: null });
    }
  }

  const matchedCount = theirs.length - breaks.filter((b) => b.type !== 'field_mismatch').length;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO audit_recon_runs
       (id, entity_type, source, uploaded_csv_r2_key, row_count,
        matched_count, break_count, status, started_at, finished_at, started_by)
     VALUES (?, 'trading', ?, ?, ?, ?, ?, 'complete', ?, ?, ?)`,
  ).bind(runId, source, csvKey, theirs.length, matchedCount,
         breaks.length, now, now, user.id).run();

  if (breaks.length > 0) {
    const inserts = breaks.map((b) => c.env.DB.prepare(
      `INSERT INTO audit_recon_breaks
         (id, run_id, break_type, external_ref, our_value, their_value, field, resolution)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    ).bind(
      'brk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      runId, b.type, b.external_ref,
      b.our != null ? JSON.stringify(b.our) : null,
      b.their != null ? JSON.stringify(b.their) : null,
      b.field,
    ));
    await c.env.DB.batch(inserts);
  }

  await appendAudit({
    env: c.env, entity_type: 'trading', entity_id: runId,
    event_type: 'audit.recon_run', actor_id: user.id,
    payload: { run_id: runId, source, row_count: theirs.length, break_count: breaks.length },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { run_id: runId, source, row_count: theirs.length, matched_count: matchedCount, break_count: breaks.length },
  }, 201);
});

trading.get('/audit/recon', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, source, row_count, matched_count, break_count, status,
            started_at, finished_at
       FROM audit_recon_runs WHERE entity_type = 'trading'
      ORDER BY started_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

trading.get('/audit/recon/:id/breaks', async (c) => {
  const id = c.req.param('id');
  const rs = await c.env.DB.prepare(
    `SELECT id, break_type, external_ref, our_value, their_value, field,
            resolution, resolution_notes, resolved_at, resolved_by
       FROM audit_recon_breaks WHERE run_id = ?
      ORDER BY break_type, external_ref`,
  ).bind(id).all();
  return c.json({ success: true, data: rs.results || [] });
});

trading.post('/audit/recon/:run_id/breaks/:id/resolve', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'trader') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const runId = c.req.param('run_id');
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { resolution?: string; notes?: string };
  const allowed = ['accepted_ours','accepted_theirs','cancelled','investigating'];
  if (!allowed.includes(String(body.resolution))) {
    return c.json({ success: false, error: `resolution must be one of ${allowed.join('/')}` }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE audit_recon_breaks
       SET resolution = ?, resolution_notes = ?, resolved_at = datetime('now'), resolved_by = ?
     WHERE id = ? AND run_id = ?`,
  ).bind(body.resolution, body.notes || null, user.id, id, runId).run();
  await appendAudit({
    env: c.env, entity_type: 'trading', entity_id: id,
    event_type: 'audit.recon_break_resolved', actor_id: user.id,
    payload: { run_id: runId, break_id: id, resolution: body.resolution, notes: body.notes || null },
  }).catch(() => {});
  return c.json({ success: true });
});

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
async function sha256OfBytes(b: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', b);
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export default trading;
