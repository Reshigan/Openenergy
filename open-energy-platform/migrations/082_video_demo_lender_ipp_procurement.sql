-- ═══════════════════════════════════════════════════════════════════════════
-- 082_video_demo_lender_ipp_procurement.sql
--
-- Round 2 of the camera-critical seed. Fixes 4 silently-failed sections from
-- 081 (margin_calls, grid_curtailment_events, esg_reports, audit_chain — all
-- bounced on CHECK constraints with the wrong enum vocabulary), and adds the
-- depth needed for the Lender, IPP and Offtaker workstations.
--
-- One INSERT per row (no UNION ALL chains — D1 caps compound terms).
-- Safe to re-run (INSERT OR IGNORE on stable IDs).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0a. Ensure demo participants exist (migration-replay test skips seeds) ──
-- The migration-replay test in tests/migrations-replay.test.ts does NOT
-- apply *_seed.sql files (003_seed, 005_ai_seed, etc.), so the FK-target
-- participant rows that 082 references (demo_ipp_001, demo_ipp_002,
-- demo_offtaker_001, etc.) are not present when this migration replays in
-- isolation. INSERT OR IGNORE makes these guards no-ops on real systems
-- where 003_seed has already populated them.
-- Demo password: Demo@2024! → pbkdf2 hash matches all other demo personas.
INSERT OR IGNORE INTO participants
  (id, email, password_hash, name, company_name, role, status, kyc_status,
   subscription_tier, tenant_id, email_verified, onboarding_completed, bbbee_level)
VALUES
  ('demo_ipp_001', 'ipp@openenergy.co.za',
   'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
   'Naledi Sithole', 'SolarSpark IPP (Pty) Ltd',
   'ipp_developer', 'active', 'approved', 'professional', 'default', 1, 1, 2);
INSERT OR IGNORE INTO participants
  (id, email, password_hash, name, company_name, role, status, kyc_status,
   subscription_tier, tenant_id, email_verified, onboarding_completed, bbbee_level)
VALUES
  ('demo_ipp_002', 'wind@openenergy.co.za',
   'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
   'Lerato Moloto', 'WindCapital (Pty) Ltd',
   'ipp_developer', 'active', 'approved', 'professional', 'default', 1, 1, 4);
INSERT OR IGNORE INTO participants
  (id, email, password_hash, name, company_name, role, status, kyc_status,
   subscription_tier, tenant_id, email_verified, onboarding_completed, bbbee_level)
VALUES
  ('demo_offtaker_001', 'offtaker@openenergy.co.za',
   'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
   'Sipho Khumalo', 'Anchor Offtaker — C&I Mining Group',
   'offtaker', 'active', 'approved', 'enterprise', 'default', 1, 1, 3);
INSERT OR IGNORE INTO participants
  (id, email, password_hash, name, company_name, role, status, kyc_status,
   subscription_tier, tenant_id, email_verified, onboarding_completed, bbbee_level)
VALUES
  ('demo_lender_001', 'lender@openenergy.co.za',
   'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
   'Thandi van der Merwe', 'GreenBank Africa',
   'lender', 'active', 'approved', 'enterprise', 'default', 1, 1, 1);
INSERT OR IGNORE INTO participants
  (id, email, password_hash, name, company_name, role, status, kyc_status,
   subscription_tier, tenant_id, email_verified, onboarding_completed, bbbee_level)
VALUES
  ('demo_admin_001', 'admin@openenergy.co.za',
   'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
   'Aisha Patel', 'Open Energy Platform',
   'admin', 'active', 'approved', 'enterprise', 'default', 1, 1, 1);
INSERT OR IGNORE INTO participants
  (id, email, password_hash, name, company_name, role, status, kyc_status,
   subscription_tier, tenant_id, email_verified, onboarding_completed, bbbee_level)
VALUES
  ('demo_trader_001', 'trader@openenergy.co.za',
   'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
   'Mohammed Adams', 'Vantage Energy Trading',
   'trader', 'active', 'approved', 'enterprise', 'default', 1, 1, 2);
INSERT OR IGNORE INTO participants
  (id, email, password_hash, name, company_name, role, status, kyc_status,
   subscription_tier, tenant_id, email_verified, onboarding_completed, bbbee_level)
VALUES
  ('demo_carbon_001', 'carbon@openenergy.co.za',
   'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
   'Zinhle Ndlovu', 'Verra Africa Carbon',
   'carbon_fund', 'active', 'approved', 'professional', 'default', 1, 1, 2);
INSERT OR IGNORE INTO participants
  (id, email, password_hash, name, company_name, role, status, kyc_status,
   subscription_tier, tenant_id, email_verified, onboarding_completed, bbbee_level)
VALUES
  ('demo_regulator_001', 'regulator@openenergy.co.za',
   'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
   'Pieter du Toit', 'NERSA',
   'regulator', 'active', 'approved', 'enterprise', 'default', 1, 1, 1);
INSERT OR IGNORE INTO participants
  (id, email, password_hash, name, company_name, role, status, kyc_status,
   subscription_tier, tenant_id, email_verified, onboarding_completed, bbbee_level)
VALUES
  ('demo_grid_001', 'grid@openenergy.co.za',
   'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
   'Karabo Mthembu', 'Eskom System Operator',
   'grid_operator', 'active', 'approved', 'enterprise', 'default', 1, 1, 1);

-- ─── 0b. Ensure demo ipp_projects exist (also seed-only on prod) ─────────────
-- ip_001..ip_007 are created in 003_seed/005_ai_seed; mirror them here so the
-- migration replay (which skips seeds) has the FK targets that procurement
-- bids, ipp_financial_models, ipp_permits and project_milestones reference.
INSERT OR IGNORE INTO ipp_projects
  (id, project_name, developer_id, structure_type, technology, capacity_mw,
   location, grid_connection_point, status, construction_start_date,
   commercial_operation_date, ppa_volume_mwh, ppa_price_per_mwh,
   ppa_duration_years, renewable_energy_certificate_eligible)
VALUES
  ('ip_001', 'Klerksdorp 50MW Solar PV', 'demo_ipp_001', 'build_own_operate',
   'solar_pv', 50, 'Klerksdorp, North West', 'Klerksdorp Substation 132kV',
   'commercial_operations', '2021-01-15', '2022-06-01', 90000, 285, 20, 1);
INSERT OR IGNORE INTO ipp_projects
  (id, project_name, developer_id, structure_type, technology, capacity_mw,
   location, grid_connection_point, status, construction_start_date,
   commercial_operation_date, ppa_volume_mwh, ppa_price_per_mwh,
   ppa_duration_years, renewable_energy_certificate_eligible)
VALUES
  ('ip_002', 'Mookgopong 40MW Wind', 'demo_ipp_002', 'build_operate_transfer',
   'wind', 40, 'Mookgopong, Limpopo', 'Mookgopong 132kV',
   'commercial_operations', '2020-08-01', '2022-03-01', 85000, 320, 20, 1);
INSERT OR IGNORE INTO ipp_projects
  (id, project_name, developer_id, structure_type, technology, capacity_mw,
   location, grid_connection_point, status, construction_start_date,
   commercial_operation_date, ppa_volume_mwh, ppa_price_per_mwh,
   ppa_duration_years, renewable_energy_certificate_eligible)
VALUES
  ('ip_003', 'Brits 25MW Solar Rooftop', 'demo_ipp_001', 'private_wire',
   'solar_pv', 25, 'Brits, North West', 'Internal Distribution',
   'development', '2024-06-01', '2025-12-01', 45000, 380, 15, 1);
INSERT OR IGNORE INTO ipp_projects
  (id, project_name, developer_id, structure_type, technology, capacity_mw,
   location, grid_connection_point, status, construction_start_date,
   commercial_operation_date, ppa_volume_mwh, ppa_price_per_mwh,
   ppa_duration_years, renewable_energy_certificate_eligible)
VALUES
  ('ip_004', 'De Aar 75MW Solar PV', 'demo_ipp_002', 'build_own_operate',
   'solar_pv', 75, 'De Aar, Northern Cape', 'De Aar 132kV',
   'construction', '2025-12-01', '2027-01-01', 165000, 270, 20, 1);
INSERT OR IGNORE INTO ipp_projects
  (id, project_name, developer_id, structure_type, technology, capacity_mw,
   location, grid_connection_point, status, construction_start_date,
   commercial_operation_date, ppa_volume_mwh, ppa_price_per_mwh,
   ppa_duration_years, renewable_energy_certificate_eligible)
VALUES
  ('ip_005', 'Jeffreys Bay 120MW Wind', 'demo_ipp_002', 'build_operate_transfer',
   'wind', 120, 'Jeffreys Bay, Eastern Cape', 'Jeffreys Bay 400kV',
   'commercial_operations', '2019-05-01', '2021-08-01', 380000, 310, 20, 1);
