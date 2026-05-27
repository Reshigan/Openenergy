import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import {
  computeWheelingCharge,
  disputeDeadlineFrom,
  isDisputeWindowExpired,
  nextChargeStatus,
  isChargeEscalationReady,
  DEFAULT_DISPUTE_WINDOW_DAYS,
} from '../src/utils/wheeling-charges-spec';

const FIXED_NOW = new Date('2026-05-27T10:00:00Z');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('computeWheelingCharge', () => {
  it('produces gross + loss + ancillaries breakdown', () => {
    const b = computeWheelingCharge({
      transmission_mwh: 18000,
      tariff_zar_per_mwh: 175,
      loss_factor_pct: 4.5,
      ancillaries_zar: 25000,
    });
    expect(b.loss_mwh).toBe(810);
    expect(b.gross_zar).toBe(3_150_000);
    expect(b.loss_zar).toBe(141_750);
    expect(b.ancillaries_zar).toBe(25_000);
    expect(b.total_zar).toBe(3_316_750);
  });

  it('handles zero transmission gracefully', () => {
    const b = computeWheelingCharge({
      transmission_mwh: 0,
      tariff_zar_per_mwh: 200,
      loss_factor_pct: 5,
    });
    expect(b.gross_zar).toBe(0);
    expect(b.loss_zar).toBe(0);
    expect(b.total_zar).toBe(0);
  });

  it('treats missing ancillaries as zero', () => {
    const b = computeWheelingCharge({
      transmission_mwh: 1000,
      tariff_zar_per_mwh: 100,
      loss_factor_pct: 10,
    });
    expect(b.ancillaries_zar).toBe(0);
    expect(b.total_zar).toBe(110_000); // 100k gross + 10k loss
  });

  it('clamps negative inputs to zero', () => {
    const b = computeWheelingCharge({
      transmission_mwh: -50,
      tariff_zar_per_mwh: -10,
      loss_factor_pct: -1,
      ancillaries_zar: -100,
    });
    expect(b.transmission_mwh).toBe(0);
    expect(b.tariff_zar_per_mwh).toBe(0);
    expect(b.loss_factor_pct).toBe(0);
    expect(b.total_zar).toBe(0);
  });

  it('handles non-integer loss factor (4.5%)', () => {
    const b = computeWheelingCharge({
      transmission_mwh: 19500,
      tariff_zar_per_mwh: 175,
      loss_factor_pct: 4.5,
      ancillaries_zar: 28000,
    });
    expect(b.loss_mwh).toBe(877.5);
    expect(b.gross_zar).toBe(3_412_500);
    expect(b.loss_zar).toBe(153_562.5);
    expect(b.total_zar).toBe(3_594_062.5);
  });
});

describe('disputeDeadlineFrom', () => {
  it('defaults to 14 days after issuance', () => {
    const issued = new Date('2026-05-01T08:00:00Z');
    const deadline = disputeDeadlineFrom(issued);
    expect(deadline.toISOString()).toBe('2026-05-15T08:00:00.000Z');
    expect(DEFAULT_DISPUTE_WINDOW_DAYS).toBe(14);
  });

  it('honours custom window override', () => {
    const issued = new Date('2026-05-01T08:00:00Z');
    expect(disputeDeadlineFrom(issued, 7).toISOString())
      .toBe('2026-05-08T08:00:00.000Z');
    expect(disputeDeadlineFrom(issued, 30).toISOString())
      .toBe('2026-05-31T08:00:00.000Z');
  });

  it('falls back to default for invalid window values', () => {
    const issued = new Date('2026-05-01T08:00:00Z');
    expect(disputeDeadlineFrom(issued, 0).toISOString())
      .toBe('2026-05-15T08:00:00.000Z');
    expect(disputeDeadlineFrom(issued, -3).toISOString())
      .toBe('2026-05-15T08:00:00.000Z');
    expect(disputeDeadlineFrom(issued, NaN).toISOString())
      .toBe('2026-05-15T08:00:00.000Z');
  });

  it('throws on invalid issuance date', () => {
    expect(() => disputeDeadlineFrom(new Date('not-a-date'))).toThrow();
  });
});

