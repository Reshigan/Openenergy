-- Wave 37 — Carbon Project Registration / PDD Validation chain.
-- The FRONT END of the carbon credit lifecycle: a mitigation project goes from
-- idea (PIN) → full Project Design Document (PDD) → independent validation by a
-- VVB → public stakeholder consultation → host-country DNA authorization →
-- registry registration → active crediting period, at which point it hands off
-- to W11 (MRV verification), W17 (retirement), and W4 (Article 6 ITMO).
--
-- Standards: Gold Standard for the Global Goals + Verra VCS + CDM (legacy) +
-- Paris Agreement Article 6.4 mechanism + South Africa DFFE Designated National
-- Authority (DNA) Letter of Approval / host-country authorization.
--
-- 11-state P6 lifecycle (8 forward + 3 branch/terminal states):
--   pin_submitted → pdd_drafted → validation_underway → public_consultation →
--   dna_authorization → registration_requested → registered → crediting_active
--   + corrections_required (CAR loop) / rejected / withdrawn
--
-- Tiers (project type / scale — drive validation rigor + reportability):
--   afolu_redd  — land-use (REDD+/afforestation): permanence + leakage risk
--   large_scale — large-scale industrial / grid-connected renewable energy
--   small_scale — small-scale / programmatic (PoA), cookstoves
--
-- INVERTED SLA: higher-integrity-risk tier gets MORE time in every state.
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/
-- source_wave (e.g. a W12 Esums commissioned site or W20 COD project can spawn
-- a carbon project registration).

CREATE TABLE IF NOT EXISTS oe_carbon_registration (
  id                      TEXT PRIMARY KEY,
  project_number          TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event            TEXT,
  source_entity_type      TEXT,
  source_entity_id        TEXT,
  source_wave             TEXT,

  -- Developer (project proponent) party
  developer_party_id      TEXT NOT NULL,
  developer_party_name    TEXT NOT NULL,

  -- Validation & Verification Body (VVB) / DOE
  vvb_name                TEXT,

  -- Project descriptors
  project_name            TEXT NOT NULL,
  project_tier            TEXT NOT NULL CHECK (project_tier IN (
    'afolu_redd', 'large_scale', 'small_scale'
  )),
  standard                TEXT,           -- gold_standard / verra_vcs / cdm / article6
  methodology             TEXT,           -- e.g. VM0007, ACM0002, GS TPDDTEC
  province                TEXT,
  host_country            TEXT NOT NULL DEFAULT 'ZA',

  -- Crediting economics (estimated)
  crediting_years         INTEGER,
  estimated_annual_tco2e  REAL,
  estimated_total_tco2e   REAL,
  registered_serial_block TEXT,

  -- Refs
  pin_ref                 TEXT,
  pdd_ref                 TEXT,
  validation_ref          TEXT,
  car_ref                 TEXT,
  consultation_ref        TEXT,
  dna_authorization_ref   TEXT,
  registration_ref        TEXT,
  rejection_ref           TEXT,

  -- Narrative
  validation_basis        TEXT,
  corrections_basis       TEXT,
  consultation_basis      TEXT,
  dna_basis               TEXT,
  registration_basis      TEXT,
  rejection_basis         TEXT,
  withdrawal_basis        TEXT,
  reason_code             TEXT,
  rod_notes               TEXT,

  -- State + lifecycle
  chain_status            TEXT NOT NULL CHECK (chain_status IN (
    'pin_submitted','pdd_drafted','validation_underway','corrections_required',
    'public_consultation','dna_authorization','registration_requested',
    'registered','crediting_active','rejected','withdrawn'
  )),
  pin_submitted_at         TEXT NOT NULL,
  pdd_drafted_at           TEXT,
  validation_underway_at   TEXT,
  corrections_required_at  TEXT,
  public_consultation_at   TEXT,
  dna_authorization_at     TEXT,
  registration_requested_at TEXT,
  registered_at            TEXT,
  crediting_active_at      TEXT,
  rejected_at              TEXT,
  withdrawn_at             TEXT,

  car_round                INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_carbon_reg_status    ON oe_carbon_registration(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_carbon_reg_tier      ON oe_carbon_registration(project_tier);
CREATE INDEX IF NOT EXISTS idx_oe_carbon_reg_developer ON oe_carbon_registration(developer_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_carbon_reg_standard  ON oe_carbon_registration(standard);
CREATE INDEX IF NOT EXISTS idx_oe_carbon_reg_submitted ON oe_carbon_registration(pin_submitted_at);
CREATE INDEX IF NOT EXISTS idx_oe_carbon_reg_sla       ON oe_carbon_registration(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_carbon_registration_events (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_carbon_reg_events_project ON oe_carbon_registration_events(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_carbon_reg_events_type    ON oe_carbon_registration_events(event_type);
