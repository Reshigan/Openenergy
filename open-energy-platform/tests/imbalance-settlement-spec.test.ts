// W105 — Grid Wholesale Imbalance Settlement & MTU Pricing chain spec tests.
import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  SLA_MINUTES,
  allowedActions,
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaWindowMinutes,
  slaDeadlineFor,
  tierForQuantum,
  countFloorFlags,
  floorAtMaterial,
  floorAtSystemic,
  effectiveTier,
  isHeavyTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  imbalanceDirection,
  imbalancePriceApplied,
  imbalanceChargeZar,
  penaltyZar,
  totalOwedZar,
  settlementCompletenessIndex,
  slaDaysRemaining,
  urgencyBand,
  breachImminentFlag,
  daysToDisputeWindowClose,
  authorityRequired,
  regulatorFilingWindowHours,
  bridgesToDispatchChain,
  bridgesToReserveActivationChain,
  agedArrearsBucket,
} from '../src/utils/imbalance-settlement-spec';

describe('W105 Imbalance Settlement — state machine (12 lifecycle states)', () => {
  it('forward path period_open → archived', () => {
    let s = nextStatus('period_open', 'receive_meter_data');               expect(s).toBe('meter_data_received');
    s = nextStatus(s!, 'reconcile_nominations');                           expect(s).toBe('nominations_reconciled');
    s = nextStatus(s!, 'compute_imbalance');                               expect(s).toBe('imbalance_computed');
    s = nextStatus(s!, 'price_imbalance');                                 expect(s).toBe('priced');
    s = nextStatus(s!, 'issue_invoice');                                   expect(s).toBe('invoice_issued');
    s = nextStatus(s!, 'acknowledge_invoice');                             expect(s).toBe('invoice_acknowledged');
    s = nextStatus(s!, 'open_dispute_window');                             expect(s).toBe('dispute_window_open');
    s = nextStatus(s!, 'record_payment');                                  expect(s).toBe('payment_pending');
    s = nextStatus(s!, 'mark_settled');                                    expect(s).toBe('settled');
    s = nextStatus(s!, 'archive_period');                                  expect(s).toBe('archived');
  });

  it('dispute branch: dispute_window_open → disputed → resolved_dispute → invoice_revised → invoice_issued', () => {
    let s = nextStatus('dispute_window_open', 'raise_dispute');            expect(s).toBe('disputed');
    s = nextStatus(s!, 'resolve_dispute');                                 expect(s).toBe('resolved_dispute');
    s = nextStatus(s!, 'revise_invoice');                                  expect(s).toBe('invoice_revised');
    s = nextStatus(s!, 'issue_invoice');                                   expect(s).toBe('invoice_issued');
  });

  it('record_payment can fire from multiple states (dispute window / pending / aged_arrears)', () => {
    expect(nextStatus('dispute_window_open', 'record_payment')).toBe('payment_pending');
    expect(nextStatus('payment_pending', 'record_payment')).toBe('payment_pending');
    expect(nextStatus('aged_arrears', 'record_payment')).toBe('payment_pending');
    expect(nextStatus('invoice_issued', 'record_payment')).toBe('payment_pending');
  });

  it('cancel_period fires from every non-terminal state', () => {
    const cancellable = [
      'period_open', 'meter_data_received', 'nominations_reconciled',
      'imbalance_computed', 'priced', 'invoice_issued', 'invoice_acknowledged',
      'dispute_window_open', 'payment_pending', 'disputed', 'resolved_dispute',
      'invoice_revised', 'aged_arrears',
    ] as const;
    for (const s of cancellable) {
      expect(nextStatus(s, 'cancel_period')).toBe('cancelled');
    }
  });

  it('hard terminals (archived, cancelled) reject every action', () => {
    for (const t of ['archived', 'cancelled'] as const) {
      expect(nextStatus(t, 'receive_meter_data')).toBeNull();
      expect(nextStatus(t, 'record_payment')).toBeNull();
      expect(nextStatus(t, 'cancel_period')).toBeNull();
      expect(isHardTerminal(t)).toBe(true);
      expect(isTerminal(t)).toBe(true);
    }
  });

  it('settled is a SOFT terminal — UI-terminal but accepts archive_period to reach hard archived', () => {
    expect(isTerminal('settled')).toBe(true);
    expect(isHardTerminal('settled')).toBe(false);
    expect(nextStatus('settled', 'archive_period')).toBe('archived');
    // any other action from settled is rejected
    expect(nextStatus('settled', 'receive_meter_data')).toBeNull();
    expect(nextStatus('settled', 'record_payment')).toBeNull();
    expect(nextStatus('settled', 'cancel_period')).toBeNull();
  });

  it('non-terminal states are NOT marked terminal', () => {
    for (const s of ['period_open', 'priced', 'invoice_issued', 'payment_pending', 'disputed', 'aged_arrears'] as const) {
      expect(isTerminal(s)).toBe(false);
      expect(isHardTerminal(s)).toBe(false);
    }
  });

  it('allowedActions surfaces every legal action per state', () => {
    expect(allowedActions('period_open')).toContain('receive_meter_data');
    expect(allowedActions('period_open')).toContain('cancel_period');
    expect(allowedActions('meter_data_received')).toContain('reconcile_nominations');
    expect(allowedActions('dispute_window_open')).toContain('raise_dispute');
    expect(allowedActions('dispute_window_open')).toContain('record_payment');
    expect(allowedActions('payment_pending')).toContain('mark_settled');
    expect(allowedActions('settled')).toEqual(['archive_period']);
    expect(allowedActions('archived')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
  });

  it('TRANSITIONS table covers all 14 actions exactly once', () => {
    const actionKeys = Object.keys(TRANSITIONS).sort();
    expect(actionKeys).toEqual([
      'acknowledge_invoice', 'archive_period', 'cancel_period',
      'compute_imbalance', 'issue_invoice', 'mark_settled',
      'open_dispute_window', 'price_imbalance', 'raise_dispute',
      'receive_meter_data', 'reconcile_nominations', 'record_payment',
      'resolve_dispute', 'revise_invoice',
    ]);
  });
});

describe('W105 Imbalance Settlement — URGENT SLA polarity (larger imbalance = TIGHTER)', () => {
  it('SLA decreases strictly minor → systemic for every graded state', () => {
    for (const status of [
      'period_open', 'meter_data_received', 'nominations_reconciled',
      'imbalance_computed', 'priced', 'invoice_issued', 'invoice_acknowledged',
      'dispute_window_open', 'disputed', 'resolved_dispute', 'invoice_revised',
      'payment_pending', 'aged_arrears',
    ] as const) {
      const row = SLA_MINUTES[status];
      expect(row.minor).toBeGreaterThan(row.standard);
      expect(row.standard).toBeGreaterThan(row.material);
      expect(row.material).toBeGreaterThan(row.systemic);
    }
  });

  it('period_open systemic 12h / material 48h / standard 7d / minor 14d (signature SLA)', () => {
    expect(SLA_MINUTES.period_open.systemic).toBe(12 * 60);
    expect(SLA_MINUTES.period_open.material).toBe(48 * 60);
    expect(SLA_MINUTES.period_open.standard).toBe(7 * 24 * 60);
    expect(SLA_MINUTES.period_open.minor).toBe(14 * 24 * 60);
  });

  it('terminals carry no SLA deadline', () => {
    for (const t of ['settled', 'archived', 'cancelled'] as const) {
      expect(slaWindowMinutes(t, 'minor')).toBe(0);
      expect(slaWindowMinutes(t, 'systemic')).toBe(0);
      expect(slaDeadlineFor(t, 'systemic', new Date())).toBeNull();
    }
  });

  it('slaDeadlineFor advances by the configured window', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const d = slaDeadlineFor('period_open', 'systemic', t0)!;
    expect(d.toISOString()).toBe('2026-05-30T12:00:00.000Z');
    const d2 = slaDeadlineFor('period_open', 'minor', t0)!;
    expect(d2.toISOString()).toBe('2026-06-13T00:00:00.000Z');
  });
});

