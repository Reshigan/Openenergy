-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 488 — W229 Virtual/Financial PPA Contract-for-Differences (CfD)
-- Settlement Reconciliation
-- P6 chain on oe_virtual_ppa_settlements
--
-- Legal basis:
--  Financial Markets Act 19/2012 Ch.IV — OTC derivative reporting/registration
--  FSCA Conduct Standard 1/2020 — best-execution & valuation conduct
--  IFRS 9 — hedge-accounting fair-value differential recognition
--  ISDA Master Agreement + Calculation Agent determination protocols
--
-- Domain: corporate offtakers increasingly buy renewable energy via synthetic
-- ("virtual"/"sleeved") PPAs structured as CfDs — the generator sells into the
-- wholesale pool at the floating reference price, and the two parties true up
-- the difference against an agreed strike price each settlement period. This
-- chain reconciles that periodic financial differential — the genuinely
-- "financial instrument" layer that none of the existing physical-delivery
-- PPA chains (W22 contract exec, W32 take-or-pay, W39 indexation, W46
-- curtailment, W54 payment security, W62 termination) model.
--
-- SLA: INVERTED by settlement_tier — bigger differential = longer verification
-- window before payment is due (minor=5d, material=10d, large=15d, systemic=21d).
-- Regulator crossing: escalate_to_isda + write_off ALWAYS; dispute for
-- large/systemic; cancel + record_payment for systemic only.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_virtual_ppa_settlements (
  id TEXT PRIMARY KEY,
  contract_ref TEXT NOT NULL,            -- underlying virtual/financial PPA (CfD) contract reference
  generator_id TEXT NOT NULL,            -- IPP / generator — receives the fixed strike price
  offtaker_id TEXT NOT NULL,             -- corporate buyer — receives the floating reference price
  settlement_period TEXT NOT NULL,       -- YYYY-MM
  reference_index TEXT NOT NULL CHECK(reference_index IN (
    'day_ahead_market', 'eskom_megaflex', 'ifrt_reference', 'wholesale_pool'
  )),

  -- Commercial terms for the period
  notional_mwh REAL NOT NULL,                   -- contracted notional volume for the period
  strike_price_zar_per_mwh REAL NOT NULL,       -- fixed/strike price agreed in the CfD
  reference_price_zar_per_mwh REAL,             -- floating reference/index price (NULL until published)

  -- Computed differential
  differential_zar_per_mwh REAL,
  settlement_amount_zar REAL,                   -- absolute value of the differential payable
  paying_party TEXT CHECK(paying_party IN ('generator', 'offtaker')),
  settlement_tier TEXT CHECK(settlement_tier IN ('minor', 'material', 'large', 'systemic')),

  -- Payment details
  payment_method TEXT CHECK(payment_method IN ('eft', 'bank_wire', 'clearing_house', 'netting')),
  payment_ref TEXT,
  payment_date TEXT,
  payment_amount_zar REAL,

  -- Dispute / recalculation / determination trail
  dispute_reason TEXT,
  recalculated_amount_zar REAL,
  isda_determination_ref TEXT,
  write_off_reason TEXT,
  cancellation_reason TEXT,

  -- Chain state
  chain_status TEXT NOT NULL DEFAULT 'reference_price_pending'
    CHECK(chain_status IN (
      'reference_price_pending', -- period opened; awaiting publication of the floating reference index
      'calculated',              -- differential computed (strike vs reference x notional)
      'statement_issued',        -- settlement statement issued to both counterparties
      'payment_pending',         -- acknowledged; payment due by sla_deadline
      'disputed',                -- a counterparty disputes the calculated differential
      'recalculating',           -- recalculation under way following dispute
      'isda_determination',      -- escalated to ISDA Calculation Agent for binding determination
      'partially_settled',       -- partial payment received; balance outstanding
      'overdue',                 -- sla_deadline passed without full settlement
      'settled',                 -- payment completed and confirmed; terminal
      'written_off',             -- uncollectible balance written off; terminal
      'cancelled'                -- statement voided before settlement (data correction); terminal
    )),

  -- SLA
  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  regulator_notified INTEGER DEFAULT 0,
  actor_id TEXT,
  reason TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vppa_settlement_contract
  ON oe_virtual_ppa_settlements(contract_ref, chain_status);
CREATE INDEX IF NOT EXISTS idx_vppa_settlement_parties
  ON oe_virtual_ppa_settlements(generator_id, offtaker_id);
CREATE INDEX IF NOT EXISTS idx_vppa_settlement_status
  ON oe_virtual_ppa_settlements(chain_status, sla_deadline);
