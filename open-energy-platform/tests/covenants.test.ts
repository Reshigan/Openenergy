import { describe, it, expect } from 'vitest';
import { evaluateCovenant, dscr, llcr, runWaterfall } from '../src/utils/covenants';

describe('evaluateCovenant — gte', () => {
  const def = { operator: 'gte' as const, threshold: 1.2, threshold_upper: null };

  it('passes when measurement is comfortably above threshold', () => {
    expect(evaluateCovenant(def, 1.5)).toBe('pass');
  });

  it('warns when measurement is within 5% of threshold but above', () => {
    expect(evaluateCovenant(def, 1.22)).toBe('warn'); // 1.2 × 1.05 = 1.26 — 1.22 < 1.26
  });

  it('breaches when measurement is below threshold', () => {
    expect(evaluateCovenant(def, 1.1)).toBe('breach');
  });

  it('returns not_tested when measurement is null', () => {
    expect(evaluateCovenant(def, null)).toBe('not_tested');
  });

  it('returns not_tested when threshold is missing', () => {
    expect(evaluateCovenant({ operator: 'gte', threshold: null, threshold_upper: null }, 1.5)).toBe('not_tested');
  });
});

describe('evaluateCovenant — lte', () => {
  const def = { operator: 'lte' as const, threshold: 70, threshold_upper: null };

  it('passes when below threshold by more than 5%', () => {
    expect(evaluateCovenant(def, 50)).toBe('pass');
  });

  it('warns when within the 5% warn band approaching threshold', () => {
    expect(evaluateCovenant(def, 68)).toBe('warn'); // 70 × 0.95 = 66.5; 68 > 66.5
  });

  it('breaches when above threshold', () => {
    expect(evaluateCovenant(def, 75)).toBe('breach');
  });
});

describe('evaluateCovenant — between', () => {
  const def = { operator: 'between' as const, threshold: 1.0, threshold_upper: 2.0 };

  it('passes in the middle of the band', () => {
    expect(evaluateCovenant(def, 1.5)).toBe('pass');
  });

  it('warns near the lower edge', () => {
    expect(evaluateCovenant(def, 1.02)).toBe('warn'); // band width 1.0, warn 5% = 0.05
  });

  it('warns near the upper edge', () => {
    expect(evaluateCovenant(def, 1.98)).toBe('warn');
  });

  it('breaches outside the band', () => {
    expect(evaluateCovenant(def, 0.5)).toBe('breach');
    expect(evaluateCovenant(def, 2.5)).toBe('breach');
  });
});

describe('dscr & llcr', () => {
  it('computes DSCR = cfads / debt service', () => {
    expect(dscr(150, 100)).toBeCloseTo(1.5, 5);
  });
  it('returns null on zero debt service', () => {
    expect(dscr(150, 0)).toBeNull();
  });
  it('computes LLCR', () => {
    expect(llcr(800, 500)).toBeCloseTo(1.6, 5);
  });
});

describe('runWaterfall', () => {
  it('pays tranches in priority order until cash runs out', () => {
    const r = runWaterfall(1000, [
      { id: 'opex',    priority: 1, required_amount_zar: 300 },
      { id: 'int',     priority: 2, required_amount_zar: 200 },
      { id: 'prin',    priority: 3, required_amount_zar: 400 },
      { id: 'dsra',    priority: 4, required_amount_zar: 200 },
      { id: 'equity',  priority: 5, required_amount_zar: 100 },
    ]);
    expect(r.allocations[0]).toEqual({ tranche_id: 'opex', allocated_zar: 300, shortfall_zar: 0 });
    expect(r.allocations[1]).toEqual({ tranche_id: 'int', allocated_zar: 200, shortfall_zar: 0 });
    expect(r.allocations[2]).toEqual({ tranche_id: 'prin', allocated_zar: 400, shortfall_zar: 0 });
    expect(r.allocations[3]).toEqual({ tranche_id: 'dsra', allocated_zar: 100, shortfall_zar: 100 });
    expect(r.allocations[4]).toEqual({ tranche_id: 'equity', allocated_zar: 0, shortfall_zar: 100 });
    expect(r.surplus_after_all_tranches_zar).toBe(0);
    expect(r.total_allocated_zar).toBe(1000);
  });

  it('leaves surplus when cash exceeds total required', () => {
    const r = runWaterfall(1000, [{ id: 't1', priority: 1, required_amount_zar: 400 }]);
    expect(r.surplus_after_all_tranches_zar).toBe(600);
    expect(r.total_allocated_zar).toBe(400);
  });

  it('sorts by priority regardless of input order', () => {
    const r = runWaterfall(500, [
      { id: 'low', priority: 10, required_amount_zar: 200 },
      { id: 'hi',  priority: 1,  required_amount_zar: 200 },
    ]);
    expect(r.allocations[0].tranche_id).toBe('hi');
    expect(r.allocations[1].tranche_id).toBe('low');
  });

  it('handles zero available cash by returning all shortfalls', () => {
    const r = runWaterfall(0, [{ id: 't1', priority: 1, required_amount_zar: 500 }]);
    expect(r.allocations[0]).toEqual({ tranche_id: 't1', allocated_zar: 0, shortfall_zar: 500 });
  });
});
