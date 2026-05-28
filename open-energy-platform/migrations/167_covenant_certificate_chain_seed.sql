-- Wave 38 — Lender Covenant Compliance Certificate seed data.
-- 10 prod-realistic cases across 10 of 11 states (omits standalone cure_period,
-- which is still traversed inside the covcert_009 cured flagship) + 3 tiers.
-- SA REIPPPP project-finance facilities (wind/CSP SPVs). Borrower = project
-- company; facility agent reviews; lenders grant waivers + accelerate.
-- Cross-wave provenance: a W21 drawdown facility and the W30 dsb_008 Coega
-- UoP-diversion both feed covenant outcomes (waiver / acceleration).

-- 1) certificate_due — senior, Q2-2026 compliance certificate awaited
INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number,
  borrower_party_id, borrower_party_name, facility_agent_name, lender_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, test_period, test_period_end,
  dscr_threshold, llcr_threshold, gearing_threshold,
  submission_basis,
  chain_status, certificate_due_at, sla_deadline_at, created_by
) VALUES (
  'covcert_001', 'COVCERT-2026-0001',
  'spv_redstone', 'Redstone Solar Thermal Power (RF) (Pty) Ltd', 'Standard Bank (Facility Agent)', 'Standard Bank / DBSA / IDC',
  'Redstone CSP Senior Facility', 'senior_secured', 8200000000, 6480000000, '2026-Q2', '2026-06-30',
  1.20, 1.40, 0.75,
  'Q2-2026 compliance certificate due 30 days after period end. DSCR/LLCR/gearing schedule to be lodged by borrower with management accounts.',
  'certificate_due', '2026-06-30 23:59:00', '2026-07-30 23:59:00', 'demo_lender_001'
);

-- 2) certificate_submitted — mezz, Q1-2026 certificate just filed
INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number,
  borrower_party_id, borrower_party_name, facility_agent_name, lender_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, test_period, test_period_end,
  dscr_actual, dscr_threshold, llcr_actual, llcr_threshold, gearing_actual, gearing_threshold,
  certificate_ref, submission_basis,
  chain_status, certificate_due_at, certificate_submitted_at, sla_deadline_at, created_by
) VALUES (
  'covcert_002', 'COVCERT-2026-0002',
  'spv_kangnas', 'Kangnas Wind Farm (RF) (Pty) Ltd', 'Nedbank (Facility Agent)', 'Nedbank / Old Mutual',
  'Kangnas Wind Mezzanine Facility', 'mezzanine', 1450000000, 1180000000, '2026-Q1', '2026-03-31',
  1.31, 1.15, 1.48, 1.30, 0.79, 0.82,
  'CERT-2026-0002', 'Q1-2026 compliance certificate filed with signed director attestation + management accounts. Awaiting agent review.',
  'certificate_submitted', '2026-03-31 23:59:00', '2026-04-22 09:00:00', '2026-04-27 09:00:00', 'demo_lender_001'
);

-- 3) under_review — senior, agent reviewing the certificate
INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number,
  borrower_party_id, borrower_party_name, facility_agent_name, lender_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, test_period, test_period_end,
  dscr_actual, dscr_threshold, llcr_actual, llcr_threshold, gearing_actual, gearing_threshold,
  certificate_ref, review_ref, submission_basis, review_basis,
  chain_status, certificate_due_at, certificate_submitted_at, under_review_at, sla_deadline_at, created_by
) VALUES (
  'covcert_003', 'COVCERT-2026-0003',
  'spv_roggeveld', 'Roggeveld Wind Farm (RF) (Pty) Ltd', 'Absa (Facility Agent)', 'Absa / RMB',
  'Roggeveld Wind Senior Facility', 'senior_secured', 3900000000, 3120000000, '2026-Q1', '2026-03-31',
  1.27, 1.20, 1.44, 1.40, 0.74, 0.75,
  'CERT-2026-0003', 'REV-2026-0003', 'Q1-2026 certificate filed.', 'Agent reviewing borrower ratio calc vs lender model — recomputing DSCR off audited cashflows. Ratios appear within covenant; verification in progress.',
  'under_review', '2026-03-31 23:59:00', '2026-04-18 09:00:00', '2026-04-21 09:00:00', '2026-04-26 09:00:00', 'demo_lender_001'
);

