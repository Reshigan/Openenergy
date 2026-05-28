-- Wave 57 — Regulator Embedded-Generation Registration & Schedule 2 Exemption seed.
-- 10 prod-realistic NERSA small-scale / embedded-generation registrations across
-- all 12 states (10 distinct resting states; conditions_pending + registration_approved
-- are traversed inside the sseg_006 registered flagship) + all 5 capacity tiers +
-- every branch. Anchored on real SA registration under ERA 2006 Schedule 2 (as
-- amended): own-use rooftop / C&I solar, agricultural wheeling, large industrial
-- self-generation, and a utility-scale plant for trading/export that falls OUTSIDE
-- Schedule 2 and is REFERRED UP to the W49 full-licensing pipeline (the W57 signature).
-- actor_party records the registration function per step (applicant / registry /
-- verifier / committee). Capacity in kW; capex in R-millions.
--
-- Designed aggregates: total 10; by_tier {micro 2, small 2, medium 2, large 2, utility 2};
-- open 5; terminals registered/referred_to_licensing/refused/withdrawn/lapsed 1 each;
-- breached 2 live (sseg_004 verification large + sseg_005 determination utility past deadline);
-- reportable 2 (sseg_007 referred-utility, sseg_008 refused-large);
-- total_capacity_kw 471090; registered_capacity_kw 8000.

-- 1) registration_received — micro, 60kW residential rooftop just filed
INSERT OR IGNORE INTO oe_sseg_registrations (
  id, registration_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  capacity_tier, generation_purpose, technology, customer_category, facility_name, facility_location, capacity_kw, point_of_connection, distributor, estimated_capex_zar_m, grid_connection_ref,
  application_ref, application_basis,
  chain_status, registration_received_at, sla_deadline_at, created_by
) VALUES (
  'sseg_001', 'NERSA-SSEG-2026-0001',
  'reg_kloof', 'Kloof Residential Solar', 'nersa_reg', 'NERSA — SSEG Registration Committee',
  'micro', 'own_use', 'solar_pv', 'residential', 'Kloof Rooftop PV', 'KwaZulu-Natal — eThekwini', 60, 'LV distribution feeder', 'Eskom Distribution', 1.1, 'GCA-2026-KZN-0451',
  'NERSA-SSEG-APP-2026-0001',
  'A residential prosumer filed a Schedule 2 registration for a 60kW rooftop solar PV installation for own use behind the meter with a small net export allowance. Registration received and logged; eligibility screening pending.',
  'registration_received', '2026-05-27 08:00:00', '2026-06-08 08:00:00', 'demo_regulator_001'
);

-- 2) eligibility_screening — small, 750kW commercial rooftop being screened
INSERT OR IGNORE INTO oe_sseg_registrations (
  id, registration_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  capacity_tier, generation_purpose, technology, customer_category, facility_name, facility_location, capacity_kw, point_of_connection, distributor, estimated_capex_zar_m, grid_connection_ref,
  application_ref, screening_ref, application_basis, screening_basis,
  chain_status, registration_received_at, eligibility_screening_at, sla_deadline_at, created_by
) VALUES (
  'sseg_002', 'NERSA-SSEG-2026-0002',
  'reg_canalwalk', 'Canal Walk Retail Centre', 'nersa_reg', 'NERSA — SSEG Registration Committee',
  'small', 'own_use', 'solar_pv', 'commercial', 'Canal Walk Rooftop PV', 'Western Cape — City of Cape Town', 750, 'MV distribution point of supply', 'City of Cape Town', 9.5, 'GCA-2026-WC-0512',
  'NERSA-SSEG-APP-2026-0002', 'NERSA-SSEG-SCR-2026-0002',
  'A retail centre filed a Schedule 2 registration for a 750kW rooftop solar PV system for own consumption across the centre common areas and tenant supply.',
  'Eligibility screening underway: confirming the own-use configuration, the single point of connection, and that the installed capacity qualifies for the Schedule 2 exemption rather than a generation licence.',
  'eligibility_screening', '2026-05-20 08:00:00', '2026-05-22 09:00:00', '2026-06-06 09:00:00', 'demo_regulator_001'
);