describe('W105 Imbalance Settlement — tier re-derivation from quantum', () => {
  it('tierForQuantum band boundaries', () => {
    expect(tierForQuantum(0)).toBe('minor');
    expect(tierForQuantum(99999)).toBe('minor');
    expect(tierForQuantum(100000)).toBe('standard');
    expect(tierForQuantum(999999)).toBe('standard');
    expect(tierForQuantum(1000000)).toBe('material');
    expect(tierForQuantum(9999999)).toBe('material');
    expect(tierForQuantum(10000000)).toBe('systemic');
    expect(tierForQuantum(100000000)).toBe('systemic');
  });

  it('tierForQuantum defends against null / negative / NaN', () => {
    expect(tierForQuantum(null)).toBe('minor');
    expect(tierForQuantum(undefined)).toBe('minor');
    expect(tierForQuantum(-5)).toBe('minor');
    expect(tierForQuantum(Number.NaN)).toBe('minor');
  });

  it('countFloorFlags counts truthy floors across all 5', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ imbalance_floor_flag_regulator_audit_period: 1 })).toBe(1);
    expect(countFloorFlags({
      imbalance_floor_flag_regulator_audit_period: 1,
      imbalance_floor_flag_market_suspension_active: 1,
      imbalance_floor_flag_repeated_breach_5plus: 1,
    })).toBe(3);
  });

  it('floorAtMaterial fires on any one of the five flags', () => {
    expect(floorAtMaterial({})).toBe(false);
    expect(floorAtMaterial({ imbalance_floor_flag_high_voltage_brp: true })).toBe(true);
    expect(floorAtMaterial({ imbalance_floor_flag_system_critical_period: true })).toBe(true);
    expect(floorAtMaterial({ imbalance_floor_flag_regulator_audit_period: true })).toBe(true);
    expect(floorAtMaterial({ imbalance_floor_flag_market_suspension_active: true })).toBe(true);
    expect(floorAtMaterial({ imbalance_floor_flag_repeated_breach_5plus: true })).toBe(true);
  });

  it('floorAtSystemic fires only on HV BRP OR system_critical_period', () => {
    expect(floorAtSystemic({})).toBe(false);
    expect(floorAtSystemic({ imbalance_floor_flag_high_voltage_brp: true })).toBe(true);
    expect(floorAtSystemic({ imbalance_floor_flag_system_critical_period: true })).toBe(true);
    expect(floorAtSystemic({ imbalance_floor_flag_regulator_audit_period: true })).toBe(false);
    expect(floorAtSystemic({ imbalance_floor_flag_market_suspension_active: true })).toBe(false);
    expect(floorAtSystemic({ imbalance_floor_flag_repeated_breach_5plus: true })).toBe(false);
  });

  it('effectiveTier: 1 floor flag promotes minor+standard to material', () => {
    expect(effectiveTier('minor', { imbalance_floor_flag_regulator_audit_period: 1 })).toBe('material');
    expect(effectiveTier('standard', { imbalance_floor_flag_market_suspension_active: 1 })).toBe('material');
    expect(effectiveTier('material', { imbalance_floor_flag_regulator_audit_period: 1 })).toBe('material');
    expect(effectiveTier('systemic', { imbalance_floor_flag_regulator_audit_period: 1 })).toBe('systemic');
  });

  it('effectiveTier: 2+ floor flags → systemic', () => {
    expect(effectiveTier('minor', {
      imbalance_floor_flag_regulator_audit_period: 1,
      imbalance_floor_flag_market_suspension_active: 1,
    })).toBe('systemic');
    expect(effectiveTier('standard', {
      imbalance_floor_flag_regulator_audit_period: 1,
      imbalance_floor_flag_market_suspension_active: 1,
      imbalance_floor_flag_repeated_breach_5plus: 1,
    })).toBe('systemic');
  });

  it('effectiveTier: systemic floor flags force systemic regardless of raw tier', () => {
    expect(effectiveTier('minor', { imbalance_floor_flag_high_voltage_brp: 1 })).toBe('systemic');
    expect(effectiveTier('minor', { imbalance_floor_flag_system_critical_period: 1 })).toBe('systemic');
    expect(effectiveTier('standard', { imbalance_floor_flag_high_voltage_brp: 1 })).toBe('systemic');
  });

  it('effectiveTier: no flags returns raw tier', () => {
    expect(effectiveTier('minor', {})).toBe('minor');
    expect(effectiveTier('standard', {})).toBe('standard');
    expect(effectiveTier('material', {})).toBe('material');
    expect(effectiveTier('systemic', {})).toBe('systemic');
  });

  it('isHeavyTier identifies material + systemic only', () => {
    expect(isHeavyTier('minor')).toBe(false);
    expect(isHeavyTier('standard')).toBe(false);
    expect(isHeavyTier('material')).toBe(true);
    expect(isHeavyTier('systemic')).toBe(true);
  });

  it('isReportable matches heavy tiers', () => {
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('material')).toBe(true);
    expect(isReportable('systemic')).toBe(true);
  });
});

