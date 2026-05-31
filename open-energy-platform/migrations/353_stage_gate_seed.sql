-- Wave 131 - Stage Gate seed data.
--
-- 16 rows covering all 12 forward + 4 branch states.
-- Replay-safe: INSERT OR IGNORE.
--
-- SIGNATURE row sg-016: mega_capex DG3 gate_rejected
--   R2.5bn project terminated at sanction gate.
--   All 5 floor flags raised.
--   All 5 bridges populated.
--   regulator_ref = W131-SG-REJECT-2026-0016
--   regulator_crossed_at = 2026-05-31T15:00:00Z
--
-- SLA verification:
--   sg-001 low_capex gate_proposed sla_target_hours=168 (7d)
--   sg-004 equator_cat_a gate_proposed sla_target_hours=2160 (90d)

INSERT OR IGNORE INTO oe_stage_gates (
  id, gate_index, project_id, title,
  capex_zar, capex_band, equator_category, debt_sized,
  current_tier,
  floor_equator_cat_a, floor_fid_committed, floor_nersa_notifiable,
  floor_debt_sized, floor_shareholder_consent_required,
  w19_procurement_ref, w20_cod_ref, w21_drawdown_ref, w113_evm_ref, w118_block_ref,
  decision, conditions_payload, evidence_payload,
  ie_letter_attached_bool_live, cab_minutes_attached_bool_live, board_minutes_attached_bool_live,
  chain_status, gate_proposed_at,
  sla_target_hours, sla_deadline_at, sla_breached,
  is_reportable, regulator_ref, regulator_crossed_at,
  created_by, created_at, updated_at
) VALUES
-- sg-001: low_capex DG0 gate_proposed (SLA verify: 168h)
('sg-001', 0, 'proj-001', 'DG0 Concept — Limpopo 10MW Solar',
  50000000, 'low', 'cat_c', 0, 'low_capex',
  0,0,1,0,0,
  NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  0, 0, 0,
  'gate_proposed', '2026-05-25T08:00:00Z',
  168, '2026-06-01T08:00:00Z', 0,
  0, NULL, NULL,
  'admin', '2026-05-25T08:00:00Z', '2026-05-25T08:00:00Z'),

-- sg-002: low_capex DG1 evidence_compiled
('sg-002', 1, 'proj-001', 'DG1 Feasibility — Limpopo 10MW Solar',
  50000000, 'low', 'cat_c', 0, 'low_capex',
  0,0,0,0,0,
  NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  0, 0, 0,
  'evidence_compiled', '2026-05-20T08:00:00Z',
  168, '2026-05-27T08:00:00Z', 0,
  0, NULL, NULL,
  'admin', '2026-05-20T08:00:00Z', '2026-05-21T09:00:00Z'),

-- sg-003: medium_capex DG0 ie_reviewed
('sg-003', 0, 'proj-002', 'DG0 Concept — KZN 200MW Wind',
  200000000, 'medium', 'cat_b', 0, 'medium_capex',
  0,0,1,0,0,
  NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  1, 0, 0,
  'ie_reviewed', '2026-05-15T08:00:00Z',
  336, '2026-05-29T08:00:00Z', 0,
  0, NULL, NULL,
  'admin', '2026-05-15T08:00:00Z', '2026-05-17T10:00:00Z'),

-- sg-004: equator_cat_a DG0 gate_proposed (SLA verify: 2160h)
('sg-004', 0, 'proj-003', 'DG0 Concept — Northern Cape 600MW CSP (Cat A)',
  800000000, 'high', 'cat_a', 0, 'equator_cat_a',
  1,0,1,0,1,
  NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  0, 0, 0,
  'gate_proposed', '2026-05-01T08:00:00Z',
  2160, '2026-07-30T08:00:00Z', 0,
  0, NULL, NULL,
  'admin', '2026-05-01T08:00:00Z', '2026-05-01T08:00:00Z'),

-- sg-005: medium_capex DG1 lender_reviewed
('sg-005', 1, 'proj-002', 'DG1 Feasibility — KZN 200MW Wind',
  200000000, 'medium', 'cat_b', 0, 'medium_capex',
  0,0,0,0,0,
  'proc-001', NULL, NULL, 'evm-001', NULL,
  NULL, NULL, NULL,
  1, 0, 0,
  'lender_reviewed', '2026-05-10T08:00:00Z',
  336, '2026-05-24T08:00:00Z', 0,
  0, NULL, NULL,
  'admin', '2026-05-10T08:00:00Z', '2026-05-12T11:00:00Z'),

