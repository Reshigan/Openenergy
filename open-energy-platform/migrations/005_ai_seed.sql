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
('ip_007','Gqeberha Port Wind Cluster','demo_ipp_002','build_own_operate','wind',95,'Gqeberha, Eastern Cape','Gqeberha 132kV','construction','2024-01-15','2025-09-01',295000,305,20,1);

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
-- Column names match migrations/002_domain.sql invoices schema: from_participant_id,
-- to_participant_id, invoice_type, period_start, period_end, line_items (JSON),
-- subtotal, vat_amount, total_amount, status, due_date, issued_at, paid_at, notes.
INSERT OR IGNORE INTO invoices (id, invoice_number, project_id, from_participant_id, to_participant_id, invoice_type, period_start, period_end, line_items, subtotal, vat_rate, vat_amount, total_amount, currency, status, due_date, issued_at, paid_at, notes) VALUES
('inv_001','INV-2026-0001','ip_001','demo_ipp_001','demo_offtaker_001','energy','2026-01-01','2026-01-31','[{"desc":"Jan 2026 energy — 3,750 MWh @ R285","qty":3750,"unit_price":285,"amount":1068750}]',1068750,0.15,160312.50,1229062.50,'ZAR','paid','2026-03-02','2026-01-31','2026-02-25','Jan 2026 PPA'),
('inv_002','INV-2026-0002','ip_001','demo_ipp_001','demo_offtaker_001','energy','2026-02-01','2026-02-28','[{"desc":"Feb 2026 energy — 3,375 MWh","qty":3375,"unit_price":285,"amount":961875}]',961875,0.15,144281.25,1106156.25,'ZAR','paid','2026-03-30','2026-02-28','2026-03-25','Feb 2026 PPA'),
('inv_003','INV-2026-0003','ip_001','demo_ipp_001','demo_offtaker_001','energy','2026-03-01','2026-03-31','[{"desc":"Mar 2026 energy — 4,050 MWh","qty":4050,"unit_price":285,"amount":1154250}]',1154250,0.15,173137.50,1327387.50,'ZAR','paid','2026-04-30','2026-03-31','2026-04-27','Mar 2026 PPA'),
('inv_004','INV-2026-0004','ip_002','demo_ipp_002','demo_offtaker_001','energy','2026-01-01','2026-01-31','[{"desc":"Jan 2026 wind — 3,420 MWh","qty":3420,"unit_price":320,"amount":1094400}]',1094400,0.15,164160,1258560,'ZAR','paid','2026-03-02','2026-01-31','2026-02-26','Jan 2026 wind PPA'),
('inv_005','INV-2026-0005','ip_002','demo_ipp_002','demo_offtaker_001','energy','2026-02-01','2026-02-28','[{"desc":"Feb 2026 wind — 3,150 MWh","qty":3150,"unit_price":320,"amount":1008000}]',1008000,0.15,151200,1159200,'ZAR','paid','2026-03-30','2026-02-28','2026-03-28','Feb 2026 wind'),
('inv_006','INV-2026-0006','ip_002','demo_ipp_002','demo_offtaker_001','energy','2026-03-01','2026-03-31','[{"desc":"Mar 2026 wind — 3,780 MWh","qty":3780,"unit_price":320,"amount":1209600}]',1209600,0.15,181440,1391040,'ZAR','issued','2026-04-30','2026-03-31',NULL,'Mar 2026 wind PPA'),
('inv_007','INV-2026-0007',NULL,'demo_ipp_001','demo_trader_001','energy','2026-03-01','2026-03-31','[{"desc":"Trade ord_015 settlement","qty":250,"unit_price":3500,"amount":875000}]',875000,0.15,131250,1006250,'ZAR','paid','2026-04-14','2026-03-15','2026-04-10','Trade ord_015 settlement'),
('inv_008','INV-2026-0008','ip_001','demo_ipp_001','demo_offtaker_001','energy','2026-04-01','2026-04-30','[{"desc":"Apr interim — 3,750 MWh","qty":3750,"unit_price":285,"amount":1068750}]',1068750,0.15,160312.50,1229062.50,'ZAR','issued','2026-05-01','2026-04-15',NULL,'Apr interim'),
('inv_009','INV-2026-0009','ip_002','demo_ipp_002','demo_offtaker_001','energy','2026-04-01','2026-04-30','[{"desc":"Apr wind PPA","qty":3600,"unit_price":320,"amount":1152000}]',1152000,0.15,172800,1324800,'ZAR','issued','2026-05-01','2026-04-15',NULL,'Apr wind PPA'),
('inv_010','INV-2026-0010','ip_001','demo_ipp_001','demo_offtaker_001','energy','2025-12-01','2025-12-31','[{"desc":"Dec 2025 — 4,506 MWh","qty":4506,"unit_price":285,"amount":1284210}]',1284210,0.15,192631.50,1476841.50,'ZAR','paid','2026-01-30','2025-12-31','2026-01-28','Dec 2025'),
('inv_011','INV-2025-0118','ip_001','demo_ipp_001','demo_offtaker_001','energy','2025-11-01','2025-11-30','[{"desc":"Nov 2025 PPA","qty":3750,"unit_price":285,"amount":1068750}]',1068750,0.15,160312.50,1229062.50,'ZAR','paid','2025-12-30','2025-11-30','2025-12-27','Nov 2025'),
('inv_012','INV-2025-0099','ip_002','demo_ipp_002','demo_offtaker_001','energy','2025-10-01','2025-10-31','[{"desc":"Oct 2025 wind","qty":3900,"unit_price":320,"amount":1248000}]',1248000,0.15,187200,1435200,'ZAR','paid','2025-11-30','2025-10-31','2025-11-27','Oct 2025 wind'),
('inv_013','INV-2025-0087','ip_001','demo_ipp_001','demo_offtaker_001','energy','2025-09-01','2025-09-30','[{"desc":"Sep 2025","qty":3483,"unit_price":285,"amount":992655}]',992655,0.15,148898.25,1141553.25,'ZAR','paid','2025-10-30','2025-09-30','2025-10-27','Sep 2025'),
('inv_014','INV-2025-0075','ip_002','demo_ipp_002','demo_offtaker_001','energy','2025-08-01','2025-08-31','[{"desc":"Aug 2025 wind","qty":3420,"unit_price":320,"amount":1094400}]',1094400,0.15,164160,1258560,'ZAR','paid','2025-09-30','2025-08-31','2025-09-28','Aug 2025 wind'),
('inv_015','INV-2025-0062','ip_001','demo_ipp_001','demo_offtaker_001','energy','2025-07-01','2025-07-31','[{"desc":"Jul 2025","qty":3021,"unit_price":285,"amount":860985}]',860985,0.15,129147.75,990132.75,'ZAR','paid','2025-08-30','2025-07-31','2025-08-27','Jul 2025'),
('inv_016','INV-2025-0055','ip_001','demo_ipp_001','demo_offtaker_001','energy','2025-06-01','2025-06-30','[{"desc":"Metering-variance — under dispute","qty":3750,"unit_price":285,"amount":1068750}]',1068750,0.15,160312.50,1229062.50,'ZAR','disputed','2025-07-30','2025-06-30',NULL,'Metering-variance dispute'),
('inv_017','INV-2026-0011','ip_002','demo_ipp_002','demo_offtaker_001','energy','2026-02-01','2026-02-28','[{"desc":"Feb 2026 wind — escalated","qty":3420,"unit_price":320,"amount":1094400}]',1094400,0.15,164160,1258560,'ZAR','overdue','2026-03-17','2026-02-15',NULL,'Overdue 35 days — escalated'),
('inv_018','INV-2026-0012',NULL,'demo_trader_001','demo_ipp_002','management','2026-01-01','2026-03-31','[{"desc":"Brokerage fee Q1 trades","qty":1,"unit_price":235000,"amount":235000}]',235000,0.15,35250,270250,'ZAR','issued','2026-04-21','2026-03-22',NULL,'Brokerage fee Q1 trades'),
('inv_019','INV-2026-0013','ip_003','demo_ipp_001','demo_offtaker_001','management','2026-04-01','2026-04-30','[{"desc":"Brits rooftop design-study fee","qty":1,"unit_price":85000,"amount":85000}]',85000,0.15,12750,97750,'ZAR','issued','2026-05-10','2026-04-10',NULL,'Brits rooftop design-study fee'),
('inv_020','INV-2026-0014',NULL,'demo_ipp_001','demo_trader_001','energy','2026-04-01','2026-04-30','[{"desc":"Volume variance on ord_017 settlement","qty":75,"unit_price":7200,"amount":540000}]',540000,0.15,81000,621000,'ZAR','disputed','2026-05-18','2026-04-18',NULL,'Volume variance dispute');

