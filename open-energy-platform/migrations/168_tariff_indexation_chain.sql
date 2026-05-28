-- Wave 39 — Offtaker PPA Tariff Indexation / CPI Escalation chain.
-- The ANNUAL repricing backbone of every long-term PPA: each contract fixes a
-- base tariff (R/MWh) at financial close and escalates it on each contract
-- anniversary by a published index (Stats SA CPI, PPI, or a CPI+forex blend).
-- The seller publishes the reference index, calculates the escalation factor,
-- issues an indexation notice, the offtaker reviews it, and the parties agree
-- the new tariff before it is applied to invoicing. A disagreement routes
-- through the dispute / recalculation / arbitration branches.
--
-- Sits alongside the one-off W22 PPA contract-execution chain (which sets the
-- base tariff) and the year-end W32 take-or-pay chain (which reconciles volume
-- against it). PPA execution sets the base; this chain reprices it every
-- anniversary; take-or-pay reconciles the volume.
--
-- Frameworks: NERSA ERA 2006 §4 tariff oversight + IFRS 16 lease
-- re-measurement + PPA indexation clauses.
--
-- 11-state P6 lifecycle (7 forward-to-applied + dispute branch + 3 terminals):
--   indexation_due → index_published → escalation_calculated → notice_issued
--     → under_review → tariff_agreed → applied
--   dispute branch: disputed → recalculated → notice_issued (reissue)
--                            → arbitrated (referred to NERSA / arbitration)
--   withdraw from any active state → withdrawn
--
-- Tiers (PPA scale — drive SLA dispute windows + reportability):
--   utility_scale — grid-scale IPP PPA; closest oversight (tightest dispute SLA)
--   commercial    — C&I wheeling PPA; mid
--   embedded      — embedded / SSEG PPA; lightest oversight
--
-- MIXED SLA: machinery windows uniform across tiers; dispute / recalculation
-- windows materiality-graded with utility_scale TIGHTEST.
--
-- Offtaker-write split: seller drives the indexation machinery; offtaker
-- reviews / agrees / disputes / refers. actor_party derived from the ACTION,
-- not the JWT role.
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/
-- source_wave (e.g. a W22 executed PPA spawns the indexation; a W32 take-or-pay
-- dispute can reveal an indexation error that escalates to arbitration).

CREATE TABLE IF NOT EXISTS oe_tariff_indexation (
  id                      TEXT PRIMARY KEY,
  indexation_number       TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event            TEXT,
  source_entity_type      TEXT,
  source_entity_id        TEXT,
  source_wave             TEXT,

  -- Seller (IPP / project company)
  seller_party_id         TEXT NOT NULL,
  seller_party_name       TEXT NOT NULL,

  -- Offtaker (buyer)
  offtaker_party_id       TEXT NOT NULL,
  offtaker_party_name     TEXT NOT NULL,

  -- Contract descriptors
  ppa_ref                 TEXT,
  project_name            TEXT NOT NULL,
  contract_tier           TEXT NOT NULL CHECK (contract_tier IN (
    'utility_scale', 'commercial', 'embedded'
  )),
  contract_year           INTEGER,          -- escalation anniversary (1..N)

  -- Indexation arithmetic
  base_tariff_zar_mwh     REAL,             -- tariff before this escalation
  index_type              TEXT,             -- CPI / PPI / CPI+forex
  index_reference_period  TEXT,             -- e.g. 2026-03 vs 2025-03
  index_value             REAL,             -- published index reading (%)
  escalation_factor       REAL,             -- multiplier applied to base
  proposed_tariff_zar_mwh REAL,             -- seller's proposed new tariff
  agreed_tariff_zar_mwh   REAL,             -- agreed / applied tariff
  annual_contract_value_zar REAL,           -- contract value at new tariff
  disputed_amount_zar     REAL,             -- value in dispute (delta)

  -- Refs
  index_ref               TEXT,
  notice_ref              TEXT,
  dispute_ref             TEXT,
  recalc_ref              TEXT,
  arbitration_ref         TEXT,

  -- Narrative
  calculation_basis       TEXT,
  notice_basis            TEXT,
  review_basis            TEXT,
  dispute_basis           TEXT,
  recalc_basis            TEXT,
  arbitration_basis       TEXT,
  reason_code             TEXT,
  rod_notes               TEXT,

  -- State + lifecycle
  chain_status            TEXT NOT NULL CHECK (chain_status IN (
    'indexation_due','index_published','escalation_calculated','notice_issued',
    'under_review','tariff_agreed','applied','disputed','recalculated',
    'arbitrated','withdrawn'
  )),
  indexation_due_at         TEXT NOT NULL,
  index_published_at        TEXT,
  escalation_calculated_at  TEXT,
  notice_issued_at          TEXT,
  under_review_at           TEXT,
  tariff_agreed_at          TEXT,
  applied_at                TEXT,
  disputed_at               TEXT,
  recalculated_at           TEXT,
  arbitrated_at             TEXT,
  withdrawn_at              TEXT,

  dispute_round            INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_tidx_status   ON oe_tariff_indexation(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_tidx_tier     ON oe_tariff_indexation(contract_tier);
CREATE INDEX IF NOT EXISTS idx_oe_tidx_seller   ON oe_tariff_indexation(seller_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_tidx_offtaker ON oe_tariff_indexation(offtaker_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_tidx_due      ON oe_tariff_indexation(indexation_due_at);
CREATE INDEX IF NOT EXISTS idx_oe_tidx_sla      ON oe_tariff_indexation(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_tariff_indexation_events (
  id              TEXT PRIMARY KEY,
  indexation_id   TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_tidx_events_idx  ON oe_tariff_indexation_events(indexation_id);
CREATE INDEX IF NOT EXISTS idx_oe_tidx_events_type ON oe_tariff_indexation_events(event_type);
