import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportableTier, isEnforcementAction, partyForAction, isBorrowerAction,
  type LoanDefaultStatus, type LoanDefaultTier,
} from '../src/utils/loan-default-spec';

describe('W45 loan-default chain — state machine', () => {
  it('happy path: flagged→review→ROR→notice→cure→cured', () => {
    let s: LoanDefaultStatus = 'default_flagged';
    s = nextStatus(s, 'begin_review')!;         expect(s).toBe('under_review');
    s = nextStatus(s, 'reserve_rights')!;        expect(s).toBe('reservation_of_rights');
    s = nextStatus(s, 'issue_default_notice')!;  expect(s).toBe('default_notice_issued');
    s = nextStatus(s, 'open_cure_period')!;      expect(s).toBe('cure_period');
    s = nextStatus(s, 'confirm_cure')!;          expect(s).toBe('cured');
    expect(isTerminal('cured')).toBe(true);
  });

  it('default notice can be issued straight from under_review (skipping ROR)', () => {
    expect(nextStatus('under_review', 'issue_default_notice')).toBe('default_notice_issued');
  });

  it('dismiss (false alarm) reachable from default_flagged and under_review → cured', () => {
    expect(nextStatus('default_flagged', 'dismiss')).toBe('cured');
    expect(nextStatus('under_review', 'dismiss')).toBe('cured');
  });

  it('acceleration reachable from notice, cure_period, and reservation_of_rights', () => {
    expect(nextStatus('default_notice_issued', 'accelerate')).toBe('accelerated');
    expect(nextStatus('cure_period', 'accelerate')).toBe('accelerated');
    expect(nextStatus('reservation_of_rights', 'accelerate')).toBe('accelerated');
    expect(isTerminal('accelerated')).toBe(false);
  });

  it('standstill reachable from accelerated and default_notice_issued', () => {
    expect(nextStatus('accelerated', 'agree_standstill')).toBe('standstill');
    expect(nextStatus('default_notice_issued', 'agree_standstill')).toBe('standstill');
  });

  it('enforcement branch: accelerated→enforcement_commenced→enforced_closed', () => {
    let s: LoanDefaultStatus = 'accelerated';
    s = nextStatus(s, 'commence_enforcement')!; expect(s).toBe('enforcement_commenced');
    s = nextStatus(s, 'close_enforcement')!;    expect(s).toBe('enforced_closed');
    expect(isTerminal('enforced_closed')).toBe(true);
  });

  it('enforcement also reachable via standstill', () => {
    expect(nextStatus('standstill', 'commence_enforcement')).toBe('enforcement_commenced');
  });

  it('restructure reachable from standstill and enforcement_commenced', () => {
    expect(nextStatus('standstill', 'agree_restructure')).toBe('restructured');
    expect(nextStatus('enforcement_commenced', 'agree_restructure')).toBe('restructured');
    expect(isTerminal('restructured')).toBe(true);
  });

  it('write_off reachable from accelerated and enforcement_commenced', () => {
    expect(nextStatus('accelerated', 'write_off')).toBe('written_off');
    expect(nextStatus('enforcement_commenced', 'write_off')).toBe('written_off');
    expect(isTerminal('written_off')).toBe(true);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('cured')).toEqual([]);
    expect(allowedActions('restructured')).toEqual([]);
    expect(allowedActions('enforced_closed')).toEqual([]);
    expect(allowedActions('written_off')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('default_flagged', 'accelerate')).toBeNull();
    expect(nextStatus('default_flagged', 'issue_default_notice')).toBeNull();
    expect(nextStatus('under_review', 'open_cure_period')).toBeNull();
    expect(nextStatus('cure_period', 'commence_enforcement')).toBeNull();
    expect(nextStatus('reservation_of_rights', 'confirm_cure')).toBeNull();
    expect(nextStatus('cured', 'accelerate')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions = [
      'begin_review', 'reserve_rights', 'issue_default_notice', 'open_cure_period',
      'confirm_cure', 'dismiss', 'accelerate', 'agree_standstill',
      'commence_enforcement', 'agree_restructure', 'close_enforcement', 'write_off',
    ] as const;
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });

  it('every non-terminal state is reachable as a transition target (except entry)', () => {
    const targets = new Set(Object.values(TRANSITIONS).map((t) => t.to));
    for (const s of [
      'under_review', 'reservation_of_rights', 'default_notice_issued', 'cure_period',
      'accelerated', 'standstill', 'enforcement_commenced',
    ] as LoanDefaultStatus[]) {
      expect(targets.has(s)).toBe(true);
    }
  });

  it('allowedActions for accelerated offers standstill / enforcement / restructure-less / write_off', () => {
    const actions = allowedActions('accelerated');
    expect(actions).toContain('agree_standstill');
    expect(actions).toContain('commence_enforcement');
    expect(actions).toContain('write_off');
  });
});

