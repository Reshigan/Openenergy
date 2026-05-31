-- Wave 130 - NTT Comparison Battery chain.
--
-- PHASE D WAVE 4 OF 4 - CLOSES PHASE D. AGGREGATOR over W127 (anomaly
-- LSTM-AE) + W128 (RUL Cox PH survival) + W129 (fault-fingerprint
-- multi-class) against an emulated NTT IoT/O&M baseline. Each row =
-- one COMPARISON CYCLE (typically nightly). Produces continuously
-- updated, revenue-weighted, statistically significance-gated,
-- tamper-evident "savings-vs-NTT-30%" KPI streaming into the Esums
-- dashboard hero. Closes the [[project_esums_predictive_vs_ntt]]
-- directive.
--
-- Beats: NTT IoT for Energy + NTT GreenOps + NTT "Predictive
-- Maintenance" stack (and the GE APM / IBM Maximo APM / OSIsoft PI AF /
-- Aveva PI Insight benchmarks NTT typically resells). This row is the
-- quantified proof.
--
-- Standards: ISO 42001 AI Management Systems + NIST AI RMF + SOX ML
-- governance + ISO 27001 + SOC 2 Type II + SARS carbon-tax claim
-- integrity + NERSA narrative reporting.
--
-- 12-state forward path + 4 branch states:
--   cycle_proposed -> baselines_synced -> telemetry_window_bound ->
--   ntt_emulation_run -> champion_predictions_collected ->
--   counterfactuals_computed -> revenue_weighted_scored ->
--   significance_tested -> savings_certified -> audit_published ->
--   retraining_triggered -> archived (HARD)
--   any non-terminal -> flag_significance_failure -> significance_failed (SOFT)
--   any non-terminal -> rollback_cycle -> rolled_back (HARD)
--   any non-terminal -> recall_certification -> recalled (HARD - W130 SIGNATURE)
--   live -> activate_failover -> failover_to_prior_cycle (SOFT)
--
-- INVERTED polarity SLA - LARGER fleet scope = MORE review time. Stored
-- as HOURS (single_asset 12h .. fleet_systemic 480h). TIGHTER than
-- W127-W129 because cycles run NIGHTLY and the next cycle must start
-- before this one falls behind.
--
-- SIGNATURE W130 regulator crossings:
--   recall_certification -> EVERY tier (W130 SIGNATURE - sister of
--     W127/W128/W129 rollback hard line; recall = paid out / reported
--     wrong savings, SARS + NERSA + audit committee always notified.)
--   publish_audit -> EVERY tier WHEN regulator_reportable_diversion
--   certify_savings -> multi_jurisdiction_fleet + fleet_systemic WHEN
--     ntt_contract_renegotiation_trigger
--   flag_significance_failure -> fleet_systemic ONLY
--   sla_breached -> HEAVY tiers only
--
-- Write {admin, support}. READ all 9 personas. NO public peer endpoint -
-- INTERNAL ML governance / Esums-team-only.
--
-- 5 bridges: W127 anomaly + W128 RUL + W129 fault fingerprint + W71
-- asset prognostics (CONTROL VARIABLE) + W118 audit chain (tamper-
-- evidence hash - MANDATORY at publish_audit).
--
-- Persisted column budget kept under D1 100-col limit. ~98 persisted
-- cols. Per-cycle JSON payload stored as TEXT JSON column. LIVE 28-field
-- battery decorated at fetch.

