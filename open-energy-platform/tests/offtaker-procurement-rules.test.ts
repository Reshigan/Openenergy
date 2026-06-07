import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import type { CascadeContext } from '../src/utils/cascade';
import { registerOfftakerProcurementRules } from '../src/cascade-rules/offtaker-procurement';
import { runCascadeRegistry, _resetRegistryForTests } from '../src/utils/cascade-registry';

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerOfftakerProcurementRules();
});
afterEach(() => { db.close(); });

function ctx(event: string, entity_type: string, entity_id: string, data: Record<string, unknown>): CascadeContext {
  return { event, entity_type, entity_id, data, env } as unknown as CascadeContext;
}

describe('offtaker-procurement cascade rules', () => {
  it('contract.created on loi_drafts pushes a Review LOI action to the IPP', async () => {
    await runCascadeRegistry(ctx('contract.created', 'loi_drafts', 'loi_1', {
      contract_type: 'LOI', counterparty_id: 'dev1', project_id: 'p1',
      project_name: 'Karoo Solar', annual_mwh: 5000, blended_price: 1200,
    }));
    const row = db.prepare(
      `SELECT target_role, target_participant_id, title, cross_option_json, priority, source_chain_key
         FROM oe_role_action_queue WHERE source_entity_id = 'loi_1'`,
    ).get() as any;
    expect(row.target_role).toBe('ipp_developer');
    expect(row.target_participant_id).toBe('dev1');
    expect(row.title).toContain('Karoo Solar');
    expect(row.priority).toBe('high');
    expect(row.source_chain_key).toBe('offtaker_procurement');
    expect(JSON.parse(row.cross_option_json).target_route).toBe('/lois/loi_1');
    const audit = db.prepare(
      `SELECT outcome FROM oe_cascade_rule_audit WHERE rule_id = 'offtaker_procurement.loi_to_ipp' ORDER BY created_at DESC LIMIT 1`,
    ).get() as any;
    expect(audit?.outcome).toBe('ran');
  });

  it('does not push for contract.created on a non-LOI entity', async () => {
    await runCascadeRegistry(ctx('contract.created', 'contract_documents', 'cd_1', { counterparty_id: 'dev1' }));
    const row = db.prepare(`SELECT id FROM oe_role_action_queue`).get();
    expect(row).toBeUndefined();
  });

  it('does not push when counterparty_id is missing', async () => {
    await runCascadeRegistry(ctx('contract.created', 'loi_drafts', 'loi_x', { project_name: 'X' }));
    const row = db.prepare(`SELECT id FROM oe_role_action_queue`).get();
    expect(row).toBeUndefined();
  });

  it('is idempotent — running the same LOI event twice produces one IPP action', async () => {
    const c = ctx('contract.created', 'loi_drafts', 'loi_2', { counterparty_id: 'dev1', project_name: 'X' });
    await runCascadeRegistry(c);
    await runCascadeRegistry(c);
    const n = db.prepare(`SELECT COUNT(*) AS n FROM oe_role_action_queue WHERE source_entity_id = 'loi_2'`).get() as any;
    expect(n.n).toBe(1);
  });

  it('marketplace.inquired pushes to the seller using the seller resolved role', async () => {
    db.prepare(
      `INSERT INTO participants (id, email, password_hash, name, role, status)
       VALUES ('sell1','s@t.co','x','Seller','offtaker','active')`,
    ).run();
    await runCascadeRegistry(ctx('marketplace.inquired', 'marketplace_inquiries', 'mi_1', {
      listing_id: 'l1', seller_id: 'sell1',
    }));
    const row = db.prepare(
      `SELECT target_role, target_participant_id, cross_option_json FROM oe_role_action_queue WHERE source_entity_id = 'mi_1'`,
    ).get() as any;
    expect(row.target_role).toBe('offtaker');
    expect(row.target_participant_id).toBe('sell1');
    expect(JSON.parse(row.cross_option_json).target_route).toBe('/marketplace?listing=l1');
  });

  it('marketplace.inquired falls back to ipp_developer when the seller role is unknown', async () => {
    await runCascadeRegistry(ctx('marketplace.inquired', 'marketplace_inquiries', 'mi_2', {
      listing_id: 'l2', seller_id: 'ghost',
    }));
    const row = db.prepare(
      `SELECT target_role FROM oe_role_action_queue WHERE source_entity_id = 'mi_2'`,
    ).get() as any;
    expect(row.target_role).toBe('ipp_developer');
  });
});
