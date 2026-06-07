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

// ─── Bug fix: chain_key/source_chain_status attribution ─────────────────────
// The five registered lifecycle chains (drawdown, loan_default,
// reserve_account, levy_assessment, carbon_retirement) fire fireCascade()
// without setting chain_key/source_chain_status — they only set entity_type
// and carry the post-transition status in data.{to_status,chain_status}.
// recordPlatformEvent must derive both so their events attribute correctly
// and the matching InsightsPanels stop being permanently empty.
describe('analytics-sink — chain attribution', () => {
  async function insertAndFetch(ctx: Record<string, unknown>) {
    await recordPlatformEvent({ env, event: 'x.evt', entity_id: 'e1', ...ctx } as any);
    return db.prepare(
      `SELECT chain_key, source_chain_status FROM oe_platform_events LIMIT 1`,
    ).get() as { chain_key: string | null; source_chain_status: string | null };
  }

  it('levy: maps entity_type regulator_levy → chain_key levy_assessment, status from data.chain_status', async () => {
    const row = await insertAndFetch({
      entity_type: 'regulator_levy',
      data: { chain_status: 'assessed' },
    });
    expect(row.chain_key).toBe('levy_assessment');
    expect(row.source_chain_status).toBe('assessed');
  });

  it('drawdown: identity-maps chain_key, status from data.to_status', async () => {
    const row = await insertAndFetch({
      entity_type: 'drawdown',
      data: { to_status: 'disbursed' },
    });
    expect(row.chain_key).toBe('drawdown');
    expect(row.source_chain_status).toBe('disbursed');
  });

  it('reserve_account: identity-maps chain_key, status read via data.chain_status', async () => {
    const row = await insertAndFetch({
      entity_type: 'reserve_account',
      data: { chain_status: 'shortfall_open' },
    });
    expect(row.chain_key).toBe('reserve_account');
    expect(row.source_chain_status).toBe('shortfall_open');
  });

  it('prefers data.to_status over data.chain_status when both present', async () => {
    const row = await insertAndFetch({
      entity_type: 'drawdown',
      data: { to_status: 'disbursed', chain_status: 'pending_cp' },
    });
    expect(row.source_chain_status).toBe('disbursed');
  });

  it('preserves explicit chain_key / source_chain_status (does not overwrite)', async () => {
    const row = await insertAndFetch({
      entity_type: 'whatever',
      chain_key: 'admin_revenue',
      source_chain_status: 'posted',
      data: {},
    });
    expect(row.chain_key).toBe('admin_revenue');
    expect(row.source_chain_status).toBe('posted');
  });

  it('leaves unregistered entity_types unattributed (chain_key + status both null)', async () => {
    const row = await insertAndFetch({
      entity_type: 'something_unregistered',
      data: { chain_status: 'x' },
    });
    expect(row.chain_key).toBeNull();
    expect(row.source_chain_status).toBeNull();
  });
});
