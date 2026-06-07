import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerRegulatorInboxRules } from '../src/cascade-rules/regulator-inbox';
import { regulatorInboxSpec } from '../src/utils/regulator-inbox-spec';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerRegulatorInboxRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'mrv_verifications', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('regulator-inbox rule', () => {
  it('inserts an inbox row for a spec-matched event', async () => {
    const probe = ['regulator.licence_revoked', 'clearing.disclosure.published', 'dispatch.sla_breached', 'poslimit.sla_breached']
      .find((e) => regulatorInboxSpec(e, 'e1', {}) != null);
    expect(probe).toBeDefined();
    await runCascadeRegistry(ctx(probe as string, 'e1', { foo: 'bar' }));
    const row = db.prepare(`SELECT ack_status, sla_due_at FROM oe_regulator_inbox WHERE source_event = ?`).get(probe) as any;
    expect(row).toBeTruthy();
    expect(row.ack_status).toBe('pending');
    expect(row.sla_due_at).toBeTruthy();
  });

  it('inserts nothing for a non-spec event', async () => {
    await runCascadeRegistry(ctx('auth.login', 'e2', {}));
    const count = (db.prepare(`SELECT COUNT(*) as n FROM oe_regulator_inbox`).get() as any).n;
    expect(count).toBe(0);
  });
});
