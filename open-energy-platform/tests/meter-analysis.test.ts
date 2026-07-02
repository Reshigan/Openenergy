// Pure-core tests for meter-analysis opportunity algorithms (static data).
import { describe, it, expect } from 'vitest';
import {
  daysCovered, idleLoad, peakShift, continuousFlow, scanOpportunities, freeScanSummary,
  type MeterReading, type AnalysisContext,
} from '../src/utils/meter-analysis';

// A tiny 2-day electricity series: hours 0-1 overnight (should be idle), 18-19 peak.
const elecCtx: AnalysisContext = {
  medium: 'electricity', unitPriceZar: 3, offpeakPriceZar: 1.5,
  peakHours: [18, 19], offHours: [0, 1], expectedIdlePerInterval: 0, shiftableFraction: 0.5,
};
const elecSeries: MeterReading[] = [
  { ts: '2026-01-01T00:00:00Z', value: 10 }, { ts: '2026-01-01T01:00:00Z', value: 10 }, // off-hours load = waste
  { ts: '2026-01-01T18:00:00Z', value: 40 }, { ts: '2026-01-01T19:00:00Z', value: 40 }, // peak load
  { ts: '2026-01-03T00:00:00Z', value: 10 },
];

describe('daysCovered', () => {
  it('spans first→last ts, min 1', () => {
    expect(daysCovered(elecSeries)).toBeCloseTo(2, 1);
    expect(daysCovered([{ ts: '2026-01-01T00:00:00Z', value: 1 }])).toBe(1);
  });
});

describe('idleLoad', () => {
  it('flags off-hours consumption above expected idle', () => {
    const o = idleLoad(elecSeries, elecCtx, 1);
    expect(o).not.toBeNull();
    expect(o!.code).toBe('idle_load');
    expect(o!.estimatedSavingZarYr).toBeGreaterThan(0);
  });
  it('returns null when off-hours are clean', () => {
    expect(idleLoad(elecSeries, { ...elecCtx, expectedIdlePerInterval: 100 }, 1)).toBeNull();
  });
});

describe('peakShift', () => {
  it('values shifting peak load at the tariff spread', () => {
    const o = peakShift(elecSeries, elecCtx, 1);
    expect(o).not.toBeNull();
    // peakUnits 80 × 0.5 shiftable × (3-1.5) spread = 60
    expect(o!.estimatedSavingZarYr).toBe(60);
  });
  it('returns null without an off-peak rate below the standard rate', () => {
    expect(peakShift(elecSeries, { ...elecCtx, offpeakPriceZar: undefined }, 1)).toBeNull();
    expect(peakShift(elecSeries, { ...elecCtx, offpeakPriceZar: 3 }, 1)).toBeNull();
  });
});

describe('continuousFlow (water only)', () => {
  const waterCtx: AnalysisContext = { medium: 'water', unitPriceZar: 20 };
  it('flags a persistent baseline (never drops to zero)', () => {
    const s = [{ ts: '2026-01-01T00:00:00Z', value: 2 }, { ts: '2026-01-01T03:00:00Z', value: 5 }, { ts: '2026-01-01T06:00:00Z', value: 3 }];
    const o = continuousFlow(s, waterCtx, 1);
    expect(o).not.toBeNull();
    expect(o!.code).toBe('continuous_flow'); // min 2 × 3 intervals × 20 = 120
    expect(o!.estimatedSavingZarYr).toBe(120);
  });
  it('returns null when flow drops to zero somewhere', () => {
    const s = [{ ts: '2026-01-01T00:00:00Z', value: 0 }, { ts: '2026-01-01T03:00:00Z', value: 5 }];
    expect(continuousFlow(s, waterCtx, 1)).toBeNull();
  });
  it('ignores non-water media', () => {
    expect(continuousFlow([{ ts: '2026-01-01T00:00:00Z', value: 2 }], elecCtx, 1)).toBeNull();
  });
});

describe('scanOpportunities + freeScanSummary', () => {
  it('returns ranked opportunities; free summary hides detail', () => {
    const opps = scanOpportunities(elecSeries, elecCtx);
    expect(opps.length).toBeGreaterThanOrEqual(2);
    // ranked by saving desc
    for (let i = 1; i < opps.length; i++) expect(opps[i - 1].estimatedSavingZarYr).toBeGreaterThanOrEqual(opps[i].estimatedSavingZarYr);
    const free = freeScanSummary(opps);
    expect(free.count).toBe(opps.length);
    expect(free.totalEstZarYr).toBe(opps.reduce((s, o) => s + o.estimatedSavingZarYr, 0));
    expect(free.topTitle).toBe(opps[0].title);
  });
});
