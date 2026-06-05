-- Migration 441: Complete all Goldrush entry points
--
-- Fills the remaining gaps so every participant role has real, linked data:
--   1. NXT Energy company_name + ipp_project promoted to commercial_operations
--   2. Covenants for demo_lender_001 linked to the Goldrush project (5 covenants + tests)
--   3. W57 SSEG registrations — 10 C&I embedded-gen sites (ERA Schedule 2)
--   4. W51 availability guarantees — 10 sites, May 2026 period, meets_guarantee
--   5. W79 revenue assurance — 10 sites, May 2026 period, closed_clean

-- ─── 1. NXT Energy participant — set company_name ─────────────────────────────
UPDATE participants
SET company_name = 'NXT Energy (Pty) Ltd',
    updated_at  = datetime('now')
WHERE id = 'id_7c352b86da89907a85266a250e15db95'
  AND (company_name IS NULL OR company_name = '');

-- ─── 2. Goldrush ipp_project — promote to commercial_operations ───────────────
UPDATE ipp_projects
SET status                    = 'commercial_operations',
    commercial_operation_date = '2024-03-15',
    ppa_volume_mwh            = 1200.0,
    ppa_price_per_mwh         = 1280.0,
    ppa_duration_years        = 20,
    renewable_energy_certificate_eligible = 1,
    updated_at                = datetime('now')
WHERE id = 'ip_mpyzsjbdui04oc'
  AND developer_id = 'id_7c352b86da89907a85266a250e15db95';

-- ─── 3. Covenants for Goldrush project (GreenBank / Infrastructure Capital) ───
INSERT OR IGNORE INTO covenants
  (id, project_id, lender_participant_id, covenant_code, covenant_name,
   covenant_type, operator, threshold, threshold_upper,
   measurement_frequency, first_test_date, waivable, material_adverse_effect, status)
VALUES
('cov_gr_01', 'ip_mpyzsjbdui04oc', 'demo_lender_001',
  'DSCR_12M', 'Debt Service Coverage Ratio (12-Month Trailing)',
  'financial', 'gte', 1.25, NULL, 'quarterly', '2024-06-30', 1, 1, 'active'),

('cov_gr_02', 'ip_mpyzsjbdui04oc', 'demo_lender_001',
  'LLCR', 'Loan Life Coverage Ratio',
  'financial', 'gte', 1.40, NULL, 'semi_annual', '2024-09-30', 1, 1, 'active'),

('cov_gr_03', 'ip_mpyzsjbdui04oc', 'demo_lender_001',
  'AVAILABILITY_95', 'Fleet-weighted availability >= 95%',
  'operational', 'gte', 95.0, NULL, 'monthly', '2024-04-30', 0, 0, 'active'),

('cov_gr_04', 'ip_mpyzsjbdui04oc', 'demo_lender_001',
  'INSURANCE', 'All-risk property & liability insurance in force',
  'insurance', 'eq', 1, NULL, 'annual', '2025-03-01', 0, 1, 'active'),

('cov_gr_05', 'ip_mpyzsjbdui04oc', 'demo_lender_001',
  'DEBT_RATIO', 'Net Debt / EBITDA <= 4.5x',
  'financial', 'lte', 4.5, NULL, 'semi_annual', '2024-09-30', 1, 0, 'active');

-- Covenant tests — Q1 2026 (pass — DSCR 3.86x from real accruals data)
INSERT OR IGNORE INTO covenant_tests
  (id, covenant_id, test_period, test_date, measured_value, result, narrative)
VALUES
('ct_gr_01a', 'cov_gr_01', 'Q1-2026', '2026-03-31', 3.86,
  'pass', 'DSCR 3.86x — well above 1.25x floor. Annual generation R231,890 vs estimated debt service R60,000.'),

('ct_gr_02a', 'cov_gr_02', 'H2-2025', '2025-12-31', 4.12,
  'pass', 'LLCR 4.12x — above 1.40x threshold. Full loan tenor modelled against PPA cashflows.'),

('ct_gr_03a', 'cov_gr_03', '2026-04', '2026-04-30', 97.8,
  'pass', 'Fleet availability 97.8% — above 95% covenant. 8 of 10 sites at 100%, Malvern at 94.1% (scheduled maintenance).'),

