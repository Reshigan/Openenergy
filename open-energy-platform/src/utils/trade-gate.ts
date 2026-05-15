// ════════════════════════════════════════════════════════════════════════
// trade-gate — settlement_calendar gate-close enforcement for new orders.
//
// Once the gate has closed for a given trading_day in a market_zone,
// new orders for that delivery_date should be rejected with a clear
// reason code. The settlement_calendar (migration 051) carries the
// `gate_close_at` for each (trading_day, market_zone); this utility
// looks it up and answers the pre-trade gating question:
//   "is the gate open right now for this delivery_date?"
//
// Defaults: if no calendar row exists for the requested trading_day,
// the gate is treated as OPEN (so older deploys without 051 don't
// suddenly block all trading). Production should seed a calendar row
// per trading_day.
// ════════════════════════════════════════════════════════════════════════

export type GateState =
  | { state: 'open'; until: string | null }
  | { state: 'closed'; closed_at: string };

export type GateDeps = {
  loadCalendar: (
    tradingDay: string,
    marketZone: string,
  ) => Promise<{ gate_close_at: string; status: string } | null>;
  now: () => Date;
};

export async function gateStateFor(
  tradingDay: string,
  marketZone: string,
  deps: GateDeps,
): Promise<GateState> {
  const row = await deps.loadCalendar(tradingDay, marketZone);
  if (!row) return { state: 'open', until: null };

  // Explicit operator override: once status moves past 'scheduled', the
  // gate is closed regardless of the clock.
  if (row.status && row.status !== 'scheduled') {
    return { state: 'closed', closed_at: row.gate_close_at };
  }

  const closeAt = new Date(row.gate_close_at);
  const now = deps.now();
  if (now.getTime() >= closeAt.getTime()) {
    return { state: 'closed', closed_at: row.gate_close_at };
  }
  return { state: 'open', until: row.gate_close_at };
}

export function buildD1GateDeps(db: {
  prepare: (sql: string) => any;
}): GateDeps {
  return {
    loadCalendar: async (tradingDay: string, marketZone: string) => {
      try {
        const r = await db
          .prepare(
            `SELECT gate_close_at, status FROM settlement_calendar
              WHERE trading_day = ? AND market_zone = ?`,
          )
          .bind(tradingDay, marketZone)
          .first();
        return (r as any) || null;
      } catch {
        return null; // settlement_calendar absent on older deploy
      }
    },
    now: () => new Date(),
  };
}
