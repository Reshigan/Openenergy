-- Wave 43 — Regulator Tariff / Revenue (MYPD Price-Control) Determination seed.
-- 10 prod-realistic NERSA price-control determinations across 10 of 12 states
-- (omits standalone draft_determination + council_deliberation — both traversed
-- inside the tdet_009 implemented flagship) + all 3 classes + every branch.
-- Anchored on real SA economic regulation: Eskom MYPD revenue applications
-- (generation / transmission / distribution), municipal distributor annual
-- tariff increases, and SSEG feed-in schedules. actor_party records the
-- regulatory function per step (applicant / registry / analyst / council / court).
-- Revenue figures in R-millions; tariffs in R/kWh.

-- 1) application_received — multi_year, Eskom MYPD6 revenue application just filed
INSERT OR IGNORE INTO oe_tariff_determinations (
  id, determination_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_ref, tariff_entity, tariff_segment, determination_class, mypd_period, price_year,
  requested_revenue_zar_m, rab_zar_m, wacc_pre_tax, opex_zar_m, rca_balance_zar_m, requested_tariff_zar_kwh,
  application_ref, application_basis,
  chain_status, application_received_at, sla_deadline_at, created_by
) VALUES (
  'tdet_001', 'TDET-MYPD-2026-0001',
  'lic_eskom', 'Eskom Holdings SOC Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'NERSA/LIC/GEN/ESKOM', 'Eskom Holdings SOC Ltd (Generation + Transmission + Distribution)', 'generation', 'multi_year', 'MYPD6 2026-2031', '2026/27',
  446000, 1100000, 0.0875, 168000, 31700, 1.85,
  'NERSA-RFD-2026-ESK-001',
  'Eskom filed its MYPD6 multi-year revenue application seeking an allowed revenue of R446.0bn for 2026/27 (RAB R1.10tn, pre-tax real WACC 8.75%, opex R168.0bn, RCA carry-over R31.7bn), implying a ~38% average tariff increase. Application received and logged; completeness review pending.',
  'application_received', '2026-05-20 08:00:00', '2026-05-30 08:00:00', 'demo_regulator_001'
);

-- 2) completeness_review — annual_tariff, City Power Johannesburg annual increase under review
INSERT OR IGNORE INTO oe_tariff_determinations (
  id, determination_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_ref, tariff_entity, tariff_segment, determination_class, mypd_period, price_year,
  requested_revenue_zar_m, rab_zar_m, wacc_pre_tax, opex_zar_m, requested_tariff_zar_kwh,
  application_ref, completeness_ref, application_basis, completeness_basis,
  chain_status, application_received_at, completeness_review_at, sla_deadline_at, created_by
) VALUES (
  'tdet_002', 'TDET-MUN-2026-0002',
  'lic_citypower', 'City Power Johannesburg SOC Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'NERSA/LIC/DIST/CITYPOWER', 'City Power Johannesburg SOC Ltd', 'distribution', 'annual_tariff', 'Municipal Tariff Guideline 2026/27', '2026/27',
  31200, 28400, 0.0910, 18600, 2.42,
  'NERSA-RFD-2026-MUN-014', 'NERSA-COMP-2026-MUN-014',
  'City Power applied for a 12.74% average tariff increase for 2026/27 against a cost-of-supply revenue requirement of R31.2bn.',
  'Completeness review underway: D-form schedules and the cost-of-supply study are being checked against the NERSA municipal tariff guideline before the application can proceed to consultation.',
  'completeness_review', '2026-05-08 08:00:00', '2026-05-14 09:00:00', '2026-05-29 09:00:00', 'demo_regulator_001'
);

