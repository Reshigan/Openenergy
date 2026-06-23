-- Migration 517: Goldrush carbon-arm link + lender facility
--
-- Two go-live gaps surfaced after the Goldrush fleet load:
--
-- P0 — Carbon arm was DEAD. materializeFinancials() (esums-accruals.ts) only
--      writes esums_carbon_credits / carbon_holdings when the station carries a
--      carbon_participant_id (the `ss.carbon_participant_id IS NOT NULL` gate),
--      and the esums-activation cascade only pushes the Envera card to a
--      non-null carbon counterparty. Migrations 434/438/441 set the offtaker and
--      lender links but never the carbon link, so the entire carbon arm produced
--      zero rows and zero cross-role cards. We point it at the real carbon_fund
--      participant. NOTE: migration 435 references 'demo_carbon_fund_001' in the
--      station_participant_links table, but that id has NO participants row — the
--      real carbon_fund participant seeded in 003 is 'demo_carbon_001'
--      (GreenFunds Carbon Fund, carbon@openenergy.co.za). The card must target
--      the real participant or the carbon persona never sees it.
--
-- P1 — Lender portfolio was empty for Goldrush. The project (ip_mpyzsjbdui04oc)
--      and its 5 covenants (441) reference demo_lender_001, but no loan_facilities
--      row existed, so the lender suite showed covenants against a phantom
--      facility. We seed the senior-debt facility (commercial-structure metadata,
--      not synthetic generation/billing data). borrower = NXT Energy (the project
--      owner participant).
--
-- Idempotent: P0 is a scoped UPDATE with a null/empty guard; P1 is INSERT OR IGNORE.

-- P0: carbon link on the Goldrush stations.
UPDATE solax_stations
SET carbon_participant_id = 'demo_carbon_001'
WHERE participant_id = 'id_7c352b86da89907a85266a250e15db95'
  AND (carbon_participant_id IS NULL OR carbon_participant_id = '');

-- P1: Goldrush senior-debt facility.
-- Defensive create mirrors the funder.ts auto-create pattern in 005 — harmless
-- where the table already exists (prod), required where a clean replay omits the
-- 005 seed migration.
CREATE TABLE IF NOT EXISTS loan_facilities (
  id TEXT PRIMARY KEY,
  facility_name TEXT NOT NULL,
  project_id TEXT,
  lender_participant_id TEXT NOT NULL,
  borrower_participant_id TEXT,
  facility_type TEXT,
  committed_amount REAL,
  drawn_amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'ZAR',
  interest_rate_pct REAL,
  tenor_months INTEGER,
  dscr_covenant REAL DEFAULT 1.20,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO loan_facilities
  (id, facility_name, project_id, lender_participant_id, borrower_participant_id,
   facility_type, committed_amount, drawn_amount, currency, interest_rate_pct,
   tenor_months, dscr_covenant, status)
VALUES
  ('fac_goldrush_001', 'Goldrush C&I Solar Senior Debt', 'ip_mpyzsjbdui04oc',
   'demo_lender_001', 'id_7c352b86da89907a85266a250e15db95',
   'senior_secured', 45000000, 40000000, 'ZAR', 10.50,
   120, 1.20, 'active');
