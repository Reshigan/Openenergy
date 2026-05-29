import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForDscr,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isStressedTier, isReportable, partyForAction,
  severityIndex, headroomToLockupMonths, cureRunwayDays,
  equityCureCoverageRatio, dsraCoverageRatio,
  crossDefaultRiskFlag, forwardDscr, llcr, plcr, urgencyBand,
  type DscrStatus, type DscrTier, type DscrAction,
} from '../src/utils/dscr-monitoring-spec';

describe('W86 DSCR monitoring & cure chain — state machine', () => {
  it('clean period: period_open → data_collected → computed → certified_clean', () => {
    let s: DscrStatus = 'period_open';
    s = nextStatus(s, 'collect_data')!;   expect(s).toBe('data_collected');
    s = nextStatus(s, 'compute_ratios')!; expect(s).toBe('computed');
    s = nextStatus(s, 'certify_clean')!;  expect(s).toBe('certified_clean');
    expect(isTerminal('certified_clean')).toBe(true);
  });

  it('watch branch: computed → watch → certified_clean (recovery)', () => {
    expect(nextStatus('computed', 'place_on_watch')).toBe('watch');
    expect(nextStatus('watch', 'certify_clean')).toBe('certified_clean');
  });

  it('watch branch: computed → watch → breach_recorded (deterioration)', () => {
    expect(nextStatus('watch', 'record_breach')).toBe('breach_recorded');
  });

  it('breach branch: computed → breach_recorded → cure_proposed → cure_in_progress → cure_validated → certified_clean', () => {
    let s: DscrStatus = 'computed';
    s = nextStatus(s, 'record_breach')!;   expect(s).toBe('breach_recorded');
    s = nextStatus(s, 'propose_cure')!;    expect(s).toBe('cure_proposed');
    s = nextStatus(s, 'execute_cure')!;    expect(s).toBe('cure_in_progress');
    s = nextStatus(s, 'validate_cure')!;   expect(s).toBe('cure_validated');
    s = nextStatus(s, 'certify_clean')!;   expect(s).toBe('certified_clean');
  });

  it('cure can fail mid-flight → accelerated (terminal)', () => {
    expect(nextStatus('cure_in_progress', 'fail_cure')).toBe('accelerated');
    expect(isTerminal('accelerated')).toBe(true);
  });

  it('proposed cure can be rejected → returns to breach_recorded', () => {
    expect(nextStatus('cure_proposed', 'reject_cure')).toBe('breach_recorded');
  });

  it('lock-up path: breach_recorded → lock_up → propose_cure | declare_acceleration', () => {
    expect(nextStatus('breach_recorded', 'enter_lock_up')).toBe('lock_up');
    expect(nextStatus('lock_up', 'propose_cure')).toBe('cure_proposed');
    expect(nextStatus('lock_up', 'declare_acceleration')).toBe('accelerated');
  });

  it('waiver path: breach_recorded → waived (terminal)', () => {
    expect(nextStatus('breach_recorded', 'waive_breach')).toBe('waived');
    expect(isTerminal('waived')).toBe(true);
  });

  it('terminals reject every action', () => {
    expect(nextStatus('certified_clean', 'collect_data')).toBe(null);
    expect(nextStatus('accelerated', 'propose_cure')).toBe(null);
    expect(nextStatus('waived', 'collect_data')).toBe(null);
  });

  it('illegal transitions return null', () => {
    expect(nextStatus('period_open', 'certify_clean')).toBe(null);
    expect(nextStatus('data_collected', 'declare_acceleration')).toBe(null);
    expect(nextStatus('computed', 'propose_cure')).toBe(null);
    expect(nextStatus('cure_proposed', 'enter_lock_up')).toBe(null);
  });

  it('allowedActions returns the right action set for each state', () => {
    expect(allowedActions('period_open')).toEqual(['collect_data']);
    expect(allowedActions('data_collected')).toEqual(['compute_ratios']);
    expect(allowedActions('computed').sort()).toEqual(['certify_clean', 'place_on_watch', 'record_breach'].sort());
    expect(allowedActions('cure_proposed').sort()).toEqual(['execute_cure', 'reject_cure'].sort());
    expect(allowedActions('certified_clean')).toEqual(expect.any(Array));
  });
});

