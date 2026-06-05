-- Migration 432: Wave 189 — IPP Annual Financial Statements & Independent Audit
-- Table: oe_ipp_annual_audits
-- 12-state chain covering the annual statutory audit lifecycle for IPP entities

CREATE TABLE IF NOT EXISTS oe_ipp_annual_audits (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT,
  financial_year INTEGER NOT NULL,
  year_end_date TEXT NOT NULL,
  auditor_firm TEXT,
  annual_revenue_zar REAL NOT NULL DEFAULT 0,
  total_assets_zar REAL DEFAULT 0,
  net_profit_zar REAL DEFAULT 0,
  opinion_type TEXT DEFAULT 'unqualified',
  qualification_basis TEXT,
  revenue_tier TEXT NOT NULL DEFAULT 'small',
  chain_status TEXT NOT NULL DEFAULT 'audit_cycle_opened',
  sla_days INTEGER,
  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  actor_id TEXT,
  actor_party TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_aud_participant ON oe_ipp_annual_audits(participant_id);
CREATE INDEX IF NOT EXISTS idx_ipp_aud_status      ON oe_ipp_annual_audits(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_aud_sla         ON oe_ipp_annual_audits(sla_deadline, sla_breached);

-- ─── Seed: 12 rows — one per chain state ─────────────────────────────────────

-- aud_001 · audit_cycle_opened · small · ZAR 8 000 000 · FY2025 · 31 Mar year-end
INSERT OR IGNORE INTO oe_ipp_annual_audits
  (id, participant_id, project_id, financial_year,
   year_end_date, auditor_firm,
   annual_revenue_zar, total_assets_zar, net_profit_zar,
   opinion_type, qualification_basis,
   revenue_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('aud_001','part_ipp_demo_001','proj_solar_nc_sml_007',2025,
   '2025-03-31','Ernst and Young',
   8000000.00, 22000000.00, 980000.00,
   'unqualified', NULL,
   'small','audit_cycle_opened',
   60,'2025-06-30',0,
   'act_ipp_dev_001','ipp_developer',
   'Annual audit cycle opened for FY2025; Companies Act s30 and REIPPPP Schedule 5 audit obligation triggered at year-end 31 March 2025; engagement letter issued to Ernst and Young; trial balance extraction request sent to finance team; revenue ZAR 8.0m classifies entity as small tier with 60-day SLA');

-- aud_002 · trial_balance_preparation · small · ZAR 8 500 000 · FY2024 · 31 Mar year-end · sla_breached=1
INSERT OR IGNORE INTO oe_ipp_annual_audits
  (id, participant_id, project_id, financial_year,
   year_end_date, auditor_firm,
   annual_revenue_zar, total_assets_zar, net_profit_zar,
   opinion_type, qualification_basis,
   revenue_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('aud_002','part_ipp_demo_001','proj_wind_ec_sml_002',2024,
   '2024-03-31','Ernst and Young',
   8500000.00, 24000000.00, 1020000.00,
   'unqualified', NULL,
   'small','trial_balance_preparation',
   60,'2024-05-31',1,
   'act_ipp_dev_002','ipp_developer',
   'Trial balance preparation delayed by reconciliation discrepancy in deferred revenue account; SLA deadline 31 May 2024 breached; finance manager notified; bank confirmation from ABSA outstanding; creditors ledger rollforward requires completion before audit fieldwork can commence');

-- aud_003 · year_end_journals · small · ZAR 9 200 000 · FY2025 · 30 Jun year-end
INSERT OR IGNORE INTO oe_ipp_annual_audits
  (id, participant_id, project_id, financial_year,
   year_end_date, auditor_firm,
   annual_revenue_zar, total_assets_zar, net_profit_zar,
   opinion_type, qualification_basis,
   revenue_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('aud_003','part_ipp_demo_001','proj_solar_fs_sml_014',2025,
   '2025-06-30','KPMG Inc',
   9200000.00, 26500000.00, 1100000.00,
   'unqualified', NULL,
   'small','year_end_journals',
   60,'2025-09-30',0,
   'act_ipp_dev_003','ipp_developer',
   'Trial balance agreed; year-end journal entries being posted by CFO; accruals for O and M contracts, depreciation catch-up on inverter replacement assets, and IFRS 16 lease liability remeasurement under review; KPMG audit team provided year-end journal checklist per ISA 315');

-- aud_004 · audit_fieldwork · medium · ZAR 65 000 000 · FY2024 · 31 Dec year-end
INSERT OR IGNORE INTO oe_ipp_annual_audits
  (id, participant_id, project_id, financial_year,
   year_end_date, auditor_firm,
   annual_revenue_zar, total_assets_zar, net_profit_zar,
   opinion_type, qualification_basis,
   revenue_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('aud_004','part_ipp_demo_001','proj_wind_wc_med_011',2024,
   '2024-12-31','Deloitte and Touche',
   65000000.00, 185000000.00, 7800000.00,
   'unqualified', NULL,
   'medium','audit_fieldwork',
   90,'2025-03-31',0,
   'act_ipp_dev_001','ipp_developer',
   'Audit fieldwork commenced; Deloitte and Touche engagement team on site at Kogelberg substation; substantive testing of revenue recognition under IFRS 15 PPA tariff streams in progress; property plant and equipment physical verification completed; environmental rehabilitation provision recalculated by independent quantity surveyor');

-- aud_005 · management_accounts_review · medium · ZAR 72 000 000 · FY2025 · 31 Mar year-end
INSERT OR IGNORE INTO oe_ipp_annual_audits
  (id, participant_id, project_id, financial_year,
   year_end_date, auditor_firm,
   annual_revenue_zar, total_assets_zar, net_profit_zar,
   opinion_type, qualification_basis,
   revenue_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('aud_005','part_ipp_demo_001','proj_solar_lp_med_019',2025,
   '2025-03-31','PricewaterhouseCoopers',
   72000000.00, 204000000.00, 8640000.00,
   'unqualified', NULL,
   'medium','management_accounts_review',
   90,'2025-07-31',0,
   'act_ipp_dev_004','ipp_developer',
   'Audit fieldwork completed without material issues; management accounts under board-level review; PricewaterhouseCoopers issued a schedule of audit differences totalling ZAR 420 000 net; board audit committee scheduled to convene 15 June 2025 to approve management response to all audit findings before draft opinion is issued');

-- aud_006 · audit_queries_resolution · large · ZAR 280 000 000 · FY2024 · 31 Dec year-end
INSERT OR IGNORE INTO oe_ipp_annual_audits
  (id, participant_id, project_id, financial_year,
   year_end_date, auditor_firm,
   annual_revenue_zar, total_assets_zar, net_profit_zar,
   opinion_type, qualification_basis,
   revenue_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('aud_006','part_ipp_demo_001','proj_wind_kzn_lrg_005',2024,
   '2024-12-31','KPMG Inc',
   280000000.00, 820000000.00, 33600000.00,
   'unqualified', NULL,
   'large','audit_queries_resolution',
   120,'2025-04-30',0,
   'act_ipp_dev_002','ipp_developer',
   'Audit queries raised by KPMG on three matters: impairment assessment of Richards Bay Wind Hub turbine blades following storm event, transfer pricing documentation for intercompany technical services, and completeness of decommissioning cost estimate; management responses and supporting valuations being compiled; query resolution expected within 21 days');

-- aud_007 · draft_opinion_review · large · ZAR 310 000 000 · FY2025 · 30 Jun year-end
INSERT OR IGNORE INTO oe_ipp_annual_audits
  (id, participant_id, project_id, financial_year,
   year_end_date, auditor_firm,
   annual_revenue_zar, total_assets_zar, net_profit_zar,
   opinion_type, qualification_basis,
   revenue_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('aud_007','part_ipp_demo_001','proj_solar_ga_lrg_022',2025,
   '2025-06-30','Deloitte and Touche',
   310000000.00, 905000000.00, 37200000.00,
   'unqualified', NULL,
   'large','draft_opinion_review',
   120,'2025-11-30',0,
   'act_ipp_dev_005','ipp_developer',
   'Audit queries resolved to auditor satisfaction; draft unqualified audit opinion issued by Deloitte and Touche engagement partner; group reporting team reviewing draft opinion and consolidated financial statement disclosures; independent review by company legal counsel of going-concern basis disclosure and contingent liabilities note in progress');

-- aud_008 · board_approval · major · ZAR 750 000 000 · FY2024 · 31 Dec year-end
INSERT OR IGNORE INTO oe_ipp_annual_audits
  (id, participant_id, project_id, financial_year,
   year_end_date, auditor_firm,
   annual_revenue_zar, total_assets_zar, net_profit_zar,
   opinion_type, qualification_basis,
   revenue_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('aud_008','part_ipp_demo_001','proj_wind_ec_maj_001',2024,
   '2024-12-31','PricewaterhouseCoopers',
   750000000.00, 2200000000.00, 90000000.00,
   'unqualified', NULL,
   'major','board_approval',
   150,'2025-05-31',0,
   'act_ipp_dev_003','ipp_developer',
   'Draft opinion and financial statements approved by audit committee; full board meeting scheduled 28 February 2025 for formal approval of annual financial statements per Companies Act s30(1); PricewaterhouseCoopers engagement partner to attend board meeting to present audit findings and confirm independence declaration; approval agenda item distributed to all directors');

-- aud_009 · cipc_submission · major · ZAR 820 000 000 · FY2025 · 31 Mar year-end
INSERT OR IGNORE INTO oe_ipp_annual_audits
  (id, participant_id, project_id, financial_year,
   year_end_date, auditor_firm,
   annual_revenue_zar, total_assets_zar, net_profit_zar,
   opinion_type, qualification_basis,
   revenue_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('aud_009','part_ipp_demo_001','proj_solar_wc_maj_008',2025,
   '2025-03-31','Ernst and Young',
   820000000.00, 2400000000.00, 98400000.00,
   'unqualified', NULL,
   'major','cipc_submission',
   150,'2025-09-30',0,
   'act_ipp_dev_004','ipp_developer',
   'Annual financial statements approved by board 30 June 2025; CIPC annual return and audited financial statements being prepared for submission via BizPortal; Companies and Intellectual Property Commission filing deadline under Companies Act s33 within 30 business days of board approval; submission package includes XBRL iXBRL tagged statements per CIPC directive 1 of 2023');

-- aud_010 · audit_completed · flagship · ZAR 1 800 000 000 · FY2024 · 31 Dec year-end (terminal positive)
INSERT OR IGNORE INTO oe_ipp_annual_audits
  (id, participant_id, project_id, financial_year,
   year_end_date, auditor_firm,
   annual_revenue_zar, total_assets_zar, net_profit_zar,
   opinion_type, qualification_basis,
   revenue_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('aud_010','part_ipp_demo_001','proj_wind_ec_flg_001',2024,
   '2024-12-31','PricewaterhouseCoopers',
   1800000000.00, 5400000000.00, 216000000.00,
   'unqualified', NULL,
   'flagship','audit_completed',
   180,'2025-06-30',0,
   'act_ipp_dev_005','ipp_developer',
   'Annual audit completed; unqualified audit opinion issued by PricewaterhouseCoopers on 14 May 2025; CIPC annual return filed on 28 May 2025 within the statutory 30-business-day window; audited financial statements distributed to DOE IPPPP unit, senior lender agent Standard Bank, and NERSA per REIPPPP Schedule 5 Part C disclosure obligations; no material weaknesses identified; audit file closed');

-- aud_011 · audit_qualified · medium · ZAR 58 000 000 · FY2024 · 30 Jun year-end (terminal negative)
INSERT OR IGNORE INTO oe_ipp_annual_audits
  (id, participant_id, project_id, financial_year,
   year_end_date, auditor_firm,
   annual_revenue_zar, total_assets_zar, net_profit_zar,
   opinion_type, qualification_basis,
   revenue_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('aud_011','part_ipp_demo_001','proj_solar_fs_med_003',2024,
   '2024-06-30','KPMG Inc',
   58000000.00, 164000000.00, 6900000.00,
   'qualified',
   'KPMG was unable to obtain sufficient appropriate audit evidence regarding the completeness of the environmental rehabilitation provision as at 30 June 2024; management did not commission an independent closure cost estimate as required by IFRS IAS 37 paragraph 36; the provision of ZAR 4 200 000 recorded by management is not supported by a current actuarial or quantity surveyor valuation; the possible effect on the financial statements is material but not pervasive',
   'medium','audit_qualified',
   90,'2024-09-30',1,
   'act_ipp_dev_003','ipp_developer',
   'Qualified audit opinion issued by KPMG on 18 October 2024; SLA deadline 30 September 2024 breached; qualification basis is scope limitation on environmental rehabilitation provision IAS 37; senior lender Standard Bank notified per facility agreement covenant clause 23.4(d) requiring unqualified opinion; management committed to commissioning independent closure cost study by 31 January 2025 to clear qualification in FY2025 audit cycle');

-- aud_012 · audit_lapsed · small · ZAR 7 600 000 · FY2024 · 31 Mar year-end (terminal lapsed)
INSERT OR IGNORE INTO oe_ipp_annual_audits
  (id, participant_id, project_id, financial_year,
   year_end_date, auditor_firm,
   annual_revenue_zar, total_assets_zar, net_profit_zar,
   opinion_type, qualification_basis,
   revenue_tier, chain_status,
   sla_days, sla_deadline, sla_breached,
   actor_id, actor_party, notes)
VALUES
  ('aud_012','part_ipp_demo_001','proj_wind_mpu_sml_004',2024,
   '2024-03-31','Ernst and Young',
   7600000.00, 20800000.00, 910000.00,
   'unqualified', NULL,
   'small','audit_lapsed',
   60,'2024-05-31',1,
   'act_ipp_dev_001','ipp_developer',
   'Audit lapsed without completion; finance director resigned in February 2024 and replacement not appointed within the SLA window; trial balance was not finalised before the 31 May 2024 deadline; Ernst and Young engagement suspended pending appointment of a replacement CFO; CIPC statutory penalty notice issued for late filing; Companies Act s214 compliance investigation risk flagged to board; new audit cycle to be reopened once finance leadership is restored');
