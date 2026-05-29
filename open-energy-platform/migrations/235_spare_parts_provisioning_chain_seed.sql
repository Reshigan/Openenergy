-- Wave 72 — OEM-Support Spare-Parts Provisioning & Replenishment seed.
-- 10 provisioning lines spp_001..spp_010 spanning 10 distinct lifecycle states,
-- all five tiers (routine / standard / important / critical / catastrophic), all
-- five demand sources (predictive_rul / reorder_point / work_order / manual /
-- rma_replacement), all three VED criticality bands, and the backorder, QA-gate
-- and cancel branches. Single-party write (support desk); functional parties
-- planner / buyer / warehouse / supplier.
--
-- Reportable rows (is_reportable = catastrophic OR (vital AND high tier)):
--   spp_001/004/005/008/009/010 ARE; spp_002/003/006/007 NOT.
-- Regulator crossings shown in the event log (the W72 AVAILABILITY-RISK
-- signature): spp_005 flag_backorder on a catastrophic line crosses; spp_010
-- cancel_provisioning of a vital high-tier line crosses.

INSERT OR IGNORE INTO oe_spare_parts_provisioning (
  id, line_number, source_event, source_entity_type, source_entity_id, source_wave, demand_source,
  part_number, part_description, oem_name, asset_name, site_name, warehouse, supplier_party_id, supplier_party_name, criticality,
  qty_required, qty_ordered, qty_received, qty_on_hand, unit_cost_zar,
  daily_demand, demand_std_dev, lead_time_days, service_z_factor, reorder_point, safety_stock, rul_days, predictive_lead_days,
  downtime_cost_per_hour_zar, stockout_impact_zar, stockout_avoidance_zar, carried_inventory_zar, working_capital_efficiency, fill_rate, provisioning_tier,
  requisition_raised_flag, approved_flag, po_issued_flag, backordered_flag, shipped_flag, received_flag, inspected_flag, reserved_flag, issued_flag,
  demand_basis, requisition_basis, approval_basis, po_basis, backorder_basis, expedite_basis, reservation_basis, issue_basis, cancellation_basis, reason_code,
  reserved_for_wo, backorder_round,
  chain_status, demand_identified_at, requisition_raised_at, requisition_approved_at, po_issued_at, backordered_at, in_transit_at, received_at, stocked_at, reserved_at, issued_at, returned_at, cancelled_at,
  is_reportable, sla_deadline_at, escalation_level, created_by
) VALUES
-- spp_001 critical / demand_identified — predictive_rul: W71 flagged inverter IGBT stack pre-failure on a vital line (reportable)
('spp_001','SPP-2026-0001','asset_prognostic.triaged','asset_prognostic','aprog_004','W71','predictive_rul',
 'SG-IGBT-1500V','Inverter IGBT power stack 1500V','Sungrow','Karoo Solar One','Karoo','wh_karoo','sup_sungrow','Sungrow Power Supply Co','vital',
 2,NULL,NULL,0,185000,
 0.05,0.02,30,1.65,3,1,95,65,
 5000,1500000,3600000,250000,14.4,0.9,'critical',
 0,0,0,0,0,0,0,0,0,
 'W71 prognostics flagged a degrading IGBT stack with an RUL of 95 days; staging the spare pre-failure gives 65 days of lead-time slack over the 30-day supplier lead time.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'predictive_rul_demand',
 NULL,0,
 'demand_identified','2026-05-28 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-28 17:00:00',0,'demo_support_001'),

-- spp_002 routine / requisition_raised — reorder_point: desirable consumable replenishment (NOT reportable)
('spp_002','SPP-2026-0002','support.spare_parts_provisioning','reorder','reorder_filters_q2','W72','reorder_point',
 'AIR-FLT-STD','Air-intake filter element (standard)','Generic','Cape West Wind','Cape West','wh_capewest','sup_generic','Generic Spares Supplier','desirable',
 40,NULL,NULL,12,450,
 0.6,0.2,21,1.65,15,2,NULL,NULL,
 200,30000,100800,18000,5.6,0.95,'routine',
 1,0,0,0,0,0,0,0,0,
 'On-hand quantity fell below the reorder point for a routine consumable.','Replenishment requisition raised to top stock back up to the order-up-to level.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'reorder_point_replenishment',
 NULL,0,
 'requisition_raised','2026-05-25 09:00:00','2026-05-26 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-29 10:00:00',0,'demo_support_001'),

