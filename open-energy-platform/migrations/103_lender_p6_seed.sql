-- ════════════════════════════════════════════════════════════════════════
-- 103_lender_p6_seed.sql — Wave 6 demo rows for the dunning queue.
--
-- Seeds:
--   • Two open watchlist rows tied to existing facilities (fac_001 mezz
--     DSCR warning, fac_003 construction covenant breach).
--   • Three dunning notices spanning cycle 1 / cycle 2 / cycle 3 with
--     varied status (issued / acknowledged / overdue).
--   • Matching watchlist_events rows that show the escalation trail.
-- ════════════════════════════════════════════════════════════════════════

-- ─── Watchlist rows (idempotent via PK) ───────────────────────────────
INSERT OR IGNORE INTO oe_lender_watchlist
  (id, facility_id, participant_id, watchlist_tier, trigger_signal, trigger_value,
   action_plan, added_at, next_review_at, added_by,
   cure_deadline_at, dunning_cycle, auto_escalated_at, borrower_acked_at)
VALUES
  ('wl_demo_1','fac_006','demo_ipp_001', 1, 'dscr_warning',          1.08,
   'Borrower to submit revised cashflow model within 14 days.',
   '2026-05-23 09:00:00', '2026-06-22 09:00:00','demo_lender_001',
   '2026-06-06 09:00:00', 1, NULL, NULL),
  ('wl_demo_2','fac_003','demo_ipp_001', 2, 'covenant_breach',       1.10,
   'IE certification + remedial plan required; potential drawdown gate.',
   '2026-05-21 11:30:00', '2026-06-04 11:30:00','demo_lender_001',
   '2026-05-28 11:30:00', 2, '2026-05-25 11:30:00', '2026-05-22 14:00:00');

-- ─── Dunning notices ──────────────────────────────────────────────────
INSERT OR IGNORE INTO oe_lender_dunning_notices
  (id, watchlist_id, facility_id, borrower_id, cycle, trigger_signal,
   title, body_json, status, issued_at, issued_by, cure_deadline_at,
   acked_at, acked_by, parent_notice_id)
VALUES
  ('dun_demo_1','wl_demo_1','fac_006','demo_ipp_001', 1, 'dscr_warning',
   'DSCR drift below covenant — cycle 1 informational notice',
   '{"covenant":"DSCR_12M","threshold":1.20,"measured":1.08,"period":"2026-Q1"}',
   'issued',         '2026-05-23 09:00:00','demo_lender_001','2026-06-06 09:00:00',
   NULL, NULL, NULL),

  ('dun_demo_2','wl_demo_2','fac_003','demo_ipp_001', 1, 'covenant_breach',
   'Covenant breach — cycle 1 informational notice',
   '{"covenant":"DSCR_12M","threshold":1.15,"measured":1.10,"period":"2026-Q1"}',
   'acknowledged',   '2026-05-21 11:30:00','demo_lender_001','2026-06-04 11:30:00',
   '2026-05-22 14:00:00','demo_ipp_001', NULL),

  ('dun_demo_3','wl_demo_2','fac_003','demo_ipp_001', 2, 'covenant_breach',
   'Covenant breach — cycle 2 formal warning',
   '{"covenant":"DSCR_12M","threshold":1.15,"measured":1.10,"period":"2026-Q1","prior_notice":"dun_demo_2"}',
   'overdue',        '2026-05-25 11:30:00','system',           '2026-05-26 11:30:00',
   NULL, NULL, 'dun_demo_2');

-- ─── Watchlist events trail ───────────────────────────────────────────
INSERT OR IGNORE INTO oe_lender_watchlist_events
  (id, watchlist_id, event_type, from_tier, to_tier, actor_id, notes, occurred_at)
VALUES
  ('we_demo_1','wl_demo_1','added',           NULL, 1, 'demo_lender_001',
   'Initial entry — DSCR warning at 1.08 vs 1.20 covenant.', '2026-05-23 09:00:00'),
  ('we_demo_2','wl_demo_1','dunning_issued',  1,    1, 'system',
   'Cycle 1 notice issued.', '2026-05-23 09:00:00'),

  ('we_demo_3','wl_demo_2','added',           NULL, 1, 'demo_lender_001',
   'Initial entry — covenant breach on fac_003 construction facility.',
   '2026-05-21 11:30:00'),
  ('we_demo_4','wl_demo_2','dunning_issued',  1,    1, 'system',
   'Cycle 1 notice issued.', '2026-05-21 11:30:00'),
  ('we_demo_5','wl_demo_2','tier_escalated',  1,    2, 'system',
   'Cycle 1 cure deadline expired — auto-bumped to tier 2.',
   '2026-05-25 11:30:00'),
  ('we_demo_6','wl_demo_2','dunning_issued',  2,    2, 'system',
   'Cycle 2 notice issued.', '2026-05-25 11:30:00'),
  ('we_demo_7','wl_demo_2','dunning_overdue', 2,    2, 'system',
   'Cycle 2 notice flagged overdue.', '2026-05-26 11:30:00');