-- 4) ratios_verified — subordinated, agent re-computed ratios, awaiting compliant/breach decision
INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number,
  borrower_party_id, borrower_party_name, facility_agent_name, lender_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, test_period, test_period_end,
  dscr_actual, dscr_threshold, llcr_actual, llcr_threshold, gearing_actual, gearing_threshold,
  certificate_ref, review_ref, submission_basis, review_basis,
  chain_status, certificate_due_at, certificate_submitted_at, under_review_at, ratios_verified_at, sla_deadline_at, created_by
) VALUES (
  'covcert_004', 'COVCERT-2026-0004',
  'spv_garob', 'Garob Wind Farm (RF) (Pty) Ltd', 'Investec (Facility Agent)', 'Investec / Futuregrowth',
  'Garob Wind Subordinated Facility', 'subordinated', 720000000, 540000000, '2026-Q1', '2026-03-31',
  1.18, 1.10, 1.36, 1.25, 0.83, 0.85,
  'CERT-2026-0004', 'REV-2026-0004', 'Q1-2026 certificate filed.', 'Agent verified all three ratios off audited figures — DSCR 1.18 (≥1.10), LLCR 1.36 (≥1.25), gearing 0.83 (≤0.85). All within covenant; awaiting formal compliant confirmation.',
  'ratios_verified', '2026-03-31 23:59:00', '2026-04-15 09:00:00', '2026-04-19 09:00:00', '2026-04-23 09:00:00', '2026-04-28 09:00:00', 'demo_lender_001'
);

-- 5) compliant — senior, full clean path, period closed compliant (terminal)
INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number,
  borrower_party_id, borrower_party_name, facility_agent_name, lender_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, test_period, test_period_end,
  dscr_actual, dscr_threshold, llcr_actual, llcr_threshold, gearing_actual, gearing_threshold,
  certificate_ref, review_ref, submission_basis, review_basis, reason_code, rod_notes,
  chain_status, certificate_due_at, certificate_submitted_at, under_review_at, ratios_verified_at, compliant_at, created_by
) VALUES (
  'covcert_005', 'COVCERT-2026-0005',
  'spv_karusa', 'Karusa Wind Power (RF) (Pty) Ltd', 'Standard Bank (Facility Agent)', 'Standard Bank / DBSA',
  'Karusa Wind Senior Facility', 'senior_secured', 4100000000, 3050000000, '2025-Q4', '2025-12-31',
  1.42, 1.20, 1.58, 1.40, 0.71, 0.75,
  'CERT-2025-0205', 'REV-2025-0205', 'Q4-2025 certificate filed with audited year-end accounts.', 'Agent verified DSCR 1.42 (≥1.20), LLCR 1.58 (≥1.40), gearing 0.71 (≤0.75). Strong headroom on all covenants — wind resource above P50.', 'compliant_clean', 'Period closed compliant. No reservations. Strong DSCR headroom. Next test 2026-Q1.',
  'compliant', '2025-12-31 23:59:00', '2026-01-18 09:00:00', '2026-01-22 09:00:00', '2026-01-26 09:00:00', '2026-01-28 09:00:00', 'admin'
);

