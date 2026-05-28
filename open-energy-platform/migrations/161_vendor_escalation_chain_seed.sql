-- Wave 35 — Esums O&M Warranty Vendor-Side Escalation seed data
-- 10 prod-realistic cases across 10 of 11 states (omits withdrawn) + 4 defect classes.
-- Real SA solar/wind/BESS OEMs (Sungrow, Goldwind, Jinko, Pylontech, ABB, Stäubli).
-- Cross-wave provenance: W15 warranty claims (WC-2026-xxx) + W24 PR chain (PR-2026-xxxx).
-- Operator = Esums O&M (Pty) Ltd; vendor/OEM = component supplier / manufacturer.

-- 1) filed — single_unit isolated string-combiner defect (Aggeneys)
INSERT OR IGNORE INTO oe_vendor_escalation (
  id, case_number,
  operator_party_id, operator_party_name, vendor_party_id, vendor_party_name,
  component_type, component_model, serial_range, fleet_units_affected, fleet_units_total, fleet_fraction,
  site_name, site_province,
  defect_class, safety_critical, warranty_clause, filing_ref, claim_value_zar,
  defect_summary,
  chain_status, filed_at, sla_deadline_at, created_by
) VALUES (
  'vesc_001', 'ESC-2026-0001',
  'esums_om', 'Esums O&M (Pty) Ltd', 'vendor_sma', 'SMA Solar Technology AG (SA distributor)',
  'string_combiner', 'SMA String-Combiner 1000', 'SC1000-AGG-0042', 1, 96, 0.0104,
  'Aggeneys Solar', 'Northern Cape',
  'single_unit', 0, 'Supplier warranty cl.7.2 — 5-year parts replacement', 'FILE-2026-AGG-SC042', 38000,
  'Single string-combiner SC1000-AGG-0042 tripped on internal DC fuse degradation. Isolated unit; no fleet pattern observed. Filed against SMA distributor for warranty replacement.',
  'filed', '2026-05-27 08:00:00', '2026-06-03 08:00:00', 'demo_ipp_001'
);

-- 2) vendor_triage — batch_defect MC4 connector batch (single province)
INSERT OR IGNORE INTO oe_vendor_escalation (
  id, case_number,
  operator_party_id, operator_party_name, vendor_party_id, vendor_party_name,
  component_type, component_model, serial_range, fleet_units_affected, fleet_units_total, fleet_fraction,
  site_name, site_province,
  defect_class, safety_critical, warranty_clause, filing_ref, claim_value_zar,
  defect_summary,
  chain_status, filed_at, vendor_triage_at, sla_deadline_at, created_by
) VALUES (
  'vesc_002', 'ESC-2026-0002',
  'esums_om', 'Esums O&M (Pty) Ltd', 'vendor_staubli', 'Stäubli Electrical Connectors AG',
  'dc_connector', 'Stäubli MC4-Evo2', 'BATCH-MC4-2024-Q3-ZA', 240, 5200, 0.0462,
  'Droogfontein Solar', 'Northern Cape',
  'batch_defect', 0, 'Supplier warranty cl.4.1 — connector lot recall provision', 'FILE-2026-DRG-MC4', 410000,
  'Elevated contact resistance on Q3-2024 MC4-Evo2 connector lot — 240 connectors across Droogfontein string boxes. Confined to one manufacturing batch / serial range. Vendor triaging lot-traceability.',
  'vendor_triage', '2026-05-26 09:00:00', '2026-05-26 14:30:00', '2026-05-31 14:30:00', 'demo_ipp_001'
);

-- 3) vendor_decision — fleet_systemic Sungrow SG250HX firmware MPPT regression (W24 pr_007)
INSERT OR IGNORE INTO oe_vendor_escalation (
  id, case_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  operator_party_id, operator_party_name, vendor_party_id, vendor_party_name,
  component_type, component_model, serial_range, fleet_units_affected, fleet_units_total, fleet_fraction,
  site_name, site_province,
  defect_class, safety_critical, warranty_clause, filing_ref, vendor_decision_ref,
  liability_accepted, claim_value_zar, vendor_decision_basis,
  defect_summary,
  chain_status, filed_at, vendor_triage_at, vendor_decision_at, sla_deadline_at, created_by
) VALUES (
  'vesc_003', 'ESC-2026-0003',
  'pr.oem_defect', 'pr_chain', 'pr_007', 'W24',
  'esums_om', 'Esums O&M (Pty) Ltd', 'vendor_sungrow', 'Sungrow Power Supply Co. (SA)',
  'inverter', 'Sungrow SG250HX', 'FW-SG250HX-v2.3.1', 312, 480, 0.65,
  'Aggeneys Solar', 'Northern Cape',
  'fleet_systemic', 0, 'Supplier warranty cl.9 — firmware defect remediation', 'FILE-2026-AGG-SG250', 'VND-DEC-2026-SUNGROW-001',
  1, 9800000, 'Sungrow accepts firmware regression in v2.3.1 MPPT tracking loop causing 21pp PR loss across SG250HX fleet. Free firmware rollout v2.3.4 + field-engineer validation committed. Traced from W24 PR-2026-0007.',
  'Firmware v2.3.1 MPPT regression — partial-shading hunting causes sustained 21pp performance-ratio loss across 312 of 480 SG250HX units. Systemic across fleet. Vendor accepted liability.',
  'vendor_decision', '2026-05-23 07:00:00', '2026-05-23 13:00:00', '2026-05-25 10:00:00', '2026-05-27 10:00:00', 'demo_ipp_001'
);

