-- Wave 162: IPP LTA Drawdown Certificate chain
-- Independent Engineer / Lender Technical Adviser (LTA) drawdown certification
-- lifecycle: construction progress gates, cost-to-complete assessments, change-order
-- approvals, and commissioning-readiness sign-off under REIPPPP / project-finance
-- facility agreements.
--
-- 18 columns:
--   id, participant_id, project_id, drawdown_amount_zar, drawdown_tier,
--   certificate_category, drawdown_reference, lta_firm_name,
--   chain_status, sla_due_at, sla_breached, site_inspection_at,
--   draft_issued_at, final_issued_at, certificate_approved_at,
--   certificate_refused_at, created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_lta_certificates` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  drawdown_amount_zar REAL NOT NULL,
  drawdown_tier TEXT NOT NULL CHECK(drawdown_tier IN ('minor','moderate','significant','major','material')),
  certificate_category TEXT NOT NULL CHECK(certificate_category IN ('construction_progress','completion_certificate','cost_to_complete','change_order_approval','commissioning_readiness')),
  drawdown_reference TEXT,
  lta_firm_name TEXT,
  chain_status TEXT NOT NULL DEFAULT 'certificate_requested',
  sla_due_at TEXT,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  site_inspection_at TEXT,
  draft_issued_at TEXT,
  final_issued_at TEXT,
  certificate_approved_at TEXT,
  certificate_refused_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ipp_lta_participant
  ON oe_ipp_lta_certificates(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_lta_project
  ON oe_ipp_lta_certificates(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_lta_status
  ON oe_ipp_lta_certificates(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_lta_sla
  ON oe_ipp_lta_certificates(sla_due_at)
  WHERE sla_breached = 0;

-- 12 seed rows, 18 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:drawdown_amount_zar  5:drawdown_tier
--  6:certificate_category  7:drawdown_reference  8:lta_firm_name
--  9:chain_status  10:sla_due_at  11:sla_breached  12:site_inspection_at
--  13:draft_issued_at  14:final_issued_at  15:certificate_approved_at
--  16:certificate_refused_at  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_lta_certificates VALUES
  (
    'ipp_lta_a1b2c3d4e5f6g7h8i9j0k1l2',
    'part_ipp_001',
    'proj_001',
    32500000.00,
    'minor',
    'construction_progress',
    'DD-2024-001',
    'Aurecon (Pty) Ltd',
    'certificate_requested',
    '2026-06-18T23:59:59Z',
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
    'ipp_lta_b2c3d4e5f6g7h8i9j0k1l2m3',
    'part_ipp_002',
    'proj_002',
    44000000.00,
    'minor',
    'change_order_approval',
    'DD-2024-002',
    'WSP South Africa',
    'certificate_requested',
    '2026-06-25T23:59:59Z',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-05-28T09:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'ipp_lta_c3d4e5f6g7h8i9j0k1l2m3n4',
    'part_ipp_003',
    'proj_003',
    95000000.00,
    'moderate',
    'cost_to_complete',
    'DD-2024-003',
    'Hatch Engineering',
    'site_inspection_in_progress',
    '2026-06-20T23:59:59Z',
    0,
    '2026-06-02T09:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-05-10T10:00:00Z',
    '2026-06-02T09:00:00Z'
  ),
  (
    'ipp_lta_d4e5f6g7h8i9j0k1l2m3n4o5',
    'part_ipp_004',
    'proj_004',
    175000000.00,
    'moderate',
    'construction_progress',
    'DD-2024-004',
    'Zutari (Pty) Ltd',
    'progress_assessment',
    '2026-07-05T23:59:59Z',
    0,
    '2026-05-25T10:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-04-15T08:00:00Z',
    '2026-05-25T10:00:00Z'
  ),
  (
    'ipp_lta_e5f6g7h8i9j0k1l2m3n4o5p6',
    'part_ipp_001',
    'proj_005',
    420000000.00,
    'significant',
    'commissioning_readiness',
    'DD-2025-001',
    'SLR Consulting Africa',
    'draft_certificate_issued',
    '2026-06-15T23:59:59Z',
    0,
    '2026-05-08T09:00:00Z',
    '2026-05-30T14:00:00Z',
    NULL,
    NULL,
    NULL,
    '2026-03-20T08:00:00Z',
    '2026-05-30T14:00:00Z'
  ),
  (
    'ipp_lta_f6g7h8i9j0k1l2m3n4o5p6q7',
    'part_ipp_002',
    'proj_006',
    680000000.00,
    'significant',
    'completion_certificate',
    'DD-2025-002',
    'Aurecon (Pty) Ltd',
    'borrower_comments_submitted',
    '2026-06-10T23:59:59Z',
    1,
    '2026-04-12T11:00:00Z',
    '2026-05-02T15:00:00Z',
    NULL,
    NULL,
    NULL,
    '2026-02-18T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'ipp_lta_g7h8i9j0k1l2m3n4o5p6q7r8',
    'part_ipp_003',
    'proj_007',
    870000000.00,
    'significant',
    'cost_to_complete',
    'DD-2025-003',
    'WSP South Africa',
    'final_certificate_in_review',
    '2026-06-08T23:59:59Z',
    1,
    '2026-03-18T09:00:00Z',
    '2026-04-10T14:00:00Z',
    '2026-05-20T16:00:00Z',
    NULL,
    NULL,
    '2026-01-22T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'ipp_lta_h8i9j0k1l2m3n4o5p6q7r8s9',
    'part_ipp_004',
    'proj_008',
    1800000000.00,
    'major',
    'change_order_approval',
    'DD-2025-004',
    'Hatch Engineering',
    'certificate_approved',
    NULL,
    0,
    '2026-02-10T10:00:00Z',
    '2026-03-05T14:00:00Z',
    '2026-03-28T16:00:00Z',
    '2026-04-15T11:00:00Z',
    NULL,
    '2025-12-01T08:00:00Z',
    '2026-04-15T11:00:00Z'
  ),
  (
    'ipp_lta_i9j0k1l2m3n4o5p6q7r8s9t0',
    'part_ipp_001',
    'proj_009',
    3200000000.00,
    'major',
    'construction_progress',
    'DD-2025-005',
    'Zutari (Pty) Ltd',
    'certificate_approved',
    NULL,
    0,
    '2025-10-15T09:00:00Z',
    '2025-11-08T14:00:00Z',
    '2025-11-30T16:00:00Z',
    '2025-12-18T10:00:00Z',
    NULL,
    '2025-08-10T08:00:00Z',
    '2025-12-18T10:00:00Z'
  ),
  (
    'ipp_lta_j0k1l2m3n4o5p6q7r8s9t0u1',
    'part_ipp_002',
    'proj_010',
    3800000000.00,
    'major',
    'commissioning_readiness',
    'DD-2025-006',
    'SLR Consulting Africa',
    'certificate_qualified',
    '2026-07-30T23:59:59Z',
    0,
    '2026-04-22T11:00:00Z',
    '2026-05-18T15:00:00Z',
    '2026-06-01T17:00:00Z',
    NULL,
    NULL,
    '2026-02-05T08:00:00Z',
    '2026-06-01T17:00:00Z'
  ),
  (
    'ipp_lta_k1l2m3n4o5p6q7r8s9t0u1v2',
    'part_ipp_003',
    'proj_011',
    6200000000.00,
    'material',
    'completion_certificate',
    'DD-2025-007',
    'Aurecon (Pty) Ltd',
    'conditions_resolved',
    NULL,
    0,
    '2025-09-05T09:00:00Z',
    '2025-10-02T14:00:00Z',
    '2025-10-28T16:00:00Z',
    '2025-11-20T11:00:00Z',
    NULL,
    '2025-07-01T08:00:00Z',
    '2025-11-20T11:00:00Z'
  ),
  (
    'ipp_lta_l2m3n4o5p6q7r8s9t0u1v2w3',
    'part_ipp_004',
    'proj_012',
    8750000000.00,
    'material',
    'cost_to_complete',
    'DD-2025-008',
    'Hatch Engineering',
    'certificate_refused',
    NULL,
    0,
    '2025-07-14T10:00:00Z',
    '2025-08-11T15:00:00Z',
    NULL,
    NULL,
    '2025-09-03T13:00:00Z',
    '2025-05-20T08:00:00Z',
    '2025-09-03T13:00:00Z'
  );
