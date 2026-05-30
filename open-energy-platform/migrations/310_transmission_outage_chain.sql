-- Wave 110 - Grid Transmission Network Outage Coordination & N-1 Security
-- Assessment chain.
-- 11th Grid chain. SO-initiated EHV / HV transmission line + substation
-- outage windows with N-1 contingency security assessment + reliability-
-- committee approval + real-time supervision + return-to-service
-- verification. Distinct from W18 (asset-owner-driven planned outage on
-- IPP generators).
--
-- Beats Hitachi Energy Lumada / ABB Network Manager / Siemens Spectrum /
-- GE PowerOn / OSI monarch / OATI WebTrans / Eskom NCC / PowerWorld /
-- Schneider EcoStruxure ADMS. Each surfaces TX outage planning as a
-- calendar + a CSV of affected feeders; W110 turns it into a 12-state P6
-- chain with URGENT SLA polarity, FLOOR-AT-HIGH tier overlay, 4-step
-- authority ladder, 16-field LIVE battery, 3-bridge architecture to
-- W18 / W34 / W50, and signature regulator crossings.
--
-- Standards: NERSA Grid Code C-3 + NTCSA Outage Coordination Process +
-- Eskom System Operator Standards + ENTSO-E SO Reg 2017/1485 equivalent.
--
-- 12-state P6 lifecycle plus 5 terminal / loop branches:
--   outage_requested -> start_security_assessment -> security_assessment
--     -> run_n1_contingency -> n1_contingency_run
--       -> submit_to_reliability_committee -> reliability_committee_review
--         -> approve_outage -> outage_approved
--           -> open_outage_window -> outage_window_open
--             -> commence_outage -> outage_in_progress
--               -> complete_outage -> outage_completed
--                 -> verify_return_to_service -> return_to_service
--                   -> close_post_outage_review -> post_outage_review
--                     -> archive_outage -> archived (HARD terminal)
--   any pre-commencement -> reject_outage -> rejected (terminal)
--   any pre-approval     -> withdraw -> withdrawn (terminal)
--   outage_in_progress   -> suspend_outage -> suspended
--   suspended            -> resume_outage -> outage_in_progress
--   suspended            -> emergency_cancel -> emergency_cancelled
--   outage_in_progress   -> extend_outage -> extended -> resume_outage
--                              -> outage_in_progress
--   any non-terminal     -> emergency_cancel -> emergency_cancelled
--                              (terminal - W110 SIGNATURE)
--
-- Tier RE-DERIVED on every transition from transmission_voltage_kv:
--   low_sub132kv      : <132 kV
--   medium_132kv      : 132 kV
--   high_275kv        : 275 kV
--   critical_400kv_plus: >=400 kV
-- FLOOR-AT-HIGH on any one of 5 floor flags.
-- FLOOR-AT-CRITICAL on 2+ floor flags OR national_grid_backbone OR
-- black_start_path.
--
-- URGENT SLA polarity stored as HOURS (multi-day chain).
-- critical_400kv_plus gets SHORTEST runway. outage_requested window:
--   low_sub132kv         336h / medium_132kv 168h /
--   high_275kv            72h / critical_400kv_plus 24h
--
-- SIGNATURE regulator crossings (NERSA Grid Code C-3 + SO standards):
--   emergency_cancel    -> regulator EVERY tier (W110 SIGNATURE)
--   extend_outage       -> regulator high_275kv + critical_400kv_plus
--   approve_outage      -> regulator critical_400kv_plus only when
--                            national_grid_backbone
--   suspend_outage      -> regulator high_275kv + critical_400kv_plus
--   sla_breached        -> high_275kv + critical_400kv_plus
--
-- Write {admin, grid_operator}. Read all 9 personas. actor_party split:
--   outage_planner:       request_outage, start_security_assessment,
--                         withdraw
--   system_operator:      run_n1_contingency, open_outage_window,
--                         commence_outage, suspend_outage, resume_outage,
--                         emergency_cancel, complete_outage,
--                         verify_return_to_service
--   reliability_committee:submit_to_reliability_committee, approve_outage,
--                         reject_outage, extend_outage
--   archive_clerk:        close_post_outage_review, archive_outage

