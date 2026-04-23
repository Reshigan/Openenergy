import { describe, it, expect } from 'vitest';
import { matchOrder, deriveShardKey, MatchingOrder } from '../src/utils/matching';

// Shorthand constructor keeps the individual test cases readable.
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

describe('matchOrder — price/time priority', () => {
  it('crosses a buy against a cheaper sell and fills fully', () => {
    const taker = mk({ id: 't1', participant_id: 'p_buyer', side: 'buy', price: 100, volume_mwh: 5, remaining_volume_mwh: 5 });
    const book = [
      mk({ id: 's1', participant_id: 'p_seller', side: 'sell', price: 95, volume_mwh: 10, remaining_volume_mwh: 10, posted_at: '2026-04-23T09:00:00Z' }),
    ];
    const r = matchOrder(taker, book);
    expect(r.fills).toHaveLength(1);
    expect(r.fills[0].price).toBe(95); // maker wins on price
    expect(r.fills[0].volume_mwh).toBe(5);
    expect(r.taker_fully_filled).toBe(true);
    expect(r.partially_filled_maker_ids).toEqual(['s1']);
    expect(r.maker_remaining.s1).toBe(5);
  });

  it('does not cross when taker buy price is below best ask', () => {
    const taker = mk({ id: 't1', side: 'buy', price: 90, volume_mwh: 5, remaining_volume_mwh: 5 });
    const book = [mk({ id: 's1', participant_id: 'p_other', side: 'sell', price: 95, volume_mwh: 10, remaining_volume_mwh: 10 })];
    const r = matchOrder(taker, book);
    expect(r.fills).toHaveLength(0);
    expect(r.taker_remaining).toBe(5);
  });

  it('prefers the cheapest sell when multiple exist (price priority)', () => {
    const taker = mk({ id: 't1', side: 'buy', price: 100, volume_mwh: 5, remaining_volume_mwh: 5 });
    const book = [
      mk({ id: 's_expensive', participant_id: 'p_a', side: 'sell', price: 99, volume_mwh: 10, remaining_volume_mwh: 10, posted_at: '2026-04-23T08:00:00Z' }),
      mk({ id: 's_cheap',     participant_id: 'p_b', side: 'sell', price: 95, volume_mwh: 10, remaining_volume_mwh: 10, posted_at: '2026-04-23T09:00:00Z' }),
    ];
    const r = matchOrder(taker, book);
    expect(r.fills[0].maker_order_id).toBe('s_cheap');
  });

  it('breaks ties on earliest posted_at (time priority)', () => {
    const taker = mk({ id: 't1', side: 'buy', price: 100, volume_mwh: 5, remaining_volume_mwh: 5 });
    const book = [
      mk({ id: 's_later',  participant_id: 'p_a', side: 'sell', price: 95, volume_mwh: 10, remaining_volume_mwh: 10, posted_at: '2026-04-23T10:00:00Z' }),
      mk({ id: 's_first',  participant_id: 'p_b', side: 'sell', price: 95, volume_mwh: 10, remaining_volume_mwh: 10, posted_at: '2026-04-23T09:00:00Z' }),
    ];
    const r = matchOrder(taker, book);
    expect(r.fills[0].maker_order_id).toBe('s_first');
  });

  it('sweeps multiple resting orders when taker size exceeds top of book', () => {
    const taker = mk({ id: 't1', side: 'buy', price: 100, volume_mwh: 20, remaining_volume_mwh: 20 });
    const book = [
      mk({ id: 's1', participant_id: 'p_a', side: 'sell', price: 95, volume_mwh: 5,  remaining_volume_mwh: 5,  posted_at: '2026-04-23T08:00:00Z' }),
      mk({ id: 's2', participant_id: 'p_b', side: 'sell', price: 97, volume_mwh: 10, remaining_volume_mwh: 10, posted_at: '2026-04-23T08:30:00Z' }),
      mk({ id: 's3', participant_id: 'p_c', side: 'sell', price: 99, volume_mwh: 10, remaining_volume_mwh: 10, posted_at: '2026-04-23T09:00:00Z' }),
    ];
    const r = matchOrder(taker, book);
    // Taker wants 20 MWh: consumes s1 fully (5), s2 fully (10), s3 partially (5).
    expect(r.fills).toHaveLength(3);
    expect(r.fills[0].maker_order_id).toBe('s1');
    expect(r.fills[0].price).toBe(95);
    expect(r.fills[1].maker_order_id).toBe('s2');
    expect(r.fills[1].price).toBe(97);
    expect(r.fills[2].maker_order_id).toBe('s3');
    expect(r.fills[2].price).toBe(99);
    expect(r.fills[2].volume_mwh).toBe(5);
    expect(r.filled_maker_ids).toEqual(['s1', 's2']);
    expect(r.partially_filled_maker_ids).toEqual(['s3']);
    expect(r.maker_remaining.s3).toBe(5);
    expect(r.taker_fully_filled).toBe(true);
  });

  it('refuses self-match even if prices cross', () => {
    const taker = mk({ id: 't1', participant_id: 'p_same', side: 'buy', price: 100, volume_mwh: 5, remaining_volume_mwh: 5 });
    const book = [mk({ id: 's1', participant_id: 'p_same', side: 'sell', price: 95, volume_mwh: 10, remaining_volume_mwh: 10 })];
    const r = matchOrder(taker, book);
    expect(r.fills).toHaveLength(0);
    expect(r.taker_remaining).toBe(5);
  });

  it('returns no fills for FOK when the book cannot cover the full size', () => {
    const taker = mk({ id: 't1', side: 'buy', price: 100, volume_mwh: 20, remaining_volume_mwh: 20, order_type: 'fok' });
    const book = [mk({ id: 's1', participant_id: 'p_a', side: 'sell', price: 95, volume_mwh: 5, remaining_volume_mwh: 5 })];
    const r = matchOrder(taker, book);
    expect(r.fills).toHaveLength(0);
    expect(r.taker_fully_filled).toBe(false);
    expect(r.taker_remaining).toBe(20);
  });

  it('fills a market order at best available prices regardless of taker price', () => {
    const taker = mk({ id: 't1', side: 'buy', price: null, volume_mwh: 10, remaining_volume_mwh: 10, order_type: 'market' });
    const book = [mk({ id: 's1', participant_id: 'p_a', side: 'sell', price: 150, volume_mwh: 10, remaining_volume_mwh: 10 })];
    const r = matchOrder(taker, book);
    expect(r.fills).toHaveLength(1);
    expect(r.fills[0].price).toBe(150);
    expect(r.taker_fully_filled).toBe(true);
  });

  it('matches sell taker against highest bid first', () => {
    const taker = mk({ id: 't1', side: 'sell', price: 90, volume_mwh: 5, remaining_volume_mwh: 5 });
    const book = [
      mk({ id: 'b_low',  participant_id: 'p_a', side: 'buy', price: 92, volume_mwh: 10, remaining_volume_mwh: 10 }),
      mk({ id: 'b_high', participant_id: 'p_b', side: 'buy', price: 98, volume_mwh: 10, remaining_volume_mwh: 10 }),
    ];
    const r = matchOrder(taker, book);
    expect(r.fills[0].maker_order_id).toBe('b_high');
    expect(r.fills[0].price).toBe(98);
  });

  it('ignores orders on a different shard', () => {
    const taker = mk({ id: 't1', side: 'buy', price: 100, volume_mwh: 5, remaining_volume_mwh: 5, shard_key: 'solar|2026-04-23' });
    const book = [mk({ id: 's1', participant_id: 'p_a', side: 'sell', price: 50, volume_mwh: 10, remaining_volume_mwh: 10, shard_key: 'wind|2026-04-23' })];
    const r = matchOrder(taker, book);
    expect(r.fills).toHaveLength(0);
  });
});

describe('deriveShardKey', () => {
  it('normalises energy type and uses day granularity', () => {
    expect(deriveShardKey('Solar', '2026-04-23T12:00:00Z')).toBe('solar|2026-04-23');
  });
  it('defaults to ANY when no delivery window supplied', () => {
    expect(deriveShardKey('wind', null)).toBe('wind|ANY');
    expect(deriveShardKey('wind', undefined)).toBe('wind|ANY');
  });
});
