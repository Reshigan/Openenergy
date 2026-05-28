-- Wave 34 — Grid CSC-1 Load Curtailment seed data
-- 10 prod-realistic cases across 10 of 11 states + 4 NERSA stages + 5 customer categories.
-- Real Eskom load-shedding history (2023 Stage 6, 2024 mining curtailment, 2025/26 spot events).
-- Cross-wave provenance: W13 dispatch nominations (BRP under-delivery), W18 emergency outages.

-- 1) instruction_issued — Stage 2 routine eThekwini Metro distribution
INSERT OR IGNORE INTO oe_load_curtailment (
  id, case_number,
  so_party_id, so_party_name, customer_party_id, customer_party_name,
  customer_category, facility_name, facility_province,
  load_shed_stage, national_shed_gw, target_mw, duration_hours,
  grid_code_section, instruction_ref,
  chain_status, instruction_issued_at, sla_deadline_at, created_by
) VALUES (
  'lc_001', 'LC-2026-0001',
  'so_eskom', 'Eskom System Operator',
  'ethekwini_metro', 'eThekwini Metropolitan Municipality',
  'distribution', 'eThekwini distribution intake', 'KwaZulu-Natal',
  'stage_1_2', 1.5, 120, 2.0,
  'CSC-1', 'NERSA-INSTR-2026-LC001',
  'instruction_issued', '2026-05-28 14:00:00', '2026-05-28 15:00:00', 'system'
);

-- 2) acknowledged — Stage 2 Anglo American Sishen mining
INSERT OR IGNORE INTO oe_load_curtailment (
  id, case_number,
  so_party_id, so_party_name, customer_party_id, customer_party_name,
  customer_category, facility_name, facility_province,
  load_shed_stage, national_shed_gw, target_mw, duration_hours,
  grid_code_section, instruction_ref, acknowledgement_ref,
  chain_status, instruction_issued_at, acknowledged_at, sla_deadline_at, created_by
) VALUES (
  'lc_002', 'LC-2026-0002',
  'so_eskom', 'Eskom System Operator',
  'anglo_sishen', 'Anglo American Kumba Sishen Iron Ore (Pty) Ltd',
  'mining', 'Sishen open-pit haulage + beneficiation', 'Northern Cape',
  'stage_1_2', 1.8, 85, 3.0,
  'CSC-1', 'NERSA-INSTR-2026-LC002', 'ACK-2026-SISHEN-001',
  'acknowledged', '2026-05-28 11:30:00', '2026-05-28 11:42:00', '2026-05-28 13:30:00', 'system'
);

-- 3) curtailment_started — Stage 2 CCT distribution
INSERT OR IGNORE INTO oe_load_curtailment (
  id, case_number,
  so_party_id, so_party_name, customer_party_id, customer_party_name,
  customer_category, facility_name, facility_province,
  load_shed_stage, national_shed_gw, target_mw, duration_hours,
  grid_code_section, instruction_ref, acknowledgement_ref,
  chain_status, instruction_issued_at, acknowledged_at, curtailment_started_at,
  sla_deadline_at, created_by
) VALUES (
  'lc_003', 'LC-2026-0003',
  'so_eskom', 'Eskom System Operator',
  'cct_metro', 'City of Cape Town Metropolitan Municipality',
  'distribution', 'CCT distribution intakes (block rotation)', 'Western Cape',
  'stage_1_2', 1.2, 150, 2.5,
  'CSC-1', 'NERSA-INSTR-2026-LC003', 'ACK-2026-CCT-005',
  'curtailment_started', '2026-05-27 18:00:00', '2026-05-27 18:08:00', '2026-05-27 18:30:00',
  '2026-05-27 20:30:00', 'system'
);

