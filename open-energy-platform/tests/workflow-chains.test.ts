// ═══════════════════════════════════════════════════════════════════════════
// Workflow chain tests — exercise multi-step business flows end-to-end,
// chaining the output of one endpoint into the next.
//
// Each chain represents one of the platform's real value loops. A single
// failing step in the chain is the kind of bug a per-endpoint smoke test
// can miss (the endpoint returns 2xx in isolation but produces a value
// downstream code can't consume).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from 'better-sqlite3';

import roleCompletions from '../src/routes/role-completions';
import contractsRoutes from '../src/routes/contracts';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';

let db: Database.Database;
let env: Record<string, unknown>;
let ippToken: string;
let lenderToken: string;
let regulatorToken: string;
let traderToken: string;
let adminToken: string;

beforeAll(async () => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  ippToken       = await testJwtFor(db, 'chain_ipp',       { role: 'ipp_developer', email: 'ipp.chain@test' });
  lenderToken    = await testJwtFor(db, 'chain_lender',    { role: 'lender',        email: 'lender.chain@test' });
  regulatorToken = await testJwtFor(db, 'chain_regulator', { role: 'regulator',     email: 'regulator.chain@test' });
  traderToken    = await testJwtFor(db, 'chain_trader',    { role: 'trader',        email: 'trader.chain@test' });
  adminToken     = await testJwtFor(db, 'chain_admin',     { role: 'admin',         email: 'admin.chain@test' });
});

afterAll(() => { db.close(); });

// ─── 1. IPP project planning chain ────────────────────────────────────────
// site assessment → yield estimate → financial model → info memorandum
//
// The financial model joins to the yield (auto-pulls p50_gwh_yr when only
// yield_estimate_id is given); the info memorandum carries the financial
// model's id. So if any link breaks the next step 500s.
describe('IPP planning chain: site → yield → financial model → IM', () => {
  let siteId: string;
  let yieldId: string;
  let fmId: string;

  it('1. screens a Karoo solar site (auto-computes preliminary LCOE)', async () => {
    const res = await call(roleCompletions, env, 'POST', '/ipp/sites', {
      token: ippToken,
      body: {
        site_name: 'Karoo South Block A', technology: 'solar', province: 'NC',
        hectares: 280, grid_distance_km: 8, nearest_substation: 'Helios',
        ghi_kwh_per_m2_yr: 2280, capex_estimate_zar_per_mw: 13_000_000,
        go_decision: 'go', rating_score: 9,
      },
    });
    expect(res.status).toBe(201);
    const data = (res.json as { data: { id: string; preliminary_lcoe_zar_per_mwh: number } }).data;
    expect(data.preliminary_lcoe_zar_per_mwh).toBeGreaterThan(300);
    expect(data.preliminary_lcoe_zar_per_mwh).toBeLessThan(600);
    siteId = data.id;
  });

  it('2. records a yield estimate referencing the site', async () => {
    const res = await call(roleCompletions, env, 'POST', '/ipp/yield-estimates', {
      token: ippToken,
      body: {
        site_assessment_id: siteId, capacity_mw: 200, p50_gwh_yr: 498,
        module_or_turbine: 'Trina 600W Vertex', software: 'PVsyst',
      },
    });
    expect(res.status).toBe(201);
    const data = (res.json as { data: { id: string; p75_gwh_yr: number; p90_gwh_yr: number; net_capacity_factor: number } }).data;
    expect(data.p75_gwh_yr).toBeCloseTo(498 * 0.93, 0);
    expect(data.p90_gwh_yr).toBeCloseTo(498 * 0.88, 0);
    expect(data.net_capacity_factor).toBeCloseTo(0.284, 2);
    yieldId = data.id;
  });

  it('3. runs a financial model pulling p50 from the yield', async () => {
    const res = await call(roleCompletions, env, 'POST', '/ipp/financial-models', {
      token: ippToken,
      body: {
        model_version: 'v1.0', yield_estimate_id: yieldId,
        capacity_mw: 200, capex_zar: 3_300_000_000,
        ppa_tariff_zar_mwh: 820, operating_life_yrs: 25,
      },
    });
    expect(res.status).toBe(201);
    const data = (res.json as { data: { id: string; lcoe_zar_per_mwh: number; project_irr_pct: number; npv_zar: number; payback_years: number } }).data;
    expect(data.lcoe_zar_per_mwh).toBeGreaterThan(0);
    expect(data.project_irr_pct).toBeGreaterThan(0);
    expect(data.payback_years).toBeGreaterThan(0);
    fmId = data.id;
  });

  it('4. assembles an info memorandum carrying the financial model', async () => {
    const res = await call(roleCompletions, env, 'POST', '/ipp/info-memorandums', {
      token: ippToken,
      body: {
        im_version: 'v1.0', im_title: 'Karoo South 200 MW IM',
        capacity_mw: 200, capex_zar: 3_300_000_000, funding_requested_zar: 2_100_000_000,
        yield_estimate_id: yieldId, financial_model_id: fmId, prepared_by: 'chain_ipp',
      },
    });
    expect(res.status).toBe(201);
    const data = (res.json as { data: { id: string; share_link_token: string; share_url: string } }).data;
    expect(data.share_link_token).toMatch(/^[0-9a-f]{32}$/);
    expect(data.share_url).toMatch(new RegExp(`^/portal/im/${data.share_link_token}$`));
  });

  it('5. all four rows are joined by ids in the database', () => {
    const im = db.prepare(`
      SELECT yield_estimate_id, financial_model_id
      FROM ipp_info_memorandums
      WHERE participant_id = 'chain_ipp'
    `).get() as { yield_estimate_id: string; financial_model_id: string };
    expect(im.yield_estimate_id).toBe(yieldId);
    expect(im.financial_model_id).toBe(fmId);
  });
});

