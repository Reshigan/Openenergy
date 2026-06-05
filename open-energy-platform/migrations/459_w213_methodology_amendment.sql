-- W213: Carbon Project Methodology Deviation & Amendment
-- Verra VCS/VM0038 + Gold Standard Protocol Amendment + Article 6.4 ERD
CREATE TABLE IF NOT EXISTS oe_methodology_amendments (
  id                       TEXT PRIMARY KEY,
  participant_id           TEXT NOT NULL,   -- carbon fund / project developer

  -- Project references
  project_ref              TEXT,            -- link to W37 carbon project registration
  crediting_period_ref     TEXT,            -- link to W56 crediting period renewal
  methodology_id           TEXT NOT NULL,   -- e.g. VM0038, AMS-I.D., GS-SSC-EE
  methodology_version      TEXT,            -- version in use at time of deviation

  -- Deviation details
  amendment_tier           TEXT NOT NULL CHECK(amendment_tier IN (
    'minor_parameter','moderate_change','major_change','article6_itmo'
  )),
  deviation_type           TEXT CHECK(deviation_type IN (
    'emission_factor','additionality_condition','technology_change',
    'monitoring_parameter','baseline_revision','geographic_boundary',NULL
  )),
  deviation_description    TEXT NOT NULL,
  deviation_discovered_at  TEXT,
  estimated_impact_tco2e   REAL,           -- estimated change in ERs due to deviation

  -- Materiality
  materiality_rationale    TEXT,
  is_material              INTEGER,         -- 0/1 determined at materiality_assessment

  -- Amendment details
  amendment_description    TEXT,
  new_methodology_version  TEXT,
  amendment_submitted_at   TEXT,

  -- DNA / Article 6
  dna_name                 TEXT,            -- designated national authority
  dna_notification_ref     TEXT,
  dna_notified_at          TEXT,

  -- Validator
  validator_name           TEXT,
  validator_ref            TEXT,
  revalidation_started_at  TEXT,
  revalidation_completed_at TEXT,
  validator_findings       TEXT,

  -- Outcome
  approved_at              TEXT,
  rejected_at              TEXT,
  rejection_reason         TEXT,

  chain_status             TEXT NOT NULL DEFAULT 'deviation_identified' CHECK(chain_status IN (
    'deviation_identified','materiality_assessment','minor_deviation','major_deviation',
    'methodology_update','dna_notified','validator_assigned','revalidation',
    'amendment_approved','amendment_rejected','withdrawn'
  )),
  sla_deadline             TEXT NOT NULL,
  sla_breached             INTEGER NOT NULL DEFAULT 0,
  regulator_notified       INTEGER NOT NULL DEFAULT 0,

  actor_id                 TEXT,
  reason                   TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ma_status
  ON oe_methodology_amendments(chain_status);

CREATE INDEX IF NOT EXISTS idx_ma_participant
  ON oe_methodology_amendments(participant_id);

CREATE INDEX IF NOT EXISTS idx_ma_project
  ON oe_methodology_amendments(project_ref);
