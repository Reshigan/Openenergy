// ═══════════════════════════════════════════════════════════════════════════
// OrderBook — Durable Object wrapping the price-time matching engine.
// -----------------------------------------------------------------------------
// One DO per shard (energy_type × delivery_day). Serialises writes so the
// matching algorithm has a consistent view of the book without distributed
// locks. Persists fills, maker/taker state mutations, and depth snapshots to
// D1 so non-DO reads (ticker, depth, history) stay cheap.
//
// Request surface (fetch()):
//   POST /post            body: MatchingOrder-shaped (taker order)
//   POST /cancel          body: { order_id, participant_id }
//   GET  /depth           returns current top-of-book + top-5 depth
//   POST /snapshot        persists depth to D1; called by cron or on-demand
// ═══════════════════════════════════════════════════════════════════════════

import type { DurableObjectState, D1Database } from '@cloudflare/workers-types';
import { matchOrder, MatchingOrder, Fill } from '../utils/matching';

export interface OrderBookEnv {
  DB: D1Database;
}

type BookEntry = MatchingOrder;

export class OrderBook {
  private state: DurableObjectState;
  private env: OrderBookEnv;
  private book: BookEntry[] | null = null; // lazily hydrated from D1
  private shardKey: string | null = null;

  constructor(state: DurableObjectState, env: OrderBookEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (path === '/post' && req.method === 'POST') return await this.handlePost(req);
      if (path === '/cancel' && req.method === 'POST') return await this.handleCancel(req);
      if (path === '/depth' && req.method === 'GET') return await this.handleDepth();
      if (path === '/snapshot' && req.method === 'POST') return await this.handleSnapshot();
      return json({ error: 'not_found' }, 404);
    } catch (err) {
      return json({ error: 'internal_error', message: (err as Error).message }, 500);
    }
  }

  private async handlePost(req: Request): Promise<Response> {
    const incoming = (await req.json()) as MatchingOrder;
    if (!incoming.shard_key || !incoming.id) {
      return json({ error: 'shard_key and id are required' }, 400);
    }
    this.shardKey = incoming.shard_key;
    await this.state.blockConcurrencyWhile(async () => {
      await this.ensureHydrated();
    });

    const result = matchOrder(incoming, this.book || []);

    // Persist fills + state mutations.
    await this.persistMatch(incoming, result.fills, result.filled_maker_ids, result.partially_filled_maker_ids, result.maker_remaining);

    // Update in-memory book.
    if (this.book) {
      for (const id of result.filled_maker_ids) {
        const idx = this.book.findIndex((o) => o.id === id);
        if (idx >= 0) this.book.splice(idx, 1);
      }
      for (const id of result.partially_filled_maker_ids) {
        const row = this.book.find((o) => o.id === id);
        if (row) row.remaining_volume_mwh = result.maker_remaining[id] ?? row.remaining_volume_mwh;
      }
      const takerRemaining = result.taker_remaining;
      const isResting = !result.taker_fully_filled
        && takerRemaining > 0
        && incoming.order_type !== 'ioc'
        && incoming.order_type !== 'fok'
        && incoming.order_type !== 'market';
      if (isResting) {
        this.book.push({ ...incoming, remaining_volume_mwh: takerRemaining });
        await this.persistTakerResting(incoming, takerRemaining);
      } else if (result.fills.length === 0 && (incoming.order_type === 'ioc' || incoming.order_type === 'fok')) {
        await this.persistTakerCancelled(incoming.id);
      } else if (!result.taker_fully_filled) {
        // Market or IOC order with residual volume — cancel the residual.
        await this.persistTakerCancelled(incoming.id);
      }
    }

    await this.writeDepthSnapshot();

    return json({
      success: true,
      data: {
        fills: result.fills,
        taker_remaining: result.taker_remaining,
        taker_status: this.deriveTakerStatus(incoming, result),
      },
    });
  }

  private async handleCancel(req: Request): Promise<Response> {
    const { order_id, participant_id } = (await req.json()) as { order_id: string; participant_id: string };
    if (!order_id) return json({ error: 'order_id required' }, 400);
    await this.state.blockConcurrencyWhile(async () => {
      await this.ensureHydrated();
      if (this.book) {
        this.book = this.book.filter((o) => o.id !== order_id);
      }
      await this.env.DB.prepare(
        `UPDATE trade_orders SET status = 'cancelled', updated_at = datetime('now')
           WHERE id = ? AND participant_id = ? AND status IN ('open','partially_filled')`,
      ).bind(order_id, participant_id).run();
    });
    await this.writeDepthSnapshot();
    return json({ success: true, data: { order_id, status: 'cancelled' } });
  }

  private async handleDepth(): Promise<Response> {
    await this.ensureHydrated();
    return json({ success: true, data: this.computeDepth() });
  }

  private async handleSnapshot(): Promise<Response> {
    await this.ensureHydrated();
    await this.writeDepthSnapshot();
    return json({ success: true, data: { snapshotted: true } });
  }

  private async ensureHydrated(): Promise<void> {
    if (this.book) return;
    // Hydrate from D1: any open/partially_filled order in this shard.
    // Cold-start: fetch shard_key from DO name if we don't know it yet.
    if (!this.shardKey) {
      this.shardKey = this.state.id.name || null;
    }
    if (!this.shardKey) {
      this.book = [];
      return;
    }
    const rs = await this.env.DB.prepare(
      `SELECT id, participant_id, side, price, volume_mwh, remaining_volume_mwh,
              posted_at, order_type, shard_key
         FROM trade_orders
        WHERE shard_key = ?
          AND status IN ('open','partially_filled')
          AND remaining_volume_mwh > 0
        ORDER BY posted_at ASC
        LIMIT 5000`,
    ).bind(this.shardKey).all<BookEntry>();
    this.book = (rs.results || []).map((r) => ({
      id: r.id,
      participant_id: r.participant_id,
      side: r.side,
      price: r.price == null ? null : Number(r.price),
      volume_mwh: Number(r.volume_mwh),
      remaining_volume_mwh: Number(r.remaining_volume_mwh ?? r.volume_mwh),
      posted_at: r.posted_at || new Date(0).toISOString(),
      order_type: (r.order_type || 'limit') as MatchingOrder['order_type'],
      shard_key: r.shard_key || this.shardKey!,
    }));
  }

  private deriveTakerStatus(
    incoming: MatchingOrder,
    result: { fills: Fill[]; taker_fully_filled: boolean; taker_remaining: number },
  ): string {
    if (result.taker_fully_filled) return 'filled';
    if (result.fills.length > 0) {
      return incoming.order_type === 'ioc' || incoming.order_type === 'fok' || incoming.order_type === 'market'
        ? 'partially_filled_cancelled'
        : 'partially_filled';
    }
    if (incoming.order_type === 'fok' || incoming.order_type === 'ioc' || incoming.order_type === 'market') {
      return 'cancelled';
    }
    return 'open';
  }

  private async persistMatch(
    taker: MatchingOrder,
    fills: Fill[],
    filledMakers: string[],
    partialMakers: string[],
    makerRemaining: Record<string, number>,
  ): Promise<void> {
    if (fills.length === 0 && filledMakers.length === 0 && partialMakers.length === 0) return;
    const now = new Date().toISOString();

    for (const f of fills) {
      const fillId = 'fl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const matchId = 'mt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const buyOrderId = f.side === 'buy' ? f.taker_order_id : f.maker_order_id;
      const sellOrderId = f.side === 'buy' ? f.maker_order_id : f.taker_order_id;

      await this.env.DB.prepare(
        `INSERT INTO trade_matches (id, buy_order_id, sell_order_id, matched_volume_mwh, matched_price, matched_at, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      ).bind(matchId, buyOrderId, sellOrderId, f.volume_mwh, f.price, now).run();

      await this.env.DB.prepare(
        `INSERT INTO trade_fills (id, order_id, counterparty_order_id, match_id, shard_key, side, volume_mwh, price, executed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(fillId, f.taker_order_id, f.maker_order_id, matchId, f.shard_key, f.side, f.volume_mwh, f.price, now).run();

      // Maker fill mirror — so /orders/:id/fills returns both sides.
      const makerFillId = 'fl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await this.env.DB.prepare(
        `INSERT INTO trade_fills (id, order_id, counterparty_order_id, match_id, shard_key, side, volume_mwh, price, executed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        makerFillId, f.maker_order_id, f.taker_order_id, matchId, f.shard_key,
        f.side === 'buy' ? 'sell' : 'buy', f.volume_mwh, f.price, now,
      ).run();

      await this.updateMarketPrint(f.shard_key, f.price, f.volume_mwh);
    }

    // Flip fully-filled makers to 'filled'.
    for (const id of filledMakers) {
      await this.env.DB.prepare(
        `UPDATE trade_orders
           SET status = 'filled', remaining_volume_mwh = 0, updated_at = ?
         WHERE id = ?`,
      ).bind(now, id).run();
    }
    // Update partially-filled makers.
    for (const id of partialMakers) {
      await this.env.DB.prepare(
        `UPDATE trade_orders
           SET status = 'partially_filled', remaining_volume_mwh = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(makerRemaining[id] ?? 0, now, id).run();
    }

    // Taker mutation depends on residual: caller persists resting / cancel
    // paths in persistTakerResting / persistTakerCancelled. Here we only
    // handle the all-filled case so the order flips status even if the taker
    // never gets posted to the book.
    const takerRemaining = taker.remaining_volume_mwh - fills.reduce((sum, f) => sum + f.volume_mwh, 0);
    if (takerRemaining <= 1e-9) {
      await this.env.DB.prepare(
        `UPDATE trade_orders
           SET status = 'filled', remaining_volume_mwh = 0, updated_at = ?, posted_at = COALESCE(posted_at, ?)
         WHERE id = ?`,
      ).bind(now, now, taker.id).run();
    } else if (fills.length > 0) {
      await this.env.DB.prepare(
        `UPDATE trade_orders
           SET status = 'partially_filled', remaining_volume_mwh = ?, updated_at = ?, posted_at = COALESCE(posted_at, ?)
         WHERE id = ?`,
      ).bind(takerRemaining, now, now, taker.id).run();
    }
  }

  private async persistTakerResting(taker: MatchingOrder, remaining: number): Promise<void> {
    const now = new Date().toISOString();
    await this.env.DB.prepare(
      `UPDATE trade_orders
         SET status = CASE WHEN status = 'filled' THEN status
                           WHEN remaining_volume_mwh < volume_mwh THEN 'partially_filled'
                           ELSE 'open' END,
             remaining_volume_mwh = ?,
             posted_at = COALESCE(posted_at, ?),
             updated_at = ?
       WHERE id = ?`,
    ).bind(remaining, now, now, taker.id).run();
  }

  private async persistTakerCancelled(orderId: string): Promise<void> {
    await this.env.DB.prepare(
      `UPDATE trade_orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
    ).bind(orderId).run();
  }

  private async updateMarketPrint(shardKey: string, price: number, volume: number): Promise<void> {
    const bucket = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
    // UPSERT via INSERT OR IGNORE + UPDATE (SQLite has ON CONFLICT but older
    // schemas in D1 staging have hit quirks — two-step is always safe).
    await this.env.DB.prepare(
      `INSERT OR IGNORE INTO market_prints
         (shard_key, minute_bucket, open_price, high_price, low_price, close_price, volume_mwh, trade_count)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
    ).bind(shardKey, bucket, price, price, price, price).run();
    await this.env.DB.prepare(
      `UPDATE market_prints
          SET high_price = MAX(high_price, ?),
              low_price  = MIN(low_price, ?),
              close_price = ?,
              volume_mwh = volume_mwh + ?,
              trade_count = trade_count + 1
        WHERE shard_key = ? AND minute_bucket = ?`,
    ).bind(price, price, price, volume, shardKey, bucket).run();
  }

  private computeDepth(): {
    shard_key: string | null;
    best_bid: number | null;
    best_ask: number | null;
    bid_depth: Array<{ price: number; volume: number; orders: number }>;
    ask_depth: Array<{ price: number; volume: number; orders: number }>;
    mid_price: number | null;
    spread_bps: number | null;
  } {
    if (!this.book) return empty(this.shardKey);
    const bids = this.book
      .filter((o) => o.side === 'buy' && o.remaining_volume_mwh > 0 && o.price != null)
      .sort((a, b) => (b.price || 0) - (a.price || 0));
    const asks = this.book
      .filter((o) => o.side === 'sell' && o.remaining_volume_mwh > 0 && o.price != null)
      .sort((a, b) => (a.price || 0) - (b.price || 0));

    const bidDepth = bucketByPrice(bids);
    const askDepth = bucketByPrice(asks);
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    const mid = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;
    const spreadBps = bestBid != null && bestAsk != null && mid
      ? ((bestAsk - bestBid) / mid) * 10000
      : null;

    return {
      shard_key: this.shardKey,
      best_bid: bestBid,
      best_ask: bestAsk,
      bid_depth: bidDepth.slice(0, 10),
      ask_depth: askDepth.slice(0, 10),
      mid_price: mid,
      spread_bps: spreadBps,
    };
  }

  private async writeDepthSnapshot(): Promise<void> {
    if (!this.shardKey) return;
    const d = this.computeDepth();
    const bidVol5 = (d.bid_depth.slice(0, 5) as Array<{ volume: number }>).reduce((s, x) => s + x.volume, 0);
    const askVol5 = (d.ask_depth.slice(0, 5) as Array<{ volume: number }>).reduce((s, x) => s + x.volume, 0);
    await this.env.DB.prepare(
      `INSERT OR REPLACE INTO order_book_depth
         (shard_key, snapshot_at, best_bid, best_ask, bid_volume_top5, ask_volume_top5, mid_price, spread_bps)
       VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?)`,
    ).bind(this.shardKey, d.best_bid, d.best_ask, bidVol5, askVol5, d.mid_price, d.spread_bps).run();
  }
}

function bucketByPrice(orders: BookEntry[]): Array<{ price: number; volume: number; orders: number }> {
  const buckets = new Map<number, { price: number; volume: number; orders: number }>();
  for (const o of orders) {
    if (o.price == null) continue;
    const b = buckets.get(o.price) || { price: o.price, volume: 0, orders: 0 };
    b.volume += o.remaining_volume_mwh;
    b.orders += 1;
    buckets.set(o.price, b);
  }
  return Array.from(buckets.values());
}

function empty(shardKey: string | null) {
  return {
    shard_key: shardKey,
    best_bid: null,
    best_ask: null,
    bid_depth: [],
    ask_depth: [],
    mid_price: null,
    spread_bps: null,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
