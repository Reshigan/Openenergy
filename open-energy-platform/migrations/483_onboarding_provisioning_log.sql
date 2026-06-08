-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 483 — Onboarding provisioning evidence + idempotency log
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS oe_onboarding_provisioning_log (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  role            TEXT NOT NULL,
  kind            TEXT NOT NULL,   -- 'om_site' | 'ipp_project' | 'none'
  entity_type     TEXT,
  entity_id       TEXT,
  detail_json     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oprov_participant ON oe_onboarding_provisioning_log(participant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oprov_once ON oe_onboarding_provisioning_log(participant_id, kind);