-- spp_003 important / requisition_approved — work_order: essential combiner board for a planned WO (NOT reportable)
('spp_003','SPP-2026-0003','om_work_order.scheduled','work_order','wo_solarnorth_cb','W16','work_order',
 'HW-ACU-BRD','Combiner monitoring board SmartACU2000','Huawei','Solar North Cluster','Solar North','wh_solarnorth','sup_huawei','Huawei Technologies Co','essential',
 4,NULL,NULL,1,28000,
 0.1,0.05,28,1.65,3,1,NULL,NULL,
 1200,400000,806400,112000,7.2,0.85,'important',
 1,1,0,0,0,0,0,0,0,
 'A scheduled work order requires combiner monitoring boards that are not in stock.','Requisition raised against the work order.','Requisition approved by the planning desk for purchase.',NULL,NULL,NULL,NULL,NULL,NULL,'work_order_demand',
 'wo_solarnorth_cb',0,
 'requisition_approved','2026-05-20 09:00:00','2026-05-21 10:00:00','2026-05-23 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-30 11:00:00',0,'demo_support_001'),

-- spp_004 critical / po_issued — predictive_rul: vital transformer bushing set on order (reportable)
('spp_004','SPP-2026-0004','asset_prognostic.diagnosed','asset_prognostic','aprog_007','W71','predictive_rul',
 'SE-BUSH-132','Power transformer bushing set 132kV','Siemens Energy','Oya Energy Hybrid','Oya','wh_oya','sup_siemens','Siemens Energy AG','vital',
 1,1,NULL,0,920000,
 0.01,0.005,60,1.65,1,1,140,80,
 9000,2000000,12960000,920000,14.1,0.8,'critical',
 1,1,1,0,0,0,0,0,0,
 'W71 prognostics flagged rising bushing partial-discharge with an RUL of 140 days; the spare is on order with 80 days of slack over the 60-day lead time.','Requisition raised.','Requisition approved.','Purchase order issued to the OEM for one bushing set.',NULL,NULL,NULL,NULL,NULL,'predictive_rul_demand',
 NULL,0,
 'po_issued','2026-05-12 09:00:00','2026-05-13 10:00:00','2026-05-15 11:00:00','2026-05-18 12:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-30 12:00:00',0,'demo_support_001'),

-- spp_005 catastrophic / backordered — manual: vital main transformer backordered; flag_backorder CROSSES (catastrophic) + SLA breached
('spp_005','SPP-2026-0005','support.spare_parts_provisioning','manual','manual_grid_tx','W72','manual',
 'GE-MPT-400','Main power transformer 400MVA','GE Vernova','Grid Wind Fleet','Grid Wind','wh_central','sup_ge','GE Vernova','vital',
 1,1,NULL,0,42000000,
 0.002,0.001,240,1.65,1,1,NULL,NULL,
 28000,8000000,161280000,42000000,3.8,0.6,'catastrophic',
 1,1,1,1,0,0,0,0,0,
 'A vital main power transformer must be provisioned for the fleet; no spare is held and the lead time is long.','Requisition raised on the catastrophic-impact line.','Requisition approved.','Purchase order issued to the OEM.','OEM advised the unit is backordered with an extended lead time; this is a security-of-supply concern notified to the regulator.',NULL,NULL,NULL,NULL,'catastrophic_backorder',
 NULL,1,
 'backordered','2026-04-20 09:00:00','2026-04-21 10:00:00','2026-04-23 11:00:00','2026-04-26 12:00:00','2026-05-05 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-09 09:00:00',1,'demo_support_001'),

