import { describe, it, expect } from 'vitest';
import {
  nextStatus,
  isTerminal,
  allowedActions,
  slaDeadlineFor,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  SLA_MINUTES,
  type DisbursementStatus,
  type DisbursementAction,
  type DisbursementTier,
} from '../src/utils/disbursement-chain-spec';

describe('disbursement-chain-spec — happy path', () => {
  it('drives tranche_released → reconciled through 6 transitions', () => {
    const path: Array<[DisbursementStatus, DisbursementAction, DisbursementStatus]> = [
      ['tranche_released',   'request_invoices',     'invoices_pending'],
      ['invoices_pending',   'submit_invoices',      'invoices_submitted'],
      ['invoices_submitted', 'begin_validation',     'bank_validating'],
      ['bank_validating',    'request_ie',           'ie_certifying'],
      ['ie_certifying',      'accept_ie',            'uop_certified'],
      ['uop_certified',      'close_reconciliation', 'reconciled'],
    ];
    for (const [from, action, expected] of path) {
      expect(nextStatus(from, action)).toBe(expected);
    }
  });
});

describe('disbursement-chain-spec — clawback branch', () => {
  it('demand_clawback reachable from invoices_submitted/bank_validating/ie_certifying/uop_certified', () => {
    const sources: DisbursementStatus[] = [
      'invoices_submitted', 'bank_validating', 'ie_certifying', 'uop_certified',
    ];
    for (const from of sources) {
      expect(nextStatus(from, 'demand_clawback')).toBe('clawback_executed');
    }
  });
  it('demand_clawback NOT reachable from tranche_released / invoices_pending', () => {
    expect(nextStatus('tranche_released', 'demand_clawback')).toBeNull();
    expect(nextStatus('invoices_pending', 'demand_clawback')).toBeNull();
  });
});

describe('disbursement-chain-spec — waiver branch', () => {
  it('waive only reachable from invoices_pending', () => {
    expect(nextStatus('invoices_pending', 'waive')).toBe('waived');
    expect(nextStatus('tranche_released', 'waive')).toBeNull();
    expect(nextStatus('invoices_submitted', 'waive')).toBeNull();
    expect(nextStatus('bank_validating', 'waive')).toBeNull();
  });
});

describe('disbursement-chain-spec — terminals', () => {
  it('marks reconciled / clawback_executed / waived as terminal', () => {
    expect(isTerminal('reconciled')).toBe(true);
    expect(isTerminal('clawback_executed')).toBe(true);
    expect(isTerminal('waived')).toBe(true);
  });
  it('all forward states are non-terminal', () => {
    const forward: DisbursementStatus[] = [
      'tranche_released', 'invoices_pending', 'invoices_submitted',
      'bank_validating', 'ie_certifying', 'uop_certified',
    ];
    for (const s of forward) expect(isTerminal(s)).toBe(false);
  });
  it('any action from a terminal returns null', () => {
    expect(nextStatus('reconciled', 'request_invoices')).toBeNull();
    expect(nextStatus('clawback_executed', 'submit_invoices')).toBeNull();
    expect(nextStatus('waived', 'begin_validation')).toBeNull();
  });
});

describe('disbursement-chain-spec — allowedActions sanity', () => {
  it('tranche_released allows only request_invoices', () => {
    expect(allowedActions('tranche_released').sort()).toEqual(['request_invoices']);
  });
  it('invoices_pending allows submit_invoices + waive', () => {
    expect(allowedActions('invoices_pending').sort()).toEqual(['submit_invoices', 'waive'].sort());
  });
  it('bank_validating allows request_ie + demand_clawback', () => {
    expect(allowedActions('bank_validating').sort()).toEqual(['demand_clawback', 'request_ie'].sort());
  });
  it('uop_certified allows close_reconciliation + demand_clawback', () => {
    expect(allowedActions('uop_certified').sort()).toEqual(['close_reconciliation', 'demand_clawback'].sort());
  });
});

describe('disbursement-chain-spec — INVERTED SLA matrix', () => {
  it('invoices_pending: senior_a > senior_b > mezzanine > bridge', () => {
    const m = SLA_MINUTES.invoices_pending;
    expect(m.senior_a).toBeGreaterThan(m.senior_b);
    expect(m.senior_b).toBeGreaterThan(m.mezzanine);
    expect(m.mezzanine).toBeGreaterThan(m.bridge);
  });
  it('ie_certifying: senior_a (30d) > bridge (7d)', () => {
    expect(SLA_MINUTES.ie_certifying.senior_a).toBe(30 * 24 * 60);
    expect(SLA_MINUTES.ie_certifying.bridge).toBe(7 * 24 * 60);
  });
  it('terminal states carry zero SLA', () => {
    const tiers: DisbursementTier[] = ['senior_a', 'senior_b', 'mezzanine', 'bridge'];
    for (const t of tiers) {
      expect(SLA_MINUTES.reconciled[t]).toBe(0);
      expect(SLA_MINUTES.clawback_executed[t]).toBe(0);
      expect(SLA_MINUTES.waived[t]).toBe(0);
    }
  });
  it('slaDeadlineFor returns null for terminal states', () => {
    const t = new Date('2026-05-28T00:00:00Z');
    expect(slaDeadlineFor('reconciled', 'senior_a', t)).toBeNull();
    expect(slaDeadlineFor('waived', 'bridge', t)).toBeNull();
  });
  it('slaDeadlineFor adds correct offset for invoices_pending', () => {
    const t = new Date('2026-05-28T00:00:00Z');
    const d = slaDeadlineFor('invoices_pending', 'senior_a', t);
    expect(d).not.toBeNull();
    expect(d!.getTime() - t.getTime()).toBe(60 * 24 * 60 * 60 * 1000);
  });
});

describe('disbursement-chain-spec — regulator crossings', () => {
  it('demand_clawback crosses for ALL tiers', () => {
    const tiers: DisbursementTier[] = ['senior_a', 'senior_b', 'mezzanine', 'bridge'];
    for (const t of tiers) {
      expect(crossesIntoRegulator('demand_clawback', t)).toBe(true);
    }
  });
  it('non-clawback actions never cross', () => {
    const tiers: DisbursementTier[] = ['senior_a', 'senior_b', 'mezzanine', 'bridge'];
    const actions: DisbursementAction[] = [
      'request_invoices', 'submit_invoices', 'begin_validation',
      'request_ie', 'accept_ie', 'close_reconciliation', 'waive',
    ];
    for (const a of actions) for (const t of tiers) {
      expect(crossesIntoRegulator(a, t)).toBe(false);
    }
  });
  it('sla_breached crosses only for senior_a + senior_b', () => {
    expect(slaBreachCrossesIntoRegulator('senior_a')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('senior_b')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('mezzanine')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('bridge')).toBe(false);
  });
  it('isReportable mirrors SLA reportability', () => {
    expect(isReportable('senior_a')).toBe(true);
    expect(isReportable('senior_b')).toBe(true);
    expect(isReportable('mezzanine')).toBe(false);
    expect(isReportable('bridge')).toBe(false);
  });
});
