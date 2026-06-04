-- W172: IPP Atmospheric Emission Licence (AEL)
-- AEL lifecycle for IPP projects under NEMA Air Quality Act 39/2004 / DFFE permitting:
-- ael_triggered → emissions_inventory → application_preparation →
-- application_submitted → authority_completeness_review → public_participation_open →
-- public_participation_closed → technical_assessment → authority_final_review →
-- ael_granted / ael_refused / ael_lapsed.
--
-- 17 columns:
--   id, participant_id, project_id, trigger_category, ael_category,
--   capacity_mw, ael_capacity_tier, authority_reference, emissions_consultant,
--   chain_status, sla_due_at, sla_breached,
--   application_submitted_at, public_participation_closed_at, ael_decided_at,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_ael_applications` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  trigger_category TEXT NOT NULL CHECK(trigger_category IN ('new_installation','capacity_increase','fuel_change','technology_substitution','renewal','amendment')),
  ael_category TEXT NOT NULL CHECK(ael_category IN ('category_1_major','category_2_minor','s21_listed_activity','point_source','fugitive_emission')),
  capacity_mw REAL NOT NULL DEFAULT 0,
  ael_capacity_tier TEXT NOT NULL DEFAULT 'small' CHECK(ael_capacity_tier IN ('small','medium','large','utility','strategic')),
  authority_reference TEXT,
  emissions_consultant TEXT,
  chain_status TEXT NOT NULL DEFAULT 'ael_triggered',
  sla_due_at TEXT NOT NULL,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  application_submitted_at TEXT,
  public_participation_closed_at TEXT,
  ael_decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_ael_participant
  ON oe_ipp_ael_applications(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_ael_project
  ON oe_ipp_ael_applications(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_ael_status
  ON oe_ipp_ael_applications(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_ael_sla
  ON oe_ipp_ael_applications(sla_due_at)
  WHERE sla_breached = 0;

-- 12 seed rows, 17 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:trigger_category  5:ael_category
--  6:capacity_mw  7:ael_capacity_tier  8:authority_reference  9:emissions_consultant
--  10:chain_status  11:sla_due_at  12:sla_breached
--  13:application_submitted_at  14:public_participation_closed_at  15:ael_decided_at
--  16:created_at  17:updated_at

INSERT OR IGNORE INTO oe_ipp_ael_applications VALUES
  (
    'ael_001',
    'p_ipp_dev_001',
    'proj_reipppp_001',
    'new_installation',
    'category_2_minor',
    5.0,
    'small',
    NULL,
    NULL,
    'ael_triggered',
    datetime('now', '+30 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-05-28T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'ael_002',
    'p_ipp_dev_001',
    'proj_reipppp_002',
    'capacity_increase',
    'point_source',
    8.5,
    'small',
    NULL,
    'SRK Consulting',
    'emissions_inventory',
    datetime('now', '+45 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-04-20T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'ael_003',
    'p_ipp_dev_001',
    'proj_reipppp_003',
    'fuel_change',
    'fugitive_emission',
    9.8,
    'small',
    'AEL/2024/GP/001',
    'GCS Environmental',
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
    'ael_004',
    'p_ipp_dev_001',
    'proj_reipppp_004',
    'technology_substitution',
    'category_1_major',
    22.0,
    'medium',
    'AEL/2024/GP/002',
    'AECOM',
    'application_submitted',
    datetime('now', '+50 days'),
    0,
    '2026-03-18T10:00:00Z',
    NULL,
    NULL,
    '2026-02-05T08:00:00Z',
    '2026-03-18T10:00:00Z'
  ),
  (
    'ael_005',
    'p_ipp_dev_001',
    'proj_reipppp_005',
    'renewal',
    's21_listed_activity',
    38.0,
    'medium',
    'AEL/2024/GP/003',
    'Aurecon',
    'authority_completeness_review',
    datetime('now', '+35 days'),
    0,
    '2026-03-10T11:00:00Z',
    NULL,
    NULL,
    '2026-01-18T08:00:00Z',
    '2026-03-10T11:00:00Z'
  ),
  (
    'ael_006',
    'p_ipp_dev_001',
    'proj_reipppp_006',
    'amendment',
    'category_2_minor',
    48.0,
    'medium',
    'AEL/2025/GP/004',
    'ERM South Africa',
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
    'ael_007',
    'p_ipp_dev_001',
    'proj_reipppp_007',
    'new_installation',
    'point_source',
    95.0,
    'large',
    'AEL/2025/GP/005',
    'WSP Global',
    'public_participation_closed',
    datetime('now', '+28 days'),
    0,
    '2025-11-08T10:00:00Z',
    '2026-03-05T17:00:00Z',
    NULL,
    '2025-08-10T08:00:00Z',
    '2026-03-05T17:00:00Z'
  ),
  (
    'ael_008',
    'p_ipp_dev_001',
    'proj_reipppp_008',
    'capacity_increase',
    'category_1_major',
    155.0,
    'large',
    'AEL/2025/GP/006',
    'Zutari',
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
    'ael_009',
    'p_ipp_dev_001',
    'proj_reipppp_009',
    'fuel_change',
    's21_listed_activity',
    320.0,
    'utility',
    'AEL/2025/GP/007',
    'SRK Consulting',
    'authority_final_review',
    datetime('now', '+7 days'),
    0,
    '2025-09-02T09:00:00Z',
    '2025-12-15T17:00:00Z',
    NULL,
    '2025-04-10T08:00:00Z',
    '2025-12-15T17:00:00Z'
  ),
  (
    'ael_010',
    'p_ipp_dev_001',
    'proj_reipppp_010',
    'technology_substitution',
    'fugitive_emission',
    460.0,
    'utility',
    'AEL/2024/GP/008',
    'Aurecon',
    'ael_granted',
    datetime('now', '+90 days'),
    0,
    '2025-05-18T10:00:00Z',
    '2025-08-12T17:00:00Z',
    '2026-01-20T15:00:00Z',
    '2025-02-08T08:00:00Z',
    '2026-01-20T15:00:00Z'
  ),
  (
    'ael_011',
    'p_ipp_dev_001',
    'proj_reipppp_011',
    'renewal',
    'category_1_major',
    580.0,
    'strategic',
    'AEL/2024/GP/009',
    'ERM South Africa',
    'ael_refused',
    datetime('now', '-8 days'),
    1,
    '2025-03-10T11:00:00Z',
    '2025-07-08T17:00:00Z',
    '2026-04-15T09:00:00Z',
    '2024-11-02T08:00:00Z',
    '2026-04-15T09:00:00Z'
  ),
  (
    'ael_012',
    'p_ipp_dev_001',
    'proj_reipppp_012',
    'amendment',
    's21_listed_activity',
    820.0,
    'strategic',
    'AEL/2025/GP/010',
    'WSP Global',
    'ael_lapsed',
    datetime('now', '+60 days'),
    0,
    '2025-07-05T09:00:00Z',
    '2025-10-20T17:00:00Z',
    '2026-03-02T14:00:00Z',
    '2025-04-25T08:00:00Z',
    '2026-03-02T14:00:00Z'
  );
