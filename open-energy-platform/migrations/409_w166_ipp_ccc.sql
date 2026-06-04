-- W166: IPP Connection Cost Contribution (CCC) Negotiation
-- Connection cost contribution negotiation lifecycle for IPPs connecting to the
-- national grid under NERSA Grid Code Chapter C / NTCSA cost-sharing rules:
-- load-flow study → cost assessment → IPP review → negotiation → expert
-- determination (if disputed) → provisional agreement → regulatory
-- determination (NERSA) → ccc_agreed / ccc_rejected.
--
-- 18 columns:
--   id, participant_id, project_id, ccc_category, ccc_amount_zar,
--   ccc_tier, network_operator, grid_connection_ref,
--   chain_status, sla_due_at, sla_breached, expert_appointed_at,
--   provisional_agreement_at, ccc_agreed_at, ccc_rejected_at,
--   nersa_referral_at, created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_ccc_negotiations` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  ccc_category TEXT NOT NULL CHECK(ccc_category IN ('line_extension','substation_upgrade','protection_relay','reactive_compensation','metering_telecoms','combined')),
  ccc_amount_zar REAL NOT NULL DEFAULT 0,
  ccc_tier TEXT NOT NULL DEFAULT 'minor' CHECK(ccc_tier IN ('minor','moderate','significant','major','material')),
  network_operator TEXT NOT NULL,
  grid_connection_ref TEXT,
  chain_status TEXT NOT NULL DEFAULT 'ccc_initiated',
  sla_due_at TEXT NOT NULL,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  expert_appointed_at TEXT,
  provisional_agreement_at TEXT,
  ccc_agreed_at TEXT,
  ccc_rejected_at TEXT,
  nersa_referral_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_ccc_participant
  ON oe_ipp_ccc_negotiations(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_ccc_project
  ON oe_ipp_ccc_negotiations(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_ccc_status
  ON oe_ipp_ccc_negotiations(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_ccc_sla
  ON oe_ipp_ccc_negotiations(sla_due_at)
  WHERE sla_breached = 0;

-- 12 seed rows, 18 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:ccc_category  5:ccc_amount_zar
--  6:ccc_tier  7:network_operator  8:grid_connection_ref
--  9:chain_status  10:sla_due_at  11:sla_breached  12:expert_appointed_at
--  13:provisional_agreement_at  14:ccc_agreed_at  15:ccc_rejected_at
--  16:nersa_referral_at  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_ccc_negotiations VALUES
  (
    'ccc_001',
    'p_ipp_dev_001',
    'proj_reipppp_001',
    'metering_telecoms',
    1850000.0,
    'minor',
    'Eskom Distribution',
    NULL,
    'ccc_initiated',
    datetime('now', '+30 days'),
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
    'ccc_002',
    'p_ipp_dev_001',
    'proj_reipppp_002',
    'protection_relay',
    3200000.0,
    'minor',
    'City Power (CoJ)',
    NULL,
    'load_flow_study',
    datetime('now', '+45 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-04-15T09:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'ccc_003',
    'p_ipp_dev_001',
    'proj_reipppp_003',
    'reactive_compensation',
    12500000.0,
    'moderate',
    'Eskom Distribution',
    'GCA/2024/WEC/KW001',
    'cost_assessment',
    datetime('now', '+28 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-03-10T08:00:00Z',
    '2026-05-22T10:00:00Z'
  ),
  (
    'ccc_004',
    'p_ipp_dev_001',
    'proj_reipppp_004',
    'line_extension',
    22000000.0,
    'moderate',
    'eThekwini Electricity',
    'GCA/2025/SPV/MP002',
    'ipp_review',
    datetime('now', '+21 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-02-18T08:00:00Z',
    '2026-05-10T09:00:00Z'
  ),
  (
    'ccc_005',
    'p_ipp_dev_001',
    'proj_reipppp_005',
    'substation_upgrade',
    48000000.0,
    'significant',
    'Eskom Transmission',
    'GCA/2024/WEC/KW001',
    'negotiation_in_progress',
    datetime('now', '+35 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-03-05T08:00:00Z',
    '2026-04-28T11:00:00Z'
  ),
  (
    'ccc_006',
    'p_ipp_dev_001',
    'proj_reipppp_006',
    'combined',
    87500000.0,
    'significant',
    'Cape Town Electricity',
    'GCA/2025/SPV/MP002',
    'expert_determination',
    datetime('now', '+42 days'),
    0,
    '2026-05-01T09:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-01-22T08:00:00Z',
    '2026-05-18T14:00:00Z'
  ),
  (
    'ccc_007',
    'p_ipp_dev_001',
    'proj_reipppp_007',
    'line_extension',
    145000000.0,
    'major',
    'Eskom Transmission',
    'GCA/2024/WEC/KW001',
    'provisional_agreement',
    datetime('now', '+60 days'),
    0,
    '2026-03-15T10:00:00Z',
    '2026-05-12T14:00:00Z',
    NULL,
    NULL,
    NULL,
    '2025-12-01T08:00:00Z',
    '2026-05-12T14:00:00Z'
  ),
  (
    'ccc_008',
    'p_ipp_dev_001',
    'proj_reipppp_008',
    'substation_upgrade',
    320000000.0,
    'major',
    'Eskom Transmission',
    'GCA/2025/SPV/MP002',
    'dispute_filed',
    datetime('now', '-5 days'),
    1,
    '2026-02-20T11:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-01-10T08:00:00Z',
    '2026-03-01T11:00:00Z'
  ),
  (
    'ccc_009',
    'p_ipp_dev_001',
    'proj_reipppp_009',
    'combined',
    475000000.0,
    'major',
    'Eskom Transmission',
    'GCA/2024/WEC/KW001',
    'arbitration_in_progress',
    datetime('now', '+90 days'),
    0,
    '2026-01-18T09:00:00Z',
    NULL,
    NULL,
    NULL,
    '2026-04-10T10:00:00Z',
    '2025-08-14T08:00:00Z',
    '2026-04-10T10:00:00Z'
  ),
  (
    'ccc_010',
    'p_ipp_dev_001',
    'proj_reipppp_010',
    'reactive_compensation',
    680000000.0,
    'material',
    'Eskom Transmission',
    'GCA/2025/SPV/MP002',
    'regulatory_determination',
    datetime('now', '+120 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-03-22T08:00:00Z',
    '2025-07-10T08:00:00Z',
    '2026-03-22T08:00:00Z'
  ),
  (
    'ccc_011',
    'p_ipp_dev_001',
    'proj_reipppp_011',
    'metering_telecoms',
    920000000.0,
    'material',
    'Eskom Transmission',
    'GCA/2024/WEC/KW001',
    'ccc_agreed',
    datetime('now', '-10 days'),
    1,
    '2025-10-05T11:00:00Z',
    '2026-01-18T13:00:00Z',
    '2026-04-02T15:00:00Z',
    NULL,
    NULL,
    '2026-04-02T08:00:00Z',
    '2026-04-02T15:00:00Z'
  ),
  (
    'ccc_012',
    'p_ipp_dev_001',
    'proj_reipppp_012',
    'protection_relay',
    54000000.0,
    'significant',
    'Cape Town Electricity',
    'GCA/2025/SPV/MP002',
    'ccc_rejected',
    datetime('now', '+14 days'),
    0,
    '2025-09-18T10:00:00Z',
    NULL,
    NULL,
    '2026-05-28T09:00:00Z',
    '2026-05-20T08:00:00Z',
    '2025-06-05T08:00:00Z',
    '2026-05-28T09:00:00Z'
  );
