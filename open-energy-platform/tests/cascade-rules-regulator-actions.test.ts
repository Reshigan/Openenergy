import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerRegulatorActionRules } from '../src/cascade-rules/regulator-actions';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerRegulatorActionRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>, entity_type = 'licences') {
  return { event, entity_type, entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('regulator-actions rules', () => {
  it('licence_revoked queues an urgent action with the revoked title', async () => {
    await runCascadeRegistry(ctx('regulator.licence_revoked', 'lic1', { licensee_participant_id: 'p1', details: 'fraud' }));
    const aq = db.prepare(`SELECT title, priority, assignee_id FROM action_queue WHERE entity_id = 'lic1'`).get() as any;
    expect(aq.assignee_id).toBe('p1');
    expect(aq.priority).toBe('urgent');
    expect(aq.title).toMatch(/revoked/i);
  });

  it('licence_suspended queues with the suspended title', async () => {
    await runCascadeRegistry(ctx('regulator.licence_suspended', 'lic2', { licensee_participant_id: 'p2' }));
    const aq = db.prepare(`SELECT title FROM action_queue WHERE entity_id = 'lic2'`).get() as { title: string };
    expect(aq.title).toMatch(/suspended/i);
  });

  it('enforcement_finding queues for the respondent', async () => {
    await runCascadeRegistry(ctx('regulator.enforcement_finding', 'case1', { respondent_participant_id: 'p3', case_number: 'C-1', penalty_amount_zar: 5000 }, 'regulator_enforcement_cases'));
    const aq = db.prepare(`SELECT type, assignee_id FROM action_queue WHERE assignee_id = 'p3'`).get() as any;
    expect(aq).toMatchObject({ type: 'enforcement_finding', assignee_id: 'p3' });
  });

  it('surveillance_escalated queues a high-priority response', async () => {
    await runCascadeRegistry(ctx('regulator.surveillance_escalated', 'case2', { participant_id: 'p4', case_number: 'C-2', rule_code: 'MM-01' }, 'regulator_enforcement_cases'));
    const aq = db.prepare(`SELECT type, priority FROM action_queue WHERE assignee_id = 'p4'`).get() as any;
    expect(aq).toMatchObject({ type: 'surveillance_escalation', priority: 'high' });
  });
});
