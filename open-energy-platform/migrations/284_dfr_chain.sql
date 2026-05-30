-- Wave 97 — IPP Daily Field Report / Progress Diary (P6). The construction-day
-- record for a best-in-class IPP-PM stack. Beats Procore Daily Log, Aconex
-- Daily Site Diary, Buildertrend, Fieldwire, Raken, PlanGrid Daily Field
-- Report, e-Builder daily logs.
--
-- 12-state P6 lifecycle:
--   drafted -> open -> entries_open -> close_entries -> entries_closed
--     -> submit -> submitted -> start_review -> under_review
--       -> return_for_correction -> returned_for_correction
--         -> correct -> corrected -> submit -> submitted (rejoin)
--       -> approve -> approved
--         -> distribute -> distributed -> archive -> archived (terminal)
--   void     -> voided    (terminal)
--   withdraw -> withdrawn (terminal)
--
-- Tier — RE-DERIVED from priority_class * workflow_class with FLOOR-AT-HIGH
-- for triggers_hse_incident | triggers_change_order | triggers_warranty_claim
-- | contributes_to_evm.
--
-- URGENT SLA polarity (safety = tightest, construction is hours-money).
--
-- SIGNATURE (W97 — OHSA + REIPPPP):
--   submit         -> regulator EVERY tier when triggers_hse_incident
--   approve        -> regulator EVERY tier when triggers_hse_incident
--                                              OR triggers_change_order
--                                                 with high+critical tier
--   void           -> regulator EVERY tier when triggers_hse_incident
--                                              OR triggers_change_order
--   distribute     -> regulator high+critical with triggers_change_order
--   sla_breached   -> regulator high+critical when triggers_hse_incident
--                                              OR triggers_change_order
--
-- Write {admin, ipp, ipp_developer, wind}. Read all 9 personas. actor_party
-- functional (site_supervisor, foreman, coordinator, reviewer,
-- project_manager, owner, independent_engineer, contractor, safety_officer).

CREATE TABLE IF NOT EXISTS oe_dfr (
  id                                  TEXT PRIMARY KEY,
  dfr_number                          TEXT UNIQUE NOT NULL,

  source_event                        TEXT,
  source_entity_type                  TEXT,
  source_entity_id                    TEXT,
  source_wave                         TEXT,

  project_id                          TEXT NOT NULL,
  project_name                        TEXT,
  facility_id                         TEXT,
  facility_name                       TEXT,
  contractor_id                       TEXT,
  contractor_name                     TEXT,
  owner_party_id                      TEXT,
  owner_party_name                    TEXT,

  workflow_class                      TEXT NOT NULL CHECK (workflow_class IN (
    'routine_daily','weather_delay','safety_incident','milestone_handover',
    'equipment_breakdown','low_productivity','executive_visit','near_miss'
  )),
  priority_class                      TEXT NOT NULL CHECK (priority_class IN (
    'critical','high','standard','low'
  )),

  report_date                         TEXT NOT NULL,
  shift                               TEXT,
  site_location                       TEXT,
  weather_summary                     TEXT,
  temperature_low_c                   REAL,
  temperature_high_c                  REAL,
  precipitation_mm                    REAL,
  wind_speed_mps                      REAL,
  lost_time_hours                     REAL,
  weather_delay_minutes               INTEGER,

  manpower_count                      INTEGER NOT NULL DEFAULT 0,
  equipment_count                     INTEGER NOT NULL DEFAULT 0,
  photo_count                         INTEGER NOT NULL DEFAULT 0,
  entries_count                       INTEGER NOT NULL DEFAULT 0,
  weather_log_present                 INTEGER NOT NULL DEFAULT 0,
  safety_log_present                  INTEGER NOT NULL DEFAULT 0,

  current_tier                        TEXT NOT NULL CHECK (current_tier IN (
    'critical','high','standard','low'
  )),
  authority_required                  TEXT CHECK (authority_required IN (
    'site_supervisor','project_engineer','project_manager','project_director'
  )),

  triggers_hse_incident               INTEGER NOT NULL DEFAULT 0,
  triggers_change_order               INTEGER NOT NULL DEFAULT 0,
  triggers_warranty_claim             INTEGER NOT NULL DEFAULT 0,
  contributes_to_evm                  INTEGER NOT NULL DEFAULT 0,

  correction_count                    INTEGER NOT NULL DEFAULT 0,
  rejection_count                     INTEGER NOT NULL DEFAULT 0,

  evm_pv_zar                          REAL,
  evm_ev_zar                          REAL,
  evm_ac_zar                          REAL,

  parent_dfr_id                       TEXT,
  hse_incident_ref                    TEXT,
  change_order_ref                    TEXT,
  warranty_claim_ref                  TEXT,
  regulator_ref                       TEXT,

  title                               TEXT,
  narrative                           TEXT,
  response_text                       TEXT,
  voided_reason                       TEXT,
  withdrawn_reason                    TEXT,
  reason_code                         TEXT,

  current_ball_in_court_party         TEXT,
  last_responder_party                TEXT,
  requester_party                     TEXT,
  approver_party                      TEXT,

  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'drafted','entries_open','entries_closed','submitted','under_review',
    'returned_for_correction','corrected','approved','distributed','archived',
    'voided','withdrawn'
  )),
  drafted_at                          TEXT NOT NULL,
  entries_open_at                     TEXT,
  entries_closed_at                   TEXT,
  submitted_at                        TEXT,
  under_review_at                     TEXT,
  returned_for_correction_at          TEXT,
  corrected_at                        TEXT,
  approved_at                         TEXT,
  distributed_at                      TEXT,
  archived_at                         TEXT,
  voided_at                           TEXT,
  withdrawn_at                        TEXT,

  is_reportable                       INTEGER NOT NULL DEFAULT 0,
  regulator_crossed_at                TEXT,
  regulator_inbox_ref                 TEXT,
  sla_deadline_at                     TEXT,
  last_sla_breach_at                  TEXT,
  escalation_level                    INTEGER NOT NULL DEFAULT 0,

  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_dfr_status     ON oe_dfr(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_dfr_tier       ON oe_dfr(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_dfr_project    ON oe_dfr(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_dfr_facility   ON oe_dfr(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_dfr_class      ON oe_dfr(workflow_class);
CREATE INDEX IF NOT EXISTS idx_oe_dfr_priority   ON oe_dfr(priority_class);
CREATE INDEX IF NOT EXISTS idx_oe_dfr_report_dt  ON oe_dfr(report_date);
CREATE INDEX IF NOT EXISTS idx_oe_dfr_drafted    ON oe_dfr(drafted_at);
CREATE INDEX IF NOT EXISTS idx_oe_dfr_sla        ON oe_dfr(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_dfr_ball       ON oe_dfr(current_ball_in_court_party);
CREATE INDEX IF NOT EXISTS idx_oe_dfr_hse        ON oe_dfr(triggers_hse_incident);

CREATE TABLE IF NOT EXISTS oe_dfr_events (
  id                  TEXT PRIMARY KEY,
  dfr_id              TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_dfr_events_d    ON oe_dfr_events(dfr_id);
CREATE INDEX IF NOT EXISTS idx_oe_dfr_events_type ON oe_dfr_events(event_type);
