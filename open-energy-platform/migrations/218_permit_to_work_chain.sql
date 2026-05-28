-- Wave 64 — Esums Permit-to-Work (PTW) / LOTO Authorisation & Isolation Control.
-- The PROACTIVE safe-system-of-work GATE every hazardous field intervention must
-- pass BEFORE it starts: hazard assessed, an energy-isolation (lockout/tagout)
-- plan approved, isolation physically applied AND a zero-energy state verified
-- (test-for-dead), the permit issued, work done (with suspend/resume for shift
-- handover), and the permit closed (re-energise, remove locks, hand back area) —
-- or rejected at assessment, withdrawn pre-issue, or REVOKED under emergency /
-- isolation breach / unsafe condition.
--
-- Standards framing: OHSA 85/1993 (s.8 general duties), Construction Regulations
-- 2014, Electrical Machinery Regulations, General Machinery Regulations, and
-- standard REIPPPP O&M safe-system-of-work discipline. Complements W25 HSE
-- incident (REACTIVE) and gates W16 WO-dispatch / W59 PM-compliance execution.
--
-- 12-state P6 lifecycle:
--   permit_requested → hazard_assessment → isolation_pending →
--     isolation_confirmed → permit_issued → work_in_progress → work_complete
--     → permit_closed  (happy)
--   suspend/resume:  work_in_progress → suspended → work_in_progress
--   reject:          hazard_assessment | isolation_pending → permit_rejected
--   withdraw:        permit_requested | hazard_assessment | isolation_pending
--                    → withdrawn
--   revoke:          isolation_confirmed | permit_issued | work_in_progress |
--                    suspended → permit_revoked
--
-- Hazard tiers (composite hazard index 0..100; drive the URGENT SLA + crossing):
--   low < 20 / moderate < 40 / high < 60 / critical < 80 / catastrophic >= 80
--   TOP = {critical, catastrophic}.
--
-- The DISTINCTIVE W64 dimension is LIVE-WORK / ISOLATION INTEGRITY:
--   work_class IN (electrical_live, electrical_isolated, working_at_height,
--   confined_space, hot_work, lifting, excavation, general) and a live_work flag.
--
-- URGENT SLA: the more hazardous the permit, the TIGHTER the window (a hazardous
-- permit must not sit; work_in_progress is the max authorised work duration).
-- Terminals 0.
--
-- Reportability (the W64 signature is LIVE-WORK / ISOLATION-INTEGRITY driven, not
-- size-driven): issue_permit crosses for EVERY tier when the permit authorises
-- LIVE (energised) work OR a confined-space entry; a non-live, non-confined
-- permit crosses only for the top tiers. revoke_permit ALWAYS crosses (an
-- emergency revocation / isolation breach is always a reportable safety event).
-- SLA breaches cross for the top tiers only.
--
-- Single-party write {admin, support, ipp_developer} (same as W51/W59) — no
-- field-crew login; the Esums O&M operators record every party's action.
-- actor_party (issuing_authority / permit_holder) records the contractual
-- function per step, not the JWT role.

CREATE TABLE IF NOT EXISTS oe_permit_to_work (
  id                            TEXT PRIMARY KEY,
  permit_number                 TEXT UNIQUE NOT NULL,

  -- Provenance (the W16 work order / W59 PM task the permit authorises)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (single-party write; functional tagging only)
  holder_party_id               TEXT NOT NULL,     -- the working crew / contractor
  holder_party_name             TEXT NOT NULL,
  authority_party_id            TEXT NOT NULL,      -- issuing / responsible person
  authority_party_name          TEXT NOT NULL,
  isolating_authority_name      TEXT,              -- competent person who isolated

  -- The asset / location / work
  asset_name                    TEXT,              -- the plant / site
  equipment_tag                 TEXT,              -- specific equipment / circuit reference
  work_location                 TEXT,              -- where on site
  work_description              TEXT,
  work_class                    TEXT NOT NULL CHECK (work_class IN (
    'electrical_live','electrical_isolated','working_at_height',
    'confined_space','hot_work','lifting','excavation','general'
  )),
  method_statement_ref          TEXT,

  -- Hazard rating (the W64 signature)
  hazard_score                  REAL NOT NULL,     -- composite 0..100 (drives tier)
  hazard_tier                   TEXT NOT NULL CHECK (hazard_tier IN (
    'low','moderate','high','critical','catastrophic'
  )),
  live_work                     INTEGER NOT NULL DEFAULT 0,  -- energised-work authorisation
  energy_sources                TEXT,              -- electrical / mechanical / stored / chemical
  isolation_points              INTEGER,           -- number of isolation/lockout points
  permit_validity_hours         REAL,              -- authorised work-window duration

  -- Gates
  assessed_flag                 INTEGER NOT NULL DEFAULT 0,
  isolation_plan_approved       INTEGER NOT NULL DEFAULT 0,
  isolation_verified            INTEGER NOT NULL DEFAULT 0,
  permit_issued_flag            INTEGER NOT NULL DEFAULT 0,
  work_started_flag             INTEGER NOT NULL DEFAULT 0,
  work_completed_flag           INTEGER NOT NULL DEFAULT 0,
  closed_flag                   INTEGER NOT NULL DEFAULT 0,
  revoked_flag                  INTEGER NOT NULL DEFAULT 0,

  -- Refs
  request_ref                   TEXT,
  assessment_ref                TEXT,
  isolation_plan_ref            TEXT,
  isolation_cert_ref            TEXT,
  permit_ref                    TEXT,
  suspension_ref                TEXT,
  completion_ref                TEXT,
  closure_ref                   TEXT,
  rejection_ref                 TEXT,
  revocation_ref                TEXT,
  withdrawal_ref                TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  request_basis                 TEXT,
  assessment_basis              TEXT,
  isolation_basis               TEXT,
  issue_basis                   TEXT,
  suspension_basis              TEXT,
  completion_basis              TEXT,
  closure_basis                 TEXT,
  rejection_basis               TEXT,
  revocation_basis              TEXT,
  withdrawal_basis              TEXT,
  reason_code                   TEXT,
  notes                         TEXT,

  suspend_count                 INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'permit_requested','hazard_assessment','isolation_pending',
    'isolation_confirmed','permit_issued','work_in_progress','suspended',
    'work_complete','permit_closed','permit_rejected','permit_revoked','withdrawn'
  )),
  permit_requested_at           TEXT NOT NULL,
  hazard_assessment_at          TEXT,
  isolation_pending_at          TEXT,
  isolation_confirmed_at        TEXT,
  permit_issued_at              TEXT,
  work_in_progress_at           TEXT,
  suspended_at                  TEXT,
  work_complete_at              TEXT,
  permit_closed_at              TEXT,
  permit_rejected_at            TEXT,
  permit_revoked_at             TEXT,
  withdrawn_at                  TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ptw_status    ON oe_permit_to_work(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ptw_tier      ON oe_permit_to_work(hazard_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ptw_class     ON oe_permit_to_work(work_class);
CREATE INDEX IF NOT EXISTS idx_oe_ptw_holder    ON oe_permit_to_work(holder_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_ptw_authority ON oe_permit_to_work(authority_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_ptw_requested ON oe_permit_to_work(permit_requested_at);
CREATE INDEX IF NOT EXISTS idx_oe_ptw_sla       ON oe_permit_to_work(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_permit_to_work_events (
  id                 TEXT PRIMARY KEY,
  permit_id          TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ptw_events_p    ON oe_permit_to_work_events(permit_id);
CREATE INDEX IF NOT EXISTS idx_oe_ptw_events_type ON oe_permit_to_work_events(event_type);
