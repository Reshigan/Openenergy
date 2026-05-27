// Historical-simulation VaR + scenario engine. Pure functions only — no
// I/O, no database, no env. All math operates on plain JS objects so the
// utility is trivial to unit-test and reuse from cron + on-demand routes.

export interface Position {
  id: string;
  factor_id: string;            // which risk factor drives this position
  side: 'long' | 'short';
  quantity: number;             // MWh / contracts / units
  mark_price: number;           // current mark in ZAR per unit
}

export interface FactorHistoryPoint {
  as_of_date: string;
  value: number;
}

export type FactorHistory = Record<string, FactorHistoryPoint[]>;
// Map from factor_id → ordered (ascending) daily closes.

export interface FactorShock {
  factor_id: string;
  shock_pct?: number;           // multiplicative shock (e.g. +0.10 = +10%)
  shock_abs?: number;           // absolute shift in factor's unit, optional
}

export interface ScenarioBreakdown {
  factor_id: string;
  pnl: number;
}

export interface ScenarioResult {
  pnl: number;
  breakdown: ScenarioBreakdown[];
}

// ── core revaluation ──────────────────────────────────────────────────
// Revalue ONE position under a set of factor shifts. Only the position's
// own factor matters — cross-factor sensitivities (basis, vol, etc.) are
// out of scope for this first cut and would be a Wave-2.x extension.
export function revaluePosition(
  position: Position,
  factor_shifts: Record<string, number>,
): number {
  const shift = factor_shifts[position.factor_id];
  if (shift === undefined || shift === 0) return 0;
  const notional = position.quantity * position.mark_price;
  const direction = position.side === 'long' ? 1 : -1;
  return direction * notional * shift;
}

// ── historical-simulation P&L vector ──────────────────────────────────
// For each consecutive pair in the factor history, compute the day-over-
// day return per factor, build a `factor_shifts` map for that day, and
// sum revaluePosition() over all positions. Returns N-1 P&Ls if the
// history has N rows.
export function simulateHistoricalPnL(
  positions: Position[],
  history: FactorHistory,
  lookback?: number,
): number[] {
  // Determine the length of the shortest history that's been supplied so
  // every day's shock map has every factor.
  const factorIds = Array.from(new Set(positions.map(p => p.factor_id)));
  const factorSeries = factorIds.map(fid => history[fid] || []);
  if (factorSeries.some(s => s.length < 2)) return [];

  let maxDays = Math.min(...factorSeries.map(s => s.length));
  if (lookback && maxDays > lookback + 1) maxDays = lookback + 1;

  const pnls: number[] = [];
  // Iterate from the most recent end of the series backwards so the
  // lookback is anchored at "today" rather than at the start of history.
  // factorSeries[k].slice(-maxDays) is the trailing window.
  const windowed = factorSeries.map(s => s.slice(-maxDays));

  for (let day = 1; day < maxDays; day++) {
    const shifts: Record<string, number> = {};
    factorIds.forEach((fid, k) => {
      const prev = windowed[k][day - 1].value;
      const curr = windowed[k][day].value;
      shifts[fid] = prev === 0 ? 0 : (curr - prev) / prev;
    });
    let dayPnL = 0;
    for (const pos of positions) dayPnL += revaluePosition(pos, shifts);
    pnls.push(dayPnL);
  }
  return pnls;
}

// ── VaR ───────────────────────────────────────────────────────────────
// VaR at e.g. 95% = the loss magnitude exceeded only 5% of the time. We
// take the (1-confidence) quantile of the P&L vector and return its
// absolute magnitude (positive number = loss size).
export function varAtConfidence(pnls: number[], confidence: number): number {
  if (!pnls.length) return 0;
  const sorted = [...pnls].sort((a, b) => a - b);
  // Index of the worst (1-confidence) percentile, floored.
  const idx = Math.max(0, Math.floor((1 - confidence) * sorted.length));
  const cut = sorted[idx];
  return cut < 0 ? -cut : 0;
}

// ── Expected Shortfall ────────────────────────────────────────────────
// Average of all P&Ls at or worse than the VaR cut. Same sign convention
// (positive number = loss size).
export function expectedShortfall(pnls: number[], confidence: number): number {
  if (!pnls.length) return 0;
  const sorted = [...pnls].sort((a, b) => a - b);
  const cutCount = Math.max(1, Math.floor((1 - confidence) * sorted.length));
  const tail = sorted.slice(0, cutCount);
  const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
  return mean < 0 ? -mean : 0;
}

// ── scenario engine ────────────────────────────────────────────────────
// Apply a set of factor shocks to a portfolio, return aggregate P&L plus
// per-factor breakdown for the AI explain assist + UI factor table.
export function runScenario(
  positions: Position[],
  shocks: FactorShock[],
): ScenarioResult {
  const shifts: Record<string, number> = {};
  for (const s of shocks) {
    // shock_pct dominates if both provided. shock_abs is converted to a
    // percent of mark on demand inside the loop (callers can also pre-
    // compute it themselves).
    if (s.shock_pct !== undefined) shifts[s.factor_id] = s.shock_pct;
    else if (s.shock_abs !== undefined) shifts[s.factor_id] = s.shock_abs;
  }
  const byFactor: Record<string, number> = {};
  for (const pos of positions) {
    const pnl = revaluePosition(pos, shifts);
    byFactor[pos.factor_id] = (byFactor[pos.factor_id] || 0) + pnl;
  }
  const breakdown: ScenarioBreakdown[] = Object.entries(byFactor).map(
    ([factor_id, pnl]) => ({ factor_id, pnl }),
  );
  const total = breakdown.reduce((a, b) => a + b.pnl, 0);
  return { pnl: total, breakdown };
}
