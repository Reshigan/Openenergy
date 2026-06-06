import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { recordPlatformEvent } from '../src/utils/analytics-sink';

let db: Database.Database;
let env: any;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

describe('analytics-sink', () => {
  it('appends a platform event row with chain_key + affected_roles', async () => {
    await recordPlatformEvent({
      event: 'ppa_evt_activated',
      actor_id: 'system:cascade',
      entity_type: 'ppa_contract',
      entity_id: 'ppa_1',
      env,
      chain_key: 'ppa_contract',
      source_chain_status: 'active',
      affected_roles: ['offtaker', 'ipp_developer'],
      commercial: { entity_value: 2_500_000 },
      data: { foo: 'bar' },
    } as any);

    const row = db.prepare(`SELECT * FROM oe_platform_events LIMIT 1`).get() as any;
    expect(row.event).toBe('ppa_evt_activated');
    expect(row.chain_key).toBe('ppa_contract');
    expect(row.entity_value).toBe(2_500_000);
    expect(JSON.parse(row.affected_roles)).toEqual(['offtaker', 'ipp_developer']);
    expect(JSON.parse(row.data_json).foo).toBe('bar');
  });

  it('handles a minimal event (no chain_key / commercial)', async () => {
    await recordPlatformEvent({ event: 'demo.x', entity_type: 't', entity_id: 'e1', env } as any);
    const row = db.prepare(`SELECT * FROM oe_platform_events LIMIT 1`).get() as any;
    expect(row.event).toBe('demo.x');
    expect(row.chain_key).toBeNull();
    expect(row.entity_value).toBeNull();
  });
});
