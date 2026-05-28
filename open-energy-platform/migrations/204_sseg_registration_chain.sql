-- Wave 57 — Regulator Embedded-Generation Registration & Schedule 2 Exemption chain.
-- NERSA registration of small-scale / embedded generation under the Electricity
-- Regulation Act 4 of 2006 Schedule 2 (as amended 2021/2023). Schedule 2 lists
-- generation activities EXEMPT from holding a licence; the 2023 amendment removed
-- the upper capacity limit for own-use generation. Exempt facilities above the
-- de-minimis threshold must still REGISTER with NERSA.
--
-- The LIGHT-TOUCH front-end sibling of W49 full licensing. A registration
-- committee determines whether a facility qualifies for the Schedule 2 exemption,
-- then registers it, refuses it, or REFERS it UP to the W49 licensing pipeline
-- (generation for sale / trading / export, or a configuration outside Schedule 2).
-- Unlike W49 there is NO mandatory public-participation step — that lightness is
-- the W57 distinction.
--
-- 12-state P6 lifecycle:
--   registration_received → eligibility_screening → technical_verification
--     → exemption_determination → registration_approved → registered
--   conditional-approval loop: exemption_determination → conditions_pending → registration_approved
--   information-gap loop:       eligibility_screening → information_requested → eligibility_screening
--   referral (W57 SIGNATURE):   exemption_determination → referred_to_licensing  (hands off to W49)
--   refusal:                    exemption_determination → refused
--   early withdraw:             registration_received|eligibility_screening|information_requested|technical_verification|exemption_determination|conditions_pending → withdrawn
--   lapse:                      information_requested → lapsed
--
-- Tiers (by installed capacity — drive SLA windows + reportability):
--   micro   — < 100 kW    | small  — < 1 MW     | medium — < 10 MW
--   large   — < 100 MW    | utility — ≥ 100 MW
--
-- INVERTED SLA: the bigger the embedded generator, the MORE time every window
-- allows. Windows are SHORTER than W49 licensing — registration is light-touch.
--
-- Reportability: refer_to_licensing crosses for EVERY tier (kicking a facility
-- into the full licensing pipeline — universal, the W57 signature); refuse crosses
-- for the large + utility tiers only; sla_breached crosses for large + utility.
--
-- Two-party write split: the applicant files / supplies info / satisfies
-- conditions / withdraws; the regulator drives everything else. actor_party
-- (applicant/registry/verifier/committee) records the regulatory function per step.
-- The determination is made by a registration COMMITTEE administratively, NOT the
-- full Energy Regulator (Council) — another point of lightness vs W49.

CREATE TABLE IF NOT EXISTS oe_sseg_registrations (
  id                            TEXT PRIMARY KEY,
  registration_number           TEXT UNIQUE NOT NULL,

  -- Provenance (e.g. a connection agreement or commissioning event that triggered it)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (two-party split: applicant + NERSA registration officer)
  applicant_party_id            TEXT NOT NULL,
  applicant_party_name          TEXT NOT NULL,
  regulator_party_id            TEXT NOT NULL,
  regulator_party_name          TEXT NOT NULL,

  -- Registration identity
  capacity_tier                 TEXT NOT NULL CHECK (capacity_tier IN (
    'micro', 'small', 'medium', 'large', 'utility'
  )),
  generation_purpose            TEXT NOT NULL,     -- own_use / wheeling / trading / export
  technology                    TEXT,              -- solar_pv / wind / battery / gas / hydro / biomass / diesel
  customer_category             TEXT,              -- residential / commercial / industrial / agricultural / utility
  facility_name                 TEXT NOT NULL,
  facility_location             TEXT,              -- province / municipality
  capacity_kw                   REAL NOT NULL,     -- installed capacity (kW) — drives the tier
  point_of_connection           TEXT,              -- distribution / transmission point of supply
  distributor                   TEXT,              -- Eskom Distribution / municipality
  estimated_capex_zar_m         REAL,              -- estimated project capex (R millions)
  grid_connection_ref           TEXT,              -- W28 GCA / distributor connection approval ref

  -- Refs
  application_ref               TEXT,
  screening_ref                 TEXT,
  info_request_ref              TEXT,
  verification_ref              TEXT,
  determination_ref             TEXT,
  conditions_ref                TEXT,
  certificate_ref               TEXT,              -- issued NERSA registration certificate number
  licensing_referral_ref        TEXT,              -- W49 licence-application number it was referred to
  regulator_ref                 TEXT,              -- Council oversight / public register ref

  -- Narrative
  application_basis             TEXT,
  screening_basis               TEXT,
  info_request_basis            TEXT,
  verification_basis            TEXT,
  determination_basis           TEXT,
  conditions_basis              TEXT,
  approval_basis                TEXT,
  referral_basis                TEXT,
  refusal_basis                 TEXT,
  reason_code                   TEXT,
  rod_notes                     TEXT,              -- record of decision

  info_request_round            INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'registration_received','eligibility_screening','information_requested',
    'technical_verification','exemption_determination','conditions_pending',
    'registration_approved','registered','referred_to_licensing','refused',
    'withdrawn','lapsed'
  )),
  registration_received_at      TEXT NOT NULL,
  eligibility_screening_at      TEXT,
  information_requested_at      TEXT,
  technical_verification_at     TEXT,
  exemption_determination_at    TEXT,
  conditions_pending_at         TEXT,
  registration_approved_at      TEXT,
  registered_at                 TEXT,
  referred_to_licensing_at      TEXT,
  refused_at                    TEXT,
  withdrawn_at                  TEXT,
  lapsed_at                     TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_sseg_status    ON oe_sseg_registrations(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_sseg_tier      ON oe_sseg_registrations(capacity_tier);
CREATE INDEX IF NOT EXISTS idx_oe_sseg_purpose   ON oe_sseg_registrations(generation_purpose);
CREATE INDEX IF NOT EXISTS idx_oe_sseg_applicant ON oe_sseg_registrations(applicant_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_sseg_received  ON oe_sseg_registrations(registration_received_at);
CREATE INDEX IF NOT EXISTS idx_oe_sseg_sla       ON oe_sseg_registrations(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_sseg_registrations_events (
  id                 TEXT PRIMARY KEY,
  registration_id    TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_sseg_events_reg  ON oe_sseg_registrations_events(registration_id);
CREATE INDEX IF NOT EXISTS idx_oe_sseg_events_type ON oe_sseg_registrations_events(event_type);
