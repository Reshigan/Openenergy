import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, isWithdrawable, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForAffectedParties,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isLargeTier, partyForAction,
  type ComplaintStatus, type ComplaintTier, type ComplaintAction,
} from '../src/utils/complaint-resolution-spec';

describe('W66 regulator complaints & dispute-resolution chain — state machine', () => {
  it('happy path: lodged→admissibility→referred→investigation→mediation→hearing→ruling→monitoring→resolved', () => {
    let s: ComplaintStatus = 'complaint_lodged';
    s = nextStatus(s, 'screen_admissibility')!;   expect(s).toBe('admissibility_review');
    s = nextStatus(s, 'refer_to_licensee')!;       expect(s).toBe('referred_to_licensee');
    s = nextStatus(s, 'escalate_investigation')!;  expect(s).toBe('under_investigation');
    s = nextStatus(s, 'initiate_mediation')!;      expect(s).toBe('mediation');
    s = nextStatus(s, 'convene_hearing')!;         expect(s).toBe('adjudication_hearing');
    s = nextStatus(s, 'issue_ruling')!;            expect(s).toBe('ruling_issued');
    s = nextStatus(s, 'monitor_remedy')!;          expect(s).toBe('remedy_monitoring');
    s = nextStatus(s, 'confirm_compliance')!;      expect(s).toBe('resolved');
    expect(isTerminal('resolved')).toBe(true);
  });

  it('first-level resolution: referred_to_licensee→resolved (settle_at_licensee)', () => {
    expect(nextStatus('referred_to_licensee', 'settle_at_licensee')).toBe('resolved');
  });

  it('mediation short-circuit: under_investigation→adjudication_hearing without mediating', () => {
    expect(nextStatus('under_investigation', 'convene_hearing')).toBe('adjudication_hearing');
    expect(nextStatus('mediation', 'convene_hearing')).toBe('adjudication_hearing');
  });

  it('dismiss reachable from admissibility, investigation and hearing', () => {
    expect(nextStatus('admissibility_review', 'dismiss')).toBe('dismissed');
    expect(nextStatus('under_investigation', 'dismiss')).toBe('dismissed');
    expect(nextStatus('adjudication_hearing', 'dismiss')).toBe('dismissed');
    expect(nextStatus('referred_to_licensee', 'dismiss')).toBeNull();
    expect(isTerminal('dismissed')).toBe(true);
  });

  it('appeal branch: ruling_issued|remedy_monitoring→appealed', () => {
    expect(nextStatus('ruling_issued', 'lodge_appeal')).toBe('appealed');
    expect(nextStatus('remedy_monitoring', 'lodge_appeal')).toBe('appealed');
    expect(nextStatus('resolved', 'lodge_appeal')).toBeNull();
    expect(isTerminal('appealed')).toBe(true);
  });

  it('withdraw reachable only from pre-adjudication states', () => {
    expect(nextStatus('complaint_lodged', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('admissibility_review', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('referred_to_licensee', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('under_investigation', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('mediation', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('adjudication_hearing', 'withdraw')).toBeNull();
    expect(nextStatus('ruling_issued', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('isWithdrawable matches the pre-adjudication set', () => {
    expect(isWithdrawable('complaint_lodged')).toBe(true);
    expect(isWithdrawable('admissibility_review')).toBe(true);
    expect(isWithdrawable('referred_to_licensee')).toBe(true);
    expect(isWithdrawable('under_investigation')).toBe(true);
    expect(isWithdrawable('mediation')).toBe(true);
    expect(isWithdrawable('adjudication_hearing')).toBe(false);
    expect(isWithdrawable('ruling_issued')).toBe(false);
    expect(isWithdrawable('resolved')).toBe(false);
  });

  it('all four terminals accept no further transitions', () => {
    expect(allowedActions('resolved')).toEqual([]);
    expect(allowedActions('dismissed')).toEqual([]);
    expect(allowedActions('appealed')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('referred_to_licensee fans out to settle / escalate / withdraw', () => {
    const acts = allowedActions('referred_to_licensee');
    expect(acts).toContain('settle_at_licensee');
    expect(acts).toContain('escalate_investigation');
    expect(acts).toContain('withdraw');
    expect(acts).not.toContain('initiate_mediation');
  });

  it('under_investigation fans out to mediation / hearing / dismiss / withdraw', () => {
    const acts = allowedActions('under_investigation');
    expect(acts).toContain('initiate_mediation');
    expect(acts).toContain('convene_hearing');
    expect(acts).toContain('dismiss');
    expect(acts).toContain('withdraw');
  });

  it('rejects illegal skips', () => {
    expect(nextStatus('complaint_lodged', 'refer_to_licensee')).toBeNull();
    expect(nextStatus('admissibility_review', 'escalate_investigation')).toBeNull();
    expect(nextStatus('referred_to_licensee', 'initiate_mediation')).toBeNull();
    expect(nextStatus('mediation', 'issue_ruling')).toBeNull();
    expect(nextStatus('ruling_issued', 'confirm_compliance')).toBeNull();
    expect(nextStatus('resolved', 'confirm_compliance')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions: ComplaintAction[] = [
      'screen_admissibility', 'refer_to_licensee', 'settle_at_licensee', 'escalate_investigation',
      'initiate_mediation', 'convene_hearing', 'issue_ruling', 'monitor_remedy',
      'confirm_compliance', 'dismiss', 'lodge_appeal', 'withdraw',
    ];
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });
});

describe('W66 regulator complaints chain — URGENT SLA matrix', () => {
  const base = new Date('2026-02-01T08:00:00Z');
  const DAY = 24 * 60;

  it('systemic is the TIGHTEST window at every active stage; minor the longest', () => {
    const active: ComplaintStatus[] = [
      'complaint_lodged', 'admissibility_review', 'referred_to_licensee', 'under_investigation',
      'mediation', 'adjudication_hearing', 'ruling_issued', 'remedy_monitoring',
    ];
    for (const st of active) {
      expect(SLA_MINUTES[st].systemic).toBeLessThan(SLA_MINUTES[st].major);
      expect(SLA_MINUTES[st].major).toBeLessThan(SLA_MINUTES[st].significant);
      expect(SLA_MINUTES[st].significant).toBeLessThan(SLA_MINUTES[st].moderate);
      expect(SLA_MINUTES[st].moderate).toBeLessThan(SLA_MINUTES[st].minor);
    }
  });

  it('referred_to_licensee: minor 30d, systemic 7d', () => {
    expect(SLA_MINUTES.referred_to_licensee.minor).toBe(30 * DAY);
    expect(SLA_MINUTES.referred_to_licensee.systemic).toBe(7 * DAY);
  });

  it('complaint_lodged: minor 5d, systemic 1d', () => {
    expect(SLA_MINUTES.complaint_lodged.minor).toBe(5 * DAY);
    expect(SLA_MINUTES.complaint_lodged.systemic).toBe(1 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('referred_to_licensee', 'minor', base);
    expect(d!.getTime() - base.getTime()).toBe(30 * DAY * 60_000);
  });

  it('slaWindowMinutes returns matrix value; 0 for terminals', () => {
    expect(slaWindowMinutes('under_investigation', 'minor')).toBe(30 * DAY);
    expect(slaWindowMinutes('resolved', 'systemic')).toBe(0);
  });

  it('all four terminals return null deadline', () => {
    expect(slaDeadlineFor('resolved', 'systemic', base)).toBeNull();
    expect(slaDeadlineFor('dismissed', 'systemic', base)).toBeNull();
    expect(slaDeadlineFor('appealed', 'systemic', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'systemic', base)).toBeNull();
  });
});

describe('W66 regulator complaints chain — affected-party tiering', () => {
  it('tierForAffectedParties boundaries', () => {
    expect(tierForAffectedParties(0)).toBe('minor');
    expect(tierForAffectedParties(9)).toBe('minor');
    expect(tierForAffectedParties(10)).toBe('moderate');
    expect(tierForAffectedParties(99)).toBe('moderate');
    expect(tierForAffectedParties(100)).toBe('significant');
    expect(tierForAffectedParties(999)).toBe('significant');
    expect(tierForAffectedParties(1000)).toBe('major');
    expect(tierForAffectedParties(9999)).toBe('major');
    expect(tierForAffectedParties(10000)).toBe('systemic');
    expect(tierForAffectedParties(250000)).toBe('systemic');
  });

  it('isLargeTier — major + systemic only', () => {
    expect(isLargeTier('systemic')).toBe(true);
    expect(isLargeTier('major')).toBe(true);
    expect(isLargeTier('significant')).toBe(false);
    expect(isLargeTier('moderate')).toBe(false);
    expect(isLargeTier('minor')).toBe(false);
  });
});

describe('W66 regulator complaints chain — reportability (the signature)', () => {
  const tiers: ComplaintTier[] = ['minor', 'moderate', 'significant', 'major', 'systemic'];

  it('lodge_appeal crosses for EVERY tier (the signature — judicial review is always material)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('lodge_appeal', t)).toBe(true);
    }
  });

  it('issue_ruling crosses for the large tiers only (major + systemic)', () => {
    expect(crossesIntoRegulator('issue_ruling', 'systemic')).toBe(true);
    expect(crossesIntoRegulator('issue_ruling', 'major')).toBe(true);
    expect(crossesIntoRegulator('issue_ruling', 'significant')).toBe(false);
    expect(crossesIntoRegulator('issue_ruling', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('issue_ruling', 'minor')).toBe(false);
  });

  it('dismiss crosses for the systemic tier only', () => {
    expect(crossesIntoRegulator('dismiss', 'systemic')).toBe(true);
    expect(crossesIntoRegulator('dismiss', 'major')).toBe(false);
    expect(crossesIntoRegulator('dismiss', 'significant')).toBe(false);
    expect(crossesIntoRegulator('dismiss', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('dismiss', 'minor')).toBe(false);
  });

  it('routine workflow actions never cross for any tier', () => {
    const routine: ComplaintAction[] = [
      'screen_admissibility', 'refer_to_licensee', 'settle_at_licensee', 'escalate_investigation',
      'initiate_mediation', 'convene_hearing', 'monitor_remedy', 'confirm_compliance', 'withdraw',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for the large tiers only (major + systemic)', () => {
    expect(slaBreachCrossesIntoRegulator('systemic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('significant')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });
});

describe('W66 regulator complaints chain — party attribution', () => {
  it('adjudicator (NERSA) drives screening / investigation / mediation / hearing / ruling / monitoring / dismissal', () => {
    expect(partyForAction('screen_admissibility')).toBe('adjudicator');
    expect(partyForAction('refer_to_licensee')).toBe('adjudicator');
    expect(partyForAction('escalate_investigation')).toBe('adjudicator');
    expect(partyForAction('initiate_mediation')).toBe('adjudicator');
    expect(partyForAction('convene_hearing')).toBe('adjudicator');
    expect(partyForAction('issue_ruling')).toBe('adjudicator');
    expect(partyForAction('monitor_remedy')).toBe('adjudicator');
    expect(partyForAction('confirm_compliance')).toBe('adjudicator');
    expect(partyForAction('dismiss')).toBe('adjudicator');
  });

  it('respondent licensee owns the first-level settlement', () => {
    expect(partyForAction('settle_at_licensee')).toBe('respondent');
  });

  it('complainant owns appeal and withdrawal', () => {
    expect(partyForAction('lodge_appeal')).toBe('complainant');
    expect(partyForAction('withdraw')).toBe('complainant');
  });
});
