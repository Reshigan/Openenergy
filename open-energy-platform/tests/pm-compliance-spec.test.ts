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
  tierForCriticalityScore,
  type PmComplianceStatus,
  type PmComplianceAction,
  type PmCriticalityTier,
} from '../src/utils/pm-compliance-spec';

const ALL_TIERS: PmCriticalityTier[] = [
  'routine', 'standard', 'significant', 'critical', 'safety_critical',
];

const CONTRACTOR_ACTIONS: PmComplianceAction[] = [
  'start_work', 'place_on_hold', 'complete_work', 'request_deferral',
];

describe('W59 pm-compliance state machine', () => {
  it('walks the executed happy path pm_scheduled → closed', () => {
    let s: PmComplianceStatus = 'pm_scheduled';
    const path: PmComplianceAction[] = [
      'assign_work', 'start_work', 'complete_work', 'open_verification', 'close_pm',
    ];
    const expected: PmComplianceStatus[] = [
      'work_assigned', 'in_progress', 'completed', 'verification_pending', 'closed',
    ];
    path.forEach((a, i) => {
      const n = nextStatus(s, a);
      expect(n).toBe(expected[i]);
      s = n!;
    });
    expect(isTerminal(s)).toBe(true);
  });

  it('rework loop returns verification_pending to in_progress', () => {
    expect(nextStatus('verification_pending', 'require_rework')).toBe('rework_required');
    expect(nextStatus('rework_required', 'start_work')).toBe('in_progress');
  });

  it('on-hold loop pauses and resumes execution', () => {
    expect(nextStatus('in_progress', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('on_hold', 'start_work')).toBe('in_progress');
  });

  it('deferral branch approves to deferred terminal', () => {
    expect(nextStatus('pm_scheduled', 'request_deferral')).toBe('deferral_requested');
    expect(nextStatus('work_assigned', 'request_deferral')).toBe('deferral_requested');
    expect(nextStatus('on_hold', 'request_deferral')).toBe('deferral_requested');
    expect(nextStatus('deferral_requested', 'approve_deferral')).toBe('deferred');
    expect(isTerminal('deferred')).toBe(true);
  });

  it('reject_deferral routes back to work_assigned', () => {
    expect(nextStatus('deferral_requested', 'reject_deferral')).toBe('work_assigned');
  });

  it('skip_pm reaches the skipped terminal from pre-execution states', () => {
    (['pm_scheduled', 'work_assigned', 'on_hold', 'deferral_requested'] as PmComplianceStatus[]).forEach((s) => {
      expect(nextStatus(s, 'skip_pm')).toBe('skipped');
    });
    expect(nextStatus('in_progress', 'skip_pm')).toBeNull();
    expect(isTerminal('skipped')).toBe(true);
  });

  it('cancel_pm reaches the cancelled terminal from early states only', () => {
    expect(nextStatus('pm_scheduled', 'cancel_pm')).toBe('cancelled');
    expect(nextStatus('work_assigned', 'cancel_pm')).toBe('cancelled');
    expect(nextStatus('in_progress', 'cancel_pm')).toBeNull();
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('withdrawable states match the pre-execution set', () => {
    expect(isWithdrawable('pm_scheduled')).toBe(true);
    expect(isWithdrawable('work_assigned')).toBe(true);
    expect(isWithdrawable('on_hold')).toBe(true);
    expect(isWithdrawable('deferral_requested')).toBe(true);
    expect(isWithdrawable('in_progress')).toBe(false);
    expect(isWithdrawable('closed')).toBe(false);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('pm_scheduled', 'close_pm')).toBeNull();
    expect(nextStatus('completed', 'close_pm')).toBeNull();
    expect(nextStatus('work_assigned', 'complete_work')).toBeNull();
  });

  it('terminals allow no further action', () => {
    (['closed', 'deferred', 'skipped', 'cancelled'] as PmComplianceStatus[]).forEach((t) => {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      Object.keys(TRANSITIONS).forEach((a) => {
        expect(nextStatus(t, a as PmComplianceAction)).toBeNull();
      });
    });
  });

  it('allowedActions reflects the branch fan-out', () => {
    expect(allowedActions('pm_scheduled').sort()).toEqual(
      ['assign_work', 'request_deferral', 'skip_pm', 'cancel_pm'].sort(),
    );
    expect(allowedActions('work_assigned').sort()).toEqual(
      ['start_work', 'request_deferral', 'skip_pm', 'cancel_pm'].sort(),
    );
    expect(allowedActions('deferral_requested').sort()).toEqual(
      ['approve_deferral', 'reject_deferral', 'skip_pm'].sort(),
    );
    expect(allowedActions('verification_pending').sort()).toEqual(
      ['require_rework', 'close_pm'].sort(),
    );
  });
});

describe('W59 URGENT SLA by criticality tier', () => {
  it('more critical = tighter response window (strictly decreasing)', () => {
    (['pm_scheduled', 'work_assigned', 'in_progress', 'on_hold', 'verification_pending', 'rework_required'] as PmComplianceStatus[]).forEach((s) => {
      const mins = ALL_TIERS.map((t) => slaWindowMinutes(s, t));
      for (let i = 1; i < mins.length; i++) {
        expect(mins[i]).toBeLessThan(mins[i - 1]);
      }
    });
  });

  it('safety_critical work_assigned is tighter than routine', () => {
    expect(slaWindowMinutes('work_assigned', 'safety_critical')).toBe(1440);
    expect(slaWindowMinutes('work_assigned', 'routine')).toBe(10080);
  });

  it('deferral_requested phase is flat across tiers', () => {
    const mins = ALL_TIERS.map((t) => slaWindowMinutes('deferral_requested', t));
    expect(new Set(mins).size).toBe(1);
  });

  it('slaDeadlineFor is null for terminals, set otherwise', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    expect(slaDeadlineFor('closed', 'safety_critical', now)).toBeNull();
    expect(slaDeadlineFor('verification_pending', 'safety_critical', now))
      .toEqual(new Date('2026-05-28T06:00:00Z'));
  });
});

describe('W59 reportability crossings', () => {
  it('skip_pm crosses for critical tiers only (the W59 signature)', () => {
    expect(crossesIntoRegulator('skip_pm', 'critical')).toBe(true);
    expect(crossesIntoRegulator('skip_pm', 'safety_critical')).toBe(true);
    expect(crossesIntoRegulator('skip_pm', 'significant')).toBe(false);
    expect(crossesIntoRegulator('skip_pm', 'routine')).toBe(false);
  });

  it('approve_deferral crosses for safety_critical only', () => {
    expect(crossesIntoRegulator('approve_deferral', 'safety_critical')).toBe(true);
    expect(crossesIntoRegulator('approve_deferral', 'critical')).toBe(false);
    expect(crossesIntoRegulator('approve_deferral', 'routine')).toBe(false);
  });

  it('routine actions never cross', () => {
    (['assign_work', 'start_work', 'complete_work', 'close_pm', 'reject_deferral'] as PmComplianceAction[]).forEach((a) => {
      ALL_TIERS.forEach((t) => expect(crossesIntoRegulator(a, t)).toBe(false));
    });
  });

  it('sla_breach + isReportable track critical tiers', () => {
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('safety_critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('significant')).toBe(false);
    expect(isReportable('critical')).toBe(true);
    expect(isReportable('routine')).toBe(false);
  });

  it('critical tier set is consistent', () => {
    expect(isCriticalTier('critical')).toBe(true);
    expect(isCriticalTier('safety_critical')).toBe(true);
    expect(isCriticalTier('significant')).toBe(false);
  });
});

describe('W59 single-party write parties', () => {
  it('contractor drives field execution', () => {
    CONTRACTOR_ACTIONS.forEach((a) => {
      expect(partyForAction(a)).toBe('om_contractor');
      expect(isContractorAction(a)).toBe(true);
    });
  });

  it('asset owner drives oversight / approval', () => {
    (Object.keys(ACTION_PARTY) as PmComplianceAction[])
      .filter((a) => !CONTRACTOR_ACTIONS.includes(a))
      .forEach((a) => {
        expect(partyForAction(a)).toBe('asset_owner');
        expect(isContractorAction(a)).toBe(false);
      });
  });
});

describe('W59 tier classification by criticality score', () => {
  it('buckets the equipment criticality index into the right tier', () => {
    expect(tierForCriticalityScore(0)).toBe('routine');
    expect(tierForCriticalityScore(19)).toBe('routine');
    expect(tierForCriticalityScore(20)).toBe('standard');
    expect(tierForCriticalityScore(39)).toBe('standard');
    expect(tierForCriticalityScore(40)).toBe('significant');
    expect(tierForCriticalityScore(59)).toBe('significant');
    expect(tierForCriticalityScore(60)).toBe('critical');
    expect(tierForCriticalityScore(79)).toBe('critical');
    expect(tierForCriticalityScore(80)).toBe('safety_critical');
    expect(tierForCriticalityScore(100)).toBe('safety_critical');
  });
});
