-- W164: IPP Community Trust Annual Disbursement Report
-- Community trust disbursement reporting lifecycle: equity dividends,
-- socio-economic development, enterprise development, education bursaries,
-- and infrastructure upliftment disbursements made by IPPs to community
-- trusts under REIPPPP Economic Development obligations, DTIC reporting
-- requirements, and DMRE community benefit conditions.
--
-- 18 columns:
--   id, participant_id, project_id, trust_category, reporting_year,
--   disbursement_amount_zar, disbursement_tier, trust_name,
--   chain_status, sla_due_at, sla_breached, submitted_to_dtic_at,
--   report_accepted_at, report_rejected_at, appeal_filed_at,
--   appeal_determined_at, created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_community_trust_reports` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  trust_category TEXT NOT NULL CHECK(trust_category IN ('equity_dividend','socio_economic_development','enterprise_development','education_bursary','infrastructure_upliftment')),
  reporting_year INTEGER NOT NULL,
  disbursement_amount_zar REAL NOT NULL DEFAULT 0,
  disbursement_tier TEXT NOT NULL DEFAULT 'minor' CHECK(disbursement_tier IN ('minor','moderate','significant','major','material')),
  trust_name TEXT NOT NULL,
  chain_status TEXT NOT NULL DEFAULT 'report_due',
  sla_due_at TEXT NOT NULL,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  submitted_to_dtic_at TEXT,
  report_accepted_at TEXT,
  report_rejected_at TEXT,
  appeal_filed_at TEXT,
  appeal_determined_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_ctr_participant
  ON oe_ipp_community_trust_reports(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_ctr_project
  ON oe_ipp_community_trust_reports(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_ctr_status
  ON oe_ipp_community_trust_reports(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_ctr_sla
  ON oe_ipp_community_trust_reports(sla_due_at)
  WHERE sla_breached = 0;

-- 12 seed rows, 18 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:trust_category  5:reporting_year
--  6:disbursement_amount_zar  7:disbursement_tier  8:trust_name
--  9:chain_status  10:sla_due_at  11:sla_breached  12:submitted_to_dtic_at
--  13:report_accepted_at  14:report_rejected_at  15:appeal_filed_at
--  16:appeal_determined_at  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_community_trust_reports VALUES
  (
    'ctr_001',
    'p_ipp_dev_001',
    'proj_reipppp_001',
    'equity_dividend',
    2025,
    650000.00,
    'minor',
    'Loeriesfontein Community Trust',
    'report_due',
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
    'ctr_002',
    'p_ipp_dev_001',
    'proj_reipppp_002',
    'socio_economic_development',
    2024,
    2800000.00,
    'moderate',
    'Cookhouse Wind Community Trust',
    'data_preparation',
    datetime('now', '+28 days'),
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
    'ctr_003',
    'p_ipp_dev_001',
    'proj_reipppp_003',
    'enterprise_development',
    2024,
    4500000.00,
    'moderate',
    'De Aar Solar Community Trust',
    'trustee_review',
    datetime('now', '+18 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-04-10T08:00:00Z',
    '2026-05-28T10:00:00Z'
  ),
  (
    'ctr_004',
    'p_ipp_dev_001',
    'proj_reipppp_004',
    'education_bursary',
    2023,
    8200000.00,
    'significant',
    'Kathu Solar Community Trust',
    'report_drafted',
    datetime('now', '+30 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-03-18T08:00:00Z',
    '2026-05-10T09:00:00Z'
  ),
  (
    'ctr_005',
    'p_ipp_dev_001',
    'proj_reipppp_005',
    'infrastructure_upliftment',
    2023,
    15600000.00,
    'significant',
    'Excelsior Wind Community Trust',
    'ipp_review',
    datetime('now', '+14 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-03-05T08:00:00Z',
    '2026-04-25T11:00:00Z'
  ),
  (
    'ctr_006',
    'p_ipp_dev_001',
    'proj_reipppp_006',
    'equity_dividend',
    2022,
    22400000.00,
    'major',
    'Amakhala Emoyeni Community Trust',
    'submitted_to_dtic',
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
    'ctr_007',
    'p_ipp_dev_001',
    'proj_reipppp_007',
    'socio_economic_development',
    2025,
    45000000.00,
    'major',
    'Khobab Wind Community Trust',
    'dtic_review',
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
    'ctr_008',
    'p_ipp_dev_001',
    'proj_reipppp_008',
    'education_bursary',
    2022,
    78000000.00,
    'major',
    'Loeriesfontein Community Trust',
    'report_due',
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
    'ctr_009',
    'p_ipp_dev_001',
    'proj_reipppp_009',
    'enterprise_development',
    2023,
    110000000.00,
    'material',
    'De Aar Solar Community Trust',
    'responses_submitted',
    datetime('now', '+35 days'),
    0,
    '2026-03-12T10:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '2025-08-14T08:00:00Z',
    '2026-03-12T10:00:00Z'
  ),
  (
    'ctr_010',
    'p_ipp_dev_001',
    'proj_reipppp_010',
    'infrastructure_upliftment',
    2022,
    185000000.00,
    'material',
    'Kathu Solar Community Trust',
    'report_accepted',
    datetime('now', '+60 days'),
    0,
    '2025-11-20T09:00:00Z',
    '2026-02-14T14:00:00Z',
    NULL,
    NULL,
    NULL,
    '2025-07-10T08:00:00Z',
    '2026-02-14T14:00:00Z'
  ),
  (
    'ctr_011',
    'p_ipp_dev_001',
    'proj_reipppp_011',
    'socio_economic_development',
    2024,
    9750000.00,
    'significant',
    'Excelsior Wind Community Trust',
    'report_rejected',
    datetime('now', '-5 days'),
    1,
    '2025-10-05T11:00:00Z',
    NULL,
    '2026-01-30T15:00:00Z',
    NULL,
    NULL,
    '2026-04-02T08:00:00Z',
    '2026-01-30T15:00:00Z'
  ),
  (
    'ctr_012',
    'p_ipp_dev_001',
    'proj_reipppp_012',
    'education_bursary',
    2023,
    3200000.00,
    'moderate',
    'Amakhala Emoyeni Community Trust',
    'appeal_filed',
    datetime('now', '+42 days'),
    0,
    '2025-09-18T10:00:00Z',
    NULL,
    '2025-12-10T14:00:00Z',
    '2026-02-05T09:00:00Z',
    NULL,
    '2025-06-05T08:00:00Z',
    '2026-02-05T09:00:00Z'
  );
