import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerTariffRepriceRules } from '../src/cascade-rules/tariff-reprice';

let db: Database.Database;
let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerTariffRepriceRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'tariff_determination', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('tariff-reprice cascade rules', () => {
  it('tariff_determination.determination_issued pushes to both offtaker and ipp_developer', async () => {
    await runCascadeRegistry(ctx('tariff_determination.determination_issued', 'td1', {
      determination_year: '2026',
    }));
    const rows = db.prepare(`SELECT target_role, priority FROM oe_role_action_queue WHERE source_entity_id = 'td1' OR source_entity_id = 'td1:ipp'`).all() as any[];
    expect(rows).toHaveLength(2);
    const roles = rows.map((r) => r.target_role).sort();
    expect(roles).toContain('offtaker');
    expect(roles).toContain('ipp_developer');
    const offtakerRow = rows.find((r) => r.target_role === 'offtaker');
    expect(offtakerRow.priority).toBe('high');
    const ippRow = rows.find((r) => r.target_role === 'ipp_developer');
    expect(ippRow.priority).toBe('normal');
  });

  it('deduplicates: offtaker push only fires once even when event fires twice', async () => {
    await runCascadeRegistry(ctx('tariff_determination.determination_issued', 'td2', {}));
    await runCascadeRegistry(ctx('tariff_determination.determination_issued', 'td2', {}));
    const rows = db.prepare(`SELECT target_role FROM oe_role_action_queue WHERE source_entity_id = 'td2' OR source_entity_id = 'td2:ipp'`).all() as any[];
    const offtakerCount = rows.filter((r: any) => r.target_role === 'offtaker').length;
    const ippCount = rows.filter((r: any) => r.target_role === 'ipp_developer').length;
    expect(offtakerCount).toBe(1);
    expect(ippCount).toBe(1);
  });

  it('an unrelated event produces no push', async () => {
    await runCascadeRegistry(ctx('tariff_determination.submitted', 'td3', {}));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id LIKE 'td3%'`).all();
    expect(rows).toHaveLength(0);
  });
});