-- 6) breach_identified — senior, DSCR breach flagged (crosses regulator — senior reportable)
INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number,
  borrower_party_id, borrower_party_name, facility_agent_name, lender_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, test_period, test_period_end,
  dscr_actual, dscr_threshold, llcr_actual, llcr_threshold, gearing_actual, gearing_threshold, breached_covenants,
  certificate_ref, review_ref, breach_ref, submission_basis, review_basis, breach_basis, reason_code,
  chain_status, certificate_due_at, certificate_submitted_at, under_review_at, ratios_verified_at, breach_identified_at, sla_deadline_at, created_by
) VALUES (
  'covcert_006', 'COVCERT-2026-0006',
  'spv_soetwater', 'Soetwater Wind Farm (RF) (Pty) Ltd', 'Absa (Facility Agent)', 'Absa / RMB / IDC',
  'Soetwater Wind Senior Facility', 'senior_secured', 5200000000, 4420000000, '2026-Q1', '2026-03-31',
  1.08, 1.20, 1.37, 1.40, 0.76, 0.75, 'DSCR,LLCR,GEARING',
  'CERT-2026-0006', 'REV-2026-0006', 'BREACH-2026-0006', 'Q1-2026 certificate filed showing strained ratios.', 'Agent verified DSCR 1.08 (<1.20), LLCR 1.37 (<1.40), gearing 0.76 (>0.75) — all three covenants breached following Q1 grid-curtailment revenue shortfall + R-rate hedge cost.', 'DSCR (1.08 vs 1.20), LLCR (1.37 vs 1.40) and gearing (0.76 vs 0.75) all breached. Reservation-of-rights notice issued; borrower to propose cure / seek waiver. Senior breach NOTIFIED to regulator (SARB large-exposure).', 'multi_covenant_breach',
  'breach_identified', '2026-03-31 23:59:00', '2026-04-16 09:00:00', '2026-04-20 09:00:00', '2026-04-24 09:00:00', '2026-04-27 09:00:00', '2026-05-02 09:00:00', 'admin'
);

-- 7) waiver_requested — mezz, gearing breach, borrower requested one-off waiver
INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number,
  borrower_party_id, borrower_party_name, facility_agent_name, lender_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, test_period, test_period_end,
  dscr_actual, dscr_threshold, llcr_actual, llcr_threshold, gearing_actual, gearing_threshold, breached_covenants,
  certificate_ref, review_ref, breach_ref, waiver_ref, breach_basis, waiver_basis, reason_code,
  chain_status, certificate_due_at, certificate_submitted_at, under_review_at, ratios_verified_at, breach_identified_at, waiver_requested_at, sla_deadline_at, created_by
) VALUES (
  'covcert_007', 'COVCERT-2026-0007',
  'spv_perdekraal', 'Perdekraal East Wind Farm (RF) (Pty) Ltd', 'Nedbank (Facility Agent)', 'Nedbank / Sanlam',
  'Perdekraal East Wind Mezzanine Facility', 'mezzanine', 1100000000, 940000000, '2026-Q1', '2026-03-31',
  1.22, 1.15, 1.41, 1.30, 0.84, 0.80, 'GEARING',
  'CERT-2026-0007', 'REV-2026-0007', 'BREACH-2026-0007', 'WAIV-2026-0007', 'Gearing 0.84 vs 0.80 covenant — breach driven by a deferred-equity timing mismatch (sponsor equity injection delayed one quarter). DSCR + LLCR comfortably within covenant. Mezz breach NOTIFIED to regulator.', 'Borrower requested a one-off waiver: gearing breach is a timing artefact; sponsor equity of R95m lands next quarter, restoring gearing to 0.78. Requests waiver conditional on the injection by 2026-06-30.', 'gearing_timing_waiver',
  'waiver_requested', '2026-03-31 23:59:00', '2026-04-14 09:00:00', '2026-04-18 09:00:00', '2026-04-21 09:00:00', '2026-04-24 09:00:00', '2026-04-29 09:00:00', '2026-05-09 09:00:00', 'demo_lender_001'
);

