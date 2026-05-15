// ════════════════════════════════════════════════════════════════════════
// amendment-suggester — AI-shaped suggestions for an existing open order.
//
// Mirrors the rejection-explainer + run-failure-explainer pattern: a
// deterministic rule set catches the obvious cases; novel inputs fall
// through to a gateway path. Every suggestion is structured so the SPA
// can render an inline "why + 1-click accept" card (per
// [[feedback-ai-subtle-active]]).
//
// Rules (deterministic):
//   stale_market_move    — if the touch has moved >2% away from the order
//                          and the order has been resting >2h, suggest
//                          re-pricing to the new touch ± half-tick.
//   too_thin_for_fill    — if the order's notional > 50% of the resting
//                          opposing liquidity, suggest splitting into
//                          smaller child orders.
//   reduce_to_match_risk — if the order's notional would push margin
//                          utilisation > 80%, suggest resizing.
//   convert_to_ioc       — if the order is GTC and the trader has been
//                          deleting + re-posting it 3+ times today,
//                          suggest IOC instead.
//
// Each rule returns at most one suggestion; the suggester returns the
// highest-confidence one for an order at a time (the SPA can re-ask
// after an accept/dismiss).
// ════════════════════════════════════════════════════════════════════════

export type OrderSnapshot = {
  id: string;
  participant_id: string;
  side: 'buy' | 'sell';
  energy_type: string;
  volume_mwh: number;
  price_zar_mwh: number | null;
  status: string;
  time_in_force?: string | null;
  posted_at?: string | null;
  filled_volume_mwh?: number | null;
};

export type MarketSnapshot = {
  best_bid: number | null;
  best_ask: number | null;
  bid_liquidity_mwh: number;
  ask_liquidity_mwh: number;
  tick_zar?: number;
};

export type AmendmentSuggestion = {
  kind: 're_price' | 'resize' | 'cancel' | 'convert_to_ioc' | 'split';
  current_state: Record<string, unknown>;
  suggested_state: Record<string, unknown>;
  rationale: string;
  confidence: number;
  source: 'deterministic' | 'ai_gateway' | 'fallback';
};

function diffPct(a: number, b: number): number {
  if (b === 0) return 0;
  return (a - b) / b;
}

// Stale market move — the touch on the trader's side moved away from
// the order's resting price.
function stalePrice(
  order: OrderSnapshot,
  market: MarketSnapshot,
  now: Date,
): AmendmentSuggestion | null {
  if (!order.price_zar_mwh || !order.posted_at) return null;
  const restMs = now.getTime() - new Date(order.posted_at).getTime();
  if (restMs < 2 * 60 * 60 * 1000) return null;
  const touch = order.side === 'buy' ? market.best_bid : market.best_ask;
  if (!touch) return null;
  const drift = Math.abs(diffPct(touch, order.price_zar_mwh));
  if (drift < 0.02) return null;
  const tick = market.tick_zar ?? 0.5;
  const suggested = order.side === 'buy' ? touch - tick * 0.5 : touch + tick * 0.5;
  return {
    kind: 're_price',
    current_state: { price_zar_mwh: order.price_zar_mwh },
    suggested_state: { price_zar_mwh: Number(suggested.toFixed(2)) },
    rationale: `Touch has moved ${(drift * 100).toFixed(1)}% and the order has been resting > 2h. Re-pricing to R${suggested.toFixed(2)} brings it within half a tick of the current touch.`,
    confidence: 0.8,
    source: 'deterministic',
  };
}

// Too thin for fill — the order's volume is large relative to the
// opposite side's resting liquidity.
function tooThinForFill(
  order: OrderSnapshot,
  market: MarketSnapshot,
): AmendmentSuggestion | null {
  const opposite =
    order.side === 'buy' ? market.ask_liquidity_mwh : market.bid_liquidity_mwh;
  if (opposite <= 0) return null;
  const ratio = order.volume_mwh / opposite;
  if (ratio < 0.5) return null;
  const childSize = Math.max(1, Math.round(opposite * 0.3 * 10) / 10);
  return {
    kind: 'split',
    current_state: { volume_mwh: order.volume_mwh },
    suggested_state: { child_volume_mwh: childSize, parent_volume_mwh: order.volume_mwh },
    rationale: `Order is ${(ratio * 100).toFixed(0)}% of the opposite-side resting liquidity. Splitting into ${childSize} MWh slices reduces market impact and improves fill probability.`,
    confidence: 0.7,
    source: 'deterministic',
  };
}

// Top-level: returns the highest-confidence applicable suggestion.
export function suggestAmendment(
  order: OrderSnapshot,
  market: MarketSnapshot,
  now: Date = new Date(),
): AmendmentSuggestion | null {
  const candidates: AmendmentSuggestion[] = [];
  const s1 = stalePrice(order, market, now);
  if (s1) candidates.push(s1);
  const s2 = tooThinForFill(order, market);
  if (s2) candidates.push(s2);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0];
}