CREATE TABLE IF NOT EXISTS oe_transmission_outage (
  id                                          TEXT PRIMARY KEY,
  outage_number                               TEXT UNIQUE NOT NULL,

  -- Asset + corridor refs
  asset_id                                    TEXT NOT NULL,
  asset_label                                 TEXT,
  transmission_voltage_kv                     REAL NOT NULL DEFAULT 0,
  corridor_name                               TEXT,
  substation_a                                TEXT,
  substation_b                                TEXT,
  affected_circuits_count                     INTEGER NOT NULL DEFAULT 0,

  -- Cross-chain bridges (W18 / W34 / W50)
  planned_outage_ref                          TEXT,
  curtailment_ref                             TEXT,
  reserve_activation_ref                      TEXT,

  -- Outage spec
  outage_type                                 TEXT,
  outage_reason                               TEXT,
  scheduled_start_at                          TEXT,
  scheduled_end_at                            TEXT,
  actual_start_at                             TEXT,
  actual_end_at                               TEXT,

  -- N-1 contingency results
  n1_pass_count                               INTEGER NOT NULL DEFAULT 0,
  n1_fail_count                               INTEGER NOT NULL DEFAULT 0,
  n1_summary                                  TEXT,
  security_margin_pct                         REAL NOT NULL DEFAULT 100,
  thermal_limit_mw                            REAL,
  actual_load_mw                              REAL,
  rts_test_passed                             INTEGER NOT NULL DEFAULT 0,
  extension_requested                         INTEGER NOT NULL DEFAULT 0,
  extension_hours_granted                     INTEGER NOT NULL DEFAULT 0,
  suspension_count                            INTEGER NOT NULL DEFAULT 0,

  -- 5 floor flags
  peak_demand_period                          INTEGER NOT NULL DEFAULT 0,
  single_circuit_radial                       INTEGER NOT NULL DEFAULT 0,
  cross_border_interconnector                 INTEGER NOT NULL DEFAULT 0,
  black_start_path                            INTEGER NOT NULL DEFAULT 0,
  national_grid_backbone                      INTEGER NOT NULL DEFAULT 0,

  -- Tier + authority + completeness battery
  current_tier                                TEXT NOT NULL CHECK (current_tier IN (
    'low_sub132kv','medium_132kv','high_275kv','critical_400kv_plus'
  )),
  authority_required                          TEXT CHECK (authority_required IN (
    'outage_planner','system_operator','reliability_committee_chair','SO_CEO'
  )),
  urgency_band                                TEXT,
  outage_completeness_index                   INTEGER NOT NULL DEFAULT 0,

  -- Narrative
  title                                       TEXT,
  narrative                                   TEXT,
  reason_code                                 TEXT,
  reject_reason                               TEXT,
  withdraw_reason                             TEXT,
  emergency_cancel_reason                     TEXT,
  suspend_reason                              TEXT,

  current_ball_in_court_party                 TEXT,
  last_responder_party                        TEXT,

  is_reportable                               INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                          INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                       TEXT,

  -- 11 lifecycle state timestamps + 4 branch timestamps
  chain_status                                TEXT NOT NULL CHECK (chain_status IN (
    'outage_requested','security_assessment','n1_contingency_run',
    'reliability_committee_review','outage_approved','outage_window_open',
    'outage_in_progress','outage_completed','return_to_service',
    'post_outage_review','archived',
    'rejected','withdrawn','suspended','emergency_cancelled','extended'
  )),
  outage_requested_at                         TEXT,
  security_assessment_at                      TEXT,
  n1_contingency_run_at                       TEXT,
  reliability_committee_review_at             TEXT,
  outage_approved_at                          TEXT,
  outage_window_open_at                       TEXT,
  outage_in_progress_at                       TEXT,
  outage_completed_at                         TEXT,
  return_to_service_at                        TEXT,
  post_outage_review_at                       TEXT,
  archived_at                                 TEXT,
  rejected_at                                 TEXT,
  withdrawn_at                                TEXT,
  suspended_at                                TEXT,
  emergency_cancelled_at                      TEXT,
  extended_at                                 TEXT,

  -- Regulator crossing
  regulator_crossed_at                        TEXT,
  regulator_inbox_ref                         TEXT,
  regulator_ref                               TEXT,

  -- SLA
  sla_target_hours                            INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                             TEXT,
  last_sla_breach_at                          TEXT,
  sla_breached                                INTEGER NOT NULL DEFAULT 0,
  escalation_level                            INTEGER NOT NULL DEFAULT 0,

  tenant_id                                   TEXT,
  created_by                                  TEXT NOT NULL,
  created_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_txo_status        ON oe_transmission_outage(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_txo_tier          ON oe_transmission_outage(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_txo_tenant        ON oe_transmission_outage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_txo_asset         ON oe_transmission_outage(asset_id);
CREATE INDEX IF NOT EXISTS idx_oe_txo_corridor      ON oe_transmission_outage(corridor_name);
CREATE INDEX IF NOT EXISTS idx_oe_txo_sla           ON oe_transmission_outage(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_txo_breached      ON oe_transmission_outage(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_txo_reportable    ON oe_transmission_outage(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_txo_window        ON oe_transmission_outage(scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_oe_txo_voltage       ON oe_transmission_outage(transmission_voltage_kv);

CREATE TABLE IF NOT EXISTS oe_transmission_outage_events (
  id                  TEXT PRIMARY KEY,
  outage_id           TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_txo_events_oid    ON oe_transmission_outage_events(outage_id);
CREATE INDEX IF NOT EXISTS idx_oe_txo_events_type   ON oe_transmission_outage_events(event_type);
