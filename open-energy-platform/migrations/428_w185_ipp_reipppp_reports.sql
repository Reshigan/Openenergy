-- Wave 185: IPP REIPPPP Annual Compliance Reporting
-- Table: oe_ipp_reipppp_reports
-- 12-state chain: report_cycle_opened → ... → report_accepted / report_rejected / report_lapsed
-- Covers REIPPPP bid-programme reporting obligations (local content, ED spend, job creation)

CREATE TABLE IF NOT EXISTS oe_ipp_reipppp_reports (
  id TEXT PRIMARY KEY,
  project_ref TEXT NOT NULL,
  reipppp_bid_ref TEXT,
  report_period TEXT NOT NULL,
  project_mw REAL NOT NULL,
  project_tier TEXT NOT NULL CHECK(project_tier IN ('small','medium','large','major','flagship')),
  report_type TEXT NOT NULL DEFAULT 'annual_operational' CHECK(report_type IN ('annual_operational','annual_construction','final_construction','remediation_report')),
  local_content_pct REAL,
  ed_spend_zar REAL,
  jobs_direct INTEGER,
  chain_status TEXT NOT NULL DEFAULT 'report_cycle_opened' CHECK(chain_status IN (
    'report_cycle_opened','data_collection','local_content_verification',
    'ed_spend_reconciliation','job_creation_tabulation','internal_review',
    'board_approval','ipp_office_submission','acknowledgement_pending',
    'report_accepted','report_rejected','report_lapsed'
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

CREATE INDEX IF NOT EXISTS idx_ipp_rpr_status ON oe_ipp_reipppp_reports(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_rpr_sla ON oe_ipp_reipppp_reports(sla_due_date, sla_breached);

-- Seed: 12 rows, one per chain state
-- SA REIPPPP context: bid windows 4-6, wind/solar/hydro projects across EC/NC/NW/WC/MP provinces

INSERT INTO oe_ipp_reipppp_reports
  (id, project_ref, reipppp_bid_ref, report_period, project_mw, project_tier,
   report_type, local_content_pct, ed_spend_zar, jobs_direct,
   chain_status, sla_due_date, sla_breached, is_reportable,
   actor_party, reason, notes, created_at, updated_at)
VALUES
  -- rpr_001: report_cycle_opened
  ('rpr_001','WIND-EC-SML-002','REIPPPP-BW-6-2021-087','2025-2026',
   8.5,'small','annual_operational',
   NULL,NULL,NULL,
   'report_cycle_opened','2026-06-30',0,0,
   'p_ipp_dev_001',NULL,
   'Annual operational reporting cycle opened for Eastern Cape small wind facility',
   datetime('now','-60 days'),datetime('now','-60 days')),

  -- rpr_002: data_collection (sla_breached=1)
  ('rpr_002','SOLAR-NC-LRG-007','REIPPPP-BW-5-2019-034','2025-2026',
   140.0,'large','annual_operational',
   NULL,NULL,NULL,
   'data_collection','2026-04-30',1,0,
   'p_ipp_dev_002',NULL,
   'Data collection in progress; SLA breached due to metering system outage at Northern Cape site',
   datetime('now','-90 days'),datetime('now','-10 days')),

  -- rpr_003: local_content_verification
  ('rpr_003','SOLAR-NW-MED-005','REIPPPP-BW-6-2021-044','2025-2026',
   55.0,'medium','annual_operational',
   42.3,NULL,NULL,
   'local_content_verification','2026-07-15',0,0,
   'p_ipp_dev_003',NULL,
   'Independent verifier reviewing SABS certificates and local manufacturing declarations',
   datetime('now','-45 days'),datetime('now','-5 days')),

  -- rpr_004: ed_spend_reconciliation (sla_breached=1)
  ('rpr_004','WIND-WC-LRG-011','REIPPPP-BW-4-2017-019','2024-2025',
   160.0,'large','annual_operational',
   48.7,12500000.0,87,
   'ed_spend_reconciliation','2026-04-01',1,0,
   'p_ipp_dev_004',NULL,
   'ED spend reconciliation delayed; auditor flagging supplier BEE status discrepancies',
   datetime('now','-120 days'),datetime('now','-8 days')),

  -- rpr_005: job_creation_tabulation
  ('rpr_005','HYDRO-MP-SML-003','REIPPPP-BW-5-2019-062','2025-2026',
   5.0,'small','annual_operational',
   36.8,850000.0,NULL,
   'job_creation_tabulation','2026-08-15',0,0,
   'p_ipp_dev_005',NULL,
   'Tabulating direct and indirect employment from community liaison office records',
   datetime('now','-30 days'),datetime('now','-2 days')),

  -- rpr_006: internal_review
  ('rpr_006','SOLAR-EC-MJR-001','REIPPPP-BW-6-2021-011','2025-2026',
   220.0,'major','annual_construction',
   53.1,28000000.0,312,
   'internal_review','2026-07-30',0,0,
   'p_ipp_dev_001',NULL,
   'CFO and technical director review of draft report before board submission',
   datetime('now','-25 days'),datetime('now','-1 days')),

  -- rpr_007: board_approval
  ('rpr_007','WIND-KZN-MED-008','REIPPPP-BW-5-2019-091','2024-2025',
   72.0,'medium','annual_operational',
   44.5,6200000.0,104,
   'board_approval','2026-06-15',0,0,
   'p_ipp_dev_002',NULL,
   'Board resolution required before IPP Office submission; scheduled for next board meeting',
   datetime('now','-20 days'),datetime('now','-1 days')),

  -- rpr_008: ipp_office_submission
  ('rpr_008','SOLAR-FS-LRG-014','REIPPPP-BW-4-2017-033','2024-2025',
   175.0,'large','annual_operational',
   61.2,19800000.0,198,
   'ipp_office_submission','2026-05-31',0,0,
   'p_ipp_dev_003',NULL,
   'Report package submitted to IPP Office portal; awaiting acknowledgement reference',
   datetime('now','-15 days'),datetime('now','-1 days')),

  -- rpr_009: acknowledgement_pending
  ('rpr_009','WIND-NC-FSH-002','REIPPPP-BW-6-2021-078','2025-2026',
   300.0,'flagship','annual_construction',
   57.9,48500000.0,347,
   'acknowledgement_pending','2026-08-30',0,0,
   'p_ipp_dev_004',NULL,
   'Submission received by IPP Office; formal acknowledgement letter pending within 5 business days',
   datetime('now','-10 days'),datetime('now','-1 days')),

  -- rpr_010: report_accepted (is_reportable=0)
  ('rpr_010','SOLAR-GP-SML-006','REIPPPP-BW-5-2019-055','2024-2025',
   12.0,'small','annual_operational',
   41.0,920000.0,22,
   'report_accepted','2026-04-15',0,0,
   'p_ipp_dev_005',NULL,
   'IPP Office accepted report; local content 41% exceeds minimum threshold; ED spend on track',
   datetime('now','-180 days'),datetime('now','-45 days')),

  -- rpr_011: report_rejected (is_reportable=1)
  ('rpr_011','WIND-EC-LRG-009','REIPPPP-BW-4-2017-027','2024-2025',
   145.0,'large','annual_operational',
   31.2,7400000.0,93,
   'report_rejected','2026-05-01',0,1,
   'p_ipp_dev_001',
   'Local content below 40% REIPPPP minimum threshold; ED spend unverified by approved auditor',
   'Report rejected by IPP Office; remediation report required within 60 days',
   datetime('now','-150 days'),datetime('now','-30 days')),

  -- rpr_012: report_lapsed
  ('rpr_012','HYDRO-LP-MED-004','REIPPPP-BW-5-2019-041','2024-2025',
   48.0,'medium','remediation_report',
   NULL,NULL,NULL,
   'report_lapsed','2026-04-01',1,0,
   'p_ipp_dev_002',
   'Remediation report not submitted within prescribed cure window; matter referred to DMRE',
   'Report lapsed after 90-day cure period; DMRE notified per bid agreement penalty clause',
   datetime('now','-200 days'),datetime('now','-60 days'));
