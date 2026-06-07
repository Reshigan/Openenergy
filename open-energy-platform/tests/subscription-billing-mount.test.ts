import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import subscriptionBillingChainRoutes, {
  subscriptionBillingSlaSweep,
} from '../src/routes/subscription-billing-chain';

let db: Database.Database;
let env: any;
let adminToken: string;
let traderToken: string;

beforeEach(async () => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  adminToken = await testJwtFor(db, 'par_admin', { role: 'admin' });
  traderToken = await testJwtFor(db, 'par_trader', { role: 'trader' });
});
afterEach(() => { db.close(); });

describe('subscription-billing — auth', () => {
  it('rejects a trader with 403 on GET /', async () => {
    const res = await call(subscriptionBillingChainRoutes, env, 'GET', '/', { token: traderToken });
    expect(res.status).toBe(403);
  });

  it('allows admin to list with stats', async () => {
    const res = await call(subscriptionBillingChainRoutes, env, 'GET', '/', { token: adminToken });
    expect(res.status).toBe(200);
    const body = res.json as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.invoices)).toBe(true);
    expect(body.data.stats).toBeTruthy();
  });
});

describe('subscription-billing — forward transition', () => {
  it('draft → issued → payment_pending → paid', async () => {
    const gen = await call(subscriptionBillingChainRoutes, env, 'POST', '/generate', {
      token: adminToken,
      body: { participant_id: 'par_x', billing_period: '2026-06', subscription_tier: 'professional' },
    });
    expect(gen.status).toBe(201);
    const id = (gen.json as any).data.invoice.id;
    expect(id).toBeTruthy();

    const issued = await call(subscriptionBillingChainRoutes, env, 'POST', `/${id}/action`, {
      token: adminToken, body: { action: 'issue' },
    });
    expect(issued.status).toBe(200);
    expect((issued.json as any).data.invoice.chain_status).toBe('issued');

    const ack = await call(subscriptionBillingChainRoutes, env, 'POST', `/${id}/action`, {
      token: adminToken, body: { action: 'acknowledge' },
    });
    expect(ack.status).toBe(200);
    expect((ack.json as any).data.invoice.chain_status).toBe('payment_pending');

    const paid = await call(subscriptionBillingChainRoutes, env, 'POST', `/${id}/action`, {
      token: adminToken, body: { action: 'record_payment', payment_method: 'eft', payment_ref: 'X1' },
    });
    expect(paid.status).toBe(200);
    expect((paid.json as any).data.invoice.chain_status).toBe('paid');
  });
});

describe('subscription-billing — disallowed transition guard', () => {
  it('rejects record_payment from a fresh draft with 409', async () => {
    const gen = await call(subscriptionBillingChainRoutes, env, 'POST', '/generate', {
      token: adminToken,
      body: { participant_id: 'par_guard', billing_period: '2026-06', subscription_tier: 'starter' },
    });
    expect(gen.status).toBe(201);
    const id = (gen.json as any).data.invoice.id;

    const bad = await call(subscriptionBillingChainRoutes, env, 'POST', `/${id}/action`, {
      token: adminToken, body: { action: 'record_payment' },
    });
    expect(bad.status).toBe(409);
  });
});

describe('subscription-billing — SLA sweep', () => {
  it('marks payment_pending past deadline as overdue + sla_breached', async () => {
    const gen = await call(subscriptionBillingChainRoutes, env, 'POST', '/generate', {
      token: adminToken,
      body: { participant_id: 'par_sweep', billing_period: '2026-06', subscription_tier: 'professional' },
    });
    const id = (gen.json as any).data.invoice.id;
    await call(subscriptionBillingChainRoutes, env, 'POST', `/${id}/action`, { token: adminToken, body: { action: 'issue' } });
    await call(subscriptionBillingChainRoutes, env, 'POST', `/${id}/action`, { token: adminToken, body: { action: 'acknowledge' } });

    db.prepare("UPDATE oe_subscription_invoices SET sla_deadline = '2020-01-01' WHERE id = ?").run(id);

    await subscriptionBillingSlaSweep(env as any);

    const row = db.prepare('SELECT chain_status, sla_breached FROM oe_subscription_invoices WHERE id=?').get(id) as any;
    expect(row.chain_status).toBe('overdue');
    expect(row.sla_breached).toBe(1);
  });
});

describe('subscription-billing — mount reachability', () => {
  // Mount-reachability approach: BOTH the full-worker dynamic import AND a
  // static source-order check.
  //
  // The full-worker import (../src/index) loads cleanly under vitest, so we
  // drive the real composed app through its global middleware stack. We supply
  // a stub executionCtx ({ waitUntil, passThroughOnException }) so requestLogger
  // (middleware/security.ts) takes its waitUntil branch instead of throwing;
  // with that in place the admin GET returns a genuine 200, proving the
  // /api/subscription/billing surface is mounted and reachable rather than
  // swallowed by the /api catch-all (an unmounted /api path falls through to
  // platformFeaturesRoutes and 404s).
  it('mounts /api/subscription/billing in the worker (admin GET returns 200)', async () => {
    const appModule = await import('../src/index');
    const app = appModule.default as { fetch: (req: Request, env: any, ctx: any) => Promise<Response> };
    const req = new Request('http://localhost/api/subscription/billing', {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const res = await app.fetch(req, env, { waitUntil: () => {}, passThroughOnException: () => {} });
    expect(res.status).toBe(200);
  });

  // Authoritative mount assertion: the route is wired in source AND lands before
  // the /api catch-all (platformFeaturesRoutes) so the specific mount wins.
  it('mounts the route before the /api catch-all (source-order check)', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');
    const mountIdx = src.indexOf("app.route('/api/subscription/billing'");
    const catchAllIdx = src.indexOf("app.route('/api', platformFeaturesRoutes)");
    expect(mountIdx).toBeGreaterThan(-1);
    expect(catchAllIdx).toBeGreaterThan(-1);
    expect(mountIdx).toBeLessThan(catchAllIdx);
  });
});
