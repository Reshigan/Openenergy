-- Wave 63 — OEM-Support Warranty-Recovery / Supplier-Recovery Claim seed.
-- 10 recovery claims wrec_001..wrec_010 spanning 10 distinct lifecycle states,
-- all five recovery tiers (two per tier), all five defect classes, and the
-- assessment / approval / dispute / recovery / write-off branches. Single-party
-- write (support desk); functional parties claimant / oem_supplier / assessor.
--
-- Reportable rows (is_reportable = systemic defect {serial, safety} OR large
-- tier {major, critical}):
--   wrec_001/002/003/006 NOT reportable; wrec_004/005/007/008/009/010 ARE.
-- Regulator crossings shown in the event log: wrec_005 complete_assessment on a
-- SAFETY defect (systemic) crosses for EVERY tier (the W63 signature);
-- wrec_009 complete_assessment on a SERIAL defect crosses; wrec_010 write_off of
-- a critical (large-tier) recovery crosses.

INSERT OR IGNORE INTO oe_warranty_recoveries (
  id, case_number, source_event, source_entity_type, source_entity_id, source_wave,
  claimant_party_id, claimant_party_name, oem_party_id, oem_party_name, assessor_party_id, assessor_party_name,
  asset_name, component_type, oem_name, product_model, serial_or_batch_ref, warranty_ref, warranty_expiry,
  defect_class, defect_description, failure_mode, units_affected, fleet_size,
  repair_cost_zar_m, replacement_cost_zar_m, lost_generation_zar_m, claimed_zar_m, recovery_zar_m, recovered_zar_m, recovery_method, recovery_tier,
  submitted_flag, acknowledged_flag, assessment_complete_flag, approved_flag, dispute_raised, dispute_resolved, recovered_flag,
  draft_basis, submission_basis, acknowledgement_basis, assessment_basis, approval_basis, rejection_basis, dispute_basis, resolution_basis, recovery_basis, writeoff_basis, withdrawal_basis, reason_code,
  dispute_round,
  chain_status, claim_drafted_at, submitted_to_oem_at, oem_acknowledged_at, under_assessment_at, assessment_complete_at, approved_at, disputed_at, recovery_pending_at, recovered_at, rejected_at, withdrawn_at, written_off_at,
  is_reportable, sla_deadline_at, escalation_level, created_by
) VALUES
-- wrec_001 minor / claim_drafted — single inverter failure being documented (NOT reportable)
('wrec_001','WREC-2026-0001','support.warranty_recovery','rma_claim','rma_karoo_inv_88','W15',
 'om_scatec','Scatec O&M Services SA','oem_sungrow','Sungrow Power Supply Co',NULL,NULL,
 'Karoo Solar One','inverter','Sungrow','SG250HX','SN-SG-2024-0088','SUP-WARR-SUNGROW-5YR','2027-08-31',
 'isolated','Single central inverter failed in service well within the 5-year supply warranty.','dc_input_stage_failure',1,180,
 0.18,0.30,0.05,0.40,0.40,NULL,NULL,'minor',
 0,0,0,0,0,0,0,
 'Single inverter failure documented from the field RMA; a supplier-recovery claim is being prepared against the OEM under the supply warranty.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'isolated_inverter_draft',
 0,
 'claim_drafted','2026-05-26 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-28 09:00:00',0,'demo_support_001'),

-- wrec_002 minor / submitted_to_oem — combiner-box batch claim filed (NOT reportable)
('wrec_002','WREC-2026-0002','support.warranty_recovery','rma_claim','rma_capewind_cb','W15',
 'om_scatec','Scatec O&M Services SA','oem_huawei','Huawei Technologies Co',NULL,NULL,
 'Cape West Wind','combiner_box','Huawei','SmartACU2000','BATCH-HW-2305','SUP-WARR-HUAWEI-3YR','2026-12-31',
 'batch','A small batch of combiner boxes from one production lot exhibited connector corrosion.','connector_corrosion',6,90,
 0.30,0.25,0.10,0.70,0.70,NULL,NULL,'minor',
 1,0,0,0,0,0,0,
 'Batch combiner-box corrosion documented across one production lot.','Recovery claim submitted to the OEM under the supply-agreement warranty for the affected batch.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'batch_combiner_submitted',
 0,
 'submitted_to_oem','2026-05-18 09:00:00','2026-05-22 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-26 10:00:00',0,'demo_support_001'),

