// ═══════════════════════════════════════════════════════════════════════════
// Wave 9 — Market-maker compliance spec.
//
// Pure helpers. No DB, no env, no I/O. The cascade subscriber and daily
// sweep call into these to figure out:
//   • Is yesterday's performance row compliant against the obligation targets?
//   • What's the next breach status given the running miss counter?
//   • Did the latest score change the obligation's lifecycle state?
//   • What's the daily fee earned / penalty accrued?
// ═══════════════════════════════════════════════════════════════════════════

export type BreachStatus = 'none' | 'warning' | 'breach' | 'escalated';
export type ComplianceStatus = 'compliant' | 'miss' | 'excused';

export const DEFAULT_WARNING_THRESHOLD = 1;
export const DEFAULT_BREACH_THRESHOLD = 3;
export const DEFAULT_ESCALATION_THRESHOLD = 5;
export const PENALTY_FRACTION_OF_DAILY_FEE = 0.5;

export interface ObligationTargets {
  two_sided_minutes_per_day?: number | null;
  max_spread_bps?: number | null;
  uptime_target_pct?: number | null;
  min_quote_volume_mwh?: number | null;
  monthly_fee_zar?: number | null;
}

export interface DailyPerformanceInputs {
  two_sided_minutes?: number | null;
  avg_spread_bps?: number | null;
  uptime_pct?: number | null;
  total_volume_mwh?: number | null;
}

export interface ComplianceVerdict {
  compliance_status: ComplianceStatus; // never 'excused' from this function
  fee_earned_zar: number;
  penalty_zar: number;
  failed_metrics: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function evaluateCompliance(
  obligation: ObligationTargets,
  perf: DailyPerformanceInputs,
): ComplianceVerdict {
  const failed: string[] = [];

  if (
    obligation.two_sided_minutes_per_day != null &&
    Number(perf.two_sided_minutes ?? 0) < Number(obligation.two_sided_minutes_per_day)
  ) {
    failed.push('two_sided_minutes');
  }
  if (
    obligation.uptime_target_pct != null &&
    Number(perf.uptime_pct ?? 0) < Number(obligation.uptime_target_pct)
  ) {
    failed.push('uptime_pct');
  }
  if (
    obligation.max_spread_bps != null &&
    Number(perf.avg_spread_bps ?? 0) > Number(obligation.max_spread_bps)
  ) {
    failed.push('avg_spread_bps');
  }
  if (
    obligation.min_quote_volume_mwh != null &&
    Number(perf.total_volume_mwh ?? 0) < Number(obligation.min_quote_volume_mwh)
  ) {
    failed.push('total_volume_mwh');
  }

  const compliant = failed.length === 0;
  const dailyFee = obligation.monthly_fee_zar ? Number(obligation.monthly_fee_zar) / 30 : 0;
  const feeEarned = compliant ? round2(dailyFee) : 0;
  const penalty = compliant ? 0 : round2(dailyFee * PENALTY_FRACTION_OF_DAILY_FEE);

  return {
    compliance_status: compliant ? 'compliant' : 'miss',
    fee_earned_zar: feeEarned,
    penalty_zar: penalty,
    failed_metrics: failed,
  };
}

export interface BreachThresholds {
  warning_threshold?: number | null;
  breach_threshold?: number | null;
  escalation_threshold?: number | null;
}

export function nextBreachStatus(
  consecutiveMisses: number,
  thresholds: BreachThresholds = {},
): BreachStatus {
  if (!Number.isFinite(consecutiveMisses) || consecutiveMisses < 0) return 'none';

  const w = thresholds.warning_threshold ?? DEFAULT_WARNING_THRESHOLD;
  const b = thresholds.breach_threshold ?? DEFAULT_BREACH_THRESHOLD;
  const e = thresholds.escalation_threshold ?? DEFAULT_ESCALATION_THRESHOLD;

  if (consecutiveMisses >= e) return 'escalated';
  if (consecutiveMisses >= b) return 'breach';
  if (consecutiveMisses >= w) return 'warning';
  return 'none';
}

// Whether this is a fresh transition into the 'escalated' state on this tick.
// Used by the cron to gate the regulator cascade — fire ONCE on the first
// crossing, not every day it stays escalated.
export function isEscalationTransition(
  previousStatus: BreachStatus,
  nextStatus: BreachStatus,
): boolean {
  return nextStatus === 'escalated' && previousStatus !== 'escalated';
}

export function isBreachTransition(
  previousStatus: BreachStatus,
  nextStatus: BreachStatus,
): boolean {
  return (
    nextStatus === 'breach' &&
    (previousStatus === 'none' || previousStatus === 'warning')
  );
}

export function isWarningTransition(
  previousStatus: BreachStatus,
  nextStatus: BreachStatus,
): boolean {
  return nextStatus === 'warning' && previousStatus === 'none';
}

export function isRecoveryTransition(
  previousStatus: BreachStatus,
  nextStatus: BreachStatus,
): boolean {
  return nextStatus === 'none' && previousStatus !== 'none';
}

// applyDailyOutcome returns the new {consecutive_misses, breach_status} given
// the previous values and today's compliance verdict. 'excused' days do not
// reset the counter but also do not increment it (treated as paused).
export function applyDailyOutcome(input: {
  previousMisses: number;
  previousBreach: BreachStatus;
  todayStatus: ComplianceStatus;
  thresholds?: BreachThresholds;
}): { consecutive_misses: number; breach_status: BreachStatus } {
  let misses = Math.max(0, input.previousMisses || 0);
  if (input.todayStatus === 'compliant') {
    misses = 0;
  } else if (input.todayStatus === 'miss') {
    misses += 1;
  }
  // 'excused' → no change to counter
  return {
    consecutive_misses: misses,
    breach_status: nextBreachStatus(misses, input.thresholds || {}),
  };
}
