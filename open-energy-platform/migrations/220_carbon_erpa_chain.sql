-- Wave 65 — Carbon ERPA (Emission Reduction Purchase Agreement) Forward Delivery
-- & Make-Good chain. The commercial FORWARD-SALE contract that sits on top of the
-- carbon-credit lifecycle: a buyer contracts today to purchase a volume of a
-- project's future emission reductions, and the seller (project developer) must
-- DELIVER that volume against a delivery schedule. A short delivery triggers a
-- MAKE-GOOD obligation (re-deliver replacement reductions, or settle the gap).
--
-- Where W37 registers a project, W11 verifies each monitoring period, W56
-- re-validates the crediting period, W17 retires the credit and W48 monetises the
-- tax offset, THIS chain governs how reductions are SOLD FORWARD and physically
-- delivered against a binding purchase agreement.
--
-- 12-state P6 lifecycle (forward path + shortfall/make-good + dispute + 3 terminals):
--   erpa_drafted → erpa_executed → delivery_scheduled → delivery_initiated
--     → delivery_verified → settled → completed             (clean delivery)
--   shortfall/make-good: delivery_initiated → shortfall_flagged → make_good_pending
--     → (initiate_delivery) → delivery_initiated → …         (re-deliver)
--     shortfall_flagged | make_good_pending → settled         (settle the gap)
--   dispute:  delivery_verified | settled → disputed → (resolve_dispute) → settled
--   terminated: any executed/active state → terminated
--   withdrawn:  erpa_drafted | erpa_executed → withdrawn
--
-- Tiers (contracted volume tCO2e — drive SLA + reportability):
--   minor <10k / moderate <100k / material <500k / major <2m / mega >=2m
--
-- INVERTED SLA: mega gets the LONGEST window at every active stage (a high-volume
-- forward sale warrants a longer delivery and verification horizon — same flavour
-- as W56 / W48).
--
-- Single-party write {admin, carbon_fund}; actor_party records the functional
-- party (seller / buyer / registry) for audit attribution only.
--
-- Reportability (the W65 signature — CORRESPONDING-ADJUSTMENT driven):
--   verify_delivery crosses for EVERY tier when the transfer requires a
--   corresponding adjustment (transfer_type = 'article6' — an ITMO needing an NDC
--   correction at delivery); else only for the large tiers (major + mega).
--   terminate + SLA breaches cross for the large tiers (major + mega).
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/source_wave.

CREATE TABLE IF NOT EXISTS oe_carbon_erpas (
  id                       TEXT PRIMARY KEY,
  erpa_number              TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,

  -- Project + standard + counterparties
  project_id               TEXT NOT NULL,
  project_name             TEXT NOT NULL,
  registry_standard        TEXT NOT NULL CHECK (registry_standard IN (
    'verra_vcs','gold_standard','article_6_4','cdm'
  )),
  methodology_id           TEXT,
  seller_party_id          TEXT NOT NULL,
  seller_party_name        TEXT NOT NULL,
  buyer_party_id           TEXT NOT NULL,
  buyer_party_name         TEXT NOT NULL,

  -- Commercial descriptors
  transfer_type            TEXT NOT NULL CHECK (transfer_type IN (
    'article6','voluntary','compliance'
  )),
  volume_tier              TEXT NOT NULL CHECK (volume_tier IN (
    'minor','moderate','material','major','mega'
  )),
  contracted_volume_tco2e  REAL,               -- total contracted forward volume
  delivered_volume_tco2e   REAL,               -- cumulative delivered so far
  shortfall_volume_tco2e   REAL,               -- contracted - delivered when short
  price_per_tco2e          REAL,
  contract_currency        TEXT,               -- ZAR / USD / EUR
  contract_value           REAL,               -- price * volume
  vintage_year             INTEGER,            -- credit vintage delivered
  host_country             TEXT,               -- NDC host (corresponding-adjustment)
  corresponding_adjustment_required INTEGER NOT NULL DEFAULT 0,
  corresponding_adjustment_ref      TEXT,      -- the CA authorisation reference
  delivery_window_start    TEXT,
  delivery_window_end      TEXT,

  -- Refs
  erpa_ref                 TEXT,
  delivery_ref             TEXT,
  verification_ref         TEXT,
  settlement_ref           TEXT,
  dispute_ref              TEXT,

  -- Narrative
  execution_basis          TEXT,
  schedule_basis           TEXT,
  delivery_basis           TEXT,
  verification_basis       TEXT,
  shortfall_basis          TEXT,
  make_good_basis          TEXT,
  settlement_basis         TEXT,
  dispute_basis            TEXT,
  termination_basis        TEXT,
  reason_code              TEXT,
  erpa_summary             TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'erpa_drafted','erpa_executed','delivery_scheduled','delivery_initiated',
    'delivery_verified','shortfall_flagged','make_good_pending','settled',
    'completed','disputed','terminated','withdrawn'
  )),
  drafted_at               TEXT NOT NULL,
  executed_at              TEXT,
  delivery_scheduled_at    TEXT,
  delivery_initiated_at    TEXT,
  delivery_verified_at     TEXT,
  shortfall_flagged_at     TEXT,
  make_good_pending_at     TEXT,
  settled_at               TEXT,
  completed_at             TEXT,
  disputed_at              TEXT,
  terminated_at            TEXT,
  withdrawn_at             TEXT,

  delivery_round           INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  is_reportable            INTEGER NOT NULL DEFAULT 0,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_erpa_status    ON oe_carbon_erpas(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_erpa_tier      ON oe_carbon_erpas(volume_tier);
CREATE INDEX IF NOT EXISTS idx_oe_erpa_project   ON oe_carbon_erpas(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_erpa_transfer  ON oe_carbon_erpas(transfer_type);
CREATE INDEX IF NOT EXISTS idx_oe_erpa_window    ON oe_carbon_erpas(delivery_window_end);
CREATE INDEX IF NOT EXISTS idx_oe_erpa_sla       ON oe_carbon_erpas(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_carbon_erpas_events (
  id              TEXT PRIMARY KEY,
  erpa_id         TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_erpa_events_erpa ON oe_carbon_erpas_events(erpa_id);
CREATE INDEX IF NOT EXISTS idx_oe_erpa_events_type ON oe_carbon_erpas_events(event_type);
