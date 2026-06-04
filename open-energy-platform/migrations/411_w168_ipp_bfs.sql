-- W168: IPP Bankable Feasibility Study (BFS) Update & Re-certification
-- BFS update and re-certification lifecycle for IPP projects under REIPPPP
-- and NERSA generation licence conditions: bfs_triggered → scope_definition
-- → data_collection → analysis_in_progress → draft_report → ie_review →
-- ie_queries_raised → queries_resolved → certification_pending →
-- bfs_certified / bfs_rejected / bfs_lapsed.
--
-- 18 columns:
--   id, participant_id, project_id, trigger_category, capacity_mw,
--   bfs_capacity_tier, ie_firm_name, bfs_reference,
--   p50_yield_gwh, p90_yield_gwh, chain_status, sla_due_at, sla_breached,
--   submitted_to_ie_at, bfs_certified_at, bfs_rejected_at,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_bfs_studies` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  trigger_category TEXT NOT NULL CHECK(trigger_category IN ('scope_change','component_substitution','tariff_rebid','resource_update','periodic_refresh','lender_request')),
  capacity_mw REAL NOT NULL DEFAULT 0,
  bfs_capacity_tier TEXT NOT NULL DEFAULT 'small' CHECK(bfs_capacity_tier IN ('small','medium','large','utility','strategic')),
  ie_firm_name TEXT,
  bfs_reference TEXT,
  p50_yield_gwh REAL,
  p90_yield_gwh REAL,
  chain_status TEXT NOT NULL DEFAULT 'bfs_triggered',
  sla_due_at TEXT NOT NULL,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  submitted_to_ie_at TEXT,
  bfs_certified_at TEXT,
  bfs_rejected_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_bfs_participant
  ON oe_ipp_bfs_studies(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_bfs_project
  ON oe_ipp_bfs_studies(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_bfs_status
  ON oe_ipp_bfs_studies(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_bfs_sla
  ON oe_ipp_bfs_studies(sla_due_at)
  WHERE sla_breached = 0;

-- 12 seed rows, 18 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:trigger_category  5:capacity_mw
--  6:bfs_capacity_tier  7:ie_firm_name  8:bfs_reference
--  9:p50_yield_gwh  10:p90_yield_gwh  11:chain_status  12:sla_due_at  13:sla_breached
--  14:submitted_to_ie_at  15:bfs_certified_at  16:bfs_rejected_at
--  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_bfs_studies VALUES
  (
    'bfs_001',
    'p_ipp_dev_001',
    'proj_reipppp_001',
    'scope_change',
    8.5,
    'small',
    NULL,
    NULL,
    NULL,
    NULL,
    'bfs_triggered',
    datetime('now', '+30 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-05-12T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'bfs_002',
    'p_ipp_dev_001',
    'proj_reipppp_002',
    'component_substitution',
    6.2,
    'small',
    'Aurecon',
    NULL,
    NULL,
    NULL,
    'scope_definition',
    datetime('now', '+45 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-04-22T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'bfs_003',
    'p_ipp_dev_001',
    'proj_reipppp_003',
    'tariff_rebid',
    32.0,
    'medium',
    'WSP Global',
    NULL,
    NULL,
    NULL,
    'data_collection',
    datetime('now', '+40 days'),
    0,
    NULL,
    NULL,
    NULL,
    '2026-03-18T08:00:00Z',
    '2026-05-25T10:00:00Z'
  ),
  (
    'bfs_004',
    'p_ipp_dev_001',
    'proj_reipppp_004',
    'resource_update',
    47.5,
    'medium',
    'Zutari',
    'BFS/2024/WEC/001',
    312.4,
    268.9,
    'analysis_in_progress',
    datetime('now', '+35 days'),
    0,
    '2026-04-10T09:00:00Z',
    NULL,
    NULL,
    '2026-02-14T08:00:00Z',
    '2026-05-18T11:00:00Z'
  ),
  (
    'bfs_005',
    'p_ipp_dev_001',
    'proj_reipppp_005',
    'periodic_refresh',
    85.0,
    'large',
    'Hatch Consultants',
    'BFS/2024/WEC/002',
    590.8,
    510.3,
    'draft_bfs_issued',
    datetime('now', '+28 days'),
    0,
    '2026-03-05T10:00:00Z',
    NULL,
    NULL,
    '2026-01-20T08:00:00Z',
    '2026-04-28T09:00:00Z'
  ),
  (
    'bfs_006',
    'p_ipp_dev_001',
    'proj_reipppp_006',
    'lender_request',
    150.0,
    'large',
    'SLR Consulting',
    'BFS/2025/SPV/001',
    1045.6,
    920.2,
    'ie_review',
    datetime('now', '+21 days'),
    0,
    '2026-04-01T11:00:00Z',
    NULL,
    NULL,
    '2025-12-10T08:00:00Z',
    '2026-04-01T11:00:00Z'
  ),
  (
    'bfs_007',
    'p_ipp_dev_001',
    'proj_reipppp_007',
    'scope_change',
    280.0,
    'utility',
    'AECOM',
    'BFS/2025/SPV/002',
    1924.5,
    1680.0,
    'queries_raised',
    datetime('now', '+14 days'),
    0,
    '2026-03-18T09:00:00Z',
    NULL,
    NULL,
    '2025-09-08T08:00:00Z',
    '2026-03-20T14:00:00Z'
  ),
  (
    'bfs_008',
    'p_ipp_dev_001',
    'proj_reipppp_008',
    'component_substitution',
    450.0,
    'utility',
    'GHD Advisory',
    'BFS/2025/SPV/003',
    3108.7,
    2740.1,
    'responses_submitted',
    datetime('now', '-4 days'),
    1,
    '2026-02-14T10:00:00Z',
    NULL,
    NULL,
    '2025-07-15T08:00:00Z',
    '2026-02-14T10:00:00Z'
  ),
  (
    'bfs_009',
    'p_ipp_dev_001',
    'proj_reipppp_009',
    'tariff_rebid',
    620.0,
    'strategic',
    'Aurecon',
    'BFS/2025/SPV/004',
    4280.3,
    3810.6,
    'ie_review',
    datetime('now', '+50 days'),
    0,
    '2026-01-22T11:00:00Z',
    NULL,
    NULL,
    '2025-05-20T08:00:00Z',
    '2026-01-22T11:00:00Z'
  ),
  (
    'bfs_010',
    'p_ipp_dev_001',
    'proj_reipppp_010',
    'resource_update',
    750.0,
    'strategic',
    'WSP Global',
    'BFS/2024/WEC/003',
    5190.4,
    4620.8,
    'bfs_certified',
    datetime('now', '+90 days'),
    0,
    '2025-10-05T09:00:00Z',
    '2026-02-28T15:00:00Z',
    NULL,
    '2025-04-10T08:00:00Z',
    '2026-02-28T15:00:00Z'
  ),
  (
    'bfs_011',
    'p_ipp_dev_001',
    'proj_reipppp_011',
    'periodic_refresh',
    110.0,
    'large',
    'Zutari',
    'BFS/2024/WEC/004',
    762.5,
    680.1,
    'bfs_rejected',
    datetime('now', '-6 days'),
    1,
    '2025-11-12T10:00:00Z',
    NULL,
    '2026-05-20T09:00:00Z',
    '2025-08-05T08:00:00Z',
    '2026-05-20T09:00:00Z'
  ),
  (
    'bfs_012',
    'p_ipp_dev_001',
    'proj_reipppp_012',
    'lender_request',
    38.0,
    'medium',
    'Hatch Consultants',
    'BFS/2025/SPV/005',
    262.9,
    228.4,
    'bfs_rejected',
    datetime('now', '+14 days'),
    0,
    '2025-12-20T11:00:00Z',
    NULL,
    NULL,
    '2025-06-18T08:00:00Z',
    '2026-03-15T16:00:00Z'
  );