INSERT OR IGNORE INTO ipp_projects
  (id, project_name, developer_id, structure_type, technology, capacity_mw,
   location, grid_connection_point, status, construction_start_date,
   commercial_operation_date, ppa_volume_mwh, ppa_price_per_mwh,
   ppa_duration_years, renewable_energy_certificate_eligible)
VALUES
  ('ip_006', 'Upington 200MW CSP', 'demo_ipp_001', 'build_own_operate',
   'csp', 200, 'Upington, Northern Cape', 'Upington 400kV',
   'development', NULL, NULL, 720000, 1320, 25, 1);
INSERT OR IGNORE INTO ipp_projects
  (id, project_name, developer_id, structure_type, technology, capacity_mw,
   location, grid_connection_point, status, construction_start_date,
   commercial_operation_date, ppa_volume_mwh, ppa_price_per_mwh,
   ppa_duration_years, renewable_energy_certificate_eligible)
VALUES
  ('ip_007', 'Gqeberha Port Wind Cluster', 'demo_ipp_002', 'build_own_operate',
   'wind', 95, 'Gqeberha, Eastern Cape', 'Gqeberha 132kV',
   'construction', '2024-01-15', '2025-09-01', 295000, 305, 20, 1);

-- ─── 0c. Ensure cov-vid-* covenants exist (originally seeded in 079) ─────────
-- covenant_tests FKs to covenants.id — replay 079's INSERTs here so the
-- migration replay test (which has the lender participant via 0a above) can
-- populate them deterministically.
INSERT OR IGNORE INTO covenants
  (id, project_id, lender_participant_id, covenant_code, covenant_name, covenant_type,
   operator, threshold, measurement_frequency, first_test_date, waivable, status)
SELECT 'cov-vid-01', NULL, id, 'DSCR_12M', 'Debt Service Coverage Ratio (12M)', 'financial',
       'gte', 1.20, 'quarterly', date('now','+30 days'), 1, 'active'
  FROM participants WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenants
  (id, project_id, lender_participant_id, covenant_code, covenant_name, covenant_type,
   operator, threshold, measurement_frequency, first_test_date, waivable, status)
SELECT 'cov-vid-02', NULL, id, 'LLCR', 'Loan Life Coverage Ratio', 'financial',
       'gte', 1.40, 'semi_annual', date('now','+60 days'), 1, 'active'
  FROM participants WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenants
  (id, project_id, lender_participant_id, covenant_code, covenant_name, covenant_type,
   operator, threshold, measurement_frequency, first_test_date, waivable, status)
SELECT 'cov-vid-03', NULL, id, 'AVAILABILITY_95', 'Plant availability >= 95%', 'operational',
       'gte', 0.95, 'monthly', date('now','+15 days'), 1, 'active'
  FROM participants WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenants
  (id, project_id, lender_participant_id, covenant_code, covenant_name, covenant_type,
   operator, threshold, measurement_frequency, first_test_date, waivable, status)
SELECT 'cov-vid-04', NULL, id, 'INSURANCE', 'All-risk insurance in force', 'insurance',
       'eq', 1, 'annual', date('now','+90 days'), 0, 'active'
  FROM participants WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenants
  (id, project_id, lender_participant_id, covenant_code, covenant_name, covenant_type,
   operator, threshold, measurement_frequency, first_test_date, waivable, status)
SELECT 'cov-vid-05', NULL, id, 'DEBT_RATIO', 'Debt / EBITDA <= 4.5x', 'financial',
       'lte', 4.5, 'quarterly', date('now','+30 days'), 1, 'active'
  FROM participants WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenants
  (id, project_id, lender_participant_id, covenant_code, covenant_name, covenant_type,
   operator, threshold, measurement_frequency, first_test_date, waivable, status)
SELECT 'cov-vid-06', NULL, id, 'REPORTING', 'Quarterly operating report', 'reporting',
       'eq', 1, 'quarterly', date('now','+30 days'), 1, 'active'
  FROM participants WHERE email='lender@openenergy.co.za';

-- ─── 0. Re-issue 081 inserts using the correct constraint vocabulary ─────────

-- margin_calls.status ∈ ('open','met','escalated','breached')
INSERT OR IGNORE INTO margin_calls
  (id, participant_id, as_of, exposure_zar, initial_margin_zar, variation_margin_zar,
   posted_collateral_zar, shortfall_zar, due_by, status, created_at)
SELECT 'mc-vid-01', id, datetime('now','-3 hours'),
       18400000, 1840000, 142000, 1750000, 232000,
       datetime('now','+22 hours'), 'open', datetime('now','-3 hours')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO margin_calls
  (id, participant_id, as_of, exposure_zar, initial_margin_zar, variation_margin_zar,
   posted_collateral_zar, shortfall_zar, due_by, status, created_at)
SELECT 'mc-vid-02', id, datetime('now','-8 hours'),
       12200000, 1220000, 88000, 1310000, 0,
       datetime('now','+16 hours'), 'met', datetime('now','-8 hours')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO margin_calls
  (id, participant_id, as_of, exposure_zar, initial_margin_zar, variation_margin_zar,
   posted_collateral_zar, shortfall_zar, due_by, status, resolved_at, created_at)
SELECT 'mc-vid-03', id, datetime('now','-2 days'),
       9800000, 980000, 41000, 1020000, 0,
       datetime('now','-1 day','-2 hours'), 'met',
       datetime('now','-1 day','-12 hours'), datetime('now','-2 days')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO margin_calls
  (id, participant_id, as_of, exposure_zar, initial_margin_zar, variation_margin_zar,
   posted_collateral_zar, shortfall_zar, due_by, status, created_at)
SELECT 'mc-vid-04', id, datetime('now','-30 minutes'),
       22600000, 2260000, 195000, 1900000, 555000,
       datetime('now','+12 hours'), 'escalated', datetime('now','-30 minutes')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO margin_calls
  (id, participant_id, as_of, exposure_zar, initial_margin_zar, variation_margin_zar,
   posted_collateral_zar, shortfall_zar, due_by, status, created_at)
SELECT 'mc-vid-05', id, datetime('now','-1 hour'),
       4100000, 410000, 22000, 380000, 52000,
       datetime('now','+18 hours'), 'breached', datetime('now','-1 hour')
  FROM participants WHERE email='wind@openenergy.co.za';

-- grid_curtailment_events.event_type ∈ ('issued','acknowledged','disputed','partial_lift','full_lift','escalated')
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-01', 'CURT-2026-0001', 'issued', p.id,
       datetime('now','-13 days'), 'Inland transmission zone 2 — voltage constraint',
       '{"affected_ipps":["Solar IPP 01 — Northern Cape","Hybrid IPP 02 — Western Cape"],"mw_curtailed":42,"duration_min":75,"compensation_zar":340000}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-02', 'CURT-2026-0002', 'issued', p.id,
       datetime('now','-10 days'), 'EC-Coastal — wind ramp-down for system stability',
       '{"affected_ipps":["Wind IPP 03 — Eastern Cape"],"mw_curtailed":28,"duration_min":42,"compensation_zar":195000}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-03', 'CURT-2026-0003', 'full_lift', p.id,
       datetime('now','-8 days'), 'NC-Upington — instruction withdrawn after substation switching',
       '{"affected_ipps":["Solar IPP 04 — Limpopo"],"mw_curtailed":15,"duration_min":18,"compensation_zar":62000}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-04', 'CURT-2026-0004', 'issued', p.id,
       datetime('now','-5 days'), 'WC-Inland transmission constraint after fault on Boundary line',
       '{"affected_ipps":["Hybrid IPP 02 — Western Cape"],"mw_curtailed":35,"duration_min":120,"compensation_zar":475000}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-04b', 'CURT-2026-0004', 'partial_lift', p.id,
       datetime('now','-4 days'), 'Boundary line returned to service; partial restoration',
       '{"affected_ipps":["Hybrid IPP 02 — Western Cape"],"mw_restored":20}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-04c', 'CURT-2026-0004', 'full_lift', p.id,
       datetime('now','-4 days','+3 hours'), 'Full clearance after switching complete',
       '{"affected_ipps":["Hybrid IPP 02 — Western Cape"],"mw_restored":35}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-05', 'CURT-2026-0005', 'issued', p.id,
       datetime('now','-2 days'), 'KZN-South — system-operator directed curtailment',
       '{"affected_ipps":["Solar IPP 01 — Northern Cape"],"mw_curtailed":22,"duration_min":35,"compensation_zar":108000}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-05b', 'CURT-2026-0005', 'acknowledged', p.id,
       datetime('now','-2 days','+5 minutes'), 'IPP01 dispatcher acknowledged ramp-down',
       '{"acknowledged_by":"Solar IPP 01 NOC"}'
  FROM participants p WHERE email='ipp@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-06', 'CURT-2026-0006', 'issued', p.id,
       datetime('now','-90 minutes'), 'Zone 2 inland — active curtailment in progress',
       '{"affected_ipps":["Solar IPP 01 — Northern Cape","Hybrid IPP 02 — Western Cape"],"mw_curtailed":18,"compensation_zar_accrued":85000}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-06b', 'CURT-2026-0006', 'disputed', p.id,
       datetime('now','-30 minutes'),
       'IPP01 disputes scope of curtailment — telemetry shows compliant within instruction',
       '{"dispute_ref":"DSP-2026-018","reason":"telemetry_mismatch"}'
  FROM participants p WHERE email='ipp@openenergy.co.za';

