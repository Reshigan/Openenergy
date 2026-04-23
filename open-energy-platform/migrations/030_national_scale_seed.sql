-- 030_national_scale_seed.sql
-- Seed data for the national-scale domains added in migrations 019-029 so
-- the role workbenches show meaningful content on first load. All inserts
-- use INSERT OR IGNORE — re-running is safe, and existing rows are never
-- overwritten.
--
-- Participants referenced here are the standard demo accounts seeded in
-- migration 003_seed.sql (admin@, trader@, ipp@, carbon@, offtaker@,
-- grid@ openenergy.co.za, etc.).

-- ═══ REGULATOR SUITE ═══════════════════════════════════════════════════════

-- A representative licence for each of the three generator demo tenants.
INSERT OR IGNORE INTO regulator_licences
  (id, licence_number, licensee_participant_id, licensee_name, licence_type,
   technology, capacity_mw, location, issue_date, effective_date, expiry_date, status, notes)
VALUES
  ('lic_gen_001',  'GEN-2025-SOL-001', 'demo_ipp_001',    'Demo IPP Solar 1 (Pty) Ltd',     'generation',   'solar_pv', 75,  'De Aar, NC',        '2025-04-01', '2025-05-01', '2045-05-01', 'active', 'Licence issued under ERA 2006 s.8.'),
  ('lic_gen_002',  'GEN-2025-WIN-001', 'demo_ipp_001',    'Demo IPP Wind 1 (Pty) Ltd',      'generation',   'wind',     140, 'Jeffreys Bay, EC',  '2024-09-01', '2024-10-01', '2044-10-01', 'active', 'Licence issued under ERA 2006 s.8.'),
  ('lic_trd_001',  'TRD-2026-001',     'demo_trader_001', 'Demo Trader 1 (Pty) Ltd',        'trading',      'n/a',      0,   'Sandton, GP',       '2026-01-15', '2026-02-01', '2031-02-01', 'active', 'Trading licence per NERSA.'),
  ('lic_dist_001', 'DST-2024-001',     'demo_grid_001',   'Demo Metro Distribution',         'distribution', 'n/a',      0,   'Cape Town, WC',     '2024-03-01', '2024-04-01', '2044-04-01', 'active', 'Distribution licence, CCT service area.');

INSERT OR IGNORE INTO regulator_licence_events (id, licence_id, event_type, event_date, details, actor_id) VALUES
  ('lev_001', 'lic_gen_001', 'granted', '2025-04-01', 'Initial grant',             'demo_admin_001'),
  ('lev_002', 'lic_gen_002', 'granted', '2024-09-01', 'Initial grant',             'demo_admin_001'),
  ('lev_003', 'lic_trd_001', 'granted', '2026-01-15', 'Initial trading licence',   'demo_admin_001'),
  ('lev_004', 'lic_dist_001','granted', '2024-03-01', 'Distribution licence grant','demo_admin_001');

INSERT OR IGNORE INTO regulator_licence_conditions
  (id, licence_id, condition_number, condition_text, category, compliance_status)
VALUES
  ('lcd_001', 'lic_gen_001', '4.1', 'Submit quarterly generation reports to NERSA within 30 days of quarter end.',       'reporting',  'compliant'),
  ('lcd_002', 'lic_gen_001', '4.2', 'Maintain P90 availability above 92% on a rolling 12-month basis.',                 'technical',  'compliant'),
  ('lcd_003', 'lic_gen_002', '4.1', 'Submit quarterly generation reports to NERSA within 30 days of quarter end.',       'reporting',  'compliant'),
  ('lcd_004', 'lic_gen_002', '5.1', 'No amendment to the generation licence without prior NERSA approval.',              'legal',      'compliant'),
  ('lcd_005', 'lic_trd_001', '3.1', 'All trades to be priced at arm''s length and documented.',                          'reporting',  'compliant');

-- One tariff submission in each lifecycle state.
INSERT OR IGNORE INTO regulator_tariff_submissions
  (id, reference_number, licensee_participant_id, licence_id, submission_title,
   tariff_period_start, tariff_period_end, requested_revenue_zar, requested_tariff_c_per_kwh,
   methodology, status, public_hearing_date)
