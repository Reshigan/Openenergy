import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  nextStatus,
  allowedActions,
  isTerminal,
  isCancellable,
  slaWindowMinutes,
  slaDeadlineFor,
  tierForVarianceZar,
  isLargeTier,
  isTampering,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  type RevenueAssuranceStatus,
  type RevenueAssuranceAction,
  type RevenueAssuranceTier,
  type LeakageCategory,
} from '../src/utils/generation-revenue-assurance-spec';

describe('W79 generation revenue assurance — happy path (recovery)', () => {
  it('walks period_open → … → recovered', () => {
    let s: RevenueAssuranceStatus = 'period_open';
    const path: [RevenueAssuranceAction, RevenueAssuranceStatus][] = [
      ['ingest_data', 'data_ingested'],
      ['run_reconciliation', 'reconciled'],
      ['flag_variance', 'variance_flagged'],
      ['open_investigation', 'investigating'],
      ['classify_leakage', 'classified'],
      ['issue_recovery_claim', 'recovery_pending'],
      ['confirm_recovery', 'recovered'],
    ];
    for (const [a, expected] of path) {
      const n = nextStatus(s, a);
      expect(n, `${s} --${a}-->`).toBe(expected);
      s = n!;
    }
    expect(isTerminal(s)).toBe(true);
  });
});

describe('W79 — branch paths', () => {
  it('clean: reconciled → closed_clean within tolerance', () => {
    expect(nextStatus('reconciled', 'close_clean')).toBe('closed_clean');
  });
  it('dispute: recovery_pending → in_dispute', () => {
    expect(nextStatus('recovery_pending', 'raise_dispute')).toBe('in_dispute');
  });
  it('dispute resolves to recovered or written_off', () => {
    expect(nextStatus('in_dispute', 'resolve_dispute_recovered')).toBe('recovered');
    expect(nextStatus('in_dispute', 'resolve_dispute_writeoff')).toBe('written_off');
  });
  it('write_off from classified or recovery_pending', () => {
    expect(nextStatus('classified', 'write_off')).toBe('written_off');
    expect(nextStatus('recovery_pending', 'write_off')).toBe('written_off');
  });
});

describe('W79 — guards & terminals', () => {
  it('terminals accept nothing', () => {
    for (const t of ['recovered', 'closed_clean', 'written_off', 'cancelled'] as RevenueAssuranceStatus[]) {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      expect(nextStatus(t, 'ingest_data')).toBeNull();
    }
  });
  it('cancel available while worked up (pre-recovery-claim), not after', () => {
    const cancellable: RevenueAssuranceStatus[] = [
      'period_open', 'data_ingested', 'reconciled', 'variance_flagged',
      'investigating', 'classified',
    ];
    for (const s of cancellable) {
      expect(isCancellable(s), s).toBe(true);
      expect(nextStatus(s, 'cancel_reconciliation'), s).toBe('cancelled');
    }
    expect(isCancellable('recovery_pending')).toBe(false);
    expect(isCancellable('in_dispute')).toBe(false);
    expect(nextStatus('recovery_pending', 'cancel_reconciliation')).toBeNull();
  });
  it('wrong-state transitions are rejected', () => {
    expect(nextStatus('period_open', 'confirm_recovery')).toBeNull();
    expect(nextStatus('data_ingested', 'flag_variance')).toBeNull();
    expect(nextStatus('reconciled', 'classify_leakage')).toBeNull();
  });
  it('every action has a transition entry', () => {
    const actions = Object.keys(TRANSITIONS) as RevenueAssuranceAction[];
    expect(actions).toHaveLength(13);
  });
});

describe('W79 — tiers by revenue variance (ZAR)', () => {
  it('boundary cases', () => {
    expect(tierForVarianceZar(0)).toBe('minor');
    expect(tierForVarianceZar(49999)).toBe('minor');
    expect(tierForVarianceZar(50000)).toBe('moderate');
    expect(tierForVarianceZar(249999)).toBe('moderate');
    expect(tierForVarianceZar(250000)).toBe('material');
    expect(tierForVarianceZar(999999)).toBe('material');
    expect(tierForVarianceZar(1000000)).toBe('major');
    expect(tierForVarianceZar(4999999)).toBe('major');
    expect(tierForVarianceZar(5000000)).toBe('critical');
    expect(tierForVarianceZar(50000000)).toBe('critical');
  });
  it('uses absolute value (under-recovery is negative variance)', () => {
    expect(tierForVarianceZar(-6000000)).toBe('critical');
    expect(tierForVarianceZar(-60000)).toBe('moderate');
  });
  it('large-tier set', () => {
    expect(isLargeTier('major')).toBe(true);
    expect(isLargeTier('critical')).toBe(true);
    expect(isLargeTier('material')).toBe(false);
    expect(isLargeTier('minor')).toBe(false);
  });
});

