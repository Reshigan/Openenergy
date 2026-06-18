import { describe, it, expect } from 'vitest';
import { surfaceRole, tileTarget, isTileReachable } from '../pages/src/meridian/reachability';
import { singleChainOf, classifyLoadError } from '../pages/src/meridian/lib';

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

describe('singleChainOf', () => {
  it('returns the chain when every case shares it', () => {
    expect(singleChainOf([{ chain: 'ppa_contract' }, { chain: 'ppa_contract' }]))
      .toBe('ppa_contract');
  });
  it('returns null for a mixed lane', () => {
    expect(singleChainOf([{ chain: 'ppa_contract' }, { chain: 'take_or_pay' }])).toBeNull();
  });
  it('returns null for an empty lane', () => {
    expect(singleChainOf([])).toBeNull();
  });
});

describe('classifyLoadError', () => {
  it('maps HTTP status to kind', () => {
    expect(classifyLoadError({ response: { status: 403 } })).toBe('forbidden');
    expect(classifyLoadError({ response: { status: 404 } })).toBe('notfound');
  });
  it('treats a response-less request as network', () => {
    expect(classifyLoadError({ request: {} })).toBe('network');
  });
  it('falls back to unknown for everything else', () => {
    expect(classifyLoadError(new Error('boom'))).toBe('unknown');
    expect(classifyLoadError({ response: { status: 500 } })).toBe('unknown');
  });
});