VALUES
  ('tsub_mypd_001', 'MYPD5-2026-001', 'demo_grid_001', 'lic_dist_001', 'Distribution tariff application 2026/27', '2026-07-01', '2027-06-30', 18500000000, 185.50, 'MYPD5', 'public_hearing', '2026-05-15T09:00:00Z'),
  ('tsub_mypd_002', 'MYPD5-2026-002', 'demo_grid_001', 'lic_dist_001', 'Distribution tariff application 2025/26', '2025-07-01', '2026-06-30', 17200000000, 172.40, 'MYPD5', 'determined',    '2025-05-20T09:00:00Z'),
  ('tsub_whl_001',  'WHL-2026-001',   'demo_ipp_001',  NULL,            'Solar project wheeling tariff',             '2026-04-01', '2026-12-31', 45000000,    120.00, 'wheeling', 'submitted',      NULL);

INSERT OR IGNORE INTO regulator_tariff_decisions
  (id, submission_id, decision_number, decision_date, approved_revenue_zar,
   approved_tariff_c_per_kwh, variance_percentage, reasons, effective_from, effective_to,
   published_in_gazette, gazette_reference)
VALUES
  ('tdec_001', 'tsub_mypd_002', 'NERSA-2025-D-018', '2025-06-28', 16800000000, 168.40, -2.32,
   'Approved subject to efficiency gains. Cost allowance for primary energy reduced by 2.3% vs request.',
   '2025-07-01', '2026-06-30', 1, 'GG 49123 of 2025-06-30');

INSERT OR IGNORE INTO regulator_determinations
  (id, reference_number, title, category, statutory_basis, summary, body_md,
   publication_date, gazette_reference, published_by)
VALUES
  ('det_001', 'NERSA-2025-D-018',  'Eskom MYPD5 determination 2025/26',      'tariff',    'ERA 2006 s.16',  'Approved revenue R16.8bn, average tariff 168.4 c/kWh.', '# NERSA determination\n\nIssued under ERA 2006 s.16. See gazette for full text.', '2025-06-30', 'GG 49123 of 2025-06-30',  'demo_admin_001'),
  ('det_002', 'NERSA-2025-R-004',  'Revised Market Conduct Rules',           'rule',      'ERA 2006 s.4(a)(ii)', 'Updated conduct rules for trading licensees.', '# Market conduct rules (2025 revision)', '2025-09-15', 'GG 49540 of 2025-09-15',  'demo_admin_001'),
  ('det_003', 'NERSA-2026-M-001',  'REIPPPP methodology update',             'methodology','ERA 2006 s.4',   'Clarifies cost-pass-through for battery storage.',     '# REIPPPP methodology update 2026', '2026-03-01', 'GG 50211 of 2026-03-01',  'demo_admin_001');

-- One active enforcement case + one closed.
INSERT OR IGNORE INTO regulator_enforcement_cases
  (id, case_number, respondent_participant_id, respondent_name, related_licence_id,
   alleged_contravention, statutory_provision, severity, status, opened_at,
   lead_investigator_id, finding, finding_date, penalty_amount_zar, created_by)
VALUES
  ('enf_001', 'CASE-2026-001', 'demo_ipp_001',    'Demo IPP Solar 1 (Pty) Ltd', 'lic_gen_001',
   'Late submission of Q3-2025 generation report.', 'ERA 2006 s.24(1)', 'medium', 'investigating',
   '2026-01-10', 'demo_admin_001', NULL, NULL, NULL, 'demo_admin_001'),
  ('enf_002', 'CASE-2025-007', 'demo_trader_001', 'Demo Trader 1 (Pty) Ltd',    'lic_trd_001',
   'Failure to maintain arm''s-length trade records.', 'ERA 2006 s.24(1), NERSA Rules on Penalties', 'high', 'closed',
   '2025-08-02', 'demo_admin_001',
   'Respondent accepted records were incomplete for 2 trades. Remedial plan accepted.',
   '2025-11-14', 250000, 'demo_admin_001');

