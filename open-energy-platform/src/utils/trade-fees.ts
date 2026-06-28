// ════════════════════════════════════════════════════════════════════════
// trade-fees — fee accrual engine for matched trades.
//
// Mirror of src/utils/settlement-fees.ts for the trading side. Pure
// function — caller does INSERT OR IGNORE so the UNIQUE
// (match_id, participant_id, fee_type, rule_version) absorbs duplicates.
//
// Fee schedule (v1 hardcoded fallback):
//   brokerage      — 0.10 ZAR per MWh, both sides of the trade
//   exchange       — 5 basis points of notional, both sides
//   clearing       — 0.05 ZAR per MWh, both sides (for cleared trades)
//   regulatory     — 1 basis point of notional, both sides (NERSA levy)
//
// Each rule writes its own row so the audit trail shows the breakdown.
// "clearing" only fires when market_type='exchange' (others are bilateral
// and don't go through a CCP).
//
// One source of truth (P1 dedup): the operator-configurable Layer B row
// 'trade.matched' in oe_fee_schedule (see fee-engine.ts + migration 520) is
// the canonical trade-match fee. When that row is is_enabled=1, the v1
// hardcoded path MUST NOT also bill — otherwise the participant is charged
// twice (once into trade_fees, once into oe_platform_revenue). The caller
// resolves the flag via isLayerBTradeMatchedLive(db) and passes
// { layerBTradeMatchedEnabled: true } to suppress the v1 path. When the row
// is absent or disabled, the v1 hardcoded rates below remain the fallback.
// ════════════════════════════════════════════════════════════════════════

export type TradeFeeRule =
  | 'brokerage' | 'exchange' | 'clearing' | 'market_data' | 'regulatory' | 'tax' | 'adjustment';

export type TradeFeeRow = {
  id: string;
  match_id: string;
  order_id: string;
  participant_id: string;
  fee_type: TradeFeeRule;
  basis: string;
  amount_zar: number;
  reason: string;
  calc_rule_version: string;
  applied_by?: string | null;
};

export type FillShape = {
  match_id: string;
  buy_order_id: string;
  sell_order_id: string;
  buy_participant_id: string;
  sell_participant_id: string;
  matched_volume_mwh: number;
  matched_price_zar: number;
  market_type: string;                // 'bilateral' | 'exchange' | 'spot' | 'derivatives'
};

// Round to cents for ledger writes; fees below R0.01 are dropped to
// avoid noise rows but the audit trail still records that the rule fired.
const cents = (zar: number) => Math.round(zar * 100) / 100;

function row(
  fill: FillShape,
  side: 'buy' | 'sell',
  feeType: TradeFeeRule,
  basis: string,
  amountZar: number,
  reason: string,
  ruleVersion: string,
): TradeFeeRow {
  const orderId = side === 'buy' ? fill.buy_order_id : fill.sell_order_id;
  const participantId =
    side === 'buy' ? fill.buy_participant_id : fill.sell_participant_id;
  return {
    id: crypto.randomUUID(),
    match_id: fill.match_id,
    order_id: orderId,
    participant_id: participantId,
    fee_type: feeType,
    basis,
    amount_zar: cents(amountZar),
    reason,
    calc_rule_version: ruleVersion,
    applied_by: 'system',
  };
}

// Layer B 'trade.matched' is the operator-configurable rate-card row billed
// via fee-engine.ts → oe_platform_revenue. When it is live, the v1 hardcoded
// path below is suppressed so the trade is billed exactly once. Resolved by
// the caller via isLayerBTradeMatchedLive(db).
export interface TradeFeeOptions {
  layerBTradeMatchedEnabled?: boolean;
}

// Look up the Layer B 'trade.matched' row. Returns true only when a row exists
// AND is_enabled=1 — the v1 hardcoded path must defer to it then. Absent or
// disabled rows fall through to the v1 fallback (no double-billing either way).
interface FeeScheduleLookup {
  prepare: (q: string) => { bind: (...a: unknown[]) => { first: () => Promise<unknown> } };
}

export async function isLayerBTradeMatchedLive(db: FeeScheduleLookup): Promise<boolean> {
  const r = await db.prepare(`SELECT is_enabled FROM oe_fee_schedule WHERE trigger_event = ?`)
    .bind('trade.matched').first() as { is_enabled: number } | null;
  return Boolean(r && r.is_enabled === 1);
}

export function computeTradeFees(fill: FillShape, opts: TradeFeeOptions = {}): TradeFeeRow[] {
  // P1 dedup — one source of truth: the configurable Layer B row wins.
  if (opts.layerBTradeMatchedEnabled) return [];

  const out: TradeFeeRow[] = [];
  const notional = fill.matched_volume_mwh * fill.matched_price_zar;
  const vol = fill.matched_volume_mwh;

  // brokerage: 0.10 ZAR per MWh, both sides
  const brokerage = vol * 0.10;
  if (brokerage > 0.01) {
    out.push(
      row(fill, 'buy', 'brokerage',
        `${vol.toFixed(2)} MWh × R0.10/MWh`, brokerage,
        'Standard brokerage fee', 'v1'),
    );
    out.push(
      row(fill, 'sell', 'brokerage',
        `${vol.toFixed(2)} MWh × R0.10/MWh`, brokerage,
        'Standard brokerage fee', 'v1'),
    );
  }

  // exchange: 5 bps of notional, both sides
  const exchange = notional * 0.0005;
  if (exchange > 0.01) {
    out.push(
      row(fill, 'buy', 'exchange',
        `5 bps × R${notional.toFixed(0)} notional`, exchange,
        'Exchange access fee', 'v1'),
    );
    out.push(
      row(fill, 'sell', 'exchange',
        `5 bps × R${notional.toFixed(0)} notional`, exchange,
        'Exchange access fee', 'v1'),
    );
  }

  // clearing: 0.05 ZAR/MWh, only for cleared (exchange) trades
  if (fill.market_type === 'exchange') {
    const clearing = vol * 0.05;
    if (clearing > 0.01) {
      out.push(
        row(fill, 'buy', 'clearing',
          `${vol.toFixed(2)} MWh × R0.05/MWh`, clearing,
          'CCP clearing fee', 'v1'),
      );
      out.push(
        row(fill, 'sell', 'clearing',
          `${vol.toFixed(2)} MWh × R0.05/MWh`, clearing,
          'CCP clearing fee', 'v1'),
      );
    }
  }

  // regulatory: 1 bp of notional (NERSA)
  const reg = notional * 0.0001;
  if (reg > 0.01) {
    out.push(
      row(fill, 'buy', 'regulatory',
        `1 bp × R${notional.toFixed(0)} notional`, reg,
        'NERSA regulatory levy', 'v1'),
    );
    out.push(
      row(fill, 'sell', 'regulatory',
        `1 bp × R${notional.toFixed(0)} notional`, reg,
        'NERSA regulatory levy', 'v1'),
    );
  }

  return out;
}
