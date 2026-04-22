// ═══════════════════════════════════════════════════════════════════════════
// Rate limiter unit tests (PR-Prod-7).
// Covers both tiers: global (100/min per IP+UA) and sensitive (10/5min per IP).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, checkSensitiveRateLimit, isSensitivePath } from '../src/middleware/security';
import type { HonoEnv } from '../src/utils/types';

function makeKvEnv(): HonoEnv {
  const store = new Map<string, { value: string; expires: number }>();
  const kv = {
    async get(key: string, type?: 'json' | 'text') {
      const row = store.get(key);
      if (!row) return null;
      if (row.expires && row.expires < Date.now()) {
        store.delete(key);
        return null;
      }
      return type === 'json' ? JSON.parse(row.value) : row.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, {
        value,
        expires: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : 0,
      });
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as HonoEnv['KV'];
  return { KV: kv } as unknown as HonoEnv;
}

describe('isSensitivePath', () => {
  it('matches auth login paths', () => {
    expect(isSensitivePath('/api/auth/login')).toBe(true);
    expect(isSensitivePath('/api/auth/forgot-password')).toBe(true);
    expect(isSensitivePath('/api/auth/reset-password')).toBe(true);
    expect(isSensitivePath('/api/auth/mfa/verify')).toBe(true);
    expect(isSensitivePath('/api/auth/sso/microsoft/callback')).toBe(true);
    expect(isSensitivePath('/api/auth/refresh')).toBe(true);
  });

  it('does not match normal API paths', () => {
    expect(isSensitivePath('/api/cockpit/metrics')).toBe(false);
    expect(isSensitivePath('/api/trading/orders')).toBe(false);
    expect(isSensitivePath('/api/carbon/credits')).toBe(false);
  });
});

describe('checkRateLimit (global tier)', () => {
  let env: HonoEnv;

  beforeEach(() => {
    env = makeKvEnv();
  });

  it('allows the first request with full remaining budget minus one', async () => {
    const result = await checkRateLimit(env, 'test-ip-1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
    expect(result.limit).toBe(100);
  });

  it('decrements remaining across sequential calls', async () => {
    await checkRateLimit(env, 'test-ip-2');
    await checkRateLimit(env, 'test-ip-2');
    const third = await checkRateLimit(env, 'test-ip-2');
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(97);
  });

  it('blocks once the cap is reached and returns Retry-After metadata', async () => {
    for (let i = 0; i < 100; i++) await checkRateLimit(env, 'test-ip-3');
    const blocked = await checkRateLimit(env, 'test-ip-3');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('isolates buckets between identifiers', async () => {
    for (let i = 0; i < 100; i++) await checkRateLimit(env, 'test-ip-A');
    const fromB = await checkRateLimit(env, 'test-ip-B');
    expect(fromB.allowed).toBe(true);
    expect(fromB.remaining).toBe(99);
  });
});

describe('checkSensitiveRateLimit (tier 2 — brute-force)', () => {
  let env: HonoEnv;

  beforeEach(() => {
    env = makeKvEnv();
  });

  it('uses a tighter budget than the global tier', async () => {
    const r = await checkSensitiveRateLimit(env, 'ip-1', '/api/auth/login');
    expect(r.limit).toBe(10);
  });

  it('blocks after ten attempts in the window', async () => {
    for (let i = 0; i < 10; i++) {
      await checkSensitiveRateLimit(env, 'ip-2', '/api/auth/login');
    }
    const blocked = await checkSensitiveRateLimit(env, 'ip-2', '/api/auth/login');
    expect(blocked.allowed).toBe(false);
  });

  it('isolates by route family so login + reset have separate budgets', async () => {
    for (let i = 0; i < 10; i++) {
      await checkSensitiveRateLimit(env, 'ip-3', '/api/auth/login');
    }
    const reset = await checkSensitiveRateLimit(env, 'ip-3', '/api/auth/forgot-password');
    expect(reset.allowed).toBe(true);
    expect(reset.remaining).toBe(9);
  });
});
