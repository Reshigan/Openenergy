import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerLenderCovenantRules } from '../src/cascade-rules/lender-covenant';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerLenderCovenantRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'covenant_tests', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('lender-covenant rules', () => {
  it('covenant_breach queues actions for lender + developer AND opens a watchlist with a cycle-1 dunning notice', async () => {
    db.prepare(`INSERT INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location) VALUES ('proj1','Test Project','dev1','build_own_operate','solar_pv',100,'Northern Cape')`).run();
    await runCascadeRegistry(ctx('lender.covenant_breach', 'ct1', {
      lender_participant_id: 'lend1', project_id: 'proj1', covenant_code: 'DSCR',
      measured_value: 1.1, threshold: 1.2, test_period: 'Q2-2026',
      facility_id: 'fac1', borrower_id: 'dev1',
    }));
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE type = 'covenant_breach' AND entity_id = 'ct1'`).get() as { n: number };
    expect(aq.n).toBe(2);
    const wl = db.prepare(`SELECT COUNT(*) n FROM oe_lender_watchlist WHERE facility_id = 'fac1' AND participant_id = 'dev1'`).get() as { n: number };
    expect(wl.n).toBe(1);
    const dn = db.prepare(`SELECT COUNT(*) n FROM oe_lender_dunning_notices WHERE facility_id = 'fac1' AND cycle = 1`).get() as { n: number };
    expect(dn.n).toBe(1);
  });

  it('covenant_warn materializes watchlist+dunning but does NOT queue breach actions', async () => {
    await runCascadeRegistry(ctx('lender.covenant_warn', 'ct2', { facility_id: 'fac2', borrower_id: 'dev2', covenant_code: 'LLCR' }));
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE entity_id = 'ct2'`).get() as { n: number };
    expect(aq.n).toBe(0);
    const wl = db.prepare(`SELECT COUNT(*) n FROM oe_lender_watchlist WHERE facility_id = 'fac2'`).get() as { n: number };
    expect(wl.n).toBe(1);
    const dn = db.prepare(`SELECT COUNT(*) n FROM oe_lender_dunning_notices WHERE facility_id = 'fac2'`).get() as { n: number };
    expect(dn.n).toBe(1);
  });

  it('does not duplicate the watchlist row when an open one already exists', async () => {
    await runCascadeRegistry(ctx('lender.covenant_breach', 'ct3', { facility_id: 'fac3', borrower_id: 'dev3', covenant_code: 'DSCR' }));
    await runCascadeRegistry(ctx('lender.covenant_breach', 'ct3b', { facility_id: 'fac3', borrower_id: 'dev3', covenant_code: 'DSCR' }));
    const wl = db.prepare(`SELECT COUNT(*) n FROM oe_lender_watchlist WHERE facility_id = 'fac3' AND participant_id = 'dev3' AND cleared_at IS NULL`).get() as { n: number };
    expect(wl.n).toBe(1);
    const dn = db.prepare(`SELECT COUNT(*) n FROM oe_lender_dunning_notices WHERE facility_id = 'fac3'`).get() as { n: number };
    expect(dn.n).toBe(2);
  });
});
