-- W225: Carbon Scope 3 Value Chain Emission Calculation & Third-Party Assurance
-- TCFD + ISSB IFRS S2 + GHG Protocol Scope 3 Standard + CDP mandatory reporting
CREATE TABLE IF NOT EXISTS oe_carbon_scope3_disclosures (
  id                          TEXT PRIMARY KEY,
  participant_id              TEXT NOT NULL,   -- carbon fund / reporting entity

  -- Classification
  s3_tier                     TEXT NOT NULL CHECK(s3_tier IN (
    'micro','standard','comprehensive','full_chain'
  )),
  reporting_year              INTEGER NOT NULL,
  entity_name                 TEXT,
  reporting_framework         TEXT CHECK(reporting_framework IN (
    'ghg_protocol','issb_ifrs_s2','cdp','tcfd','king_iv','integrated',NULL
  )),

  -- Category scope
  category_count              INTEGER,        -- number of Scope 3 categories in scope
  category_list               TEXT,           -- comma-separated cat numbers 1–15

  -- Data collection
  primary_data_coverage_pct   REAL,           -- % of spend/activity covered by primary data
  spend_based_pct             REAL,
  supplier_responses          INTEGER,        -- number of supplier data responses

  -- Calculated totals (tCO2e)
  scope3_total_tco2e          REAL,
  cat1_purchased_goods_tco2e  REAL,
  cat3_fuel_energy_tco2e      REAL,
  cat11_use_of_products_tco2e REAL,
  cat12_eol_treatment_tco2e   REAL,

  -- Assurance
  assurance_provider          TEXT,
  assurance_standard          TEXT,           -- AA1000AS, ISO 14064-3, ISAE 3000
  assurance_type              TEXT CHECK(assurance_type IN (
    'limited','reasonable','none',NULL
  )),
  assurance_completed_at      TEXT,
  qualified_opinion_reason    TEXT,

  -- Filing
  filing_platform             TEXT,           -- CDP, JSE, ISSB registry, SA Climate Registry
  filing_ref                  TEXT,
  filing_submitted_at         TEXT,

  -- Timeline
  categories_set_at           TEXT,
  data_collection_opened_at   TEXT,
  data_collection_closed_at   TEXT,
  calculations_completed_at   TEXT,
  review_completed_at         TEXT,

  chain_status                TEXT NOT NULL DEFAULT 'scope3_initiated' CHECK(chain_status IN (
    'scope3_initiated','category_boundaries_set','data_collection_open',
    'data_collection_complete','emission_calculations','calculations_reviewed',
    'assurance_submitted','limited_assurance_complete','reasonable_assurance_complete',
    'disclosure_filed','assurance_qualified','withdrawn'
  )),
  sla_deadline                TEXT NOT NULL,
  sla_breached                INTEGER NOT NULL DEFAULT 0,
  regulator_notified          INTEGER NOT NULL DEFAULT 0,

  actor_id                    TEXT,
  reason                      TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scope3_status
  ON oe_carbon_scope3_disclosures(chain_status);

CREATE INDEX IF NOT EXISTS idx_scope3_participant
  ON oe_carbon_scope3_disclosures(participant_id);

CREATE INDEX IF NOT EXISTS idx_scope3_year
  ON oe_carbon_scope3_disclosures(reporting_year);
