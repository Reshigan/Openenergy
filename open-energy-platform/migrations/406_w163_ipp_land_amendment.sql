-- W163: IPP Lease & Servitude Amendment Request
-- Land title amendment lifecycle: lease amendments, servitude registrations,
-- servitude/wayleave extensions, wayleave grants, and right-of-way approvals
-- required for IPP project sites under the Deeds Registries Act 47/1937,
-- Spatial Planning and Land Use Management Act 16/2013 (SPLUMA), and
-- REIPPPP land-rights conditions.
--
-- 18 columns:
--   id, participant_id, project_id, amendment_category, land_area_hectares,
--   area_tier, counterparty_name, deeds_office_reference,
--   chain_status, sla_due_at, sla_breached, survey_completed_at,
--   amendment_granted_at, amendment_refused_at, appeal_filed_at,
--   appeal_determined_at, created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_land_amendments` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  amendment_category TEXT NOT NULL CHECK(amendment_category IN ('lease_amendment','servitude_registration','servitude_extension','wayleave_grant','wayleave_extension','right_of_way')),
  land_area_hectares REAL NOT NULL DEFAULT 0,
  area_tier TEXT NOT NULL DEFAULT 'minor' CHECK(area_tier IN ('minor','moderate','significant','major','material')),
  counterparty_name TEXT NOT NULL,
  deeds_office_reference TEXT,
  chain_status TEXT NOT NULL DEFAULT 'amendment_requested',
  sla_due_at TEXT NOT NULL,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  survey_completed_at TEXT,
  amendment_granted_at TEXT,
  amendment_refused_at TEXT,
  appeal_filed_at TEXT,
  appeal_determined_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_land_amd_participant
  ON oe_ipp_land_amendments(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_land_amd_project
  ON oe_ipp_land_amendments(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_land_amd_status
  ON oe_ipp_land_amendments(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_land_amd_sla
  ON oe_ipp_land_amendments(sla_due_at)
  WHERE sla_breached = 0;

-- 12 seed rows, 18 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:amendment_category  5:land_area_hectares
--  6:area_tier  7:counterparty_name  8:deeds_office_reference
--  9:chain_status  10:sla_due_at  11:sla_breached  12:survey_completed_at
--  13:amendment_granted_at  14:amendment_refused_at  15:appeal_filed_at
--  16:appeal_determined_at  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_land_amendments VALUES
  (
    'lam_001',
    'p_ipp_dev_001',
    'proj_reipppp_001',
    'lease_amendment',
    0.45,
    'minor',
    'eThekwini Municipality',
    'T12345/2024',
    'amendment_requested',
    datetime('now', '+14 days'),
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
    'lam_002',
    'p_ipp_dev_001',
    'proj_reipppp_002',
    'servitude_registration',
    3.20,
    'moderate',
    'City of Cape Town',
    'K5678/2023',
    'surveyor_appointed',
    datetime('now', '+21 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-05-15T09:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'lam_003',
    'p_ipp_dev_001',
    'proj_reipppp_003',
    'wayleave_grant',
    7.85,
    'moderate',
    'Eskom Holdings SOC Ltd',
    'S99012/2024',
    'survey_completed',
    datetime('now', '+18 days'),
    0,
    '2026-05-28T10:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-04-10T08:00:00Z',
    '2026-05-28T10:00:00Z'
  ),
  (
    'lam_004',
    'p_ipp_dev_001',
    'proj_reipppp_004',
    'right_of_way',
    14.60,
    'significant',
    'SANRAL',
    'T22101/2024',
    'application_submitted',
    datetime('now', '+30 days'),
    0,
    '2026-05-10T09:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-03-18T08:00:00Z',
    '2026-05-10T09:00:00Z'
  ),
  (
    'lam_005',
    'p_ipp_dev_001',
    'proj_reipppp_005',
    'servitude_extension',
    28.90,
    'significant',
    'City of Johannesburg',
    'K8834/2023',
    'authority_review',
    datetime('now', '+28 days'),
    0,
    '2026-04-25T11:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-03-05T08:00:00Z',
    '2026-04-25T11:00:00Z'
  ),
  (
    'lam_006',
    'p_ipp_dev_001',
    'proj_reipppp_006',
    'wayleave_extension',
    42.15,
    'significant',
    'Transnet SOC Ltd',
    'S10456/2024',
    'objections_resolved',
    datetime('now', '+10 days'),
    0,
    '2026-03-14T09:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-01-22T08:00:00Z',
    '2026-05-18T14:00:00Z'
  ),
  (
    'lam_007',
    'p_ipp_dev_001',
    'proj_reipppp_007',
    'lease_amendment',
    68.40,
    'major',
    'National Roads Agency Ltd',
    'T33789/2023',
    'amendment_granted',
    datetime('now', '+60 days'),
    0,
    '2026-02-08T10:00:00Z',
    '2026-05-22T14:00:00Z',
    NULL,
    NULL,
    NULL,
    '2025-12-01T08:00:00Z',
    '2026-05-22T14:00:00Z'
  ),
  (
    'lam_008',
    'p_ipp_dev_001',
    'proj_reipppp_008',
    'servitude_registration',
    125.70,
    'major',
    'eThekwini Municipality',
    'K4412/2024',
    'amendment_requested',
    datetime('now', '-5 days'),
    1,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-05-01T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'lam_009',
    'p_ipp_dev_001',
    'proj_reipppp_009',
    'right_of_way',
    180.25,
    'major',
    'SANRAL',
    'S77023/2023',
    'amendment_refused',
    datetime('now', '+45 days'),
    0,
    '2025-10-12T09:00:00Z',
    NULL,
    '2026-04-30T15:00:00Z',
    NULL,
    NULL,
    '2025-08-14T08:00:00Z',
    '2026-04-30T15:00:00Z'
  ),
  (
    'lam_010',
    'p_ipp_dev_001',
    'proj_reipppp_010',
    'wayleave_grant',
    245.80,
    'material',
    'Eskom Holdings SOC Ltd',
    'T50167/2024',
    'appeal_filed',
    datetime('now', '+35 days'),
    0,
    '2025-09-05T10:00:00Z',
    NULL,
    '2026-03-18T14:00:00Z',
    '2026-05-02T09:00:00Z',
    NULL,
    '2025-07-10T08:00:00Z',
    '2026-05-02T09:00:00Z'
  ),
  (
    'lam_011',
    'p_ipp_dev_001',
    'proj_reipppp_011',
    'servitude_extension',
    380.00,
    'material',
    'City of Cape Town',
    'K9001/2023',
    'survey_completed',
    datetime('now', '-3 days'),
    1,
    '2026-05-30T11:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-04-02T08:00:00Z',
    '2026-05-30T11:00:00Z'
  ),
  (
    'lam_012',
    'p_ipp_dev_001',
    'proj_reipppp_012',
    'wayleave_extension',
    520.50,
    'material',
    'Transnet SOC Ltd',
    'S62345/2024',
    'amendment_granted',
    datetime('now', '+90 days'),
    0,
    '2025-08-20T10:00:00Z',
    '2026-05-15T16:00:00Z',
    NULL,
    NULL,
    NULL,
    '2025-06-05T08:00:00Z',
    '2026-05-15T16:00:00Z'
  );