-- 3) information_requested — medium, 5MW agricultural wheeling awaiting further info (round 1)
INSERT OR IGNORE INTO oe_sseg_registrations (
  id, registration_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  capacity_tier, generation_purpose, technology, customer_category, facility_name, facility_location, capacity_kw, point_of_connection, distributor, estimated_capex_zar_m, grid_connection_ref,
  application_ref, screening_ref, info_request_ref, info_request_round,
  application_basis, screening_basis, info_request_basis,
  chain_status, registration_received_at, eligibility_screening_at, information_requested_at, sla_deadline_at, created_by
) VALUES (
  'sseg_003', 'NERSA-SSEG-2026-0003',
  'reg_sundays', 'Sundays River Citrus Estate', 'nersa_reg', 'NERSA — SSEG Registration Committee',
  'medium', 'wheeling', 'solar_pv', 'agricultural', 'Sundays River Solar', 'Eastern Cape — Sarah Baartman', 5000, 'MV distribution point of supply', 'Eskom Distribution', 62, 'GCA-2026-EC-0233',
  'NERSA-SSEG-APP-2026-0003', 'NERSA-SSEG-SCR-2026-0003', 'NERSA-SSEG-RFI-2026-0003', 1,
  'A citrus estate filed a Schedule 2 registration for a 5MW solar PV plant wheeling energy to its packhouse and cold-store loads at a second connection point on the same distributor network.',
  'Eligibility screening identified that a wheeling arrangement across two connection points requires confirmation that the configuration still qualifies for exemption.',
  'Additional information requested: the use-of-system agreement with the distributor, the second point-of-delivery metering plan, and confirmation that no energy is sold to third parties. The applicant has 30 days to respond before the registration lapses.',
  'information_requested', '2026-05-08 08:00:00', '2026-05-13 09:00:00', '2026-05-16 09:00:00', '2026-06-15 09:00:00', 'demo_regulator_001'
);

-- 4) technical_verification — large, 45MW industrial self-generation under verification (BREACHED, mandatory grid study)
INSERT OR IGNORE INTO oe_sseg_registrations (
  id, registration_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  capacity_tier, generation_purpose, technology, customer_category, facility_name, facility_location, capacity_kw, point_of_connection, distributor, estimated_capex_zar_m, grid_connection_ref,
  application_ref, screening_ref, verification_ref,
  application_basis, screening_basis, verification_basis,
  chain_status, registration_received_at, eligibility_screening_at, technical_verification_at, sla_deadline_at, created_by
) VALUES (
  'sseg_004', 'NERSA-SSEG-2026-0004',
  'reg_saldanha', 'Saldanha Steelworks', 'nersa_reg', 'NERSA — SSEG Registration Committee',
  'large', 'own_use', 'solar_battery', 'industrial', 'Saldanha Self-Generation Plant', 'Western Cape — West Coast', 45000, 'MV distribution point of supply', 'Eskom Distribution', 720, 'GCA-2026-WC-0188',
  'NERSA-SSEG-APP-2026-0004', 'NERSA-SSEG-SCR-2026-0004', 'NERSA-SSEG-VER-2026-0004',
  'A steelworks filed a Schedule 2 registration for a 45MW solar plus battery self-generation plant for own industrial process load behind a single point of connection.',
  'Eligibility screening confirmed an own-use configuration above the de-minimis threshold; a technical verification and grid-impact study are mandatory at this capacity.',
  'Technical verification underway: the grid-impact study, the protection coordination at the point of connection, and the embedded-generation compliance certificate are being reviewed. The verification window for a large facility has overrun.',
  'technical_verification', '2026-03-10 08:00:00', '2026-03-14 09:00:00', '2026-03-20 09:00:00', '2026-04-10 09:00:00', 'demo_regulator_001'
);

