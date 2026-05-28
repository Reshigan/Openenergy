-- Wave 58 — Grid Connection Capacity Allocation & Queue Management seed.
-- 10 prod-realistic NTCSA / Eskom grid-capacity allocation applications across all
-- 12 states (10 distinct resting states; offer_issued + capacity_reserved are
-- traversed inside the gcap_006 capacity_allocated flagship) + all 5 capacity tiers
-- + every branch. Anchored on real SA renewable grid-access reality: scarce
-- transmission headroom in the Northern / Western Cape, a queue of solar / wind /
-- battery developers, system-impact studies for transmission-level connections,
-- and the W58 signature — a rejected application (no headroom / fails the network
-- assessment) crossing onto the NERSA grid-access oversight queue for every tier.
-- actor_party records the grid function per step (applicant / network / committee).
-- Capacity in MW; capex in R-millions.
--
-- Designed aggregates: total 10; by_tier {minor 2, small 2, medium 2, large 2, strategic 2};
-- open 5; terminals capacity_allocated/rejected/relinquished/withdrawn/lapsed 1 each;
-- breached 2 live (gcap_004 assessment large + gcap_005 queue strategic past deadline);
-- reportable 2 (gcap_007 rejected-strategic, gcap_008 relinquished-large);
-- total_requested_mw 1248; allocated_capacity_mw 60.

-- 1) application_received — minor, 8MW rooftop-scale solar just filed
INSERT OR IGNORE INTO oe_grid_capacity_allocations (
  id, allocation_number,
  applicant_party_id, applicant_party_name, operator_party_id, operator_party_name,
  capacity_tier, connection_type, technology, network_level, project_name, project_location, requested_capacity_mw, substation, supply_area, estimated_capex_zar_m,
  application_ref, application_basis,
  chain_status, application_received_at, sla_deadline_at, created_by
) VALUES (
  'gcap_001', 'NTCSA-CAP-2026-0001',
  'dev_reivilo', 'Reivilo Solar (Pty) Ltd', 'ntcsa_grid', 'NTCSA — Grid Access Unit',
  'minor', 'generation', 'solar_pv', 'distribution', 'Reivilo PV', 'North West — Dr Ruth Segomotsi Mompati', 8, 'Reivilo 132kV', 'North West distribution', 95,
  'NTCSA-CAP-APP-2026-0001',
  'A small solar developer applied for an 8MW distribution-level connection at the Reivilo supply point. Application received and logged; completeness screening pending.',
  'application_received', '2026-05-27 08:00:00', '2026-05-29 08:00:00', 'demo_grid_001'
);

-- 2) completeness_screening — small, 30MW solar being screened
INSERT OR IGNORE INTO oe_grid_capacity_allocations (
  id, allocation_number,
  applicant_party_id, applicant_party_name, operator_party_id, operator_party_name,
  capacity_tier, connection_type, technology, network_level, project_name, project_location, requested_capacity_mw, substation, supply_area, estimated_capex_zar_m,
  application_ref, screening_ref, application_basis, screening_basis,
  chain_status, application_received_at, completeness_screening_at, sla_deadline_at, created_by
) VALUES (
  'gcap_002', 'NTCSA-CAP-2026-0002',
  'dev_prieska', 'Prieska Solar One', 'ntcsa_grid', 'NTCSA — Grid Access Unit',
  'small', 'generation', 'solar_pv', 'distribution', 'Prieska PV One', 'Northern Cape — Pixley ka Seme', 30, 'Prieska 132kV', 'Northern Cape distribution', 360,
  'NTCSA-CAP-APP-2026-0002', 'NTCSA-CAP-SCR-2026-0002',
  'A developer applied for a 30MW solar connection on the Prieska sub-transmission network feeding agricultural and town loads.',
  'Completeness screening underway: confirming the single-line diagram, the point-of-connection nomination, the land rights, and the grid-code compliance declaration before a network assessment is scheduled.',
  'completeness_screening', '2026-05-21 08:00:00', '2026-05-24 09:00:00', '2026-05-31 09:00:00', 'demo_grid_001'
);

