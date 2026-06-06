import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers/d1-sqlite';
import { envFor } from './helpers/d1-sqlite';
import {
  registerCascadeRule,
  runCascadeRegistry,
  _resetRegistryForTests,
  type CascadeRule,
} from '../src/utils/cascade-registry';

let db: Database.Database;
let env: Record<string, unknown>;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
});
afterEach(() => { db.close(); });

function ctx(event: string) {
  return { event, entity_type: 'demo', entity_id: 'e1', env } as any;
}

describe('cascade-registry', () => {
  it('runs a matching rule and audits outcome=ran', async () => {
    let ran = 0;
    const rule: CascadeRule = {
      id: 'demo.match',
      match: c => c.event === 'demo.go',
      run: async () => { ran++; },
    };
    registerCascadeRule(rule);
    await runCascadeRegistry(ctx('demo.go'));
    expect(ran).toBe(1);

    const audit = db.prepare(
      `SELECT rule_id, outcome FROM oe_cascade_rule_audit WHERE rule_id = 'demo.match'`,
    ).get() as { rule_id: string; outcome: string } | undefined;
    expect(audit?.outcome).toBe('ran');
  });

  it('skips a non-matching rule (no audit row)', async () => {
    registerCascadeRule({ id: 'demo.nope', match: c => c.event === 'other', run: async () => {} });
    await runCascadeRegistry(ctx('demo.go'));
    const count = db.prepare(`SELECT COUNT(*) n FROM oe_cascade_rule_audit`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('isolates a throwing rule and audits outcome=error', async () => {
    registerCascadeRule({ id: 'demo.boom', match: () => true, run: async () => { throw new Error('x'); } });
    // Must not throw — registry is error-isolated.
    await runCascadeRegistry(ctx('demo.go'));
    const audit = db.prepare(
      `SELECT outcome FROM oe_cascade_rule_audit WHERE rule_id = 'demo.boom'`,
    ).get() as { outcome: string } | undefined;
    expect(audit?.outcome).toBe('error');
  });
});
