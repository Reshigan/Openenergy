import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerCarbonEventRules } from '../src/cascade-rules/carbon-events';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerCarbonEventRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'mrv_verifications', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('carbon-events rules', () => {
  it('mrv_verified queues an issuance follow-up for the submitter', async () => {
    await runCascadeRegistry(ctx('carbon.mrv_verified', 'mrv1', { submitted_by: 'p1', opinion: 'positive', verified_reductions_tco2e: 12000 }));
    const aq = db.prepare(`SELECT type, assignee_id, priority FROM action_queue WHERE entity_id = 'mrv1'`).get() as any;
    expect(aq).toMatchObject({ type: 'mrv_followup', assignee_id: 'p1', priority: 'normal' });
  });
});
