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
  isHighTier,
  isLiveOrConfined,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  isHolderAction,
  tierForHazardScore,
  type PermitStatus,
  type PermitAction,
  type HazardTier,
  type WorkClass,
} from '../src/utils/permit-to-work-spec';

const ALL_TIERS: HazardTier[] = ['low', 'moderate', 'high', 'critical', 'catastrophic'];

const ALL_STATES: PermitStatus[] = [
  'permit_requested', 'hazard_assessment', 'isolation_pending', 'isolation_confirmed',
  'permit_issued', 'work_in_progress', 'suspended', 'work_complete',
  'permit_closed', 'permit_rejected', 'permit_revoked', 'withdrawn',
];

const HOLDER_ACTIONS: PermitAction[] = [
  'start_work', 'suspend_work', 'resume_work', 'complete_work', 'withdraw',
];

describe('W64 permit-to-work state machine', () => {
  it('walks the issued-and-worked happy path to permit_closed', () => {
    let s: PermitStatus = 'permit_requested';
    const path: PermitAction[] = [
      'begin_assessment', 'approve_isolation_plan', 'verify_isolation',
      'issue_permit', 'start_work', 'complete_work', 'close_permit',
    ];
    const expected: PermitStatus[] = [
      'hazard_assessment', 'isolation_pending', 'isolation_confirmed',
      'permit_issued', 'work_in_progress', 'work_complete', 'permit_closed',
    ];
    path.forEach((a, i) => {
      const n = nextStatus(s, a);
      expect(n).toBe(expected[i]);
      s = n as PermitStatus;
    });
    expect(isTerminal(s)).toBe(true);
  });

  it('supports the suspend / resume loop on active work', () => {
    expect(nextStatus('work_in_progress', 'suspend_work')).toBe('suspended');
    expect(nextStatus('suspended', 'resume_work')).toBe('work_in_progress');
    expect(nextStatus('suspended', 'complete_work')).toBeNull();
  });

  it('rejects only from assessment / isolation-pending', () => {
    expect(nextStatus('hazard_assessment', 'reject_permit')).toBe('permit_rejected');
    expect(nextStatus('isolation_pending', 'reject_permit')).toBe('permit_rejected');
    expect(nextStatus('permit_issued', 'reject_permit')).toBeNull();
  });

  it('withdraws only before a permit is issued', () => {
    expect(nextStatus('permit_requested', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('hazard_assessment', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('isolation_pending', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('isolation_confirmed', 'withdraw')).toBeNull();
    expect(nextStatus('work_in_progress', 'withdraw')).toBeNull();
  });

  it('revokes from any state where isolation exists or work is live', () => {
    for (const s of ['isolation_confirmed', 'permit_issued', 'work_in_progress', 'suspended'] as PermitStatus[]) {
      expect(nextStatus(s, 'revoke_permit')).toBe('permit_revoked');
    }
    expect(nextStatus('hazard_assessment', 'revoke_permit')).toBeNull();
    expect(nextStatus('permit_requested', 'revoke_permit')).toBeNull();
  });

  it('marks the four terminals and blocks all transitions out of them', () => {
    for (const t of ['permit_closed', 'permit_rejected', 'permit_revoked', 'withdrawn'] as PermitStatus[]) {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      expect(nextStatus(t, 'begin_assessment')).toBeNull();
    }
  });

  it('reports withdrawable states', () => {
    expect(isWithdrawable('permit_requested')).toBe(true);
    expect(isWithdrawable('hazard_assessment')).toBe(true);
    expect(isWithdrawable('isolation_pending')).toBe(true);
    expect(isWithdrawable('isolation_confirmed')).toBe(false);
    expect(isWithdrawable('permit_issued')).toBe(false);
  });

  it('allowedActions reflects the transition map', () => {
    expect(allowedActions('permit_requested').sort()).toEqual(['begin_assessment', 'withdraw'].sort());
    expect(allowedActions('isolation_pending').sort()).toEqual(
      ['verify_isolation', 'reject_permit', 'withdraw'].sort(),
    );
    expect(allowedActions('work_in_progress').sort()).toEqual(
      ['complete_work', 'revoke_permit', 'suspend_work'].sort(),
    );
  });
});

describe('W64 hazard tiering (0..100 composite hazard score)', () => {
  it('classifies at the boundaries', () => {
    expect(tierForHazardScore(0)).toBe('low');
    expect(tierForHazardScore(19.9)).toBe('low');
    expect(tierForHazardScore(20)).toBe('moderate');
    expect(tierForHazardScore(39.9)).toBe('moderate');
    expect(tierForHazardScore(40)).toBe('high');
    expect(tierForHazardScore(59.9)).toBe('high');
    expect(tierForHazardScore(60)).toBe('critical');
    expect(tierForHazardScore(79.9)).toBe('critical');
    expect(tierForHazardScore(80)).toBe('catastrophic');
    expect(tierForHazardScore(100)).toBe('catastrophic');
  });

  it('isHighTier covers critical + catastrophic only', () => {
    expect(isHighTier('low')).toBe(false);
    expect(isHighTier('moderate')).toBe(false);
    expect(isHighTier('high')).toBe(false);
    expect(isHighTier('critical')).toBe(true);
    expect(isHighTier('catastrophic')).toBe(true);
  });
});

describe('W64 URGENT SLA (more hazardous = tighter)', () => {
  it('tightens monotonically with hazard across active states', () => {
    const active: PermitStatus[] = [
      'permit_requested', 'hazard_assessment', 'isolation_pending',
      'isolation_confirmed', 'permit_issued', 'work_in_progress',
      'suspended', 'work_complete',
    ];
    for (const s of active) {
      for (let i = 1; i < ALL_TIERS.length; i++) {
        expect(slaWindowMinutes(s, ALL_TIERS[i])).toBeLessThanOrEqual(
          slaWindowMinutes(s, ALL_TIERS[i - 1]),
        );
      }
      // catastrophic strictly tighter than low on every active state
      expect(slaWindowMinutes(s, 'catastrophic')).toBeLessThan(slaWindowMinutes(s, 'low'));
    }
  });

  it('carries no SLA on terminals', () => {
    for (const t of ['permit_closed', 'permit_rejected', 'permit_revoked', 'withdrawn'] as PermitStatus[]) {
      for (const tier of ALL_TIERS) expect(slaWindowMinutes(t, tier)).toBe(0);
      expect(slaDeadlineFor(t, 'catastrophic', new Date())).toBeNull();
    }
  });

  it('computes deadlines off the entered-at time', () => {
    const t0 = new Date('2026-05-28T00:00:00Z');
    const d = slaDeadlineFor('permit_issued', 'catastrophic', t0);
    expect(d).not.toBeNull();
    // catastrophic permit_issued = 120 min
    expect((d as Date).getTime() - t0.getTime()).toBe(120 * 60_000);
  });
});

describe('W64 SIGNATURE — live-work / isolation-integrity regulator crossing', () => {
  const G: WorkClass = 'general';

  it('issue_permit crosses for EVERY tier when work is live', () => {
    for (const tier of ALL_TIERS) {
      expect(crossesIntoRegulator('issue_permit', tier, true, 'electrical_live')).toBe(true);
    }
  });

  it('issue_permit crosses for EVERY tier on confined-space entry (even non-live)', () => {
    for (const tier of ALL_TIERS) {
      expect(crossesIntoRegulator('issue_permit', tier, false, 'confined_space')).toBe(true);
    }
  });

  it('issue_permit on a non-live, non-confined permit crosses only for top tiers', () => {
    expect(crossesIntoRegulator('issue_permit', 'low', false, G)).toBe(false);
    expect(crossesIntoRegulator('issue_permit', 'moderate', false, G)).toBe(false);
    expect(crossesIntoRegulator('issue_permit', 'high', false, G)).toBe(false);
    expect(crossesIntoRegulator('issue_permit', 'critical', false, G)).toBe(true);
    expect(crossesIntoRegulator('issue_permit', 'catastrophic', false, G)).toBe(true);
  });

  it('revoke_permit ALWAYS crosses, regardless of tier / live / class', () => {
    for (const tier of ALL_TIERS) {
      expect(crossesIntoRegulator('revoke_permit', tier, false, G)).toBe(true);
      expect(crossesIntoRegulator('revoke_permit', tier, true, 'electrical_live')).toBe(true);
    }
  });

  it('routine lifecycle actions never cross', () => {
    for (const a of ['begin_assessment', 'verify_isolation', 'start_work', 'complete_work', 'close_permit'] as PermitAction[]) {
      expect(crossesIntoRegulator(a, 'catastrophic', true, 'confined_space')).toBe(false);
    }
  });

  it('sla_breach crosses for top tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('low')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('high')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('catastrophic')).toBe(true);
  });

  it('isLiveOrConfined + isReportable agree on the signature', () => {
    expect(isLiveOrConfined(true, 'general')).toBe(true);
    expect(isLiveOrConfined(false, 'confined_space')).toBe(true);
    expect(isLiveOrConfined(false, 'general')).toBe(false);
    // reportable = live OR confined OR top tier
    expect(isReportable('low', true, 'general')).toBe(true);
    expect(isReportable('low', false, 'confined_space')).toBe(true);
    expect(isReportable('low', false, 'general')).toBe(false);
    expect(isReportable('critical', false, 'general')).toBe(true);
    expect(isReportable('catastrophic', false, 'general')).toBe(true);
  });
});

describe('W64 party attribution (single-party write, action-derived party)', () => {
  it('attributes holder vs issuing-authority actions', () => {
    for (const a of HOLDER_ACTIONS) {
      expect(partyForAction(a)).toBe('permit_holder');
      expect(isHolderAction(a)).toBe(true);
    }
    for (const a of ['begin_assessment', 'approve_isolation_plan', 'verify_isolation', 'issue_permit', 'close_permit', 'reject_permit', 'revoke_permit'] as PermitAction[]) {
      expect(partyForAction(a)).toBe('issuing_authority');
      expect(isHolderAction(a)).toBe(false);
    }
  });

  it('defines a party for every action', () => {
    for (const a of Object.keys(TRANSITIONS) as PermitAction[]) {
      expect(ACTION_PARTY[a]).toBeDefined();
    }
  });

  it('covers all 12 states and 12 actions', () => {
    expect(ALL_STATES.length).toBe(12);
    expect(Object.keys(TRANSITIONS).length).toBe(12);
  });
});
