-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 7 seed — Offtaker obligations + delivery verification demo data.
--
-- 3 obligation rows on PPA `ppa_demo_001` (the canonical 80 MW solar offtake
-- against demo_ipp_001):
--   • 2026-03 — delivered (full contracted volume verified)
--   • 2026-04 — shortfall (95% threshold missed, cure window open)
--   • 2026-02 — take_or_pay (cure expired, computed liability)
--
-- 4 delivery_verification rows:
--   • 2 verified on the 03 obligation
--   • 1 submitted (awaiting offtaker verify) on the 04 obligation
--   • 1 rejected on the 02 obligation
--
-- All INSERT OR IGNORE with stable PKs for replay safety.
-- ═══════════════════════════════════════════════════════════════════════════

-- Make sure the demo PPA exists. off_ppa_portfolio in 047_role_full_lifecycle.
INSERT OR IGNORE INTO off_ppa_portfolio (
  id, participant_id, tenant_id, contract_ref, counterparty_name, technology,
  capacity_mw, ppa_term_years, ppa_start_date, ppa_end_date, price_zar_per_mwh,
  indexation, expected_p50_gwh_yr, green_attributes, status, notes,
  cure_window_days, take_or_pay_pct
) VALUES (
  'ppa_demo_001', 'demo_offtaker_001', 'default', 'PPA-2025-001',
  'GreenSpark IPP', 'solar', 80.0, 20, '2025-01-01', '2044-12-31', 1180.00,
  'CPI', 196.0, 'REC + Article6', 'active',
  'Demo PPA for Wave 7 obligation tracking.', 14, 95.0
);

-- ── Obligations ──────────────────────────────────────────────────────────────
-- 2026-03 — delivered cleanly.
INSERT OR IGNORE INTO oe_offtaker_ppa_obligations (
  id, ppa_id, participant_id, counterparty_id, period_month,
  contracted_mwh, delivered_mwh, threshold_pct, status,
  notes, created_at, updated_at
) VALUES (
  'obl_demo_1', 'ppa_demo_001', 'demo_offtaker_001', 'demo_ipp_001', '2026-03',
  16500.0, 16720.0, 95.0, 'delivered',
  'Full delivery — 101.3% of contracted.', '2026-04-02 06:00:00', '2026-04-02 06:00:00'
);

-- 2026-04 — shortfall in cure window. Contracted 16500, delivered so far 14200
-- (86%). Threshold is 95%. Cure deadline 14d after period close (2026-05-14).
INSERT OR IGNORE INTO oe_offtaker_ppa_obligations (
  id, ppa_id, participant_id, counterparty_id, period_month,
  contracted_mwh, delivered_mwh, threshold_pct, cure_deadline_at, status,
  notes, created_at, updated_at
) VALUES (
  'obl_demo_2', 'ppa_demo_001', 'demo_offtaker_001', 'demo_ipp_001', '2026-04',
  16500.0, 14200.0, 95.0, '2026-05-30 23:59:59', 'shortfall',
  'Cloud cover + 2 wind days; IPP submitting catch-up readings.',
  '2026-05-01 06:00:00', '2026-05-01 06:00:00'
);

-- 2026-02 — take_or_pay. Contracted 15800, delivered 12100 (76.6%). Cure expired.
-- Liability = (threshold_mwh - delivered_mwh) * price = (15010 - 12100) * 1180.
INSERT OR IGNORE INTO oe_offtaker_ppa_obligations (
  id, ppa_id, participant_id, counterparty_id, period_month,
  contracted_mwh, delivered_mwh, threshold_pct, cure_deadline_at,
  status, take_or_pay_amount_zar, escalated_at,
  notes, created_at, updated_at
) VALUES (
  'obl_demo_3', 'ppa_demo_001', 'demo_offtaker_001', 'demo_ipp_001', '2026-02',
  15800.0, 12100.0, 95.0, '2026-03-15 23:59:59',
  'take_or_pay', 3433800.0, '2026-03-16 02:00:00',
  'Inverter trip + grid curtailment. Take-or-pay triggered on 2026-03-16.',
  '2026-03-02 06:00:00', '2026-03-16 02:00:00'
);

-- ── Delivery verification readings ───────────────────────────────────────────
-- obl_demo_1 — two verified readings.
INSERT OR IGNORE INTO oe_offtaker_delivery_verification (
  id, obligation_id, ppa_id, period_month, reading_mwh,
  reading_window_start, reading_window_end,
  submitted_by, submitted_at, status, verified_by, verified_at,
  notes
) VALUES
  ('dv_demo_1a', 'obl_demo_1', 'ppa_demo_001', '2026-03', 8410.0,
   '2026-03-01 00:00:00', '2026-03-15 23:59:59',
   'demo_ipp_001', '2026-03-16 08:00:00', 'verified',
   'demo_offtaker_001', '2026-03-17 10:00:00',
   'First-half meter read — verified against SCADA.'),
  ('dv_demo_1b', 'obl_demo_1', 'ppa_demo_001', '2026-03', 8310.0,
   '2026-03-16 00:00:00', '2026-03-31 23:59:59',
   'demo_ipp_001', '2026-04-01 08:00:00', 'verified',
   'demo_offtaker_001', '2026-04-02 09:30:00',
   'Second-half meter read — verified, period closed at 101.3% of contracted.');

-- obl_demo_2 — one submitted (awaiting offtaker verify).
INSERT OR IGNORE INTO oe_offtaker_delivery_verification (
  id, obligation_id, ppa_id, period_month, reading_mwh,
  reading_window_start, reading_window_end,
  submitted_by, submitted_at, status, notes
) VALUES (
  'dv_demo_2a', 'obl_demo_2', 'ppa_demo_001', '2026-04', 14200.0,
  '2026-04-01 00:00:00', '2026-04-30 23:59:59',
  'demo_ipp_001', '2026-05-02 08:00:00', 'submitted',
  'Full-month meter read — IPP submitting; offtaker review pending.'
);

-- obl_demo_3 — one rejected reading (the IPP tried to overclaim after curtailment).
INSERT OR IGNORE INTO oe_offtaker_delivery_verification (
  id, obligation_id, ppa_id, period_month, reading_mwh,
  reading_window_start, reading_window_end,
  submitted_by, submitted_at, status, verified_by, verified_at,
  rejection_reason, notes
) VALUES (
  'dv_demo_3a', 'obl_demo_3', 'ppa_demo_001', '2026-02', 13800.0,
  '2026-02-01 00:00:00', '2026-02-28 23:59:59',
  'demo_ipp_001', '2026-03-05 08:00:00', 'rejected',
  'demo_offtaker_001', '2026-03-06 11:00:00',
  'SCADA mismatch — IPP report 13800 MWh vs metered 12100 MWh during curtailment.',
  'Rejected; offtaker logged 12100 as final.'
);
