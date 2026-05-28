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
  isSecurityTier,
  isCriticalTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  isProviderAction,
  tierForResponseSeconds,
  type ReserveActivationStatus,
  type ReserveActivationAction,
  type ReserveTier,
} from '../src/utils/reserve-activation-spec';

const ALL_TIERS: ReserveTier[] = [
  'instantaneous_reserve', 'regulating_reserve', 'ten_minute_reserve',
  'supplemental_reserve', 'emergency_reserve',
];

describe('W50 reserve-activation state machine', () => {
  it('walks the full happy path issued → settled', () => {
    let s: ReserveActivationStatus = 'activation_issued';
    const path: ReserveActivationAction[] = [
      'acknowledge', 'begin_ramp', 'confirm_sustaining', 'release_instruction',
      'open_review', 'verify_performance', 'settle',
    ];
    const expected: ReserveActivationStatus[] = [
      'acknowledged', 'ramping', 'sustaining', 'released',
      'performance_review', 'verified', 'settled',
    ];
    path.forEach((a, i) => {
      const n = nextStatus(s, a);
      expect(n).toBe(expected[i]);
      s = n!;
    });
    expect(isTerminal(s)).toBe(true);
  });

  it('non-performance branch settles via penalty', () => {
    expect(nextStatus('sustaining', 'flag_non_performance')).toBe('non_performance');
    expect(nextStatus('ramping', 'flag_non_performance')).toBe('non_performance');
    expect(nextStatus('performance_review', 'flag_non_performance')).toBe('non_performance');
    expect(nextStatus('non_performance', 'settle_penalty')).toBe('settled');
  });

  it('dispute branch resolves to a terminal', () => {
    expect(nextStatus('performance_review', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('verified', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('non_performance', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('dispute_resolved');
    expect(isTerminal('dispute_resolved')).toBe(true);
  });

  it('withdraw is allowed only from pre-delivery states', () => {
    expect(nextStatus('activation_issued', 'withdraw_instruction')).toBe('withdrawn');
    expect(nextStatus('acknowledged', 'withdraw_instruction')).toBe('withdrawn');
    expect(nextStatus('ramping', 'withdraw_instruction')).toBe('withdrawn');
    expect(nextStatus('sustaining', 'withdraw_instruction')).toBeNull();
    expect(nextStatus('verified', 'withdraw_instruction')).toBeNull();
  });

  it('withdrawable states match the pre-delivery set', () => {
    expect(isWithdrawable('activation_issued')).toBe(true);
    expect(isWithdrawable('acknowledged')).toBe(true);
    expect(isWithdrawable('ramping')).toBe(true);
    expect(isWithdrawable('sustaining')).toBe(false);
    expect(isWithdrawable('settled')).toBe(false);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('activation_issued', 'settle')).toBeNull();
    expect(nextStatus('acknowledged', 'verify_performance')).toBeNull();
    expect(nextStatus('released', 'acknowledge')).toBeNull();
  });

  it('terminals allow no further action', () => {
    (['settled', 'dispute_resolved', 'withdrawn'] as ReserveActivationStatus[]).forEach((t) => {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      Object.keys(TRANSITIONS).forEach((a) => {
        expect(nextStatus(t, a as ReserveActivationAction)).toBeNull();
      });
    });
  });

  it('allowedActions reflects the branch fan-out', () => {
    expect(allowedActions('performance_review').sort()).toEqual(
      ['flag_non_performance', 'raise_dispute', 'verify_performance'].sort(),
    );
    expect(allowedActions('ramping').sort()).toEqual(
      ['confirm_sustaining', 'flag_non_performance', 'withdraw_instruction'].sort(),
    );
  });
});

describe('W50 URGENT SLA by reserve tier', () => {
  it('faster product = tighter response window (strictly increasing)', () => {
    (['activation_issued', 'acknowledged', 'ramping'] as ReserveActivationStatus[]).forEach((s) => {
      const mins = ALL_TIERS.map((t) => slaWindowMinutes(s, t));
      for (let i = 1; i < mins.length; i++) {
        expect(mins[i]).toBeGreaterThan(mins[i - 1]);
      }
    });
  });

  it('instantaneous reserve acknowledges in 1 minute', () => {
    expect(slaWindowMinutes('activation_issued', 'instantaneous_reserve')).toBe(1);
    expect(slaWindowMinutes('activation_issued', 'emergency_reserve')).toBe(20);
  });

  it('settlement phase is flat across tiers', () => {
    (['released', 'performance_review', 'verified', 'non_performance', 'disputed'] as ReserveActivationStatus[]).forEach((s) => {
      const mins = ALL_TIERS.map((t) => slaWindowMinutes(s, t));
      expect(new Set(mins).size).toBe(1);
    });
  });

  it('slaDeadlineFor is null for terminals and zero-window states', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    expect(slaDeadlineFor('settled', 'instantaneous_reserve', now)).toBeNull();
    expect(slaDeadlineFor('sustaining', 'instantaneous_reserve', now)).toBeNull();
    expect(slaDeadlineFor('activation_issued', 'instantaneous_reserve', now))
      .toEqual(new Date('2026-05-28T00:01:00Z'));
  });
});

describe('W50 reportability crossings', () => {
  it('flag_non_performance crosses for security tiers only', () => {
    expect(crossesIntoRegulator('flag_non_performance', 'instantaneous_reserve')).toBe(true);
    expect(crossesIntoRegulator('flag_non_performance', 'regulating_reserve')).toBe(true);
    expect(crossesIntoRegulator('flag_non_performance', 'ten_minute_reserve')).toBe(true);
    expect(crossesIntoRegulator('flag_non_performance', 'supplemental_reserve')).toBe(false);
    expect(crossesIntoRegulator('flag_non_performance', 'emergency_reserve')).toBe(false);
  });

  it('resolve_dispute crosses for critical tiers only', () => {
    expect(crossesIntoRegulator('resolve_dispute', 'instantaneous_reserve')).toBe(true);
    expect(crossesIntoRegulator('resolve_dispute', 'regulating_reserve')).toBe(true);
    expect(crossesIntoRegulator('resolve_dispute', 'ten_minute_reserve')).toBe(false);
  });

  it('routine actions never cross', () => {
    (['acknowledge', 'begin_ramp', 'settle', 'verify_performance'] as ReserveActivationAction[]).forEach((a) => {
      ALL_TIERS.forEach((t) => expect(crossesIntoRegulator(a, t)).toBe(false));
    });
  });

  it('sla_breach + isReportable track critical tiers', () => {
    expect(slaBreachCrossesIntoRegulator('instantaneous_reserve')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('regulating_reserve')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('ten_minute_reserve')).toBe(false);
    expect(isReportable('instantaneous_reserve')).toBe(true);
    expect(isReportable('supplemental_reserve')).toBe(false);
  });

  it('tier sets are consistent', () => {
    expect(isSecurityTier('ten_minute_reserve')).toBe(true);
    expect(isCriticalTier('ten_minute_reserve')).toBe(false);
    expect(isSecurityTier('emergency_reserve')).toBe(false);
  });
});

describe('W50 split-write parties', () => {
  it('provider drives acknowledge/ramp/sustain/dispute', () => {
    (['acknowledge', 'begin_ramp', 'confirm_sustaining', 'raise_dispute'] as ReserveActivationAction[]).forEach((a) => {
      expect(partyForAction(a)).toBe('reserve_provider');
      expect(isProviderAction(a)).toBe(true);
    });
  });

  it('SO drives everything else', () => {
    (Object.keys(ACTION_PARTY) as ReserveActivationAction[])
      .filter((a) => !['acknowledge', 'begin_ramp', 'confirm_sustaining', 'raise_dispute'].includes(a))
      .forEach((a) => {
        expect(partyForAction(a)).toBe('system_operator');
        expect(isProviderAction(a)).toBe(false);
      });
  });
});

describe('W50 tier classification by response seconds', () => {
  it('buckets response times into the right product tier', () => {
    expect(tierForResponseSeconds(8)).toBe('instantaneous_reserve');
    expect(tierForResponseSeconds(10)).toBe('instantaneous_reserve');
    expect(tierForResponseSeconds(30)).toBe('regulating_reserve');
    expect(tierForResponseSeconds(600)).toBe('ten_minute_reserve');
    expect(tierForResponseSeconds(1800)).toBe('supplemental_reserve');
    expect(tierForResponseSeconds(3600)).toBe('emergency_reserve');
  });
});