-- 5) exemption_determination — utility, 150MW plant before the committee (BREACHED, mandatory grid study)
INSERT OR IGNORE INTO oe_sseg_registrations (
  id, registration_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  capacity_tier, generation_purpose, technology, customer_category, facility_name, facility_location, capacity_kw, point_of_connection, distributor, estimated_capex_zar_m, grid_connection_ref,
  application_ref, screening_ref, verification_ref, determination_ref,
  application_basis, screening_basis, verification_basis, determination_basis,
  chain_status, registration_received_at, eligibility_screening_at, technical_verification_at, exemption_determination_at, sla_deadline_at, created_by
) VALUES (
  'sseg_005', 'NERSA-SSEG-2026-0005',
  'reg_mogalakwena', 'Mogalakwena Mine Power', 'nersa_reg', 'NERSA — SSEG Registration Committee',
  'utility', 'own_use', 'solar_battery', 'industrial', 'Mogalakwena Captive Plant', 'Limpopo — Waterberg', 150000, 'transmission point of supply', 'Eskom Transmission', 2450, 'GCA-2025-LP-0077',
  'NERSA-SSEG-APP-2025-0005', 'NERSA-SSEG-SCR-2025-0005', 'NERSA-SSEG-VER-2026-0005', 'NERSA-SSEG-DET-2026-0005',
  'A platinum mine filed a Schedule 2 registration for a 150MW solar plus battery captive plant supplying its own beneficiation and processing load under the 2023 amendment that removed the own-use capacity cap.',
  'Eligibility screening confirmed an own-use captive configuration with no sale to third parties.',
  'Technical verification confirmed the transmission-connection grid-impact study and the protection and metering arrangements.',
  'Exemption determination before the registration committee: the committee is assessing whether the captive own-use configuration qualifies for the Schedule 2 exemption or whether the transmission connection and scale warrant referral. The determination window for a utility facility has overrun.',
  'exemption_determination', '2026-01-20 08:00:00', '2026-02-02 09:00:00', '2026-03-01 09:00:00', '2026-03-15 09:00:00', '2026-04-14 09:00:00', 'demo_regulator_001'
);

-- 6) registered — medium flagship, FULL happy arc through the conditional-approval loop
--    (traverses conditions_pending + registration_approved)
INSERT OR IGNORE INTO oe_sseg_registrations (
  id, registration_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  capacity_tier, generation_purpose, technology, customer_category, facility_name, facility_location, capacity_kw, point_of_connection, distributor, estimated_capex_zar_m, grid_connection_ref,
  application_ref, screening_ref, verification_ref, determination_ref, conditions_ref, certificate_ref,
  application_basis, screening_basis, verification_basis, determination_basis, conditions_basis, approval_basis, rod_notes,
  chain_status, registration_received_at, eligibility_screening_at, technical_verification_at, exemption_determination_at, conditions_pending_at, registration_approved_at, registered_at, created_by
) VALUES (
  'sseg_006', 'NERSA-SSEG-2026-0006',
  'reg_clairwood', 'Clairwood Logistics Park', 'nersa_reg', 'NERSA — SSEG Registration Committee',
  'medium', 'own_use', 'solar_pv', 'commercial', 'Clairwood Rooftop and Carport PV', 'KwaZulu-Natal — eThekwini', 8000, 'MV distribution point of supply', 'eThekwini Electricity', 105, 'GCA-2025-KZN-0399',
  'NERSA-SSEG-APP-2025-0006', 'NERSA-SSEG-SCR-2025-0006', 'NERSA-SSEG-VER-2026-0006', 'NERSA-SSEG-DET-2026-0006', 'NERSA-SSEG-CON-2026-0006', 'NERSA-SSEG-CERT-2026-0142',
  'A logistics park filed a Schedule 2 registration for an 8MW rooftop and carport solar PV system for own use across its warehouse and tenant loads.',
  'Eligibility screening confirmed an own-use configuration behind a single point of connection.',
  'Technical verification confirmed the grid-impact assessment and the protection coordination at the connection point.',
  'Exemption determination: the committee found the facility qualifies for the Schedule 2 exemption subject to conditions.',
  'Conditions imposed: an updated embedded-generation compliance certificate and a finalised reverse-power protection setting were required before registration.',
  'Conditions satisfied by the applicant; the committee approved the registration and a certificate was issued.',
  'REGISTERED. Full happy-path arc through the conditional-approval loop: received then screening then verification then determination then conditions_pending then registration_approved then registered. Certificate NERSA-SSEG-CERT-2026-0142 issued.',
  'registered', '2025-12-01 08:00:00', '2025-12-08 09:00:00', '2025-12-18 09:00:00', '2026-01-08 09:00:00', '2026-01-15 09:00:00', '2026-02-05 09:00:00', '2026-02-12 09:00:00', 'admin'
);

