import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  ACTION_PARTY,
  isTerminal,
  isWithdrawable,
  nextStatus,
  allowedActions,
  slaWindowMinutes,
  slaDeadlineFor,
  isCriticalTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  isContractorAction,
  tierForShortfallPp,
  type AvailabilityGuaranteeStatus,
  type AvailabilityGuaranteeAction,
  type AvailabilityShortfallTier,
} from '../src/utils/availability-guarantee-spec';

const ALL_TIERS: AvailabilityShortfallTier[] = [
  'minor_shortfall', 'moderate_shortfall', 'material_shortfall',
  'severe_shortfall', 'critical_shortfall',
];

describe('W51 availability-guarantee state machine', () => {
  it('walks the meets-guarantee happy path period_open → settled', () => {
    let s: AvailabilityGuaranteeStatus = 'period_open';
    const path: AvailabilityGuaranteeAction[] = [
      'submit_measurement', 'open_adjustment_review', 'reconcile',
      'confirm_meets_guarantee', 'settle',
    ];
    const expected: AvailabilityGuaranteeStatus[] = [
      'measurement_submitted', 'adjustment_review', 'reconciled',
      'meets_guarantee', 'settled',
    ];
    path.forEach((a, i) => {
      const n = nextStatus(s, a);
      expect(n).toBe(expected[i]);
      s = n!;
    });
    expect(isTerminal(s)).toBe(true);
  });

  it('shortfall branch assesses LD then settles', () => {
    expect(nextStatus('reconciled', 'flag_shortfall')).toBe('shortfall_flagged');
    expect(nextStatus('shortfall_flagged', 'assess_ld')).toBe('ld_assessed');
    expect(nextStatus('ld_assessed', 'settle')).toBe('settled');
  });

  it('cure de-escalation then settle/waive', () => {
    expect(nextStatus('ld_assessed', 'agree_cure_plan')).toBe('cure_period');
    expect(nextStatus('cure_period', 'settle')).toBe('settled');
    expect(nextStatus('cure_period', 'waive_ld')).toBe('settled');
  });

  it('waive_ld shares the settled terminal with settle', () => {
    expect(nextStatus('ld_assessed', 'waive_ld')).toBe('settled');
    expect(nextStatus('meets_guarantee', 'settle')).toBe('settled');
  });

  it('dispute branch resolves to a terminal', () => {
    expect(nextStatus('shortfall_flagged', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('ld_assessed', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('cure_period', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('dispute_resolved');
    expect(isTerminal('dispute_resolved')).toBe(true);
  });

  it('withdraw is allowed only from pre-reconciliation states', () => {
    expect(nextStatus('period_open', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('measurement_submitted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('adjustment_review', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('reconciled', 'withdraw')).toBeNull();
    expect(nextStatus('ld_assessed', 'withdraw')).toBeNull();
  });

  it('withdrawable states match the pre-reconciliation set', () => {
    expect(isWithdrawable('period_open')).toBe(true);
    expect(isWithdrawable('measurement_submitted')).toBe(true);
    expect(isWithdrawable('adjustment_review')).toBe(true);
    expect(isWithdrawable('reconciled')).toBe(false);
    expect(isWithdrawable('settled')).toBe(false);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('period_open', 'settle')).toBeNull();
    expect(nextStatus('reconciled', 'assess_ld')).toBeNull();
    expect(nextStatus('measurement_submitted', 'reconcile')).toBeNull();
  });

  it('terminals allow no further action', () => {
    (['settled', 'dispute_resolved', 'withdrawn'] as AvailabilityGuaranteeStatus[]).forEach((t) => {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      Object.keys(TRANSITIONS).forEach((a) => {
        expect(nextStatus(t, a as AvailabilityGuaranteeAction)).toBeNull();
      });
    });
  });

  it('allowedActions reflects the branch fan-out', () => {
    expect(allowedActions('reconciled').sort()).toEqual(
      ['confirm_meets_guarantee', 'flag_shortfall'].sort(),
    );
    expect(allowedActions('ld_assessed').sort()).toEqual(
      ['agree_cure_plan', 'settle', 'waive_ld', 'raise_dispute'].sort(),
    );
    expect(allowedActions('cure_period').sort()).toEqual(
      ['settle', 'waive_ld', 'raise_dispute'].sort(),
    );
  });
});

describe('W51 URGENT SLA by shortfall tier', () => {
  it('larger shortfall = tighter response window (strictly decreasing)', () => {
    (['measurement_submitted', 'adjustment_review', 'shortfall_flagged', 'ld_assessed', 'cure_period'] as AvailabilityGuaranteeStatus[]).forEach((s) => {
      const mins = ALL_TIERS.map((t) => slaWindowMinutes(s, t));
      for (let i = 1; i < mins.length; i++) {
        expect(mins[i]).toBeLessThan(mins[i - 1]);
      }
    });
  });

  it('critical shortfall in measurement is tighter than minor', () => {
    expect(slaWindowMinutes('measurement_submitted', 'critical_shortfall')).toBe(720);
    expect(slaWindowMinutes('measurement_submitted', 'minor_shortfall')).toBe(5760);
  });

  it('dispute + meets_guarantee phases are flat across tiers', () => {
    (['disputed', 'meets_guarantee'] as AvailabilityGuaranteeStatus[]).forEach((s) => {
      const mins = ALL_TIERS.map((t) => slaWindowMinutes(s, t));
      expect(new Set(mins).size).toBe(1);
    });
  });

  it('slaDeadlineFor is null for terminals, set otherwise', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    expect(slaDeadlineFor('settled', 'critical_shortfall', now)).toBeNull();
    expect(slaDeadlineFor('shortfall_flagged', 'critical_shortfall', now))
      .toEqual(new Date('2026-05-28T06:00:00Z'));
  });
});

describe('W51 reportability crossings', () => {
  it('flag_shortfall crosses for critical tiers only', () => {
    expect(crossesIntoRegulator('flag_shortfall', 'severe_shortfall')).toBe(true);
    expect(crossesIntoRegulator('flag_shortfall', 'critical_shortfall')).toBe(true);
    expect(crossesIntoRegulator('flag_shortfall', 'material_shortfall')).toBe(false);
    expect(crossesIntoRegulator('flag_shortfall', 'minor_shortfall')).toBe(false);
  });

  it('resolve_dispute crosses for critical tiers only', () => {
    expect(crossesIntoRegulator('resolve_dispute', 'severe_shortfall')).toBe(true);
    expect(crossesIntoRegulator('resolve_dispute', 'critical_shortfall')).toBe(true);
    expect(crossesIntoRegulator('resolve_dispute', 'moderate_shortfall')).toBe(false);
  });

  it('routine actions never cross', () => {
    (['submit_measurement', 'reconcile', 'settle', 'confirm_meets_guarantee'] as AvailabilityGuaranteeAction[]).forEach((a) => {
      ALL_TIERS.forEach((t) => expect(crossesIntoRegulator(a, t)).toBe(false));
    });
  });

  it('sla_breach + isReportable track critical tiers', () => {
    expect(slaBreachCrossesIntoRegulator('severe_shortfall')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('critical_shortfall')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material_shortfall')).toBe(false);
    expect(isReportable('severe_shortfall')).toBe(true);
    expect(isReportable('minor_shortfall')).toBe(false);
  });

  it('critical tier set is consistent', () => {
    expect(isCriticalTier('severe_shortfall')).toBe(true);
    expect(isCriticalTier('critical_shortfall')).toBe(true);
    expect(isCriticalTier('material_shortfall')).toBe(false);
  });
});

describe('W51 single-party write parties', () => {
  it('contractor drives measurement/cure/dispute', () => {
    (['submit_measurement', 'agree_cure_plan', 'raise_dispute'] as AvailabilityGuaranteeAction[]).forEach((a) => {
      expect(partyForAction(a)).toBe('om_contractor');
      expect(isContractorAction(a)).toBe(true);
    });
  });

  it('asset owner drives everything else', () => {
    (Object.keys(ACTION_PARTY) as AvailabilityGuaranteeAction[])
      .filter((a) => !['submit_measurement', 'agree_cure_plan', 'raise_dispute'].includes(a))
      .forEach((a) => {
        expect(partyForAction(a)).toBe('asset_owner');
        expect(isContractorAction(a)).toBe(false);
      });
  });
});

describe('W51 tier classification by shortfall pp', () => {
  it('buckets shortfall percentage points into the right severity tier', () => {
    expect(tierForShortfallPp(0)).toBe('minor_shortfall');
    expect(tierForShortfallPp(0.5)).toBe('minor_shortfall');
    expect(tierForShortfallPp(1)).toBe('moderate_shortfall');
    expect(tierForShortfallPp(2.9)).toBe('moderate_shortfall');
    expect(tierForShortfallPp(3)).toBe('material_shortfall');
    expect(tierForShortfallPp(5)).toBe('severe_shortfall');
    expect(tierForShortfallPp(9.9)).toBe('severe_shortfall');
    expect(tierForShortfallPp(10)).toBe('critical_shortfall');
    expect(tierForShortfallPp(25)).toBe('critical_shortfall');
  });
});