-- 4) target_achieved — Stage 4 City of Joburg metro
INSERT OR IGNORE INTO oe_load_curtailment (
  id, case_number,
  so_party_id, so_party_name, customer_party_id, customer_party_name,
  customer_category, facility_name, facility_province,
  load_shed_stage, national_shed_gw, target_mw, actual_shed_mw, variance_pct, duration_hours,
  grid_code_section, instruction_ref, acknowledgement_ref,
  chain_status, instruction_issued_at, acknowledged_at, curtailment_started_at,
  target_achieved_at, created_by
) VALUES (
  'lc_004', 'LC-2026-0004',
  'so_eskom', 'Eskom System Operator',
  'coj_metro', 'City of Johannesburg Metropolitan Municipality',
  'metro', 'CoJ distribution Block A/B rotation', 'Gauteng',
  'stage_3_4', 3.5, 380, 392, 3.16, 4.0,
  'CSC-1', 'NERSA-INSTR-2026-LC004', 'ACK-2026-COJ-014',
  'target_achieved', '2026-05-27 06:00:00', '2026-05-27 06:14:00', '2026-05-27 06:45:00',
  '2026-05-27 07:30:00', 'system'
);

-- 5) partial_compliance — Stage 4 ArcelorMittal Saldanha (penalty)
INSERT OR IGNORE INTO oe_load_curtailment (
  id, case_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  so_party_id, so_party_name, customer_party_id, customer_party_name,
  customer_category, facility_name, facility_province,
  load_shed_stage, national_shed_gw, target_mw, actual_shed_mw, variance_pct, duration_hours,
  grid_code_section, instruction_ref, acknowledgement_ref, partial_ref,
  penalty_zar, penalty_basis, partial_basis,
  chain_status, instruction_issued_at, acknowledged_at, curtailment_started_at,
  partial_compliance_at, created_by
) VALUES (
  'lc_005', 'LC-2026-0005',
  'dispatch.under_delivery', 'dispatch_nomination', 'dn_2026_0237', 'W13',
  'so_eskom', 'Eskom System Operator',
  'arcelor_saldanha', 'ArcelorMittal South Africa (Saldanha Works)',
  'large_industrial', 'Saldanha rolling mill + EAF', 'Western Cape',
  'stage_3_4', 4.0, 220, 138, -37.27, 6.0,
  'CSC-1', 'NERSA-INSTR-2026-LC005', 'ACK-2026-AMSA-009', 'PARTIAL-2026-AMSA-009',
  4500000, 'NERSA Grid Code §C-3.4 — proportional penalty R50k/MW shortfall × 82MW + 24h non-compliance loading',
  'EAF tap-out timing constraint — only 138MW achievable vs 220MW instructed. EAF mid-melt cycle could not be safely interrupted.',
  'partial_compliance', '2026-05-26 09:00:00', '2026-05-26 09:14:00', '2026-05-26 09:45:00',
  '2026-05-26 15:45:00', 'system'
);

-- 6) instruction_lifted — Stage 4 Sasol Secunda
INSERT OR IGNORE INTO oe_load_curtailment (
  id, case_number,
  so_party_id, so_party_name, customer_party_id, customer_party_name,
  customer_category, facility_name, facility_province,
  load_shed_stage, national_shed_gw, target_mw, actual_shed_mw, variance_pct, duration_hours,
  grid_code_section, instruction_ref, acknowledgement_ref,
  chain_status, instruction_issued_at, acknowledged_at, curtailment_started_at,
  target_achieved_at, instruction_lifted_at, sla_deadline_at, created_by
) VALUES (
  'lc_006', 'LC-2026-0006',
  'so_eskom', 'Eskom System Operator',
  'sasol_secunda', 'Sasol South Africa Ltd (Secunda CTL)',
  'large_industrial', 'Secunda gas-to-liquids — auxiliaries + admin block', 'Mpumalanga',
  'stage_3_4', 3.2, 180, 184, 2.22, 5.0,
  'CSC-1', 'NERSA-INSTR-2026-LC006', 'ACK-2026-SASOL-007',
  'instruction_lifted', '2026-05-25 17:00:00', '2026-05-25 17:10:00', '2026-05-25 17:25:00',
  '2026-05-25 18:00:00', '2026-05-25 22:00:00', '2026-06-01 22:00:00', 'system'
);