describe('W105 Imbalance Settlement — SIGNATURE regulator crossings', () => {
  it('raise_dispute crosses regulator EVERY tier when high_voltage_brp=TRUE (signature)', () => {
    for (const tier of ['minor', 'standard', 'material', 'systemic'] as const) {
      expect(crossesIntoRegulator('raise_dispute', tier, {
        imbalance_floor_flag_high_voltage_brp: true,
      })).toBe(true);
    }
  });

  it('raise_dispute does NOT cross when high_voltage_brp=false', () => {
    for (const tier of ['minor', 'standard', 'material', 'systemic'] as const) {
      expect(crossesIntoRegulator('raise_dispute', tier, {
        imbalance_floor_flag_high_voltage_brp: false,
      })).toBe(false);
    }
  });

  it('mark_settled crosses regulator on material + systemic when penalty > 0', () => {
    expect(crossesIntoRegulator('mark_settled', 'material', { penalty_zar: 10000 })).toBe(true);
    expect(crossesIntoRegulator('mark_settled', 'systemic', { penalty_zar: 10000 })).toBe(true);
    expect(crossesIntoRegulator('mark_settled', 'minor', { penalty_zar: 10000 })).toBe(false);
    expect(crossesIntoRegulator('mark_settled', 'standard', { penalty_zar: 10000 })).toBe(false);
  });

  it('mark_settled does NOT cross when penalty is zero', () => {
    expect(crossesIntoRegulator('mark_settled', 'systemic', { penalty_zar: 0 })).toBe(false);
    expect(crossesIntoRegulator('mark_settled', 'material', { penalty_zar: 0 })).toBe(false);
  });

  it('aged_arrears crosses regulator EVERY tier when arrears_days >= 60', () => {
    for (const tier of ['minor', 'standard', 'material', 'systemic'] as const) {
      expect(crossesIntoRegulator('aged_arrears', tier, { arrears_days: 60 })).toBe(true);
      expect(crossesIntoRegulator('aged_arrears', tier, { arrears_days: 120 })).toBe(true);
      expect(crossesIntoRegulator('aged_arrears', tier, { arrears_days: 30 })).toBe(false);
    }
  });

  it('cancel_period crosses regulator EVERY tier when imbalance_mwh != 0', () => {
    for (const tier of ['minor', 'standard', 'material', 'systemic'] as const) {
      expect(crossesIntoRegulator('cancel_period', tier, { imbalance_mwh: 5.5 })).toBe(true);
      expect(crossesIntoRegulator('cancel_period', tier, { imbalance_mwh: -5.5 })).toBe(true);
      expect(crossesIntoRegulator('cancel_period', tier, { imbalance_mwh: 0 })).toBe(false);
    }
  });

  it('other actions never cross regulator on their own', () => {
    for (const action of ['receive_meter_data', 'compute_imbalance', 'price_imbalance', 'issue_invoice', 'acknowledge_invoice', 'open_dispute_window', 'record_payment', 'resolve_dispute', 'archive_period'] as const) {
      expect(crossesIntoRegulator(action, 'systemic', {
        imbalance_floor_flag_high_voltage_brp: true,
        penalty_zar: 10000,
        arrears_days: 90,
        imbalance_mwh: 5,
      })).toBe(false);
    }
  });

  it('slaBreachCrossesIntoRegulator on material + systemic', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('systemic')).toBe(true);
  });
});

