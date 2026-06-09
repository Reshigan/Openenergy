-- ═══════════════════════════════════════════════════════════════════════
-- 497_seed_carbon_lender_grid_regulator.sql
-- Demo seed: carbon registry + lender facilities + grid wheeling + regulator inbox
-- Safe to re-run (INSERT OR IGNORE throughout)
-- ═══════════════════════════════════════════════════════════════════════

-- 497_seed_carbon_lender_grid_regulator.sql
-- Demo seed: Carbon, Lender, Grid, Regulator roles.
-- All INSERT OR IGNORE — safe to re-apply on any DB.
-- Statutory references: Carbon Tax Act 15/2019, ERA 4/2006, NCA 34/2005,
-- NERSA Grid Code, SARB Guidance Note 3/2016, SARS eFiling.

-- ════════════════════════════════════════════════════════════════════════
-- 1. CARBON — demo_carbon_001
-- ════════════════════════════════════════════════════════════════════════

-- ── Carbon project registrations ───────────────────────────────────────

INSERT OR IGNORE INTO oe_carbon_registration (
  id, project_number,
  developer_party_id, developer_party_name,
  vvb_name,
  project_name, project_tier, standard, methodology,
  province, host_country,
  crediting_years, estimated_annual_tco2e, estimated_total_tco2e,
  registered_serial_block,
  pin_ref, pdd_ref, validation_ref, dna_authorization_ref, registration_ref,
  validation_basis, registration_basis,
  chain_status,
  pin_submitted_at, pdd_drafted_at, validation_underway_at,
  public_consultation_at, dna_authorization_at, registration_requested_at,
  registered_at, crediting_active_at,
  sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'creg_001', 'OE-CREG-2024-001',
  'demo_carbon_001', 'NXT Carbon Fund (Pty) Ltd',
  'Bureau Veritas Certification SA',
  'Northern Cape Solar PV Grid-Connected Project', 'large_scale',
  'gold_standard', 'GS TPDDTEC Rev. 06',
  'Northern Cape', 'ZA',
  10, 48500.0, 485000.0,
  'GS-SA-SOL-001-2024-000001-485000',
  'PIN-2024-001', 'PDD-2024-001-v2', 'VAL-2024-001',
  'DNA-DFFE-2024-0142', 'REG-GS-SA-2024-0081',
  'Gold Standard validation by Bureau Veritas Certification SA — site audit completed 2024-04-10; CDM Tool 01 additionality confirmed; barrier analysis complete.',
  'Gold Standard Council registered project OE-CREG-2024-001; 10-year crediting period commences 2024-07-01; serial block GS-SA-SOL-001 assigned.',
  'crediting_active',
  '2023-11-15T08:00:00Z', '2024-01-22T09:30:00Z', '2024-02-28T10:00:00Z',
  '2024-04-02T08:00:00Z', '2024-05-14T11:00:00Z', '2024-06-01T09:00:00Z',
  '2024-06-25T14:00:00Z', '2024-07-01T00:00:00Z',
  '2025-07-01T00:00:00Z',
  'demo_carbon_001', '2023-11-15T08:00:00Z', '2024-07-01T00:00:00Z'
);

INSERT OR IGNORE INTO oe_carbon_registration (
  id, project_number,
  developer_party_id, developer_party_name,
  vvb_name,
  project_name, project_tier, standard, methodology,
  province, host_country,
  crediting_years, estimated_annual_tco2e, estimated_total_tco2e,
  registered_serial_block,
  pin_ref, pdd_ref, validation_ref, dna_authorization_ref, registration_ref,
  validation_basis, registration_basis,
  chain_status,
  pin_submitted_at, pdd_drafted_at, validation_underway_at,
  public_consultation_at, dna_authorization_at, registration_requested_at,
  registered_at, crediting_active_at,
  sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'creg_002', 'OE-CREG-2025-002',
  'demo_carbon_001', 'NXT Carbon Fund (Pty) Ltd',
  'SGS South Africa (Pty) Ltd',
  'Eastern Cape Onshore Wind AFOLU Buffer Project', 'afolu_redd',
  'verra_vcs', 'VM0042 v1.0',
  'Eastern Cape', 'ZA',
  20, 31200.0, 624000.0,
  NULL,
  'PIN-2025-002', 'PDD-2025-002-v1', 'VAL-2025-002',
  NULL, NULL,
  'Verra VCS validation by SGS SA — desk review completed; site audit scheduled Q3 2025; additionality via investment barrier analysis.',
  NULL,
  'validation_underway',
  '2025-01-10T09:00:00Z', '2025-03-05T10:00:00Z', '2025-05-12T08:00:00Z',
  NULL, NULL, NULL,
  NULL, NULL,
  '2025-11-12T08:00:00Z',
  'demo_carbon_001', '2025-01-10T09:00:00Z', '2025-05-12T08:00:00Z'
);

-- ── Carbon issuances ───────────────────────────────────────────────────

INSERT OR IGNORE INTO oe_carbon_issuances (
  id, issuance_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_id, project_name,
  registry_standard, methodology_id,
  proponent_party_id, proponent_party_name,
  registry_account_id, vvb_name, host_country,
  transfer_type, category, issuance_tier,
  requested_tco2e, requires_corresponding_adjustment, ca_applied_flag,
  vintage_year, monitoring_period_start, monitoring_period_end,
  vintage_monitoring_key,
  verified_tco2e, already_issued_tco2e,
  buffer_pct, buffer_contribution_tco2e, net_issuable_tco2e,
  project_vintage_headroom_tco2e,
  over_issuance_flag, double_issuance_guard_ok,
  serial_block_start, serial_block_end, serial_block_size, serial_number_prefix,
  screened_flag, verification_check_ok_flag, serials_assigned_flag,
  submitted_to_registry_flag, issued_flag,
  request_ref, issuance_ref,
  request_basis, issuance_basis, issuance_summary,
  chain_status,
  requested_at, screening_at, verification_check_at, serialization_at,
  pending_registry_at, issued_at,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'cis_001', 'OE-CIS-2024-001',
  'mrv.verification.approved', 'mrv_submissions', 'mrv_001', 'W11',
  'creg_001', 'Northern Cape Solar PV Grid-Connected Project',
  'gold_standard', 'GS TPDDTEC Rev. 06',
  'demo_carbon_001', 'NXT Carbon Fund (Pty) Ltd',
  'GS-ACC-NXT-001', 'Bureau Veritas Certification SA', 'ZA',
  'voluntary', 'energy', 'major',
  50000.0, 0, 0,
  2024, '2024-07-01', '2024-12-31',
  'creg_001::2024::2024-07-01/2024-12-31',
  50250.0, 0.0,
  0.02, 1005.0, 49245.0,
  485000.0,
  0, 1,
  1, 50000, 50000, 'GS-SA-SOL-001',
  1, 1, 1, 1, 1,
  'REQ-2025-001', 'ISS-GS-2025-001',
  'First monitoring period (2024-H2) verified by Bureau Veritas; verified tCO2e 50,250; buffer pool deduction 2% (AFOLU-lite); net 49,245 tCO2e net minted.',
  'Gold Standard issued serial block GS-SA-SOL-001-000001-050000 to NXT Carbon Fund registry account GS-ACC-NXT-001 on 2025-03-15. Carbon-tax eligible per DFFE list 1.',
  'Southern Africa premier solar PV project; 50,000 tCO2e issued against 2024-H2 monitoring period; R240/tCO2e spot; portfolio total R12.0M.',
  'issued',
  '2025-01-20T09:00:00Z', '2025-01-25T10:00:00Z', '2025-02-12T11:00:00Z',
  '2025-03-01T09:00:00Z', '2025-03-08T14:00:00Z', '2025-03-15T16:00:00Z',
  1, '2025-04-15T09:00:00Z',
  'demo_carbon_001', '2025-01-20T09:00:00Z', '2025-03-15T16:00:00Z'
);