-- sg-006: high_capex DG2 board_briefing_circulated
('sg-006', 2, 'proj-004', 'DG2 FEED — Gauteng 1GW Battery Storage',
  1500000000, 'high', 'cat_b', 1, 'high_capex',
  0,0,0,1,0,
  'proc-002', NULL, NULL, 'evm-002', NULL,
  NULL, NULL, NULL,
  1, 0, 0,
  'board_briefing_circulated', '2026-04-20T08:00:00Z',
  720, '2026-05-20T08:00:00Z', 0,
  0, NULL, NULL,
  'admin', '2026-04-20T08:00:00Z', '2026-04-25T14:00:00Z'),

-- sg-007: high_capex DG2 cab_held
('sg-007', 2, 'proj-005', 'DG2 FEED — WC 750MW Offshore Wind',
  1200000000, 'high', 'cat_b', 1, 'high_capex',
  0,0,0,1,0,
  'proc-003', NULL, NULL, 'evm-003', NULL,
  NULL, NULL, NULL,
  1, 1, 0,
  'cab_held', '2026-04-10T08:00:00Z',
  720, '2026-05-10T08:00:00Z', 0,
  0, NULL, NULL,
  'admin', '2026-04-10T08:00:00Z', '2026-04-15T16:00:00Z'),

-- sg-008: mega_capex DG2 conditions_set
('sg-008', 2, 'proj-006', 'DG2 FEED — Mpumalanga 2.5GW Coal-to-Solar IPP',
  2500000000, 'mega', 'cat_b', 1, 'mega_capex',
  0,0,0,1,1,
  'proc-004', NULL, 'draw-001', 'evm-004', NULL,
  NULL, '["E&S ESAP signed","grid-study approved"]', NULL,
  1, 1, 1,
  'conditions_set', '2026-03-15T08:00:00Z',
  1440, '2026-05-24T08:00:00Z', 0,
  0, NULL, NULL,
  'admin', '2026-03-15T08:00:00Z', '2026-04-01T09:00:00Z'),

-- sg-009: medium_capex DG1 gate_conditional_pass (W131 SIGNATURE branch)
('sg-009', 1, 'proj-007', 'DG1 Feasibility — FS 300MW Wind (conditional)',
  350000000, 'medium', 'cat_b', 0, 'medium_capex',
  0,0,0,0,0,
  NULL, NULL, NULL, 'evm-005', NULL,
  'conditional_approved', '["ESAP v2 submission within 30d","IE sign-off on geology report"]', NULL,
  1, 1, 1,
  'gate_conditional_pass', '2026-04-05T08:00:00Z',
  336, '2026-04-19T08:00:00Z', 0,
  0, NULL, NULL,
  'admin', '2026-04-05T08:00:00Z', '2026-04-10T10:00:00Z'),

-- sg-010: high_capex DG3 decision_recorded
('sg-010', 3, 'proj-005', 'DG3 Sanction FID — WC 750MW Offshore Wind',
  1200000000, 'high', 'cat_b', 1, 'high_capex',
  0,1,0,1,0,
  'proc-003', NULL, 'draw-002', 'evm-006', 'blk-010',
  'approved', NULL, '{"ie_letter":"r2/ie-010.pdf","grid_ref":"NRS-2026-00F"}',
  1, 1, 1,
  'decision_recorded', '2026-03-01T08:00:00Z',
  720, '2026-03-31T08:00:00Z', 0,
  1, 'W131-SG-DG3-2026-0010', '2026-03-01T15:00:00Z',
  'admin', '2026-03-01T08:00:00Z', '2026-03-05T11:00:00Z'),