-- 7) referred_to_licensing — utility, 200MW plant for trading/export OUTSIDE Schedule 2 (REPORTABLE — refer crosses EVERY tier, the W57 signature)
INSERT OR IGNORE INTO oe_sseg_registrations (
  id, registration_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  capacity_tier, generation_purpose, technology, customer_category, facility_name, facility_location, capacity_kw, point_of_connection, distributor, estimated_capex_zar_m, grid_connection_ref,
  application_ref, screening_ref, verification_ref, determination_ref, licensing_referral_ref, regulator_ref, is_reportable,
  application_basis, screening_basis, verification_basis, determination_basis, referral_basis, reason_code, rod_notes,
  chain_status, registration_received_at, eligibility_screening_at, technical_verification_at, exemption_determination_at, referred_to_licensing_at, created_by
) VALUES (
  'sseg_007', 'NERSA-SSEG-2026-0007',
  'reg_overberg', 'Overberg Trading Power (Pty) Ltd', 'nersa_reg', 'NERSA — SSEG Registration Committee',
  'utility', 'trading', 'solar_battery', 'utility', 'Overberg Solar Trading Plant', 'Western Cape — Overberg', 200000, 'transmission point of supply', 'Eskom Transmission', 3300, 'GCA-2025-WC-0301',
  'NERSA-SSEG-APP-2025-0007', 'NERSA-SSEG-SCR-2025-0007', 'NERSA-SSEG-VER-2025-0007', 'NERSA-SSEG-DET-2026-0007', 'NERSA-LIC-2026-0188', 'NERSA-REG-2026-SSEG-0007', 1,
  'An independent developer filed a Schedule 2 registration for a 200MW solar plus battery plant, declaring an intention to sell and trade energy to third-party customers via wheeling and export.',
  'Eligibility screening flagged that the declared purpose is generation for sale and trading, not own use.',
  'Technical verification confirmed the transmission connection and the plant configuration.',
  'Exemption determination: the committee found that generation for sale, trading and export falls OUTSIDE the Schedule 2 own-use exemption and requires a full generation and trading licence under ERA sections 8 to 11.',
  'REFERRED TO LICENSING: the facility does not qualify for the Schedule 2 exemption because it generates for sale and trading. The registration is referred up to the NERSA full-licensing pipeline (application NERSA-LIC-2026-0188). A referral crosses to the Council oversight queue for every tier.',
  'outside_schedule_2_generation_for_sale',
  'The applicant was directed to pursue a generation and trading licence; the registration committee handed the matter to the licensing pipeline.',
  'referred_to_licensing', '2025-11-15 08:00:00', '2025-11-22 09:00:00', '2025-12-10 09:00:00', '2026-01-20 09:00:00', '2026-02-03 09:00:00', 'demo_regulator_001'
);

