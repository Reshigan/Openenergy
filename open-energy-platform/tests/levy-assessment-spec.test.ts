import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, isWithdrawable, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForLevyAmount, assessedLevyAmount, outstandingBalance, arrearsBucket,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isLargeTier, partyForAction, eventForAction,
  type LevyStatus, type LevyTier, type LevyAction,
} from '../src/utils/levy-assessment-spec';

describe('W74 NERSA levy assessment & collection chain — state machine', () => {
  it('happy path: assessed→review→invoiced→payable→settled', () => {
    let s: LevyStatus = 'levy_assessed';
    s = nextStatus(s, 'review_assessment')!; expect(s).toBe('assessment_review');
    s = nextStatus(s, 'issue_invoice')!;     expect(s).toBe('invoiced');
    s = nextStatus(s, 'confirm_payable')!;   expect(s).toBe('payment_pending');
    s = nextStatus(s, 'record_settlement')!; expect(s).toBe('settled');
    expect(isTerminal('settled')).toBe(true);
  });

  it('objection branch: invoiced→objection_review→payment_pending', () => {
    expect(nextStatus('invoiced', 'record_objection')).toBe('objection_review');
    expect(nextStatus('objection_review', 'resolve_objection')).toBe('payment_pending');
    expect(nextStatus('objection_review', 'confirm_payable')).toBeNull();
  });

  it('arrears / dunning branch: payment_pending→in_arrears→final_demand→enforcement', () => {
    let s: LevyStatus = 'payment_pending';
    s = nextStatus(s, 'flag_arrears')!;          expect(s).toBe('in_arrears');
    s = nextStatus(s, 'issue_final_demand')!;    expect(s).toBe('final_demand');
    s = nextStatus(s, 'escalate_enforcement')!;  expect(s).toBe('enforcement');
    s = nextStatus(s, 'record_settlement')!;     expect(s).toBe('settled');
  });

  it('partial payment loops on partially_paid and can still arrears / settle', () => {
    expect(nextStatus('payment_pending', 'record_partial_payment')).toBe('partially_paid');
    expect(nextStatus('partially_paid', 'record_partial_payment')).toBe('partially_paid');
    expect(nextStatus('in_arrears', 'record_partial_payment')).toBe('partially_paid');
    expect(nextStatus('final_demand', 'record_partial_payment')).toBe('partially_paid');
    expect(nextStatus('partially_paid', 'flag_arrears')).toBe('in_arrears');
    expect(nextStatus('partially_paid', 'record_settlement')).toBe('settled');
  });

  it('flag_arrears reachable only from payment_pending and partially_paid', () => {
    expect(nextStatus('payment_pending', 'flag_arrears')).toBe('in_arrears');
    expect(nextStatus('partially_paid', 'flag_arrears')).toBe('in_arrears');
    expect(nextStatus('invoiced', 'flag_arrears')).toBeNull();
    expect(nextStatus('final_demand', 'flag_arrears')).toBeNull();
  });

  it('issue_final_demand only from in_arrears', () => {
    expect(nextStatus('in_arrears', 'issue_final_demand')).toBe('final_demand');
    expect(nextStatus('payment_pending', 'issue_final_demand')).toBeNull();
    expect(nextStatus('partially_paid', 'issue_final_demand')).toBeNull();
  });

  it('escalate_enforcement only from final_demand', () => {
    expect(nextStatus('final_demand', 'escalate_enforcement')).toBe('enforcement');
    expect(nextStatus('in_arrears', 'escalate_enforcement')).toBeNull();
  });

  it('write_off only from enforcement', () => {
    expect(nextStatus('enforcement', 'write_off')).toBe('written_off');
    expect(nextStatus('final_demand', 'write_off')).toBeNull();
    expect(isTerminal('written_off')).toBe(true);
  });

  it('record_settlement reachable from every live billable state', () => {
    expect(nextStatus('payment_pending', 'record_settlement')).toBe('settled');
    expect(nextStatus('partially_paid', 'record_settlement')).toBe('settled');
    expect(nextStatus('in_arrears', 'record_settlement')).toBe('settled');
    expect(nextStatus('final_demand', 'record_settlement')).toBe('settled');
    expect(nextStatus('enforcement', 'record_settlement')).toBe('settled');
    expect(nextStatus('invoiced', 'record_settlement')).toBeNull();
  });

  it('withdraw reachable only from pre-payment states', () => {
    expect(nextStatus('levy_assessed', 'withdraw_assessment')).toBe('withdrawn');
    expect(nextStatus('assessment_review', 'withdraw_assessment')).toBe('withdrawn');
    expect(nextStatus('invoiced', 'withdraw_assessment')).toBe('withdrawn');
    expect(nextStatus('objection_review', 'withdraw_assessment')).toBe('withdrawn');
    expect(nextStatus('payment_pending', 'withdraw_assessment')).toBeNull();
    expect(nextStatus('in_arrears', 'withdraw_assessment')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('no transition out of any terminal state', () => {
    for (const term of ['settled', 'written_off', 'withdrawn'] as LevyStatus[]) {
      expect(isTerminal(term)).toBe(true);
      for (const a of Object.keys(TRANSITIONS) as LevyAction[]) {
        expect(nextStatus(term, a)).toBeNull();
      }
    }
  });

  it('isWithdrawable matches the WITHDRAWABLE set', () => {
    expect(isWithdrawable('levy_assessed')).toBe(true);
    expect(isWithdrawable('invoiced')).toBe(true);
    expect(isWithdrawable('objection_review')).toBe(true);
    expect(isWithdrawable('payment_pending')).toBe(false);
    expect(isWithdrawable('enforcement')).toBe(false);
  });

  it('allowedActions reflect the transition table', () => {
    expect(allowedActions('levy_assessed').sort()).toEqual(['review_assessment', 'withdraw_assessment'].sort());
    expect(allowedActions('invoiced').sort()).toEqual(['confirm_payable', 'record_objection', 'withdraw_assessment'].sort());
    expect(allowedActions('final_demand').sort()).toEqual(['escalate_enforcement', 'record_partial_payment', 'record_settlement'].sort());
    expect(allowedActions('settled')).toEqual([]);
  });

  it('every action has a valid transition entry', () => {
    const actions: LevyAction[] = [
      'review_assessment', 'issue_invoice', 'record_objection', 'resolve_objection',
      'confirm_payable', 'record_partial_payment', 'flag_arrears', 'issue_final_demand',
      'escalate_enforcement', 'record_settlement', 'write_off', 'withdraw_assessment',
    ];
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
      expect(TRANSITIONS[a].from.length).toBeGreaterThan(0);
    }
  });
});

describe('W74 levy chain — tiering by assessed amount (ZAR)', () => {
  it('tierForLevyAmount boundaries', () => {
    expect(tierForLevyAmount(50000)).toBe('micro');
    expect(tierForLevyAmount(99999)).toBe('micro');
    expect(tierForLevyAmount(100000)).toBe('small');
    expect(tierForLevyAmount(999999)).toBe('small');
    expect(tierForLevyAmount(1000000)).toBe('medium');
    expect(tierForLevyAmount(9999999)).toBe('medium');
    expect(tierForLevyAmount(10000000)).toBe('large');
    expect(tierForLevyAmount(49999999)).toBe('large');
    expect(tierForLevyAmount(50000000)).toBe('major');
    expect(tierForLevyAmount(250000000)).toBe('major');
  });

  it('isLargeTier only for large + major', () => {
    expect(isLargeTier('micro')).toBe(false);
    expect(isLargeTier('small')).toBe(false);
    expect(isLargeTier('medium')).toBe(false);
    expect(isLargeTier('large')).toBe(true);
    expect(isLargeTier('major')).toBe(true);
  });
});

describe('W74 levy chain — auto-assessment helpers', () => {
  it('turnover_based assesses a fraction of declared turnover', () => {
    // 0.0025 of R400m turnover = R1m
    expect(assessedLevyAmount('turnover_based', 400000000, 0.0025)).toBe(1000000);
  });

  it('volume_based assesses rate per declared throughput unit', () => {
    // R0.50 per MWh on 2,000,000 MWh = R1m
    expect(assessedLevyAmount('volume_based', 2000000, 0.5)).toBe(1000000);
  });

  it('fixed uses the flat rate and ignores the base', () => {
    expect(assessedLevyAmount('fixed', 999, 75000)).toBe(75000);
    expect(assessedLevyAmount('fixed', 0, 75000)).toBe(75000);
  });

  it('assessed amount never negative and is rounded', () => {
    expect(assessedLevyAmount('turnover_based', -100, 0.01)).toBe(0);
    expect(assessedLevyAmount('turnover_based', 333, 0.1)).toBe(33);
  });

  it('outstandingBalance subtracts payments to date, floored at zero', () => {
    expect(outstandingBalance(1000000, 250000)).toBe(750000);
    expect(outstandingBalance(1000000, 1000000)).toBe(0);
    expect(outstandingBalance(1000000, 1200000)).toBe(0);
  });

  it('arrearsBucket ages the debt', () => {
    expect(arrearsBucket(0)).toBe('current');
    expect(arrearsBucket(-5)).toBe('current');
    expect(arrearsBucket(15)).toBe('b30');
    expect(arrearsBucket(30)).toBe('b30');
    expect(arrearsBucket(45)).toBe('b60');
    expect(arrearsBucket(75)).toBe('b90');
    expect(arrearsBucket(200)).toBe('b120plus');
  });
});

describe('W74 levy chain — URGENT SLA matrix (larger levy = tighter)', () => {
  it('each live state tightens monotonically from micro→major', () => {
    const live: LevyStatus[] = [
      'levy_assessed', 'assessment_review', 'invoiced', 'objection_review',
      'payment_pending', 'partially_paid', 'in_arrears', 'final_demand', 'enforcement',
    ];
    const order: LevyTier[] = ['micro', 'small', 'medium', 'large', 'major'];
    for (const s of live) {
      for (let i = 1; i < order.length; i++) {
        expect(SLA_MINUTES[s][order[i]]).toBeLessThanOrEqual(SLA_MINUTES[s][order[i - 1]]);
      }
      expect(SLA_MINUTES[s].major).toBeLessThan(SLA_MINUTES[s].micro);
    }
  });

  it('terminal states carry no SLA', () => {
    for (const s of ['settled', 'written_off', 'withdrawn'] as LevyStatus[]) {
      for (const t of ['micro', 'small', 'medium', 'large', 'major'] as LevyTier[]) {
        expect(SLA_MINUTES[s][t]).toBe(0);
        expect(slaWindowMinutes(s, t)).toBe(0);
      }
    }
  });

  it('slaDeadlineFor adds the window; null on terminals', () => {
    const base = new Date('2026-05-29T00:00:00Z');
    const d = slaDeadlineFor('final_demand', 'major', base);
    expect(d).not.toBeNull();
    expect(d!.getTime()).toBe(base.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(slaDeadlineFor('settled', 'major', base)).toBeNull();
  });

  it('slaWindowMinutes returns the matrix value', () => {
    expect(slaWindowMinutes('invoiced', 'micro')).toBe(60 * 24 * 60);
    expect(slaWindowMinutes('invoiced', 'major')).toBe(14 * 24 * 60);
  });
});

describe('W74 levy chain — reportability (Council oversight crossings)', () => {
  it('escalate_enforcement crosses for EVERY tier — the W74 signature', () => {
    for (const t of ['micro', 'small', 'medium', 'large', 'major'] as LevyTier[]) {
      expect(crossesIntoRegulator('escalate_enforcement', t)).toBe(true);
    }
  });

  it('write_off crosses for EVERY tier', () => {
    for (const t of ['micro', 'small', 'medium', 'large', 'major'] as LevyTier[]) {
      expect(crossesIntoRegulator('write_off', t)).toBe(true);
    }
  });

  it('issue_final_demand crosses only for large + major', () => {
    expect(crossesIntoRegulator('issue_final_demand', 'micro')).toBe(false);
    expect(crossesIntoRegulator('issue_final_demand', 'small')).toBe(false);
    expect(crossesIntoRegulator('issue_final_demand', 'medium')).toBe(false);
    expect(crossesIntoRegulator('issue_final_demand', 'large')).toBe(true);
    expect(crossesIntoRegulator('issue_final_demand', 'major')).toBe(true);
  });

  it('routine actions do not cross', () => {
    expect(crossesIntoRegulator('review_assessment', 'major')).toBe(false);
    expect(crossesIntoRegulator('issue_invoice', 'major')).toBe(false);
    expect(crossesIntoRegulator('confirm_payable', 'major')).toBe(false);
    expect(crossesIntoRegulator('record_settlement', 'major')).toBe(false);
    expect(crossesIntoRegulator('record_objection', 'major')).toBe(false);
  });

  it('SLA breach crosses only for large + major', () => {
    expect(slaBreachCrossesIntoRegulator('micro')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('large')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
  });
});

describe('W74 levy chain — party attribution + event mapping', () => {
  it('licensee actions: objection + payments', () => {
    expect(partyForAction('record_objection')).toBe('licensee');
    expect(partyForAction('record_partial_payment')).toBe('licensee');
    expect(partyForAction('record_settlement')).toBe('licensee');
  });

  it('regulator actions: assessment / collection lifecycle', () => {
    expect(partyForAction('review_assessment')).toBe('regulator');
    expect(partyForAction('issue_invoice')).toBe('regulator');
    expect(partyForAction('resolve_objection')).toBe('regulator');
    expect(partyForAction('confirm_payable')).toBe('regulator');
    expect(partyForAction('flag_arrears')).toBe('regulator');
    expect(partyForAction('issue_final_demand')).toBe('regulator');
    expect(partyForAction('escalate_enforcement')).toBe('regulator');
    expect(partyForAction('write_off')).toBe('regulator');
    expect(partyForAction('withdraw_assessment')).toBe('regulator');
  });

  it('eventForAction maps both objection-resolve and confirm-payable to payment_pending', () => {
    expect(eventForAction('resolve_objection')).toBe('regulator_levy.payment_pending');
    expect(eventForAction('confirm_payable')).toBe('regulator_levy.payment_pending');
  });

  it('eventForAction maps terminal actions', () => {
    expect(eventForAction('record_settlement')).toBe('regulator_levy.settled');
    expect(eventForAction('write_off')).toBe('regulator_levy.written_off');
    expect(eventForAction('withdraw_assessment')).toBe('regulator_levy.withdrawn');
    expect(eventForAction('escalate_enforcement')).toBe('regulator_levy.enforcement');
  });
});
