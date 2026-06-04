-- W169: IPP Environmental Authorization (EA) Amendment
-- EA amendment lifecycle for IPP projects under NEMA s24 / DEA EIA Regulations 2014:
-- ea_amendment_triggered → scope_defined → application_in_preparation →
-- application_submitted → dffe_completeness_review → public_participation_open →
-- public_participation_closed → specialist_review → dffe_final_review →
-- amendment_granted / amendment_refused / s24g_referral.
--
-- 17 columns:
--   id, participant_id, project_id, trigger_category, amendment_category,
--   capacity_mw, ea_capacity_tier, dffe_reference, environmental_consultant,
--   chain_status, sla_due_at, sla_breached,
--   application_submitted_at, public_participation_closed_at, amendment_decided_at,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_ea_amendments` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  trigger_category TEXT NOT NULL CHECK(trigger_category IN ('scope_change','technology_substitution','capacity_increase','access_route_change','footprint_expansion','component_modification')),
  amendment_category TEXT NOT NULL CHECK(amendment_category IN ('basic_assessment','scoping_and_eia','variation_application','s24g_rectification','exemption_application')),
  capacity_mw REAL NOT NULL DEFAULT 0,
  ea_capacity_tier TEXT NOT NULL DEFAULT 'small' CHECK(ea_capacity_tier IN ('small','medium','large','utility','strategic')),
  dffe_reference TEXT,
  environmental_consultant TEXT,
  chain_status TEXT NOT NULL DEFAULT 'ea_amendment_triggered',
  sla_due_at TEXT NOT NULL,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  application_submitted_at TEXT,
  public_participation_closed_at TEXT,
  amendment_decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_eam_participant
  ON oe_ipp_ea_amendments(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_eam_project
  ON oe_ipp_ea_amendments(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_eam_status
  ON oe_ipp_ea_amendments(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_eam_sla
  ON oe_ipp_ea_amendments(sla_due_at)
  WHERE sla_breached = 0;

-- 12 seed rows, 17 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:trigger_category  5:amendment_category
--  6:capacity_mw  7:ea_capacity_tier  8:dffe_reference  9:environmental_consultant
--  10:chain_status  11:sla_due_at  12:sla_breached
--  13:application_submitted_at  14:public_participation_closed_at  15:amendment_decided_at
--  16:created_at  17:updated_at

INSERT OR IGNORE INTO oe_ipp_ea_amendments VALUES
  (
    'eam_001',
    'p_ipp_dev_001',
    'proj_reipppp_001',
    'scope_change',
    'basic_assessment',
    7.2,
    'small',
    NULL,
    NULL,
    'ea_amendment_triggered',
    datetime('now', '+30 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-05-20T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'eam_002',
    'p_ipp_dev_001',
    'proj_reipppp_002',
    'technology_substitution',
    'exemption_application',
    3.5,
    'small',
    NULL,
    'Savannah Environmental',
    'scope_defined',
    datetime('now', '+45 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-04-18T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'eam_003',
    'p_ipp_dev_001',
    'proj_reipppp_003',
    'capacity_increase',
    'scoping_and_eia',
    28.5,
    'medium',
    NULL,
    'ERM South Africa',
    'application_in_preparation',
    datetime('now', '+60 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-03-10T08:00:00Z',
    '2026-05-22T09:00:00Z'
  ),
  (
    'eam_004',
    'p_ipp_dev_001',
    'proj_reipppp_004',
    'access_route_change',
    'variation_application',
    14.0,
    'medium',
    'EA/2024/VAR/001',
    'Aurecon',
    'application_submitted',
    datetime('now', '+50 days'),
    0,
    '2026-04-25T10:00:00Z',
    NULL,
    NULL,
    '2026-02-08T08:00:00Z',
    '2026-04-25T10:00:00Z'
  ),
  (
    'eam_005',
    'p_ipp_dev_001',
    'proj_reipppp_005',
    'footprint_expansion',
    'scoping_and_eia',
    42.0,
    'medium',
    'EA/2024/EIA/001',
    'WSP Global',
    'dffe_completeness_review',
    datetime('now', '+35 days'),
    0,
    '2026-03-14T11:00:00Z',
    NULL,
    NULL,
    '2026-01-20T08:00:00Z',
    '2026-03-14T11:00:00Z'
  ),
  (
    'eam_006',
    'p_ipp_dev_001',
    'proj_reipppp_006',
    'component_modification',
    'basic_assessment',
    8.8,
    'small',
    'EA/2025/BA/001',
    'SLR Consulting',
    'public_participation_open',
    datetime('now', '+21 days'),
    0,
    '2026-02-28T09:00:00Z',
    NULL,
    NULL,
    '2025-12-05T08:00:00Z',
    '2026-02-28T09:00:00Z'
  ),
  (
    'eam_007',
    'p_ipp_dev_001',
    'proj_reipppp_007',
    'scope_change',
    'scoping_and_eia',
    135.0,
    'large',
    'EA/2025/EIA/002',
    'Zutari',
    'public_participation_closed',
    datetime('now', '+28 days'),
    0,
    '2025-11-10T10:00:00Z',
    '2026-03-15T17:00:00Z',
    NULL,
    '2025-08-12T08:00:00Z',
    '2026-03-15T17:00:00Z'
  ),
  (
    'eam_008',
    'p_ipp_dev_001',
    'proj_reipppp_008',
    'technology_substitution',
    'variation_application',
    75.0,
    'large',
    'EA/2025/VAR/002',
    'GCS Environmental',
    'specialist_review',
    datetime('now', '+14 days'),
    0,
    '2025-10-22T11:00:00Z',
    '2026-01-30T17:00:00Z',
    NULL,
    '2025-06-18T08:00:00Z',
    '2026-01-30T17:00:00Z'
  ),
  (
    'eam_009',
    'p_ipp_dev_001',
    'proj_reipppp_009',
    'capacity_increase',
    's24g_rectification',
    420.0,
    'utility',
    'EA/2025/EIA/003',
    'Aurecon',
    'dffe_final_review',
    datetime('now', '+7 days'),
    0,
    '2025-09-05T09:00:00Z',
    '2025-12-18T17:00:00Z',
    NULL,
    '2025-04-14T08:00:00Z',
    '2025-12-18T17:00:00Z'
  ),
  (
    'eam_010',
    'p_ipp_dev_001',
    'proj_reipppp_010',
    'footprint_expansion',
    'scoping_and_eia',
    280.0,
    'utility',
    'EA/2024/EIA/002',
    'ERM South Africa',
    'amendment_granted',
    datetime('now', '+90 days'),
    0,
    '2025-05-20T10:00:00Z',
    '2025-08-14T17:00:00Z',
    '2026-01-22T15:00:00Z',
    '2025-02-10T08:00:00Z',
    '2026-01-22T15:00:00Z'
  ),
  (
    'eam_011',
    'p_ipp_dev_001',
    'proj_reipppp_011',
    'access_route_change',
    'exemption_application',
    650.0,
    'strategic',
    'EA/2024/EIA/003',
    'WSP Global',
    'amendment_refused',
    datetime('now', '-8 days'),
    1,
    '2025-03-12T11:00:00Z',
    '2025-07-10T17:00:00Z',
    '2026-04-18T09:00:00Z',
    '2024-11-05T08:00:00Z',
    '2026-04-18T09:00:00Z'
  ),
  (
    'eam_012',
    'p_ipp_dev_001',
    'proj_reipppp_012',
    'component_modification',
    's24g_rectification',
    180.0,
    'large',
    'EA/2025/S24G/001',
    'Savannah Environmental',
    's24g_referral',
    datetime('now', '+60 days'),
    0,
    '2025-07-08T09:00:00Z',
    '2025-10-22T17:00:00Z',
    '2026-03-05T14:00:00Z',
    '2025-04-28T08:00:00Z',
    '2026-03-05T14:00:00Z'
  );
