-- Wave 59 — Esums Preventive-Maintenance Schedule Compliance & Deferral seed.
-- 10 PM task instances pmc_001..pmc_010 spanning 10 distinct lifecycle states,
-- all five maintenance-criticality tiers (two per tier), and the rework / hold /
-- deferral / skip branches. Owners are project SPVs; contractors are O&M
-- providers; Esums operators record both parties' actions.

INSERT OR IGNORE INTO oe_pm_compliance (
  id, case_number, source_event, source_entity_type, source_entity_id, source_wave,
  owner_party_id, owner_party_name, contractor_party_id, contractor_party_name,
  site_id, site_name, site_province, technology, asset_tag, asset_class, contract_ref, pm_code, pm_title, pm_frequency,
  scheduled_date, window_start, window_end, deferred_to_date,
  criticality_score, criticality_tier,
  checklist_total_items, checklist_passed_items, labour_hours, estimated_cost_zar, actual_cost_zar,
  assignment_basis, completion_basis, verification_basis, deferral_basis, skip_basis, reason_code,
  rework_round, deferral_round,
  chain_status, pm_scheduled_at, work_assigned_at, in_progress_at, on_hold_at, completed_at, verification_pending_at, rework_required_at, deferral_requested_at, closed_at, deferred_at, skipped_at, cancelled_at,
  is_reportable, sla_deadline_at, escalation_level, created_by
) VALUES
-- pmc_001 routine / pm_scheduled — module-string visual inspection just placed on the calendar
('pmc_001','PM-COMP-2026-0001','maintenance.calendar_rollup','pm_plan','pmp_2026_q2_0001','W16',
 'own_lesedi','Lesedi Solar Power (Pty) Ltd','om_globeleq','Globeleq O&M Services',
 'site_lesedi','Lesedi Solar Power','Northern Cape','solar_pv','PV-STR-ALL','general','OMSA-2024-LSP-01','IEC62446-VIS','Module-string visual inspection and cleaning','quarterly',
 '2026-06-15','2026-06-01','2026-06-30',NULL,
 12,'routine',
 40,NULL,NULL,45000,NULL,
 'Quarterly module-string visual inspection scheduled for the Q2 maintenance window; awaiting crew assignment.',NULL,NULL,NULL,NULL,NULL,
 0,0,
 'pm_scheduled','2026-05-26 08:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-09 08:00:00',0,'demo_ipp_001'),

-- pmc_002 routine / work_assigned — nacelle visual inspection assigned; assignment SLA BREACHED
('pmc_002','PM-COMP-2026-0002','maintenance.calendar_rollup','pm_plan','pmp_2026_q2_0002',NULL,
 'own_dorper','Dorper Wind Farm (Pty) Ltd','om_nordex','Nordex Acciona O&M',
 'site_dorper','Dorper Wind Farm','Eastern Cape','wind','WTG-NAC-ALL','general','OMSA-2023-DWF-04','IEC62446-VIS','Nacelle external visual inspection','quarterly',
 '2026-05-20','2026-05-15','2026-05-31',NULL,
 16,'routine',
 28,NULL,NULL,38000,NULL,
 'Nacelle visual inspection assigned to the climbing crew; mobilisation pending past the response window.',NULL,NULL,NULL,NULL,NULL,
 0,0,
 'work_assigned','2026-05-18 08:00:00','2026-05-19 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-22 09:00:00',1,'demo_ipp_001'),

-- pmc_003 standard / in_progress — inverter quarterly service underway
('pmc_003','PM-COMP-2026-0003','maintenance.calendar_rollup','pm_plan','pmp_2026_q2_0003',NULL,
 'own_jasper','Jasper Solar (Pty) Ltd','om_sma','SMA Solar Service O&M',
 'site_jasper','Jasper Solar','Northern Cape','solar_pv','INV-BANK-A','inverter','OMSA-2023-JAS-02','SMA-INV-QSVC','Central inverter quarterly service','quarterly',
 '2026-05-25','2026-05-20','2026-05-31',NULL,
 33,'standard',
 55,NULL,6,120000,NULL,
 'Inverter quarterly service assigned and started by the SMA service team; filter and cooling checks underway.',NULL,NULL,NULL,NULL,NULL,
 0,0,
 'in_progress','2026-05-22 08:00:00','2026-05-23 09:00:00','2026-05-25 07:30:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-29 07:30:00',0,'demo_ipp_001'),