-- 3) information_requested — medium, 75MW wind awaiting further info (round 1)
INSERT OR IGNORE INTO oe_grid_capacity_allocations (
  id, allocation_number,
  applicant_party_id, applicant_party_name, operator_party_id, operator_party_name,
  capacity_tier, connection_type, technology, network_level, project_name, project_location, requested_capacity_mw, substation, supply_area, estimated_capex_zar_m,
  application_ref, screening_ref, info_request_ref, info_request_round,
  application_basis, screening_basis, info_request_basis,
  chain_status, application_received_at, completeness_screening_at, information_requested_at, sla_deadline_at, created_by
) VALUES (
  'gcap_003', 'NTCSA-CAP-2026-0003',
  'dev_komsberg', 'Komsberg Wind Farm', 'ntcsa_grid', 'NTCSA — Grid Access Unit',
  'medium', 'generation', 'wind', 'transmission', 'Komsberg Wind', 'Western Cape — Central Karoo', 75, 'Komsberg 400kV', 'Western Cape transmission', 1450,
  'NTCSA-CAP-APP-2026-0003', 'NTCSA-CAP-SCR-2026-0003', 'NTCSA-CAP-RFI-2026-0003', 1,
  'A wind developer applied for a 75MW transmission-level connection in the Komsberg renewable energy development zone.',
  'Completeness screening identified that the nominated connection point shares a constrained corridor with several queued projects and requires a refined connection design.',
  'Additional information requested: the updated reactive-power capability curve, the preferred and alternate point-of-connection, and the turbine fault-ride-through certificate. The applicant has 30 days to respond.',
  'information_requested', '2026-05-08 08:00:00', '2026-05-12 09:00:00', '2026-05-16 09:00:00', '2026-06-15 09:00:00', 'demo_grid_001'
);

-- 4) capacity_assessment — large, 180MW hybrid under network study (BREACHED, mandatory system-impact study)
INSERT OR IGNORE INTO oe_grid_capacity_allocations (
  id, allocation_number,
  applicant_party_id, applicant_party_name, operator_party_id, operator_party_name,
  capacity_tier, connection_type, technology, network_level, project_name, project_location, requested_capacity_mw, substation, supply_area, estimated_capex_zar_m,
  application_ref, screening_ref, assessment_ref,
  application_basis, screening_basis, assessment_basis,
  chain_status, application_received_at, completeness_screening_at, capacity_assessment_at, sla_deadline_at, created_by
) VALUES (
  'gcap_004', 'NTCSA-CAP-2026-0004',
  'dev_dearr', 'De Aar Hybrid Power', 'ntcsa_grid', 'NTCSA — Grid Access Unit',
  'large', 'hybrid', 'solar_battery', 'transmission', 'De Aar Solar plus Battery', 'Northern Cape — Pixley ka Seme', 180, 'Hydra 400kV', 'Northern Cape transmission', 4100,
  'NTCSA-CAP-APP-2026-0004', 'NTCSA-CAP-SCR-2026-0004', 'NTCSA-CAP-ASMT-2026-0004',
  'A developer applied for a 180MW solar plus battery hybrid connection at the Hydra transmission hub, one of the most contested corridors on the network.',
  'Completeness screening confirmed the application package; a full system-impact study is mandatory at transmission level and large capacity.',
  'Capacity assessment underway: the load-flow, fault-level, transient-stability and available-headroom study at the Hydra cluster is in progress. The study window for a large transmission connection has overrun.',
  'capacity_assessment', '2026-02-10 08:00:00', '2026-02-18 09:00:00', '2026-03-01 09:00:00', '2026-04-15 09:00:00', 'demo_grid_001'
);