INSERT OR IGNORE INTO regulator_enforcement_events (id, case_id, event_type, event_date, description, actor_id) VALUES
  ('eev_001', 'enf_001', 'complaint',        '2026-01-10T08:00:00Z', 'Complaint received from DMRE compliance desk.',          'demo_admin_001'),
  ('eev_002', 'enf_001', 'hearing_notice',   '2026-02-15T09:00:00Z', 'Hearing scheduled for 15 March 2026.',                   'demo_admin_001'),
  ('eev_003', 'enf_002', 'complaint',        '2025-08-02T09:00:00Z', 'Routine inspection finding.',                            'demo_admin_001'),
  ('eev_004', 'enf_002', 'decision',         '2025-11-14T15:00:00Z', 'Penalty of R250,000 imposed, remedial plan to follow.',  'demo_admin_001');

-- Two open surveillance alerts, one critical, one medium.
INSERT OR IGNORE INTO regulator_surveillance_alerts
  (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, details_json, status, raised_at)
VALUES
  ('rsa_seed_001', 'rsr_conc_1',  'CONCENTRATION_01', 'demo_trader_001', 'participants',  'demo_trader_001',
   'medium', '{"share_pct":42.3,"participant_volume":2200,"total_volume":5200,"window_days":30,"threshold_pct":40}', 'open', '2026-04-22T07:30:00Z'),
  ('rsa_seed_002', 'rsr_price_1', 'PRICE_MAN_01',     'demo_trader_001', 'trade_matches', 'mt_demo_outlier',
   'high',   '{"price":2200,"energy_type":"solar","mean":1180,"std":190,"sigma_threshold":3}',                       'open', '2026-04-22T14:15:00Z');

-- ═══ GRID OPERATOR SUITE ═══════════════════════════════════════════════════

INSERT OR IGNORE INTO nodal_zones (code, name, region, voltage_class) VALUES
  ('ZA-NC-01', 'Northern Cape solar belt',    'NC', 'HV_275'),
  ('ZA-EC-01', 'Eastern Cape coastal wind',   'EC', 'HV_275'),
  ('ZA-WC-01', 'Western Cape coast',          'WC', 'HV_275'),
  ('ZA-GP-01', 'Gauteng industrial core',     'GP', 'HV_400'),
  ('ZA-KZN-01','KwaZulu-Natal coast',         'KZN','HV_275');

INSERT OR IGNORE INTO zone_loss_factors
  (id, zone_code, effective_month, loss_factor_pct, methodology, approved, approved_by)
VALUES
  ('zlf_nc_202604',  'ZA-NC-01',  '2026-04', 4.2, 'measured', 1, 'demo_grid_001'),
  ('zlf_ec_202604',  'ZA-EC-01',  '2026-04', 5.1, 'measured', 1, 'demo_grid_001'),
  ('zlf_wc_202604',  'ZA-WC-01',  '2026-04', 3.8, 'measured', 1, 'demo_grid_001'),
  ('zlf_gp_202604',  'ZA-GP-01',  '2026-04', 6.5, 'measured', 1, 'demo_grid_001'),
  ('zlf_kzn_202604', 'ZA-KZN-01', '2026-04', 4.7, 'measured', 1, 'demo_grid_001');

INSERT OR IGNORE INTO grid_connection_applications
  (id, application_number, applicant_participant_id, project_id, substation,
   voltage_kv, requested_capacity_mw, technology, connection_type, status,
   grid_study_fee_zar, connection_cost_estimate_zar, target_energisation_date)
VALUES
  ('gca_001', 'GCA-2026-001', 'demo_ipp_001', NULL, 'De Aar SS',       275, 100, 'solar_pv', 'new_generator', 'grid_study',         1500000, 185000000, '2027-06-01'),
  ('gca_002', 'GCA-2025-042', 'demo_ipp_001', NULL, 'Jeffreys Bay SS', 132, 50,  'wind',     'new_generator', 'gca_signed',         1200000, 95000000,  '2027-01-01'),
  ('gca_003', 'GCA-2026-005', 'demo_offtaker_001', NULL, 'Alberton SS', 132, 15,  NULL,      'new_consumer',   'cost_letter_issued', 400000,  22000000,  '2026-11-01');

INSERT OR IGNORE INTO dispatch_schedules
  (id, schedule_type, trading_day, gate_closure_at, published_at, status, total_scheduled_mwh, published_by)
