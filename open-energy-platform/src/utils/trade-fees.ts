// ════════════════════════════════════════════════════════════════════════
// trade-fees — fee accrual engine for matched trades.
//
// Mirror of src/utils/settlement-fees.ts for the trading side. Pure
// function — caller does INSERT OR IGNORE so the UNIQUE
// (match_id, participant_id, fee_type, rule_version) absorbs duplicates.
//
// Fee schedule (v1):
//   brokerage      — 0.10 ZAR per MWh, both sides of the trade
//   exchange       — 5 basis points of notional, both sides
//   clearing       — 0.05 ZAR per MWh, both sides (for cleared trades)
//   regulatory     — 1 basis point of notional, both sides (NERSA levy)
//
// Each rule writes its own row so the audit trail shows the breakdown.
// "clearing" only fires when market_type='exchange' (others are bilateral
// and don't go through a CCP).
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

export function computeTradeFees(fill: FillShape): TradeFeeRow[] {
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