-- ---- ADDITIONAL CONTRACT DOCUMENTS (linked to SA-law templates) ------------
-- Only document_types / phases that fit the 002_domain CHECK constraints are
-- seeded here. Facility agreements, O&M, grid connection and JV shareholders
-- live in the contract_templates table (migration 004) and are exercised via
-- the template picker — not required as seeded documents.
INSERT OR IGNORE INTO contract_documents (id, title, document_type, phase, creator_id, counterparty_id, project_id, commercial_terms) VALUES
('doc_004','De Aar Solar PPA (Wheeling) — City Energy','ppa_wheeling','legal_review','demo_ipp_001','demo_offtaker_001','ip_004','{"volume_mwh":140000,"price_per_mwh":275,"escalation":4.5,"tenor_years":20,"template_code":"PPA-WHEEL-SA"}'),
('doc_005','Jeffreys Bay Wind Wheeling — City Energy','ppa_wheeling','active','demo_ipp_002','demo_offtaker_001','ip_005','{"volume_mwh":380000,"price_per_mwh":310,"escalation":4.0,"tenor_years":20,"template_code":"PPA-WHEEL-SA"}'),
('doc_006','Gqeberha Wind PPA (Direct Supply)','offtake_agreement','legal_review','demo_ipp_002','demo_offtaker_001','ip_007','{"volume_mwh":295000,"price_per_mwh":305,"escalation":4.2,"tenor_years":20,"template_code":"DIRECT-SUPPLY-SA"}'),
('doc_007','LOI — Upington CSP Offtake (City Energy)','loi','legal_review','demo_ipp_001','demo_offtaker_001','ip_006','{"indicative_volume_mwh":350000,"indicative_price_per_mwh":420,"tenor_years":25,"template_code":"LOI-SA"}'),
('doc_013','Klerksdorp Wheeling Agreement (UoS)','wheeling_agreement','active','demo_ipp_001','demo_grid_001','ip_001','{"wheeling_capacity_mw":50,"template_code":"UOS-SA"}'),
('doc_014','Klerksdorp — City Energy ERPA (Carbon Sale)','carbon_purchase','active','demo_ipp_001','demo_carbon_001','ip_001','{"tco2e_volume":12000,"price_per_tco2e":195,"ipp_carbon_share_pct":25,"template_code":"ERPA-SA"}'),
('doc_015','Mookgopong — GreenFunds ERPA','carbon_purchase','active','demo_ipp_002','demo_carbon_001','ip_002','{"tco2e_volume":9500,"price_per_tco2e":185,"ipp_carbon_share_pct":20,"template_code":"ERPA-SA"}'),
('doc_016','Mutual NDA — RenewCo/City Energy','nda','active','demo_ipp_001','demo_offtaker_001',NULL,'{"term_years":2,"survival_years":5,"template_code":"NDA-SA"}'),
('doc_018','De Aar Solar EPC','epc','active','demo_ipp_001','demo_ipp_002','ip_004','{"contract_price":1350000000,"construction_months":14,"template_code":"EPC-SA"}');

