-- 100_regulator_p6.sql
-- Wave 5: P6-grade regulator portal — closes the observation loop so the
-- regulator side actually sees Wave 3 (clearing disclosure) and Wave 4
-- (Article 6 UNFCCC posts) events, plus the existing surveillance /
-- enforcement / licence streams, in one auditable inbox with SLA-driven
-- auto-escalation and outbound compliance-notice tracking.
--
-- Tables:
--   oe_regulator_inbox            — every regulator-relevant cascade event
--                                    landed as a single row with ack lifecycle
--   oe_regulator_escalation_rules — SLA rules (window, event filter, action)
--   oe_compliance_notices         — outbound notices to licensees with remedy
--                                    deadlines + cron-driven SLA breach state
--
-- All CREATE TABLE IF NOT EXISTS; safe to re-apply.

-- ── Regulator inbox ──────────────────────────────────────────────────────
-- A single regulator-side feed. Materialised by handleSpecialCascades for
-- a curated set of event types (clearing.disclosure.published,
-- carbon.article6.unfccc_posted, regulator_enforcement_cases mutations,
-- surveillance alerts at severity ≥ medium, licence vary/suspend/revoke).
CREATE TABLE IF NOT EXISTS oe_regulator_inbox (
  id                  TEXT PRIMARY KEY,
  source_event        TEXT NOT NULL,          -- 'clearing.disclosure.published' etc.
  source_entity_type  TEXT NOT NULL,
  source_entity_id    TEXT NOT NULL,
  severity            TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','low','medium','high','critical')),
  title               TEXT NOT NULL,
  body_json           TEXT,                   -- JSON copy of cascade ctx.data
  ack_status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (ack_status IN ('pending','acknowledged','escalated','dismissed')),
  assigned_to         TEXT,                   -- user_id of the regulator handler
  ack_by              TEXT,
  ack_at              TEXT,
  ack_note            TEXT,
  escalated_at        TEXT,
  escalated_to_case   TEXT,                   -- regulator_enforcement_cases.id
  sla_due_at          TEXT,                   -- computed at insert from severity
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_inbox_status   ON oe_regulator_inbox(ack_status);
CREATE INDEX IF NOT EXISTS idx_oe_inbox_event    ON oe_regulator_inbox(source_event);
CREATE INDEX IF NOT EXISTS idx_oe_inbox_assignee ON oe_regulator_inbox(assigned_to);
CREATE INDEX IF NOT EXISTS idx_oe_inbox_sla      ON oe_regulator_inbox(sla_due_at);

-- ── Escalation rules ────────────────────────────────────────────────────
-- An auditable rule set the cron applies on each scan. Matched rows whose
-- sla_due_at has passed and which are still 'pending' get bumped to
-- 'escalated' and (optionally) an enforcement case is opened.
CREATE TABLE IF NOT EXISTS oe_regulator_escalation_rules (
  id                  TEXT PRIMARY KEY,
  rule_code           TEXT NOT NULL UNIQUE,
  description         TEXT NOT NULL,
  event_pattern       TEXT NOT NULL,          -- glob-ish; matches against source_event
  severity_min        TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity_min IN ('info','low','medium','high','critical')),
  sla_minutes         INTEGER NOT NULL,       -- minutes between created_at and sla_due_at
  on_breach           TEXT NOT NULL DEFAULT 'escalate'
    CHECK (on_breach IN ('escalate','open_case','notify_only')),
  enabled             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Outbound compliance notices ─────────────────────────────────────────
-- When a finding is made or an alert escalated, the regulator issues a
-- compliance notice to the licensee. Tracks remedy_deadline_at, follow-up
-- status, and ties back to source enforcement case / inbox row.
CREATE TABLE IF NOT EXISTS oe_compliance_notices (
  id                  TEXT PRIMARY KEY,
  licensee_user_id    TEXT NOT NULL,          -- the participant who must respond
  source_case_id      TEXT,                   -- regulator_enforcement_cases.id
  source_inbox_id     TEXT,                   -- oe_regulator_inbox.id
  notice_type         TEXT NOT NULL
    CHECK (notice_type IN ('remediation','warning','penalty','suspension','revocation','information_request')),
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  remedy_deadline_at  TEXT,                   -- ISO ts; cron flags overdue
  status              TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued','acknowledged','satisfied','overdue','escalated','withdrawn')),
  acknowledged_at     TEXT,
  satisfied_at        TEXT,
  satisfied_evidence  TEXT,                   -- regulator-side note or URL
  overdue_flagged_at  TEXT,
  issued_by           TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_notice_licensee  ON oe_compliance_notices(licensee_user_id);
CREATE INDEX IF NOT EXISTS idx_oe_notice_status    ON oe_compliance_notices(status);
CREATE INDEX IF NOT EXISTS idx_oe_notice_deadline  ON oe_compliance_notices(remedy_deadline_at);
