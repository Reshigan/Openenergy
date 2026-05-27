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
  tierFromCapex,
  ProcurementStatus,
} from '../src/utils/procurement-chain-spec';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('procurement-chain-spec — type guards', () => {
  it('isStatus accepts every defined state', () => {
    for (const s of ALL_STATES) expect(isStatus(s)).toBe(true);
  });
  it('isStatus rejects unknown', () => {
    expect(isStatus('signed_and_sealed')).toBe(false);
  });
  it('isTier accepts only high/medium/low', () => {
    expect(isTier('high')).toBe(true);
    expect(isTier('medium')).toBe(true);
    expect(isTier('low')).toBe(true);
    expect(isTier('mega')).toBe(false);
  });
});

describe('procurement-chain-spec — terminal detection', () => {
  it('delivered / rejected / cancelled are terminal', () => {
    for (const s of TERMINAL_STATES) expect(isTerminal(s)).toBe(true);
  });
  it('disputed is NOT terminal — resolves back to contracted', () => {
    expect(isTerminal('disputed')).toBe(false);
  });
  it('every other state is non-terminal', () => {
    for (const s of ALL_STATES) {
      if (TERMINAL_STATES.includes(s)) continue;
      expect(isTerminal(s)).toBe(false);
    }
  });
});

describe('procurement-chain-spec — transition graph', () => {
  it('happy path runs end-to-end', () => {
    let s: ProcurementStatus = 'draft';
    s = advance(s, 'publish');          expect(s).toBe('published');
    s = advance(s, 'open_bids');        expect(s).toBe('bidding');
    s = advance(s, 'close_bids');       expect(s).toBe('bid_closed');
    s = advance(s, 'begin_evaluation'); expect(s).toBe('evaluation');
    s = advance(s, 'shortlist');        expect(s).toBe('shortlisted');
    s = advance(s, 'award');            expect(s).toBe('awarded');
    s = advance(s, 'sign_contract');    expect(s).toBe('contracted');
    s = advance(s, 'mark_delivered');   expect(s).toBe('delivered');
  });

  it('reject_all only from evaluation', () => {
    expect(nextState('evaluation', 'reject_all')).toBe('rejected');
    expect(nextState('bid_closed', 'reject_all')).toBeNull();
    expect(nextState('shortlisted','reject_all')).toBeNull();
  });

  it('dispute reachable from every pre-delivered non-terminal except draft and disputed itself', () => {
    for (const s of ['published','bidding','bid_closed','evaluation','shortlisted','awarded','contracted'] as ProcurementStatus[]) {
      expect(nextState(s, 'dispute')).toBe('disputed');
    }
    expect(nextState('draft', 'dispute')).toBeNull();
    expect(nextState('delivered', 'dispute')).toBeNull();
    expect(nextState('disputed', 'dispute')).toBeNull();
  });

  it('resolve loops disputed back into contracted', () => {
    expect(nextState('disputed', 'resolve')).toBe('contracted');
  });

  it('cancel reachable from every pre-contracted non-terminal + disputed', () => {
    for (const s of ['draft','published','bidding','bid_closed','evaluation','shortlisted','awarded','disputed'] as ProcurementStatus[]) {
      expect(nextState(s, 'cancel')).toBe('cancelled');
    }
  });

  it('cancel NOT reachable from contracted/delivered (contract commit point)', () => {
    expect(nextState('contracted','cancel')).toBeNull();
    expect(nextState('delivered', 'cancel')).toBeNull();
  });

  it('terminals have no outgoing transitions', () => {
    for (const s of TERMINAL_STATES) {
      expect(Object.keys(TRANSITIONS[s]).length).toBe(0);
    }
  });

  it('advance() throws on invalid action', () => {
    expect(() => advance('delivered', 'mark_delivered')).toThrow();
    expect(() => advance('draft', 'award')).toThrow();
  });

  it('cannot skip stages', () => {
    expect(nextState('published',  'award')).toBeNull();
    expect(nextState('bidding',    'sign_contract')).toBeNull();
    expect(nextState('shortlisted','mark_delivered')).toBeNull();
  });
});

describe('procurement-chain-spec — SLA computation', () => {
  it('high/published = 3d (4320m)', () => {
    expect(slaDueAt('published', 'high', NOW)).toBe(new Date(NOW.getTime() + 4320 * 60_000).toISOString());
  });
  it('low/bidding = 14d (20160m)', () => {
    expect(slaDueAt('bidding', 'low', NOW)).toBe(new Date(NOW.getTime() + 20160 * 60_000).toISOString());
  });
  it('terminals return empty deadline', () => {
    for (const s of TERMINAL_STATES) {
      expect(slaDueAt(s, 'high', NOW)).toBe('');
    }
  });
  it('high gets MORE rope than medium gets more than low at every non-terminal stage (bigger contracts need more diligence time)', () => {
    for (const s of ALL_STATES) {
      if (isTerminal(s)) continue;
      if (s === 'disputed') continue;          // flat 3d regardless of tier
      expect(SLA_MINUTES[s].high).toBeGreaterThanOrEqual(SLA_MINUTES[s].medium);
      expect(SLA_MINUTES[s].medium).toBeGreaterThanOrEqual(SLA_MINUTES[s].low);
    }
  });
  it('disputed SLA is flat across tiers', () => {
    expect(SLA_MINUTES.disputed.high).toBe(SLA_MINUTES.disputed.medium);
    expect(SLA_MINUTES.disputed.medium).toBe(SLA_MINUTES.disputed.low);
  });
});

describe('procurement-chain-spec — tier from capex', () => {
  it('R600m = high', () => expect(tierFromCapex(600_000_000)).toBe('high'));
  it('R100m = medium', () => expect(tierFromCapex(100_000_000)).toBe('medium'));
  it('R10m = low',    () => expect(tierFromCapex(10_000_000)).toBe('low'));
  it('boundary R500m = high', () => expect(tierFromCapex(500_000_000)).toBe('high'));
  it('boundary R50m = medium', () => expect(tierFromCapex(50_000_000)).toBe('medium'));
  it('R0 = low', () => expect(tierFromCapex(0)).toBe('low'));
});

describe('procurement-chain-spec — regulator crossings', () => {
  it('award crosses ONLY for high-tier', () => {
    expect(crossesIntoRegulator('award', 'high')).toBe(true);
    expect(crossesIntoRegulator('award', 'medium')).toBe(false);
    expect(crossesIntoRegulator('award', 'low')).toBe(false);
  });
  it('dispute crosses ONLY for high-tier', () => {
    expect(crossesIntoRegulator('dispute', 'high')).toBe(true);
    expect(crossesIntoRegulator('dispute', 'medium')).toBe(false);
  });
  it('non-award/dispute actions never cross', () => {
    for (const a of ['publish','open_bids','close_bids','begin_evaluation','shortlist','reject_all','sign_contract','mark_delivered','cancel','resolve'] as const) {
      for (const t of ['high','medium','low'] as const) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });
  it('SLA breach crosses ONLY for high-tier', () => {
    expect(slaBreachCrossesIntoRegulator('high')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('low')).toBe(false);
  });
});
