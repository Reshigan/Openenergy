// HTTP-adapter gate — drives the /api/v2 route module in-process: auth →
// Actor map → status codes → visibility gate → export participant-forcing.
// The store parity test proves the store; this is the first thing to exercise
// the freshly-authored HTTP adapter (src/routes/v2.ts) end to end.
//
// Same better-sqlite3 D1 shim as store-d1-parity.test.ts. Auth is minted
// directly with signToken(...,'test-secret') (HS256) so the 10/5min login
// rate-limiter is never touched; env.KV.get returns a tenant string so
// resolveTenantIdCached is satisfied from the cache path and never needs a
// participants table (migration 526 only creates v2_ tables).
//
// The adapter uses a real Date.now()/crypto.randomUUID() clock, so hashes are
// NOT byte-reproducible here — we assert the pack is self-consistent
// (verifyPack failed === []), not fixed hash values.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { D1Database } from '@cloudflare/workers-types';
import { Hono } from 'hono';

import v2Routes from '../../src/routes/v2';
import { signToken } from '../../src/middleware/auth';
import { verifyPack } from '../../src/v2/verify/verifier';
import { AppError, type HonoEnv } from '../../src/utils/types';

// Mount v2 exactly as index.ts does: the AppError branch of the global
// onError is what turns authMiddleware's thrown AppError into its statusCode
// (401/403). Without it Hono defaults a thrown error to 500.
function mountApp(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();
  app.onError((err, c) =>
    err instanceof AppError
      ? c.json({ error: err.code, message: err.message }, err.statusCode as 401 | 403 | 500)
      : c.json({ error: 'internal' }, 500),
  );
  app.route('/api/v2', v2Routes);
  return app;
}

// --- minimal better-sqlite3-backed D1Database shim (same subset as parity) ---
class ShimStmt {
  private args: unknown[] = [];
  constructor(private raw: Database.Database, private sql: string) {}
  bind(...args: unknown[]): this {
    this.args = args;
    return this;
  }
  first<T = unknown>(): T | null {
    return (this.raw.prepare(this.sql).get(...this.args) as T) ?? null;
  }
  all<T = unknown>(): { results: T[] } {
    return { results: this.raw.prepare(this.sql).all(...this.args) as T[] };
  }
  run(): { meta: { changes: number; rows_written: number } } {
    const r = this.raw.prepare(this.sql).run(...this.args);
    return { meta: { changes: r.changes, rows_written: r.changes } };
  }
}

function makeShim(ddl: string): D1Database {
  const raw = new Database(':memory:');
  raw.exec(ddl);
  const shim = {
    prepare(sql: string) {
      return new ShimStmt(raw, sql);
    },
    batch(stmts: ShimStmt[]) {
      const tx = raw.transaction((list: ShimStmt[]) => list.map((s) => s.run()));
      return tx(stmts);
    },
  };
  return shim as unknown as D1Database;
}

const DDL = readFileSync(new URL('../../migrations/526_v2_event_log.sql', import.meta.url), 'utf8');

// KV shim: get returns a tenant string so auth resolves from the cache path.
function makeEnv(): HonoEnv['Bindings'] {
  return {
    DB: makeShim(DDL),
    KV: { get: async () => 'default', put: async () => {} },
    JWT_SECRET: 'test-secret',
  } as unknown as HonoEnv['Bindings'];
}

describe('/api/v2 HTTP adapter — auth, status codes, visibility, export scope', () => {
  it('drives the ppa_contract happy path through HTTP and the pack verifies', async () => {
    const app = mountApp();
    const env = makeEnv();
    const token = await signToken(
      { sub: 'user-offtaker', email: 'offtaker@openenergy.co.za', role: 'offtaker', name: 'Off Taker' },
      'test-secret',
    );
    const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    let idem = 0;
    const post = (path: string, body: unknown) =>
      app.request(path, { method: 'POST', headers: H, body: JSON.stringify(body) }, env);
    const get = (path: string) => app.request(path, { headers: H }, env);
    const act = (id: string, edge: string, input: Record<string, unknown> = {}, over: Record<string, unknown> = {}) =>
      post(`/api/v2/txn/${id}/act`, { chain_key: 'ppa_contract', edge, input, idempotency_key: `k-${++idem}`, ...over });

    // 1 — open (capacity 50 MW = non-strategic, no regulator party needed)
    const openRes = await post('/api/v2/txn', {
      chain_key: 'ppa_contract',
      edge: 'open',
      idempotency_key: `k-${++idem}`,
      input: { offtaker_name: 'Acme Offtaker', capacity_mw: 50, contract_term_years: 20, supplier: 'party-ipp' },
    });
    expect(openRes.status).toBe(200);
    const opened = await openRes.json();
    expect(opened.ok).toBe(true);
    expect(opened.txn.state).toBe('draft');
    const id: string = opened.txn_id;
    expect(id).toBeTruthy();

    // 2 — stale expected_seq is a 409 (optimistic-concurrency token check)
    const stale = await act(id, 'begin_negotiation', {}, { expected_seq: 999 });
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe('STALE');

    // 3 — happy path (omit expected_seq → adapter reads current seq from store)
    for (const [edge, input] of [
      ['begin_negotiation', {}],
      ['lock_terms', {}],
      ['legal_sign', {}],
      ['execute', { board_approval_ref: 'BRD-2026-0042', legal_counterparty_ref: 'LEG-2026-0042' }],
      ['commence', {}],
    ] as const) {
      const r = await act(id, edge, input);
      expect(r.status, edge).toBe(200);
      expect((await r.json()).ok, edge).toBe(true);
    }

    // 4 — GET the txn: the offtaker is a live party, so it is visible
    const readRes = await get(`/api/v2/txn/${id}`);
    expect(readRes.status).toBe(200);
    const read = await readRes.json();
    expect(read.success).toBe(true);
    expect(read.data.txn.state).toBe('in_force');
    expect(read.data.parties.some((p: { participant_id: string }) => p.participant_id === 'user-offtaker')).toBe(true);

    // 5 — export: non-operator caller is force-scoped to its own participant id
    const exportRes = await get('/api/v2/export?chain_keys=ppa_contract');
    expect(exportRes.status).toBe(200);
    const pack = await exportRes.json();
    expect(pack.custody_notice).toContain('NO SETTLEMENT FINALITY — RECORD ONLY');
    expect(pack.events.length).toBeGreaterThan(0);
    // every exported event belongs to this participant's txn (scope enforced)
    expect(pack.events.every((e: { txn_id: string }) => e.txn_id === id)).toBe(true);

    // 6 — THE GATE: the exported pack self-verifies with the standalone verifier
    const result = await verifyPack(pack);
    const failed = result.checks.filter((c) => !c.ok);
    expect(failed, JSON.stringify(failed)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects an unauthenticated request', async () => {
    const app = mountApp();
    const res = await app.request('/api/v2/export?chain_keys=ppa_contract', {}, makeEnv());
    expect(res.status).toBe(401);
  });
});
