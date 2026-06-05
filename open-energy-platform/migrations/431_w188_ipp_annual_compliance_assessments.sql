-- Migration 431: Wave 188 — IPP Annual Grid Code Compliance Self-Assessment
-- Table: oe_ipp_annual_compliance_assessments
-- 12-state chain covering NERSA Grid Code annual compliance self-assessment lifecycle

CREATE TABLE IF NOT EXISTS oe_ipp_annual_compliance_assessments (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT,
  assessment_year INTEGER NOT NULL,
  plant_name TEXT,
  plant_mw REAL NOT NULL DEFAULT 0,
  grid_connection_voltage_kv REAL DEFAULT 0,
  protection_systems_score REAL DEFAULT 0,
  metering_scada_score REAL DEFAULT 0,
  reactive_power_score REAL DEFAULT 0,
  frequency_response_score REAL DEFAULT 0,
  frt_pq_score REAL DEFAULT 0,
  overall_compliance_score REAL DEFAULT 0,
  deficiency_domains TEXT DEFAULT '[]',
  capacity_tier TEXT NOT NULL DEFAULT 'small',
  chain_status TEXT NOT NULL DEFAULT 'assessment_triggered',
  sla_days INTEGER,
  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  actor_id TEXT,
  actor_party TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_acs_participant ON oe_ipp_annual_compliance_assessments(participant_id);
CREATE INDEX IF NOT EXISTS idx_ipp_acs_status      ON oe_ipp_annual_compliance_assessments(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_acs_sla         ON oe_ipp_annual_compliance_assessments(sla_deadline, sla_breached);

-- ─── Seed: 12 rows — one per chain state ─────────────────────────────────────

-- acs_001 · assessment_triggered · small · 7.2 MW · 22 kV · 2025
INSERT OR IGNORE INTO oe_ipp_annual_compliance_assessments
  (id, participant_id, project_id, assessment_year,
   plant_name, plant_mw, grid_connection_voltage_kv,
   protection_systems_score, metering_scada_score,
   reactive_power_score, frequency_response_score, frt_pq_score,
   overall_compliance_score, deficiency_domains,
   capacity_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('acs_001','part_ipp_demo_001','proj_solar_nc_sml_007',2025,
   'Loeriesfontein Solar Park A', 7.2, 22.0,
   0, 0,
   0, 0, 0,
   0, '[]',
   'small','assessment_triggered',
   30,'2025-03-31',0,
   'act_ipp_dev_001','ipp_developer',
   'Annual Grid Code compliance self-assessment cycle triggered for 2025; plant documentation package requested from site team; NERSA NRS 097 Section 3.2 assessment template distributed');

-- acs_002 · protection_systems_audit · small · 9.5 MW · 22 kV · 2025 · sla_breached=1
INSERT OR IGNORE INTO oe_ipp_annual_compliance_assessments
  (id, participant_id, project_id, assessment_year,
   plant_name, plant_mw, grid_connection_voltage_kv,
   protection_systems_score, metering_scada_score,
   reactive_power_score, frequency_response_score, frt_pq_score,
   overall_compliance_score, deficiency_domains,
   capacity_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('acs_002','part_ipp_demo_001','proj_wind_ec_sml_002',2025,
   'Oyster Bay Wind Farm', 9.5, 22.0,
   78.0, 0,
   0, 0, 0,
   0, '[]',
   'small','protection_systems_audit',
   30,'2025-02-28',1,
   'act_ipp_dev_002','ipp_developer',
   'Protection systems audit in progress; OHL distance protection relay calibration records delayed by OEM service provider; SLA breached; escalation notice issued to site manager');

-- acs_003 · metering_scada_audit · medium · 32 MW · 66 kV · 2025
INSERT OR IGNORE INTO oe_ipp_annual_compliance_assessments
  (id, participant_id, project_id, assessment_year,
   plant_name, plant_mw, grid_connection_voltage_kv,
   protection_systems_score, metering_scada_score,
   reactive_power_score, frequency_response_score, frt_pq_score,
   overall_compliance_score, deficiency_domains,
   capacity_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('acs_003','part_ipp_demo_001','proj_solar_fs_med_003',2025,
   'Muldersvlei Solar Plant', 32.0, 66.0,
   91.5, 0,
   0, 0, 0,
   0, '[]',
   'medium','metering_scada_audit',
   45,'2025-04-15',0,
   'act_ipp_dev_003','ipp_developer',
   'Protection systems audit completed with score 91.5; metering and SCADA audit commenced; NRS 097 Section 5 revenue meter accuracy and SCADA telemetry point list under review with Eskom TSO');

-- acs_004 · reactive_power_audit · medium · 48 MW · 66 kV · 2024
INSERT OR IGNORE INTO oe_ipp_annual_compliance_assessments
  (id, participant_id, project_id, assessment_year,
   plant_name, plant_mw, grid_connection_voltage_kv,
   protection_systems_score, metering_scada_score,
   reactive_power_score, frequency_response_score, frt_pq_score,
   overall_compliance_score, deficiency_domains,
   capacity_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('acs_004','part_ipp_demo_001','proj_wind_wc_med_011',2024,
   'Kogelberg Wind Estate', 48.0, 66.0,
   93.0, 89.5,
   0, 0, 0,
   0, '[]',
   'medium','reactive_power_audit',
   45,'2024-04-15',0,
   'act_ipp_dev_001','ipp_developer',
   'Metering and SCADA audit passed; reactive power capability audit underway; Q-V droop curve measurements and static VAR compensator settings being verified against Grid Code Table 3.3.2 requirements');

-- acs_005 · frequency_response_audit · large · 78 MW · 132 kV · 2025
INSERT OR IGNORE INTO oe_ipp_annual_compliance_assessments
  (id, participant_id, project_id, assessment_year,
   plant_name, plant_mw, grid_connection_voltage_kv,
   protection_systems_score, metering_scada_score,
   reactive_power_score, frequency_response_score, frt_pq_score,
   overall_compliance_score, deficiency_domains,
   capacity_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('acs_005','part_ipp_demo_001','proj_wind_kzn_lrg_005',2025,
   'Richards Bay Wind Hub', 78.0, 132.0,
   94.0, 92.5,
   88.0, 0, 0,
   0, '[]',
   'large','frequency_response_audit',
   60,'2025-05-30',0,
   'act_ipp_dev_004','ipp_developer',
   'Reactive power audit score 88.0 achieved within tolerance; frequency response audit commenced; governor droop settings and ROCOF relay coordination with NTCSA being verified per Grid Code Section 4.4');

-- acs_006 · frt_pq_audit · large · 92 MW · 132 kV · 2024
INSERT OR IGNORE INTO oe_ipp_annual_compliance_assessments
  (id, participant_id, project_id, assessment_year,
   plant_name, plant_mw, grid_connection_voltage_kv,
   protection_systems_score, metering_scada_score,
   reactive_power_score, frequency_response_score, frt_pq_score,
   overall_compliance_score, deficiency_domains,
   capacity_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('acs_006','part_ipp_demo_001','proj_solar_lp_lrg_009',2024,
   'Lephalale Solar Plateau', 92.0, 132.0,
   95.0, 93.0,
   90.5, 87.5, 0,
   0, '[]',
   'large','frt_pq_audit',
   60,'2024-05-30',0,
   'act_ipp_dev_002','ipp_developer',
   'Frequency response audit completed score 87.5; fault ride-through and power quality audit in progress; low-voltage ride-through envelope and harmonic distortion measurements being validated per NRS 097-2-3');

-- acs_007 · internal_technical_review · major · 155 MW · 275 kV · 2025
INSERT OR IGNORE INTO oe_ipp_annual_compliance_assessments
  (id, participant_id, project_id, assessment_year,
   plant_name, plant_mw, grid_connection_voltage_kv,
   protection_systems_score, metering_scada_score,
   reactive_power_score, frequency_response_score, frt_pq_score,
   overall_compliance_score, deficiency_domains,
   capacity_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('acs_007','part_ipp_demo_001','proj_wind_ec_maj_001',2025,
   'Jeffreys Bay Wind Array North', 155.0, 275.0,
   96.0, 94.5,
   91.0, 90.0, 88.5,
   92.0, '[]',
   'major','internal_technical_review',
   90,'2025-07-31',0,
   'act_ipp_dev_005','ipp_developer',
   'All five domain audits completed; internal technical review panel convened; Grid Code compliance report draft being reviewed by Head of Engineering and independent engineer before SO submission');

-- acs_008 · so_submission · major · 195 MW · 275 kV · 2024
INSERT OR IGNORE INTO oe_ipp_annual_compliance_assessments
  (id, participant_id, project_id, assessment_year,
   plant_name, plant_mw, grid_connection_voltage_kv,
   protection_systems_score, metering_scada_score,
   reactive_power_score, frequency_response_score, frt_pq_score,
   overall_compliance_score, deficiency_domains,
   capacity_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('acs_008','part_ipp_demo_001','proj_solar_ga_maj_004',2024,
   'Aggeneys Solar Corridor Phase 2', 195.0, 275.0,
   97.0, 95.0,
   92.5, 91.0, 90.0,
   93.1, '[]',
   'major','so_submission',
   90,'2024-07-31',0,
   'act_ipp_dev_003','ipp_developer',
   'Internal review approved; 2024 annual Grid Code compliance self-assessment report submitted to NTCSA System Operator; reference number SO-GCA-2024-00445 issued; final score 93.1 across all domains');

-- acs_009 · so_review_in_progress · flagship · 280 MW · 275 kV · 2025
INSERT OR IGNORE INTO oe_ipp_annual_compliance_assessments
  (id, participant_id, project_id, assessment_year,
   plant_name, plant_mw, grid_connection_voltage_kv,
   protection_systems_score, metering_scada_score,
   reactive_power_score, frequency_response_score, frt_pq_score,
   overall_compliance_score, deficiency_domains,
   capacity_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('acs_009','part_ipp_demo_001','proj_wind_ec_flg_001',2025,
   'Oyster Bay Flagship Wind Complex', 280.0, 275.0,
   97.5, 96.0,
   93.0, 92.5, 91.0,
   94.0, '[]',
   'flagship','so_review_in_progress',
   120,'2025-09-30',0,
   'act_ipp_dev_005','ipp_developer',
   'NTCSA SO Grid Code compliance review underway; SO technical team conducting independent verification of protection coordination study and FRT test certificates; query raised on harmonic filter sizing documentation');

-- acs_010 · assessment_accepted · flagship · 320 MW · 275 kV · 2024 (terminal positive)
INSERT OR IGNORE INTO oe_ipp_annual_compliance_assessments
  (id, participant_id, project_id, assessment_year,
   plant_name, plant_mw, grid_connection_voltage_kv,
   protection_systems_score, metering_scada_score,
   reactive_power_score, frequency_response_score, frt_pq_score,
   overall_compliance_score, deficiency_domains,
   capacity_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('acs_010','part_ipp_demo_001','proj_solar_wc_flg_002',2024,
   'Saldanha Bay Solar Flagship', 320.0, 275.0,
   98.0, 97.5,
   95.0, 94.5, 93.0,
   95.6, '[]',
   'flagship','assessment_accepted',
   120,'2024-09-30',0,
   'act_ipp_dev_004','ipp_developer',
   'NTCSA SO accepted 2024 annual Grid Code compliance self-assessment; all five technical domains confirmed fully compliant; compliance certificate NERSA-GCC-2024-FLG-00012 issued; valid until 31 December 2025');

-- acs_011 · assessment_deficient · small · 6.5 MW · 22 kV · 2024 (terminal negative)
INSERT OR IGNORE INTO oe_ipp_annual_compliance_assessments
  (id, participant_id, project_id, assessment_year,
   plant_name, plant_mw, grid_connection_voltage_kv,
   protection_systems_score, metering_scada_score,
   reactive_power_score, frequency_response_score, frt_pq_score,
   overall_compliance_score, deficiency_domains,
   capacity_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('acs_011','part_ipp_demo_001','proj_wind_mpu_sml_004',2024,
   'Middelburg Small Wind Farm', 6.5, 22.0,
   85.0, 88.0,
   62.0, 67.5, 70.0,
   74.5, '["reactive_power","frequency_response"]',
   'small','assessment_deficient',
   30,'2024-03-31',1,
   'act_ipp_dev_001','ipp_developer',
   'Assessment returned as deficient; reactive power score 62.0 does not meet Grid Code minimum 80.0 threshold; frequency response score 67.5 below required 75.0 floor; corrective action plan due within 60 days; NERSA notified per ERA Section 35');

-- acs_012 · assessment_lapsed · small · 8.8 MW · 22 kV · 2024 (terminal lapsed)
INSERT OR IGNORE INTO oe_ipp_annual_compliance_assessments
  (id, participant_id, project_id, assessment_year,
   plant_name, plant_mw, grid_connection_voltage_kv,
   protection_systems_score, metering_scada_score,
   reactive_power_score, frequency_response_score, frt_pq_score,
   overall_compliance_score, deficiency_domains,
   capacity_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('acs_012','part_ipp_demo_001','proj_solar_nc_sml_010',2024,
   'Pofadder Solar North', 8.8, 22.0,
   0, 0,
   0, 0, 0,
   0, '[]',
   'small','assessment_lapsed',
   30,'2024-03-31',1,
   'act_ipp_dev_002','ipp_developer',
   'Assessment lapsed without completion; plant placed on extended care-and-maintenance following inverter bank failure in January 2024; NERSA notified of force majeure circumstance; reassessment required upon return to commercial operation');
