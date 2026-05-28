-- Wave 55 — OEM-Support Firmware / Security-Patch & Vulnerability Remediation chain.
-- IEC 62443-2-3 (patch management for IACS / OT environments) + 62443-3-3 +
-- ISO/IEC 27001:2022 A.8.8 / A.8.28 + ITIL 4 Information Security Management +
-- Cybercrimes Act 19/2020 + POPIA + NERSA Grid Code (grid-connected firmware).
--
-- The fourth ITIL service-management chain on the OEM-Support profile, alongside
-- W14 support-ticket (incident), W41 problem-management (root-cause) and W47
-- change-enablement (authorise a change). This chain drives an OEM/CERT
-- vulnerability or firmware advisory through a remediation campaign across the
-- affected deployed-asset fleet of OT configuration items (inverters, SCADA, BMS,
-- controllers). Distinct from W47: change-enablement AUTHORISES a proposed
-- change; this is the security-driven remediation of a KNOWN vulnerability.
--
-- 12-state P6 lifecycle:
--   advisory_received → triaged → impact_assessment → fleet_scoped
--     → remediation_approved → rollout_in_progress → verification → resolved
--   mitigation/containment: impact_assessment → mitigation_applied → fleet_scoped
--   emergency fast-path:    triaged → remediation_approved (emergency_authorize)
--   not-affected exit:      triaged → not_affected
--   risk acceptance:        impact_assessment | mitigation_applied | fleet_scoped → risk_accepted
--   backout:                rollout_in_progress | verification → rolled_back
--
-- CVSS severity tiers (drive the URGENT SLA + reportability):
--   critical (9.0-10.0) / high (7.0-8.9) / medium (4.0-6.9) / low (0.1-3.9) /
--   informational (0.0)
--
-- URGENT SLA: the higher the CVSS severity, the TIGHTER every window.
--
-- Reportability (the W55 signature): accept_risk crosses the regulator for
-- critical + high (formally accepting an UNPATCHED serious vulnerability on the
-- regulated OT estate is a reportable security-posture exception); roll_back
-- crosses for critical + high (remediation-induced failure on regulated
-- equipment); sla_breached crosses for critical only.
--
-- Single-party write {admin, support} (same as W41 / W47). actor_party records
-- the security function per step (security_analyst / security_authority /
-- remediation_engineer) for audit attribution, NOT an access-control split.

CREATE TABLE IF NOT EXISTS oe_security_remediations (
  id                            TEXT PRIMARY KEY,
  remediation_number            TEXT UNIQUE NOT NULL,

  -- Provenance (advisory / pipeline source)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Advisory identity
  advisory_ref                  TEXT,              -- OEM / CERT advisory reference
  advisory_source               TEXT,              -- oem / ics_cert / vendor_psirt / nvd
  cve_id                        TEXT,              -- CVE identifier
  cvss_score                    REAL,              -- CVSS v3.1 base score (drives the tier)
  cvss_vector                   TEXT,              -- CVSS v3.1 vector string
  severity_tier                 TEXT NOT NULL CHECK (severity_tier IN (
    'critical','high','medium','low','informational'
  )),

  -- OEM / product
  oem_vendor                    TEXT,              -- equipment OEM / vendor
  product_family                TEXT,              -- inverter / scada / bms / controller family
  ci_type                       TEXT,              -- inverter / scada / bms / plc / rtu / gateway
  affected_versions             TEXT,              -- vulnerable firmware versions
  fixed_version                 TEXT,              -- firmware version that remediates
  patch_package_ref             TEXT,              -- patch / firmware package reference
  backout_plan_ref              TEXT,              -- documented backout procedure

  -- Fleet scope
  affected_ci_count             INTEGER NOT NULL DEFAULT 0,   -- deployed CIs in scope
  patched_ci_count              INTEGER NOT NULL DEFAULT 0,   -- CIs successfully patched
  sites_affected                INTEGER NOT NULL DEFAULT 0,
  fleet_scope                   TEXT,              -- narrative of the affected fleet
  project_id                    TEXT,
  project_name                  TEXT,
  sector                        TEXT,              -- solar_pv / wind / bess / chp / hydro

  -- Mitigation / containment
  mitigation_type               TEXT,              -- segmentation / firewall_rule / disable_port / acl
  compensating_control          TEXT,
  residual_risk_basis           TEXT,              -- basis for a formal risk acceptance

  -- Refs (per stage)
  triage_ref                    TEXT,
  assessment_ref                TEXT,
  mitigation_ref                TEXT,
  approval_ref                  TEXT,
  rollout_ref                   TEXT,
  verification_ref              TEXT,
  resolution_ref                TEXT,
  risk_acceptance_ref           TEXT,
  backout_ref                   TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  triage_basis                  TEXT,
  assessment_basis              TEXT,
  mitigation_basis              TEXT,
  approval_basis                TEXT,
  rollout_basis                 TEXT,
  verification_basis            TEXT,
  resolution_basis              TEXT,
  risk_acceptance_basis         TEXT,
  backout_basis                 TEXT,
  reason_code                   TEXT,
  decision_notes                TEXT,
  notes                         TEXT,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'advisory_received','triaged','impact_assessment','mitigation_applied',
    'fleet_scoped','remediation_approved','rollout_in_progress','verification',
    'resolved','not_affected','risk_accepted','rolled_back'
  )),
  advisory_received_at          TEXT NOT NULL,
  triaged_at                    TEXT,
  impact_assessment_at          TEXT,
  mitigation_applied_at         TEXT,
  fleet_scoped_at               TEXT,
  remediation_approved_at       TEXT,
  rollout_in_progress_at        TEXT,
  verification_at               TEXT,
  resolved_at                   TEXT,
  not_affected_at               TEXT,
  risk_accepted_at              TEXT,
  rolled_back_at                TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_srm_status   ON oe_security_remediations(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_srm_tier     ON oe_security_remediations(severity_tier);
CREATE INDEX IF NOT EXISTS idx_oe_srm_cve      ON oe_security_remediations(cve_id);
CREATE INDEX IF NOT EXISTS idx_oe_srm_received ON oe_security_remediations(advisory_received_at);
CREATE INDEX IF NOT EXISTS idx_oe_srm_sla      ON oe_security_remediations(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_security_remediations_events (
  id                 TEXT PRIMARY KEY,
  remediation_id     TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_srm_events_rem  ON oe_security_remediations_events(remediation_id);
CREATE INDEX IF NOT EXISTS idx_oe_srm_events_type ON oe_security_remediations_events(event_type);