// ─── 2. Lender credit chain ──────────────────────────────────────────────
// deal pipeline → sponsor DD → credit risk → IFRS 9 ECL → pricing
// Each step uses the same loan_id and is one part of the underwriting case.
describe('Lender chain: pipeline → DD → credit risk → ECL → pricing', () => {
  const loanId = 'loan_chain_001';

  it('1. opens a pipeline deal', async () => {
    const res = await call(roleCompletions, env, 'POST', '/lender/pipeline', {
      token: lenderToken,
      body: {
        deal_name: 'Karoo South Senior Debt', sponsor_name: 'RenewCo',
        sector: 'power', ticket_size_zar: 2_100_000_000, probability_pct: 65,
        stage: 'qualified',
      },
    });
    expect(res.status).toBe(201);
  });

  it('2. runs sponsor DD with a clean KYC outcome', async () => {
    const res = await call(roleCompletions, env, 'POST', '/lender/sponsor-dd', {
      token: lenderToken,
      body: {
        sponsor_name: 'RenewCo', kyc_outcome: 'clean',
        track_record_score: 8, financial_strength_score: 7, bbbee_level: 2,
        overall_outcome: 'approved',
      },
    });
    expect(res.status).toBe(201);
  });

  it('3. computes credit risk (Expected Loss + RWA)', async () => {
    const res = await call(roleCompletions, env, 'POST', '/lender/credit-risk', {
      token: lenderToken,
      body: {
        loan_id: loanId, as_of_date: '2026-05-12',
        pd_1yr_pct: 2, lgd_pct: 45, ead_zar: 2_100_000_000, risk_weight_pct: 100,
        rating_internal: 'BBB',
      },
    });
    expect(res.status).toBe(201);
    const data = (res.json as { data: { expected_loss_zar: number; rwa_zar: number } }).data;
    // EL = 2% × 45% × R2.1B = R18.9M
    expect(data.expected_loss_zar).toBeCloseTo(18_900_000, -3);
    // RWA = R2.1B × 100% = R2.1B
    expect(data.rwa_zar).toBe(2_100_000_000);
  });

  it('4. provisions an IFRS 9 Stage 2 ECL', async () => {
    const res = await call(roleCompletions, env, 'POST', '/lender/ecl', {
      token: lenderToken,
      body: {
        loan_id: loanId, reporting_period: '2026-Q2', ifrs9_stage: 2,
        stage2_ecl_zar: 18_900_000, recovery_zar: 500_000,
        stage_change_reason: 'sponsor cashflow stress',
      },
    });
    expect(res.status).toBe(201);
    const data = (res.json as { data: { total_provision_zar: number; net_provision_zar: number } }).data;
    expect(data.total_provision_zar).toBe(18_900_000);
    expect(data.net_provision_zar).toBe(18_400_000);
  });

  it('5. derives a RAROC-priced margin', async () => {
    const res = await call(roleCompletions, env, 'POST', '/lender/pricing', {
      token: lenderToken,
      body: {
        loan_id: loanId, pricing_method: 'RAROC',
        cost_of_funds_pct: 8.5, cost_of_credit_pct: 0.9, cost_of_capital_pct: 12,
        cost_of_ops_pct: 0.4, proposed_margin_bps: 350, hurdle_raroc_pct: 15,
      },
    });
    expect(res.status).toBe(201);
    expect((res.json as { data: { expected_raroc_pct: number | null } }).data.expected_raroc_pct).toBeGreaterThan(0);
  });
});

