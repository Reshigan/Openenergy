import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, isWithdrawable, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportableTier, partyForAction,
  type ChangeStatus, type ChangeTier, type ChangeAction,
} from '../src/utils/change-enablement-spec';

describe('W47 change-enablement chain — state machine', () => {
  it('happy path: requested→assessment→cab→approved→scheduled→implementing→implemented→pir→closed', () => {
    let s: ChangeStatus = 'change_requested';
    s = nextStatus(s, 'assess')!;                  expect(s).toBe('assessment');
    s = nextStatus(s, 'submit_to_cab')!;           expect(s).toBe('cab_review');
    s = nextStatus(s, 'approve')!;                 expect(s).toBe('approved');
    s = nextStatus(s, 'schedule')!;                expect(s).toBe('scheduled');
    s = nextStatus(s, 'begin_implementation')!;    expect(s).toBe('implementing');
    s = nextStatus(s, 'complete_implementation')!; expect(s).toBe('implemented');
    s = nextStatus(s, 'initiate_pir')!;            expect(s).toBe('pir');
    s = nextStatus(s, 'close')!;                   expect(s).toBe('closed');
    expect(isTerminal('closed')).toBe(true);
  });

  it('emergency fast-path: assessment → approved via emergency_approve (ECAB bypass)', () => {
    expect(nextStatus('assessment', 'emergency_approve')).toBe('approved');
    // ...but a normal change still reaches approved only through cab_review
    expect(nextStatus('change_requested', 'emergency_approve')).toBeNull();
    expect(nextStatus('cab_review', 'emergency_approve')).toBeNull();
  });

  it('rejection branch: cab_review → rejected', () => {
    expect(nextStatus('cab_review', 'reject')).toBe('rejected');
    expect(isTerminal('rejected')).toBe(true);
    // reject is only available at CAB
    expect(nextStatus('assessment', 'reject')).toBeNull();
    expect(nextStatus('approved', 'reject')).toBeNull();
  });

  it('backout branch: roll_back reachable from implementing / implemented only', () => {
    expect(nextStatus('implementing', 'roll_back')).toBe('rolled_back');
    expect(nextStatus('implemented', 'roll_back')).toBe('rolled_back');
    expect(isTerminal('rolled_back')).toBe(true);
    expect(nextStatus('scheduled', 'roll_back')).toBeNull();
    expect(nextStatus('approved', 'roll_back')).toBeNull();
    expect(nextStatus('pir', 'roll_back')).toBeNull();
  });

  it('cancel reachable only from pre-implementation states', () => {
    const froms: ChangeStatus[] = ['change_requested', 'assessment', 'cab_review', 'approved', 'scheduled'];
    for (const f of froms) {
      expect(nextStatus(f, 'cancel')).toBe('cancelled');
      expect(isWithdrawable(f)).toBe(true);
    }
    expect(nextStatus('implementing', 'cancel')).toBeNull();
    expect(nextStatus('implemented', 'cancel')).toBeNull();
    expect(nextStatus('pir', 'cancel')).toBeNull();
    expect(isWithdrawable('implementing')).toBe(false);
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('closed')).toEqual([]);
    expect(allowedActions('rejected')).toEqual([]);
    expect(allowedActions('rolled_back')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('change_requested', 'approve')).toBeNull();
    expect(nextStatus('assessment', 'schedule')).toBeNull();
    expect(nextStatus('approved', 'begin_implementation')).toBeNull();
    expect(nextStatus('scheduled', 'complete_implementation')).toBeNull();
    expect(nextStatus('implemented', 'close')).toBeNull();
    expect(nextStatus('closed', 'close')).toBeNull();
  });

  it('TRANSITIONS dict covers every state', () => {
    const states: ChangeStatus[] = [
      'change_requested', 'assessment', 'cab_review', 'approved', 'scheduled',
      'implementing', 'implemented', 'pir', 'closed', 'rejected', 'rolled_back', 'cancelled',
    ];
    for (const s of states) {
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });

  it('assessment offers submit_to_cab / emergency_approve / cancel', () => {
    const actions = allowedActions('assessment');
    expect(actions).toContain('submit_to_cab');
    expect(actions).toContain('emergency_approve');
    expect(actions).toContain('cancel');
  });

  it('cab_review offers approve / reject / cancel', () => {
    const actions = allowedActions('cab_review');
    expect(actions).toContain('approve');
    expect(actions).toContain('reject');
    expect(actions).toContain('cancel');
  });
});