-- 3) public_consultation — multi_year, Eskom Transmission MYPD public hearings underway
INSERT OR IGNORE INTO oe_tariff_determinations (
  id, determination_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_ref, tariff_entity, tariff_segment, determination_class, mypd_period, price_year,
  requested_revenue_zar_m, rab_zar_m, wacc_pre_tax, opex_zar_m,
  application_ref, completeness_ref, consultation_ref, application_basis, completeness_basis, consultation_basis,
  chain_status, application_received_at, completeness_review_at, public_consultation_at, sla_deadline_at, created_by
) VALUES (
  'tdet_003', 'TDET-MYPD-2026-0003',
  'lic_eskom', 'Eskom Transmission SOC Ltd (NTCSA)', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'NERSA/LIC/TRANS/NTCSA', 'National Transmission Company SA SOC Ltd (Transmission tariff)', 'transmission', 'multi_year', 'MYPD6 2026-2031', '2026/27',
  62800, 198000, 0.0875, 21400,
  'NERSA-RFD-2026-NTCSA-002', 'NERSA-COMP-2026-NTCSA-002', 'NERSA-HEAR-2026-TX-014',
  'NTCSA filed its transmission revenue application of R62.8bn for 2026/27 (RAB R198.0bn).',
  'Completeness confirmed; application admitted for public process.',
  'Public hearings convened across the nine provinces; written submissions from intensive energy users, municipalities and the public are being received and consolidated for the analysts.',
  'public_consultation', '2026-03-02 08:00:00', '2026-03-12 09:00:00', '2026-04-06 09:00:00', '2026-06-05 09:00:00', 'demo_regulator_001'
);

-- 4) revenue_analysis — multi_year, Eskom Distribution MYPD revenue analysis (RAB×WACC + RCA true-up)
INSERT OR IGNORE INTO oe_tariff_determinations (
  id, determination_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_ref, tariff_entity, tariff_segment, determination_class, mypd_period, price_year,
  requested_revenue_zar_m, rab_zar_m, wacc_pre_tax, opex_zar_m, rca_balance_zar_m,
  application_ref, completeness_ref, consultation_ref, analysis_ref,
  application_basis, consultation_basis, analysis_basis,
  chain_status, application_received_at, completeness_review_at, public_consultation_at, revenue_analysis_at, sla_deadline_at, created_by
) VALUES (
  'tdet_004', 'TDET-MYPD-2026-0004',
  'lic_eskom', 'Eskom Distribution SOC Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'NERSA/LIC/DIST/ESKOM', 'Eskom Distribution SOC Ltd', 'distribution', 'multi_year', 'MYPD6 2026-2031', '2026/27',
  124500, 162000, 0.0875, 71300, 14200,
  'NERSA-RFD-2026-ESKD-003', 'NERSA-COMP-2026-ESKD-003', 'NERSA-HEAR-2026-DX-009', 'NERSA-ANA-2026-ESKD-003',
  'Eskom Distribution filed a R124.5bn revenue application for 2026/27.',
  'Public hearings completed; consumer-affordability and free-basic-electricity submissions logged.',
  'Revenue analysis in progress: analysts are testing the RAB roll-forward and depreciation, recomputing the allowed return at the 8.75% pre-tax real WACC, prudency-testing opex against the efficiency benchmark, and reconciling the R14.2bn RCA true-up balance before drafting the determination.',
  'revenue_analysis', '2026-02-03 08:00:00', '2026-02-13 09:00:00', '2026-03-10 09:00:00', '2026-04-20 09:00:00', '2026-07-19 09:00:00', 'demo_regulator_001'
);

-- 5) determination_issued — annual_tariff, eThekwini municipal tariff determination issued (REPORTABLE)
INSERT OR IGNORE INTO oe_tariff_determinations (
  id, determination_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_ref, tariff_entity, tariff_segment, determination_class, mypd_period, price_year,
  requested_revenue_zar_m, allowed_revenue_zar_m, rab_zar_m, wacc_pre_tax, opex_zar_m,
  requested_tariff_zar_kwh, allowed_tariff_zar_kwh, tariff_increase_pct,
  application_ref, completeness_ref, consultation_ref, analysis_ref, draft_ref, determination_ref, gazette_ref, regulator_ref, is_reportable,
  application_basis, analysis_basis, determination_basis, reason_code,
  chain_status, application_received_at, completeness_review_at, public_consultation_at, revenue_analysis_at, draft_determination_at, council_deliberation_at, determination_issued_at, sla_deadline_at, created_by
) VALUES (
  'tdet_005', 'TDET-MUN-2026-0005',
  'lic_ethekwini', 'eThekwini Electricity (Ethekwini Municipality)', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'NERSA/LIC/DIST/ETHEKWINI', 'eThekwini Electricity', 'distribution', 'annual_tariff', 'Municipal Tariff Guideline 2026/27', '2026/27',
  22800, 21450, 19600, 0.0910, 13100,
  2.31, 2.18, 11.32,
  'NERSA-RFD-2026-MUN-005', 'NERSA-COMP-2026-MUN-005', 'NERSA-HEAR-2026-MUN-005', 'NERSA-ANA-2026-MUN-005', 'NERSA-DRAFT-2026-MUN-005', 'NERSA-DET-2026-MUN-005', 'GG-50412-2026', 'NERSA-COUNCIL-2026-MUN-007', 1,
  'eThekwini applied for a R22.8bn cost-of-supply revenue requirement (12.95% increase).',
  'Analysis trimmed the bulk-purchase pass-through and disallowed R1.35bn of unsupported opex.',
  'DETERMINATION ISSUED: allowed revenue R21.45bn, average tariff R2.18/kWh (11.32% increase, below the 12.95% requested). Determination crosses to the Council oversight queue / public tariff register — a material annual determination. Implementation pending the licensee tariff-book update.',
  'allowed_revenue_set_below_request',
  'determination_issued', '2025-12-01 08:00:00', '2025-12-10 09:00:00', '2026-01-15 09:00:00', '2026-02-20 09:00:00', '2026-03-18 09:00:00', '2026-04-02 09:00:00', '2026-04-15 09:00:00', '2026-05-06 09:00:00', 'demo_regulator_001'
);