-- esg_reports.status ∈ ('draft','in_review','published','verified')
INSERT OR IGNORE INTO esg_reports
  (id, report_title, participant_id, reporting_year, reporting_period, status,
   total_ghg_emissions_tco2e, renewable_energy_percentage, water_usage_m3,
   waste_recycled_percentage, safety_incidents, training_hours, board_diversity_percentage,
   transparency_score, published_at, created_by, created_at, template_id, title,
   period_start, period_end, generated_at, r2_key, narrative)
SELECT 'esg-vid-gri', 'GRI Standards Report — 2025 Operational Year',
       p.id, 2025, 'FY2025', 'verified',
       428500, 87.2, 1142000, 78.5, 2, 12480, 44.0, 91,
       datetime('now','-22 days'), p.id, datetime('now','-30 days'),
       'gri', 'GRI Standards Report — Open Energy Platform 2025',
       '2025-01-01', '2025-12-31', datetime('now','-22 days'),
       'esg-reports/2026/gri-2025.pdf',
       'Full GRI 2021 Standards report. Scope 1+2+3 emissions verified by independent assurance.'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO esg_reports
  (id, report_title, participant_id, reporting_year, reporting_period, status,
   total_ghg_emissions_tco2e, renewable_energy_percentage, water_usage_m3,
   waste_recycled_percentage, safety_incidents, training_hours, board_diversity_percentage,
   transparency_score, published_at, created_by, created_at, template_id, title,
   period_start, period_end, generated_at, r2_key, narrative)
SELECT 'esg-vid-cdp', 'CDP Climate Change Questionnaire — 2025',
       p.id, 2025, 'FY2025', 'published',
       428500, 87.2, 1142000, 78.5, 2, 12480, 44.0, 88,
       datetime('now','-18 days'), p.id, datetime('now','-25 days'),
       'cdp', 'CDP Climate Change — Open Energy Platform 2025',
       '2025-01-01', '2025-12-31', datetime('now','-18 days'),
       'esg-reports/2026/cdp-2025.pdf',
       'CDP climate questionnaire submitted to the disclosure portal. CDP score: A-.'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO esg_reports
  (id, report_title, participant_id, reporting_year, reporting_period, status,
   total_ghg_emissions_tco2e, renewable_energy_percentage, water_usage_m3,
   waste_recycled_percentage, safety_incidents, training_hours, board_diversity_percentage,
   transparency_score, published_at, created_by, created_at, template_id, title,
   period_start, period_end, generated_at, r2_key, narrative)
SELECT 'esg-vid-tcfd', 'TCFD Disclosure — 2025',
       p.id, 2025, 'FY2025', 'published',
       428500, 87.2, 1142000, 78.5, 2, 12480, 44.0, 90,
       datetime('now','-15 days'), p.id, datetime('now','-22 days'),
       'tcfd', 'TCFD Disclosure — Open Energy Platform 2025',
       '2025-01-01', '2025-12-31', datetime('now','-15 days'),
       'esg-reports/2026/tcfd-2025.pdf',
       'TCFD-aligned climate-related financial disclosure covering governance, strategy, risk management, and metrics.'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO esg_reports
  (id, report_title, participant_id, reporting_year, reporting_period, status,
   total_ghg_emissions_tco2e, renewable_energy_percentage, water_usage_m3,
   waste_recycled_percentage, safety_incidents, training_hours, board_diversity_percentage,
   transparency_score, published_at, created_by, created_at, template_id, title,
   period_start, period_end, generated_at, r2_key, narrative)
SELECT 'esg-vid-jse', 'JSE-SRL Sustainability Disclosure — 2025',
       p.id, 2025, 'FY2025', 'published',
       428500, 87.2, 1142000, 78.5, 2, 12480, 44.0, 92,
       datetime('now','-10 days'), p.id, datetime('now','-15 days'),
       'jse_srl', 'JSE-SRL Sustainability Disclosure — Open Energy Platform 2025',
       '2025-01-01', '2025-12-31', datetime('now','-10 days'),
       'esg-reports/2026/jse-srl-2025.pdf',
       'Sustainability disclosure aligned to JSE Sustainability and Climate Disclosure Guidance (March 2024).'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO esg_reports
  (id, report_title, participant_id, reporting_year, reporting_period, status,
   total_ghg_emissions_tco2e, renewable_energy_percentage, water_usage_m3,
   waste_recycled_percentage, safety_incidents, training_hours, board_diversity_percentage,
   transparency_score, published_at, created_by, created_at, template_id, title,
   period_start, period_end, generated_at, r2_key, narrative)
SELECT 'esg-vid-issb', 'IFRS S2 Climate-Related Disclosures — 2025',
       p.id, 2025, 'FY2025', 'verified',
       428500, 87.2, 1142000, 78.5, 2, 12480, 44.0, 93,
       datetime('now','-3 days'), p.id, datetime('now','-7 days'),
       'issb', 'IFRS S2 Climate-Related Disclosures — Open Energy Platform 2025',
       '2025-01-01', '2025-12-31', datetime('now','-3 days'),
       'esg-reports/2026/issb-s2-2025.pdf',
       'ISSB IFRS S2 climate-related disclosures. Scope 1+2 emissions third-party assured to limited level.'
  FROM participants p WHERE email='admin@openenergy.co.za';

-- audit_chain.operation ∈ ('INSERT','UPDATE','DELETE','RESTATE','VOID')
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-01', p.id, 'default', 1001, 'trade_fills', 'fill-vid-01', 'INSERT',
       p.id, '{"matched_volume_mwh":40,"matched_price":1210}',
       '0000000000000000000000000000000000000000000000000000000000000000',
       'b3c1e7c4ad1d4e7e9a5e8c2b1d2e4f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4',
       datetime('now','-7 hours'), 'trading'
  FROM participants p WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-02', p.id, 'default', 1002, 'carbon_retirements', 'crit-vid-01', 'INSERT',
       p.id, '{"quantity":2400,"certificate":"OE-cf3a91bd"}',
       'b3c1e7c4ad1d4e7e9a5e8c2b1d2e4f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4',
       'c4d2f8d5be2e5f8f0b6f9d3c2e3f5b7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5',
       datetime('now','-30 days'), 'carbon'
  FROM participants p WHERE email='carbon@openenergy.co.za';
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-03', p.id, 'default', 1003, 'regulator_determinations', 'rdet-vid-01', 'INSERT',
       p.id, '{"reference":"NERSA-DET-2026-0017","gazette":"GG 48891"}',
       'c4d2f8d5be2e5f8f0b6f9d3c2e3f5b7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5',
       'd5e3f9e6cf3f6f9b1c7b0e4d3f4b6b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
       datetime('now','-25 days'), 'regulator'
  FROM participants p WHERE email='regulator@openenergy.co.za';
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-04', p.id, 'default', 1004, 'esg_reports', 'esg-vid-gri', 'INSERT',
       p.id, '{"template":"gri","year":2025}',
       'd5e3f9e6cf3f6f9b1c7b0e4d3f4b6b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
       'e6f4b0f7db4b7b0b2d8b1f5e4b5b7c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7',
       datetime('now','-22 days'), 'esg'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-05', p.id, 'default', 1005, 'grid_curtailment_events', 'gce-vid-04', 'INSERT',
       p.id, '{"curtailment":"CURT-2026-0004","mw":35}',
       'e6f4b0f7db4b7b0b2d8b1f5e4b5b7c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7',
       'f7b5b1b8eb5b8b1c3e9c2b6f5b6c8d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7b8',
       datetime('now','-5 days'), 'grid'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-06', p.id, 'default', 1006, 'ipp_drawdown_requests', 'dr_pending_001', 'INSERT',
       p.id, '{"amount":42000000,"facility":"FAC-2026-001"}',
       'f7b5b1b8eb5b8b1c3e9c2b6f5b6c8d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7b8',
       'b8b6c2b9fc6c9c2d4f0d3b7b6c7d9e1f2a3b4c5d6e7f8091a2b3c4d5e6f7b8c9',
       datetime('now','-1 hour'), 'ipp'
  FROM participants p WHERE email='ipp@openenergy.co.za';
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-07', p.id, 'default', 1007, 'covenant_tests', 'covt-vid-cov01-m12', 'UPDATE',
       p.id, '{"covenant":"DSCR_12M","result":"warn","measured":1.18}',
       'b8b6c2b9fc6c9c2d4f0d3b7b6c7d9e1f2a3b4c5d6e7f8091a2b3c4d5e6f7b8c9',
       'c9c7d3ca0d7d0d3e5b1e4c8c7d8e0f2a3b4c5d6e7f8091a2b3c4d5e6f7b8c9d0',
       datetime('now','-15 days'), 'lender'
  FROM participants p WHERE email='lender@openenergy.co.za';

