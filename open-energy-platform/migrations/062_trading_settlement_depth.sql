-- ════════════════════════════════════════════════════════════════════════
-- 062_trading_settlement_depth.sql — L4/L5 depth for trading + settlement.
--
--   • oe_algo_executions       — TWAP / VWAP / POV slicing engine
--   • oe_position_limits       — per-trader limits with breach workflow
--   • oe_position_breaches     — limit-breach history with admin override
--   • oe_margin_calls          — collateral call lifecycle
--   • oe_collateral_postings   — what backed which margin call
--   • oe_settlement_cycles     — T+1 net settlement runs
--   • oe_settlement_net_legs   — netted legs per pair per cycle
--   • oe_default_events        — counterparty default + workout pipeline
--   • oe_settlement_instructions — bank rail instruction tracking
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_algo_executions (
  id                 TEXT PRIMARY KEY,
  participant_id     TEXT NOT NULL,
  parent_order_id    TEXT,
  algo_type          TEXT NOT NULL,             -- twap | vwap | pov | iceberg
  energy_type        TEXT NOT NULL,
  delivery_date      TEXT,
  side               TEXT NOT NULL,             -- buy | sell
  total_volume_mwh   REAL NOT NULL,
  limit_price        REAL,
  start_at           TEXT NOT NULL,
  end_at             TEXT NOT NULL,
  slice_size_mwh     REAL,
  slice_count        INTEGER,
  participation_pct  REAL,                      -- POV-specific
  status             TEXT NOT NULL DEFAULT 'pending',
                                                  -- pending | running | paused |
                                                  -- completed | cancelled
  filled_volume_mwh  REAL NOT NULL DEFAULT 0,
  avg_fill_price     REAL,
  slippage_bps       REAL,
  created_by         TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_algo_status ON oe_algo_executions(status, start_at);
CREATE INDEX IF NOT EXISTS idx_oe_algo_part   ON oe_algo_executions(participant_id, created_at);

CREATE TABLE IF NOT EXISTS oe_algo_slices (
  id            TEXT PRIMARY KEY,
  algo_id       TEXT NOT NULL,
  slice_index   INTEGER NOT NULL,
  target_at     TEXT NOT NULL,
  volume_mwh    REAL NOT NULL,
  order_id      TEXT,
  filled_at     TEXT,
  filled_price  REAL,
  status        TEXT NOT NULL DEFAULT 'queued',  -- queued | submitted | filled | skipped
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_algo_slices_algo ON oe_algo_slices(algo_id, slice_index);

CREATE TABLE IF NOT EXISTS oe_position_limits (
  participant_id            TEXT NOT NULL,
  energy_type               TEXT NOT NULL,
  net_long_limit_mwh        REAL NOT NULL DEFAULT 0,
  net_short_limit_mwh       REAL NOT NULL DEFAULT 0,
  per_delivery_limit_mwh    REAL,                -- max single-delivery exposure
  daily_pnl_floor_zar       REAL,                -- stop-loss
  daily_volume_limit_mwh    REAL,
  set_by                    TEXT,
  set_at                    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (participant_id, energy_type)
);

CREATE TABLE IF NOT EXISTS oe_position_breaches (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  energy_type     TEXT NOT NULL,
  limit_type      TEXT NOT NULL,                -- net_long | net_short |
                                                 -- per_delivery | daily_pnl_floor |
                                                 -- daily_volume
  limit_value     REAL NOT NULL,
  observed_value  REAL NOT NULL,
  severity        TEXT NOT NULL,                -- warning | breach | hard_breach
  status          TEXT NOT NULL DEFAULT 'open', -- open | acknowledged | cleared |
                                                 -- override_granted
  detected_at     TEXT NOT NULL DEFAULT (datetime('now')),
  cleared_at      TEXT,
  override_by     TEXT,
  override_at     TEXT,
  override_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_breach_part ON oe_position_breaches(participant_id, status);

CREATE TABLE IF NOT EXISTS oe_margin_calls (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  triggered_by        TEXT NOT NULL,             -- mark_movement | limit_breach |
                                                  -- regulatory | manual
  required_amount_zar REAL NOT NULL,
  posted_amount_zar   REAL NOT NULL DEFAULT 0,
  deadline_at         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open',
                                                  -- open | partial | satisfied |
                                                  -- breached | escalated | substituted
  collateral_basket   TEXT,                      -- JSON acceptable collateral
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  satisfied_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_margin_part ON oe_margin_calls(participant_id, status);

CREATE TABLE IF NOT EXISTS oe_collateral_postings (
  id              TEXT PRIMARY KEY,
  margin_call_id  TEXT,                          -- nullable for initial margin
  participant_id  TEXT NOT NULL,
  asset_type      TEXT NOT NULL,                 -- zar_cash | govt_bond | bank_guarantee |
                                                  -- letter_of_credit
  asset_ref       TEXT,                          -- bond ISIN / LC reference
  haircut_pct     REAL NOT NULL DEFAULT 0,
  face_value_zar  REAL NOT NULL,
  collateral_value_zar REAL NOT NULL,            -- face × (1 - haircut)
  posted_at       TEXT NOT NULL DEFAULT (datetime('now')),
  released_at     TEXT,
  substituted_by  TEXT                           -- id of replacement posting
);
CREATE INDEX IF NOT EXISTS idx_oe_coll_call ON oe_collateral_postings(margin_call_id);
CREATE INDEX IF NOT EXISTS idx_oe_coll_part ON oe_collateral_postings(participant_id, released_at);

CREATE TABLE IF NOT EXISTS oe_settlement_cycles (
  id                  TEXT PRIMARY KEY,
  trade_date          TEXT NOT NULL,             -- T (the date traded)
  value_date          TEXT NOT NULL,             -- T+1 (settlement date)
  status              TEXT NOT NULL DEFAULT 'open',
                                                  -- open | netting | net_calculated |
                                                  -- novated | settled | failed
  total_trades        INTEGER NOT NULL DEFAULT 0,
  total_volume_mwh    REAL    NOT NULL DEFAULT 0,
  total_value_zar     REAL    NOT NULL DEFAULT 0,
  net_legs_count      INTEGER NOT NULL DEFAULT 0,
  netting_efficiency  REAL,                      -- 1 - (net_legs / gross_legs)
  novated_at          TEXT,
  settled_at          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_cycle_dates ON oe_settlement_cycles(trade_date, value_date);

CREATE TABLE IF NOT EXISTS oe_settlement_net_legs (
  id                  TEXT PRIMARY KEY,
  cycle_id            TEXT NOT NULL,
  from_participant_id TEXT NOT NULL,
  to_participant_id   TEXT NOT NULL,
  energy_type         TEXT NOT NULL,
  net_volume_mwh      REAL NOT NULL,
  net_value_zar       REAL NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
                                                  -- pending | novated | settled | failed
  novated_at          TEXT,
  settled_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_netlegs_cycle ON oe_settlement_net_legs(cycle_id, status);

CREATE TABLE IF NOT EXISTS oe_default_events (
  id                 TEXT PRIMARY KEY,
  participant_id     TEXT NOT NULL,
  trigger_type       TEXT NOT NULL,              -- margin_call_breach | settlement_fail |
                                                  -- insolvency | regulatory
  declared_at        TEXT NOT NULL DEFAULT (datetime('now')),
  initial_exposure_zar REAL,
  status             TEXT NOT NULL DEFAULT 'open',
                                                  -- open | suspended | close_out_priced |
                                                  -- novated_to_cure_party | recovered | written_off
  close_out_priced_at TEXT,
  recovery_amount_zar REAL,
  recovery_at        TEXT,
  notes              TEXT,
  declared_by        TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_default_part ON oe_default_events(participant_id, status);

CREATE TABLE IF NOT EXISTS oe_settlement_instructions (
  id                  TEXT PRIMARY KEY,
  net_leg_id          TEXT,                       -- nullable for ad-hoc instructions
  participant_id      TEXT NOT NULL,
  direction           TEXT NOT NULL,              -- debit | credit
  amount_zar          REAL NOT NULL,
  bank               TEXT NOT NULL,
  bank_account_ref    TEXT NOT NULL,
  reference           TEXT,
  status              TEXT NOT NULL DEFAULT 'queued',
                                                  -- queued | submitted | confirmed |
                                                  -- failed | reversed
  submitted_at        TEXT,
  confirmed_at        TEXT,
  bank_confirmation   TEXT,
  failure_reason      TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_setinst_part ON oe_settlement_instructions(participant_id, status);
