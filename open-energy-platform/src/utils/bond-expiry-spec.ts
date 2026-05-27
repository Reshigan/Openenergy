// ═══════════════════════════════════════════════════════════════════════════
// Wave 10 — IPP performance-bond / insurance expiry escalation spec.
//
// Pure helpers. No DB, no env, no I/O. The cascade subscriber and daily
// sweep call into these to figure out:
//   • Given an expiry_at date, what cycle should we be in today?
//   • Has the cycle changed since yesterday → fire-once cascade?
//   • What's the cure_deadline for a fresh cycle notice?
//
// State machine:
//   green   — >90 days from expiry, no action
//   warning — 30..90 days, informational notice ("renew soon")
//   cycle_1 — 14..30 days, formal notice issued; cure window = 14 days
//   cycle_2 —  3..14 days, escalated notice + lender notified; cure = 7 days
//   cycle_3 —  0..3  days OR expired, terminal notice; cure = 0 (immediate)
//   escalated — >0 days past expiry AND still active status, regulator inbox
// ═══════════════════════════════════════════════════════════════════════════

export type ExpiryStatus =
  | 'green'
  | 'warning'
  | 'cycle_1'
  | 'cycle_2'
  | 'cycle_3'
  | 'escalated';

// Days-to-expiry thresholds. Each threshold is "this stage applies until N
// days remain". Tightening order matters — checks run top-to-bottom.
export const WARNING_DAYS_OUT  = 90;
export const CYCLE_1_DAYS_OUT  = 30;
export const CYCLE_2_DAYS_OUT  = 14;
export const CYCLE_3_DAYS_OUT  = 3;

// Cure windows (days from notice issue → deadline).
export const CYCLE_1_CURE_DAYS = 14;
export const CYCLE_2_CURE_DAYS = 7;
export const CYCLE_3_CURE_DAYS = 0;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days remaining until expiry. Negative if already expired. Calendar-day
 * math against the supplied now (defaults to system now).
 */
export function daysUntil(expiryAt: string | Date, now: Date = new Date()): number {
  const exp = expiryAt instanceof Date ? expiryAt : new Date(expiryAt);
  return Math.floor((exp.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Derive expiry_status from days-remaining + current bond status. A bond
 * whose status is 'released' / 'replaced' / 'expired' stays green
 * regardless — the lifecycle has already moved past expiry tracking.
 */
export function expiryStatusFor(
  expiryAt: string | Date,
  bondStatus: string | null | undefined,
  now: Date = new Date(),
): ExpiryStatus {
  // Terminal states — no further expiry tracking.
  if (bondStatus === 'released' || bondStatus === 'replaced' || bondStatus === 'forfeited') {
    return 'green';
  }
  const days = daysUntil(expiryAt, now);
  if (days < 0)                    return 'escalated';
  if (days <= CYCLE_3_DAYS_OUT)    return 'cycle_3';
  if (days <= CYCLE_2_DAYS_OUT)    return 'cycle_2';
  if (days <= CYCLE_1_DAYS_OUT)    return 'cycle_1';
  if (days <= WARNING_DAYS_OUT)    return 'warning';
  return 'green';
}

const RANK: Record<ExpiryStatus, number> = {
  green: 0, warning: 1, cycle_1: 2, cycle_2: 3, cycle_3: 4, escalated: 5,
};

/**
 * Is this a fresh transition into the given target status on this tick?
 * The state machine only moves forward (severity-increasing); recovery
 * happens by replacing/releasing the bond, which clears tracking.
 */
export function isTransitionInto(
  previousStatus: ExpiryStatus | null | undefined,
  nextStatus: ExpiryStatus,
): boolean {
  const prev = previousStatus ?? 'green';
  return RANK[nextStatus] > RANK[prev] && nextStatus !== 'green';
}

/**
 * Compute the cure deadline for a fresh cycle notice issued at `now`.
 * Returns ISO-8601 UTC string. cycle_3 returns now (terminal/immediate).
 */
export function cureDeadlineFor(
  status: ExpiryStatus,
  now: Date = new Date(),
): string {
  let days = 0;
  if (status === 'cycle_1') days = CYCLE_1_CURE_DAYS;
  else if (status === 'cycle_2') days = CYCLE_2_CURE_DAYS;
  else if (status === 'cycle_3') days = CYCLE_3_CURE_DAYS;
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

/**
 * Whether a transition crosses into regulator scope. Currently 'escalated'
 * is the only regulator-inbox-bound state, but a bond can also cross when
 * cycle_3 expires without acknowledgement — that's handled by the cron's
 * separate cure-deadline check, not by this predicate.
 */
export function crossesIntoRegulator(
  previousStatus: ExpiryStatus | null | undefined,
  nextStatus: ExpiryStatus,
): boolean {
  return nextStatus === 'escalated' && (previousStatus ?? 'green') !== 'escalated';
}

/**
 * Human-readable label per status (used by UI + notice titles).
 */
export const STATUS_LABEL: Record<ExpiryStatus, string> = {
  green:     'Active',
  warning:   'Renew soon',
  cycle_1:   'Notice 1 of 3',
  cycle_2:   'Notice 2 of 3',
  cycle_3:   'Notice 3 of 3 — final',
  escalated: 'Expired — regulator notified',
};