-- ─── 1. Covenant tests — 12 months × 6 covenants = 72 rows ───────────────────
-- Mix of pass / warn / breach to produce a realistic curve for the lender
-- workstation. cov-vid-01 (DSCR_12M) shows a recent dip from 1.45 → 1.18 (breach).

-- DSCR_12M quarterly — 12 rows = 3 yrs of quarters
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov01-q01', 'cov-vid-01', '2023-Q3', date('now','-23 months'), 1.62, 'pass', 'DSCR comfortable; ahead of schedule', p.id, datetime('now','-23 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov01-q02', 'cov-vid-01', '2023-Q4', date('now','-20 months'), 1.58, 'pass', 'Stable performance', p.id, datetime('now','-20 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov01-q03', 'cov-vid-01', '2024-Q1', date('now','-17 months'), 1.55, 'pass', 'Q1 maintenance dip absorbed', p.id, datetime('now','-17 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov01-q04', 'cov-vid-01', '2024-Q2', date('now','-14 months'), 1.51, 'pass', 'Operating expenses on budget', p.id, datetime('now','-14 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov01-q05', 'cov-vid-01', '2024-Q3', date('now','-11 months'), 1.46, 'pass', 'Minor wind underperformance', p.id, datetime('now','-11 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov01-q06', 'cov-vid-01', '2024-Q4', date('now','-8 months'), 1.42, 'pass', 'Tariff escalation in line with CPI', p.id, datetime('now','-8 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov01-q07', 'cov-vid-01', '2025-Q1', date('now','-5 months'), 1.39, 'warn', 'Warning band; trending down on insurance claim', p.id, datetime('now','-5 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov01-q08', 'cov-vid-01', '2025-Q2', date('now','-2 months'), 1.31, 'warn', 'Sustained pressure from curtailment events', p.id, datetime('now','-2 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov01-q09', 'cov-vid-01', '2025-Q3', date('now','-15 days'), 1.18, 'breach', 'Breach of 1.20 floor — escalation to workout team', p.id, datetime('now','-15 days')
  FROM participants p WHERE email='lender@openenergy.co.za';

-- LLCR semi-annual — 4 rows = 2 yrs
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov02-h1', 'cov-vid-02', '2024-H1', date('now','-14 months'), 1.42, 'pass', 'Loan-life cover ratio comfortable', p.id, datetime('now','-14 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov02-h2', 'cov-vid-02', '2024-H2', date('now','-8 months'), 1.39, 'pass', 'Lender DD endorsed', p.id, datetime('now','-8 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov02-h3', 'cov-vid-02', '2025-H1', date('now','-2 months'), 1.34, 'pass', 'Within threshold but watch', p.id, datetime('now','-2 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov02-h4', 'cov-vid-02', '2025-H2', date('now','-7 days'), 1.27, 'warn', 'Approaching 1.25 floor; restructure under review', p.id, datetime('now','-7 days')
  FROM participants p WHERE email='lender@openenergy.co.za';

-- AVAILABILITY_95 monthly — 12 rows
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov03-m01', 'cov-vid-03', '2025-06', date('now','-11 months'), 97.4, 'pass', 'Strong monthly availability', p.id, datetime('now','-11 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov03-m02', 'cov-vid-03', '2025-07', date('now','-10 months'), 96.8, 'pass', 'No major outages', p.id, datetime('now','-10 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov03-m03', 'cov-vid-03', '2025-08', date('now','-9 months'), 95.7, 'pass', 'Routine maintenance', p.id, datetime('now','-9 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov03-m04', 'cov-vid-03', '2025-09', date('now','-8 months'), 94.2, 'breach', 'Inverter failure — 18 hrs downtime; insurance claim opened', p.id, datetime('now','-8 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov03-m05', 'cov-vid-03', '2025-10', date('now','-7 months'), 96.1, 'pass', 'Cured after replacement', p.id, datetime('now','-7 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov03-m06', 'cov-vid-03', '2025-11', date('now','-6 months'), 97.8, 'pass', 'Best month YTD', p.id, datetime('now','-6 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov03-m07', 'cov-vid-03', '2025-12', date('now','-5 months'), 96.5, 'pass', 'Stable', p.id, datetime('now','-5 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov03-m08', 'cov-vid-03', '2026-01', date('now','-4 months'), 95.9, 'pass', 'Summer maintenance', p.id, datetime('now','-4 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov03-m09', 'cov-vid-03', '2026-02', date('now','-3 months'), 94.8, 'breach', 'Curtailment week — instruction CURT-2026-0004', p.id, datetime('now','-3 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov03-m10', 'cov-vid-03', '2026-03', date('now','-2 months'), 96.2, 'pass', 'Restored', p.id, datetime('now','-2 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov03-m11', 'cov-vid-03', '2026-04', date('now','-1 months'), 95.4, 'pass', 'On target', p.id, datetime('now','-1 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov03-m12', 'cov-vid-03', '2026-05', date('now','-3 days'), 96.9, 'pass', 'Latest month — strong recovery', p.id, datetime('now','-3 days')
  FROM participants p WHERE email='lender@openenergy.co.za';

