-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 476 — Ecosystem Layer C: Cross-Role Push
-- Generalises the regulator-only oe_regulator_inbox to all 9 roles. Every
-- workstation reads its pending rows; completing one surfaces a cross-option.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_role_action_queue (
  id TEXT PRIMARY KEY,
  target_role TEXT NOT NULL,                 -- PlatformRole that must act
  target_participant_id TEXT,                -- optional: narrow to one participant
  source_event TEXT NOT NULL,
  source_chain_key TEXT,
  source_entity_type TEXT,
  source_entity_id TEXT,
  title TEXT NOT NULL,
  body_json TEXT DEFAULT '{}',
  cross_option_json TEXT,                    -- {action_label, target_route, prefill} for 1-click next step
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK(priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','acknowledged','actioned','dismissed','expired')),
  sla_due_at TEXT,
  actioned_by TEXT,
  actioned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_role_queue_role_status
  ON oe_role_action_queue(target_role, status);
CREATE INDEX IF NOT EXISTS idx_role_queue_participant_status
  ON oe_role_action_queue(target_participant_id, status);
CREATE INDEX IF NOT EXISTS idx_role_queue_source
  ON oe_role_action_queue(source_entity_type, source_entity_id);
