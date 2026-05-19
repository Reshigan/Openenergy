-- ════════════════════════════════════════════════════════════════════════
-- 066_trading_clearing_l5.sql — Block trades, surveillance, market
-- maker obligations, clearing house default fund.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_block_trades (
  id                TEXT PRIMARY KEY,
  reporter_id       TEXT NOT NULL,
  buyer_id          TEXT NOT NULL,
  seller_id         TEXT NOT NULL,
  energy_type       TEXT NOT NULL,
  delivery_date     TEXT,
  volume_mwh        REAL NOT NULL,
  price_zar_mwh     REAL NOT NULL,
  value_zar         REAL NOT NULL,
  trade_time        TEXT NOT NULL,
  reported_at       TEXT NOT NULL DEFAULT (datetime('now')),
  status            TEXT NOT NULL DEFAULT 'reported',
                                                  -- reported | confirmed | published |
                                                  -- rejected | bust
  publication_delay_minutes INTEGER NOT NULL DEFAULT 15,
  published_at      TEXT,
  bust_reason       TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_blocks_reporter ON oe_block_trades(reporter_id, reported_at);

CREATE TABLE IF NOT EXISTS oe_surveillance_alerts (
  id                TEXT PRIMARY KEY,
  alert_type        TEXT NOT NULL,                -- wash_trade | layering | spoofing |
                                                  -- marking_close | front_running |
                                                  -- mismatched_position | insider_pattern |
                                                  -- collusion | unusual_volume
  participant_id    TEXT NOT NULL,
  related_order_ids TEXT,                         -- JSON array
  related_fill_ids  TEXT,                         -- JSON array
  detected_at       TEXT NOT NULL DEFAULT (datetime('now')),
  severity          TEXT NOT NULL,                -- info | low | medium | high | critical
  score             REAL,                         -- 0..1 model confidence
  evidence_json     TEXT,                         -- relevant data points
  status            TEXT NOT NULL DEFAULT 'open',
                                                  -- open | under_review | escalated |
                                                  -- false_positive | confirmed | reported_to_fic
  reviewer_id       TEXT,
  reviewed_at       TEXT,
  reported_to       TEXT,                         -- 'FIC' / 'NERSA' / 'FSCA'
  reported_at       TEXT,
  notes             TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_surv_status ON oe_surveillance_alerts(status, detected_at);

CREATE TABLE IF NOT EXISTS oe_mm_obligations (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  energy_type         TEXT NOT NULL,
  obligation_type     TEXT NOT NULL,              -- two_sided_quote | min_spread | uptime
  two_sided_minutes_per_day INTEGER,              -- e.g. 360 (6 hours)
  max_spread_bps      INTEGER,                    -- max bid-ask spread basis points
  uptime_target_pct   REAL,                       -- 0..100
  min_quote_volume_mwh REAL,
  effective_from      TEXT NOT NULL,
  effective_to        TEXT NOT NULL,
  monthly_fee_zar     REAL,                       -- platform pays MM
  performance_score   REAL,
  status              TEXT NOT NULL DEFAULT 'active',
                                                  -- active | suspended | terminated | expired
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_mm_part ON oe_mm_obligations(participant_id, status);

CREATE TABLE IF NOT EXISTS oe_mm_performance (
  id                TEXT PRIMARY KEY,
  obligation_id     TEXT NOT NULL,
  day               TEXT NOT NULL,
  two_sided_minutes INTEGER,
  avg_spread_bps    REAL,
  uptime_pct        REAL,
  total_volume_mwh  REAL,
  compliant         INTEGER NOT NULL,             -- 0/1
  fee_earned_zar    REAL,
  penalty_zar       REAL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_mm_perf_ob ON oe_mm_performance(obligation_id, day);

-- Clearing house default fund
CREATE TABLE IF NOT EXISTS oe_clearing_fund (
  id                TEXT PRIMARY KEY,
  fund_year         INTEGER NOT NULL,
  total_size_zar    REAL NOT NULL,
  initial_contribution_pct REAL NOT NULL,
  variable_assessment_basis TEXT,                  -- 'avg_daily_var' | 'avg_volume'
  status            TEXT NOT NULL DEFAULT 'active',
  established_at    TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at         TEXT
);

CREATE TABLE IF NOT EXISTS oe_clearing_contributions (
  id                TEXT PRIMARY KEY,
  fund_id           TEXT NOT NULL,
  participant_id    TEXT NOT NULL,
  amount_zar        REAL NOT NULL,
  contributed_at    TEXT NOT NULL DEFAULT (datetime('now')),
  refunded_at       TEXT,
  refund_amount_zar REAL,
  status            TEXT NOT NULL DEFAULT 'held'   -- held | partially_used | exhausted |
                                                  -- refunded
);
CREATE INDEX IF NOT EXISTS idx_oe_clear_part ON oe_clearing_contributions(participant_id, fund_id);

CREATE TABLE IF NOT EXISTS oe_clearing_loss_events (
  id                TEXT PRIMARY KEY,
  default_event_id  TEXT NOT NULL,
  fund_id           TEXT NOT NULL,
  loss_amount_zar   REAL NOT NULL,
  defaulter_margin_used_zar  REAL,                -- step 1 of waterfall
  defaulter_default_fund_used_zar REAL,           -- step 2
  clearing_house_capital_used_zar REAL,           -- step 3 ("skin in the game")
  mutualised_amount_zar REAL,                     -- step 4 — across non-defaulters
  status            TEXT NOT NULL DEFAULT 'open',
                                                  -- open | waterfall_executing |
                                                  -- mutualised | resolved
  resolved_at       TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_clear_loss_def ON oe_clearing_loss_events(default_event_id);
