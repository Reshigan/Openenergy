-- Wave 140: IPP Subcontractor Management — seed data
-- 12 rows covering all 12 chain states

INSERT OR IGNORE INTO oe_ipp_subcontractors (
  id, project_id, project_name, company_name, chain_status, trade_category, subcontractor_tier,
  scope_description, contract_ref, contract_value_zar, bee_level, local_content_pct, sa_employee_count,
  cidb_grade, registration_number, insurance_expiry_date,
  performance_score, hse_incident_count, ncr_count,
  site_representative, site_representative_phone, safety_officer, safety_officer_phone,
  floor_ohsa_notification, floor_lender_escrow_release, floor_reipppp_ed_reporting,
  floor_bee_verification, floor_ie_oversight,
  sla_target_hours, sla_deadline_at, sla_breached, sla_breach_count,
  is_reportable, scheduled_start_date, scheduled_end_date,
  registered_at, created_by, created_at, updated_at
) VALUES
-- sub-001: registered, electrical_hv, critical_trade, IE oversight
(
  'sub-001', 'kakamas-500mw', 'Kakamas 500MW Solar PV', 'PowerTech Electrical SA',
  'registered', 'electrical_hv', 'critical_trade',
  'Supply, installation and commissioning of 33kV switchgear and MV cable network across the solar field',
  'CT-KK500-2026-001', 28500000, 3, 62.5, 38,
  '7EP', '2001/034512/07', '2027-06-30',
  NULL, 0, 0,
  'Johan van Wyk', '+27 82 456 7890', 'Sipho Dlamini', '+27 83 567 8901',
  0, 0, 0, 0, 1,
  24, datetime('now', '+24 hours'), 0, 0,
  0, '2026-07-01', '2026-11-30',
  datetime('now'), 'admin@openenergy.co.za', datetime('now'), datetime('now')
),
-- sub-002: pre_qualification, structural, 7CE CIDB grade
(
  'sub-002', 'kakamas-500mw', 'Kakamas 500MW Solar PV', 'AfriStruct Civil & Structural',
  'pre_qualification', 'structural', 'critical_trade',
  'Structural steel erection for tracker mounting structures and inverter buildings',
  'CT-KK500-2026-002', 45000000, 4, 71.0, 65,
  '7CE', '2008/045123/07', '2027-03-31',
  NULL, 0, 0,
  'Thabo Mokoena', '+27 84 678 9012', 'Priya Naidoo', '+27 85 789 0123',
  0, 0, 1, 1, 1,
  24, datetime('now', '+24 hours'), 0, 0,
  0, '2026-08-01', '2027-02-28',
  datetime('now', '-1 days'), datetime('now'), datetime('now', '-1 days'), datetime('now')
),
-- sub-003: inducted, BEE level 2, 45 SA employees
(
  'sub-003', 'kakamas-500mw', 'Kakamas 500MW Solar PV', 'Khanya Civil Construction',
  'inducted', 'civil', 'general_trade',
  'Civil groundworks including trenching, cable ducting, road construction and security fencing',
  'CT-KK500-2026-003', 18750000, 2, 85.0, 45,
  '6CE', '2015/023456/07', '2026-12-31',
  NULL, 0, 0,
  'Lungelo Zulu', '+27 71 890 1234', 'Maria Santos', '+27 72 901 2345',
  0, 0, 1, 0, 0,
  96, datetime('now', '+96 hours'), 0, 0,
  0, '2026-06-15', '2026-10-31',
  datetime('now', '-2 days'), datetime('now'), datetime('now', '-2 days'), datetime('now')
),
-- sub-004: mobilized, civil, R12.5M contract
(
  'sub-004', 'kakamas-500mw', 'Kakamas 500MW Solar PV', 'Sandveld Groundworks CC',
  'mobilized', 'civil', 'general_trade',
  'Earthworks, levelling and stormwater management for solar array areas A-D',
  'CT-KK500-2026-004', 12500000, 5, 78.0, 28,
  '5CE', '2010/056789/23', '2026-11-30',
  NULL, 0, 0,
  'Charl Burger', '+27 82 012 3456', 'Nomsa Khumalo', '+27 83 123 4567',
  0, 0, 0, 0, 0,
  96, datetime('now', '+48 hours'), 0, 0,
  0, '2026-06-01', '2026-09-30',
  datetime('now', '-3 days'), datetime('now'), datetime('now', '-3 days'), datetime('now')
),
-- sub-005: performing, performance_score=87.5, zero incidents
(
  'sub-005', 'kakamas-500mw', 'Kakamas 500MW Solar PV', 'SolarTech Mechanical (Pty) Ltd',
  'performing', 'mechanical', 'specialist',
  'Supply and installation of tracker drive units, pyranometers and meteorological masts',
  'CT-KK500-2026-005', 9800000, 3, 65.0, 22,
  '5SB', '2012/067890/07', '2027-01-31',
  87.5, 0, 0,
  'Leon Visser', '+27 84 234 5678', 'Fatima Osman', '+27 85 345 6789',
  0, 0, 0, 0, 0,
  48, datetime('now', '+36 hours'), 0, 0,
  0, '2026-05-15', '2026-10-15',
  datetime('now', '-14 days'), datetime('now'), datetime('now', '-14 days'), datetime('now')
),
-- sub-006: under_review, performance_score=61.0, 2 NCRs
(
  'sub-006', 'kakamas-500mw', 'Kakamas 500MW Solar PV', 'Quick Cable Solutions CC',
  'under_review', 'electrical_lv', 'specialist',
  'DC cabling installation and string testing for solar arrays E-F',
  'CT-KK500-2026-006', 7200000, 6, 55.0, 18,
  '4EP', '2018/078901/23', '2026-09-30',
  61.0, 1, 2,
  'Andre Potgieter', '+27 71 456 7890', 'Grace Moyo', '+27 72 567 8901',
  0, 0, 0, 0, 0,
  48, datetime('now', '+12 hours'), 0, 0,
  0, '2026-05-01', '2026-09-01',
  datetime('now', '-30 days'), datetime('now'), datetime('now', '-30 days'), datetime('now')
),
-- sub-007: good_standing, performance_score=92.0, REIPPPP ED reporting, BEE level 1
(
  'sub-007', 'kakamas-500mw', 'Kakamas 500MW Solar PV', 'Ubuntu Instruments & Controls',
  'good_standing', 'instrumentation', 'specialist',
  'SCADA integration, field instrumentation and control panel assembly for inverter stations',
  'CT-KK500-2026-007', 14300000, 1, 78.5, 35,
  '5ME', '2009/089012/07', '2027-05-31',
  92.0, 0, 0,
  'Ayasha Singh', '+27 82 678 9012', 'Bongani Cele', '+27 83 789 0123',
  0, 0, 1, 0, 0,
  48, datetime('now', '+40 hours'), 0, 0,
  0, '2026-04-01', '2026-11-30',
  datetime('now', '-45 days'), datetime('now'), datetime('now', '-45 days'), datetime('now')
),
-- sub-008: work_complete, commissioning_specialist
(
  'sub-008', 'kakamas-500mw', 'Kakamas 500MW Solar PV', 'Grid Connect Commissioning SA',
  'work_complete', 'commissioning_specialist', 'specialist',
  'Pre-commissioning and commissioning of 132kV substation and transformer bays 1-4',
  'CT-KK500-2026-008', 6500000, 4, 60.0, 12,
  '5EP', '2014/090123/07', '2027-02-28',
  88.5, 0, 0,
  'Pieter de Villiers', '+27 84 890 1234', 'Thandeka Mthembu', '+27 85 901 2345',
  0, 1, 0, 0, 1,
  48, datetime('now', '+120 hours'), 0, 0,
  0, '2026-01-15', '2026-05-28',
  datetime('now', '-90 days'), datetime('now'), datetime('now', '-90 days'), datetime('now')
),
-- sub-009: demobilized, actual_end_date=2026-05-15
(
  'sub-009', 'kakamas-500mw', 'Kakamas 500MW Solar PV', 'Highveld Scaffolding & Access',
  'demobilized', 'scaffolding', 'general_trade',
  'Erection, maintenance and dismantling of scaffolding for inverter building construction',
  'CT-KK500-2026-009', 2800000, 5, 70.0, 15,
  '4SB', '2016/101234/23', '2026-10-31',
  83.0, 0, 1,
  'Stefan Greyling', '+27 71 012 3456', 'Nompumelelo Dube', '+27 72 123 4567',
  0, 0, 0, 0, 0,
  168, datetime('now', '+500 hours'), 0, 0,
  0, '2025-11-01', '2026-05-15',
  datetime('now', '-120 days'), datetime('now'), datetime('now', '-120 days'), datetime('now')
),
-- sub-010: closed, lender escrow release required
(
  'sub-010', 'kakamas-500mw', 'Kakamas 500MW Solar PV', 'NorthCape Labour Contractors',
  'closed', 'labor_supply', 'labor_only',
  'General labour supply for site clearing, vegetation removal and preliminary groundworks',
  'CT-KK500-2026-010', 3200000, 3, 92.0, 55,
  '2GB', '2019/112345/23', '2026-12-31',
  79.0, 0, 0,
  'Fikile Sithole', '+27 82 234 5678', 'Jan Joubert', '+27 83 345 6789',
  0, 1, 0, 0, 0,
  168, datetime('now', '+1000 hours'), 0, 0,
  0, '2025-09-01', '2026-02-28',
  datetime('now', '-180 days'), datetime('now'), datetime('now', '-180 days'), datetime('now')
),
-- sub-011: suspended, OHSA safety incident under investigation, is_reportable=1
(
  'sub-011', 'kakamas-500mw', 'Kakamas 500MW Solar PV', 'Rapid Build Contractors CC',
  'suspended', 'general', 'general_trade',
  'General construction activities including concrete pouring and formwork for cable marshalling kiosk',
  'CT-KK500-2026-011', 4100000, 7, 48.0, 20,
  '4GB', '2017/123456/23', '2026-08-31',
  55.0, 2, 1,
  'Mike du Plessis', '+27 84 456 7890', 'Zanele Mokoena', '+27 85 567 8901',
  1, 0, 0, 0, 0,
  96, datetime('now', '-6 hours'), 1, 1,
  1, '2026-04-01', '2026-08-01',
  datetime('now', '-60 days'), datetime('now'), datetime('now', '-60 days'), datetime('now')
),
-- sub-012: terminated, safety_violation — SIGNATURE row (OHSA mandatory notification, is_reportable=1)
(
  'sub-012', 'kakamas-500mw', 'Kakamas 500MW Solar PV', 'Dangerous Heights Access CC',
  'terminated', 'scaffolding', 'general_trade',
  'Scaffolding erection and working-at-height access for inverter building upper level',
  'CT-KK500-2026-012', 1900000, 8, 35.0, 8,
  '3SB', '2020/134567/23', '2026-07-31',
  31.0, 3, 4,
  'Rodney Jacobs', '+27 71 678 9012', NULL, NULL,
  1, 0, 0, 0, 0,
  96, datetime('now', '-72 hours'), 1, 2,
  1, '2026-03-15', '2026-07-01',
  datetime('now', '-90 days'), datetime('now'), datetime('now', '-90 days'), datetime('now')
);
