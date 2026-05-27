import { describe, expect, it } from 'vitest';
import {
  evaluateCompliance,
  nextBreachStatus,
  applyDailyOutcome,
  isEscalationTransition,
  isBreachTransition,
  isWarningTransition,
  isRecoveryTransition,
  DEFAULT_WARNING_THRESHOLD,
  DEFAULT_BREACH_THRESHOLD,
  DEFAULT_ESCALATION_THRESHOLD,
  PENALTY_FRACTION_OF_DAILY_FEE,
} from '../src/utils/mm-compliance-spec';

describe('evaluateCompliance', () => {
  const target = {
    two_sided_minutes_per_day: 360,
    max_spread_bps: 50,
    uptime_target_pct: 95,
    min_quote_volume_mwh: 10,
    monthly_fee_zar: 45000,
  };

  it('all metrics passing → compliant + full daily fee', () => {
    const v = evaluateCompliance(target, {
      two_sided_minutes: 365,
      avg_spread_bps: 42,
      uptime_pct: 96.4,
      total_volume_mwh: 120,
    });
    expect(v.compliance_status).toBe('compliant');
    expect(v.fee_earned_zar).toBe(1500);
    expect(v.penalty_zar).toBe(0);
    expect(v.failed_metrics).toEqual([]);
  });

  it('uptime under target → miss + penalty', () => {
    const v = evaluateCompliance(target, {
      two_sided_minutes: 365,
      avg_spread_bps: 42,
      uptime_pct: 88,
      total_volume_mwh: 120,
    });
    expect(v.compliance_status).toBe('miss');
    expect(v.fee_earned_zar).toBe(0);
    expect(v.penalty_zar).toBe(750);
    expect(v.failed_metrics).toContain('uptime_pct');
  });

  it('two_sided_minutes short → miss', () => {
    const v = evaluateCompliance(target, {
      two_sided_minutes: 180,
      avg_spread_bps: 42,
      uptime_pct: 96,
      total_volume_mwh: 120,
    });
    expect(v.compliance_status).toBe('miss');
    expect(v.failed_metrics).toContain('two_sided_minutes');
  });

  it('avg_spread exceeds max → miss', () => {
    const v = evaluateCompliance(target, {
      two_sided_minutes: 365,
      avg_spread_bps: 95,
      uptime_pct: 96,
      total_volume_mwh: 120,
    });
    expect(v.compliance_status).toBe('miss');
    expect(v.failed_metrics).toContain('avg_spread_bps');
  });

  it('multiple failures all listed', () => {
    const v = evaluateCompliance(target, {
      two_sided_minutes: 90,
      avg_spread_bps: 200,
      uptime_pct: 70,
      total_volume_mwh: 1,
    });
    expect(v.compliance_status).toBe('miss');
    expect(v.failed_metrics.sort()).toEqual(
      ['avg_spread_bps', 'total_volume_mwh', 'two_sided_minutes', 'uptime_pct'].sort()
    );
  });

  it('null targets are treated as no constraint', () => {
    const v = evaluateCompliance(
      { monthly_fee_zar: 30000 },
      { two_sided_minutes: 0, avg_spread_bps: 9999, uptime_pct: 0, total_volume_mwh: 0 }
    );
    expect(v.compliance_status).toBe('compliant');
    expect(v.fee_earned_zar).toBe(1000);
  });

  it('zero fee yields zero earnings AND zero penalty even when missed', () => {
    const v = evaluateCompliance(
      { two_sided_minutes_per_day: 200 },
      { two_sided_minutes: 50 }
    );
    expect(v.compliance_status).toBe('miss');
    expect(v.fee_earned_zar).toBe(0);
    expect(v.penalty_zar).toBe(0);
  });

  it('penalty is exactly PENALTY_FRACTION_OF_DAILY_FEE of dailyFee', () => {
    const v = evaluateCompliance(
      { monthly_fee_zar: 30000, two_sided_minutes_per_day: 200 },
      { two_sided_minutes: 50 }
    );
    // dailyFee = 30000/30 = 1000; penalty = 500 = 0.5
    expect(v.penalty_zar).toBe(1000 * PENALTY_FRACTION_OF_DAILY_FEE);
  });
});

