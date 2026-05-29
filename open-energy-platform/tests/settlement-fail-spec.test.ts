import { describe, it, expect } from 'vitest';
import {
  isTerminal,
  nextStatus,
  allowedActions,
  TRANSITIONS,
  SLA_MINUTES,
  slaWindowMinutes,
  slaDeadlineFor,
  isLargeTier,
  baseTierForFailValue,
  isSystemicCarrier,
  tierForFailValue,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  PENALTY_RATE_PER_DAY,
  failAgeDays,
  accruedPenaltyZar,
  buyInWindowRemainingDays,
  recoveryRate,
  penaltyToNavRatio,
  counterpartyConcentration,
  repeatFailScore,
  crossDefaultRiskFlag,
  urgencyBand,
  predictedResolutionDays,
  substituteInventoryAvailable,
  type SettlementFailStatus,
  type SettlementFailAction,
  type SettlementFailTier,
  type InstrumentClass,
} from '../src/utils/settlement-fail-spec';

const OPEN_NON_TERMINAL: SettlementFailStatus[] = [
  'instruction_pending',
  'fail_recorded',
  'extension_granted',
  'penalty_accruing',
  'buy_in_initiated',
  'buy_in_executing',
  'buy_in_settled',
  'cash_compensation',
  'dispute_raised',
  'force_majeure_suspended',
];
const TERMINAL_STATES: SettlementFailStatus[] = ['closed_resolved', 'written_off'];
const TIERS: SettlementFailTier[] = ['minor', 'standard', 'material', 'systemic'];

describe('terminals', () => {
  it('marks the two terminal states', () => {
    for (const s of TERMINAL_STATES) expect(isTerminal(s)).toBe(true);
  });
  it('non-terminals are not terminal', () => {
    for (const s of OPEN_NON_TERMINAL) expect(isTerminal(s)).toBe(false);
  });
});

describe('TRANSITIONS', () => {
  it('every action has at least one from-state', () => {
    for (const [a, t] of Object.entries(TRANSITIONS)) {
      expect(t.from.length).toBeGreaterThan(0);
      expect(typeof t.to).toBe('string');
    }
  });
  it('terminal states have no outbound transitions', () => {
    for (const t of TERMINAL_STATES) {
      expect(allowedActions(t).length).toBe(0);
      expect(nextStatus(t, 'write_off')).toBeNull();
    }
  });
  it('clean lifecycle: instruction_pending → … → closed_resolved', () => {
    expect(nextStatus('instruction_pending', 'record_fail')).toBe('fail_recorded');
    expect(nextStatus('fail_recorded', 'begin_penalty')).toBe('penalty_accruing');
    expect(nextStatus('penalty_accruing', 'initiate_buy_in')).toBe('buy_in_initiated');
    expect(nextStatus('buy_in_initiated', 'execute_buy_in')).toBe('buy_in_executing');
    expect(nextStatus('buy_in_executing', 'settle_buy_in')).toBe('buy_in_settled');
    expect(nextStatus('buy_in_settled', 'close_resolved')).toBe('closed_resolved');
  });
  it('extension branch: fail_recorded → extension_granted → penalty_accruing', () => {
    expect(nextStatus('fail_recorded', 'grant_extension')).toBe('extension_granted');
    expect(nextStatus('extension_granted', 'begin_penalty')).toBe('penalty_accruing');
  });
  it('cash-compensation branch: buy_in_executing → cash_compensation → closed_resolved', () => {
    expect(nextStatus('buy_in_executing', 'switch_cash_compensation')).toBe('cash_compensation');
    expect(nextStatus('cash_compensation', 'close_cash')).toBe('closed_resolved');
  });
  it('dispute loop: open → dispute_raised → penalty_accruing', () => {
    expect(nextStatus('penalty_accruing', 'raise_dispute')).toBe('dispute_raised');
    expect(nextStatus('buy_in_initiated', 'raise_dispute')).toBe('dispute_raised');
    expect(nextStatus('buy_in_executing', 'raise_dispute')).toBe('dispute_raised');
    expect(nextStatus('dispute_raised', 'resolve_dispute')).toBe('penalty_accruing');
  });
  it('force-majeure loop: open → suspended → penalty_accruing', () => {
    expect(nextStatus('penalty_accruing', 'suspend_force_majeure')).toBe('force_majeure_suspended');
    expect(nextStatus('force_majeure_suspended', 'resume')).toBe('penalty_accruing');
  });
  it('write_off accepts every open non-instruction state', () => {
    for (const s of ['fail_recorded', 'extension_granted', 'penalty_accruing', 'buy_in_initiated', 'buy_in_executing', 'cash_compensation', 'dispute_raised', 'force_majeure_suspended'] as SettlementFailStatus[]) {
      expect(nextStatus(s, 'write_off')).toBe('written_off');
    }
  });
  it('rejects invalid action from current state', () => {
    expect(nextStatus('instruction_pending', 'settle_buy_in')).toBeNull();
    expect(nextStatus('buy_in_settled', 'raise_dispute')).toBeNull();
  });
});

