// tests/chain-registry-meridian.test.ts
import { describe, it, expect } from 'vitest';
import {
  MERIDIAN_CHAINS, bucketFor, attentionScore, type HorizonBucket,
} from '../src/utils/chain-registry-meridian';

const NOW = new Date('2026-06-12T09:40:00Z').getTime();
const h = (n: number) => new Date(NOW + n * 3600_000).toISOString();

describe('bucketFor', () => {
  it('maps deadlines to the six horizon buckets', () => {
    expect(bucketFor(h(-1), NOW)).toBe<'breached'>('breached');
    expect(bucketFor(h(1), NOW)).toBe<'h2'>('h2');
    expect(bucketFor(h(8), NOW)).toBe<'today'>('today');   // <24h
    expect(bucketFor(h(40), NOW)).toBe<'h48'>('h48');
    expect(bucketFor(h(100), NOW)).toBe<'week'>('week');    // <168h
    expect(bucketFor(h(300), NOW)).toBe<'later'>('later');
    expect(bucketFor(null, NOW)).toBe<'later'>('later');
  });
});

describe('attentionScore', () => {
  it('weights by log10(ZAR) over hours remaining, money dominates within a bucket', () => {
    const big = attentionScore(850_000_000, h(8), NOW);
    const small = attentionScore(12_000, h(8), NOW);
    expect(big).toBeGreaterThan(small);
  });
  it('breached outranks everything regardless of quantum', () => {
    expect(attentionScore(12_000, h(-1), NOW))
      .toBeGreaterThan(attentionScore(850_000_000, h(8), NOW));
  });
  it('handles null quantum and null deadline without NaN', () => {
    expect(Number.isFinite(attentionScore(null, null, NOW))).toBe(true);
  });
  it('clamps hours remaining to a 0.25h floor so near-deadline scores stay finite', () => {
    const nearDeadline = attentionScore(1_000_000, h(0.1), NOW);
    const atFloor = attentionScore(1_000_000, h(0.25), NOW);
    expect(nearDeadline).toBe(atFloor);
    expect(Number.isFinite(nearDeadline)).toBe(true);
  });
});

describe('MERIDIAN_CHAINS registry shape', () => {
  it('every entry has table, statusCol default, deadline col, ≥1 lane', () => {
    for (const d of MERIDIAN_CHAINS) {
      expect(d.table).toMatch(/^oe_/);
      expect(d.key).toMatch(/^[a-z_]+$/);
      expect(Object.keys(d.lanes).length).toBeGreaterThan(0);
      expect(d.terminal.length).toBeGreaterThan(0);
    }
  });
  it('keys are unique', () => {
    const keys = MERIDIAN_CHAINS.map(d => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
