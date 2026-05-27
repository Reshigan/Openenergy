-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 22 — Offtaker PPA contract execution lifecycle chain.
--
-- Adds:
--   • oe_ppa_contract_chain         (PPA contract lifecycle)
--   • oe_ppa_contract_chain_events  (audit chain)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_ppa_contract_chain (
  id                       TEXT PRIMARY KEY,
  ppa_number               TEXT UNIQUE NOT NULL,
  project_id               TEXT,
  facility_id              TEXT,
  participant_id           TEXT NOT NULL,                   -- IPP
  offtaker_id              TEXT NOT NULL,                   -- Offtaker
  project_name             TEXT NOT NULL,
  offtaker_name            TEXT NOT NULL,
  contract_term_years      INTEGER NOT NULL DEFAULT 20,
  capacity_mw              REAL NOT NULL DEFAULT 0,
  capacity_tier            TEXT NOT NULL DEFAULT 'small',   -- strategic | medium | small
  tariff_zar_per_mwh       REAL,
  indexation               TEXT,                            -- e.g. 'cpi_+_2pct'
  take_or_pay_pct          REAL,                            -- 0..100
  chain_status             TEXT NOT NULL DEFAULT 'draft',
  draft_at                 TEXT,
  negotiation_at           TEXT,
  terms_locked_at          TEXT,
  legal_signed_at          TEXT,
  executed_at              TEXT,
  in_force_at              TEXT,
  dispute_at               TEXT,
  resolved_at              TEXT,
  terminated_at            TEXT,
  expired_at               TEXT,
  cancelled_at             TEXT,
  nersa_section34_ref      TEXT,                            -- NERSA Section 34 determination ref (strategic only)
  legal_counterparty_ref   TEXT,                            -- Cliffe Dekker / Webber Wentzel / etc
  board_approval_ref       TEXT,                            -- offtaker board resolution ref
  termination_reason       TEXT,
  cancellation_reason      TEXT,
  dispute_notes            TEXT,
  contract_notes           TEXT,
  expiry_date              TEXT,                            -- contractual expiry (effective_at + term_years)
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  escalation_level         INTEGER NOT NULL DEFAULT 0,
  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_ppa_status   ON oe_ppa_contract_chain(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_tier     ON oe_ppa_contract_chain(capacity_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_off      ON oe_ppa_contract_chain(offtaker_id);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_part     ON oe_ppa_contract_chain(participant_id);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_project  ON oe_ppa_contract_chain(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_sla      ON oe_ppa_contract_chain(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_expiry   ON oe_ppa_contract_chain(expiry_date);

CREATE TABLE IF NOT EXISTS oe_ppa_contract_chain_events (
  id          TEXT PRIMARY KEY,
  ppa_id      TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  actor_id    TEXT,
  notes       TEXT,
  payload     TEXT,              -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_ppa_events_ppa  ON oe_ppa_contract_chain_events(ppa_id, created_at);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_events_type ON oe_ppa_contract_chain_events(event_type);