-- 4) escalated_to_oem — safety_recall DC arc-fault / fire risk (escalated to OEM)
INSERT OR IGNORE INTO oe_vendor_escalation (
  id, case_number,
  operator_party_id, operator_party_name, vendor_party_id, vendor_party_name,
  oem_party_id, oem_party_name,
  component_type, component_model, serial_range, fleet_units_affected, fleet_units_total, fleet_fraction,
  site_name, site_province,
  defect_class, safety_critical, warranty_clause, filing_ref, vendor_decision_ref,
  liability_accepted, claim_value_zar, vendor_decision_basis, defect_summary,
  chain_status, filed_at, vendor_triage_at, vendor_decision_at, escalated_to_oem_at, sla_deadline_at, created_by
) VALUES (
  'vesc_004', 'ESC-2026-0004',
  'esums_om', 'Esums O&M (Pty) Ltd', 'vendor_huawei_sa', 'Huawei Technologies SA (distributor)',
  'oem_huawei', 'Huawei Technologies Co.',
  'inverter_dc_switch', 'Huawei SUN2000-DC-Switch', 'DCS-2023-LOT-B', 58, 1240, 0.0468,
  'Kathu Solar Park', 'Northern Cape',
  'safety_recall', 1, 'Supplier warranty cl.11 — safety-defect escalation', 'FILE-2026-KAT-DCS', 'VND-DEC-2026-HUAWEI-001',
  0, 2750000, 'Distributor declined sole liability — DC isolator arc-fault traced to OEM enclosure sealing design. Escalated to Huawei OEM for safety-engineering determination.',
  'Two DC-isolator enclosures showed arc-fault scorching (no fire). Moisture ingress on LOT-B sealing → arc risk. SAFETY-CRITICAL. Distributor escalated to Huawei OEM.',
  'escalated_to_oem', '2026-05-27 06:00:00', '2026-05-27 09:00:00', '2026-05-27 18:00:00', '2026-05-28 06:00:00', '2026-05-29 06:00:00', 'demo_ipp_001'
);

-- 5) oem_field_investigation — fleet_systemic Goldwind gearbox high-side temp (W24 pr_005)
INSERT OR IGNORE INTO oe_vendor_escalation (
  id, case_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  operator_party_id, operator_party_name, vendor_party_id, vendor_party_name,
  oem_party_id, oem_party_name,
  component_type, component_model, serial_range, fleet_units_affected, fleet_units_total, fleet_fraction,
  site_name, site_province,
  defect_class, safety_critical, warranty_clause, filing_ref, vendor_decision_ref,
  liability_accepted, claim_value_zar, defect_summary,
  chain_status, filed_at, vendor_triage_at, vendor_decision_at, escalated_to_oem_at, oem_investigation_at, sla_deadline_at, created_by
) VALUES (
  'vesc_005', 'ESC-2026-0005',
  'pr.gearbox_temp_alarm', 'pr_chain', 'pr_005', 'W24',
  'esums_om', 'Esums O&M (Pty) Ltd', 'vendor_goldwind_sa', 'Goldwind International SA',
  'oem_goldwind', 'Goldwind Science & Technology Co.',
  'turbine_gearbox', 'Goldwind GW155-4.5MW gearbox', 'GBX-RGV-2022-LOT3', 14, 33, 0.4242,
  'Roggeveld Wind', 'Western Cape',
  'fleet_systemic', 0, 'Supplier warranty cl.12 — drivetrain serial defect', 'FILE-2026-RGV-GBX', 'VND-DEC-2026-GOLDWIND-001',
  1, 47000000, 'Gearbox high-speed-stage bearing high-temp alarms on WTG-09 + WTG-14, pattern across 14 of 33 turbines (LOT3 drivetrains). OEM conducting borescope + oil-debris field investigation. Traced from W24 PR-2026-0005.',
  'oem_field_investigation', '2026-05-15 08:00:00', '2026-05-15 16:00:00', '2026-05-17 09:00:00', '2026-05-18 10:00:00', '2026-05-20 09:00:00', '2026-05-27 09:00:00', 'demo_ipp_001'
);

