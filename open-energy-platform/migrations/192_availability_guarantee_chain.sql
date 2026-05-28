-- Wave 51 — Esums O&M Availability Guarantee & Liquidated Damages chain.
-- IEC 61724 / IEC 62446 PV O&M practice + standard REIPPPP O&M service
-- agreement availability-guarantee mechanics. 12-state P6 lifecycle for the
-- per-reporting-period reconciliation of contracted plant availability against
-- the O&M contractor's guaranteed availability.
--
-- The asset-management / availability counterpart to W24 (energy
-- performance-ratio underperformance) — availability is time-based uptime,
-- PR is energy-based yield; distinct contractual metrics.
--
-- 12-state P6 lifecycle:
--   period_open → measurement_submitted → adjustment_review → reconciled
--     → meets_guarantee → settled   (happy path)
--   shortfall: reconciled → shortfall_flagged → ld_assessed → settled
--              (optional cure: ld_assessed → cure_period → settled; waive_ld too)
--   dispute:   shortfall_flagged|ld_assessed|cure_period → disputed → dispute_resolved
--   early exit:period_open|measurement_submitted|adjustment_review → withdrawn
--
-- Shortfall-severity tiers (pp below guarantee; drive URGENT SLA + reportability):
--   minor_shortfall    — < 1 pp
--   moderate_shortfall — 1 to < 3 pp
--   material_shortfall — 3 to < 5 pp
--   severe_shortfall   — 5 to < 10 pp
--   critical_shortfall — >= 10 pp / sustained
--
-- URGENT SLA: the larger the shortfall, the TIGHTER the response window.
--
-- Reportability: flag_shortfall + resolve_dispute + sla_breached cross for
-- critical tiers (severe / critical) — security-of-supply concern.
--
-- Single-party write (no O&M-contractor login): Esums O&M operators record
-- every party's action; actor_party (asset_owner / om_contractor) records the
-- contractual function per step.

CREATE TABLE IF NOT EXISTS oe_availability_guarantees (
  id                            TEXT PRIMARY KEY,
  case_number                   TEXT UNIQUE NOT NULL,

  -- Provenance (e.g. a PR-underperformance escalation or a metering rollup)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (single-party write; contractual party captured via actor_party)
  owner_party_id                TEXT NOT NULL,
  owner_party_name              TEXT NOT NULL,
  contractor_party_id           TEXT NOT NULL,
  contractor_party_name         TEXT NOT NULL,

  -- Asset
  site_id                       TEXT,
  site_name                     TEXT NOT NULL,
  site_province                 TEXT,
  technology                    TEXT NOT NULL,     -- solar_pv / wind / bess / hydro / hybrid
  capacity_mw                   REAL,
  contract_ref                  TEXT,              -- O&M service agreement ref

  -- Reporting period
  reporting_period              TEXT NOT NULL,     -- e.g. 2026-04
  period_start                  TEXT,
  period_end                    TEXT,

  -- Availability figures (percentage points)
  guaranteed_availability_pct   REAL NOT NULL,     -- e.g. 98.0
  bonus_threshold_pct           REAL,              -- e.g. 99.5 (bonus above this)
  measured_availability_pct     REAL,              -- raw metered availability
  excused_downtime_hours        REAL,              -- grid / FM / owner-caused
  adjusted_availability_pct     REAL,              -- after excused-downtime credit
  shortfall_pp                  REAL,              -- guaranteed - adjusted (pp); <=0 means met

  -- Severity + money
  shortfall_tier                TEXT NOT NULL CHECK (shortfall_tier IN (
    'minor_shortfall','moderate_shortfall','material_shortfall',
    'severe_shortfall','critical_shortfall'
  )),
  ld_rate_zar_per_pp            REAL,              -- liquidated damages per pp
  ld_cap_zar                    REAL,              -- LD cap (R)
  ld_assessed_zar               REAL,              -- assessed LD (R)
  bonus_zar                     REAL,              -- availability bonus (R)
  settlement_zar                REAL,              -- net settlement (R)

  -- Refs
  measurement_ref               TEXT,
  adjustment_ref                TEXT,
  reconciliation_ref            TEXT,
  ld_assessment_ref             TEXT,
  cure_plan_ref                 TEXT,
  settlement_ref                TEXT,
  dispute_ref                   TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  measurement_basis             TEXT,
  adjustment_basis              TEXT,
  shortfall_basis               TEXT,
  ld_basis                      TEXT,
  cure_plan                     TEXT,
  settlement_basis              TEXT,
  dispute_basis                 TEXT,
  reason_code                   TEXT,
  notes                         TEXT,

  dispute_round                 INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'period_open','measurement_submitted','adjustment_review','reconciled',
    'meets_guarantee','shortfall_flagged','ld_assessed','cure_period',
    'settled','disputed','dispute_resolved','withdrawn'
  )),
  period_open_at                TEXT NOT NULL,
  measurement_submitted_at      TEXT,
  adjustment_review_at          TEXT,
  reconciled_at                 TEXT,
  meets_guarantee_at            TEXT,
  shortfall_flagged_at          TEXT,
  ld_assessed_at                TEXT,
  cure_period_at                TEXT,
  settled_at                    TEXT,
  disputed_at                   TEXT,
  dispute_resolved_at           TEXT,
  withdrawn_at                  TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_availg_status     ON oe_availability_guarantees(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_availg_tier       ON oe_availability_guarantees(shortfall_tier);
CREATE INDEX IF NOT EXISTS idx_oe_availg_contractor ON oe_availability_guarantees(contractor_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_availg_period     ON oe_availability_guarantees(reporting_period);
CREATE INDEX IF NOT EXISTS idx_oe_availg_opened     ON oe_availability_guarantees(period_open_at);
CREATE INDEX IF NOT EXISTS idx_oe_availg_sla        ON oe_availability_guarantees(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_availability_guarantee_events (
  id                 TEXT PRIMARY KEY,
  guarantee_id       TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_availg_events_g    ON oe_availability_guarantee_events(guarantee_id);
CREATE INDEX IF NOT EXISTS idx_oe_availg_events_type ON oe_availability_guarantee_events(event_type);
