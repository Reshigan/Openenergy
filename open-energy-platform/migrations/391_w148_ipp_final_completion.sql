-- W148: IPP Final Completion Certificate & Retention Release
-- JBCC 6.2 Cl.27-29 + NEC4 Cl.53-54
-- INVERTED SLA: larger contract = more review time
-- SIGNATURE: issue_fcc EVERY tier (NERSA COD milestone); reject_application major/material

CREATE TABLE IF NOT EXISTS oe_ipp_final_completion (
  id                          TEXT PRIMARY KEY,
  participant_id              TEXT NOT NULL,
  project_id                  TEXT NOT NULL,
  contract_value_zar          REAL NOT NULL,
  retention_amount_zar        REAL NOT NULL,
  contract_tier               TEXT NOT NULL CHECK(contract_tier IN (
                                'minor','moderate','significant','major','material')),
  practical_completion_date   TEXT NOT NULL,
  dlp_end_date                TEXT NOT NULL,
  description                 TEXT,
  snag_count                  INTEGER,
  fcc_issued_at               TEXT,
  retention_released_at       TEXT,
  chain_status                TEXT NOT NULL DEFAULT 'application_submitted' CHECK(chain_status IN (
                                'application_submitted','defects_outstanding',
                                'inspection_scheduled','inspection_complete',
                                'snag_list_issued','snag_list_cleared',
                                'fcc_issued','retention_released',
                                'disputed','adjudicated','withdrawn','rejected')),
  sla_due_at                  TEXT,
  sla_breached                INTEGER NOT NULL DEFAULT 0,
  -- per-state timestamps
  inspection_scheduled_at     TEXT,
  inspection_completed_at     TEXT,
  snag_list_issued_at         TEXT,
  snag_list_cleared_at        TEXT,
  disputed_at                 TEXT,
  adjudicated_at              TEXT,
  rejected_at                 TEXT,
  withdrawn_at                TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ippfcc_participant ON oe_ipp_final_completion(participant_id);
CREATE INDEX IF NOT EXISTS idx_ippfcc_project ON oe_ipp_final_completion(project_id);
CREATE INDEX IF NOT EXISTS idx_ippfcc_status ON oe_ipp_final_completion(chain_status);
CREATE INDEX IF NOT EXISTS idx_ippfcc_sla ON oe_ipp_final_completion(sla_due_at) WHERE sla_breached = 0;

-- Seed: 12 FCC applications across tiers and stages
INSERT INTO oe_ipp_final_completion VALUES
  -- Completed FCC + retention released: small rooftop, minor tier
  ('ippfcc_001','id_7c352b86da89907a85266a250e15db95','proj_rooftop_001',
   4200000,210000,'minor',
   '2025-09-01T00:00:00Z','2025-12-01T00:00:00Z',
   'Rooftop PV 500kW — DLP complete, all defects cleared',
   0,datetime('now','-20 days'),datetime('now','-10 days'),
   'retention_released',datetime('now','+0 days'),0,
   datetime('now','-60 days'),datetime('now','-55 days'),NULL,NULL,NULL,NULL,NULL,NULL,
   datetime('now','-90 days'),datetime('now','-10 days')),

  -- FCC issued, awaiting retention release
  ('ippfcc_002','id_7c352b86da89907a85266a250e15db95','proj_nxt_solar_001',
   28000000,1400000,'significant',
   '2025-10-15T00:00:00Z','2026-01-15T00:00:00Z',
   '10MW ground-mount — FCC issued, 30-day retention window running',
   3,datetime('now','-5 days'),NULL,
   'fcc_issued',datetime('now','+25 days'),0,
   datetime('now','-30 days'),datetime('now','-20 days'),datetime('now','-18 days'),datetime('now','-12 days'),NULL,NULL,NULL,NULL,
   datetime('now','-35 days'),datetime('now','-5 days')),

  -- Snag list cleared, FCC pending
  ('ippfcc_003','id_7c352b86da89907a85266a250e15db95','proj_nxt_solar_001',
   65000000,3250000,'significant',
   '2025-11-01T00:00:00Z','2026-02-01T00:00:00Z',
   '20MW PV + BESS — snag list cleared, Engineer issuing FCC',
   8,NULL,NULL,
   'snag_list_cleared',datetime('now','+10 days'),0,
   datetime('now','-15 days'),datetime('now','-10 days'),datetime('now','-8 days'),datetime('now','-3 days'),NULL,NULL,NULL,NULL,
   datetime('now','-20 days'),datetime('now','-3 days')),

  -- Snag list active
  ('ippfcc_004','id_7c352b86da89907a85266a250e15db95','proj_wind_alpha_001',
   180000000,9000000,'major',
   '2025-12-01T00:00:00Z','2026-03-01T00:00:00Z',
   '50MW wind — 14 snags outstanding post-inspection',
   14,NULL,NULL,
   'snag_list_issued',datetime('now','+30 days'),0,
   datetime('now','-10 days'),datetime('now','-6 days'),datetime('now','-4 days'),NULL,NULL,NULL,NULL,NULL,
   datetime('now','-12 days'),datetime('now','-4 days')),

  -- Inspection complete, snag list pending
  ('ippfcc_005','id_7c352b86da89907a85266a250e15db95','proj_wind_alpha_001',
   320000000,16000000,'major',
   '2026-01-01T00:00:00Z','2026-04-01T00:00:00Z',
   '100MW wind Phase 2 — inspection done, Engineer compiling snag list',
   NULL,NULL,NULL,
   'inspection_complete',datetime('now','+45 days'),0,
   datetime('now','-5 days'),datetime('now','-2 days'),NULL,NULL,NULL,NULL,NULL,NULL,
   datetime('now','-7 days'),datetime('now','-2 days')),

  -- Inspection scheduled
  ('ippfcc_006','id_7c352b86da89907a85266a250e15db95','proj_solar_karoo_001',
   85000000,4250000,'significant',
   '2026-02-01T00:00:00Z','2026-05-01T00:00:00Z',
   '30MW Karoo Solar — DLP ended, inspection scheduled for next week',
   NULL,NULL,NULL,
   'inspection_scheduled',datetime('now','+38 days'),0,
   datetime('now','-1 days'),NULL,NULL,NULL,NULL,NULL,NULL,NULL,
   datetime('now','-3 days'),datetime('now','-1 days')),

  -- Application submitted — large material tier
  ('ippfcc_007','id_7c352b86da89907a85266a250e15db95','proj_hvdc_001',
   750000000,37500000,'material',
   '2026-03-01T00:00:00Z','2026-06-01T00:00:00Z',
   '200MW HVDC interconnect — DLP ended, FCC application lodged',
   NULL,NULL,NULL,
   'application_submitted',datetime('now','+85 days'),0,
   NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
   datetime('now','-2 days'),datetime('now','-2 days')),

  -- Defects outstanding — DLP not cleared
  ('ippfcc_008','id_7c352b86da89907a85266a250e15db95','proj_solar_karoo_001',
   42000000,2100000,'significant',
   '2025-08-01T00:00:00Z','2025-11-01T00:00:00Z',
   '15MW carport — DLP defects still open; application returned',
   NULL,NULL,NULL,
   'defects_outstanding',datetime('now','+5 days'),1,
   NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
   datetime('now','-45 days'),datetime('now','-5 days')),

  -- Disputed rejection
  ('ippfcc_009','id_7c352b86da89907a85266a250e15db95','proj_rooftop_002',
   8500000,425000,'moderate',
   '2025-07-01T00:00:00Z','2025-10-01T00:00:00Z',
   '3MW agri-PV — Engineer rejected application; contractor disputing snag assessment',
   5,NULL,NULL,
   'disputed',datetime('now','-2 days'),1,
   datetime('now','-35 days'),datetime('now','-30 days'),datetime('now','-28 days'),NULL,datetime('now','-10 days'),NULL,NULL,NULL,
   datetime('now','-40 days'),datetime('now','-10 days')),

  -- Adjudicated
  ('ippfcc_010','id_7c352b86da89907a85266a250e15db95','proj_rooftop_002',
   15000000,750000,'moderate',
   '2025-06-01T00:00:00Z','2025-09-01T00:00:00Z',
   '5MW C&I rooftop — adjudication awarded partial snag acceptance',
   3,NULL,NULL,
   'adjudicated',NULL,0,
   datetime('now','-60 days'),datetime('now','-55 days'),datetime('now','-52 days'),NULL,datetime('now','-30 days'),datetime('now','-10 days'),NULL,NULL,
   datetime('now','-70 days'),datetime('now','-10 days')),

  -- Withdrawn — project transferred
  ('ippfcc_011','id_7c352b86da89907a85266a250e15db95','proj_wind_beta_001',
   95000000,4750000,'significant',
   '2025-10-01T00:00:00Z','2026-01-01T00:00:00Z',
   'Wind park Phase 1 — FCC application withdrawn; project ownership transfer',
   NULL,NULL,NULL,
   'withdrawn',NULL,0,
   NULL,NULL,NULL,NULL,NULL,NULL,NULL,datetime('now','-15 days'),
   datetime('now','-20 days'),datetime('now','-15 days')),

  -- Rejected major (crosses regulator)
  ('ippfcc_012','id_7c352b86da89907a85266a250e15db95','proj_hvdc_001',
   220000000,11000000,'major',
   '2025-09-01T00:00:00Z','2025-12-01T00:00:00Z',
   '80MW solar + storage — FCC rejected: critical LVRT compliance failure',
   NULL,NULL,NULL,
   'rejected',NULL,0,
   datetime('now','-25 days'),datetime('now','-20 days'),datetime('now','-18 days'),NULL,NULL,NULL,datetime('now','-8 days'),NULL,
   datetime('now','-30 days'),datetime('now','-8 days'));