-- 5) queue_positioned — strategic, 320MW wind holding a queue slot (BREACHED)
INSERT OR IGNORE INTO oe_grid_capacity_allocations (
  id, allocation_number,
  applicant_party_id, applicant_party_name, operator_party_id, operator_party_name,
  capacity_tier, connection_type, technology, network_level, project_name, project_location, requested_capacity_mw, queue_rank, priority_date, substation, supply_area, estimated_capex_zar_m,
  application_ref, screening_ref, assessment_ref, queue_ref,
  application_basis, screening_basis, assessment_basis, queue_basis,
  chain_status, application_received_at, completeness_screening_at, capacity_assessment_at, queue_positioned_at, sla_deadline_at, created_by
) VALUES (
  'gcap_005', 'NTCSA-CAP-2026-0005',
  'dev_karoo', 'Karoo Renewable Energy', 'ntcsa_grid', 'NTCSA — Grid Access Unit',
  'strategic', 'generation', 'wind', 'transmission', 'Karoo Wind Cluster', 'Eastern Cape — Sarah Baartman', 320, 4, '2026-02-15', 'Gamma 400kV', 'Eastern Cape transmission', 7600,
  'NTCSA-CAP-APP-2026-0005', 'NTCSA-CAP-SCR-2026-0005', 'NTCSA-CAP-ASMT-2026-0005', 'NTCSA-CAP-QUE-2026-0005',
  'A developer applied for a 320MW wind connection at the Gamma transmission hub feeding the Cape corridor.',
  'Completeness screening confirmed the package; a full system-impact study was scheduled.',
  'Capacity assessment confirmed headroom is available only after the Gamma corridor reinforcement and assigned a conditional queue position behind three earlier projects.',
  'Queue position 4 assigned on a 2026-02-15 priority date. Held in the queue pending an allocation offer once corridor reinforcement is confirmed. The hold window for a strategic connection has overrun.',
  'queue_positioned', '2026-01-10 08:00:00', '2026-01-22 09:00:00', '2026-02-01 09:00:00', '2026-02-15 09:00:00', '2026-04-01 09:00:00', 'demo_grid_001'
);

-- 6) capacity_allocated — medium flagship, FULL happy arc through offer + reservation
--    (traverses queue_positioned + offer_issued + capacity_reserved)
INSERT OR IGNORE INTO oe_grid_capacity_allocations (
  id, allocation_number,
  applicant_party_id, applicant_party_name, operator_party_id, operator_party_name,
  capacity_tier, connection_type, technology, network_level, project_name, project_location, requested_capacity_mw, granted_capacity_mw, queue_rank, priority_date, substation, supply_area, estimated_capex_zar_m, gca_ref,
  application_ref, screening_ref, assessment_ref, queue_ref, offer_ref, reservation_ref, allocation_ref,
  application_basis, screening_basis, assessment_basis, queue_basis, offer_basis, reservation_basis, allocation_basis, decision_notes,
  chain_status, application_received_at, completeness_screening_at, capacity_assessment_at, queue_positioned_at, offer_issued_at, capacity_reserved_at, capacity_allocated_at, created_by
) VALUES (
  'gcap_006', 'NTCSA-CAP-2025-0006',
  'dev_garob', 'Garob Solar Park', 'ntcsa_grid', 'NTCSA — Grid Access Unit',
  'medium', 'generation', 'solar_pv', 'transmission', 'Garob PV Park', 'Northern Cape — Namakwa', 60, 60, 1, '2025-11-20', 'Aggeneis 400kV', 'Northern Cape transmission', 1180, 'GCA-2026-NC-0612',
  'NTCSA-CAP-APP-2025-0006', 'NTCSA-CAP-SCR-2025-0006', 'NTCSA-CAP-ASMT-2025-0006', 'NTCSA-CAP-QUE-2025-0006', 'NTCSA-CAP-OFR-2026-0006', 'NTCSA-CAP-RES-2026-0006', 'NTCSA-CAP-ALC-2026-0142',
  'A developer applied for a 60MW solar connection at the Aggeneis transmission hub with confirmed available headroom.',
  'Completeness screening confirmed the full package on first pass.',
  'Capacity assessment confirmed firm headroom is available at Aggeneis without reinforcement; no displacement of earlier queued projects.',
  'Queue position 1 assigned on a 2025-11-20 priority date with confirmed headroom.',
  'A capacity-allocation offer was issued for the full 60MW at the Aggeneis 400kV point of connection.',
  'The applicant accepted the offer; 60MW reserved pending the financial-close and milestone schedule.',
  'CAPACITY ALLOCATED firmly: 60MW at Aggeneis 400kV. The allocation feeds the Grid Connection Agreement GCA-2026-NC-0612 (W28 handoff).',
  'ALLOCATED. Full happy-path arc: received then screening then assessment then queue_positioned then offer_issued then capacity_reserved then capacity_allocated. Certificate NTCSA-CAP-ALC-2026-0142 issued; handed to W28 GCA.',
  'capacity_allocated', '2025-11-01 08:00:00', '2025-11-08 09:00:00', '2025-11-20 09:00:00', '2025-12-05 09:00:00', '2026-01-10 09:00:00', '2026-02-01 09:00:00', '2026-03-15 09:00:00', 'admin'
);