describe('SLA_MINUTES (URGENT polarity — larger fail = tighter window)', () => {
  it('penalty_accruing tightens monotonically: minor > standard > material > systemic', () => {
    const row = SLA_MINUTES['penalty_accruing'];
    expect(row.minor).toBeGreaterThan(row.standard);
    expect(row.standard).toBeGreaterThan(row.material);
    expect(row.material).toBeGreaterThan(row.systemic);
  });
  it('buy_in_initiated tightens monotonically', () => {
    const row = SLA_MINUTES['buy_in_initiated'];
    expect(row.minor).toBeGreaterThan(row.standard);
    expect(row.material).toBeGreaterThan(row.systemic);
  });
  it('dispute_raised tightens monotonically', () => {
    const row = SLA_MINUTES['dispute_raised'];
    expect(row.minor).toBeGreaterThan(row.standard);
    expect(row.material).toBeGreaterThan(row.systemic);
  });
  it('systemic fails are squeezed (initiated <= 12h)', () => {
    expect(SLA_MINUTES['buy_in_initiated'].systemic).toBeLessThanOrEqual(12 * 60);
  });
  it('terminal states have zero SLA', () => {
    for (const t of TIERS) {
      expect(SLA_MINUTES['closed_resolved'][t]).toBe(0);
      expect(SLA_MINUTES['written_off'][t]).toBe(0);
      expect(SLA_MINUTES['buy_in_settled'][t]).toBe(0);
    }
  });
  it('slaWindowMinutes returns matrix value', () => {
    expect(slaWindowMinutes('penalty_accruing', 'systemic')).toBe(SLA_MINUTES['penalty_accruing'].systemic);
  });
  it('slaDeadlineFor advances by the configured window', () => {
    const start = new Date('2026-05-29T00:00:00Z');
    const d = slaDeadlineFor('buy_in_initiated', 'systemic', start)!;
    const mins = SLA_MINUTES['buy_in_initiated'].systemic;
    expect(d.getTime() - start.getTime()).toBe(mins * 60 * 1000);
  });
  it('slaDeadlineFor returns null for zero-window states', () => {
    expect(slaDeadlineFor('closed_resolved', 'minor', new Date())).toBeNull();
  });
});

describe('tier derivation', () => {
  it('baseTierForFailValue is monotonic in fail value', () => {
    expect(baseTierForFailValue(50_000)).toBe('minor');
    expect(baseTierForFailValue(500_000)).toBe('standard');
    expect(baseTierForFailValue(5_000_000)).toBe('material');
    expect(baseTierForFailValue(50_000_000)).toBe('systemic');
  });
  it('isLargeTier: only material + systemic', () => {
    expect(isLargeTier('minor')).toBe(false);
    expect(isLargeTier('standard')).toBe(false);
    expect(isLargeTier('material')).toBe(true);
    expect(isLargeTier('systemic')).toBe(true);
  });
  it('systemic-carrier floor: systemic_instrument OR fail_age_days>=5 floors at material', () => {
    expect(isSystemicCarrier(true, 0)).toBe(true);
    expect(isSystemicCarrier(false, 5)).toBe(true);
    expect(isSystemicCarrier(false, 4)).toBe(false);
    expect(tierForFailValue(50_000, true, 0)).toBe('material');
    expect(tierForFailValue(50_000, false, 6)).toBe('material');
  });
  it('does not downgrade systemic-value just because not a systemic carrier', () => {
    expect(tierForFailValue(50_000_000, false, 0)).toBe('systemic');
  });
});

