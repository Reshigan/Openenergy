-- Wave 45 — Lender Loan Default & Enforcement / Step-in seed data.
-- 10 prod-realistic cases across 10 of 12 states (omits standalone
-- reservation_of_rights — traversed inside the ldef_005 cured flagship — and
-- standstill — traversed inside the ldef_008 restructured flagship) + 3 tiers.
-- SA REIPPPP project-finance facilities (wind/solar/storage SPVs). Borrower =
-- project company; lender drives the workout; security agent (trustee) enforces.
-- Cross-wave provenance: the W38 covcert_010 Coega accelerated certificate feeds
-- the ldef_006 acceleration (clean W38→W45 hand-off); a W6 dunning cycle-3
-- expiry feeds the ldef_010 write-off.

-- 1) default_flagged — senior, payment miss just flagged (SLA breached)
INSERT OR IGNORE INTO oe_loan_defaults (
  id, default_number,
  borrower_party_id, borrower_party_name, lender_name, security_agent_name,
  facility_name, facility_tier, facility_limit, outstanding_principal,
  default_type, default_event, days_past_due, flag_ref, flag_basis,
  chain_status, default_flagged_at, sla_deadline_at, created_by
) VALUES (
  'ldef_001', 'LDEF-2026-0001',
  'spv_ishwati', 'Ishwati Emoyeni Wind (RF) (Pty) Ltd', 'Standard Bank / DBSA', 'Standard Bank (Security Agent)',
  'Ishwati Emoyeni Wind Senior Facility', 'senior_secured', 4600000000, 3820000000,
  'payment', 'Senior debt-service payment of R71.4m missed on the 2026-05-25 due date', 35, 'FLAG-2026-0001',
  'Scheduled senior debt-service payment of R71.4m (interest + principal) not received on the 2026-05-25 due date. Grace period (3 business days) lapsed; payment default flagged for review. Borrower cites a delayed Eskom settlement receipt.',
  'default_flagged', '2026-05-25 09:00:00', '2026-05-27 09:00:00', 'demo_lender_001'
);

-- 2) under_review — mezz, covenant event of default under assessment (SLA breached)
INSERT OR IGNORE INTO oe_loan_defaults (
  id, default_number,
  borrower_party_id, borrower_party_name, lender_name, security_agent_name,
  facility_name, facility_tier, facility_limit, outstanding_principal,
  default_type, default_event, flag_ref, flag_basis, review_basis,
  chain_status, default_flagged_at, under_review_at, sla_deadline_at, created_by
) VALUES (
  'ldef_002', 'LDEF-2026-0002',
  'spv_kangnas', 'Kangnas Wind Farm (RF) (Pty) Ltd', 'Nedbank / Old Mutual', 'Nedbank (Security Agent)',
  'Kangnas Wind Mezzanine Facility', 'mezzanine', 1450000000, 1180000000,
  'covenant', 'DSCR covenant breach crystallising into an event of default (second consecutive test failure)', 'FLAG-2026-0002',
  'Second consecutive DSCR test failure on the mezzanine facility — a single breach is curable, but two consecutive breaches constitute an event of default under cl. 23.2 of the facility agreement.',
  'Workout team assessing whether the second-test failure is a true EoD or curable. Reviewing the W38 covenant-certificate history + the borrower''s remediation proposal before deciding on a reservation of rights vs default notice.',
  'under_review', '2026-05-10 09:00:00', '2026-05-14 09:00:00', '2026-05-24 09:00:00', 'demo_lender_001'
);