-- 7) rejected — strategic, 400MW hybrid with no headroom (REPORTABLE — reject crosses EVERY tier, the W58 signature)
INSERT OR IGNORE INTO oe_grid_capacity_allocations (
  id, allocation_number,
  applicant_party_id, applicant_party_name, operator_party_id, operator_party_name,
  capacity_tier, connection_type, technology, network_level, project_name, project_location, requested_capacity_mw, substation, supply_area, estimated_capex_zar_m,
  application_ref, screening_ref, assessment_ref, regulator_ref, is_reportable,
  application_basis, screening_basis, assessment_basis, rejection_basis, reason_code, decision_notes,
  chain_status, application_received_at, completeness_screening_at, capacity_assessment_at, rejected_at, created_by
) VALUES (
  'gcap_007', 'NTCSA-CAP-2025-0007',
  'dev_ncmega', 'Northern Cape Mega Solar', 'ntcsa_grid', 'NTCSA — Grid Access Unit',
  'strategic', 'hybrid', 'solar_battery', 'transmission', 'Northern Cape Mega Solar plus Battery', 'Northern Cape — ZF Mgcawu', 400, 'Kronos 400kV', 'Northern Cape transmission', 9200,
  'NTCSA-CAP-APP-2025-0007', 'NTCSA-CAP-SCR-2025-0007', 'NTCSA-CAP-ASMT-2026-0007', 'NERSA-GRID-2026-CAP-0007', 1,
  'A developer applied for a 400MW solar plus battery hybrid connection at the Kronos transmission hub in the most heavily subscribed corridor on the network.',
  'Completeness screening confirmed the package and scheduled a full system-impact study.',
  'Capacity assessment found no available transmission headroom at Kronos: the corridor is fully subscribed by earlier-priority projects and the required reinforcement is not in the funded transmission development plan within the project horizon.',
  'REJECTED: there is no available grid capacity at the nominated connection point and no funded reinforcement within the project horizon. The applicant may re-apply at an alternate connection point or once corridor reinforcement is funded. A rejection crosses to the NERSA grid-access oversight queue for every tier.',
  'no_available_capacity_no_funded_reinforcement',
  'The applicant was advised of the alternate-connection-point option and the transmission development plan reinforcement timeline; the matter was reported to the grid-access oversight queue.',
  'rejected', '2025-10-15 08:00:00', '2025-10-25 09:00:00', '2025-11-10 09:00:00', '2026-01-20 09:00:00', 'demo_grid_001'
);

-- 8) relinquished — large, 150MW battery handing back reserved headroom (REPORTABLE — relinquish crosses large + strategic)
INSERT OR IGNORE INTO oe_grid_capacity_allocations (
  id, allocation_number,
  applicant_party_id, applicant_party_name, operator_party_id, operator_party_name,
  capacity_tier, connection_type, technology, network_level, project_name, project_location, requested_capacity_mw, queue_rank, priority_date, substation, supply_area, estimated_capex_zar_m,
  application_ref, screening_ref, assessment_ref, queue_ref, offer_ref, reservation_ref, regulator_ref, is_reportable,
  application_basis, screening_basis, assessment_basis, queue_basis, offer_basis, reservation_basis, relinquish_basis, reason_code, decision_notes,
  chain_status, application_received_at, completeness_screening_at, capacity_assessment_at, queue_positioned_at, offer_issued_at, capacity_reserved_at, relinquished_at, created_by
) VALUES (
  'gcap_008', 'NTCSA-CAP-2025-0008',
  'dev_hexbess', 'Hex BESS Project', 'ntcsa_grid', 'NTCSA — Grid Access Unit',
  'large', 'storage', 'battery', 'transmission', 'Hex Battery Storage', 'Western Cape — Cape Winelands', 150, 2, '2025-10-20', 'Droerivier 400kV', 'Western Cape transmission', 3300,
  'NTCSA-CAP-APP-2025-0008', 'NTCSA-CAP-SCR-2025-0008', 'NTCSA-CAP-ASMT-2025-0008', 'NTCSA-CAP-QUE-2025-0008', 'NTCSA-CAP-OFR-2025-0008', 'NTCSA-CAP-RES-2025-0008', 'NERSA-GRID-2026-CAP-0008', 1,
  'A storage developer applied for a 150MW battery connection at the Droerivier transmission hub for energy-shifting and ancillary services.',
  'Completeness screening confirmed the package.',
  'Capacity assessment confirmed headroom available after a minor busbar upgrade.',
  'Queue position 2 assigned on a 2025-10-20 priority date.',
  'A capacity-allocation offer was issued for 150MW at Droerivier 400kV.',
  'The applicant accepted; 150MW reserved pending the milestone schedule.',
  'RELINQUISHED: the developer lost its offtake mandate and handed the reserved 150MW back to the capacity pool before firm allocation, returning the headroom to the next applicant in the queue. A large-tier relinquishment crosses to the grid-access oversight queue.',
  'reserved_capacity_returned_to_pool',
  'The reserved headroom was returned to the Droerivier queue and offered to the next-ranked applicant; the relinquishment was reported to the grid-access oversight queue.',
  'relinquished', '2025-09-01 08:00:00', '2025-09-10 09:00:00', '2025-09-25 09:00:00', '2025-10-20 09:00:00', '2025-11-15 09:00:00', '2025-12-10 09:00:00', '2026-02-28 09:00:00', 'demo_grid_001'
);

