import { describe, it, expect } from 'vitest';
import { ALL_ROLES, isPlatformRole, type PlatformRole } from '../src/utils/platform-event';

describe('platform-event contract', () => {
  it('ALL_ROLES has the 9 canonical roles', () => {
    expect(ALL_ROLES).toEqual([
      'admin', 'ipp_developer', 'trader', 'lender', 'offtaker',
      'carbon_fund', 'grid_operator', 'regulator', 'support',
    ]);
  });

  it('isPlatformRole accepts a canonical role', () => {
    expect(isPlatformRole('lender')).toBe(true);
  });

  it('isPlatformRole rejects an unknown role', () => {
    expect(isPlatformRole('wizard')).toBe(false);
  });
});
