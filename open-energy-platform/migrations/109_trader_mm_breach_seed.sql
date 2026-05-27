-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 9 — Trader MM breach lifecycle seed.
--
-- Three obligations spanning every breach state:
--   • mmo_demo_1 — clean (consecutive_misses=0, breach_status=none, 4 daily
--     compliant performance rows)
--   • mmo_demo_2 — warning (1 miss yesterday → breach_status=warning)
--   • mmo_demo_3 — escalated (5 consecutive misses → escalated to regulator)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_mm_obligations
  (id, participant_id, energy_type, obligation_type,
   two_sided_minutes_per_day, max_spread_bps, uptime_target_pct,
   min_quote_volume_mwh, effective_from, effective_to,
   monthly_fee_zar, performance_score, status,
   consecutive_misses, breach_status,
   warning_threshold, breach_threshold, escalation_threshold)
VALUES
  ('mmo_demo_1', 'trader-user', 'electricity', 'two_sided_quote',
   360, 50, 95, 10, '2026-01-01', '2026-12-31',
   45000, 100, 'active',
   0, 'none', 1, 3, 5),
  ('mmo_demo_2', 'trader-user', 'rec', 'two_sided_quote',
   240, 80, 92, 5, '2026-02-01', '2026-12-31',
   30000, 92, 'active',
   1, 'warning', 1, 3, 5),
  ('mmo_demo_3', 'trader-user', 'carbon_credits', 'two_sided_quote',
   180, 100, 90, 2, '2026-03-01', '2026-12-31',
   25000, 60, 'active',
   5, 'escalated', 1, 3, 5);

-- Compliant 4-day history for mmo_demo_1.
INSERT OR IGNORE INTO oe_mm_performance
  (id, obligation_id, day, two_sided_minutes, avg_spread_bps,
   uptime_pct, total_volume_mwh, compliant, fee_earned_zar, penalty_zar,
   compliance_status)
VALUES
  ('mmp_d1_4', 'mmo_demo_1', '2026-05-23', 365, 42, 96.4, 120, 1, 1500, 0, 'compliant'),
  ('mmp_d1_3', 'mmo_demo_1', '2026-05-24', 372, 38, 97.1, 135, 1, 1500, 0, 'compliant'),
  ('mmp_d1_2', 'mmo_demo_1', '2026-05-25', 380, 41, 96.8, 118, 1, 1500, 0, 'compliant'),
  ('mmp_d1_1', 'mmo_demo_1', '2026-05-26', 368, 43, 95.8, 142, 1, 1500, 0, 'compliant');

-- 3 compliant + 1 miss yesterday for mmo_demo_2 (current state warning).
INSERT OR IGNORE INTO oe_mm_performance
  (id, obligation_id, day, two_sided_minutes, avg_spread_bps,
   uptime_pct, total_volume_mwh, compliant, fee_earned_zar, penalty_zar,
   compliance_status)
VALUES
  ('mmp_d2_4', 'mmo_demo_2', '2026-05-23', 242, 75, 93.1, 38, 1, 1000, 0, 'compliant'),
  ('mmp_d2_3', 'mmo_demo_2', '2026-05-24', 248, 72, 94.2, 42, 1, 1000, 0, 'compliant'),
  ('mmp_d2_2', 'mmo_demo_2', '2026-05-25', 245, 78, 93.4, 35, 1, 1000, 0, 'compliant'),
  ('mmp_d2_1', 'mmo_demo_2', '2026-05-26', 180, 95, 88.2, 21, 0, 0, 500, 'miss');

-- 5 consecutive misses for mmo_demo_3 (current state escalated).
INSERT OR IGNORE INTO oe_mm_performance
  (id, obligation_id, day, two_sided_minutes, avg_spread_bps,
   uptime_pct, total_volume_mwh, compliant, fee_earned_zar, penalty_zar,
   compliance_status)
VALUES
  ('mmp_d3_5', 'mmo_demo_3', '2026-05-22', 90, 145, 78.0, 1.2, 0, 0, 420, 'miss'),
  ('mmp_d3_4', 'mmo_demo_3', '2026-05-23', 102, 135, 80.0, 0.9, 0, 0, 420, 'miss'),
  ('mmp_d3_3', 'mmo_demo_3', '2026-05-24', 115, 128, 82.0, 1.5, 0, 0, 420, 'miss'),
  ('mmp_d3_2', 'mmo_demo_3', '2026-05-25', 88, 152, 76.0, 0.6, 0, 0, 420, 'miss'),
  ('mmp_d3_1', 'mmo_demo_3', '2026-05-26', 95, 142, 79.0, 0.8, 0, 0, 420, 'miss');
