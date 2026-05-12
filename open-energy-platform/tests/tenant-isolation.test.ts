// ═══════════════════════════════════════════════════════════════════════════
// Tenant isolation — two users in different tenants must never see each
// other's rows.
//
// role-completions.ts scopes reads by `participant_id = user.id`, which is a
// per-user scope and therefore stricter than per-tenant. We verify both
// axes here: two participants in two tenants each create a row via the
// same endpoint, then each reads back. Each must see ONLY their own row.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from 'better-sqlite3';

import roleCompletions from '../src/routes/role-completions';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';

let db: Database.Database;
let env: Record<string, unknown>;
let tokenA: string;
let tokenB: string;

beforeAll(async () => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);

  // Insert two participants explicitly so we control their tenant_id.
  // testJwtFor inserts as tenant 'default' if absent; we update afterwards.
  tokenA = await testJwtFor(db, 'iso_user_a', { role: 'offtaker', email: 'a@tenant-a.test' });
  tokenB = await testJwtFor(db, 'iso_user_b', { role: 'offtaker', email: 'b@tenant-b.test' });
  db.prepare(`UPDATE participants SET tenant_id = 'tenant_a' WHERE id = 'iso_user_a'`).run();
  db.prepare(`UPDATE participants SET tenant_id = 'tenant_b' WHERE id = 'iso_user_b'`).run();
});

afterAll(() => { db.close(); });

describe('Tenant isolation — role-completions reads are participant-scoped', () => {
  it('user A creates an off_ppa_portfolio row', async () => {
    const res = await call(roleCompletions, env, 'POST', '/offtaker/ppa-portfolio', {
      token: tokenA,
      body: { counterparty_name: 'tenant-A counterparty', technology: 'solar', capacity_mw: 25 },
    });
    expect(res.status).toBe(201);
  });

  it('user B creates a separate off_ppa_portfolio row', async () => {
    const res = await call(roleCompletions, env, 'POST', '/offtaker/ppa-portfolio', {
      token: tokenB,
      body: { counterparty_name: 'tenant-B counterparty', technology: 'wind', capacity_mw: 75 },
    });
    expect(res.status).toBe(201);
  });

  it('user A only sees their own row', async () => {
    const res = await call(roleCompletions, env, 'GET', '/offtaker/ppa-portfolio', { token: tokenA });
    expect(res.status).toBe(200);
    const rows = (res.json as { data: Array<{ counterparty_name: string }> }).data;
    expect(rows.length).toBe(1);
    expect(rows[0].counterparty_name).toBe('tenant-A counterparty');
  });

  it('user B only sees their own row', async () => {
    const res = await call(roleCompletions, env, 'GET', '/offtaker/ppa-portfolio', { token: tokenB });
    expect(res.status).toBe(200);
    const rows = (res.json as { data: Array<{ counterparty_name: string }> }).data;
    expect(rows.length).toBe(1);
    expect(rows[0].counterparty_name).toBe('tenant-B counterparty');
  });

  // Verify the same isolation holds across a second 047 entity (lender pipeline)
  // so we don't accidentally cover only the easy case.
  it('user A creates a lender pipeline deal', async () => {
    const res = await call(roleCompletions, env, 'POST', '/lender/pipeline', {
      token: tokenA,
      body: { deal_name: 'tenant-A deal', ticket_size_zar: 100_000_000 },
    });
    expect(res.status).toBe(201);
  });

  it('user B does NOT see user A\'s pipeline row', async () => {
    const res = await call(roleCompletions, env, 'GET', '/lender/pipeline', { token: tokenB });
    expect(res.status).toBe(200);
    const rows = (res.json as { data: Array<{ deal_name: string }> }).data;
    expect(rows.every((r) => r.deal_name !== 'tenant-A deal')).toBe(true);
  });

  it('totals at the DB level match the participant-scoped reads', () => {
    const all = db.prepare('SELECT participant_id FROM off_ppa_portfolio').all() as Array<{ participant_id: string }>;
    expect(all.length).toBe(2);
    expect(new Set(all.map((r) => r.participant_id))).toEqual(new Set(['iso_user_a', 'iso_user_b']));
  });
});
