import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerPredictiveMaintenanceRules } from '../src/cascade-rules/predictive-maintenance';

let db: Database.Database;
let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerPredictiveMaintenanceRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'asset_prognostic', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('predictive-maintenance cascade rules', () => {
  it('asset_prognostic.escalated pushes a high-priority PTW emergency action to support', async () => {
    await runCascadeRegistry(ctx('asset_prognostic.escalated', 'ap1', {
      site_id: 'site-kzn-01',
      tier: 'critical',
    }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id = 'ap1'`).all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].target_role).toBe('support');
    expect(rows[0].priority).toBe('high');
    expect(rows[0].title).toContain('site-kzn-01');
  });

  it('asset_prognostic.confirmed_failure also pushes to support', async () => {
    await runCascadeRegistry(ctx('asset_prognostic.confirmed_failure', 'ap2', {
      site_id: 'site-gp-02',
      tier: 'high',
    }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id = 'ap2'`).all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].target_role).toBe('support');
    expect(rows[0].title).toContain('site-gp-02');
  });

  it('deduplicates: firing escalated twice yields exactly one row', async () => {
    await runCascadeRegistry(ctx('asset_prognostic.escalated', 'ap3', { site_id: 'site-wc-03', tier: 'high' }));
    await runCascadeRegistry(ctx('asset_prognostic.escalated', 'ap3', { site_id: 'site-wc-03', tier: 'high' }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id = 'ap3'`).all();
    expect(rows).toHaveLength(1);
  });

  it('an unrelated event produces no push', async () => {
    await runCascadeRegistry(ctx('asset_prognostic.anomaly_detected', 'ap4', { site_id: 'site-ec-04' }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id = 'ap4'`).all();
    expect(rows).toHaveLength(0);
  });
});
