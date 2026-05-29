-- Wave 73 — Carbon PoA / Programme-of-Activities Sub-Project (CPA) Inclusion &
-- Conformance chain. The ONE-TO-MANY operational layer of the carbon portfolio:
-- a Programme of Activities (CDM PoA / Gold Standard GS4GG programme / Verra
-- grouped project) is registered ONCE, then individual Component Project
-- Activities (CPAs) are screened in over the programme lifetime, gated on a
-- host-country Letter of Approval, and monitored/verified for ongoing
-- conformance with DELISTING (exclusion) if they stop conforming. The
-- standalone-project chains do not cover this: W37 registers a single project,
-- W11 verifies a monitoring period, W56 re-validates a crediting period, W65
-- sells reductions forward — W73 governs how component activities are screened
-- into and kept conformant within a registered programme.
--
-- The DISTINCTIVE move (beat best-in-class — CDM PoA / GS4GG / Verra grouped
-- projects, where CPA inclusion is slow, manual and paper-heavy, taking months):
-- automated eligibility scoring, a real-time double-counting / geographic-overlap
-- guard, programme-cap headroom checks, host-country LoA gating, and an
-- SLA-driven inclusion turnaround the desk can quote up front.
--
-- 12-state P6 lifecycle:
--   cpa_proposed -> eligibility_screening -> methodology_check -> loa_pending ->
--     inclusion_review -> included -> monitoring -> verified        (clean path)
--   monitoring loop: verified -> (continue_monitoring) -> monitoring -> verified
--   rejected   — failed eligibility / methodology / inclusion review
--   excluded   — DELISTED for non-conformance after inclusion (the W73 SIGNATURE)
--   withdrawn  — proponent pulls the CPA before inclusion
--   completed  — CPA reached end of crediting under the programme
--
-- Tiers — by estimated annual emission reductions (tCO2e/yr): micro <1k /
--   small <10k / medium <100k / large <500k / mega >=500k. Article 6 transfer
--   (corresponding adjustment required) floors at large.
--
-- INVERTED SLA: the LARGER the CPA, the LONGER every window (deeper diligence);
--   a micro CPA gets the shortest fast-track window — the point of a PoA.
--
-- Reportability (the W73 SIGNATURE is DELISTING-driven):
--   exclude_cpa crosses for EVERY tier; approve_inclusion crosses for EVERY tier
--   when a corresponding adjustment is required, else for large+mega; reject_cpa
--   and sla_breached cross for large+mega.
--
-- Single carbon-fund desk write {admin, carbon_fund} (same single-party model as
-- W37/W11/W17/W42/W48/W56/W65). actor_party (proponent / coordinating_entity /
-- dna / vvb) records the functional owner per step, not the JWT role.

