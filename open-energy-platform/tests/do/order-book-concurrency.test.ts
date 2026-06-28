// Concurrency regression test for OrderBook DO.
//
// Reproduces the P0 double-fill: two concurrent /post calls to the same shard
// against the same maker. Before the fix, blockConcurrencyWhile only wrapped
// ensureHydrated, so the match->persist->mutate critical section interleaved at
// the persistMatch yield: both takers read the same un-mutated book, matched
// the SAME maker, and persisted DUPLICATE fills — double-spending maker volume.
//
// After the fix, the entire critical section runs inside blockConcurrencyWhile,
// so the second taker sees the maker's already-reduced remaining volume.
// Asserts: sum of fills against the maker across both concurrent posts <= the
// maker's original quantity (i.e. maker volume is never double-spent).

import { describe, it, expect } from 'vitest';
import { OrderBook } from '../../src/do/order-book';
import type { MatchingOrder } from '../../src/utils/matching';

// Minimal D1 fake. ensureHydrated SELECTs trade_orders once (book becomes
// non-null thereafter); all other statements are no-ops. The assertion uses
// the fills returned in each POST response, so D1 row state need not reflect
// the UPDATEs.
class FakeDB {
  private seedOrders: MatchingOrder[] = [];

  seed(orders: MatchingOrder[]): void {
    this.seedOrders = orders;
  }

  prepare(sql: string) {
    const trimmed = sql.trim();
    return {
      bind: (...args: unknown[]) => ({
        run: async () => ({ success: true, meta: {} }),
        all: async () => {
          if (
            trimmed.startsWith('SELECT')
            && trimmed.includes('FROM trade_orders')
            && trimmed.includes('shard_key')
          ) {
            const shardKey = args[0] as string;
            const results = this.seedOrders
              .filter(
                (o) =>
                  o.shard_key === shardKey
                  && (o as unknown as { status?: string }).status !== 'filled'
                  && (o as unknown as { status?: string }).status !== 'cancelled'
                  && Number(o.remaining_volume_mwh) > 0,
              )
              .sort((a, b) => a.posted_at.localeCompare(b.posted_at))
              .slice(0, 5000)
              .map((o) => ({
                id: o.id,
                participant_id: o.participant_id,
                side: o.side,
                price: o.price,
                volume_mwh: o.volume_mwh,
                remaining_volume_mwh: o.remaining_volume_mwh,
                posted_at: o.posted_at,
                order_type: o.order_type,
                shard_key: o.shard_key,
                status: 'open',
              }));
            return { results, success: true };
          }
          return { results: [], success: true };
        },
      }),
    };
  }
}

// Fake DurableObjectState whose blockConcurrencyWhile actually serialises —
// the gate is what prevents the interleave. Mirrors the real DO semantics: only
// one callback runs at a time; queued callers resume once the in-flight one
// resolves.
class FakeState {
  id = { name: 'solar|2026-04-23' };
  private locked = false;
  private queue: Array<() => void> = [];

  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.locked = true;
        Promise.resolve()
          .then(fn)
          .then(
            (v) => {
              this.locked = false;
              const next = this.queue.shift();
              if (next) next();
              resolve(v);
            },
            (err) => {
              this.locked = false;
              const next = this.queue.shift();
              if (next) next();
              reject(err);
            },
          );
      };
      if (!this.locked) run();
      else this.queue.push(run);
    });
  }
}

function mk(partial: Partial<MatchingOrder>): MatchingOrder {
  return {
    id: 'o_x',
    participant_id: 'p_x',
    side: 'buy',
    price: 100,
    volume_mwh: 10,
    remaining_volume_mwh: 10,
    posted_at: '2026-04-23T10:00:00Z',
    order_type: 'limit',
    shard_key: 'solar|2026-04-23',
    ...partial,
  };
}

describe('OrderBook DO — concurrency double-fill regression', () => {
  it('does not double-spend maker volume under two concurrent /post calls', async () => {
    const db = new FakeDB();
    const maker = mk({
      id: 'maker_s1',
      participant_id: 'p_maker',
      side: 'sell',
      price: 95,
      volume_mwh: 10,
      remaining_volume_mwh: 10,
      posted_at: '2026-04-23T09:00:00Z',
      order_type: 'limit',
    });
    db.seed([maker]);

    const state = new FakeState();
    const book = new OrderBook(
      state as unknown as import('@cloudflare/workers-types').DurableObjectState,
      { DB: db as unknown as import('@cloudflare/workers-types').D1Database },
    );

    const taker1 = mk({
      id: 'taker_b1',
      participant_id: 'p_buyer1',
      side: 'buy',
      price: 100,
      volume_mwh: 8,
      remaining_volume_mwh: 8,
    });
    const taker2 = mk({
      id: 'taker_b2',
      participant_id: 'p_buyer2',
      side: 'buy',
      price: 100,
      volume_mwh: 8,
      remaining_volume_mwh: 8,
    });

    const post = (order: MatchingOrder) =>
      new Request('https://do/post', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(order),
      });

    // Fire both concurrently — the gate must serialise them.
    const [r1, r2] = await Promise.all([book.fetch(post(taker1)), book.fetch(post(taker2))]);
    const d1 = (await r1.json()) as { data: { fills: { maker_order_id: string; volume_mwh: number }[] } };
    const d2 = (await r2.json()) as { data: { fills: { maker_order_id: string; volume_mwh: number }[] } };

    const fillsForMaker = [
      ...d1.data.fills,
      ...d2.data.fills,
    ].filter((f) => f.maker_order_id === 'maker_s1');
    const totalFilled = fillsForMaker.reduce((s, f) => s + f.volume_mwh, 0);

    // Maker had 10 MWh. Without the fix both takers would each fill 8 (sum 16)
    // against the un-mutated book — double-spend. With the fix the second taker
    // sees the maker's already-reduced remaining volume.
    expect(totalFilled).toBeLessThanOrEqual(10);
    expect(totalFilled).toBe(10); // first fills 8, second fills the remaining 2
  });
});