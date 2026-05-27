// ═══════════════════════════════════════════════════════════════════════════
// Wave 7 — Offtaker PPA obligation spec.
//
// Pure helpers. No DB, no env, no I/O. The cascade subscriber and cron
// sweep call into these to figure out:
//   • When does cure window close?
//   • What's the take-or-pay liability if it does?
//   • Did the latest reading flip the obligation status?
//   • Is the period delivered, in shortfall, or already in take-or-pay?
// ═══════════════════════════════════════════════════════════════════════════

export type ObligationStatus =
  | 'pending'
  | 'delivered'
  | 'shortfall'
  | 'cured'
  | 'take_or_pay';

export const DEFAULT_CURE_WINDOW_DAYS = 14;
export const DEFAULT_THRESHOLD_PCT = 95; // % of contracted MWh that must be delivered
export const DEFAULT_TAKE_OR_PAY_PCT = 95; // % of contracted MWh that the offtaker must pay for when triggered

export interface ObligationInputs {
  contracted_mwh: number;
  delivered_mwh: number;
  threshold_pct?: number; // defaults to DEFAULT_THRESHOLD_PCT
  period_end_at: Date; // last day of the period
  now?: Date;
  cure_window_days?: number;
}

export interface ObligationVerdict {
  status: ObligationStatus;
  threshold_mwh: number;
  shortfall_mwh: number;
  cure_deadline_at: Date;
  cure_expired: boolean;
  delivered_pct: number;
}

// Decide where this period stands right now.
export function evaluateObligation(input: ObligationInputs): ObligationVerdict {
  const now = input.now ?? new Date();
  const cure_days = input.cure_window_days ?? DEFAULT_CURE_WINDOW_DAYS;
  const threshold_pct = input.threshold_pct ?? DEFAULT_THRESHOLD_PCT;
  const threshold_mwh = round2((input.contracted_mwh * threshold_pct) / 100);
  const shortfall_mwh = Math.max(0, round2(threshold_mwh - input.delivered_mwh));
  const cure_deadline_at = new Date(input.period_end_at.getTime() + cure_days * 86_400_000);
  const cure_expired = now.getTime() > cure_deadline_at.getTime();
  const delivered_pct = input.contracted_mwh === 0
    ? 0
    : round2((input.delivered_mwh / input.contracted_mwh) * 100);

  let status: ObligationStatus;
  if (input.delivered_mwh >= threshold_mwh) {
    status = 'delivered';
  } else if (cure_expired) {
    status = 'take_or_pay';
  } else {
    status = 'shortfall';
  }

  return { status, threshold_mwh, shortfall_mwh, cure_deadline_at, cure_expired, delivered_pct };
}

export interface TakeOrPayInputs {
  contracted_mwh: number;
  delivered_mwh: number;
  price_zar_per_mwh: number;
  take_or_pay_pct?: number; // % of contracted MWh that the offtaker is liable for
}

// Liability = (take_or_pay_threshold_mwh - delivered_mwh) * price.
// Clamped to >= 0.
export function takeOrPayLiability(input: TakeOrPayInputs): number {
  const pct = input.take_or_pay_pct ?? DEFAULT_TAKE_OR_PAY_PCT;
  const liable_mwh = (input.contracted_mwh * pct) / 100;
  const shortfall = Math.max(0, liable_mwh - input.delivered_mwh);
  return round2(shortfall * input.price_zar_per_mwh);
}

// New delivered_mwh after a verified delta reading. Reversal rows have
// negative deltas. Clamped to >= 0 to avoid noisy corrections going negative.
export function applyVerifiedDelta(prior_delivered_mwh: number, delta_mwh: number): number {
  return Math.max(0, round2(prior_delivered_mwh + delta_mwh));
}

// True if the obligation has flipped INTO take_or_pay this evaluation.
// Used by the cron sweep to know which rows to fire the escalation cascade for.
export function isTakeOrPayTransition(prior: ObligationStatus, next: ObligationStatus): boolean {
  return next === 'take_or_pay' && prior !== 'take_or_pay';
}

export function periodEndOfMonth(period_month: string): Date {
  // period_month = 'YYYY-MM'; return last second of last day.
  const [y, m] = period_month.split('-').map((v) => parseInt(v, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    throw new Error(`bad period_month: ${period_month}`);
  }
  // Day 0 of next month = last day of current month.
  const dt = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return dt;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
