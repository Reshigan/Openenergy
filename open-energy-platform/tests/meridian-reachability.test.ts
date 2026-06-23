import { describe, it, expect } from 'vitest';
import { surfaceRole, tileTarget, isTileReachable } from '../pages/src/meridian/reachability';
// Import from the PURE modules (no axios/react) so this server-vitest suite
// resolves under the root npm install — see lib-pure.ts / quicklinks.ts headers.
import { singleChainOf, classifyLoadError } from '../pages/src/meridian/lib-pure';
import { quicklinkVisible } from '../pages/src/meridian/quicklinks';

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

describe('quicklinkVisible', () => {
  it('shows Reports to every role (universal)', () => {
    expect(quicklinkVisible('offtaker', '/reports')).toBe(true);
    expect(quicklinkVisible('support', '/reports')).toBe(true);
    expect(quicklinkVisible('grid_operator', '/reports')).toBe(true);
  });
  it('restricts Deals to commercial originators', () => {
    expect(quicklinkVisible('ipp_developer', '/deals')).toBe(true);
    expect(quicklinkVisible('trader', '/deals')).toBe(true);
    expect(quicklinkVisible('offtaker', '/deals')).toBe(true);
    expect(quicklinkVisible('grid_operator', '/deals')).toBe(false);
    expect(quicklinkVisible('support', '/deals')).toBe(false);
  });
  it('restricts ESG to sustainability/disclosure roles', () => {
    expect(quicklinkVisible('offtaker', '/esg')).toBe(true);
    expect(quicklinkVisible('carbon_fund', '/esg')).toBe(true);
    expect(quicklinkVisible('regulator', '/esg')).toBe(true);
    expect(quicklinkVisible('trader', '/esg')).toBe(false);
    expect(quicklinkVisible('grid_operator', '/esg')).toBe(false);
  });
  it('restricts Intelligence to admin', () => {
    expect(quicklinkVisible('admin', '/intelligence')).toBe(true);
    expect(quicklinkVisible('ipp_developer', '/intelligence')).toBe(false);
    expect(quicklinkVisible('trader', '/intelligence')).toBe(false);
  });
  it('restricts National to oversight roles', () => {
    expect(quicklinkVisible('admin', '/dashboard')).toBe(true);
    expect(quicklinkVisible('regulator', '/dashboard')).toBe(true);
    expect(quicklinkVisible('grid_operator', '/dashboard')).toBe(true);
    expect(quicklinkVisible('ipp_developer', '/dashboard')).toBe(false);
    expect(quicklinkVisible('offtaker', '/dashboard')).toBe(false);
  });
});
