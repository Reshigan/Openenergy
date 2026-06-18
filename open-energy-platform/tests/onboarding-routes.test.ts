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
 * Pre-seed a participant with a DB-valid role ('admin') so the auth
 * middleware can resolve tenant_id. Then call testJwtFor to get a JWT
 * signed with the real logical role. The middleware reads role from the
 * JWT payload, not the DB row.
 */
function seedParticipant(id: string) {
  db.prepare(
    `INSERT OR IGNORE INTO participants
       (id, email, password_hash, name, role, status, kyc_status, subscription_tier)
     VALUES (?, ?, 'pbkdf2$sha256$100000$c2FsdA==$ZXhwZWN0ZWQ=', ?, 'admin', 'active', 'approved', 'enterprise')`,
  ).run(id, `${id}@test`, id);
}

describe('POST /api/onboarding/step -- role-step coverage', () => {
  it('esco step welcome returns 200 and next_step org_profile', async () => {
    seedParticipant('par_esco');
    const token = await testJwtFor(db, 'par_esco', { role: 'esco' });
    const res = await call(onboarding, env, 'POST', '/step', {
      token,
      body: { step: 'welcome' },
    });
    expect(res.status).toBe(200);
    expect((res.json as any).data.next_step).toBe('org_profile');
  });

  it('epc_contractor step welcome returns 200 and next_step org_profile', async () => {
    seedParticipant('par_epc');
    const token = await testJwtFor(db, 'par_epc', { role: 'epc_contractor' });
    const res = await call(onboarding, env, 'POST', '/step', {
      token,
      body: { step: 'welcome' },
    });
    expect(res.status).toBe(200);
    expect((res.json as any).data.next_step).toBe('org_profile');
  });

  it('unknown role step welcome returns 200 via generic fallback', async () => {
    seedParticipant('par_weird');
    const token = await testJwtFor(db, 'par_weird', { role: 'weird_role' });
    const res = await call(onboarding, env, 'POST', '/step', {
      token,
      body: { step: 'welcome' },
    });
    expect(res.status).toBe(200);
    expect((res.json as any).data.next_step).toBe('complete');
  });

  it('unknown role posting nonexistent step returns 400', async () => {
    seedParticipant('par_weird');
    const token = await testJwtFor(db, 'par_weird', { role: 'weird_role' });
    const res = await call(onboarding, env, 'POST', '/step', {
      token,
      body: { step: 'nonexistent_step' },
    });
    expect(res.status).toBe(400);
    // Assert the AppError was caught and formatted by the sub-router onError,
    // not just any 400 - this would fail if the includes-guard were dropped.
    expect((res.json as any).error).toBe('VALIDATION_ERROR');
  });
});