-- 8) waiver_granted — mezz, lender granted a conditional waiver (terminal) — W21 drawdown provenance
INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  borrower_party_id, borrower_party_name, facility_agent_name, lender_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, test_period, test_period_end,
  dscr_actual, dscr_threshold, llcr_actual, llcr_threshold, gearing_actual, gearing_threshold, breached_covenants,
  certificate_ref, review_ref, breach_ref, waiver_ref, waiver_round, breach_basis, waiver_basis, reason_code, rod_notes,
  chain_status, certificate_due_at, certificate_submitted_at, under_review_at, ratios_verified_at, breach_identified_at, waiver_requested_at, waiver_granted_at, created_by
) VALUES (
  'covcert_008', 'COVCERT-2026-0008',
  'drawdown.funded', 'drawdown_chain', 'dd_005', 'W21',
  'spv_excelsior', 'Excelsior Wind Farm (RF) (Pty) Ltd', 'Investec (Facility Agent)', 'Investec / Futuregrowth',
  'Excelsior Wind Mezzanine Facility', 'mezzanine', 980000000, 860000000, '2025-Q4', '2025-12-31',
  1.13, 1.15, 1.42, 1.30, 0.79, 0.82, 'DSCR',
  'CERT-2025-0188', 'REV-2025-0188', 'BREACH-2025-0188', 'WAIV-2025-0188', 1, 'DSCR 1.13 vs 1.15 — marginal breach after a one-month curtailment-driven dip on the W21-funded facility (dd_005). LLCR + gearing fine.', 'Lenders (majority) granted a one-off waiver of the Q4 DSCR test: breach is marginal (2bps) and non-recurring, 12-month forward DSCR projects to 1.34. Waiver conditional on no further breach in 2026-Q1. Mezz breach was NOTIFIED to regulator.', 'marginal_dscr_waived', 'Waiver granted; period closed-with-waiver. Reservation of rights preserved for future periods. Linked to W21 drawdown dd_005.',
  'waiver_granted', '2025-12-31 23:59:00', '2026-01-16 09:00:00', '2026-01-20 09:00:00', '2026-01-23 09:00:00', '2026-01-26 09:00:00', '2026-01-30 09:00:00', '2026-02-12 09:00:00', 'admin'
);

-- 9) cured — subordinated, FULL breach→cure→cured flagship (subordinated breach does NOT cross regulator)
INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number,
  borrower_party_id, borrower_party_name, facility_agent_name, lender_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, test_period, test_period_end,
  dscr_actual, dscr_threshold, llcr_actual, llcr_threshold, gearing_actual, gearing_threshold, breached_covenants,
  certificate_ref, review_ref, breach_ref, cure_ref, breach_basis, cure_basis, reason_code, rod_notes,
  chain_status, certificate_due_at, certificate_submitted_at, under_review_at, ratios_verified_at, breach_identified_at, cure_period_at, cured_at, created_by
) VALUES (
  'covcert_009', 'COVCERT-2026-0009',
  'spv_copperton', 'Copperton Wind Farm (RF) (Pty) Ltd', 'Investec (Facility Agent)', 'Futuregrowth / Old Mutual',
  'Copperton Wind Subordinated Facility', 'subordinated', 640000000, 510000000, '2025-Q4', '2025-12-31',
  1.04, 1.05, 1.31, 1.20, 0.86, 0.88, 'DSCR',
  'CERT-2025-0192', 'REV-2025-0192', 'BREACH-2025-0192', 'CURE-2025-0192', 'DSCR 1.04 vs 1.05 — marginal sub-debt DSCR breach after a weak-wind quarter. Subordinated breach NOT regulator-reportable (sits between junior lenders).', 'Borrower exercised the equity-cure right: sponsor injected R45m to the debt-service reserve, lifting effective DSCR to 1.19. Cure completed within the 60-day window. Agent re-tested and confirmed cured.', 'equity_cure_completed', 'Full breach→cure→cured arc: certificate filed → reviewed → ratios verified → DSCR breach → cure period → equity cure → CURED. Period closed cured; no waiver needed. Demonstrates the junior-tier non-reportable cure path.',
  'cured', '2025-12-31 23:59:00', '2026-01-14 09:00:00', '2026-01-19 09:00:00', '2026-01-23 09:00:00', '2026-01-27 09:00:00', '2026-02-03 09:00:00', '2026-03-20 09:00:00', 'admin'
);