-- 8) refused — large, 32MW configuration that does not meet registration criteria (REPORTABLE — refuse crosses large + utility)
INSERT OR IGNORE INTO oe_sseg_registrations (
  id, registration_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  capacity_tier, generation_purpose, technology, customer_category, facility_name, facility_location, capacity_kw, point_of_connection, distributor, estimated_capex_zar_m, grid_connection_ref,
  application_ref, screening_ref, verification_ref, determination_ref, regulator_ref, is_reportable,
  application_basis, screening_basis, verification_basis, determination_basis, refusal_basis, reason_code, rod_notes,
  chain_status, registration_received_at, eligibility_screening_at, technical_verification_at, exemption_determination_at, refused_at, created_by
) VALUES (
  'sseg_008', 'NERSA-SSEG-2025-0008',
  'reg_vaal', 'Vaal Industrial Park', 'nersa_reg', 'NERSA — SSEG Registration Committee',
  'large', 'own_use', 'gas', 'industrial', 'Vaal Gas Engine Plant', 'Gauteng — Sedibeng', 32000, 'MV distribution point of supply', 'Eskom Distribution', 540, 'GCA-2025-GP-0144',
  'NERSA-SSEG-APP-2025-0008', 'NERSA-SSEG-SCR-2025-0008', 'NERSA-SSEG-VER-2025-0008', 'NERSA-SSEG-DET-2025-0008', 'NERSA-REG-2025-SSEG-0008', 1,
  'An industrial park filed a Schedule 2 registration for a 32MW gas-engine plant claiming own use across multiple tenant entities at the park.',
  'Eligibility screening raised that supply spans multiple separate legal entities at distinct points of delivery.',
  'Technical verification could not confirm a single own-use configuration; the supply to multiple unrelated tenants resembles a distribution and trading arrangement.',
  'Exemption determination: the committee found the configuration does not meet the Schedule 2 own-use criteria and the applicant did not supply the requested point-of-delivery and entity-relationship evidence.',
  'REFUSED: the multi-entity multi-delivery configuration does not qualify for the Schedule 2 exemption and the registration criteria were not met. A refusal at the large tier crosses to the Council oversight queue.',
  'configuration_not_eligible_for_exemption',
  'The applicant was advised it may either restructure to a verifiable single own-use configuration and re-register, or apply for the appropriate distribution and trading licences.',
  'refused', '2025-09-05 08:00:00', '2025-09-12 09:00:00', '2025-10-01 09:00:00', '2025-11-10 09:00:00', '2025-11-24 09:00:00', 'demo_regulator_001'
);

-- 9) withdrawn — micro, 30kW rooftop withdrawn after the installer changed scope
INSERT OR IGNORE INTO oe_sseg_registrations (
  id, registration_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  capacity_tier, generation_purpose, technology, customer_category, facility_name, facility_location, capacity_kw, point_of_connection, distributor, estimated_capex_zar_m,
  application_ref, screening_ref, application_basis, screening_basis, reason_code, rod_notes,
  chain_status, registration_received_at, eligibility_screening_at, withdrawn_at, created_by
) VALUES (
  'sseg_009', 'NERSA-SSEG-2026-0009',
  'reg_parkhurst', 'Parkhurst Home Solar', 'nersa_reg', 'NERSA — SSEG Registration Committee',
  'micro', 'own_use', 'solar_pv', 'residential', 'Parkhurst Rooftop PV', 'Gauteng — City of Johannesburg', 30, 'LV distribution feeder', 'City Power Johannesburg', 0.6,
  'NERSA-SSEG-APP-2026-0009', 'NERSA-SSEG-SCR-2026-0009',
  'A homeowner filed a Schedule 2 registration for a 30kW rooftop solar PV installation for own use.',
  'Eligibility screening opened; the applicant indicated the system would be downsized to below the de-minimis threshold that requires registration.',
  'withdrawn_below_registration_threshold',
  'WITHDRAWN by the applicant: the installer reduced the system to a capacity below the de-minimis registration threshold, so registration was no longer required and the applicant withdrew.',
  'withdrawn', '2026-04-12 08:00:00', '2026-04-18 09:00:00', '2026-04-28 09:00:00', 'demo_regulator_001'
);