describe('W105 Imbalance Settlement — party + event mapping', () => {
  it('system_operator drives receive/reconcile/compute/price/cancel', () => {
    expect(partyForAction('receive_meter_data')).toBe('system_operator');
    expect(partyForAction('reconcile_nominations')).toBe('system_operator');
    expect(partyForAction('compute_imbalance')).toBe('system_operator');
    expect(partyForAction('price_imbalance')).toBe('system_operator');
    expect(partyForAction('cancel_period')).toBe('system_operator');
  });

  it('settlement_admin drives invoice issue/revise/mark_settled', () => {
    expect(partyForAction('issue_invoice')).toBe('settlement_admin');
    expect(partyForAction('open_dispute_window')).toBe('settlement_admin');
    expect(partyForAction('revise_invoice')).toBe('settlement_admin');
    expect(partyForAction('mark_settled')).toBe('settlement_admin');
  });

  it('brp drives acknowledge / raise_dispute / record_payment', () => {
    expect(partyForAction('acknowledge_invoice')).toBe('brp');
    expect(partyForAction('raise_dispute')).toBe('brp');
    expect(partyForAction('record_payment')).toBe('brp');
  });

  it('reviewer resolves disputes, archiver archives', () => {
    expect(partyForAction('resolve_dispute')).toBe('reviewer');
    expect(partyForAction('archive_period')).toBe('archiver');
  });

  it('eventTypeFor returns an imbalance_settlement.* event for every action', () => {
    expect(eventTypeFor('receive_meter_data')).toBe('imbalance_settlement.meter_data_received');
    expect(eventTypeFor('compute_imbalance')).toBe('imbalance_settlement.imbalance_computed');
    expect(eventTypeFor('price_imbalance')).toBe('imbalance_settlement.priced');
    expect(eventTypeFor('issue_invoice')).toBe('imbalance_settlement.invoice_issued');
    expect(eventTypeFor('raise_dispute')).toBe('imbalance_settlement.dispute_raised');
    expect(eventTypeFor('resolve_dispute')).toBe('imbalance_settlement.dispute_resolved');
    expect(eventTypeFor('mark_settled')).toBe('imbalance_settlement.settled');
    expect(eventTypeFor('archive_period')).toBe('imbalance_settlement.archived');
    expect(eventTypeFor('cancel_period')).toBe('imbalance_settlement.cancelled');
  });
});