INSERT OR IGNORE INTO oe_carbon_issuances (
  id, issuance_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_id, project_name,
  registry_standard, methodology_id,
  proponent_party_id, proponent_party_name,
  registry_account_id, vvb_name, host_country,
  transfer_type, category, issuance_tier,
  requested_tco2e, requires_corresponding_adjustment, ca_applied_flag,
  vintage_year, monitoring_period_start, monitoring_period_end,
  vintage_monitoring_key,
  verified_tco2e, already_issued_tco2e,
  buffer_pct, buffer_contribution_tco2e, net_issuable_tco2e,
  project_vintage_headroom_tco2e,
  over_issuance_flag, double_issuance_guard_ok,
  serial_block_start, serial_block_end, serial_block_size, serial_number_prefix,
  screened_flag, verification_check_ok_flag, serials_assigned_flag,
  submitted_to_registry_flag, issued_flag,
  request_ref, issuance_ref,
  request_basis, issuance_basis, issuance_summary,
  chain_status,
  requested_at, screening_at, verification_check_at, serialization_at,
  pending_registry_at, issued_at,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'cis_002', 'OE-CIS-2025-002',
  'mrv.verification.approved', 'mrv_submissions', 'mrv_002', 'W11',
  'creg_001', 'Northern Cape Solar PV Grid-Connected Project',
  'gold_standard', 'GS TPDDTEC Rev. 06',
  'demo_carbon_001', 'NXT Carbon Fund (Pty) Ltd',
  'GS-ACC-NXT-001', 'Bureau Veritas Certification SA', 'ZA',
  'voluntary', 'energy', 'moderate',
  35000.0, 0, 0,
  2025, '2025-01-01', '2025-06-30',
  'creg_001::2025::2025-01-01/2025-06-30',
  35400.0, 50000.0,
  0.02, 708.0, 34692.0,
  435000.0,
  0, 1,
  50001, 85000, 35000, 'GS-SA-SOL-001',
  1, 1, 1, 1, 1,
  'REQ-2025-002', 'ISS-GS-2025-002',
  'Second monitoring period (2025-H1) verified; verified 35,400 tCO2e; buffer deduction 2%; net 34,692 tCO2e; running total 84,692 tCO2e vs 485,000 tCO2e lifetime.',
  'Gold Standard issued serial block GS-SA-SOL-001-050001-085000; R245/tCO2e spot; incremental portfolio addition R8.6M.',
  'H1-2025 issuance; 35,000 tCO2e; cumulative project vintage utilisation 17.5%; headroom R435k tCO2e.',
  'issued',
  '2025-08-05T09:00:00Z', '2025-08-10T10:00:00Z', '2025-08-28T11:00:00Z',
  '2025-09-10T09:00:00Z', '2025-09-18T14:00:00Z', '2025-09-25T16:00:00Z',
  0, '2025-10-25T09:00:00Z',
  'demo_carbon_001', '2025-08-05T09:00:00Z', '2025-09-25T16:00:00Z'
);

INSERT OR IGNORE INTO oe_carbon_issuances (
  id, issuance_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  project_id, project_name,
  registry_standard, methodology_id,
  proponent_party_id, proponent_party_name,
  registry_account_id, vvb_name, host_country,
  transfer_type, category, issuance_tier,
  requested_tco2e, requires_corresponding_adjustment, ca_applied_flag,
  vintage_year, monitoring_period_start, monitoring_period_end,
  vintage_monitoring_key,
  verified_tco2e, already_issued_tco2e,
  buffer_pct, buffer_contribution_tco2e, net_issuable_tco2e,
  project_vintage_headroom_tco2e,
  over_issuance_flag, double_issuance_guard_ok,
  screened_flag, verification_check_ok_flag, serials_assigned_flag,
  submitted_to_registry_flag, issued_flag,
  request_ref, screening_ref,
  request_basis, screening_basis,
  chain_status,
  requested_at, screening_at,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'cis_003', 'OE-CIS-2026-003',
  'mrv.verification.approved', 'mrv_submissions', 'mrv_003', 'W11',
  'creg_001', 'Northern Cape Solar PV Grid-Connected Project',
  'gold_standard', 'GS TPDDTEC Rev. 06',
  'demo_carbon_001', 'NXT Carbon Fund (Pty) Ltd',
  'GS-ACC-NXT-001', 'Bureau Veritas Certification SA', 'ZA',
  'voluntary', 'energy', 'moderate',
  22000.0, 0, 0,
  2025, '2025-07-01', '2025-12-31',
  'creg_001::2025::2025-07-01/2025-12-31',
  22150.0, 85000.0,
  0.02, 443.0, 21707.0,
  400000.0,
  0, 1,
  1, 0, 0, 0, 0,
  'REQ-2026-003', 'SCR-2026-003',
  'Third issuance request for 2025-H2 monitoring period; VVB opinion positive; submitted for Gold Standard completeness screening.',
  'Completeness screening in progress — document checklist 8/10 items cleared; registry account statement requested from GS.',
  'screening',
  '2026-04-01T09:00:00Z', '2026-04-07T10:00:00Z',
  0, '2026-07-01T09:00:00Z',
  'demo_carbon_001', '2026-04-01T09:00:00Z', '2026-04-07T10:00:00Z'
);

-- ── Carbon monitoring records ──────────────────────────────────────────
-- Seed the oe_carbon_pdd parent row first so FK (pdd_id) resolves.

INSERT OR IGNORE INTO oe_carbon_pdd (
  id, project_id, methodology, registry, pdd_version, pdd_status,
  crediting_period_years, estimated_annual_tco2e,
  doe_id, registered_at, registry_id,
  created_at
) VALUES (
  'pdd_001', 'creg_001',
  'GS TPDDTEC Rev. 06', 'gold_standard', 'v2.1', 'registered',
  10, 48500.0,
  'Bureau Veritas Certification SA', '2024-06-25', 'GS-SA-0081',
  '2023-11-15T08:00:00Z'
);

INSERT OR IGNORE INTO oe_carbon_monitoring (
  id, pdd_id, period_start, period_end,
  measured_tco2e, ex_ante_tco2e, data_quality_pct,
  status, submitted_at, verified_at, issued_at,
  issued_serial_range
) VALUES
  ('cmon_001', 'pdd_001', '2024-07-01', '2024-09-30',
   25380.0, 24250.0, 98.4,
   'issued', '2024-10-10T09:00:00Z', '2024-11-05T14:00:00Z', '2024-11-20T16:00:00Z',
   'GS-SA-SOL-001-000001-025380'),

  ('cmon_002', 'pdd_001', '2024-10-01', '2024-12-31',
   24870.0, 24250.0, 97.9,
   'issued', '2025-01-08T09:00:00Z', '2025-02-04T14:00:00Z', '2025-02-18T16:00:00Z',
   'GS-SA-SOL-001-025381-050000'),

  ('cmon_003', 'pdd_001', '2025-01-01', '2025-03-31',
   17650.0, 24250.0, 98.7,
   'issued', '2025-04-08T09:00:00Z', '2025-05-06T14:00:00Z', '2025-05-20T16:00:00Z',
   'GS-SA-SOL-001-050001-067350'),

  ('cmon_004', 'pdd_001', '2025-04-01', '2025-06-30',
   17750.0, 24250.0, 98.1,
   'issued', '2025-07-08T09:00:00Z', '2025-08-05T14:00:00Z', '2025-08-19T16:00:00Z',
   'GS-SA-SOL-001-067351-085000'),

  ('cmon_005', 'pdd_001', '2025-07-01', '2025-09-30',
   11200.0, 24250.0, 97.5,
   'verified', '2025-10-10T09:00:00Z', '2025-11-08T14:00:00Z', NULL, NULL),

  ('cmon_006', 'pdd_001', '2025-10-01', '2025-12-31',
   10950.0, 24250.0, 96.8,
   'submitted', '2026-01-10T09:00:00Z', NULL, NULL, NULL);

-- ── Carbon offset claims ───────────────────────────────────────────────

