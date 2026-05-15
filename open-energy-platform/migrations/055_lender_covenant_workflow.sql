-- ════════════════════════════════════════════════════════════════════════
-- 055 · Lender L4 depth — covenant-breach workflow + AI advisory audit
--
-- The existing schema (migration 023) carries covenants, covenant_tests,
-- and covenant_waivers — enough to record that a breach happened, not
-- enough to track what the lender did about it. This migration adds:
--
--   lender_covenant_actions   — open → investigating → resolved | rejected
--                               state machine for each breach. Outcome
--                               buckets cover the real-world options:
--                               cured / waived / amended_terms /
--                               accelerated / written_off / no_action.
--   ai_lender_advice          — audit of every AI inline suggestion the
--                               advisor surfaced for a breach + accept
--                               timestamps (mirrors ai_settlement_run_
--                               failures + ai_trade_amendments).
--
-- Indexes:
--   - per-covenant lookup (so the launch-board "n breaches open" tile
--     resolves with a single query),
--   - per-lender open-actions filter (so the lender's queue view is fast),
--   - per-breach AI advice history.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lender_covenant_actions (
  id                  TEXT PRIMARY KEY,
  covenant_test_id    TEXT NOT NULL,              -- covenant_tests.id
  covenant_id         TEXT NOT NULL,              -- covenants.id (denorm for fast filter)
  lender_participant_id TEXT,                     -- denorm from covenant for queue lookup
  status              TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','investigating','resolved','rejected')),
  action_type         TEXT NOT NULL CHECK (action_type IN (
    'cure_plan','waiver_request','amendment_request','acceleration_notice','workout','no_action'
  )),
  severity            TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  filed_by            TEXT NOT NULL,
  filed_at            TEXT NOT NULL DEFAULT (datetime('now')),
  notes               TEXT,
  resolution_outcome  TEXT CHECK (resolution_outcome IN (
    'cured','waived','amended_terms','accelerated','written_off','no_action'
  )),
  resolution_notes    TEXT,
  resolved_at         TEXT,
  resolved_by         TEXT,
  cure_deadline       TEXT,                       -- ISO; when the cure plan must be complete
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lender_covenant_actions_covenant
  ON lender_covenant_actions (covenant_id, status);
CREATE INDEX IF NOT EXISTS idx_lender_covenant_actions_lender
  ON lender_covenant_actions (lender_participant_id, status, filed_at);
CREATE INDEX IF NOT EXISTS idx_lender_covenant_actions_test
  ON lender_covenant_actions (covenant_test_id);

CREATE TABLE IF NOT EXISTS ai_lender_advice (
  id                   TEXT PRIMARY KEY,
  covenant_test_id     TEXT NOT NULL,
  covenant_id          TEXT NOT NULL,
  lender_participant_id TEXT,
  recommendation       TEXT NOT NULL CHECK (recommendation IN (
    'cure_plan','waiver','amendment','acceleration','workout','no_action'
  )),
  rationale            TEXT NOT NULL,
  confidence           REAL,
  source               TEXT NOT NULL DEFAULT 'deterministic'
    CHECK (source IN ('deterministic','ai_gateway','fallback')),
  accepted_at          TEXT,
  accepted_by          TEXT,
  dismissed_at         TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_lender_advice_test
  ON ai_lender_advice (covenant_test_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_lender_advice_lender
  ON ai_lender_advice (lender_participant_id, accepted_at);
