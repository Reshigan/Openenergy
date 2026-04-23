// ═══════════════════════════════════════════════════════════════════════════
// Trader risk calculations — pure functions for mark-to-market, margin,
// credit utilisation, and clearing netting. Shared by the trading routes,
// the OrderBook Durable Object, and the clearing cron.
// ═══════════════════════════════════════════════════════════════════════════

export interface PositionLine {
  participant_id: string;
  energy_type: string;
  delivery_date: string | null;
  net_volume_mwh: number;    // +ve long, -ve short
  avg_entry_price: number | null;
}

export interface MarkPrice {
  energy_type: string;
  delivery_date: string | null;
  mark_price: number;
}

/**
 * MTM = net_volume × (mark - avg_entry). Short positions (-ve volume) profit
 * when mark falls below entry; the sign convention already handles that
 * because (mark - entry) × -volume = (entry - mark) × volume.
 */
export function markToMarket(position: PositionLine, mark: number): number {
  if (position.avg_entry_price == null) return 0;
  return position.net_volume_mwh * (mark - position.avg_entry_price);
}

/**
 * Initial margin — simple regime suitable for spot + day-ahead. For
 * derivatives, plug in a SPAN-like grid later. Default is 10% of notional
 * exposure with a floor of 5% and a ceiling of 25% based on volatility.
 */
export function initialMarginFor(notionalZar: number, volatilityPct = 10): number {
  const ratePct = Math.max(5, Math.min(25, volatilityPct));
  return Math.abs(notionalZar) * (ratePct / 100);
}

/**
 * Variation margin — additional posting required when unrealised losses
 * exceed the initial margin buffer.
 */
export function variationMarginShortfall(
  unrealisedPnlZar: number,
  postedCollateralZar: number,
  initialMarginZar: number,
): number {
  if (unrealisedPnlZar >= 0) return 0;
  const required = Math.abs(unrealisedPnlZar) + initialMarginZar;
  return Math.max(0, required - postedCollateralZar);
}

/**
 * Credit utilisation percentage. Guards against divide-by-zero and caps at 1000%
 * so a misconfigured zero-limit participant still surfaces in dashboards.
 */
export function utilisationPercentage(openExposure: number, limit: number): number {
  if (limit <= 0) return openExposure > 0 ? 1000 : 0;
  return Math.min(1000, (openExposure / limit) * 100);
}

/**
 * Multi-lateral netting — reduce a set of bilateral obligations to a single
 * net per participant. Given a list of (from, to, amount_zar) pairs, returns
 * a map of participant_id → net amount (+ve = receive, -ve = pay).
 * Conservation: sum of all net amounts is 0.
 */
export function nettingReduce(
  obligations: Array<{ from: string; to: string; amount_zar: number }>,
): { nets: Record<string, number>; total_gross: number; total_net: number; netting_ratio: number } {
  const nets: Record<string, number> = {};
  let gross = 0;
  for (const o of obligations) {
    if (o.amount_zar <= 0) continue;
    gross += o.amount_zar;
    nets[o.from] = (nets[o.from] || 0) - o.amount_zar;
    nets[o.to]   = (nets[o.to]   || 0) + o.amount_zar;
  }
  // Total absolute net across participants, halved because each zar appears twice.
  let absSum = 0;
  for (const v of Object.values(nets)) absSum += Math.abs(v);
  const netTotal = absSum / 2;
  const ratio = gross > 0 ? netTotal / gross : 0;
  return { nets, total_gross: gross, total_net: netTotal, netting_ratio: ratio };
}

/**
 * Pre-trade credit check. Given the participant's current open notional and
 * their credit limit, verify whether a prospective new order of
 * `incoming_notional_zar` can be accepted. Returns { allowed, headroom }.
 */
export function canOpenTrade(
  incomingNotionalZar: number,
  openNotionalZar: number,
  limitZar: number,
): { allowed: boolean; headroom_zar: number } {
  const remaining = limitZar - openNotionalZar;
  return {
    allowed: incomingNotionalZar <= remaining,
    headroom_zar: Math.max(0, remaining - incomingNotionalZar),
  };
}
