-- Migration 438: Goldrush C&I fleet — om_sites bridging + offtaker activation
--
-- 1. Set offtaker_participant_id on all 10 Goldrush stations (demo_offtaker_001)
-- 2. Create om_sites records for all 10 C&I sites (enables W71/W51/W59/W72/W79 chains)
-- 3. Link solax_stations.site_id → om_sites.id for chain coverage
-- 4. Add W191 offtaker links (link_active) for the 9 stations missing them
--    (Malvern already has slink-007)

-- ─── 1. Fix offtaker_participant_id on all 10 Goldrush stations ───────────────
UPDATE solax_stations
   SET offtaker_participant_id = 'demo_offtaker_001',
       updated_at = datetime('now')
 WHERE participant_id = 'id_7c352b86da89907a85266a250e15db95';

-- ─── 2. Insert om_sites for all 10 Goldrush C&I locations ─────────────────────
INSERT INTO om_sites
  (id, name, participant_id, technology, capacity_mw, capacity_kwp,
   province, latitude, longitude, commissioning_date,
   lender_id, status, commissioning_status,
   devices_registered_at, first_telemetry_at, energised_at, in_om_at,
   created_at, updated_at)
VALUES
-- Goldrush Malvern (100 kW — Durban South, KZN)
('om_site_gr_malvern',
 'Goldrush Malvern',
 'id_7c352b86da89907a85266a250e15db95',
 'solar_pv', 0.100, 100.0,
 'KwaZulu-Natal', -29.8874, 30.9786,
 '2024-03-01',
 'demo_lender_001', 'active', 'in_om',
 '2024-02-15', '2024-02-20', '2024-03-01', '2024-03-15',
 '2024-02-10 08:00:00', datetime('now')),

-- Goldrush Bela Bela (100 kW — Limpopo)
('om_site_gr_bela_bela',
 'Goldrush Bela Bela',
 'id_7c352b86da89907a85266a250e15db95',
 'solar_pv', 0.100, 100.0,
 'Limpopo', -24.8834, 28.3120,
 '2024-03-01',
 'demo_lender_001', 'active', 'in_om',
 '2024-02-15', '2024-02-20', '2024-03-01', '2024-03-15',
 '2024-02-10 08:00:00', datetime('now')),

-- Goldrush Chatsworth (1) (100 kW — KZN)
('om_site_gr_chatsworth_1',
 'Goldrush Chatsworth 1',
 'id_7c352b86da89907a85266a250e15db95',
 'solar_pv', 0.100, 100.0,
 'KwaZulu-Natal', -29.9078, 30.9138,
 '2024-03-01',
 'demo_lender_001', 'active', 'in_om',
 '2024-02-15', '2024-02-20', '2024-03-01', '2024-03-15',
 '2024-02-10 08:00:00', datetime('now')),

-- Goldrush Chatsworth (2) (100 kW — KZN)
('om_site_gr_chatsworth_2',
 'Goldrush Chatsworth 2',
 'id_7c352b86da89907a85266a250e15db95',
 'solar_pv', 0.100, 100.0,
 'KwaZulu-Natal', -29.9095, 30.9162,
 '2024-03-01',
 'demo_lender_001', 'active', 'in_om',
 '2024-02-15', '2024-02-20', '2024-03-01', '2024-03-15',
 '2024-02-10 08:00:00', datetime('now')),

-- Goldrush HQ (60 kW — Durban CBD, KZN)
('om_site_gr_hq',
 'Goldrush HQ',
 'id_7c352b86da89907a85266a250e15db95',
 'solar_pv', 0.060, 60.0,
 'KwaZulu-Natal', -29.8587, 31.0218,
 '2024-03-01',
 'demo_lender_001', 'active', 'in_om',
 '2024-02-15', '2024-02-20', '2024-03-01', '2024-03-15',
 '2024-02-10 08:00:00', datetime('now')),

