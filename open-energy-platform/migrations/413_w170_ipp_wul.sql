-- W170: IPP Water Use License (WUL) Application
-- WUL lifecycle for IPP projects under National Water Act s21 / DWS licensing:
-- wul_application_triggered → site_assessment → application_preparation →
-- application_submitted → dws_completeness_review → public_participation_open →
-- public_participation_closed → technical_assessment → dws_final_review →
-- wul_granted / wul_refused / wul_lapsed.
--
-- 17 columns:
--   id, participant_id, project_id, trigger_category, section21_category,
--   capacity_mw, wul_capacity_tier, dws_reference, water_consultant,
--   chain_status, sla_due_at, sla_breached,
--   application_submitted_at, public_participation_closed_at, wul_decided_at,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_wul_applications` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  trigger_category TEXT NOT NULL CHECK(trigger_category IN ('new_application','renewal','amendment','transfer','rectification')),
  section21_category TEXT NOT NULL CHECK(section21_category IN ('s21_a_diversion','s21_b_storage','s21_c_impeding_flow','s21_g_discharge','s21_h_disposal')),
  capacity_mw REAL NOT NULL DEFAULT 0,
  wul_capacity_tier TEXT NOT NULL DEFAULT 'small' CHECK(wul_capacity_tier IN ('small','medium','large','utility','strategic')),
  dws_reference TEXT,
  water_consultant TEXT,
  chain_status TEXT NOT NULL DEFAULT 'wul_application_triggered',
  sla_due_at TEXT NOT NULL,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  application_submitted_at TEXT,
  public_participation_closed_at TEXT,
  wul_decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_wul_participant
  ON oe_ipp_wul_applications(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_wul_project
  ON oe_ipp_wul_applications(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_wul_status
  ON oe_ipp_wul_applications(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_wul_sla
  ON oe_ipp_wul_applications(sla_due_at)
  WHERE sla_breached = 0;

-- 12 seed rows, 17 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:trigger_category  5:section21_category
--  6:capacity_mw  7:wul_capacity_tier  8:dws_reference  9:water_consultant
--  10:chain_status  11:sla_due_at  12:sla_breached
--  13:application_submitted_at  14:public_participation_closed_at  15:wul_decided_at
--  16:created_at  17:updated_at

INSERT OR IGNORE INTO oe_ipp_wul_applications VALUES
  (
    'wul_001',
    'p_ipp_dev_001',
    'proj_reipppp_001',
    'new_application',
    's21_a_diversion',
    4.5,
    'small',
    NULL,
    NULL,
    'wul_application_triggered',
    datetime('now', '+30 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-05-28T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'wul_002',
    'p_ipp_dev_001',
    'proj_reipppp_002',
    'renewal',
    's21_b_storage',
    6.0,
    'small',
    NULL,
    'Hydrologistics Africa',
    'site_assessment',
    datetime('now', '+45 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-04-20T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'wul_003',
    'p_ipp_dev_001',
    'proj_reipppp_003',
    'amendment',
    's21_c_impeding_flow',
    9.2,
    'small',
    'WUL/2024/S21C/001',
    'SRK Consulting',
    'application_preparation',
    datetime('now', '+60 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-03-12T08:00:00Z',
    '2026-05-18T09:00:00Z'
  ),
  (
    'wul_004',
    'p_ipp_dev_001',
    'proj_reipppp_004',
    'transfer',
    's21_g_discharge',
    18.0,
    'medium',
    'WUL/2024/S21G/001',
    'Zutari',
    'application_submitted',
    datetime('now', '+50 days'),
    0,
    '2026-04-22T10:00:00Z',
    NULL,
    NULL,
    '2026-02-05T08:00:00Z',
    '2026-04-22T10:00:00Z'
  ),
  (
    'wul_005',
    'p_ipp_dev_001',
    'proj_reipppp_005',
    'rectification',
    's21_h_disposal',
    35.0,
    'medium',
    'WUL/2024/S21H/001',
    'Aurecon',
    'dws_completeness_review',
    datetime('now', '+35 days'),
    0,
    '2026-03-10T11:00:00Z',
    NULL,
    NULL,
    '2026-01-18T08:00:00Z',
    '2026-03-10T11:00:00Z'
  ),
  (
    'wul_006',
    'p_ipp_dev_001',
    'proj_reipppp_006',
    'new_application',
    's21_a_diversion',
    45.0,
    'medium',
    'WUL/2025/S21A/001',
    'WSP Global',
    'public_participation_open',
    datetime('now', '+21 days'),
    0,
    '2026-02-25T09:00:00Z',
    NULL,
    NULL,
    '2025-12-02T08:00:00Z',
    '2026-02-25T09:00:00Z'
  ),
  (
    'wul_007',
    'p_ipp_dev_001',
    'proj_reipppp_007',
    'renewal',
    's21_b_storage',
    80.0,
    'large',
    'WUL/2025/S21B/002',
    'AECOM',
    'public_participation_closed',
    datetime('now', '+28 days'),
    0,
    '2025-11-08T10:00:00Z',
    '2026-03-12T17:00:00Z',
    NULL,
    '2025-08-10T08:00:00Z',
    '2026-03-12T17:00:00Z'
  ),
  (
    'wul_008',
    'p_ipp_dev_001',
    'proj_reipppp_008',
    'amendment',
    's21_c_impeding_flow',
    140.0,
    'large',
    'WUL/2025/S21C/002',
    'GCS Environmental',
    'technical_assessment',
    datetime('now', '+14 days'),
    0,
    '2025-10-20T11:00:00Z',
    '2026-01-28T17:00:00Z',
    NULL,
    '2025-06-15T08:00:00Z',
    '2026-01-28T17:00:00Z'
  ),
  (
    'wul_009',
    'p_ipp_dev_001',
    'proj_reipppp_009',
    'transfer',
    's21_g_discharge',
    175.0,
    'large',
    'WUL/2025/S21G/002',
    'SRK Consulting',
    'dws_final_review',
    datetime('now', '+7 days'),
    0,
    '2025-09-02T09:00:00Z',
    '2025-12-15T17:00:00Z',
    NULL,
    '2025-04-10T08:00:00Z',
    '2025-12-15T17:00:00Z'
  ),
  (
    'wul_010',
    'p_ipp_dev_001',
    'proj_reipppp_010',
    'rectification',
    's21_h_disposal',
    260.0,
    'utility',
    'WUL/2024/S21H/002',
    'Hydrologistics Africa',
    'wul_granted',
    datetime('now', '+90 days'),
    0,
    '2025-05-18T10:00:00Z',
    '2025-08-12T17:00:00Z',
    '2026-01-20T15:00:00Z',
    '2025-02-08T08:00:00Z',
    '2026-01-20T15:00:00Z'
  ),
  (
    'wul_011',
    'p_ipp_dev_001',
    'proj_reipppp_011',
    'new_application',
    's21_a_diversion',
    380.0,
    'utility',
    'WUL/2024/S21A/002',
    'Aurecon',
    'wul_refused',
    datetime('now', '-8 days'),
    1,
    '2025-03-10T11:00:00Z',
    '2025-07-08T17:00:00Z',
    '2026-04-15T09:00:00Z',
    '2024-11-02T08:00:00Z',
    '2026-04-15T09:00:00Z'
  ),
  (
    'wul_012',
    'p_ipp_dev_001',
    'proj_reipppp_012',
    'renewal',
    's21_b_storage',
    720.0,
    'strategic',
    'WUL/2025/S21B/003',
    'Zutari',
    'wul_lapsed',
    datetime('now', '+60 days'),
    0,
    '2025-07-05T09:00:00Z',
    '2025-10-20T17:00:00Z',
    '2026-03-02T14:00:00Z',
    '2025-04-25T08:00:00Z',
    '2026-03-02T14:00:00Z'
  );
