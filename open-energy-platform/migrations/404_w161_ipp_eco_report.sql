-- Wave 161: IPP Environmental Compliance Audit chain
-- NEMA/ECA environmental-compliance lifecycle: DEA Environmental Authorisation (EA)
-- conditions, NEMA §24 audit obligations, DFFE Environmental Control Officer (ECO)
-- appointments, REIPPPP environmental commitments and NERSA licence environmental
-- conditions for generation facilities.
--
-- 18 columns:
--   id, participant_id, project_id, reporting_year, capacity_mw,
--   capacity_tier, ea_reference, eco_name, violation_category,
--   chain_status, sla_due_at, sla_breached, submitted_at,
--   compliant_at, non_compliance_at, enforcement_referral_at,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_eco_reports` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  reporting_year INTEGER NOT NULL,
  capacity_mw REAL NOT NULL,
  capacity_tier TEXT NOT NULL CHECK(capacity_tier IN ('small','medium','large','utility','strategic')),
  ea_reference TEXT,
  eco_name TEXT,
  violation_category TEXT NOT NULL DEFAULT 'none' CHECK(violation_category IN ('none','water_management','waste_management','vegetation_clearing','noise_dust','heritage_resources','biodiversity','rehabilitation')),
  chain_status TEXT NOT NULL DEFAULT 'audit_due',
  sla_due_at TEXT,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT,
  compliant_at TEXT,
  non_compliance_at TEXT,
  enforcement_referral_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ipp_eco_participant
  ON oe_ipp_eco_reports(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_eco_project
  ON oe_ipp_eco_reports(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_eco_status
  ON oe_ipp_eco_reports(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_eco_sla
  ON oe_ipp_eco_reports(sla_due_at)
  WHERE sla_breached = 0;

-- 12 seed rows, 18 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:reporting_year  5:capacity_mw
--  6:capacity_tier  7:ea_reference  8:eco_name  9:violation_category
--  10:chain_status  11:sla_due_at  12:sla_breached  13:submitted_at
--  14:compliant_at  15:non_compliance_at  16:enforcement_referral_at
--  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_eco_reports VALUES
  (
    'ipp_eco_a1b2c3d4e5f6g7h8i9j0k1l2',
    'part_ipp_001',
    'proj_001',
    2025,
    5.5,
    'small',
    'DEA/NEMA/EA/2020/0341',
    'Dr. Sipho Molefe',
    'none',
    'audit_due',
    '2026-06-30T23:59:59Z',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-05-01T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'ipp_eco_b2c3d4e5f6g7h8i9j0k1l2m3',
    'part_ipp_002',
    'proj_002',
    2025,
    7.8,
    'small',
    'DEA/NEMA/EA/2019/0812',
    'Ms. Thandi Dlamini',
    'none',
    'audit_due',
    '2026-07-15T23:59:59Z',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-05-10T09:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'ipp_eco_c3d4e5f6g7h8i9j0k1l2m3n4',
    'part_ipp_003',
    'proj_003',
    2024,
    22.0,
    'medium',
    'DEA/NEMA/EA/2018/1234',
    'Prof. Reza van der Merwe',
    'none',
    'eco_appointed',
    '2026-06-20T23:59:59Z',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-04-15T10:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'ipp_eco_d4e5f6g7h8i9j0k1l2m3n4o5',
    'part_ipp_004',
    'proj_004',
    2025,
    38.5,
    'medium',
    'DEA/NEMA/EA/2021/0567',
    'Dr. Sipho Molefe',
    'noise_dust',
    'site_inspection_in_progress',
    '2026-06-25T23:59:59Z',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-04-20T11:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'ipp_eco_e5f6g7h8i9j0k1l2m3n4o5p6',
    'part_ipp_001',
    'proj_005',
    2024,
    85.0,
    'large',
    'DEA/NEMA/EA/2017/2089',
    'Ms. Thandi Dlamini',
    'none',
    'submitted_to_dffe',
    '2026-07-10T23:59:59Z',
    0,
    '2026-05-28T14:00:00Z',
    NULL,
    NULL,
    NULL,
    '2026-03-01T09:00:00Z',
    '2026-05-28T14:00:00Z'
  ),
  (
    'ipp_eco_f6g7h8i9j0k1l2m3n4o5p6q7',
    'part_ipp_002',
    'proj_006',
    2025,
    140.0,
    'large',
    'DEA/NEMA/EA/2018/1234',
    'Prof. Reza van der Merwe',
    'water_management',
    'under_review',
    '2026-06-12T23:59:59Z',
    1,
    '2026-04-10T10:00:00Z',
    NULL,
    NULL,
    NULL,
    '2026-02-15T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'ipp_eco_g7h8i9j0k1l2m3n4o5p6q7r8',
    'part_ipp_003',
    'proj_007',
    2024,
    185.0,
    'large',
    'DEA/NEMA/EA/2016/3301',
    'Dr. Sipho Molefe',
    'vegetation_clearing',
    'queries_raised',
    '2026-06-08T23:59:59Z',
    1,
    '2026-03-20T09:00:00Z',
    NULL,
    NULL,
    NULL,
    '2026-01-10T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'ipp_eco_h8i9j0k1l2m3n4o5p6q7r8s9',
    'part_ipp_004',
    'proj_008',
    2025,
    310.0,
    'utility',
    'DEA/NEMA/EA/2019/4412',
    'Ms. Thandi Dlamini',
    'waste_management',
    'non_compliance_identified',
    '2026-07-31T23:59:59Z',
    0,
    '2026-05-05T11:00:00Z',
    NULL,
    '2026-05-22T14:00:00Z',
    NULL,
    '2026-03-05T09:00:00Z',
    '2026-05-22T14:00:00Z'
  ),
  (
    'ipp_eco_i9j0k1l2m3n4o5p6q7r8s9t0',
    'part_ipp_001',
    'proj_009',
    2024,
    450.0,
    'utility',
    'DEA/NEMA/EA/2015/5678',
    'Prof. Reza van der Merwe',
    'biodiversity',
    'corrective_action_in_progress',
    '2026-08-20T23:59:59Z',
    0,
    '2026-02-18T10:00:00Z',
    NULL,
    '2026-03-30T15:00:00Z',
    NULL,
    '2026-01-20T08:00:00Z',
    '2026-03-30T15:00:00Z'
  ),
  (
    'ipp_eco_j0k1l2m3n4o5p6q7r8s9t0u1',
    'part_ipp_002',
    'proj_010',
    2024,
    480.0,
    'utility',
    'DEA/NEMA/EA/2014/6234',
    'Dr. Sipho Molefe',
    'none',
    'compliant',
    NULL,
    0,
    '2025-09-15T09:00:00Z',
    '2025-11-10T14:00:00Z',
    NULL,
    NULL,
    '2025-07-01T08:00:00Z',
    '2025-11-10T14:00:00Z'
  ),
  (
    'ipp_eco_k1l2m3n4o5p6q7r8s9t0u1v2',
    'part_ipp_003',
    'proj_011',
    2024,
    650.0,
    'strategic',
    'DEA/NEMA/EA/2013/7890',
    'Ms. Thandi Dlamini',
    'none',
    'compliant',
    NULL,
    0,
    '2025-08-20T10:00:00Z',
    '2025-10-05T16:00:00Z',
    NULL,
    NULL,
    '2025-06-15T08:00:00Z',
    '2025-10-05T16:00:00Z'
  ),
  (
    'ipp_eco_l2m3n4o5p6q7r8s9t0u1v2w3',
    'part_ipp_004',
    'proj_012',
    2024,
    870.0,
    'strategic',
    'DEA/NEMA/EA/2012/9001',
    'Prof. Reza van der Merwe',
    'heritage_resources',
    'enforcement_referral',
    NULL,
    0,
    '2025-05-10T09:00:00Z',
    NULL,
    '2025-07-18T14:00:00Z',
    '2025-10-22T11:00:00Z',
    '2025-03-01T08:00:00Z',
    '2025-10-22T11:00:00Z'
  );