-- Goldrush Ladysmith (120 kW — KZN)
('om_site_gr_ladysmith',
 'Goldrush Ladysmith',
 'id_7c352b86da89907a85266a250e15db95',
 'solar_pv', 0.120, 120.0,
 'KwaZulu-Natal', -28.5565, 29.7843,
 '2024-03-01',
 'demo_lender_001', 'active', 'in_om',
 '2024-02-15', '2024-02-20', '2024-03-01', '2024-03-15',
 '2024-02-10 08:00:00', datetime('now')),

-- Goldrush Pietermaritzburg (60 kW — KZN)
('om_site_gr_pmb',
 'Goldrush Pietermaritzburg',
 'id_7c352b86da89907a85266a250e15db95',
 'solar_pv', 0.060, 60.0,
 'KwaZulu-Natal', -29.6006, 30.3794,
 '2024-03-01',
 'demo_lender_001', 'active', 'in_om',
 '2024-02-15', '2024-02-20', '2024-03-01', '2024-03-15',
 '2024-02-10 08:00:00', datetime('now')),

-- Goldrush Stanger (100 kW — KZN)
('om_site_gr_stanger',
 'Goldrush Stanger',
 'id_7c352b86da89907a85266a250e15db95',
 'solar_pv', 0.100, 100.0,
 'KwaZulu-Natal', -29.3321, 31.2887,
 '2024-03-01',
 'demo_lender_001', 'active', 'in_om',
 '2024-02-15', '2024-02-20', '2024-03-01', '2024-03-15',
 '2024-02-10 08:00:00', datetime('now')),

-- Goldrush West Street (100 kW — Durban CBD, KZN)
('om_site_gr_west_street',
 'Goldrush West Street',
 'id_7c352b86da89907a85266a250e15db95',
 'solar_pv', 0.100, 100.0,
 'KwaZulu-Natal', -29.8579, 31.0173,
 '2024-03-01',
 'demo_lender_001', 'active', 'in_om',
 '2024-02-15', '2024-02-20', '2024-03-01', '2024-03-15',
 '2024-02-10 08:00:00', datetime('now')),

-- Goldrush Wonderpark (100 kW — Gauteng)
('om_site_gr_wonderpark',
 'Goldrush Wonderpark',
 'id_7c352b86da89907a85266a250e15db95',
 'solar_pv', 0.100, 100.0,
 'Gauteng', -25.6574, 28.1101,
 '2024-03-01',
 'demo_lender_001', 'active', 'in_om',
 '2024-02-15', '2024-02-20', '2024-03-01', '2024-03-15',
 '2024-02-10 08:00:00', datetime('now'));

-- ─── 3. Link solax_stations.site_id → om_sites ────────────────────────────────
UPDATE solax_stations SET site_id = 'om_site_gr_malvern',      updated_at = datetime('now')
 WHERE id = 'ssx_343f4d88b936057a053caed6036ec523';

UPDATE solax_stations SET site_id = 'om_site_gr_bela_bela',    updated_at = datetime('now')
 WHERE id = 'ssx_9faa08e2558f2c3ce49c4f08e93b2320';

UPDATE solax_stations SET site_id = 'om_site_gr_chatsworth_1', updated_at = datetime('now')
 WHERE id = 'ssx_9273339b718b2257cc36292ce9d9126e';

UPDATE solax_stations SET site_id = 'om_site_gr_chatsworth_2', updated_at = datetime('now')
 WHERE id = 'ssx_a9f17c32c1894e5cc64e442f9b551e22';

UPDATE solax_stations SET site_id = 'om_site_gr_hq',           updated_at = datetime('now')
 WHERE id = 'ssx_f4adc5dcfbc7c5de496aa40cefa7cb27';

UPDATE solax_stations SET site_id = 'om_site_gr_ladysmith',    updated_at = datetime('now')
 WHERE id = 'ssx_c0af7afc350c4700327b623afb146d2b';