-- ---- ACTION QUEUE (cross-module handovers surfaced on cockpits) ------------
-- Column names match 002_domain.sql action_queue schema: type, priority, actor_id,
-- assignee_id, entity_type, entity_id, title, description, status, due_date.
-- priority CHECK: low|normal|high|urgent (maps critical→urgent, medium→normal).
INSERT OR IGNORE INTO action_queue (id, type, priority, assignee_id, entity_type, entity_id, title, description, status, due_date) VALUES
('aq_001','contract.awaiting_signature','high',    'demo_offtaker_001','contract_documents','doc_004','Sign De Aar Solar Wheeling PPA','Contract doc_004 awaiting your signature','pending','2026-04-30'),
('aq_002','contract.awaiting_signature','high',    'demo_offtaker_001','contract_documents','doc_006','Sign Gqeberha Wind PPA','Contract doc_006 awaiting your signature','pending','2026-05-07'),
('aq_003','contract.jv_review','normal',           'demo_ipp_001',     'contract_documents','doc_007','Review Upington LOI','Counterparty countersignature required','pending','2026-05-10'),
('aq_004','disbursement.pending_approval','high',  'demo_lender_001',  'disbursement_requests','dis_001','Approve De Aar drawdown tranche 1','R95m construction drawdown awaiting credit committee','pending','2026-04-25'),
('aq_005','disbursement.pending_approval','high',  'demo_lender_001',  'disbursement_requests','dis_002','Approve De Aar drawdown tranche 2','R140m construction drawdown awaiting approval','pending','2026-04-25'),
('aq_006','disbursement.pending_approval','high',  'demo_lender_001',  'disbursement_requests','dis_003','Approve De Aar drawdown tranche 3','R85m construction drawdown awaiting approval','pending','2026-04-26'),
('aq_007','disbursement.pending_approval','normal','demo_lender_001',  'disbursement_requests','dis_004','Approve Gqeberha drawdown','R120m construction drawdown awaiting approval','pending','2026-04-27'),
('aq_008','disbursement.pending_approval','normal','demo_lender_001',  'disbursement_requests','dis_008','Approve Gqeberha drawdown','R60m drawdown awaiting approval','pending','2026-04-28'),
('aq_009','covenant.breached','urgent',            'demo_lender_001',  'loan_covenants','cov_009','Investigate DSCR breach (fac_004)','Jeffreys Bay Wind DSCR breached two consecutive quarters','pending','2026-04-25'),
('aq_010','covenant.breached','urgent',            'demo_lender_001',  'loan_covenants','cov_010','Investigate LLCR breach (fac_004)','LLCR below covenant — cure under negotiation','pending','2026-04-25'),
('aq_011','covenant.breached','urgent',            'demo_lender_001',  'loan_covenants','cov_011','Investigate Leverage breach (fac_004)','Waiver requested from credit committee','pending','2026-04-25'),
('aq_012','ona.fault','urgent',                    'demo_ipp_001',     'ona_faults','ona_fault_003','Resolve De Aar transformer arc fault','Site offline — awaiting Eskom maintenance crew','pending','2026-04-22'),
('aq_013','ona.fault','high',                      'demo_ipp_002',     'ona_faults','ona_fault_005','Resolve Jeffreys Bay turbine brake fault','Turbine #24 — brake pad wear investigation','pending','2026-04-22'),
('aq_014','ona.generation_lost','high',            'demo_lender_001',  'ona_faults','ona_fault_003','Monitor generation loss (fac_003)','De Aar transformer outage — lender to assess covenant exposure','pending','2026-04-23'),
('aq_015','invoice.due','normal',                  'demo_offtaker_001','invoices','inv_008','Pay invoice INV-2026-0008','R1.22m Apr PPA invoice due','pending','2026-05-01'),
('aq_016','invoice.overdue','high',                'demo_offtaker_001','invoices','inv_017','Pay overdue invoice INV-2026-0011','R1.26m invoice overdue 35 days — escalated','pending','2026-03-17'),
('aq_017','invoice.overdue_counter','high',        'demo_ipp_002',     'invoices','inv_017','Chase overdue invoice INV-2026-0011','Counterparty payment escalation','pending','2026-04-22'),
('aq_018','dispute.invoice','normal',              'demo_ipp_001',     'invoices','inv_016','Resolve metering-variance dispute (INV-2025-0055)','Metering-variance under dispute resolution','pending','2026-04-30'),
('aq_019','trade.match_opportunity','normal',      'demo_trader_001',  'trade_orders','ord_008','Match opportunity on ord_008','Bilateral match opportunity with demo_offtaker_001','pending','2026-05-10'),
('aq_020','carbon.reserved_pending_retirement','low','demo_carbon_001','carbon_holdings','ch_006','Confirm retirement of ch_006','Reserved credits awaiting retirement confirmation','pending','2026-05-15'),
('aq_021','filing.annual','normal',                'demo_regulator_001','esg_reports','esgr_001','File annual ESG compliance certification','3 ESG reports awaiting compliance certification','pending','2026-05-31'),
('aq_022','grid.constraint','high',                'demo_grid_001',    'grid_constraints','gc_001','Resolve Klerksdorp-JHB North 275kV constraint','Planned maintenance — 150MW available','pending','2026-04-30'),
('aq_023','milestone.upcoming','normal',           'demo_ipp_001',     'project_milestones','mil_017','Submit evidence for De Aar Construction Complete','Milestone mil_017 evidence required','pending','2026-10-10'),
('aq_024','milestone.upcoming','normal',           'demo_ipp_002',     'project_milestones','mil_027','Submit evidence for Gqeberha Construction Complete','Milestone mil_027 evidence required','pending','2025-07-10');

