import { describe, it, expect } from 'vitest';
import { adjustModifiedFollowing, isBusinessDay, type BusinessDayDeps } from '../src/utils/business-day';

// In-memory calendar — exactly what the D1-backed buildD1Deps mimics.
// `closedDates` includes weekends-as-needed AND seeded holidays.
function makeDeps(closedDates: Set<string>): BusinessDayDeps {
  return {
    isBusinessDay: async (date: string) => !closedDates.has(date),
  };
}

describe('business-day utility', () => {
  it('returns true for an ordinary weekday with no holiday seed', async () => {
    const deps = makeDeps(new Set());
    expect(await isBusinessDay('2026-05-20', 'ZA', deps)).toBe(true); // Wed
  });

  it('returns false for Saturday and Sunday even with empty calendar', async () => {
    const deps = makeDeps(new Set());
    expect(await isBusinessDay('2026-05-23', 'ZA', deps)).toBe(false); // Sat
    expect(await isBusinessDay('2026-05-24', 'ZA', deps)).toBe(false); // Sun
  });

  it('returns false for a calendar-seeded holiday', async () => {
    const deps = makeDeps(new Set(['2026-04-27'])); // Freedom Day
    expect(await isBusinessDay('2026-04-27', 'ZA', deps)).toBe(false);
  });

  it('modified-following: same day if it is already a business day', async () => {
    const deps = makeDeps(new Set());
    expect(await adjustModifiedFollowing('2026-05-20', 'ZA', deps)).toBe('2026-05-20');
  });

  it('modified-following: pushes Saturday → following Monday', async () => {
    const deps = makeDeps(new Set());
    // 2026-05-23 is a Saturday. Next business day is 2026-05-25 (Mon).
    expect(await adjustModifiedFollowing('2026-05-23', 'ZA', deps)).toBe('2026-05-25');
  });

  it('modified-following: pushes Sunday → following Monday', async () => {
    const deps = makeDeps(new Set());
    expect(await adjustModifiedFollowing('2026-05-24', 'ZA', deps)).toBe('2026-05-25');
  });

  it('modified-following: pushes a holiday → next non-holiday business day', async () => {
    // Freedom Day 2026 falls on Monday 2026-04-27. Push to Tue 2026-04-28.
    const deps = makeDeps(new Set(['2026-04-27']));
    expect(await adjustModifiedFollowing('2026-04-27', 'ZA', deps)).toBe('2026-04-28');
  });

  it('modified-following: rolls back to previous business day if forward push crosses month boundary', async () => {
    // 2026-05-31 is a Sunday; forward push → 2026-06-01 (June) crosses
    // month. Must roll back to Friday 2026-05-29.
    const deps = makeDeps(new Set());
    expect(await adjustModifiedFollowing('2026-05-31', 'ZA', deps)).toBe('2026-05-29');
  });

  it('modified-following: handles consecutive holidays + weekend', async () => {
    // Hypothetical Friday holiday + weekend → push to Monday.
    // 2026-05-22 Fri (closed), Sat/Sun, Mon 2026-05-25 open.
    const deps = makeDeps(new Set(['2026-05-22']));
    expect(await adjustModifiedFollowing('2026-05-22', 'ZA', deps)).toBe('2026-05-25');
  });
});
