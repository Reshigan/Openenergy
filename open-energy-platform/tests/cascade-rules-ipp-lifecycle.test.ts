import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerIppLifecycleRules } from '../src/cascade-rules/ipp-lifecycle';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests(); registerIppLifecycleRules();
});
afterEach(() => { db.close(); });

// participants has NOT NULL email/password_hash/name; satisfy them.
function seedParticipant(id: string, role: string) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role)
     VALUES (?, ?, 'x', ?, ?)`,
  ).run(id, `${id}@test`, id, role);
}
// ipp_projects has NOT NULL structure_type/technology/capacity_mw/location.
function seedProject(id: string, name: string, developerId: string, cod?: string) {
  db.prepare(
    `INSERT INTO ipp_projects
       (id, project_name, developer_id, structure_type, technology, capacity_mw, location, commercial_operation_date)
     VALUES (?, ?, ?, 'build_own_operate', 'solar_pv', 100, 'Northern Cape', ?)`,
  ).run(id, name, developerId, cod ?? null);
}

function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'ipp_projects', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('ipp-lifecycle rules', () => {
  it('milestone_satisfied queues a disbursement_approval per lender', async () => {
    seedParticipant('l1', 'lender');
    seedParticipant('l2', 'lender');
    await runCascadeRegistry(ctx('ipp.milestone_satisfied', 'ms1', { milestone_name: 'COD' }));
    // One disbursement_approval per lender. Scope to the two lenders this test
    // seeded — migration 082 also seeds demo_lender_001, so a global count is
    // coupled to seed state rather than the rule's "one per lender" contract.
    const aq = db.prepare(
      `SELECT COUNT(*) n FROM action_queue
       WHERE type = 'disbursement_approval' AND entity_id = 'ms1'
         AND entity_type = 'project_milestones' AND assignee_id IN ('l1','l2')`,
    ).get() as { n: number };
    expect(aq.n).toBe(2);
  });

  it('milestone_satisfied with milestone_type=financial_close drives the financial_close rule (notifications)', async () => {
    seedProject('p1', 'Karoo Wind', 'dev1', '2027-01-01');
    db.prepare(`INSERT INTO grid_connections (id, project_id, connection_point) VALUES ('gc1','p1','Aggeneis')`).run();
    seedParticipant('go1', 'grid_operator');
    await runCascadeRegistry(ctx('ipp.milestone_satisfied', 'p1', { milestone_type: 'financial_close', project_id: 'p1', project_name: 'Karoo Wind' }));
    // nested fireCascade drove the financial_close rule, which notifies grid operators
    const notif = db.prepare(`SELECT COUNT(*) n FROM notifications WHERE participant_id = 'go1' AND type = 'grid'`).get() as { n: number };
    expect(notif.n).toBe(1);
  });

  it('insurance_expiring queues a renewal for the project developer', async () => {
    seedProject('p2', 'Solar Park', 'dev2');
    await runCascadeRegistry(ctx('ipp.insurance_expiring', 'pol1', { project_id: 'p2', policy_number: 'POL-1', period_end: '2026-09-30' }));
    const aq = db.prepare(
      `SELECT assignee_id, type, entity_type, due_date FROM action_queue WHERE entity_id = 'pol1'`,
    ).get() as any;
    expect(aq).toMatchObject({
      assignee_id: 'dev2',
      type: 'insurance_renewal',
      entity_type: 'insurance_policies',
      due_date: '2026-09-30',
    });
  });
});