-- 3) default_notice_issued — mezz, formal default notice served (SLA breached)
INSERT OR IGNORE INTO oe_loan_defaults (
  id, default_number,
  borrower_party_id, borrower_party_name, lender_name, security_agent_name,
  facility_name, facility_tier, facility_limit, outstanding_principal,
  default_type, default_event, flag_ref, notice_ref, flag_basis, review_basis, notice_basis,
  chain_status, default_flagged_at, under_review_at, default_notice_issued_at, sla_deadline_at, created_by
) VALUES (
  'ldef_003', 'LDEF-2026-0003',
  'spv_perdekraal', 'Perdekraal East Wind Farm (RF) (Pty) Ltd', 'Nedbank / Sanlam', 'Nedbank (Security Agent)',
  'Perdekraal East Wind Mezzanine Facility', 'mezzanine', 1100000000, 940000000,
  'covenant', 'Gearing covenant event of default — sponsor equity injection failed to materialise', 'FLAG-2026-0003', 'NOTICE-2026-0003',
  'Gearing 0.86 vs 0.80 covenant after the promised sponsor equity injection of R95m failed to land by the long-stop date.',
  'Workout team confirmed the equity injection is no longer forthcoming (sponsor liquidity stress). The timing-waiver basis has fallen away; this is now a substantive EoD.',
  'Formal default notice served under cl. 23.5 — borrower required to remedy or propose a cure plan within the contractual window, failing which the lenders reserve the right to accelerate.',
  'default_notice_issued', '2026-05-02 09:00:00', '2026-05-06 09:00:00', '2026-05-12 09:00:00', '2026-05-22 09:00:00', 'demo_lender_001'
);

-- 4) cure_period — subordinated, in the contractual cure window (cure_deadline set)
INSERT OR IGNORE INTO oe_loan_defaults (
  id, default_number,
  borrower_party_id, borrower_party_name, lender_name, security_agent_name,
  facility_name, facility_tier, facility_limit, outstanding_principal,
  default_type, default_event, days_past_due, flag_ref, notice_ref, cure_ref,
  flag_basis, review_basis, notice_basis, cure_basis,
  chain_status, default_flagged_at, under_review_at, default_notice_issued_at, cure_period_at, cure_deadline_at, sla_deadline_at, created_by
) VALUES (
  'ldef_004', 'LDEF-2026-0004',
  'spv_garob', 'Garob Wind Farm (RF) (Pty) Ltd', 'Investec / Futuregrowth', 'Investec (Security Agent)',
  'Garob Wind Subordinated Facility', 'subordinated', 720000000, 540000000,
  'payment', 'Subordinated interest payment of R8.9m missed; cure window open', 22, 'FLAG-2026-0004', 'NOTICE-2026-0004', 'CURE-2026-0004',
  'Subordinated interest payment of R8.9m missed after a weak-wind quarter compressed cash available for debt service.',
  'Reviewed; genuine short-term liquidity gap, not a solvency event. Sub-debt sits behind a healthy senior facility.',
  'Default notice served; borrower granted the 60-day contractual cure period to make good the missed payment plus default interest.',
  'Borrower committed to a sponsor shareholder loan of R12m to clear arrears + default interest by the cure long-stop. Funds in escrow; release pending sponsor board approval.',
  'cure_period', '2026-04-20 09:00:00', '2026-04-24 09:00:00', '2026-04-28 09:00:00', '2026-05-02 09:00:00', '2026-07-01 09:00:00', '2026-07-01 09:00:00', 'demo_lender_001'
);

-- 5) cured — subordinated, FULL happy arc flagship (traverses reservation_of_rights); junior cure NOT reportable
INSERT OR IGNORE INTO oe_loan_defaults (
  id, default_number,
  borrower_party_id, borrower_party_name, lender_name, security_agent_name,
  facility_name, facility_tier, facility_limit, outstanding_principal,
  default_type, default_event, days_past_due, flag_ref, notice_ref, cure_ref,
  flag_basis, review_basis, notice_basis, cure_basis, reason_code, rod_notes,
  chain_status, default_flagged_at, under_review_at, reservation_of_rights_at, default_notice_issued_at, cure_period_at, cured_at, created_by
) VALUES (
  'ldef_005', 'LDEF-2025-0188',
  'spv_copperton', 'Copperton Wind Farm (RF) (Pty) Ltd', 'Futuregrowth / Old Mutual', 'Investec (Security Agent)',
  'Copperton Wind Subordinated Facility', 'subordinated', 640000000, 510000000,
  'payment', 'Subordinated debt-service shortfall after a weak-wind quarter — fully cured', 18, 'FLAG-2025-0188', 'NOTICE-2025-0188', 'CURE-2025-0188',
  'Subordinated debt-service shortfall of R6.2m after a weak-wind quarter.',
  'Assessed as a curable short-term liquidity gap; reservation of rights issued while the borrower arranged a cure.',
  'Default notice served with the 60-day cure window.',
  'Sponsor injected R6.5m via shareholder loan, clearing arrears + default interest. Lender confirmed receipt and re-tested debt-service cover. Cured within the window.',
  'equity_cure_completed', 'Full default→review→reservation of rights→notice→cure→cured arc. Junior-tier cure — NOT regulator-reportable. Period closed cured; reservation of rights preserved for future defaults.',
  'cured', '2025-11-10 09:00:00', '2025-11-14 09:00:00', '2025-11-18 09:00:00', '2025-11-22 09:00:00', '2025-11-28 09:00:00', '2026-01-12 09:00:00', 'admin'
);

