import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import onboardingChecklist from '../src/routes/onboarding-checklist';

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});
afterEach(() => { db.close(); });

/**
 * Pre-seed a participant with a DB-valid role ('admin') so the auth
 * middleware can resolve tenant_id. The logical role is carried in the JWT.
 * onboarding_completed is left at its column default (0/undone) unless a test
 * flips it explicitly.
 */
function seedParticipant(id: string) {
  db.prepare(
    `INSERT OR IGNORE INTO participants
       (id, email, password_hash, name, role, status, kyc_status, subscription_tier)
     VALUES (?, ?, 'pbkdf2$sha256$100000$c2FsdA==$ZXhwZWN0ZWQ=', ?, 'admin', 'active', 'approved', 'enterprise')`,
  ).run(id, `${id}@test`, id);
}

describe('GET /api/onboarding/checklist/:role', () => {
  it('(a) ipp_developer with no projects: only complete_profile-style undone items, honest progress', async () => {
    seedParticipant('par_ipp_a');
    const token = await testJwtFor(db, 'par_ipp_a', { role: 'ipp_developer' });
    const res = await call(onboardingChecklist, env, 'GET', '/checklist/ipp_developer', { token });

    expect(res.status).toBe(200);
    const data = (res.json as any).data;
    expect(data.role).toBe('ipp_developer');
    expect(data.items.length).toBeGreaterThanOrEqual(3);

    const firstProject = data.items.find((i: any) => i.key === 'first_project');
    expect(firstProject).toBeTruthy();
    expect(firstProject.done).toBe(false);

    // progress.total equals item count; progress.done counts only done items.
    expect(data.progress.total).toBe(data.items.length);
    const computedDone = data.items.filter((i: any) => i.done).length;
    expect(data.progress.done).toBe(computedDone);
    expect(data.complete).toBe(computedDone === data.items.length && data.items.length > 0);
  });

  it('(b) ipp_developer after inserting one project: first_project done, progress.done increments', async () => {
    // Baseline (case a) counts for a participant with no project rows.
    seedParticipant('par_ipp_b0');
    const token0 = await testJwtFor(db, 'par_ipp_b0', { role: 'ipp_developer' });
    const before = await call(onboardingChecklist, env, 'GET', '/checklist/ipp_developer', { token: token0 });
    const beforeDone = (before.json as any).data.progress.done;

    seedParticipant('par_ipp_b');
    db.prepare(
      `INSERT INTO ipp_projects
         (id, project_name, developer_id, structure_type, technology, capacity_mw, location, status, created_at)
       VALUES (?, ?, ?, 'build_own_operate', 'solar_pv', 10, 'South Africa', 'development', datetime('now'))`,
    ).run('ipp_proj_b', 'Test Project', 'par_ipp_b');

    const token = await testJwtFor(db, 'par_ipp_b', { role: 'ipp_developer' });
    const res = await call(onboardingChecklist, env, 'GET', '/checklist/ipp_developer', { token });

    expect(res.status).toBe(200);
    const data = (res.json as any).data;
    const firstProject = data.items.find((i: any) => i.key === 'first_project');
    expect(firstProject.done).toBe(true);
    // Exactly one more item done than the no-project baseline.
    expect(data.progress.done).toBe(beforeDone + 1);
  });

  it('(c) cross-role authz: trader JWT calling ipp_developer checklist gets 403', async () => {
    seedParticipant('par_trader_c');
    const token = await testJwtFor(db, 'par_trader_c', { role: 'trader' });
    const res = await call(onboardingChecklist, env, 'GET', '/checklist/ipp_developer', { token });
    expect(res.status).toBe(403);
    expect((res.json as any).success).toBe(false);
  });

  it('(d) ipp_developer with no projects: next_best_step is the first incomplete item with static rationale', async () => {
    seedParticipant('par_ipp_d');
    const token = await testJwtFor(db, 'par_ipp_d', { role: 'ipp_developer' });
    const res = await call(onboardingChecklist, env, 'GET', '/checklist/ipp_developer', { token });

    expect(res.status).toBe(200);
    const data = (res.json as any).data;

    expect(data.next_best_step).not.toBeNull();
    const firstIncomplete = data.items.find((i: any) => !i.done);
    expect(firstIncomplete).toBeTruthy();

    // next_best_step points at the first incomplete item.
    expect(data.next_best_step.item_key).toBe(firstIncomplete.key);
    expect(data.next_best_step.action_href).toBe(firstIncomplete.href);

    // why is always a non-empty, item-specific string (env has no AI binding,
    // so ask() returns fallback and the static rationale is kept).
    expect(typeof data.next_best_step.why).toBe('string');
    expect(data.next_best_step.why.length).toBeGreaterThan(0);
  });

  it('(e) every item done: next_best_step is null and complete is true', async () => {
    // admin checklist is complete_profile only; flip onboarding_completed so it
    // resolves done, making the whole checklist complete.
    seedParticipant('par_admin_e');
    db.prepare(`UPDATE participants SET onboarding_completed = 1 WHERE id = ?`).run('par_admin_e');

    const token = await testJwtFor(db, 'par_admin_e', { role: 'admin' });
    const res = await call(onboardingChecklist, env, 'GET', '/checklist/admin', { token });

    expect(res.status).toBe(200);
    const data = (res.json as any).data;
    expect(data.complete).toBe(true);
    expect(data.next_best_step).toBeNull();
  });
});
