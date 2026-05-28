import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportable, partyForAction,
  type ProblemStatus, type ProblemTier, type ProblemAction,
} from '../src/utils/problem-management-spec';

describe('W41 problem-management chain — state machine', () => {
  it('happy path: logged→categorized→investigating→rca→known_error→fix→change→deployed→verified→closed', () => {
    let s: ProblemStatus = 'problem_logged';
    s = nextStatus(s, 'categorize')!;          expect(s).toBe('categorized');
    s = nextStatus(s, 'begin_investigation')!; expect(s).toBe('investigating');
    s = nextStatus(s, 'identify_rca')!;         expect(s).toBe('rca_identified');
    s = nextStatus(s, 'log_known_error')!;      expect(s).toBe('known_error');
    s = nextStatus(s, 'propose_fix')!;          expect(s).toBe('fix_proposed');
    s = nextStatus(s, 'raise_change')!;         expect(s).toBe('change_raised');
    s = nextStatus(s, 'deploy_fix')!;           expect(s).toBe('fix_deployed');
    s = nextStatus(s, 'verify_resolution')!;    expect(s).toBe('resolution_verified');
    s = nextStatus(s, 'close')!;                expect(s).toBe('closed');
    expect(isTerminal('closed')).toBe(true);
  });

  it('workaround short-circuit: known_error → closed via accept_workaround', () => {
    expect(nextStatus('known_error', 'accept_workaround')).toBe('closed');
  });

  it('escalation branch: escalate reachable from investigating / rca_identified / known_error', () => {
    expect(nextStatus('investigating', 'escalate')).toBe('escalated');
    expect(nextStatus('rca_identified', 'escalate')).toBe('escalated');
    expect(nextStatus('known_error', 'escalate')).toBe('escalated');
    expect(isTerminal('escalated')).toBe(true);
  });

  it('escalate NOT reachable from early or late states', () => {
    expect(nextStatus('problem_logged', 'escalate')).toBeNull();
    expect(nextStatus('categorized', 'escalate')).toBeNull();
    expect(nextStatus('fix_proposed', 'escalate')).toBeNull();
    expect(nextStatus('change_raised', 'escalate')).toBeNull();
    expect(nextStatus('resolution_verified', 'escalate')).toBeNull();
  });

  it('cancel reachable only from early states', () => {
    const froms: ProblemStatus[] = ['problem_logged', 'categorized', 'investigating'];
    for (const f of froms) {
      expect(nextStatus(f, 'cancel')).toBe('cancelled');
    }
    expect(nextStatus('rca_identified', 'cancel')).toBeNull();
    expect(nextStatus('known_error', 'cancel')).toBeNull();
    expect(nextStatus('fix_proposed', 'cancel')).toBeNull();
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('closed')).toEqual([]);
    expect(allowedActions('escalated')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('problem_logged', 'identify_rca')).toBeNull();
    expect(nextStatus('categorized', 'log_known_error')).toBeNull();
    expect(nextStatus('investigating', 'propose_fix')).toBeNull();
    expect(nextStatus('rca_identified', 'accept_workaround')).toBeNull();
    expect(nextStatus('fix_proposed', 'deploy_fix')).toBeNull();
    expect(nextStatus('change_raised', 'verify_resolution')).toBeNull();
    expect(nextStatus('closed', 'close')).toBeNull();
  });

  it('TRANSITIONS dict covers every state', () => {
    const states: ProblemStatus[] = [
      'problem_logged', 'categorized', 'investigating', 'rca_identified',
      'known_error', 'fix_proposed', 'change_raised', 'fix_deployed',
      'resolution_verified', 'closed', 'escalated', 'cancelled',
    ];
    for (const s of states) {
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });

  it('known_error offers propose_fix / accept_workaround / escalate', () => {
    const actions = allowedActions('known_error');
    expect(actions).toContain('propose_fix');
    expect(actions).toContain('accept_workaround');
    expect(actions).toContain('escalate');
  });
});