VALUES
  ('ds_today_da', 'day_ahead', date('now'),          datetime('now', '-6 hours'),  datetime('now', '-5 hours'),  'published', 18500, 'demo_grid_001'),
  ('ds_ytd_da',   'day_ahead', date('now', '-1 day'), datetime('now', '-30 hours'), datetime('now', '-29 hours'), 'cleared',   18200, 'demo_grid_001');

INSERT OR IGNORE INTO dispatch_instructions
  (id, instruction_number, participant_id, instruction_type, issued_at, effective_from,
   target_mw, reason, status, issued_by)
VALUES
  ('di_001', 'DI-2026-0001', 'demo_ipp_001', 'curtail',    datetime('now', '-4 hours'),  datetime('now', '-3 hours'), 30, 'Transmission constraint at De Aar SS', 'acknowledged', 'demo_grid_001'),
  ('di_002', 'DI-2026-0002', 'demo_ipp_001', 'redispatch', datetime('now', '-12 hours'), datetime('now', '-11 hours'), 65, 'Load ramp — provide 65 MW',            'compliant',    'demo_grid_001');

INSERT OR IGNORE INTO curtailment_notices
  (id, notice_number, effective_from, affected_zone, reason, curtailment_mw, severity, status, issued_by)
VALUES
  ('cn_001', 'CN-2026-003', datetime('now', '-2 hours'), 'ZA-NC-01',
   'Single-contingency N-1 constraint on the De Aar–Kronos 275 kV line.',
   120, 'mandatory', 'active', 'demo_grid_001');

INSERT OR IGNORE INTO ancillary_service_tenders
  (id, tender_number, product_id, delivery_window_start, delivery_window_end,
   capacity_required_mw, ceiling_price_zar_mw_h, gate_closure_at, status, published_by)
VALUES
  ('tnd_fcr_001',  'TND-2026-FCR-Q2',  'asp_fcr',    '2026-04-01', '2026-06-30', 300, 450, datetime('now', '+7 days'),  'open',     'demo_grid_001'),
  ('tnd_mfrr_001', 'TND-2026-mFRR-M4', 'asp_mfrr',   '2026-04-01', '2026-04-30', 500, 800, datetime('now', '-14 days'), 'awarded',  'demo_grid_001');

INSERT OR IGNORE INTO ancillary_service_bids
  (id, tender_id, participant_id, capacity_offered_mw, price_zar_mw_h, submitted_at, status,
   awarded_capacity_mw, awarded_price_zar_mw_h)
VALUES
  ('bid_fcr_1', 'tnd_fcr_001',  'demo_ipp_001', 100, 380, datetime('now', '-3 days'),  'submitted',     NULL, NULL),
  ('bid_fcr_2', 'tnd_fcr_001',  'demo_ipp_001', 200, 420, datetime('now', '-3 days'),  'submitted',     NULL, NULL),
  ('bid_mfrr',  'tnd_mfrr_001', 'demo_ipp_001', 500, 750, datetime('now', '-20 days'), 'awarded_full',  500,  750);

INSERT OR IGNORE INTO ancillary_service_awards
  (id, tender_id, bid_id, awarded_capacity_mw, clearing_price_zar_mw_h, awarded_at, awarded_by)
VALUES
  ('awd_mfrr', 'tnd_mfrr_001', 'bid_mfrr', 500, 750, datetime('now', '-18 days'), 'demo_grid_001');

INSERT OR IGNORE INTO grid_outages
  (id, outage_number, outage_type, severity, reported_at, started_at, estimated_restoration_at,
   affected_zone, affected_customers, affected_load_mw, cause, status, commander_id)
VALUES
  ('out_001', 'OUT-2026-0087', 'unplanned', 'high', datetime('now', '-90 minutes'), datetime('now', '-85 minutes'),
   datetime('now', '+30 minutes'), 'ZA-WC-01', 3500, 45, 'Lightning strike on 132 kV line.',
   'in_progress', 'demo_grid_001');