INSERT OR IGNORE INTO oe_carbon_offset_claims (
  id, claim_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  taxpayer_party_id, taxpayer_party_name,
  registry_name, sars_office_name,
  tax_year, industry_group, offset_tier,
  gross_tax_liability_zar, offset_limit_pct, offset_limit_zar,
  ct_rate_zar_per_tco2e, credits_claimed_tco2e, offset_value_zar, net_tax_liability_zar,
  coas_reference, retirement_ref, sars_reference, allowance_ref, return_ref,
  eligibility_basis, submission_basis, allowance_basis, reconciliation_basis, claim_summary,
  chain_status,
  claim_drafted_at, eligibility_screening_at, credits_earmarked_at,
  claim_submitted_at, sars_review_at, allowance_granted_at,
  applied_to_return_at, reconciled_at,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'coc_001', 'OE-COC-2025-001',
  'carbon.retirement.completed', 'carbon_retirements', 'cret_001', 'W17',
  'demo_carbon_001', 'NXT Carbon Fund (Pty) Ltd',
  'DFFE Carbon Offset Administration System (COAS)', 'SARS Large Business Centre — Johannesburg',
  2024, 'general', 'major_claim',
  185000000.0, 5.0, 9250000.0,
  236.0, 39000.0, 9204000.0, 175796000.0,
  'COAS-RET-2025-007214', 'CRET-2025-001', 'SARS-CT-2025-0044821',
  'ALLOW-2025-0044821', 'CTR-2025-NXT-001',
  'Credits retired under GS serial block GS-SA-SOL-001-000001-039000; DFFE COAS lock confirmed; credits SA Carbon Tax eligible per GNR 1556/2019; offset cap 5% (general industry).',
  'Carbon tax return submitted via SARS eFiling ENV001; 39,000 tCO2e × R236/tCO2e = R9,204,000 offset value; within 5% cap of R9,250,000 gross liability.',
  'SARS Large Business Centre reviewed and granted allowance ALLOW-2025-0044821; no query raised; R9,204,000 deducted from carbon-tax assessment.',
  'Carbon tax assessment reconciled; net liability R175,796,000 reflected on ITA34C; COAS retirement record immutable.',
  'FY2024 carbon offset claim — 39,000 tCO2e retired; R9.2M offset value; major_claim tier; SARS allowance granted; net tax saving R9.204M.',
  'reconciled',
  '2025-04-01T09:00:00Z', '2025-04-08T10:00:00Z', '2025-04-15T11:00:00Z',
  '2025-04-22T09:00:00Z', '2025-05-06T08:00:00Z', '2025-06-02T14:00:00Z',
  '2025-06-10T09:00:00Z', '2025-06-20T14:00:00Z',
  1, '2025-07-20T14:00:00Z',
  'demo_carbon_001', '2025-04-01T09:00:00Z', '2025-06-20T14:00:00Z'
);

INSERT OR IGNORE INTO oe_carbon_offset_claims (
  id, claim_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  taxpayer_party_id, taxpayer_party_name,
  registry_name, sars_office_name,
  tax_year, industry_group, offset_tier,
  gross_tax_liability_zar, offset_limit_pct, offset_limit_zar,
  ct_rate_zar_per_tco2e, credits_claimed_tco2e, offset_value_zar, net_tax_liability_zar,
  coas_reference, retirement_ref, sars_reference,
  eligibility_basis, submission_basis, review_basis, claim_summary,
  chain_status,
  claim_drafted_at, eligibility_screening_at, credits_earmarked_at,
  claim_submitted_at, sars_review_at,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'coc_002', 'OE-COC-2026-002',
  'carbon.retirement.completed', 'carbon_retirements', 'cret_002', 'W17',
  'demo_carbon_001', 'NXT Carbon Fund (Pty) Ltd',
  'DFFE Carbon Offset Administration System (COAS)', 'SARS Large Business Centre — Johannesburg',
  2025, 'general', 'standard_claim',
  142000000.0, 5.0, 7100000.0,
  250.0, 26000.0, 6500000.0, 135500000.0,
  'COAS-RET-2026-003881', 'CRET-2026-002', 'SARS-CT-2026-0021105',
  'Credits retired under GS serial block GS-SA-SOL-001-050001-076000; DFFE COAS lock confirmed; carbon-tax eligible per DFFE gazetted list.',
  'Carbon tax return ENV001 submitted via eFiling for 2025 tax year; 26,000 tCO2e × R250/tCO2e = R6.5M offset value within 5% cap.',
  'SARS review in progress — eFiling case SARS-CT-2026-0021105 opened; review window 90 calendar days from submission; no query issued as at seed date.',
  'FY2025 carbon offset claim — 26,000 tCO2e; R6.5M offset value; standard_claim tier; under SARS review; estimated net tax saving R6.5M.',
  'sars_review',
  '2026-03-15T09:00:00Z', '2026-03-22T10:00:00Z', '2026-03-29T11:00:00Z',
  '2026-04-05T09:00:00Z', '2026-04-15T08:00:00Z',
  0, '2026-07-15T08:00:00Z',
  'demo_carbon_001', '2026-03-15T09:00:00Z', '2026-04-15T08:00:00Z'
);

-- ── VCM project ────────────────────────────────────────────────────────

INSERT OR IGNORE INTO oe_vcm_projects (
  id, participant_id, project_name, methodology, registry_standard,
  crediting_period_start, crediting_period_end,
  technology, installed_capacity_kw,
  reipppp_bid_ref, nersa_licence_ref, dffe_ea_ref,
  dggef_tco2e_per_mwh,
  sdg_targets, additionality_basis,
  vvb_name, vvb_accreditation_ref, registry_project_id,
  chain_status, actor_id,
  created_at, updated_at
) VALUES (
  'vcm_001', 'demo_carbon_001',
  'Northern Cape Solar PV Grid-Connected Project — VCM Track',
  'gs4gg_re', 'gold_standard',
  '2024-07-01', '2034-06-30',
  'solar_pv', 100000.0,
  'REIPPPP-R5-BID-0041', 'NERSA-GEN-SA-2024-0381', 'DFFE-EA-WC-2022-0417',
  0.918,
  'SDG7,SDG13,SDG8', 'investment_barrier',
  'Bureau Veritas Certification SA', 'BV-ISO14065-SA-0024', 'GS-SA-0081',
  'credits_issued', 'demo_carbon_001',
  '2023-11-15T08:00:00Z', '2026-04-01T09:00:00Z'
);

-- ════════════════════════════════════════════════════════════════════════
-- 2. LENDER — demo_lender_001
-- ════════════════════════════════════════════════════════════════════════

-- ── Credit facility applications ──────────────────────────────────────

INSERT OR IGNORE INTO oe_credit_facility_applications (
  id, application_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  applicant_party_id, applicant_party_name,
  lender_name, sponsor_name,
  facility_tier, facility_name, facility_type, facility_purpose,
  facility_limit_zar_m, tenor_months, margin_bps, pricing_basis,
  project_id, project_name, sector,
  credit_rating, ltv_pct, dscr_base, gearing_pct, pd_pct, lgd_pct, ead_zar_m,
  approved_amount_zar_m, conditions_count, cp_count,
  screening_ref, assessment_ref, committee_ref, approval_ref, agreement_ref,
  cp_ref, activation_ref,
  screening_basis, assessment_basis, approval_basis, cp_basis, activation_basis,
  reason_code, decision_notes,
  chain_status,
  application_received_at, screening_at, credit_assessment_at, committee_review_at,
  approved_at, agreement_issued_at, cp_satisfied_at, facility_available_at,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'cfa_001', 'OE-CFA-2023-001',
  'procurement.award.issued', 'oe_ipp_procurement', 'proc_001', 'W19',
  'demo_ipp_001', 'Goldrush Wind Energy (Pty) Ltd',
  'Nedbank Corporate and Investment Banking', 'NXT Energy Holdings (Pty) Ltd',
  'major', 'Goldrush Wind Phase 1 — Senior Secured Term Loan', 'construction',
  'Construction + operations financing for 140 MW onshore wind facility in Eastern Cape (REIPPPP Round 5)',
  2100.0, 204, 285, 'jibar_plus',
  'proj_wind_001', 'Goldrush Wind Phase 1 (140 MW)', 'wind',
  'BB+', 72.5, 1.38, 74.2, 0.85, 42.0, 2100.0,
  2100.0, 14, 22,
  'SCR-2023-CIB-0041', 'ASSESS-2023-CIB-0041', 'CC-2023-Q3-0009',
  'APPR-2023-CIB-0041', 'AGMT-2023-CIB-0041-FA',
  'CP-2024-CIB-0041', 'ACT-2024-CIB-0041',
  'Basel III credit screening passed; LGD 42% (wind asset; residual value supported by OEM warranty and PPA). PD 0.85% maps to internal grade BB+.',
  'Independent engineer (WSP SA) financial model reviewed; P90 DSCR 1.38x (above 1.30x covenant); gearing 74.2% within approved wind sector policy.',
  'Credit Committee approved 2023-11-14: R2.1B senior secured, 17-year amortising, JIBAR+285bps, 14 CPs including NERSA licence, financial close, and PPA execution.',
  'All 22 conditions precedent satisfied: NERSA generation licence NERSA-GEN-2024-0201 lodged; PPA with Eskom signed 2024-02-15; DFFE EA received.',
  'Facility activated 2024-03-01; SARB large-exposure disclosed under Guidance Note 3/2016 ref SARB-LE-2024-0041; drawn to date R1,260M.',
  'W53_SARB_LARGE_EXPOSURE', 'R2.1B senior secured term loan — 140MW wind; 17-year amortisation; financial close 2024-03-01.',
  'facility_available',
  '2023-08-10T09:00:00Z', '2023-09-05T10:00:00Z', '2023-10-12T09:00:00Z',
  '2023-11-07T10:00:00Z', '2023-11-14T14:00:00Z', '2023-12-10T09:00:00Z',
  '2024-02-20T14:00:00Z', '2024-03-01T08:00:00Z',
  1, '2024-04-01T08:00:00Z',
  'demo_lender_001', '2023-08-10T09:00:00Z', '2024-03-01T08:00:00Z'
);

