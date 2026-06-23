// Layer-C: when a SolaX fleet is uploaded (/backfill/finalize) or refreshed
// (/materialize, nightly cron) the ingest fires esums_financials_materialized.
// esums-activation.ts consumes it and lights every counterparty IncomingPanel:
// owner (ipp_developer), offtaker, carbon_fund, lender. The counterparties live
// on solax_stations, resolved by the owner participant_id the event carries.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import type { CascadeContext } from '../src/utils/cascade';
import { registerEsumsActivationRules } from '../src/cascade-rules/esums-activation';
import { runCascadeRegistry, _resetRegistryForTests } from '../src/utils/cascade-registry';

let db: Database.Database; let env: any;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  // carbon_/lender_participant_id were force-applied out-of-band on prod with no
  // migration file, so a clean schema lacks them. Add them here to mirror prod;
  // offtaker_participant_id lands in-band via migration 434.
  for (const col of ['carbon_participant_id', 'lender_participant_id', 'offtaker_participant_id']) {
    try { db.exec(`ALTER TABLE solax_stations ADD COLUMN ${col} TEXT`); } catch { /* already present */ }
  }
  _resetRegistryForTests();
  registerEsumsActivationRules();
});
afterEach(() => db.close());

function ctx(event: string, entity_id: string, data: Record<string, unknown>): CascadeContext {
  return { event, entity_type: 'esums_station', entity_id, data, env } as unknown as CascadeContext;
}
function seedStation(id: string, owner: string, off: string | null, carbon: string | null, lender: string | null) {
  db.prepare(
    `INSERT INTO solax_stations
       (id, participant_id, plant_id, device_sn, created_at, updated_at,
        offtaker_participant_id, carbon_participant_id, lender_participant_id)
     VALUES (?, ?, 'p1', ?, '2026-01-01', '2026-01-01', ?, ?, ?)`,
  ).run(id, owner, `sn_${id}`, off, carbon, lender);
}
function cards(owner: string) {
  return db.prepare(
    `SELECT target_role, target_participant_id, title, source_chain_key, cross_option_json
       FROM oe_role_action_queue WHERE source_entity_id = ?`,
  ).all(owner) as any[];
}

describe('esums-activation cascade rules', () => {
  it('fans out one card per role on materialize', async () => {
    seedStation('st1', 'ipp1', 'off1', 'carbon1', 'lend1');
    await runCascadeRegistry(ctx('esums_financials_materialized', 'ipp1',
      { participant_id: 'ipp1', invoices: 3, credits: 2, holdings: 1 }));
    const rows = cards('ipp1');
    const byRole = Object.fromEntries(rows.map((r) => [r.target_role, r]));
    expect(rows).toHaveLength(4);
    expect(byRole.ipp_developer.target_participant_id).toBe('ipp1');
    expect(byRole.ipp_developer.title).toContain('3 invoices');
    expect(byRole.offtaker.target_participant_id).toBe('off1');
    expect(byRole.carbon_fund.target_participant_id).toBe('carbon1');
    expect(byRole.lender.target_participant_id).toBe('lend1');
    expect(rows.every((r) => r.source_chain_key === 'esums_activation')).toBe(true);
    expect(JSON.parse(byRole.offtaker.cross_option_json).target_route).toBe('/offtaker-suite/workstation');
  });

  it('only fires the owner card when no counterparties are configured', async () => {
    seedStation('st2', 'ipp2', null, null, null);
    await runCascadeRegistry(ctx('esums_financials_materialized', 'ipp2',
      { participant_id: 'ipp2', invoices: 1, credits: 0, holdings: 0 }));
    const rows = cards('ipp2');
    expect(rows).toHaveLength(1);
    expect(rows[0].target_role).toBe('ipp_developer');
  });

  it('does nothing without an owner participant_id', async () => {
    await runCascadeRegistry(ctx('esums_financials_materialized', 'ipp3', { invoices: 1 }));
    expect(db.prepare(`SELECT COUNT(*) n FROM oe_role_action_queue`).get() as any).toMatchObject({ n: 0 });
  });

  it('dedups counterparties shared across stations and does not double-push on refresh', async () => {
    seedStation('st4a', 'ipp4', 'off4', 'carbon4', null);
    seedStation('st4b', 'ipp4', 'off4', 'carbon4', null); // same counterparties
    const c = ctx('esums_financials_materialized', 'ipp4',
      { participant_id: 'ipp4', invoices: 5, credits: 5, holdings: 5 });
    await runCascadeRegistry(c);
    await runCascadeRegistry(c); // refresh re-fires the same event
    const rows = cards('ipp4');
    // owner + one offtaker + one carbon_fund = 3, no duplicates
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.target_role === 'offtaker')).toHaveLength(1);
  });
});
