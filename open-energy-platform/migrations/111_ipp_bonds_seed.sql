-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 10 — IPP performance-bond expiry-cycle seed.
--
-- Six bonds spanning every expiry_status:
--   • bond_demo_green     — 200d to expiry           → green
--   • bond_demo_warning   — 49d to expiry            → warning   (cycle 0 notice)
--   • bond_demo_cycle1    — 19d to expiry            → cycle_1   (cycle 1 notice + 14d cure)
--   • bond_demo_cycle2    —  7d to expiry            → cycle_2   (cycle 2 notice + 7d cure)
--   • bond_demo_cycle3    —  2d to expiry            → cycle_3   (cycle 3 notice + immediate cure)
--   • bond_demo_escalated — 42d past expiry (active) → escalated (regulator inbox)
--
-- Notice rows mirror the per-cycle audit trail so the drill-down UI + regulator
-- inbox have content from launch.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO ipp_performance_bonds
  (id, project_id, bond_number, bond_type, issuer, beneficiary,
   face_value_zar, currency, issued_at, expiry_at, release_conditions,
   status, expiry_status,
   last_warning_at, last_cycle_1_at, last_cycle_2_at, last_cycle_3_at, last_escalated_at)
VALUES
  ('bond_demo_green', 'ip_001', 'PB-2024-001', 'performance', 'Standard Bank',
   'NERSA', 14250000, 'ZAR', '2024-06-01', '2026-12-15',
   'Released on 12 consecutive months of compliant operations',
   'active', 'green',
   NULL, NULL, NULL, NULL, NULL),

  ('bond_demo_warning', 'ip_002', 'PB-2024-002', 'performance', 'ABSA',
   'NERSA', 12800000, 'ZAR', '2024-07-15', '2026-07-15',
   'Released on PPA-end + 6 months warranty period',
   'active', 'warning',
   '2026-05-27T00:00:00.000Z', NULL, NULL, NULL, NULL),

  ('bond_demo_cycle1', 'ip_003', 'PB-2024-003', 'performance', 'Nedbank',
   'NERSA', 6750000, 'ZAR', '2024-06-15', '2026-06-15',
   'Released on commercial operations declaration',
   'active', 'cycle_1',
   '2026-04-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z', NULL, NULL, NULL),

  ('bond_demo_cycle2', 'ip_001', 'PB-2024-004', 'environmental_rehabilitation', 'FirstRand',
   'Dept Mineral Resources', 9500000, 'ZAR', '2024-06-03', '2026-06-03',
   'Released on closure audit + 5-year monitoring period',
   'active', 'cycle_2',
   '2026-02-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z', NULL, NULL),

  ('bond_demo_cycle3', 'ip_002', 'PB-2024-005', 'warranty', 'Investec',
   'EPC contractor', 4200000, 'ZAR', '2024-05-29', '2026-05-29',
   'Released on warranty period close + zero open defects',
   'active', 'cycle_3',
   '2026-02-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z', '2026-05-13T00:00:00.000Z', '2026-05-27T00:00:00.000Z', NULL),

  ('bond_demo_escalated', 'ip_003', 'PB-2024-006', 'advance_payment', 'Sanlam Surety',
   'IPP developer', 8100000, 'ZAR', '2024-04-15', '2026-04-15',
   'Released on first delivery milestone',
   'active', 'escalated',
   '2026-01-15T00:00:00.000Z', '2026-03-15T00:00:00.000Z', '2026-04-01T00:00:00.000Z', '2026-04-12T00:00:00.000Z', '2026-04-16T00:00:00.000Z');

-- Notices mirroring each bond's escalation history.
INSERT OR IGNORE INTO ipp_bond_notices
  (id, bond_id, project_id, cycle, title, body_json, status,
   issued_at, issued_by, cure_deadline_at, acknowledged_at, acknowledged_by, escalated_at)