-- 6) reconsideration_requested — multi_year, Eskom requested reconsideration (disputes WACC / RCA)
INSERT OR IGNORE INTO oe_tariff_determinations (
  id, determination_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_ref, tariff_entity, tariff_segment, determination_class, mypd_period, price_year,
  requested_revenue_zar_m, allowed_revenue_zar_m, rab_zar_m, wacc_pre_tax, opex_zar_m, rca_balance_zar_m,
  requested_tariff_zar_kwh, allowed_tariff_zar_kwh, tariff_increase_pct,
  application_ref, consultation_ref, analysis_ref, draft_ref, determination_ref, gazette_ref, reconsideration_ref, regulator_ref, is_reportable,
  application_basis, determination_basis, reconsideration_basis,
  chain_status, application_received_at, completeness_review_at, public_consultation_at, revenue_analysis_at, draft_determination_at, council_deliberation_at, determination_issued_at, reconsideration_requested_at, sla_deadline_at, created_by
) VALUES (
  'tdet_006', 'TDET-MYPD-2026-0006',
  'lic_eskom', 'Eskom Generation SOC Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'NERSA/LIC/GEN/ESKOM', 'Eskom Generation SOC Ltd', 'generation', 'multi_year', 'MYPD6 2026-2031', '2026/27',
  256000, 211000, 612000, 0.0875, 96400, 22600,
  1.62, 1.38, 9.84,
  'NERSA-RFD-2026-ESKG-006', 'NERSA-HEAR-2026-GX-006', 'NERSA-ANA-2026-ESKG-006', 'NERSA-DRAFT-2026-ESKG-006', 'NERSA-DET-2026-ESKG-006', 'GG-50488-2026', 'NERSA-RECON-2026-ESKG-006', 'NERSA-COUNCIL-2026-MYPD-011', 1,
  'Eskom Generation filed a R256.0bn revenue application for 2026/27.',
  'DETERMINATION ISSUED at R211.0bn allowed revenue (9.84% increase) after disallowing R45.0bn — a lower WACC haircut on the partially-impaired RAB and a deferred RCA recovery profile.',
  'RECONSIDERATION REQUESTED by Eskom under the reconsideration procedure: disputes (i) the WACC reduction applied to the impaired generation RAB and (ii) the deferral of R22.6bn RCA recovery beyond the current price year. Reconsideration determination pending; implementation or judicial review to follow.',
  'reconsideration_requested', '2025-10-06 08:00:00', '2025-10-16 09:00:00', '2025-11-20 09:00:00', '2025-12-18 09:00:00', '2026-01-22 09:00:00', '2026-02-05 09:00:00', '2026-02-18 09:00:00', '2026-03-12 09:00:00', '2026-04-26 09:00:00', 'demo_regulator_001'
);

