import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { signToken } from '../src/middleware/auth';
import { AppError } from '../src/utils/types';
import insights from '../src/routes/insights';

let db: Database.Database;
let env: any;

type RouteEntry = { method: string; path: string };
function has(app: Hono<any>, method: string, path: string): boolean {
  const rs = (app as unknown as { routes: RouteEntry[] }).routes;
  return rs.some(r => r.method.toUpperCase() === method.toUpperCase() && r.path === path);
}

// Mount the route under a parent that mirrors the production index.ts onError:
// authMiddleware throws AppError, and only the global onError converts it to the
// intended status (401/403/…). Calling the module in isolation would otherwise
// surface every thrown AppError as a 500. We mount at '/' so request paths are
// unchanged (e.g. '/chain/:chainKey').
function app() {
  const a = new Hono<any>();
  a.onError((err, c) => {
    const appErr = err instanceof AppError ? err : null;
    const status = (appErr?.statusCode ?? 500) as 400 | 401 | 403 | 404 | 409 | 500;
    return c.json({ success: false, error: appErr?.code ?? 'INTERNAL_ERROR', message: err.message }, status);
  });
  a.route('/', insights);
  return a;
}

// authMiddleware resolves tenant_id from the participants table for the token's
// sub, so the persona must exist (same pattern as role-actions-api.test.ts).
function seedParticipant(id: string, role: string) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, 'active', 'approved', 'default', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`,
  ).run(id, `${id}@openenergy.co.za`, id, role);
}

async function token() {
  return signToken({ sub: 'par_trader', role: 'trader', email: 't@openenergy.co.za' } as any, 'test-secret');
}

function daily(date: string, chainKey: string, events: number, value: number, breaches: number, crossings: number) {
  db.prepare(
    `INSERT INTO oe_metrics_daily
       (id, metric_date, chain_key, events_count, value_total_zar, sla_breaches, regulator_crossings)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(`md_${date}_${chainKey}`, date, chainKey, events, value, breaches, crossings);
}
function ev(id: string, chainKey: string, entityId: string, status: string, at: string) {
  db.prepare(
    `INSERT INTO oe_platform_events
       (id, event, chain_key, entity_type, entity_id, source_chain_status, occurred_at)
     VALUES (?, 'x.transition', ?, 'demo', ?, ?, ?)`,
  ).run(id, chainKey, entityId, status, at);
}

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); seedParticipant('par_trader', 'trader'); });
afterEach(() => { db.close(); });

describe('insights API — mount', () => {
  it('mounts chain + ai routes', () => {
    expect(has(insights, 'GET', '/chain/:chainKey')).toBe(true);
    expect(has(insights, 'GET', '/chain/:chainKey/ai')).toBe(true);
  });
});

describe('insights API — chain stats', () => {
  it('returns snapshot, throughput series and 30d totals', async () => {
    daily('2026-06-05', 'ppa_contract', 4, 1000, 1, 0);
    daily('2026-06-06', 'ppa_contract', 6, 2000, 0, 1);
    ev('e1', 'ppa_contract', 'A', 'under_review', '2026-06-06T01:00:00Z'); // open
    ev('e2', 'ppa_contract', 'B', 'settled',      '2026-06-06T02:00:00Z'); // terminal
    const res = await app().request('/chain/ppa_contract', { headers: { Authorization: `Bearer ${await token()}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.chain_key).toBe('ppa_contract');
    expect(body.data.totals.events_30d).toBe(10);
    expect(body.data.totals.value_30d_zar).toBe(3000);
    expect(body.data.totals.breaches_30d).toBe(1);
    expect(body.data.snapshot.open_count).toBe(1);
    expect(body.data.snapshot.terminal_count).toBe(1);
    expect(body.data.throughput.length).toBe(2);
  });

  it('401s without a token', async () => {
    const res = await app().request('/chain/ppa_contract', {}, env);
    expect(res.status).toBe(401);
  });
});

describe('insights API — AI cards', () => {
  it('emits a breach-spike card when recent breaches jump vs the prior window', async () => {
    // prior 7d window: low breaches; recent: high
    daily('2026-05-20', 'drawdown', 10, 0, 0, 0);
    daily('2026-06-06', 'drawdown', 10, 0, 5, 0);
    const res = await app().request('/chain/drawdown/ai', { headers: { Authorization: `Bearer ${await token()}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const keys = (body.data as Array<{ key: string }>).map(c => c.key);
    expect(keys).toContain('breach_spike');
  });

  it('returns an empty array for a chain with no metrics', async () => {
    const res = await app().request('/chain/none/ai', { headers: { Authorization: `Bearer ${await token()}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });
});