INSERT OR IGNORE INTO grid_outage_updates (id, outage_id, update_at, update_text, affected_load_mw, restored_load_mw, posted_by) VALUES
  ('ou_001a', 'out_001', datetime('now', '-60 minutes'), 'Isolated the affected feeder. Backfeed from 275 kV underway.', 45, 0,  'demo_grid_001'),
  ('ou_001b', 'out_001', datetime('now', '-20 minutes'), 'Backfeed restored partial load. 20 MW back online.',         25, 20, 'demo_grid_001');

-- ═══ TRADER RISK ═══════════════════════════════════════════════════════════

INSERT OR IGNORE INTO credit_limits
  (id, participant_id, limit_zar, effective_from, effective_to, approved_by, basis, notes)
VALUES
  ('clim_trd',   'demo_trader_001',   50000000,  '2026-01-01', NULL, 'demo_admin_001', 'bank_guarantee',      'FNB bank guarantee, 12-month roll.'),
  ('clim_ipp',   'demo_ipp_001',      25000000,  '2026-01-01', NULL, 'demo_admin_001', 'parental_guarantee',  'Parent guarantee from Demo Holdings (Pty) Ltd.'),
  ('clim_off',   'demo_offtaker_001', 15000000,  '2026-01-01', NULL, 'demo_admin_001', 'unsecured',           'Tier 2 investment-grade counterparty.');

INSERT OR IGNORE INTO collateral_accounts
  (id, participant_id, account_number, account_type, currency, balance_zar, custodian, status)
VALUES
  ('coll_trd',   'demo_trader_001',   'COLL-TRD-001', 'cash',            'ZAR', 8500000,  'Standard Bank', 'active'),
  ('coll_trd_g', 'demo_trader_001',   'COLL-TRD-002', 'bank_guarantee',  'ZAR', 20000000, 'FNB',           'active'),
  ('coll_ipp',   'demo_ipp_001',      'COLL-IPP-001', 'parental_guarantee','ZAR', 5000000, 'Parent entity','active');

INSERT OR IGNORE INTO mark_prices
  (id, energy_type, delivery_date, mark_date, mark_price_zar_mwh, source)
VALUES
  ('mp_sol_today',   'solar', NULL, date('now'),          1180, 'vwap'),
  ('mp_sol_ytd',     'solar', NULL, date('now', '-1 day'), 1195, 'vwap'),
  ('mp_win_today',   'wind',  NULL, date('now'),          1055, 'vwap'),
  ('mp_win_ytd',     'wind',  NULL, date('now', '-1 day'), 1080, 'vwap');

-- ═══ LENDER SUITE ══════════════════════════════════════════════════════════

INSERT OR IGNORE INTO covenants
  (id, project_id, lender_participant_id, covenant_code, covenant_name, covenant_type,
   operator, threshold, measurement_frequency, waivable, material_adverse_effect, status, notes)
VALUES
  ('cov_dscr_solar',  NULL, 'demo_lender_001', 'DSCR_12M',         'DSCR (rolling 12m)',        'financial',   'gte', 1.20, 'quarterly', 1, 1, 'active', 'Senior loan DSCR minimum.'),
  ('cov_llcr_solar',  NULL, 'demo_lender_001', 'LLCR',             'LLCR',                      'financial',   'gte', 1.35, 'annual',    1, 1, 'active', 'LLCR ≥ 1.35.'),
  ('cov_avail',       NULL, 'demo_lender_001', 'AVAILABILITY_95',  'Availability (quarterly)',  'operational', 'gte', 95.0, 'quarterly', 1, 0, 'active', 'Plant availability ≥ 95% quarterly.'),
  ('cov_ins',         NULL, 'demo_lender_001', 'INSURANCE_IN_FORCE','Insurance policies in force','insurance', 'eq',  1.0,  'monthly',   0, 1, 'active', 'CAR + OAR + BI must be in force each month.');

INSERT OR IGNORE INTO covenant_tests
  (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by)
VALUES
  ('ct_dscr_q1_2026', 'cov_dscr_solar', 'Q1-2026', '2026-03-31', 1.35, 'pass', 'Comfortable headroom.',                   'demo_lender_001'),
  ('ct_dscr_q4_2025', 'cov_dscr_solar', 'Q4-2025', '2025-12-31', 1.22, 'warn', 'Within 5% of threshold — watch item.',    'demo_lender_001'),
  ('ct_avail_q1',     'cov_avail',      'Q1-2026', '2026-03-31', 96.5, 'pass', 'Availability above threshold.',           'demo_lender_001');