-- 7) reconciled — Stage 6 Mooi River wind embedded generator (W13 cross-ref)
INSERT OR IGNORE INTO oe_load_curtailment (
  id, case_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  so_party_id, so_party_name, customer_party_id, customer_party_name,
  customer_category, facility_name, facility_province,
  load_shed_stage, national_shed_gw, target_mw, actual_shed_mw, variance_pct, duration_hours,
  grid_code_section, instruction_ref, acknowledgement_ref, metering_reconcile_ref,
  chain_status, instruction_issued_at, acknowledged_at, curtailment_started_at,
  target_achieved_at, instruction_lifted_at, reconciled_at, sla_deadline_at, created_by
) VALUES (
  'lc_007', 'LC-2026-0007',
  'outage.unplanned', 'outage', 'po_2026_0091', 'W18',
  'so_eskom', 'Eskom System Operator',
  'ipp_mooi_river_wind', 'Mooi River Wind Power (Pty) Ltd',
  'embedded_generator', 'Mooi River Wind Farm (90MW)', 'KwaZulu-Natal',
  'stage_5_6', 5.5, 60, 62, 3.33, 4.5,
  'CSC-1', 'NERSA-INSTR-2026-LC007', 'ACK-2026-MRW-003', 'METER-RECON-2026-MRW-LC007',
  'reconciled', '2026-05-22 14:00:00', '2026-05-22 14:08:00', '2026-05-22 14:20:00',
  '2026-05-22 14:50:00', '2026-05-22 18:30:00', '2026-05-25 10:00:00',
  '2026-06-22 10:00:00', 'system'
);

-- 8) post_mortem — Stage 6 South32 Hillside Aluminium
INSERT OR IGNORE INTO oe_load_curtailment (
  id, case_number,
  so_party_id, so_party_name, customer_party_id, customer_party_name,
  customer_category, facility_name, facility_province,
  load_shed_stage, national_shed_gw, target_mw, actual_shed_mw, variance_pct, duration_hours,
  grid_code_section, instruction_ref, acknowledgement_ref, metering_reconcile_ref, post_mortem_ref,
  post_mortem_findings,
  chain_status, instruction_issued_at, acknowledged_at, curtailment_started_at,
  target_achieved_at, instruction_lifted_at, reconciled_at, post_mortem_opened_at,
  sla_deadline_at, created_by
) VALUES (
  'lc_008', 'LC-2026-0008',
  'so_eskom', 'Eskom System Operator',
  'south32_hillside', 'South32 Hillside Aluminium Smelter',
  'large_industrial', 'Hillside potlines 1-3', 'KwaZulu-Natal',
  'stage_5_6', 6.0, 320, 318, -0.63, 8.0,
  'CSC-1', 'NERSA-INSTR-2026-LC008', 'ACK-2026-S32-002', 'METER-RECON-2026-S32',
  'PM-2026-S32-HILLSIDE',
  'Curtailment achieved within tolerance. Identified risk: pot-line freeze threshold at >12h curtailment — Eskom + S32 agreed 8h hard ceiling for Stage 6 events. Pre-curtailment alert lead-time increased from 30min to 60min.',
  'post_mortem', '2026-05-18 16:00:00', '2026-05-18 16:14:00', '2026-05-18 16:35:00',
  '2026-05-18 17:30:00', '2026-05-19 00:00:00', '2026-05-21 14:00:00', '2026-05-25 09:00:00',
  '2026-06-25 09:00:00', 'admin'
);

