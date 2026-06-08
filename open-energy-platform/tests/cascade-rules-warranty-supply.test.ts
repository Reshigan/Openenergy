import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerWarrantySupplyRules } from '../src/cascade-rules/warranty-supply';

let db: Database.Database;
let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerWarrantySupplyRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'warranty_recovery', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('warranty-supply cascade rules', () => {
  it('assessment_complete with systemic defect pushes high-priority spare-parts action to support', async () => {
    await runCascadeRegistry(ctx('warranty_recovery.assessment_complete', 'wr1', {
      defect_class: 'systemic',
      component: 'inverter-module',
    }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id = 'wr1'`).all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].target_role).toBe('support');
    expect(rows[0].priority).toBe('high');
    expect(rows[0].title).toMatch(/systemic/i);
  });

  it('assessment_complete with non-systemic defect produces no push', async () => {
    await runCascadeRegistry(ctx('warranty_recovery.assessment_complete', 'wr2', {
      defect_class: 'isolated',
      component: 'dc-isolator',
    }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id = 'wr2'`).all();
    expect(rows).toHaveLength(0);
  });

  it('deduplicates: systemic defect event fired twice yields exactly one row', async () => {
    await runCascadeRegistry(ctx('warranty_recovery.assessment_complete', 'wr3', { defect_class: 'systemic' }));
    await runCascadeRegistry(ctx('warranty_recovery.assessment_complete', 'wr3', { defect_class: 'systemic' }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id = 'wr3'`).all();
    expect(rows).toHaveLength(1);
  });

  it('an unrelated event produces no push', async () => {
    await runCascadeRegistry(ctx('warranty_recovery.claim_filed', 'wr4', { defect_class: 'systemic' }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id = 'wr4'`).all();
    expect(rows).toHaveLength(0);
  });
});
