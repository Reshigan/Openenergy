-- ════════════════════════════════════════════════════════════════════════
-- W2 — bridge the surveillance/cert "party" id-namespace to trading participants.
--
-- Algo certifications carry firm_party_id; market-abuse cases carry
-- subject_party_id. Neither is a participants.id. The pre-trade guard checks
-- the trading participant_id (== JWT sub). This OPTIONAL, ADDITIVE map lets the
-- guard resolve a trader to the party id(s) a kill-switch / STOR block is
-- written against.
--
-- When the map is empty the guard falls back to a DIRECT participant_id match,
-- so a block still enforces when a cert/case is created with its party id set
-- to the participant id directly. A mapping gap is therefore observable (the
-- block row + rule audit + role-action all exist) — never a silent no-op.
--
-- Additive only. No existing rows are touched.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS oe_trading_party_link (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,        -- participants.id (== trading user.id)
  party_id        TEXT NOT NULL,        -- firm_party_id / subject_party_id namespace
  link_type       TEXT NOT NULL DEFAULT 'trading_party'
                    CHECK (link_type IN ('trading_party', 'surveillance_party')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trading_party_link_participant
  ON oe_trading_party_link (participant_id);
CREATE INDEX IF NOT EXISTS idx_trading_party_link_party
  ON oe_trading_party_link (party_id);