-- wrec_003 moderate / oem_acknowledged — transformer claim acknowledged by OEM (NOT reportable)
('wrec_003','WREC-2026-0003','support.warranty_recovery','wo','wo_solarnorth_tx','W16',
 'om_scatec','Scatec O&M Services SA','oem_abb','Hitachi Energy (ABB)',NULL,NULL,
 'Solar North Cluster','transformer','Hitachi Energy','RESIBLOC 33kV','SN-ABB-2023-014','SUP-WARR-ABB-5YR','2028-03-31',
 'isolated','Medium-voltage step-up transformer winding fault on a single unit within warranty.','winding_insulation_fault',1,8,
 2.10,1.20,0.40,3.50,3.50,NULL,NULL,'moderate',
 1,1,0,0,0,0,0,
 'Transformer winding fault documented from the work-order repair.','Recovery claim submitted to the OEM.','OEM acknowledged the claim and opened a warranty case for technical assessment.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'transformer_acknowledged',
 0,
 'oem_acknowledged','2026-05-08 09:00:00','2026-05-12 10:00:00','2026-05-18 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-01 11:00:00',0,'demo_support_001'),

-- wrec_004 moderate / under_assessment — SERIAL module defect under joint assessment (reportable: systemic)
('wrec_004','WREC-2026-0004','support.warranty_recovery','rma_claim','rma_redstone_mod','W15',
 'om_scatec','Scatec O&M Services SA','oem_jinko','JinkoSolar Holding Co','assr_dnv','DNV Independent Engineering',
 'Redstone Cluster','pv_module','JinkoSolar','Tiger Neo 580W','BATCH-JK-2306','SUP-WARR-JINKO-12YR','2035-06-30',
 'serial','Potential-induced degradation and backsheet cracking observed across multiple strings, indicating a serial manufacturing defect in one product line.','pid_backsheet_cracking',420,2400,
 3.80,1.60,0.60,6.00,6.00,NULL,NULL,'moderate',
 1,1,0,0,0,0,0,
 'Serial module degradation documented across multiple field RMAs.','Recovery claim submitted to the OEM for the affected product line.','OEM acknowledged the claim.','Joint technical assessment under way with an independent engineer to confirm the serial-defect classification and the affected population.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'serial_module_assessment',
 1,
 'under_assessment','2026-05-01 09:00:00','2026-05-05 10:00:00','2026-05-10 11:00:00','2026-05-16 14:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-06-08 14:00:00',0,'demo_support_001'),

-- wrec_005 material / assessment_complete — SAFETY defect classified; crosses for EVERY tier (the W63 signature)
('wrec_005','WREC-2026-0005','support.warranty_recovery','rma_claim','rma_batteryone_bm','W15',
 'om_scatec','Scatec O&M Services SA','oem_catl','Contemporary Amperex Technology (CATL)','assr_trl','TUV Rheinland Safety Assessment',
 'Battery One Storage','battery_module','CATL','EnerOne 280Ah','BATCH-CATL-2304','SUP-WARR-CATL-10YR','2034-02-28',
 'safety','Cell-level thermal-runaway hazard identified in a battery-module lot; classified as a safety defect with fire-risk implications requiring NRCS notification.','cell_thermal_runaway_risk',60,300,
 12.00,14.00,2.00,28.00,28.00,NULL,NULL,'material',
 1,1,1,0,0,0,0,
 'Thermal-runaway hazard documented from field incidents and RMA returns.','Recovery claim submitted to the OEM.','OEM acknowledged the claim.','Independent safety assessment completed: the defect is classified as a SAFETY defect with a fire-risk hazard; as a safety defect on grid-connected storage equipment this is notified to NRCS and NERSA regardless of recovery value.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'safety_battery_assessed',
 0,
 'assessment_complete','2026-04-18 09:00:00','2026-04-22 10:00:00','2026-04-28 11:00:00','2026-05-04 14:00:00','2026-05-20 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-06-03 09:00:00',0,'demo_support_001'),

-- wrec_006 material / approved — inverter batch recovery approved by OEM (NOT reportable)
('wrec_006','WREC-2026-0006','support.warranty_recovery','wo','wo_kathu_inv','W16',
 'om_scatec','Scatec O&M Services SA','oem_sma','SMA Solar Technology AG',NULL,NULL,
 'Kathu Solar Park','inverter','SMA','Sunny Central 4600','BATCH-SMA-2302','SUP-WARR-SMA-5YR','2027-11-30',
 'batch','A batch of central inverters from one production lot showed premature capacitor degradation.','capacitor_degradation',14,60,
 11.00,5.50,1.50,18.00,18.00,NULL,NULL,'material',
 1,1,1,1,0,0,0,
 'Batch capacitor degradation documented across one inverter lot.','Recovery claim submitted to the OEM.','OEM acknowledged the claim.','Assessment completed: a non-systemic batch defect confined to one production lot.','OEM approved the recovery for the affected batch under the supply warranty.',NULL,NULL,NULL,NULL,NULL,NULL,'batch_inverter_approved',
 0,
 'approved','2026-04-10 09:00:00','2026-04-14 10:00:00','2026-04-20 11:00:00','2026-04-26 14:00:00','2026-05-08 09:00:00','2026-05-20 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-27 10:00:00',0,'demo_support_001'),

