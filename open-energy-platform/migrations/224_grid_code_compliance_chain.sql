-- Wave 67 — Grid Code Compliance Monitoring & Non-Conformance chain. The System
-- Operator / Transmission System Operator (NTCSA) monitors each connected
-- facility's ongoing TECHNICAL conformance with the SA Grid Code (Network Code +
-- the Grid Connection Code for Renewable Power Plants) and NRS 048-2/4 power
-- quality, and manages a non-conformance through a formal remediation lifecycle.
--
-- Where W28 negotiates the one-time Grid Connection Agreement, W58 queues scarce
-- capacity, W18 coordinates outages, W34 curtails under stress, W50 activates
-- reserves and W13 schedules dispatch, THIS chain governs whether an already-
-- connected plant KEEPS MEETING the technical code once energised — the SO/TSO
-- technical counterpart to the regulator's W40 inspection and W66 complaints.
--
-- 12-state P6 lifecycle (forward path + CAP loop + restriction branch + 3 terminals):
--   monitoring → non_conformance_raised → under_assessment
--     → corrective_action_required → cap_submitted → cap_approved
--     → remediation_in_progress → compliance_retest → compliant_closed
--   CAP revise loop:  cap_submitted → (reject_cap) → corrective_action_required
--   restriction:      {under_assessment, remediation_in_progress, compliance_retest}
--                       → operating_restriction → (begin_remediation) → remediation_in_progress
--   disconnection:    {corrective_action_required, operating_restriction} → disconnection_issued
--   withdrawn:        {non_conformance_raised, under_assessment} → withdrawn
--
-- Tiers (system risk): base from non-compliant capacity MW
--   minor <1 / moderate <10 / material <50 / serious <200 / critical >=200
-- with a breach-class floor (fault_ride_through / frequency_response /
-- protection_coordination floor at serious; reactive_power / voltage_regulation
-- floor at material).
--
-- URGENT SLA: the more severe the tier, the TIGHTER every window (a critical
-- stability breach is assessed and remediated in hours; a minor power-quality
-- drift has weeks). Same flavour as W34 / W50.
--
-- Split write: SO/TSO (operator) drives the machinery; the connected FACILITY
-- submits the corrective-action plan and performs the remediation. actor_party
-- records which side performed each step.
--
-- Reportability (the W67 signature — DISCONNECTION-driven):
--   escalate_disconnection crosses for EVERY tier (disconnecting a connected,
--   licensed facility is always notifiable); impose_restriction + SLA breaches
--   cross for the large tiers (serious + critical).
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/source_wave.

CREATE TABLE IF NOT EXISTS oe_grid_code_compliance (
  id                          TEXT PRIMARY KEY,
  case_number                 TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event                TEXT,
  source_entity_type          TEXT,
  source_entity_id            TEXT,
  source_wave                 TEXT,

  -- Connected facility + connection point
  facility_id                 TEXT NOT NULL,
  facility_name               TEXT NOT NULL,
  connection_point            TEXT,
  network_area                TEXT CHECK (network_area IN (
    'transmission','distribution'
  )),
  licence_ref                 TEXT,
  technology                  TEXT,
  capacity_mw                 REAL,            -- non-compliant capacity at the point

  -- Breach descriptors
  breach_class                TEXT NOT NULL CHECK (breach_class IN (
    'power_quality','telemetry','metering','reactive_power','voltage_regulation',
    'frequency_response','fault_ride_through','protection_coordination'
  )),
  code_reference              TEXT,            -- e.g. Grid Connection Code for RPPs 4.1.3 / NRS 048-2
  parameter                   TEXT,            -- the specific monitored parameter
  measured_value             REAL,
  limit_value                REAL,
  severity_tier               TEXT NOT NULL CHECK (severity_tier IN (
    'minor','moderate','material','serious','critical'
  )),

  -- Parties
  operator_party_id           TEXT,
  operator_party_name         TEXT,
  facility_party_id           TEXT,
  facility_party_name         TEXT,

  -- Refs
  nc_ref                      TEXT,
  assessment_ref              TEXT,
  cap_ref                     TEXT,
  retest_ref                  TEXT,
  restriction_ref             TEXT,
  disconnection_ref           TEXT,

  -- Narrative
  raise_basis                 TEXT,
  assessment_basis            TEXT,
  corrective_action_basis     TEXT,
  cap_basis                   TEXT,
  approval_basis              TEXT,
  remediation_basis           TEXT,
  retest_basis                TEXT,
  restriction_basis           TEXT,
  disconnection_basis         TEXT,
  reason_code                 TEXT,
  compliance_summary          TEXT,

  -- State + lifecycle
  chain_status                TEXT NOT NULL CHECK (chain_status IN (
    'monitoring','non_conformance_raised','under_assessment','corrective_action_required',
    'cap_submitted','cap_approved','remediation_in_progress','compliance_retest',
    'operating_restriction','compliant_closed','disconnection_issued','withdrawn'
  )),
  monitoring_started_at       TEXT NOT NULL,
  non_conformance_raised_at   TEXT,
  under_assessment_at         TEXT,
  corrective_action_required_at TEXT,
  cap_submitted_at            TEXT,
  cap_approved_at             TEXT,
  remediation_started_at      TEXT,
  compliance_retest_at        TEXT,
  operating_restriction_at    TEXT,
  compliant_closed_at         TEXT,
  disconnection_issued_at     TEXT,
  withdrawn_at                TEXT,

  remediation_round           INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at             TEXT,
  last_sla_breach_at          TEXT,
  is_reportable               INTEGER NOT NULL DEFAULT 0,
  escalation_level            INTEGER NOT NULL DEFAULT 0,

  created_by                  TEXT NOT NULL,
  created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_gcc_status   ON oe_grid_code_compliance(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_gcc_tier     ON oe_grid_code_compliance(severity_tier);
CREATE INDEX IF NOT EXISTS idx_oe_gcc_facility ON oe_grid_code_compliance(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_gcc_breach   ON oe_grid_code_compliance(breach_class);
CREATE INDEX IF NOT EXISTS idx_oe_gcc_area     ON oe_grid_code_compliance(network_area);
CREATE INDEX IF NOT EXISTS idx_oe_gcc_sla      ON oe_grid_code_compliance(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_grid_code_compliance_events (
  id              TEXT PRIMARY KEY,
  compliance_id   TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_gcc_events_case ON oe_grid_code_compliance_events(compliance_id);
CREATE INDEX IF NOT EXISTS idx_oe_gcc_events_type ON oe_grid_code_compliance_events(event_type);
