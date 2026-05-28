-- Wave 41 — OEM-Support ITIL Problem Management chain.
-- Root-cause management of recurring / systemic incidents — the proactive,
-- structural complement to the reactive per-ticket W14 incident management
-- (and distinct from W15 RMA + W35 vendor-escalation). The unit of work is the
-- underlying CAUSE: take a pattern of recurring incidents, find and document
-- the root cause, register a Known Error with a workaround, drive a permanent
-- fix through change management, deploy it, and verify the incidents stop.
--
-- Frameworks: ITIL 4 Problem Management practice + ISO/IEC 20000-1 §8.6.3.
--
-- 12-state P6 lifecycle (9 forward + escalation/cancel branches + 3 terminals):
--   problem_logged → categorized → investigating → rca_identified →
--     known_error → fix_proposed → change_raised → fix_deployed →
--     resolution_verified → closed
--   workaround short-circuit: known_error → closed (accept_workaround)
--   escalation branch: investigating|rca_identified|known_error → escalated
--   early cancel: problem_logged|categorized|investigating → cancelled
--
-- Tiers (ITIL impact × urgency — drive SLA windows + reportability):
--   major_problem — widespread / service-critical; market-availability risk; tightest
--   significant   — notable recurring impact
--   minor         — low-impact recurring nuisance; loosest
--
-- URGENT SLA: the more severe the priority, the TIGHTER every window.
--
-- Write model: SINGLE-PARTY {admin, support} — no access split (unlike the
-- W37–W40 two-party chains). actor_party records the ITIL FUNCTIONAL party
-- (problem_manager / resolver / change_mgmt) for audit attribution only.
--
-- Reportability: MAJOR PROBLEMS ONLY cross into the regulator inbox
-- (escalate + close + sla_breached for major_problem) — problem management is
-- internal IT/OT operations; only a major problem touching a regulated platform
-- service is notifiable.
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/
-- source_wave (e.g. a cluster of W14 tickets spawns a problem record).

CREATE TABLE IF NOT EXISTS oe_problem_records (
  id                       TEXT PRIMARY KEY,
  problem_number           TEXT UNIQUE NOT NULL,

  -- Provenance (e.g. the recurring W14 ticket pattern that triggered this)
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,

  -- Owning support / problem-management team
  owner_party_id           TEXT NOT NULL,
  owner_party_name         TEXT NOT NULL,

  -- Affected service / customer set
  service_name             TEXT NOT NULL,
  affected_tenant          TEXT,              -- tenant / customer most affected (nullable = platform-wide)
  problem_category         TEXT,              -- software / infrastructure / integration / data / process
  problem_priority         TEXT NOT NULL CHECK (problem_priority IN (
    'major_problem', 'significant', 'minor'
  )),
  recurring_incident_count INTEGER NOT NULL DEFAULT 0,  -- # of linked incidents that motivated the problem

  -- Refs
  known_error_ref          TEXT,              -- KEDB entry id
  change_request_ref       TEXT,              -- RFC raised into change management
  major_problem_ref        TEXT,              -- major-problem review / governance docket
  regulator_ref            TEXT,              -- regulator notification ref (major problems only)

  -- Narrative
  problem_summary          TEXT,
  investigation_basis      TEXT,
  rca_basis                TEXT,
  known_error_basis        TEXT,
  fix_basis                TEXT,
  change_basis             TEXT,
  verification_basis       TEXT,
  workaround               TEXT,
  reason_code              TEXT,
  closure_notes            TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'problem_logged','categorized','investigating','rca_identified',
    'known_error','fix_proposed','change_raised','fix_deployed',
    'resolution_verified','closed','escalated','cancelled'
  )),
  problem_logged_at        TEXT NOT NULL,
  categorized_at           TEXT,
  investigating_at         TEXT,
  rca_identified_at        TEXT,
  known_error_at           TEXT,
  fix_proposed_at          TEXT,
  change_raised_at         TEXT,
  fix_deployed_at          TEXT,
  resolution_verified_at   TEXT,
  closed_at                TEXT,
  escalated_at             TEXT,
  cancelled_at             TEXT,

  is_reportable            INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_prob_status   ON oe_problem_records(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_prob_priority ON oe_problem_records(problem_priority);
CREATE INDEX IF NOT EXISTS idx_oe_prob_owner    ON oe_problem_records(owner_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_prob_service  ON oe_problem_records(service_name);
CREATE INDEX IF NOT EXISTS idx_oe_prob_logged   ON oe_problem_records(problem_logged_at);
CREATE INDEX IF NOT EXISTS idx_oe_prob_sla      ON oe_problem_records(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_problem_records_events (
  id              TEXT PRIMARY KEY,
  problem_id      TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_prob_events_prob ON oe_problem_records_events(problem_id);
CREATE INDEX IF NOT EXISTS idx_oe_prob_events_type ON oe_problem_records_events(event_type);
