import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  expiryStatusFor,
  isTransitionInto,
  cureDeadlineFor,
  crossesIntoRegulator,
  STATUS_LABEL,
  WARNING_DAYS_OUT,
  CYCLE_1_DAYS_OUT,
  CYCLE_2_DAYS_OUT,
  CYCLE_3_DAYS_OUT,
  CYCLE_1_CURE_DAYS,
  CYCLE_2_CURE_DAYS,
} from '../src/utils/bond-expiry-spec';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000).toISOString();
}

describe('daysUntil', () => {
  it('returns positive days when expiry is in the future', () => {
    expect(daysUntil(isoDaysFromNow(45), NOW)).toBe(45);
  });

  it('returns 0 on the expiry day itself', () => {
    expect(daysUntil(isoDaysFromNow(0), NOW)).toBe(0);
  });

  it('returns negative days when expired', () => {
    expect(daysUntil(isoDaysFromNow(-7), NOW)).toBe(-7);
  });
});

describe('expiryStatusFor', () => {
  it('beyond 90 days → green', () => {
    expect(expiryStatusFor(isoDaysFromNow(120), 'active', NOW)).toBe('green');
    expect(expiryStatusFor(isoDaysFromNow(91), 'active', NOW)).toBe('green');
  });

  it('30 < days ≤ 90 → warning', () => {
    expect(expiryStatusFor(isoDaysFromNow(WARNING_DAYS_OUT), 'active', NOW)).toBe('warning');
    expect(expiryStatusFor(isoDaysFromNow(60), 'active', NOW)).toBe('warning');
    expect(expiryStatusFor(isoDaysFromNow(CYCLE_1_DAYS_OUT + 1), 'active', NOW)).toBe('warning');
  });

  it('14 < days ≤ 30 → cycle_1', () => {
    expect(expiryStatusFor(isoDaysFromNow(CYCLE_1_DAYS_OUT), 'active', NOW)).toBe('cycle_1');
    expect(expiryStatusFor(isoDaysFromNow(20), 'active', NOW)).toBe('cycle_1');
    expect(expiryStatusFor(isoDaysFromNow(CYCLE_2_DAYS_OUT + 1), 'active', NOW)).toBe('cycle_1');
  });

  it('3 < days ≤ 14 → cycle_2', () => {
    expect(expiryStatusFor(isoDaysFromNow(CYCLE_2_DAYS_OUT), 'active', NOW)).toBe('cycle_2');
    expect(expiryStatusFor(isoDaysFromNow(7), 'active', NOW)).toBe('cycle_2');
    expect(expiryStatusFor(isoDaysFromNow(CYCLE_3_DAYS_OUT + 1), 'active', NOW)).toBe('cycle_2');
  });

  it('0 ≤ days ≤ 3 → cycle_3', () => {
    expect(expiryStatusFor(isoDaysFromNow(CYCLE_3_DAYS_OUT), 'active', NOW)).toBe('cycle_3');
    expect(expiryStatusFor(isoDaysFromNow(1), 'active', NOW)).toBe('cycle_3');
    expect(expiryStatusFor(isoDaysFromNow(0), 'active', NOW)).toBe('cycle_3');
  });

  it('expired (days < 0) → escalated', () => {
    expect(expiryStatusFor(isoDaysFromNow(-1), 'active', NOW)).toBe('escalated');
    expect(expiryStatusFor(isoDaysFromNow(-30), 'active', NOW)).toBe('escalated');
  });

  it('terminal bond statuses stay green regardless of expiry date', () => {
    expect(expiryStatusFor(isoDaysFromNow(-30), 'released', NOW)).toBe('green');
    expect(expiryStatusFor(isoDaysFromNow(-30), 'replaced', NOW)).toBe('green');
    expect(expiryStatusFor(isoDaysFromNow(-30), 'forfeited', NOW)).toBe('green');
  });
});

describe('isTransitionInto', () => {
  it('detects severity-increasing transitions', () => {
    expect(isTransitionInto('green', 'warning')).toBe(true);
    expect(isTransitionInto('warning', 'cycle_1')).toBe(true);
    expect(isTransitionInto('cycle_2', 'cycle_3')).toBe(true);
    expect(isTransitionInto('cycle_3', 'escalated')).toBe(true);
  });

  it('does not fire on same-state ticks (idempotent)', () => {
    expect(isTransitionInto('cycle_1', 'cycle_1')).toBe(false);
    expect(isTransitionInto('escalated', 'escalated')).toBe(false);
  });

  it('does not fire on regressions (severity decreasing)', () => {
    expect(isTransitionInto('cycle_2', 'cycle_1')).toBe(false);
    expect(isTransitionInto('escalated', 'cycle_3')).toBe(false);
  });

  it('treats null/undefined previous as green', () => {
    expect(isTransitionInto(null, 'warning')).toBe(true);
    expect(isTransitionInto(undefined, 'warning')).toBe(true);
    expect(isTransitionInto(null, 'green')).toBe(false);
  });

  it('never fires "into green"', () => {
    expect(isTransitionInto('warning', 'green')).toBe(false);
  });
});

describe('cureDeadlineFor', () => {
  it('cycle_1 → 14 days from now', () => {
    const out = cureDeadlineFor('cycle_1', NOW);
    expect(new Date(out).getTime()).toBe(NOW.getTime() + CYCLE_1_CURE_DAYS * 24 * 60 * 60 * 1000);
  });

  it('cycle_2 → 7 days from now', () => {
    const out = cureDeadlineFor('cycle_2', NOW);
    expect(new Date(out).getTime()).toBe(NOW.getTime() + CYCLE_2_CURE_DAYS * 24 * 60 * 60 * 1000);
  });

  it('cycle_3 → immediate (0 days)', () => {
    const out = cureDeadlineFor('cycle_3', NOW);
    expect(new Date(out).getTime()).toBe(NOW.getTime());
  });

  it('warning/green/escalated → fall back to immediate', () => {
    expect(new Date(cureDeadlineFor('warning', NOW)).getTime()).toBe(NOW.getTime());
    expect(new Date(cureDeadlineFor('green', NOW)).getTime()).toBe(NOW.getTime());
    expect(new Date(cureDeadlineFor('escalated', NOW)).getTime()).toBe(NOW.getTime());
  });
});

describe('crossesIntoRegulator', () => {
  it('fires when entering escalated from any non-escalated state', () => {
    expect(crossesIntoRegulator('green', 'escalated')).toBe(true);
    expect(crossesIntoRegulator('cycle_3', 'escalated')).toBe(true);
    expect(crossesIntoRegulator(null, 'escalated')).toBe(true);
  });

  it('does not fire on idempotent escalated ticks', () => {
    expect(crossesIntoRegulator('escalated', 'escalated')).toBe(false);
  });

  it('does not fire on other transitions', () => {
    expect(crossesIntoRegulator('green', 'cycle_1')).toBe(false);
    expect(crossesIntoRegulator('cycle_2', 'cycle_3')).toBe(false);
  });
});

describe('STATUS_LABEL', () => {
  it('has a human label for every status', () => {
    expect(STATUS_LABEL.green).toBeTruthy();
    expect(STATUS_LABEL.warning).toBeTruthy();
    expect(STATUS_LABEL.cycle_1).toBeTruthy();
    expect(STATUS_LABEL.cycle_2).toBeTruthy();
    expect(STATUS_LABEL.cycle_3).toBeTruthy();
    expect(STATUS_LABEL.escalated).toBeTruthy();
  });
});
