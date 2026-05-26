// ═══════════════════════════════════════════════════════════════════════════
// Working-day calendar arithmetic for the IPP project scheduling engine.
//
// A calendar pins down which days of the week count as working days (with
// hours) and which specific dates are overrides (holidays = 0, half-days,
// extra shifts). The CPM solver in cpm.ts threads everything through these
// helpers so a "2 working days from Friday" advance lands on Tuesday, not
// Sunday.
// ═══════════════════════════════════════════════════════════════════════════

export interface Calendar {
  id: string;
  workdays: {
    mon: number; tue: number; wed: number; thu: number;
    fri: number; sat: number; sun: number;
  };
  exceptions: Record<string, number>; // 'YYYY-MM-DD' -> hours (0 = holiday)
}

const DAY_KEYS: Array<keyof Calendar['workdays']> = [
  'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat',
];

function parseISO(d: string): Date {
  // Force UTC noon to dodge DST quirks in date arithmetic.
  return new Date(d + 'T12:00:00Z');
}

function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function hoursOnDate(cal: Calendar, dateISO: string): number {
  if (cal.exceptions[dateISO] !== undefined) return cal.exceptions[dateISO];
  const dow = DAY_KEYS[parseISO(dateISO).getUTCDay()];
  return cal.workdays[dow] || 0;
}

export function isWorkingDay(cal: Calendar, dateISO: string): boolean {
  return hoursOnDate(cal, dateISO) > 0;
}

/**
 * Advance startISO by `days` working days. `days` may be fractional; we treat
 * any fraction <= 1 as one working day (P6 rounds the same way for date math
 * while preserving the fractional duration for resource hours).
 */
export function addWorkingDays(cal: Calendar, startISO: string, days: number): string {
  if (days === 0) return startISO;
  // Negative => walk back
  if (days < 0) return subtractWorkingDays(cal, startISO, -days);
  const whole = Math.ceil(days);
  let d = parseISO(startISO);
  let advanced = 0;
  // Bounded loop guard
  for (let i = 0; advanced < whole && i < 10000; i++) {
    d = new Date(d.getTime() + 86400000);
    if (isWorkingDay(cal, fmtISO(d))) advanced++;
  }
  return fmtISO(d);
}

function subtractWorkingDays(cal: Calendar, startISO: string, days: number): string {
  const whole = Math.ceil(days);
  let d = parseISO(startISO);
  let advanced = 0;
  for (let i = 0; advanced < whole && i < 10000; i++) {
    d = new Date(d.getTime() - 86400000);
    if (isWorkingDay(cal, fmtISO(d))) advanced++;
  }
  return fmtISO(d);
}

/**
 * Count working days in [startISO, endISO). Half-open so duration math lines up.
 */
export function workingDaysBetween(cal: Calendar, startISO: string, endISO: string): number {
  if (endISO <= startISO) return 0;
  let d = parseISO(startISO);
  const end = parseISO(endISO);
  let n = 0;
  for (let i = 0; d < end && i < 100000; i++) {
    if (isWorkingDay(cal, fmtISO(d))) n++;
    d = new Date(d.getTime() + 86400000);
  }
  return n;
}

export const DEFAULT_CALENDAR: Calendar = {
  id: 'std',
  workdays: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
  exceptions: {},
};