-- sg-011: mega_capex DG3 conditions_satisfied
('sg-011', 3, 'proj-008', 'DG3 Sanction FID — Limpopo 2GW HVDC',
  2200000000, 'mega', 'cat_b', 1, 'mega_capex',
  0,1,0,1,1,
  'proc-005', NULL, 'draw-003', 'evm-007', 'blk-011',
  'approved', NULL, NULL,
  1, 1, 1,
  'conditions_satisfied', '2026-02-01T08:00:00Z',
  1440, '2026-03-02T08:00:00Z', 0,
  1, 'W131-SG-DG3-2026-0011', '2026-02-01T15:00:00Z',
  'admin', '2026-02-01T08:00:00Z', '2026-03-01T09:00:00Z'),

-- sg-012: low_capex DG4 gate_passed
('sg-012', 4, 'proj-009', 'DG4 COD — Limpopo 10MW Solar Phase 2',
  60000000, 'low', 'cat_c', 1, 'low_capex',
  0,1,1,1,0,
  NULL, 'cod-001', NULL, NULL, 'blk-012',
  'approved', NULL, NULL,
  1, 1, 1,
  'gate_passed', '2026-01-15T08:00:00Z',
  168, '2026-01-22T08:00:00Z', 0,
  1, 'W131-SG-DG4-2026-0012', '2026-01-15T15:00:00Z',
  'admin', '2026-01-15T08:00:00Z', '2026-01-20T10:00:00Z'),

-- sg-013: medium_capex DG4 notified_downstream
('sg-013', 4, 'proj-010', 'DG4 COD — KZN 200MW Wind Phase 1',
  210000000, 'medium', 'cat_b', 1, 'medium_capex',
  0,1,1,1,0,
  NULL, 'cod-002', 'draw-004', 'evm-008', 'blk-013',
  'approved', NULL, NULL,
  1, 1, 1,
  'notified_downstream', '2025-12-01T08:00:00Z',
  336, '2025-12-15T08:00:00Z', 0,
  1, 'W131-SG-DG4-2026-0013', '2025-12-01T15:00:00Z',
  'admin', '2025-12-01T08:00:00Z', '2025-12-05T11:00:00Z'),

-- sg-014: low_capex DG0 archived
('sg-014', 0, 'proj-011', 'DG0 Concept — Archived Small Solar',
  45000000, 'low', 'cat_c', 0, 'low_capex',
  0,0,1,0,0,
  NULL, NULL, NULL, NULL, NULL,
  'approved', NULL, NULL,
  0, 0, 0,
  'archived', '2025-10-01T08:00:00Z',
  168, '2025-10-08T08:00:00Z', 0,
  0, NULL, NULL,
  'admin', '2025-10-01T08:00:00Z', '2025-10-10T09:00:00Z'),

-- sg-015: high_capex DG2 gate_deferred (SOFT)
('sg-015', 2, 'proj-012', 'DG2 FEED — NW 900MW Solar (deferred)',
  900000000, 'high', 'cat_b', 0, 'high_capex',
  0,0,0,0,0,
  'proc-006', NULL, NULL, 'evm-009', NULL,
  NULL, NULL, NULL,
  1, 0, 0,
  'gate_deferred', '2026-04-01T08:00:00Z',
  720, '2026-05-01T08:00:00Z', 0,
  0, NULL, NULL,
  'admin', '2026-04-01T08:00:00Z', '2026-04-15T14:00:00Z'),

-- sg-016: SIGNATURE ROW — mega_capex DG3 gate_rejected
--   R2.5bn project terminated at sanction. All 5 floor flags raised.
--   All 5 bridges populated. regulator_ref = W131-SG-REJECT-2026-0016.
--   regulator_crossed_at = 2026-05-31T15:00:00Z (W131 SIGNATURE).
('sg-016', 3, 'proj-013', 'DG3 Sanction — Kakamas 2.5GW REIPPPP Bid TERMINATED',
  2500000000, 'mega', 'cat_b', 1, 'mega_capex',
  1,0,0,1,1,
  'proc-007', 'cod-003', 'draw-005', 'evm-010', 'blk-016',
  'rejected', NULL, '{"ie_letter":"r2/ie-016.pdf","bid_ref":"REIPPPP-BW6-2026-0042"}',
  1, 1, 1,
  'gate_rejected', '2026-05-28T08:00:00Z',
  1440, '2026-07-27T08:00:00Z', 0,
  1, 'W131-SG-REJECT-2026-0016', '2026-05-31T15:00:00Z',
  'admin', '2026-05-28T08:00:00Z', '2026-05-31T15:00:00Z');
