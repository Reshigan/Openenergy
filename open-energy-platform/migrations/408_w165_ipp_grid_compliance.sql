-- W165: IPP Grid Code Technical Compliance Self-Assessment
-- Grid code technical compliance self-assessment lifecycle: power quality,
-- protection relay coordination, fault ride-through capability, reactive power
-- capability, frequency response, and earthing/bonding assessments conducted
-- by IPPs under NERSA Grid Code Chapter C requirements, with deficiency
-- tracking and corrective action management through to NERSA sign-off.
--
-- 18 columns:
--   id, participant_id, project_id, compliance_category, assessment_year,
--   capacity_mw, capacity_tier, nersa_reference,
--   chain_status, sla_due_at, sla_breached, submitted_to_nersa_at,
--   deficiency_noted_at, corrective_action_due_at, compliant_at,
--   non_compliant_at, created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_grid_compliance` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  compliance_category TEXT NOT NULL CHECK(compliance_category IN ('power_quality','protection_relay','fault_ride_through','reactive_power','frequency_response','earthing_bonding')),
  assessment_year INTEGER NOT NULL,
  capacity_mw REAL NOT NULL DEFAULT 0,
  capacity_tier TEXT NOT NULL DEFAULT 'small' CHECK(capacity_tier IN ('small','medium','large','utility','strategic')),
  nersa_reference TEXT,
  chain_status TEXT NOT NULL DEFAULT 'assessment_due',
  sla_due_at TEXT NOT NULL,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  submitted_to_nersa_at TEXT,
  deficiency_noted_at TEXT,
  corrective_action_due_at TEXT,
  compliant_at TEXT,
  non_compliant_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_gcc_participant
  ON oe_ipp_grid_compliance(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_gcc_project
  ON oe_ipp_grid_compliance(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_gcc_status
  ON oe_ipp_grid_compliance(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_gcc_sla
  ON oe_ipp_grid_compliance(sla_due_at)
  WHERE sla_breached = 0;

-- 12 seed rows, 18 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:compliance_category  5:assessment_year
--  6:capacity_mw  7:capacity_tier  8:nersa_reference
--  9:chain_status  10:sla_due_at  11:sla_breached  12:submitted_to_nersa_at
--  13:deficiency_noted_at  14:corrective_action_due_at  15:compliant_at
--  16:non_compliant_at  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_grid_compliance VALUES
  (
    'gcc_001',
    'p_ipp_dev_001',
    'proj_reipppp_001',
    'power_quality',
    2025,
    7.5,
    'small',
    NULL,
    'assessment_due',
    datetime('now', '+21 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-05-20T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'gcc_002',
    'p_ipp_dev_001',
    'proj_reipppp_002',
    'protection_relay',
    2024,
    8.2,
    'small',
    NULL,
    'test_preparation',
    datetime('now', '+28 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-04-15T09:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'gcc_003',
    'p_ipp_dev_001',
    'proj_reipppp_003',
    'fault_ride_through',
    2024,
    35.0,
    'medium',
    'GCC/2024/WEC/001',
    'testing_in_progress',
    datetime('now', '+14 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-03-10T08:00:00Z',
    '2026-05-22T10:00:00Z'
  ),
  (
    'gcc_004',
    'p_ipp_dev_001',
    'proj_reipppp_004',
    'reactive_power',
    2023,
    48.5,
    'medium',
    'GCC/2023/SPV/005',
    'test_completed',
    datetime('now', '+30 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-02-18T08:00:00Z',
    '2026-05-10T09:00:00Z'
  ),
  (
    'gcc_005',
    'p_ipp_dev_001',
    'proj_reipppp_005',
    'frequency_response',
    2025,
    120.0,
    'large',
    'GCC/2025/WEC/003',
    'report_drafted',
    datetime('now', '+18 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-03-05T08:00:00Z',
    '2026-04-28T11:00:00Z'
  ),
  (
    'gcc_006',
    'p_ipp_dev_001',
    'proj_reipppp_006',
    'earthing_bonding',
    2023,
    175.0,
    'large',
    'GCC/2023/SPV/009',
    'submitted_to_nersa',
    datetime('now', '+10 days'),
    0,
    '2026-05-18T14:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-01-22T08:00:00Z',
    '2026-05-18T14:00:00Z'
  ),
  (
    'gcc_007',
    'p_ipp_dev_001',
    'proj_reipppp_007',
    'power_quality',
    2024,
    280.0,
    'utility',
    'GCC/2024/SPV/012',
    'nersa_review',
    datetime('now', '+45 days'),
    0,
    '2026-04-30T09:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '2025-12-01T08:00:00Z',
    '2026-04-30T09:00:00Z'
  ),
  (
    'gcc_008',
    'p_ipp_dev_001',
    'proj_reipppp_008',
    'protection_relay',
    2023,
    420.0,
    'utility',
    'GCC/2023/WEC/015',
    'deficiency_noted',
    datetime('now', '-6 days'),
    1,
    '2026-02-14T10:00:00Z',
    '2026-03-01T11:00:00Z',
    '2026-06-01T00:00:00Z',
    NULL,
    NULL,
    '2026-01-10T08:00:00Z',
    '2026-03-01T11:00:00Z'
  ),
  (
    'gcc_009',
    'p_ipp_dev_001',
    'proj_reipppp_009',
    'fault_ride_through',
    2025,
    550.0,
    'strategic',
    'GCC/2025/WEC/002',
    'corrective_action',
    datetime('now', '+35 days'),
    0,
    '2026-03-12T10:00:00Z',
    '2026-04-05T09:00:00Z',
    '2026-07-31T00:00:00Z',
    NULL,
    NULL,
    '2025-08-14T08:00:00Z',
    '2026-04-05T09:00:00Z'
  ),
  (
    'gcc_010',
    'p_ipp_dev_001',
    'proj_reipppp_010',
    'reactive_power',
    2023,
    620.0,
    'strategic',
    'GCC/2023/WEC/018',
    'compliant',
    datetime('now', '+60 days'),
    0,
    '2025-11-20T09:00:00Z',
    NULL,
    NULL,
    '2026-02-14T14:00:00Z',
    NULL,
    '2025-07-10T08:00:00Z',
    '2026-02-14T14:00:00Z'
  ),
  (
    'gcc_011',
    'p_ipp_dev_001',
    'proj_reipppp_011',
    'frequency_response',
    2024,
    42.0,
    'medium',
    'GCC/2024/SPV/007',
    'verification_pending',
    datetime('now', '-8 days'),
    1,
    '2025-10-05T11:00:00Z',
    '2025-12-18T13:00:00Z',
    '2026-03-18T00:00:00Z',
    NULL,
    NULL,
    '2026-04-02T08:00:00Z',
    '2026-04-20T15:00:00Z'
  ),
  (
    'gcc_012',
    'p_ipp_dev_001',
    'proj_reipppp_012',
    'earthing_bonding',
    2023,
    310.0,
    'utility',
    'GCC/2023/SPV/021',
    'non_compliant_notice',
    datetime('now', '+42 days'),
    0,
    '2025-09-18T10:00:00Z',
    '2025-11-10T14:00:00Z',
    '2026-01-10T00:00:00Z',
    NULL,
    '2026-04-28T09:00:00Z',
    '2025-06-05T08:00:00Z',
    '2026-04-28T09:00:00Z'
  );
