import { describe, it, expect } from 'vitest';
import { MERIDIAN_CHAINS, chainLevel, chainLevelHistogram } from '../src/utils/chain-registry-meridian';

describe('chainLevel', () => {
  it('classifies every chain into L3-L5, never L1/L2', () => {
    for (const d of MERIDIAN_CHAINS) {
      const lvl = chainLevel(d);
      expect(lvl, d.key).toBeGreaterThanOrEqual(3);
      expect(lvl, d.key).toBeLessThanOrEqual(5);
    }
  });

  it('histogram totals all chains and emits the breakdown', () => {
    const h = chainLevelHistogram();
    expect(h[3] + h[4] + h[5]).toBe(MERIDIAN_CHAINS.length);
    // eslint-disable-next-line no-console
    console.log(`\nFeature-depth histogram (${MERIDIAN_CHAINS.length} chains): L3=${h[3]}  L4=${h[4]}  L5=${h[5]}\n`);
  });
});