INSERT OR IGNORE INTO oe_credit_facility_applications (
  id, application_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  applicant_party_id, applicant_party_name,
  lender_name, sponsor_name,
  facility_tier, facility_name, facility_type, facility_purpose,
  facility_limit_zar_m, tenor_months, margin_bps, pricing_basis,
  project_id, project_name, sector,
  credit_rating, ltv_pct, dscr_base, gearing_pct, pd_pct, lgd_pct, ead_zar_m,
  conditions_count, cp_count,
  screening_ref, assessment_ref, committee_ref,
  screening_basis, assessment_basis, committee_basis,
  reason_code,
  chain_status,
  application_received_at, screening_at, credit_assessment_at, committee_review_at,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'cfa_002', 'OE-CFA-2025-002',
  NULL, NULL, NULL, NULL,
  'demo_ipp_001', 'Solara IPP (Pty) Ltd',
  'Standard Bank Corporate & Investment Banking', 'AECOM Capital Partners',
  'large', 'Kalahari Solar Phase 2 — Construction Bridge Facility', 'bridge',
  'Bridge financing pending REIPPPP Round 6 financial close for 75 MW solar PV in Northern Cape',
  850.0, 36, 340, 'prime_linked',
  'proj_solar_002', 'Kalahari Solar Phase 2 (75 MW)', 'solar_pv',
  'B+', 68.0, 1.22, 71.5, 1.40, 45.0, 850.0,
  8, 12,
  'SCR-2025-SB-0018', 'ASSESS-2025-SB-0018', 'CC-2025-Q2-0003',
  'Basel III credit screening in progress; NCA affordability assessment initiated; environmental clearance status pending DFFE confirmation.',
  'WSP independent financial model under review; preliminary P90 DSCR 1.22x — at covenant floor; stress testing underway at P50+20% curtailment scenario.',
  'Credit Committee review scheduled 2026-07-10; conditional approval subject to DFFE EA and NERSA licence confirmation; refer-back risk if DSCR < 1.20x.',
  'W53_COMMITTEE_REVIEW',
  'committee_review',
  '2025-12-01T09:00:00Z', '2026-01-15T10:00:00Z', '2026-03-08T09:00:00Z',
  '2026-06-09T10:00:00Z',
  0, '2026-08-09T10:00:00Z',
  'demo_lender_001', '2025-12-01T09:00:00Z', '2026-06-09T10:00:00Z'
);

-- ── DSCR monitoring records ────────────────────────────────────────────

INSERT OR IGNORE INTO oe_dscr_monitoring (
  id, monitoring_number,
  facility_id, facility_name, project_id, project_name,
  borrower_id, borrower_name, lender_agent_id, lender_agent_name,
  test_period_label, test_period_start, test_period_end, test_date,
  pass_threshold, lockup_threshold, default_floor, equity_cure_cap_multiple,
  current_dscr, forward_dscr_p12m, backward_dscr_12m, llcr_value, plcr_value,
  cfads_period_zar, debt_service_period_zar, shortfall_zar,
  outstanding_debt_zar, npv_loan_life_zar, npv_project_life_zar,
  equity_cure_available_zar, dsra_balance_zar,
  dscr_tier, is_systemic_carrier, annual_trend,
  watch_flag, breach_flag, lock_up_flag,
  monitoring_summary, reason_code,
  chain_status,
  period_open_at, data_collected_at, computed_at, certified_clean_at,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES
-- Q4-2024: healthy, certified clean
('dscr_001', 'OE-DSCR-2024-Q4-001',
 'cfa_001', 'Goldrush Wind Phase 1 — Senior Secured Term Loan',
 'proj_wind_001', 'Goldrush Wind Phase 1 (140 MW)',
 'demo_ipp_001', 'Goldrush Wind Energy (Pty) Ltd',
 'demo_lender_001', 'Nedbank CIB — Project Finance',
 'Q4-2024', '2024-10-01', '2024-12-31', '2025-01-15',
 1.30, 1.20, 1.00, 1.0,
 2.12, 2.08, 2.15, 2.31, 2.44,
 178500000.0, 84200000.0, 0.0,
 1890000000.0, 2140000000.0, 2680000000.0,
 210000000.0, 55000000.0,
 'minor', 0, 0.02,
 0, 0, 0,
 'Q4-2024 DSCR 2.12x — well above 1.30x pass threshold. Wind generation 98.4% of P90 expectation; CFADS R178.5M; debt service R84.2M. Clean certificate issued.',
 'DSCR_CLEAN',
 'certified_clean',
 '2024-10-01T08:00:00Z', '2025-01-10T10:00:00Z', '2025-01-12T14:00:00Z', '2025-01-15T11:00:00Z',
 0, '2025-02-15T11:00:00Z',
 'demo_lender_001', '2024-10-01T08:00:00Z', '2025-01-15T11:00:00Z'),

-- Q1-2025: borderline watch zone
('dscr_002', 'OE-DSCR-2025-Q1-002',
 'cfa_001', 'Goldrush Wind Phase 1 — Senior Secured Term Loan',
 'proj_wind_001', 'Goldrush Wind Phase 1 (140 MW)',
 'demo_ipp_001', 'Goldrush Wind Energy (Pty) Ltd',
 'demo_lender_001', 'Nedbank CIB — Project Finance',
 'Q1-2025', '2025-01-01', '2025-03-31', '2025-04-15',
 1.30, 1.20, 1.00, 1.0,
 1.81, 1.75, 1.96, 2.02, 2.18,
 152400000.0, 84200000.0, 0.0,
 1806000000.0, 2050000000.0, 2570000000.0,
 210000000.0, 55000000.0,
 'standard', 0, -0.05,
 1, 0, 0,
 'Q1-2025 DSCR 1.81x — above pass threshold but in watch zone (< 2.00x internal early-warning). Wind availability 91.2% vs P90 due to low-wind event March 2025. DSRA intact.',
 'DSCR_WATCH',
 'watch',
 '2025-01-01T08:00:00Z', '2025-04-10T10:00:00Z', '2025-04-12T14:00:00Z', NULL,
 0, '2025-05-15T11:00:00Z',
 'demo_lender_001', '2025-01-01T08:00:00Z', '2025-04-15T11:00:00Z'),

-- Q2-2025: further deterioration — breach_recorded
('dscr_003', 'OE-DSCR-2025-Q2-003',
 'cfa_001', 'Goldrush Wind Phase 1 — Senior Secured Term Loan',
 'proj_wind_001', 'Goldrush Wind Phase 1 (140 MW)',
 'demo_ipp_001', 'Goldrush Wind Energy (Pty) Ltd',
 'demo_lender_001', 'Nedbank CIB — Project Finance',
 'Q2-2025', '2025-04-01', '2025-06-30', '2025-07-15',
 1.30, 1.20, 1.00, 1.0,
 1.62, 1.59, 1.72, 1.88, 2.01,
 136500000.0, 84200000.0, 0.0,
 1722000000.0, 1958000000.0, 2455000000.0,
 210000000.0, 55000000.0,
 'standard', 0, -0.09,
 1, 1, 0,
 'Q2-2025 DSCR 1.62x — above lockup threshold 1.20x but below internal watch ceiling 2.00x. Continued low-wind pattern; CFADS R136.5M vs budget R158M. Cure plan proposed by sponsor.',
 'DSCR_BREACH_BELOW_WATCH',
 'breach_recorded',
 '2025-04-01T08:00:00Z', '2025-07-10T10:00:00Z', '2025-07-12T14:00:00Z', NULL,
 0, '2025-08-15T11:00:00Z',
 'demo_lender_001', '2025-04-01T08:00:00Z', '2025-07-15T11:00:00Z');

-- ── Lender watchlist ───────────────────────────────────────────────────

INSERT OR IGNORE INTO oe_lender_watchlist (
  id, facility_id, participant_id,
  watchlist_tier, trigger_signal, trigger_value,
  action_plan,
  added_at, reviewed_at, next_review_at,
  added_by
) VALUES (
  'wl_001', 'cfa_001', 'demo_ipp_001',
  2, 'dscr_warning', 1.62,
  'Borrower to submit Q2-2025 cure plan within 30 days; IE (WSP SA) to review wind resource study; sponsor equity cure option R210M available; re-test Q3-2025.',
  '2025-07-16T09:00:00Z', '2025-08-12T10:00:00Z', '2025-10-16T09:00:00Z',
  'demo_lender_001'
);

-- ── Covenant certificates ──────────────────────────────────────────────

INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  borrower_party_id, borrower_party_name,
  facility_agent_name, lender_name,
  facility_name, facility_tier, facility_limit, outstanding_principal,
  test_period, test_period_end,
  dscr_actual, dscr_threshold, llcr_actual, llcr_threshold,
  gearing_actual, gearing_threshold,
  certificate_ref, review_ref,
  submission_basis, review_basis,
  chain_status,
  certificate_due_at, certificate_submitted_at, under_review_at,
  ratios_verified_at, compliant_at,
  sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'covcert_001', 'OE-COVCERT-2024-Q4-001',
  'covenant.test.period_close', 'oe_drawdown_chain', 'dd_001', 'W21',
  'demo_ipp_001', 'Goldrush Wind Energy (Pty) Ltd',
  'Nedbank CIB — Agency', 'Nedbank Corporate and Investment Banking',
  'Goldrush Wind Phase 1 — Senior Secured Term Loan', 'senior_secured',
  2100000000.0, 1890000000.0,
  'Q4-2024', '2024-12-31',
  2.12, 1.30, 2.31, 1.20,
  0.742, 0.80,
  'COVCERT-GW1-2024Q4', 'REV-CIB-2025-Q4-001',
  'Q4-2024 compliance certificate submitted by CFO Goldrush Wind; DSCR 2.12x, LLCR 2.31x, gearing 74.2% — all within facility agreement thresholds.',
  'Nedbank CIB Agency confirmed all financial covenants tested; no breach; clean covenant certificate issued 2025-01-20.',
  'compliant',
  '2025-01-10T09:00:00Z', '2025-01-14T10:00:00Z', '2025-01-16T09:00:00Z',
  '2025-01-18T14:00:00Z', '2025-01-20T11:00:00Z',
  '2025-02-10T09:00:00Z',
  'demo_lender_001', '2025-01-10T09:00:00Z', '2025-01-20T11:00:00Z'
);

INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  borrower_party_id, borrower_party_name,
  facility_agent_name, lender_name,
  facility_name, facility_tier, facility_limit, outstanding_principal,
  test_period, test_period_end,
  dscr_actual, dscr_threshold,
  certificate_ref,
  submission_basis,
  chain_status,
  certificate_due_at,
  sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'covcert_002', 'OE-COVCERT-2025-Q2-002',
  'covenant.test.period_close', 'oe_drawdown_chain', 'dd_001', 'W21',
  'demo_ipp_001', 'Goldrush Wind Energy (Pty) Ltd',
  'Nedbank CIB — Agency', 'Nedbank Corporate and Investment Banking',
  'Goldrush Wind Phase 1 — Senior Secured Term Loan', 'senior_secured',
  2100000000.0, 1722000000.0,
  'Q2-2025', '2025-06-30',
  1.62, 1.30,
  'COVCERT-GW1-2025Q2',
  'Q2-2025 compliance certificate due 2025-07-10; DSCR preliminarily 1.62x; borrower preparing certificate for submission; DSCR breach flag raised on watchlist.',
  'certificate_due',
  '2025-07-10T09:00:00Z',
  '2025-07-25T09:00:00Z',
  'demo_lender_001', '2025-07-01T09:00:00Z', '2025-07-15T09:00:00Z'
);

-- ── Drawdown chain ─────────────────────────────────────────────────────

INSERT OR IGNORE INTO oe_drawdown_chain (
  id, drawdown_number,
  facility_id, project_id, participant_id, lender_id,
  project_name, facility_name,
  tranche_label, amount_zar, tranche_tier,
  chain_status,
  requested_at, documents_at, ie_review_at, cp_started_at,
  approved_at, funded_at, closed_at,
  ie_certifier, ie_cert_doc_ref, cp_evidence_ref, sarb_disclosure_ref,
  funding_account_ref, drawdown_notes,
  sla_deadline_at,
  created_by, created_at, updated_at
) VALUES
('dd_001', 'OE-DD-2024-001',
 'cfa_001', 'proj_wind_001', 'demo_ipp_001', 'demo_lender_001',
 'Goldrush Wind Phase 1 (140 MW)', 'Goldrush Wind Phase 1 — Senior Secured Term Loan',
 'tranche_1', 630000000.0, 'senior',
 'closed',
 '2024-03-01T09:00:00Z', '2024-03-10T10:00:00Z', '2024-03-18T14:00:00Z',
 '2024-03-20T09:00:00Z', '2024-03-28T11:00:00Z', '2024-04-02T08:00:00Z', '2024-04-05T10:00:00Z',
 'WSP South Africa (Pty) Ltd', 'WSP-IE-2024-GW1-001', 'CP-BUNDLE-2024-001',
 'SARB-LE-2024-0041',
 'TREA-NED-WIRE-2024-040201', 'Tranche 1 — R630M construction drawdown; civil works commencement milestone achieved; financial close completed.',
 '2024-05-02T08:00:00Z',
 'demo_lender_001', '2024-03-01T09:00:00Z', '2024-04-05T10:00:00Z'),

('dd_002', 'OE-DD-2024-002',
 'cfa_001', 'proj_wind_001', 'demo_ipp_001', 'demo_lender_001',
 'Goldrush Wind Phase 1 (140 MW)', 'Goldrush Wind Phase 1 — Senior Secured Term Loan',
 'tranche_2', 630000000.0, 'senior',
 'ie_review',
 '2025-09-01T09:00:00Z', '2025-09-10T10:00:00Z', '2025-09-20T14:00:00Z',
 NULL, NULL, NULL, NULL,
 'WSP South Africa (Pty) Ltd', 'WSP-IE-2025-GW1-002', NULL, NULL,
 NULL, 'Tranche 2 — R630M milestone drawdown; turbine installation 60% complete; IE site visit underway.',
 '2025-11-01T09:00:00Z',
 'demo_lender_001', '2025-09-01T09:00:00Z', '2025-09-20T14:00:00Z');

-- ════════════════════════════════════════════════════════════════════════
-- 3. GRID — demo_grid_001
-- ════════════════════════════════════════════════════════════════════════

-- ── Wheeling agreement (prerequisite for charges) ──────────────────────