-- 6) accelerated — senior, event of default declared + facility called (crosses senior+mezz) — W38 covcert_010 Coega provenance
INSERT OR IGNORE INTO oe_loan_defaults (
  id, default_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  borrower_party_id, borrower_party_name, lender_name, security_agent_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, accelerated_amount,
  default_type, default_event, flag_ref, notice_ref, acceleration_ref,
  flag_basis, review_basis, notice_basis, acceleration_basis, reason_code, rod_notes,
  chain_status, default_flagged_at, under_review_at, default_notice_issued_at, accelerated_at, sla_deadline_at, created_by
) VALUES (
  'ldef_006', 'LDEF-2026-0006',
  'covenant_certificate.accelerated', 'covenant_certificate', 'covcert_010', 'W38',
  'spv_coega', 'Coega Wind & Storage (RF) (Pty) Ltd', 'Standard Bank / DBSA / IDC / AfDB', 'Standard Bank (Security Agent)',
  'Coega Wind & Storage Senior Facility', 'senior_secured', 6900000000, 5870000000, 5870000000,
  'cross_default', 'Event of default flowing from the W38 covcert_010 accelerated certificate + W30 dsb_008 UoP diversion', 'FLAG-2026-0006', 'NOTICE-2026-0006', 'ACCEL-2026-0006',
  'The W38 Coega compliance certificate (covcert_010) was accelerated on a severe multi-covenant breach compounded by the W30 dsb_008 use-of-proceeds diversion (R510m of senior debt diverted off-purpose). That acceleration flags a formal loan default here.',
  'Workout team confirmed the misrepresentation event of default (UoP diversion) is non-curable and the covenant acceleration stands. Cross-default triggered across the mezz + sub tranches.',
  'Default notice served confirming the event of default and the lenders'' intention to accelerate absent immediate cure (none available given the misrepresentation EoD).',
  'Majority lenders DECLARED an event of default and ACCELERATED the senior facility — full outstanding R5.87bn called immediately. Security agent instructed to prepare for enforcement / step-in. NOTIFIED to regulator (acceleration crosses senior + mezz — SARB large-exposure).',
  'event_of_default_uop_diversion', 'Facility accelerated; R5.87bn called. Cross-default notices issued to mezz + sub. Security enforcement / step-in to follow. Linked to W38 covcert_010 + W30 dsb_008 (Coega R510m UoP diversion).',
  'accelerated', '2026-05-08 09:00:00', '2026-05-12 09:00:00', '2026-05-16 09:00:00', '2026-05-20 09:00:00', '2026-05-30 09:00:00', 'admin'
);

