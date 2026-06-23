import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import type { CascadeContext } from '../src/utils/cascade';
import { registerProjectFundingOfferRules } from '../src/cascade-rules/project-funding-offers';
import { runCascadeRegistry, _resetRegistryForTests } from '../src/utils/cascade-registry';

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerProjectFundingOfferRules();
});
afterEach(() => { db.close(); });

function ctx(
  event: string, entity_type: string, entity_id: string,
  data: Record<string, unknown>, actor_id?: string,
): CascadeContext {
  return { event, entity_type, entity_id, data, actor_id, env } as unknown as CascadeContext;
}

describe('project-funding-offers cascade rules', () => {
  it('ipp.project_created nudges the IPP to review funding & offtake options', async () => {
    await runCascadeRegistry(ctx('ipp.project_created', 'ipp_projects', 'proj_1', {
      project_name: 'Karoo Solar One',
    }, 'dev_1'));
    const row = db.prepare(
      `SELECT target_role, target_participant_id, title, cross_option_json, priority, source_chain_key
         FROM oe_role_action_queue WHERE source_entity_id = 'proj_1'`,
    ).get() as any;
    expect(row.target_role).toBe('ipp_developer');
    expect(row.target_participant_id).toBe('dev_1');
    expect(row.title).toContain('Karoo Solar One');
    expect(row.priority).toBe('normal');
    expect(row.source_chain_key).toBe('project_funding_offers');
    expect(JSON.parse(row.cross_option_json).target_route).toBe('/projects/proj_1?panel=funding');
  });

  it('marketplace.inquired on an engagement pushes a high-priority request to the offeror', async () => {
    await runCascadeRegistry(ctx('marketplace.inquired', 'oe_offer_engagements', 'eng_1', {
      offeror_id: 'fund_9', offeror_role: 'carbon_fund', offer_id: 'cof_1',
      offer_kind: 'carbon_rec', project_id: 'proj_1', project_name: 'Karoo Solar One',
    }));
    const row = db.prepare(
      `SELECT target_role, target_participant_id, title, priority, cross_option_json, body_json
         FROM oe_role_action_queue WHERE source_entity_id = 'eng_1'`,
    ).get() as any;
    expect(row.target_role).toBe('carbon_fund');
    expect(row.target_participant_id).toBe('fund_9');
    // carbon_ kind → framed as an offtake request, not funding.
    expect(row.title).toContain('offtake request');
    expect(row.priority).toBe('high');
    expect(JSON.parse(row.cross_option_json).target_route).toBe('/projects/proj_1');
    expect(JSON.parse(row.body_json).offer_id).toBe('cof_1');
  });

  it('falls back to the live participant role when the event omits offeror_role', async () => {
    db.prepare(
      `INSERT INTO participants (id, email, password_hash, name, role, status)
       VALUES ('lend_3','l@t.co','x','Lender3','lender','active')`,
    ).run();
    await runCascadeRegistry(ctx('marketplace.inquired', 'oe_offer_engagements', 'eng_2', {
      offeror_id: 'lend_3', offer_id: 'cof_2', offer_kind: 'funding_debt',
      project_id: 'proj_2', project_name: 'Wind Two',
    }));
    const row = db.prepare(
      `SELECT target_role, title FROM oe_role_action_queue WHERE source_entity_id = 'eng_2'`,
    ).get() as any;
    expect(row.target_role).toBe('lender');
    // funding_ kind → framed as a funding request.
    expect(row.title).toContain('funding request');
  });

  it('does not push when the engagement carries no offeror_id', async () => {
    await runCascadeRegistry(ctx('marketplace.inquired', 'oe_offer_engagements', 'eng_3', {
      offer_id: 'cof_3', project_name: 'Ghost',
    }));
    const row = db.prepare(`SELECT id FROM oe_role_action_queue WHERE source_entity_id = 'eng_3'`).get();
    expect(row).toBeUndefined();
  });

  it('is idempotent — re-firing the same engagement event produces one offeror action', async () => {
    const c = ctx('marketplace.inquired', 'oe_offer_engagements', 'eng_4', {
      offeror_id: 'fund_9', offeror_role: 'carbon_fund', offer_id: 'cof_4', project_name: 'X',
    });
    await runCascadeRegistry(c);
    await runCascadeRegistry(c);
    const n = db.prepare(
      `SELECT COUNT(*) AS n FROM oe_role_action_queue WHERE source_entity_id = 'eng_4'`,
    ).get() as any;
    expect(n.n).toBe(1);
  });
});
