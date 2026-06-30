// ═══════════════════════════════════════════════════════════════════════════
// Security middleware — sensitive-tier rate limiter atomicity + fail-closed.
// PR-Prod-7 follow-up: the sensitive tier (10/5min on /auth/login et al.)
// moved from a non-atomic KV get-then-put to a D1 conditional upsert.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkSensitiveRateLimit,
  isSensitivePath,
  __resetSensitiveSchemaCacheForTests,
} from '../../src/middleware/security';
import type { HonoEnv } from '../../src/utils/types';

// ──────────────────────────────────────────────────────────────────────────
// In-memory D1 mock.
//
// The atomicity we care about is the read-check-increment step. The mock
// serialises each upsert through a Promise-chain mutex so two concurrent
// `first()` calls never interleave — the second only sees the row state
// left by the first. That is the guarantee a real D1 single statement gives
// us, and exactly what the old KV get-then-put could not.
// ──────────────────────────────────────────────────────────────────────────

interface CounterRow {
  window_start: number;
  count: number;
  max_requests: number;
  expires_at: number;
}

class MockD1 {
  private rows = new Map<string, CounterRow>();
  private chain: Promise<unknown> = Promise.resolve();
  // When set, the Nth upsert `first()` call throws — simulates a transient
  // D1 outage so we can verify fail-closed behaviour.
  throwOnUpsert: number | null = null;
  // When true, schema bootstrap (`.run()`) throws.
  throwOnSchema = false;
  private upsertCalls = 0;

  private runSerial<T>(fn: () => T | Promise<T>): Promise<T> {
    const result = this.chain.then(() => fn());
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  // Mirrors the real D1PreparedStatement surface: `.run()`, `.first()`, and
  // `.bind()` (which returns the same shape bound to params) are all valid.
  private stmt(sql: string, vals: unknown[] = []) {
    const self = this;
    return {
      bind(...b: unknown[]) {
        return self.stmt(sql, b);
      },
      async run() {
        // Schema statements (CREATE TABLE / CREATE INDEX) arrive unbound.
        if (self.throwOnSchema && !sql.includes('RETURNING')) {
          throw new Error('D1 schema bootstrap failed');
        }
        return { success: true };
      },
      async first<T = Record<string, unknown>>(): Promise<T | null> {
        // Only the upsert statement has a RETURNING clause.
        if (!sql.includes('RETURNING count')) {
          return null;
        }
        const callIdx = ++self.upsertCalls;
        if (self.throwOnUpsert !== null && callIdx === self.throwOnUpsert) {
          throw new Error('D1 transient outage');
        }
        const [bucketKey, windowStart, maxRequests, expiresAt] = vals as [
          string,
          number,
          number,
          number,
        ];
        return self.runSerial<T | null>(() => {
          const row = self.rows.get(bucketKey);
          if (!row) {
            self.rows.set(bucketKey, {
              window_start: windowStart,
              count: 1,
              max_requests: maxRequests,
              expires_at: expiresAt,
            });
            return { count: 1 } as T;
          }
          if (row.count < row.max_requests) {
            row.count += 1;
            return { count: row.count } as T;
          }
          // WHERE false — no update, RETURNING yields nothing.
          return null;
        });
      },
    };
  }

  prepare(sql: string) {
    return this.stmt(sql);
  }
}

function makeD1Env(): { env: HonoEnv; db: MockD1 } {
  const db = new MockD1();
  const env = { DB: db as unknown as HonoEnv['Bindings']['DB'] } as unknown as HonoEnv;
  return { env, db };
}

// Pre-fill a bucket to a specific count by calling the limiter repeatedly
// with the same identifier/route so the mock row exists at that count.
async function prefill(env: HonoEnv, identifier: string, route: string, to: number): Promise<void> {
  for (let i = 0; i < to; i++) {
    await checkSensitiveRateLimit(env, identifier, route);
  }
}

describe('sensitive rate limiter — D1 atomic path', () => {
  let env: HonoEnv;
  let db: MockD1;

  beforeEach(() => {
    ({ env, db } = makeD1Env());
    __resetSensitiveSchemaCacheForTests();
  });

  it('reports the 10/5min budget', async () => {
    const r = await checkSensitiveRateLimit(env, 'ip-1', '/api/auth/login');
    expect(r.limit).toBe(10);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(9);
  });

  it('blocks after ten attempts in the window', async () => {
    await prefill(env, 'ip-2', '/api/auth/login', 10);
    const blocked = await checkSensitiveRateLimit(env, 'ip-2', '/api/auth/login');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('isolates by route family so login + reset have separate budgets', async () => {
    await prefill(env, 'ip-3', '/api/auth/login', 10);
    const reset = await checkSensitiveRateLimit(env, 'ip-3', '/api/auth/forgot-password');
    expect(reset.allowed).toBe(true);
    expect(reset.remaining).toBe(9);
  });

  it('two concurrent logins at count=9 yield exactly one allow and one 429', async () => {
    // Pre-fill to 9 so only one slot remains. Under the old KV get-then-put
    // both calls would read 9, both pass, and the cap would silently be 11.
    // The D1 conditional upsert is atomic: one increments to 10 (allowed),
    // the other hits WHERE count<10 false (blocked).
    await prefill(env, 'ip-race', '/api/auth/login', 9);
    const [a, b] = await Promise.all([
      checkSensitiveRateLimit(env, 'ip-race', '/api/auth/login'),
      checkSensitiveRateLimit(env, 'ip-race', '/api/auth/login'),
    ]);
    const allowed = [a, b].filter((r) => r.allowed).length;
    const blocked = [a, b].filter((r) => !r.allowed).length;
    expect(allowed).toBe(1);
    expect(blocked).toBe(1);
    // The winner should report exactly 0 remaining.
    const winner = a.allowed ? a : b;
    expect(winner.remaining).toBe(0);
  });

  it('fails closed when the D1 upsert throws (brute-force cap stays enforced)', async () => {
    await prefill(env, 'ip-err', '/api/auth/login', 3);
    db.throwOnUpsert = 4; // the next call's upsert throws
    const r = await checkSensitiveRateLimit(env, 'ip-err', '/api/auth/login');
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(10);
  });

  it('fails closed when schema bootstrap fails', async () => {
    db.throwOnSchema = true;
    const r = await checkSensitiveRateLimit(env, 'ip-schema', '/api/auth/login');
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(10);
  });

  it('still recognises sensitive paths', () => {
    expect(isSensitivePath('/api/auth/login')).toBe(true);
    expect(isSensitivePath('/api/auth/mfa/verify')).toBe(true);
    expect(isSensitivePath('/api/trading/orders')).toBe(false);
  });
});