-- 6) oem_decision — batch_defect Pylontech BESS cell batch (replacement decided)
INSERT OR IGNORE INTO oe_vendor_escalation (
  id, case_number,
  operator_party_id, operator_party_name, vendor_party_id, vendor_party_name,
  oem_party_id, oem_party_name,
  component_type, component_model, serial_range, fleet_units_affected, fleet_units_total, fleet_fraction,
  site_name, site_province,
  defect_class, safety_critical, warranty_clause, filing_ref, vendor_decision_ref, oem_decision_ref,
  liability_accepted, claim_value_zar, remedy_type, oem_decision_basis, defect_summary,
  chain_status, filed_at, vendor_triage_at, vendor_decision_at, escalated_to_oem_at, oem_investigation_at, oem_decision_at, sla_deadline_at, created_by
) VALUES (
  'vesc_006', 'ESC-2026-0006',
  'esums_om', 'Esums O&M (Pty) Ltd', 'vendor_pylontech_sa', 'Pylontech SA (distributor)',
  'oem_pylontech', 'Pylon Technologies Co.',
  'bess_module', 'Pylontech Force-H2 module', 'FH2-2024-CELL-LOT-K', 36, 420, 0.0857,
  'Humansdorp Hybrid', 'Eastern Cape',
  'batch_defect', 0, 'Supplier warranty cl.6 — cell-lot capacity-fade defect', 'FILE-2026-HMD-BESS', 'VND-DEC-2026-PYLON-001', 'OEM-DEC-2026-PYLON-001',
  1, 5400000, 'module_replacement', 'OEM confirmed accelerated capacity fade on CELL-LOT-K (manufacturing electrolyte variance). 36 modules to be replaced under warranty; no safety risk (thermal-runaway test passed). Replacement modules shipped.',
  'Force-H2 modules from CELL-LOT-K showing >8%/yr capacity fade vs 2% spec. Confined to one cell lot. OEM determined batch replacement.',
  'oem_decision', '2026-05-19 10:00:00', '2026-05-19 15:00:00', '2026-05-20 11:00:00', '2026-05-21 09:00:00', '2026-05-21 14:00:00', '2026-05-22 16:00:00', '2026-05-29 16:00:00', 'demo_ipp_001'
);

-- 7) remediation — fleet_systemic inverter cooling-fan retrofit underway
INSERT OR IGNORE INTO oe_vendor_escalation (
  id, case_number,
  operator_party_id, operator_party_name, vendor_party_id, vendor_party_name,
  oem_party_id, oem_party_name,
  component_type, component_model, serial_range, fleet_units_affected, fleet_units_total, fleet_fraction,
  site_name, site_province,
  defect_class, safety_critical, warranty_clause, filing_ref, vendor_decision_ref, oem_decision_ref, remediation_ref,
  liability_accepted, claim_value_zar, remedy_type, remedy_cost_zar, remediation_plan, oem_decision_basis, defect_summary,
  chain_status, filed_at, vendor_triage_at, vendor_decision_at, escalated_to_oem_at, oem_investigation_at, oem_decision_at, remediation_at, sla_deadline_at, created_by
) VALUES (
  'vesc_007', 'ESC-2026-0007',
  'esums_om', 'Esums O&M (Pty) Ltd', 'vendor_sungrow', 'Sungrow Power Supply Co. (SA)',
  'oem_sungrow', 'Sungrow Power Supply Co.',
  'inverter_cooling_fan', 'Sungrow SG250HX cooling assy', 'FAN-SG250-2023-REVA', 198, 480, 0.4125,
  'Kalkbult Solar', 'Northern Cape',
  'fleet_systemic', 0, 'Supplier warranty cl.9 — thermal-derate retrofit', 'FILE-2026-KLK-FAN', 'VND-DEC-2026-SUNGROW-002', 'OEM-DEC-2026-SUNGROW-002', 'REM-2026-KLK-FAN',
  1, 7600000, 'fan_retrofit', 6900000, 'OEM-supplied REV-B cooling assemblies + dust-filter kit; field retrofit across 198 units in 6 waves. 120 of 198 complete. Thermal-derate events tracked to closure.',
  'OEM confirmed REV-A fan bearings under-rated for Karoo dust loading → thermal derate at high ambient. Fleet retrofit authorised.',
  'REV-A cooling fans seizing under dust loading → inverters thermal-derating in summer peaks across 198 of 480 units. Remediation retrofit in progress.',
  'remediation', '2026-04-20 08:00:00', '2026-04-20 14:00:00', '2026-04-22 10:00:00', '2026-04-24 09:00:00', '2026-04-28 09:00:00', '2026-05-05 11:00:00', '2026-05-15 08:00:00', '2026-06-14 08:00:00', 'demo_ipp_001'
);