-- 9) closed — Stage 8 CoJ + full happy path (catastrophic event)
INSERT OR IGNORE INTO oe_load_curtailment (
  id, case_number,
  so_party_id, so_party_name, customer_party_id, customer_party_name,
  customer_category, facility_name, facility_province,
  load_shed_stage, national_shed_gw, target_mw, actual_shed_mw, variance_pct, duration_hours,
  grid_code_section, instruction_ref, acknowledgement_ref, metering_reconcile_ref, post_mortem_ref,
  post_mortem_findings,
  chain_status, instruction_issued_at, acknowledged_at, curtailment_started_at,
  target_achieved_at, instruction_lifted_at, reconciled_at, post_mortem_opened_at,
  closed_at, created_by
) VALUES (
  'lc_009', 'LC-2026-0009',
  'so_eskom', 'Eskom System Operator',
  'coj_metro', 'City of Johannesburg Metropolitan Municipality',
  'metro', 'CoJ Stage 8 emergency rotation — all blocks A-D', 'Gauteng',
  'stage_7_8', 7.5, 850, 871, 2.47, 4.0,
  'CSC-1', 'NERSA-INSTR-2025-LC009', 'ACK-2025-COJ-S8-001', 'METER-RECON-2025-COJ-S8',
  'PM-2025-COJ-STAGE-8-EVENT',
  'Stage 8 invoked 23 Dec 2025 — grid collapse risk after Tutuka U2+U3 trip. CoJ curtailed within 12 min of instruction. NERSA Council formal review concluded compliance; commendation issued. Recommendations: Stage 7+ pre-staging protocols + dedicated dispatcher line to all metro SOC.',
  'closed', '2025-12-23 02:00:00', '2025-12-23 02:04:00', '2025-12-23 02:12:00',
  '2025-12-23 02:45:00', '2025-12-23 06:00:00', '2025-12-28 12:00:00', '2026-01-05 09:00:00',
  '2026-02-15 16:00:00', 'admin'
);