-- wrec_007 major / disputed — SERIAL gearbox defect; OEM rejected, claimant disputing (reportable: large + systemic)
('wrec_007','WREC-2026-0007','support.warranty_recovery','rma_claim','rma_msenge_gb','W15',
 'om_scatec','Scatec O&M Services SA','oem_vestas','Vestas Wind Systems A/S','assr_dnv','DNV Independent Engineering',
 'Msenge Emoyeni Wind','gearbox','Vestas','V150 Gearbox','SERIES-VST-V150','SUP-WARR-VESTAS-5YR','2028-09-30',
 'serial','High-speed-stage bearing failures recurring across the turbine fleet, consistent with a serial gearbox design defect.','hss_bearing_serial_failure',18,42,
 78.00,30.00,12.00,120.00,120.00,NULL,NULL,'major',
 1,1,1,0,1,0,0,
 'Recurring gearbox bearing failures documented across the fleet, indicating a serial design defect.','Recovery claim submitted to the OEM.','OEM acknowledged the claim.','Joint assessment completed: claimant maintains a serial design defect; OEM contends individual operational causes.','','','Claimant disputes the OEM partial rejection and has referred the serial-defect classification and quantum to independent expert determination.',NULL,NULL,NULL,NULL,'serial_gearbox_disputed',
 1,
 'disputed','2026-03-22 09:00:00','2026-03-26 10:00:00','2026-04-02 11:00:00','2026-04-10 14:00:00','2026-04-28 09:00:00',NULL,'2026-05-12 10:00:00',NULL,NULL,NULL,NULL,NULL,
 1,'2026-07-11 10:00:00',0,'demo_support_001'),

-- wrec_008 major / recovery_pending — transformer recovery approved, credit/replacement pending (reportable: large)
('wrec_008','WREC-2026-0008','support.warranty_recovery','wo','wo_oya_tx','W16',
 'om_scatec','Scatec O&M Services SA','oem_siemens','Siemens Energy AG',NULL,NULL,
 'Oya Energy Hybrid','transformer','Siemens Energy','Main Power Transformer 132kV','SN-SE-2022-003','SUP-WARR-SIEMENS-7YR','2029-05-31',
 'isolated','Main power transformer bushing failure on a single unit within the supply warranty.','bushing_failure',1,3,
 52.00,25.00,8.00,85.00,85.00,NULL,'replacement_in_kind','major',
 1,1,1,1,0,0,0,
 'Transformer bushing failure documented from the work-order repair.','Recovery claim submitted to the OEM.','OEM acknowledged the claim.','Assessment completed: an isolated in-warranty failure.','OEM approved the recovery in full.',NULL,NULL,NULL,'Recovery initiated: a replacement-in-kind unit is being dispatched by the OEM and is pending receipt and reconciliation.',NULL,NULL,'transformer_recovery_pending',
 0,
 'recovery_pending','2026-03-14 09:00:00','2026-03-18 10:00:00','2026-03-24 11:00:00','2026-03-30 14:00:00','2026-04-12 09:00:00','2026-04-24 10:00:00',NULL,'2026-05-10 09:00:00',NULL,NULL,NULL,NULL,
 1,'2026-05-17 09:00:00',0,'demo_support_001'),

