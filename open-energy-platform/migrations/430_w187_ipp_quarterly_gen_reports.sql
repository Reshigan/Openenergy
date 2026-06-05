-- Migration 430: Wave 187 — IPP DMRE Quarterly Generation and Operations Report
-- Table: oe_ipp_quarterly_gen_reports
-- 12-state chain covering DMRE quarterly generation and operations reporting lifecycle

CREATE TABLE IF NOT EXISTS oe_ipp_quarterly_gen_reports (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT,
  quarter TEXT NOT NULL,
  report_period_start TEXT NOT NULL,
  report_period_end TEXT NOT NULL,
  project_mw REAL NOT NULL DEFAULT 0,
  mwh_contracted REAL DEFAULT 0,
  mwh_actual REAL DEFAULT 0,
  availability_pct REAL DEFAULT 0,
  capacity_factor_pct REAL DEFAULT 0,
  ed_spend_qtd_zar REAL DEFAULT 0,
  sed_spend_qtd_zar REAL DEFAULT 0,
  project_tier TEXT NOT NULL DEFAULT 'small',
  chain_status TEXT NOT NULL DEFAULT 'report_quarter_opened',
  sla_days INTEGER,
  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  actor_id TEXT,
  actor_party TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_qgr_participant ON oe_ipp_quarterly_gen_reports(participant_id);
CREATE INDEX IF NOT EXISTS idx_ipp_qgr_status      ON oe_ipp_quarterly_gen_reports(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_qgr_sla         ON oe_ipp_quarterly_gen_reports(sla_deadline, sla_breached);

-- ─── Seed: 12 rows — one per chain state ─────────────────────────────────────

-- qgr_001 · report_quarter_opened · small · 7.5 MW · Q1_2026
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('qgr_001','part_ipp_demo_001','proj_wind_ec_sml_002','Q1_2026',
   '2026-01-01','2026-03-31',
   7.5, 12150, 11480,
   93.2, 17.5,
   85000, 42000,
   'small','report_quarter_opened',
   30,'2026-04-30',0,
   'act_ipp_dev_001','ipp_developer',
   'Q1 2026 reporting window opened; data collection teams briefed on DMRE template requirements');

-- qgr_002 · operations_data_collection · small · 9.8 MW · Q4_2025 · sla_breached=1
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('qgr_002','part_ipp_demo_001','proj_solar_nc_sml_007','Q4_2025',
   '2025-10-01','2025-12-31',
   9.8, 15876, 14922,
   92.1, 17.4,
   91000, 47000,
   'small','operations_data_collection',
   30,'2026-01-31',1,
   'act_ipp_dev_002','ipp_developer',
   'Operations SCADA export delayed; metering reconciliation with Eskom grid operator outstanding; SLA breached');

-- qgr_003 · environmental_data_compilation · medium · 35 MW · Q1_2026
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('qgr_003','part_ipp_demo_001','proj_wind_wc_med_011','Q1_2026',
   '2026-01-01','2026-03-31',
   35.0, 56700, 53480,
   94.5, 17.4,
   312000, 155000,
   'medium','environmental_data_compilation',
   30,'2026-04-30',0,
   'act_ipp_dev_003','ipp_developer',
   'Bird strike monitoring data compiled; water consumption and waste disposal records under review for NEMA compliance');

-- qgr_004 · financial_data_compilation · medium · 48 MW · Q4_2025 · sla_breached=1
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('qgr_004','part_ipp_demo_001','proj_solar_fs_med_003','Q4_2025',
   '2025-10-01','2025-12-31',
   48.0, 77760, 73100,
   93.8, 17.3,
   428000, 214000,
   'medium','financial_data_compilation',
   30,'2026-01-31',1,
   'act_ipp_dev_001','ipp_developer',
   'ED and SED spend reconciliation delayed pending auditor sign-off; Q4 revenue confirmation from Eskom billing overdue');

-- qgr_005 · social_indicators_tabulation · large · 75 MW · Q1_2026
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('qgr_005','part_ipp_demo_001','proj_wind_kzn_lrg_005','Q1_2026',
   '2026-01-01','2026-03-31',
   75.0, 121500, 114815,
   94.1, 17.5,
   671000, 335000,
   'large','social_indicators_tabulation',
   45,'2026-05-15',0,
   'act_ipp_dev_004','ipp_developer',
   'Community trust beneficiary headcount and local employment figures being tabulated; REIPPPP Schedule 3 community indicators on track');

-- qgr_006 · internal_review · large · 90 MW · Q4_2025
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('qgr_006','part_ipp_demo_001','proj_solar_lp_lrg_009','Q4_2025',
   '2025-10-01','2025-12-31',
   90.0, 145800, 137620,
   94.4, 17.3,
   804000, 402000,
   'large','internal_review',
   45,'2026-02-14',0,
   'act_ipp_dev_002','ipp_developer',
   'CFO and Head of Compliance conducting final internal review; performance ratio narrative and variance commentary under revision');

-- qgr_007 · board_approval · major · 150 MW · Q1_2026
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('qgr_007','part_ipp_demo_001','proj_wind_ec_maj_001','Q1_2026',
   '2026-01-01','2026-03-31',
   150.0, 243000, 230200,
   95.0, 17.5,
   1340000, 670000,
   'major','board_approval',
   60,'2026-05-30',0,
   'act_ipp_dev_005','ipp_developer',
   'Board resolution tabled for Q1 2026 report sign-off; independent engineer certification of generation figures received');

-- qgr_008 · ipp_office_submission · major · 200 MW · Q4_2025
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('qgr_008','part_ipp_demo_001','proj_solar_ga_maj_004','Q4_2025',
   '2025-10-01','2025-12-31',
   200.0, 324000, 307000,
   94.8, 17.3,
   1790000, 895000,
   'major','ipp_office_submission',
   60,'2026-03-01',0,
   'act_ipp_dev_003','ipp_developer',
   'Q4 2025 report submitted to DMRE IPP Office portal; reference number IPO-2026-Q4-00812 assigned; awaiting acknowledgement');

-- qgr_009 · acknowledgement_pending · flagship · 300 MW · Q1_2026
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('qgr_009','part_ipp_demo_001','proj_wind_ec_flg_001','Q1_2026',
   '2026-01-01','2026-03-31',
   300.0, 486000, 461200,
   95.1, 17.5,
   2680000, 1340000,
   'flagship','acknowledgement_pending',
   60,'2026-05-30',0,
   'act_ipp_dev_005','ipp_developer',
   'Flagship wind project Q1 report submitted; DMRE IPP Office acknowledgement of receipt awaited within 5 business days');

-- qgr_010 · report_accepted · flagship · 320 MW · Q4_2025 (terminal positive)
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('qgr_010','part_ipp_demo_001','proj_solar_wc_flg_002','Q4_2025',
   '2025-10-01','2025-12-31',
   320.0, 518400, 492300,
   95.0, 17.5,
   2860000, 1430000,
   'flagship','report_accepted',
   60,'2026-03-01',0,
   'act_ipp_dev_004','ipp_developer',
   'DMRE IPP Office accepted Q4 2025 report; all generation, environmental and ED/SED indicators confirmed compliant with REIPPPP obligations');

-- qgr_011 · report_rejected · small · 6 MW · Q4_2025 (terminal negative)
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('qgr_011','part_ipp_demo_001','proj_wind_mpu_sml_004','Q4_2025',
   '2025-10-01','2025-12-31',
   6.0, 9720, 8640,
   88.5, 16.4,
   54000, 27000,
   'small','report_rejected',
   30,'2026-01-31',1,
   'act_ipp_dev_001','ipp_developer',
   'DMRE rejected report: availability figures inconsistent with metering data; ED spend evidence incomplete; resubmission required within 30 days');

-- qgr_012 · report_lapsed · small · 8.2 MW · Q4_2025 (terminal lapsed)
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports
  (id, participant_id, project_id, quarter,
   report_period_start, report_period_end,
   project_mw, mwh_contracted, mwh_actual,
   availability_pct, capacity_factor_pct,
   ed_spend_qtd_zar, sed_spend_qtd_zar,
   project_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('qgr_012','part_ipp_demo_001','proj_solar_nc_sml_010','Q4_2025',
   '2025-10-01','2025-12-31',
   8.2, 13284, 0,
   0, 0,
   0, 0,
   'small','report_lapsed',
   30,'2026-01-31',1,
   'act_ipp_dev_002','ipp_developer',
   'Report lapsed without submission; project placed on care-and-maintenance during Q4 2025 following force majeure event; DMRE notified of non-submission circumstances');