-- 8) closed — single_unit transformer bushing repair (W15 warr_clm_007)
INSERT OR IGNORE INTO oe_vendor_escalation (
  id, case_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  operator_party_id, operator_party_name, vendor_party_id, vendor_party_name,
  oem_party_id, oem_party_name,
  component_type, component_model, serial_range, fleet_units_affected, fleet_units_total, fleet_fraction,
  site_name, site_province,
  defect_class, safety_critical, warranty_clause, filing_ref, vendor_decision_ref, oem_decision_ref, remediation_ref,
  liability_accepted, claim_value_zar, remedy_type, remedy_cost_zar, reason_code, rod_notes, defect_summary,
  chain_status, filed_at, vendor_triage_at, vendor_decision_at, escalated_to_oem_at, oem_investigation_at, oem_decision_at, remediation_at, closed_at, created_by
) VALUES (
  'vesc_008', 'ESC-2026-0008',
  'warranty.systemic_defect', 'warranty_claim', 'warr_clm_007', 'W15',
  'esums_om', 'Esums O&M (Pty) Ltd', 'vendor_abb_sa', 'ABB South Africa (Pty) Ltd',
  'oem_hitachi_energy', 'Hitachi Energy Ltd',
  'transformer_bushing', 'ABB GOB-type 33kV bushing', 'BSH-2021-0145', 1, 12, 0.0833,
  'Jeffreys Bay Wind', 'Eastern Cape',
  'single_unit', 0, 'Supplier warranty cl.3 — HV bushing 7-year defect', 'FILE-2026-JBW-BSH', 'VND-DEC-2026-ABB-001', 'OEM-DEC-2026-HITACHI-001', 'REM-2026-JBW-BSH',
  1, 1850000, 'bushing_replacement', 1620000, 'warranty_honoured', 'Single GOB bushing replaced under warranty; root cause = isolated capacitive-tap moisture ingress, not a lot defect. Closed — no fleet action. Escalated from W15 WC-2026-007.',
  'HV bushing capacitance/tan-delta drift on one substation transformer. OEM replaced under warranty. No fleet pattern.',
  'closed', '2026-03-10 08:00:00', '2026-03-10 12:00:00', '2026-03-12 10:00:00', '2026-03-14 09:00:00', '2026-03-18 10:00:00', '2026-03-25 14:00:00', '2026-04-02 08:00:00', '2026-04-28 16:00:00', 'admin'
);

-- 9) recall_issued — safety_recall PV junction-box fire risk (W15 warr_clm_005), full path → NRCS recall
INSERT OR IGNORE INTO oe_vendor_escalation (
  id, case_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  operator_party_id, operator_party_name, vendor_party_id, vendor_party_name,
  oem_party_id, oem_party_name,
  component_type, component_model, serial_range, fleet_units_affected, fleet_units_total, fleet_fraction,
  site_name, site_province,
  defect_class, safety_critical, warranty_clause, filing_ref, vendor_decision_ref, oem_decision_ref, recall_ref,
  liability_accepted, claim_value_zar, remedy_type, remedy_cost_zar, recall_basis, reason_code, rod_notes, defect_summary,
  chain_status, filed_at, vendor_triage_at, vendor_decision_at, escalated_to_oem_at, oem_investigation_at, oem_decision_at, recall_issued_at, created_by
) VALUES (
  'vesc_009', 'ESC-2026-0009',
  'warranty.systemic_defect', 'warranty_claim', 'warr_clm_005', 'W15',
  'esums_om', 'Esums O&M (Pty) Ltd', 'vendor_jinko_sa', 'JinkoSolar SA (distributor)',
  'oem_jinkosolar', 'JinkoSolar Co. Ltd',
  'pv_module_junction_box', 'Jinko Tiger Neo JB', 'JB-TN-2023-LOT-D', 4200, 18600, 0.2258,
  'Pofadder Solar', 'Northern Cape',
  'safety_recall', 1, 'Supplier warranty cl.2 + CPA §61 product-liability', 'FILE-2026-POF-JB', 'VND-DEC-2026-JINKO-001', 'OEM-DEC-2026-JINKO-001', 'NRCS-RECALL-2026-0007',
  1, 31000000, 'module_recall_replacement', 28500000, 'NRCS Compulsory Specifications recall NRCS-RECALL-2026-0007 — Tiger Neo LOT-D junction-box potting voids → hot-spot/fire risk. Affects 4200 modules at Pofadder + broader SA installed base. Manufacturer recall + free replacement.',
  'safety_recall_issued', 'NRCS notified per NRCS Act 2008; CPA §61 producer liability. Council briefed. Recall logistics: 4200 modules staged replacement over 90 days; affected strings de-energised pending swap. Escalated from W15 WC-2026-005.',
  'Junction-box potting voids on LOT-D Tiger Neo modules causing diode hot-spots; two modules showed backsheet scorching. SAFETY-CRITICAL fire risk. OEM issued NRCS recall across installed base.',
  'recall_issued', '2026-04-28 07:00:00', '2026-04-28 10:00:00', '2026-04-29 14:00:00', '2026-05-01 09:00:00', '2026-05-06 10:00:00', '2026-05-12 15:00:00', '2026-05-20 11:00:00', 'admin'
);

