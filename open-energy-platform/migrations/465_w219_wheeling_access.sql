-- W219: Offtaker Wheeling Access Application & Third-Party Access Agreement
-- NERSA Grid Code §10 + ERA §21 — offtaker-side access for wheeled renewable energy
CREATE TABLE IF NOT EXISTS oe_wheeling_access (
  id                        TEXT PRIMARY KEY,
  participant_id            TEXT NOT NULL,   -- offtaker requesting wheeling access

  -- Access classification
  wheel_tier                TEXT NOT NULL CHECK(wheel_tier IN (
    'small_embedded','medium_distributed','large_industrial','bulk_transmission'
  )),
  requested_capacity_mw     REAL,            -- MW of wheeled capacity requested
  wheeling_distance_km      REAL,            -- approximate wheeling distance
  voltage_level_kv          REAL,            -- connection voltage (11/33/66/132/400 kV)

  -- Underlying references
  ipp_ref                   TEXT,            -- linked IPP / generator (W20 / W28 GCA)
  gca_ref                   TEXT,            -- linked Grid Connection Agreement (W28)
  ppa_ref                   TEXT,            -- linked PPA (W22)
  wheeling_route_description TEXT,

  -- Grid operator study results
  feasibility_ref           TEXT,
  feasibility_completed_at  TEXT,
  impact_study_ref          TEXT,
  impact_completed_at       TEXT,
  network_constraints       TEXT,            -- findings from impact study

  -- Agreement terms
  indicative_terms_ref      TEXT,
  terms_issued_at           TEXT,
  negotiation_started_at    TEXT,
  agreement_ref             TEXT,            -- signed wheeling access agreement number
  agreement_signed_at       TEXT,
  agreement_expiry          TEXT,            -- term of agreement
  wheeling_charge_tariff    TEXT,            -- agreed tariff class (links to W8)

  -- Modification
  modification_description  TEXT,
  modification_requested_at TEXT,

  -- Renewal
  renewal_due_date          TEXT,

  -- Termination
  termination_reason        TEXT,
  terminated_at             TEXT,

  chain_status              TEXT NOT NULL DEFAULT 'access_application' CHECK(chain_status IN (
    'access_application','feasibility_study','impact_assessment','terms_proposed',
    'negotiation','agreement_signed','active','modification_requested','renewal_due',
    'terminated','expired','withdrawn'
  )),
  sla_deadline              TEXT NOT NULL,
  sla_breached              INTEGER NOT NULL DEFAULT 0,
  regulator_notified        INTEGER NOT NULL DEFAULT 0,

  actor_id                  TEXT,
  reason                    TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wa_status
  ON oe_wheeling_access(chain_status);

CREATE INDEX IF NOT EXISTS idx_wa_participant
  ON oe_wheeling_access(participant_id);

CREATE INDEX IF NOT EXISTS idx_wa_ipp
  ON oe_wheeling_access(ipp_ref);