describe('reportability — DELIVERY-INTEGRITY signature', () => {
  it('write_off crosses for EVERY tier (W85 hard line)', () => {
    for (const t of TIERS) expect(crossesIntoRegulator('write_off', t)).toBe(true);
  });
  it('close_cash crosses for material + systemic only', () => {
    expect(crossesIntoRegulator('close_cash', 'minor')).toBe(false);
    expect(crossesIntoRegulator('close_cash', 'standard')).toBe(false);
    expect(crossesIntoRegulator('close_cash', 'material')).toBe(true);
    expect(crossesIntoRegulator('close_cash', 'systemic')).toBe(true);
  });
  it('initiate_buy_in crosses for material + systemic only', () => {
    expect(crossesIntoRegulator('initiate_buy_in', 'minor')).toBe(false);
    expect(crossesIntoRegulator('initiate_buy_in', 'systemic')).toBe(true);
  });
  it('non-signature actions do not cross', () => {
    for (const t of TIERS) {
      expect(crossesIntoRegulator('record_fail', t)).toBe(false);
      expect(crossesIntoRegulator('grant_extension', t)).toBe(false);
      expect(crossesIntoRegulator('begin_penalty', t)).toBe(false);
      expect(crossesIntoRegulator('close_resolved', t)).toBe(false);
    }
  });
  it('slaBreachCrossesIntoRegulator: material + systemic only', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('systemic')).toBe(true);
  });
  it('isReportable surfaces large tier OR systemic-carrier', () => {
    expect(isReportable('minor', false)).toBe(false);
    expect(isReportable('minor', true)).toBe(true);
    expect(isReportable('material', false)).toBe(true);
    expect(isReportable('systemic', false)).toBe(true);
  });
});

describe('actor party (audit attribution)', () => {
  it('settlement_ops owns the operational record/begin/close steps', () => {
    expect(partyForAction('record_fail')).toBe('settlement_ops');
    expect(partyForAction('begin_penalty')).toBe('settlement_ops');
    expect(partyForAction('close_resolved')).toBe('settlement_ops');
  });
  it('trader_desk owns extension/buy-in initiation/FM control', () => {
    expect(partyForAction('grant_extension')).toBe('trader_desk');
    expect(partyForAction('initiate_buy_in')).toBe('trader_desk');
    expect(partyForAction('suspend_force_majeure')).toBe('trader_desk');
  });
  it('buy_in_agent owns the buy-in execution + settlement', () => {
    expect(partyForAction('execute_buy_in')).toBe('buy_in_agent');
    expect(partyForAction('settle_buy_in')).toBe('buy_in_agent');
  });
  it('counterparty_credit owns disputes + write-off', () => {
    expect(partyForAction('raise_dispute')).toBe('counterparty_credit');
    expect(partyForAction('write_off')).toBe('counterparty_credit');
  });
});

describe('CSDR-equivalent penalty rates', () => {
  it('equity-like = 1bp/day', () => {
    expect(PENALTY_RATE_PER_DAY.equity).toBeCloseTo(0.0001);
    expect(PENALTY_RATE_PER_DAY.derivative).toBeCloseTo(0.0001);
  });
  it('fixed-income + ETFs = 0.5bp/day', () => {
    expect(PENALTY_RATE_PER_DAY.bond).toBeCloseTo(0.00005);
    expect(PENALTY_RATE_PER_DAY.etf).toBeCloseTo(0.00005);
  });
  it('cash-equivalents lowest', () => {
    expect(PENALTY_RATE_PER_DAY.cash_equivalent).toBeLessThan(PENALTY_RATE_PER_DAY.bond);
  });
});

