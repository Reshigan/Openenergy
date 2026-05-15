// ═══════════════════════════════════════════════════════════════════════════
// Pre-trade gating — pure functions that decide whether a prospective
// order placement is allowed. Each guard is total: it returns either
// { ok: true } or { ok: false, reason_code, detail }.
//
// The trading route loads a RiskSnapshot from D1, runs the guards in order,
// and persists the first failure as a trade_order_rejections row. Keeping
// the guards pure makes them unit-testable without spinning up SQLite or a
// Durable Object — see tests/pre-trade-guards.test.ts.
//
// Reason codes are a closed enum (REJECTION_CODES) so the UI can switch on
// them and the AI explainer can map them to remediation text. Adding a new
// reason code requires touching:
//   1. REJECTION_CODES below
//   2. the catch-arm in evaluateOrder
//   3. the description map in src/utils/rejection-explainer.ts
// ═══════════════════════════════════════════════════════════════════════════

export const REJECTION_CODES = [
  'CREDIT_HEADROOM_EXCEEDED',
  'POSITION_LIMIT_BREACH',
  'COLLATERAL_INSUFFICIENT',
  'MARKET_CLOSED',
  'INSTRUMENT_HALTED',
  'COUNTERPARTY_SUSPENDED',
  'KYC_INCOMPLETE',
  'INVALID_PRICE_BAND',
  'STALE_MARK',
  'INVALID_VOLUME',
] as const;

export type RejectionCode = typeof REJECTION_CODES[number];

export interface ProposedOrder {
  side: 'buy' | 'sell';
  energy_type: string;
  volume_mwh: number;
  price_zar_mwh: number | null;       // null = market order
  delivery_date: string | null;
}

export interface RiskSnapshot {
  participant_status: 'active' | 'suspended' | 'pending_kyc' | 'unknown';
  credit_limit_zar: number;
  open_exposure_zar: number;
  free_collateral_zar: number;
  current_position_mwh: number;       // signed; +ve long, -ve short
  position_limit_mwh: number;         // 0 = unlimited
  market_state: 'open' | 'closed' | 'halted_instrument' | 'halted_market';
  mark_price_zar_mwh: number | null;
  mark_age_minutes: number | null;
  // Optional band — if present, order price must lie within ±band_pct of mark.
  price_band_pct: number | null;
}

export type GuardResult =
  | { ok: true; reserved_margin_zar: number }
  | {
      ok: false;
      reason_code: RejectionCode;
      detail: string;
    };

// Initial-margin haircut applied to incoming notional. Kept here (not in
// trader-risk.ts) to avoid the import cycle between routes and utilities.
// Matches the 10% default in initialMarginFor().
export const INITIAL_MARGIN_RATE = 0.10;

// A mark is "stale" once it's older than this. Block new orders so we don't
// reserve margin against a price that no longer reflects the market.
export const STALE_MARK_MAX_MINUTES = 30;

export function notionalFor(order: ProposedOrder, snapshot: RiskSnapshot): number {
  // Market orders fall back to the most recent mark for headroom maths.
  // If we don't have a mark either, conservatively use 0 (the order will be
  // pre-rejected on STALE_MARK before we get here).
  const px = order.price_zar_mwh ?? snapshot.mark_price_zar_mwh ?? 0;
  return Math.abs(order.volume_mwh) * px;
}

