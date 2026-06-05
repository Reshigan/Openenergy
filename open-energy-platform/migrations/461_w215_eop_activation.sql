-- W215: Grid Emergency Operations Plan (EOP) Activation & Post-Event Review
-- NERSA Grid Code §G.4 + NTCSA SOC Emergency Procedures + NRS 048-2
CREATE TABLE IF NOT EXISTS oe_eop_activations (
  id                        TEXT PRIMARY KEY,
  participant_id            TEXT NOT NULL,   -- grid operator / SO

  -- Event classification
  eop_tier                  TEXT NOT NULL CHECK(eop_tier IN (
    'n1_minor','n1_significant','n2_double','black_start'
  )),
  contingency_type          TEXT CHECK(contingency_type IN (
    'line_trip','generator_trip','transformer_fault','busbar_fault',
    'under_frequency','voltage_collapse','protection_failure','external','other',NULL
  )),
  contingency_description   TEXT NOT NULL,
  affected_mw               REAL,            -- MW affected / load shed
  affected_region           TEXT,            -- geographic region
  load_shedding_stage       INTEGER,         -- Eskom stage 1–8 if applicable

  -- Event timeline
  contingency_at            TEXT NOT NULL,   -- when fault/event occurred
  eop_activated_at          TEXT,
  operations_centre_alerted_at TEXT,
  load_shedding_started_at  TEXT,
  restoration_started_at    TEXT,
  normal_ops_restored_at    TEXT,
  total_outage_duration_min INTEGER,         -- minutes

  -- Post-Event Review
  per_initiated_at          TEXT,
  per_completed_at          TEXT,
  per_lead_name             TEXT,
  root_cause                TEXT,
  contributing_factors      TEXT,
  lessons_learned           TEXT,
  action_items              TEXT,            -- JSON array of follow-up items

  -- Escalation
  nersa_notification_ref    TEXT,
  escalation_reason         TEXT,

  -- NTCSA / SO references
  ntcsa_incident_ref        TEXT,
  so_incident_ref           TEXT,
  protection_relay_refs     TEXT,            -- CSV of relay references triggered

  chain_status              TEXT NOT NULL DEFAULT 'contingency_detected' CHECK(chain_status IN (
    'contingency_detected','eop_activated','operations_centre_alerted',
    'load_shedding_assessed','restoration_in_progress','normal_operations_restored',
    'post_event_review','per_completed','per_outstanding','escalated_to_regulator','withdrawn'
  )),
  sla_deadline              TEXT NOT NULL,
  sla_breached              INTEGER NOT NULL DEFAULT 0,
  regulator_notified        INTEGER NOT NULL DEFAULT 0,

  actor_id                  TEXT,
  reason                    TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eop_status
  ON oe_eop_activations(chain_status);

CREATE INDEX IF NOT EXISTS idx_eop_participant
  ON oe_eop_activations(participant_id);

CREATE INDEX IF NOT EXISTS idx_eop_contingency
  ON oe_eop_activations(contingency_at);