describe('age + buy-in helpers', () => {
  it('failAgeDays floors at +0 on settle-day', () => {
    const s = new Date('2026-05-29T00:00:00Z');
    expect(failAgeDays(s, new Date('2026-05-29T12:00:00Z'))).toBe(0);
    expect(failAgeDays(s, new Date('2026-05-30T00:00:00Z'))).toBe(1);
    expect(failAgeDays(s, new Date('2026-06-05T00:00:00Z'))).toBe(7);
  });
  it('accruedPenaltyZar scales linearly with age, capped at 30 days', () => {
    const five = accruedPenaltyZar(1_000_000, 'equity', 5);
    const ten = accruedPenaltyZar(1_000_000, 'equity', 10);
    expect(ten).toBeCloseTo(2 * five);
    const thirty = accruedPenaltyZar(1_000_000, 'equity', 30);
    const sixty = accruedPenaltyZar(1_000_000, 'equity', 60);
    expect(sixty).toBeCloseTo(thirty);
  });
  it('bond buy-in window is 7 days; default is 4', () => {
    expect(buyInWindowRemainingDays(0, 'equity')).toBe(4);
    expect(buyInWindowRemainingDays(0, 'bond')).toBe(7);
    expect(buyInWindowRemainingDays(5, 'equity')).toBe(-1);
  });
});

describe('counterparty risk helpers', () => {
  it('recoveryRate is clean/total', () => {
    expect(recoveryRate(7, 10)).toBeCloseTo(0.7);
    expect(recoveryRate(0, 0)).toBe(0);
  });
  it('penaltyToNavRatio clamps', () => {
    expect(penaltyToNavRatio(50_000, 1_000_000)).toBeCloseTo(0.05);
    expect(penaltyToNavRatio(50_000, 0)).toBe(0);
  });
  it('counterpartyConcentration clamps 0..1', () => {
    expect(counterpartyConcentration(100, 1000)).toBeCloseTo(0.1);
    expect(counterpartyConcentration(2000, 1000)).toBe(1);
    expect(counterpartyConcentration(100, 0)).toBe(0);
  });
  it('repeatFailScore caps at 100', () => {
    expect(repeatFailScore(0)).toBe(0);
    expect(repeatFailScore(10)).toBe(50);
    expect(repeatFailScore(25)).toBe(100);
  });
  it('crossDefaultRiskFlag triggers at 3+ open fails', () => {
    expect(crossDefaultRiskFlag(2)).toBe(false);
    expect(crossDefaultRiskFlag(3)).toBe(true);
    expect(crossDefaultRiskFlag(8)).toBe(true);
  });
});

describe('urgency + prediction', () => {
  it('urgencyBand reaches critical fastest for systemic tier', () => {
    expect(urgencyBand(0, 'systemic')).toBe('amber');
    expect(urgencyBand(1, 'systemic')).toBe('red');
    expect(urgencyBand(3, 'systemic')).toBe('critical');
    expect(urgencyBand(0, 'minor')).toBe('green');
    expect(urgencyBand(14, 'minor')).toBe('critical');
  });
  it('predictedResolutionDays drops with progress', () => {
    const fromFail = predictedResolutionDays('fail_recorded', 'standard');
    const fromBuyIn = predictedResolutionDays('buy_in_initiated', 'standard');
    expect(fromFail).toBeGreaterThan(fromBuyIn);
  });
  it('predictedResolutionDays returns 0 for terminals', () => {
    expect(predictedResolutionDays('closed_resolved', 'minor')).toBe(0);
    expect(predictedResolutionDays('written_off', 'systemic')).toBe(0);
  });
  it('substituteInventoryAvailable needs alt ≥ fail and fail>0', () => {
    expect(substituteInventoryAvailable(100, 50)).toBe(true);
    expect(substituteInventoryAvailable(50, 100)).toBe(false);
    expect(substituteInventoryAvailable(100, 0)).toBe(false);
  });
});