INSERT OR IGNORE INTO ie_certifications
  (id, project_id, ie_participant_id, cert_number, cert_type, period,
   physical_progress_pct, financial_progress_pct, recommended_drawdown_zar, certified_amount_zar,
   cert_issue_date, status)
VALUES
  ('ie_cert_001', 'ip_001', 'demo_admin_001', 'IE-2026-0001', 'monthly_progress', '2026-03',
   68.5, 65.0, 45000000, 42000000, '2026-04-05', 'certified');

INSERT OR IGNORE INTO reserve_accounts
  (id, project_id, reserve_type, target_amount_zar, target_basis, current_balance_zar, custodian, status)
VALUES
  ('rsv_dsra_1', 'ip_001', 'dsra',       12000000, 'next_6m_debt_service', 12500000, 'Standard Bank', 'active'),
  ('rsv_om_1',   'ip_001', 'om_reserve',  3000000, 'next_12m_om',           3000000, 'Standard Bank', 'active'),
  ('rsv_mra_1',  'ip_001', 'mra',         1500000, 'fixed',                 1500000, 'Standard Bank', 'active');

-- ═══ IPP LIFECYCLE ═════════════════════════════════════════════════════════

INSERT OR IGNORE INTO epc_contracts
  (id, project_id, contractor_name, lump_sum_zar, target_completion_date, commissioning_date,
   defects_liability_until, performance_security_zar, ld_cap_percentage, status)
VALUES
  ('epc_solar_1', 'ip_001', 'Demo Solar EPC (Pty) Ltd', 850000000, '2026-12-31', '2027-02-15',
   '2028-02-15', 85000000, 10.0, 'construction');

INSERT OR IGNORE INTO epc_variations
  (id, epc_contract_id, variation_number, description, value_zar, time_impact_days, status)
VALUES
  ('epv_solar_1_001', 'epc_solar_1', 'VAR-001', 'Additional module-cleaning provisioning.', 12000000, 0,  'approved'),
  ('epv_solar_1_002', 'epc_solar_1', 'VAR-002', 'Revised civil foundations per geotech.',   -4500000, 14, 'proposed');

INSERT OR IGNORE INTO insurance_policies
  (id, project_id, policy_number, policy_type, insurer, broker,
   period_start, period_end, sum_insured_zar, premium_zar, deductible_zar, lenders_noted, status)
VALUES
  ('pol_car_1', 'ip_001', 'POL-CAR-001', 'car',                   'Santam',   'Indwe', '2025-04-01', '2026-04-01',  850000000,  8500000, 2500000, 1, 'active'),
  ('pol_bi_1',  'ip_001', 'POL-BI-001',  'business_interruption', 'Santam',   'Indwe', '2025-04-01', '2026-06-30',  200000000,  2500000, 1000000, 1, 'active'),
  ('pol_pl_1',  'ip_001', 'POL-PL-001',  'public_liability',      'Old Mutual','Aon',  '2025-04-01', '2026-04-01',  150000000,  1200000,  500000, 1, 'active');

INSERT OR IGNORE INTO environmental_authorisations
  (id, project_id, authorisation_type, reference_number, competent_authority,
   applied_date, decision_date, decision, conditions_text, expiry_date)
VALUES
  ('ea_solar_1', 'ip_001', 'environmental_authorisation_s24', 'EA-NC-2024-018', 'DFFE Northern Cape',
   '2024-01-15', '2024-06-30', 'granted_with_conditions',
   'Retain 50m buffer around identified heritage sites; quarterly monitoring reports; rehabilitation bond.',
   '2034-06-30');

INSERT OR IGNORE INTO environmental_compliance
  (id, authorisation_id, condition_reference, condition_text, due_date, compliance_status)
VALUES
  ('envc_1', 'ea_solar_1', 'EA-3.1', 'Quarterly monitoring report to DFFE.',           date('now', '+30 days'), 'in_progress'),
  ('envc_2', 'ea_solar_1', 'EA-4.1', 'Heritage buffer of 50m maintained around PN-07.', NULL,                     'compliant');

