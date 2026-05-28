-- Wave 49 — Regulator Initial Licence Application & Adjudication chain.
-- NERSA licensing under the Electricity Regulation Act 4 of 2006 §§8–11: the
-- front-end grant of a NEW licence to operate a generation, transmission,
-- distribution, trading or import/export facility.
--
-- Where W33 renewal renews / amends an EXISTING licence (presuming a holder),
-- THIS chain grants the FIRST one — the entry gate to the regulated market.
-- Pairs with W31 disposition (intake triage), W40 inspection (enforcement) and
-- W43 tariff determination (price control). Initial licensing decides WHO may
-- enter; renewal decides WHO may continue; tariff decides WHAT they charge.
--
-- 12-state P6 lifecycle:
--   application_received → completeness_review → accepted → public_participation
--     → technical_evaluation → council_decision → licence_granted → licence_issued
--   information-gap loop: completeness_review → additional_info_requested → completeness_review
--   refusal:             council_decision → refused
--   early withdraw:      application_received|completeness_review|additional_info_requested|accepted|public_participation → withdrawn
--   lapse:               additional_info_requested → lapsed
--
-- Classes (licence significance — drive SLA windows + reportability):
--   major_licence    — transmission / national / large generation (≥100MW) / import-export; MOST time
--   standard_licence — distribution / trading / mid generation; mid
--   minor_licence    — small-scale generation / SSEG-registration-style; LEAST time
--
-- INVERTED SLA: the bigger the licence, the MORE time every window allows.
--
-- Reportability: refuse crosses for EVERY class (denying market entry — universal,
-- the W49 signature); grant crosses for the major class only (Council oversight +
-- Gazette); sla_breached crosses for material classes (major + standard).
--
-- Two-party write split: the applicant files / supplies info / withdraws; the
-- regulator drives everything else. actor_party
-- (applicant/registry/evaluator/council) records the regulatory function per step.

CREATE TABLE IF NOT EXISTS oe_licence_applications (
  id                            TEXT PRIMARY KEY,
  application_number            TEXT UNIQUE NOT NULL,

  -- Provenance (e.g. a connection agreement or procurement award that triggered it)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (two-party split: applicant + NERSA officer)
  applicant_party_id            TEXT NOT NULL,
  applicant_party_name          TEXT NOT NULL,
  regulator_party_id            TEXT NOT NULL,
  regulator_party_name          TEXT NOT NULL,

  -- Application identity
  licence_class                 TEXT NOT NULL CHECK (licence_class IN (
    'major_licence', 'standard_licence', 'minor_licence'
  )),
  licence_type                  TEXT NOT NULL,     -- generation / transmission / distribution / trading / import_export
  technology                    TEXT,              -- solar_pv / wind / battery / gas / hydro / grid / na
  facility_name                 TEXT NOT NULL,
  facility_location             TEXT,              -- province / municipality
  capacity_mw                   REAL,              -- generation capacity / transfer capacity / notified max demand
  estimated_capex_zar_m         REAL,              -- estimated project capex (R millions)
  grid_connection_ref           TEXT,              -- W28 GCA ref where applicable
  reipppp_round                 TEXT,              -- procurement round where applicable

  -- Refs
  application_ref               TEXT,
  completeness_ref              TEXT,
  info_request_ref              TEXT,
  acceptance_ref                TEXT,
  participation_ref             TEXT,
  evaluation_ref                TEXT,
  council_ref                   TEXT,
  licence_ref                   TEXT,              -- issued licence number
  gazette_ref                   TEXT,              -- Government Gazette notice ref
  regulator_ref                 TEXT,              -- Council oversight / public register ref

  -- Narrative
  application_basis             TEXT,
  completeness_basis            TEXT,
  info_request_basis            TEXT,
  acceptance_basis              TEXT,
  participation_basis           TEXT,
  evaluation_basis              TEXT,
  council_basis                 TEXT,
  grant_basis                   TEXT,
  refusal_basis                 TEXT,
  reason_code                   TEXT,
  rod_notes                     TEXT,              -- record of decision

  info_request_round            INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'application_received','completeness_review','additional_info_requested','accepted',
    'public_participation','technical_evaluation','council_decision','licence_granted',
    'licence_issued','refused','withdrawn','lapsed'
  )),
  application_received_at       TEXT NOT NULL,
  completeness_review_at        TEXT,
  additional_info_requested_at  TEXT,
  accepted_at                   TEXT,
  public_participation_at       TEXT,
  technical_evaluation_at       TEXT,
  council_decision_at           TEXT,
  licence_granted_at            TEXT,
  licence_issued_at             TEXT,
  refused_at                    TEXT,
  withdrawn_at                  TEXT,
  lapsed_at                     TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_lapp_status    ON oe_licence_applications(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_lapp_class     ON oe_licence_applications(licence_class);
CREATE INDEX IF NOT EXISTS idx_oe_lapp_type      ON oe_licence_applications(licence_type);
CREATE INDEX IF NOT EXISTS idx_oe_lapp_applicant ON oe_licence_applications(applicant_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_lapp_received  ON oe_licence_applications(application_received_at);
CREATE INDEX IF NOT EXISTS idx_oe_lapp_sla       ON oe_licence_applications(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_licence_applications_events (
  id                 TEXT PRIMARY KEY,
  application_id     TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_lapp_events_app  ON oe_licence_applications_events(application_id);
CREATE INDEX IF NOT EXISTS idx_oe_lapp_events_type ON oe_licence_applications_events(event_type);