-- spp_006 important / in_transit — work_order: desirable yaw motor shipped after backorder expedite (NOT reportable)
('spp_006','SPP-2026-0006','om_work_order.scheduled','work_order','wo_msenge_yaw','W16','work_order',
 'VST-YAW-MTR','Yaw drive motor V150','Vestas','Msenge Emoyeni Wind','Msenge','wh_msenge','sup_vestas','Vestas Wind Systems A/S','desirable',
 3,3,NULL,0,76000,
 0.08,0.03,35,1.65,3,1,NULL,NULL,
 900,300000,756000,228000,3.3,0.8,'important',
 1,1,1,0,1,0,0,0,0,
 'Yaw drive motors required for a scheduled work order.','Requisition raised.','Requisition approved.','Purchase order issued.','Initial supply was backordered and expedited via an alternate distributor.','Alternate-source air freight arranged; units now in transit.',NULL,NULL,NULL,'work_order_demand',
 'wo_msenge_yaw',1,
 'in_transit','2026-05-06 09:00:00','2026-05-07 10:00:00','2026-05-09 11:00:00','2026-05-11 12:00:00','2026-05-14 09:00:00','2026-05-22 13:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-31 13:00:00',0,'demo_support_001'),

-- spp_007 standard / received — rma_replacement: essential BMS controller at the incoming-QA gate (NOT reportable)
('spp_007','SPP-2026-0007','warranty_claim.replacement_dispatched','rma_claim','rma_batteryone_bms','W15','rma_replacement',
 'CATL-BMS-CTL','Battery management controller EnerOne','CATL','Battery One Storage','Battery One','wh_batteryone','sup_catl','Contemporary Amperex Technology (CATL)','essential',
 2,2,2,0,64000,
 0.04,0.02,25,1.65,2,1,NULL,NULL,
 1500,60000,900000,128000,7.0,0.9,'standard',
 1,1,1,0,1,1,0,0,0,
 'Replacement controllers dispatched against an RMA are inbound.','Requisition raised to track the replacement units into stock.','Requisition approved.','Purchase order raised for the replacement units.',NULL,NULL,NULL,NULL,NULL,'rma_replacement_demand',
 NULL,0,
 'received','2026-05-04 09:00:00','2026-05-05 10:00:00','2026-05-07 11:00:00','2026-05-09 12:00:00',NULL,'2026-05-16 13:00:00','2026-05-26 14:00:00',NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-29 14:00:00',0,'demo_support_001'),

-- spp_008 critical / reserved — predictive_rul: vital gearbox HSS bearing staged and reserved for a WO (reportable)
('spp_008','SPP-2026-0008','asset_prognostic.action_planned','asset_prognostic','aprog_002','W71','predictive_rul',
 'SGRE-HSS-BRG','Gearbox high-speed-stage bearing set','Siemens Gamesa','Coastal Wind Portfolio','Coastal','wh_coastal','sup_sgre','Siemens Gamesa Renewable Energy','vital',
 1,1,1,1,1350000,
 0.01,0.004,45,1.65,1,1,120,75,
 7500,1200000,8100000,1350000,6.0,0.95,'critical',
 1,1,1,0,1,1,1,1,0,
 'W71 prognostics flagged HSS bearing wear with an RUL of 120 days; the bearing set was provisioned with 75 days of slack and is now staged.','Requisition raised.','Requisition approved.','Purchase order issued.',NULL,NULL,'Bearing set passed incoming QA, stocked, and reserved against the planned replacement work order.',NULL,NULL,'predictive_rul_demand',
 'wo_coastal_gbx',0,
 'reserved','2026-04-15 09:00:00','2026-04-16 10:00:00','2026-04-18 11:00:00','2026-04-20 12:00:00',NULL,'2026-04-28 13:00:00','2026-05-08 14:00:00','2026-05-10 09:00:00','2026-05-12 10:00:00',NULL,NULL,NULL,
 1,'2026-05-30 10:00:00',0,'demo_support_001'),

-- spp_009 critical / issued — predictive_rul: vital module string staged pre-failure and issued; full clean arc (reportable)
('spp_009','SPP-2026-0009','asset_prognostic.wo_raised','asset_prognostic','aprog_001','W71','predictive_rul',
 'JK-MOD-580','PV module Tiger Neo 580W (string set)','JinkoSolar','Redstone Cluster','Redstone','wh_redstone','sup_jinko','JinkoSolar Holding Co','vital',
 30,30,30,0,5200,
 0.5,0.2,20,1.65,11,2,60,40,
 6000,3000000,2880000,156000,18.4,0.98,'critical',
 1,1,1,0,1,1,1,1,1,
 'W71 prognostics flagged accelerating PID degradation with an RUL of 60 days; a replacement string set was provisioned with 40 days of slack.','Requisition raised.','Requisition approved.','Purchase order issued.',NULL,NULL,'String set passed incoming QA and was stocked, then reserved against the replacement work order.','Module string set issued to the field crew ahead of the predicted failure; the asset never went down.',NULL,'predictive_rul_demand',
 'wo_redstone_str',0,
 'issued','2026-03-20 09:00:00','2026-03-21 10:00:00','2026-03-23 11:00:00','2026-03-25 12:00:00',NULL,'2026-04-02 13:00:00','2026-04-10 14:00:00','2026-04-12 09:00:00','2026-04-14 10:00:00','2026-04-20 16:00:00',NULL,NULL,
 1,NULL,0,'demo_support_001'),

-- spp_010 critical / cancelled — manual: vital spare cancelled when the asset was decommissioned; cancel_provisioning CROSSES (vital + high)
('spp_010','SPP-2026-0010','support.spare_parts_provisioning','manual','manual_kathu_inv','W72','manual',
 'SMA-SC-4600','Central inverter Sunny Central 4600','SMA','Kathu Solar Park','Kathu','wh_kathu','sup_sma','SMA Solar Technology AG','vital',
 1,1,NULL,0,1650000,
 0.008,0.003,50,1.65,1,1,NULL,NULL,
 8000,1800000,9600000,1650000,5.8,0.7,'critical',
 1,1,1,0,0,0,0,0,0,
 'A vital central inverter spare was being provisioned for the site.','Requisition raised.','Requisition approved.','Purchase order issued to the OEM.',NULL,NULL,NULL,NULL,'The served asset was decommissioned under a repowering plan so the vital provisioning line was cancelled; abandoning a vital high-impact line is notified to the regulator.','asset_decommissioned',
 NULL,0,
 'cancelled','2026-03-10 09:00:00','2026-03-11 10:00:00','2026-03-13 11:00:00','2026-03-15 12:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-02 16:00:00',
 1,NULL,0,'demo_support_001');

-- Events (transition log). The flag_backorder crossing for spp_005 (catastrophic
-- security-of-supply), the cancel_provisioning crossing for spp_010 (vital high-
-- tier), the expedite path for spp_006, and the full clean predictive arc for
-- spp_009 through issued. Single-party write; functional parties planner / buyer
-- / warehouse / supplier.
INSERT OR IGNORE INTO oe_spare_parts_provisioning_events (
  id, provisioning_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('spp_evt_001','spp_002','spare_parts_provisioning.requisition_raised','demand_identified','requisition_raised','demo_support_001','planner','Reorder-point replenishment requisition raised','2026-05-26 10:00:00'),
('spp_evt_002','spp_003','spare_parts_provisioning.requisition_raised','demand_identified','requisition_raised','demo_support_001','planner','Requisition raised against the scheduled work order','2026-05-21 10:00:00'),
('spp_evt_003','spp_003','spare_parts_provisioning.requisition_approved','requisition_raised','requisition_approved','demo_support_001','planner','Requisition approved for purchase','2026-05-23 11:00:00'),
-- spp_004 predictive arc to po_issued
('spp_evt_004','spp_004','spare_parts_provisioning.requisition_raised','demand_identified','requisition_raised','demo_support_001','planner','Predictive requisition raised from the W71 RUL signal','2026-05-13 10:00:00'),
('spp_evt_005','spp_004','spare_parts_provisioning.requisition_approved','requisition_raised','requisition_approved','demo_support_001','planner','Requisition approved','2026-05-15 11:00:00'),
('spp_evt_006','spp_004','spare_parts_provisioning.po_issued','requisition_approved','po_issued','demo_support_001','buyer','Purchase order issued to the OEM for the bushing set','2026-05-18 12:00:00'),
-- spp_005 backorder crossing (catastrophic security-of-supply)
('spp_evt_007','spp_005','spare_parts_provisioning.po_issued','requisition_approved','po_issued','demo_support_001','buyer','Purchase order issued for the main power transformer','2026-04-26 12:00:00'),
('spp_evt_008','spp_005','spare_parts_provisioning.backordered','po_issued','backordered','demo_support_001','supplier','OEM advised the unit is backordered with an extended lead time; catastrophic security-of-supply concern notified to the regulator','2026-05-05 09:00:00'),
('spp_evt_009','spp_005','spare_parts_provisioning.sla_breached','backordered','backordered','system','system','Auto-breach: backordered past SLA (tier catastrophic)','2026-05-09 09:30:00'),
-- spp_006 expedite path to in_transit
('spp_evt_010','spp_006','spare_parts_provisioning.po_issued','requisition_approved','po_issued','demo_support_001','buyer','Purchase order issued for yaw drive motors','2026-05-11 12:00:00'),
('spp_evt_011','spp_006','spare_parts_provisioning.backordered','po_issued','backordered','demo_support_001','supplier','Initial supply backordered','2026-05-14 09:00:00'),
('spp_evt_012','spp_006','spare_parts_provisioning.in_transit','backordered','in_transit','demo_support_001','buyer','Alternate-source air freight arranged; units in transit','2026-05-22 13:00:00'),
-- spp_007 receipt at the QA gate
('spp_evt_013','spp_007','spare_parts_provisioning.po_issued','requisition_approved','po_issued','demo_support_001','buyer','Purchase order raised for RMA replacement controllers','2026-05-09 12:00:00'),
('spp_evt_014','spp_007','spare_parts_provisioning.in_transit','po_issued','in_transit','demo_support_001','supplier','Replacement controllers shipped','2026-05-16 13:00:00'),
('spp_evt_015','spp_007','spare_parts_provisioning.received','in_transit','received','demo_support_001','warehouse','Goods received; awaiting incoming QA inspection','2026-05-26 14:00:00'),
-- spp_008 staged + reserved
('spp_evt_016','spp_008','spare_parts_provisioning.received','in_transit','received','demo_support_001','warehouse','Bearing set received','2026-05-08 14:00:00'),
('spp_evt_017','spp_008','spare_parts_provisioning.stocked','received','stocked','demo_support_001','warehouse','Bearing set passed incoming QA and was stocked','2026-05-10 09:00:00'),
('spp_evt_018','spp_008','spare_parts_provisioning.reserved','stocked','reserved','demo_support_001','warehouse','Bearing set reserved against the planned replacement work order','2026-05-12 10:00:00'),
-- spp_009 full clean predictive arc through issued
('spp_evt_019','spp_009','spare_parts_provisioning.po_issued','requisition_approved','po_issued','demo_support_001','buyer','Purchase order issued for the replacement string set','2026-03-25 12:00:00'),
('spp_evt_020','spp_009','spare_parts_provisioning.in_transit','po_issued','in_transit','demo_support_001','supplier','String set shipped','2026-04-02 13:00:00'),
('spp_evt_021','spp_009','spare_parts_provisioning.received','in_transit','received','demo_support_001','warehouse','String set received','2026-04-10 14:00:00'),
('spp_evt_022','spp_009','spare_parts_provisioning.stocked','received','stocked','demo_support_001','warehouse','String set passed incoming QA and was stocked','2026-04-12 09:00:00'),
('spp_evt_023','spp_009','spare_parts_provisioning.reserved','stocked','reserved','demo_support_001','warehouse','String set reserved against the replacement work order','2026-04-14 10:00:00'),
('spp_evt_024','spp_009','spare_parts_provisioning.issued','reserved','issued','demo_support_001','warehouse','String set issued to the field crew ahead of the predicted failure; asset never went down','2026-04-20 16:00:00'),
-- spp_010 cancel crossing (vital high-tier)
('spp_evt_025','spp_010','spare_parts_provisioning.po_issued','requisition_approved','po_issued','demo_support_001','buyer','Purchase order issued for the central inverter spare','2026-03-15 12:00:00'),
('spp_evt_026','spp_010','spare_parts_provisioning.cancelled','po_issued','cancelled','demo_support_001','planner','Served asset decommissioned under a repowering plan; vital high-impact line cancelled and notified to the regulator','2026-05-02 16:00:00');
