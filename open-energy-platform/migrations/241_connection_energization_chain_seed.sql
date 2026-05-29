-- Wave 75 — Grid Connection Energization & Commissioning Hold-Point Gate seed.
-- 10 connections cen_001..cen_010 spanning 10 distinct lifecycle states, all five
-- capacity tiers and a mix of technologies. Four reportable cases prove the W75
-- signature:
--   - cen_006 transmission cold_commissioning + cen_007 transmission synchronized
--     (authorize_energization crossed for the large tier),
--   - cen_009 a DISTRIBUTION plant at commercial_operation (issue_cod crosses for
--     EVERY tier — the COD-driven positive signature, proven here on a non-large tier),
--   - cen_010 a transmission plant in commissioning_suspended (suspend crosses large).
-- No apostrophes anywhere (D1 SQLite). connection_capacity_mw drives connection_tier.

INSERT OR IGNORE INTO oe_connection_energization (
  id, energization_number,
  source_event, source_entity_type, source_entity_id, source_wave, gca_ref, capacity_allocation_ref,
  facility_id, facility_name, connection_point, network_operator,
  technology, connection_capacity_mw, voltage_kv, connection_tier,
  cod_certificate_no, cod_date,
  program_ref, inspection_ref, energization_ref, synchronization_ref, compliance_test_ref, suspension_ref, withdrawal_ref,
  program_basis, approval_basis, inspection_basis, energization_basis, cold_commissioning_basis, synchronization_basis, trial_operation_basis, compliance_test_basis, cod_basis, suspension_basis, resumption_basis, withdrawal_basis, reason_code,
  chain_status, connection_ready_at, program_review_at, program_approved_at, pre_energization_inspection_at, energization_authorized_at, cold_commissioning_at, synchronized_at, trial_operation_at, compliance_testing_at, commercial_operation_at, commissioning_suspended_at, connection_withdrawn_at,
  sla_deadline_at, last_sla_breach_at, is_reportable, escalation_level, created_by
) VALUES
-- cen_001 embedded 0.5MW solar — connection ready, programme not yet submitted
('cen_001','CEN-2026-0001',
 NULL,NULL,NULL,NULL,'GCA-2026-1001','GCAP-2026-1001',
 'fac_karoo_rooftop','Karoo Rooftop Solar SPV','Beaufort West LV feeder','Beaufort West Municipality',
 'solar_pv',0.5,0.4,'embedded',
 NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'connection_ready','2026-05-20 08:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-19 08:00:00',NULL,0,0,'demo_grid_001'),