INSERT OR IGNORE INTO land_parcels
  (id, project_id, parcel_number, sg_diagram, ownership_type, area_hectares,
   registered_owner, title_deed_number, lease_start_date, lease_end_date, monthly_rent_zar,
   splumap_rezoning_status, status)
VALUES
  ('lp_1', 'ip_001', 'Rem Ptn 3 of Farm 123', 'SG-NC-2024-0087', 'leased', 180.5,
   'Demo Farm Trust', 'T-123/2015', '2024-01-01', '2054-01-01', 95000, 'approved', 'secured');

INSERT OR IGNORE INTO ed_sed_spend
  (id, project_id, category, period, amount_zar, beneficiary, description)
VALUES
  ('eds_001', 'ip_001', 'socio_economic_development',  'Q1-2026', 450000,  'De Aar Primary School',       'Solar panels for school classrooms.'),
  ('eds_002', 'ip_001', 'skills_development',          'Q1-2026', 280000,  'Local solar installer course','Sponsored 10 learners through installer certification.'),
  ('eds_003', 'ip_001', 'enterprise_development',      'Q1-2026', 180000,  'Local cleaning co-op',        'Enterprise development — cleaning services contract.');

-- ═══ OFFTAKER SUITE ════════════════════════════════════════════════════════

INSERT OR IGNORE INTO offtaker_site_groups
  (id, participant_id, group_name, group_type, billing_entity, vat_number, consolidated_invoice, cost_centre)
VALUES
  ('osg_1', 'demo_offtaker_001', 'Demo Retail — National', 'company', 'Demo Retail (Pty) Ltd', 'ZA4123456789', 1, 'CC-0001');

INSERT OR IGNORE INTO tariff_products
  (id, tariff_code, tariff_name, utility, category, structure_type, tou_schedule_json,
   effective_from, effective_to)
VALUES
  ('tar_mflex',   'ESK-MEGAFLEX', 'Eskom Megaflex',   'Eskom',             'industrial',  'tou',
   '{"off_peak":{"cents_per_kwh":75,"hours":[[22,6]]},"standard":{"cents_per_kwh":115,"hours":[[6,7],[10,18],[20,22]]},"peak":{"cents_per_kwh":320,"hours":[[7,10],[18,20]]}}',
   '2025-07-01', NULL),
  ('tar_miniflex','ESK-MINIFLEX', 'Eskom Miniflex',   'Eskom',             'commercial',  'tou',
   '{"off_peak":{"cents_per_kwh":82,"hours":[[22,6]]},"standard":{"cents_per_kwh":125,"hours":[[6,7],[10,18],[20,22]]},"peak":{"cents_per_kwh":285,"hours":[[7,10],[18,20]]}}',
   '2025-07-01', NULL),
  ('tar_cct_com', 'CCT-COMMERCIAL','City of Cape Town commercial','City of Cape Town','commercial','flat', NULL, '2025-07-01', NULL);

INSERT OR IGNORE INTO rec_certificates
  (id, certificate_serial, generator_participant_id, project_id, generation_period_start,
   generation_period_end, mwh_represented, technology, registry, issuance_date, status,
   owner_participant_id)
VALUES
  ('rec_1', 'I-REC-ZA-2026-04-00001', 'demo_ipp_001', 'ip_001', '2026-04-01', '2026-04-30', 1250, 'solar_pv', 'I-REC', '2026-05-01', 'issued',      'demo_ipp_001'),
  ('rec_2', 'I-REC-ZA-2026-03-00001', 'demo_ipp_001', 'ip_001', '2026-03-01', '2026-03-31', 1180, 'solar_pv', 'I-REC', '2026-04-01', 'transferred', 'demo_offtaker_001');

INSERT OR IGNORE INTO scope2_disclosures
  (id, participant_id, reporting_year, total_consumption_mwh, location_based_emissions_tco2e,
   market_based_emissions_tco2e, renewable_mwh_claimed, renewable_percentage, grid_factor_tco2e_per_mwh, status)
VALUES
  ('s2_2025', 'demo_offtaker_001', 2025, 8200, 7626, 5346, 3074, 37.5, 0.93, 'published');

