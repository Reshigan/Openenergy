import { describe, it, expect } from 'vitest';
import {
  ALL_STATES,
  SLA_MINUTES,
  TERMINAL_STATES,
  TRANSITIONS,
  advance,
  crossesIntoRegulator,
  isStatus,
  isTerminal,
  isTier,
  nextState,
  slaBreachCrossesIntoRegulator,
  slaDueAt,
  tierFromZar,
  DrawdownStatus,
} from '../src/utils/drawdown-chain-spec';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('drawdown-chain-spec — type guards', () => {
  it('isStatus accepts every defined state', () => {
    for (const s of ALL_STATES) expect(isStatus(s)).toBe(true);
  });
  it('isStatus rejects unknown', () => {
    expect(isStatus('drawn')).toBe(false);
  });
  it('isTier accepts only senior/mezz/equity', () => {
    expect(isTier('senior')).toBe(true);
    expect(isTier('mezz')).toBe(true);
    expect(isTier('equity')).toBe(true);
    expect(isTier('debt')).toBe(false);
  });
});

describe('drawdown-chain-spec — terminal detection', () => {
  it('closed, rejected, cancelled are terminal', () => {
    for (const s of TERMINAL_STATES) expect(isTerminal(s)).toBe(true);
  });
  it('every other state is non-terminal', () => {
    for (const s of ALL_STATES) {
      if (TERMINAL_STATES.includes(s)) continue;
      expect(isTerminal(s)).toBe(false);
    }
  });
});

describe('drawdown-chain-spec — transition graph', () => {
  it('happy path runs end-to-end', () => {
    let s: DrawdownStatus = 'requested';
    s = advance(s, 'submit_documents'); expect(s).toBe('documents_submitted');
    s = advance(s, 'begin_ie_review');  expect(s).toBe('ie_review');
    s = advance(s, 'pass_to_cp');       expect(s).toBe('cp_checklist');
    s = advance(s, 'approve');          expect(s).toBe('approved');
    s = advance(s, 'fund');             expect(s).toBe('funded');
    s = advance(s, 'close');            expect(s).toBe('closed');
  });

  it('query → on_hold → resume → cp_checklist round trip', () => {
    let s: DrawdownStatus = 'ie_review';
    s = advance(s, 'query');   expect(s).toBe('on_hold');
    s = advance(s, 'resume');  expect(s).toBe('cp_checklist');
    s = advance(s, 'approve'); expect(s).toBe('approved');
  });

  it('query from cp_checklist also goes on_hold', () => {
    expect(nextState('cp_checklist', 'query')).toBe('on_hold');
  });

  it('cancel reachable from every pre-funded non-terminal', () => {
    for (const s of ALL_STATES) {
      if (s === 'funded' || isTerminal(s)) {
        expect(nextState(s, 'cancel')).toBeNull();
        continue;
      }
      expect(nextState(s, 'cancel')).toBe('cancelled');
    }
  });

  it('reject reachable from every pre-approved non-terminal', () => {
    const rejectable: DrawdownStatus[] = ['requested', 'documents_submitted', 'ie_review', 'cp_checklist', 'on_hold'];
    for (const s of rejectable) expect(nextState(s, 'reject')).toBe('rejected');
    for (const s of ['approved', 'funded'] as DrawdownStatus[]) expect(nextState(s, 'reject')).toBeNull();
    for (const s of TERMINAL_STATES) expect(nextState(s, 'reject')).toBeNull();
  });

  it('terminals have no outgoing transitions', () => {
    for (const s of TERMINAL_STATES) {
      expect(Object.keys(TRANSITIONS[s]).length).toBe(0);
    }
  });

  it('advance() throws on invalid action', () => {
    expect(() => advance('funded', 'reject')).toThrow();
    expect(() => advance('requested', 'fund')).toThrow();
    expect(() => advance('approved', 'query')).toThrow();
  });

  it('cannot skip stages', () => {
    expect(nextState('requested',           'approve')).toBeNull();
    expect(nextState('documents_submitted', 'fund')).toBeNull();
    expect(nextState('ie_review',           'fund')).toBeNull();
    expect(nextState('cp_checklist',        'fund')).toBeNull();
  });
});

describe('drawdown-chain-spec — SLA computation', () => {
  it('senior/ie_review = 30d (43200m)', () => {
    expect(slaDueAt('ie_review', 'senior', NOW)).toBe(new Date(NOW.getTime() + 43200 * 60_000).toISOString());
  });
  it('equity/ie_review = 5d (7200m)', () => {
    expect(slaDueAt('ie_review', 'equity', NOW)).toBe(new Date(NOW.getTime() + 7200 * 60_000).toISOString());
  });
  it('terminals return empty deadline', () => {
    for (const s of TERMINAL_STATES) {
      expect(slaDueAt(s, 'senior', NOW)).toBe('');
    }
  });
  it('senior gets MORE rope than mezz gets more than equity at every non-terminal stage (bigger tranches need more diligence)', () => {
    for (const s of ALL_STATES) {
      if (isTerminal(s)) continue;
      expect(SLA_MINUTES[s].senior).toBeGreaterThanOrEqual(SLA_MINUTES[s].mezz);
      expect(SLA_MINUTES[s].mezz).toBeGreaterThanOrEqual(SLA_MINUTES[s].equity);
    }
  });
  it('ie_review is the longest stage (the load-bearing diligence step)', () => {
    for (const t of ['senior','mezz','equity'] as const) {
      for (const s of ALL_STATES) {
        if (s === 'ie_review' || isTerminal(s)) continue;
        expect(SLA_MINUTES.ie_review[t]).toBeGreaterThan(SLA_MINUTES[s][t]);
      }
    }
  });
});

describe('drawdown-chain-spec — tier from ZAR', () => {
  it('R1.5bn = senior',  () => expect(tierFromZar(1_500_000_000)).toBe('senior'));
  it('R250m = mezz',     () => expect(tierFromZar(250_000_000)).toBe('mezz'));
  it('R25m = equity',    () => expect(tierFromZar(25_000_000)).toBe('equity'));
  it('boundary R500m = senior',  () => expect(tierFromZar(500_000_000)).toBe('senior'));
  it('boundary R100m = mezz',    () => expect(tierFromZar(100_000_000)).toBe('mezz'));
  it('R0 = equity',     () => expect(tierFromZar(0)).toBe('equity'));
});

describe('drawdown-chain-spec — regulator crossings', () => {
  it('approve crosses ONLY for senior', () => {
    expect(crossesIntoRegulator('approve', 'senior')).toBe(true);
    expect(crossesIntoRegulator('approve', 'mezz')).toBe(false);
    expect(crossesIntoRegulator('approve', 'equity')).toBe(false);
  });
  it('reject crosses ONLY for senior', () => {
    expect(crossesIntoRegulator('reject', 'senior')).toBe(true);
    expect(crossesIntoRegulator('reject', 'mezz')).toBe(false);
  });
  it('intermediate + post-approval actions never cross', () => {
    for (const a of ['submit_documents','begin_ie_review','pass_to_cp','query','resume','fund','close','cancel'] as const) {
      for (const t of ['senior','mezz','equity'] as const) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });
  it('SLA breach crosses ONLY for senior', () => {
    expect(slaBreachCrossesIntoRegulator('senior')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('mezz')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('equity')).toBe(false);
  });
});
