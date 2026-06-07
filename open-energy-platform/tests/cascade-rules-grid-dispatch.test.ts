import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerGridDispatchRules } from '../src/cascade-rules/grid-dispatch';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerGridDispatchRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'dispatch_instructions', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('grid-dispatch rules', () => {
  it('instruction_issued queues an urgent dispatch_acknowledge', async () => {
    await runCascadeRegistry(ctx('grid.instruction_issued', 'di1', { participant_id: 'p1', instruction_number: 'DI-1', target_mw: 50 }));
    const aq = db.prepare(`SELECT type, priority, assignee_id FROM action_queue WHERE entity_id = 'di1'`).get() as any;
    expect(aq).toMatchObject({ type: 'dispatch_acknowledge', priority: 'urgent', assignee_id: 'p1' });
  });

  it('instruction_non_compliant queues a non_compliance action', async () => {
    await runCascadeRegistry(ctx('grid.instruction_non_compliant', 'di2', { participant_id: 'p2', penalty_amount_zar: 1000 }));
    const aq = db.prepare(`SELECT type FROM action_queue WHERE entity_id = 'di2'`).get() as { type: string };
    expect(aq.type).toBe('non_compliance');
  });
});