-- pmc_004 standard / on_hold — yaw-system service paused awaiting spare parts
('pmc_004','PM-COMP-2026-0004','maintenance.calendar_rollup','pm_plan','pmp_2026_q2_0004',NULL,
 'own_gouda','Gouda Wind Facility (Pty) Ltd','om_vestas','Vestas Southern Africa O&M',
 'site_gouda','Gouda Wind Facility','Western Cape','wind','WTG-YAW-12','general','OMSA-2023-GWF-03','VES-YAW-SVC','Yaw-system periodic service','annual',
 '2026-05-18','2026-05-12','2026-05-31',NULL,
 28,'standard',
 34,NULL,9,180000,NULL,
 'Yaw-system service started then paused; yaw-motor brushes on back-order from the OEM.','Field work suspended pending OEM spare-part delivery.',NULL,NULL,NULL,'awaiting_spares',
 0,0,
 'on_hold','2026-05-14 08:00:00','2026-05-15 09:00:00','2026-05-16 07:30:00','2026-05-17 14:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-31 14:00:00',0,'demo_ipp_001'),

-- pmc_005 significant / completed — combiner-box servicing finished, awaiting verification open
('pmc_005','PM-COMP-2026-0005','maintenance.calendar_rollup','pm_plan','pmp_2026_q2_0005',NULL,
 'own_droog','Droogfontein Solar Power (Pty) Ltd','om_scatec','Scatec Solar O&M',
 'site_droog','Droogfontein Solar Power','Northern Cape','solar_pv','CMB-ARR-ALL','general','OMSA-2023-DSP-02','SCT-CMB-SVC','DC combiner-box thermographic servicing','annual',
 '2026-05-20','2026-05-15','2026-05-31',NULL,
 48,'significant',
 60,60,14,260000,255000,
 'Combiner-box thermographic servicing completed across all arrays; field report submitted for verification.','All 60 combiner boxes serviced and thermal-scanned; no hotspots above threshold.',NULL,NULL,NULL,NULL,
 0,0,
 'completed','2026-05-16 08:00:00','2026-05-17 09:00:00','2026-05-19 07:30:00',NULL,'2026-05-24 16:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-30 16:00:00',0,'demo_ipp_001'),

-- pmc_006 significant / verification_pending — gearbox borescope under owner verification; SLA BREACHED
('pmc_006','PM-COMP-2026-0006','maintenance.calendar_rollup','pm_plan','pmp_2026_q2_0006',NULL,
 'own_amakhala','Amakhala Emoyeni Wind (Pty) Ltd','om_siemens','Siemens Gamesa O&M',
 'site_amakhala','Amakhala Emoyeni Wind','Eastern Cape','wind','WTG-GBX-07','general','OMSA-2022-AEW-05','SGRE-GBX-BSC','Gearbox borescope inspection','biennial',
 '2026-05-12','2026-05-08','2026-05-22',NULL,
 55,'significant',
 22,22,11,210000,205000,
 'Gearbox borescope completed by the SGRE team; results submitted for owner verification.','Borescope on turbine 7 gearbox complete; minor scuffing noted, within OEM limits.','Owner reviewing borescope imagery against OEM acceptance criteria; verification past its window.',NULL,NULL,NULL,
 0,0,
 'verification_pending','2026-05-09 08:00:00','2026-05-10 09:00:00','2026-05-11 07:30:00',NULL,'2026-05-15 16:00:00','2026-05-17 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-20 10:00:00',1,'demo_ipp_001'),

-- pmc_007 critical / closed — central-inverter overhaul, full arc verified and signed off (happy path)
('pmc_007','PM-COMP-2026-0007','maintenance.calendar_rollup','pm_plan','pmp_2026_q1_0007',NULL,
 'own_prieska','Mulilo Sonnedix Prieska PV (Pty) Ltd','om_sma','SMA Solar Service O&M',
 'site_prieska','Mulilo Sonnedix Prieska PV','Northern Cape','solar_pv','INV-CTR-03','inverter','OMSA-2023-MSP-01','SMA-INV-OVH','Central-inverter annual overhaul','annual',
 '2026-04-10','2026-04-05','2026-04-25',NULL,
 72,'critical',
 48,48,22,520000,498000,
 'Central-inverter annual overhaul assigned to the SMA service team for the April window.','Inverter 3 overhaul complete: IGBT stacks, DC bus capacitors and cooling refurbished; commissioning tests passed.','Owner verified commissioning records and torque logs; PM closed and signed off.',NULL,NULL,'overhaul_complete',
 0,0,
 'closed','2026-04-06 08:00:00','2026-04-07 09:00:00','2026-04-09 07:30:00',NULL,'2026-04-15 16:00:00','2026-04-17 10:00:00',NULL,NULL,'2026-04-20 11:00:00',NULL,NULL,NULL,
 0,NULL,0,'demo_ipp_001'),

