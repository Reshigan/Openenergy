import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerOnaOperationsRules } from '../src/cascade-rules/ona-operations';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerOnaOperationsRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'ona_faults', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('ona-operations rules', () => {
  it('fault_detected stores revenue impact, creates an intelligence item, queues IPP review', async () => {
    db.prepare(`INSERT INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location) VALUES ('proj1','Test Project','dev1','build_own_operate','solar_pv',100,'Northern Cape')`).run();
    db.prepare(`INSERT INTO ona_sites (id, project_id, site_name) VALUES ('site1','proj1','Site A')`).run();
    db.prepare(`INSERT INTO ona_faults (id, site_id, start_time) VALUES ('f1','site1','2026-06-07T00:00:00.000Z')`).run();
    await runCascadeRegistry(ctx('ona.fault_detected', 'f1', {
      severity: 'high', ppa_value_per_day: 50000, fault_description: 'Inverter trip',
      site_id: 'site1', site_name: 'Site A',
    }));
    const f = db.prepare(`SELECT estimated_revenue_impact FROM ona_faults WHERE id = 'f1'`).get() as { estimated_revenue_impact: number };
    expect(f.estimated_revenue_impact).toBe(100000); // 50000 * high(2)
    const ii = db.prepare(`SELECT COUNT(*) n FROM intelligence_items WHERE entity_id = 'f1'`).get() as { n: number };
    expect(ii.n).toBe(1);
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE type = 'fault_review' AND assignee_id = 'dev1'`).get() as { n: number };
    expect(aq.n).toBe(1);
  });
});
