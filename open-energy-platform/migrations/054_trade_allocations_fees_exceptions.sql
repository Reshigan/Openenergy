-- ════════════════════════════════════════════════════════════════════════
-- 054 · Trade L4 depth — allocations, fees, exceptions, AI amendments
--
-- Mirror of migration 052+053 (settlement L4) for the trading side. The
-- core matching engine already produces trade_matches with a volume and
-- price; this migration adds the post-match operational layer that the
-- traders + back office actually need to run a desk:
--
--   trade_allocations
--     A single fill (trade_matches row) may be attributed to multiple
--     internal lots / sub-accounts / sub-portfolios. The matcher
--     records the headline counterparty, but allocations break the
--     fill down into who-gets-what at the desk level. This is what
--     turns a "5 MWh fill" into "2 MWh to fund A, 3 MWh to fund B" for
--     reporting and risk attribution.
--
--   trade_fees
--     Append-only ledger of every brokerage / exchange / clearing /
--     market-data / tax fee accrued against a fill. Same idempotency
--     pattern as settlement_fees: UNIQUE (match_id, fee_type, rule_version)
--     means the fees engine can be re-run safely.
--
--   trade_exceptions
--     The trade-side counterpart of settlement_breaks: when a fill is
--     wrong (bad price, wrong counterparty, off-market execution),
--     either side files an exception. The state machine is the same
--     (open → investigating → resolved | rejected) so the SPA reuses
--     the breaks transition modal pattern.
--
--   ai_trade_amendments
--     Audit of every AI inline assist that suggested an order
--     amendment (resize, re-price, cancel). Mirrors ai_decisions /
--     ai_settlement_run_failures: every surface logs creation, every
--     accept logs acceptance. Drives the trader-board AI suggestion
--     "your X MWh @ R Y could re-price to..." with a 1-click accept.
--
-- All CREATEs use IF NOT EXISTS; safe to re-run as part of the
-- migrations-replay test.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trade_allocations (
  id                  TEXT PRIMARY KEY,
  match_id            TEXT NOT NULL,              -- trade_matches.id
  order_id            TEXT NOT NULL,              -- trade_orders.id (the side being attributed)
  participant_id      TEXT NOT NULL,              -- desk / sub-account / fund
  allocated_volume_mwh REAL NOT NULL,
  allocated_price_zar  REAL NOT NULL,             -- usually = match price; allowed to differ for internal book transfer
  sub_account         TEXT,                       -- free-text internal label
  lot_id              TEXT,                       -- optional finer lot identifier
  reason              TEXT,
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','rolled_back','superseded')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  created_by          TEXT,
  UNIQUE (match_id, participant_id, sub_account, lot_id)
);
CREATE INDEX IF NOT EXISTS idx_trade_allocations_match
  ON trade_allocations (match_id);
CREATE INDEX IF NOT EXISTS idx_trade_allocations_order
  ON trade_allocations (order_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_allocations_participant
  ON trade_allocations (participant_id, created_at);

CREATE TABLE IF NOT EXISTS trade_fees (
  id                 TEXT PRIMARY KEY,
  match_id           TEXT NOT NULL,                -- trade_matches.id
  order_id           TEXT NOT NULL,                -- trade_orders.id (the side billed)
  participant_id     TEXT NOT NULL,
  fee_type           TEXT NOT NULL CHECK (fee_type IN (
    'brokerage','exchange','clearing','market_data','regulatory','tax','adjustment'
  )),
  basis              TEXT NOT NULL,                -- "0.10 ZAR/MWh", "5 bps of notional", "flat R250"
  amount_zar         REAL NOT NULL,
  reason             TEXT,
  calc_rule_version  TEXT NOT NULL,
  calculated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  applied_by         TEXT,
  UNIQUE (match_id, participant_id, fee_type, calc_rule_version)
);
CREATE INDEX IF NOT EXISTS idx_trade_fees_match
  ON trade_fees (match_id);
CREATE INDEX IF NOT EXISTS idx_trade_fees_participant
  ON trade_fees (participant_id, calculated_at);

CREATE TABLE IF NOT EXISTS trade_exceptions (
  id                   TEXT PRIMARY KEY,
  match_id             TEXT NOT NULL,              -- trade_matches.id
  order_id             TEXT NOT NULL,              -- trade_orders.id
  exception_type       TEXT NOT NULL CHECK (exception_type IN (
    'bad_price','off_market','wrong_counterparty','wrong_volume','duplicate_fill','market_halt_override','other'
  )),
  severity             TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  status               TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','investigating','resolved','rejected')),
  reported_by          TEXT NOT NULL,
  reported_at          TEXT NOT NULL DEFAULT (datetime('now')),
  reason               TEXT NOT NULL,
  expected_value       REAL,
  actual_value         REAL,
  resolution_outcome   TEXT CHECK (resolution_outcome IN (
    'cancelled','rebooked','adjusted','waived','escalated','no_action'
  )),
  resolution_notes     TEXT,
  resolved_at          TEXT,
  resolved_by          TEXT,
  rebook_match_id      TEXT,                       -- if outcome='rebooked', the new trade_matches row
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trade_exceptions_match
  ON trade_exceptions (match_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_exceptions_reporter
  ON trade_exceptions (reported_by, status);

CREATE TABLE IF NOT EXISTS ai_trade_amendments (
  id                   TEXT PRIMARY KEY,
  participant_id       TEXT NOT NULL,
  order_id             TEXT NOT NULL,              -- target order
  suggestion_kind      TEXT NOT NULL CHECK (suggestion_kind IN (
    're_price','resize','cancel','convert_to_ioc','split'
  )),
  current_state        TEXT NOT NULL,              -- JSON snapshot of order at time of suggestion
  suggested_state      TEXT NOT NULL,              -- JSON of suggested fields
  rationale            TEXT NOT NULL,              -- single-line "why"
  confidence           REAL,
  source               TEXT NOT NULL DEFAULT 'deterministic'
    CHECK (source IN ('deterministic','ai_gateway','fallback')),
  accepted_at          TEXT,
  accepted_by          TEXT,
  dismissed_at         TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_trade_amendments_order
  ON ai_trade_amendments (order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_trade_amendments_participant
  ON ai_trade_amendments (participant_id, accepted_at);