-- 10) accelerated — senior, event of default declared (crosses ALL tiers) — W30 dsb_008 Coega UoP diversion provenance
INSERT OR IGNORE INTO oe_covenant_certificates (
  id, certificate_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  borrower_party_id, borrower_party_name, facility_agent_name, lender_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, test_period, test_period_end,
  dscr_actual, dscr_threshold, llcr_actual, llcr_threshold, gearing_actual, gearing_threshold, breached_covenants,
  certificate_ref, review_ref, breach_ref, acceleration_ref, breach_basis, acceleration_basis, reason_code, rod_notes,
  chain_status, certificate_due_at, certificate_submitted_at, under_review_at, ratios_verified_at, breach_identified_at, accelerated_at, created_by
) VALUES (
  'covcert_010', 'COVCERT-2026-0010',
  'disbursement.clawback', 'disbursement_chain', 'dsb_008', 'W30',
  'spv_coega', 'Coega Wind & Storage (RF) (Pty) Ltd', 'Standard Bank (Facility Agent)', 'Standard Bank / DBSA / IDC / AfDB',
  'Coega Wind & Storage Senior Facility', 'senior_secured', 6900000000, 5870000000, '2026-Q1', '2026-03-31',
  0.91, 1.25, 1.18, 1.45, 0.91, 0.78, 'DSCR,LLCR,GEARING',
  'CERT-2026-0010', 'REV-2026-0010', 'BREACH-2026-0010', 'ACCEL-2026-0010', 'DSCR 0.91 (<1.25), LLCR 1.18 (<1.45), gearing 0.91 (>0.78) — severe multi-covenant breach compounded by the W30 use-of-proceeds diversion (dsb_008): R510m of senior debt diverted off-purpose at Coega, clawback unrecovered.', 'Majority lenders declared an EVENT OF DEFAULT and ACCELERATED the facility — full outstanding R5.87bn called immediately. Triggered by the combination of severe covenant breach + the W30 UoP diversion (misrepresentation event of default). NOTIFIED to regulator (acceleration crosses ALL tiers — SARB large-exposure hard line).', 'event_of_default_uop_diversion', 'Event of default declared; facility accelerated. Cross-default notices issued to the mezz + sub tranches. Enforcement / security realisation to follow. Linked to W30 disbursement dsb_008 (Coega R510m UoP diversion).',
  'accelerated', '2026-03-31 23:59:00', '2026-04-15 09:00:00', '2026-04-18 09:00:00', '2026-04-22 09:00:00', '2026-04-25 09:00:00', '2026-05-06 09:00:00', 'admin'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- covcert_001 (certificate_due)
INSERT OR IGNORE INTO oe_covenant_certificate_events (id, certificate_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('covcertv_001_a', 'covcert_001', 'covenant_certificate.certificate_due', null, 'certificate_due', 'spv_redstone', 'borrower', 'Q2-2026 compliance certificate scheduled — due 30 days after period end', '2026-06-30 23:59:00');

-- covcert_002 (certificate_submitted)
INSERT OR IGNORE INTO oe_covenant_certificate_events (id, certificate_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('covcertv_002_a', 'covcert_002', 'covenant_certificate.certificate_due', null, 'certificate_due', 'spv_kangnas', 'borrower', 'Q1-2026 certificate scheduled', '2026-03-31 23:59:00'),
('covcertv_002_b', 'covcert_002', 'covenant_certificate.certificate_submitted', 'certificate_due', 'certificate_submitted', 'spv_kangnas', 'borrower', 'Signed compliance certificate + management accounts filed', '2026-04-22 09:00:00');

-- covcert_003 (under_review)
INSERT OR IGNORE INTO oe_covenant_certificate_events (id, certificate_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('covcertv_003_a', 'covcert_003', 'covenant_certificate.certificate_due', null, 'certificate_due', 'spv_roggeveld', 'borrower', 'Q1-2026 certificate scheduled', '2026-03-31 23:59:00'),
('covcertv_003_b', 'covcert_003', 'covenant_certificate.certificate_submitted', 'certificate_due', 'certificate_submitted', 'spv_roggeveld', 'borrower', 'Certificate filed', '2026-04-18 09:00:00'),
('covcertv_003_c', 'covcert_003', 'covenant_certificate.under_review', 'certificate_submitted', 'under_review', 'agent_absa', 'agent', 'Agent recomputing DSCR off audited cashflows — verification in progress', '2026-04-21 09:00:00');

-- covcert_004 (ratios_verified)
INSERT OR IGNORE INTO oe_covenant_certificate_events (id, certificate_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('covcertv_004_a', 'covcert_004', 'covenant_certificate.certificate_due', null, 'certificate_due', 'spv_garob', 'borrower', 'Q1-2026 certificate scheduled', '2026-03-31 23:59:00'),
('covcertv_004_b', 'covcert_004', 'covenant_certificate.certificate_submitted', 'certificate_due', 'certificate_submitted', 'spv_garob', 'borrower', 'Certificate filed', '2026-04-15 09:00:00'),
('covcertv_004_c', 'covcert_004', 'covenant_certificate.under_review', 'certificate_submitted', 'under_review', 'agent_investec', 'agent', 'Agent reviewing ratios', '2026-04-19 09:00:00'),
('covcertv_004_d', 'covcert_004', 'covenant_certificate.ratios_verified', 'under_review', 'ratios_verified', 'agent_investec', 'agent', 'DSCR 1.18 / LLCR 1.36 / gearing 0.83 all verified within covenant — awaiting compliant confirmation', '2026-04-23 09:00:00');

-- covcert_005 (compliant — full clean path)
INSERT OR IGNORE INTO oe_covenant_certificate_events (id, certificate_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('covcertv_005_a', 'covcert_005', 'covenant_certificate.certificate_due', null, 'certificate_due', 'spv_karusa', 'borrower', 'Q4-2025 certificate scheduled', '2025-12-31 23:59:00'),
('covcertv_005_b', 'covcert_005', 'covenant_certificate.certificate_submitted', 'certificate_due', 'certificate_submitted', 'spv_karusa', 'borrower', 'Certificate filed with audited year-end accounts', '2026-01-18 09:00:00'),
('covcertv_005_c', 'covcert_005', 'covenant_certificate.under_review', 'certificate_submitted', 'under_review', 'agent_stanbank', 'agent', 'Agent reviewing', '2026-01-22 09:00:00'),
('covcertv_005_d', 'covcert_005', 'covenant_certificate.ratios_verified', 'under_review', 'ratios_verified', 'agent_stanbank', 'agent', 'DSCR 1.42 / LLCR 1.58 / gearing 0.71 — strong headroom verified', '2026-01-26 09:00:00'),
('covcertv_005_e', 'covcert_005', 'covenant_certificate.compliant', 'ratios_verified', 'compliant', 'agent_stanbank', 'agent', 'Period closed COMPLIANT — no reservations', '2026-01-28 09:00:00');

-- covcert_006 (breach_identified — senior, crosses regulator)
INSERT OR IGNORE INTO oe_covenant_certificate_events (id, certificate_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('covcertv_006_a', 'covcert_006', 'covenant_certificate.certificate_due', null, 'certificate_due', 'spv_soetwater', 'borrower', 'Q1-2026 certificate scheduled', '2026-03-31 23:59:00'),
('covcertv_006_b', 'covcert_006', 'covenant_certificate.certificate_submitted', 'certificate_due', 'certificate_submitted', 'spv_soetwater', 'borrower', 'Certificate filed showing strained ratios', '2026-04-16 09:00:00'),
('covcertv_006_c', 'covcert_006', 'covenant_certificate.under_review', 'certificate_submitted', 'under_review', 'agent_absa', 'agent', 'Agent reviewing strained ratios', '2026-04-20 09:00:00'),
('covcertv_006_d', 'covcert_006', 'covenant_certificate.ratios_verified', 'under_review', 'ratios_verified', 'agent_absa', 'agent', 'DSCR 1.08 / LLCR 1.37 / gearing 0.76 verified — below covenants', '2026-04-24 09:00:00'),
('covcertv_006_e', 'covcert_006', 'covenant_certificate.breach_identified', 'ratios_verified', 'breach_identified', 'agent_absa', 'agent', 'Multi-covenant breach (DSCR/LLCR/gearing). Reservation of rights issued. Senior breach NOTIFIED to regulator.', '2026-04-27 09:00:00');

-- covcert_007 (waiver_requested — mezz)
INSERT OR IGNORE INTO oe_covenant_certificate_events (id, certificate_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('covcertv_007_a', 'covcert_007', 'covenant_certificate.certificate_due', null, 'certificate_due', 'spv_perdekraal', 'borrower', 'Q1-2026 certificate scheduled', '2026-03-31 23:59:00'),
('covcertv_007_b', 'covcert_007', 'covenant_certificate.certificate_submitted', 'certificate_due', 'certificate_submitted', 'spv_perdekraal', 'borrower', 'Certificate filed', '2026-04-14 09:00:00'),
('covcertv_007_c', 'covcert_007', 'covenant_certificate.under_review', 'certificate_submitted', 'under_review', 'agent_nedbank', 'agent', 'Agent reviewing gearing', '2026-04-18 09:00:00'),
('covcertv_007_d', 'covcert_007', 'covenant_certificate.ratios_verified', 'under_review', 'ratios_verified', 'agent_nedbank', 'agent', 'Gearing 0.84 vs 0.80 verified — breach (timing)', '2026-04-21 09:00:00'),
('covcertv_007_e', 'covcert_007', 'covenant_certificate.breach_identified', 'ratios_verified', 'breach_identified', 'agent_nedbank', 'agent', 'Gearing breach flagged. Mezz breach NOTIFIED to regulator.', '2026-04-24 09:00:00'),
('covcertv_007_f', 'covcert_007', 'covenant_certificate.waiver_requested', 'breach_identified', 'waiver_requested', 'spv_perdekraal', 'borrower', 'Borrower requested one-off waiver — sponsor equity R95m lands next quarter, restoring gearing to 0.78', '2026-04-29 09:00:00');

-- covcert_008 (waiver_granted — mezz, W21 provenance)
INSERT OR IGNORE INTO oe_covenant_certificate_events (id, certificate_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('covcertv_008_a', 'covcert_008', 'covenant_certificate.certificate_due', null, 'certificate_due', 'spv_excelsior', 'borrower', 'Q4-2025 certificate scheduled — W21-funded facility dd_005', '2025-12-31 23:59:00'),
('covcertv_008_b', 'covcert_008', 'covenant_certificate.certificate_submitted', 'certificate_due', 'certificate_submitted', 'spv_excelsior', 'borrower', 'Certificate filed', '2026-01-16 09:00:00'),
('covcertv_008_c', 'covcert_008', 'covenant_certificate.under_review', 'certificate_submitted', 'under_review', 'agent_investec', 'agent', 'Agent reviewing marginal DSCR', '2026-01-20 09:00:00'),
('covcertv_008_d', 'covcert_008', 'covenant_certificate.ratios_verified', 'under_review', 'ratios_verified', 'agent_investec', 'agent', 'DSCR 1.13 vs 1.15 verified — marginal breach', '2026-01-23 09:00:00'),
('covcertv_008_e', 'covcert_008', 'covenant_certificate.breach_identified', 'ratios_verified', 'breach_identified', 'agent_investec', 'agent', 'Marginal DSCR breach (2bps). Mezz breach NOTIFIED to regulator.', '2026-01-26 09:00:00'),
('covcertv_008_f', 'covcert_008', 'covenant_certificate.waiver_requested', 'breach_identified', 'waiver_requested', 'spv_excelsior', 'borrower', 'Borrower requested waiver — breach non-recurring, fwd DSCR 1.34', '2026-01-30 09:00:00'),
('covcertv_008_g', 'covcert_008', 'covenant_certificate.waiver_granted', 'waiver_requested', 'waiver_granted', 'lender_investec', 'lender', 'Majority lenders GRANTED one-off waiver, conditional on no further Q1 breach. Closed-with-waiver.', '2026-02-12 09:00:00');

-- covcert_009 (cured — subordinated flagship, full breach→cure→cured)
INSERT OR IGNORE INTO oe_covenant_certificate_events (id, certificate_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('covcertv_009_a', 'covcert_009', 'covenant_certificate.certificate_due', null, 'certificate_due', 'spv_copperton', 'borrower', 'Q4-2025 sub-debt certificate scheduled', '2025-12-31 23:59:00'),
('covcertv_009_b', 'covcert_009', 'covenant_certificate.certificate_submitted', 'certificate_due', 'certificate_submitted', 'spv_copperton', 'borrower', 'Certificate filed', '2026-01-14 09:00:00'),
('covcertv_009_c', 'covcert_009', 'covenant_certificate.under_review', 'certificate_submitted', 'under_review', 'agent_investec', 'agent', 'Agent reviewing weak-wind quarter DSCR', '2026-01-19 09:00:00'),
('covcertv_009_d', 'covcert_009', 'covenant_certificate.ratios_verified', 'under_review', 'ratios_verified', 'agent_investec', 'agent', 'DSCR 1.04 vs 1.05 verified — marginal sub-debt breach', '2026-01-23 09:00:00'),
('covcertv_009_e', 'covcert_009', 'covenant_certificate.breach_identified', 'ratios_verified', 'breach_identified', 'agent_investec', 'agent', 'Sub-debt DSCR breach. NOT regulator-reportable (junior tier).', '2026-01-27 09:00:00'),
('covcertv_009_f', 'covcert_009', 'covenant_certificate.cure_period', 'breach_identified', 'cure_period', 'agent_investec', 'agent', 'Cure period opened — borrower invokes equity-cure right (60-day window)', '2026-02-03 09:00:00'),
('covcertv_009_g', 'covcert_009', 'covenant_certificate.cured', 'cure_period', 'cured', 'agent_investec', 'agent', 'Sponsor injected R45m to DSRA — effective DSCR 1.19. Agent re-tested; CURED within window.', '2026-03-20 09:00:00');

-- covcert_010 (accelerated — senior, crosses ALL, W30 dsb_008 provenance)
INSERT OR IGNORE INTO oe_covenant_certificate_events (id, certificate_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('covcertv_010_a', 'covcert_010', 'covenant_certificate.certificate_due', null, 'certificate_due', 'spv_coega', 'borrower', 'Q1-2026 certificate scheduled — facility flagged after W30 dsb_008 UoP diversion', '2026-03-31 23:59:00'),
('covcertv_010_b', 'covcert_010', 'covenant_certificate.certificate_submitted', 'certificate_due', 'certificate_submitted', 'spv_coega', 'borrower', 'Certificate filed showing severe ratio deterioration', '2026-04-15 09:00:00'),
('covcertv_010_c', 'covcert_010', 'covenant_certificate.under_review', 'certificate_submitted', 'under_review', 'agent_stanbank', 'agent', 'Agent reviewing alongside the W30 UoP-diversion clawback (dsb_008)', '2026-04-18 09:00:00'),
('covcertv_010_d', 'covcert_010', 'covenant_certificate.ratios_verified', 'under_review', 'ratios_verified', 'agent_stanbank', 'agent', 'DSCR 0.91 / LLCR 1.18 / gearing 0.91 verified — severe multi-covenant breach', '2026-04-22 09:00:00'),
('covcertv_010_e', 'covcert_010', 'covenant_certificate.breach_identified', 'ratios_verified', 'breach_identified', 'agent_stanbank', 'agent', 'Severe breach + W30 UoP diversion (misrepresentation EoD). Senior breach NOTIFIED to regulator.', '2026-04-25 09:00:00'),
('covcertv_010_f', 'covcert_010', 'covenant_certificate.accelerated', 'breach_identified', 'accelerated', 'lender_stanbank', 'lender', 'EVENT OF DEFAULT declared — facility ACCELERATED, R5.87bn called. Cross-default to mezz+sub. NOTIFIED to regulator (crosses ALL tiers).', '2026-05-06 09:00:00');