-- INSURANCE annual — 3 yrs
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value_text, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov04-y1', 'cov-vid-04', '2023', date('now','-22 months'),
       'Public liability ZAR 500M, business interruption ZAR 280M — all current', 'pass',
       'Annual renewal certificate verified', p.id, datetime('now','-22 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value_text, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov04-y2', 'cov-vid-04', '2024', date('now','-10 months'),
       'Public liability ZAR 500M, business interruption ZAR 280M — all current', 'pass',
       'Annual renewal certificate verified; broker letter on file', p.id, datetime('now','-10 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value_text, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov04-y3', 'cov-vid-04', '2025', date('now','-1 month'),
       'Public liability ZAR 600M (uplifted), business interruption ZAR 320M', 'pass',
       'Limits uplifted ahead of curtailment-risk uplift', p.id, datetime('now','-1 month')
  FROM participants p WHERE email='lender@openenergy.co.za';

-- DEBT_RATIO quarterly — 6 rows
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov05-q1', 'cov-vid-05', '2024-Q4', date('now','-8 months'), 68.5, 'pass', 'Below 70% gearing cap', p.id, datetime('now','-8 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov05-q2', 'cov-vid-05', '2025-Q1', date('now','-5 months'), 67.2, 'pass', 'Stable amortisation profile', p.id, datetime('now','-5 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov05-q3', 'cov-vid-05', '2025-Q2', date('now','-2 months'), 66.0, 'pass', 'Stable', p.id, datetime('now','-2 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov05-q4', 'cov-vid-05', '2025-Q3', date('now','-7 days'), 64.8, 'pass', 'Improving — equity contribution ahead of plan', p.id, datetime('now','-7 days')
  FROM participants p WHERE email='lender@openenergy.co.za';

-- REPORTING quarterly — 4 rows
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value_text, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov06-q1', 'cov-vid-06', '2025-Q1', date('now','-5 months'), 'Submitted 2025-04-10 (10 days late)', 'warn', 'Late but within grace; reminder issued', p.id, datetime('now','-5 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value_text, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov06-q2', 'cov-vid-06', '2025-Q2', date('now','-2 months'), 'Submitted on-time', 'pass', 'On time', p.id, datetime('now','-2 months')
  FROM participants p WHERE email='lender@openenergy.co.za';
INSERT OR IGNORE INTO covenant_tests (id, covenant_id, test_period, test_date, measured_value_text, result, narrative, tested_by, created_at)
SELECT 'covt-vid-cov06-q3', 'cov-vid-06', '2025-Q3', date('now','-1 days'), 'Submitted on-time with management commentary', 'pass', 'Improved process — automated portal upload', p.id, datetime('now','-1 days')
  FROM participants p WHERE email='lender@openenergy.co.za';

-- ─── 2. Lender watchlist (oe_lender_watchlist) ───────────────────────────────
INSERT OR IGNORE INTO oe_lender_watchlist
  (id, facility_id, participant_id, watchlist_tier, trigger_signal,
   trigger_value, action_plan, added_at, reviewed_at, next_review_at, added_by)
VALUES (
  'wl-vid-01', 'FAC-2026-001', 'demo_ipp_001',
  2, 'covenant_dscr_warn',
  1.18, 'Quarterly DSCR breach — restructuring discussions opened. Workout team engaged 2026-05-10. Standstill period 30 days.',
  datetime('now','-15 days'), datetime('now','-7 days'), datetime('now','+22 days'),
  'demo_lender_001'
);
INSERT OR IGNORE INTO oe_lender_watchlist
  (id, facility_id, participant_id, watchlist_tier, trigger_signal,
   trigger_value, action_plan, added_at, reviewed_at, next_review_at, added_by)
VALUES (
  'wl-vid-02', 'FAC-2026-002', 'demo_ipp_002',
  1, 'availability_below_95',
  94.8, 'Single-month availability dip linked to curtailment instruction CURT-2026-0004. No action required; monitor next two months.',
  datetime('now','-30 days'), datetime('now','-3 days'), datetime('now','+27 days'),
  'demo_lender_001'
);
INSERT OR IGNORE INTO oe_lender_watchlist
  (id, facility_id, participant_id, watchlist_tier, trigger_signal,
   trigger_value, action_plan, added_at, reviewed_at, next_review_at, added_by)
VALUES (
  'wl-vid-03', 'FAC-2026-001', 'demo_ipp_001',
  3, 'llcr_warn',
  1.27, 'LLCR within 0.02 of floor. Combined with DSCR breach, escalate to credit committee. Restructure pricing under review.',
  datetime('now','-7 days'), datetime('now','-2 days'), datetime('now','+5 days'),
  'demo_lender_001'
);
INSERT OR IGNORE INTO oe_lender_watchlist
  (id, facility_id, participant_id, watchlist_tier, trigger_signal,
   trigger_value, action_plan, added_at, reviewed_at, next_review_at, added_by)
VALUES (
  'wl-vid-04', 'FAC-2025-008', 'demo_ipp_002',
  1, 'reporting_late',
  10.0, 'Q1 2025 reporting submitted 10 days late. Reminder issued; subsequent quarters on-time.',
  datetime('now','-150 days'), datetime('now','-60 days'), datetime('now','+30 days'),
  'demo_lender_001'
);

-- ─── 3. Lender credit risk snapshots (lender_credit_risk) ────────────────────
INSERT OR IGNORE INTO lender_credit_risk
  (id, participant_id, tenant_id, loan_id, as_of_date,
   pd_1yr_pct, pd_lifetime_pct, lgd_pct, ead_zar, ccf_pct,
   risk_weight_pct, rwa_zar, expected_loss_zar, rating_internal, rating_external, watchlist, notes, created_at)
VALUES
  ('lcr-vid-01', 'demo_ipp_001', 'default', 'FAC-2026-001', date('now'),
   3.8, 14.5, 35.0, 480000000, 100, 100, 480000000, 6384000, 'BB-', 'BB-', 1,
   'Watchlist tier 3 — DSCR breach + LLCR warn. Restructuring under review.',
   datetime('now'));
INSERT OR IGNORE INTO lender_credit_risk
  (id, participant_id, tenant_id, loan_id, as_of_date,
   pd_1yr_pct, pd_lifetime_pct, lgd_pct, ead_zar, ccf_pct,
   risk_weight_pct, rwa_zar, expected_loss_zar, rating_internal, rating_external, watchlist, notes, created_at)
VALUES
  ('lcr-vid-02', 'demo_ipp_002', 'default', 'FAC-2026-002', date('now'),
   1.2, 6.8, 30.0, 320000000, 100, 75, 240000000, 1152000, 'BBB', 'BBB', 1,
   'Watchlist tier 1 — single-month availability dip. No structural concerns.',
   datetime('now'));

-- ─── 4. Procurement RFPs + bids (2 RFPs × 4 bids each = 8 bids) ──────────────
-- procurement_bids gained evaluation-matrix columns post-002. Re-issue
-- them via ALTER TABLE ADD COLUMN so the migration-replay test (which
-- starts from a clean schema) has the columns the INSERTs below need.
-- The test harness treats "duplicate column name" as benign.
ALTER TABLE procurement_bids ADD COLUMN technical_score REAL;
ALTER TABLE procurement_bids ADD COLUMN sustainability_score REAL;
ALTER TABLE procurement_bids ADD COLUMN delivery_score REAL;
ALTER TABLE procurement_bids ADD COLUMN overall_score REAL;

INSERT OR IGNORE INTO procurement_rfps
  (id, title, description, rfp_reference, created_by, closing_date, evaluation_date, budget, currency, status, created_at)
SELECT 'rfp-vid-01',
       'RFP-2026-014 — 150 MW Solar PV PPA for C&I anchor portfolio',
       'Request for Proposals — 15-year fixed-price PPA, ZAR-denominated, delivery from H2 2027. Minimum REIPPPP-equivalent grid code compliance and 35% black ownership.',
       'RFP-2026-014', p.id,
       date('now','+30 days'), date('now','+45 days'), 850000000, 'ZAR',
       'evaluation', datetime('now','-45 days')
  FROM participants p WHERE email='offtaker@openenergy.co.za';
INSERT OR IGNORE INTO procurement_rfps
  (id, title, description, rfp_reference, created_by, closing_date, evaluation_date, budget, currency, status, created_at)
SELECT 'rfp-vid-02',
       'RFP-2026-019 — 80 MW Wind hybrid + battery storage offtake',
       'Hybrid wind-storage tender. Required: 80 MW wind + minimum 40 MWh battery, 20-year PPA, ancillary services capability.',
       'RFP-2026-019', p.id,
       date('now','+18 days'), date('now','+35 days'), 1200000000, 'ZAR',
       'published', datetime('now','-25 days')
  FROM participants p WHERE email='offtaker@openenergy.co.za';

-- 4 bids on RFP-01
INSERT OR IGNORE INTO procurement_bids
  (id, rfp_id, participant_id, bid_amount, currency, score, rank, status, submitted_at, created_at,
   technical_score, sustainability_score, delivery_score, overall_score)
SELECT 'bid-vid-r01-01', 'rfp-vid-01', p.id, 820000000, 'ZAR',
       86.5, 1, 'shortlisted', datetime('now','-12 days'), datetime('now','-12 days'),
       88, 84, 87, 86.5
  FROM participants p WHERE email='ipp@openenergy.co.za';
INSERT OR IGNORE INTO procurement_bids
  (id, rfp_id, participant_id, bid_amount, currency, score, rank, status, submitted_at, created_at,
   technical_score, sustainability_score, delivery_score, overall_score)
SELECT 'bid-vid-r01-02', 'rfp-vid-01', p.id, 845000000, 'ZAR',
       83.2, 2, 'under_review', datetime('now','-11 days'), datetime('now','-11 days'),
       85, 82, 82, 83.2
  FROM participants p WHERE email='wind@openenergy.co.za';
INSERT OR IGNORE INTO procurement_bids
  (id, rfp_id, participant_id, bid_amount, currency, score, rank, status, submitted_at, created_at,
   technical_score, sustainability_score, delivery_score, overall_score)
VALUES
  ('bid-vid-r01-03', 'rfp-vid-01', 'demo_ipp_002', 832000000, 'ZAR',
   79.8, 3, 'under_review', datetime('now','-10 days'), datetime('now','-10 days'),
   78, 81, 80, 79.8);
INSERT OR IGNORE INTO procurement_bids
  (id, rfp_id, participant_id, bid_amount, currency, score, rank, status, submitted_at, created_at,
   technical_score, sustainability_score, delivery_score, overall_score)
VALUES
  ('bid-vid-r01-04', 'rfp-vid-01', 'demo_ipp_001', 868000000, 'ZAR',
   71.0, 4, 'rejected', datetime('now','-9 days'), datetime('now','-9 days'),
   72, 70, 71, 71.0);

-- 3 bids on RFP-02
INSERT OR IGNORE INTO procurement_bids
  (id, rfp_id, participant_id, bid_amount, currency, score, rank, status, submitted_at, created_at,
   technical_score, sustainability_score, delivery_score, overall_score)
SELECT 'bid-vid-r02-01', 'rfp-vid-02', p.id, 1180000000, 'ZAR',
       89.2, 1, 'shortlisted', datetime('now','-8 days'), datetime('now','-8 days'),
       91, 87, 89, 89.2
  FROM participants p WHERE email='wind@openenergy.co.za';
INSERT OR IGNORE INTO procurement_bids
  (id, rfp_id, participant_id, bid_amount, currency, score, rank, status, submitted_at, created_at,
   technical_score, sustainability_score, delivery_score, overall_score)
SELECT 'bid-vid-r02-02', 'rfp-vid-02', p.id, 1215000000, 'ZAR',
       82.7, 2, 'under_review', datetime('now','-6 days'), datetime('now','-6 days'),
       84, 81, 83, 82.7
  FROM participants p WHERE email='ipp@openenergy.co.za';
INSERT OR IGNORE INTO procurement_bids
  (id, rfp_id, participant_id, bid_amount, currency, score, rank, status, submitted_at, created_at,
   technical_score, sustainability_score, delivery_score, overall_score)
VALUES
  ('bid-vid-r02-03', 'rfp-vid-02', 'demo_ipp_002', 1240000000, 'ZAR',
   76.3, 3, 'under_review', datetime('now','-4 days'), datetime('now','-4 days'),
   76, 77, 76, 76.3);

-- ─── 5. LOI drafts — 4 entries across pipeline stages ────────────────────────
INSERT OR IGNORE INTO loi_drafts
  (id, from_participant_id, to_participant_id, project_id, mix_json, body_md,
   status, horizon_years, annual_mwh, blended_price, notes, sent_at, created_at)
SELECT 'loi-vid-01',
       (SELECT id FROM participants WHERE email='offtaker@openenergy.co.za'),
       (SELECT id FROM participants WHERE email='ipp@openenergy.co.za'),
       'ip_004',
       '{"solar":75,"wind":0,"hybrid":0,"storage":0}',
       '# Letter of Intent — Solar PPA 75 MW' || char(10) || char(10) ||
       '**To**: Solar IPP 04 — De Aar 75MW Solar PV  ' || char(10) ||
       '**From**: Anchor Offtaker — C&I Mining Group  ' || char(10) ||
       '**Term**: 15 years from COD  ' || char(10) ||
       '**Volume**: 220 GWh/year baseload-equivalent  ' || char(10) ||
       '**Price**: ZAR 1,165/MWh, CPI-escalated, capped at 6.0%  ' || char(10) || char(10) ||
       '## Conditions Precedent' || char(10) ||
       '1. NERSA generation licence granted' || char(10) ||
       '2. EIA record of decision' || char(10) ||
       '3. Lender consortium financial close',
       'sent', 15, 220000, 1165,
       'Subject to NERSA licence and EIA approval', datetime('now','-12 days'), datetime('now','-15 days');

INSERT OR IGNORE INTO loi_drafts
  (id, from_participant_id, to_participant_id, project_id, mix_json, body_md,
   status, horizon_years, annual_mwh, blended_price, notes, sent_at, created_at)
VALUES
  ('loi-vid-02', 'demo_offtaker_001', 'demo_ipp_002', 'ip_007',
   '{"wind":120,"solar":0,"hybrid":0,"storage":40}',
   '# Letter of Intent — Wind + Storage Hybrid' || char(10) || char(10) ||
   '**Project**: Gqeberha Port Wind Cluster (120 MW + 40 MWh BESS)  ' || char(10) ||
   '**Term**: 20 years from COD  ' || char(10) ||
   '**Volume**: 460 GWh/year, firm 50 MW shoulder-peak  ' || char(10) ||
   '**Price**: ZAR 1,290/MWh blended (ZAR 1,180 base + storage adder)  ' || char(10) || char(10) ||
   '## Notes' || char(10) ||
   '- Ancillary services rights reserved by offtaker' || char(10) ||
   '- BESS to be eligible for Workers AI dispatch optimisation',
   'sent', 20, 460000, 1290,
   'BESS dispatch rights subject to grid code revisions',
   datetime('now','-5 days'), datetime('now','-8 days'));

INSERT OR IGNORE INTO loi_drafts
  (id, from_participant_id, to_participant_id, project_id, mix_json, body_md,
   status, horizon_years, annual_mwh, blended_price, notes, created_at)
VALUES
  ('loi-vid-03', 'demo_offtaker_001', 'demo_ipp_001', 'ip_003',
   '{"solar":25,"wind":0,"hybrid":0,"storage":0}',
   '# Draft LOI — Rooftop Solar PPA' || char(10) || char(10) ||
   '**Project**: Brits 25MW Solar Rooftop (Pty) Ltd  ' || char(10) ||
   '**Term**: 10 years from COD  ' || char(10) ||
   '**Volume**: 48 GWh/year  ' || char(10) ||
   '**Price**: TBD (CPI-linked)',
   'drafted', 10, 48000, NULL,
   'Pricing TBD — pending feasibility model finalisation',
   datetime('now','-3 days'));

INSERT OR IGNORE INTO loi_drafts
  (id, from_participant_id, to_participant_id, project_id, mix_json, body_md,
   status, horizon_years, annual_mwh, blended_price, notes,
   sent_at, resolved_at, resolved_by, created_at)
VALUES
  ('loi-vid-04', 'demo_offtaker_001', 'demo_ipp_002', 'ip_005',
   '{"wind":120,"solar":0}',
   '# Signed LOI — Jeffreys Bay 120MW Wind' || char(10) || char(10) ||
   '**Project**: Jeffreys Bay 120MW Wind  ' || char(10) ||
   '**Term**: 20 years from COD  ' || char(10) ||
   '**Volume**: 380 GWh/year',
   'signed', 20, 380000, 1175,
   'LOI countersigned 2026-03-12. PPA drafting in flight.',
   datetime('now','-90 days'), datetime('now','-70 days'), 'demo_ipp_002',
   datetime('now','-92 days'));

-- ─── 6. IPP financial models — one per project (7 rows) ──────────────────────
INSERT OR IGNORE INTO ipp_financial_models
  (id, participant_id, tenant_id, project_id, model_version,
   capacity_mw, capex_zar, opex_zar_yr, ppa_tariff_zar_mwh, tariff_escalation_pct,
   operating_life_yrs, debt_ratio_pct, debt_tenor_yrs, interest_rate_pct, tax_rate_pct,
   lcoe_zar_per_mwh, project_irr_pct, equity_irr_pct, npv_zar, payback_years,
   min_dscr, avg_dscr, status, notes, created_at)
VALUES
  ('fm-vid-ip001', 'demo_ipp_001', 'default', 'ip_001', 'v3.2-approved',
   50, 480000000, 12500000, 1180, 5.2,
   25, 70, 18, 9.5, 27,
   742, 12.4, 16.8, 215000000, 8.2,
   1.18, 1.42, 'approved',
   'DSCR breach on Q3 2025 — restructuring scenarios v4 in draft. Original model v3.2.',
   datetime('now','-90 days')),
  ('fm-vid-ip002', 'demo_ipp_002', 'default', 'ip_002', 'v2.8-dd_certified',
   40, 720000000, 9800000, 1210, 5.0,
   25, 65, 18, 9.2, 27,
   810, 11.8, 15.2, 168000000, 9.1,
   1.32, 1.51, 'dd_certified',
   'Wind project — performance ratio 94.2%. Independent DD certificate by SES Africa.',
   datetime('now','-180 days')),
  ('fm-vid-ip003', 'demo_ipp_001', 'default', 'ip_003', 'v1.4-draft',
   25, 230000000, 5400000, 1145, 5.5,
   20, 70, 15, 10.2, 27,
   724, 13.1, 17.5, 88000000, 7.4,
   1.42, 1.58, 'draft',
   'Rooftop solar — distribution-level connection. Feasibility model v1.4 under review.',
   datetime('now','-45 days')),
  ('fm-vid-ip004', 'demo_ipp_002', 'default', 'ip_004', 'v2.1-reviewed',
   75, 680000000, 14200000, 1165, 5.0,
   25, 72, 18, 9.0, 27,
   698, 12.6, 16.4, 245000000, 8.0,
   1.26, 1.45, 'reviewed',
   'Construction phase. Drawdown #3 disbursed; project on schedule.',
   datetime('now','-120 days')),
  ('fm-vid-ip005', 'demo_ipp_002', 'default', 'ip_005', 'v3.0-approved',
   120, 1850000000, 38500000, 1175, 5.2,
   20, 68, 18, 9.4, 27,
   742, 11.9, 15.8, 482000000, 9.4,
   1.31, 1.48, 'approved',
   'Operating — DSCR stable. Performance ratio 96.1% over trailing 12 months.',
   datetime('now','-365 days')),
  ('fm-vid-ip006', 'demo_ipp_001', 'default', 'ip_006', 'v0.9-draft',
   200, 5800000000, 95000000, 1320, 4.8,
   25, 68, 20, 9.0, 27,
   985, 10.4, 14.1, 580000000, 11.2,
   1.22, 1.38, 'draft',
   'CSP feasibility — high CAPEX, longer payback. Awaiting REIPPPP Round 7 announcement.',
   datetime('now','-30 days')),
  ('fm-vid-ip007', 'demo_ipp_002', 'default', 'ip_007', 'v2.4-reviewed',
   120, 2100000000, 32000000, 1290, 5.0,
   20, 70, 18, 9.3, 27,
   832, 12.7, 16.9, 410000000, 8.6,
   1.28, 1.46, 'reviewed',
   'Wind + 40 MWh BESS hybrid. Construction commenced 2026-Q2; FC achieved.',
   datetime('now','-200 days'));

-- ─── 7. IPP permits — NERSA licences + EIAs across 7 projects (14 rows) ──────
-- NERSA licences
INSERT OR IGNORE INTO ipp_permits
  (id, participant_id, tenant_id, project_id, permit_type, application_no, authority,
   applied_at, expected_decision_at, decided_at, outcome, conditions, valid_from, valid_to,
   document_r2_key, notes, created_at)
VALUES
  ('pmt-vid-ip001-ner', 'demo_ipp_001', 'default', 'ip_001',
   'nersa_generation_licence', 'NERSA-GL-2023-0142', 'NERSA',
   date('now','-1100 days'), date('now','-900 days'), date('now','-850 days'),
   'granted_with_conditions',
   'Maintain Grid Code compliance per NERSA-GCR 2020 §8. Annual compliance report due 31 March.',
   date('now','-850 days'), date('now','+8000 days'),
   'permits/ip_001/nersa-gl.pdf',
   'Klerksdorp 50MW Solar PV — grid code compliant; renewal in 2046.',
   datetime('now','-850 days')),
  ('pmt-vid-ip002-ner', 'demo_ipp_002', 'default', 'ip_002',
   'nersa_generation_licence', 'NERSA-GL-2022-0089', 'NERSA',
   date('now','-1300 days'), date('now','-1150 days'), date('now','-1100 days'),
   'granted', NULL,
   date('now','-1100 days'), date('now','+7500 days'),
   'permits/ip_002/nersa-gl.pdf',
   'Mookgopong 40MW Wind — licence active.',
   datetime('now','-1100 days')),
  ('pmt-vid-ip003-ner', 'demo_ipp_001', 'default', 'ip_003',
   'nersa_distribution_licence', 'NERSA-DL-2026-0033', 'NERSA',
   date('now','-90 days'), date('now','+30 days'), NULL,
   'pending', NULL, NULL, NULL,
   'permits/ip_003/nersa-dl-application.pdf',
   'Rooftop solar — distribution licence application pending.',
   datetime('now','-90 days')),
  ('pmt-vid-ip004-ner', 'demo_ipp_002', 'default', 'ip_004',
   'nersa_generation_licence', 'NERSA-GL-2025-0118', 'NERSA',
   date('now','-300 days'), date('now','-150 days'), date('now','-120 days'),
   'granted_with_conditions',
   'Conditional on EIA record of decision (RoD) by 2026-12-31.',
   date('now','-120 days'), date('now','+9000 days'),
   'permits/ip_004/nersa-gl.pdf',
   'De Aar 75MW Solar PV — under construction.',
   datetime('now','-120 days')),
  ('pmt-vid-ip005-ner', 'demo_ipp_002', 'default', 'ip_005',
   'nersa_generation_licence', 'NERSA-GL-2021-0067', 'NERSA',
   date('now','-1500 days'), date('now','-1400 days'), date('now','-1350 days'),
   'granted', NULL,
   date('now','-1350 days'), date('now','+7800 days'),
   'permits/ip_005/nersa-gl.pdf',
   'Jeffreys Bay 120MW Wind — licence active.',
   datetime('now','-1350 days')),
  ('pmt-vid-ip006-ner', 'demo_ipp_001', 'default', 'ip_006',
   'nersa_generation_licence', NULL, 'NERSA',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   'CSP project — feasibility stage; NERSA licence application not yet lodged.',
   datetime('now','-30 days')),
  ('pmt-vid-ip007-ner', 'demo_ipp_002', 'default', 'ip_007',
   'nersa_generation_licence', 'NERSA-GL-2026-0007', 'NERSA',
   date('now','-200 days'), date('now','-80 days'), date('now','-60 days'),
   'granted_with_conditions',
   'BESS dispatch rights subject to ancillary services framework finalisation.',
   date('now','-60 days'), date('now','+7500 days'),
   'permits/ip_007/nersa-gl.pdf',
   'Gqeberha Port Wind Cluster — licence granted with hybrid conditions.',
   datetime('now','-60 days'));

-- EIAs
INSERT OR IGNORE INTO ipp_permits
  (id, participant_id, tenant_id, project_id, permit_type, application_no, authority,
   applied_at, expected_decision_at, decided_at, outcome, conditions, valid_from, valid_to,
   document_r2_key, notes, created_at)
VALUES
  ('pmt-vid-ip001-eia', 'demo_ipp_001', 'default', 'ip_001',
   'environmental_authorisation', 'DFFE-EA-2022-NC-0078', 'DFFE',
   date('now','-1200 days'), date('now','-1100 days'), date('now','-1050 days'),
   'granted_with_conditions',
   'Annual biodiversity monitoring report; avian impact mitigation per management plan.',
   date('now','-1050 days'), date('now','+8500 days'),
   'permits/ip_001/eia.pdf',
   'Northern Cape EIA — operating with conditions.',
   datetime('now','-1050 days')),
  ('pmt-vid-ip002-eia', 'demo_ipp_002', 'default', 'ip_002',
   'environmental_authorisation', 'DFFE-EA-2021-LP-0034', 'DFFE',
   date('now','-1400 days'), date('now','-1300 days'), date('now','-1250 days'),
   'granted', NULL,
   date('now','-1250 days'), date('now','+8000 days'),
   'permits/ip_002/eia.pdf',
   'Limpopo Wind — EIA active.',
   datetime('now','-1250 days')),
  ('pmt-vid-ip004-eia', 'demo_ipp_002', 'default', 'ip_004',
   'environmental_authorisation', 'DFFE-EA-2025-NC-0211', 'DFFE',
   date('now','-450 days'), date('now','-50 days'), NULL,
   'appealed',
   'Appealed by community SPV; DFFE decision pending appeal tribunal scheduled 2026-08-15.',
   NULL, NULL,
   'permits/ip_004/eia-appeal.pdf',
   'EIA appealed — tribunal scheduled. NERSA licence conditional on resolution.',
   datetime('now','-50 days')),
  ('pmt-vid-ip005-eia', 'demo_ipp_002', 'default', 'ip_005',
   'environmental_authorisation', 'DFFE-EA-2020-EC-0098', 'DFFE',
   date('now','-1600 days'), date('now','-1500 days'), date('now','-1450 days'),
   'granted_with_conditions',
   'Avian impact monitoring required quarterly; bat-mortality below threshold.',
   date('now','-1450 days'), date('now','+9000 days'),
   'permits/ip_005/eia.pdf',
   'Jeffreys Bay — operational; quarterly monitoring lodged.',
   datetime('now','-1450 days')),
  ('pmt-vid-ip007-eia', 'demo_ipp_002', 'default', 'ip_007',
   'environmental_authorisation', 'DFFE-EA-2025-EC-0156', 'DFFE',
   date('now','-300 days'), date('now','-100 days'), date('now','-80 days'),
   'granted_with_conditions',
   'Marine impact assessment for port-adjacent components; quarterly noise monitoring.',
   date('now','-80 days'), date('now','+8000 days'),
   'permits/ip_007/eia.pdf',
   'Gqeberha Port Wind Cluster — granted with marine conditions.',
   datetime('now','-80 days')),
  ('pmt-vid-ip003-eia', 'demo_ipp_001', 'default', 'ip_003',
   'environmental_authorisation', 'DFFE-EA-2026-NW-0017', 'DFFE',
   date('now','-180 days'), date('now','+60 days'), NULL,
   'pending', NULL, NULL, NULL,
   'permits/ip_003/eia-application.pdf',
   'Brits rooftop — basic assessment; decision expected Q3 2026.',
   datetime('now','-180 days')),
  ('pmt-vid-ip006-eia', 'demo_ipp_001', 'default', 'ip_006',
   'environmental_authorisation', NULL, 'DFFE',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   'CSP — scoping phase; EIA scoping report due Q4 2026.',
   datetime('now','-30 days'));

-- Water use licences for the 2 thermal/CSP-adjacent projects
INSERT OR IGNORE INTO ipp_permits
  (id, participant_id, tenant_id, project_id, permit_type, application_no, authority,
   applied_at, expected_decision_at, decided_at, outcome, valid_from, valid_to,
   document_r2_key, notes, created_at)
VALUES
  ('pmt-vid-ip006-wul', 'demo_ipp_001', 'default', 'ip_006',
   'water_use_licence', NULL, 'DWS',
   date('now','-20 days'), date('now','+180 days'), NULL,
   'pending', NULL, NULL,
   NULL,
   'WUL pre-application engagement underway with DWS Upington branch.',
   datetime('now','-20 days'));

-- ─── 8. Project milestones — full IPP lifecycle per project (35 rows) ────────
-- ip_004 (under construction) — milestones in flight
INSERT OR IGNORE INTO project_milestones (id, project_id, milestone_name, milestone_type, order_index, target_date, satisfied_date, status, notes, created_at)
VALUES
  ('pm-vid-ip004-01', 'ip_004', 'Financial close achieved', 'financial_close', 1, date('now','-150 days'), date('now','-145 days'), 'satisfied', 'Lender consortium close — Standard Bank lead. EIB participation tranche B.', datetime('now','-150 days')),
  ('pm-vid-ip004-02', 'ip_004', 'EPC contract signed', 'construction_start', 2, date('now','-120 days'), date('now','-118 days'), 'satisfied', 'EPC with Juwi Renewable Energy. NTP issued.', datetime('now','-120 days')),
  ('pm-vid-ip004-03', 'ip_004', 'Site mobilisation complete', 'construction_start', 3, date('now','-90 days'), date('now','-82 days'), 'satisfied', 'Site office, fencing, security in place.', datetime('now','-90 days')),
  ('pm-vid-ip004-04', 'ip_004', 'Civil works 50% complete', 'construction_start', 4, date('now','-30 days'), date('now','-25 days'), 'satisfied', 'Foundations on track.', datetime('now','-30 days')),
  ('pm-vid-ip004-05', 'ip_004', 'Module delivery complete', 'construction_start', 5, date('now','+60 days'), NULL, 'pending', 'Modules ex-Vietnam; vessel arrived Durban 2026-05-10.', datetime('now','-60 days')),
  ('pm-vid-ip004-06', 'ip_004', 'Mechanical completion', 'construction_complete', 6, date('now','+180 days'), NULL, 'pending', NULL, datetime('now','-30 days')),
  ('pm-vid-ip004-07', 'ip_004', 'Witnessed performance test', 'commissioning', 7, date('now','+240 days'), NULL, 'pending', 'Witness panel: NERSA + lender independent engineer.', datetime('now','-30 days')),
  ('pm-vid-ip004-08', 'ip_004', 'Commercial Operation Date (COD)', 'cod', 8, date('now','+270 days'), NULL, 'pending', 'Targeted Q1 2027.', datetime('now','-30 days'));

-- ip_007 (commissioning phase)
INSERT OR IGNORE INTO project_milestones (id, project_id, milestone_name, milestone_type, order_index, target_date, satisfied_date, status, notes, created_at)
VALUES
  ('pm-vid-ip007-01', 'ip_007', 'Financial close achieved', 'financial_close', 1, date('now','-220 days'), date('now','-218 days'), 'satisfied', 'FC closed.', datetime('now','-220 days')),
  ('pm-vid-ip007-02', 'ip_007', 'Construction start (NTP)', 'construction_start', 2, date('now','-200 days'), date('now','-198 days'), 'satisfied', NULL, datetime('now','-200 days')),
  ('pm-vid-ip007-03', 'ip_007', 'Turbines delivered to site', 'construction_start', 3, date('now','-90 days'), date('now','-85 days'), 'satisfied', 'Vestas V172 turbines.', datetime('now','-90 days')),
  ('pm-vid-ip007-04', 'ip_007', 'BESS commissioning', 'construction_complete', 4, date('now','-30 days'), date('now','-22 days'), 'satisfied', '40 MWh Tesla Megapack array commissioned and grid-tied.', datetime('now','-30 days')),
  ('pm-vid-ip007-05', 'ip_007', 'Mechanical completion', 'construction_complete', 5, date('now','-10 days'), date('now','-5 days'), 'satisfied', 'All 8 turbines installed.', datetime('now','-10 days')),
  ('pm-vid-ip007-06', 'ip_007', 'Witnessed performance test', 'commissioning', 6, date('now','+15 days'), NULL, 'pending', 'NERSA witness scheduled 2026-06-10.', datetime('now','-10 days')),
  ('pm-vid-ip007-07', 'ip_007', 'Commercial Operation Date (COD)', 'cod', 7, date('now','+45 days'), NULL, 'pending', 'Targeted 2026-07-10.', datetime('now','-10 days'));

-- ip_003 (development phase)
INSERT OR IGNORE INTO project_milestones (id, project_id, milestone_name, milestone_type, order_index, target_date, satisfied_date, status, notes, created_at)
VALUES
  ('pm-vid-ip003-01', 'ip_003', 'Site option signed', 'financial_close', 1, date('now','-200 days'), date('now','-195 days'), 'satisfied', NULL, datetime('now','-200 days')),
  ('pm-vid-ip003-02', 'ip_003', 'Grid impact study lodged', 'financial_close', 2, date('now','-150 days'), date('now','-148 days'), 'satisfied', 'Eskom Transmission has scheduled the study.', datetime('now','-150 days')),
  ('pm-vid-ip003-03', 'ip_003', 'EIA basic assessment lodged', 'financial_close', 3, date('now','-180 days'), date('now','-178 days'), 'satisfied', NULL, datetime('now','-180 days')),
  ('pm-vid-ip003-04', 'ip_003', 'EIA record of decision', 'financial_close', 4, date('now','+60 days'), NULL, 'pending', 'Decision expected Q3 2026.', datetime('now','-30 days')),
  ('pm-vid-ip003-05', 'ip_003', 'NERSA distribution licence', 'financial_close', 5, date('now','+30 days'), NULL, 'pending', 'Application lodged 90 days ago.', datetime('now','-30 days')),
  ('pm-vid-ip003-06', 'ip_003', 'Financial close', 'financial_close', 6, date('now','+150 days'), NULL, 'pending', NULL, datetime('now','-30 days'));

-- ip_006 (feasibility / development)
INSERT OR IGNORE INTO project_milestones (id, project_id, milestone_name, milestone_type, order_index, target_date, satisfied_date, status, notes, created_at)
VALUES
  ('pm-vid-ip006-01', 'ip_006', 'Site identified and secured', 'financial_close', 1, date('now','-90 days'), date('now','-85 days'), 'satisfied', 'Upington site optioned via municipal lease.', datetime('now','-90 days')),
  ('pm-vid-ip006-02', 'ip_006', 'Pre-feasibility study', 'financial_close', 2, date('now','-60 days'), date('now','-55 days'), 'satisfied', NULL, datetime('now','-60 days')),
  ('pm-vid-ip006-03', 'ip_006', 'EIA scoping report', 'financial_close', 3, date('now','+120 days'), NULL, 'pending', 'Q4 2026 target.', datetime('now','-30 days')),
  ('pm-vid-ip006-04', 'ip_006', 'NERSA licence application', 'financial_close', 4, date('now','+180 days'), NULL, 'pending', NULL, datetime('now','-30 days'));

-- ip_001, ip_002, ip_005 (operations) — show satisfied milestones from history
INSERT OR IGNORE INTO project_milestones (id, project_id, milestone_name, milestone_type, order_index, target_date, satisfied_date, status, notes, created_at)
VALUES
  ('pm-vid-ip001-cod', 'ip_001', 'Commercial Operation Date', 'cod', 1, date('now','-700 days'), date('now','-700 days'), 'satisfied', 'Operating; trailing 12-month PR 96.4%.', datetime('now','-700 days')),
  ('pm-vid-ip001-op', 'ip_001', '5-year operations review', 'operational', 2, date('now','+1100 days'), NULL, 'pending', NULL, datetime('now','-700 days')),
  ('pm-vid-ip002-cod', 'ip_002', 'Commercial Operation Date', 'cod', 1, date('now','-1000 days'), date('now','-1000 days'), 'satisfied', 'Operating.', datetime('now','-1000 days')),
  ('pm-vid-ip002-op', 'ip_002', '5-year operations review', 'operational', 2, date('now','+800 days'), NULL, 'pending', NULL, datetime('now','-1000 days')),
  ('pm-vid-ip005-cod', 'ip_005', 'Commercial Operation Date', 'cod', 1, date('now','-1200 days'), date('now','-1200 days'), 'satisfied', 'Operating; 380 GWh/year output.', datetime('now','-1200 days')),
  ('pm-vid-ip005-op', 'ip_005', '5-year operations review', 'operational', 2, date('now','+600 days'), NULL, 'pending', 'Asset management review next quarter.', datetime('now','-1200 days'));