INSERT OR IGNORE INTO oe_wheeling_agreements (
  id, generator_id, offtaker_id,
  injection_point, withdrawal_point,
  contracted_mw, loss_factor_pct, wheeling_tariff_zar_per_mwh,
  status, approved_by, approved_at, effective_from, effective_to,
  notes, created_at
) VALUES (
  'wagmt_001', 'demo_ipp_001', 'demo_offtaker_001',
  'Loeriesfontein 400 kV substation', 'Cape Town Bellville 132 kV substation',
  100.0, 2.80, 185.60,
  'active', 'demo_grid_001', '2024-03-15T10:00:00Z',
  '2024-04-01', '2034-03-31',
  'REIPPPP R5 wheeling agreement; NTCSA approved 2024-03-15; NERSA Grid Code §E3 tariff schedule 2024/25.',
  '2024-02-10T09:00:00Z'
);

-- ── Wheeling charges (4 months) ────────────────────────────────────────

INSERT OR IGNORE INTO oe_grid_wheeling_charges (
  id, agreement_id, period_month, issued_by, issued_at,
  transmission_mwh, tariff_zar_per_mwh, loss_factor_pct,
  loss_mwh, gross_zar, loss_zar, ancillaries_zar, total_zar,
  status, dispute_deadline_at, paid_at, paid_by, paid_amount_zar,
  notes, created_at, updated_at
) VALUES
('wchg_001', 'wagmt_001', '2026-02', 'demo_grid_001', '2026-03-05T08:00:00Z',
 68420.0, 185.60, 2.80,
 1915.8, 12700659.2, 355602.0, 84000.0, 13140261.2,
 'paid', '2026-03-19T08:00:00Z',
 '2026-03-15T09:00:00Z', 'demo_offtaker_001', 13140261.2,
 'February 2026 wheeling invoice; 68,420 MWh delivered; paid within 10-day payment window.',
 '2026-03-05T08:00:00Z', '2026-03-15T09:00:00Z'),

('wchg_002', 'wagmt_001', '2026-03', 'demo_grid_001', '2026-04-05T08:00:00Z',
 71150.0, 185.60, 2.80,
 1992.2, 13205640.0, 369848.3, 84000.0, 13659488.3,
 'paid', '2026-04-19T08:00:00Z',
 '2026-04-14T10:00:00Z', 'demo_offtaker_001', 13659488.3,
 'March 2026 wheeling invoice; 71,150 MWh; peak summer generation; paid on time.',
 '2026-04-05T08:00:00Z', '2026-04-14T10:00:00Z'),

('wchg_003', 'wagmt_001', '2026-04', 'demo_grid_001', '2026-05-05T08:00:00Z',
 64800.0, 185.60, 2.80,
 1814.4, 12026880.0, 336673.0, 84000.0, 12447553.0,
 'disputed', '2026-05-19T08:00:00Z',
 NULL, NULL, NULL,
 'April 2026 wheeling invoice; 64,800 MWh; offtaker disputes ancillaries charge (reactive power component); dispute raised 2026-05-08.',
 '2026-05-05T08:00:00Z', '2026-05-08T12:00:00Z'),

('wchg_004', 'wagmt_001', '2026-05', 'demo_grid_001', '2026-06-05T08:00:00Z',
 66940.0, 185.60, 2.80,
 1874.3, 12424064.0, 347711.7, 84000.0, 12855775.7,
 'open', '2026-06-19T08:00:00Z',
 NULL, NULL, NULL,
 'May 2026 wheeling invoice; 66,940 MWh; payment due 2026-06-19.',
 '2026-06-05T08:00:00Z', '2026-06-05T08:00:00Z');

-- ── Wheeling dispute ───────────────────────────────────────────────────

INSERT OR IGNORE INTO oe_grid_wheeling_disputes (
  id, charge_id, agreement_id,
  raised_by, raised_at,
  dispute_reason, claimed_amount_zar,
  status, created_at
) VALUES (
  'wdisp_001', 'wchg_003', 'wagmt_001',
  'demo_offtaker_001', '2026-05-08T12:00:00Z',
  'Disputed reactive-power ancillaries component of R84,000 — offtaker asserts power factor maintained above 0.95 lagging per Grid Code §E3.4.2; requests meter data substantiation from NTCSA.',
  12363553.0,
  'open', '2026-05-08T12:00:00Z'
);

-- ── Dispatch runs & offers ─────────────────────────────────────────────

INSERT OR IGNORE INTO oe_dispatch_runs (
  id, trade_date, interval_start,
  status, total_demand_mw, total_supply_mw, marginal_price_zar,
  active_constraints, optimization_seconds,
  created_by, created_at
) VALUES
('drun_001', '2026-06-09', '2026-06-09T06:00:00Z',
 'published', 28400.0, 29100.0, 1284.50,
 '["EHV-CGT-thermal-01","NW-Loadcentre-xfmr-02"]', 1.82,
 'demo_grid_001', '2026-06-09T06:00:00Z'),

('drun_002', '2026-06-09', '2026-06-09T08:00:00Z',
 'published', 31200.0, 31850.0, 1398.00,
 '["EHV-CGT-thermal-01"]', 1.65,
 'demo_grid_001', '2026-06-09T08:00:00Z'),

('drun_003', '2026-06-09', '2026-06-09T10:00:00Z',
 'published', 32500.0, 33100.0, 1452.75,
 '[]', 1.43,
 'demo_grid_001', '2026-06-09T10:00:00Z');

INSERT OR IGNORE INTO oe_dispatch_offers (
  id, run_id, participant_id, asset_id,
  offer_mw, offer_price_zar_mwh,
  awarded_mw, awarded_price_zar_mwh,
  status, submitted_at
) VALUES
('doffer_001', 'drun_001', 'demo_ipp_001', NULL,
 95.0, 1180.0, 95.0, 1284.50,
 'fully_cleared', '2026-06-09T05:45:00Z'),

('doffer_002', 'drun_002', 'demo_ipp_001', NULL,
 100.0, 1180.0, 100.0, 1398.00,
 'fully_cleared', '2026-06-09T07:45:00Z'),

('doffer_003', 'drun_003', 'demo_ipp_001', NULL,
 100.0, 1180.0, 85.0, 1452.75,
 'partially_cleared', '2026-06-09T09:45:00Z');

-- ── Ancillary contracts & dispatch ────────────────────────────────────

INSERT OR IGNORE INTO oe_ancillary_contracts (
  id, participant_id, service_type, capacity_mw,
  availability_zar_per_mw_per_h, utilisation_zar_per_mwh,
  start_at, end_at, status, performance_score, created_at
) VALUES
('ancont_001', 'demo_ipp_001', 'frr_a', 15.0,
 4200.0, 1850.0,
 '2024-04-01T00:00:00Z', '2026-03-31T23:59:59Z',
 'active', 0.974, '2024-03-15T09:00:00Z'),

('ancont_002', 'demo_ipp_001', 'reserve_30min', 25.0,
 2800.0, 1420.0,
 '2024-04-01T00:00:00Z', '2026-03-31T23:59:59Z',
 'active', 0.961, '2024-03-15T09:00:00Z');

INSERT OR IGNORE INTO oe_ancillary_dispatch (
  id, contract_id, event_type,
  triggered_at, response_time_seconds,
  delivered_mw, contracted_mw, performance_pct,
  payment_zar, penalty_zar, closed_at, notes
) VALUES
('andisp_001', 'ancont_001', 'activation',
 '2026-05-14T14:22:00Z', 28.4,
 14.8, 15.0, 0.987,
 42350.0, 0.0, '2026-05-14T15:30:00Z',
 'FRR-A activation event 2026-05-14 14:22; under-frequency 49.82 Hz; Goldrush Wind AGC responded in 28.4s; delivered 14.8 MW vs 15.0 MW contracted.'),

('andisp_002', 'ancont_002', 'test',
 '2026-04-22T10:00:00Z', NULL,
 24.6, 25.0, 0.984,
 35000.0, 0.0, '2026-04-22T11:30:00Z',
 'Quarterly reserve test; 30-minute reserve dispatched; 24.6 MW delivered out of 25.0 MW contracted; performance 98.4%; no penalty.');

-- ════════════════════════════════════════════════════════════════════════
-- 4. REGULATOR — demo_regulator_001
-- ════════════════════════════════════════════════════════════════════════

-- ── Regulator inbox (5 items, different chain sources) ─────────────────

