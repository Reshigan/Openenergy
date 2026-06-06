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
  // ─── Order-lifecycle codes (migration 050) ────────────────────────────
  'POST_ONLY_WOULD_CROSS',
  'REDUCE_ONLY_INCREASES_POSITION',
  'EXPIRY_REQUIRED',
  'EXPIRY_IN_PAST',
  'STOP_TRIGGER_REQUIRED',
  'FOK_INSUFFICIENT_LIQUIDITY',
  'INVALID_DISPLAY_SIZE',
  // ─── Wave 3 — clearing margin enforcement gate ──────────────────────────
  'MARGIN_GATE_BLOCKED',
  // ─── W2 — regulatory trading block (FSCA kill-switch / market-abuse STOR) ──
  'ALGO_TRADING_BLOCKED',
] as const;

export type RejectionCode = typeof REJECTION_CODES[number];

export type OrderType = 'limit' | 'market' | 'ioc' | 'fok' | 'stop' | 'stop_limit';
export type TimeInForce = 'gtc' | 'gtd' | 'day';

export interface ProposedOrder {
  side: 'buy' | 'sell';
  energy_type: string;
  volume_mwh: number;
  price_zar_mwh: number | null;       // null = market order
  delivery_date: string | null;
  // ─── Phase 2 (migration 050) — all optional, sensible defaults ─────────
  order_type?: OrderType;             // default 'limit'
  time_in_force?: TimeInForce;        // default 'gtc'
  expires_at?: string | null;         // ISO; required when time_in_force='gtd'
  stop_trigger_price?: number | null; // required for 'stop'/'stop_limit'
  display_size_mwh?: number | null;   // iceberg display tranche
  post_only?: boolean;                // reject if order would take liquidity
  reduce_only?: boolean;              // reject if order would grow position
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
  // ─── Phase 2 (migration 050) — needed for post_only / FOK checks ──────
  // Best opposite-side prices on the book for this (energy_type, delivery
  // date). Null means there is no resting opposite side.
  best_bid_zar_mwh?: number | null;
  best_ask_zar_mwh?: number | null;
  // Total resting opposite-side volume — used to short-circuit FOK.
  // Computed against the SAME shard the proposed order would land on.
  bid_liquidity_mwh?: number;
  ask_liquidity_mwh?: number;
  // Reference clock; tests pass an explicit instant so good_till logic is
  // deterministic. Production calls leave this undefined → Date.now().
  now_iso?: string;
  // ─── Wave 3 — clearing margin enforcement gate ────────────────────────
  // Read from margin_enforcement_state.gate_status:
  //   'clear'   → no open margin call
  //   'warning' → open within deadline (allowed; logged on the surface)
  //   'blocked' → overdue margin call (reject)
  // Undefined treated as 'clear' for back-compat with tests.
  margin_gate_status?: 'clear' | 'warning' | 'blocked';
  // ─── W2 — regulatory trading block ────────────────────────────────────
  // True when an active oe_algo_trading_blocks row resolves to this
  // participant (FSCA algo kill-switch or market-abuse STOR freeze). Resolved
  // by loadRiskSnapshot via direct participant_id match OR the
  // oe_trading_party_link bridge. Undefined treated as not-blocked.
  trading_block_active?: boolean;
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

