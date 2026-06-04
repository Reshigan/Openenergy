-- W173: IPP Force Majeure
-- Force Majeure relief lifecycle for IPP projects under PPA/Concession Agreement terms:
-- fm_identified → fm_notice_issued → counterparty_acknowledgment →
-- ie_assessment_requested → ie_assessment_in_progress → ie_report_issued →
-- relief_quantified → negotiation_in_progress →
-- relief_agreed / relief_refused / arbitration_commenced.
--
-- 17 columns:
--   id, participant_id, project_id, fm_category, relief_type,
--   estimated_relief_zar, fm_severity_tier, counterparty_name, ie_firm_name,
--   chain_status, sla_due_at, sla_breached,
--   fm_notice_issued_at, ie_report_issued_at, fm_resolved_at,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_force_majeure` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  fm_category TEXT NOT NULL CHECK(fm_category IN ('natural_disaster','grid_unavailability','political_event','change_in_law','pandemic','civil_unrest')),
  relief_type TEXT NOT NULL CHECK(relief_type IN ('time_extension','cost_relief','time_and_cost','tariff_adjustment','termination_right')),
  estimated_relief_zar REAL NOT NULL DEFAULT 0,
  fm_severity_tier TEXT NOT NULL DEFAULT 'minor' CHECK(fm_severity_tier IN ('minor','moderate','material','major','critical')),
  counterparty_name TEXT,
  ie_firm_name TEXT,
  chain_status TEXT NOT NULL DEFAULT 'fm_identified',
  sla_due_at TEXT NOT NULL,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  fm_notice_issued_at TEXT,
  ie_report_issued_at TEXT,
  fm_resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_fm_participant
  ON oe_ipp_force_majeure(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_fm_project
  ON oe_ipp_force_majeure(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_fm_status
  ON oe_ipp_force_majeure(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_fm_sla
  ON oe_ipp_force_majeure(sla_due_at)
  WHERE sla_breached = 0;

-- 11 seed rows, 17 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:fm_category  5:relief_type
--  6:estimated_relief_zar  7:fm_severity_tier  8:counterparty_name  9:ie_firm_name
--  10:chain_status  11:sla_due_at  12:sla_breached
--  13:fm_notice_issued_at  14:ie_report_issued_at  15:fm_resolved_at
--  16:created_at  17:updated_at

INSERT OR IGNORE INTO oe_ipp_force_majeure VALUES
  (
    'fm_001',
    'p_ipp_dev_001',
    'proj_reipppp_001',
    'natural_disaster',
    'time_extension',
    500000.0,
    'minor',
    NULL,
    NULL,
    'fm_identified',
    datetime('now', '+14 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-05-28T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'fm_002',
    'p_ipp_dev_001',
    'proj_reipppp_002',
    'grid_unavailability',
    'cost_relief',
    5000000.0,
    'moderate',
    'Eskom Holdings SOC Ltd',
    NULL,
    'fm_notice_issued',
    datetime('now', '+21 days'),
    0,
    '2026-05-20T09:00:00Z',
    NULL,
    NULL,
    '2026-04-15T08:00:00Z',
    '2026-05-20T09:00:00Z'
  ),
  (
    'fm_003',
    'p_ipp_dev_001',
    'proj_reipppp_003',
    'political_event',
    'time_and_cost',
    25000000.0,
    'material',
    'National Treasury',
    NULL,
    'counterparty_acknowledgment',
    datetime('now', '+30 days'),
    0,
    '2026-04-08T10:00:00Z',
    NULL,
    NULL,
    '2026-03-01T08:00:00Z',
    '2026-04-08T10:00:00Z'
  ),
  (
    'fm_004',
    'p_ipp_dev_001',
    'proj_reipppp_004',
    'change_in_law',
    'tariff_adjustment',
    5000000.0,
    'moderate',
    'NERSA',
    NULL,
    'ie_assessment_requested',
    datetime('now', '+25 days'),
    0,
    '2026-03-22T11:00:00Z',
    NULL,
    NULL,
    '2026-02-10T08:00:00Z',
    '2026-03-22T11:00:00Z'
  ),
  (
    'fm_005',
    'p_ipp_dev_001',
    'proj_reipppp_005',
    'pandemic',
    'time_extension',
    25000000.0,
    'material',
    'City of Cape Town',
    'Aurecon',
    'ie_assessment_in_progress',
    datetime('now', '+18 days'),
    0,
    '2026-02-14T09:00:00Z',
    NULL,
    NULL,
    '2026-01-05T08:00:00Z',
    '2026-02-14T09:00:00Z'
  ),
  (
    'fm_006',
    'p_ipp_dev_001',
    'proj_reipppp_006',
    'civil_unrest',
    'cost_relief',
    100000000.0,
    'major',
    'Transnet SOC Ltd',
    'WSP Global',
    'ie_report_issued',
    datetime('now', '+14 days'),
    0,
    '2025-12-10T10:00:00Z',
    '2026-03-18T16:00:00Z',
    NULL,
    '2025-10-08T08:00:00Z',
    '2026-03-18T16:00:00Z'
  ),
  (
    'fm_007',
    'p_ipp_dev_001',
    'proj_reipppp_007',
    'natural_disaster',
    'time_and_cost',
    100000000.0,
    'major',
    'Eskom Holdings SOC Ltd',
    'Zutari',
    'relief_quantified',
    datetime('now', '+21 days'),
    0,
    '2025-10-15T11:00:00Z',
    '2026-01-22T15:00:00Z',
    NULL,
    '2025-08-20T08:00:00Z',
    '2026-01-22T15:00:00Z'
  ),
  (
    'fm_008',
    'p_ipp_dev_001',
    'proj_reipppp_008',
    'grid_unavailability',
    'termination_right',
    350000000.0,
    'critical',
    'City of Cape Town',
    'AECOM',
    'negotiation_in_progress',
    datetime('now', '+10 days'),
    0,
    '2025-08-05T09:00:00Z',
    '2025-11-12T14:00:00Z',
    NULL,
    '2025-06-10T08:00:00Z',
    '2025-11-12T14:00:00Z'
  ),
  (
    'fm_009',
    'p_ipp_dev_001',
    'proj_reipppp_009',
    'change_in_law',
    'tariff_adjustment',
    350000000.0,
    'critical',
    'NERSA',
    'Hatch Consultants',
    'relief_agreed',
    datetime('now', '+90 days'),
    0,
    '2025-05-20T10:00:00Z',
    '2025-08-28T15:00:00Z',
    '2026-02-10T13:00:00Z',
    '2025-03-15T08:00:00Z',
    '2026-02-10T13:00:00Z'
  ),
  (
    'fm_010',
    'p_ipp_dev_001',
    'proj_reipppp_010',
    'pandemic',
    'time_extension',
    25000000.0,
    'material',
    'National Treasury',
    'Aurecon',
    'relief_refused',
    datetime('now', '-5 days'),
    1,
    '2025-03-12T11:00:00Z',
    '2025-06-18T16:00:00Z',
    '2026-01-15T10:00:00Z',
    '2025-01-20T08:00:00Z',
    '2026-01-15T10:00:00Z'
  ),
  (
    'fm_011',
    'p_ipp_dev_001',
    'proj_reipppp_011',
    'civil_unrest',
    'time_and_cost',
    100000000.0,
    'major',
    'Transnet SOC Ltd',
    'WSP Global',
    'arbitration_commenced',
    datetime('now', '+60 days'),
    0,
    '2025-01-08T09:00:00Z',
    '2025-04-22T15:00:00Z',
    '2025-11-30T11:00:00Z',
    '2024-11-05T08:00:00Z',
    '2025-11-30T11:00:00Z'
  );