-- 9) withdrawn — minor, 5MW new industrial load connection withdrawn after a scope change
INSERT OR IGNORE INTO oe_grid_capacity_allocations (
  id, allocation_number,
  applicant_party_id, applicant_party_name, operator_party_id, operator_party_name,
  capacity_tier, connection_type, technology, network_level, project_name, project_location, requested_capacity_mw, substation, supply_area, estimated_capex_zar_m,
  application_ref, screening_ref, application_basis, screening_basis, reason_code, decision_notes,
  chain_status, application_received_at, completeness_screening_at, withdrawn_at, created_by
) VALUES (
  'gcap_009', 'NTCSA-CAP-2026-0009',
  'dev_mokopane', 'Mokopane Smelter Expansion', 'ntcsa_grid', 'NTCSA — Grid Access Unit',
  'minor', 'load', 'none', 'distribution', 'Mokopane Smelter Load', 'Limpopo — Waterberg', 5, 'Mokopane 132kV', 'Limpopo distribution', 70,
  'NTCSA-CAP-APP-2026-0009', 'NTCSA-CAP-SCR-2026-0009',
  'An industrial customer applied for a 5MW new load connection for a smelter expansion at the Mokopane supply point.',
  'Completeness screening opened; the customer indicated the expansion would be deferred pending a commodity-price review.',
  'withdrawn_project_deferred',
  'WITHDRAWN by the applicant: the smelter expansion was deferred and the load connection was no longer required for the current horizon.',
  'withdrawn', '2026-04-12 08:00:00', '2026-04-18 09:00:00', '2026-04-28 09:00:00', 'demo_grid_001'
);