CREATE TABLE IF NOT EXISTS oe_ntt_comparison_battery (
  id                                      TEXT PRIMARY KEY,
  cycle_number                            TEXT UNIQUE NOT NULL,
  cycle_kind                              TEXT NOT NULL CHECK (cycle_kind IN (
    'nightly','weekly','monthly','ad_hoc','backfill'
  )),
  cycle_window_start                      TEXT,
  cycle_window_end                        TEXT,
  asset_class                             TEXT NOT NULL CHECK (asset_class IN (
    'wind_turbine','pv_inverter','battery_storage','transformer','transmission_line',
    'substation','hydrogen_electrolyser','grid_scada','smart_meter','generic'
  )),
  assets_covered                          INTEGER,
  jurisdiction_count                      INTEGER,
  safety_critical                         INTEGER NOT NULL DEFAULT 0,
  champion_anomaly_model_version          TEXT,
  champion_rul_model_version              TEXT,
  champion_fault_model_version            TEXT,
  ntt_baseline_version                    TEXT,
  prior_cycle_ref                         TEXT,
  next_cycle_due_at                       TEXT,
  model_card_expiry_at                    TEXT,

  -- 5 cross-chain bridges (W118 MANDATORY at publish_audit;
  -- W127/W128/W129/W71 OPTIONAL per cycle but expected for full battery)
  w127_anomaly_detection_ref              TEXT,
  w128_rul_survival_ref                   TEXT,
  w129_fault_fingerprint_ref              TEXT,
  w71_asset_prognostics_ref               TEXT,
  w118_block_ref                          TEXT,

  -- 5 floor flags (FLOOR-AT-LARGE-FLEET >=1 / FLOOR-AT-FLEET-SYSTEMIC >=3)
  material_savings_threshold_breached     INTEGER NOT NULL DEFAULT 0,
  ntt_contract_renegotiation_trigger      INTEGER NOT NULL DEFAULT 0,
  regulator_reportable_diversion          INTEGER NOT NULL DEFAULT 0,
  sox_ml_governance_required              INTEGER NOT NULL DEFAULT 0,
  iso_42001_required                      INTEGER NOT NULL DEFAULT 0,

  -- Sustained-trigger counters
  consecutive_cycles_above_target         INTEGER NOT NULL DEFAULT 0,
  consecutive_cycles_below_target         INTEGER NOT NULL DEFAULT 0,
  ntt_emulation_payload                   TEXT,
  champion_predictions_payload            TEXT,
  counterfactuals_payload                 TEXT,

  -- 13 comparison metric fields - revenue + savings + significance
  total_savings_zar                       REAL,
  cumulative_savings_zar                  REAL,
  false_positive_savings_zar              REAL,
  false_negative_savings_zar              REAL,
  savings_vs_ntt_pct                      REAL,
  paired_t_pvalue                         REAL,
  wilcoxon_pvalue                         REAL,
  brier_skill_score_vs_ntt                REAL,
  confidence_interval_lower_zar           REAL,
  confidence_interval_upper_zar           REAL,
  confidence_interval_width_zar           REAL,
  reconciliation_with_w71_savings_ledger_pct REAL,
  audit_hash_published                    TEXT,

  -- Governance / performance components (0-130 composite)
  ntt_baseline_comparison_pct             REAL,
  inference_latency_p50_ms                REAL,
  inference_latency_p99_ms                REAL,
  model_card_status                       TEXT CHECK (model_card_status IN (
    'draft','approved','published','expired'
  )),
  iso27001_controls_ok                    INTEGER NOT NULL DEFAULT 0,
  soc2_type2_controls_ok                  INTEGER NOT NULL DEFAULT 0,
  sox_ml_governance_ok                    INTEGER NOT NULL DEFAULT 0,
  iso_42001_compliance_score              INTEGER,
  control_effectiveness_index             INTEGER,

  -- Composite indexes + bands
  current_tier                            TEXT NOT NULL CHECK (current_tier IN (
    'single_asset','small_fleet','large_fleet','multi_jurisdiction_fleet','fleet_systemic'
  )),
  authority_required                      TEXT,
  urgency_band                            TEXT,
  battery_health_band                     TEXT,

  -- Narrative + reason codes
  title                                   TEXT,
  reason_code                             TEXT,

  is_reportable                           INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                      INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                   TEXT,
  regulator_ref                           TEXT,
  regulator_inbox_ref                     TEXT,

  -- 12 forward + 4 branch lifecycle timestamps
  chain_status                            TEXT NOT NULL CHECK (chain_status IN (
    'cycle_proposed','baselines_synced','telemetry_window_bound','ntt_emulation_run',
    'champion_predictions_collected','counterfactuals_computed','revenue_weighted_scored',
    'significance_tested','savings_certified','audit_published','retraining_triggered','archived',
    'significance_failed','rolled_back','recalled','failover_to_prior_cycle'
  )),
  cycle_proposed_at                       TEXT,
  baselines_synced_at                     TEXT,
  telemetry_window_bound_at               TEXT,
  ntt_emulation_run_at                    TEXT,
  champion_predictions_collected_at       TEXT,
  counterfactuals_computed_at             TEXT,
  revenue_weighted_scored_at              TEXT,
  significance_tested_at                  TEXT,
  savings_certified_at                    TEXT,
  audit_published_at                      TEXT,
  retraining_triggered_at                 TEXT,
  archived_at                             TEXT,
  significance_failed_at                  TEXT,
  rolled_back_at                          TEXT,
  recalled_at                             TEXT,
  failover_to_prior_cycle_at              TEXT,

  -- Regulator crossing
  regulator_crossed_at                    TEXT,

  -- SLA (HOURS, INVERTED polarity)
  sla_target_hours                        INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                         TEXT,
  sla_breached                            INTEGER NOT NULL DEFAULT 0,
  last_sla_breach_at                      TEXT,
  escalation_level                        INTEGER NOT NULL DEFAULT 0,
  days_to_next_cycle                      INTEGER,
  days_to_model_card_expiry               INTEGER,

  tenant_id                               TEXT,
  created_by                              TEXT NOT NULL,
  created_at                              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ncb_status         ON oe_ntt_comparison_battery(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_tier           ON oe_ntt_comparison_battery(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_kind           ON oe_ntt_comparison_battery(cycle_kind);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_asset_class    ON oe_ntt_comparison_battery(asset_class);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_breached       ON oe_ntt_comparison_battery(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_created        ON oe_ntt_comparison_battery(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_w118_block     ON oe_ntt_comparison_battery(w118_block_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_w127_ref       ON oe_ntt_comparison_battery(w127_anomaly_detection_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_w128_ref       ON oe_ntt_comparison_battery(w128_rul_survival_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_w129_ref       ON oe_ntt_comparison_battery(w129_fault_fingerprint_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_w71_ref        ON oe_ntt_comparison_battery(w71_asset_prognostics_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_regulator_ref  ON oe_ntt_comparison_battery(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_inbox_ref      ON oe_ntt_comparison_battery(regulator_inbox_ref);

CREATE TABLE IF NOT EXISTS oe_ntt_comparison_battery_events (
  id                  TEXT PRIMARY KEY,
  cycle_id            TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  from_tier           TEXT,
  to_tier             TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ncb_events_cyc  ON oe_ntt_comparison_battery_events(cycle_id);
CREATE INDEX IF NOT EXISTS idx_oe_ncb_events_type ON oe_ntt_comparison_battery_events(event_type);