-- 10) refused — Stage 8 Glencore Mototolo platinum (refused, tribunal)
INSERT OR IGNORE INTO oe_load_curtailment (
  id, case_number,
  so_party_id, so_party_name, customer_party_id, customer_party_name,
  customer_category, facility_name, facility_province,
  load_shed_stage, national_shed_gw, target_mw, duration_hours,
  grid_code_section, instruction_ref, refusal_ref,
  penalty_zar, penalty_basis, refusal_grounds, tribunal_case_ref,
  chain_status, instruction_issued_at, refused_at, created_by
) VALUES (
  'lc_010', 'LC-2026-0010',
  'so_eskom', 'Eskom System Operator',
  'glencore_mototolo', 'Glencore Mototolo Platinum Mine',
  'mining', 'Mototolo concentrator + shaft hoist', 'Mpumalanga',
  'stage_7_8', 8.0, 95, 6.0,
  'CSC-1', 'NERSA-INSTR-2025-LC010', 'REF-2025-MOTOTOLO-001',
  18500000, 'NERSA Grid Code §C-3.5 — refusal of emergency directive during Stage 8: R150k/MW × 95MW × 1.3 escalation multiplier',
  'Mototolo refused curtailment citing: G1) underground shaft personnel safety — 1247 personnel on shift, hoist + ventilation cannot be safely cycled with <2h notice. G2) Force majeure under existing CSC bilateral. G3) Stage 8 instruction issued 03:42 SAST — no advance warning.',
  'NERSA-TRIBUNAL-2025-CSC-0003',
  'refused', '2025-12-23 03:42:00', '2025-12-23 03:51:00', 'system'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- lc_001 events
INSERT OR IGNORE INTO oe_load_curtailment_events (id, curtailment_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lce_001_a', 'lc_001', 'load_curtailment.instruction_issued', null, 'instruction_issued', 'so_eskom_dispatcher', 'grid_so', 'Stage 2 instruction issued — 120MW for 2h', '2026-05-28 14:00:00');

-- lc_002 events
INSERT OR IGNORE INTO oe_load_curtailment_events (id, curtailment_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lce_002_a', 'lc_002', 'load_curtailment.instruction_issued', null, 'instruction_issued', 'so_eskom_dispatcher', 'grid_so', 'Stage 2 instruction — Sishen 85MW for 3h', '2026-05-28 11:30:00'),
('lce_002_b', 'lc_002', 'load_curtailment.acknowledged', 'instruction_issued', 'acknowledged', 'sishen_control_room', 'customer', 'Ack ACK-2026-SISHEN-001 — preparing haulage staging', '2026-05-28 11:42:00');

-- lc_003 events
INSERT OR IGNORE INTO oe_load_curtailment_events (id, curtailment_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lce_003_a', 'lc_003', 'load_curtailment.instruction_issued', null, 'instruction_issued', 'so_eskom_dispatcher', 'grid_so', 'Stage 2 evening peak — CCT 150MW for 2.5h', '2026-05-27 18:00:00'),
('lce_003_b', 'lc_003', 'load_curtailment.acknowledged', 'instruction_issued', 'acknowledged', 'cct_control', 'customer', 'Ack received', '2026-05-27 18:08:00'),
('lce_003_c', 'lc_003', 'load_curtailment.curtailment_started', 'acknowledged', 'curtailment_started', 'cct_control', 'customer', 'Block A rotation commenced', '2026-05-27 18:30:00');

-- lc_004 events
INSERT OR IGNORE INTO oe_load_curtailment_events (id, curtailment_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lce_004_a', 'lc_004', 'load_curtailment.instruction_issued', null, 'instruction_issued', 'so_eskom_dispatcher', 'grid_so', 'Stage 4 morning peak — CoJ 380MW for 4h', '2026-05-27 06:00:00'),
('lce_004_b', 'lc_004', 'load_curtailment.acknowledged', 'instruction_issued', 'acknowledged', 'coj_socc', 'customer', 'Acknowledged', '2026-05-27 06:14:00'),
('lce_004_c', 'lc_004', 'load_curtailment.curtailment_started', 'acknowledged', 'curtailment_started', 'coj_socc', 'customer', 'Block A+B rotation', '2026-05-27 06:45:00'),
('lce_004_d', 'lc_004', 'load_curtailment.target_achieved', 'curtailment_started', 'target_achieved', 'coj_socc', 'customer', 'Target met — 392MW shed (target 380MW)', '2026-05-27 07:30:00');

-- lc_005 events
INSERT OR IGNORE INTO oe_load_curtailment_events (id, curtailment_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lce_005_a', 'lc_005', 'load_curtailment.instruction_issued', null, 'instruction_issued', 'so_eskom_dispatcher', 'grid_so', 'Stage 4 instruction — Saldanha 220MW for 6h. Linked to W13 dn_2026_0237 BRP under-delivery.', '2026-05-26 09:00:00'),
('lce_005_b', 'lc_005', 'load_curtailment.acknowledged', 'instruction_issued', 'acknowledged', 'amsa_dispatcher', 'customer', 'Ack — preparing EAF taper', '2026-05-26 09:14:00'),
('lce_005_c', 'lc_005', 'load_curtailment.curtailment_started', 'acknowledged', 'curtailment_started', 'amsa_dispatcher', 'customer', 'EAF stepdown initiated', '2026-05-26 09:45:00'),
('lce_005_d', 'lc_005', 'load_curtailment.partial_compliance', 'curtailment_started', 'partial_compliance', 'amsa_dispatcher', 'customer', 'Only 138MW of 220MW achieved — EAF mid-melt safety constraint. R4.5M proportional penalty.', '2026-05-26 15:45:00');

-- lc_006 events
INSERT OR IGNORE INTO oe_load_curtailment_events (id, curtailment_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lce_006_a', 'lc_006', 'load_curtailment.instruction_issued', null, 'instruction_issued', 'so_eskom_dispatcher', 'grid_so', 'Stage 4 instruction — Sasol 180MW for 5h', '2026-05-25 17:00:00'),
('lce_006_b', 'lc_006', 'load_curtailment.acknowledged', 'instruction_issued', 'acknowledged', 'sasol_control', 'customer', 'Ack received', '2026-05-25 17:10:00'),
('lce_006_c', 'lc_006', 'load_curtailment.curtailment_started', 'acknowledged', 'curtailment_started', 'sasol_control', 'customer', 'Auxiliaries + admin block off', '2026-05-25 17:25:00'),
('lce_006_d', 'lc_006', 'load_curtailment.target_achieved', 'curtailment_started', 'target_achieved', 'sasol_control', 'customer', 'Target achieved — 184MW shed', '2026-05-25 18:00:00'),
('lce_006_e', 'lc_006', 'load_curtailment.instruction_lifted', 'target_achieved', 'instruction_lifted', 'so_eskom_dispatcher', 'grid_so', 'System frequency recovered to 50.02Hz — instruction lifted', '2026-05-25 22:00:00');

-- lc_007 events
INSERT OR IGNORE INTO oe_load_curtailment_events (id, curtailment_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lce_007_a', 'lc_007', 'load_curtailment.instruction_issued', null, 'instruction_issued', 'so_eskom_dispatcher', 'grid_so', 'Stage 6 instruction — Mooi River wind 60MW. Triggered by W18 Tutuka U3 emergency outage po_2026_0091.', '2026-05-22 14:00:00'),
('lce_007_b', 'lc_007', 'load_curtailment.acknowledged', 'instruction_issued', 'acknowledged', 'mrw_scada', 'customer', 'Ack — preparing curtailment via SCADA', '2026-05-22 14:08:00'),
('lce_007_c', 'lc_007', 'load_curtailment.curtailment_started', 'acknowledged', 'curtailment_started', 'mrw_scada', 'customer', 'Curtailment commenced via SCADA setpoint', '2026-05-22 14:20:00'),
('lce_007_d', 'lc_007', 'load_curtailment.target_achieved', 'curtailment_started', 'target_achieved', 'mrw_scada', 'customer', '62MW curtailed — target met', '2026-05-22 14:50:00'),
('lce_007_e', 'lc_007', 'load_curtailment.instruction_lifted', 'target_achieved', 'instruction_lifted', 'so_eskom_dispatcher', 'grid_so', 'Instruction lifted — Tutuka U3 returned to service', '2026-05-22 18:30:00'),
('lce_007_f', 'lc_007', 'load_curtailment.reconciled', 'instruction_lifted', 'reconciled', 'so_metering', 'grid_so', 'Metering reconcile METER-RECON-2026-MRW-LC007 — 62MW × 4.5h confirmed via half-hour data', '2026-05-25 10:00:00');

-- lc_008 events
INSERT OR IGNORE INTO oe_load_curtailment_events (id, curtailment_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lce_008_a', 'lc_008', 'load_curtailment.instruction_issued', null, 'instruction_issued', 'so_eskom_dispatcher', 'grid_so', 'Stage 6 instruction — Hillside 320MW for 8h', '2026-05-18 16:00:00'),
('lce_008_b', 'lc_008', 'load_curtailment.acknowledged', 'instruction_issued', 'acknowledged', 'hillside_control', 'customer', 'Ack — pot-line stepdown initiated', '2026-05-18 16:14:00'),
('lce_008_c', 'lc_008', 'load_curtailment.curtailment_started', 'acknowledged', 'curtailment_started', 'hillside_control', 'customer', 'Pot-lines 1-3 stepdown', '2026-05-18 16:35:00'),
('lce_008_d', 'lc_008', 'load_curtailment.target_achieved', 'curtailment_started', 'target_achieved', 'hillside_control', 'customer', '318MW shed — within tolerance', '2026-05-18 17:30:00'),
('lce_008_e', 'lc_008', 'load_curtailment.instruction_lifted', 'target_achieved', 'instruction_lifted', 'so_eskom_dispatcher', 'grid_so', 'System recovered — instruction lifted', '2026-05-19 00:00:00'),
('lce_008_f', 'lc_008', 'load_curtailment.reconciled', 'instruction_lifted', 'reconciled', 'so_metering', 'grid_so', 'Metering reconciled', '2026-05-21 14:00:00'),
('lce_008_g', 'lc_008', 'load_curtailment.post_mortem_opened', 'reconciled', 'post_mortem', 'nersa_off_1', 'regulator', 'Post-mortem PM-2026-S32-HILLSIDE opened — pot-line freeze risk review', '2026-05-25 09:00:00');

-- lc_009 events (full happy path Stage 8)
INSERT OR IGNORE INTO oe_load_curtailment_events (id, curtailment_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lce_009_a', 'lc_009', 'load_curtailment.instruction_issued', null, 'instruction_issued', 'so_eskom_dispatcher', 'grid_so', 'STAGE 8 emergency — CoJ 850MW. Tutuka U2+U3 trip, frequency 49.61Hz.', '2025-12-23 02:00:00'),
('lce_009_b', 'lc_009', 'load_curtailment.acknowledged', 'instruction_issued', 'acknowledged', 'coj_socc_oncall', 'customer', 'Stage 8 ack — emergency rotation initiating', '2025-12-23 02:04:00'),
('lce_009_c', 'lc_009', 'load_curtailment.curtailment_started', 'acknowledged', 'curtailment_started', 'coj_socc_oncall', 'customer', 'All blocks A-D off', '2025-12-23 02:12:00'),
('lce_009_d', 'lc_009', 'load_curtailment.target_achieved', 'curtailment_started', 'target_achieved', 'coj_socc_oncall', 'customer', '871MW shed — target exceeded', '2025-12-23 02:45:00'),
('lce_009_e', 'lc_009', 'load_curtailment.instruction_lifted', 'target_achieved', 'instruction_lifted', 'so_eskom_dispatcher', 'grid_so', 'Frequency recovered to 49.97Hz — instruction lifted', '2025-12-23 06:00:00'),
('lce_009_f', 'lc_009', 'load_curtailment.reconciled', 'instruction_lifted', 'reconciled', 'so_metering', 'grid_so', 'Metering reconciled — 871MW × 4h verified', '2025-12-28 12:00:00'),
('lce_009_g', 'lc_009', 'load_curtailment.post_mortem_opened', 'reconciled', 'post_mortem', 'nersa_council', 'regulator', 'Council post-mortem PM-2025-COJ-STAGE-8-EVENT — Stage 8 grid event review', '2026-01-05 09:00:00'),
('lce_009_h', 'lc_009', 'load_curtailment.post_mortem_closed', 'post_mortem', 'closed', 'nersa_chair', 'regulator', 'Council closed PM — commendation issued; Stage 7+ pre-staging protocols recommended', '2026-02-15 16:00:00');

-- lc_010 events
INSERT OR IGNORE INTO oe_load_curtailment_events (id, curtailment_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('lce_010_a', 'lc_010', 'load_curtailment.instruction_issued', null, 'instruction_issued', 'so_eskom_dispatcher', 'grid_so', 'STAGE 8 emergency — Mototolo 95MW. Frequency 49.58Hz, grid collapse risk.', '2025-12-23 03:42:00'),
('lce_010_b', 'lc_010', 'load_curtailment.refused', 'instruction_issued', 'refused', 'mototolo_mine_manager', 'customer', 'Refused — 1247 personnel on underground shift, shaft hoist + ventilation cannot be cycled with <2h notice. Force majeure invoked. Tribunal NERSA-TRIBUNAL-2025-CSC-0003 referral. R18.5M penalty pending.', '2025-12-23 03:51:00');
