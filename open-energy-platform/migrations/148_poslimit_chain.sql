-- Wave 29: Trader Position Limit Compliance chain — FSCA Section 41
-- 10-state lifecycle for position-limit breaches against per-instrument caps.
--   within_limit → warning → soft_breach → hard_breach →
--   margin_call_issued → reduction_required → reduction_executing → cured
-- Terminals: cured (good), escalated (bad — forced liquidation),
--            false_alarm (telemetry-stale).
-- Tiers: prop (Cat IIA, R5bn) | market_maker (Cat IIA-MM, R500m) | retail (Cat I, R50m)

CREATE TABLE IF NOT EXISTS oe_poslimit_cases (
  id                            TEXT PRIMARY KEY,
  case_number                   TEXT NOT NULL UNIQUE,
  trader_party                  TEXT NOT NULL,           -- trading member legal entity
  trader_user_id                TEXT NOT NULL,           -- responsible trader user
  trader_tier                   TEXT NOT NULL,           -- prop | market_maker | retail
  fsca_license_ref              TEXT NOT NULL,           -- FSCA Cat I/IIA license number
  instrument                    TEXT NOT NULL,           -- e.g. "ENERGY_FWD_2026Q3_BL"
  instrument_class              TEXT NOT NULL,           -- energy_fwd | carbon_fwd | rec | dam_intraday
  tenor                         TEXT NOT NULL,           -- e.g. "2026Q3"
  cap_mw                        REAL NOT NULL,           -- position cap in MW (or MWh-equiv)
  position_mw                   REAL NOT NULL,           -- current position
  utilisation_pct               REAL NOT NULL,           -- position_mw / cap_mw * 100
  cap_zar                       REAL NOT NULL,           -- equivalent capital cap (R5bn/R500m/R50m)
  margin_called_zar             REAL,                    -- ZAR top-up demanded
  margin_posted_zar             REAL,                    -- ZAR actually posted
  reduction_target_mw           REAL,                    -- target MW after reduction
  reduction_achieved_mw         REAL,                    -- MW actually reduced
  jse_srl_ref                   TEXT,                    -- JSE-SRL Daily Trade Aggregate reference
  fsca_ref                      TEXT,                    -- FSCA Section 41 acknowledgement reference
  liquidation_order_ref         TEXT,                    -- forced liquidation order reference
  reason_code                   TEXT,                    -- pos_growth | mark_to_market | telemetry_stale
  rod_notes                     TEXT,                    -- reason on disposition (cure/escalate/false_alarm)
  regulator_authority           TEXT,                    -- 'FSCA' for prop/mm, 'JSE_SRL' for retail
  regulator_ref                 TEXT,                    -- regulator acknowledgement
  chain_status                  TEXT NOT NULL,
  detected_at                   TEXT NOT NULL,           -- when telemetry first flagged
  warning_at                    TEXT,
  soft_breach_at                TEXT,
  hard_breach_at                TEXT,
  margin_call_issued_at         TEXT,
  reduction_required_at         TEXT,
  reduction_executing_at        TEXT,
  cured_at                      TEXT,
  escalated_at                  TEXT,
  false_alarm_at                TEXT,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,
  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_poslimit_status       ON oe_poslimit_cases(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_poslimit_tier         ON oe_poslimit_cases(trader_tier);
CREATE INDEX IF NOT EXISTS idx_oe_poslimit_trader       ON oe_poslimit_cases(trader_party);
CREATE INDEX IF NOT EXISTS idx_oe_poslimit_user         ON oe_poslimit_cases(trader_user_id);
CREATE INDEX IF NOT EXISTS idx_oe_poslimit_instrument   ON oe_poslimit_cases(instrument);
CREATE INDEX IF NOT EXISTS idx_oe_poslimit_sla          ON oe_poslimit_cases(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_poslimit_events (
  id            TEXT PRIMARY KEY,
  poslimit_id   TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  actor_id      TEXT,
  notes         TEXT,
  payload       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_poslimit_evt_case ON oe_poslimit_events(poslimit_id);
CREATE INDEX IF NOT EXISTS idx_oe_poslimit_evt_time ON oe_poslimit_events(created_at);