-- 10) arbitration — safety_recall vendor disputes liability (string-inverter fire) → arbitration
INSERT OR IGNORE INTO oe_vendor_escalation (
  id, case_number,
  operator_party_id, operator_party_name, vendor_party_id, vendor_party_name,
  oem_party_id, oem_party_name,
  component_type, component_model, serial_range, fleet_units_affected, fleet_units_total, fleet_fraction,
  site_name, site_province,
  defect_class, safety_critical, warranty_clause, filing_ref, vendor_decision_ref, oem_decision_ref, arbitration_case_ref,
  liability_accepted, claim_value_zar, arbitration_basis, oem_decision_basis, reason_code, defect_summary,
  chain_status, filed_at, vendor_triage_at, vendor_decision_at, escalated_to_oem_at, oem_investigation_at, oem_decision_at, arbitration_at, created_by
) VALUES (
  'vesc_010', 'ESC-2026-0010',
  'esums_om', 'Esums O&M (Pty) Ltd', 'vendor_growatt_sa', 'Growatt New Energy SA (distributor)',
  'oem_growatt', 'Growatt New Energy Co.',
  'string_inverter', 'Growatt MAX 125KTL3-X', 'MAX125-2022-LOT-C', 22, 140, 0.1571,
  'Vredendal C&I Cluster', 'Western Cape',
  'safety_recall', 1, 'Supplier warranty cl.10 + CPA §61', 'FILE-2026-VRD-MAX', 'VND-DEC-2026-GROWATT-001', 'OEM-DEC-2026-GROWATT-001', 'AFSA-ARB-2026-CSC-0014',
  0, 14800000, 'Vendor + OEM dispute liability — assert improper site commissioning (DC over-voltage) caused the AC-relay weld + thermal event, not a manufacturing defect. Esums disputes; AFSA arbitration AFSA-ARB-2026-CSC-0014 filed. Independent forensic ordered.',
  'OEM determined no manufacturing defect; attributes thermal event to site DC string over-sizing. Esums rejects determination.',
  'liability_disputed', 'AC-output relay weld + localised thermal event on one MAX 125KTL3-X (no fire spread). Pattern on 22 of 140 LOT-C units. SAFETY-CRITICAL. Liability disputed → arbitration.',
  'arbitration', '2026-04-10 08:00:00', '2026-04-10 13:00:00', '2026-04-12 10:00:00', '2026-04-15 09:00:00', '2026-04-22 10:00:00', '2026-05-02 15:00:00', '2026-05-18 11:00:00', 'admin'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- vesc_001 events (filed)
INSERT OR IGNORE INTO oe_vendor_escalation_events (id, escalation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('veev_001_a', 'vesc_001', 'vendor_escalation.filed', null, 'filed', 'esums_om_lead', 'operator', 'Filed single-unit string-combiner defect against SMA distributor', '2026-05-27 08:00:00');

-- vesc_002 events (vendor_triage)
INSERT OR IGNORE INTO oe_vendor_escalation_events (id, escalation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('veev_002_a', 'vesc_002', 'vendor_escalation.filed', null, 'filed', 'esums_om_lead', 'operator', 'Filed MC4 connector lot defect — 240 connectors Droogfontein', '2026-05-26 09:00:00'),
('veev_002_b', 'vesc_002', 'vendor_escalation.vendor_triage', 'filed', 'vendor_triage', 'staubli_warranty', 'vendor', 'Stäubli triaging — lot traceability on BATCH-MC4-2024-Q3-ZA', '2026-05-26 14:30:00');

-- vesc_003 events (vendor_decision — W24 provenance)
INSERT OR IGNORE INTO oe_vendor_escalation_events (id, escalation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('veev_003_a', 'vesc_003', 'vendor_escalation.filed', null, 'filed', 'esums_om_lead', 'operator', 'Filed SG250HX firmware MPPT regression — traced from W24 PR-2026-0007 Aggeneys', '2026-05-23 07:00:00'),
('veev_003_b', 'vesc_003', 'vendor_escalation.vendor_triage', 'filed', 'vendor_triage', 'sungrow_warranty', 'vendor', 'Sungrow reproduced v2.3.1 MPPT hunting in lab', '2026-05-23 13:00:00'),
('veev_003_c', 'vesc_003', 'vendor_escalation.vendor_decision', 'vendor_triage', 'vendor_decision', 'sungrow_warranty', 'vendor', 'Liability ACCEPTED — free v2.3.4 firmware rollout + field validation. VND-DEC-2026-SUNGROW-001', '2026-05-25 10:00:00');

-- vesc_004 events (escalated_to_oem — safety)
INSERT OR IGNORE INTO oe_vendor_escalation_events (id, escalation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('veev_004_a', 'vesc_004', 'vendor_escalation.filed', null, 'filed', 'esums_om_lead', 'operator', 'Filed DC-isolator arc-fault — SAFETY. Kathu Solar Park', '2026-05-27 06:00:00'),
('veev_004_b', 'vesc_004', 'vendor_escalation.vendor_triage', 'filed', 'vendor_triage', 'huawei_warranty', 'vendor', 'Distributor triage — moisture ingress LOT-B sealing', '2026-05-27 09:00:00'),
('veev_004_c', 'vesc_004', 'vendor_escalation.vendor_decision', 'vendor_triage', 'vendor_decision', 'huawei_warranty', 'vendor', 'Distributor declined sole liability — enclosure design escalation', '2026-05-27 18:00:00'),
('veev_004_d', 'vesc_004', 'vendor_escalation.escalated_to_oem', 'vendor_decision', 'escalated_to_oem', 'esums_om_lead', 'operator', 'Escalated to Huawei OEM for safety-engineering determination', '2026-05-28 06:00:00');

-- vesc_005 events (oem_field_investigation — W24 provenance)
INSERT OR IGNORE INTO oe_vendor_escalation_events (id, escalation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('veev_005_a', 'vesc_005', 'vendor_escalation.filed', null, 'filed', 'esums_om_lead', 'operator', 'Filed Goldwind gearbox high-temp pattern — traced from W24 PR-2026-0005 Roggeveld', '2026-05-15 08:00:00'),
('veev_005_b', 'vesc_005', 'vendor_escalation.vendor_triage', 'filed', 'vendor_triage', 'goldwind_warranty', 'vendor', 'Distributor triage — oil-debris samples requested', '2026-05-15 16:00:00'),
('veev_005_c', 'vesc_005', 'vendor_escalation.vendor_decision', 'vendor_triage', 'vendor_decision', 'goldwind_warranty', 'vendor', 'Liability accepted in principle — LOT3 drivetrain pattern; OEM engineering required', '2026-05-17 09:00:00'),
('veev_005_d', 'vesc_005', 'vendor_escalation.escalated_to_oem', 'vendor_decision', 'escalated_to_oem', 'esums_om_lead', 'operator', 'Escalated to Goldwind OEM drivetrain team', '2026-05-18 10:00:00'),
('veev_005_e', 'vesc_005', 'vendor_escalation.oem_field_investigation', 'escalated_to_oem', 'oem_field_investigation', 'goldwind_oem_eng', 'oem', 'OEM borescope + oil-debris field investigation underway across LOT3 turbines', '2026-05-20 09:00:00');

-- vesc_006 events (oem_decision)
INSERT OR IGNORE INTO oe_vendor_escalation_events (id, escalation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('veev_006_a', 'vesc_006', 'vendor_escalation.filed', null, 'filed', 'esums_om_lead', 'operator', 'Filed Pylontech cell-lot capacity fade — Humansdorp Hybrid', '2026-05-19 10:00:00'),
('veev_006_b', 'vesc_006', 'vendor_escalation.vendor_triage', 'filed', 'vendor_triage', 'pylontech_warranty', 'vendor', 'Distributor triage — CELL-LOT-K traceability', '2026-05-19 15:00:00'),
('veev_006_c', 'vesc_006', 'vendor_escalation.vendor_decision', 'vendor_triage', 'vendor_decision', 'pylontech_warranty', 'vendor', 'Escalation to OEM cell-engineering required', '2026-05-20 11:00:00'),
('veev_006_d', 'vesc_006', 'vendor_escalation.escalated_to_oem', 'vendor_decision', 'escalated_to_oem', 'esums_om_lead', 'operator', 'Escalated to Pylontech OEM', '2026-05-21 09:00:00'),
('veev_006_e', 'vesc_006', 'vendor_escalation.oem_field_investigation', 'escalated_to_oem', 'oem_field_investigation', 'pylontech_oem_eng', 'oem', 'OEM cell-teardown + thermal-runaway testing', '2026-05-21 14:00:00'),
('veev_006_f', 'vesc_006', 'vendor_escalation.oem_decision', 'oem_field_investigation', 'oem_decision', 'pylontech_oem_eng', 'oem', 'OEM determination: electrolyte variance on CELL-LOT-K — 36 modules replaced; no safety risk. OEM-DEC-2026-PYLON-001', '2026-05-22 16:00:00');

-- vesc_007 events (remediation)
INSERT OR IGNORE INTO oe_vendor_escalation_events (id, escalation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('veev_007_a', 'vesc_007', 'vendor_escalation.filed', null, 'filed', 'esums_om_lead', 'operator', 'Filed SG250HX cooling-fan thermal-derate — Kalkbult', '2026-04-20 08:00:00'),
('veev_007_b', 'vesc_007', 'vendor_escalation.vendor_triage', 'filed', 'vendor_triage', 'sungrow_warranty', 'vendor', 'Triage — REV-A fan dust-loading pattern', '2026-04-20 14:00:00'),
('veev_007_c', 'vesc_007', 'vendor_escalation.vendor_decision', 'vendor_triage', 'vendor_decision', 'sungrow_warranty', 'vendor', 'Liability accepted — OEM retrofit kit required', '2026-04-22 10:00:00'),
('veev_007_d', 'vesc_007', 'vendor_escalation.escalated_to_oem', 'vendor_decision', 'escalated_to_oem', 'esums_om_lead', 'operator', 'Escalated to Sungrow OEM for retrofit authorisation', '2026-04-24 09:00:00'),
('veev_007_e', 'vesc_007', 'vendor_escalation.oem_field_investigation', 'escalated_to_oem', 'oem_field_investigation', 'sungrow_oem_eng', 'oem', 'OEM thermal-derate field study — REV-A bearings under-rated for Karoo dust', '2026-04-28 09:00:00'),
('veev_007_f', 'vesc_007', 'vendor_escalation.oem_decision', 'oem_field_investigation', 'oem_decision', 'sungrow_oem_eng', 'oem', 'OEM authorised REV-B cooling-assy fleet retrofit. OEM-DEC-2026-SUNGROW-002', '2026-05-05 11:00:00'),
('veev_007_g', 'vesc_007', 'vendor_escalation.remediation', 'oem_decision', 'remediation', 'sungrow_oem_field', 'oem', 'Retrofit REM-2026-KLK-FAN started — 120 of 198 units complete', '2026-05-15 08:00:00');

-- vesc_008 events (closed — W15 provenance)
INSERT OR IGNORE INTO oe_vendor_escalation_events (id, escalation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('veev_008_a', 'vesc_008', 'vendor_escalation.filed', null, 'filed', 'esums_om_lead', 'operator', 'Filed transformer bushing defect — escalated from W15 WC-2026-007', '2026-03-10 08:00:00'),
('veev_008_b', 'vesc_008', 'vendor_escalation.vendor_triage', 'filed', 'vendor_triage', 'abb_warranty', 'vendor', 'ABB triage — tan-delta drift', '2026-03-10 12:00:00'),
('veev_008_c', 'vesc_008', 'vendor_escalation.vendor_decision', 'vendor_triage', 'vendor_decision', 'abb_warranty', 'vendor', 'OEM (Hitachi Energy) engineering escalation', '2026-03-12 10:00:00'),
('veev_008_d', 'vesc_008', 'vendor_escalation.escalated_to_oem', 'vendor_decision', 'escalated_to_oem', 'esums_om_lead', 'operator', 'Escalated to Hitachi Energy', '2026-03-14 09:00:00'),
('veev_008_e', 'vesc_008', 'vendor_escalation.oem_field_investigation', 'escalated_to_oem', 'oem_field_investigation', 'hitachi_oem_eng', 'oem', 'OEM bushing teardown — isolated moisture ingress, not a lot defect', '2026-03-18 10:00:00'),
('veev_008_f', 'vesc_008', 'vendor_escalation.oem_decision', 'oem_field_investigation', 'oem_decision', 'hitachi_oem_eng', 'oem', 'OEM: single-unit defect, warranty replacement. OEM-DEC-2026-HITACHI-001', '2026-03-25 14:00:00'),
('veev_008_g', 'vesc_008', 'vendor_escalation.remediation', 'oem_decision', 'remediation', 'hitachi_oem_field', 'oem', 'Bushing replaced under warranty', '2026-04-02 08:00:00'),
('veev_008_h', 'vesc_008', 'vendor_escalation.closed', 'remediation', 'closed', 'esums_om_lead', 'operator', 'Closed — warranty honoured, no fleet action. R1.62m remedy', '2026-04-28 16:00:00');

-- vesc_009 events (recall_issued — safety, W15 provenance)
INSERT OR IGNORE INTO oe_vendor_escalation_events (id, escalation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('veev_009_a', 'vesc_009', 'vendor_escalation.filed', null, 'filed', 'esums_om_lead', 'operator', 'Filed PV junction-box fire risk — SAFETY. Escalated from W15 WC-2026-005', '2026-04-28 07:00:00'),
('veev_009_b', 'vesc_009', 'vendor_escalation.vendor_triage', 'filed', 'vendor_triage', 'jinko_warranty', 'vendor', 'Jinko distributor triage — LOT-D potting voids confirmed', '2026-04-28 10:00:00'),
('veev_009_c', 'vesc_009', 'vendor_escalation.vendor_decision', 'vendor_triage', 'vendor_decision', 'jinko_warranty', 'vendor', 'Distributor escalated to OEM — installed-base safety review', '2026-04-29 14:00:00'),
('veev_009_d', 'vesc_009', 'vendor_escalation.escalated_to_oem', 'vendor_decision', 'escalated_to_oem', 'esums_om_lead', 'operator', 'Escalated to JinkoSolar OEM', '2026-05-01 09:00:00'),
('veev_009_e', 'vesc_009', 'vendor_escalation.oem_field_investigation', 'escalated_to_oem', 'oem_field_investigation', 'jinko_oem_eng', 'oem', 'OEM thermal-imaging + backsheet forensic — hot-spot fire risk confirmed', '2026-05-06 10:00:00'),
('veev_009_f', 'vesc_009', 'vendor_escalation.oem_decision', 'oem_field_investigation', 'oem_decision', 'jinko_oem_eng', 'oem', 'OEM determination: SAFETY recall warranted across LOT-D installed base', '2026-05-12 15:00:00'),
('veev_009_g', 'vesc_009', 'vendor_escalation.recall_issued', 'oem_decision', 'recall_issued', 'jinko_oem_safety', 'oem', 'NRCS-RECALL-2026-0007 issued — 4200 modules; NRCS + Council notified; CPA §61. Staged 90-day replacement.', '2026-05-20 11:00:00');

-- vesc_010 events (arbitration — safety)
INSERT OR IGNORE INTO oe_vendor_escalation_events (id, escalation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('veev_010_a', 'vesc_010', 'vendor_escalation.filed', null, 'filed', 'esums_om_lead', 'operator', 'Filed string-inverter AC-relay weld thermal event — SAFETY. Vredendal C&I', '2026-04-10 08:00:00'),
('veev_010_b', 'vesc_010', 'vendor_escalation.vendor_triage', 'filed', 'vendor_triage', 'growatt_warranty', 'vendor', 'Distributor triage — LOT-C relay pattern', '2026-04-10 13:00:00'),
('veev_010_c', 'vesc_010', 'vendor_escalation.vendor_decision', 'vendor_triage', 'vendor_decision', 'growatt_warranty', 'vendor', 'Distributor disputes — asserts site commissioning fault; OEM escalation', '2026-04-12 10:00:00'),
('veev_010_d', 'vesc_010', 'vendor_escalation.escalated_to_oem', 'vendor_decision', 'escalated_to_oem', 'esums_om_lead', 'operator', 'Escalated to Growatt OEM', '2026-04-15 09:00:00'),
('veev_010_e', 'vesc_010', 'vendor_escalation.oem_field_investigation', 'escalated_to_oem', 'oem_field_investigation', 'growatt_oem_eng', 'oem', 'OEM forensic — relay weld + thermal event analysis', '2026-04-22 10:00:00'),
('veev_010_f', 'vesc_010', 'vendor_escalation.oem_decision', 'oem_field_investigation', 'oem_decision', 'growatt_oem_eng', 'oem', 'OEM determination: no manufacturing defect — attributes to DC over-sizing. Esums rejects.', '2026-05-02 15:00:00'),
('veev_010_g', 'vesc_010', 'vendor_escalation.arbitration', 'oem_decision', 'arbitration', 'esums_om_lead', 'operator', 'Liability disputed → AFSA arbitration AFSA-ARB-2026-CSC-0014; independent forensic ordered', '2026-05-18 11:00:00');