-- cen_002 distribution 8MW solar — commissioning programme under SO review
('cen_002','CEN-2026-0002',
 NULL,NULL,NULL,NULL,'GCA-2026-1002','GCAP-2026-1002',
 'fac_midrand_solar','Midrand Solar Park','Midrand 11kV substation','NTCSA',
 'solar_pv',8,11,'distribution',
 NULL,NULL,
 'CEN-2026-0002-PRG',NULL,NULL,NULL,NULL,NULL,NULL,
 'Commissioning programme submitted by the developer setting out the witnessed hold-point schedule.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'program_review','2026-05-10 08:00:00','2026-05-18 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-25 09:00:00',NULL,0,0,'demo_grid_001'),

-- cen_003 sub_transmission 30MW wind — programme approved, awaiting pre-energization inspection
('cen_003','CEN-2026-0003',
 NULL,NULL,NULL,NULL,'GCA-2026-1003','GCAP-2026-1003',
 'fac_overberg_wind','Overberg Wind Farm Phase 1','Caledon 66kV substation','NTCSA',
 'wind',30,66,'sub_transmission',
 NULL,NULL,
 'CEN-2026-0003-PRG',NULL,NULL,NULL,NULL,NULL,NULL,
 'Commissioning programme submitted with the protection and SCADA test plan.','Programme approved by the System Operator; hold-point witnesses scheduled.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'program_approved','2026-04-20 08:00:00','2026-04-28 09:00:00','2026-05-06 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-20 10:00:00',NULL,0,0,'demo_grid_001'),

-- cen_004 bulk 250MW wind — pre-energization safety inspection in progress (conduct_inspection does not cross)
('cen_004','CEN-2026-0004',
 NULL,NULL,NULL,NULL,'GCA-2026-1004','GCAP-2026-1004',
 'fac_karoo_mega_wind','Karoo Mega Wind Facility','Hydra 400kV busbar','NTCSA',
 'wind',250,400,'bulk',
 NULL,NULL,
 'CEN-2026-0004-PRG',NULL,NULL,NULL,NULL,NULL,NULL,
 'Commissioning programme submitted for a bulk-transmission connection with a multi-week test campaign.','Programme approved with additional reactive-capability witness points.','Pre-energization safety inspection of the connection assets and protection settings in progress.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'pre_energization_inspection','2026-03-20 08:00:00','2026-04-05 09:00:00','2026-04-25 10:00:00','2026-05-22 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-05 11:00:00',NULL,0,0,'demo_grid_001'),

-- cen_005 sub_transmission 45MW battery — energization authorized (authorize_energization on a non-large tier does not cross)
('cen_005','CEN-2026-0005',
 NULL,NULL,NULL,NULL,'GCA-2026-1005','GCAP-2026-1005',
 'fac_grootvlei_bess','Grootvlei Battery Storage','Grootvlei 66kV substation','NTCSA',
 'battery',45,66,'sub_transmission',
 NULL,NULL,
 'CEN-2026-0005-PRG','CEN-2026-0005-INS','CEN-2026-0005-ENG',NULL,NULL,NULL,NULL,
 'Commissioning programme submitted for a grid-scale battery storage connection.','Programme approved.','Pre-energization inspection passed; protection and earthing verified.','Energization of the connection assets authorized by the System Operator.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'energization_authorized','2026-04-01 08:00:00','2026-04-08 09:00:00','2026-04-16 10:00:00','2026-04-28 11:00:00','2026-05-15 12:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-20 12:00:00',NULL,0,0,'demo_grid_001'),

-- cen_006 transmission 150MW wind — cold commissioning (REPORTABLE: authorize_energization crossed for the large tier)
('cen_006','CEN-2026-0006',
 NULL,NULL,NULL,NULL,'GCA-2026-1006','GCAP-2026-1006',
 'fac_komsberg_wind','Komsberg Wind Farm','Komsberg 132kV substation','NTCSA',
 'wind',150,132,'transmission',
 NULL,NULL,
 'CEN-2026-0006-PRG','CEN-2026-0006-INS','CEN-2026-0006-ENG',NULL,NULL,NULL,NULL,
 'Commissioning programme submitted for a transmission-connected wind facility.','Programme approved with fault ride-through and reactive-capability witness points.','Pre-energization inspection passed.','First energization of a system-significant connection onto the live transmission network authorized.','Cold commissioning underway proving protection, SCADA and telemetry with no generation.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'cold_commissioning','2026-02-15 08:00:00','2026-02-28 09:00:00','2026-03-14 10:00:00','2026-03-28 11:00:00','2026-04-10 12:00:00','2026-05-10 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-31 09:00:00',NULL,1,0,'demo_grid_001'),

-- cen_007 transmission 120MW solar — first synchronization complete (REPORTABLE: authorize_energization crossed for the large tier)
('cen_007','CEN-2026-0007',
 NULL,NULL,NULL,NULL,'GCA-2026-1007','GCAP-2026-1007',
 'fac_kathu_solar_two','Kathu Solar Two','Kathu 132kV substation','NTCSA',
 'solar_pv',120,132,'transmission',
 NULL,NULL,
 'CEN-2026-0007-PRG','CEN-2026-0007-INS','CEN-2026-0007-ENG','CEN-2026-0007-SYN',NULL,NULL,NULL,
 'Commissioning programme submitted for a transmission-connected solar plant.','Programme approved.','Pre-energization inspection passed.','Energization of the connection authorized.','Cold commissioning completed.','Plant first synchronized to the grid; sync-check and angle within limits.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'synchronized','2026-02-01 08:00:00','2026-02-14 09:00:00','2026-02-28 10:00:00','2026-03-14 11:00:00','2026-03-28 12:00:00','2026-04-15 09:00:00','2026-05-12 10:00:00',NULL,NULL,NULL,NULL,NULL,
 '2026-05-19 10:00:00',NULL,1,0,'demo_grid_001'),

-- cen_008 sub_transmission 40MW solar — grid-code compliance testing (sub_transmission, no large crossing)
('cen_008','CEN-2026-0008',
 NULL,NULL,NULL,NULL,'GCA-2026-1008','GCAP-2026-1008',
 'fac_prieska_solar','Prieska Solar Plant','Prieska 66kV substation','NTCSA',
 'solar_pv',40,66,'sub_transmission',
 NULL,NULL,
 'CEN-2026-0008-PRG','CEN-2026-0008-INS','CEN-2026-0008-ENG','CEN-2026-0008-SYN','CEN-2026-0008-CMP',NULL,NULL,
 'Commissioning programme submitted.','Programme approved.','Pre-energization inspection passed.','Energization authorized.','Cold commissioning completed.','Synchronization completed.','Trial-operation run completed under load with no protection trips.','Grid-code compliance tests underway covering fault ride-through, reactive capability and frequency response.',NULL,NULL,NULL,NULL,NULL,
 'compliance_testing','2026-03-05 08:00:00','2026-03-18 09:00:00','2026-04-01 10:00:00','2026-04-12 11:00:00','2026-04-22 12:00:00','2026-05-02 09:00:00','2026-05-12 10:00:00','2026-05-18 11:00:00','2026-05-24 09:00:00',NULL,NULL,NULL,
 '2026-06-14 09:00:00',NULL,0,0,'demo_grid_001'),

-- cen_009 distribution 9MW solar — COMMERCIAL OPERATION (REPORTABLE: issue_cod crosses EVERY tier — proven on a non-large tier)
('cen_009','CEN-2026-0009',
 NULL,NULL,NULL,NULL,'GCA-2026-1009','GCAP-2026-1009',
 'fac_vredendal_solar','Vredendal Solar Park','Vredendal 11kV substation','Matzikama Municipality',
 'solar_pv',9,11,'distribution',
 'COD-2026-0009','2026-05-20',
 'CEN-2026-0009-PRG','CEN-2026-0009-INS','CEN-2026-0009-ENG','CEN-2026-0009-SYN','CEN-2026-0009-CMP',NULL,NULL,
 'Commissioning programme submitted.','Programme approved.','Pre-energization inspection passed.','Energization authorized.','Cold commissioning completed.','Synchronization completed.','Trial-operation run completed.','Grid-code compliance tests witnessed and passed.','Commercial Operation Date certificate issued; connection registered as operational generation.',NULL,NULL,NULL,NULL,
 'commercial_operation','2026-01-10 08:00:00','2026-01-22 09:00:00','2026-02-05 10:00:00','2026-02-18 11:00:00','2026-03-01 12:00:00','2026-03-20 09:00:00','2026-04-05 10:00:00','2026-04-20 11:00:00','2026-05-05 09:00:00','2026-05-20 10:00:00',NULL,NULL,
 NULL,NULL,1,0,'demo_grid_001'),

-- cen_010 transmission 180MW wind — commissioning suspended on a failed compliance test (REPORTABLE: suspend crosses the large tier)
('cen_010','CEN-2026-0010',
 NULL,NULL,NULL,NULL,'GCA-2026-1010','GCAP-2026-1010',
 'fac_roggeveld_wind','Roggeveld Wind Facility','Roggeveld 132kV substation','NTCSA',
 'wind',180,132,'transmission',
 NULL,NULL,
 'CEN-2026-0010-PRG','CEN-2026-0010-INS','CEN-2026-0010-ENG','CEN-2026-0010-SYN','CEN-2026-0010-CMP','CEN-2026-0010-SUS',NULL,
 'Commissioning programme submitted.','Programme approved.','Pre-energization inspection passed.','Energization authorized.','Cold commissioning completed.','Synchronization completed.','Trial-operation run completed.','Grid-code compliance tests commenced.',NULL,'Fault ride-through test failed; commissioning suspended pending protection re-coordination and a re-witnessed test campaign.',NULL,NULL,'failed_compliance_test',
 'commissioning_suspended','2026-02-10 08:00:00','2026-02-22 09:00:00','2026-03-08 10:00:00','2026-03-20 11:00:00','2026-04-01 12:00:00','2026-04-18 09:00:00','2026-05-01 10:00:00','2026-05-10 11:00:00','2026-05-16 09:00:00',NULL,'2026-05-22 09:00:00',NULL,
 '2026-06-05 09:00:00',NULL,1,1,'demo_grid_001');
