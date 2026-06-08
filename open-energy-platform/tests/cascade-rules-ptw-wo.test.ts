import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerPtwWoInteractionRules } from '../src/cascade-rules/ptw-wo-interactions';

let db: Database.Database;
let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerPtwWoInteractionRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'permit_to_work', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('ptw-wo-interactions cascade rules', () => {
  it('permit_to_work.issued pushes a high-priority support action with work_class and facility_id', async () => {
    await runCascadeRegistry(ctx('permit_to_work.issued', 'ptw1', {
      work_class: 'live-electrical',
      facility_id: 'fac-north-01',
    }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id = 'ptw1'`).all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].target_role).toBe('support');
    expect(rows[0].priority).toBe('high');
    expect(rows[0].title).toContain('live-electrical');
    expect(rows[0].title).toContain('fac-north-01');
  });

  it('permit_to_work.revoked pushes a high-priority stop-work action', async () => {
    await runCascadeRegistry(ctx('permit_to_work.revoked', 'ptw2', {
      work_class: 'confined-space',
      facility_id: 'fac-south-02',
    }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id = 'ptw2'`).all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].target_role).toBe('support');
    expect(rows[0].priority).toBe('high');
    expect(rows[0].title).toContain('revoked');
    expect(rows[0].title).toContain('confined-space');
  });

  it('deduplicates: firing the same event twice yields exactly one row', async () => {
    await runCascadeRegistry(ctx('permit_to_work.issued', 'ptw3', { work_class: 'routine', facility_id: 'fac3' }));
    await runCascadeRegistry(ctx('permit_to_work.issued', 'ptw3', { work_class: 'routine', facility_id: 'fac3' }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id = 'ptw3'`).all();
    expect(rows).toHaveLength(1);
  });

  it('an unrelated event produces no push', async () => {
    await runCascadeRegistry(ctx('permit_to_work.requested', 'ptw4', { work_class: 'routine' }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id = 'ptw4'`).all();
    expect(rows).toHaveLength(0);
  });
});
