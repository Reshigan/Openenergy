import { describe, it, expect } from 'vitest';
import {
  ALL_STATES,
  TERMINAL_STATES,
  TRANSITIONS,
  SLA_MINUTES,
  advance,
  crossesIntoRegulator,
  isPriority,
  isStatus,
  isTerminal,
  nextState,
  slaBreachCrossesIntoRegulator,
  slaDueAt,
  WoStatus,
} from '../src/utils/wo-chain-spec';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('wo-chain-spec — type guards', () => {
  it('isStatus accepts every valid state', () => {
    for (const s of ALL_STATES) expect(isStatus(s)).toBe(true);
  });
  it('isStatus rejects unknown', () => {
    expect(isStatus('borked')).toBe(false);
  });
  it('isPriority accepts critical|high|medium|low', () => {
    expect(isPriority('critical')).toBe(true);
    expect(isPriority('high')).toBe(true);
    expect(isPriority('medium')).toBe(true);
    expect(isPriority('low')).toBe(true);
    expect(isPriority('urgent')).toBe(false);
  });
});

describe('wo-chain-spec — terminal detection', () => {
  it('closed and cancelled are terminal', () => {
    expect(isTerminal('closed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
  });
  it('mid-flow states are not terminal', () => {
    for (const s of ['created', 'assigned', 'on_site', 'repairing', 'verified'] as WoStatus[]) {
      expect(isTerminal(s)).toBe(false);
    }
  });
  it('TERMINAL_STATES is exactly 2', () => {
    expect(TERMINAL_STATES.length).toBe(2);
  });
});

describe('wo-chain-spec — transition graph', () => {
  it('happy path runs end-to-end via advance()', () => {
    let s: WoStatus = 'created';
    s = advance(s, 'assign');      expect(s).toBe('assigned');
    s = advance(s, 'acknowledge'); expect(s).toBe('acknowledged');
    s = advance(s, 'depart');      expect(s).toBe('en_route');
    s = advance(s, 'arrive');      expect(s).toBe('on_site');
    s = advance(s, 'diagnose');    expect(s).toBe('diagnosing');
    s = advance(s, 'repair');      expect(s).toBe('repairing');
    s = advance(s, 'test');        expect(s).toBe('testing');
    s = advance(s, 'complete');    expect(s).toBe('completed');
    s = advance(s, 'verify');      expect(s).toBe('verified');
    s = advance(s, 'close');       expect(s).toBe('closed');
  });

  it('cancel is reachable from every non-terminal except verified', () => {
    for (const s of ALL_STATES) {
      if (s === 'closed' || s === 'cancelled' || s === 'verified') continue;
      expect(nextState(s, 'cancel')).toBe('cancelled');
    }
  });

  it('verified cannot be cancelled', () => {
    expect(nextState('verified', 'cancel')).toBeNull();
  });

  it('closed has no outgoing transitions', () => {
    expect(Object.keys(TRANSITIONS['closed']).length).toBe(0);
  });

  it('cancelled has no outgoing transitions', () => {
    expect(Object.keys(TRANSITIONS['cancelled']).length).toBe(0);
  });

  it('advance() throws on invalid transition', () => {
    expect(() => advance('closed', 'verify')).toThrow();
    expect(() => advance('on_site', 'close')).toThrow();
  });

  it('cannot skip stages', () => {
    expect(nextState('created', 'arrive')).toBeNull();
    expect(nextState('assigned', 'repair')).toBeNull();
    expect(nextState('on_site', 'complete')).toBeNull();
  });
});

describe('wo-chain-spec — SLA computation', () => {
  it('critical/created SLA = 15 minutes', () => {
    const due = slaDueAt('created', 'critical', NOW);
    expect(due).toBe('2026-06-01T12:15:00.000Z');
  });
  it('low/repairing SLA = 1440 minutes (24h)', () => {
    const due = slaDueAt('repairing', 'low', NOW);
    expect(due).toBe('2026-06-02T12:00:00.000Z');
  });
  it('medium/on_site SLA = 120 minutes', () => {
    const due = slaDueAt('on_site', 'medium', NOW);
    expect(due).toBe('2026-06-01T14:00:00.000Z');
  });
  it('terminal states return empty deadline', () => {
    expect(slaDueAt('closed', 'critical', NOW)).toBe('');
    expect(slaDueAt('cancelled', 'critical', NOW)).toBe('');
  });
  it('every non-terminal/priority pair has positive SLA', () => {
    for (const s of ALL_STATES) {
      if (isTerminal(s)) continue;
      for (const p of ['critical', 'high', 'medium', 'low'] as const) {
        expect(SLA_MINUTES[s][p]).toBeGreaterThan(0);
      }
    }
  });
  it('critical is always faster than low at the same stage', () => {
    for (const s of ALL_STATES) {
      if (isTerminal(s)) continue;
      expect(SLA_MINUTES[s].critical).toBeLessThan(SLA_MINUTES[s].low);
    }
  });
});

describe('wo-chain-spec — regulator crossings', () => {
  it('cancel on critical WO crosses to regulator', () => {
    expect(crossesIntoRegulator('cancel', 'critical')).toBe(true);
  });
  it('cancel on high/medium/low does NOT cross', () => {
    for (const p of ['high', 'medium', 'low'] as const) {
      expect(crossesIntoRegulator('cancel', p)).toBe(false);
    }
  });
  it('normal lifecycle actions never cross', () => {
    for (const a of ['assign', 'acknowledge', 'depart', 'arrive', 'diagnose', 'repair', 'test', 'complete', 'verify', 'close'] as const) {
      for (const p of ['critical', 'high', 'medium', 'low'] as const) {
        expect(crossesIntoRegulator(a, p)).toBe(false);
      }
    }
  });
  it('SLA breach on critical priority crosses', () => {
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
  });
  it('SLA breach on high/medium/low does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('high')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('low')).toBe(false);
  });
});
