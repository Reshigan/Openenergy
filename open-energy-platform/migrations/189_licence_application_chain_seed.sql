-- Wave 49 — Regulator Initial Licence Application & Adjudication seed.
-- 10 prod-realistic NERSA initial-licence applications across all 12 states
-- (10 distinct resting states; technical_evaluation + council_decision are
-- traversed inside the lapp_007 licence_issued flagship) + all 3 classes + every
-- branch. Anchored on real SA market-entry licensing under ERA 2006 §§8-11:
-- IPP generation (solar / wind / hybrid + battery), private transmission, new
-- distribution boundaries, electricity trading, and small-scale generation.
-- actor_party records the regulatory function per step (applicant / registry /
-- evaluator / council). Capacity in MW; capex in R-millions.
--
-- Designed aggregates: total 10; by_class {major 5, standard 3, minor 2};
-- open 6; terminals licence_issued/refused/withdrawn/lapsed 1 each; breached 2
-- live (lapp_002 completeness standard + lapp_005 participation major past
-- deadline); reportable 3 (lapp_006 granted-major, lapp_007 issued-major,
-- lapp_008 refused-standard); total_capacity_mw 8323; granted_capacity_mw 2540.

-- 1) application_received — major, 800MW solar+wind+battery hybrid just filed
INSERT OR IGNORE INTO oe_licence_applications (
  id, application_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_class, licence_type, technology, facility_name, facility_location, capacity_mw, estimated_capex_zar_m, grid_connection_ref, reipppp_round,
  application_ref, application_basis,
  chain_status, application_received_at, sla_deadline_at, created_by
) VALUES (
  'lapp_001', 'NERSA-LIC-2026-0001',
  'app_redrock', 'Red Rock Renewable Power (Pty) Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'major_licence', 'generation', 'solar_wind_battery', 'Red Rock Hybrid Facility', 'Northern Cape', 800, 14500, 'GCA-2026-NC-0188', 'REIPPPP BW7',
  'NERSA-APP-2026-GEN-0001',
  'Red Rock Renewable Power filed an ERA s.8 generation licence application for an 800MW solar plus wind plus battery hybrid facility in the Northern Cape (estimated capex R14.5bn). Application received and logged; completeness review pending.',
  'application_received', '2026-05-24 08:00:00', '2026-06-03 08:00:00', 'demo_regulator_001'
);

-- 2) completeness_review — standard, new private distribution licence under completeness check (BREACHED)
INSERT OR IGNORE INTO oe_licence_applications (
  id, application_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_class, licence_type, technology, facility_name, facility_location, capacity_mw, estimated_capex_zar_m,
  application_ref, completeness_ref, application_basis, completeness_basis,
  chain_status, application_received_at, completeness_review_at, sla_deadline_at, created_by
) VALUES (
  'lapp_002', 'NERSA-LIC-2026-0002',
  'app_waterfall', 'Waterfall City Power (Pty) Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'standard_licence', 'distribution', 'grid', 'Waterfall City Distribution Network', 'Gauteng — City of Johannesburg', 450, 2200,
  'NERSA-APP-2026-DIST-0002', 'NERSA-COMP-2026-DIST-0002',
  'Waterfall City Power applied for a distribution licence to operate a ring-fenced private distribution network serving the Waterfall precinct (notified maximum demand 450MW).',
  'Completeness review underway: the distribution boundary maps, the supply agreement with the host metro, and the proof of technical and financial capacity are being checked against the s.9 application requirements.',
  'completeness_review', '2026-03-25 08:00:00', '2026-04-01 09:00:00', '2026-04-21 09:00:00', 'demo_regulator_001'
);