-- 7) enforcement_commenced — mezz, security enforcement / step-in underway (crosses senior+mezz)
INSERT OR IGNORE INTO oe_loan_defaults (
  id, default_number,
  borrower_party_id, borrower_party_name, lender_name, security_agent_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, accelerated_amount,
  default_type, default_event, flag_ref, notice_ref, acceleration_ref, enforcement_ref,
  flag_basis, notice_basis, acceleration_basis, enforcement_basis, reason_code, rod_notes,
  chain_status, default_flagged_at, under_review_at, default_notice_issued_at, accelerated_at, enforcement_commenced_at, sla_deadline_at, created_by
) VALUES (
  'ldef_007', 'LDEF-2026-0007',
  'spv_dyasonsklip', 'Dyason''s Klip 1 Solar (RF) (Pty) Ltd', 'Absa / RMB', 'Absa (Security Agent)',
  'Dyason''s Klip 1 Solar Mezzanine Facility', 'mezzanine', 1320000000, 1150000000, 1150000000,
  'covenant', 'Sustained covenant default, no viable cure — security enforcement commenced', 'FLAG-2026-0007', 'NOTICE-2026-0007', 'ACCEL-2026-0007', 'ENF-2026-0007',
  'Sustained LLCR + DSCR default over three consecutive tests with a deteriorating cash-flow trajectory; no viable cure plan tabled.',
  'Default notice served; no cure forthcoming. Lenders resolved to accelerate.',
  'Mezzanine facility accelerated — R1.15bn called. Cross-default to the senior tranche acknowledged by the senior agent.',
  'Security agent commenced enforcement of the security package — notarial bond over moveables perfected, cession of project accounts called up, and a step-in notice served under the direct agreement with the offtaker. Independent operator on standby to assume O&M. NOTIFIED to regulator (mezz enforcement crosses — SARB large-exposure).',
  'security_enforcement_stepin', 'Enforcement / step-in underway. Security agent realising the security package; step-in to preserve the PPA cash-flows pending sale or restructure. Realisation window running.',
  'enforcement_commenced', '2026-03-15 09:00:00', '2026-03-20 09:00:00', '2026-03-28 09:00:00', '2026-04-10 09:00:00', '2026-05-15 09:00:00', '2026-09-12 09:00:00', 'demo_lender_001'
);

-- 8) restructured — mezz, workout via standstill (traverses standstill) — W21 dd_005 Excelsior facility
INSERT OR IGNORE INTO oe_loan_defaults (
  id, default_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  borrower_party_id, borrower_party_name, lender_name, security_agent_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, accelerated_amount, recovery_amount,
  default_type, default_event, flag_ref, notice_ref, acceleration_ref, standstill_ref, restructure_ref,
  flag_basis, notice_basis, acceleration_basis, standstill_basis, restructure_basis, reason_code, rod_notes,
  chain_status, default_flagged_at, under_review_at, default_notice_issued_at, accelerated_at, standstill_at, restructured_at, created_by
) VALUES (
  'ldef_008', 'LDEF-2026-0008',
  'drawdown.funded', 'drawdown_chain', 'dd_005', 'W21',
  'spv_excelsior', 'Excelsior Wind Farm (RF) (Pty) Ltd', 'Investec / Futuregrowth', 'Investec (Security Agent)',
  'Excelsior Wind Mezzanine Facility', 'mezzanine', 980000000, 860000000, 860000000, 860000000,
  'covenant', 'Recurring DSCR default on the W21-funded facility — resolved via a consensual restructure', 'FLAG-2026-0008', 'NOTICE-2026-0008', 'ACCEL-2026-0008', 'STDSTL-2026-0008', 'RESTR-2026-0008',
  'Recurring DSCR default on the W21-funded Excelsior facility (dd_005) after sustained tariff pressure eroded debt-service cover.',
  'Default notice served; borrower engaged constructively with a credible deleveraging proposal.',
  'Facility accelerated to bring the borrower to the table, R860m called.',
  'Lenders agreed a 90-day standstill (forbearance) — enforcement suspended while the parties negotiated terms. No security realisation during the standstill.',
  'Consensual restructure agreed: maturity extended 24 months, margin stepped up 75bps, a R120m sponsor equity cure injected, and a cash-sweep added. Facility reinstated on amended terms; default cured by restructure. Recovery effectively full (R860m preserved).',
  'consensual_restructure', 'Workout resolved via standstill → restructure rather than enforcement. Maturity extended + cash-sweep + equity cure. Linked to W21 drawdown dd_005. Demonstrates the standstill → restructured workout path.',
  'restructured', '2026-01-20 09:00:00', '2026-01-25 09:00:00', '2026-02-02 09:00:00', '2026-02-14 09:00:00', '2026-02-28 09:00:00', '2026-05-10 09:00:00', 'admin'
);

