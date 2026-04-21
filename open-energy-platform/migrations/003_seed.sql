-- ---------------------------------------------------------------------------
-- OPEN ENERGY PLATFORM - SEED DATA
-- Migration 003: Modules, Roles, Fee Schedules, Emission Factors, Demo Data
-- ---------------------------------------------------------------------------

-- ---- PLATFORM MODULES ----
INSERT OR IGNORE INTO modules (id, module_key, display_name, description, enabled, required_role, price_monthly) VALUES
('mod_001', 'bilateral_trading', 'Bilateral Trading', 'Direct energy trading between participants', 1, NULL, 0),
('mod_002', 'exchange', 'Exchange Trading', 'Exchange-based order matching and execution', 1, NULL, 0),
('mod_003', 'carbon_market', 'Carbon Market', 'Carbon credit trading, retirement, and fund management', 1, NULL, 0),
('mod_004', 'ipp_projects', 'IPP Projects', 'Project finance tracking and milestones', 1, 'ipp_developer', 0),
('mod_005', 'esg_sustainability', 'ESG & Sustainability', 'Environmental, social, governance tracking and reporting', 1, NULL, 0),
('mod_006', 'grid_wheeling', 'Grid Wheeling', 'Energy wheeling and grid connection management', 1, NULL, 0),
('mod_007', 'fund_management', 'Fund Management', 'Energy fund NAV, options, vintage tracking', 1, 'lender', 0),
('mod_008', 'deal_rooms', 'Deal Rooms', 'Structured negotiation rooms with term tracking', 1, NULL, 0),
('mod_009', 'procurement', 'Procurement Hub', 'RFP creation, bid management, award tracking', 1, NULL, 0),
('mod_010', 'intelligence', 'Intelligence', 'Auto-scanned insights, CP deadlines, risk alerts', 1, NULL, 0),
('mod_011', 'morning_briefing', 'Morning Briefing', 'Daily market and portfolio summary', 1, NULL, 0),
('mod_012', 'marketplace', 'Marketplace', 'Public listings for energy, capacity, carbon', 1, NULL, 0),
('mod_013', ' ona', 'Ona Integration', 'Operational Nomination & Analysis (forecasts, faults, nominations)', 0, NULL, 0),
('mod_014', 'metering', 'Metering', 'Grid metering readings and validation', 1, NULL, 0);

-- ---- ESG METRICS ----
INSERT OR IGNORE INTO esg_metrics (id, metric_name, category, unit, description, calculation_method) VALUES
('esg_met_001', 'Scope 1 Emissions', 'environmental', 'tCO2e', 'Direct GHG emissions from owned sources', 'SUM(fuel_combustion + process_emissions + fugitive_emissions)'),
('esg_met_002', 'Scope 2 Emissions', 'environmental', 'tCO2e', 'Indirect GHG from purchased electricity', 'grid_electricity_kwh × emission_factor'),
('esg_met_003', 'Scope 3 Emissions', 'environmental', 'tCO2e', 'Other indirect emissions', 'supply_chain + business_travel + employee_commuting + waste'),
('esg_met_004', 'Renewable Energy Percentage', 'environmental', '%', 'Share of energy from renewable sources', '(renewable_kwh / total_energy_kwh) × 100'),
('esg_met_005', 'Water Usage', 'environmental', 'm³', 'Total water consumption', 'SUM(purchased + surface + groundwater)'),
('esg_met_006', 'Waste Recycled', 'environmental', '%', 'Percentage of waste diverted from landfill', '(recycled_tonnes / total_waste_tonnes) × 100'),
('esg_met_007', 'Energy Intensity', 'environmental', 'kWh/unit', 'Energy consumption per unit of production', 'total_energy_kwh / production_units'),
('esg_met_008', 'Carbon Intensity', 'environmental', 'tCO2e/MWh', 'GHG emissions per unit of energy generated', 'total_emissions_tco2e / total_generation_mwh'),
('esg_met_009', 'Safety Incidents', 'social', 'count', 'Number of lost-time injuries', 'COUNT(lti_events)'),
('esg_met_010', 'Training Hours', 'social', 'hours', 'Employee training and development hours', 'SUM(training_hours_per_employee)'),
('esg_met_011', 'Employee Turnover', 'social', '%', 'Annual employee turnover rate', '(departures / avg_headcount) × 100'),
('esg_met_012', 'Community Investment', 'social', 'ZAR', 'Investment in local community programs', 'SUM(donations + programs)'),
('esg_met_013', 'Board Diversity', 'governance', '%', 'Percentage of board from underrepresented groups', '(diverse_board_members / total_board) × 100'),
('esg_met_014', 'ESG Score', 'governance', 'score', 'Overall ESG performance score (0-100)', 'CALCULATED FROM ENVIRONMENTAL + SOCIAL + GOVERNANCE SUB-SCORES'),
('esg_met_015', 'Transparency Score', 'governance', 'score', 'Disclosure and reporting transparency (0-100)', 'WEIGHTED SCORE FROM REPORTED DATA POINTS');

