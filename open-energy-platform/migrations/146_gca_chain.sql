-- Wave 28: Grid Connection Agreement (UNGCA) chain — NERSA Grid Code C-1
-- 10-state lifecycle every IPP executes with Eskom Transmission / Distribution
-- before COD (referenced in W20 COD chain energisation gate).
--   application_filed → studies_required → studies_executing →
--   cost_estimate_issued → cost_accepted → connection_agreement_drafted →
--   executed → construction → energised → in_service
-- Terminals: rejected (Eskom denies on grid stability/load), withdrawn (IPP withdraws).
-- Tiers: transmission (>132kV utility) | distribution (33-132kV mid) | embedded (<33kV SSEG)

CREATE TABLE IF NOT EXISTS oe_gca_connections (
  id                              TEXT PRIMARY KEY,
  case_number                     TEXT NOT NULL UNIQUE,
  project_id                      TEXT NOT NULL,
  project_name                    TEXT NOT NULL,
  ipp_party                       TEXT NOT NULL,
  network_party                   TEXT NOT NULL,    -- 'Eskom_Transmission' | 'Eskom_Distribution' | municipal name
  connection_tier                 TEXT NOT NULL,    -- transmission | distribution | embedded
  voltage_kv                      REAL NOT NULL,
  poc_substation                  TEXT NOT NULL,    -- point of connection substation
  capacity_mw                     REAL NOT NULL,
  technology                      TEXT NOT NULL,    -- wind | solar_pv | csp | bess | hybrid
  gia_ref                         TEXT,             -- Eskom GIA / load-flow study ref
  cost_estimate_zar               REAL,
  cost_accepted_zar               REAL,
  ungca_ref                       TEXT,             -- executed UNGCA document ref
  energisation_date_planned       TEXT,
  energisation_date_actual        TEXT,
  rod_reason                      TEXT,             -- rejection reason (denied)
  withdrawal_reason               TEXT,
  regulator_authority             TEXT,             -- 'NERSA' default for transmission
  regulator_ref                   TEXT,             -- NERSA C-1 acknowledgement reference
  chain_status                    TEXT NOT NULL,
  application_filed_at            TEXT NOT NULL,
  studies_required_at             TEXT,
  studies_executing_at            TEXT,
  cost_estimate_issued_at         TEXT,
  cost_accepted_at                TEXT,
  connection_agreement_drafted_at TEXT,
  executed_at                     TEXT,
  construction_at                 TEXT,
  energised_at                    TEXT,
  in_service_at                   TEXT,
  rejected_at                     TEXT,
  withdrawn_at                    TEXT,
  closure_notes                   TEXT,
  sla_deadline_at                 TEXT,
  last_sla_breach_at              TEXT,
  escalation_level                INTEGER NOT NULL DEFAULT 0,
  created_by                      TEXT NOT NULL,
  created_at                      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_gca_status      ON oe_gca_connections(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_gca_tier        ON oe_gca_connections(connection_tier);
CREATE INDEX IF NOT EXISTS idx_oe_gca_project     ON oe_gca_connections(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_gca_network     ON oe_gca_connections(network_party);
CREATE INDEX IF NOT EXISTS idx_oe_gca_substation  ON oe_gca_connections(poc_substation);
CREATE INDEX IF NOT EXISTS idx_oe_gca_sla         ON oe_gca_connections(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_gca_events (
  id           TEXT PRIMARY KEY,
  gca_id       TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  from_status  TEXT,
  to_status    TEXT,
  actor_id     TEXT,
  notes        TEXT,
  payload      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_gca_evt_case ON oe_gca_events(gca_id);
CREATE INDEX IF NOT EXISTS idx_oe_gca_evt_time ON oe_gca_events(created_at);
