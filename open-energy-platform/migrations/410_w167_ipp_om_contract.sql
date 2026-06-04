-- W167: IPP O&M Contract Renewal & Novation
-- O&M contract renewal and novation lifecycle for IPP projects under REIPPPP
-- and NERSA generation licence conditions: renewal_triggered → market_sounding
-- → tender_issued → bids_received → evaluation_complete →
-- preferred_bidder_selected → lender_consent → nersa_acknowledgement →
-- contract_executed / renewal_failed / novation_pending → novation_executed.
--
-- 18 columns:
--   id, participant_id, project_id, om_contract_category, annual_om_value_zar,
--   om_value_tier, contractor_name, contract_expiry_date,
--   chain_status, sla_due_at, sla_breached, preferred_bidder_name,
--   lender_consent_at, contract_executed_at, renewal_failed_at,
--   novation_executed_at, created_at, updated_at

CREATE TABLE IF NOT EXISTS `oe_ipp_om_contracts` (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  om_contract_category TEXT NOT NULL CHECK(om_contract_category IN ('full_om','maintenance_only','operations_only','asset_management','specialist_equipment','novation')),
  annual_om_value_zar REAL NOT NULL DEFAULT 0,
  om_value_tier TEXT NOT NULL DEFAULT 'minor' CHECK(om_value_tier IN ('minor','moderate','significant','major','material')),
  contractor_name TEXT NOT NULL,
  contract_expiry_date TEXT,
  chain_status TEXT NOT NULL DEFAULT 'renewal_triggered',
  sla_due_at TEXT NOT NULL,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  preferred_bidder_name TEXT,
  lender_consent_at TEXT,
  contract_executed_at TEXT,
  renewal_failed_at TEXT,
  novation_executed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_om_contract_participant
  ON oe_ipp_om_contracts(participant_id);

CREATE INDEX IF NOT EXISTS idx_ipp_om_contract_project
  ON oe_ipp_om_contracts(project_id);

CREATE INDEX IF NOT EXISTS idx_ipp_om_contract_status
  ON oe_ipp_om_contracts(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_om_contract_sla
  ON oe_ipp_om_contracts(sla_due_at)
  WHERE sla_breached = 0;

-- 12 seed rows, 18 values each.
-- Column order:
--  1:id  2:participant_id  3:project_id  4:om_contract_category  5:annual_om_value_zar
--  6:om_value_tier  7:contractor_name  8:contract_expiry_date
--  9:chain_status  10:sla_due_at  11:sla_breached  12:preferred_bidder_name
--  13:lender_consent_at  14:contract_executed_at  15:renewal_failed_at
--  16:novation_executed_at  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_om_contracts VALUES
  (
    'omc_001',
    'p_ipp_dev_001',
    'proj_reipppp_001',
    'full_om',
    1750000.0,
    'minor',
    'SolarEdge O&M Services',
    '2025-06-30',
    'renewal_triggered',
    datetime('now', '+30 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-05-10T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'omc_002',
    'p_ipp_dev_001',
    'proj_reipppp_002',
    'maintenance_only',
    1400000.0,
    'minor',
    'ABB South Africa',
    '2025-06-30',
    'market_sounding',
    datetime('now', '+45 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-04-18T08:00:00Z',
    '2026-06-04T08:00:00Z'
  ),
  (
    'omc_003',
    'p_ipp_dev_001',
    'proj_reipppp_003',
    'operations_only',
    5800000.0,
    'moderate',
    'Enel Green Power SA',
    '2026-03-31',
    'tender_issued',
    datetime('now', '+28 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-03-05T08:00:00Z',
    '2026-05-20T10:00:00Z'
  ),
  (
    'omc_004',
    'p_ipp_dev_001',
    'proj_reipppp_004',
    'asset_management',
    8500000.0,
    'moderate',
    'Siemens Gamesa SA',
    '2024-12-31',
    'bids_received',
    datetime('now', '+21 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-02-12T08:00:00Z',
    '2026-05-14T09:00:00Z'
  ),
  (
    'omc_005',
    'p_ipp_dev_001',
    'proj_reipppp_005',
    'specialist_equipment',
    18500000.0,
    'significant',
    'GE Renewable Energy SA',
    '2026-03-31',
    'evaluation_complete',
    datetime('now', '+35 days'),
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '2026-01-20T08:00:00Z',
    '2026-04-30T11:00:00Z'
  ),
  (
    'omc_006',
    'p_ipp_dev_001',
    'proj_reipppp_006',
    'full_om',
    42000000.0,
    'significant',
    'Vestas Southern Africa',
    '2025-06-30',
    'preferred_bidder_selected',
    datetime('now', '+42 days'),
    0,
    'Vestas Southern Africa',
    NULL,
    NULL,
    NULL,
    NULL,
    '2025-12-08T08:00:00Z',
    '2026-05-16T14:00:00Z'
  ),
  (
    'omc_007',
    'p_ipp_dev_001',
    'proj_reipppp_007',
    'maintenance_only',
    75000000.0,
    'major',
    'EDF Renouvelables Africa',
    '2024-12-31',
    'lender_consent',
    datetime('now', '+60 days'),
    0,
    'EDF Renouvelables Africa',
    '2026-04-22T10:00:00Z',
    NULL,
    NULL,
    NULL,
    '2025-09-15T08:00:00Z',
    '2026-04-22T10:00:00Z'
  ),
  (
    'omc_008',
    'p_ipp_dev_001',
    'proj_reipppp_008',
    'operations_only',
    130000000.0,
    'major',
    'Enel Green Power SA',
    '2026-03-31',
    'nersa_acknowledgement',
    datetime('now', '-3 days'),
    1,
    'Enel Green Power SA',
    '2026-03-10T11:00:00Z',
    NULL,
    NULL,
    NULL,
    '2025-07-22T08:00:00Z',
    '2026-03-10T11:00:00Z'
  ),
  (
    'omc_009',
    'p_ipp_dev_001',
    'proj_reipppp_009',
    'asset_management',
    250000000.0,
    'material',
    'GE Renewable Energy SA',
    '2025-06-30',
    'contract_executed',
    datetime('now', '+90 days'),
    0,
    'GE Renewable Energy SA',
    '2025-11-18T09:00:00Z',
    '2026-02-14T15:00:00Z',
    NULL,
    NULL,
    '2025-05-10T08:00:00Z',
    '2026-02-14T15:00:00Z'
  ),
  (
    'omc_010',
    'p_ipp_dev_001',
    'proj_reipppp_010',
    'specialist_equipment',
    380000000.0,
    'material',
    'Siemens Gamesa SA',
    '2024-12-31',
    'renewal_failed',
    datetime('now', '-7 days'),
    1,
    'Siemens Gamesa SA',
    NULL,
    NULL,
    '2026-05-28T09:00:00Z',
    NULL,
    '2025-04-03T08:00:00Z',
    '2026-05-28T09:00:00Z'
  ),
  (
    'omc_011',
    'p_ipp_dev_001',
    'proj_reipppp_011',
    'novation',
    95000000.0,
    'major',
    'ABB South Africa',
    NULL,
    'novation_pending',
    datetime('now', '+50 days'),
    0,
    'ABB South Africa',
    '2026-04-05T10:00:00Z',
    NULL,
    NULL,
    NULL,
    '2026-01-14T08:00:00Z',
    '2026-04-05T10:00:00Z'
  ),
  (
    'omc_012',
    'p_ipp_dev_001',
    'proj_reipppp_012',
    'novation',
    28000000.0,
    'significant',
    'Vestas Southern Africa',
    NULL,
    'novation_executed',
    datetime('now', '+14 days'),
    0,
    'Vestas Southern Africa',
    '2025-10-12T09:00:00Z',
    NULL,
    NULL,
    '2026-03-18T16:00:00Z',
    '2025-08-20T08:00:00Z',
    '2026-03-18T16:00:00Z'
  );
