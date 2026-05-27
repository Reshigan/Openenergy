// ═══════════════════════════════════════════════════════════════════════════
// Wave 7 — Offtaker obligation spec unit tests.
// Pure functions, fixed clock at 2026-05-27T10:00:00Z.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  evaluateObligation,
  takeOrPayLiability,
  applyVerifiedDelta,
  isTakeOrPayTransition,
  periodEndOfMonth,
  DEFAULT_THRESHOLD_PCT,
  DEFAULT_CURE_WINDOW_DAYS,
} from '../src/utils/offtaker-obligation-spec';

const NOW = new Date('2026-05-27T10:00:00Z');

describe('evaluateObligation', () => {
  it('returns delivered when delivered >= threshold', () => {
    const v = evaluateObligation({
      contracted_mwh: 16500,
      delivered_mwh: 16720,
      period_end_at: periodEndOfMonth('2026-03'),
      now: NOW,
    });
    expect(v.status).toBe('delivered');
    expect(v.shortfall_mwh).toBe(0);
    expect(v.delivered_pct).toBeCloseTo(101.33, 1);
  });

  it('returns shortfall when delivered < threshold AND cure window still open', () => {
    const v = evaluateObligation({
      contracted_mwh: 16500,
      delivered_mwh: 14200,
      period_end_at: periodEndOfMonth('2026-05'),
      now: NOW,
    });
    expect(v.status).toBe('shortfall');
    expect(v.threshold_mwh).toBeCloseTo(15675, 0);
    expect(v.shortfall_mwh).toBeCloseTo(1475, 0);
    expect(v.cure_expired).toBe(false);
  });

  it('returns take_or_pay when cure window already expired', () => {
    const v = evaluateObligation({
      contracted_mwh: 15800,
      delivered_mwh: 12100,
      period_end_at: periodEndOfMonth('2026-02'),
      now: NOW,
    });
    expect(v.status).toBe('take_or_pay');
    expect(v.cure_expired).toBe(true);
  });

  it('honours custom threshold_pct', () => {
    const v = evaluateObligation({
      contracted_mwh: 10000,
      delivered_mwh: 8500,
      threshold_pct: 80,
      period_end_at: periodEndOfMonth('2026-05'),
      now: NOW,
    });
    expect(v.status).toBe('delivered'); // 85% >= 80% threshold
  });

  it('honours custom cure_window_days', () => {
    const v = evaluateObligation({
      contracted_mwh: 1000,
      delivered_mwh: 500,
      cure_window_days: 1,
      period_end_at: periodEndOfMonth('2026-04'),
      now: NOW,
    });
    expect(v.cure_expired).toBe(true); // cure was 2026-05-01 23:59:59, now is 2026-05-27
    expect(v.status).toBe('take_or_pay');
  });

  it('handles zero contracted volume without dividing by zero', () => {
    const v = evaluateObligation({
      contracted_mwh: 0,
      delivered_mwh: 0,
      period_end_at: periodEndOfMonth('2026-03'),
      now: NOW,
    });
    expect(v.delivered_pct).toBe(0);
    expect(v.status).toBe('delivered'); // 0 >= 0
  });
});

describe('takeOrPayLiability', () => {
  it('computes liability against threshold_mwh', () => {
    // 15800 contracted * 95% = 15010 take-or-pay threshold
    // 15010 - 12100 = 2910 shortfall MWh
    // 2910 * 1180 = 3433800 ZAR
    const liability = takeOrPayLiability({
      contracted_mwh: 15800,
      delivered_mwh: 12100,
      price_zar_per_mwh: 1180,
    });
    expect(liability).toBe(3433800);
  });

  it('returns 0 when delivered exceeds take-or-pay threshold', () => {
    // threshold = 10000 * 0.95 = 9500, delivered 9999 → shortfall = max(0, 9500-9999) = 0
    expect(takeOrPayLiability({
      contracted_mwh: 10000,
      delivered_mwh: 9999,
      price_zar_per_mwh: 1000,
    })).toBe(0);
  });

  it('honours custom take_or_pay_pct', () => {
    // 10000 contracted * 80% = 8000 threshold, delivered 7000 → 1000 short * 500 = 500000
    const liability = takeOrPayLiability({
      contracted_mwh: 10000,
      delivered_mwh: 7000,
      price_zar_per_mwh: 500,
      take_or_pay_pct: 80,
    });
    expect(liability).toBe(500000);
  });
});

describe('applyVerifiedDelta', () => {
  it('adds positive delta', () => {
    expect(applyVerifiedDelta(8410, 8310)).toBe(16720);
  });

  it('applies negative delta (correction)', () => {
    expect(applyVerifiedDelta(16720, -220)).toBe(16500);
  });

  it('clamps to zero on a negative result', () => {
    expect(applyVerifiedDelta(100, -200)).toBe(0);
  });
});

describe('isTakeOrPayTransition', () => {
  it('true when shortfall → take_or_pay', () => {
    expect(isTakeOrPayTransition('shortfall', 'take_or_pay')).toBe(true);
  });

  it('true when pending → take_or_pay (rare but valid)', () => {
    expect(isTakeOrPayTransition('pending', 'take_or_pay')).toBe(true);
  });

  it('false when already in take_or_pay (don\'t re-escalate)', () => {
    expect(isTakeOrPayTransition('take_or_pay', 'take_or_pay')).toBe(false);
  });

  it('false when not in take_or_pay', () => {
    expect(isTakeOrPayTransition('shortfall', 'shortfall')).toBe(false);
    expect(isTakeOrPayTransition('shortfall', 'delivered')).toBe(false);
  });
});

describe('periodEndOfMonth', () => {
  it('returns last second of February (28 days)', () => {
    const d = periodEndOfMonth('2026-02');
    expect(d.toISOString()).toBe('2026-02-28T23:59:59.000Z');
  });

  it('returns last second of March (31 days)', () => {
    const d = periodEndOfMonth('2026-03');
    expect(d.toISOString()).toBe('2026-03-31T23:59:59.000Z');
  });

  it('returns last second of April (30 days)', () => {
    const d = periodEndOfMonth('2026-04');
    expect(d.toISOString()).toBe('2026-04-30T23:59:59.000Z');
  });

  it('throws on bad input', () => {
    expect(() => periodEndOfMonth('garbage')).toThrow();
  });
});

describe('constants sanity', () => {
  it('default threshold matches market convention', () => {
    expect(DEFAULT_THRESHOLD_PCT).toBe(95);
  });

  it('default cure window matches Wave 6 cycle-1 ', () => {
    expect(DEFAULT_CURE_WINDOW_DAYS).toBe(14);
  });
});
