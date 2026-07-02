// accessTokenTtlSeconds — env-scoped TTL override, clamped so a bad var can
// neither shorten below the 1h default nor mint >24h tokens.
import { describe, it, expect } from 'vitest';
import { accessTokenTtlSeconds, ACCESS_TOKEN_EXPIRY_SECONDS } from '../src/utils/auth-tokens';

describe('accessTokenTtlSeconds', () => {
  it('defaults to 1h when unset or unparseable', () => {
    expect(accessTokenTtlSeconds({})).toBe(ACCESS_TOKEN_EXPIRY_SECONDS);
    expect(accessTokenTtlSeconds({ ACCESS_TOKEN_TTL_SECONDS: 'nope' })).toBe(ACCESS_TOKEN_EXPIRY_SECONDS);
  });
  it('honours the demo override (6h)', () => {
    expect(accessTokenTtlSeconds({ ACCESS_TOKEN_TTL_SECONDS: '21600' })).toBe(21600);
  });
  it('clamps: never below 1h, never above 24h', () => {
    expect(accessTokenTtlSeconds({ ACCESS_TOKEN_TTL_SECONDS: '60' })).toBe(ACCESS_TOKEN_EXPIRY_SECONDS);
    expect(accessTokenTtlSeconds({ ACCESS_TOKEN_TTL_SECONDS: '999999999' })).toBe(24 * 3600);
  });
});
