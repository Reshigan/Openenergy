import { describe, it, expect } from 'vitest';
import { surfaceRole, tileTarget, isTileReachable } from '../pages/src/meridian/reachability';

// hasSurface stub: only this one composite key exists.
const hasSurface = (k: string) => k === 'esco:sites-portfolio';

describe('surfaceRole', () => {
  it('maps esums_owner to esco, leaves others unchanged', () => {
    expect(surfaceRole('esums_owner')).toBe('esco');
    expect(surfaceRole('trader')).toBe('trader');
  });
});

describe('tileTarget', () => {
  it('prefers chainKey -> ledger', () => {
    expect(tileTarget('trader', { key: 'x', chainKey: 'covenant_certificate' }, hasSurface))
      .toBe('/ledger/covenant_certificate');
  });
  it('falls back to route', () => {
    expect(tileTarget('trader', { key: 'x', route: '/reports' }, hasSurface)).toBe('/reports');
  });
  it('falls back to surface when registered (role-mapped)', () => {
    expect(tileTarget('esums_owner', { key: 'sites-portfolio' }, hasSurface))
      .toBe('/surface/sites-portfolio');
  });
  it('returns null when nothing resolves', () => {
    expect(tileTarget('trader', { key: 'ghost' }, hasSurface)).toBeNull();
  });
});

describe('isTileReachable', () => {
  it('true when a target resolves, false otherwise', () => {
    expect(isTileReachable('trader', { key: 'x', route: '/reports' }, hasSurface)).toBe(true);
    expect(isTileReachable('trader', { key: 'ghost' }, hasSurface)).toBe(false);
  });
});