VALUES
  -- warning bond — cycle 0 (renew-soon) notice.
  ('bn_w_001', 'bond_demo_warning', 'ip_002', 0,
   'Renew soon — performance bond PB-2024-002 expires 2026-07-15',
   '{"days_remaining":49,"face_value_zar":12800000}',
   'issued', '2026-05-27T00:00:00.000Z', 'system',
   '2026-05-27T00:00:00.000Z', NULL, NULL, NULL),

  -- cycle_1 bond — cycle 0 (warning) + cycle 1 (formal notice with 14d cure).
  ('bn_c1_w', 'bond_demo_cycle1', 'ip_003', 0,
   'Renew soon — performance bond PB-2024-003 expires 2026-06-15',
   '{"days_remaining":49,"face_value_zar":6750000}',
   'superseded', '2026-04-27T00:00:00.000Z', 'system',
   '2026-04-27T00:00:00.000Z', NULL, NULL, NULL),
  ('bn_c1_1', 'bond_demo_cycle1', 'ip_003', 1,
   'Notice 1 of 3 — performance bond PB-2024-003 expires in 19 days',
   '{"days_remaining":19,"face_value_zar":6750000,"cure_window_days":14}',
   'issued', '2026-05-27T00:00:00.000Z', 'system',
   '2026-06-10T00:00:00.000Z', NULL, NULL, NULL),

  -- cycle_2 bond — cycle 0, 1, 2 history.
  ('bn_c2_w', 'bond_demo_cycle2', 'ip_001', 0,
   'Renew soon — environmental-rehabilitation bond PB-2024-004 expires 2026-06-03',
   '{"days_remaining":96,"face_value_zar":9500000}',
   'superseded', '2026-02-27T00:00:00.000Z', 'system',
   '2026-02-27T00:00:00.000Z', NULL, NULL, NULL),
  ('bn_c2_1', 'bond_demo_cycle2', 'ip_001', 1,
   'Notice 1 of 3 — environmental-rehabilitation bond PB-2024-004 expires in 30 days',
   '{"days_remaining":30,"face_value_zar":9500000,"cure_window_days":14}',
   'superseded', '2026-04-27T00:00:00.000Z', 'system',
   '2026-05-11T00:00:00.000Z', NULL, NULL, NULL),
  ('bn_c2_2', 'bond_demo_cycle2', 'ip_001', 2,
   'Notice 2 of 3 — environmental-rehabilitation bond PB-2024-004 expires in 7 days',
   '{"days_remaining":7,"face_value_zar":9500000,"cure_window_days":7}',
   'issued', '2026-05-27T00:00:00.000Z', 'system',
   '2026-06-03T00:00:00.000Z', NULL, NULL, NULL),

  -- cycle_3 bond — all four notices issued; final one with immediate cure.
  ('bn_c3_w', 'bond_demo_cycle3', 'ip_002', 0,
   'Renew soon — warranty bond PB-2024-005 expires 2026-05-29',
   '{"days_remaining":91,"face_value_zar":4200000}',
   'superseded', '2026-02-27T00:00:00.000Z', 'system',
   '2026-02-27T00:00:00.000Z', NULL, NULL, NULL),
  ('bn_c3_1', 'bond_demo_cycle3', 'ip_002', 1,
   'Notice 1 of 3 — warranty bond PB-2024-005 expires in 30 days',
   '{"days_remaining":30,"face_value_zar":4200000,"cure_window_days":14}',
   'superseded', '2026-04-27T00:00:00.000Z', 'system',
   '2026-05-11T00:00:00.000Z', NULL, NULL, NULL),
  ('bn_c3_2', 'bond_demo_cycle3', 'ip_002', 2,
   'Notice 2 of 3 — warranty bond PB-2024-005 expires in 14 days',
   '{"days_remaining":14,"face_value_zar":4200000,"cure_window_days":7}',
   'superseded', '2026-05-13T00:00:00.000Z', 'system',
   '2026-05-20T00:00:00.000Z', NULL, NULL, NULL),
  ('bn_c3_3', 'bond_demo_cycle3', 'ip_002', 3,
   'Notice 3 of 3 — final — warranty bond PB-2024-005 expires in 2 days',
   '{"days_remaining":2,"face_value_zar":4200000,"cure_window_days":0}',
   'issued', '2026-05-27T00:00:00.000Z', 'system',
   '2026-05-27T00:00:00.000Z', NULL, NULL, NULL),

  -- escalated bond — full chain culminating in regulator escalation.
  ('bn_e_w', 'bond_demo_escalated', 'ip_003', 0,
   'Renew soon — advance-payment bond PB-2024-006 expires 2026-04-15',
   '{"days_remaining":90,"face_value_zar":8100000}',
   'superseded', '2026-01-15T00:00:00.000Z', 'system',
   '2026-01-15T00:00:00.000Z', NULL, NULL, NULL),
  ('bn_e_1', 'bond_demo_escalated', 'ip_003', 1,
   'Notice 1 of 3 — advance-payment bond PB-2024-006 expires in 30 days',
   '{"days_remaining":30,"face_value_zar":8100000,"cure_window_days":14}',
   'superseded', '2026-03-15T00:00:00.000Z', 'system',
   '2026-03-29T00:00:00.000Z', NULL, NULL, NULL),
  ('bn_e_2', 'bond_demo_escalated', 'ip_003', 2,
   'Notice 2 of 3 — advance-payment bond PB-2024-006 expires in 14 days',
   '{"days_remaining":14,"face_value_zar":8100000,"cure_window_days":7}',
   'superseded', '2026-04-01T00:00:00.000Z', 'system',
   '2026-04-08T00:00:00.000Z', NULL, NULL, NULL),
  ('bn_e_3', 'bond_demo_escalated', 'ip_003', 3,
   'Notice 3 of 3 — final — advance-payment bond PB-2024-006 expires in 3 days',
   '{"days_remaining":3,"face_value_zar":8100000,"cure_window_days":0}',
   'escalated', '2026-04-12T00:00:00.000Z', 'system',
   '2026-04-12T00:00:00.000Z', NULL, NULL, '2026-04-16T00:00:00.000Z');
