-- W171: IPP Heritage Resources Assessment (HRA)
-- HRA lifecycle for IPP projects under NHRA Act 25/1999 / SAHRA permitting:
-- hra_triggered → desktop_study → field_survey → hra_report_preparation →
-- hra_submitted → sahra_review → public_participation → specialist_assessment →
-- final_review → hra_approved / hra_refused / heritage_watchlist.
--
-- 17 columns:
--   id, participant_id, project_id, trigger_category, hra_category,
--   capacity_mw, hra_capacity_tier, sahra_reference, heritage_consultant,
--   chain_status, sla_due_at, sla_breached,
--   hra_submitted_at, public_participation_closed_at, hra_decided_at,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_hra_assessments` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  trigger_category TEXT NOT NULL CHECK(trigger_category IN ('new_development','scope_change','layout_modification','access_road','substation_addition','transmission_line')),
  hra_category TEXT NOT NULL CHECK(hra_category IN ('phase_1_desktop','phase_2_field','phase_3_excavation','heritage_impact','mitigation_plan')),
  capacity_mw REAL NOT NULL DEFAULT 0,
  hra_capacity_tier TEXT NOT NULL DEFAULT 'small' CHECK(hra_capacity_tier IN ('small','medium','large','utility','strategic')),
  sahra_reference TEXT,
  heritage_consultant TEXT,
  chain_status TEXT NOT NULL DEFAULT 'hra_triggered',
  sla_due_at TEXT NOT NULL,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  hra_submitted_at TEXT,
  public_participation_closed_at TEXT,
  hra_decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_hra_participant
  ON oe_ipp_hra_assessments(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_hra_project
  ON oe_ipp_hra_assessments(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_hra_status
  ON oe_ipp_hra_assessments(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_hra_sla
  ON oe_ipp_hra_assessments(sla_due_at)
  WHERE sla_breached = 0;

-- 12 seed rows, 17 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:trigger_category  5:hra_category
--  6:capacity_mw  7:hra_capacity_tier  8:sahra_reference  9:heritage_consultant
--  10:chain_status  11:sla_due_at  12:sla_breached
--  13:hra_submitted_at  14:public_participation_closed_at  15:hra_decided_at
--  16:created_at  17:updated_at

INSERT OR IGNORE INTO oe_ipp_hra_assessments VALUES
  (
    'hra_001',
    'p_ipp_dev_001',
    'proj_reipppp_001',
    'new_development',
    'phase_1_desktop',
    5.0,
    'small',
    NULL,
    NULL,
    'hra_triggered',
    datetime('now', '+30 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-05-28T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'hra_002',
    'p_ipp_dev_001',
    'proj_reipppp_002',
    'scope_change',
    'phase_2_field',
    8.5,
    'small',
    NULL,
    'Afri-Arch Heritage Consultants',
    'desktop_study',
    datetime('now', '+45 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-04-20T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'hra_003',
    'p_ipp_dev_001',
    'proj_reipppp_003',
    'layout_modification',
    'phase_3_excavation',
    9.8,
    'small',
    'SAHRA/2024/HIA/001',
    'Archaeology Africa',
    'field_survey',
    datetime('now', '+60 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-03-12T08:00:00Z',
    '2026-05-18T09:00:00Z'
  ),
  (
    'hra_004',
    'p_ipp_dev_001',
    'proj_reipppp_004',
    'access_road',
    'heritage_impact',
    22.0,
    'medium',
    'SAHRA/2024/HIA/002',
    'ASA (Archaeological Services Archaeologists)',
    'hra_report_preparation',
    datetime('now', '+50 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-02-05T08:00:00Z',
    '2026-04-22T10:00:00Z'
  ),
  (
    'hra_005',
    'p_ipp_dev_001',
    'proj_reipppp_005',
    'substation_addition',
    'mitigation_plan',
    38.0,
    'medium',
    'SAHRA/2024/HIA/003',
    'SRK Consulting',
    'hra_submitted',
    datetime('now', '+35 days'),
    0,
    '2026-03-10T11:00:00Z',
    NULL,
    NULL,
    '2026-01-18T08:00:00Z',
    '2026-03-10T11:00:00Z'
  ),
  (
    'hra_006',
    'p_ipp_dev_001',
    'proj_reipppp_006',
    'transmission_line',
    'phase_1_desktop',
    48.0,
    'medium',
    'SAHRA/2025/HIA/004',
    'AECOM',
    'sahra_review',
    datetime('now', '+21 days'),
    0,
    '2026-02-25T09:00:00Z',
    NULL,
    NULL,
    '2025-12-02T08:00:00Z',
    '2026-02-25T09:00:00Z'
  ),
  (
    'hra_007',
    'p_ipp_dev_001',
    'proj_reipppp_007',
    'new_development',
    'phase_2_field',
    95.0,
    'large',
    'SAHRA/2025/HIA/005',
    'Strandloper Heritage',
    'public_participation',
    datetime('now', '+28 days'),
    0,
    '2025-11-08T10:00:00Z',
    NULL,
    NULL,
    '2025-08-10T08:00:00Z',
    '2026-03-12T17:00:00Z'
  ),
  (
    'hra_008',
    'p_ipp_dev_001',
    'proj_reipppp_008',
    'scope_change',
    'phase_3_excavation',
    155.0,
    'large',
    'SAHRA/2025/HIA/006',
    'GCS Environmental',
    'specialist_assessment',
    datetime('now', '+14 days'),
    0,
    '2025-10-20T11:00:00Z',
    '2026-01-28T17:00:00Z',
    NULL,
    '2025-06-15T08:00:00Z',
    '2026-01-28T17:00:00Z'
  ),
  (
    'hra_009',
    'p_ipp_dev_001',
    'proj_reipppp_009',
    'layout_modification',
    'heritage_impact',
    320.0,
    'utility',
    'SAHRA/2025/HIA/007',
    'Afri-Arch Heritage Consultants',
    'final_review',
    datetime('now', '+7 days'),
    0,
    '2025-09-02T09:00:00Z',
    '2025-12-15T17:00:00Z',
    NULL,
    '2025-04-10T08:00:00Z',
    '2025-12-15T17:00:00Z'
  ),
  (
    'hra_010',
    'p_ipp_dev_001',
    'proj_reipppp_010',
    'access_road',
    'mitigation_plan',
    460.0,
    'utility',
    'SAHRA/2024/HIA/008',
    'Archaeology Africa',
    'hra_approved',
    datetime('now', '+90 days'),
    0,
    '2025-05-18T10:00:00Z',
    '2025-08-12T17:00:00Z',
    '2026-01-20T15:00:00Z',
    '2025-02-08T08:00:00Z',
    '2026-01-20T15:00:00Z'
  ),
  (
    'hra_011',
    'p_ipp_dev_001',
    'proj_reipppp_011',
    'substation_addition',
    'phase_1_desktop',
    580.0,
    'strategic',
    'SAHRA/2024/HIA/009',
    'SRK Consulting',
    'hra_refused',
    datetime('now', '-8 days'),
    1,
    '2025-03-10T11:00:00Z',
    '2025-07-08T17:00:00Z',
    '2026-04-15T09:00:00Z',
    '2024-11-02T08:00:00Z',
    '2026-04-15T09:00:00Z'
  ),
  (
    'hra_012',
    'p_ipp_dev_001',
    'proj_reipppp_012',
    'transmission_line',
    'phase_2_field',
    820.0,
    'strategic',
    'SAHRA/2025/HIA/010',
    'Strandloper Heritage',
    'heritage_watchlist',
    datetime('now', '+60 days'),
    0,
    '2025-07-05T09:00:00Z',
    '2025-10-20T17:00:00Z',
    '2026-03-02T14:00:00Z',
    '2025-04-25T08:00:00Z',
    '2026-03-02T14:00:00Z'
  );