-- ---- FEE SCHEDULE ----
CREATE TABLE IF NOT EXISTS fee_schedule (
  id TEXT PRIMARY KEY,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('trading_commission','carbon_transaction','escrow','disbursement','management','platform','currency')),
  description TEXT,
  rate_type TEXT NOT NULL CHECK (rate_type IN ('fixed','percentage','tiered')),
  rate_value REAL NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  min_amount REAL,
  max_amount REAL,
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO fee_schedule (id, fee_type, description, rate_type, rate_value, currency, effective_from) VALUES
('fee_001', 'trading_commission', 'Bilateral trade commission', 'percentage', 0.15, 'ZAR', '2024-01-01'),
('fee_002', 'carbon_transaction', 'Carbon credit transaction fee', 'percentage', 0.25, 'ZAR', '2024-01-01'),
('fee_003', 'escrow', 'Escrow management fee', 'fixed', 250, 'ZAR', '2024-01-01'),
('fee_004', 'disbursement', 'Project disbursement fee', 'percentage', 0.50, 'ZAR', '2024-01-01'),
('fee_005', 'management', 'Platform management fee (monthly)', 'fixed', 1500, 'ZAR', '2024-01-01'),
('fee_006', 'platform', 'Enterprise platform fee (monthly)', 'fixed', 15000, 'ZAR', '2024-01-01');