('ct_gr_04a', 'cov_gr_04', '2026', '2026-03-01', 1,
  'pass', 'Property & liability insurance renewed effective 1 March 2026. Insurer: Santam Commercial. Sum insured R18.5m.'),

('ct_gr_05a', 'cov_gr_05', 'H2-2025', '2025-12-31', 0.31,
  'pass', 'Net Debt / EBITDA 0.31x — comfortably within 4.5x cap. Residual loan balance vs annualised EBITDA.');

-- ─── 4. W57 SSEG registrations — 10 C&I sites ────────────────────────────────
-- ERA Schedule 2: embedded generation exempt from licence; must still register.
-- All 10 sites registered and in commercial operation since 2024-03-15.
-- Capacity < 1 MW → tier 'small' (60 kW) or 'medium' (100–120 kW).
-- Schema: created_by (not actor_id). No sla_breached column.
INSERT OR IGNORE INTO oe_sseg_registrations (
  id, registration_number,
  source_event, source_entity_type, source_wave,
  applicant_party_id, applicant_party_name,
  regulator_party_id, regulator_party_name,
  capacity_tier, generation_purpose, technology, customer_category,
  facility_name, facility_location, capacity_kw, point_of_connection,
  distributor, estimated_capex_zar_m,
  certificate_ref,
  chain_status, registration_received_at, eligibility_screening_at,
  technical_verification_at, exemption_determination_at,
  registration_approved_at, registered_at,
  is_reportable, sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES
('sseg_gr_malvern',    'SSEG-ZA-NXT-GR-001',
  'ipp_project_cod', 'ipp_project', 'W57',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'demo_regulator_001', 'NERSA Registration Office',
  'medium', 'own_use', 'solar_pv', 'commercial',
  'Goldrush Malvern', 'KwaZulu-Natal', 100.0, 'distribution',
  'eThekwini Municipality', 1.85,
  'SSEG-CERT-GR-001',
  'registered', '2023-12-01', '2023-12-15',
  '2024-01-10', '2024-01-20',
  '2024-02-01', '2024-02-15',
  0, '2024-06-30', 0,
  'id_7c352b86da89907a85266a250e15db95', '2023-12-01', datetime('now')),

('sseg_gr_bela_bela',  'SSEG-ZA-NXT-GR-002',
  'ipp_project_cod', 'ipp_project', 'W57',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'demo_regulator_001', 'NERSA Registration Office',
  'medium', 'own_use', 'solar_pv', 'commercial',
  'Goldrush Bela Bela', 'Limpopo', 100.0, 'distribution',
  'Bela Bela Local Municipality', 1.85,
  'SSEG-CERT-GR-002',
  'registered', '2023-12-01', '2023-12-15',
  '2024-01-10', '2024-01-20',
  '2024-02-01', '2024-02-15',
  0, '2024-06-30', 0,
  'id_7c352b86da89907a85266a250e15db95', '2023-12-01', datetime('now')),

('sseg_gr_cw1',        'SSEG-ZA-NXT-GR-003',
  'ipp_project_cod', 'ipp_project', 'W57',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'demo_regulator_001', 'NERSA Registration Office',
  'medium', 'own_use', 'solar_pv', 'commercial',
  'Goldrush Chatsworth 1', 'KwaZulu-Natal', 100.0, 'distribution',
  'eThekwini Municipality', 1.85,
  'SSEG-CERT-GR-003',
  'registered', '2023-12-01', '2023-12-15',
  '2024-01-10', '2024-01-20',
  '2024-02-01', '2024-02-15',
  0, '2024-06-30', 0,
  'id_7c352b86da89907a85266a250e15db95', '2023-12-01', datetime('now')),

('sseg_gr_cw2',        'SSEG-ZA-NXT-GR-004',
  'ipp_project_cod', 'ipp_project', 'W57',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'demo_regulator_001', 'NERSA Registration Office',
  'medium', 'own_use', 'solar_pv', 'commercial',
  'Goldrush Chatsworth 2', 'KwaZulu-Natal', 100.0, 'distribution',
  'eThekwini Municipality', 1.85,
  'SSEG-CERT-GR-004',
  'registered', '2023-12-01', '2023-12-15',
  '2024-01-10', '2024-01-20',
  '2024-02-01', '2024-02-15',
  0, '2024-06-30', 0,
  'id_7c352b86da89907a85266a250e15db95', '2023-12-01', datetime('now')),

('sseg_gr_hq',         'SSEG-ZA-NXT-GR-005',
  'ipp_project_cod', 'ipp_project', 'W57',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'demo_regulator_001', 'NERSA Registration Office',
  'small', 'own_use', 'solar_pv', 'commercial',
  'Goldrush HQ', 'KwaZulu-Natal', 60.0, 'distribution',
  'eThekwini Municipality', 1.10,
  'SSEG-CERT-GR-005',
  'registered', '2023-12-01', '2023-12-15',
  '2024-01-10', '2024-01-20',
  '2024-02-01', '2024-02-15',
  0, '2024-06-30', 0,
  'id_7c352b86da89907a85266a250e15db95', '2023-12-01', datetime('now')),

('sseg_gr_ladysmith',  'SSEG-ZA-NXT-GR-006',
  'ipp_project_cod', 'ipp_project', 'W57',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'demo_regulator_001', 'NERSA Registration Office',
  'medium', 'own_use', 'solar_pv', 'commercial',
  'Goldrush Ladysmith', 'KwaZulu-Natal', 120.0, 'distribution',
  'Ladysmith/Emnambithi Municipality', 2.20,
  'SSEG-CERT-GR-006',
  'registered', '2023-12-01', '2023-12-15',
  '2024-01-10', '2024-01-20',
  '2024-02-01', '2024-02-15',
  0, '2024-06-30', 0,
  'id_7c352b86da89907a85266a250e15db95', '2023-12-01', datetime('now')),

('sseg_gr_pmb',        'SSEG-ZA-NXT-GR-007',
  'ipp_project_cod', 'ipp_project', 'W57',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'demo_regulator_001', 'NERSA Registration Office',
  'small', 'own_use', 'solar_pv', 'commercial',
  'Goldrush Pietermaritzburg', 'KwaZulu-Natal', 60.0, 'distribution',
  'Msunduzi Municipality', 1.10,
  'SSEG-CERT-GR-007',
  'registered', '2023-12-01', '2023-12-15',
  '2024-01-10', '2024-01-20',
  '2024-02-01', '2024-02-15',
  0, '2024-06-30', 0,
  'id_7c352b86da89907a85266a250e15db95', '2023-12-01', datetime('now')),

('sseg_gr_stanger',    'SSEG-ZA-NXT-GR-008',
  'ipp_project_cod', 'ipp_project', 'W57',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'demo_regulator_001', 'NERSA Registration Office',
  'medium', 'own_use', 'solar_pv', 'commercial',
  'Goldrush Stanger', 'KwaZulu-Natal', 100.0, 'distribution',
  'KwaDukuza Municipality', 1.85,
  'SSEG-CERT-GR-008',
  'registered', '2023-12-01', '2023-12-15',
  '2024-01-10', '2024-01-20',
  '2024-02-01', '2024-02-15',
  0, '2024-06-30', 0,
  'id_7c352b86da89907a85266a250e15db95', '2023-12-01', datetime('now')),

('sseg_gr_west_street','SSEG-ZA-NXT-GR-009',
  'ipp_project_cod', 'ipp_project', 'W57',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'demo_regulator_001', 'NERSA Registration Office',
  'medium', 'own_use', 'solar_pv', 'commercial',
  'Goldrush West Street', 'KwaZulu-Natal', 100.0, 'distribution',
  'eThekwini Municipality', 1.85,
  'SSEG-CERT-GR-009',
  'registered', '2023-12-01', '2023-12-15',
  '2024-01-10', '2024-01-20',
  '2024-02-01', '2024-02-15',
  0, '2024-06-30', 0,
  'id_7c352b86da89907a85266a250e15db95', '2023-12-01', datetime('now')),

('sseg_gr_wonderpark', 'SSEG-ZA-NXT-GR-010',
  'ipp_project_cod', 'ipp_project', 'W57',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'demo_regulator_001', 'NERSA Registration Office',
  'medium', 'own_use', 'solar_pv', 'commercial',
  'Goldrush Wonderpark', 'Gauteng', 100.0, 'distribution',
  'City of Tshwane', 1.85,
  'SSEG-CERT-GR-010',
  'registered', '2023-12-01', '2023-12-15',
  '2024-01-10', '2024-01-20',
  '2024-02-01', '2024-02-15',
  0, '2024-06-30', 0,
  'id_7c352b86da89907a85266a250e15db95', '2023-12-01', datetime('now'));

-- ─── 5. W51 availability guarantees — 10 sites, May 2026, meets_guarantee ─────
-- chain_status valid terminal for met availability: 'meets_guarantee'.
-- period_open_at is NOT NULL; meets_guarantee_at records when resolved.
-- Schema: created_by (not actor_id). No sla_breached column.
INSERT OR IGNORE INTO oe_availability_guarantees (
  id, case_number,
  source_event, source_entity_type, source_wave,
  owner_party_id, owner_party_name, contractor_party_id, contractor_party_name,
  site_id, site_name, site_province, technology, capacity_mw,
  contract_ref, reporting_period, period_start, period_end,
  guaranteed_availability_pct, measured_availability_pct,
  adjusted_availability_pct, shortfall_pp, shortfall_tier,
  ld_assessed_zar, bonus_zar, settlement_zar,
  chain_status, period_open_at, meets_guarantee_at,
  is_reportable, sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES
('avg_gr_malvern_2026_05',    'AVG-GR-MAL-202605',
  'monthly_accrual_rollup', 'esums_station', 'W51',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy O&M',
  'om_site_gr_malvern', 'Goldrush Malvern', 'KwaZulu-Natal', 'solar_pv', 0.100,
  'OM-GR-001', '2026-05', '2026-05-01', '2026-05-31',
  98.0, 99.1, 99.1, -1.1, 'minor_shortfall',
  0.0, 0.0, 0.0,
  'meets_guarantee', '2026-05-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('avg_gr_bela_bela_2026_05',  'AVG-GR-BB-202605',
  'monthly_accrual_rollup', 'esums_station', 'W51',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy O&M',
  'om_site_gr_bela_bela', 'Goldrush Bela Bela', 'Limpopo', 'solar_pv', 0.100,
  'OM-GR-002', '2026-05', '2026-05-01', '2026-05-31',
  98.0, 98.7, 98.7, -0.7, 'minor_shortfall',
  0.0, 0.0, 0.0,
  'meets_guarantee', '2026-05-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('avg_gr_cw1_2026_05',        'AVG-GR-CW1-202605',
  'monthly_accrual_rollup', 'esums_station', 'W51',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy O&M',
  'om_site_gr_chatsworth_1', 'Goldrush Chatsworth 1', 'KwaZulu-Natal', 'solar_pv', 0.100,
  'OM-GR-003', '2026-05', '2026-05-01', '2026-05-31',
  98.0, 100.0, 100.0, -2.0, 'minor_shortfall',
  0.0, 520.0, 520.0,
  'meets_guarantee', '2026-05-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('avg_gr_cw2_2026_05',        'AVG-GR-CW2-202605',
  'monthly_accrual_rollup', 'esums_station', 'W51',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy O&M',
  'om_site_gr_chatsworth_2', 'Goldrush Chatsworth 2', 'KwaZulu-Natal', 'solar_pv', 0.100,
  'OM-GR-004', '2026-05', '2026-05-01', '2026-05-31',
  98.0, 99.5, 99.5, -1.5, 'minor_shortfall',
  0.0, 0.0, 0.0,
  'meets_guarantee', '2026-05-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('avg_gr_hq_2026_05',         'AVG-GR-HQ-202605',
  'monthly_accrual_rollup', 'esums_station', 'W51',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy O&M',
  'om_site_gr_hq', 'Goldrush HQ', 'KwaZulu-Natal', 'solar_pv', 0.060,
  'OM-GR-005', '2026-05', '2026-05-01', '2026-05-31',
  98.0, 98.2, 98.2, -0.2, 'minor_shortfall',
  0.0, 0.0, 0.0,
  'meets_guarantee', '2026-05-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('avg_gr_ladysmith_2026_05',  'AVG-GR-LS-202605',
  'monthly_accrual_rollup', 'esums_station', 'W51',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy O&M',
  'om_site_gr_ladysmith', 'Goldrush Ladysmith', 'KwaZulu-Natal', 'solar_pv', 0.120,
  'OM-GR-006', '2026-05', '2026-05-01', '2026-05-31',
  98.0, 99.8, 99.8, -1.8, 'minor_shortfall',
  0.0, 0.0, 0.0,
  'meets_guarantee', '2026-05-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('avg_gr_pmb_2026_05',        'AVG-GR-PMB-202605',
  'monthly_accrual_rollup', 'esums_station', 'W51',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy O&M',
  'om_site_gr_pmb', 'Goldrush Pietermaritzburg', 'KwaZulu-Natal', 'solar_pv', 0.060,
  'OM-GR-007', '2026-05', '2026-05-01', '2026-05-31',
  98.0, 97.4, 98.9, -0.9, 'minor_shortfall',
  0.0, 0.0, 0.0,
  'meets_guarantee', '2026-05-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('avg_gr_stanger_2026_05',    'AVG-GR-STG-202605',
  'monthly_accrual_rollup', 'esums_station', 'W51',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy O&M',
  'om_site_gr_stanger', 'Goldrush Stanger', 'KwaZulu-Natal', 'solar_pv', 0.100,
  'OM-GR-008', '2026-05', '2026-05-01', '2026-05-31',
  98.0, 100.0, 100.0, -2.0, 'minor_shortfall',
  0.0, 520.0, 520.0,
  'meets_guarantee', '2026-05-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('avg_gr_west_street_2026_05','AVG-GR-WS-202605',
  'monthly_accrual_rollup', 'esums_station', 'W51',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy O&M',
  'om_site_gr_west_street', 'Goldrush West Street', 'KwaZulu-Natal', 'solar_pv', 0.100,
  'OM-GR-009', '2026-05', '2026-05-01', '2026-05-31',
  98.0, 99.3, 99.3, -1.3, 'minor_shortfall',
  0.0, 0.0, 0.0,
  'meets_guarantee', '2026-05-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('avg_gr_wonderpark_2026_05', 'AVG-GR-WP-202605',
  'monthly_accrual_rollup', 'esums_station', 'W51',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy (Pty) Ltd',
  'id_7c352b86da89907a85266a250e15db95', 'NXT Energy O&M',
  'om_site_gr_wonderpark', 'Goldrush Wonderpark', 'Gauteng', 'solar_pv', 0.100,
  'OM-GR-010', '2026-05', '2026-05-01', '2026-05-31',
  98.0, 98.6, 98.6, -0.6, 'minor_shortfall',
  0.0, 0.0, 0.0,
  'meets_guarantee', '2026-05-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now'));

-- ─── 6. W79 revenue assurance — 10 sites, May 2026, closed_clean ─────────────
-- Real kWh and revenue values from esums_settlement_invoices (migration 440).
-- metered = settled = invoiced (Solax actuals match invoice — zero leakage).
-- variance_zar = 0.0 (closed_clean). period_open_at NOT NULL.
-- Schema: created_by (not actor_id). No sla_breached column.
-- Station→site→invoice map:
--   ssx_343f4d... → malvern       → esi_ssx_343f4d88b936057a053caed6036ec523_2026-05-01
--   ssx_9faa08... → bela_bela     → esi_ssx_9faa08e2558f2c3ce49c4f08e93b2320_2026-05-01
--   ssx_927333... → chatsworth_1  → esi_ssx_9273339b718b2257cc36292ce9d9126e_2026-05-01
--   ssx_a9f17c... → chatsworth_2  → esi_ssx_a9f17c32c1894e5cc64e442f9b551e22_2026-05-01
--   ssx_f4adc5... → hq            → esi_ssx_f4adc5dcfbc7c5de496aa40cefa7cb27_2026-05-01
--   ssx_c0af7a... → ladysmith     → esi_ssx_c0af7afc350c4700327b623afb146d2b_2026-05-01
--   ssx_ac1e87... → pmb           → esi_ssx_ac1e87a8e3a7b4936460153014477dac_2026-05-01
--   ssx_ff8c11... → stanger       → esi_ssx_ff8c11bcb035dbcf7d5bab5dc0b26913_2026-05-01
--   ssx_406fab... → west_street   → esi_ssx_406fabc54aeb72353781500be287f0ae_2026-05-01
--   ssx_285085... → wonderpark    → esi_ssx_285085eb300cf51617d42f9fe388c011_2026-05-01
INSERT OR IGNORE INTO oe_generation_revenue_assurance (
  id, gra_number,
  source_event, source_entity_type, source_wave,
  site_id, project_id, ppa_ref,
  reconciliation_period, period_start, period_end, data_cutoff_date,
  site_name, operator_name, counterparty_name,
  expected_generation_mwh, metered_generation_mwh,
  settled_generation_mwh, invoiced_generation_mwh,
  currency, expected_revenue_zar, settled_revenue_zar,
  variance_zar, variance_mwh, revenue_assurance_tier,
  chain_status, period_open_at, data_ingested_at, closed_clean_at,
  is_reportable, sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES
('gra_gr_malvern_2026_05',       'GRA-GR-MAL-202605',
  'monthly_invoice_rollup', 'esums_station', 'W79',
  'om_site_gr_malvern', 'ip_mpyzsjbdui04oc',
  'esi_ssx_343f4d88b936057a053caed6036ec523_2026-05-01',
  '2026-05', '2026-05-01', '2026-05-31', '2026-06-03',
  'Goldrush Malvern', 'NXT Energy (Pty) Ltd', 'City Energy Municipality',
  9.381, 9.381, 9.381, 9.381,
  'ZAR', 12008.19, 12008.19,
  0.0, 0.0, 'minor',
  'closed_clean', '2026-05-01', '2026-06-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('gra_gr_bela_bela_2026_05',     'GRA-GR-BB-202605',
  'monthly_invoice_rollup', 'esums_station', 'W79',
  'om_site_gr_bela_bela', 'ip_mpyzsjbdui04oc',
  'esi_ssx_9faa08e2558f2c3ce49c4f08e93b2320_2026-05-01',
  '2026-05', '2026-05-01', '2026-05-31', '2026-06-03',
  'Goldrush Bela Bela', 'NXT Energy (Pty) Ltd', 'City Energy Municipality',
  0.627, 0.627, 0.627, 0.627,
  'ZAR', 802.05, 802.05,
  0.0, 0.0, 'minor',
  'closed_clean', '2026-05-01', '2026-06-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('gra_gr_chatsworth_1_2026_05',  'GRA-GR-CW1-202605',
  'monthly_invoice_rollup', 'esums_station', 'W79',
  'om_site_gr_chatsworth_1', 'ip_mpyzsjbdui04oc',
  'esi_ssx_9273339b718b2257cc36292ce9d9126e_2026-05-01',
  '2026-05', '2026-05-01', '2026-05-31', '2026-06-03',
  'Goldrush Chatsworth 1', 'NXT Energy (Pty) Ltd', 'City Energy Municipality',
  5.273, 5.273, 5.273, 5.273,
  'ZAR', 6749.82, 6749.82,
  0.0, 0.0, 'minor',
  'closed_clean', '2026-05-01', '2026-06-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('gra_gr_chatsworth_2_2026_05',  'GRA-GR-CW2-202605',
  'monthly_invoice_rollup', 'esums_station', 'W79',
  'om_site_gr_chatsworth_2', 'ip_mpyzsjbdui04oc',
  'esi_ssx_a9f17c32c1894e5cc64e442f9b551e22_2026-05-01',
  '2026-05', '2026-05-01', '2026-05-31', '2026-06-03',
  'Goldrush Chatsworth 2', 'NXT Energy (Pty) Ltd', 'City Energy Municipality',
  5.703, 5.703, 5.703, 5.703,
  'ZAR', 7299.33, 7299.33,
  0.0, 0.0, 'minor',
  'closed_clean', '2026-05-01', '2026-06-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('gra_gr_hq_2026_05',            'GRA-GR-HQ-202605',
  'monthly_invoice_rollup', 'esums_station', 'W79',
  'om_site_gr_hq', 'ip_mpyzsjbdui04oc',
  'esi_ssx_f4adc5dcfbc7c5de496aa40cefa7cb27_2026-05-01',
  '2026-05', '2026-05-01', '2026-05-31', '2026-06-03',
  'Goldrush HQ', 'NXT Energy (Pty) Ltd', 'City Energy Municipality',
  4.225, 4.225, 4.225, 4.225,
  'ZAR', 5408.38, 5408.38,
  0.0, 0.0, 'minor',
  'closed_clean', '2026-05-01', '2026-06-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('gra_gr_ladysmith_2026_05',     'GRA-GR-LS-202605',
  'monthly_invoice_rollup', 'esums_station', 'W79',
  'om_site_gr_ladysmith', 'ip_mpyzsjbdui04oc',
  'esi_ssx_c0af7afc350c4700327b623afb146d2b_2026-05-01',
  '2026-05', '2026-05-01', '2026-05-31', '2026-06-03',
  'Goldrush Ladysmith', 'NXT Energy (Pty) Ltd', 'City Energy Municipality',
  9.178, 9.178, 9.178, 9.178,
  'ZAR', 11747.20, 11747.20,
  0.0, 0.0, 'minor',
  'closed_clean', '2026-05-01', '2026-06-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('gra_gr_pmb_2026_05',           'GRA-GR-PMB-202605',
  'monthly_invoice_rollup', 'esums_station', 'W79',
  'om_site_gr_pmb', 'ip_mpyzsjbdui04oc',
  'esi_ssx_ac1e87a8e3a7b4936460153014477dac_2026-05-01',
  '2026-05', '2026-05-01', '2026-05-31', '2026-06-03',
  'Goldrush Pietermaritzburg', 'NXT Energy (Pty) Ltd', 'City Energy Municipality',
  3.823, 3.823, 3.823, 3.823,
  'ZAR', 4892.93, 4892.93,
  0.0, 0.0, 'minor',
  'closed_clean', '2026-05-01', '2026-06-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('gra_gr_stanger_2026_05',       'GRA-GR-STG-202605',
  'monthly_invoice_rollup', 'esums_station', 'W79',
  'om_site_gr_stanger', 'ip_mpyzsjbdui04oc',
  'esi_ssx_ff8c11bcb035dbcf7d5bab5dc0b26913_2026-05-01',
  '2026-05', '2026-05-01', '2026-05-31', '2026-06-03',
  'Goldrush Stanger', 'NXT Energy (Pty) Ltd', 'City Energy Municipality',
  5.351, 5.351, 5.351, 5.351,
  'ZAR', 6849.66, 6849.66,
  0.0, 0.0, 'minor',
  'closed_clean', '2026-05-01', '2026-06-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('gra_gr_west_street_2026_05',   'GRA-GR-WS-202605',
  'monthly_invoice_rollup', 'esums_station', 'W79',
  'om_site_gr_west_street', 'ip_mpyzsjbdui04oc',
  'esi_ssx_406fabc54aeb72353781500be287f0ae_2026-05-01',
  '2026-05', '2026-05-01', '2026-05-31', '2026-06-03',
  'Goldrush West Street', 'NXT Energy (Pty) Ltd', 'City Energy Municipality',
  2.229, 2.229, 2.229, 2.229,
  'ZAR', 2853.63, 2853.63,
  0.0, 0.0, 'minor',
  'closed_clean', '2026-05-01', '2026-06-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now')),

('gra_gr_wonderpark_2026_05',    'GRA-GR-WP-202605',
  'monthly_invoice_rollup', 'esums_station', 'W79',
  'om_site_gr_wonderpark', 'ip_mpyzsjbdui04oc',
  'esi_ssx_285085eb300cf51617d42f9fe388c011_2026-05-01',
  '2026-05', '2026-05-01', '2026-05-31', '2026-06-03',
  'Goldrush Wonderpark', 'NXT Energy (Pty) Ltd', 'City Energy Municipality',
  4.819, 4.819, 4.819, 4.819,
  'ZAR', 6168.83, 6168.83,
  0.0, 0.0, 'minor',
  'closed_clean', '2026-05-01', '2026-06-01', '2026-06-03',
  0, '2026-06-15', 0,
  'id_7c352b86da89907a85266a250e15db95', datetime('now'), datetime('now'));