UPDATE solax_stations SET site_id = 'om_site_gr_pmb',          updated_at = datetime('now')
 WHERE id = 'ssx_ac1e87a8e3a7b4936460153014477dac';

UPDATE solax_stations SET site_id = 'om_site_gr_stanger',      updated_at = datetime('now')
 WHERE id = 'ssx_ff8c11bcb035dbcf7d5bab5dc0b26913';

UPDATE solax_stations SET site_id = 'om_site_gr_west_street',  updated_at = datetime('now')
 WHERE id = 'ssx_406fabc54aeb72353781500be287f0ae';

UPDATE solax_stations SET site_id = 'om_site_gr_wonderpark',   updated_at = datetime('now')
 WHERE id = 'ssx_285085eb300cf51617d42f9fe388c011';

-- ─── 4. W191 offtaker links for 9 stations missing them ──────────────────────
-- slink-007 already covers Malvern; these cover the remaining 9.
INSERT INTO oe_station_participant_links
  (id, station_id, initiating_participant_id, accepting_participant_id,
   link_type, reference_id, chain_status, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason, created_at, updated_at)
VALUES
('slink-013',
 'ssx_9faa08e2558f2c3ce49c4f08e93b2320',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_offtaker_001',
 'offtaker', 'OT-GR-002',
 'link_active', NULL, 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Energy offtake agreement executed for Bela Bela site',
 '2024-02-28 10:00:00', '2024-03-15 11:00:00'),

('slink-014',
 'ssx_9273339b718b2257cc36292ce9d9126e',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_offtaker_001',
 'offtaker', 'OT-GR-003',
 'link_active', NULL, 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Energy offtake agreement executed for Chatsworth 1 site',
 '2024-02-28 10:00:00', '2024-03-15 11:00:00'),

('slink-015',
 'ssx_a9f17c32c1894e5cc64e442f9b551e22',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_offtaker_001',
 'offtaker', 'OT-GR-004',
 'link_active', NULL, 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Energy offtake agreement executed for Chatsworth 2 site',
 '2024-02-28 10:00:00', '2024-03-15 11:00:00'),

('slink-016',
 'ssx_f4adc5dcfbc7c5de496aa40cefa7cb27',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_offtaker_001',
 'offtaker', 'OT-GR-005',
 'link_active', NULL, 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Energy offtake agreement executed for HQ site',
 '2024-02-28 10:00:00', '2024-03-15 11:00:00'),

('slink-017',
 'ssx_c0af7afc350c4700327b623afb146d2b',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_offtaker_001',
 'offtaker', 'OT-GR-006',
 'link_active', NULL, 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Energy offtake agreement executed for Ladysmith site',
 '2024-02-28 10:00:00', '2024-03-15 11:00:00'),

('slink-018',
 'ssx_ac1e87a8e3a7b4936460153014477dac',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_offtaker_001',
 'offtaker', 'OT-GR-007',
 'link_active', NULL, 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Energy offtake agreement executed for Pietermaritzburg site',
 '2024-02-28 10:00:00', '2024-03-15 11:00:00'),

('slink-019',
 'ssx_ff8c11bcb035dbcf7d5bab5dc0b26913',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_offtaker_001',
 'offtaker', 'OT-GR-008',
 'link_active', NULL, 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Energy offtake agreement executed for Stanger site',
 '2024-02-28 10:00:00', '2024-03-15 11:00:00'),

('slink-020',
 'ssx_406fabc54aeb72353781500be287f0ae',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_offtaker_001',
 'offtaker', 'OT-GR-009',
 'link_active', NULL, 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Energy offtake agreement executed for West Street site',
 '2024-02-28 10:00:00', '2024-03-15 11:00:00'),

('slink-021',
 'ssx_285085eb300cf51617d42f9fe388c011',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_offtaker_001',
 'offtaker', 'OT-GR-010',
 'link_active', NULL, 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Energy offtake agreement executed for Wonderpark site',
 '2024-02-28 10:00:00', '2024-03-15 11:00:00');
