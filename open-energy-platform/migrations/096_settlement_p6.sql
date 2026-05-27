-- 096_settlement_p6.sql
-- Wave 3: Settlement & Clearing to CPMI-IOSCO PFMI grade.
-- Three new surfaces:
--   1. clearing_disclosure_snapshots — monthly CPMI 13-metric public disclosure
--   2. settlement_dvp_locks — atomic DvP checkpoint per cycle (cash + energy)
--   3. margin_enforcement_state — per-member breach state (pre-trade gate input)
-- All CREATE TABLE IF NOT EXISTS; ALTER ... ADD COLUMN wrapped via app code on
-- migration apply (column already exists is treated as benign).

-- ── clearing_disclosure_snapshots ──────────────────────────────────────────
-- One row per month. The 13 CPMI-IOSCO quantitative metrics, computed from
-- live D1 state (collateral, margin calls, default fund, member counts).
-- as_of_date = last calendar day of the disclosure month (yyyy-mm-dd).
CREATE TABLE IF NOT EXISTS clearing_disclosure_snapshots (
  id                              TEXT PRIMARY KEY,
  as_of_date                      TEXT NOT NULL,
  -- CPMI-IOSCO §6 (Margin)
  initial_margin_total_zar        REAL NOT NULL DEFAULT 0,
  variation_margin_total_zar      REAL NOT NULL DEFAULT 0,
  margin_coverage_pct             REAL NOT NULL DEFAULT 0,     -- IM / 99% VaR over lookback
  -- CPMI-IOSCO §7 (Liquidity)
  qualifying_liquid_resources_zar REAL NOT NULL DEFAULT 0,
  largest_member_exposure_zar     REAL NOT NULL DEFAULT 0,
  liquidity_coverage_ratio        REAL NOT NULL DEFAULT 0,     -- QLR / largest exposure
  -- CPMI-IOSCO §4 (Credit)
  default_fund_balance_zar        REAL NOT NULL DEFAULT 0,
  default_fund_required_zar       REAL NOT NULL DEFAULT 0,
  default_fund_coverage_ratio     REAL NOT NULL DEFAULT 0,     -- balance / required
  -- CPMI-IOSCO §15 (General business risk)
  ccp_capital_zar                 REAL NOT NULL DEFAULT 0,
  ccp_capital_skin_in_game_zar    REAL NOT NULL DEFAULT 0,     -- 25% of capital
  -- CPMI-IOSCO §17 (Operational risk)
  settlement_finality_pct         REAL NOT NULL DEFAULT 0,     -- settled / (settled + failed)
  failed_instruction_count        INTEGER NOT NULL DEFAULT 0,
  -- Member metrics
  active_member_count             INTEGER NOT NULL DEFAULT 0,
  -- Audit
  computed_by                     TEXT,
  computed_at                     TEXT NOT NULL DEFAULT (datetime('now')),
  -- Publishing flags
  published                       INTEGER NOT NULL DEFAULT 0,
  published_at                    TEXT,
  published_by                    TEXT
);
CREATE INDEX IF NOT EXISTS idx_cds_date ON clearing_disclosure_snapshots(as_of_date);

-- ── settlement_dvp_locks ──────────────────────────────────────────────────
-- One row per settlement cycle. Atomic DvP requires both legs CONFIRMED
-- before the cycle can transition to 'settled'. lock_status:
--   open      = neither leg confirmed
--   cash_in   = cash leg confirmed, awaiting energy
--   energy_in = energy leg confirmed, awaiting cash
--   locked    = both legs confirmed → cycle.settle() may proceed
--   released  = cycle reversed (default or break) — lock voided
CREATE TABLE IF NOT EXISTS settlement_dvp_locks (
  cycle_id          TEXT PRIMARY KEY,
  lock_status       TEXT NOT NULL DEFAULT 'open',
  cash_confirmed_at TEXT,
  cash_confirmed_by TEXT,
  cash_ref          TEXT,
  energy_confirmed_at TEXT,
  energy_confirmed_by TEXT,
  energy_ref        TEXT,
  locked_at         TEXT,
  released_at       TEXT,
  released_reason   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dvp_status ON settlement_dvp_locks(lock_status);

-- ── margin_enforcement_state ──────────────────────────────────────────────
-- Per-member breach state. Updated by the daily margin-call cron + by manual
-- ops actions. Pre-trade guard reads this to gate orders.
-- gate_status:
--   clear    = no overdue margin call; member may trade
--   warning  = open margin call within deadline; pre-trade warns but allows
--   blocked  = overdue margin call past deadline; pre-trade rejects
CREATE TABLE IF NOT EXISTS margin_enforcement_state (
  member_id           TEXT PRIMARY KEY,
  gate_status         TEXT NOT NULL DEFAULT 'clear',
  open_call_count     INTEGER NOT NULL DEFAULT 0,
  overdue_call_count  INTEGER NOT NULL DEFAULT 0,
  total_call_amount_zar REAL NOT NULL DEFAULT 0,
  earliest_deadline   TEXT,
  last_evaluated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  manual_override     INTEGER NOT NULL DEFAULT 0,
  override_reason     TEXT,
  override_by         TEXT,
  override_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_mes_status ON margin_enforcement_state(gate_status);

-- ── settlement_fail_escalations ──────────────────────────────────────────
-- SLA escalation ledger for failed settlement instructions.
-- escalation_tier: 1 = T+0 retry, 2 = ops_call, 3 = buy_in_initiated, 4 = default_event
CREATE TABLE IF NOT EXISTS settlement_fail_escalations (
  id                TEXT PRIMARY KEY,
  instruction_id    TEXT NOT NULL,
  escalation_tier   INTEGER NOT NULL DEFAULT 1,
  triggered_at      TEXT NOT NULL DEFAULT (datetime('now')),
  triggered_by      TEXT,
  resolution_status TEXT NOT NULL DEFAULT 'open',
  resolved_at       TEXT,
  resolved_by       TEXT,
  notes             TEXT
);
CREATE INDEX IF NOT EXISTS idx_sfe_instr ON settlement_fail_escalations(instruction_id);
CREATE INDEX IF NOT EXISTS idx_sfe_status ON settlement_fail_escalations(resolution_status);
