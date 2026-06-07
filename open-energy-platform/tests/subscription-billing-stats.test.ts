// GET / returns a paginated invoice list plus aggregate stats. The stats must
// reflect the full filtered set, not just the page returned, otherwise an admin
// reading page 1 of a large tenant sees a total that silently undercounts.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import app from '../src/routes/subscription-billing-chain';

let db: Database.Database;
let env: any;
let admin: string;

beforeEach(async () => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  admin = await testJwtFor(db, 'par_admin', { role: 'admin' });
});
afterEach(() => db.close());

describe('subscription-billing stats scope', () => {
  it('stats.total counts the full filtered set, not just the page', async () => {
    for (const p of ['par_a', 'par_b', 'par_c']) {
      await call(app, env, 'POST', '/generate', {
        token: admin,
        body: { participant_id: p, billing_period: '2026-06', subscription_tier: 'starter' },
      });
    }
    const res = await call(app, env, 'GET', '/?per_page=1', { token: admin });
    expect(res.status).toBe(200);
    const body = res.json as any;
    expect(body.data.invoices.length).toBe(1);
    expect(body.data.stats.total).toBe(3);
  });

  it('stats honour the same filters as the page query', async () => {
    for (const p of ['par_a', 'par_b']) {
      await call(app, env, 'POST', '/generate', {
        token: admin,
        body: { participant_id: p, billing_period: '2026-06', subscription_tier: 'starter' },
      });
    }
    await call(app, env, 'POST', '/generate', {
      token: admin,
      body: { participant_id: 'par_c', billing_period: '2026-07', subscription_tier: 'starter' },
    });
    const res = await call(app, env, 'GET', '/?period=2026-06&per_page=1', { token: admin });
    expect(res.status).toBe(200);
    expect((res.json as any).data.stats.total).toBe(2);
  });
});
