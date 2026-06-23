// Doc-generation feature (migration 515): deterministic generators + the
// subscription-gated route + lifecycle state machine.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import docGen from '../src/routes/doc-generation';
import { generateDoc } from '../src/utils/doc-generators';

describe('doc-generators (deterministic)', () => {
  it('PDD computes ER off PPA volume × DFFE 0.942 and adds the Gold Standard SDG section', () => {
    const out = generateDoc({
      docType: 'pdd', registryStandard: 'gold_standard',
      subject: { project_name: 'Karoo Solar One', technology: 'solar', capacity_mw: 100, ppa_volume_mwh: 5000, ppa_duration_years: 10 },
    });
    expect(out.meta.annual_tco2e).toBe(Math.round(5000 * 0.942));
    expect(out.title).toContain('Karoo Solar One');
    expect(out.contentMd).toContain('SDG 13');
  });

  it('PDD falls back to capacity-factor modelled generation when no PPA volume', () => {
    const out = generateDoc({
      docType: 'pdd', registryStandard: 'verra',
      subject: { project_name: 'Wind Two', technology: 'wind', capacity_mw: 50, ppa_volume_mwh: 0 },
    });
    // 50 MW * 8760 h * 0.32 wind CF
    expect(out.meta.annual_mwh).toBe(Math.round(50 * 8760 * 0.32));
  });

  it('PDD names the Pure Earth co-benefit section for the pure_earth standard', () => {
    const out = generateDoc({
      docType: 'pdd', registryStandard: 'pure_earth',
      subject: { project_name: 'X', technology: 'solar', capacity_mw: 10 },
    });
    expect(out.contentMd).toContain('Pure Earth');
  });

  it('term sheet derives capex at R12m/MW and a 75% senior facility', () => {
    const out = generateDoc({ docType: 'term_sheet', subject: { project_name: 'P', capacity_mw: 2 } });
    expect(out.meta.est_capex_zar).toBe(24_000_000);
    expect(out.meta.senior_facility_zar).toBe(18_000_000);
  });

  it('REC issuance requests one certificate per metered MWh', () => {
    const out = generateDoc({ docType: 'rec_issuance_request', subject: { project_name: 'P', technology: 'solar', capacity_mw: 10, ppa_volume_mwh: 4000 } });
    expect(out.meta.certificates).toBe(4000);
  });

  it('MRV flags a variance when claimed differs from computed net reductions', () => {
    const out = generateDoc({
      docType: 'mrv',
      subject: { reporting_period_start: '2025-01', reporting_period_end: '2025-12', baseline_emissions_tco: 1000, project_emissions_tco: 50, leakage_tco: 0, claimed_reductions_tco: 800 },
    });
    expect(out.meta.net_reductions_tco).toBe(950);
    expect(out.contentMd).toContain('Variance flag');
  });
});

describe('doc-generation route', () => {
  let db: Database.Database;
  let env: any;
  let token: string;

  beforeEach(async () => {
    db = createTestDb({ applyMigrations: true });
    env = envFor(db);
    token = await testJwtFor(db, 'fund_1', { role: 'carbon_fund' });
    db.prepare(
      `INSERT INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location, status, ppa_volume_mwh, ppa_duration_years)
       VALUES ('proj_1', 'Karoo Solar One', 'dev_1', 'build_own_operate', 'solar', 100, 'Northern Cape', 'commercial_operations', 5000, 10)`,
    ).run();
  });
  afterEach(() => { db.close(); });

  it('blocks generate until the subscription is enabled, then allows it', async () => {
    const gated = await call(docGen, env, 'POST', '/generate', {
      token, body: { doc_type: 'pdd', subject_id: 'proj_1', registry_standard: 'gold_standard' },
    });
    expect(gated.status).toBe(402);

    const enable = await call(docGen, env, 'POST', '/enable', { token, body: { tier: 'professional' } });
    expect(enable.status).toBe(200);

    const gen = await call(docGen, env, 'POST', '/generate', {
      token, body: { doc_type: 'pdd', subject_id: 'proj_1', registry_standard: 'gold_standard' },
    });
    expect(gen.status).toBe(200);
    const job = (gen.json as any).job;
    expect(job.status).toBe('generated');
    expect(job.content_md).toContain('Karoo Solar One');
  });

  it('404s on an unknown subject and 400s on a bad doc_type', async () => {
    await call(docGen, env, 'POST', '/enable', { token });
    const missing = await call(docGen, env, 'POST', '/generate', { token, body: { doc_type: 'pdd', subject_id: 'nope' } });
    expect(missing.status).toBe(404);
    const bad = await call(docGen, env, 'POST', '/generate', { token, body: { doc_type: 'bogus', subject_id: 'proj_1' } });
    expect(bad.status).toBe(400);
  });

  it('walks the lifecycle generated→in_review→submitted→accepted and rejects illegal jumps', async () => {
    await call(docGen, env, 'POST', '/enable', { token });
    const gen = await call(docGen, env, 'POST', '/generate', { token, body: { doc_type: 'pdd', subject_id: 'proj_1' } });
    const id = (gen.json as any).job.id;

    const jump = await call(docGen, env, 'POST', `/jobs/${id}/transition`, { token, body: { to: 'accepted' } });
    expect(jump.status).toBe(409);

    expect((await call(docGen, env, 'POST', `/jobs/${id}/transition`, { token, body: { to: 'in_review' } })).status).toBe(200);
    expect((await call(docGen, env, 'POST', `/jobs/${id}/transition`, { token, body: { to: 'submitted' } })).status).toBe(200);
    expect((await call(docGen, env, 'POST', `/jobs/${id}/transition`, { token, body: { to: 'accepted' } })).status).toBe(200);

    const fin = await call(docGen, env, 'GET', `/jobs/${id}`, { token });
    expect((fin.json as any).job.status).toBe('accepted');
  });

  it('scopes the jobs list to the owner', async () => {
    await call(docGen, env, 'POST', '/enable', { token });
    await call(docGen, env, 'POST', '/generate', { token, body: { doc_type: 'pdd', subject_id: 'proj_1' } });
    const other = await testJwtFor(db, 'fund_2', { role: 'carbon_fund' });
    const mine = await call(docGen, env, 'GET', '/jobs', { token });
    const theirs = await call(docGen, env, 'GET', '/jobs', { token: other });
    expect((mine.json as any).jobs.length).toBe(1);
    expect((theirs.json as any).jobs.length).toBe(0);
  });
});