-- ---- EMISSION FACTORS (South Africa 2024) ----
CREATE TABLE IF NOT EXISTS emission_factors (
  id TEXT PRIMARY KEY,
  country TEXT DEFAULT 'South Africa',
  energy_source TEXT NOT NULL,
  factor_value REAL NOT NULL,
  unit TEXT DEFAULT 'kgCO2/kWh',
  source TEXT,
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO emission_factors (id, energy_source, factor_value, unit, source, valid_from) VALUES
('ef_001', 'Grid Electricity (SA national)', 0.82, 'kgCO2/kWh', 'Eskom + DEFF 2024', '2024-01-01'),
('ef_002', 'Coal (avg)', 0.94, 'kgCO2/kWh', 'Eskom 2024', '2024-01-01'),
('ef_003', 'Natural Gas', 0.45, 'kgCO2/kWh', 'IPCC AR5', '2024-01-01'),
('ef_004', 'Diesel', 0.73, 'kgCO2/kWh', 'IPCC AR5', '2024-01-01'),
('ef_005', 'Solar PV', 0.04, 'kgCO2/kWh', 'DEFRA 2024', '2024-01-01'),
('ef_006', 'Wind', 0.01, 'kgCO2/kWh', 'DEFRA 2024', '2024-01-01'),
('ef_007', 'Nuclear', 0.01, 'kgCO2/kWh', 'IPCC AR5', '2024-01-01'),
('ef_008', 'Hydro (large)', 0.03, 'kgCO2/kWh', 'IPCC AR5', '2024-01-01'),
('ef_009', 'Biomass', 0.03, 'kgCO2/kWh', 'DEFRA 2024', '2024-01-01');

-- ---- DEMO PARTICIPANTS ----
INSERT OR IGNORE INTO participants (id, email, password_hash, name, company_name, role, status, kyc_status, bbbee_level, subscription_tier, email_verified, onboarding_completed) VALUES
('demo_admin_001', 'admin@openenergy.co.za', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYuP6V6xq4y', 'System Admin', 'Open Energy Platform', 'admin', 'active', 'approved', 1, 'enterprise', 1, 1),
('demo_trader_001', 'trader@demo.co.za', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYuP6V6xq4y', 'Sipho Mkhize', 'Mkhize Energy Traders', 'trader', 'active', 'approved', 2, 'professional', 1, 1),
('demo_ipp_001', 'ippsolar@renewco.za', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYuP6V6xq4y', 'Johan van der Berg', 'RenewCo Solar (Pty) Ltd', 'ipp_developer', 'active', 'approved', 3, 'enterprise', 1, 1),
('demo_ipp_002', 'ippeol@windcapital.za', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYuP6V6xq4y', 'Lerato Moloto', 'WindCapital (Pty) Ltd', 'ipp_developer', 'active', 'approved', 4, 'professional', 1, 1),
('demo_carbon_001', 'portfolio@greenfunds.co.za', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYuP6V6xq4y', 'Anita Naidoo', 'GreenFunds Carbon Fund', 'carbon_fund', 'active', 'approved', 1, 'enterprise', 1, 1),
('demo_offtaker_001', 'energy@municipality.gov.za', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYuP6V6xq4y', 'Thabo Molefe', 'City Energy Municipality', 'offtaker', 'active', 'approved', 1, 'enterprise', 1, 1),
('demo_lender_001', 'deals@infrastructure-cap.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYuP6V6xq4y', 'Pieter van Zyl', 'Infrastructure Capital Partners', 'lender', 'active', 'approved', 1, 'enterprise', 1, 1),
('demo_grid_001', 'operations@eskom.co.za', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYuP6V6xq4y', 'Nomsa Dlamini', 'Eskom Holdings', 'grid_operator', 'active', 'approved', NULL, 'enterprise', 1, 1),
('demo_viewer_001', 'analyst@energyresearch.org', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYuP6V6xq4y', 'Kagiso Tlhotlhalemaje', 'Energy Research Institute', 'regulator', 'active', 'approved', NULL, 'starter', 1, 0);

-- ---- DEMO CARBON PROJECTS ----
INSERT OR IGNORE INTO carbon_projects (id, project_name, project_number, project_type, methodology, host_country, developer_id, credits_issued, credits_available, status, registration_date) VALUES
('cp_001', 'Klerksdorp Solar Farm', 'SA-CER-2019-045', 'solar', 'ACM0002', 'South Africa', 'demo_ipp_001', 125000, 45000, 'verified', '2019-06-15'),
('cp_002', 'Mookgopong Wind Project', 'SA-CER-2020-078', 'wind', 'ACM0002', 'South Africa', 'demo_ipp_002', 89000, 23000, 'verified', '2020-03-22'),
('cp_003', 'Rural Clean Cookstoves', 'SA-VER-2021-012', 'cookstoves', 'VM0042', 'South Africa', 'demo_carbon_001', 45000, 18000, 'active', '2021-11-08'),
('cp_004', 'Biomass Energy from Waste', 'SA-CER-2022-034', 'biomass', 'ACM0009', 'South Africa', 'demo_ipp_001', 67000, 67000, 'pending', '2022-09-01');

-- ---- DEMO IPP PROJECTS ----
INSERT OR IGNORE INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location, grid_connection_point, status, construction_start_date, commercial_operation_date, ppa_volume_mwh, ppa_price_per_mwh, ppa_duration_years, renewable_energy_certificate_eligible) VALUES
('ip_001', 'Klerksdorp 50MW Solar PV', 'demo_ipp_001', 'build_own_operate', 'solar_pv', 50, 'Klerksdorp, North West', 'Klerksdorp Substation 132kV', 'commercial_operations', '2021-01-15', '2022-06-01', 90000, 285, 20, 1),
('ip_002', 'Mookgopong 40MW Wind', 'demo_ipp_002', 'build_operate_transfer', 'wind', 40, 'Mookgopong, Limpopo', 'Mookgopong 132kV', 'commercial_operations', '2020-08-01', '2022-03-01', 85000, 320, 20, 1),
('ip_003', 'Brits 25MW Solar Rooftop', 'demo_ipp_001', 'private_wire', 'solar_pv', 25, 'Brits, North West', 'Internal Distribution', 'development', '2024-06-01', '2025-12-01', 45000, 380, 15, 1);

-- ---- DEMO PROJECT MILESTONES ----
INSERT OR IGNORE INTO project_milestones (id, project_id, milestone_name, milestone_type, order_index, target_date, satisfied_date, status) VALUES
('mil_001', 'ip_001', 'Conditions Precedent Satisfied', 'financial_close', 1, '2021-03-01', '2021-02-28', 'satisfied'),
('mil_002', 'ip_001', 'Financial Close', 'financial_close', 2, '2021-04-15', '2021-04-10', 'satisfied'),
('mil_003', 'ip_001', 'Construction Start', 'construction_start', 3, '2021-05-01', '2021-04-20', 'satisfied'),
('mil_004', 'ip_001', 'Construction Complete', 'construction_complete', 4, '2022-04-01', '2022-05-15', 'satisfied'),
('mil_005', 'ip_001', 'Commissioning', 'commissioning', 5, '2022-05-15', '2022-05-25', 'satisfied'),
('mil_006', 'ip_001', 'Commercial Operation Date', 'cod', 6, '2022-06-01', '2022-06-01', 'satisfied'),
('mil_007', 'ip_002', 'Conditions Precedent Satisfied', 'financial_close', 1, '2020-11-01', '2020-10-28', 'satisfied'),
('mil_008', 'ip_002', 'Financial Close', 'financial_close', 2, '2020-12-15', '2020-12-10', 'satisfied'),
('mil_009', 'ip_002', 'Commercial Operation Date', 'cod', 3, '2022-03-01', '2022-03-01', 'satisfied'),
('mil_010', 'ip_003', 'Conditions Precedent Satisfied', 'financial_close', 1, '2024-08-01', NULL, 'pending'),
('mil_011', 'ip_003', 'Financial Close', 'financial_close', 2, '2024-10-01', NULL, 'pending'),
('mil_012', 'ip_003', 'Construction Start', 'construction_start', 3, '2025-01-15', NULL, 'pending'),
('mil_013', 'ip_003', 'Commercial Operation Date', 'cod', 4, '2025-12-01', NULL, 'pending');

-- ---- DEMO CONTRACTS ----
INSERT OR IGNORE INTO contract_documents (id, title, document_type, phase, creator_id, counterparty_id, project_id, commercial_terms) VALUES
('doc_001', 'Klerksdorp Solar PPA - City Energy Municipality', 'ppa_btm', 'active', 'demo_ipp_001', 'demo_offtaker_001', 'ip_001', '{"volume_mwh":45000,"price_per_mwh":285,"escalation":2.5,"tenor_years":20}'),
('doc_002', 'Mookgopong Wind PPA - City Energy Municipality', 'ppa_btm', 'active', 'demo_ipp_002', 'demo_offtaker_001', 'ip_002', '{"volume_mwh":42500,"price_per_mwh":320,"escalation":2.0,"tenor_years":20}'),
('doc_003', 'Term Sheet - Brits Rooftop Solar', 'term_sheet', 'hoa', 'demo_ipp_001', 'demo_offtaker_001', 'ip_003', '{"volume_mwh":22500,"price_per_mwh":380,"tenor_years":15}');

-- ---- DEMO TRADE ORDERS ----
INSERT OR IGNORE INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status) VALUES
('ord_001', 'demo_trader_001', 'buy', 'solar', 100, 250, 300, '2024-07-15', 'Klerksdorp', 'bilateral', 'open'),
('ord_002', 'demo_ipp_001', 'sell', 'solar', 50, 270, 290, '2024-07-15', 'Klerksdorp', 'bilateral', 'open'),
('ord_003', 'demo_trader_001', 'buy', 'wind', 75, 300, 340, '2024-07-20', 'Mookgopong', 'bilateral', 'open');

-- ---- DEMO ESG REPORTS ----
INSERT OR IGNORE INTO esg_reports (id, report_title, participant_id, reporting_year, reporting_period, status, total_ghg_emissions_tco2e, renewable_energy_percentage, water_usage_m3, waste_recycled_percentage, board_diversity_percentage, created_by) VALUES
('esgr_001', 'Klerksdorp Solar Annual ESG Report 2023', 'demo_ipp_001', 2023, 'annual', 'published', 120, 98.5, 4500, 72, 33, 'demo_admin_001'),
('esgr_002', 'Mookgopong Wind Annual ESG Report 2023', 'demo_ipp_002', 2023, 'annual', 'published', 85, 99.1, 3200, 85, 40, 'demo_admin_001');

-- ---- DEMO GRID CONSTRAINTS ----
INSERT OR IGNORE INTO grid_constraints (id, constraint_type, location, severity, available_capacity_mw, affected_participants, start_date, status, description) VALUES
('gc_001', 'transmission', 'Klerksdorp - Johannesburg North', 'high', 150, 'demo_ipp_001,demo_trader_001', '2024-06-01', 'active', 'Planned maintenance on 275kV line causing capacity reduction'),
('gc_002', 'distribution', 'Mookgopong Area', 'medium', 80, 'demo_ipp_002', '2024-05-15', 'active', 'Transformer upgrade in progress');

-- ---- DEMO ENERGY FUNDS ----
INSERT OR IGNORE INTO energy_funds (id, fund_name, fund_type, target_size, vintage_year, tenure_years, status, total_commitments, total_deployed) VALUES
('fund_001', 'Green Energy Transition Fund I', 'renewable_infrastructure', 500000000, 2022, 10, 'active', 320000000, 145000000),
('fund_002', 'Carbon Offset Fund SA', 'carbon_credits', 100000000, 2023, 7, 'active', 75000000, 42000000);