describe('W86 tier from DSCR — RE-DERIVED on every transition', () => {
  it('minor when DSCR >= 1.30', () => {
    expect(tierForDscr(1.30)).toBe('minor');
    expect(tierForDscr(1.50)).toBe('minor');
    expect(tierForDscr(2.00)).toBe('minor');
  });
  it('standard when 1.20 <= DSCR < 1.30', () => {
    expect(tierForDscr(1.20)).toBe('standard');
    expect(tierForDscr(1.25)).toBe('standard');
    expect(tierForDscr(1.299)).toBe('standard');
  });
  it('material when 1.00 <= DSCR < 1.20', () => {
    expect(tierForDscr(1.00)).toBe('material');
    expect(tierForDscr(1.10)).toBe('material');
    expect(tierForDscr(1.19)).toBe('material');
  });
  it('severe when DSCR < 1.00', () => {
    expect(tierForDscr(0.99)).toBe('severe');
    expect(tierForDscr(0.50)).toBe('severe');
    expect(tierForDscr(0.00)).toBe('severe');
  });
  it('severe defaults for missing or invalid DSCR', () => {
    expect(tierForDscr(null)).toBe('severe');
    expect(tierForDscr(undefined)).toBe('severe');
    expect(tierForDscr(Number.NaN)).toBe('severe');
    expect(tierForDscr(Infinity)).toBe('severe');
  });
});

describe('W86 SLA — URGENT polarity (lower DSCR = tighter window)', () => {
  it('all graded states are strictly decreasing minor → severe', () => {
    const graded: DscrStatus[] = [
      'period_open', 'data_collected', 'computed',
      'watch', 'breach_recorded', 'cure_proposed', 'cure_in_progress',
      'cure_validated', 'lock_up',
    ];
    for (const s of graded) {
      expect(SLA_MINUTES[s].minor).toBeGreaterThan(SLA_MINUTES[s].standard);
      expect(SLA_MINUTES[s].standard).toBeGreaterThan(SLA_MINUTES[s].material);
      expect(SLA_MINUTES[s].material).toBeGreaterThan(SLA_MINUTES[s].severe);
    }
  });

  it('terminals have no SLA', () => {
    expect(slaWindowMinutes('certified_clean', 'severe')).toBe(0);
    expect(slaWindowMinutes('accelerated', 'severe')).toBe(0);
    expect(slaWindowMinutes('waived', 'minor')).toBe(0);
  });

  it('slaDeadlineFor computes the right minute offset', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const d = slaDeadlineFor('cure_in_progress', 'severe', start);
    expect(d?.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('slaDeadlineFor returns null when no deadline (terminal)', () => {
    expect(slaDeadlineFor('certified_clean', 'minor', new Date())).toBe(null);
  });
});

describe('W86 COVERAGE-DEFENSE signature — the hard line', () => {
  it('declare_acceleration crosses regulator EVERY tier', () => {
    for (const t of ['minor', 'standard', 'material', 'severe'] as DscrTier[]) {
      expect(crossesIntoRegulator('declare_acceleration', t)).toBe(true);
    }
  });

  it('waive_breach crosses regulator for material + severe only', () => {
    expect(crossesIntoRegulator('waive_breach', 'minor')).toBe(false);
    expect(crossesIntoRegulator('waive_breach', 'standard')).toBe(false);
    expect(crossesIntoRegulator('waive_breach', 'material')).toBe(true);
    expect(crossesIntoRegulator('waive_breach', 'severe')).toBe(true);
  });

  it('enter_lock_up crosses regulator for material + severe only', () => {
    expect(crossesIntoRegulator('enter_lock_up', 'minor')).toBe(false);
    expect(crossesIntoRegulator('enter_lock_up', 'standard')).toBe(false);
    expect(crossesIntoRegulator('enter_lock_up', 'material')).toBe(true);
    expect(crossesIntoRegulator('enter_lock_up', 'severe')).toBe(true);
  });

  it('benign actions never cross', () => {
    expect(crossesIntoRegulator('collect_data', 'severe')).toBe(false);
    expect(crossesIntoRegulator('certify_clean', 'severe')).toBe(false);
    expect(crossesIntoRegulator('propose_cure', 'severe')).toBe(false);
    expect(crossesIntoRegulator('execute_cure', 'severe')).toBe(false);
  });

  it('sla_breached crosses regulator for material + severe only', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('severe')).toBe(true);
  });

  it('isReportable returns true for material + severe', () => {
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('material')).toBe(true);
    expect(isReportable('severe')).toBe(true);
  });

  it('isStressedTier matches isReportable', () => {
    expect(isStressedTier('material')).toBe(true);
    expect(isStressedTier('minor')).toBe(false);
  });
});

describe('W86 actor party for actions', () => {
  it('borrower drives cure proposal + execution', () => {
    expect(partyForAction('propose_cure')).toBe('borrower');
    expect(partyForAction('execute_cure')).toBe('borrower');
  });
  it('independent engineer validates cure outcome', () => {
    expect(partyForAction('validate_cure')).toBe('independent_engineer');
  });
  it('lender drives every measurement / decision step', () => {
    expect(partyForAction('collect_data')).toBe('lender');
    expect(partyForAction('compute_ratios')).toBe('lender');
    expect(partyForAction('record_breach')).toBe('lender');
    expect(partyForAction('declare_acceleration')).toBe('lender');
    expect(partyForAction('waive_breach')).toBe('lender');
  });
});