-- 9) enforced_closed — senior, insolvency default → enforcement → security realised + closed
INSERT OR IGNORE INTO oe_loan_defaults (
  id, default_number,
  borrower_party_id, borrower_party_name, lender_name, security_agent_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, accelerated_amount, recovery_amount, write_off_amount,
  default_type, default_event, flag_ref, notice_ref, acceleration_ref, enforcement_ref,
  flag_basis, notice_basis, acceleration_basis, enforcement_basis, reason_code, rod_notes,
  chain_status, default_flagged_at, under_review_at, default_notice_issued_at, accelerated_at, enforcement_commenced_at, enforced_closed_at, created_by
) VALUES (
  'ldef_009', 'LDEF-2025-0204',
  'spv_khobab', 'Khobab Wind Farm (RF) (Pty) Ltd', 'Standard Bank / DBSA', 'Standard Bank (Security Agent)',
  'Khobab Wind Senior Facility', 'senior_secured', 5100000000, 4280000000, 4280000000, 3960000000, 320000000,
  'insolvency', 'Sponsor insolvency triggered an immediate event of default; security realised', 'FLAG-2025-0204', 'NOTICE-2025-0204', 'ACCEL-2025-0204', 'ENF-2025-0204',
  'The majority sponsor was placed in business rescue, triggering an immediate (automatic) event of default under the insolvency clause.',
  'Default notice served; the insolvency EoD is non-curable.',
  'Senior facility accelerated — R4.28bn called immediately.',
  'Security agent stepped in under the direct agreements, ran a competitive sale of the project to a replacement sponsor, and realised R3.96bn of the R4.28bn outstanding. Residual R320m written down at close. Enforcement formally closed on completion of the sale.',
  'sponsor_insolvency_realised', 'Enforcement closed — project sold to a replacement sponsor, R3.96bn recovered (92%), R320m residual loss. PPA preserved (no offtaker disruption). Clean step-in / realisation outcome.',
  'enforced_closed', '2025-09-05 09:00:00', '2025-09-09 09:00:00', '2025-09-15 09:00:00', '2025-09-22 09:00:00', '2025-10-10 09:00:00', '2026-02-18 09:00:00', 'admin'
);