  // 1a. Display size sanity — iceberg tranche must be positive and ≤ size.
  if (order.display_size_mwh != null && (order.display_size_mwh <= 0 || order.display_size_mwh > order.volume_mwh)) {
    return {
      ok: false,
      reason_code: 'INVALID_DISPLAY_SIZE',
      detail: `display_size_mwh ${order.display_size_mwh} must be > 0 and ≤ volume_mwh ${order.volume_mwh}.`,
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

  // 2a. Regulatory trading block — FSCA algo kill-switch or market-abuse STOR
  // freeze. A participant-level hard stop enforced regardless of market/mark
  // state. Resolved in loadRiskSnapshot via direct id or the party-link bridge.
  if (snapshot.trading_block_active === true) {
    return {
      ok: false,
      reason_code: 'ALGO_TRADING_BLOCKED',
      detail: 'Trading is blocked for this account under a regulatory hold (kill-switch or market-abuse STOR). Contact compliance.',
    };
  }

  // 2b. Clearing margin gate — block if member has overdue margin call.
  // Operationally upstream of credit/collateral checks because a margin
  // breach is a stronger signal than transient headroom.
  if (snapshot.margin_gate_status === 'blocked') {
    return {
      ok: false,
      reason_code: 'MARGIN_GATE_BLOCKED',
      detail: 'Account has an overdue margin call; resolve before placing new orders.',
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

  // ─── Phase 2 — order-type, TIF, and modifier checks ────────────────────
  const orderType: OrderType = order.order_type ?? 'limit';
  const tif: TimeInForce = order.time_in_force ?? 'gtc';

  // 6a. Stop / stop-limit must carry a trigger price.
  if ((orderType === 'stop' || orderType === 'stop_limit') && (order.stop_trigger_price == null || order.stop_trigger_price <= 0)) {
    return {
      ok: false,
      reason_code: 'STOP_TRIGGER_REQUIRED',
      detail: `${orderType} orders require a positive stop_trigger_price.`,
    };
  }

  // 6b. GTD must carry an expiry; expiry can't be in the past.
  // IOC/FOK are immediate so they ignore time_in_force entirely.
  if (orderType !== 'ioc' && orderType !== 'fok') {
    if (tif === 'gtd' && !order.expires_at) {
      return {
        ok: false,
        reason_code: 'EXPIRY_REQUIRED',
        detail: 'time_in_force=gtd requires an expires_at timestamp.',
      };
    }
    if (order.expires_at) {
      const exp = Date.parse(order.expires_at);
      const now = snapshot.now_iso ? Date.parse(snapshot.now_iso) : Date.now();
      if (Number.isFinite(exp) && exp <= now) {
        return {
          ok: false,
          reason_code: 'EXPIRY_IN_PAST',
          detail: `expires_at ${order.expires_at} is at or before now.`,
        };
      }
    }
  }

  // 6c. post_only — reject if the order would take liquidity on submit.
  // (For a limit buy: order would cross if price >= best ask; symmetrical
  // for sell.) Without snapshot best-side info we conservatively allow.
  if (order.post_only) {
    if (orderType === 'market' || orderType === 'ioc' || orderType === 'fok') {
      return {
        ok: false,
        reason_code: 'POST_ONLY_WOULD_CROSS',
        detail: 'post_only is incompatible with market/IOC/FOK orders that always take liquidity.',
      };
    }
    if (order.price_zar_mwh != null) {
      const opp = order.side === 'buy' ? snapshot.best_ask_zar_mwh : snapshot.best_bid_zar_mwh;
      if (opp != null) {
        const wouldCross = order.side === 'buy' ? order.price_zar_mwh >= opp : order.price_zar_mwh <= opp;
        if (wouldCross) {
          return {
            ok: false,
            reason_code: 'POST_ONLY_WOULD_CROSS',
            detail: `post_only ${order.side} at R${order.price_zar_mwh} would cross the opposite side at R${opp}.`,
          };
        }
      }
    }
  }

  // 6d. reduce_only — only allowed if the order would reduce |position|.
  // Buy reduces a short (-ve), sell reduces a long (+ve). Flat → reject.
  if (order.reduce_only) {
    const pos = snapshot.current_position_mwh;
    const reduces = (order.side === 'buy' && pos < 0) || (order.side === 'sell' && pos > 0);
    const grows = (order.side === 'buy' && pos > 0) || (order.side === 'sell' && pos < 0);
    if (!reduces || pos === 0) {
      return {
        ok: false,
        reason_code: 'REDUCE_ONLY_INCREASES_POSITION',
        detail: pos === 0
          ? 'reduce_only requires an existing position; current position is flat.'
          : `reduce_only ${order.side} would ${grows ? 'grow' : 'flip'} a position of ${pos.toFixed(1)} MWh.`,
      };
    }
    // If volume exceeds |position|, the residual would flip the sign and
    // grow the opposite side — also disallow under the conservative reading.
    if (order.volume_mwh > Math.abs(pos)) {
      return {
        ok: false,
        reason_code: 'REDUCE_ONLY_INCREASES_POSITION',
        detail: `reduce_only volume ${order.volume_mwh} MWh exceeds current position ${Math.abs(pos)} MWh; residual would flip the side.`,
      };
    }
  }

  // 6e. FOK — must be fully fillable from current opposite-side liquidity.
  // We don't pre-block IOC because partial fills (incl. zero) are its
  // documented behaviour and the matcher cancels the residual.
  if (orderType === 'fok') {
    const liquidity = order.side === 'buy' ? (snapshot.ask_liquidity_mwh ?? 0) : (snapshot.bid_liquidity_mwh ?? 0);
    if (liquidity < order.volume_mwh) {
      return {
        ok: false,
        reason_code: 'FOK_INSUFFICIENT_LIQUIDITY',
        detail: `Fill-or-kill needs ${order.volume_mwh} MWh; only ${liquidity.toFixed(1)} MWh of opposite-side liquidity is resting.`,
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
