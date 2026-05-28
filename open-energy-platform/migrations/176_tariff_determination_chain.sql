-- Wave 43 — Regulator Tariff / Revenue (MYPD Price-Control) Determination chain.
-- NERSA's economic-regulation core: setting the allowed revenue and tariffs a
-- licensee may charge under ERA 2006 §15–§16 + the Multi-Year Price
-- Determination (MYPD) methodology + the Regulatory Clearing Account (RCA).
--
-- Where W33 renewal decides WHO may operate and W40 inspection enforces licence
-- conditions, THIS chain decides WHAT a licensee may charge. Distinct from W39
-- tariff-indexation, which is the contractual CPI escalation of an already-agreed
-- private PPA tariff — this is the upstream regulatory price-control determination
-- that sets the revenue cap.
--
-- 12-state P6 lifecycle:
--   application_received → completeness_review → public_consultation →
--     revenue_analysis → draft_determination → council_deliberation →
--     determination_issued → implemented
--   reconsideration branch: determination_issued → reconsideration_requested → implemented|remitted
--   judicial set-aside:     determination_issued|reconsideration_requested → remitted
--   regulator rejection:    completeness_review|revenue_analysis → rejected
--   early withdraw:         application_received|completeness_review|public_consultation → withdrawn
--
-- Classes (determination scope — drive SLA windows + reportability):
--   multi_year    — full MYPD multi-year revenue determination; most material, MOST time
--   annual_tariff — annual tariff / RCA true-up; mid
--   sseg_feedin   — small-scale embedded generation feed-in tariff; lightest
--
-- INVERTED SLA: the bigger the determination, the MORE time every window allows.
--
-- Reportability: remit crosses for EVERY class (court set-aside — universal);
-- issue_determination + reject + sla_breached cross for material classes
-- (multi_year + annual_tariff); SSEG feed-in schedules stay administrative.
--
-- Two-party write split: the applicant licensee files / requests reconsideration
-- / withdraws; the regulator drives everything else. actor_party
-- (applicant/registry/analyst/council/court) records the regulatory function per
-- step for audit attribution.

CREATE TABLE IF NOT EXISTS oe_tariff_determinations (
  id                            TEXT PRIMARY KEY,
  determination_number          TEXT UNIQUE NOT NULL,

  -- Provenance (e.g. a renewal/licence the tariff attaches to)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (two-party split: applicant licensee + NERSA officer)
  applicant_party_id            TEXT NOT NULL,
  applicant_party_name          TEXT NOT NULL,
  regulator_party_id            TEXT NOT NULL,
  regulator_party_name          TEXT NOT NULL,

  -- Determination identity
  licence_ref                   TEXT,
  tariff_entity                 TEXT NOT NULL,     -- the regulated entity/service the tariff covers
  tariff_segment                TEXT,              -- transmission / distribution / generation / retail / sseg
  determination_class           TEXT NOT NULL CHECK (determination_class IN (
    'multi_year', 'annual_tariff', 'sseg_feedin'
  )),
  mypd_period                   TEXT,              -- e.g. MYPD5 2025-2030
  price_year                    TEXT,              -- e.g. 2026/27

  -- Economic parameters (the heart of a price-control determination)
  requested_revenue_zar_m       REAL,              -- applicant's requested allowed revenue (R millions)
  allowed_revenue_zar_m         REAL,              -- determined allowed revenue (R millions)
  rab_zar_m                     REAL,              -- regulatory asset base (R millions)
  wacc_pre_tax                  REAL,              -- pre-tax real WACC (fraction, e.g. 0.0875)
  opex_zar_m                    REAL,              -- allowed operating expenditure (R millions)
  rca_balance_zar_m             REAL,              -- Regulatory Clearing Account true-up balance (R millions)
  requested_tariff_zar_kwh      REAL,              -- applicant's requested average tariff
  allowed_tariff_zar_kwh        REAL,              -- determined average tariff
  tariff_increase_pct           REAL,              -- headline determined increase (percent)
  x_factor                      REAL,              -- efficiency / X-factor

  -- Refs
  application_ref               TEXT,
  completeness_ref              TEXT,
  consultation_ref              TEXT,
  analysis_ref                  TEXT,
  draft_ref                     TEXT,
  determination_ref             TEXT,              -- determination document ref
  reconsideration_ref           TEXT,
  court_ref                     TEXT,              -- judicial-review case ref
  gazette_ref                   TEXT,              -- Government Gazette notice ref
  regulator_ref                 TEXT,              -- Council oversight / public register ref

  -- Narrative
  application_basis             TEXT,
  completeness_basis            TEXT,
  consultation_basis            TEXT,
  analysis_basis                TEXT,
  draft_basis                   TEXT,
  determination_basis           TEXT,
  reconsideration_basis         TEXT,
  remit_basis                   TEXT,
  reason_code                   TEXT,
  rod_notes                     TEXT,              -- record of decision

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'application_received','completeness_review','public_consultation',
    'revenue_analysis','draft_determination','council_deliberation',
    'determination_issued','reconsideration_requested',
    'implemented','remitted','rejected','withdrawn'
  )),
  application_received_at       TEXT NOT NULL,
  completeness_review_at        TEXT,
  public_consultation_at        TEXT,
  revenue_analysis_at           TEXT,
  draft_determination_at        TEXT,
  council_deliberation_at       TEXT,
  determination_issued_at       TEXT,
  reconsideration_requested_at  TEXT,
  implemented_at                TEXT,
  remitted_at                   TEXT,
  rejected_at                   TEXT,
  withdrawn_at                  TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_tdet_status    ON oe_tariff_determinations(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_tdet_class     ON oe_tariff_determinations(determination_class);
CREATE INDEX IF NOT EXISTS idx_oe_tdet_segment   ON oe_tariff_determinations(tariff_segment);
CREATE INDEX IF NOT EXISTS idx_oe_tdet_applicant ON oe_tariff_determinations(applicant_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_tdet_entity    ON oe_tariff_determinations(tariff_entity);
CREATE INDEX IF NOT EXISTS idx_oe_tdet_received  ON oe_tariff_determinations(application_received_at);
CREATE INDEX IF NOT EXISTS idx_oe_tdet_sla       ON oe_tariff_determinations(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_tariff_determinations_events (
  id                 TEXT PRIMARY KEY,
  determination_id   TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_tdet_events_det  ON oe_tariff_determinations_events(determination_id);
CREATE INDEX IF NOT EXISTS idx_oe_tdet_events_type ON oe_tariff_determinations_events(event_type);
