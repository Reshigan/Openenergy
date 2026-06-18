import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import onboarding from '../src/routes/onboarding';

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});
afterEach(() => { db.close(); });

/**
 * Pre-seed the caller participant the same way onboarding-routes.test.ts does:
 * role 'admin', status 'active', kyc 'approved', tenant_id left NULL so the
 * caller's real tenant resolves to 'default'.
 */
function seedParticipant(id: string) {
  db.prepare(
    `INSERT OR IGNORE INTO participants
       (id, email, password_hash, name, role, status, kyc_status, subscription_tier)
     VALUES (?, ?, 'pbkdf2$sha256$100000$c2FsdA==$ZXhwZWN0ZWQ=', ?, 'admin', 'active', 'approved', 'enterprise')`,
  ).run(id, `${id}@test`, id);
}

describe('POST /api/onboarding/sandbox/enter -- isolated sandbox demo tenant', () => {
  it('creates a sandbox_<id> tenant owned by the caller, seeds >=1 demo entity, and fences reads/writes from the real tenant', async () => {
    const pid = 'par_sandbox';
    seedParticipant(pid);
    const token = await testJwtFor(db, pid, { role: 'admin' });

    const res = await call(onboarding, env, 'POST', '/sandbox/enter', { token });
    expect(res.status).toBe(200);

    // The response carries the sandbox tenant id sandbox_<participantId>.
    const data = (res.json as any).data;
    expect(data.sandbox_tenant_id).toBe(`sandbox_${pid}`);

    // After enter, the seeded demo table holds >= 1 row for the sandbox tenant.
    const sandboxRows = db.prepare(
      `SELECT COUNT(*) AS n FROM off_ppa_portfolio WHERE tenant_id = ?`,
    ).get(`sandbox_${pid}`) as { n: number };
    expect(sandboxRows.n).toBeGreaterThanOrEqual(1);

    // The sandbox write is invisible to the caller's real ('default') tenant.
    const realRows = db.prepare(
      `SELECT COUNT(*) AS n FROM off_ppa_portfolio WHERE tenant_id = 'default' AND participant_id = ?`,
    ).get(pid) as { n: number };
    expect(realRows.n).toBe(0);
  });

  it('a row written in the real (default) tenant is invisible to the sandbox tenant view', async () => {
    const pid = 'par_fence';
    seedParticipant(pid);
    const token = await testJwtFor(db, pid, { role: 'admin' });

    await call(onboarding, env, 'POST', '/sandbox/enter', { token });

    // Insert a row into the demo table in the REAL tenant with the caller's id.
    db.prepare(
      `INSERT INTO off_ppa_portfolio (id, participant_id, tenant_id, counterparty_name, technology, capacity_mw, status, created_at)
       VALUES (?, ?, 'default', 'Real Offtaker', 'wind', 50, 'signed', datetime('now'))`,
    ).run(`real_${pid}_ppa1`, pid);

    // The sandbox-tenant view does NOT return the real-tenant row.
    const sandboxIds = db.prepare(
      `SELECT id FROM off_ppa_portfolio WHERE tenant_id = ?`,
    ).all(`sandbox_${pid}`) as Array<{ id: string }>;
    expect(sandboxIds.map((r) => r.id)).not.toContain(`real_${pid}_ppa1`);
  });

  it('re-entering the sandbox is idempotent -- no duplicate demo rows pile up', async () => {
    const pid = 'par_reenter';
    seedParticipant(pid);
    const token = await testJwtFor(db, pid, { role: 'admin' });

    await call(onboarding, env, 'POST', '/sandbox/enter', { token });
    const first = db.prepare(
      `SELECT COUNT(*) AS n FROM off_ppa_portfolio WHERE tenant_id = ?`,
    ).get(`sandbox_${pid}`) as { n: number };

    const res2 = await call(onboarding, env, 'POST', '/sandbox/enter', { token });
    expect(res2.status).toBe(200);
    const second = db.prepare(
      `SELECT COUNT(*) AS n FROM off_ppa_portfolio WHERE tenant_id = ?`,
    ).get(`sandbox_${pid}`) as { n: number };

    expect(second.n).toBe(first.n);
  });
});
