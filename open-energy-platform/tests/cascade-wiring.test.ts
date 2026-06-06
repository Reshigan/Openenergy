// Proves fireCascade now also: logs to the analytics sink, records a (R0)
// revenue row when commercial context is present, and runs the registry —
// without breaking the legacy audit_logs write.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { fireCascade } from '../src/utils/cascade';
import { registerCascadeRule, _resetRegistryForTests } from '../src/utils/cascade-registry';

let db: Database.Database;
let env: any;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); _resetRegistryForTests(); });
afterEach(() => { db.close(); });

describe('fireCascade ecosystem wiring', () => {
  it('logs the event to oe_platform_events', async () => {
    await fireCascade({
      event: 'demo.fired' as any,
      actor_id: 'system:cascade',
      entity_type: 'demo',
      entity_id: 'e1',
      env,
      chain_key: 'demo',
    });
    const row = db.prepare(`SELECT event, chain_key FROM oe_platform_events LIMIT 1`).get() as any;
    expect(row.event).toBe('demo.fired');
    expect(row.chain_key).toBe('demo');
  });

  it('records a R0 waived revenue row when commercial context present', async () => {
    await fireCascade({
      event: 'demo.fired' as any,
      entity_type: 'demo', entity_id: 'e2', env,
      commercial: { entity_value: 1_000_000, participant_id: 'par_1' },
    });
    const r = db.prepare(`SELECT fee_zar, status FROM oe_platform_revenue LIMIT 1`).get() as any;
    expect(r.fee_zar).toBe(0);
    expect(r.status).toBe('waived');
  });

  it('runs a registered registry rule', async () => {
    let ran = 0;
    registerCascadeRule({ id: 't.rule', match: c => c.event === 'demo.fired', run: async () => { ran++; } });
    await fireCascade({ event: 'demo.fired' as any, entity_type: 'demo', entity_id: 'e3', env });
    expect(ran).toBe(1);
  });

  it('still writes the legacy audit_logs row', async () => {
    await fireCascade({ event: 'demo.fired' as any, entity_type: 'demo', entity_id: 'e4', env });
    const row = db.prepare(`SELECT action, entity_id FROM audit_logs WHERE entity_id = 'e4'`).get() as any;
    expect(row.action).toBe('demo.fired');
  });
});
