import { describe, it, expect } from 'vitest';
import {
  ALL_STATES,
  SLA_MINUTES,
  TERMINAL_STATES,
  TRANSITIONS,
  advance,
  crossesIntoRegulator,
  isScope,
  isStatus,
  isTerminal,
  nextState,
  slaBreachCrossesIntoRegulator,
  slaDueAt,
  RetirementStatus,
} from '../src/utils/retirement-chain-spec';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('retirement-chain-spec — type guards', () => {
  it('isStatus accepts all valid states', () => {
    for (const s of ALL_STATES) expect(isStatus(s)).toBe(true);
  });
  it('isStatus rejects unknown', () => {
    expect(isStatus('snurfed')).toBe(false);
  });
  it('isScope accepts article6|compliance|voluntary', () => {
    expect(isScope('article6')).toBe(true);
    expect(isScope('compliance')).toBe(true);
    expect(isScope('voluntary')).toBe(true);
    expect(isScope('reckless')).toBe(false);
  });
});

describe('retirement-chain-spec — terminal detection', () => {
  it('retired / rejected / cancelled are terminal', () => {
    for (const s of TERMINAL_STATES) expect(isTerminal(s)).toBe(true);
  });
  it('non-terminal states are not', () => {
    for (const s of ['requested', 'validating', 'adjustment_pending', 'adjusted'] as RetirementStatus[]) {
      expect(isTerminal(s)).toBe(false);
    }
  });
});

describe('retirement-chain-spec — transition graph', () => {
  it('happy article6 path runs end-to-end', () => {
    let s: RetirementStatus = 'requested';
    s = advance(s, 'begin_validation');          expect(s).toBe('validating');
    s = advance(s, 'mark_adjustment_pending');   expect(s).toBe('adjustment_pending');
    s = advance(s, 'mark_adjusted');             expect(s).toBe('adjusted');
    s = advance(s, 'finalize');                  expect(s).toBe('retired');
  });

  it('reject is reachable from validating + adjustment_pending', () => {
    expect(nextState('validating',         'reject')).toBe('rejected');
    expect(nextState('adjustment_pending', 'reject')).toBe('rejected');
  });

  it('reject is NOT reachable from requested or adjusted', () => {
    expect(nextState('requested', 'reject')).toBeNull();
    expect(nextState('adjusted',  'reject')).toBeNull();
  });

  it('cancel is reachable from every non-terminal', () => {
    for (const s of ['requested', 'validating', 'adjustment_pending', 'adjusted'] as RetirementStatus[]) {
      expect(nextState(s, 'cancel')).toBe('cancelled');
    }
  });

  it('terminals have no outgoing transitions', () => {
    for (const s of TERMINAL_STATES) {
      expect(Object.keys(TRANSITIONS[s]).length).toBe(0);
    }
  });

  it('advance() throws on invalid action', () => {
    expect(() => advance('retired', 'finalize')).toThrow();
    expect(() => advance('requested', 'finalize')).toThrow();
  });

  it('cannot skip stages', () => {
    expect(nextState('requested',  'mark_adjusted')).toBeNull();
    expect(nextState('validating', 'finalize')).toBeNull();
  });
});

describe('retirement-chain-spec — SLA computation', () => {
  it('article6/requested = 4h', () => {
    expect(slaDueAt('requested', 'article6', NOW)).toBe('2026-06-01T16:00:00.000Z');
  });
  it('voluntary/validating = 168h', () => {
    expect(slaDueAt('validating', 'voluntary', NOW)).toBe('2026-06-08T12:00:00.000Z');
  });
  it('terminals return empty deadline', () => {
    for (const s of TERMINAL_STATES) {
      expect(slaDueAt(s, 'article6', NOW)).toBe('');
    }
  });
  it('article6 stricter than compliance stricter than voluntary at every stage', () => {
    for (const s of ALL_STATES) {
      if (isTerminal(s)) continue;
      expect(SLA_MINUTES[s].article6).toBeLessThanOrEqual(SLA_MINUTES[s].compliance);
      expect(SLA_MINUTES[s].compliance).toBeLessThanOrEqual(SLA_MINUTES[s].voluntary);
    }
  });
});

describe('retirement-chain-spec — regulator crossings', () => {
  it('article6 finalize crosses (corresponding adjustment)', () => {
    expect(crossesIntoRegulator('finalize', 'article6')).toBe(true);
  });
  it('article6 reject crosses', () => {
    expect(crossesIntoRegulator('reject', 'article6')).toBe(true);
  });
  it('compliance reject crosses; compliance finalize does NOT', () => {
    expect(crossesIntoRegulator('reject',   'compliance')).toBe(true);
    expect(crossesIntoRegulator('finalize', 'compliance')).toBe(false);
  });
  it('voluntary never crosses regardless of action', () => {
    for (const a of ['begin_validation', 'mark_adjustment_pending', 'mark_adjusted', 'finalize', 'reject', 'cancel'] as const) {
      expect(crossesIntoRegulator(a, 'voluntary')).toBe(false);
    }
  });
  it('SLA breach: article6 + compliance cross; voluntary does not', () => {
    expect(slaBreachCrossesIntoRegulator('article6')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('compliance')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('voluntary')).toBe(false);
  });
});