describe('W41 problem-management chain — URGENT SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');
  const HOUR = 60;
  const DAY = 24 * 60;

  it('major_problem is the tightest window at every active stage', () => {
    const active: ProblemStatus[] = [
      'problem_logged', 'categorized', 'investigating', 'rca_identified',
      'known_error', 'fix_proposed', 'change_raised', 'fix_deployed',
      'resolution_verified',
    ];
    for (const st of active) {
      expect(SLA_MINUTES[st].major_problem).toBeLessThan(SLA_MINUTES[st].significant);
      expect(SLA_MINUTES[st].significant).toBeLessThan(SLA_MINUTES[st].minor);
    }
  });

  it('problem_logged: major 2h, minor 24h', () => {
    expect(SLA_MINUTES.problem_logged.major_problem).toBe(2 * HOUR);
    expect(SLA_MINUTES.problem_logged.minor).toBe(24 * HOUR);
  });

  it('investigating: major 24h, minor 14d', () => {
    expect(SLA_MINUTES.investigating.major_problem).toBe(1 * DAY);
    expect(SLA_MINUTES.investigating.minor).toBe(14 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('problem_logged', 'major_problem', base);
    expect(d!.getTime() - base.getTime()).toBe(2 * HOUR * 60_000);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('closed', 'major_problem', base)).toBeNull();
    expect(slaDeadlineFor('escalated', 'major_problem', base)).toBeNull();
    expect(slaDeadlineFor('cancelled', 'major_problem', base)).toBeNull();
  });
});

describe('W41 problem-management chain — reportability (major problems only)', () => {
  const tiers: ProblemTier[] = ['major_problem', 'significant', 'minor'];

  it('escalate crosses for major_problem only', () => {
    expect(crossesIntoRegulator('escalate', 'major_problem')).toBe(true);
    expect(crossesIntoRegulator('escalate', 'significant')).toBe(false);
    expect(crossesIntoRegulator('escalate', 'minor')).toBe(false);
  });

  it('close crosses for major_problem only', () => {
    expect(crossesIntoRegulator('close', 'major_problem')).toBe(true);
    expect(crossesIntoRegulator('close', 'significant')).toBe(false);
    expect(crossesIntoRegulator('close', 'minor')).toBe(false);
  });

  it('routine actions never cross for any tier', () => {
    const routine: ProblemAction[] = [
      'categorize', 'begin_investigation', 'identify_rca', 'log_known_error',
      'propose_fix', 'accept_workaround', 'raise_change', 'deploy_fix',
      'verify_resolution', 'cancel',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for major_problem only', () => {
    expect(slaBreachCrossesIntoRegulator('major_problem')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('significant')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });

  it('isReportable helper — major problems only', () => {
    expect(isReportable('major_problem')).toBe(true);
    expect(isReportable('significant')).toBe(false);
    expect(isReportable('minor')).toBe(false);
  });
});

describe('W41 problem-management chain — ITIL functional party attribution', () => {
  it('problem_manager owns governance actions', () => {
    expect(partyForAction('categorize')).toBe('problem_manager');
    expect(partyForAction('accept_workaround')).toBe('problem_manager');
    expect(partyForAction('close')).toBe('problem_manager');
    expect(partyForAction('escalate')).toBe('problem_manager');
    expect(partyForAction('cancel')).toBe('problem_manager');
  });

  it('resolver owns investigative + verification actions', () => {
    expect(partyForAction('begin_investigation')).toBe('resolver');
    expect(partyForAction('identify_rca')).toBe('resolver');
    expect(partyForAction('log_known_error')).toBe('resolver');
    expect(partyForAction('propose_fix')).toBe('resolver');
    expect(partyForAction('verify_resolution')).toBe('resolver');
  });

  it('change_mgmt owns the change actions', () => {
    expect(partyForAction('raise_change')).toBe('change_mgmt');
    expect(partyForAction('deploy_fix')).toBe('change_mgmt');
  });
});