-- 10) written_off — senior, terminal loss crystallised (crosses ALL tiers) — W6 dunning cycle-3 provenance
INSERT OR IGNORE INTO oe_loan_defaults (
  id, default_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  borrower_party_id, borrower_party_name, lender_name, security_agent_name,
  facility_name, facility_tier, facility_limit, outstanding_principal, accelerated_amount, recovery_amount, write_off_amount,
  default_type, default_event, flag_ref, notice_ref, acceleration_ref, reason_code,
  flag_basis, notice_basis, acceleration_basis, rod_notes,
  chain_status, default_flagged_at, under_review_at, default_notice_issued_at, accelerated_at, written_off_at, created_by
) VALUES (
  'ldef_010', 'LDEF-2025-0211',
  'covenant_dunning.cycle_3_expired', 'lender_dunning', 'dun_2025_0017', 'W6',
  'spv_tomburke', 'Tom Burke Solar (RF) (Pty) Ltd', 'Nedbank / IDC', 'Nedbank (Security Agent)',
  'Tom Burke Solar Senior Facility', 'senior_secured', 980000000, 612000000, 612000000, 138000000, 474000000,
  'moratorium', 'Cycle-3 dunning expiry → uncured default → acceleration → write-off after failed enforcement', 'FLAG-2025-0211', 'NOTICE-2025-0211', 'ACCEL-2025-0211', 'unrecoverable_loss_written_off',
  'The W6 covenant-dunning cycle escalated to cycle-3 expiry (dun_2025_0017) with the borrower in default and no cure — a stranded sub-scale solar asset with a curtailed offtake and depressed resale value.',
  'Default notice served on cycle-3 expiry; borrower in moratorium with no realistic cure.',
  'Facility accelerated — R612m called. Enforcement realised only R138m on a distressed sale of a degraded, partially curtailed asset.',
  'Residual R474m crystallised as an unrecoverable loss and WRITTEN OFF after the distressed realisation. Impairment booked; NOTIFIED to regulator (write-off crosses ALL tiers — realised credit loss / SARB impairment hard line). Linked to W6 dunning cycle-3 expiry dun_2025_0017.',
  'written_off', '2025-08-12 09:00:00', '2025-08-16 09:00:00', '2025-08-22 09:00:00', '2025-09-05 09:00:00', '2026-01-30 09:00:00', 'admin'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- ldef_001 (default_flagged)
INSERT OR IGNORE INTO oe_loan_defaults_events (id, default_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ldefv_001_a', 'ldef_001', 'loan_default.default_flagged', null, 'default_flagged', 'demo_lender_001', 'lender', 'Senior debt-service payment of R71.4m missed; grace period lapsed — payment default flagged', '2026-05-25 09:00:00');

-- ldef_002 (under_review)
INSERT OR IGNORE INTO oe_loan_defaults_events (id, default_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ldefv_002_a', 'ldef_002', 'loan_default.default_flagged', null, 'default_flagged', 'demo_lender_001', 'lender', 'Second consecutive DSCR test failure — potential EoD flagged', '2026-05-10 09:00:00'),
('ldefv_002_b', 'ldef_002', 'loan_default.under_review', 'default_flagged', 'under_review', 'demo_lender_001', 'lender', 'Workout team assessing whether the second-test failure is a true EoD or curable', '2026-05-14 09:00:00');

-- ldef_003 (default_notice_issued)
INSERT OR IGNORE INTO oe_loan_defaults_events (id, default_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ldefv_003_a', 'ldef_003', 'loan_default.default_flagged', null, 'default_flagged', 'demo_lender_001', 'lender', 'Gearing EoD flagged — sponsor equity injection failed to materialise', '2026-05-02 09:00:00'),
('ldefv_003_b', 'ldef_003', 'loan_default.under_review', 'default_flagged', 'under_review', 'demo_lender_001', 'lender', 'Equity injection confirmed not forthcoming — substantive EoD', '2026-05-06 09:00:00'),
('ldefv_003_c', 'ldef_003', 'loan_default.default_notice_issued', 'under_review', 'default_notice_issued', 'demo_lender_001', 'lender', 'Formal default notice served under cl. 23.5', '2026-05-12 09:00:00');

-- ldef_004 (cure_period)
INSERT OR IGNORE INTO oe_loan_defaults_events (id, default_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ldefv_004_a', 'ldef_004', 'loan_default.default_flagged', null, 'default_flagged', 'demo_lender_001', 'lender', 'Subordinated interest payment of R8.9m missed — flagged', '2026-04-20 09:00:00'),
('ldefv_004_b', 'ldef_004', 'loan_default.under_review', 'default_flagged', 'under_review', 'demo_lender_001', 'lender', 'Assessed as a short-term liquidity gap, not a solvency event', '2026-04-24 09:00:00'),
('ldefv_004_c', 'ldef_004', 'loan_default.default_notice_issued', 'under_review', 'default_notice_issued', 'demo_lender_001', 'lender', 'Default notice served', '2026-04-28 09:00:00'),
('ldefv_004_d', 'ldef_004', 'loan_default.cure_period', 'default_notice_issued', 'cure_period', 'demo_lender_001', 'lender', '60-day cure period opened — borrower arranging a R12m sponsor shareholder loan', '2026-05-02 09:00:00');

-- ldef_005 (cured — FULL happy arc, traverses reservation_of_rights)
INSERT OR IGNORE INTO oe_loan_defaults_events (id, default_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ldefv_005_a', 'ldef_005', 'loan_default.default_flagged', null, 'default_flagged', 'demo_lender_001', 'lender', 'Subordinated debt-service shortfall of R6.2m flagged', '2025-11-10 09:00:00'),
('ldefv_005_b', 'ldef_005', 'loan_default.under_review', 'default_flagged', 'under_review', 'demo_lender_001', 'lender', 'Assessed as a curable short-term liquidity gap', '2025-11-14 09:00:00'),
('ldefv_005_c', 'ldef_005', 'loan_default.reservation_of_rights', 'under_review', 'reservation_of_rights', 'demo_lender_001', 'lender', 'Reservation of rights issued while the borrower arranged a cure', '2025-11-18 09:00:00'),
('ldefv_005_d', 'ldef_005', 'loan_default.default_notice_issued', 'reservation_of_rights', 'default_notice_issued', 'demo_lender_001', 'lender', 'Default notice served with the 60-day cure window', '2025-11-22 09:00:00'),
('ldefv_005_e', 'ldef_005', 'loan_default.cure_period', 'default_notice_issued', 'cure_period', 'demo_lender_001', 'lender', 'Cure period opened', '2025-11-28 09:00:00'),
('ldefv_005_f', 'ldef_005', 'loan_default.cured', 'cure_period', 'cured', 'spv_copperton', 'borrower', 'Sponsor injected R6.5m clearing arrears + default interest; lender re-tested and confirmed CURED within the window', '2026-01-12 09:00:00');

-- ldef_006 (accelerated — W38 covcert_010 provenance)
INSERT OR IGNORE INTO oe_loan_defaults_events (id, default_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ldefv_006_a', 'ldef_006', 'loan_default.default_flagged', null, 'default_flagged', 'admin', 'lender', 'Default flagged off the W38 covcert_010 accelerated certificate + W30 dsb_008 UoP diversion', '2026-05-08 09:00:00'),
('ldefv_006_b', 'ldef_006', 'loan_default.under_review', 'default_flagged', 'under_review', 'admin', 'lender', 'Misrepresentation EoD (UoP diversion) confirmed non-curable; cross-default triggered', '2026-05-12 09:00:00'),
('ldefv_006_c', 'ldef_006', 'loan_default.default_notice_issued', 'under_review', 'default_notice_issued', 'admin', 'lender', 'Default notice served confirming the event of default', '2026-05-16 09:00:00'),
('ldefv_006_d', 'ldef_006', 'loan_default.accelerated', 'default_notice_issued', 'accelerated', 'lender_stanbank', 'lender', 'EVENT OF DEFAULT declared — senior facility ACCELERATED, R5.87bn called. NOTIFIED to regulator (crosses senior + mezz).', '2026-05-20 09:00:00');

-- ldef_007 (enforcement_commenced)
INSERT OR IGNORE INTO oe_loan_defaults_events (id, default_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ldefv_007_a', 'ldef_007', 'loan_default.default_flagged', null, 'default_flagged', 'demo_lender_001', 'lender', 'Sustained LLCR + DSCR default flagged', '2026-03-15 09:00:00'),
('ldefv_007_b', 'ldef_007', 'loan_default.under_review', 'default_flagged', 'under_review', 'demo_lender_001', 'lender', 'No viable cure plan tabled — deteriorating cash-flow trajectory', '2026-03-20 09:00:00'),
('ldefv_007_c', 'ldef_007', 'loan_default.default_notice_issued', 'under_review', 'default_notice_issued', 'demo_lender_001', 'lender', 'Default notice served; no cure forthcoming', '2026-03-28 09:00:00'),
('ldefv_007_d', 'ldef_007', 'loan_default.accelerated', 'default_notice_issued', 'accelerated', 'lender_absa', 'lender', 'Mezzanine facility accelerated — R1.15bn called', '2026-04-10 09:00:00'),
('ldefv_007_e', 'ldef_007', 'loan_default.enforcement_commenced', 'accelerated', 'enforcement_commenced', 'secagent_absa', 'security_agent', 'Security enforcement commenced — notarial bond perfected, project accounts called up, step-in notice served. NOTIFIED to regulator (mezz crosses).', '2026-05-15 09:00:00');

-- ldef_008 (restructured — traverses standstill, W21 dd_005 provenance)
INSERT OR IGNORE INTO oe_loan_defaults_events (id, default_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ldefv_008_a', 'ldef_008', 'loan_default.default_flagged', null, 'default_flagged', 'demo_lender_001', 'lender', 'Recurring DSCR default on the W21-funded Excelsior facility (dd_005) flagged', '2026-01-20 09:00:00'),
('ldefv_008_b', 'ldef_008', 'loan_default.under_review', 'default_flagged', 'under_review', 'demo_lender_001', 'lender', 'Borrower engaged with a credible deleveraging proposal', '2026-01-25 09:00:00'),
('ldefv_008_c', 'ldef_008', 'loan_default.default_notice_issued', 'under_review', 'default_notice_issued', 'demo_lender_001', 'lender', 'Default notice served', '2026-02-02 09:00:00'),
('ldefv_008_d', 'ldef_008', 'loan_default.accelerated', 'default_notice_issued', 'accelerated', 'lender_investec', 'lender', 'Facility accelerated to bring the borrower to the table — R860m called', '2026-02-14 09:00:00'),
('ldefv_008_e', 'ldef_008', 'loan_default.standstill', 'accelerated', 'standstill', 'lender_investec', 'lender', '90-day standstill (forbearance) agreed — enforcement suspended during negotiations', '2026-02-28 09:00:00'),
('ldefv_008_f', 'ldef_008', 'loan_default.restructured', 'standstill', 'restructured', 'lender_investec', 'lender', 'Consensual RESTRUCTURE agreed — maturity +24mo, margin +75bps, R120m equity cure, cash-sweep added. Facility reinstated; recovery effectively full.', '2026-05-10 09:00:00');

-- ldef_009 (enforced_closed)
INSERT OR IGNORE INTO oe_loan_defaults_events (id, default_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ldefv_009_a', 'ldef_009', 'loan_default.default_flagged', null, 'default_flagged', 'admin', 'lender', 'Majority sponsor placed in business rescue — automatic insolvency EoD flagged', '2025-09-05 09:00:00'),
('ldefv_009_b', 'ldef_009', 'loan_default.under_review', 'default_flagged', 'under_review', 'admin', 'lender', 'Insolvency EoD confirmed non-curable', '2025-09-09 09:00:00'),
('ldefv_009_c', 'ldef_009', 'loan_default.default_notice_issued', 'under_review', 'default_notice_issued', 'admin', 'lender', 'Default notice served', '2025-09-15 09:00:00'),
('ldefv_009_d', 'ldef_009', 'loan_default.accelerated', 'default_notice_issued', 'accelerated', 'lender_stanbank', 'lender', 'Senior facility accelerated — R4.28bn called', '2025-09-22 09:00:00'),
('ldefv_009_e', 'ldef_009', 'loan_default.enforcement_commenced', 'accelerated', 'enforcement_commenced', 'secagent_stanbank', 'security_agent', 'Security agent stepped in under the direct agreements; competitive sale of the project launched', '2025-10-10 09:00:00'),
('ldefv_009_f', 'ldef_009', 'loan_default.enforced_closed', 'enforcement_commenced', 'enforced_closed', 'secagent_stanbank', 'security_agent', 'Enforcement CLOSED — project sold to a replacement sponsor, R3.96bn recovered (92%), R320m residual loss. PPA preserved.', '2026-02-18 09:00:00');

-- ldef_010 (written_off — W6 dunning provenance, crosses ALL)
INSERT OR IGNORE INTO oe_loan_defaults_events (id, default_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ldefv_010_a', 'ldef_010', 'loan_default.default_flagged', null, 'default_flagged', 'admin', 'lender', 'W6 dunning cycle-3 expiry (dun_2025_0017) — uncured default flagged', '2025-08-12 09:00:00'),
('ldefv_010_b', 'ldef_010', 'loan_default.under_review', 'default_flagged', 'under_review', 'admin', 'lender', 'Borrower in moratorium with no realistic cure — stranded sub-scale asset', '2025-08-16 09:00:00'),
('ldefv_010_c', 'ldef_010', 'loan_default.default_notice_issued', 'under_review', 'default_notice_issued', 'admin', 'lender', 'Default notice served on cycle-3 expiry', '2025-08-22 09:00:00'),
('ldefv_010_d', 'ldef_010', 'loan_default.accelerated', 'default_notice_issued', 'accelerated', 'lender_nedbank', 'lender', 'Facility accelerated — R612m called; distressed realisation recovered only R138m', '2025-09-05 09:00:00'),
('ldefv_010_e', 'ldef_010', 'loan_default.written_off', 'accelerated', 'written_off', 'admin', 'lender', 'Residual R474m crystallised as an unrecoverable loss and WRITTEN OFF. Impairment booked. NOTIFIED to regulator (write-off crosses ALL tiers).', '2026-01-30 09:00:00');
