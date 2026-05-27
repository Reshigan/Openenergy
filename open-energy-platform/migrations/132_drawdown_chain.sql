-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 21 — Lender drawdown / disbursement certification chain.
--
-- Adds:
--   • oe_drawdown_chain          (drawdown request lifecycle)
--   • oe_drawdown_chain_events   (audit chain)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_drawdown_chain (
  id                   TEXT PRIMARY KEY,
  drawdown_number      TEXT UNIQUE NOT NULL,
  facility_id          TEXT,
  project_id           TEXT,
  participant_id       TEXT NOT NULL,                   -- IPP requesting
  lender_id            TEXT NOT NULL,                   -- lender extending
  project_name         TEXT NOT NULL,
  facility_name        TEXT,
  tranche_label        TEXT NOT NULL DEFAULT 'tranche_1',
  amount_zar           REAL NOT NULL DEFAULT 0,
  tranche_tier         TEXT NOT NULL DEFAULT 'equity',  -- senior | mezz | equity
  chain_status         TEXT NOT NULL DEFAULT 'requested',
  requested_at         TEXT,
  documents_at         TEXT,
  ie_review_at         TEXT,
  cp_started_at        TEXT,
  on_hold_at           TEXT,
  approved_at          TEXT,
  funded_at            TEXT,
  closed_at            TEXT,
  ie_certifier         TEXT,                            -- Independent Engineer firm
  ie_cert_doc_ref      TEXT,                            -- IE cert ref
  cp_evidence_ref      TEXT,                            -- CP evidence bundle ref
  sarb_disclosure_ref  TEXT,                            -- SARB exposure disclosure ref (senior only)
  query_notes          TEXT,
  rejection_reason     TEXT,
  cancellation_reason  TEXT,
  funding_account_ref  TEXT,                            -- treasury wire ref once funded
  drawdown_notes       TEXT,
  sla_deadline_at      TEXT,
  last_sla_breach_at   TEXT,
  escalation_level     INTEGER NOT NULL DEFAULT 0,
  created_by           TEXT NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_dd_status   ON oe_drawdown_chain(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_dd_tier     ON oe_drawdown_chain(tranche_tier);
CREATE INDEX IF NOT EXISTS idx_oe_dd_lender   ON oe_drawdown_chain(lender_id);
CREATE INDEX IF NOT EXISTS idx_oe_dd_part     ON oe_drawdown_chain(participant_id);
CREATE INDEX IF NOT EXISTS idx_oe_dd_project  ON oe_drawdown_chain(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_dd_sla      ON oe_drawdown_chain(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_drawdown_chain_events (
  id          TEXT PRIMARY KEY,
  drawdown_id TEXT NOT NULL,
  event_type  TEXT NOT NULL,    -- documents_submitted | ie_review_started |
                                -- cp_passed | queried | resumed |
                                -- approved | funded | closed |
                                -- rejected | cancelled | sla_breached
  from_status TEXT,
  to_status   TEXT,
  actor_id    TEXT,
  notes       TEXT,
  payload     TEXT,              -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_dd_events_dd   ON oe_drawdown_chain_events(drawdown_id, created_at);
CREATE INDEX IF NOT EXISTS idx_oe_dd_events_type ON oe_drawdown_chain_events(event_type);
