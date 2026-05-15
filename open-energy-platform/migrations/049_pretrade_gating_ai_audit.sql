-- ════════════════════════════════════════════════════════════════════════
-- 049 · Pre-trade gating + AI decision audit
--
-- Three new tables that turn POST /trading/orders from a fire-and-insert
-- into a real pre-trade workflow:
--
--   trade_order_rejections — every rejected order placement is recorded
--     with a structured reason_code + the snapshot of risk state that
--     drove the decision. Becomes the audit trail for "why was my order
--     blocked" and the rejection log surfaced in the Trading UI.
--
--   margin_reservations — initial margin on accepted orders is reserved
--     atomically with the trade_orders insert. The lifecycle is:
--       reserved (order open) → released (order cancelled / expired)
--                             → consumed (order matched)
--     so credit utilisation always reflects committed exposure, not just
--     historical fills.
--
--   ai_decisions — every AI surface (rejection explanations, ghost-text
--     suggestions, narrative one-liners) writes prompt + response + accept
--     state here. The UI can show "you accepted 3 of 5 AI suggestions
--     today" and the regulator audit pack can prove no AI output silently
--     drove a financial action.
--
-- All three are additive. No existing rows are touched.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trade_order_rejections (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  attempted_at    TEXT NOT NULL DEFAULT (datetime('now')),
  reason_code     TEXT NOT NULL,
  detail          TEXT,
  side            TEXT,
  energy_type     TEXT,
  volume_mwh      REAL,
  price_zar_mwh   REAL,
  notional_zar    REAL,
  snapshot_json   TEXT,        -- credit_limit, open_exposure, free_collateral, position, market_state
  external_ref    TEXT
);
CREATE INDEX IF NOT EXISTS idx_trade_order_rejections_participant
  ON trade_order_rejections (participant_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_order_rejections_reason
  ON trade_order_rejections (reason_code, attempted_at DESC);

CREATE TABLE IF NOT EXISTS margin_reservations (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL,
  participant_id  TEXT NOT NULL,
  amount_zar      REAL NOT NULL,
  status          TEXT NOT NULL DEFAULT 'reserved'
                    CHECK (status IN ('reserved','released','consumed')),
  reserved_at     TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at     TEXT,
  resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_margin_reservations_order
  ON margin_reservations (order_id);
CREATE INDEX IF NOT EXISTS idx_margin_reservations_participant_status
  ON margin_reservations (participant_id, status);

CREATE TABLE IF NOT EXISTS ai_decisions (
  id              TEXT PRIMARY KEY,
  surface         TEXT NOT NULL,        -- 'rejection_explainer' | 'order_size_suggest' | 'risk_narrative' | ...
  participant_id  TEXT,
  intent          TEXT,
  prompt_hash     TEXT,
  prompt_summary  TEXT,
  response_text   TEXT,
  response_json   TEXT,
  model           TEXT,
  fallback        INTEGER NOT NULL DEFAULT 0,
  accepted        INTEGER,              -- NULL = not yet acted on, 0 = dismissed, 1 = accepted
  related_entity_type TEXT,
  related_entity_id   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_surface_created
  ON ai_decisions (surface, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_participant
  ON ai_decisions (participant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_prompt_hash
  ON ai_decisions (prompt_hash);
