-- Wave 47 — OEM-Support ITIL Change Enablement chain.
-- The RFC (Request for Change) lifecycle — the third member of the ITIL service
-- management family on the support profile, after W14 incident management and
-- W41 problem management. W41 hands off here: its raise_change action raises an
-- RFC that THIS chain governs. The unit of work is a proposed CHANGE to a
-- service / configuration item — assess its risk, authorise it through the
-- Change Advisory Board (CAB) or the emergency ECAB fast-path, schedule it,
-- implement it in a change window, run a post-implementation review (PIR), and
-- close it — OR back it out if it fails (a change-induced incident).
--
-- Frameworks: ITIL 4 Change Enablement practice + ISO/IEC 20000-1 §8.5.1.
--
-- 12-state P6 lifecycle (8 forward + emergency/reject/backout/cancel branches
-- + 4 terminals):
--   change_requested → assessment → cab_review → approved → scheduled →
--     implementing → implemented → pir → closed
--   emergency fast-path (ECAB): assessment → approved (emergency_approve)
--   rejection branch: cab_review → rejected
--   backout branch: implementing|implemented → rolled_back
--   early cancel: change_requested|assessment|cab_review|approved|scheduled → cancelled
--
-- Change classes (ITIL change types — drive SLA windows + reportability):
--   emergency_change — restore/repair a degraded or critical service; ECAB; tightest
--   normal_change    — full CAB-assessed + scheduled change; moderate
--   standard_change  — pre-authorised, low-risk, routine change; loosest
--
-- URGENT SLA: the more urgent the change class, the TIGHTER every window.
--
-- Write model: SINGLE-PARTY {admin, support} — no access split (same as W41).
-- actor_party records the ITIL FUNCTIONAL party (change_requester /
-- change_authority / implementer) for audit attribution only.
--
-- Reportability: change management is internal IT/OT operations; only the
-- highest-impact events touching a regulated platform service are notifiable:
--   roll_back         crosses for emergency_change + normal_change (change-induced failure)
--   emergency_approve crosses for emergency_change (ECAB bypasses CAB governance)
--   close             crosses for emergency_change (post-emergency-change report)
--   sla_breached      crosses for emergency_change
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/
-- source_wave (e.g. a W41 problem record raises an RFC into change management).

CREATE TABLE IF NOT EXISTS oe_change_requests (
  id                       TEXT PRIMARY KEY,
  change_number            TEXT UNIQUE NOT NULL,

  -- Provenance (e.g. the W41 problem record whose fix this RFC implements)
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,

  -- Owning change / implementer team
  owner_party_id           TEXT NOT NULL,
  owner_party_name         TEXT NOT NULL,

  -- Affected service / configuration item
  service_name             TEXT NOT NULL,
  affected_tenant          TEXT,              -- tenant / customer most affected (nullable = platform-wide)
  change_category          TEXT,              -- software / infrastructure / configuration / data / security
  change_class             TEXT NOT NULL CHECK (change_class IN (
    'emergency_change', 'normal_change', 'standard_change'
  )),
  affected_ci_count        INTEGER NOT NULL DEFAULT 0,  -- # of configuration items / services impacted

  -- Refs
  problem_ref              TEXT,              -- W41 problem / KEDB entry the change resolves
  cab_ref                  TEXT,              -- CAB / ECAB decision docket / minutes
  release_ref              TEXT,              -- release / deployment package id
  rollback_ref             TEXT,              -- backout record
  regulator_ref            TEXT,              -- regulator notification ref (emergency / governed only)

  -- Change window (forward schedule of change)
  scheduled_start_at       TEXT,
  scheduled_end_at         TEXT,

  -- Narrative
  change_summary           TEXT,
  assessment_basis         TEXT,
  cab_basis                TEXT,
  approval_basis           TEXT,
  schedule_basis           TEXT,
  implementation_basis     TEXT,
  verification_basis       TEXT,              -- PIR findings
  rollback_basis           TEXT,
  backout_plan             TEXT,              -- documented backout plan (every change carries one)
  reason_code              TEXT,
  closure_notes            TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'change_requested','assessment','cab_review','approved','scheduled',
    'implementing','implemented','pir','closed','rejected','rolled_back','cancelled'
  )),
  change_requested_at      TEXT NOT NULL,
  assessment_at            TEXT,
  cab_review_at            TEXT,
  approved_at              TEXT,
  scheduled_at             TEXT,
  implementing_at          TEXT,
  implemented_at           TEXT,
  pir_at                   TEXT,
  closed_at                TEXT,
  rejected_at              TEXT,
  rolled_back_at           TEXT,
  cancelled_at             TEXT,

  is_reportable            INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_chg_status  ON oe_change_requests(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_chg_class   ON oe_change_requests(change_class);
CREATE INDEX IF NOT EXISTS idx_oe_chg_owner   ON oe_change_requests(owner_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_chg_service ON oe_change_requests(service_name);
CREATE INDEX IF NOT EXISTS idx_oe_chg_req     ON oe_change_requests(change_requested_at);
CREATE INDEX IF NOT EXISTS idx_oe_chg_sla     ON oe_change_requests(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_change_requests_events (
  id              TEXT PRIMARY KEY,
  change_id       TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_chg_events_chg  ON oe_change_requests_events(change_id);
CREATE INDEX IF NOT EXISTS idx_oe_chg_events_type ON oe_change_requests_events(event_type);