-- 3) additional_info_requested — major, transmission application awaiting further info (round 1)
INSERT OR IGNORE INTO oe_licence_applications (
  id, application_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_class, licence_type, technology, facility_name, facility_location, capacity_mw, estimated_capex_zar_m, grid_connection_ref,
  application_ref, completeness_ref, info_request_ref, info_request_round,
  application_basis, completeness_basis, info_request_basis,
  chain_status, application_received_at, completeness_review_at, additional_info_requested_at, sla_deadline_at, created_by
) VALUES (
  'lapp_003', 'NERSA-LIC-2026-0003',
  'app_capecorridor', 'Cape Corridor Transmission (Pty) Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'major_licence', 'transmission', 'grid', 'Cape Corridor 400kV Line', 'Western Cape to Northern Cape', 3000, 28000, 'GCA-2026-WC-0044',
  'NERSA-APP-2026-TRANS-0003', 'NERSA-COMP-2026-TRANS-0003', 'NERSA-RFI-2026-TRANS-0003', 1,
  'Cape Corridor Transmission applied for a transmission licence for a privately financed 400kV corridor with 3000MW transfer capacity linking renewable hubs to the Cape load centres.',
  'Completeness review identified gaps in the supporting documentation.',
  'Additional information requested: the environmental authorisation under NEMA, the financial-close evidence and equity commitment letters, and the servitude acquisition status are outstanding. The applicant has 60 days to respond before the application lapses.',
  'additional_info_requested', '2026-04-20 08:00:00', '2026-04-30 09:00:00', '2026-05-10 09:00:00', '2026-07-09 09:00:00', 'demo_regulator_001'
);

-- 4) accepted — standard, electricity trading licence accepted for processing
INSERT OR IGNORE INTO oe_licence_applications (
  id, application_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_class, licence_type, technology, facility_name, facility_location, estimated_capex_zar_m,
  application_ref, completeness_ref, acceptance_ref,
  application_basis, completeness_basis, acceptance_basis,
  chain_status, application_received_at, completeness_review_at, accepted_at, sla_deadline_at, created_by
) VALUES (
  'lapp_004', 'NERSA-LIC-2026-0004',
  'app_aggregate', 'Aggregate Power Traders (Pty) Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'standard_licence', 'trading', 'na', 'Aggregate Power Trading Desk', 'National', 180,
  'NERSA-APP-2026-TRAD-0004', 'NERSA-COMP-2026-TRAD-0004', 'NERSA-ACC-2026-TRAD-0004',
  'Aggregate Power Traders applied for an electricity trading licence to buy from registered generators and sell to eligible commercial and industrial customers under the wheeling framework.',
  'Completeness confirmed: the trading rules, credit and prudential cover, and the customer-protection plan meet the s.9 requirements.',
  'Application accepted for processing; the public participation process will be opened to invite comment on the trading model and credit arrangements.',
  'accepted', '2026-05-06 08:00:00', '2026-05-16 09:00:00', '2026-05-26 09:00:00', '2026-06-05 09:00:00', 'demo_regulator_001'
);

-- 5) public_participation — major, 1200MW wind, public hearings overran (BREACHED)
INSERT OR IGNORE INTO oe_licence_applications (
  id, application_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_class, licence_type, technology, facility_name, facility_location, capacity_mw, estimated_capex_zar_m, grid_connection_ref, reipppp_round,
  application_ref, completeness_ref, acceptance_ref, participation_ref,
  application_basis, acceptance_basis, participation_basis,
  chain_status, application_received_at, completeness_review_at, accepted_at, public_participation_at, sla_deadline_at, created_by
) VALUES (
  'lapp_005', 'NERSA-LIC-2026-0005',
  'app_karoo', 'Karoo Wind Holdings (Pty) Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'major_licence', 'generation', 'wind', 'Karoo Wind Cluster', 'Eastern Cape', 1200, 22000, 'GCA-2025-EC-0211', 'REIPPPP BW6',
  'NERSA-APP-2025-GEN-0005', 'NERSA-COMP-2025-GEN-0005', 'NERSA-ACC-2025-GEN-0005', 'NERSA-HEAR-2026-GEN-0005',
  'Karoo Wind Holdings applied for a generation licence for a 1200MW wind cluster across three Eastern Cape farms under REIPPPP Bid Window 6.',
  'Accepted for processing after completeness confirmation.',
  'Public participation underway: provincial hearings and written submissions on land use, avifauna impact and community benefit are being consolidated. The mandatory hearing window for a major licence has overrun the statutory period.',
  'public_participation', '2025-12-15 08:00:00', '2025-12-29 09:00:00', '2026-01-05 09:00:00', '2026-01-10 09:00:00', '2026-03-11 09:00:00', 'demo_regulator_001'
);