describe('nextBreachStatus', () => {
  it('0 misses → none', () => {
    expect(nextBreachStatus(0)).toBe('none');
  });

  it('1 miss → warning at default threshold', () => {
    expect(nextBreachStatus(1)).toBe('warning');
    expect(DEFAULT_WARNING_THRESHOLD).toBe(1);
  });

  it('3 misses → breach', () => {
    expect(nextBreachStatus(3)).toBe('breach');
    expect(DEFAULT_BREACH_THRESHOLD).toBe(3);
  });

  it('5 misses → escalated', () => {
    expect(nextBreachStatus(5)).toBe('escalated');
    expect(DEFAULT_ESCALATION_THRESHOLD).toBe(5);
  });

  it('honours custom thresholds', () => {
    expect(nextBreachStatus(2, { warning_threshold: 3, breach_threshold: 5, escalation_threshold: 10 }))
      .toBe('none');
    expect(nextBreachStatus(7, { warning_threshold: 3, breach_threshold: 5, escalation_threshold: 10 }))
      .toBe('breach');
  });

  it('clamps negative / invalid input', () => {
    expect(nextBreachStatus(-1)).toBe('none');
    expect(nextBreachStatus(NaN)).toBe('none');
  });
});

describe('applyDailyOutcome', () => {
  it('compliant resets to none from any state', () => {
    expect(applyDailyOutcome({
      previousMisses: 4,
      previousBreach: 'breach',
      todayStatus: 'compliant',
    })).toEqual({ consecutive_misses: 0, breach_status: 'none' });
  });

  it('miss increments and re-evaluates breach status', () => {
    expect(applyDailyOutcome({
      previousMisses: 0,
      previousBreach: 'none',
      todayStatus: 'miss',
    })).toEqual({ consecutive_misses: 1, breach_status: 'warning' });

    expect(applyDailyOutcome({
      previousMisses: 2,
      previousBreach: 'warning',
      todayStatus: 'miss',
    })).toEqual({ consecutive_misses: 3, breach_status: 'breach' });

    expect(applyDailyOutcome({
      previousMisses: 4,
      previousBreach: 'breach',
      todayStatus: 'miss',
    })).toEqual({ consecutive_misses: 5, breach_status: 'escalated' });
  });

  it('excused holds the counter still (paused)', () => {
    expect(applyDailyOutcome({
      previousMisses: 2,
      previousBreach: 'warning',
      todayStatus: 'excused',
    })).toEqual({ consecutive_misses: 2, breach_status: 'warning' });
  });

  it('respects custom thresholds in the resulting breach status', () => {
    expect(applyDailyOutcome({
      previousMisses: 5,
      previousBreach: 'breach',
      todayStatus: 'miss',
      thresholds: { warning_threshold: 5, breach_threshold: 10, escalation_threshold: 20 },
    })).toEqual({ consecutive_misses: 6, breach_status: 'warning' });
  });
});

describe('transition predicates', () => {
  it('isEscalationTransition fires only on entry', () => {
    expect(isEscalationTransition('breach', 'escalated')).toBe(true);
    expect(isEscalationTransition('escalated', 'escalated')).toBe(false);
    expect(isEscalationTransition('none', 'warning')).toBe(false);
  });

  it('isBreachTransition fires when entering from none/warning', () => {
    expect(isBreachTransition('none', 'breach')).toBe(true);
    expect(isBreachTransition('warning', 'breach')).toBe(true);
    expect(isBreachTransition('breach', 'breach')).toBe(false);
    expect(isBreachTransition('escalated', 'breach')).toBe(false);
  });

  it('isWarningTransition fires only from none', () => {
    expect(isWarningTransition('none', 'warning')).toBe(true);
    expect(isWarningTransition('warning', 'warning')).toBe(false);
  });

  it('isRecoveryTransition fires only when returning to none', () => {
    expect(isRecoveryTransition('warning', 'none')).toBe(true);
    expect(isRecoveryTransition('breach', 'none')).toBe(true);
    expect(isRecoveryTransition('none', 'none')).toBe(false);
  });
});