-- wrec_009 critical / recovered — SERIAL blade defect recovered in full; full clean arc (reportable: large + systemic)
('wrec_009','WREC-2026-0009','support.warranty_recovery','rma_claim','rma_coastalwind_bl','W15',
 'om_scatec','Scatec O&M Services SA','oem_sgre','Siemens Gamesa Renewable Energy','assr_dnv','DNV Independent Engineering',
 'Coastal Wind Portfolio','turbine_blade','Siemens Gamesa','B72 Blade','SERIES-SGRE-B72','SUP-WARR-SGRE-5YR','2027-07-31',
 'serial','Leading-edge erosion and structural delamination across the blade fleet, confirmed as a serial manufacturing defect.','blade_leading_edge_delamination',96,132,
 260.00,120.00,40.00,420.00,420.00,420.00,'cash','critical',
 1,1,1,1,0,0,1,
 'Serial blade delamination documented across the fleet.','Recovery claim submitted to the OEM.','OEM acknowledged the claim.','Joint assessment completed: confirmed as a serial manufacturing defect across the blade fleet; notified to NERSA on classification.','OEM approved the full recovery under the serial-defect warranty clause.',NULL,NULL,NULL,'Recovery received: the agreed cash recovery was paid and reconciled in full.',NULL,NULL,'serial_blade_recovered',
 0,
 'recovered','2026-02-10 09:00:00','2026-02-14 10:00:00','2026-02-20 11:00:00','2026-02-28 14:00:00','2026-03-18 09:00:00','2026-04-02 10:00:00',NULL,'2026-04-18 09:00:00','2026-05-08 16:00:00',NULL,NULL,NULL,
 1,NULL,0,'demo_support_001'),

-- wrec_010 critical / written_off — wear-out gearbox claim disputed then written off; large-tier crossing (reportable: large)
('wrec_010','WREC-2026-0010','support.warranty_recovery','rma_claim','rma_gridwind_gb','W15',
 'om_scatec','Scatec O&M Services SA','oem_ge','GE Vernova','assr_dnv','DNV Independent Engineering',
 'Grid Wind Fleet','gearbox','GE Vernova','GE 5MW Gearbox','SERIES-GE-5MW','SUP-WARR-GE-5YR','2025-10-31',
 'wear_out','Premature gearbox wear claimed across older units; OEM contended end-of-warranty wear-out rather than a covered defect.','premature_wear_out',24,80,
 190.00,90.00,30.00,310.00,310.00,NULL,NULL,'critical',
 1,1,1,0,1,0,0,
 'Premature gearbox wear documented across older fleet units.','Recovery claim submitted to the OEM.','OEM acknowledged the claim.','Assessment completed: OEM classified the failures as end-of-warranty wear-out rather than a covered defect.','','','Claimant disputed the wear-out classification and pursued recovery.',NULL,NULL,'Recovery abandoned: the independent determination upheld the wear-out classification and the material recovery was written off; the large-tier write-off is notified to the regulator.',NULL,'wear_out_written_off',
 1,
 'written_off','2026-01-20 09:00:00','2026-01-26 10:00:00','2026-02-02 11:00:00','2026-02-12 14:00:00','2026-03-04 09:00:00',NULL,'2026-03-20 10:00:00',NULL,NULL,NULL,NULL,'2026-05-02 16:00:00',
 1,NULL,0,'demo_support_001');