-- 6) licence_granted — major, 540MW solar+battery granted, awaiting issuance (REPORTABLE)
INSERT OR IGNORE INTO oe_licence_applications (
  id, application_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_class, licence_type, technology, facility_name, facility_location, capacity_mw, estimated_capex_zar_m, grid_connection_ref, reipppp_round,
  application_ref, completeness_ref, acceptance_ref, participation_ref, evaluation_ref, council_ref, regulator_ref, is_reportable,
  application_basis, evaluation_basis, council_basis, grant_basis,
  chain_status, application_received_at, completeness_review_at, accepted_at, public_participation_at, technical_evaluation_at, council_decision_at, licence_granted_at, sla_deadline_at, created_by
) VALUES (
  'lapp_006', 'NERSA-LIC-2026-0006',
  'app_sunfields', 'Sunfields Power (Pty) Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'major_licence', 'generation', 'solar_battery', 'Sunfields Solar plus Storage', 'Free State', 540, 9800, 'GCA-2025-FS-0102', 'REIPPPP BW6',
  'NERSA-APP-2025-GEN-0006', 'NERSA-COMP-2025-GEN-0006', 'NERSA-ACC-2025-GEN-0006', 'NERSA-HEAR-2025-GEN-0006', 'NERSA-EVAL-2026-GEN-0006', 'NERSA-COUNCIL-2026-LIC-0021', 'NERSA-COUNCIL-2026-LIC-0021', 1,
  'Sunfields Power applied for a generation licence for a 540MW solar PV plus battery facility in the Free State.',
  'Technical and financial evaluation confirmed grid-connection capacity per the connection agreement, prudent capex and a bankable PPA.',
  'The Energy Regulator deliberated and resolved to grant the licence subject to standard conditions.',
  'LICENCE GRANTED subject to conditions; a major generation grant crosses to the Council oversight queue and the Government Gazette pending issuance of the licence document.',
  'licence_granted', '2025-11-10 08:00:00', '2025-11-24 09:00:00', '2025-12-08 09:00:00', '2026-01-12 09:00:00', '2026-03-18 09:00:00', '2026-05-12 09:00:00', '2026-05-22 09:00:00', '2026-06-05 09:00:00', 'demo_regulator_001'
);

-- 7) licence_issued — major flagship, FULL happy arc (traverses technical_evaluation + council_decision) (REPORTABLE)
INSERT OR IGNORE INTO oe_licence_applications (
  id, application_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_class, licence_type, technology, facility_name, facility_location, capacity_mw, estimated_capex_zar_m, grid_connection_ref, reipppp_round,
  application_ref, completeness_ref, acceptance_ref, participation_ref, evaluation_ref, council_ref, licence_ref, gazette_ref, regulator_ref, is_reportable,
  application_basis, evaluation_basis, council_basis, grant_basis, rod_notes,
  chain_status, application_received_at, completeness_review_at, accepted_at, public_participation_at, technical_evaluation_at, council_decision_at, licence_granted_at, licence_issued_at, created_by
) VALUES (
  'lapp_007', 'NERSA-LIC-2025-0007',
  'app_gariep', 'Gariep Hybrid Energy (Pty) Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'major_licence', 'generation', 'solar_wind_battery', 'Gariep Hybrid Energy Park', 'Northern Cape', 2000, 38000, 'GCA-2024-NC-0301', 'REIPPPP BW6',
  'NERSA-APP-2024-GEN-0007', 'NERSA-COMP-2024-GEN-0007', 'NERSA-ACC-2024-GEN-0007', 'NERSA-HEAR-2025-GEN-0007', 'NERSA-EVAL-2025-GEN-0007', 'NERSA-COUNCIL-2025-LIC-0009', 'GEN-2025-0142', 'GG-50118-2025', 'NERSA-COUNCIL-2025-LIC-0009', 1,
  'Gariep Hybrid Energy applied for a generation licence for a 2000MW solar plus wind plus battery hybrid energy park in the Northern Cape under REIPPPP Bid Window 6 (estimated capex R38.0bn).',
  'Technical and financial evaluation confirmed the 2000MW grid-connection capacity per the connection agreement, the hybrid dispatch profile, and financial close.',
  'The Energy Regulator deliberated and resolved to grant the licence subject to standard generation conditions.',
  'LICENCE GRANTED then ISSUED. Full happy-path arc: received then completeness then accepted then participation then evaluation then council decision then granted then issued. Licence GEN-2025-0142 issued and gazetted (GG-50118). A major generation grant surfaced to the Council oversight queue and the Government Gazette.',
  'Licence GEN-2025-0142 issued and effective; standard generation conditions and the approved connection capacity apply.',
  'licence_issued', '2024-10-01 08:00:00', '2024-10-15 09:00:00', '2024-11-12 09:00:00', '2025-01-20 09:00:00', '2025-04-15 09:00:00', '2025-06-10 09:00:00', '2025-06-24 09:00:00', '2025-07-08 09:00:00', 'admin'
);

