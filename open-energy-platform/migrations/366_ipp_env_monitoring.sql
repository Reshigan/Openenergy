-- Wave 138 — IPP Environmental Monitoring Log
-- NEMA (National Environmental Management Act) s30 + DFFE EIA conditions
-- + ISO 14001:2015 + REIPPPP environmental compliance requirements.
-- Beats Intelex / Cority generic EMS by embedding monitoring results in
-- the project P6 state machine with exceedance detection + regulator notification.
--
-- 12-state lifecycle:
--   scheduled → sampling → sample_submitted → results_received →
--   compliance_assessed → report_drafted → report_submitted → closed (main path)
--   results_received/compliance_assessed → exceedance_flagged → corrective_action → compliance_assessed
--   exceedance_flagged → under_investigation → compliance_assessed
--   scheduled/sampling → cancelled
--
-- URGENT SLA polarity (HOURS) — critical parameters need fastest turnaround:
--   critical: 24h  (URGENT tightest — air quality near sensitive receptor)
--   regular:  72h  (water, groundwater, noise)
--   routine: 168h  (dust, waste, visual)
--   baseline: 720h (annual baseline — loosest)
--
-- W138 SIGNATURE crossings:
--   flag_exceedance → EVERY tier when is_near_sensitive_receptor
--   flag_exceedance → EVERY tier when floor_eia_condition_breach
--   flag_exceedance → EVERY tier when floor_nema_s30_notification
--   submit_report → EVERY tier when floor_dffe_report_required
--   SLA breach crosses when critical + is_near_sensitive_receptor
--   SLA breach crosses when floor_eia_condition_breach

CREATE TABLE IF NOT EXISTS oe_ipp_env_monitoring (
  -- Core
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_name TEXT,
  monitoring_ref TEXT,
  chain_status TEXT NOT NULL DEFAULT 'scheduled',
  monitoring_title TEXT NOT NULL,

  -- Classification
  monitoring_category TEXT,    -- air_quality / water_quality / noise / dust / waste / land / biodiversity / stormwater / groundwater / visual
  monitoring_tier TEXT,        -- critical / regular / routine / baseline (drives URGENT SLA)
  eia_condition_ref TEXT,      -- EIA approval condition number
  sampling_location TEXT,      -- GPS coordinates or site description
  monitoring_frequency TEXT,   -- continuous / daily / weekly / monthly / quarterly / annual

  -- Measurement fields
  parameter_name TEXT,         -- e.g. "PM10", "pH", "Laeq(1h)", "COD"
  measured_value REAL,         -- the measurement result
  measurement_unit TEXT,       -- mg/m³, pH units, dB(A), mg/L etc.
  permit_limit_min REAL,       -- lower limit (optional)
  permit_limit_max REAL,       -- upper limit
  exceedance_magnitude REAL,   -- how far over the limit
  exceedance_pct REAL,         -- percentage over limit

  -- Context
  is_near_sensitive_receptor INTEGER NOT NULL DEFAULT 0, -- school/hospital/community within 500m (SIGNATURE driver)
  lab_accredited INTEGER NOT NULL DEFAULT 0,             -- SANAS-accredited lab used
  lab_name TEXT,
  lab_sample_ref TEXT,
  sampled_at TEXT,             -- ISO timestamp of sampling
  results_received_at TEXT,    -- when lab results came back

  -- Content
  sampling_methodology TEXT,
  findings TEXT,
  exceedance_cause TEXT,
  corrective_actions TEXT,
  corrective_action_deadline TEXT,
  report_title TEXT,
  report_submitted_to TEXT,    -- authority name (DFFE, NEAS, municipality)
  complaint_description TEXT,

  -- Floor flags (5)
  floor_nema_s30_notification INTEGER NOT NULL DEFAULT 0, -- NEMA s30 incident notification required
  floor_dffe_report_required INTEGER NOT NULL DEFAULT 0,  -- Formal DFFE report required
  floor_public_notice_required INTEGER NOT NULL DEFAULT 0, -- Public/community notification required
  floor_lender_report_required INTEGER NOT NULL DEFAULT 0, -- Lender environmental report required
  floor_eia_condition_breach INTEGER NOT NULL DEFAULT 0,   -- EIA condition has been breached

  -- SLA fields
  sla_target_hours INTEGER,
  sla_deadline_at TEXT,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  sla_breach_count INTEGER NOT NULL DEFAULT 0,

  -- Regulator
  is_reportable INTEGER NOT NULL DEFAULT 0,
  regulator_ref TEXT,

  -- Cross-references
  ncr_ref TEXT,
  hse_incident_ref TEXT,
  ms_ref TEXT,
  stage_gate_ref TEXT,

  -- State timestamps (12)
  scheduled_at TEXT,
  sampling_at TEXT,
  sample_submitted_at TEXT,
  compliance_assessed_at TEXT,
  report_drafted_at TEXT,
  report_submitted_at TEXT,
  closed_at TEXT,
  exceedance_flagged_at TEXT,
  corrective_action_at TEXT,
  under_investigation_at TEXT,
  cancelled_at TEXT,

  -- Meta
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Events table
CREATE TABLE IF NOT EXISTS oe_ipp_env_events (
  id TEXT PRIMARY KEY,
  monitoring_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_id TEXT,
  actor_role TEXT,
  notes TEXT,
  regulator_crossed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_oe_ipp_env_monitoring_chain_status ON oe_ipp_env_monitoring(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_env_monitoring_tier ON oe_ipp_env_monitoring(monitoring_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_env_monitoring_category ON oe_ipp_env_monitoring(monitoring_category);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_env_monitoring_project_id ON oe_ipp_env_monitoring(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_env_monitoring_sla_breached ON oe_ipp_env_monitoring(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_env_monitoring_is_reportable ON oe_ipp_env_monitoring(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_env_monitoring_near_receptor ON oe_ipp_env_monitoring(is_near_sensitive_receptor);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_env_monitoring_eia_breach ON oe_ipp_env_monitoring(floor_eia_condition_breach);