describe('W47 change-enablement chain — URGENT SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');
  const HOUR = 60;
  const DAY = 24 * 60;

  it('emergency_change is the tightest window at every active stage', () => {
    const active: ChangeStatus[] = [
      'change_requested', 'assessment', 'cab_review', 'approved', 'scheduled',
      'implementing', 'implemented', 'pir',
    ];
    for (const st of active) {
      expect(SLA_MINUTES[st].emergency_change).toBeLessThan(SLA_MINUTES[st].normal_change);
      expect(SLA_MINUTES[st].normal_change).toBeLessThan(SLA_MINUTES[st].standard_change);
    }
  });

  it('change_requested: emergency 1h, standard 24h', () => {
    expect(SLA_MINUTES.change_requested.emergency_change).toBe(1 * HOUR);
    expect(SLA_MINUTES.change_requested.standard_change).toBe(24 * HOUR);
  });

  it('scheduled: emergency 4h, standard 7d', () => {
    expect(SLA_MINUTES.scheduled.emergency_change).toBe(4 * HOUR);
    expect(SLA_MINUTES.scheduled.standard_change).toBe(7 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('change_requested', 'emergency_change', base);
    expect(d!.getTime() - base.getTime()).toBe(1 * HOUR * 60_000);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('closed', 'emergency_change', base)).toBeNull();
    expect(slaDeadlineFor('rejected', 'emergency_change', base)).toBeNull();
    expect(slaDeadlineFor('rolled_back', 'emergency_change', base)).toBeNull();
    expect(slaDeadlineFor('cancelled', 'emergency_change', base)).toBeNull();
  });
});

describe('W47 change-enablement chain — reportability', () => {
  const tiers: ChangeTier[] = ['emergency_change', 'normal_change', 'standard_change'];

  it('roll_back crosses for emergency + normal (governed services), not standard', () => {
    expect(crossesIntoRegulator('roll_back', 'emergency_change')).toBe(true);
    expect(crossesIntoRegulator('roll_back', 'normal_change')).toBe(true);
    expect(crossesIntoRegulator('roll_back', 'standard_change')).toBe(false);
  });

  it('emergency_approve crosses for emergency_change only (ECAB governance bypass)', () => {
    expect(crossesIntoRegulator('emergency_approve', 'emergency_change')).toBe(true);
    expect(crossesIntoRegulator('emergency_approve', 'normal_change')).toBe(false);
    expect(crossesIntoRegulator('emergency_approve', 'standard_change')).toBe(false);
  });

  it('close crosses for emergency_change only (post-emergency-change report)', () => {
    expect(crossesIntoRegulator('close', 'emergency_change')).toBe(true);
    expect(crossesIntoRegulator('close', 'normal_change')).toBe(false);
    expect(crossesIntoRegulator('close', 'standard_change')).toBe(false);
  });

  it('routine actions never cross for any tier', () => {
    const routine: ChangeAction[] = [
      'assess', 'submit_to_cab', 'approve', 'reject', 'schedule',
      'begin_implementation', 'complete_implementation', 'initiate_pir', 'cancel',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for emergency_change only', () => {
    expect(slaBreachCrossesIntoRegulator('emergency_change')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('normal_change')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard_change')).toBe(false);
  });

  it('isReportableTier — emergency + normal', () => {
    expect(isReportableTier('emergency_change')).toBe(true);
    expect(isReportableTier('normal_change')).toBe(true);
    expect(isReportableTier('standard_change')).toBe(false);
  });
});

describe('W47 change-enablement chain — ITIL functional party attribution', () => {
  it('change_requester owns intake + assessment + withdrawal', () => {
    expect(partyForAction('assess')).toBe('change_requester');
    expect(partyForAction('submit_to_cab')).toBe('change_requester');
    expect(partyForAction('cancel')).toBe('change_requester');
  });

  it('change_authority owns CAB/ECAB authorisation + PIR + closure', () => {
    expect(partyForAction('approve')).toBe('change_authority');
    expect(partyForAction('reject')).toBe('change_authority');
    expect(partyForAction('emergency_approve')).toBe('change_authority');
    expect(partyForAction('initiate_pir')).toBe('change_authority');
    expect(partyForAction('close')).toBe('change_authority');
  });

  it('implementer owns scheduling + implementation + backout', () => {
    expect(partyForAction('schedule')).toBe('implementer');
    expect(partyForAction('begin_implementation')).toBe('implementer');
    expect(partyForAction('complete_implementation')).toBe('implementer');
    expect(partyForAction('roll_back')).toBe('implementer');
  });
});