-- 10) lapsed — small, 500kW farm system lapsed (non-responsive to the info request)
INSERT OR IGNORE INTO oe_sseg_registrations (
  id, registration_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  capacity_tier, generation_purpose, technology, customer_category, facility_name, facility_location, capacity_kw, point_of_connection, distributor, estimated_capex_zar_m,
  application_ref, screening_ref, info_request_ref, info_request_round,
  application_basis, screening_basis, info_request_basis, reason_code, rod_notes,
  chain_status, registration_received_at, eligibility_screening_at, information_requested_at, lapsed_at, created_by
) VALUES (
  'sseg_010', 'NERSA-SSEG-2025-0010',
  'reg_ceres', 'Ceres Fruit Farms', 'nersa_reg', 'NERSA — SSEG Registration Committee',
  'small', 'own_use', 'solar_pv', 'agricultural', 'Ceres Farm Solar', 'Western Cape — Witzenberg', 500, 'LV distribution feeder', 'Eskom Distribution', 6.8,
  'NERSA-SSEG-APP-2025-0010', 'NERSA-SSEG-SCR-2025-0010', 'NERSA-SSEG-RFI-2025-0010', 1,
  'A fruit farm filed a Schedule 2 registration for a 500kW solar PV system for own use across irrigation and cold-store loads.',
  'Eligibility screening opened; an information request was issued.',
  'Additional information requested: the single-line diagram, the point-of-connection metering plan, and the embedded-generation compliance certificate were outstanding.',
  'lapsed_non_responsive',
  'LAPSED: the applicant did not supply the outstanding single-line diagram and compliance certificate within the response window; the registration lapsed. The applicant may file a fresh registration once the documents are ready.',
  'lapsed', '2025-10-01 08:00:00', '2025-10-08 09:00:00', '2025-10-15 09:00:00', '2025-12-01 09:00:00', 'demo_regulator_001'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- sseg_001 (registration_received)
INSERT OR IGNORE INTO oe_sseg_registrations_events (id, registration_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ssegv_001_a', 'sseg_001', 'sseg_registration.registration_received', null, 'registration_received', 'reg_kloof', 'applicant', 'Kloof 60kW residential rooftop SSEG registration filed', '2026-05-27 08:00:00');

-- sseg_002 (eligibility_screening)
INSERT OR IGNORE INTO oe_sseg_registrations_events (id, registration_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ssegv_002_a', 'sseg_002', 'sseg_registration.registration_received', null, 'registration_received', 'reg_canalwalk', 'applicant', 'Canal Walk 750kW commercial rooftop SSEG registration filed', '2026-05-20 08:00:00'),
('ssegv_002_b', 'sseg_002', 'sseg_registration.eligibility_screening', 'registration_received', 'eligibility_screening', 'nersa_registry', 'registry', 'Eligibility screening opened — own-use config, single connection, Schedule 2 qualification', '2026-05-22 09:00:00');

-- sseg_003 (information_requested)
INSERT OR IGNORE INTO oe_sseg_registrations_events (id, registration_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ssegv_003_a', 'sseg_003', 'sseg_registration.registration_received', null, 'registration_received', 'reg_sundays', 'applicant', 'Sundays River 5MW wheeling SSEG registration filed', '2026-05-08 08:00:00'),
('ssegv_003_b', 'sseg_003', 'sseg_registration.eligibility_screening', 'registration_received', 'eligibility_screening', 'nersa_registry', 'registry', 'Eligibility screening opened — wheeling across two connection points', '2026-05-13 09:00:00'),
('ssegv_003_c', 'sseg_003', 'sseg_registration.information_requested', 'eligibility_screening', 'information_requested', 'nersa_registry', 'registry', 'RFI issued — use-of-system agreement, second point-of-delivery metering, no third-party sale (30-day window)', '2026-05-16 09:00:00');

-- sseg_004 (technical_verification, BREACHED)
INSERT OR IGNORE INTO oe_sseg_registrations_events (id, registration_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ssegv_004_a', 'sseg_004', 'sseg_registration.registration_received', null, 'registration_received', 'reg_saldanha', 'applicant', 'Saldanha 45MW self-generation SSEG registration filed', '2026-03-10 08:00:00'),
('ssegv_004_b', 'sseg_004', 'sseg_registration.eligibility_screening', 'registration_received', 'eligibility_screening', 'nersa_registry', 'registry', 'Eligibility screening confirmed own-use config above de-minimis; grid study mandatory', '2026-03-14 09:00:00'),
('ssegv_004_c', 'sseg_004', 'sseg_registration.technical_verification', 'eligibility_screening', 'technical_verification', 'nersa_verifier', 'verifier', 'Technical verification opened — grid-impact study, protection coordination, compliance certificate', '2026-03-20 09:00:00');

-- sseg_005 (exemption_determination, BREACHED)
INSERT OR IGNORE INTO oe_sseg_registrations_events (id, registration_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ssegv_005_a', 'sseg_005', 'sseg_registration.registration_received', null, 'registration_received', 'reg_mogalakwena', 'applicant', 'Mogalakwena 150MW captive plant SSEG registration filed', '2026-01-20 08:00:00'),
('ssegv_005_b', 'sseg_005', 'sseg_registration.eligibility_screening', 'registration_received', 'eligibility_screening', 'nersa_registry', 'registry', 'Eligibility screening confirmed own-use captive config, no third-party sale', '2026-02-02 09:00:00'),
('ssegv_005_c', 'sseg_005', 'sseg_registration.technical_verification', 'eligibility_screening', 'technical_verification', 'nersa_verifier', 'verifier', 'Technical verification confirmed transmission grid-impact study, protection and metering', '2026-03-01 09:00:00'),
('ssegv_005_d', 'sseg_005', 'sseg_registration.exemption_determination', 'technical_verification', 'exemption_determination', 'nersa_verifier', 'verifier', 'Exemption determination opened before the registration committee', '2026-03-15 09:00:00');

-- sseg_006 (registered flagship — conditional-approval loop)
INSERT OR IGNORE INTO oe_sseg_registrations_events (id, registration_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ssegv_006_a', 'sseg_006', 'sseg_registration.registration_received', null, 'registration_received', 'reg_clairwood', 'applicant', 'Clairwood 8MW rooftop and carport SSEG registration filed', '2025-12-01 08:00:00'),
('ssegv_006_b', 'sseg_006', 'sseg_registration.eligibility_screening', 'registration_received', 'eligibility_screening', 'nersa_registry', 'registry', 'Eligibility screening confirmed own-use config behind single connection', '2025-12-08 09:00:00'),
('ssegv_006_c', 'sseg_006', 'sseg_registration.technical_verification', 'eligibility_screening', 'technical_verification', 'nersa_verifier', 'verifier', 'Technical verification confirmed grid-impact assessment and protection coordination', '2025-12-18 09:00:00'),
('ssegv_006_d', 'sseg_006', 'sseg_registration.exemption_determination', 'technical_verification', 'exemption_determination', 'nersa_verifier', 'verifier', 'Exemption determination opened', '2026-01-08 09:00:00'),
('ssegv_006_e', 'sseg_006', 'sseg_registration.conditions_pending', 'exemption_determination', 'conditions_pending', 'nersa_committee', 'committee', 'Qualifies subject to conditions — updated compliance certificate and reverse-power protection setting', '2026-01-15 09:00:00'),
('ssegv_006_f', 'sseg_006', 'sseg_registration.registration_approved', 'conditions_pending', 'registration_approved', 'reg_clairwood', 'applicant', 'Conditions satisfied by the applicant; registration approved', '2026-02-05 09:00:00'),
('ssegv_006_g', 'sseg_006', 'sseg_registration.registered', 'registration_approved', 'registered', 'nersa_registry', 'registry', 'REGISTERED — certificate NERSA-SSEG-CERT-2026-0142 issued', '2026-02-12 09:00:00');

-- sseg_007 (referred_to_licensing — crosses regulator, EVERY tier, the W57 signature)
INSERT OR IGNORE INTO oe_sseg_registrations_events (id, registration_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ssegv_007_a', 'sseg_007', 'sseg_registration.registration_received', null, 'registration_received', 'reg_overberg', 'applicant', 'Overberg 200MW trading plant SSEG registration filed', '2025-11-15 08:00:00'),
('ssegv_007_b', 'sseg_007', 'sseg_registration.eligibility_screening', 'registration_received', 'eligibility_screening', 'nersa_registry', 'registry', 'Eligibility screening flagged declared purpose is generation for sale and trading', '2025-11-22 09:00:00'),
('ssegv_007_c', 'sseg_007', 'sseg_registration.technical_verification', 'eligibility_screening', 'technical_verification', 'nersa_verifier', 'verifier', 'Technical verification confirmed transmission connection and plant configuration', '2025-12-10 09:00:00'),
('ssegv_007_d', 'sseg_007', 'sseg_registration.exemption_determination', 'technical_verification', 'exemption_determination', 'nersa_verifier', 'verifier', 'Determination opened — generation for sale falls outside Schedule 2', '2026-01-20 09:00:00'),
('ssegv_007_e', 'sseg_007', 'sseg_registration.referred_to_licensing', 'exemption_determination', 'referred_to_licensing', 'nersa_committee', 'committee', 'REFERRED TO LICENSING — outside Schedule 2; handed to full-licensing pipeline NERSA-LIC-2026-0188; crosses for every tier', '2026-02-03 09:00:00');

-- sseg_008 (refused — crosses regulator, large + utility)
INSERT OR IGNORE INTO oe_sseg_registrations_events (id, registration_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ssegv_008_a', 'sseg_008', 'sseg_registration.registration_received', null, 'registration_received', 'reg_vaal', 'applicant', 'Vaal 32MW gas-engine plant SSEG registration filed', '2025-09-05 08:00:00'),
('ssegv_008_b', 'sseg_008', 'sseg_registration.eligibility_screening', 'registration_received', 'eligibility_screening', 'nersa_registry', 'registry', 'Eligibility screening raised supply across multiple separate legal entities', '2025-09-12 09:00:00'),
('ssegv_008_c', 'sseg_008', 'sseg_registration.technical_verification', 'eligibility_screening', 'technical_verification', 'nersa_verifier', 'verifier', 'Technical verification could not confirm a single own-use configuration', '2025-10-01 09:00:00'),
('ssegv_008_d', 'sseg_008', 'sseg_registration.exemption_determination', 'technical_verification', 'exemption_determination', 'nersa_verifier', 'verifier', 'Determination opened — multi-entity multi-delivery resembles distribution and trading', '2025-11-10 09:00:00'),
('ssegv_008_e', 'sseg_008', 'sseg_registration.refused', 'exemption_determination', 'refused', 'nersa_committee', 'committee', 'REFUSED — configuration not eligible for Schedule 2 exemption; large-tier refusal crosses to Council oversight', '2025-11-24 09:00:00');

-- sseg_009 (withdrawn)
INSERT OR IGNORE INTO oe_sseg_registrations_events (id, registration_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ssegv_009_a', 'sseg_009', 'sseg_registration.registration_received', null, 'registration_received', 'reg_parkhurst', 'applicant', 'Parkhurst 30kW residential rooftop SSEG registration filed', '2026-04-12 08:00:00'),
('ssegv_009_b', 'sseg_009', 'sseg_registration.eligibility_screening', 'registration_received', 'eligibility_screening', 'nersa_registry', 'registry', 'Eligibility screening opened', '2026-04-18 09:00:00'),
('ssegv_009_c', 'sseg_009', 'sseg_registration.withdrawn', 'eligibility_screening', 'withdrawn', 'reg_parkhurst', 'applicant', 'WITHDRAWN — system downsized below the de-minimis registration threshold', '2026-04-28 09:00:00');

-- sseg_010 (lapsed — non-responsive to RFI)
INSERT OR IGNORE INTO oe_sseg_registrations_events (id, registration_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('ssegv_010_a', 'sseg_010', 'sseg_registration.registration_received', null, 'registration_received', 'reg_ceres', 'applicant', 'Ceres 500kW farm solar SSEG registration filed', '2025-10-01 08:00:00'),
('ssegv_010_b', 'sseg_010', 'sseg_registration.eligibility_screening', 'registration_received', 'eligibility_screening', 'nersa_registry', 'registry', 'Eligibility screening opened', '2025-10-08 09:00:00'),
('ssegv_010_c', 'sseg_010', 'sseg_registration.information_requested', 'eligibility_screening', 'information_requested', 'nersa_registry', 'registry', 'RFI issued — single-line diagram, metering plan, compliance certificate outstanding', '2025-10-15 09:00:00'),
('ssegv_010_d', 'sseg_010', 'sseg_registration.lapsed', 'information_requested', 'lapsed', 'nersa_registry', 'registry', 'LAPSED — applicant non-responsive within the window; may refile once documents ready', '2025-12-01 09:00:00');
