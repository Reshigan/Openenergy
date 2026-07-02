// Pure-core tests for the generic O&M device/meter model (solar-independent meters).
import { describe, it, expect } from 'vitest';
import {
  METER_UNIT, isMeter, readingUnit, classifyHealth, performanceRatio,
  meterDelta, inverterEfficiency, rollupHealth, DEFAULT_HEALTH_BAND,
} from '../src/utils/om-devices';

describe('meter model — independent of solar', () => {
  it('has units for non-electricity media (water, waste, gas…)', () => {
    expect(METER_UNIT.water).toBe('kL');
    expect(METER_UNIT.waste).toBe('kg');
    expect(METER_UNIT.gas).toBe('m³');
    expect(METER_UNIT.electricity).toBe('kWh');
  });
  it('treats a meter as a meter regardless of medium', () => {
    expect(isMeter('meter')).toBe(true);
    expect(isMeter('solar_inverter')).toBe(false);
  });
  it('resolves reading unit by kind/medium', () => {
    expect(readingUnit('meter', 'water')).toBe('kL');
    expect(readingUnit('meter', 'waste')).toBe('kg');
    expect(readingUnit('solar_inverter')).toBe('kW');
    expect(readingUnit('battery')).toBe('%SoC');
  });
  it('meterDelta never goes negative (roll-over / bad read guard)', () => {
    expect(meterDelta(100, 140)).toBe(40);
    expect(meterDelta(140, 100)).toBe(0);
  });
});

describe('health classification (MTN healthy/sub-healthy/abnormal)', () => {
  it('bands a performance ratio', () => {
    expect(classifyHealth(1.0)).toBe('healthy');
    expect(classifyHealth(0.85)).toBe('sub_healthy');   // < 0.9
    expect(classifyHealth(0.5)).toBe('abnormal');       // < 0.7
  });
  it('treats non-finite / zero as abnormal (fail-safe)', () => {
    expect(classifyHealth(NaN)).toBe('abnormal');
    expect(classifyHealth(0)).toBe('abnormal');
  });
  it('honours custom bands', () => {
    expect(classifyHealth(0.8, { warn: 0.95, crit: 0.6 })).toBe('sub_healthy');
    expect(classifyHealth(0.5, { warn: 0.95, crit: 0.6 })).toBe('abnormal');
  });
  it('performanceRatio is 0 with no expectation, clamped ≥ 0', () => {
    expect(performanceRatio(90, 100)).toBeCloseTo(0.9);
    expect(performanceRatio(50, 0)).toBe(0);
  });
  it('exposes sane default band', () => {
    expect(DEFAULT_HEALTH_BAND).toEqual({ warn: 0.9, crit: 0.7 });
  });
});

describe('inverter efficiency + health roll-up', () => {
  it('AC/DC efficiency, guarded at zero DC', () => {
    expect(inverterEfficiency(96, 100)).toBeCloseTo(0.96);
    expect(inverterEfficiency(10, 0)).toBe(0);
  });
  it('rolls up a fleet into MTN proportions', () => {
    const r = rollupHealth(['healthy', 'healthy', 'sub_healthy', 'abnormal']);
    expect(r).toEqual({ healthy: 2, sub_healthy: 1, abnormal: 1, total: 4 });
  });
});