describe('isDisputeWindowExpired', () => {
  it('returns false when the deadline is in the future', () => {
    expect(isDisputeWindowExpired('2026-06-10T00:00:00Z')).toBe(false);
  });

  it('returns true when the deadline has passed', () => {
    expect(isDisputeWindowExpired('2026-05-01T00:00:00Z')).toBe(true);
  });

  it('returns false for null / undefined / empty', () => {
    expect(isDisputeWindowExpired(null)).toBe(false);
    expect(isDisputeWindowExpired(undefined)).toBe(false);
    expect(isDisputeWindowExpired('')).toBe(false);
  });

  it('returns false for unparseable strings (defensive)', () => {
    expect(isDisputeWindowExpired('garbage')).toBe(false);
  });

  it('accepts Date as well as string', () => {
    expect(isDisputeWindowExpired(new Date('2026-05-01'))).toBe(true);
    expect(isDisputeWindowExpired(new Date('2026-06-01'))).toBe(false);
  });
});

describe('nextChargeStatus', () => {
  it('open + raised dispute → disputed', () => {
    expect(nextChargeStatus({
      currentStatus: 'open',
      hasOpenDispute: true,
      paymentRecorded: false,
      disputeResolved: false,
      disputeEscalated: false,
    })).toBe('disputed');
  });

  it('disputed + resolved → reconciled', () => {
    expect(nextChargeStatus({
      currentStatus: 'disputed',
      hasOpenDispute: false,
      paymentRecorded: false,
      disputeResolved: true,
      disputeEscalated: false,
    })).toBe('reconciled');
  });

  it('any status + payment → paid', () => {
    expect(nextChargeStatus({
      currentStatus: 'reconciled',
      hasOpenDispute: false,
      paymentRecorded: true,
      disputeResolved: false,
      disputeEscalated: false,
    })).toBe('paid');
  });

  it('escalation wins over payment', () => {
    expect(nextChargeStatus({
      currentStatus: 'disputed',
      hasOpenDispute: true,
      paymentRecorded: true,
      disputeResolved: false,
      disputeEscalated: true,
    })).toBe('escalated');
  });

  it('no signals → keeps current status', () => {
    expect(nextChargeStatus({
      currentStatus: 'paid',
      hasOpenDispute: false,
      paymentRecorded: false,
      disputeResolved: false,
      disputeEscalated: false,
    })).toBe('paid');
  });
});

describe('isChargeEscalationReady', () => {
  it('disputed + open dispute + expired deadline → ready', () => {
    expect(isChargeEscalationReady({
      status: 'disputed',
      dispute_deadline_at: '2026-05-01T00:00:00Z',
      has_open_dispute: true,
    })).toBe(true);
  });

  it('disputed + open dispute + future deadline → not ready', () => {
    expect(isChargeEscalationReady({
      status: 'disputed',
      dispute_deadline_at: '2026-06-15T00:00:00Z',
      has_open_dispute: true,
    })).toBe(false);
  });

  it('open status with no dispute is never escalation-ready', () => {
    expect(isChargeEscalationReady({
      status: 'open',
      dispute_deadline_at: '2026-05-01T00:00:00Z',
      has_open_dispute: false,
    })).toBe(false);
  });

  it('disputed but no open dispute (already resolved) → not ready', () => {
    expect(isChargeEscalationReady({
      status: 'disputed',
      dispute_deadline_at: '2026-05-01T00:00:00Z',
      has_open_dispute: false,
    })).toBe(false);
  });

  it('already escalated stays escalated (no double-fire)', () => {
    expect(isChargeEscalationReady({
      status: 'escalated',
      dispute_deadline_at: '2026-05-01T00:00:00Z',
      has_open_dispute: true,
    })).toBe(false);
  });
});
