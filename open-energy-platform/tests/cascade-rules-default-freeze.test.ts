import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerDefaultFreezeRules } from '../src/cascade-rules/default-freeze';

let db: Database.Database;
let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerDefaultFreezeRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'loan_default', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('default-freeze cascade rules', () => {
  it('loan_default.default_notice_issued pushes to both admin and lender with borrower name', async () => {
    await runCascadeRegistry(ctx('loan_default.default_notice_issued', 'ld1', {
      borrower_party_name: 'Sunrise Solar Ltd',
    }));
    const rows = db.prepare(`SELECT target_role, priority, title FROM oe_role_action_queue WHERE source_entity_id = 'ld1' OR source_entity_id = 'ld1:lender'`).all() as any[];
    expect(rows).toHaveLength(2);
    const roles = rows.map((r) => r.target_role).sort();
    expect(roles).toContain('admin');
    expect(roles).toContain('lender');
    for (const row of rows) {
      expect(row.priority).toBe('high');
      expect(row.title).toContain('Sunrise Solar Ltd');
    }
  });

  it('deduplicates: admin push only fires once when event fires twice', async () => {
    await runCascadeRegistry(ctx('loan_default.default_notice_issued', 'ld2', { borrower_party_name: 'Cape Wind Pty' }));
    await runCascadeRegistry(ctx('loan_default.default_notice_issued', 'ld2', { borrower_party_name: 'Cape Wind Pty' }));
    const rows = db.prepare(`SELECT target_role FROM oe_role_action_queue WHERE source_entity_id = 'ld2' OR source_entity_id = 'ld2:lender'`).all() as any[];
    const adminCount = rows.filter((r: any) => r.target_role === 'admin').length;
    const lenderCount = rows.filter((r: any) => r.target_role === 'lender').length;
    expect(adminCount).toBe(1);
    expect(lenderCount).toBe(1);
  });

  it('an unrelated event produces no push', async () => {
    await runCascadeRegistry(ctx('loan_default.cure_period_started', 'ld3', { borrower_party_name: 'Test Corp' }));
    const rows = db.prepare(`SELECT * FROM oe_role_action_queue WHERE source_entity_id LIKE 'ld3%'`).all();
    expect(rows).toHaveLength(0);
  });
});