-- 7) rejected — annual_tariff, municipal application rejected for incomplete cost-of-supply (REPORTABLE)
INSERT OR IGNORE INTO oe_tariff_determinations (
  id, determination_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_ref, tariff_entity, tariff_segment, determination_class, mypd_period, price_year,
  requested_revenue_zar_m, requested_tariff_zar_kwh,
  application_ref, completeness_ref, determination_ref, regulator_ref, is_reportable,
  application_basis, completeness_basis, determination_basis, reason_code, rod_notes,
  chain_status, application_received_at, completeness_review_at, rejected_at, created_by
) VALUES (
  'tdet_007', 'TDET-MUN-2026-0007',
  'lic_mangaung', 'Mangaung Metropolitan Municipality (Centlec SOC Ltd)', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'NERSA/LIC/DIST/CENTLEC', 'Centlec (SOC) Ltd', 'distribution', 'annual_tariff', 'Municipal Tariff Guideline 2026/27', '2026/27',
  9650, 2.66,
  'NERSA-RFD-2026-MUN-007', 'NERSA-COMP-2026-MUN-007', 'NERSA-DET-2026-MUN-007', 'NERSA-COUNCIL-2026-MUN-013', 1,
  'Centlec applied for a 16.4% average tariff increase (R9.65bn revenue requirement) for 2026/27.',
  'Completeness review found the cost-of-supply study absent, the D-forms internally inconsistent, and prior-year revenue not reconciled.',
  'REJECTED at completeness: the application is materially non-compliant with the NERSA municipal tariff guideline (no cost-of-supply study, unreconciled prior-year revenue). The licensee must resubmit a compliant application; the prior-year tariff remains in force pending a valid application. Rejection of a material annual determination crosses to the Council oversight queue.',
  'incomplete_cost_of_supply_study',
  'Resubmission window communicated; the municipality may not implement any increase until a compliant application is determined.',
  'rejected', '2026-01-12 08:00:00', '2026-01-20 09:00:00', '2026-02-04 09:00:00', 'demo_regulator_001'
);

-- 8) withdrawn — sseg_feedin, SSEG feed-in schedule application withdrawn by applicant
INSERT OR IGNORE INTO oe_tariff_determinations (
  id, determination_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_ref, tariff_entity, tariff_segment, determination_class, mypd_period, price_year,
  requested_tariff_zar_kwh,
  application_ref, application_basis, reason_code, rod_notes,
  chain_status, application_received_at, withdrawn_at, created_by
) VALUES (
  'tdet_008', 'TDET-SSEG-2026-0008',
  'lic_cct', 'City of Cape Town Metropolitan Municipality', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'NERSA/LIC/DIST/CCT', 'City of Cape Town — SSEG feed-in tariff (Cash for Power)', 'sseg', 'sseg_feedin', 'SSEG Feed-in Schedule 2026/27', '2026/27',
  1.05,
  'NERSA-RFD-2026-SSEG-008',
  'The City applied to approve its 2026/27 small-scale embedded generation feed-in tariff schedule (proposed R1.05/kWh export rate plus a 25c/kWh incentive).',
  'withdrawn_for_revised_resubmission',
  'WITHDRAWN by the applicant: the City elected to withdraw and resubmit a revised feed-in schedule aligned to the updated avoided-cost-of-generation methodology and the national SSEG registration framework. No determination made.',
  'withdrawn', '2026-03-04 08:00:00', '2026-03-19 09:00:00', 'demo_regulator_001'
);

