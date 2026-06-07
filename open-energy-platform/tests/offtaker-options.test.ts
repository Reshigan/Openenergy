import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { buildOfftakerOptions } from '../src/utils/offtaker-options';

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  // Isolate the whole-table queries. Migration 082 is a demo migration whose
  // filename lacks `_seed`, so the harness APPLIES it and it seeds ipp_projects
  // rows. buildOfftakerOptions queries the entire table, so each test must own
  // its fixtures — clear both tables first.
  db.prepare('DELETE FROM ipp_projects').run();
  db.prepare('DELETE FROM marketplace_listings').run();
});
afterEach(() => { db.close(); });

function seedParticipant(id: string, role: string) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status)
     VALUES (?, ?, 'x', ?, ?, 'active')`,
  ).run(id, `${id}@t.co`, id, role);
}

describe('buildOfftakerOptions', () => {
  it('scores an upcoming project cheaper than tariff as a positive saving', async () => {
    seedParticipant('dev1', 'ipp_developer');
    db.prepare(
      `INSERT INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location, status, ppa_volume_mwh, ppa_price_per_mwh)
       VALUES ('p1','Karoo Solar','dev1','build_own_operate','solar',100,'NC','construction',5000,1200)`,
    ).run();
    const opts = await buildOfftakerOptions(env, 'off1', { annual_kwh: 10_000_000, avg_tariff_zar_per_kwh: 2.0 });
    expect(opts.upcoming_projects).toHaveLength(1);
    const o = opts.upcoming_projects[0];
    expect(o.kind).toBe('project');
    expect(o.target_participant_id).toBe('dev1');
    expect(o.availability).toBe('upcoming');
    expect(o.cod_estimate).toBe('construction');
    // demand 10000 MWh, offered 5000 → covered 5000
    expect(o.annual_mwh).toBe(5000);
    // current = 5000*1000*2.0 = 10,000,000 ; option = 5000*1200 = 6,000,000 ; saving 4,000,000 → 40%
    expect(o.est_saving_zar).toBe(4_000_000);
    expect(o.est_saving_pct).toBe(40);
    expect(o.co2_avoided_tco2e).toBe(Math.round(5000 * 0.95));
  });

  it('caps covered MWh at the offtaker demand and marks commercial_operations as now', async () => {
    seedParticipant('dev2', 'ipp_developer');
    db.prepare(
      `INSERT INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location, status, ppa_volume_mwh, ppa_price_per_mwh)
       VALUES ('p2','Big Wind','dev2','build_own_operate','wind',300,'EC','commercial_operations',50000,900)`,
    ).run();
    const opts = await buildOfftakerOptions(env, 'off1', { annual_kwh: 2_000_000, avg_tariff_zar_per_kwh: 2.0 });
    const o = opts.upcoming_projects[0];
    expect(o.availability).toBe('now');
    expect(o.cod_estimate).toBeNull();
    expect(o.annual_mwh).toBe(2000); // capped at demand 2000 MWh, not 50000
  });

  it('buckets active energy listings under available_now', async () => {
    seedParticipant('sell1', 'trader');
    db.prepare(
      `INSERT INTO marketplace_listings (id, seller_id, listing_type, title, price, price_unit, volume_available, status)
       VALUES ('l1','sell1','energy','Spot energy block',1500,'ZAR/MWh',3000,'active')`,
    ).run();
    const opts = await buildOfftakerOptions(env, 'off1', { annual_kwh: 10_000_000, avg_tariff_zar_per_kwh: 2.0 });
    expect(opts.available_now).toHaveLength(1);
    const o = opts.available_now[0];
    expect(o.kind).toBe('listing');
    expect(o.target_participant_id).toBe('sell1');
    expect(o.availability).toBe('now');
  });

  it('excludes non-energy listings and non-active listings', async () => {
    seedParticipant('sell2', 'trader');
    db.prepare(
      `INSERT INTO marketplace_listings (id, seller_id, listing_type, title, price, volume_available, status)
       VALUES ('l2','sell2','equipment','Used inverter',1500,10,'active')`,
    ).run();
    db.prepare(
      `INSERT INTO marketplace_listings (id, seller_id, listing_type, title, price, volume_available, status)
       VALUES ('l3','sell2','energy','Withdrawn block',1500,10,'withdrawn')`,
    ).run();
    const opts = await buildOfftakerOptions(env, 'off1', { annual_kwh: 10_000_000, avg_tariff_zar_per_kwh: 2.0 });
    expect(opts.available_now).toHaveLength(0);
  });

  it('guards divide-by-zero when tariff is zero', async () => {
    seedParticipant('dev3', 'ipp_developer');
    db.prepare(
      `INSERT INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location, status, ppa_volume_mwh, ppa_price_per_mwh)
       VALUES ('p3','Zero Tariff','dev3','build_own_operate','solar',10,'GP','development',1000,1200)`,
    ).run();
    const opts = await buildOfftakerOptions(env, 'off1', { annual_kwh: 1_000_000, avg_tariff_zar_per_kwh: 0 });
    expect(opts.upcoming_projects[0].est_saving_pct).toBe(0);
  });
});
