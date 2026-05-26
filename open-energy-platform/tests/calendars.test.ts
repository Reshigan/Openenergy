import { describe, it, expect } from 'vitest';
import {
  Calendar, addWorkingDays, workingDaysBetween, hoursOnDate, isWorkingDay,
} from '../src/utils/calendars';

const fiveDay: Calendar = {
  id: 'std',
  workdays: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
  exceptions: {},
};

describe('calendars', () => {
  it('addWorkingDays skips weekends', () => {
    // 2026-06-01 is a Monday
    expect(addWorkingDays(fiveDay, '2026-06-01', 1)).toBe('2026-06-02'); // Mon -> Tue
    expect(addWorkingDays(fiveDay, '2026-06-05', 1)).toBe('2026-06-08'); // Fri -> Mon
  });

  it('addWorkingDays handles zero', () => {
    expect(addWorkingDays(fiveDay, '2026-06-01', 0)).toBe('2026-06-01');
  });

  it('addWorkingDays treats fractional as ceil', () => {
    expect(addWorkingDays(fiveDay, '2026-06-01', 0.5)).toBe('2026-06-02');
    expect(addWorkingDays(fiveDay, '2026-06-01', 1.5)).toBe('2026-06-03');
  });

  it('addWorkingDays negative walks back', () => {
    expect(addWorkingDays(fiveDay, '2026-06-08', -1)).toBe('2026-06-05'); // Mon back to prior Fri
    expect(addWorkingDays(fiveDay, '2026-06-02', -1)).toBe('2026-06-01');
  });

  it('respects exceptions (holidays)', () => {
    const withHoliday: Calendar = { ...fiveDay, exceptions: { '2026-06-03': 0 } };
    // 2026-06-01 Mon → +3 working days should skip Wed (holiday) and land Fri
    expect(addWorkingDays(withHoliday, '2026-06-01', 3)).toBe('2026-06-05');
  });

  it('workingDaysBetween counts half-open', () => {
    // Mon..next Mon = 5 working days
    expect(workingDaysBetween(fiveDay, '2026-06-01', '2026-06-08')).toBe(5);
    // Same date = 0
    expect(workingDaysBetween(fiveDay, '2026-06-01', '2026-06-01')).toBe(0);
  });

  it('isWorkingDay sees weekends as non-working', () => {
    expect(isWorkingDay(fiveDay, '2026-06-06')).toBe(false); // Saturday
    expect(isWorkingDay(fiveDay, '2026-06-01')).toBe(true);  // Monday
  });

  it('hoursOnDate returns weekend zero, weekday 8', () => {
    expect(hoursOnDate(fiveDay, '2026-06-06')).toBe(0);
    expect(hoursOnDate(fiveDay, '2026-06-02')).toBe(8);
  });

  it('hoursOnDate exception override', () => {
    const halfDay: Calendar = { ...fiveDay, exceptions: { '2026-06-03': 4 } };
    expect(hoursOnDate(halfDay, '2026-06-03')).toBe(4);
  });
});