-- 8) refused — standard, distribution application refused (REPORTABLE — refuse crosses ALL classes)
INSERT OR IGNORE INTO oe_licence_applications (
  id, application_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_class, licence_type, technology, facility_name, facility_location, capacity_mw, estimated_capex_zar_m,
  application_ref, completeness_ref, acceptance_ref, participation_ref, evaluation_ref, council_ref, regulator_ref, is_reportable,
  application_basis, evaluation_basis, refusal_basis, reason_code, rod_notes,
  chain_status, application_received_at, completeness_review_at, accepted_at, public_participation_at, technical_evaluation_at, council_decision_at, refused_at, created_by
) VALUES (
  'lapp_008', 'NERSA-LIC-2025-0008',
  'app_midrand', 'Midrand Grid Services (Pty) Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'standard_licence', 'distribution', 'grid', 'Midrand Grid Distribution Area', 'Gauteng — City of Johannesburg', 320, 1800,
  'NERSA-APP-2025-DIST-0008', 'NERSA-COMP-2025-DIST-0008', 'NERSA-ACC-2025-DIST-0008', 'NERSA-HEAR-2025-DIST-0008', 'NERSA-EVAL-2025-DIST-0008', 'NERSA-COUNCIL-2025-LIC-0014', 'NERSA-COUNCIL-2025-LIC-0014', 1,
  'Midrand Grid Services applied for a distribution licence to operate a 320MW distribution area overlapping the host metro licensed boundary.',
  'Evaluation found inadequate technical capacity, no firm supply agreement with the host metro, and insufficient ring-fenced financial capacity; the public process raised material boundary-overlap objections from the incumbent distributor.',
  'REFUSED: the applicant did not demonstrate the technical, financial and operational capacity required under s.10, and the proposed area materially overlaps the incumbent licensed boundary without consent. A licence refusal denies market entry and crosses to the Council oversight queue for every class.',
  'inadequate_capacity_and_boundary_overlap',
  'The applicant was advised it may reapply with a firm supply agreement, ring-fenced financials and a resolved boundary arrangement.',
  'refused', '2025-08-04 08:00:00', '2025-08-18 09:00:00', '2025-09-08 09:00:00', '2025-10-20 09:00:00', '2025-12-15 09:00:00', '2026-02-10 09:00:00', '2026-02-24 09:00:00', 'demo_regulator_001'
);

-- 9) withdrawn — minor, small-scale rooftop aggregation withdrawn to register under SSEG framework
INSERT OR IGNORE INTO oe_licence_applications (
  id, application_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_class, licence_type, technology, facility_name, facility_location, capacity_mw, estimated_capex_zar_m,
  application_ref, completeness_ref, application_basis, reason_code, rod_notes,
  chain_status, application_received_at, completeness_review_at, withdrawn_at, created_by
) VALUES (
  'lapp_009', 'NERSA-LIC-2026-0009',
  'app_sandton', 'Sandton Rooftop Solar Co-op', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'minor_licence', 'generation', 'solar_pv', 'Sandton Rooftop Aggregation', 'Gauteng — City of Johannesburg', 9, 95,
  'NERSA-APP-2026-GEN-0009', 'NERSA-COMP-2026-GEN-0009',
  'A rooftop solar co-operative applied for a generation licence for a 9MW aggregation of distributed rooftop installations.',
  'withdrawn_for_sseg_registration',
  'WITHDRAWN by the applicant: on advice that aggregated rooftop installations below the licensing threshold qualify for registration under the small-scale embedded generation framework, the co-op elected to withdraw and register rather than license.',
  'withdrawn', '2026-04-10 08:00:00', '2026-04-20 09:00:00', '2026-05-02 09:00:00', 'demo_regulator_001'
);