// ─── 3. Trader VaR + options chain ──────────────────────────────────────
describe('Trader chain: limits → VaR → options book → P&L', () => {
  it('sets a 1-day VaR limit', async () => {
    const res = await call(roleCompletions, env, 'POST', '/trader/risk-limits', {
      token: traderToken,
      body: { limit_type: 'var_1d', dimension: 'electricity_spot', limit_zar: 10_000_000, current_zar: 4_500_000 },
    });
    expect(res.status).toBe(201);
    expect((res.json as { data: { utilisation_pct: number } }).data.utilisation_pct).toBe(45);
  });

  it('runs a historical VaR (auto-fills Expected Shortfall)', async () => {
    const res = await call(roleCompletions, env, 'POST', '/trader/var', {
      token: traderToken,
      body: { as_of_date: '2026-05-12', method: 'historical', horizon_days: 1, confidence_pct: 95, var_zar: 3_500_000 },
    });
    expect(res.status).toBe(201);
    expect((res.json as { data: { expected_shortfall_zar: number } }).data.expected_shortfall_zar).toBeCloseTo(4_550_000, -3);
  });

  it('books an in-the-money long call (auto-computes intrinsic MTM)', async () => {
    const res = await call(roleCompletions, env, 'POST', '/trader/options', {
      token: traderToken,
      body: {
        contract_type: 'european_call', underlying: 'electricity_spot', side: 'long',
        strike_zar_per_mwh: 1200, underlying_price_zar: 1300, volume_mwh: 1000,
        premium_zar: 50_000,
      },
    });
    expect(res.status).toBe(201);
    // intrinsic = (1300 − 1200) × 1000 = 100,000
    expect((res.json as { data: { mtm_zar: number } }).data.mtm_zar).toBe(100_000);
  });

  it('records daily P&L attribution (auto-sums total)', async () => {
    const res = await call(roleCompletions, env, 'POST', '/trader/pnl', {
      token: traderToken,
      body: {
        as_of_date: '2026-05-12', book: 'options',
        realised_pnl_zar: 120_000, unrealised_pnl_zar: -45_000,
        delta_pnl_zar: 80_000, gamma_pnl_zar: -10_000, vega_pnl_zar: 15_000,
        carry_zar: 5_000, fees_zar: -2_000,
      },
    });
    expect(res.status).toBe(201);
    // total = realised + unrealised + carry + fees + fx_pnl.
    // Greek decomposition fields (delta/gamma/vega/theta) attribute the
    // unrealised pnl across factors and are NOT added on top.
    //  120k − 45k + 5k − 2k + 0 = 78k.
    expect((res.json as { data: { total_pnl_zar: number } }).data.total_pnl_zar).toBe(78_000);
  });
});

// ─── 4. Regulator licence + annual report chain ──────────────────────────
describe('Regulator chain: licence application → inspection → annual report auto-tally', () => {
  it('files a new licence application', async () => {
    const res = await call(roleCompletions, env, 'POST', '/regulator/licence-applications', {
      token: regulatorToken,
      body: {
        application_ref: 'CHAIN/GEN/001', applicant_name: 'Chain Solar (Pty) Ltd',
        licence_category: 'REG_LIC_GEN', capacity_mw: 75, technology: 'solar',
        filed_at: '2099-01-15', outcome: 'granted',
      },
    });
    expect(res.status).toBe(201);
  });

  it('records a routine inspection (auto-status: scheduled)', async () => {
    const res = await call(roleCompletions, env, 'POST', '/regulator/inspections', {
      token: regulatorToken,
      body: {
        licensee_name: 'Chain Solar (Pty) Ltd', inspection_type: 'routine',
        scheduled_at: '2099-02-15T09:00:00Z', conducted_at: '2099-02-15T10:00:00Z',
        outcome: 'compliant', status: 'closed',
      },
    });
    expect(res.status).toBe(201);
  });

  it('compiles an annual report that auto-tallies from the registers', async () => {
    const res = await call(roleCompletions, env, 'POST', '/regulator/annual-reports', {
      token: regulatorToken,
      body: { reporting_year: 2099 },
    });
    expect(res.status).toBe(201);
    const data = (res.json as { data: { licences_granted: number; inspections_conducted: number } }).data;
    expect(data.licences_granted).toBeGreaterThanOrEqual(1);
    expect(data.inspections_conducted).toBeGreaterThanOrEqual(1);
  });
});

// ─── 5. Contracts CRUD round-trip ───────────────────────────────────────
describe('Contracts CRUD: create → read → update → delete', () => {
  let cid: string;

  it('creates a draft PPA', async () => {
    const res = await call(contractsRoutes, env, 'POST', '/', {
      token: adminToken,
      body: { title: 'chain PPA v1', phase: 'draft', contract_type: 'ppa_wheeling' },
    });
    expect(res.status).toBe(201);
    cid = (res.json as { data: { id: string } }).data.id;
  });

  it('reads the same record back', async () => {
    const res = await call(contractsRoutes, env, 'GET', `/${cid}`, { token: adminToken });
    expect(res.status).toBe(200);
    expect((res.json as { data: { title: string } }).data.title).toBe('chain PPA v1');
  });

  it('updates only the title via PUT (partial-patch shape)', async () => {
    const res = await call(contractsRoutes, env, 'PUT', `/${cid}`, {
      token: adminToken, body: { title: 'chain PPA v2 — renamed' },
    });
    expect(res.status).toBe(200);
    expect((res.json as { data: { title: string; phase: string } }).data.title).toBe('chain PPA v2 — renamed');
    // phase must survive untouched (the COALESCE(?, col) path)
    expect((res.json as { data: { phase: string } }).data.phase).toBe('draft');
  });

  it('deletes the record', async () => {
    const res = await call(contractsRoutes, env, 'DELETE', `/${cid}`, { token: adminToken });
    expect(res.status).toBe(200);
    const after = await call(contractsRoutes, env, 'GET', `/${cid}`, { token: adminToken });
    expect(after.status).toBe(404);
  });
});