describe('W105 Imbalance Settlement — imbalance math (direction / price / charge / penalty)', () => {
  it('imbalanceDirection signs MWh into long/short/balanced', () => {
    expect(imbalanceDirection(10)).toBe('long');
    expect(imbalanceDirection(-10)).toBe('short');
    expect(imbalanceDirection(0)).toBe('balanced');
    expect(imbalanceDirection(0.0001)).toBe('balanced'); // dead-band
    expect(imbalanceDirection(null)).toBe('balanced');
  });

  it('imbalancePriceApplied picks long or short price by direction', () => {
    expect(imbalancePriceApplied('long', 800, 1500)).toBe(800);
    expect(imbalancePriceApplied('short', 800, 1500)).toBe(1500);
    expect(imbalancePriceApplied('balanced', 800, 1500)).toBe(0);
  });

  it('imbalanceChargeZar = abs(mwh) × price (always non-negative)', () => {
    expect(imbalanceChargeZar(10, 1500)).toBe(15000);
    expect(imbalanceChargeZar(-10, 1500)).toBe(15000); // abs
    expect(imbalanceChargeZar(0, 1500)).toBe(0);
    expect(imbalanceChargeZar(10, null)).toBe(0);
  });

  it('penaltyZar = charge × (multiplier - 1) when multiplier > 1, else 0', () => {
    expect(penaltyZar(10000, 1.5)).toBe(5000);
    expect(penaltyZar(10000, 1.0)).toBe(0);
    expect(penaltyZar(10000, 0.5)).toBe(0);
    expect(penaltyZar(10000, 2.0)).toBe(10000);
  });

  it('totalOwedZar = charge + penalty', () => {
    expect(totalOwedZar(10000, 5000)).toBe(15000);
    expect(totalOwedZar(10000, 0)).toBe(10000);
    expect(totalOwedZar(null, null)).toBe(0);
  });
});

