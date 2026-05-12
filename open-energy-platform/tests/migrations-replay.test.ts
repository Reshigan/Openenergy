// ═══════════════════════════════════════════════════════════════════════════
// Migration full-replay sanity check.
//
// Drops an in-memory SQLite, runs every file in migrations/ in lex order, and
// asserts the chain completes without errors. Then validates a sample of
// the schema (a column from each migration's biggest table) so we catch any
// migration that "succeeds" but leaves the DB in an unexpected shape.
//
// This is the test that would have caught the 034/035/036 duplicate-column
// regression up front instead of via tests/d1-query-cache failing in setup.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDb } from './helpers/d1-sqlite';

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

describe('Migration sweep — replays the full chain cleanly', () => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  it('lists at least 47 numbered migrations', () => {
    expect(files.length).toBeGreaterThanOrEqual(47);
  });

  it('applies every migration in lex order without throwing', () => {
    // createTestDb({ applyMigrations: true }) does exactly this and throws
    // on the first failure with the offending filename in the message.
    expect(() => createTestDb({ applyMigrations: true })).not.toThrow();
  });

  it('produces a schema with the post-047 tables present', () => {
    const db = createTestDb({ applyMigrations: true });
    try {
      const expected = [
        // Core (001-004)
        'participants', 'contract_documents', 'trade_orders', 'trade_matches',
        // Trading + risk (020-022)
        'trade_fills', 'market_prints', 'credit_limits',
        // IPP lifecycle (024 + 046)
        'ipp_projects', 'project_milestones',
        'ipp_site_assessments', 'ipp_yield_estimates',
        'ipp_financial_models', 'ipp_tenders', 'ipp_permits',
        'ipp_info_memorandums', 'ipp_drawdown_requests',
        'ipp_commissioning_tests', 'ipp_nominations',
        'ipp_work_orders', 'ipp_spares_inventory',
        'ipp_decommissioning_plans',
        // Role completeness (045)
        'epc_contractors', 'land_leases', 'insurance_policies_v2',
        'community_engagements_v2', 'env_compliance_obligations',
        // Migration 047 — full 6-role lifecycle
        'off_ppa_portfolio', 'off_contract_redlines', 'off_tou_optimisations',
        'off_btm_designs', 'off_scope2_reports', 'off_cfe_commitments',
        'off_energy_budgets',
        'lender_deal_pipeline', 'lender_sponsor_dd', 'lender_credit_risk',
        'lender_ecl_provisions', 'lender_limit_framework',
        'lender_pricing_models', 'lender_repayment_schedules',
        'carbon_fund_lps', 'carbon_fund_capital_calls', 'carbon_fund_nav_history',
        'carbon_fund_pipeline', 'carbon_fund_term_sheets',
        'carbon_fund_cobenefits', 'carbon_fund_fees',
        'grid_scada_snapshots', 'grid_dispatch_schedules',
        'grid_intraday_balancing', 'grid_reactive_dispatch',
        'grid_contingency_runs', 'grid_outage_coordination',
        'grid_aggregated_forecasts',
        'reg_licence_applications', 'reg_tariff_applications',
        'reg_inspections', 'reg_compliance_monitoring',
        'reg_public_register', 'reg_complaints', 'reg_annual_reports',
        'trader_risk_limits', 'trader_var_calculations',
        'trader_hedging_strategies', 'trader_options_positions',
        'trader_t2_settlements', 'trader_csa_terms', 'trader_pnl_attribution',
      ];

      const got = db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table'`,
      ).all() as Array<{ name: string }>;
      const names = new Set(got.map((r) => r.name));
      const missing = expected.filter((t) => !names.has(t));
      expect(missing).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('every migration filename matches the NNN_*.sql pattern (no stragglers)', () => {
    for (const f of files) {
      expect(f).toMatch(/^\d{3}_[a-z0-9_-]+\.sql$/i);
    }
  });
});