-- ═══ CARBON REGISTRY ═══════════════════════════════════════════════════════

INSERT OR IGNORE INTO credit_vintages
  (id, project_id, registry_id, vintage_year, serial_prefix, serial_start, serial_end,
   credits_issued, credits_retired, methodology, issuance_date, sa_carbon_tax_eligible)
VALUES
  ('cv_vcs_2025', 'ip_001', 'creg_verra', 2025, 'VCS-ZA-2025-', 100001, 112500, 12500, 2500,  'VCS-ACM0002',        '2026-02-15', 1),
  ('cv_gs_2024',  'ip_001', 'creg_gs',    2024, 'GS-ZA-2024-',  200001, 210000, 10000, 10000, 'GS-TL-RE',           '2025-03-10', 1);

INSERT OR IGNORE INTO mrv_submissions
  (id, project_id, reporting_period_start, reporting_period_end, submitted_by,
   claimed_reductions_tco2e, monitoring_methodology, baseline_methodology,
   baseline_emissions_tco2e, project_emissions_tco2e, leakage_tco2e, status, submitted_at)
VALUES
  ('mrv_1', 'ip_001', '2025-01-01', '2025-12-31', 'demo_carbon_001',
   12800, 'VCS-VM0007', 'VCS-ACM0002', 13500, 500, 200, 'verified', '2026-02-01');

INSERT OR IGNORE INTO mrv_verifications
  (id, submission_id, verifier_participant_id, verifier_accreditation,
   site_visit_date, desk_review_date, verified_reductions_tco2e, opinion, verification_date)
VALUES
  ('mrvv_1', 'mrv_1', 'demo_admin_001', 'ISO 14065', '2026-01-20', '2026-02-10', 12500, 'positive', '2026-02-15');

-- ═══ ADMIN PLATFORM ════════════════════════════════════════════════════════

-- Ensure default tenant exists (migration 027 seeded it; retain) and add a
-- second demo tenant so cross-tenant UI stories render.
INSERT OR IGNORE INTO tenants (id, name, tier, status, activated_at, primary_contact_email)
VALUES
  ('tenant_demo',       'Demo National Trader',   'enterprise', 'active', datetime('now'), 'admin@demo-trader.co.za'),
  ('tenant_reg',        'NERSA (demo)',           'regulator',  'active', datetime('now'), 'regulator@demo.co.za');

INSERT OR IGNORE INTO tenant_subscriptions
  (id, tenant_id, plan_id, period_start, period_end, billing_frequency, amount_zar, status, auto_renew)
VALUES
  ('sub_demo', 'tenant_demo', 'tp_ent', date('now','start of month'), date('now','start of month','+1 month','-1 day'), 'monthly', 150000, 'active', 1),
  ('sub_reg',  'tenant_reg',  'tp_reg', date('now','start of month'), date('now','start of month','+1 month','-1 day'), 'monthly', 0,      'active', 0);

INSERT OR IGNORE INTO feature_flags
  (id, flag_key, description, default_value, rollout_strategy, rollout_config_json, enabled)
VALUES
  ('ff_01', 'new_matching_engine', 'Route new orders through the OrderBook Durable Object.',   'false', 'percentage', '{"percentage":25}', 1),
  ('ff_02', 'scope2_auto_ai',      'AI-drafted Scope 2 narrative on disclosure publish.',      'false', 'by_tier',    '{"tiers":["professional","enterprise"]}', 1),
  ('ff_03', 'regulator_ai_assist', 'Surface regulator AI recommendations on surveillance alerts.', 'true', 'by_role', '{"roles":["regulator"]}', 1);

-- ═══ TENANT QUOTAS ═════════════════════════════════════════════════════════

INSERT OR IGNORE INTO tenant_rate_limits
  (tenant_id, route_prefix, window_seconds, max_requests, burst_capacity)
VALUES
  ('default',      '/api/trading',         60, 600, 100),
  ('default',      '/api/settlement-auto', 60, 120, 30),
  ('default',      '*',                    60, 1200, 200),
  ('tenant_demo',  '*',                    60, 2400, 400),
  ('tenant_reg',   '*',                    60, 600,  100);
