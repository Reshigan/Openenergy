// ═══════════════════════════════════════════════════════════════════════════
// Wave 6 — Lender/Funder portal escalation rules.
//
// Pure helpers. No D1, no env, no cascades. Lives next to the
// regulator-inbox-spec used by Wave 5 so the two specs can stay in sync
// and remain testable in isolation.
//
// Used by:
//   • cascade.ts materializer for `lender.covenant_breach` events.
//   • cron sweep `lender_dunning_overdue_sweep` in src/index.ts.
//   • src/routes/lender-dunning.ts for cycle progression on borrower
//     ack / cure flows.
// ═══════════════════════════════════════════════════════════════════════════

export type DunningCycle = 1 | 2 | 3;
export type WatchlistTier = 1 | 2 | 3;

/**
 * Cure-window in days per cycle. Tightens as the cycle escalates so the
 * borrower feels the pressure curve.
 */
export const DUNNING_CYCLE_DAYS: Record<DunningCycle, number> = {
  1: 14,
  2: 7,
  3: 3,
};

/**
 * Watchlist tier that maps to each cycle. Cycle 1 stays at the existing
 * tier, cycle 2 forces tier 2, cycle 3 forces tier 3.
 */
export const CYCLE_TO_TIER: Record<DunningCycle, WatchlistTier> = {
  1: 1,
  2: 2,
  3: 3,
};

/**
 * Trigger signals we know how to dunn over. Anything outside this set
 * gets normalised to 'manual'.
 */
const KNOWN_SIGNALS = new Set([
  'covenant_breach',
  'covenant_warn',
  'dscr_warning',
  'payment_delay',
  'rating_downgrade',
  'credit_deterioration',
  'manual',
]);

export function normaliseSignal(input: string | null | undefined): string {
  if (!input) return 'manual';
  return KNOWN_SIGNALS.has(input) ? input : 'manual';
}

/**
 * Cycle progression: given the current cycle, return the next cycle's
 * config. Cycle 3 is terminal — callers should escalate to the
 * regulator inbox rather than issue another notice.
 */
export interface NextCycleResult {
  cycle: DunningCycle;
  cure_deadline_at: string;       // ISO timestamp
  cure_days: number;
  tier: WatchlistTier;
  terminal: boolean;              // true when no further cycle is available
}

export function nextDunningCycle(
  current: number | DunningCycle,
  now: Date = new Date(),
): NextCycleResult {
  const cur = clampCycle(current);
  const next = cur >= 3 ? 3 : ((cur + 1) as DunningCycle);
  const days = DUNNING_CYCLE_DAYS[next];
  const deadline = new Date(now.getTime() + days * 86_400_000);
  return {
    cycle: next,
    cure_deadline_at: deadline.toISOString(),
    cure_days: days,
    tier: CYCLE_TO_TIER[next],
    terminal: cur >= 3,
  };
}

/**
 * Initial cycle for a brand-new watchlist row. Always cycle 1.
 */
export function initialDunningCycle(now: Date = new Date()): NextCycleResult {
  const days = DUNNING_CYCLE_DAYS[1];
  const deadline = new Date(now.getTime() + days * 86_400_000);
  return {
    cycle: 1,
    cure_deadline_at: deadline.toISOString(),
    cure_days: days,
    tier: CYCLE_TO_TIER[1],
    terminal: false,
  };
}

/**
 * Severity surface for the Wave 5 regulator inbox materializer.
 * Only cycle 3 expirations escalate to the regulator side — cycles
 * 1 + 2 are handled internally between lender and borrower.
 */
export function escalationSeverity(cycle: number): 'info' | 'low' | 'medium' | 'high' | 'critical' {
  const c = clampCycle(cycle);
  if (c >= 3) return 'high';
  if (c >= 2) return 'medium';
  return 'low';
}

/**
 * IFRS 9 stage transition rules. Given the current stage and an
 * observed signal, returns the stage the facility should move to (or
 * the same stage if no transition applies).
 *
 * Stage 1 (performing) → Stage 2 on covenant_warn / dscr_warning /
 *                        30+ dpd / rating_downgrade.
 * Stage 2              → Stage 3 on covenant_breach / 90+ dpd /
 *                        credit_deterioration with severe flag.
 * Stage 3 (impaired)   → stays 3 until cured.
 */
export function eclStageForSignal(
  currentStage: number,
  signal: string,
): { stage: 1 | 2 | 3; reason: string | null } {
  const stage = (currentStage === 2 || currentStage === 3) ? currentStage : 1;
  const sig = normaliseSignal(signal);

  if (stage === 1) {
    if (sig === 'covenant_breach') return { stage: 2, reason: 'covenant_breach' };
    if (sig === 'covenant_warn' || sig === 'dscr_warning' || sig === 'rating_downgrade') {
      return { stage: 2, reason: sig };
    }
    if (sig === 'credit_deterioration') return { stage: 2, reason: 'credit_deterioration' };
  }
  if (stage === 2) {
    if (sig === 'covenant_breach') return { stage: 3, reason: 'covenant_breach' };
    if (sig === 'credit_deterioration') return { stage: 3, reason: 'severe_deterioration' };
  }
  return { stage: stage as 1 | 2 | 3, reason: null };
}

function clampCycle(input: number | DunningCycle): DunningCycle {
  const n = Number(input) || 0;
  if (n <= 1) return 1;
  if (n === 2) return 2;
  return 3;
}
