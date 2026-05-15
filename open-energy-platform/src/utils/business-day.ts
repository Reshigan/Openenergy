// ════════════════════════════════════════════════════════════════════════
// business-day — modified-following date adjustment using the
// business_day_calendar seeded by migration 052.
//
// Settlement uses modified-following: if the candidate date is not a
// business day, push to the next business day. If that next business day
// rolls into a different month, fall back to the previous business day
// instead (so a payment due on the 30th doesn't slip into the next
// month). This matches the convention used by South African banks for
// EFT/RTGS settlement.
// ════════════════════════════════════════════════════════════════════════

export type BusinessDayDeps = {
  isBusinessDay: (date: string, marketZone: string) => Promise<boolean>;
};

// Generate the next N candidate dates after `from`, skipping weekends.
// Holidays still get filtered by the DB lookup; this just prunes
// Saturdays and Sundays cheaply.
function nextWorkingCandidates(fromIso: string, n: number): string[] {
  // Parse "YYYY-MM-DD" deliberately as UTC midnight to avoid TZ drift
  // when callers pass a date with a time component.
  const d = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const out: string[] = [];
  let cursor = new Date(d);
  while (out.length < n) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue;
    out.push(cursor.toISOString().slice(0, 10));
  }
  return out;
}

function prevWorkingCandidates(fromIso: string, n: number): string[] {
  const d = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const out: string[] = [];
  let cursor = new Date(d);
  while (out.length < n) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue;
    out.push(cursor.toISOString().slice(0, 10));
  }
  return out;
}

// Return whether the given YYYY-MM-DD is a business day:
//   - weekday AND not present in business_day_calendar with is_business_day=0
// Deps are injected so the function is testable without a real D1.
export async function isBusinessDay(
  date: string,
  marketZone: string,
  deps: BusinessDayDeps,
): Promise<boolean> {
  const day = new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay();
  if (day === 0 || day === 6) return false;
  return deps.isBusinessDay(date, marketZone);
}

// Modified-following adjustment for payment_due_at and similar dates.
//   - same day if it's already a business day
//   - else next business day
//   - unless next business day crosses month boundary, then previous
//     business day
export async function adjustModifiedFollowing(
  candidateIso: string,
  marketZone: string,
  deps: BusinessDayDeps,
): Promise<string> {
  const day10 = candidateIso.slice(0, 10);
  if (await isBusinessDay(day10, marketZone, deps)) return day10;

  for (const next of nextWorkingCandidates(day10, 7)) {
    if (await deps.isBusinessDay(next, marketZone)) {
      // Did we cross a month?
      if (next.slice(0, 7) !== day10.slice(0, 7)) {
        for (const prev of prevWorkingCandidates(day10, 7)) {
          if (await deps.isBusinessDay(prev, marketZone)) return prev;
        }
      }
      return next;
    }
  }

  // Last-resort fallback — return the original date so the caller
  // doesn't break. The seeded calendar covers 2026+; gaps after that
  // surface as "due on a Saturday" rather than crashing.
  return day10;
}

// D1-backed deps adapter. Returns true if no row exists for the date
// (i.e. we assume open unless the calendar explicitly says closed).
export function buildD1Deps(db: { prepare: (sql: string) => any }): BusinessDayDeps {
  return {
    isBusinessDay: async (date: string, marketZone: string) => {
      try {
        const row = await db
          .prepare(
            `SELECT is_business_day FROM business_day_calendar WHERE date = ? AND market_zone = ?`,
          )
          .bind(date, marketZone)
          .first();
        if (!row) return true; // unseeded date — default to open
        return Number((row as any).is_business_day) === 1;
      } catch {
        return true; // calendar missing entirely on older deploy
      }
    },
  };
}