-- 10) lapsed — minor, small hydro application lapsed (non-responsive to the info request)
INSERT OR IGNORE INTO oe_licence_applications (
  id, application_number,
  applicant_party_id, applicant_party_name, regulator_party_id, regulator_party_name,
  licence_class, licence_type, technology, facility_name, facility_location, capacity_mw, estimated_capex_zar_m,
  application_ref, completeness_ref, info_request_ref, info_request_round,
  application_basis, info_request_basis, reason_code, rod_notes,
  chain_status, application_received_at, completeness_review_at, additional_info_requested_at, lapsed_at, created_by
) VALUES (
  'lapp_010', 'NERSA-LIC-2025-0010',
  'app_tugela', 'Tugela Micro Hydro (Pty) Ltd', 'nersa_epp', 'NERSA — Electricity Subcommittee',
  'minor_licence', 'generation', 'hydro', 'Tugela Run-of-River Scheme', 'KwaZulu-Natal', 4, 140,
  'NERSA-APP-2025-GEN-0010', 'NERSA-COMP-2025-GEN-0010', 'NERSA-RFI-2025-GEN-0010', 1,
  'Tugela Micro Hydro applied for a generation licence for a 4MW run-of-river scheme on the Tugela river.',
  'Additional information requested: the water-use licence under the National Water Act and the ecological reserve determination were outstanding.',
  'lapsed_non_responsive',
  'LAPSED: the applicant did not supply the outstanding water-use licence and ecological-reserve evidence within the response window; the application lapsed. The applicant may file a fresh application once the water-use authorisation is obtained.',
  'lapsed', '2025-09-15 08:00:00', '2025-09-29 09:00:00', '2025-10-13 09:00:00', '2025-12-14 09:00:00', 'demo_regulator_001'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- lapp_001 (application_received)
INSERT OR IGNORE INTO oe_licence_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lappv_001_a', 'lapp_001', 'licence_application.application_received', null, 'application_received', 'app_redrock', 'applicant', 'Red Rock 800MW hybrid generation licence application filed', '2026-05-24 08:00:00');

-- lapp_002 (completeness_review)
INSERT OR IGNORE INTO oe_licence_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lappv_002_a', 'lapp_002', 'licence_application.application_received', null, 'application_received', 'app_waterfall', 'applicant', 'Waterfall City distribution licence application filed (450MW NMD)', '2026-03-25 08:00:00'),
('lappv_002_b', 'lapp_002', 'licence_application.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness review opened — boundary maps + supply agreement + capacity proof', '2026-04-01 09:00:00');

-- lapp_003 (additional_info_requested)
INSERT OR IGNORE INTO oe_licence_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lappv_003_a', 'lapp_003', 'licence_application.application_received', null, 'application_received', 'app_capecorridor', 'applicant', 'Cape Corridor 400kV transmission licence application filed (3000MW transfer)', '2026-04-20 08:00:00'),
('lappv_003_b', 'lapp_003', 'licence_application.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness review identified documentation gaps', '2026-04-30 09:00:00'),
('lappv_003_c', 'lapp_003', 'licence_application.additional_info_requested', 'completeness_review', 'additional_info_requested', 'nersa_registry', 'registry', 'RFI issued — NEMA authorisation, financial-close evidence, servitude status (60-day window)', '2026-05-10 09:00:00');

-- lapp_004 (accepted)
INSERT OR IGNORE INTO oe_licence_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lappv_004_a', 'lapp_004', 'licence_application.application_received', null, 'application_received', 'app_aggregate', 'applicant', 'Aggregate Power Traders trading licence application filed', '2026-05-06 08:00:00'),
('lappv_004_b', 'lapp_004', 'licence_application.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness confirmed — trading rules + prudential cover + customer protection', '2026-05-16 09:00:00'),
('lappv_004_c', 'lapp_004', 'licence_application.accepted', 'completeness_review', 'accepted', 'nersa_registry', 'registry', 'Accepted for processing; public participation to be opened', '2026-05-26 09:00:00');

-- lapp_005 (public_participation)
INSERT OR IGNORE INTO oe_licence_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lappv_005_a', 'lapp_005', 'licence_application.application_received', null, 'application_received', 'app_karoo', 'applicant', 'Karoo Wind 1200MW generation licence application filed', '2025-12-15 08:00:00'),
('lappv_005_b', 'lapp_005', 'licence_application.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness confirmed', '2025-12-29 09:00:00'),
('lappv_005_c', 'lapp_005', 'licence_application.accepted', 'completeness_review', 'accepted', 'nersa_registry', 'registry', 'Accepted for processing', '2026-01-05 09:00:00'),
('lappv_005_d', 'lapp_005', 'licence_application.public_participation', 'accepted', 'public_participation', 'nersa_registry', 'registry', 'Public participation opened — provincial hearings on land use, avifauna, community benefit', '2026-01-10 09:00:00');

-- lapp_006 (licence_granted — crosses regulator at grant, major)
INSERT OR IGNORE INTO oe_licence_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lappv_006_a', 'lapp_006', 'licence_application.application_received', null, 'application_received', 'app_sunfields', 'applicant', 'Sunfields 540MW solar plus battery generation licence application filed', '2025-11-10 08:00:00'),
('lappv_006_b', 'lapp_006', 'licence_application.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness confirmed', '2025-11-24 09:00:00'),
('lappv_006_c', 'lapp_006', 'licence_application.accepted', 'completeness_review', 'accepted', 'nersa_registry', 'registry', 'Accepted for processing', '2025-12-08 09:00:00'),
('lappv_006_d', 'lapp_006', 'licence_application.public_participation', 'accepted', 'public_participation', 'nersa_registry', 'registry', 'Public participation completed', '2026-01-12 09:00:00'),
('lappv_006_e', 'lapp_006', 'licence_application.technical_evaluation', 'public_participation', 'technical_evaluation', 'nersa_evaluator', 'evaluator', 'Technical and financial evaluation — grid capacity, capex, bankable PPA', '2026-03-18 09:00:00'),
('lappv_006_f', 'lapp_006', 'licence_application.council_decision', 'technical_evaluation', 'council_decision', 'nersa_evaluator', 'evaluator', 'Referred to the Energy Regulator for decision', '2026-05-12 09:00:00'),
('lappv_006_g', 'lapp_006', 'licence_application.licence_granted', 'council_decision', 'licence_granted', 'nersa_council', 'council', 'LICENCE GRANTED subject to conditions; major grant crosses to Council oversight + Gazette', '2026-05-22 09:00:00');

-- lapp_007 (licence_issued — full happy arc flagship; crosses regulator at grant, major)
INSERT OR IGNORE INTO oe_licence_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lappv_007_a', 'lapp_007', 'licence_application.application_received', null, 'application_received', 'app_gariep', 'applicant', 'Gariep 2000MW hybrid generation licence application filed (BW6)', '2024-10-01 08:00:00'),
('lappv_007_b', 'lapp_007', 'licence_application.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness confirmed', '2024-10-15 09:00:00'),
('lappv_007_c', 'lapp_007', 'licence_application.accepted', 'completeness_review', 'accepted', 'nersa_registry', 'registry', 'Accepted for processing', '2024-11-12 09:00:00'),
('lappv_007_d', 'lapp_007', 'licence_application.public_participation', 'accepted', 'public_participation', 'nersa_registry', 'registry', 'National public participation completed', '2025-01-20 09:00:00'),
('lappv_007_e', 'lapp_007', 'licence_application.technical_evaluation', 'public_participation', 'technical_evaluation', 'nersa_evaluator', 'evaluator', 'Evaluation confirmed 2000MW connection capacity, hybrid dispatch, financial close', '2025-04-15 09:00:00'),
('lappv_007_f', 'lapp_007', 'licence_application.council_decision', 'technical_evaluation', 'council_decision', 'nersa_evaluator', 'evaluator', 'Referred to the Energy Regulator for decision', '2025-06-10 09:00:00'),
('lappv_007_g', 'lapp_007', 'licence_application.licence_granted', 'council_decision', 'licence_granted', 'nersa_council', 'council', 'LICENCE GRANTED subject to conditions; major grant crosses to Council oversight + Gazette', '2025-06-24 09:00:00'),
('lappv_007_h', 'lapp_007', 'licence_application.licence_issued', 'licence_granted', 'licence_issued', 'nersa_registry', 'registry', 'LICENCE ISSUED — GEN-2025-0142 effective; gazetted GG-50118', '2025-07-08 09:00:00');

-- lapp_008 (refused — crosses regulator, universal)
INSERT OR IGNORE INTO oe_licence_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lappv_008_a', 'lapp_008', 'licence_application.application_received', null, 'application_received', 'app_midrand', 'applicant', 'Midrand Grid Services distribution licence application filed (320MW)', '2025-08-04 08:00:00'),
('lappv_008_b', 'lapp_008', 'licence_application.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness confirmed', '2025-08-18 09:00:00'),
('lappv_008_c', 'lapp_008', 'licence_application.accepted', 'completeness_review', 'accepted', 'nersa_registry', 'registry', 'Accepted for processing', '2025-09-08 09:00:00'),
('lappv_008_d', 'lapp_008', 'licence_application.public_participation', 'accepted', 'public_participation', 'nersa_registry', 'registry', 'Public participation raised material boundary-overlap objections', '2025-10-20 09:00:00'),
('lappv_008_e', 'lapp_008', 'licence_application.technical_evaluation', 'public_participation', 'technical_evaluation', 'nersa_evaluator', 'evaluator', 'Evaluation found inadequate technical + financial capacity, no firm supply agreement', '2025-12-15 09:00:00'),
('lappv_008_f', 'lapp_008', 'licence_application.council_decision', 'technical_evaluation', 'council_decision', 'nersa_evaluator', 'evaluator', 'Referred to the Energy Regulator for decision', '2026-02-10 09:00:00'),
('lappv_008_g', 'lapp_008', 'licence_application.refused', 'council_decision', 'refused', 'nersa_council', 'council', 'REFUSED — inadequate capacity + boundary overlap; refusal crosses to Council oversight (universal)', '2026-02-24 09:00:00');

-- lapp_009 (withdrawn)
INSERT OR IGNORE INTO oe_licence_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lappv_009_a', 'lapp_009', 'licence_application.application_received', null, 'application_received', 'app_sandton', 'applicant', 'Sandton rooftop co-op 9MW aggregation generation licence application filed', '2026-04-10 08:00:00'),
('lappv_009_b', 'lapp_009', 'licence_application.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness review opened', '2026-04-20 09:00:00'),
('lappv_009_c', 'lapp_009', 'licence_application.withdrawn', 'completeness_review', 'withdrawn', 'app_sandton', 'applicant', 'WITHDRAWN — co-op to register under the SSEG framework rather than license', '2026-05-02 09:00:00');

-- lapp_010 (lapsed — non-responsive to RFI)
INSERT OR IGNORE INTO oe_licence_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lappv_010_a', 'lapp_010', 'licence_application.application_received', null, 'application_received', 'app_tugela', 'applicant', 'Tugela 4MW run-of-river generation licence application filed', '2025-09-15 08:00:00'),
('lappv_010_b', 'lapp_010', 'licence_application.completeness_review', 'application_received', 'completeness_review', 'nersa_registry', 'registry', 'Completeness review opened', '2025-09-29 09:00:00'),
('lappv_010_c', 'lapp_010', 'licence_application.additional_info_requested', 'completeness_review', 'additional_info_requested', 'nersa_registry', 'registry', 'RFI issued — water-use licence + ecological reserve outstanding', '2025-10-13 09:00:00'),
('lappv_010_d', 'lapp_010', 'licence_application.lapsed', 'additional_info_requested', 'lapsed', 'nersa_registry', 'registry', 'LAPSED — applicant non-responsive within the window; may refile once water-use authorisation obtained', '2025-12-14 09:00:00');
