-- ════════════════════════════════════════════════════════════════════════
-- 064_grid_l5.sql — Grid operator L5.
--
-- Dispatch with constraint solver, frequency response services (FCR /
-- FRR-A / FRR-M), ancillary services (reserves, voltage support, black
-- start), wheeling agreements, curtailment management.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_grid_constraints (
  id               TEXT PRIMARY KEY,
  zone             TEXT NOT NULL,           -- 'EHV-CGT', 'NW-Loadcentre', ...
  constraint_type  TEXT NOT NULL,           -- thermal_line | transformer | voltage |
                                            -- frequency | n_minus_1 | n_minus_2
  limit_mw         REAL NOT NULL,
  direction        TEXT NOT NULL,           -- import | export | bidirectional
  active_from      TEXT NOT NULL DEFAULT (datetime('now')),
  active_to        TEXT,
  source           TEXT,                    -- 'Grid Code 5.3.1', 'SCADA', etc
  notes            TEXT,
  created_by       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_constr_zone ON oe_grid_constraints(zone, active_to);

-- Dispatch optimization runs — economic dispatch with constraints
CREATE TABLE IF NOT EXISTS oe_dispatch_runs (
  id                   TEXT PRIMARY KEY,
  trade_date           TEXT NOT NULL,
  interval_start       TEXT NOT NULL,            -- 15-min interval start (UTC)
  status               TEXT NOT NULL DEFAULT 'queued',
                                                  -- queued | running | optimized |
                                                  -- published | superseded | failed
  total_demand_mw      REAL,
  total_supply_mw      REAL,
  marginal_price_zar   REAL,                     -- system marginal price
  active_constraints   TEXT,                     -- JSON of constraint IDs binding
  optimization_seconds REAL,                     -- wall-clock of solver
  failure_reason       TEXT,
  created_by           TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_disp_interval ON oe_dispatch_runs(interval_start, status);

CREATE TABLE IF NOT EXISTS oe_dispatch_offers (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL,
  participant_id      TEXT NOT NULL,
  asset_id            TEXT,                       -- om_devices.id or grid asset
  offer_mw            REAL NOT NULL,
  offer_price_zar_mwh REAL NOT NULL,
  awarded_mw          REAL NOT NULL DEFAULT 0,
  awarded_price_zar_mwh REAL,
  status              TEXT NOT NULL DEFAULT 'submitted',
                                                  -- submitted | partially_cleared |
                                                  -- fully_cleared | rejected | curtailed
  submitted_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_offers_run ON oe_dispatch_offers(run_id, status);

-- Ancillary services
CREATE TABLE IF NOT EXISTS oe_ancillary_contracts (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  service_type        TEXT NOT NULL,              -- fcr | frr_a | frr_m | reserve_5min |
                                                   -- reserve_10min | reserve_30min |
                                                   -- voltage_support | black_start
  capacity_mw         REAL NOT NULL,
  availability_zar_per_mw_per_h REAL,
  utilisation_zar_per_mwh REAL,
  start_at            TEXT NOT NULL,
  end_at              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
                                                  -- pending | active | suspended |
                                                  -- expired | terminated
  performance_score   REAL,                       -- 0..1 rolling SLA
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_anc_part ON oe_ancillary_contracts(participant_id, status);

CREATE TABLE IF NOT EXISTS oe_ancillary_dispatch (
  id              TEXT PRIMARY KEY,
  contract_id     TEXT NOT NULL,
  event_type      TEXT NOT NULL,                  -- activation | test | failure | drill
  triggered_at    TEXT NOT NULL,
  response_time_seconds REAL,
  delivered_mw    REAL,
  contracted_mw   REAL NOT NULL,
  performance_pct REAL,                           -- delivered / contracted
  payment_zar     REAL,
  penalty_zar     REAL DEFAULT 0,
  closed_at       TEXT,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_anc_disp_contract ON oe_ancillary_dispatch(contract_id, triggered_at);

-- Frequency response monitoring (per-second telemetry → 15-min rollup)
CREATE TABLE IF NOT EXISTS oe_frequency_events (
  id                  TEXT PRIMARY KEY,
  detected_at         TEXT NOT NULL,
  duration_seconds    REAL,
  min_frequency_hz    REAL,
  max_deviation_mhz   REAL,                       -- |49.95-50.00|*1000 = 50 mHz
  recovery_seconds    REAL,
  rocof_hz_per_s      REAL,                       -- Rate of change of frequency
  response_participants TEXT,                     -- JSON list of participants who reacted
  classification      TEXT,                       -- under_frequency | over_frequency |
                                                  -- transient | sustained
  severity            TEXT NOT NULL,              -- info | minor | major | critical
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_freq_detect ON oe_frequency_events(detected_at);

-- Wheeling agreements
CREATE TABLE IF NOT EXISTS oe_wheeling_agreements (
  id                  TEXT PRIMARY KEY,
  generator_id        TEXT NOT NULL,
  offtaker_id         TEXT NOT NULL,
  injection_point     TEXT NOT NULL,
  withdrawal_point    TEXT NOT NULL,
  contracted_mw       REAL NOT NULL,
  loss_factor_pct     REAL NOT NULL,
  wheeling_tariff_zar_per_mwh REAL NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
                                                  -- pending | approved | active |
                                                  -- terminated | rejected
  approved_by         TEXT,
  approved_at         TEXT,
  effective_from      TEXT,
  effective_to        TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_wheel_gen ON oe_wheeling_agreements(generator_id, status);
CREATE INDEX IF NOT EXISTS idx_oe_wheel_off ON oe_wheeling_agreements(offtaker_id, status);

-- Curtailment events
CREATE TABLE IF NOT EXISTS oe_curtailment_events (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  asset_id            TEXT,
  curtail_type        TEXT NOT NULL,              -- grid_constraint | over_supply |
                                                  -- market_low_price | regulatory |
                                                  -- safety
  started_at          TEXT NOT NULL,
  ended_at            TEXT,
  curtailed_mwh       REAL,
  pre_curtail_mw      REAL,
  curtail_mw          REAL,
  estimated_loss_zar  REAL,
  compensation_zar    REAL,
  reason              TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_curtail_part ON oe_curtailment_events(participant_id, started_at);

-- Black start capability roster
CREATE TABLE IF NOT EXISTS oe_blackstart_units (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  asset_id            TEXT,
  capacity_mw         REAL NOT NULL,
  startup_minutes     INTEGER NOT NULL,          -- target time from cold to grid
  test_frequency_days INTEGER NOT NULL DEFAULT 90,
  last_tested_at      TEXT,
  test_result         TEXT,                      -- passed | failed | conditional
  status              TEXT NOT NULL DEFAULT 'active',
                                                  -- active | suspended | retired
  payment_zar_per_month REAL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_bs_part ON oe_blackstart_units(participant_id, status);

-- Seed: standard SA grid zones + benchmark constraint
INSERT OR IGNORE INTO oe_grid_constraints (id, zone, constraint_type, limit_mw, direction, source)
VALUES
  ('gc_ehv_cgt',  'EHV-CGT', 'thermal_line', 3500, 'bidirectional', 'Grid Code 5.3.1'),
  ('gc_nw_load',  'NW-Loadcentre', 'voltage', 2000, 'import', 'Grid Code 5.3.1'),
  ('gc_kby_xfmr', 'KBY-Transformer', 'transformer', 800, 'export', 'Grid Code 5.3.1');
