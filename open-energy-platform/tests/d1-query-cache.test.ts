// Verify the KV caches in the auth middleware + tenant-quota middleware
// actually cut D1 queries on repeat requests. Counts prepare() calls on
// the integration D1 between an uncached first request and a cached
// second request — cached should do zero participant lookups.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import regulatorSuite from '../src/routes/regulator-suite';

let db: Database.Database;
let env: Record<string, unknown>;
let token: string;

beforeAll(async () => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  token = await testJwtFor(db, 'admin_cache', { role: 'admin' });
});
afterAll(() => { db.close(); });

/**
 * Wrap env.DB.prepare so we can count how many queries an authenticated
 * request issues. We only care about the middleware cost, not the route
 * payload, so we hit a cheap GET.
 */
function instrumentedEnv(): { env: Record<string, unknown>; counters: { prepares: number } } {
  const counters = { prepares: 0 };
  const origPrepare = (env.DB as { prepare: (sql: string) => unknown }).prepare.bind(env.DB);
  const instrumented = {
    ...env,
    DB: new Proxy(env.DB as object, {
      get(target, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            counters.prepares += 1;
            return origPrepare(sql);
          };
        }
        return (target as Record<string | symbol, unknown>)[prop];
      },
    }),
  };
  return { env: instrumented as Record<string, unknown>, counters };
}

describe('Auth + quota middleware cache cuts D1 queries on repeat requests', () => {
  it('second authenticated request issues fewer prepare() calls than the first', async () => {
    // Warm path: first request populates the tenant cache + rules cache.
    const warm = instrumentedEnv();
    const warmRes = await call(regulatorSuite, warm.env, 'GET', '/licences', { token });
    expect(warmRes.status).toBe(200);
    const warmCount = warm.counters.prepares;

    // Cached path — reuse the SAME process-level KV store seeded by warm,
    // but a fresh instrumentedEnv so we count from scratch.
    const cached = instrumentedEnv();
    const cachedRes = await call(regulatorSuite, cached.env, 'GET', '/licences', { token });
    expect(cachedRes.status).toBe(200);
    const cachedCount = cached.counters.prepares;

    // Diagnostic for CI log.
    // eslint-disable-next-line no-console
    console.log(`D1 prepare() calls: warm=${warmCount}, cached=${cachedCount}`);

    // Cached flow must issue strictly fewer prepares than warm. On a
    // freshly-cached tenant (auth cache hit + rules cache hit) we save
    // 2 D1 queries per request.
    expect(cachedCount).toBeLessThan(warmCount);
  });
});