-- 9) implemented — multi_year, FULL happy arc flagship (traverses draft_determination + council_deliberation) (REPORTABLE)
INSERT OR IGNORE INTO oe_tariff_determinations (
  id, determination_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_ref, tariff_entity, tariff_segment, determination_class, mypd_period, price_year,
  requested_revenue_zar_m, allowed_revenue_zar_m, rab_zar_m, wacc_pre_tax, opex_zar_m, rca_balance_zar_m,
  requested_tariff_zar_kwh, allowed_tariff_zar_kwh, tariff_increase_pct, x_factor,
  application_ref, completeness_ref, consultation_ref, analysis_ref, draft_ref, determination_ref, gazette_ref, regulator_ref, is_reportable,
  application_basis, consultation_basis, analysis_basis, draft_basis, determination_basis, reason_code, rod_notes,
  chain_status, application_received_at, completeness_review_at, public_consultation_at, revenue_analysis_at, draft_determination_at, council_deliberation_at, determination_issued_at, implemented_at, created_by
) VALUES (
  'tdet_009', 'TDET-MYPD-2025-0009',
  'lic_eskom', 'Eskom Holdings SOC Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'NERSA/LIC/GEN/ESKOM', 'Eskom Holdings SOC Ltd (MYPD5 2025/26 retail revenue)', 'generation', 'multi_year', 'MYPD5 2022-2025', '2025/26',
  395000, 352000, 1056000, 0.0875, 159800, 27300,
  1.78, 1.5236, 12.74, 0.012,
  'NERSA-RFD-2024-ESK-009', 'NERSA-COMP-2024-ESK-009', 'NERSA-HEAR-2024-ESK-009', 'NERSA-ANA-2024-ESK-009', 'NERSA-DRAFT-2024-ESK-009', 'NERSA-DET-2024-ESK-009', 'GG-49832-2025', 'NERSA-COUNCIL-2025-MYPD-003', 1,
  'Eskom filed a R395.0bn allowable-revenue application for the 2025/26 MYPD5 price year (RAB R1.056tn).',
  'National public hearings completed; affordability, security-of-supply and load-shedding submissions consolidated.',
  'Analysis recomputed the allowed return at the 8.75% pre-tax real WACC, prudency-tested opex (R159.8bn allowed), applied a 1.2% X-factor efficiency adjustment, and incorporated the R27.3bn RCA true-up.',
  'Draft determination prepared: allowed revenue R352.0bn, average standard tariff R1.5236/kWh (12.74% increase, below the ~36% requested).',
  'DETERMINATION ISSUED + IMPLEMENTED: allowed revenue R352.0bn, average tariff R1.5236/kWh (12.74%), gazetted (GG-49832) and brought into force for the 2025/26 price year. Full happy-path arc: received → completeness → consultation → analysis → draft → council deliberation → determination issued → implemented. Material MYPD determination — surfaced to the Council oversight queue / public tariff register.',
  'determination_gazetted_in_force',
  'Tariff book updated and effective 1 April 2025; municipalities to apply the corresponding guideline increase from 1 July 2025.',
  'implemented', '2024-09-02 08:00:00', '2024-09-16 09:00:00', '2024-11-04 09:00:00', '2024-12-16 09:00:00', '2025-01-20 09:00:00', '2025-02-10 09:00:00', '2025-02-28 09:00:00', '2025-04-01 09:00:00', 'admin'
);

