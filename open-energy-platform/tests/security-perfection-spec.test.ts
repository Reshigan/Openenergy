import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, isWithdrawable, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForSecuredValueZar, criticalFloor, tierForSecuredValue,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isHighTier, isReportable, isGrantorAction, partyForAction,
  type PerfectionStatus, type PerfectionTier, type PerfectionAction,
} from '../src/utils/security-perfection-spec';

describe('W69 security / collateral perfection chain — state machine', () => {
  it('happy path: identified→documented→executed→lodged→registered→review→perfected', () => {
    let s: PerfectionStatus = 'identified';
    s = nextStatus(s, 'begin_documentation')!;     expect(s).toBe('documentation_pending');
    s = nextStatus(s, 'execute_security')!;         expect(s).toBe('executed');
    s = nextStatus(s, 'lodge_registration')!;       expect(s).toBe('lodged_for_registration');
    s = nextStatus(s, 'confirm_registration')!;     expect(s).toBe('registered');
    s = nextStatus(s, 'begin_perfection_review')!;  expect(s).toBe('perfection_review');
    s = nextStatus(s, 'confirm_perfection')!;       expect(s).toBe('perfected');
  });

  it('perfected releases on repayment / substitution', () => {
    expect(nextStatus('perfected', 'release_security')).toBe('released');
    expect(isTerminal('released')).toBe(true);
  });

  it('registry rejection sends a lodged deed back to defective, then re-lodge', () => {
    expect(nextStatus('lodged_for_registration', 'reject_registration')).toBe('defective');
    expect(nextStatus('defective', 'lodge_registration')).toBe('lodged_for_registration');
  });

  it('a perfection-review legal opinion can find a defect and bounce back', () => {
    expect(nextStatus('perfection_review', 'reject_registration')).toBe('defective');
  });

  it('overdue reachable from the pre-perfection working states; cures back to lodged', () => {
    expect(nextStatus('documentation_pending', 'flag_overdue')).toBe('perfection_overdue');
    expect(nextStatus('executed', 'flag_overdue')).toBe('perfection_overdue');
    expect(nextStatus('lodged_for_registration', 'flag_overdue')).toBe('perfection_overdue');
    expect(nextStatus('defective', 'flag_overdue')).toBe('perfection_overdue');
    expect(nextStatus('perfection_overdue', 'cure_overdue')).toBe('lodged_for_registration');
  });

  it('lapse reachable only from overdue or defective', () => {
    expect(nextStatus('perfection_overdue', 'mark_lapsed')).toBe('lapsed');
    expect(nextStatus('defective', 'mark_lapsed')).toBe('lapsed');
    expect(nextStatus('registered', 'mark_lapsed')).toBeNull();
    expect(nextStatus('perfected', 'mark_lapsed')).toBeNull();
    expect(isTerminal('lapsed')).toBe(true);
  });

  it('withdraw reachable only from the three early states', () => {
    expect(nextStatus('identified', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('documentation_pending', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('executed', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('lodged_for_registration', 'withdraw')).toBeNull();
    expect(nextStatus('perfected', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('isWithdrawable matches the early-state set', () => {
    expect(isWithdrawable('identified')).toBe(true);
    expect(isWithdrawable('documentation_pending')).toBe(true);
    expect(isWithdrawable('executed')).toBe(true);
    expect(isWithdrawable('lodged_for_registration')).toBe(false);
    expect(isWithdrawable('perfected')).toBe(false);
  });

  it('all three terminals accept no further transitions', () => {
    expect(allowedActions('released')).toEqual([]);
    expect(allowedActions('lapsed')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('lodged_for_registration fans out to register / reject / overdue', () => {
    const acts = allowedActions('lodged_for_registration');
    expect(acts).toContain('confirm_registration');
    expect(acts).toContain('reject_registration');
    expect(acts).toContain('flag_overdue');
  });

  it('rejects illegal skips', () => {
    expect(nextStatus('identified', 'execute_security')).toBeNull();
    expect(nextStatus('documentation_pending', 'lodge_registration')).toBeNull();
    expect(nextStatus('executed', 'confirm_registration')).toBeNull();
    expect(nextStatus('registered', 'confirm_perfection')).toBeNull();
    expect(nextStatus('released', 'release_security')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions: PerfectionAction[] = [
      'begin_documentation', 'execute_security', 'lodge_registration', 'confirm_registration',
      'reject_registration', 'begin_perfection_review', 'confirm_perfection', 'flag_overdue',
      'cure_overdue', 'release_security', 'mark_lapsed', 'withdraw',
    ];
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });
});

describe('W69 security perfection chain — URGENT SLA matrix', () => {
  const base = new Date('2026-02-01T08:00:00Z');
  const HOUR = 60;
  const DAY = 24 * HOUR;

  it('critical is the TIGHTEST window at every graded stage; minor the longest', () => {
    const graded: PerfectionStatus[] = [
      'identified', 'documentation_pending', 'executed', 'lodged_for_registration',
      'registered', 'perfection_review', 'defective', 'perfection_overdue',
    ];
    for (const st of graded) {
      expect(SLA_MINUTES[st].critical).toBeLessThan(SLA_MINUTES[st].major);
      expect(SLA_MINUTES[st].major).toBeLessThan(SLA_MINUTES[st].material);
      expect(SLA_MINUTES[st].material).toBeLessThan(SLA_MINUTES[st].moderate);
      expect(SLA_MINUTES[st].moderate).toBeLessThan(SLA_MINUTES[st].minor);
    }
  });

  it('perfection_overdue is the tightest grace: minor 7d, critical 8h', () => {
    expect(SLA_MINUTES.perfection_overdue.minor).toBe(7 * DAY);
    expect(SLA_MINUTES.perfection_overdue.critical).toBe(8 * HOUR);
  });

  it('registered review window: minor 14d, critical 24h', () => {
    expect(SLA_MINUTES.registered.minor).toBe(14 * DAY);
    expect(SLA_MINUTES.registered.critical).toBe(24 * HOUR);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('perfection_overdue', 'minor', base);
    expect(d!.getTime() - base.getTime()).toBe(7 * DAY * 60_000);
  });

  it('slaWindowMinutes returns matrix value; 0 for perfected + terminals', () => {
    expect(slaWindowMinutes('executed', 'minor')).toBe(21 * DAY);
    expect(slaWindowMinutes('perfected', 'critical')).toBe(0);
    expect(slaWindowMinutes('released', 'critical')).toBe(0);
  });

  it('perfected + all three terminals return null deadline', () => {
    expect(slaDeadlineFor('perfected', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('released', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('lapsed', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'critical', base)).toBeNull();
  });
});

describe('W69 security perfection chain — secured-value tiering', () => {
  it('tierForSecuredValueZar boundaries', () => {
    expect(tierForSecuredValueZar(5000000)).toBe('minor');
    expect(tierForSecuredValueZar(9999999)).toBe('minor');
    expect(tierForSecuredValueZar(10000000)).toBe('moderate');
    expect(tierForSecuredValueZar(99999999)).toBe('moderate');
    expect(tierForSecuredValueZar(100000000)).toBe('material');
    expect(tierForSecuredValueZar(499999999)).toBe('material');
    expect(tierForSecuredValueZar(500000000)).toBe('major');
    expect(tierForSecuredValueZar(1999999999)).toBe('major');
    expect(tierForSecuredValueZar(2000000000)).toBe('critical');
    expect(tierForSecuredValueZar(9000000000)).toBe('critical');
  });

  it('criticalFloor lifts a CP-to-drawdown item to at least major', () => {
    expect(criticalFloor(true)).toBe('major');
    expect(criticalFloor(false)).toBe('minor');
  });

  it('tierForSecuredValue takes the higher of value-tier and CP floor', () => {
    // small value, CP-to-drawdown item → floored to major
    expect(tierForSecuredValue(5000000, true)).toBe('major');
    // small value, ordinary item → stays minor
    expect(tierForSecuredValue(5000000, false)).toBe('minor');
    // huge value beats the floor → critical
    expect(tierForSecuredValue(3000000000, true)).toBe('critical');
    // mid value, ordinary → material
    expect(tierForSecuredValue(200000000, false)).toBe('material');
  });

  it('isHighTier — major + critical only', () => {
    expect(isHighTier('critical')).toBe(true);
    expect(isHighTier('major')).toBe(true);
    expect(isHighTier('material')).toBe(false);
    expect(isHighTier('moderate')).toBe(false);
    expect(isHighTier('minor')).toBe(false);
  });

  it('isReportable — major + critical only', () => {
    expect(isReportable('critical')).toBe(true);
    expect(isReportable('major')).toBe(true);
    expect(isReportable('material')).toBe(false);
    expect(isReportable('minor')).toBe(false);
  });
});

describe('W69 security perfection chain — reportability (the signature)', () => {
  const tiers: PerfectionTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];

  it('mark_lapsed crosses for EVERY tier (the signature — a lapse is always notifiable)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('mark_lapsed', t)).toBe(true);
    }
  });

  it('flag_overdue crosses for the high tiers only (major + critical)', () => {
    expect(crossesIntoRegulator('flag_overdue', 'critical')).toBe(true);
    expect(crossesIntoRegulator('flag_overdue', 'major')).toBe(true);
    expect(crossesIntoRegulator('flag_overdue', 'material')).toBe(false);
    expect(crossesIntoRegulator('flag_overdue', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('flag_overdue', 'minor')).toBe(false);
  });

  it('reject_registration crosses for the critical tier only', () => {
    expect(crossesIntoRegulator('reject_registration', 'critical')).toBe(true);
    expect(crossesIntoRegulator('reject_registration', 'major')).toBe(false);
    expect(crossesIntoRegulator('reject_registration', 'material')).toBe(false);
    expect(crossesIntoRegulator('reject_registration', 'minor')).toBe(false);
  });

  it('routine workflow actions never cross for any tier', () => {
    const routine: PerfectionAction[] = [
      'begin_documentation', 'execute_security', 'lodge_registration', 'confirm_registration',
      'begin_perfection_review', 'confirm_perfection', 'cure_overdue', 'release_security', 'withdraw',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for the high tiers only (major + critical)', () => {
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });
});

describe('W69 security perfection chain — party attribution (two-party write)', () => {
  it('the security agent drives every step except the grantor executing the deed', () => {
    expect(partyForAction('begin_documentation')).toBe('security_agent');
    expect(partyForAction('lodge_registration')).toBe('security_agent');
    expect(partyForAction('confirm_registration')).toBe('security_agent');
    expect(partyForAction('reject_registration')).toBe('security_agent');
    expect(partyForAction('begin_perfection_review')).toBe('security_agent');
    expect(partyForAction('confirm_perfection')).toBe('security_agent');
    expect(partyForAction('flag_overdue')).toBe('security_agent');
    expect(partyForAction('cure_overdue')).toBe('security_agent');
    expect(partyForAction('release_security')).toBe('security_agent');
    expect(partyForAction('mark_lapsed')).toBe('security_agent');
    expect(partyForAction('withdraw')).toBe('security_agent');
  });

  it('execute_security is attributed to the grantor', () => {
    expect(partyForAction('execute_security')).toBe('grantor');
    expect(isGrantorAction('execute_security')).toBe(true);
    expect(isGrantorAction('lodge_registration')).toBe(false);
  });
});