-- pmc_008 critical / skipped — MV transformer service window lapsed (REPORTABLE: skip critical crosses)
('pmc_008','PM-COMP-2026-0008','maintenance.calendar_rollup','pm_plan','pmp_2026_q1_0008',NULL,
 'own_linde','Linde Solar (Pty) Ltd','om_globeleq','Globeleq O&M Services',
 'site_linde','Linde Solar','Northern Cape','solar_pv','TFR-MV-01','transformer','OMSA-2023-LIN-02','TFR-MV-SVC','MV step-up transformer service and oil sampling','annual',
 '2026-04-15','2026-04-10','2026-04-30',NULL,
 68,'critical',
 30,NULL,NULL,340000,NULL,
 'MV transformer service assigned but never mobilised before the compliance window closed.',NULL,NULL,NULL,'Service window lapsed without execution; MV transformer oil sampling overdue — critical PM skipped, reportable to the regulator.','window_lapsed',
 0,0,
 'skipped','2026-04-08 08:00:00','2026-04-09 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-02 09:00:00',NULL,
 1,NULL,1,'demo_ipp_001'),

-- pmc_009 safety_critical / deferred — protection-relay test deferred to next window (REPORTABLE: deferring a safety PM crosses)
('pmc_009','PM-COMP-2026-0009','maintenance.calendar_rollup','pm_plan','pmp_2026_q2_0009',NULL,
 'own_noupoort','Noupoort Wind (Pty) Ltd','om_enercon','Enercon Service O&M',
 'site_noupoort','Noupoort Wind','Northern Cape','wind','PROT-REL-MAIN','protection','OMSA-2022-NPW-06','PROT-RLY-TST','Protection-relay secondary injection test','annual',
 '2026-05-15','2026-05-10','2026-05-25','2026-07-20',
 88,'safety_critical',
 26,NULL,NULL,310000,NULL,
 'Protection-relay secondary injection test assigned for the May window.',NULL,NULL,'Grid-connection outage permit unavailable in the May window; relay test deferred to 2026-07-20 to align with the planned-outage slot. Deferral of a safety-critical PM logged as reportable.',NULL,'outage_permit_unavailable',
 0,1,
 'deferred','2026-05-08 08:00:00','2026-05-09 09:00:00',NULL,NULL,NULL,NULL,NULL,'2026-05-12 10:00:00',NULL,'2026-05-14 11:00:00',NULL,NULL,
 1,NULL,0,'demo_ipp_001'),

-- pmc_010 safety_critical / deferral_requested — earthing & lightning-protection inspection deferral pending decision
('pmc_010','PM-COMP-2026-0010','maintenance.calendar_rollup','pm_plan','pmp_2026_q2_0010',NULL,
 'own_konkoonsies','Konkoonsies II Solar (Pty) Ltd','om_mainstream','Mainstream Renewable O&M',
 'site_konkoonsies','Konkoonsies II Solar','Northern Cape','solar_pv','ERT-LPS-ALL','protection','OMSA-2023-KK2-02','LPS-EARTH-INSP','Earthing and lightning-protection-system inspection','annual',
 '2026-05-22','2026-05-18','2026-05-31',NULL,
 92,'safety_critical',
 32,NULL,NULL,150000,NULL,
 'Earthing and lightning-protection inspection assigned to the HV team for the May window.',NULL,NULL,'Contractor requests a two-week deferral citing concurrent HV testing at an adjacent site; owner decision pending.',NULL,'resource_conflict',
 0,1,
 'deferral_requested','2026-05-19 08:00:00','2026-05-20 09:00:00',NULL,NULL,NULL,NULL,NULL,'2026-05-23 10:00:00',NULL,NULL,NULL,NULL,
 0,'2026-05-26 10:00:00',0,'demo_ipp_001');

