// Unit tests for src/utils/var.ts — pure-function historical-simulation
// VaR + scenario engine. No database; just math on plain JS objects.

import { describe, it, expect } from 'vitest';
import {
  revaluePosition,
  simulateHistoricalPnL,
  varAtConfidence,
  expectedShortfall,
  runScenario,
  type Position,
  type FactorHistory,
  type FactorShock,
} from '../src/utils/var';

describe('revaluePosition', () => {
  it('returns 0 when factor shifts are empty', () => {
    const pos: Position = {
      id: 'p1', factor_id: 'spot_za', side: 'long', quantity: 100, mark_price: 800,
    };
    expect(revaluePosition(pos, {})).toBe(0);
  });

  it('long position gains when factor goes up', () => {
    const pos: Position = {
      id: 'p1', factor_id: 'spot_za', side: 'long', quantity: 100, mark_price: 800,
    };
    // +10% spot: P&L = 100 * 800 * 0.10 = 8000
    expect(revaluePosition(pos, { spot_za: 0.10 })).toBeCloseTo(8000);
  });

  it('short position loses when factor goes up', () => {
    const pos: Position = {
      id: 'p1', factor_id: 'spot_za', side: 'short', quantity: 100, mark_price: 800,
    };
    expect(revaluePosition(pos, { spot_za: 0.10 })).toBeCloseTo(-8000);
  });

  it('ignores shocks to unrelated factors', () => {
    const pos: Position = {
      id: 'p1', factor_id: 'spot_za', side: 'long', quantity: 100, mark_price: 800,
    };
    expect(revaluePosition(pos, { fx_zar_usd: 0.50 })).toBe(0);
  });
});

describe('simulateHistoricalPnL', () => {
  it('returns one P&L per historical day', () => {
    const positions: Position[] = [
      { id: 'p1', factor_id: 'spot_za', side: 'long', quantity: 10, mark_price: 1000 },
    ];
    // Three historical observations → two day-over-day returns.
    const history: FactorHistory = {
      spot_za: [
        { as_of_date: '2026-01-01', value: 1000 },
        { as_of_date: '2026-01-02', value: 1050 }, // +5%
        { as_of_date: '2026-01-03', value: 1029 }, // -2%
      ],
    };
    const pnls = simulateHistoricalPnL(positions, history);
    expect(pnls).toHaveLength(2);
    expect(pnls[0]).toBeCloseTo(500);   // +5% × 10 × 1000
    expect(pnls[1]).toBeCloseTo(-200);  // -2% × 10 × 1000
  });

  it('aggregates P&L across multiple positions', () => {
    const positions: Position[] = [
      { id: 'p1', factor_id: 'spot_za', side: 'long', quantity: 10, mark_price: 1000 },
      { id: 'p2', factor_id: 'spot_za', side: 'short', quantity: 5, mark_price: 1000 },
    ];
    const history: FactorHistory = {
      spot_za: [
        { as_of_date: '2026-01-01', value: 1000 },
        { as_of_date: '2026-01-02', value: 1100 }, // +10%
      ],
    };
    const pnls = simulateHistoricalPnL(positions, history);
    // long +10%×10×1000 = +1000; short -10%×5×1000 = -500; net = +500
    expect(pnls).toHaveLength(1);
    expect(pnls[0]).toBeCloseTo(500);
  });
});

describe('varAtConfidence', () => {
  it('returns the loss at the (1-confidence) percentile', () => {
    // 100 P&Ls evenly spaced from -100 to +99. 95th percentile worst loss
    // is the 5th worst, which sits at value -95 (zero-indexed pnls[4]).
    const pnls = Array.from({ length: 100 }, (_, i) => i - 100);
    expect(varAtConfidence(pnls, 0.95)).toBeCloseTo(95);
  });

  it('99% picks a deeper-tail loss than 95%', () => {
    const pnls = Array.from({ length: 100 }, (_, i) => i - 100);
    expect(varAtConfidence(pnls, 0.99)).toBeGreaterThan(varAtConfidence(pnls, 0.95));
  });

  it('returns 0 for empty input', () => {
    expect(varAtConfidence([], 0.95)).toBe(0);
  });
});

describe('expectedShortfall', () => {
  it('is the average of all P&Ls past the VaR cut', () => {
    const pnls = [-100, -90, -80, -70, -60, -50, -40, -30, -20, -10];
    // 90% confidence → worst 10% = 1 row = -100 → ES = 100
    expect(expectedShortfall(pnls, 0.90)).toBeCloseTo(100);
    // 50% confidence → worst 50% = 5 rows = mean(-100..-60) = -80 → ES = 80
    expect(expectedShortfall(pnls, 0.50)).toBeCloseTo(80);
  });

  it('is always >= VaR (deeper-tail average)', () => {
    const pnls = [-100, -90, -80, -70, -60, -50, -40, -30, -20, -10];
    expect(expectedShortfall(pnls, 0.90)).toBeGreaterThanOrEqual(varAtConfidence(pnls, 0.90));
  });
});

describe('runScenario', () => {
  it('returns aggregate P&L plus per-factor breakdown', () => {
    const positions: Position[] = [
      { id: 'p1', factor_id: 'spot_za', side: 'long', quantity: 10, mark_price: 1000 },
      { id: 'p2', factor_id: 'fx_zar_usd', side: 'long', quantity: 100, mark_price: 18 },
    ];
    const shocks: FactorShock[] = [
      { factor_id: 'spot_za', shock_pct: 0.20 },     // +20% spot
      { factor_id: 'fx_zar_usd', shock_pct: -0.10 }, // -10% FX
    ];
    const result = runScenario(positions, shocks);
    // spot_za leg: 10×1000×0.20 = +2000
    // fx leg:     100×18×(-0.10) = -180
    expect(result.pnl).toBeCloseTo(1820);
    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown.find(b => b.factor_id === 'spot_za')?.pnl).toBeCloseTo(2000);
    expect(result.breakdown.find(b => b.factor_id === 'fx_zar_usd')?.pnl).toBeCloseTo(-180);
  });
});
