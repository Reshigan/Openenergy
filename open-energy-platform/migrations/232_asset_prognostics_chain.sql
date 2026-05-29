-- Wave 71 — Esums Predictive Asset Health & Prognostics (P6)
-- The NTT-beating predictive O&M brain. Sits ABOVE the existing Esums telemetry
-- (om_telemetry / om_devices / om_faults / om_predictions, migration 058):
-- turns telemetry into explainable, revenue-ranked prognostics and runs each one
-- through a 12-state lifecycle from auto-detection to resolution / confirmed
-- failure (closing the loop for false-positive feedback).

CREATE TABLE IF NOT EXISTS oe_asset_prognostics (
  id                            TEXT PRIMARY KEY,
  site_id                       TEXT NOT NULL,
  device_id                     TEXT,
  asset_label                   TEXT,
  technology                    TEXT,                 -- solar | wind | bess | hybrid
  status                        TEXT NOT NULL DEFAULT 'predicted',
  tier                          TEXT NOT NULL DEFAULT 'minor',
  prediction_type               TEXT,                 -- pr_degradation | anomaly | rul | fault_fingerprint
  fault_mode                    TEXT,                 -- engine FaultMode
  fault_mode_confidence         REAL DEFAULT 0,
  safety_implicated             INTEGER NOT NULL DEFAULT 0,
  evidence_json                 TEXT,                 -- JSON array of evidence strings
  health_score                  INTEGER DEFAULT 100,  -- 0-100 composite
  performance_ratio             REAL,                 -- IEC 61724 PR (NULL for non-PV)
  anomaly_score                 REAL DEFAULT 0,       -- 0-1 ensemble severity
  anomaly_confidence            REAL DEFAULT 0,       -- 0-1 method agreement
  methods_triggered_json        TEXT,                 -- JSON array of AnomalyMethod
  degradation_slope_per_day     REAL DEFAULT 0,
  degradation_r_squared         REAL DEFAULT 0,
  degradation_direction         TEXT DEFAULT 'stable',
  rul_days                      INTEGER,              -- remaining useful life
  rul_confidence                REAL DEFAULT 0,
  rul_basis                     TEXT,                 -- trend | stable | already_failed
  lost_kwh_per_day              REAL DEFAULT 0,
  tariff_zar_per_mwh            REAL DEFAULT 0,
  revenue_at_risk_zar           REAL DEFAULT 0,
  reactive_cost_zar             REAL DEFAULT 0,       -- run-to-failure cost
  predictive_cost_zar           REAL DEFAULT 0,       -- planned intervention cost
  savings_zar                   REAL DEFAULT 0,       -- reactive - predictive
  savings_pct                   REAL DEFAULT 0,
  benchmark_savings_zar         REAL DEFAULT 0,       -- what the 30% NTT/industry benchmark would save
  incremental_vs_benchmark_zar  REAL DEFAULT 0,       -- how much MORE than the benchmark
  lead_time_days                INTEGER DEFAULT 0,    -- how early we caught it (RUL at detection)
  predicted_failure_at          TEXT,
  detected_at                   TEXT,
  status_entered_at             TEXT,
  sla_deadline                  TEXT,
  sla_breached                  INTEGER NOT NULL DEFAULT 0,
  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  work_order_id                 TEXT,
  recurrence_count              INTEGER NOT NULL DEFAULT 0,
  assigned_to                   TEXT,
  notes                         TEXT,
  created_at                    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                    TEXT
);

CREATE INDEX IF NOT EXISTS idx_oe_asset_prognostics_status ON oe_asset_prognostics(status);
CREATE INDEX IF NOT EXISTS idx_oe_asset_prognostics_site ON oe_asset_prognostics(site_id);
CREATE INDEX IF NOT EXISTS idx_oe_asset_prognostics_tier ON oe_asset_prognostics(tier);

CREATE TABLE IF NOT EXISTS oe_asset_prognostics_events (
  id                TEXT PRIMARY KEY,
  prognostic_id     TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  actor_id          TEXT,
  actor_party       TEXT,
  from_status       TEXT,
  to_status         TEXT,
  detail            TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_asset_prognostics_events_pid ON oe_asset_prognostics_events(prognostic_id);