CREATE TABLE IF NOT EXISTS oe_poa_cpa_inclusions (
  id                              TEXT PRIMARY KEY,
  cpa_number                      TEXT UNIQUE NOT NULL,

  -- Provenance (the W37 registration / W11 MRV that generated the demand)
  source_event                    TEXT,
  source_entity_type              TEXT,
  source_entity_id                TEXT,
  source_wave                     TEXT,

  -- Programme (umbrella) + CPA (component) identity
  programme_id                    TEXT NOT NULL,
  programme_name                  TEXT,
  registry_standard               TEXT,
  methodology_id                  TEXT,
  cpa_ref                         TEXT,
  cpa_name                        TEXT,
  proponent_party_id              TEXT,
  proponent_party_name            TEXT,
  coordinating_entity_name        TEXT,
  dna_name                        TEXT,
  vvb_name                        TEXT,
  host_country                    TEXT,
  geo_key                         TEXT,                  -- erf/parcel/grid-node id for overlap check

  -- Classification
  transfer_type                   TEXT NOT NULL CHECK (transfer_type IN (
    'article6','voluntary','compliance'
  )),
  cpa_tier                        TEXT NOT NULL CHECK (cpa_tier IN (
    'micro','small','medium','large','mega'
  )),
  annual_er_tco2e                 REAL NOT NULL DEFAULT 0,   -- drives the tier
  requires_corresponding_adjustment INTEGER NOT NULL DEFAULT 0,
  corresponding_adjustment_ref    TEXT,

  -- Programme economics
  programme_cap_er_tco2e          REAL DEFAULT 0,
  included_er_tco2e               REAL DEFAULT 0,           -- ER already included in programme
  programme_headroom_tco2e        REAL DEFAULT 0,
  vintage_year                    INTEGER,
  crediting_period_start          TEXT,
  crediting_period_end            TEXT,

  -- Eligibility scoring (beat best-in-class)
  methodology_applicability       REAL DEFAULT 0,           -- 0..1
  additionality_strength          REAL DEFAULT 0,           -- 0..1
  monitoring_readiness            REAL DEFAULT 0,           -- 0..1
  loa_confidence                  REAL DEFAULT 0,           -- 0..1
  eligibility_score               INTEGER DEFAULT 0,        -- 0..100
  predicted_inclusion_days        INTEGER DEFAULT 0,

  -- Gates
  screened_flag                   INTEGER NOT NULL DEFAULT 0,
  methodology_ok_flag             INTEGER NOT NULL DEFAULT 0,
  loa_received_flag               INTEGER NOT NULL DEFAULT 0,
  inclusion_submitted_flag        INTEGER NOT NULL DEFAULT 0,
  included_flag                   INTEGER NOT NULL DEFAULT 0,
  verified_flag                   INTEGER NOT NULL DEFAULT 0,

  -- Refs
  screening_ref                   TEXT,
  methodology_ref                 TEXT,
  loa_ref                         TEXT,
  inclusion_ref                   TEXT,
  monitoring_ref                  TEXT,
  verification_ref                TEXT,
  exclusion_ref                   TEXT,
  rejection_ref                   TEXT,
  withdrawal_ref                  TEXT,
  completion_ref                  TEXT,
  regulator_ref                   TEXT,

  -- Narrative
  proposal_basis                  TEXT,
  screening_basis                 TEXT,
  methodology_basis               TEXT,
  loa_basis                       TEXT,
  inclusion_basis                 TEXT,
  monitoring_basis                TEXT,
  verification_basis              TEXT,
  exclusion_basis                 TEXT,
  rejection_basis                 TEXT,
  withdrawal_basis                TEXT,
  completion_basis                TEXT,
  reason_code                     TEXT,
  cpa_summary                     TEXT,

  monitoring_round                INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                    TEXT NOT NULL CHECK (chain_status IN (
    'cpa_proposed','eligibility_screening','methodology_check','loa_pending',
    'inclusion_review','included','monitoring','verified',
    'rejected','excluded','withdrawn','completed'
  )),
  cpa_proposed_at                 TEXT NOT NULL,
  eligibility_screening_at        TEXT,
  methodology_check_at            TEXT,
  loa_pending_at                  TEXT,
  inclusion_review_at             TEXT,
  included_at                     TEXT,
  monitoring_at                   TEXT,
  verified_at                     TEXT,
  rejected_at                     TEXT,
  excluded_at                     TEXT,
  withdrawn_at                    TEXT,
  completed_at                    TEXT,

  is_reportable                   INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                 TEXT,
  last_sla_breach_at              TEXT,
  escalation_level                INTEGER NOT NULL DEFAULT 0,

  created_by                      TEXT NOT NULL,
  created_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_poa_status      ON oe_poa_cpa_inclusions(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_poa_tier        ON oe_poa_cpa_inclusions(cpa_tier);
CREATE INDEX IF NOT EXISTS idx_oe_poa_programme   ON oe_poa_cpa_inclusions(programme_id);
CREATE INDEX IF NOT EXISTS idx_oe_poa_transfer    ON oe_poa_cpa_inclusions(transfer_type);
CREATE INDEX IF NOT EXISTS idx_oe_poa_geo         ON oe_poa_cpa_inclusions(geo_key);
CREATE INDEX IF NOT EXISTS idx_oe_poa_proposed    ON oe_poa_cpa_inclusions(cpa_proposed_at);
CREATE INDEX IF NOT EXISTS idx_oe_poa_sla         ON oe_poa_cpa_inclusions(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_poa_cpa_inclusions_events (
  id                 TEXT PRIMARY KEY,
  inclusion_id       TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_poa_events_i    ON oe_poa_cpa_inclusions_events(inclusion_id);
CREATE INDEX IF NOT EXISTS idx_oe_poa_events_type ON oe_poa_cpa_inclusions_events(event_type);
