-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 19 — IPP procurement / RFP chain (REIPPPP-aligned transparency).
--
-- Adds:
--   • oe_procurement_rfps             (RFP submission lifecycle)
--   • oe_procurement_chain_events     (audit chain)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_procurement_rfps (
  id                  TEXT PRIMARY KEY,
  rfp_number          TEXT UNIQUE NOT NULL,
  project_id          TEXT,
  participant_id      TEXT NOT NULL,                  -- IPP that issued the RFP
  title               TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL DEFAULT 'epc',    -- epc | equipment | services | spares
  capex_tier          TEXT NOT NULL DEFAULT 'medium', -- high | medium | low
  capex_estimate_zar  REAL,                            -- ZAR estimate (drives tier)
  currency            TEXT NOT NULL DEFAULT 'ZAR',
  chain_status        TEXT NOT NULL DEFAULT 'draft',
  start_at            TEXT,                            -- planned publication
  bid_open_at         TEXT,
  bid_close_at        TEXT,
  delivery_due_at     TEXT,
  award_to            TEXT,                            -- vendor identifier
  award_name          TEXT,                            -- denormalized vendor name
  award_amount_zar    REAL,                            -- actual award value
  awarded_at          TEXT,
  contracted_at       TEXT,
  delivered_at        TEXT,
  rejection_reason    TEXT,
  dispute_notes       TEXT,
  evaluation_notes    TEXT,
  sla_deadline_at     TEXT,
  last_sla_breach_at  TEXT,
  escalation_level    INTEGER NOT NULL DEFAULT 0,
  created_by          TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_proc_chain   ON oe_procurement_rfps(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_proc_tier    ON oe_procurement_rfps(capex_tier);
CREATE INDEX IF NOT EXISTS idx_oe_proc_part    ON oe_procurement_rfps(participant_id);
CREATE INDEX IF NOT EXISTS idx_oe_proc_project ON oe_procurement_rfps(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_proc_sla     ON oe_procurement_rfps(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_procurement_chain_events (
  id          TEXT PRIMARY KEY,
  rfp_id      TEXT NOT NULL,
  event_type  TEXT NOT NULL,    -- published | bid_opened | bid_closed | evaluation_started |
                                 -- shortlisted | awarded | contracted | delivered |
                                 -- rejected | cancelled | disputed | resolved | sla_breached
  from_status TEXT,
  to_status   TEXT,
  actor_id    TEXT,
  notes       TEXT,
  payload     TEXT,              -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_proc_events_rfp  ON oe_procurement_chain_events(rfp_id, created_at);
CREATE INDEX IF NOT EXISTS idx_oe_proc_events_type ON oe_procurement_chain_events(event_type);
