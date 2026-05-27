-- ════════════════════════════════════════════════════════════════════════
-- 102_lender_p6.sql — Wave 6 P6-grade Lender/Funder portal.
--
-- Closes the borrower-side observation loop: covenant breach → auto
-- watchlist add → cycle-based dunning notices with escalating cure
-- deadlines → cycle 3 expiry escalates into the Wave 5 regulator inbox.
--
-- Tables:
--   oe_lender_dunning_notices       — cycle 1/2/3 outbound notices to
--                                     borrowers with cure deadlines
--   oe_lender_watchlist_events      — append-only escalation history
--                                     per watchlist row
--
-- New columns on oe_lender_watchlist:
--   cure_deadline_at      — when the borrower must satisfy by
--   dunning_cycle         — current dunning cycle (0/1/2/3)
--   auto_escalated_at     — last auto-tier bump
--   borrower_acked_at     — when borrower acknowledged the watchlist
-- ════════════════════════════════════════════════════════════════════════

-- ─── Dunning notices ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oe_lender_dunning_notices (
  id                     TEXT PRIMARY KEY,
  watchlist_id           TEXT,                       -- nullable for standalone notices
  facility_id            TEXT NOT NULL,
  borrower_id            TEXT NOT NULL,              -- the participant id of the borrower
  cycle                  INTEGER NOT NULL DEFAULT 1, -- 1=info, 2=formal warning, 3=default notice
  trigger_signal         TEXT NOT NULL,              -- covenant_breach | covenant_warn |
                                                      -- payment_delay | dscr_warning |
                                                      -- rating_downgrade | manual
  title                  TEXT NOT NULL,
  body_json              TEXT NOT NULL,              -- arbitrary structured context
  status                 TEXT NOT NULL DEFAULT 'issued',
                                                      -- issued | acknowledged | cured |
                                                      -- overdue | withdrawn | escalated
  issued_at              TEXT NOT NULL DEFAULT (datetime('now')),
  issued_by              TEXT,
  cure_deadline_at       TEXT NOT NULL,
  acked_at               TEXT,
  acked_by               TEXT,
  cured_at               TEXT,
  cured_by               TEXT,
  cure_evidence_r2_key   TEXT,
  overdue_flagged_at     TEXT,
  withdrawn_at           TEXT,
  withdrawn_by           TEXT,
  escalated_at           TEXT,
  parent_notice_id       TEXT,                       -- prior cycle that triggered this one
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_dunning_status   ON oe_lender_dunning_notices(status, cure_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_dunning_facility ON oe_lender_dunning_notices(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_dunning_borrower ON oe_lender_dunning_notices(borrower_id, status);
CREATE INDEX IF NOT EXISTS idx_oe_dunning_watch    ON oe_lender_dunning_notices(watchlist_id);

-- ─── Watchlist escalation history ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS oe_lender_watchlist_events (
  id                  TEXT PRIMARY KEY,
  watchlist_id        TEXT NOT NULL,
  event_type          TEXT NOT NULL,                 -- added | tier_escalated | tier_decreased |
                                                      -- dunning_issued | dunning_cured |
                                                      -- dunning_overdue | cleared
  from_tier           INTEGER,
  to_tier             INTEGER,
  actor_id            TEXT,
  notes               TEXT,
  meta_json           TEXT,
  occurred_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_watch_events_wl ON oe_lender_watchlist_events(watchlist_id, occurred_at);

-- ─── Watchlist additions (column-by-column for idempotency) ───────────
-- SQLite has no IF NOT EXISTS for ALTER ADD COLUMN; the deploy.yml shell
-- catches "duplicate column name" as a benign signal so these re-apply
-- safely on prod.
ALTER TABLE oe_lender_watchlist ADD COLUMN cure_deadline_at    TEXT;
ALTER TABLE oe_lender_watchlist ADD COLUMN dunning_cycle       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE oe_lender_watchlist ADD COLUMN auto_escalated_at   TEXT;
ALTER TABLE oe_lender_watchlist ADD COLUMN borrower_acked_at   TEXT;