INSERT OR IGNORE INTO oe_regulator_inbox (
  id, source_event, source_entity_type, source_entity_id,
  severity, title, body_json,
  ack_status, assigned_to, ack_by, ack_at, ack_note,
  sla_due_at, created_at, updated_at
) VALUES
('rinbox_001',
 'licence_renewal.chain.submitted', 'oe_licence_renewals', 'lren_001',
 'medium',
 'NERSA Licence Renewal — Goldrush Wind Phase 1 (NERSA-GEN-2024-0201)',
 '{"licence_class":"generation","licensee":"Goldrush Wind Energy (Pty) Ltd","capacity_mw":140,"expiry":"2026-03-31","wave":"W33"}',
 'acknowledged', 'demo_regulator_001', 'demo_regulator_001',
 '2026-04-05T09:00:00Z', 'Renewal application routed to licensing officer; completeness review initiated.',
 '2026-05-15T09:00:00Z', '2026-04-01T09:00:00Z', '2026-04-05T09:00:00Z'),

('rinbox_002',
 'compliance_inspection.directive_issued', 'oe_compliance_inspections', 'cinsp_001',
 'high',
 'Compliance Directive Issued — Solara IPP Grid Code Technical Non-conformance',
 '{"licensee":"Solara IPP (Pty) Ltd","contravention_tier":"serious","directive_ref":"DIR-NERSA-2026-0041","licence_condition":"ERA s10(g)"}',
 'acknowledged', 'demo_regulator_001', 'demo_regulator_001',
 '2026-04-18T14:00:00Z', 'Directive acknowledged; remediation timeline 60 days per ERA §35.',
 '2026-04-20T09:00:00Z', '2026-04-12T14:00:00Z', '2026-04-18T14:00:00Z'),

('rinbox_003',
 'levy_assessment.enforcement', 'oe_regulator_levies', 'levy_001',
 'high',
 'NERSA Levy Enforcement Notice — Kalahari Solar Phase 1 Arrears',
 '{"licensee":"Kalahari Solar (Pty) Ltd","amount_zar":4280000,"arrears_band":"60_days","levy_ref":"LEV-NERSA-2025-0128","wave":"W74"}',
 'pending', 'demo_regulator_001', NULL, NULL, NULL,
 '2026-06-16T09:00:00Z', '2026-06-09T09:00:00Z', '2026-06-09T09:00:00Z'),

('rinbox_004',
 'licence_application.licence_granted', 'oe_licence_applications', 'lapp_001',
 'medium',
 'New Generation Licence Granted — Namaqualand BESS 80 MW',
 '{"applicant":"SunStore Energy (Pty) Ltd","technology":"battery","capacity_mw":80,"licence_class":"major_licence","gazette_ref":"GG-2026-0412"}',
 'acknowledged', 'demo_regulator_001', 'demo_regulator_001',
 '2026-05-12T10:00:00Z', 'Licence issued and gazetted; register updated; licence holder notified.',
 '2026-06-10T09:00:00Z', '2026-05-08T14:00:00Z', '2026-05-12T10:00:00Z'),

('rinbox_005',
 'trade_reporting.stor_filed', 'oe_market_abuse_cases', 'mab_001',
 'critical',
 'STOR Filed — Suspected Market Manipulation Trading Session 2026-05-28',
 '{"subject_entity":"anonymous_trader","market_segment":"spot_energy","basis":"layering_pattern","fsca_ref":"STOR-FSCA-2026-0091","wave":"W52"}',
 'escalated', 'demo_regulator_001', NULL, NULL, NULL,
 '2026-06-01T09:00:00Z', '2026-05-29T08:00:00Z', '2026-05-30T09:00:00Z');

-- ── Licence applications ───────────────────────────────────────────────

INSERT OR IGNORE INTO oe_licence_applications (
  id, application_number,
  applicant_party_id, applicant_party_name,
  regulator_party_id, regulator_party_name,
  licence_class, licence_type, technology,
  facility_name, facility_location, capacity_mw, estimated_capex_zar_m,
  application_ref, completeness_ref, acceptance_ref,
  participation_ref, evaluation_ref, council_ref,
  licence_ref, gazette_ref,
  application_basis, completeness_basis, acceptance_basis,
  evaluation_basis, grant_basis, rod_notes,
  chain_status,
  application_received_at, completeness_review_at, accepted_at,
  public_participation_at, technical_evaluation_at, council_decision_at,
  licence_granted_at, licence_issued_at,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'lapp_001', 'OE-LAPP-2025-001',
  'demo_ipp_001', 'SunStore Energy (Pty) Ltd',
  'demo_regulator_001', 'NERSA — Electricity Licensing Division',
  'major_licence', 'generation', 'battery',
  'Namaqualand BESS 80 MW / 320 MWh', 'Northern Cape, Namaqualand',
  80.0, 1680.0,
  'LAPP-2025-001', 'COMP-2025-001', 'ACC-2025-001',
  'PART-2025-001', 'EVAL-2025-001', 'CC-2026-001',
  'NERSA-GEN-BESS-2026-0412', 'GG-2026-0412',
  'Application for generation licence for 80 MW / 320 MWh BESS at Namaqualand; ERA §8 prescribed form submitted; accompanied by EIA certificate DFFE-EA-NC-2024-0388.',
  'Completeness review confirmed: 12/12 mandatory documents received; prescribed form compliant; fees paid per Schedule A.',
  'Application accepted as complete; public participation notice published in Government Gazette 14 January 2026.',
  '30-day comment period closed 14 February 2026; 3 submissions received (2 supportive, 1 conditional); technical evaluation initiated.',
  'WSP SA independent technical review: BESS technology meets Grid Code stability requirements; no grid-impact issue; NRS 097-2-1 compliant.',
  'Council decision 2026-05-07: GRANT. BESS critical for grid stability and Namaqualand REZ capacity absorption. Licence gazetted GG-2026-0412.',
  'licence_issued',
  '2025-11-15T09:00:00Z', '2025-12-10T10:00:00Z', '2026-01-08T09:00:00Z',
  '2026-01-14T00:00:00Z', '2026-02-20T09:00:00Z', '2026-05-07T14:00:00Z',
  '2026-05-08T09:00:00Z', '2026-05-10T08:00:00Z',
  1, '2026-06-10T09:00:00Z',
  'demo_regulator_001', '2025-11-15T09:00:00Z', '2026-05-10T08:00:00Z'
);

INSERT OR IGNORE INTO oe_licence_applications (
  id, application_number,
  applicant_party_id, applicant_party_name,
  regulator_party_id, regulator_party_name,
  licence_class, licence_type, technology,
  facility_name, facility_location, capacity_mw, estimated_capex_zar_m,
  application_ref, completeness_ref,
  application_basis, completeness_basis, info_request_basis,
  chain_status,
  application_received_at, completeness_review_at, additional_info_requested_at,
  info_request_round,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'lapp_002', 'OE-LAPP-2026-002',
  'demo_offtaker_001', 'Greenfields Trading (Pty) Ltd',
  'demo_regulator_001', 'NERSA — Electricity Licensing Division',
  'standard_licence', 'trading', 'na',
  'Greenfields Electricity Trading Desk', 'Gauteng, Sandton',
  NULL, NULL,
  'LAPP-2026-002', 'COMP-2026-002',
  'Application for electricity trading licence under ERA §8; wholesale electricity trading for C&I off-takers; FSCA market conduct compliance certificate attached.',
  'Completeness review in progress: 9/12 mandatory documents received; awaiting FICA/FIC compliance certificate and board resolution.',
  'Additional information request issued 2026-05-28: FICA compliance certificate, board resolution authorising trading activities, and 3-year audited financials required within 30 days.',
  'additional_info_requested',
  '2026-04-20T09:00:00Z', '2026-05-15T10:00:00Z', '2026-05-28T09:00:00Z',
  1,
  0, '2026-07-28T09:00:00Z',
  'demo_regulator_001', '2026-04-20T09:00:00Z', '2026-05-28T09:00:00Z'
);

-- ── Compliance inspections ─────────────────────────────────────────────

