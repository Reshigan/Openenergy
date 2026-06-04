-- Migration 429: Wave 186 — IPP Equity Transfer Chain
-- Table: oe_ipp_equity_transfers
-- 12-state chain covering REIPPPP equity transfer lifecycle
-- (secondary_sale / community_equity / dfi_exit / sponsor_reorg / debt_equity_swap)

CREATE TABLE IF NOT EXISTS oe_ipp_equity_transfers (
  id TEXT PRIMARY KEY,
  project_ref TEXT NOT NULL,
  transfer_type TEXT NOT NULL CHECK(transfer_type IN ('secondary_sale','community_equity','dfi_exit','sponsor_reorg','debt_equity_swap')),
  transferor_name TEXT,
  transferee_name TEXT,
  equity_quantum_zar REAL NOT NULL,
  equity_pct REAL,
  equity_tier TEXT NOT NULL CHECK(equity_tier IN ('micro','small','medium','large','flagship')),
  chain_status TEXT NOT NULL DEFAULT 'transfer_initiated' CHECK(chain_status IN (
    'transfer_initiated','due_diligence','regulatory_notification',
    'lender_consent_requested','offtaker_notification','nersa_review',
    'regulatory_clearance_issued','conditions_precedent_tracking',
    'cp_documentation_submitted','transfer_completed','transfer_rejected','transfer_lapsed'
  )),
  sla_due_date TEXT,
  sla_breached INTEGER DEFAULT 0,
  is_reportable INTEGER DEFAULT 0,
  actor_party TEXT,
  reason TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_eqt_status ON oe_ipp_equity_transfers(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_eqt_sla    ON oe_ipp_equity_transfers(sla_due_date, sla_breached);

-- ─── Seed: 12 rows — one per chain state ─────────────────────────────────────

-- eqt_001 · transfer_initiated · micro · community_equity · 30M ZAR · 10%
INSERT OR IGNORE INTO oe_ipp_equity_transfers
  (id, project_ref, transfer_type, transferor_name, transferee_name,
   equity_quantum_zar, equity_pct, equity_tier, chain_status,
   sla_due_date, sla_breached, is_reportable, actor_party,
   reason, notes)
VALUES
  ('eqt_001','WIND-EC-SML-002','community_equity','IDC','Renewables Infrastructure Group',
   30000000, 10, 'micro', 'transfer_initiated',
   '2026-05-15', 0, 0, 'p_ipp_dev_001',
   'Community equity release per REIPPPP Schedule 3 community trust requirements',
   'First tranche of community equity for Eastern Cape wind project');

-- eqt_002 · due_diligence · small · dfi_exit · 150M ZAR · 25% · sla_breached=1
INSERT OR IGNORE INTO oe_ipp_equity_transfers
  (id, project_ref, transfer_type, transferor_name, transferee_name,
   equity_quantum_zar, equity_pct, equity_tier, chain_status,
   sla_due_date, sla_breached, is_reportable, actor_party,
   reason, notes)
VALUES
  ('eqt_002','SOLAR-NC-LRG-007','dfi_exit','DBSA','InfraRed Capital Partners',
   150000000, 25, 'small', 'due_diligence',
   '2026-04-01', 1, 0, 'p_ipp_dev_002',
   'DBSA portfolio rebalancing — exit from Northern Cape solar to recycle capital',
   'Due diligence SLA breached; financial model reconciliation outstanding');

-- eqt_003 · regulatory_notification · medium · secondary_sale · 400M ZAR · 40%
INSERT OR IGNORE INTO oe_ipp_equity_transfers
  (id, project_ref, transfer_type, transferor_name, transferee_name,
   equity_quantum_zar, equity_pct, equity_tier, chain_status,
   sla_due_date, sla_breached, is_reportable, actor_party,
   reason, notes)
VALUES
  ('eqt_003','WIND-WC-LRG-011','secondary_sale','Actis Capital','Prescient Investment Management',
   400000000, 40, 'medium', 'regulatory_notification',
   '2026-05-20', 0, 0, 'p_ipp_dev_003',
   'Secondary sale following Actis fund maturity; NERSA notification filed per ERA s.11(3)',
   'Western Cape wind farm; DCCAE competition filing submitted in parallel');

-- eqt_004 · lender_consent_requested · medium · secondary_sale · 600M ZAR · 35% · sla_breached=1
INSERT OR IGNORE INTO oe_ipp_equity_transfers
  (id, project_ref, transfer_type, transferor_name, transferee_name,
   equity_quantum_zar, equity_pct, equity_tier, chain_status,
   sla_due_date, sla_breached, is_reportable, actor_party,
   reason, notes)
VALUES
  ('eqt_004','SOLAR-FS-MED-003','secondary_sale','Old Mutual Infrastructure Fund','GEPF Infrastructure Fund',
   600000000, 35, 'medium', 'lender_consent_requested',
   '2026-04-10', 1, 0, 'p_ipp_dev_001',
   'Transfer requires lender consent per security agreement change-of-control covenant',
   'Senior lender DFI consortium response overdue; standstill period invoked');

-- eqt_005 · offtaker_notification · large · dfi_exit · 900M ZAR · 30%
INSERT OR IGNORE INTO oe_ipp_equity_transfers
  (id, project_ref, transfer_type, transferor_name, transferee_name,
   equity_quantum_zar, equity_pct, equity_tier, chain_status,
   sla_due_date, sla_breached, is_reportable, actor_party,
   reason, notes)
VALUES
  ('eqt_005','WIND-KZN-LRG-005','dfi_exit','IDC','Meridian Capital SA',
   900000000, 30, 'large', 'offtaker_notification',
   '2026-06-01', 0, 0, 'p_ipp_dev_004',
   'IDC strategic exit post-COD; offtaker Eskom notified per PPA assignment clause',
   'PPA contains 30-day offtaker notification window before transfer can complete');

-- eqt_006 · nersa_review · large · secondary_sale · 1.2B ZAR · 51%
INSERT OR IGNORE INTO oe_ipp_equity_transfers
  (id, project_ref, transfer_type, transferor_name, transferee_name,
   equity_quantum_zar, equity_pct, equity_tier, chain_status,
   sla_due_date, sla_breached, is_reportable, actor_party,
   reason, notes)
VALUES
  ('eqt_006','SOLAR-LP-LRG-009','secondary_sale','Actis Capital','InfraRed Capital Partners',
   1200000000, 51, 'large', 'nersa_review',
   '2026-06-15', 0, 1, 'p_ipp_dev_002',
   'Majority stake transfer triggers full NERSA licence-condition review under ERA s.11',
   'NERSA technical panel convened; public comment period closed with 4 submissions');

-- eqt_007 · regulatory_clearance_issued · flagship · secondary_sale · 2.5B ZAR · 49%
INSERT OR IGNORE INTO oe_ipp_equity_transfers
  (id, project_ref, transfer_type, transferor_name, transferee_name,
   equity_quantum_zar, equity_pct, equity_tier, chain_status,
   sla_due_date, sla_breached, is_reportable, actor_party,
   reason, notes)
VALUES
  ('eqt_007','WIND-EC-FLG-001','secondary_sale','DBSA','Renewables Infrastructure Group',
   2500000000, 49, 'flagship', 'regulatory_clearance_issued',
   '2026-06-30', 0, 1, 'p_ipp_dev_005',
   'NERSA clearance issued; Competition Commission unconditional approval granted',
   'Landmark flagship wind project transfer; all regulatory clearances in hand, CPs tracking');

-- eqt_008 · conditions_precedent_tracking · medium · community_equity · 500M ZAR · 20%
INSERT OR IGNORE INTO oe_ipp_equity_transfers
  (id, project_ref, transfer_type, transferor_name, transferee_name,
   equity_quantum_zar, equity_pct, equity_tier, chain_status,
   sla_due_date, sla_breached, is_reportable, actor_party,
   reason, notes)
VALUES
  ('eqt_008','SOLAR-NW-MED-006','community_equity','Old Mutual Infrastructure Fund','Prescient Investment Management',
   500000000, 20, 'medium', 'conditions_precedent_tracking',
   '2026-07-01', 0, 0, 'p_ipp_dev_003',
   'Community development trust formation CP outstanding; 3 of 8 CPs satisfied',
   'B-BBEE verification and trust registration at CIPC in progress');

-- eqt_009 · cp_documentation_submitted · small · sponsor_reorg · 100M ZAR · 100%
INSERT OR IGNORE INTO oe_ipp_equity_transfers
  (id, project_ref, transfer_type, transferor_name, transferee_name,
   equity_quantum_zar, equity_pct, equity_tier, chain_status,
   sla_due_date, sla_breached, is_reportable, actor_party,
   reason, notes)
VALUES
  ('eqt_009','WIND-MPU-SML-004','sponsor_reorg','Meridian Capital SA','Meridian Capital SA',
   100000000, 100, 'small', 'cp_documentation_submitted',
   '2026-07-15', 0, 0, 'p_ipp_dev_001',
   'Internal sponsor reorganisation; 100% transfer to wholly-owned subsidiary post-restructure',
   'All CP documents submitted to DFI security agent; awaiting confirmation of receipt');

-- eqt_010 · transfer_completed · large · dfi_exit · 1.8B ZAR · 40%
INSERT OR IGNORE INTO oe_ipp_equity_transfers
  (id, project_ref, transfer_type, transferor_name, transferee_name,
   equity_quantum_zar, equity_pct, equity_tier, chain_status,
   sla_due_date, sla_breached, is_reportable, actor_party,
   reason, notes)
VALUES
  ('eqt_010','SOLAR-WC-LRG-012','dfi_exit','IDC','GEPF Infrastructure Fund',
   1800000000, 40, 'large', 'transfer_completed',
   '2026-04-30', 0, 1, 'p_ipp_dev_004',
   'Transfer completed; share register updated, CIPC endorsement filed, NERSA licence endorsed',
   'IDC exit crystalised at 2.4x cost; GEPF now anchor equity holder');

-- eqt_011 · transfer_rejected · flagship · secondary_sale · 3B ZAR · 60% · is_reportable=1
INSERT OR IGNORE INTO oe_ipp_equity_transfers
  (id, project_ref, transfer_type, transferor_name, transferee_name,
   equity_quantum_zar, equity_pct, equity_tier, chain_status,
   sla_due_date, sla_breached, is_reportable, actor_party,
   reason, notes)
VALUES
  ('eqt_011','SOLAR-GA-FLG-002','secondary_sale','Actis Capital','InfraRed Capital Partners',
   3000000000, 60, 'flagship', 'transfer_rejected',
   '2026-05-30', 0, 1, 'p_ipp_dev_005',
   'NERSA rejected transfer: proposed transferee failed financial-fitness and technical-capacity criteria per ERA s.11(2)',
   'Flagship Gauteng solar project; rejection is reportable per REIPPPP DOE notification obligation');

-- eqt_012 · transfer_lapsed · micro · debt_equity_swap · 45M ZAR · 15%
INSERT OR IGNORE INTO oe_ipp_equity_transfers
  (id, project_ref, transfer_type, transferor_name, transferee_name,
   equity_quantum_zar, equity_pct, equity_tier, chain_status,
   sla_due_date, sla_breached, is_reportable, actor_party,
   reason, notes)
VALUES
  ('eqt_012','WIND-EC-MCR-008','debt_equity_swap','DBSA','Renewables Infrastructure Group',
   45000000, 15, 'micro', 'transfer_lapsed',
   '2026-04-15', 1, 0, 'p_ipp_dev_002',
   'Debt-equity swap agreement lapsed; DBSA elected not to exercise conversion right within 90-day window',
   'Conversion right expired unexercised; debt instrument remains in place, equity transfer void');