-- 10) lapsed — small, 20MW solar offer lapsed (non-responsive to the offer)
INSERT OR IGNORE INTO oe_grid_capacity_allocations (
  id, allocation_number,
  applicant_party_id, applicant_party_name, operator_party_id, operator_party_name,
  capacity_tier, connection_type, technology, network_level, project_name, project_location, requested_capacity_mw, queue_rank, priority_date, substation, supply_area, estimated_capex_zar_m,
  application_ref, screening_ref, assessment_ref, queue_ref, offer_ref,
  application_basis, screening_basis, assessment_basis, queue_basis, offer_basis, reason_code, decision_notes,
  chain_status, application_received_at, completeness_screening_at, capacity_assessment_at, queue_positioned_at, offer_issued_at, lapsed_at, created_by
) VALUES (
  'gcap_010', 'NTCSA-CAP-2026-0010',
  'dev_vryburg', 'Vryburg AgriSolar', 'ntcsa_grid', 'NTCSA — Grid Access Unit',
  'small', 'generation', 'solar_pv', 'distribution', 'Vryburg AgriSolar', 'North West — Dr Ruth Segomotsi Mompati', 20, 5, '2026-02-25', 'Vryburg 132kV', 'North West distribution', 240,
  'NTCSA-CAP-APP-2026-0010', 'NTCSA-CAP-SCR-2026-0010', 'NTCSA-CAP-ASMT-2026-0010', 'NTCSA-CAP-QUE-2026-0010', 'NTCSA-CAP-OFR-2026-0010',
  'A developer applied for a 20MW solar connection at the Vryburg supply point for agricultural wheeling.',
  'Completeness screening confirmed the package.',
  'Capacity assessment confirmed headroom available at Vryburg.',
  'Queue position 5 assigned on a 2026-02-25 priority date.',
  'A capacity-allocation offer was issued for 20MW at Vryburg 132kV with a 30-day acceptance window.',
  'offer_lapsed_non_responsive',
  'LAPSED: the applicant did not accept the capacity-allocation offer within the acceptance window; the offer lapsed and the headroom was returned to the Vryburg queue. The applicant may re-apply.',
  'lapsed', '2026-02-01 08:00:00', '2026-02-08 09:00:00', '2026-02-15 09:00:00', '2026-02-25 09:00:00', '2026-03-05 09:00:00', '2026-04-20 09:00:00', 'demo_grid_001'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- gcap_001 (application_received)
INSERT OR IGNORE INTO oe_grid_capacity_allocations_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('gcapv_001_a', 'gcap_001', 'grid_capacity.application_received', null, 'application_received', 'dev_reivilo', 'applicant', 'Reivilo 8MW distribution-level solar capacity application filed', '2026-05-27 08:00:00');

-- gcap_002 (completeness_screening)
INSERT OR IGNORE INTO oe_grid_capacity_allocations_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('gcapv_002_a', 'gcap_002', 'grid_capacity.application_received', null, 'application_received', 'dev_prieska', 'applicant', 'Prieska 30MW solar capacity application filed', '2026-05-21 08:00:00'),
('gcapv_002_b', 'gcap_002', 'grid_capacity.completeness_screening', 'application_received', 'completeness_screening', 'ntcsa_network', 'network', 'Completeness screening opened — single-line diagram, point-of-connection, land rights, grid-code declaration', '2026-05-24 09:00:00');

-- gcap_003 (information_requested)
INSERT OR IGNORE INTO oe_grid_capacity_allocations_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('gcapv_003_a', 'gcap_003', 'grid_capacity.application_received', null, 'application_received', 'dev_komsberg', 'applicant', 'Komsberg 75MW transmission-level wind capacity application filed', '2026-05-08 08:00:00'),
('gcapv_003_b', 'gcap_003', 'grid_capacity.completeness_screening', 'application_received', 'completeness_screening', 'ntcsa_network', 'network', 'Completeness screening opened — constrained Komsberg corridor shared with queued projects', '2026-05-12 09:00:00'),
('gcapv_003_c', 'gcap_003', 'grid_capacity.information_requested', 'completeness_screening', 'information_requested', 'ntcsa_network', 'network', 'RFI issued — reactive-power capability curve, preferred and alternate connection point, fault-ride-through certificate (30-day window)', '2026-05-16 09:00:00');

-- gcap_004 (capacity_assessment, BREACHED)
INSERT OR IGNORE INTO oe_grid_capacity_allocations_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('gcapv_004_a', 'gcap_004', 'grid_capacity.application_received', null, 'application_received', 'dev_dearr', 'applicant', 'De Aar 180MW solar plus battery capacity application filed', '2026-02-10 08:00:00'),
('gcapv_004_b', 'gcap_004', 'grid_capacity.completeness_screening', 'application_received', 'completeness_screening', 'ntcsa_network', 'network', 'Completeness screening confirmed; system-impact study mandatory at transmission level', '2026-02-18 09:00:00'),
('gcapv_004_c', 'gcap_004', 'grid_capacity.capacity_assessment', 'completeness_screening', 'capacity_assessment', 'ntcsa_network', 'network', 'Capacity assessment opened — load-flow, fault-level, stability and headroom study at the Hydra cluster', '2026-03-01 09:00:00');

-- gcap_005 (queue_positioned, BREACHED)
INSERT OR IGNORE INTO oe_grid_capacity_allocations_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('gcapv_005_a', 'gcap_005', 'grid_capacity.application_received', null, 'application_received', 'dev_karoo', 'applicant', 'Karoo 320MW wind capacity application filed', '2026-01-10 08:00:00'),
('gcapv_005_b', 'gcap_005', 'grid_capacity.completeness_screening', 'application_received', 'completeness_screening', 'ntcsa_network', 'network', 'Completeness screening confirmed; system-impact study scheduled', '2026-01-22 09:00:00'),
('gcapv_005_c', 'gcap_005', 'grid_capacity.capacity_assessment', 'completeness_screening', 'capacity_assessment', 'ntcsa_network', 'network', 'Capacity assessment — headroom available only after Gamma corridor reinforcement', '2026-02-01 09:00:00'),
('gcapv_005_d', 'gcap_005', 'grid_capacity.queue_positioned', 'capacity_assessment', 'queue_positioned', 'ntcsa_network', 'network', 'Queue position 4 assigned on a 2026-02-15 priority date behind three earlier projects', '2026-02-15 09:00:00');

-- gcap_006 (capacity_allocated flagship — full happy arc)
INSERT OR IGNORE INTO oe_grid_capacity_allocations_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('gcapv_006_a', 'gcap_006', 'grid_capacity.application_received', null, 'application_received', 'dev_garob', 'applicant', 'Garob 60MW solar capacity application filed', '2025-11-01 08:00:00'),
('gcapv_006_b', 'gcap_006', 'grid_capacity.completeness_screening', 'application_received', 'completeness_screening', 'ntcsa_network', 'network', 'Completeness screening confirmed full package on first pass', '2025-11-08 09:00:00'),
('gcapv_006_c', 'gcap_006', 'grid_capacity.capacity_assessment', 'completeness_screening', 'capacity_assessment', 'ntcsa_network', 'network', 'Capacity assessment confirmed firm headroom at Aggeneis without reinforcement', '2025-11-20 09:00:00'),
('gcapv_006_d', 'gcap_006', 'grid_capacity.queue_positioned', 'capacity_assessment', 'queue_positioned', 'ntcsa_network', 'network', 'Queue position 1 assigned on a 2025-11-20 priority date with confirmed headroom', '2025-12-05 09:00:00'),
('gcapv_006_e', 'gcap_006', 'grid_capacity.offer_issued', 'queue_positioned', 'offer_issued', 'ntcsa_committee', 'committee', 'Capacity-allocation offer issued for the full 60MW at Aggeneis 400kV', '2026-01-10 09:00:00'),
('gcapv_006_f', 'gcap_006', 'grid_capacity.capacity_reserved', 'offer_issued', 'capacity_reserved', 'dev_garob', 'applicant', 'Offer accepted; 60MW reserved pending financial close and milestone schedule', '2026-02-01 09:00:00'),
('gcapv_006_g', 'gcap_006', 'grid_capacity.capacity_allocated', 'capacity_reserved', 'capacity_allocated', 'ntcsa_committee', 'committee', 'CAPACITY ALLOCATED — 60MW at Aggeneis 400kV; certificate NTCSA-CAP-ALC-2026-0142; handed to W28 GCA-2026-NC-0612', '2026-03-15 09:00:00');

-- gcap_007 (rejected — crosses regulator, EVERY tier, the W58 signature)
INSERT OR IGNORE INTO oe_grid_capacity_allocations_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('gcapv_007_a', 'gcap_007', 'grid_capacity.application_received', null, 'application_received', 'dev_ncmega', 'applicant', 'Northern Cape Mega 400MW solar plus battery capacity application filed', '2025-10-15 08:00:00'),
('gcapv_007_b', 'gcap_007', 'grid_capacity.completeness_screening', 'application_received', 'completeness_screening', 'ntcsa_network', 'network', 'Completeness screening confirmed; system-impact study scheduled', '2025-10-25 09:00:00'),
('gcapv_007_c', 'gcap_007', 'grid_capacity.capacity_assessment', 'completeness_screening', 'capacity_assessment', 'ntcsa_network', 'network', 'Capacity assessment — Kronos corridor fully subscribed, reinforcement not in funded plan within horizon', '2025-11-10 09:00:00'),
('gcapv_007_d', 'gcap_007', 'grid_capacity.rejected', 'capacity_assessment', 'rejected', 'ntcsa_committee', 'committee', 'REJECTED — no available capacity and no funded reinforcement; crosses to NERSA grid-access oversight for every tier', '2026-01-20 09:00:00');

-- gcap_008 (relinquished — crosses regulator, large + strategic)
INSERT OR IGNORE INTO oe_grid_capacity_allocations_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('gcapv_008_a', 'gcap_008', 'grid_capacity.application_received', null, 'application_received', 'dev_hexbess', 'applicant', 'Hex 150MW battery storage capacity application filed', '2025-09-01 08:00:00'),
('gcapv_008_b', 'gcap_008', 'grid_capacity.completeness_screening', 'application_received', 'completeness_screening', 'ntcsa_network', 'network', 'Completeness screening confirmed the package', '2025-09-10 09:00:00'),
('gcapv_008_c', 'gcap_008', 'grid_capacity.capacity_assessment', 'completeness_screening', 'capacity_assessment', 'ntcsa_network', 'network', 'Capacity assessment confirmed headroom after a minor busbar upgrade', '2025-09-25 09:00:00'),
('gcapv_008_d', 'gcap_008', 'grid_capacity.queue_positioned', 'capacity_assessment', 'queue_positioned', 'ntcsa_network', 'network', 'Queue position 2 assigned on a 2025-10-20 priority date', '2025-10-20 09:00:00'),
('gcapv_008_e', 'gcap_008', 'grid_capacity.offer_issued', 'queue_positioned', 'offer_issued', 'ntcsa_committee', 'committee', 'Capacity-allocation offer issued for 150MW at Droerivier 400kV', '2025-11-15 09:00:00'),
('gcapv_008_f', 'gcap_008', 'grid_capacity.capacity_reserved', 'offer_issued', 'capacity_reserved', 'dev_hexbess', 'applicant', 'Offer accepted; 150MW reserved pending milestone schedule', '2025-12-10 09:00:00'),
('gcapv_008_g', 'gcap_008', 'grid_capacity.relinquished', 'capacity_reserved', 'relinquished', 'dev_hexbess', 'applicant', 'RELINQUISHED — offtake mandate lost; 150MW returned to the Droerivier pool; large-tier relinquishment crosses to grid-access oversight', '2026-02-28 09:00:00');

-- gcap_009 (withdrawn)
INSERT OR IGNORE INTO oe_grid_capacity_allocations_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('gcapv_009_a', 'gcap_009', 'grid_capacity.application_received', null, 'application_received', 'dev_mokopane', 'applicant', 'Mokopane 5MW new load connection capacity application filed', '2026-04-12 08:00:00'),
('gcapv_009_b', 'gcap_009', 'grid_capacity.completeness_screening', 'application_received', 'completeness_screening', 'ntcsa_network', 'network', 'Completeness screening opened; customer signalled a deferral', '2026-04-18 09:00:00'),
('gcapv_009_c', 'gcap_009', 'grid_capacity.withdrawn', 'completeness_screening', 'withdrawn', 'dev_mokopane', 'applicant', 'WITHDRAWN — smelter expansion deferred; load connection no longer required for the horizon', '2026-04-28 09:00:00');

-- gcap_010 (lapsed — non-responsive to the offer)
INSERT OR IGNORE INTO oe_grid_capacity_allocations_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('gcapv_010_a', 'gcap_010', 'grid_capacity.application_received', null, 'application_received', 'dev_vryburg', 'applicant', 'Vryburg 20MW solar capacity application filed', '2026-02-01 08:00:00'),
('gcapv_010_b', 'gcap_010', 'grid_capacity.completeness_screening', 'application_received', 'completeness_screening', 'ntcsa_network', 'network', 'Completeness screening confirmed the package', '2026-02-08 09:00:00'),
('gcapv_010_c', 'gcap_010', 'grid_capacity.capacity_assessment', 'completeness_screening', 'capacity_assessment', 'ntcsa_network', 'network', 'Capacity assessment confirmed headroom at Vryburg', '2026-02-15 09:00:00'),
('gcapv_010_d', 'gcap_010', 'grid_capacity.queue_positioned', 'capacity_assessment', 'queue_positioned', 'ntcsa_network', 'network', 'Queue position 5 assigned on a 2026-02-25 priority date', '2026-02-25 09:00:00'),
('gcapv_010_e', 'gcap_010', 'grid_capacity.offer_issued', 'queue_positioned', 'offer_issued', 'ntcsa_committee', 'committee', 'Capacity-allocation offer issued for 20MW at Vryburg 132kV with a 30-day acceptance window', '2026-03-05 09:00:00'),
('gcapv_010_f', 'gcap_010', 'grid_capacity.lapsed', 'offer_issued', 'lapsed', 'ntcsa_network', 'network', 'LAPSED — offer not accepted within the window; headroom returned to the Vryburg queue', '2026-04-20 09:00:00');