describe('W105 Imbalance Settlement — LIVE battery (settlement_completeness, urgency, authority)', () => {
  it('settlementCompletenessIndex peaks at 130 with all components', () => {
    expect(settlementCompletenessIndex({
      meter_data_received: true,
      nominations_reconciled: true,
      imbalance_computed: true,
      priced: true,
      invoice_issued: true,
      invoice_acknowledged: true,
      dispute_resolved_or_skip: true,
      payment_received: true,
      archived: true,
      first_cycle_settle_bonus: true,
      no_aged_arrears_bonus: true,
    })).toBe(130);
  });

  it('settlementCompletenessIndex partial component sum', () => {
    expect(settlementCompletenessIndex({
      meter_data_received: true,
      nominations_reconciled: true,
      imbalance_computed: true,
    })).toBe(40);
    expect(settlementCompletenessIndex({})).toBe(0);
  });

  it('slaDaysRemaining can go negative when breached', () => {
    const entered = new Date('2026-05-29T00:00:00Z');
    const now = new Date('2026-05-30T05:00:00Z'); // 29h after entry
    // period_open × systemic = 12h → already 17h past
    const left = slaDaysRemaining('period_open', 'systemic', entered, now);
    expect(left).toBeLessThan(0);
  });

  it('slaDaysRemaining counts down', () => {
    const entered = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-30T06:00:00Z'); // 6h in
    // period_open × material = 48h → 42h = 1.75d left
    const left = slaDaysRemaining('period_open', 'material', entered, now);
    expect(left).toBeGreaterThan(1.6);
    expect(left).toBeLessThan(2.0);
  });

  it('slaDaysRemaining returns 0 for terminals + null entry', () => {
    expect(slaDaysRemaining('settled', 'systemic', new Date(), new Date())).toBe(0);
    expect(slaDaysRemaining('period_open', 'systemic', null, new Date())).toBe(0);
  });

  it('urgencyBand composes tier + SLA days into critical/high/medium/low', () => {
    expect(urgencyBand('systemic', 30)).toBe('critical');
    expect(urgencyBand('material', 30)).toBe('high');
    expect(urgencyBand('standard', 30)).toBe('medium');
    expect(urgencyBand('minor', 30)).toBe('low');
    expect(urgencyBand('minor', -1)).toBe('critical');
    expect(urgencyBand('minor', 0.1)).toBe('critical');
    expect(urgencyBand('minor', 0.5)).toBe('high');
    expect(urgencyBand('minor', 2)).toBe('medium');
  });

  it('breachImminentFlag fires within 12h of deadline', () => {
    expect(breachImminentFlag(0.4)).toBe(true);
    expect(breachImminentFlag(0.1)).toBe(true);
    expect(breachImminentFlag(0.51)).toBe(false);
    expect(breachImminentFlag(-1)).toBe(false);
  });

  it('daysToDisputeWindowClose counts down to dispute close date', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(daysToDisputeWindowClose('2026-06-06T00:00:00Z', now)).toBe(7);
    expect(daysToDisputeWindowClose('2026-05-29T00:00:00Z', now)).toBe(-1);
    expect(daysToDisputeWindowClose(null, now)).toBeNull();
  });

  it('authorityRequired ladder: BRP_back_office → MO_settlement_admin', () => {
    expect(authorityRequired('minor')).toBe('BRP_back_office');
    expect(authorityRequired('standard')).toBe('BRP_finance_manager');
    expect(authorityRequired('material')).toBe('BRP_treasurer');
    expect(authorityRequired('systemic')).toBe('MO_settlement_admin');
  });

  it('regulatorFilingWindowHours tightens with tier', () => {
    expect(regulatorFilingWindowHours('systemic')).toBe(12);
    expect(regulatorFilingWindowHours('material')).toBe(24);
    expect(regulatorFilingWindowHours('standard')).toBe(72);
    expect(regulatorFilingWindowHours('minor')).toBe(168);
  });

  it('bridgesToDispatchChain fires when dispatch_nomination_ref is set (W13)', () => {
    expect(bridgesToDispatchChain(null)).toBe(false);
    expect(bridgesToDispatchChain('')).toBe(false);
    expect(bridgesToDispatchChain('dn-001')).toBe(true);
  });

  it('bridgesToReserveActivationChain fires when reserve_activation_ref is set (W50)', () => {
    expect(bridgesToReserveActivationChain(null)).toBe(false);
    expect(bridgesToReserveActivationChain('')).toBe(false);
    expect(bridgesToReserveActivationChain('ra-001')).toBe(true);
  });

  it('agedArrearsBucket buckets arrears into current/0-30/30-60/60-90/90-120/120+', () => {
    expect(agedArrearsBucket(0)).toBe('current');
    expect(agedArrearsBucket(15)).toBe('0_30');
    expect(agedArrearsBucket(45)).toBe('30_60');
    expect(agedArrearsBucket(75)).toBe('60_90');
    expect(agedArrearsBucket(105)).toBe('90_120');
    expect(agedArrearsBucket(180)).toBe('120_plus');
  });
});
