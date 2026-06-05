-- W212: IPP Revenue Bond / DSCR Reporting
-- REIPPPP Schedule 2 + DFI covenant requirements + Basel III/LMA
CREATE TABLE IF NOT EXISTS oe_dscr_reports (
  id                        TEXT PRIMARY KEY,
  participant_id            TEXT NOT NULL,   -- IPP developer

  -- Report identity
  dscr_tier                 TEXT NOT NULL CHECK(dscr_tier IN (
    'emerging','standard','large','systemically_important'
  )),
  reporting_period          TEXT NOT NULL,   -- e.g. "2025-Q1" or "2025-H1"
  report_date               TEXT,            -- date of actual report
  dfi_name                  TEXT,            -- primary DFI (IDC/DBSA/Nedbank/etc.)
  dfi_reference             TEXT,            -- DFI loan reference

  -- DSCR inputs
  net_revenue_zar           REAL,
  operating_costs_zar       REAL,
  debt_service_zar          REAL,            -- principal + interest
  dscr_value                REAL,            -- net_revenue / debt_service (after O&M)
  minimum_dscr_covenant     REAL DEFAULT 1.20,
  dscr_cushion              REAL,            -- dscr_value - minimum_dscr_covenant

  -- IE certification
  ie_name                   TEXT,
  ie_certification_ref      TEXT,
  ie_certified_at           TEXT,
  ie_comments               TEXT,

  -- DFI submission and queries
  dfi_submitted_at          TEXT,
  dfi_query_details         TEXT,
  dfi_query_raised_at       TEXT,
  ipp_response_summary      TEXT,
  ipp_responded_at          TEXT,
  dfi_accepted_at           TEXT,

  -- Breach
  breach_dscr               REAL,
  breach_type               TEXT CHECK(breach_type IN ('historical','projected','both',NULL)),
  cure_period_days          INTEGER,
  covenant_breach_at        TEXT,

  chain_status              TEXT NOT NULL DEFAULT 'data_gathering' CHECK(chain_status IN (
    'data_gathering','calculation','ie_review','ie_certified',
    'dfi_submitted','dfi_queries','queries_responded',
    'accepted','covenant_breach','withdrawn'
  )),
  sla_deadline              TEXT NOT NULL,
  sla_breached              INTEGER NOT NULL DEFAULT 0,
  regulator_notified        INTEGER NOT NULL DEFAULT 0,

  actor_id                  TEXT,
  reason                    TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dscr_period
  ON oe_dscr_reports(participant_id, reporting_period)
  WHERE dfi_reference IS NULL;

CREATE INDEX IF NOT EXISTS idx_dscr_status
  ON oe_dscr_reports(chain_status);

CREATE INDEX IF NOT EXISTS idx_dscr_participant
  ON oe_dscr_reports(participant_id);