-- Events (transition log). Full clean arc for wrec_009 (with the SERIAL
-- complete_assessment crossing), the SAFETY complete_assessment crossing for
-- wrec_005, the dispute for wrec_007, and the dispute → write_off crossing for
-- wrec_010. Single-party write; functional parties claimant / oem_supplier /
-- assessor.
INSERT OR IGNORE INTO oe_warranty_recoveries_events (
  id, recovery_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('wrec_evt_001','wrec_002','warranty_recovery.submitted_to_oem','claim_drafted','submitted_to_oem','om_scatec','claimant','Batch combiner-box recovery claim submitted to the OEM','2026-05-22 10:00:00'),
('wrec_evt_002','wrec_003','warranty_recovery.submitted_to_oem','claim_drafted','submitted_to_oem','om_scatec','claimant','Transformer recovery claim submitted','2026-05-12 10:00:00'),
('wrec_evt_003','wrec_003','warranty_recovery.oem_acknowledged','submitted_to_oem','oem_acknowledged','oem_abb','oem_supplier','OEM acknowledged the claim and opened a warranty case','2026-05-18 11:00:00'),
-- wrec_004 serial defect, under assessment (not yet crossed; complete_assessment would cross)
('wrec_evt_004','wrec_004','warranty_recovery.submitted_to_oem','claim_drafted','submitted_to_oem','om_scatec','claimant','Serial module recovery claim submitted','2026-05-05 10:00:00'),
('wrec_evt_005','wrec_004','warranty_recovery.oem_acknowledged','submitted_to_oem','oem_acknowledged','oem_jinko','oem_supplier','OEM acknowledged the claim','2026-05-10 11:00:00'),
('wrec_evt_006','wrec_004','warranty_recovery.under_assessment','oem_acknowledged','under_assessment','assr_dnv','assessor','Joint technical assessment opened to confirm the serial-defect classification','2026-05-16 14:00:00'),
-- wrec_005 SAFETY complete_assessment crossing (crosses for EVERY tier — the W63 signature)
('wrec_evt_007','wrec_005','warranty_recovery.under_assessment','oem_acknowledged','under_assessment','assr_trl','assessor','Safety assessment opened on the battery-module thermal-runaway hazard','2026-05-04 14:00:00'),
('wrec_evt_008','wrec_005','warranty_recovery.assessment_complete','under_assessment','assessment_complete','assr_trl','assessor','Assessment completed: SAFETY defect with fire-risk hazard; notified to NRCS and NERSA regardless of recovery value','2026-05-20 09:00:00'),
-- wrec_006 batch approved
('wrec_evt_009','wrec_006','warranty_recovery.assessment_complete','under_assessment','assessment_complete','assr_dnv','assessor','Assessment completed: non-systemic batch defect','2026-05-08 09:00:00'),
('wrec_evt_010','wrec_006','warranty_recovery.approved','assessment_complete','approved','oem_sma','oem_supplier','OEM approved the recovery for the affected batch','2026-05-20 10:00:00'),
-- wrec_007 serial gearbox dispute
('wrec_evt_011','wrec_007','warranty_recovery.assessment_complete','under_assessment','assessment_complete','assr_dnv','assessor','Assessment completed: serial-defect classification contested by the OEM','2026-04-28 09:00:00'),
('wrec_evt_012','wrec_007','warranty_recovery.disputed','assessment_complete','disputed','om_scatec','claimant','Claimant disputes the OEM partial rejection and refers the quantum to independent expert determination','2026-05-12 10:00:00'),
-- wrec_008 transformer recovery pending
('wrec_evt_013','wrec_008','warranty_recovery.approved','assessment_complete','approved','oem_siemens','oem_supplier','OEM approved the recovery in full','2026-04-24 10:00:00'),
('wrec_evt_014','wrec_008','warranty_recovery.recovery_pending','approved','recovery_pending','oem_siemens','oem_supplier','Replacement-in-kind unit dispatched; recovery pending receipt','2026-05-10 09:00:00'),
-- wrec_009 full clean arc through recovered (SERIAL complete_assessment crossing)
('wrec_evt_015','wrec_009','warranty_recovery.submitted_to_oem','claim_drafted','submitted_to_oem','om_scatec','claimant','Serial blade recovery claim submitted','2026-02-14 10:00:00'),
('wrec_evt_016','wrec_009','warranty_recovery.oem_acknowledged','submitted_to_oem','oem_acknowledged','oem_sgre','oem_supplier','OEM acknowledged the claim','2026-02-20 11:00:00'),
('wrec_evt_017','wrec_009','warranty_recovery.under_assessment','oem_acknowledged','under_assessment','assr_dnv','assessor','Joint assessment opened on the blade fleet','2026-02-28 14:00:00'),
('wrec_evt_018','wrec_009','warranty_recovery.assessment_complete','under_assessment','assessment_complete','assr_dnv','assessor','Assessment completed: confirmed serial manufacturing defect; notified to NERSA on classification','2026-03-18 09:00:00'),
('wrec_evt_019','wrec_009','warranty_recovery.approved','assessment_complete','approved','oem_sgre','oem_supplier','OEM approved the full recovery under the serial-defect warranty clause','2026-04-02 10:00:00'),
('wrec_evt_020','wrec_009','warranty_recovery.recovery_pending','approved','recovery_pending','oem_sgre','oem_supplier','Cash recovery scheduled','2026-04-18 09:00:00'),
('wrec_evt_021','wrec_009','warranty_recovery.recovered','recovery_pending','recovered','om_scatec','claimant','Agreed cash recovery paid and reconciled in full','2026-05-08 16:00:00'),
-- wrec_010 dispute → write_off (large-tier crossing)
('wrec_evt_022','wrec_010','warranty_recovery.assessment_complete','under_assessment','assessment_complete','assr_dnv','assessor','Assessment completed: OEM classified the failures as wear-out','2026-03-04 09:00:00'),
('wrec_evt_023','wrec_010','warranty_recovery.disputed','assessment_complete','disputed','om_scatec','claimant','Claimant disputed the wear-out classification','2026-03-20 10:00:00'),
('wrec_evt_024','wrec_010','warranty_recovery.written_off','disputed','written_off','om_scatec','claimant','Independent determination upheld the wear-out classification; material recovery written off and notified to the regulator','2026-05-02 16:00:00');