-- Events (transition log). Full happy-path arc for pmc_007 (owner/contractor split),
-- the skip / deferral branches for pmc_008/009/010, and progression markers for the rest.
INSERT OR IGNORE INTO oe_pm_compliance_events (
  id, pm_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('pmc_evt_001','pmc_001','pm_compliance.pm_scheduled',NULL,'pm_scheduled','own_lesedi','asset_owner','Quarterly module-string visual inspection scheduled','2026-05-26 08:00:00'),
('pmc_evt_002','pmc_002','pm_compliance.pm_scheduled',NULL,'pm_scheduled','own_dorper','asset_owner','Nacelle visual inspection scheduled','2026-05-18 08:00:00'),
('pmc_evt_003','pmc_002','pm_compliance.work_assigned','pm_scheduled','work_assigned','own_dorper','asset_owner','Assigned to the climbing crew','2026-05-19 09:00:00'),
('pmc_evt_004','pmc_003','pm_compliance.pm_scheduled',NULL,'pm_scheduled','own_jasper','asset_owner','Inverter quarterly service scheduled','2026-05-22 08:00:00'),
('pmc_evt_005','pmc_003','pm_compliance.work_assigned','pm_scheduled','work_assigned','own_jasper','asset_owner','Assigned to the SMA service team','2026-05-23 09:00:00'),
('pmc_evt_006','pmc_003','pm_compliance.in_progress','work_assigned','in_progress','om_sma','om_contractor','Filter and cooling checks underway','2026-05-25 07:30:00'),
('pmc_evt_007','pmc_004','pm_compliance.in_progress','work_assigned','in_progress','om_vestas','om_contractor','Yaw-system service started','2026-05-16 07:30:00'),
('pmc_evt_008','pmc_004','pm_compliance.on_hold','in_progress','on_hold','om_vestas','om_contractor','Paused awaiting OEM yaw-motor brushes','2026-05-17 14:00:00'),
('pmc_evt_009','pmc_005','pm_compliance.completed','in_progress','completed','om_scatec','om_contractor','All combiner boxes serviced and thermal-scanned','2026-05-24 16:00:00'),
('pmc_evt_010','pmc_006','pm_compliance.completed','in_progress','completed','om_siemens','om_contractor','Gearbox borescope complete; minor scuffing within limits','2026-05-15 16:00:00'),
('pmc_evt_011','pmc_006','pm_compliance.verification_pending','completed','verification_pending','own_amakhala','asset_owner','Owner verifying borescope imagery','2026-05-17 10:00:00'),
-- pmc_007 full happy path (owner -> contractor -> contractor -> owner -> owner)
('pmc_evt_012','pmc_007','pm_compliance.pm_scheduled',NULL,'pm_scheduled','own_prieska','asset_owner','Central-inverter annual overhaul scheduled','2026-04-06 08:00:00'),
('pmc_evt_013','pmc_007','pm_compliance.work_assigned','pm_scheduled','work_assigned','own_prieska','asset_owner','Assigned to the SMA service team','2026-04-07 09:00:00'),
('pmc_evt_014','pmc_007','pm_compliance.in_progress','work_assigned','in_progress','om_sma','om_contractor','Overhaul underway: IGBT stacks and DC bus capacitors','2026-04-09 07:30:00'),
('pmc_evt_015','pmc_007','pm_compliance.completed','in_progress','completed','om_sma','om_contractor','Inverter 3 overhaul complete; commissioning tests passed','2026-04-15 16:00:00'),
('pmc_evt_016','pmc_007','pm_compliance.verification_pending','completed','verification_pending','own_prieska','asset_owner','Owner verifying commissioning records and torque logs','2026-04-17 10:00:00'),
('pmc_evt_017','pmc_007','pm_compliance.closed','verification_pending','closed','own_prieska','asset_owner','PM verified and signed off','2026-04-20 11:00:00'),
-- pmc_008 skip branch (reportable)
('pmc_evt_018','pmc_008','pm_compliance.pm_scheduled',NULL,'pm_scheduled','own_linde','asset_owner','MV transformer service scheduled','2026-04-08 08:00:00'),
('pmc_evt_019','pmc_008','pm_compliance.work_assigned','pm_scheduled','work_assigned','own_linde','asset_owner','Assigned to Globeleq O&M','2026-04-09 09:00:00'),
('pmc_evt_020','pmc_008','pm_compliance.skipped','work_assigned','skipped','own_linde','asset_owner','Window lapsed without execution; critical PM skipped, reportable','2026-05-02 09:00:00'),
-- pmc_009 deferral branch -> deferred (reportable)
('pmc_evt_021','pmc_009','pm_compliance.pm_scheduled',NULL,'pm_scheduled','own_noupoort','asset_owner','Protection-relay test scheduled','2026-05-08 08:00:00'),
('pmc_evt_022','pmc_009','pm_compliance.work_assigned','pm_scheduled','work_assigned','own_noupoort','asset_owner','Assigned to Enercon service team','2026-05-09 09:00:00'),
('pmc_evt_023','pmc_009','pm_compliance.deferral_requested','work_assigned','deferral_requested','om_enercon','om_contractor','Deferral requested: outage permit unavailable','2026-05-12 10:00:00'),
('pmc_evt_024','pmc_009','pm_compliance.deferred','deferral_requested','deferred','own_noupoort','asset_owner','Deferral approved to 2026-07-20; safety PM deferral reportable','2026-05-14 11:00:00'),
-- pmc_010 deferral requested (pending decision)
('pmc_evt_025','pmc_010','pm_compliance.pm_scheduled',NULL,'pm_scheduled','own_konkoonsies','asset_owner','Earthing and LPS inspection scheduled','2026-05-19 08:00:00'),
('pmc_evt_026','pmc_010','pm_compliance.work_assigned','pm_scheduled','work_assigned','own_konkoonsies','asset_owner','Assigned to the HV team','2026-05-20 09:00:00'),
('pmc_evt_027','pmc_010','pm_compliance.deferral_requested','work_assigned','deferral_requested','om_mainstream','om_contractor','Two-week deferral requested citing resource conflict','2026-05-23 10:00:00');