-- ---- NOTIFICATIONS (so each user sees inbox on login) ----------------------
-- Column names match 002_domain.sql notifications schema: type, title, body, data (JSON), read.
INSERT OR IGNORE INTO notifications (id, participant_id, type, title, body, data, read, created_at) VALUES
('ntf_001','demo_offtaker_001','contract','Contract ready to sign','De Aar Solar Wheeling PPA (doc_004) awaiting your signature','{"priority":"high","action_url":"/contracts/doc_004"}',0,'2026-04-20 09:00:00'),
('ntf_002','demo_lender_001','covenant_breach','Covenant BREACHED','Jeffreys Bay Wind (fac_004) — 3 covenants breached; standstill triggered','{"priority":"critical","action_url":"/funds/fac_004"}',0,'2026-04-15 11:30:00'),
('ntf_003','demo_lender_001','disbursement','5 pending disbursements','R500m awaiting approval across De Aar + Gqeberha facilities','{"priority":"high","action_url":"/funds"}',0,'2026-04-20 08:00:00'),
('ntf_004','demo_ipp_001','ona_fault','CRITICAL fault — De Aar','Main transformer arc fault — all generation offline','{"priority":"critical","action_url":"/om?fault=ona_fault_003"}',0,'2026-04-18 11:05:00'),
('ntf_005','demo_ipp_002','ona_fault','Turbine #24 brake fault','Jeffreys Bay — investigating','{"priority":"high","action_url":"/om?fault=ona_fault_005"}',0,'2026-04-19 16:25:00'),
('ntf_006','demo_offtaker_001','invoice','Overdue invoice','INV-2026-0011 (R1.5m) — 35 days overdue','{"priority":"high","action_url":"/settlement?invoice=inv_017"}',0,'2026-04-20 09:00:00'),
('ntf_007','demo_carbon_001','nav','NAV recomputed','Fund NAV/unit = R198.75; AUM R208.7m','{"priority":"medium","action_url":"/carbon"}',0,'2026-04-15 16:00:00'),
('ntf_008','demo_trader_001','opportunity','Matching buy/sell on Klerksdorp','Trader AI recommends matching ord_005 ↔ ord_004 (est. P&L +R28,500)','{"priority":"medium","action_url":"/trading"}',0,'2026-04-20 07:30:00'),
('ntf_009','demo_regulator_001','filing','Annual ESG filing reminder','3 ESG reports awaiting compliance certification by 31 May','{"priority":"medium","action_url":"/reports"}',0,'2026-04-20 08:00:00'),
('ntf_010','demo_grid_001','constraint','Active grid constraint','Klerksdorp — JHB North 275kV constraint — 150MW available','{"priority":"high","action_url":"/grid"}',0,'2026-04-20 07:00:00');
