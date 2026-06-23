import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { buildFundingOptions } from '../src/utils/funding-options';

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  // buildFundingOptions reads the whole oe_counterparty_offers table. The 514
  // seeds are guarded by `WHERE EXISTS participants` (empty here, so they no-op),
  // but clear the table anyway so each test owns its fixtures.
  db.prepare('DELETE FROM oe_counterparty_offers').run();
});
afterEach(() => { db.close(); });

function seedOffer(o: {
  id: string; role: string; kind: string; standard?: string | null; terms: object;
}) {
  db.prepare(
    `INSERT INTO oe_counterparty_offers
       (id, offeror_participant_id, offeror_role, target_role, offer_kind, registry_standard, headline, terms_json, status)
     VALUES (?, ?, ?, 'ipp_developer', ?, ?, ?, ?, 'active')`,
  ).run(o.id, `${o.id}_who`, o.role, o.kind, o.standard ?? null, `${o.id} headline`, JSON.stringify(o.terms));
}

describe('buildFundingOptions', () => {
  it('scores a REC offer off PPA volume and a voluntary offer off tCO2e with the floor', async () => {
    seedOffer({ id: 'rec', role: 'carbon_fund', kind: 'carbon_rec', standard: 'i_rec', terms: { price_per_mwh: 45 } });
    seedOffer({ id: 'gs', role: 'carbon_fund', kind: 'carbon_voluntary', standard: 'gold_standard', terms: { price_per_tco2e: 180, min_volume_tco2e: 1000 } });

    const opts = await buildFundingOptions(env, { id: 'p1', technology: 'solar', capacity_mw: 100, ppa_volume_mwh: 5000 });

    expect(opts.annual_mwh).toBe(5000);
    expect(opts.annual_tco2e).toBe(4750); // 5000 * 0.95
    expect(opts.carbon).toHaveLength(2);
    expect(opts.funding).toHaveLength(0);

    const rec = opts.carbon.find((o) => o.offer_id === 'rec')!;
    expect(rec.category).toBe('carbon');
    expect(rec.est_value_zar).toBe(225_000); // 5000 * 45
    expect(rec.registry_standard).toBe('i_rec');

    const gs = opts.carbon.find((o) => o.offer_id === 'gs')!;
    expect(gs.est_value_zar).toBe(855_000); // 4750 * 180
    // 4750 tCO2e clears the 1000 floor → the reason names it.
    expect(gs.fit_reason).toContain('clears');
  });

  it('falls back to a CF-modelled annual generation when the project carries no PPA volume', async () => {
    seedOffer({ id: 'rec', role: 'carbon_fund', kind: 'carbon_rec', standard: 'i_rec', terms: { price_per_mwh: 45 } });

    const opts = await buildFundingOptions(env, { id: 'p2', technology: 'solar', capacity_mw: 10, ppa_volume_mwh: null });

    // 10 MW * 8760 h * 0.22 CF = 19,272 MWh
    expect(opts.annual_mwh).toBe(19_272);
    expect(opts.carbon[0].est_value_zar).toBe(19_272 * 45);
  });

  it('scores a funding offer as a share of estimated capex and sorts best-fit first', async () => {
    seedOffer({ id: 'senior', role: 'lender', kind: 'funding_debt', terms: { ticket_zar: 25_000_000, rate_basis: 'JIBAR', margin_bps: 450, tenor_years: 15 } });
    seedOffer({ id: 'mezz', role: 'lender', kind: 'funding_mezz', terms: { ticket_zar: 8_000_000, rate_pct: 16.5, tenor_years: 7 } });

    const opts = await buildFundingOptions(env, { id: 'p3', technology: 'solar', capacity_mw: 2, ppa_volume_mwh: 3000 });

    expect(opts.est_capex_zar).toBe(24_000_000); // 2 MW * 12m
    expect(opts.funding).toHaveLength(2);
    // Senior covers ~104% of a R24m build, mezz ~33% → senior scores higher, sorts first.
    expect(opts.funding[0].offer_id).toBe('senior');
    expect(opts.funding[0].est_value_zar).toBe(25_000_000);
    expect(opts.funding[0].fit_score).toBeGreaterThan(opts.funding[1].fit_score);
  });
});