INSERT OR IGNORE INTO oe_compliance_inspections (
  id, inspection_number,
  officer_party_id, officer_party_name,
  respondent_party_id, respondent_party_name,
  licence_ref, facility_name, inspection_trigger, contravention_tier,
  licence_condition_ref,
  penalty_amount_zar, remediation_cost_zar,
  findings_ref, directive_ref,
  inspection_basis, findings_basis, directive_basis, remediation_basis,
  reason_code, rod_notes,
  chain_status,
  inspection_scheduled_at, inspection_in_progress_at, findings_drafted_at,
  findings_issued_at, directive_issued_at, remediation_underway_at,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'cinsp_001', 'OE-CINSP-2026-001',
  'demo_regulator_001', 'NERSA — Compliance and Monitoring Division',
  'demo_ipp_001', 'Solara IPP (Pty) Ltd',
  'NERSA-GEN-SA-2023-0172', 'Kalahari Solar Phase 1 (75 MW)',
  'thematic', 'serious',
  'ERA §10(g) — grid code technical compliance (voltage and frequency response)',
  500000.0, 1200000.0,
  'FIND-NERSA-2026-CINSP-001', 'DIR-NERSA-2026-0041',
  'NERSA thematic compliance inspection — grid code technical compliance campaign Q1-2026; Kalahari Solar Phase 1 included based on grid disturbance events logged Q4-2025.',
  'Findings: (1) Voltage ride-through capability below Grid Code §E5.3 minimum at three test conditions; (2) reactive power delivery deficient during under-voltage event 2025-12-14. Contravention serious.',
  'Compliance directive DIR-NERSA-2026-0041 issued: 60-day remediation window; Solara to engage OEM for inverter firmware upgrade to v4.2.1 and submit test report.',
  'Solara confirmed firmware upgrade scheduling with Huawei SA; NRS 048-2 test planned for 2026-06-30; remediation on track.',
  'W40_SERIOUS_CONTRAVENTION', 'ERA §35(3) compliance directive; financial penalty R500,000 deferred subject to satisfactory remediation by 2026-06-12.',
  'remediation_underway',
  '2026-02-10T09:00:00Z', '2026-03-04T09:00:00Z', '2026-03-25T14:00:00Z',
  '2026-04-01T09:00:00Z', '2026-04-12T10:00:00Z', '2026-04-20T09:00:00Z',
  1, '2026-06-12T09:00:00Z',
  'demo_regulator_001', '2026-02-10T09:00:00Z', '2026-04-20T09:00:00Z'
);

INSERT OR IGNORE INTO oe_compliance_inspections (
  id, inspection_number,
  officer_party_id, officer_party_name,
  respondent_party_id, respondent_party_name,
  licence_ref, facility_name, inspection_trigger, contravention_tier,
  inspection_basis,
  reason_code,
  chain_status,
  inspection_scheduled_at,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'cinsp_002', 'OE-CINSP-2026-002',
  'demo_regulator_001', 'NERSA — Compliance and Monitoring Division',
  'demo_ipp_001', 'Goldrush Wind Energy (Pty) Ltd',
  'NERSA-GEN-2024-0201', 'Goldrush Wind Phase 1 (140 MW)',
  'routine', 'minor',
  'Routine annual licence compliance inspection scheduled per NERSA Compliance Monitoring Programme 2026; covers licence conditions, metering accuracy, and REIPPPP ED commitment reporting.',
  'W40_ROUTINE',
  'inspection_scheduled',
  '2026-07-15T09:00:00Z',
  0, '2026-08-15T09:00:00Z',
  'demo_regulator_001', '2026-06-01T09:00:00Z', '2026-06-01T09:00:00Z'
);

-- ── Tariff determination ───────────────────────────────────────────────

INSERT OR IGNORE INTO oe_tariff_determinations (
  id, determination_number,
  applicant_party_id, applicant_party_name,
  regulator_party_id, regulator_party_name,
  licence_ref, tariff_entity, tariff_segment,
  determination_class, mypd_period, price_year,
  requested_revenue_zar_m, allowed_revenue_zar_m, rab_zar_m,
  wacc_pre_tax, opex_zar_m, rca_balance_zar_m,
  requested_tariff_zar_kwh, allowed_tariff_zar_kwh, tariff_increase_pct, x_factor,
  application_ref, completeness_ref, consultation_ref,
  analysis_ref, draft_ref, determination_ref, gazette_ref,
  application_basis, consultation_basis, analysis_basis, determination_basis,
  reason_code, rod_notes,
  chain_status,
  application_received_at, completeness_review_at, public_consultation_at,
  revenue_analysis_at, draft_determination_at, council_deliberation_at,
  determination_issued_at, implemented_at,
  is_reportable, sla_deadline_at,
  created_by, created_at, updated_at
) VALUES (
  'tdet_001', 'OE-MYPD5-2025-001',
  'demo_admin_001', 'Eskom Holdings SOC Ltd',
  'demo_regulator_001', 'NERSA — Electricity Pricing Division',
  'NERSA-TRAN-001', 'Eskom Transmission — National Transmission Company SA (NTCSA)',
  'transmission',
  'multi_year', 'MYPD5 2025-2030', '2026/27',
  185400.0, 168200.0, 1240000.0,
  0.0875, 42800.0, 12400.0,
  2.84, 2.58, 9.1, 0.008,
  'MYPD5-APPL-2024-001', 'COMP-MYPD5-001', 'CONSULT-MYPD5-001',
  'ANA-MYPD5-001', 'DRAFT-MYPD5-001', 'DET-NERSA-MYPD5-2025', 'GG-48-2025-0081',
  'Eskom application for MYPD5 multi-year price determination 2025-2030; requested average tariff R2.84/kWh; RAB R1.24T; WACC pre-tax 8.75%; opex R42.8B.',
  '90-day public consultation concluded; 1,847 submissions received from industry, municipalities and consumer bodies; Eskom technical rebuttal submitted.',
  'NERSA revenue analysis confirmed RAB at R1.24T; allowed WACC 8.75%; disallowed R17.2B in capex overruns; RCA true-up debit R12.4B; allowed revenue R168.2B.',
  'Council determination: allowed revenue R168.2B for 2026/27; average tariff R2.58/kWh; headline increase 9.1%; X-factor efficiency 0.8%pa; implemented 1 April 2026.',
  'W43_MULTI_YEAR_DETERMINATION', 'MYPD5 Year 2 determination: R168.2B allowed revenue; 9.1% tariff increase; gazetted GG-48-2025-0081; effective 2026-04-01.',
  'implemented',
  '2024-07-01T09:00:00Z', '2024-08-15T10:00:00Z', '2024-09-01T00:00:00Z',
  '2024-12-01T09:00:00Z', '2025-02-28T14:00:00Z', '2025-04-15T09:00:00Z',
  '2025-06-01T14:00:00Z', '2026-04-01T00:00:00Z',
  1, '2025-07-01T14:00:00Z',
  'demo_regulator_001', '2024-07-01T09:00:00Z', '2026-04-01T00:00:00Z'
);

-- ── NERSA quarterly reports ────────────────────────────────────────────

INSERT OR IGNORE INTO oe_nersa_reports (
  id, year, quarter, status,
  summary_json, generated_at, submitted_at, generated_by
) VALUES
('nrep_001', 2025, 4, 'accepted',
 '{"total_licences_active":1284,"licence_renewals_processed":47,"compliance_inspections_completed":38,"enforcement_actions":3,"revenue_collected_zar":12800000,"levies_assessed_zar":284000000}',
 '2026-01-10T09:00:00Z', '2026-01-15T10:00:00Z', 'demo_regulator_001'),

('nrep_002', 2026, 1, 'submitted',
 '{"total_licences_active":1291,"licence_renewals_processed":31,"compliance_inspections_completed":24,"enforcement_actions":2,"revenue_collected_zar":9400000,"levies_assessed_zar":261000000}',
 '2026-04-08T09:00:00Z', '2026-04-12T10:00:00Z', 'demo_regulator_001'),

('nrep_003', 2026, 2, 'draft',
 '{"total_licences_active":1293,"licence_renewals_processed":18,"compliance_inspections_completed":14,"enforcement_actions":1,"revenue_collected_zar":5200000,"levies_assessed_zar":148000000}',
 '2026-06-09T09:00:00Z', NULL, 'demo_regulator_001');