-- 10) remitted — multi_year, prior determination set aside on judicial review and remitted to NERSA (REPORTABLE)
INSERT OR IGNORE INTO oe_tariff_determinations (
  id, determination_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_ref, tariff_entity, tariff_segment, determination_class, mypd_period, price_year,
  requested_revenue_zar_m, allowed_revenue_zar_m, rab_zar_m, wacc_pre_tax, opex_zar_m, rca_balance_zar_m,
  allowed_tariff_zar_kwh, tariff_increase_pct,
  application_ref, determination_ref, gazette_ref, court_ref, regulator_ref, is_reportable, escalation_level,
  application_basis, determination_basis, remit_basis, reason_code, rod_notes,
  chain_status, application_received_at, completeness_review_at, public_consultation_at, revenue_analysis_at, draft_determination_at, council_deliberation_at, determination_issued_at, remitted_at, created_by
) VALUES (
  'tdet_010', 'TDET-MYPD-2024-0010',
  'lic_eskom', 'Eskom Holdings SOC Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'NERSA/LIC/GEN/ESKOM', 'Eskom Holdings SOC Ltd (RCA / MYPD revenue, 2023/24)', 'generation', 'multi_year', 'MYPD4 + RCA 2019-2023', '2023/24',
  327000, 254000, 998000, 0.0820, 148000, 19800,
  1.34, 9.61,
  'NERSA-RFD-2022-ESK-010', 'NERSA-DET-2023-ESK-010', 'GG-48114-2023', 'GP-HC-2023-041287', 'NERSA-COUNCIL-2024-MYPD-014', 1, 1,
  'Eskom filed a combined MYPD4 RCA-recovery and revenue application of R327.0bn for 2023/24.',
  'DETERMINATION ISSUED at R254.0bn allowed revenue (9.61% increase) excluding a disputed R19.8bn RCA balance and applying an equity-risk-premium reduction.',
  'JUDICIAL REVIEW SET-ASIDE: on review the High Court (Gauteng, case GP-HC-2023-041287) found the regulator failed to give adequate reasons for the RCA exclusion and the WACC equity-risk-premium adjustment, set the determination aside, and REMITTED it to NERSA for fresh determination. Crosses to the Council oversight queue (a court set-aside is universal-reportable regardless of class). A new determination cycle will be initiated under separate cover.',
  'court_set_aside_remitted_for_reasons',
  'Court ordered NERSA to redetermine within the period directed; the impugned tariff stays in force pending redetermination per the court order.',
  'remitted', '2022-08-15 08:00:00', '2022-08-29 09:00:00', '2022-10-10 09:00:00', '2022-11-21 09:00:00', '2022-12-19 09:00:00', '2023-01-16 09:00:00', '2023-02-13 09:00:00', '2024-09-04 09:00:00', 'admin'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- tdet_001 (application_received)
INSERT OR IGNORE INTO oe_tariff_determinations_events (id, determination_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tdetv_001_a', 'tdet_001', 'tariff_determination.application_received', null, 'application_received', 'lic_eskom', 'applicant', 'Eskom MYPD6 revenue application filed — R446.0bn requested for 2026/27', '2026-05-20 08:00:00');

-- tdet_002 (completeness_review)
INSERT OR IGNORE INTO oe_tariff_determinations_events (id, determination_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tdetv_002_a', 'tdet_002', 'tariff_determination.application_received', null, 'application_received', 'lic_citypower', 'applicant', 'City Power 12.74% annual increase application filed', '2026-05-08 08:00:00'),
('tdetv_002_b', 'tdet_002', 'tariff_determination.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness review opened — checking D-forms + cost-of-supply study', '2026-05-14 09:00:00');

-- tdet_003 (public_consultation)
INSERT OR IGNORE INTO oe_tariff_determinations_events (id, determination_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tdetv_003_a', 'tdet_003', 'tariff_determination.application_received', null, 'application_received', 'lic_eskom', 'applicant', 'NTCSA transmission revenue application filed — R62.8bn', '2026-03-02 08:00:00'),
('tdetv_003_b', 'tdet_003', 'tariff_determination.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness confirmed; admitted for public process', '2026-03-12 09:00:00'),
('tdetv_003_c', 'tdet_003', 'tariff_determination.public_consultation', 'completeness_review', 'public_consultation', 'nersa_registry', 'registry', 'Public hearings convened across nine provinces; submissions being received', '2026-04-06 09:00:00');

-- tdet_004 (revenue_analysis)
INSERT OR IGNORE INTO oe_tariff_determinations_events (id, determination_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tdetv_004_a', 'tdet_004', 'tariff_determination.application_received', null, 'application_received', 'lic_eskom', 'applicant', 'Eskom Distribution revenue application filed — R124.5bn', '2026-02-03 08:00:00'),
('tdetv_004_b', 'tdet_004', 'tariff_determination.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness confirmed', '2026-02-13 09:00:00'),
('tdetv_004_c', 'tdet_004', 'tariff_determination.public_consultation', 'completeness_review', 'public_consultation', 'nersa_registry', 'registry', 'Public hearings completed; submissions logged', '2026-03-10 09:00:00'),
('tdetv_004_d', 'tdet_004', 'tariff_determination.revenue_analysis', 'public_consultation', 'revenue_analysis', 'nersa_analyst', 'analyst', 'Revenue analysis opened — RAB roll-forward, WACC return, opex prudency, R14.2bn RCA true-up', '2026-04-20 09:00:00');

-- tdet_005 (determination_issued — crosses regulator)
INSERT OR IGNORE INTO oe_tariff_determinations_events (id, determination_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tdetv_005_a', 'tdet_005', 'tariff_determination.application_received', null, 'application_received', 'lic_ethekwini', 'applicant', 'eThekwini annual tariff application filed — R22.8bn', '2025-12-01 08:00:00'),
('tdetv_005_b', 'tdet_005', 'tariff_determination.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness confirmed', '2025-12-10 09:00:00'),
('tdetv_005_c', 'tdet_005', 'tariff_determination.public_consultation', 'completeness_review', 'public_consultation', 'nersa_registry', 'registry', 'Public process completed', '2026-01-15 09:00:00'),
('tdetv_005_d', 'tdet_005', 'tariff_determination.revenue_analysis', 'public_consultation', 'revenue_analysis', 'nersa_analyst', 'analyst', 'Analysis disallowed R1.35bn unsupported opex', '2026-02-20 09:00:00'),
('tdetv_005_e', 'tdet_005', 'tariff_determination.draft_determination', 'revenue_analysis', 'draft_determination', 'nersa_analyst', 'analyst', 'Draft determination prepared — R21.45bn / R2.18/kWh', '2026-03-18 09:00:00'),
('tdetv_005_f', 'tdet_005', 'tariff_determination.council_deliberation', 'draft_determination', 'council_deliberation', 'nersa_analyst', 'analyst', 'Draft tabled for the Electricity Subcommittee', '2026-04-02 09:00:00'),
('tdetv_005_g', 'tdet_005', 'tariff_determination.determination_issued', 'council_deliberation', 'determination_issued', 'nersa_council', 'council', 'DETERMINATION ISSUED — R21.45bn / 11.32%; crosses to Council oversight (material annual)', '2026-04-15 09:00:00');

-- tdet_006 (reconsideration_requested)
INSERT OR IGNORE INTO oe_tariff_determinations_events (id, determination_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tdetv_006_a', 'tdet_006', 'tariff_determination.application_received', null, 'application_received', 'lic_eskom', 'applicant', 'Eskom Generation revenue application filed — R256.0bn', '2025-10-06 08:00:00'),
('tdetv_006_b', 'tdet_006', 'tariff_determination.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness confirmed', '2025-10-16 09:00:00'),
('tdetv_006_c', 'tdet_006', 'tariff_determination.public_consultation', 'completeness_review', 'public_consultation', 'nersa_registry', 'registry', 'Public hearings completed', '2025-11-20 09:00:00'),
('tdetv_006_d', 'tdet_006', 'tariff_determination.revenue_analysis', 'public_consultation', 'revenue_analysis', 'nersa_analyst', 'analyst', 'Analysis applied WACC haircut on impaired RAB; deferred RCA recovery', '2025-12-18 09:00:00'),
('tdetv_006_e', 'tdet_006', 'tariff_determination.draft_determination', 'revenue_analysis', 'draft_determination', 'nersa_analyst', 'analyst', 'Draft determination prepared — R211.0bn / 9.84%', '2026-01-22 09:00:00'),
('tdetv_006_f', 'tdet_006', 'tariff_determination.council_deliberation', 'draft_determination', 'council_deliberation', 'nersa_analyst', 'analyst', 'Draft tabled for the Electricity Subcommittee', '2026-02-05 09:00:00'),
('tdetv_006_g', 'tdet_006', 'tariff_determination.determination_issued', 'council_deliberation', 'determination_issued', 'nersa_council', 'council', 'DETERMINATION ISSUED — R211.0bn allowed (R45.0bn disallowed)', '2026-02-18 09:00:00'),
('tdetv_006_h', 'tdet_006', 'tariff_determination.reconsideration_requested', 'determination_issued', 'reconsideration_requested', 'lic_eskom', 'applicant', 'RECONSIDERATION REQUESTED — disputes WACC reduction + R22.6bn RCA deferral', '2026-03-12 09:00:00');

-- tdet_007 (rejected — crosses regulator)
INSERT OR IGNORE INTO oe_tariff_determinations_events (id, determination_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tdetv_007_a', 'tdet_007', 'tariff_determination.application_received', null, 'application_received', 'lic_mangaung', 'applicant', 'Centlec 16.4% annual increase application filed', '2026-01-12 08:00:00'),
('tdetv_007_b', 'tdet_007', 'tariff_determination.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness review found no cost-of-supply study + inconsistent D-forms', '2026-01-20 09:00:00'),
('tdetv_007_c', 'tdet_007', 'tariff_determination.rejected', 'completeness_review', 'rejected', 'nersa_council', 'council', 'REJECTED — materially non-compliant; resubmit. Crosses to Council oversight (material annual)', '2026-02-04 09:00:00');

-- tdet_008 (withdrawn)
INSERT OR IGNORE INTO oe_tariff_determinations_events (id, determination_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tdetv_008_a', 'tdet_008', 'tariff_determination.application_received', null, 'application_received', 'lic_cct', 'applicant', 'City of Cape Town SSEG feed-in schedule application filed (R1.05/kWh export)', '2026-03-04 08:00:00'),
('tdetv_008_b', 'tdet_008', 'tariff_determination.withdrawn', 'application_received', 'withdrawn', 'lic_cct', 'applicant', 'WITHDRAWN — City to resubmit a revised feed-in schedule on the updated avoided-cost methodology', '2026-03-19 09:00:00');

-- tdet_009 (implemented — full happy arc flagship; crosses regulator at issue)
INSERT OR IGNORE INTO oe_tariff_determinations_events (id, determination_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tdetv_009_a', 'tdet_009', 'tariff_determination.application_received', null, 'application_received', 'lic_eskom', 'applicant', 'Eskom MYPD5 2025/26 allowable-revenue application filed — R395.0bn', '2024-09-02 08:00:00'),
('tdetv_009_b', 'tdet_009', 'tariff_determination.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness confirmed', '2024-09-16 09:00:00'),
('tdetv_009_c', 'tdet_009', 'tariff_determination.public_consultation', 'completeness_review', 'public_consultation', 'nersa_registry', 'registry', 'National public hearings completed', '2024-11-04 09:00:00'),
('tdetv_009_d', 'tdet_009', 'tariff_determination.revenue_analysis', 'public_consultation', 'revenue_analysis', 'nersa_analyst', 'analyst', 'Analysis — 8.75% WACC return, R159.8bn opex, 1.2% X-factor, R27.3bn RCA', '2024-12-16 09:00:00'),
('tdetv_009_e', 'tdet_009', 'tariff_determination.draft_determination', 'revenue_analysis', 'draft_determination', 'nersa_analyst', 'analyst', 'Draft determination — R352.0bn / R1.5236/kWh (12.74%)', '2025-01-20 09:00:00'),
('tdetv_009_f', 'tdet_009', 'tariff_determination.council_deliberation', 'draft_determination', 'council_deliberation', 'nersa_analyst', 'analyst', 'Draft tabled for the Electricity Subcommittee', '2025-02-10 09:00:00'),
('tdetv_009_g', 'tdet_009', 'tariff_determination.determination_issued', 'council_deliberation', 'determination_issued', 'nersa_council', 'council', 'DETERMINATION ISSUED — R352.0bn / 12.74%; gazetted GG-49832; crosses to Council oversight (material MYPD)', '2025-02-28 09:00:00'),
('tdetv_009_h', 'tdet_009', 'tariff_determination.implemented', 'determination_issued', 'implemented', 'nersa_registry', 'registry', 'IMPLEMENTED — tariff book updated, effective 1 April 2025', '2025-04-01 09:00:00');

-- tdet_010 (remitted — court set-aside; crosses regulator)
INSERT OR IGNORE INTO oe_tariff_determinations_events (id, determination_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tdetv_010_a', 'tdet_010', 'tariff_determination.application_received', null, 'application_received', 'lic_eskom', 'applicant', 'Eskom MYPD4 RCA + revenue application filed — R327.0bn for 2023/24', '2022-08-15 08:00:00'),
('tdetv_010_b', 'tdet_010', 'tariff_determination.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness confirmed', '2022-08-29 09:00:00'),
('tdetv_010_c', 'tdet_010', 'tariff_determination.public_consultation', 'completeness_review', 'public_consultation', 'nersa_registry', 'registry', 'Public hearings completed', '2022-10-10 09:00:00'),
('tdetv_010_d', 'tdet_010', 'tariff_determination.revenue_analysis', 'public_consultation', 'revenue_analysis', 'nersa_analyst', 'analyst', 'Analysis excluded R19.8bn RCA + applied equity-risk-premium reduction', '2022-11-21 09:00:00'),
('tdetv_010_e', 'tdet_010', 'tariff_determination.draft_determination', 'revenue_analysis', 'draft_determination', 'nersa_analyst', 'analyst', 'Draft determination — R254.0bn / 9.61%', '2022-12-19 09:00:00'),
('tdetv_010_f', 'tdet_010', 'tariff_determination.council_deliberation', 'draft_determination', 'council_deliberation', 'nersa_analyst', 'analyst', 'Draft tabled for the Electricity Subcommittee', '2023-01-16 09:00:00'),
('tdetv_010_g', 'tdet_010', 'tariff_determination.determination_issued', 'council_deliberation', 'determination_issued', 'nersa_council', 'council', 'DETERMINATION ISSUED — R254.0bn / 9.61% (R19.8bn RCA excluded)', '2023-02-13 09:00:00'),
('tdetv_010_h', 'tdet_010', 'tariff_determination.remitted', 'determination_issued', 'remitted', 'high_court_gp', 'court', 'JUDICIAL SET-ASIDE — High Court (GP-HC-2023-041287) found inadequate reasons; REMITTED for fresh determination; crosses ALL classes', '2024-09-04 09:00:00');
