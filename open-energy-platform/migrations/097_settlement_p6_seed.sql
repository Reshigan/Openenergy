-- 097_settlement_p6_seed.sql
-- Seed for Wave 3 CPMI-IOSCO PFMI disclosure + DvP + margin gate.
-- Idempotent (INSERT OR REPLACE / OR IGNORE).

-- ── Default fund: one fund + three member contributions ───────────────────
INSERT OR IGNORE INTO oe_clearing_fund (id, fund_year, total_size_zar, initial_contribution_pct, variable_assessment_basis, status)
VALUES ('ocf_2026', 2026, 60000000, 0.10, 'open_interest', 'active');

INSERT OR IGNORE INTO oe_clearing_contributions (id, fund_id, participant_id, amount_zar, contributed_at, status)
VALUES
  ('occ_demo_alpha', 'ocf_2026', 'mem_demo_alpha', 25000000, datetime('now','-90 days'), 'active'),
  ('occ_demo_beta',  'ocf_2026', 'mem_demo_beta',  28000000, datetime('now','-90 days'), 'active'),
  ('occ_demo_gamma', 'ocf_2026', 'mem_demo_gamma', 22000000, datetime('now','-90 days'), 'active');

-- ── Three historical CPMI-IOSCO snapshots (Mar/Apr/May 2026) ─────────────
-- All Cover-1 PASS to make the disclosure tab show a clean ledger.
INSERT OR REPLACE INTO clearing_disclosure_snapshots (
  id, as_of_date,
  initial_margin_total_zar, variation_margin_total_zar, margin_coverage_pct,
  qualifying_liquid_resources_zar, largest_member_exposure_zar, liquidity_coverage_ratio,
  default_fund_balance_zar, default_fund_required_zar, default_fund_coverage_ratio,
  ccp_capital_zar, ccp_capital_skin_in_game_zar,
  settlement_finality_pct, failed_instruction_count, active_member_count,
  computed_by, computed_at, published, published_at, published_by
) VALUES
  ('cds_demo_20260331', '2026-03-31',
   95000000, 4200000, 105.5,
   180000000, 142000000, 1.27,
   72000000, 60000000, 1.20,
   30000000, 7500000,
   99.82, 14, 38,
   'seed', datetime('now'), 1, datetime('now','-50 days'), 'regulator@openenergy.co.za'),
  ('cds_demo_20260430', '2026-04-30',
   102000000, 5100000, 108.1,
   190000000, 155000000, 1.225,
   74000000, 60000000, 1.233,
   30000000, 7500000,
   99.91, 8, 40,
   'seed', datetime('now'), 1, datetime('now','-20 days'), 'regulator@openenergy.co.za'),
  ('cds_demo_20260531', '2026-05-31',
   108500000, 5400000, 112.8,
   205000000, 162000000, 1.265,
   75000000, 60000000, 1.25,
   30000000, 7500000,
   99.95, 5, 42,
   'seed', datetime('now'), 0, NULL, NULL);

-- ── Demo settlement cycles with DvP locks in various states ──────────────
INSERT OR IGNORE INTO oe_settlement_cycles (id, trade_date, value_date, status, total_trades, total_volume_mwh, total_value_zar, net_legs_count, netting_efficiency, created_at)
VALUES
  ('osc_demo_20260525', '2026-05-25', '2026-05-27', 'settled', 24, 480, 12500000, 8,  0.616, datetime('now','-2 days')),
  ('osc_demo_20260526', '2026-05-26', '2026-05-28', 'novated', 27, 520, 14200000, 9,  0.627, datetime('now','-1 day')),
  ('osc_demo_20260527', '2026-05-27', '2026-05-29', 'pending', 22, 460, 11800000, 7,  0.652, datetime('now'));

INSERT OR REPLACE INTO settlement_dvp_locks (cycle_id, lock_status, cash_confirmed_at, cash_confirmed_by, cash_ref, energy_confirmed_at, energy_confirmed_by, energy_ref, locked_at)
VALUES
  ('osc_demo_20260525', 'locked',
   datetime('now','-2 days'), 'support@openenergy.co.za', 'BNK-260525-001',
   datetime('now','-2 days'), 'support@openenergy.co.za', 'NER-260525-001',
   datetime('now','-2 days')),
  ('osc_demo_20260526', 'cash_in',
   datetime('now','-1 day'), 'support@openenergy.co.za', 'BNK-260526-001',
   NULL, NULL, NULL,
   NULL),
  ('osc_demo_20260527', 'open',
   NULL, NULL, NULL,
   NULL, NULL, NULL,
   NULL);

-- ── Demo margin enforcement state ────────────────────────────────────────
INSERT OR REPLACE INTO margin_enforcement_state
  (member_id, gate_status, open_call_count, overdue_call_count, total_call_amount_zar, earliest_deadline, last_evaluated_at)
VALUES
  ('mem_demo_alpha', 'clear',   0, 0, 0,        NULL,                       datetime('now')),
  ('mem_demo_beta',  'warning', 1, 0, 850000,   datetime('now','+8 hours'), datetime('now')),
  ('mem_demo_gamma', 'blocked', 2, 1, 1750000,  datetime('now','-2 hours'), datetime('now'));

-- ── Sample failed instruction + fail escalation ──────────────────────────
-- Resolve net_leg_id off oe_settlement_net_legs if it exists; else use a stub.
INSERT OR IGNORE INTO oe_settlement_instructions
  (id, net_leg_id, participant_id, direction, amount_zar, bank, reference, status, created_at)
VALUES
  ('osi_demo_failed_001', 'onl_demo_001', 'mem_demo_gamma', 'debit', 875000, 'absa', 'BNK-FAIL-001', 'failed', datetime('now','-3 hours'));

INSERT OR IGNORE INTO settlement_fail_escalations
  (id, instruction_id, escalation_tier, triggered_at, triggered_by, resolution_status)
VALUES
  ('sfe_demo_001', 'osi_demo_failed_001', 2, datetime('now','-1 hour'), 'cron_sla_sweep', 'open');
