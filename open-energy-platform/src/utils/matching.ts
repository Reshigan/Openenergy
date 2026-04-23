// ═══════════════════════════════════════════════════════════════════════════
// Price-time-priority matching algorithm — pure function, no I/O.
//
// Given a newly posted order + a snapshot of the opposite-side book, produce
// the set of fills that should execute. Caller is responsible for persisting
// the fills and mutating order states. Extracted as a pure module so the
// Durable Object can call it and tests can exercise every edge case without
// spinning up a worker.
//
// Price/time priority:
//   - Buy side sorts DESC by price, then ASC by posted_at (earliest first)
//   - Sell side sorts ASC by price, then ASC by posted_at
//   - Incoming BUY crosses against best SELL if incoming.price >= sell.price
//   - Incoming SELL crosses against best BUY if incoming.price <= buy.price
//   - Execution price = resting order's price (maker wins on price)
//   - Partial fills supported via remaining_volume_mwh
// ═══════════════════════════════════════════════════════════════════════════

export type Side = 'buy' | 'sell';
export type OrderType = 'limit' | 'market' | 'ioc' | 'fok';

export interface MatchingOrder {
  id: string;
  participant_id: string;
  side: Side;
  price: number | null;       // null for market orders
  volume_mwh: number;
  remaining_volume_mwh: number;
  posted_at: string;          // ISO string — tiebreaker for time priority
  order_type: OrderType;
  shard_key: string;
}

export interface Fill {
  taker_order_id: string;
  maker_order_id: string;
  taker_participant_id: string;
  maker_participant_id: string;
  side: Side;                 // taker side
  volume_mwh: number;
  price: number;
  shard_key: string;
}

export interface MatchResult {
  fills: Fill[];
  taker_remaining: number;
  taker_fully_filled: boolean;
  // Orders whose remaining_volume_mwh is now 0 — caller must flip status to 'filled'.
  filled_maker_ids: string[];
  // Orders whose remaining_volume_mwh decreased but is still > 0.
  partially_filled_maker_ids: string[];
  // Map of maker_id -> new remaining volume (for partial-fill updates).
  maker_remaining: Record<string, number>;
}

/**
 * Run price-time priority matching for a single incoming (taker) order against
 * a snapshot of resting opposite-side orders.
 *
 * The resting book is consumed in priority order; the returned fills are in
 * execution order. For FOK orders, the function returns an empty `fills` list
 * if the full volume cannot be satisfied from the given book snapshot.
 */
export function matchOrder(
  taker: MatchingOrder,
  restingBook: MatchingOrder[],
): MatchResult {
  if (taker.remaining_volume_mwh <= 0 || taker.side !== 'buy' && taker.side !== 'sell') {
    return emptyResult(taker);
  }

  const oppositeSide: Side = taker.side === 'buy' ? 'sell' : 'buy';
  const candidates = restingBook
    .filter((o) =>
      o.side === oppositeSide &&
      o.shard_key === taker.shard_key &&
      o.remaining_volume_mwh > 0 &&
      o.participant_id !== taker.participant_id // no self-match at engine level
    )
    .sort((a, b) => compareBookPriority(a, b, taker.side));

  // For FOK, verify the book has enough volume at crossable prices before
  // executing anything.
  if (taker.order_type === 'fok') {
    let available = 0;
    for (const resting of candidates) {
      if (!crosses(taker, resting)) break;
      available += resting.remaining_volume_mwh;
      if (available >= taker.remaining_volume_mwh) break;
    }
    if (available < taker.remaining_volume_mwh) {
      return emptyResult(taker);
    }
  }

  const fills: Fill[] = [];
  const filledMakers: string[] = [];
  const partialMakers: string[] = [];
  const makerRemaining: Record<string, number> = {};
  let remaining = taker.remaining_volume_mwh;

  for (const maker of candidates) {
    if (remaining <= 0) break;
    if (!crosses(taker, maker)) break;

    const fillVolume = Math.min(remaining, maker.remaining_volume_mwh);
    const fillPrice = maker.price ?? taker.price ?? 0; // maker's price wins
    fills.push({
      taker_order_id: taker.id,
      maker_order_id: maker.id,
      taker_participant_id: taker.participant_id,
      maker_participant_id: maker.participant_id,
      side: taker.side,
      volume_mwh: fillVolume,
      price: fillPrice,
      shard_key: taker.shard_key,
    });

    remaining -= fillVolume;
    const newMakerRemaining = maker.remaining_volume_mwh - fillVolume;
    makerRemaining[maker.id] = newMakerRemaining;
    if (newMakerRemaining <= 0) {
      filledMakers.push(maker.id);
    } else {
      partialMakers.push(maker.id);
    }
  }

  // IOC that didn't fully fill is still valid — partial is fine; we just don't
  // leave it on the book. The caller is responsible for deciding whether to
  // post the residual (limit/GTC) or cancel it (IOC/FOK unfilled).
  return {
    fills,
    taker_remaining: Math.max(0, remaining),
    taker_fully_filled: remaining <= 1e-9,
    filled_maker_ids: filledMakers,
    partially_filled_maker_ids: partialMakers,
    maker_remaining: makerRemaining,
  };
}

function compareBookPriority(a: MatchingOrder, b: MatchingOrder, takerSide: Side): number {
  // Taker buys → match against cheapest sells first (ASC price)
  // Taker sells → match against highest bids first (DESC price)
  const priceA = a.price ?? (takerSide === 'buy' ? Infinity : -Infinity);
  const priceB = b.price ?? (takerSide === 'buy' ? Infinity : -Infinity);
  const priceDelta = takerSide === 'buy' ? priceA - priceB : priceB - priceA;
  if (priceDelta !== 0) return priceDelta;
  // Time priority: earliest posted_at first
  return a.posted_at.localeCompare(b.posted_at);
}

function crosses(taker: MatchingOrder, maker: MatchingOrder): boolean {
  if (taker.order_type === 'market') return true;
  if (taker.price == null) return true;
  if (maker.price == null) return true;
  return taker.side === 'buy' ? taker.price >= maker.price : taker.price <= maker.price;
}

function emptyResult(taker: MatchingOrder): MatchResult {
  return {
    fills: [],
    taker_remaining: taker.remaining_volume_mwh,
    taker_fully_filled: false,
    filled_maker_ids: [],
    partially_filled_maker_ids: [],
    maker_remaining: {},
  };
}

/**
 * Derive the shard key — all orders for the same (energy_type, delivery_window)
 * land on the same Durable Object so the matching engine has serial access.
 * Delivery window is normalised to the day granularity so a 13:00 buy can
 * match a 14:00 sell on the same calendar day. Callers that need intra-day
 * sub-shards should pass the bucketed window directly.
 */
export function deriveShardKey(energyType: string, deliveryWindow: string | null | undefined): string {
  const normalised = (energyType || 'unknown').toLowerCase();
  const window = (deliveryWindow || 'ANY').slice(0, 10); // yyyy-MM-dd or ANY
  return `${normalised}|${window}`;
}
