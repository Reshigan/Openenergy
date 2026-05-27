-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 12 — Esums site commissioning chain (P6).
--
-- Deepens the L2 om_sites schema (migration 058) into a regulator-grade
-- site onboarding state machine:
--
--   planned → site_registered → devices_registered → ingestion_wired
--    → first_telemetry_ok → energised → in_om
--                          (+ commissioning_failed terminal branch)
--                          (+ decommissioned terminal)
--
-- With:
--   • SLAs per state — installer has 14d to get from site_registered to
--     ingestion_wired; 7d from ingestion_wired to first_telemetry_ok;
--     30d from first_telemetry_ok to energised.
--   • Stuck-in-state auto-escalation (daily cron sweep).
--   • commissioning_failed → owner + regulator inbox (high).
--   • Ingestion-unhealthy 24h → owner inbox (high) — covered by
--     existing ingestion alerts; cron sweep correlates with chain state.
--   • Per-state audit-chain rows + cascade fan-out.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Extension columns on om_sites ──────────────────────────────────────────
-- Per-column ALTERs are individually idempotent (duplicate column name ==
-- benign already-applied signal — CI worker treats it as such).
ALTER TABLE om_sites ADD COLUMN commissioning_status TEXT NOT NULL DEFAULT 'planned';
ALTER TABLE om_sites ADD COLUMN commissioning_due_at TEXT;
ALTER TABLE om_sites ADD COLUMN commissioning_owner_id TEXT;
ALTER TABLE om_sites ADD COLUMN commissioning_started_at TEXT;
ALTER TABLE om_sites ADD COLUMN devices_registered_at TEXT;
ALTER TABLE om_sites ADD COLUMN ingestion_wired_at TEXT;
ALTER TABLE om_sites ADD COLUMN first_telemetry_at TEXT;
ALTER TABLE om_sites ADD COLUMN energised_at TEXT;
ALTER TABLE om_sites ADD COLUMN in_om_at TEXT;
ALTER TABLE om_sites ADD COLUMN commissioning_failed_at TEXT;
ALTER TABLE om_sites ADD COLUMN commissioning_failure_reason TEXT;
ALTER TABLE om_sites ADD COLUMN last_commissioning_sla_breach_at TEXT;

-- ─── Event log (audit chain rows for each state transition) ─────────────────
CREATE TABLE IF NOT EXISTS oe_site_commissioning_events (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES om_sites(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'planned','site_registered','devices_registered','ingestion_wired',
    'first_telemetry_ok','energised','in_om',
    'commissioning_failed','decommissioned',
    'sla_breached','note'
  )),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  notes TEXT,
  evidence_r2_key TEXT,
  body_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_site_comm_evt_site ON oe_site_commissioning_events(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_comm_evt_type ON oe_site_commissioning_events(event_type);
CREATE INDEX IF NOT EXISTS idx_om_sites_commissioning ON om_sites(commissioning_status);
