import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerTraderMarginRules } from '../src/cascade-rules/trader-margin';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerTraderMarginRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'margin_calls', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('trader-margin rules', () => {
  it('margin_call_issued queues an urgent margin_call with the explicit due date', async () => {
    await runCascadeRegistry(ctx('trader.margin_call_issued', 'mc1', { participant_id: 'p1', shortfall_zar: 25000, due_by: '2026-07-15T00:00:00Z' }));
    const aq = db.prepare(`SELECT type, priority, assignee_id, due_date FROM action_queue WHERE entity_id = 'mc1'`).get() as any;
    expect(aq).toMatchObject({ type: 'margin_call', priority: 'urgent', assignee_id: 'p1', due_date: '2026-07-15' });
  });
});