describe('W45 loan-default chain — URGENT SLA matrix', () => {
  const base = new Date('2026-02-10T09:00:00Z');
  const DAY = 24 * 60;

  it('senior secured is tightest across every active state', () => {
    const states: LoanDefaultStatus[] = [
      'default_flagged', 'under_review', 'reservation_of_rights',
      'default_notice_issued', 'cure_period', 'accelerated', 'standstill',
      'enforcement_commenced',
    ];
    for (const st of states) {
      expect(SLA_MINUTES[st].senior_secured).toBeLessThan(SLA_MINUTES[st].mezzanine);
      expect(SLA_MINUTES[st].mezzanine).toBeLessThan(SLA_MINUTES[st].subordinated);
    }
  });

  it('cure window: senior 30d, sub 60d', () => {
    expect(SLA_MINUTES.cure_period.senior_secured).toBe(30 * DAY);
    expect(SLA_MINUTES.cure_period.subordinated).toBe(60 * DAY);
  });

  it('enforcement realisation window: senior 90d, sub 180d', () => {
    expect(SLA_MINUTES.enforcement_commenced.senior_secured).toBe(90 * DAY);
    expect(SLA_MINUTES.enforcement_commenced.subordinated).toBe(180 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('accelerated', 'senior_secured', base);
    expect(d!.getTime() - base.getTime()).toBe(10 * DAY * 60_000);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('cured', 'senior_secured', base)).toBeNull();
    expect(slaDeadlineFor('restructured', 'senior_secured', base)).toBeNull();
    expect(slaDeadlineFor('enforced_closed', 'senior_secured', base)).toBeNull();
    expect(slaDeadlineFor('written_off', 'senior_secured', base)).toBeNull();
  });
});

describe('W45 loan-default chain — reportability / regulator crossings', () => {
  const tiers: LoanDefaultTier[] = ['senior_secured', 'mezzanine', 'subordinated'];

  it('write_off (loss crystallised) crosses for EVERY tier', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('write_off', t)).toBe(true);
    }
  });

  it('accelerate + commence_enforcement cross for senior + mezzanine only', () => {
    expect(crossesIntoRegulator('accelerate', 'senior_secured')).toBe(true);
    expect(crossesIntoRegulator('accelerate', 'mezzanine')).toBe(true);
    expect(crossesIntoRegulator('accelerate', 'subordinated')).toBe(false);
    expect(crossesIntoRegulator('commence_enforcement', 'senior_secured')).toBe(true);
    expect(crossesIntoRegulator('commence_enforcement', 'mezzanine')).toBe(true);
    expect(crossesIntoRegulator('commence_enforcement', 'subordinated')).toBe(false);
  });

  it('routine workout actions never cross for any tier', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('begin_review', t)).toBe(false);
      expect(crossesIntoRegulator('reserve_rights', t)).toBe(false);
      expect(crossesIntoRegulator('issue_default_notice', t)).toBe(false);
      expect(crossesIntoRegulator('open_cure_period', t)).toBe(false);
      expect(crossesIntoRegulator('confirm_cure', t)).toBe(false);
      expect(crossesIntoRegulator('dismiss', t)).toBe(false);
      expect(crossesIntoRegulator('agree_standstill', t)).toBe(false);
      expect(crossesIntoRegulator('agree_restructure', t)).toBe(false);
      expect(crossesIntoRegulator('close_enforcement', t)).toBe(false);
    }
  });

  it('sla_breach crosses senior + mezzanine only', () => {
    expect(slaBreachCrossesIntoRegulator('senior_secured')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('mezzanine')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('subordinated')).toBe(false);
  });

  it('isReportableTier + isEnforcementAction helpers', () => {
    expect(isReportableTier('senior_secured')).toBe(true);
    expect(isReportableTier('subordinated')).toBe(false);
    expect(isEnforcementAction('accelerate')).toBe(true);
    expect(isEnforcementAction('commence_enforcement')).toBe(true);
    expect(isEnforcementAction('write_off')).toBe(true);
    expect(isEnforcementAction('begin_review')).toBe(false);
  });
});

describe('W45 loan-default chain — party attribution + borrower split', () => {
  it('borrower effects the cure', () => {
    expect(partyForAction('confirm_cure')).toBe('borrower');
  });

  it('lender drives review / notice / acceleration / standstill / restructure / write-off', () => {
    expect(partyForAction('begin_review')).toBe('lender');
    expect(partyForAction('reserve_rights')).toBe('lender');
    expect(partyForAction('issue_default_notice')).toBe('lender');
    expect(partyForAction('open_cure_period')).toBe('lender');
    expect(partyForAction('dismiss')).toBe('lender');
    expect(partyForAction('accelerate')).toBe('lender');
    expect(partyForAction('agree_standstill')).toBe('lender');
    expect(partyForAction('agree_restructure')).toBe('lender');
    expect(partyForAction('write_off')).toBe('lender');
  });

  it('security agent commences + closes enforcement', () => {
    expect(partyForAction('commence_enforcement')).toBe('security_agent');
    expect(partyForAction('close_enforcement')).toBe('security_agent');
  });

  it('borrower-write set is exactly confirm_cure', () => {
    expect(isBorrowerAction('confirm_cure')).toBe(true);
    expect(isBorrowerAction('begin_review')).toBe(false);
    expect(isBorrowerAction('accelerate')).toBe(false);
    expect(isBorrowerAction('write_off')).toBe(false);
  });
});
