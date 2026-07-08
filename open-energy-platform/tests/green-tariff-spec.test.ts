import { describe, it, expect } from 'vitest';
import {
  GT_CLASSES,
  deriveGtSla,
  GT_HARD_TERMINALS,
  GT_VALID_TRANSITIONS,
  GT_STATE_TRANSITIONS,
  type GreenTariffClass,
  type GtStatus,
} from '../src/utils/green-tariff-spec';

describe('green-tariff-spec', () => {
  it('GT_CLASSES covers exactly the four tariff classes (migration 456 CHECK)', () => {
    expect([...GT_CLASSES].sort()).toEqual(
      ['corporate_ppa', 'sbti_aligned', 'utility_green_tariff', 'voluntary'],
    );
  });

  it.each([...GT_CLASSES])('deriveGtSla(%s) returns a positive finite day count', (cls) => {
    const days = deriveGtSla(cls);
    expect(Number.isFinite(days)).toBe(true);
    expect(days).toBeGreaterThan(0);
  });

  it('sbti_aligned gets the longest SLA (inverted rigor)', () => {
    for (const cls of GT_CLASSES.filter((c) => c !== 'sbti_aligned')) {
      expect(deriveGtSla('sbti_aligned')).toBeGreaterThan(deriveGtSla(cls));
    }
  });

  it('unknown class falls back to 21 days', () => {
    expect(deriveGtSla('bogus' as GreenTariffClass)).toBe(21);
  });

  it('hard terminals have no valid transitions', () => {
    for (const s of GT_HARD_TERMINALS) {
      expect(GT_VALID_TRANSITIONS[s]).toEqual([]);
    }
  });

  it('every valid action maps to a defined next status', () => {
    for (const actions of Object.values(GT_VALID_TRANSITIONS)) {
      for (const a of actions) {
        const next: GtStatus = GT_STATE_TRANSITIONS[a];
        expect(GT_VALID_TRANSITIONS[next]).toBeDefined();
      }
    }
  });
});