describe('W79 — URGENT SLA (larger variance = shorter windows)', () => {
  const graded: RevenueAssuranceStatus[] = [
    'period_open', 'data_ingested', 'reconciled', 'variance_flagged',
    'investigating', 'classified', 'recovery_pending', 'in_dispute',
  ];
  it('windows strictly decrease minor→critical for each graded state', () => {
    const order: RevenueAssuranceTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];
    for (const st of graded) {
      for (let i = 1; i < order.length; i++) {
        const prev = slaWindowMinutes(st, order[i - 1]);
        const cur = slaWindowMinutes(st, order[i]);
        expect(cur <= prev, `${st}: ${order[i]} (${cur}) <= ${order[i - 1]} (${prev})`).toBe(true);
      }
      // strict decrease between the extremes
      expect(slaWindowMinutes(st, 'critical')).toBeLessThan(slaWindowMinutes(st, 'minor'));
    }
  });
  it('terminals carry no deadline', () => {
    for (const t of ['recovered', 'closed_clean', 'written_off', 'cancelled'] as RevenueAssuranceStatus[]) {
      for (const tier of ['minor', 'moderate', 'material', 'major', 'critical'] as RevenueAssuranceTier[]) {
        expect(slaWindowMinutes(t, tier)).toBe(0);
        expect(slaDeadlineFor(t, tier, new Date())).toBeNull();
      }
    }
  });
  it('slaDeadlineFor offsets from entry', () => {
    const entered = new Date('2026-05-29T00:00:00Z');
    const d = slaDeadlineFor('recovery_pending', 'minor', entered);
    expect(d).not.toBeNull();
    expect(d!.getTime() - entered.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
  });
});

describe('W79 — tampering classification', () => {
  it('only meter_tampering is a tamper finding', () => {
    expect(isTampering('meter_tampering')).toBe(true);
    expect(isTampering('meter_drift')).toBe(false);
    expect(isTampering('comms_gap')).toBe(false);
    expect(isTampering('settlement_error')).toBe(false);
    expect(isTampering('curtailment_shortfall')).toBe(false);
    expect(isTampering('clipping_loss')).toBe(false);
  });
});

describe('W79 — reportability signature', () => {
  it('raise_dispute crosses for EVERY tier regardless of category', () => {
    const tiers: RevenueAssuranceTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];
    const cats: LeakageCategory[] = ['meter_drift', 'comms_gap', 'settlement_error', 'curtailment_shortfall', 'clipping_loss', 'meter_tampering'];
    for (const t of tiers) {
      for (const c of cats) {
        expect(crossesIntoRegulator('raise_dispute', t, c), `${t}/${c}`).toBe(true);
      }
      expect(crossesIntoRegulator('raise_dispute', t, null), `${t}/null`).toBe(true);
    }
  });
  it('classify_leakage crosses for EVERY tier when meter_tampering, never otherwise', () => {
    const tiers: RevenueAssuranceTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];
    for (const t of tiers) {
      expect(crossesIntoRegulator('classify_leakage', t, 'meter_tampering'), t).toBe(true);
      expect(crossesIntoRegulator('classify_leakage', t, 'meter_drift'), t).toBe(false);
    }
  });
  it('write-offs cross for material+ only', () => {
    expect(crossesIntoRegulator('write_off', 'material', 'meter_drift')).toBe(true);
    expect(crossesIntoRegulator('write_off', 'major', 'comms_gap')).toBe(true);
    expect(crossesIntoRegulator('write_off', 'critical', 'settlement_error')).toBe(true);
    expect(crossesIntoRegulator('write_off', 'moderate', 'meter_drift')).toBe(false);
    expect(crossesIntoRegulator('write_off', 'minor', 'meter_drift')).toBe(false);
    expect(crossesIntoRegulator('resolve_dispute_writeoff', 'critical', 'clipping_loss')).toBe(true);
    expect(crossesIntoRegulator('resolve_dispute_writeoff', 'minor', 'clipping_loss')).toBe(false);
  });
  it('routine actions never cross', () => {
    expect(crossesIntoRegulator('ingest_data', 'critical', 'meter_tampering')).toBe(false);
    expect(crossesIntoRegulator('confirm_recovery', 'critical', 'settlement_error')).toBe(false);
    expect(crossesIntoRegulator('close_clean', 'critical', null)).toBe(false);
    expect(crossesIntoRegulator('issue_recovery_claim', 'critical', 'meter_drift')).toBe(false);
  });
  it('SLA breach crosses for major + critical only', () => {
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });
  it('isReportable: any tampering, or material+ variance', () => {
    expect(isReportable('minor', 'meter_tampering')).toBe(true);
    expect(isReportable('material', 'meter_drift')).toBe(true);
    expect(isReportable('critical', 'settlement_error')).toBe(true);
    expect(isReportable('moderate', 'comms_gap')).toBe(false);
    expect(isReportable('minor', 'clipping_loss')).toBe(false);
  });
});

describe('W79 — party attribution', () => {
  it('analyst prosecutes; counterparty credits; reviewer signs off', () => {
    expect(partyForAction('ingest_data')).toBe('analyst');
    expect(partyForAction('run_reconciliation')).toBe('analyst');
    expect(partyForAction('flag_variance')).toBe('analyst');
    expect(partyForAction('classify_leakage')).toBe('analyst');
    expect(partyForAction('issue_recovery_claim')).toBe('analyst');
    expect(partyForAction('raise_dispute')).toBe('analyst');
    expect(partyForAction('confirm_recovery')).toBe('counterparty');
    expect(partyForAction('close_clean')).toBe('reviewer');
    expect(partyForAction('write_off')).toBe('reviewer');
    expect(partyForAction('resolve_dispute_recovered')).toBe('reviewer');
    expect(partyForAction('resolve_dispute_writeoff')).toBe('reviewer');
    expect(partyForAction('cancel_reconciliation')).toBe('reviewer');
  });
});
