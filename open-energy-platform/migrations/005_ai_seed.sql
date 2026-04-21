-- ============================================================================
-- OPEN ENERGY PLATFORM — AI-enabling seed data
-- Migration 005
-- ----------------------------------------------------------------------------
-- Populates every table the AI hubs query, so each cockpit has real data:
--   • Additional IPP projects + milestones      (IPP / Ona / Lender / Offtaker)
--   • Loan facilities / covenants / disbursements   (Funder AI hub)
--   • Carbon holdings + fund NAV snapshots           (Carbon Fund AI hub)
--   • Ona sites / forecasts / faults / maintenance   (O&M + IPP AI)
--   • Trade orders                                   (Trader AI)
--   • Invoices (paid / outstanding / disputed)       (Settlement + Lender)
--   • Contract documents (linked to SA-law templates) (Contracts / Offtaker / IPP)
-- ============================================================================

-- Ensure schemas that funder.ts auto-creates also exist here (so seed is safe
-- whether migration runs before or after first route invocation).
CREATE TABLE IF NOT EXISTS loan_facilities (
  id TEXT PRIMARY KEY,
  facility_name TEXT NOT NULL,
  project_id TEXT,
  lender_participant_id TEXT NOT NULL,
  borrower_participant_id TEXT,
  facility_type TEXT,
  committed_amount REAL,
  drawn_amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'ZAR',
  interest_rate_pct REAL,
  tenor_months INTEGER,
  dscr_covenant REAL DEFAULT 1.20,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS loan_covenants (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  covenant_type TEXT NOT NULL,
  threshold REAL,
  last_value REAL,
  last_checked_at TEXT,
  status TEXT DEFAULT 'clean',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS disbursement_requests (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  project_id TEXT,
  milestone_id TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  status TEXT DEFAULT 'pending',
  approved_by TEXT,
  approved_at TEXT,
  requested_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---- ADDITIONAL IPP PROJECTS ------------------------------------------------
INSERT OR IGNORE INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location, grid_connection_point, status, construction_start_date, commercial_operation_date, ppa_volume_mwh, ppa_price_per_mwh, ppa_duration_years, renewable_energy_certificate_eligible) VALUES
('ip_004','De Aar 75MW Solar PV','demo_ipp_001','build_own_operate','solar_pv',75,'De Aar, Northern Cape','De Aar 132kV','construction','2023-09-01','2024-11-15',140000,275,20,1),
('ip_005','Jeffreys Bay 120MW Wind','demo_ipp_002','build_operate_transfer','wind',120,'Jeffreys Bay, Eastern Cape','Jeffreys Bay 400kV','commercial_operations','2019-05-01','2021-08-01',380000,310,20,1),
('ip_006','Upington 200MW CSP','demo_ipp_001','build_own_operate','csp',200,'Upington, Northern Cape','Upington 400kV','development','2025-03-01','2027-06-01',700000,420,25,1),
('ip_007','Gqeberha Port Wind Cluster','demo_ipp_002','build_own_operate','wind',95,'Gqeberha, Eastern Cape','Gqeberha 132kV','financial_close','2024-01-15','2025-09-01',295000,305,20,1);

-- ---- PROJECT MILESTONES (for new projects + extra for ip_003) --------------
INSERT OR IGNORE INTO project_milestones (id, project_id, milestone_name, milestone_type, order_index, target_date, satisfied_date, status) VALUES
('mil_014','ip_004','CP Satisfied','financial_close',1,'2023-07-01','2023-06-20','satisfied'),
('mil_015','ip_004','Financial Close','financial_close',2,'2023-08-15','2023-08-10','satisfied'),
('mil_016','ip_004','Construction Start','construction_start',3,'2023-09-01','2023-09-05','satisfied'),
('mil_017','ip_004','Construction Complete','construction_complete',4,'2024-10-15',NULL,'pending'),
('mil_018','ip_004','COD','cod',5,'2024-11-15',NULL,'pending'),
('mil_019','ip_005','CP Satisfied','financial_close',1,'2019-03-01','2019-02-25','satisfied'),
('mil_020','ip_005','Financial Close','financial_close',2,'2019-04-15','2019-04-12','satisfied'),
('mil_021','ip_005','COD','cod',3,'2021-08-01','2021-08-01','satisfied'),
('mil_022','ip_006','Environmental Authorisation','financial_close',1,'2025-01-15',NULL,'pending'),
('mil_023','ip_006','Financial Close','financial_close',2,'2025-03-01',NULL,'pending'),
('mil_024','ip_007','CP Satisfied','financial_close',1,'2024-02-10','2024-02-05','satisfied'),
('mil_025','ip_007','Financial Close','financial_close',2,'2024-03-01','2024-02-28','satisfied'),
('mil_026','ip_007','Construction Start','construction_start',3,'2024-04-01','2024-04-10','satisfied'),
('mil_027','ip_007','Construction Complete','construction_complete',4,'2025-07-15',NULL,'pending'),
('mil_028','ip_007','COD','cod',5,'2025-09-01',NULL,'pending');

-- ---- LOAN FACILITIES (Funder AI hub) ---------------------------------------
INSERT OR IGNORE INTO loan_facilities (id, facility_name, project_id, lender_participant_id, borrower_participant_id, facility_type, committed_amount, drawn_amount, currency, interest_rate_pct, tenor_months, dscr_covenant, status) VALUES
('fac_001','Klerksdorp Solar Senior Debt A','ip_001','demo_lender_001','demo_ipp_001','senior_secured',450000000,420000000,'ZAR',10.25,204,1.20,'active'),
('fac_002','Mookgopong Wind Senior Debt','ip_002','demo_lender_001','demo_ipp_002','senior_secured',620000000,580000000,'ZAR',10.50,216,1.25,'active'),
('fac_003','De Aar Solar Construction','ip_004','demo_lender_001','demo_ipp_001','construction',720000000,380000000,'ZAR',11.10,60,1.15,'active'),
('fac_004','Jeffreys Bay Wind Refi','ip_005','demo_lender_001','demo_ipp_002','refinance',1250000000,1250000000,'ZAR',9.75,192,1.30,'active'),
('fac_005','Gqeberha Port Wind Senior','ip_007','demo_lender_001','demo_ipp_002','senior_secured',895000000,410000000,'ZAR',10.75,228,1.20,'active'),
('fac_006','Klerksdorp Solar Mezz','ip_001','demo_lender_001','demo_ipp_001','mezzanine',85000000,85000000,'ZAR',14.50,120,1.05,'active'),
('fac_007','Brits Rooftop Bridge','ip_003','demo_lender_001','demo_ipp_001','bridge',45000000,0,'ZAR',12.00,18,NULL,'offered'),
('fac_008','Upington CSP Facility (pre-FC)','ip_006','demo_lender_001','demo_ipp_001','senior_secured',2400000000,0,'ZAR',10.90,252,1.25,'under_review');

-- ---- LOAN COVENANTS ---------------------------------------------------------
INSERT OR IGNORE INTO loan_covenants (id, facility_id, covenant_type, threshold, last_value, last_checked_at, status, notes) VALUES
('cov_001','fac_001','DSCR',1.20,1.42,'2026-03-31','clean','Historic 12m DSCR comfortably above threshold'),
('cov_002','fac_001','LLCR',1.35,1.58,'2026-03-31','clean','Projected life-of-loan cashflow strong'),
('cov_003','fac_001','Leverage',75,62.5,'2026-03-31','clean','Debt/EBITDA well below cap'),
('cov_004','fac_002','DSCR',1.25,1.18,'2026-03-31','watch','Wind resource below P50 for Q1 — monitor'),
('cov_005','fac_002','LLCR',1.35,1.41,'2026-03-31','clean','Still within covenant'),
('cov_006','fac_002','Leverage',75,68.0,'2026-03-31','clean',NULL),
('cov_007','fac_003','DSCR',1.15,NULL,NULL,'construction','Construction phase — DSCR tested from COD'),
('cov_008','fac_003','Construction Progress',80,62,'2026-03-31','clean','Progress on track per latest IE report'),
('cov_009','fac_004','DSCR',1.30,1.09,'2026-03-31','breached','Two consecutive quarters below threshold — standstill triggered'),
('cov_010','fac_004','LLCR',1.35,1.24,'2026-03-31','breached','LLCR breach — cure under negotiation'),
('cov_011','fac_004','Leverage',72,79.2,'2026-03-31','breached','Waiver requested from lender credit committee'),
('cov_012','fac_005','DSCR',1.20,NULL,NULL,'construction',NULL),
('cov_013','fac_005','Construction Progress',75,54,'2026-03-31','watch','2-week slippage on turbine deliveries'),
('cov_014','fac_006','DSCR',1.05,1.08,'2026-03-31','clean','Tight but holding'),
('cov_015','fac_006','Debt Service Reserve',6,6,'2026-03-31','clean','DSRA fully funded (6m forward)'),
('cov_016','fac_001','Availability',95,97.8,'2026-03-31','clean',NULL);

-- ---- DISBURSEMENT REQUESTS --------------------------------------------------
INSERT OR IGNORE INTO disbursement_requests (id, facility_id, project_id, milestone_id, amount, currency, status, requested_by, created_at) VALUES
('dis_001','fac_003','ip_004','mil_016',95000000,'ZAR','pending','demo_ipp_001','2026-03-15 10:00:00'),
('dis_002','fac_003','ip_004','mil_016',140000000,'ZAR','pending','demo_ipp_001','2026-03-28 14:30:00'),
('dis_003','fac_003','ip_004','mil_017',85000000,'ZAR','pending','demo_ipp_001','2026-04-12 09:15:00'),
('dis_004','fac_005','ip_007','mil_026',120000000,'ZAR','pending','demo_ipp_002','2026-04-15 11:40:00'),
('dis_005','fac_005','ip_007','mil_027',95000000,'ZAR','approved','demo_ipp_002','2026-03-02 16:20:00'),
('dis_006','fac_001','ip_001','mil_006',40000000,'ZAR','approved','demo_ipp_001','2022-06-01 10:00:00'),
('dis_007','fac_002','ip_002',NULL,15000000,'ZAR','rejected','demo_ipp_002','2026-02-18 13:00:00'),
('dis_008','fac_005','ip_007','mil_026',60000000,'ZAR','pending','demo_ipp_002','2026-04-20 09:00:00');

UPDATE disbursement_requests SET approved_by='demo_lender_001', approved_at='2026-03-10 10:00:00' WHERE id='dis_005';
UPDATE disbursement_requests SET approved_by='demo_lender_001', approved_at='2022-06-02 10:00:00' WHERE id='dis_006';

-- ---- CARBON HOLDINGS (Carbon Fund AI hub) ----------------------------------
INSERT OR IGNORE INTO carbon_holdings (id, participant_id, project_id, credit_type, quantity, vintage_year, acquisition_date, cost_basis, status) VALUES
('ch_001','demo_carbon_001','cp_001','CER',8500,2020,'2021-01-15',110,'available'),
('ch_002','demo_carbon_001','cp_001','CER',12000,2021,'2022-03-10',135,'available'),
('ch_003','demo_carbon_001','cp_001','CER',9500,2022,'2023-02-20',165,'available'),
('ch_004','demo_carbon_001','cp_001','CER',7200,2023,'2024-04-05',210,'available'),
('ch_005','demo_carbon_001','cp_002','CER',6500,2021,'2022-05-18',140,'available'),
('ch_006','demo_carbon_001','cp_002','CER',8900,2022,'2023-07-22',180,'reserved'),
('ch_007','demo_carbon_001','cp_002','CER',11200,2023,'2024-06-14',225,'available'),
('ch_008','demo_carbon_001','cp_003','VER',3500,2021,'2022-09-30',95,'available'),
('ch_009','demo_carbon_001','cp_003','VER',4200,2022,'2023-10-12',120,'available'),
('ch_010','demo_carbon_001','cp_003','VER',2800,2023,'2024-11-04',145,'available'),
('ch_011','demo_carbon_001','cp_004','CER',15000,2023,'2024-02-28',195,'available'),
('ch_012','demo_carbon_001','cp_004','CER',5500,2024,'2025-01-15',240,'available'),
('ch_013','demo_offtaker_001','cp_001','CER',2200,2023,'2024-07-01',210,'retired'),
('ch_014','demo_offtaker_001','cp_002','CER',1800,2023,'2024-08-15',225,'retired'),
('ch_015','demo_carbon_001','cp_001','CER',3400,2024,'2025-03-20',245,'available'),
('ch_016','demo_carbon_001','cp_002','CER',4800,2024,'2025-04-08',255,'available');

INSERT OR IGNORE INTO carbon_fund_nav (id, fund_id, nav_date, total_units, nav_per_unit, assets_under_management) VALUES
('nav_001','demo_carbon_001','2025-12-31',1000000,185.40,185400000),
('nav_002','demo_carbon_001','2026-01-31',1000000,189.12,189120000),
('nav_003','demo_carbon_001','2026-02-28',1000000,192.85,192850000),
('nav_004','demo_carbon_001','2026-03-31',1050000,196.30,206115000),
('nav_005','demo_carbon_001','2026-04-15',1050000,198.75,208687500);

-- ---- ONA SITES (O&M + IPP AI) ----------------------------------------------
INSERT OR IGNORE INTO ona_sites (id, project_id, site_name, ona_site_id, latitude, longitude, capacity_mw, status, last_sync_at) VALUES
('ona_s_001','ip_001','Klerksdorp Solar Array A','KLR-A-50MW',-26.8519,26.6667,50,'active','2026-04-20 06:00:00'),
('ona_s_002','ip_002','Mookgopong Wind WTG Cluster 1','MKG-C1-40MW',-24.5064,28.8344,40,'active','2026-04-20 06:00:00'),
('ona_s_003','ip_004','De Aar Solar Block 1','DEAAR-B1-75MW',-30.6486,24.0108,75,'maintenance','2026-04-18 12:00:00'),
('ona_s_004','ip_005','Jeffreys Bay Wind Farm','JBW-120MW',-34.0500,24.9333,120,'active','2026-04-20 06:00:00');

INSERT OR IGNORE INTO ona_forecasts (id, site_id, forecast_date, forecast_type, generation_mwh, availability_percentage, confidence_percentage, synced_at) VALUES
('ona_f_001','ona_s_001','2026-04-21','day_ahead',284,98.5,92,'2026-04-20 18:00:00'),
('ona_f_002','ona_s_001','2026-04-22','day_ahead',276,98.5,89,'2026-04-20 18:00:00'),
('ona_f_003','ona_s_001','2026-04-23','day_ahead',210,98.0,78,'2026-04-20 18:00:00'),
('ona_f_004','ona_s_001','2026-04-21','weekly',1820,97.5,85,'2026-04-20 18:00:00'),
('ona_f_005','ona_s_002','2026-04-21','day_ahead',312,96.0,82,'2026-04-20 18:00:00'),
('ona_f_006','ona_s_002','2026-04-22','day_ahead',198,94.5,72,'2026-04-20 18:00:00'),
('ona_f_007','ona_s_002','2026-04-23','day_ahead',385,97.5,88,'2026-04-20 18:00:00'),
('ona_f_008','ona_s_002','2026-04-21','weekly',2050,95.0,80,'2026-04-20 18:00:00'),
('ona_f_009','ona_s_003','2026-04-21','day_ahead',0,0,95,'2026-04-20 18:00:00'),
('ona_f_010','ona_s_003','2026-04-22','day_ahead',420,92.0,85,'2026-04-20 18:00:00'),
('ona_f_011','ona_s_004','2026-04-21','day_ahead',1120,97.0,90,'2026-04-20 18:00:00'),
('ona_f_012','ona_s_004','2026-04-22','day_ahead',1080,96.5,88,'2026-04-20 18:00:00'),
('ona_f_013','ona_s_004','2026-04-23','day_ahead',950,95.0,82,'2026-04-20 18:00:00'),
('ona_f_014','ona_s_004','2026-04-21','weekly',7650,96.5,85,'2026-04-20 18:00:00'),
('ona_f_015','ona_s_001','2026-04-21','monthly',52000,97.5,80,'2026-04-20 18:00:00'),
('ona_f_016','ona_s_002','2026-04-21','monthly',28500,95.2,78,'2026-04-20 18:00:00');

INSERT OR IGNORE INTO ona_faults (id, site_id, fault_code, fault_description, severity, start_time, end_time, duration_minutes, generation_lost_mwh, estimated_revenue_impact, status, resolution) VALUES
('ona_fault_001','ona_s_001','INV-OVH','Inverter 3 over-temperature trip','medium','2026-04-15 13:22:00','2026-04-15 15:10:00',108,3.2,912,'resolved','Cleaned cooling filters; firmware update applied'),
('ona_fault_002','ona_s_002','WTG-VIB','Turbine #12 vibration alarm','high','2026-04-17 08:40:00','2026-04-17 22:30:00',830,28.4,9088,'resolved','Gearbox inspection; bearing replaced'),
('ona_fault_003','ona_s_003','TRX-ARC','Main transformer arc fault','critical','2026-04-18 11:00:00',NULL,NULL,NULL,150000,'open','Awaiting Eskom maintenance crew'),
('ona_fault_004','ona_s_002','WTG-COM','Turbine #03 comms loss','low','2026-04-19 04:15:00','2026-04-19 04:45:00',30,0.6,192,'resolved','Reset comms module'),
('ona_fault_005','ona_s_004','WTG-BRK','Turbine #24 brake fault','high','2026-04-19 16:20:00',NULL,NULL,NULL,25000,'investigating','Brake pad wear investigation in progress'),
('ona_fault_006','ona_s_001','TRK-ENC','Tracker encoder failure row 12','medium','2026-04-20 06:05:00',NULL,NULL,NULL,3500,'open','Spare encoder dispatched'),
('ona_fault_007','ona_s_001','STR-GND','String ground fault — Array A7','low','2026-04-20 11:00:00','2026-04-20 12:30:00',90,0.8,228,'resolved','Damaged cable replaced'),
('ona_fault_008','ona_s_004','BAT-CHG','Battery charger imbalance','medium','2026-04-20 13:00:00',NULL,NULL,NULL,4800,'escalated','Escalated to OEM');

INSERT OR IGNORE INTO ona_maintenance (id, site_id, maintenance_type, start_time, end_time, duration_hours, generation_impact_mwh, description, status) VALUES
('ona_m_001','ona_s_003','scheduled','2026-04-18 08:00:00','2026-04-21 17:00:00',81,1200,'Quarterly inverter preventive + string IR testing','in_progress'),
('ona_m_002','ona_s_001','inspection','2026-05-05 09:00:00','2026-05-05 15:00:00',6,45,'Monthly thermographic inspection','scheduled'),
('ona_m_003','ona_s_002','scheduled','2026-05-12 07:00:00','2026-05-13 18:00:00',35,420,'Gearbox oil replacement — 3 turbines','scheduled'),
('ona_m_004','ona_s_004','upgrade','2026-06-01 08:00:00','2026-06-07 18:00:00',150,1800,'SCADA firmware upgrade + cybersecurity patching','scheduled');

-- ---- TRADE ORDERS (Trader AI) ----------------------------------------------
INSERT OR IGNORE INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status) VALUES
('ord_004','demo_trader_001','buy','solar',200,260,290,'2026-05-01','Klerksdorp','bilateral','open'),
('ord_005','demo_ipp_001','sell','solar',150,275,295,'2026-05-01','Klerksdorp','bilateral','open'),
('ord_006','demo_trader_001','buy','wind',120,290,325,'2026-05-05','Mookgopong','bilateral','open'),
('ord_007','demo_ipp_002','sell','wind',180,300,330,'2026-05-05','Mookgopong','bilateral','open'),
('ord_008','demo_offtaker_001','buy','solar',500,260,310,'2026-05-15','Johannesburg-North','bilateral','open'),
('ord_009','demo_ipp_001','sell','solar',300,270,310,'2026-05-15','Klerksdorp','bilateral','open'),
('ord_010','demo_trader_001','buy','wind',80,310,340,'2026-05-20','Jeffreys Bay','bilateral','open'),
('ord_011','demo_ipp_002','sell','wind',220,295,325,'2026-05-20','Jeffreys Bay','bilateral','open'),
('ord_012','demo_trader_001','buy','solar',400,245,285,'2026-06-01','De Aar','day_ahead','open'),
('ord_013','demo_ipp_001','sell','solar',350,260,290,'2026-06-01','De Aar','day_ahead','open'),
('ord_014','demo_offtaker_001','buy','mixed',1000,270,320,'2026-06-15','Johannesburg-North','bilateral','open'),
('ord_015','demo_trader_001','sell','solar',250,280,310,'2026-05-10','Klerksdorp','bilateral','matched'),
('ord_016','demo_ipp_002','buy','solar',100,270,300,'2026-05-10','Mookgopong','bilateral','matched'),
('ord_017','demo_trader_001','buy','carbon_linked_solar',50,290,330,'2026-05-25','Upington','bilateral','open'),
('ord_018','demo_ipp_001','sell','solar',75,285,315,'2026-05-25','Upington','bilateral','open'),
('ord_019','demo_trader_001','sell','wind',90,315,345,'2026-06-10','Jeffreys Bay','bilateral','cancelled'),
('ord_020','demo_trader_001','buy','wind',160,295,330,'2026-06-30','Gqeberha','bilateral','open'),
('ord_021','demo_ipp_002','sell','wind',140,305,335,'2026-06-30','Gqeberha','bilateral','open'),
('ord_022','demo_offtaker_001','buy','solar',250,255,295,'2026-07-05','Johannesburg-North','bilateral','open'),
('ord_023','demo_ipp_001','sell','solar',280,265,305,'2026-07-05','Klerksdorp','bilateral','open');

-- ---- INVOICES --------------------------------------------------------------
INSERT OR IGNORE INTO invoices (id, invoice_number, seller_id, buyer_id, contract_id, amount, vat_amount, currency, issue_date, due_date, status, notes) VALUES
('inv_001','INV-2026-0001','demo_ipp_001','demo_offtaker_001','doc_001',1187500,178125,'ZAR','2026-01-31','2026-03-02','paid','Jan 2026 — 3,750 MWh @ R285 + VAT (15%)'),
('inv_002','INV-2026-0002','demo_ipp_001','demo_offtaker_001','doc_001',1068750,160312.50,'ZAR','2026-02-28','2026-03-30','paid','Feb 2026 — 3,375 MWh @ R285 + VAT'),
('inv_003','INV-2026-0003','demo_ipp_001','demo_offtaker_001','doc_001',1282500,192375,'ZAR','2026-03-31','2026-04-30','paid','Mar 2026 — 4,050 MWh @ R285 + VAT'),
('inv_004','INV-2026-0004','demo_ipp_002','demo_offtaker_001','doc_002',1305600,195840,'ZAR','2026-01-31','2026-03-02','paid','Jan 2026 wind — 3,420 MWh @ R320 + VAT'),
('inv_005','INV-2026-0005','demo_ipp_002','demo_offtaker_001','doc_002',1152000,172800,'ZAR','2026-02-28','2026-03-30','paid','Feb 2026 — 3,150 MWh + VAT'),
('inv_006','INV-2026-0006','demo_ipp_002','demo_offtaker_001','doc_002',1401600,210240,'ZAR','2026-03-31','2026-04-30','pending','Mar 2026 wind — 3,780 MWh + VAT'),
('inv_007','INV-2026-0007','demo_ipp_001','demo_trader_001',NULL,875000,131250,'ZAR','2026-03-15','2026-04-14','paid','Trade ord_015 settlement'),
('inv_008','INV-2026-0008','demo_ipp_001','demo_offtaker_001','doc_001',1187500,178125,'ZAR','2026-04-01','2026-05-01','pending','Apr interim — 3,750 MWh + VAT'),
('inv_009','INV-2026-0009','demo_ipp_002','demo_offtaker_001','doc_002',1305600,195840,'ZAR','2026-04-01','2026-05-01','pending','Apr wind PPA + VAT'),
('inv_010','INV-2026-0010','demo_ipp_001','demo_offtaker_001','doc_001',1426875,214031.25,'ZAR','2025-12-31','2026-01-30','paid','Dec 2025 — 4,506 MWh + VAT'),
('inv_011','INV-2025-0118','demo_ipp_001','demo_offtaker_001','doc_001',1187500,178125,'ZAR','2025-11-30','2025-12-30','paid','Nov 2025 + VAT'),
('inv_012','INV-2025-0099','demo_ipp_002','demo_offtaker_001','doc_002',1248000,187200,'ZAR','2025-10-31','2025-11-30','paid','Oct 2025 wind'),
('inv_013','INV-2025-0087','demo_ipp_001','demo_offtaker_001','doc_001',1102500,165375,'ZAR','2025-09-30','2025-10-30','paid','Sep 2025'),
('inv_014','INV-2025-0075','demo_ipp_002','demo_offtaker_001','doc_002',1094400,164160,'ZAR','2025-08-31','2025-09-30','paid','Aug 2025 wind'),
('inv_015','INV-2025-0062','demo_ipp_001','demo_offtaker_001','doc_001',956250,143437.50,'ZAR','2025-07-31','2025-08-30','paid','Jul 2025'),
('inv_016','INV-2025-0055','demo_ipp_001','demo_offtaker_001','doc_001',1187500,178125,'ZAR','2025-06-30','2025-07-30','disputed','Metering-variance — under dispute resolution'),
('inv_017','INV-2026-0011','demo_ipp_002','demo_offtaker_001','doc_002',1305600,195840,'ZAR','2026-02-15','2026-03-17','overdue','Overdue 35 days — escalated'),
('inv_018','INV-2026-0012','demo_trader_001','demo_ipp_002',NULL,235000,35250,'ZAR','2026-03-22','2026-04-21','pending','Brokerage fee Q1 trades'),
('inv_019','INV-2026-0013','demo_ipp_001','demo_offtaker_001','doc_003',85000,12750,'ZAR','2026-04-10','2026-05-10','pending','Brits rooftop design-study fee'),
('inv_020','INV-2026-0014','demo_ipp_001','demo_trader_001',NULL,540000,81000,'ZAR','2026-04-18','2026-05-18','disputed','Volume variance on ord_017 settlement');

-- ---- ADDITIONAL CONTRACT DOCUMENTS (linked to SA-law templates) ------------
INSERT OR IGNORE INTO contract_documents (id, title, document_type, phase, creator_id, counterparty_id, project_id, commercial_terms) VALUES
('doc_004','De Aar Solar PPA (Wheeling) — City Energy','ppa_wheeling','negotiation','demo_ipp_001','demo_offtaker_001','ip_004','{"volume_mwh":140000,"price_per_mwh":275,"escalation":4.5,"tenor_years":20,"template_code":"PPA-WHEEL-SA"}'),
('doc_005','Jeffreys Bay Wind Wheeling — City Energy','ppa_wheeling','active','demo_ipp_002','demo_offtaker_001','ip_005','{"volume_mwh":380000,"price_per_mwh":310,"escalation":4.0,"tenor_years":20,"template_code":"PPA-WHEEL-SA"}'),
('doc_006','Gqeberha Wind PPA (Direct Supply)','offtake_agreement','negotiation','demo_ipp_002','demo_offtaker_001','ip_007','{"volume_mwh":295000,"price_per_mwh":305,"escalation":4.2,"tenor_years":20,"template_code":"DIRECT-SUPPLY-SA"}'),
('doc_007','LOI — Upington CSP Offtake (City Energy)','loi','negotiation','demo_ipp_001','demo_offtaker_001','ip_006','{"indicative_volume_mwh":350000,"indicative_price_per_mwh":420,"tenor_years":25,"template_code":"LOI-SA"}'),
('doc_008','Klerksdorp Solar Senior Facility Agreement','facility_agreement','active','demo_lender_001','demo_ipp_001','ip_001','{"committed_zar":450000000,"margin_bps":475,"tenor_months":204,"template_code":"FACILITY-SA"}'),
('doc_009','Jeffreys Bay Wind Refi Facility Agreement','facility_agreement','active','demo_lender_001','demo_ipp_002','ip_005','{"committed_zar":1250000000,"margin_bps":375,"tenor_months":192,"template_code":"FACILITY-SA"}'),
('doc_010','De Aar Solar Construction Facility','facility_agreement','active','demo_lender_001','demo_ipp_001','ip_004','{"committed_zar":720000000,"margin_bps":525,"tenor_months":60,"template_code":"FACILITY-SA"}'),
('doc_011','Klerksdorp O&M Agreement','om','active','demo_ipp_001','demo_ipp_002','ip_001','{"fixed_fee_annual":8500000,"variable_per_mwh":18,"term_years":10,"template_code":"OM-SA"}'),
('doc_012','Klerksdorp Grid Connection Agreement (Eskom)','grid_connection','active','demo_ipp_001','demo_grid_001','ip_001','{"capacity_mva":55,"connection_charge":32500000,"template_code":"GRID-CONNECT-SA"}'),
('doc_013','Klerksdorp Wheeling Agreement (UoS)','wheeling_agreement','active','demo_ipp_001','demo_grid_001','ip_001','{"wheeling_capacity_mw":50,"template_code":"UOS-SA"}'),
('doc_014','Klerksdorp — City Energy ERPA (Carbon Sale)','carbon_purchase','active','demo_ipp_001','demo_carbon_001','ip_001','{"tco2e_volume":12000,"price_per_tco2e":195,"ipp_carbon_share_pct":25,"template_code":"ERPA-SA"}'),
('doc_015','Mookgopong — GreenFunds ERPA','carbon_purchase','active','demo_ipp_002','demo_carbon_001','ip_002','{"tco2e_volume":9500,"price_per_tco2e":185,"ipp_carbon_share_pct":20,"template_code":"ERPA-SA"}'),
('doc_016','Mutual NDA — RenewCo/City Energy','nda','active','demo_ipp_001','demo_offtaker_001',NULL,'{"term_years":2,"survival_years":5,"template_code":"NDA-SA"}'),
('doc_017','RenewCo / WindCapital Joint Venture — Upington CSP','jv_shareholders','negotiation','demo_ipp_001','demo_ipp_002','ip_006','{"party_a_pct":60,"party_b_pct":40,"template_code":"JV-SA"}'),
('doc_018','De Aar Solar EPC','epc','active','demo_ipp_001','demo_ipp_002','ip_004','{"contract_price":1350000000,"construction_months":14,"template_code":"EPC-SA"}');

-- ---- ACTION QUEUE (cross-module handovers surfaced on cockpits) ------------
INSERT OR IGNORE INTO action_queue (id, participant_id, entity_type, entity_id, action, status, priority, due_date, metadata) VALUES
('aq_001','demo_offtaker_001','contracts','doc_004','sign',        'pending','high',   '2026-04-30','{"kind":"contract.awaiting_signature"}'),
('aq_002','demo_offtaker_001','contracts','doc_006','sign',        'pending','high',   '2026-05-07','{"kind":"contract.awaiting_signature"}'),
('aq_003','demo_ipp_001','contracts','doc_017','review',            'pending','medium','2026-05-10','{"kind":"contract.jv_review"}'),
('aq_004','demo_lender_001','disbursement_requests','dis_001','approve','pending','high','2026-04-25','{"kind":"disbursement.pending_approval"}'),
('aq_005','demo_lender_001','disbursement_requests','dis_002','approve','pending','high','2026-04-25','{"kind":"disbursement.pending_approval"}'),
('aq_006','demo_lender_001','disbursement_requests','dis_003','approve','pending','high','2026-04-26','{"kind":"disbursement.pending_approval"}'),
('aq_007','demo_lender_001','disbursement_requests','dis_004','approve','pending','medium','2026-04-27','{"kind":"disbursement.pending_approval"}'),
('aq_008','demo_lender_001','disbursement_requests','dis_008','approve','pending','medium','2026-04-28','{"kind":"disbursement.pending_approval"}'),
('aq_009','demo_lender_001','loan_covenants','cov_009','investigate','pending','critical','2026-04-25','{"kind":"covenant.breached","facility_id":"fac_004"}'),
('aq_010','demo_lender_001','loan_covenants','cov_010','investigate','pending','critical','2026-04-25','{"kind":"covenant.breached","facility_id":"fac_004"}'),
('aq_011','demo_lender_001','loan_covenants','cov_011','investigate','pending','critical','2026-04-25','{"kind":"covenant.breached","facility_id":"fac_004"}'),
('aq_012','demo_ipp_001','ona_faults','ona_fault_003','resolve','pending','critical','2026-04-22','{"kind":"ona.fault","site_id":"ona_s_003"}'),
('aq_013','demo_ipp_002','ona_faults','ona_fault_005','resolve','pending','high','2026-04-22','{"kind":"ona.fault","site_id":"ona_s_004"}'),
('aq_014','demo_lender_001','ona_faults','ona_fault_003','monitor','pending','high','2026-04-23','{"kind":"ona.generation_lost","facility_id":"fac_003","mwh_lost":"investigating"}'),
('aq_015','demo_offtaker_001','invoices','inv_008','pay','pending','medium','2026-05-01','{"kind":"invoice.due"}'),
('aq_016','demo_offtaker_001','invoices','inv_017','pay','pending','high','2026-03-17','{"kind":"invoice.overdue"}'),
('aq_017','demo_ipp_002','invoices','inv_017','chase','pending','high','2026-04-22','{"kind":"invoice.overdue_counter"}'),
('aq_018','demo_ipp_001','settlement_disputes','inv_016','resolve','pending','medium','2026-04-30','{"kind":"dispute.invoice"}'),
('aq_019','demo_trader_001','trade_orders','ord_008','match','pending','medium','2026-05-10','{"kind":"trade.match_opportunity","counterparty":"demo_offtaker_001"}'),
('aq_020','demo_carbon_001','carbon_holdings','ch_006','confirm_retirement','pending','low','2026-05-15','{"kind":"carbon.reserved_pending_retirement"}'),
('aq_021','demo_regulator_001','esg_reports','esgr_001','file','pending','medium','2026-05-31','{"kind":"filing.annual"}'),
('aq_022','demo_grid_001','grid_constraints','gc_001','resolve','pending','high','2026-04-30','{"kind":"grid.constraint"}'),
('aq_023','demo_ipp_001','project_milestones','mil_017','submit_evidence','pending','medium','2026-10-10','{"kind":"milestone.upcoming"}'),
('aq_024','demo_ipp_002','project_milestones','mil_027','submit_evidence','pending','medium','2025-07-10','{"kind":"milestone.upcoming"}');

-- ---- NOTIFICATIONS (so each user sees inbox on login) ----------------------
INSERT OR IGNORE INTO notifications (id, participant_id, type, title, message, priority, action_url, read, created_at) VALUES
('ntf_001','demo_offtaker_001','contract','Contract ready to sign','De Aar Solar Wheeling PPA (doc_004) awaiting your signature','high','/contracts/doc_004',0,'2026-04-20 09:00:00'),
('ntf_002','demo_lender_001','covenant_breach','Covenant BREACHED','Jeffreys Bay Wind (fac_004) — 3 covenants breached; standstill triggered','critical','/funds/fac_004',0,'2026-04-15 11:30:00'),
('ntf_003','demo_lender_001','disbursement','5 pending disbursements','R500m awaiting approval across De Aar + Gqeberha facilities','high','/funds',0,'2026-04-20 08:00:00'),
('ntf_004','demo_ipp_001','ona_fault','CRITICAL fault — De Aar','Main transformer arc fault — all generation offline','critical','/om?fault=ona_fault_003',0,'2026-04-18 11:05:00'),
('ntf_005','demo_ipp_002','ona_fault','Turbine #24 brake fault','Jeffreys Bay — investigating','high','/om?fault=ona_fault_005',0,'2026-04-19 16:25:00'),
('ntf_006','demo_offtaker_001','invoice','Overdue invoice','INV-2026-0011 (R1.5m) — 35 days overdue','high','/settlement?invoice=inv_017',0,'2026-04-20 09:00:00'),
('ntf_007','demo_carbon_001','nav','NAV recomputed','Fund NAV/unit = R198.75; AUM R208.7m','medium','/carbon',0,'2026-04-15 16:00:00'),
('ntf_008','demo_trader_001','opportunity','Matching buy/sell on Klerksdorp','Trader AI recommends matching ord_005 ↔ ord_004 (est. P&L +R28,500)','medium','/trading',0,'2026-04-20 07:30:00'),
('ntf_009','demo_regulator_001','filing','Annual ESG filing reminder','3 ESG reports awaiting compliance certification by 31 May','medium','/reports',0,'2026-04-20 08:00:00'),
('ntf_010','demo_grid_001','constraint','Active grid constraint','Klerksdorp — JHB North 275kV constraint — 150MW available','high','/grid',0,'2026-04-20 07:00:00');
