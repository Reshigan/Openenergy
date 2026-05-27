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
  tierFromMw,
  CodStatus,
} from '../src/utils/cod-chain-spec';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('cod-chain-spec — type guards', () => {
  it('isStatus accepts every defined state', () => {
    for (const s of ALL_STATES) expect(isStatus(s)).toBe(true);
  });
  it('isStatus rejects unknown', () => {
    expect(isStatus('green_lit')).toBe(false);
  });
  it('isTier accepts only large/medium/small', () => {
    expect(isTier('large')).toBe(true);
    expect(isTier('medium')).toBe(true);
    expect(isTier('small')).toBe(true);
    expect(isTier('mega')).toBe(false);
  });
});

describe('cod-chain-spec — terminal detection', () => {
  it('cod_certified and cancelled are terminal', () => {
    for (const s of TERMINAL_STATES) expect(isTerminal(s)).toBe(true);
  });
  it('every other state is non-terminal', () => {
    for (const s of ALL_STATES) {
      if (TERMINAL_STATES.includes(s)) continue;
      expect(isTerminal(s)).toBe(false);
    }
  });
});

describe('cod-chain-spec — transition graph', () => {
  it('happy path runs end-to-end', () => {
    let s: CodStatus = 'draft';
    s = advance(s, 'sign_epc');              expect(s).toBe('epc_signed');
    s = advance(s, 'issue_ntp');             expect(s).toBe('ntp_issued');
    s = advance(s, 'mobilize');              expect(s).toBe('mobilization');
    s = advance(s, 'mechanical_complete');   expect(s).toBe('mechanical_complete');
    s = advance(s, 'cold_commission');       expect(s).toBe('cold_commissioning');
    s = advance(s, 'grid_synchronize');      expect(s).toBe('grid_synchronized');
    s = advance(s, 'begin_reliability_run'); expect(s).toBe('reliability_run');
    s = advance(s, 'certify_cod');           expect(s).toBe('cod_certified');
  });

  it('cancel reachable from every pre-cod_certified non-terminal', () => {
    for (const s of ALL_STATES) {
      if (s === 'cod_certified' || s === 'cancelled') {
        expect(nextState(s, 'cancel')).toBeNull();
        continue;
      }
      expect(nextState(s, 'cancel')).toBe('cancelled');
    }
  });

  it('terminals have no outgoing transitions', () => {
    for (const s of TERMINAL_STATES) {
      expect(Object.keys(TRANSITIONS[s]).length).toBe(0);
    }
  });

  it('advance() throws on invalid action', () => {
    expect(() => advance('cod_certified', 'cancel')).toThrow();
    expect(() => advance('draft', 'certify_cod')).toThrow();
  });

  it('cannot skip stages', () => {
    expect(nextState('draft',                 'mechanical_complete')).toBeNull();
    expect(nextState('ntp_issued',            'certify_cod')).toBeNull();
    expect(nextState('grid_synchronized',     'certify_cod')).toBeNull();
    expect(nextState('mobilization',          'cold_commission')).toBeNull();
  });
});

describe('cod-chain-spec — SLA computation', () => {
  it('large/draft = 90d (129600m)', () => {
    expect(slaDueAt('draft', 'large', NOW)).toBe(new Date(NOW.getTime() + 129600 * 60_000).toISOString());
  });
  it('small/ntp_issued = 14d (20160m)', () => {
    expect(slaDueAt('ntp_issued', 'small', NOW)).toBe(new Date(NOW.getTime() + 20160 * 60_000).toISOString());
  });
  it('terminals return empty deadline', () => {
    for (const s of TERMINAL_STATES) {
      expect(slaDueAt(s, 'large', NOW)).toBe('');
    }
  });
  it('large gets MORE rope than medium gets more than small at every non-terminal stage (bigger projects, longer windows)', () => {
    for (const s of ALL_STATES) {
      if (isTerminal(s)) continue;
      expect(SLA_MINUTES[s].large).toBeGreaterThanOrEqual(SLA_MINUTES[s].medium);
      expect(SLA_MINUTES[s].medium).toBeGreaterThanOrEqual(SLA_MINUTES[s].small);
    }
  });
  it('mobilization (construction execution) is the longest stage', () => {
    for (const t of ['large','medium','small'] as const) {
      for (const s of ALL_STATES) {
        if (s === 'mobilization' || isTerminal(s)) continue;
        expect(SLA_MINUTES.mobilization[t]).toBeGreaterThan(SLA_MINUTES[s][t]);
      }
    }
  });
});

describe('cod-chain-spec — tier from MW', () => {
  it('150MW = large',    () => expect(tierFromMw(150)).toBe('large'));
  it('50MW = medium',    () => expect(tierFromMw(50)).toBe('medium'));
  it('5MW = small',      () => expect(tierFromMw(5)).toBe('small'));
  it('boundary 100MW = large',  () => expect(tierFromMw(100)).toBe('large'));
  it('boundary 10MW = medium',  () => expect(tierFromMw(10)).toBe('medium'));
  it('0MW = small',     () => expect(tierFromMw(0)).toBe('small'));
});

describe('cod-chain-spec — regulator crossings', () => {
  it('certify_cod crosses ONLY for large-tier', () => {
    expect(crossesIntoRegulator('certify_cod', 'large')).toBe(true);
    expect(crossesIntoRegulator('certify_cod', 'medium')).toBe(false);
    expect(crossesIntoRegulator('certify_cod', 'small')).toBe(false);
  });
  it('cancel crosses ONLY for large-tier', () => {
    expect(crossesIntoRegulator('cancel', 'large')).toBe(true);
    expect(crossesIntoRegulator('cancel', 'medium')).toBe(false);
  });
  it('intermediate actions never cross', () => {
    for (const a of ['sign_epc','issue_ntp','mobilize','mechanical_complete','cold_commission','grid_synchronize','begin_reliability_run'] as const) {
      for (const t of ['large','medium','small'] as const) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });
  it('SLA breach crosses ONLY for large-tier', () => {
    expect(slaBreachCrossesIntoRegulator('large')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('small')).toBe(false);
  });
});