describe('W86 live coverage-defense battery', () => {
  it('severity index: 0 at pass threshold, 100 at floor', () => {
    expect(severityIndex(1.30)).toBe(0);
    expect(severityIndex(1.50)).toBe(0);
    expect(severityIndex(0.50)).toBe(100);
    expect(severityIndex(0.00)).toBe(100);
  });
  it('severity scales linearly in the breach zone', () => {
    expect(severityIndex(1.00)).toBeGreaterThan(20);
    expect(severityIndex(1.00)).toBeLessThan(50);
    expect(severityIndex(0.80)).toBeGreaterThan(50);
  });
  it('severity defaults to 100 for missing input', () => {
    expect(severityIndex(null)).toBe(100);
  });

  it('headroom returns null for an improving project', () => {
    expect(headroomToLockupMonths(1.50, 0.05)).toBe(null);
  });
  it('headroom is 0 when already below the floor', () => {
    expect(headroomToLockupMonths(0.95, -0.10)).toBe(0);
  });
  it('headroom computes months at the deterioration trend', () => {
    const h = headroomToLockupMonths(1.30, -0.30);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(24);
  });

  it('cure runway: positive when inside window', () => {
    const entered = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-05T00:00:00Z');
    const runway = cureRunwayDays('cure_in_progress', 'severe', entered, now);
    expect(runway).toBeGreaterThan(0);
  });
  it('cure runway: 0 when expired', () => {
    const entered = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2027-01-01T00:00:00Z');
    expect(cureRunwayDays('cure_in_progress', 'severe', entered, now)).toBe(0);
  });

  it('equity cure coverage: 1.0 when zero shortfall', () => {
    expect(equityCureCoverageRatio(1000000, 0)).toBe(1.0);
  });
  it('equity cure coverage: ratio of available to required', () => {
    expect(equityCureCoverageRatio(100, 100, 1.0)).toBe(1.0);
    expect(equityCureCoverageRatio(50, 100, 1.0)).toBe(0.5);
    expect(equityCureCoverageRatio(125, 100, 1.25)).toBe(1.0);
  });

  it('DSRA coverage: balance over shortfall', () => {
    expect(dsraCoverageRatio(100, 100)).toBe(1.0);
    expect(dsraCoverageRatio(200, 100)).toBe(2.0);
    expect(dsraCoverageRatio(50, 100)).toBe(0.5);
  });

  it('cross-default flag: true when sister-loan DSCR below floor', () => {
    expect(crossDefaultRiskFlag(0.95)).toBe(true);
    expect(crossDefaultRiskFlag(1.10)).toBe(false);
    expect(crossDefaultRiskFlag(null)).toBe(false);
  });

  it('forward DSCR: cashflow over debt service', () => {
    expect(forwardDscr(130, 100)).toBe(1.3);
    expect(forwardDscr(100, 0)).toBe(null);
  });
  it('LLCR / PLCR gate divide-by-zero', () => {
    expect(llcr(1000, 800)).toBe(1.25);
    expect(plcr(1500, 800)).toBe(1.875);
    expect(llcr(1000, 0)).toBe(null);
  });

  it('urgency band ladders by severity + runway', () => {
    expect(urgencyBand(80, 100)).toBe('critical');
    expect(urgencyBand(0, 1.5)).toBe('critical');
    expect(urgencyBand(40, 50)).toBe('high');
    expect(urgencyBand(0, 5)).toBe('high');
    expect(urgencyBand(15, 50)).toBe('medium');
    expect(urgencyBand(0, 15)).toBe('medium');
    expect(urgencyBand(0, 30)).toBe('low');
  });
});

describe('W86 state coverage — 12 states, 13 actions', () => {
  it('exactly 12 distinct states', () => {
    const states = new Set<DscrStatus>();
    for (const t of Object.values(TRANSITIONS)) {
      for (const f of t.from) states.add(f);
      states.add(t.to);
    }
    expect(states.size).toBe(12);
  });
  it('exactly 13 actions', () => {
    expect(Object.keys(TRANSITIONS)).toHaveLength(13);
  });
  it('three terminals: certified_clean, accelerated, waived', () => {
    expect(isTerminal('certified_clean')).toBe(true);
    expect(isTerminal('accelerated')).toBe(true);
    expect(isTerminal('waived')).toBe(true);
    expect(isTerminal('period_open')).toBe(false);
    expect(isTerminal('breach_recorded')).toBe(false);
  });
});
