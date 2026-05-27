import { describe, it, expect } from 'vitest';
import {
  ALL_STATES,
  SLA_MINUTES,
  TERMINAL_STATES,
  TRANSITIONS,
  advance,
  crossesIntoRegulator,
  isSeverity,
  isStatus,
  isTerminal,
  nextState,
  severityFromMw,
  slaBreachCrossesIntoRegulator,
  slaDueAt,
  OutageStatus,
} from '../src/utils/planned-outage-chain-spec';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('planned-outage-chain-spec — type guards', () => {
  it('isStatus accepts every defined state', () => {
    for (const s of ALL_STATES) expect(isStatus(s)).toBe(true);
  });
  it('isStatus rejects unknown', () => {
    expect(isStatus('exploded')).toBe(false);
  });
  it('isSeverity accepts critical/high/medium/low', () => {
    expect(isSeverity('critical')).toBe(true);
    expect(isSeverity('high')).toBe(true);
    expect(isSeverity('medium')).toBe(true);
    expect(isSeverity('low')).toBe(true);
    expect(isSeverity('catastrophic')).toBe(false);
  });
});

describe('planned-outage-chain-spec — terminal detection', () => {
  it('rejected / closed / cancelled are terminal', () => {
    for (const s of TERMINAL_STATES) expect(isTerminal(s)).toBe(true);
  });
  it('every other state is non-terminal', () => {
    for (const s of ALL_STATES) {
      if (TERMINAL_STATES.includes(s)) continue;
      expect(isTerminal(s)).toBe(false);
    }
  });
});

describe('planned-outage-chain-spec — transition graph', () => {
  it('happy path runs end-to-end', () => {
    let s: OutageStatus = 'draft';
    s = advance(s, 'submit');         expect(s).toBe('submitted');
    s = advance(s, 'begin_review');   expect(s).toBe('under_review');
    s = advance(s, 'approve');        expect(s).toBe('approved');
    s = advance(s, 'notify');         expect(s).toBe('notified');
    s = advance(s, 'commence');       expect(s).toBe('in_progress');
    s = advance(s, 'begin_restore');  expect(s).toBe('restoring');
    s = advance(s, 'mark_restored');  expect(s).toBe('restored');
    s = advance(s, 'close');          expect(s).toBe('closed');
  });

  it('reject is only reachable from under_review', () => {
    expect(nextState('under_review', 'reject')).toBe('rejected');
    expect(nextState('submitted', 'reject')).toBeNull();
    expect(nextState('approved',  'reject')).toBeNull();
    expect(nextState('notified',  'reject')).toBeNull();
  });

  it('reschedule loops under_review/approved back into submitted', () => {
    expect(nextState('under_review', 'reschedule')).toBe('rescheduled');
    expect(nextState('approved',     'reschedule')).toBe('rescheduled');
    expect(nextState('rescheduled',  'submit')).toBe('submitted');
  });

  it('cancel reachable from every pre-restoring non-terminal', () => {
    for (const s of ['draft', 'submitted', 'under_review', 'approved', 'rescheduled', 'notified'] as OutageStatus[]) {
      expect(nextState(s, 'cancel')).toBe('cancelled');
    }
  });

  it('cancel is NOT reachable from in_progress or later (operator commit point)', () => {
    for (const s of ['in_progress', 'restoring', 'restored'] as OutageStatus[]) {
      expect(nextState(s, 'cancel')).toBeNull();
    }
  });

  it('terminals have no outgoing transitions', () => {
    for (const s of TERMINAL_STATES) {
      expect(Object.keys(TRANSITIONS[s]).length).toBe(0);
    }
  });

  it('advance() throws on invalid action', () => {
    expect(() => advance('closed', 'close')).toThrow();
    expect(() => advance('draft', 'approve')).toThrow();
  });

  it('cannot skip stages', () => {
    expect(nextState('submitted',   'approve')).toBeNull();
    expect(nextState('approved',    'commence')).toBeNull();
    expect(nextState('in_progress', 'mark_restored')).toBeNull();
  });
});

describe('planned-outage-chain-spec — SLA computation', () => {
  it('critical/submitted = 1h', () => {
    expect(slaDueAt('submitted', 'critical', NOW)).toBe('2026-06-01T13:00:00.000Z');
  });
  it('low/under_review = 168h (7d)', () => {
    expect(slaDueAt('under_review', 'low', NOW)).toBe('2026-06-08T12:00:00.000Z');
  });
  it('terminals return empty deadline', () => {
    for (const s of TERMINAL_STATES) {
      expect(slaDueAt(s, 'critical', NOW)).toBe('');
    }
  });
  it('critical stricter than high stricter than medium stricter than low at every stage', () => {
    for (const s of ALL_STATES) {
      if (isTerminal(s)) continue;
      expect(SLA_MINUTES[s].critical).toBeLessThanOrEqual(SLA_MINUTES[s].high);
      expect(SLA_MINUTES[s].high).toBeLessThanOrEqual(SLA_MINUTES[s].medium);
      expect(SLA_MINUTES[s].medium).toBeLessThanOrEqual(SLA_MINUTES[s].low);
    }
  });
});

describe('planned-outage-chain-spec — severity from MW', () => {
  it('600 MW = critical', () => expect(severityFromMw(600)).toBe('critical'));
  it('100 MW = high',     () => expect(severityFromMw(100)).toBe('high'));
  it('10 MW = medium',    () => expect(severityFromMw(10)).toBe('medium'));
  it('0.5 MW = low',      () => expect(severityFromMw(0.5)).toBe('low'));
  it('boundary 500 MW = critical', () => expect(severityFromMw(500)).toBe('critical'));
  it('boundary 50 MW = high',      () => expect(severityFromMw(50)).toBe('high'));
});

describe('planned-outage-chain-spec — regulator crossings', () => {
  it('commence crosses for critical and high', () => {
    expect(crossesIntoRegulator('commence', 'critical')).toBe(true);
    expect(crossesIntoRegulator('commence', 'high')).toBe(true);
    expect(crossesIntoRegulator('commence', 'medium')).toBe(false);
    expect(crossesIntoRegulator('commence', 'low')).toBe(false);
  });
  it('approve / reject / notify do NOT cross on action', () => {
    for (const a of ['approve', 'reject', 'notify', 'reschedule', 'close', 'cancel'] as const) {
      for (const sv of ['critical', 'high', 'medium', 'low'] as const) {
        expect(crossesIntoRegulator(a, sv)).toBe(false);
      }
    }
  });
  it('SLA breach crosses for critical + high; medium + low do not', () => {
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('high')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('low')).toBe(false);
  });
});
