-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 20 — IPP construction → COD certification chain.
--
-- Adds:
--   • oe_cod_chain          (construction-to-COD lifecycle)
--   • oe_cod_chain_events   (audit chain)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_cod_chain (
  id                   TEXT PRIMARY KEY,
  cod_number           TEXT UNIQUE NOT NULL,
  project_id           TEXT,
  participant_id       TEXT NOT NULL,
  project_name         TEXT NOT NULL,
  epc_contract_id      TEXT,
  epc_contractor_name  TEXT,
  capacity_mw          REAL NOT NULL DEFAULT 0,
  capacity_tier        TEXT NOT NULL DEFAULT 'small',  -- large | medium | small
  chain_status         TEXT NOT NULL DEFAULT 'draft',
  target_cod_date      TEXT,
  actual_cod_date      TEXT,
  epc_signed_at        TEXT,
  ntp_issued_at        TEXT,
  mobilization_at      TEXT,
  mechanical_complete_at TEXT,
  cold_comm_at         TEXT,
  grid_sync_at         TEXT,
  reliability_run_at   TEXT,
  cod_certified_at     TEXT,
  ie_certifier         TEXT,                          -- Independent Engineer firm
  ie_cert_doc_ref      TEXT,                          -- IE certificate document ref
  nersa_scada_ref      TEXT,                          -- NERSA SCADA registration ref
  cancellation_reason  TEXT,
  construction_notes   TEXT,
  sla_deadline_at      TEXT,
  last_sla_breach_at   TEXT,
  escalation_level     INTEGER NOT NULL DEFAULT 0,
  created_by           TEXT NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_cod_chain     ON oe_cod_chain(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_cod_tier      ON oe_cod_chain(capacity_tier);
CREATE INDEX IF NOT EXISTS idx_oe_cod_part      ON oe_cod_chain(participant_id);
CREATE INDEX IF NOT EXISTS idx_oe_cod_project   ON oe_cod_chain(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_cod_sla       ON oe_cod_chain(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_cod_chain_events (
  id          TEXT PRIMARY KEY,
  cod_id      TEXT NOT NULL,
  event_type  TEXT NOT NULL,    -- epc_signed | ntp_issued | mobilized |
                                -- mechanical_complete | cold_commissioned |
                                -- grid_synchronized | reliability_started |
                                -- cod_certified | cancelled | sla_breached
  from_status TEXT,
  to_status   TEXT,
  actor_id    TEXT,
  notes       TEXT,
  payload     TEXT,              -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_cod_events_cod  ON oe_cod_chain_events(cod_id, created_at);
CREATE INDEX IF NOT EXISTS idx_oe_cod_events_type ON oe_cod_chain_events(event_type);