export function evaluateOrder(order: ProposedOrder, snapshot: RiskSnapshot): GuardResult {
  // 1. Volume sanity — reject before we consult any market state.
  if (!Number.isFinite(order.volume_mwh) || order.volume_mwh <= 0) {
    return {
      ok: false,
      reason_code: 'INVALID_VOLUME',
      detail: `Volume must be a positive number (got ${order.volume_mwh}).`,
    };
  }

  // 2. Counterparty status — KYC gate first, then suspension.
  if (snapshot.participant_status === 'pending_kyc') {
    return {
      ok: false,
      reason_code: 'KYC_INCOMPLETE',
      detail: 'KYC verification is still pending for this account.',
    };
  }
  if (snapshot.participant_status === 'suspended' || snapshot.participant_status === 'unknown') {
    return {
      ok: false,
      reason_code: 'COUNTERPARTY_SUSPENDED',
      detail: 'This account is suspended from new trade placement.',
    };
  }

  // 3. Market state.
  if (snapshot.market_state === 'closed') {
    return {
      ok: false,
      reason_code: 'MARKET_CLOSED',
      detail: 'The market is closed for new orders right now.',
    };
  }
  if (snapshot.market_state === 'halted_instrument' || snapshot.market_state === 'halted_market') {
    return {
      ok: false,
      reason_code: 'INSTRUMENT_HALTED',
      detail: `Trading in ${order.energy_type} is currently halted.`,
    };
  }

  // 4. Mark freshness (limit + market orders both need it for pre-trade margin).
  if (snapshot.mark_price_zar_mwh == null || snapshot.mark_age_minutes == null
      || snapshot.mark_age_minutes > STALE_MARK_MAX_MINUTES) {
    return {
      ok: false,
      reason_code: 'STALE_MARK',
      detail: snapshot.mark_age_minutes == null
        ? `No mark price published for ${order.energy_type} yet.`
        : `Mark price for ${order.energy_type} is ${Math.round(snapshot.mark_age_minutes)} min old (max ${STALE_MARK_MAX_MINUTES}).`,
    };
  }

  // 5. Price band — block fat-fingers more than ±band_pct from mark.
  if (order.price_zar_mwh != null && snapshot.price_band_pct != null && snapshot.price_band_pct > 0) {
    const lower = snapshot.mark_price_zar_mwh * (1 - snapshot.price_band_pct / 100);
    const upper = snapshot.mark_price_zar_mwh * (1 + snapshot.price_band_pct / 100);
    if (order.price_zar_mwh < lower || order.price_zar_mwh > upper) {
      return {
        ok: false,
        reason_code: 'INVALID_PRICE_BAND',
        detail: `Price R${order.price_zar_mwh.toFixed(0)} is outside the ±${snapshot.price_band_pct}% band around mark R${snapshot.mark_price_zar_mwh.toFixed(0)}.`,
      };
    }
  }

  // 6. Position limit.
  if (snapshot.position_limit_mwh > 0) {
    const projected = order.side === 'buy'
      ? snapshot.current_position_mwh + order.volume_mwh
      : snapshot.current_position_mwh - order.volume_mwh;
    if (Math.abs(projected) > snapshot.position_limit_mwh) {
      return {
        ok: false,
        reason_code: 'POSITION_LIMIT_BREACH',
        detail: `Projected position ${projected.toFixed(1)} MWh exceeds limit ±${snapshot.position_limit_mwh} MWh.`,
      };
    }
  }

  // 7. Credit headroom.
  const notional = notionalFor(order, snapshot);
  const headroom = snapshot.credit_limit_zar - snapshot.open_exposure_zar;
  if (notional > headroom) {
    const overBy = notional - headroom;
    return {
      ok: false,
      reason_code: 'CREDIT_HEADROOM_EXCEEDED',
      detail: `Order notional R${Math.round(notional).toLocaleString('en-ZA')} exceeds free credit headroom R${Math.round(Math.max(0, headroom)).toLocaleString('en-ZA')} (over by R${Math.round(overBy).toLocaleString('en-ZA')}).`,
    };
  }

  // 8. Initial margin reservation must fit in free collateral.
  const reservation = notional * INITIAL_MARGIN_RATE;
  if (reservation > snapshot.free_collateral_zar) {
    const shortfall = reservation - snapshot.free_collateral_zar;
    return {
      ok: false,
      reason_code: 'COLLATERAL_INSUFFICIENT',
      detail: `Initial margin R${Math.round(reservation).toLocaleString('en-ZA')} exceeds free collateral R${Math.round(snapshot.free_collateral_zar).toLocaleString('en-ZA')} (short by R${Math.round(shortfall).toLocaleString('en-ZA')}).`,
    };
  }

  return { ok: true, reserved_margin_zar: reservation };
}

// Suggested order size given current free headroom + collateral. Used to
// populate the ghost-text suggestion under the Volume input. Picks the
// binding constraint and divides through.
export function suggestedSizeMwh(snapshot: RiskSnapshot, side: 'buy' | 'sell'): number | null {
  const px = snapshot.mark_price_zar_mwh;
  if (!px || px <= 0) return null;
  const headroom = snapshot.credit_limit_zar - snapshot.open_exposure_zar;
  const collateralRoom = snapshot.free_collateral_zar / INITIAL_MARGIN_RATE;
  const cashConstrained = Math.max(0, Math.min(headroom, collateralRoom));
  const positionRoom = snapshot.position_limit_mwh > 0
    ? Math.max(0, snapshot.position_limit_mwh - (side === 'buy'
        ? Math.max(0, snapshot.current_position_mwh)
        : Math.max(0, -snapshot.current_position_mwh)))
    : Number.POSITIVE_INFINITY;
  const fromCash = cashConstrained / px;
  const limit = Math.min(fromCash, positionRoom);
  // Round to one decimal MWh; clamp to 0 (don't suggest a negative size).
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return Math.floor(limit * 10) / 10;
}
