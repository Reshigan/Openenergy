import { describe, it, expect } from 'vitest';
import { heroBlurb, heroStorageKey, heroDefaultCollapsed } from './decl';

describe('heroBlurb', () => {
  it('returns the exact copy for a documented role', () => {
    expect(heroBlurb('trader')).toBe('Order book, positions, and margin at a glance.');
  });
  it('returns undefined for a role with no entry', () => {
    expect(heroBlurb('nonexistent_role')).toBeUndefined();
  });
});

describe('heroStorageKey', () => {
  it('namespaces the key by role', () => {
    expect(heroStorageKey('trader')).toBe('heroCollapsed:trader');
    expect(heroStorageKey('admin')).toBe('heroCollapsed:admin');
  });
});

describe('heroDefaultCollapsed', () => {
  it('is true for a Transaction path', () => {
    expect(heroDefaultCollapsed('/v2/t/abc-123')).toBe(true);
  });
  it('is false for Home, Find, and Trade paths', () => {
    expect(heroDefaultCollapsed('/v2')).toBe(false);
    expect(heroDefaultCollapsed('/v2/find')).toBe(false);
    expect(heroDefaultCollapsed('/v2/trade')).toBe(false);
  });
});
