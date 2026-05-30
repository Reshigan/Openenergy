-- Wave 103 - ESG Disclosure Lifecycle and Assurance Chain (P6).
-- 12-state lifecycle of a JSE-listed entity ESG disclosure cycle. USER
-- DIRECTIVE OVERRIDE 2026-05-30: the existing src/routes/esg-reports.ts is
-- a L2 template generator. W103 brings ESG reporting to L4-L5: state
-- machine, INVERTED SLA, FLOOR-AT-MATERIAL, LIVE 4-framework completeness
-- battery, 15-cat Scope 3 ledger, 4-step authority ladder, signature
-- regulator crossings (restate_disclosure UNIVERSAL hard line +
-- assurance-qualified material+strategic + cancel-of-listed-year +
-- sla-breach strategic).
--
-- Beats Workiva ESG / Sphera SpheraCloud / SAP Sustainability Control
-- Tower / Microsoft Sustainability Manager / IBM Envizi / Salesforce Net
-- Zero Cloud / Greenstone / EcoVadis / Persefoni / Watershed / Diligent
-- ESG / Bloomberg ESG / Refinitiv Lipper ESG.
--
-- Standards covered simultaneously each annual cycle:
--   ISSB IFRS S1 (general) + ISSB IFRS S2 (climate)
--   TCFD 4 pillars (governance, strategy, risk-mgmt, metrics-targets)
--   GRI Universal Standards 1-3 + sector standards
--   CDP Climate / Water / Forests questionnaire
--   JSE SRL (Sustainability and Climate Disclosure Guidance 2024)
--   King IV Principles 1-3 + 15-17
--   SBTi alignment + Carbon Tax Act 6 + SAICA Code 8
--
-- 12-state lifecycle (P6 with disputed + cancelled branches + restate from
-- filed reopens row at draft_compiled):
--   period_open -> collect_data -> data_collected
--     -> verify_boundary -> boundary_verified
--       -> compute_metrics -> metrics_computed
--         -> compile_draft -> draft_compiled
--           -> submit_for_review -> internal_review
--             -> engage_assurance -> assurance_engaged
--               -> start_assurance -> assurance_in_progress
--                 -> complete_assurance -> assured
--                   -> publish_disclosure -> published
--                     -> file_regulator -> filed
--                       -> archive_year -> archived (terminal)
--   draft_compiled / internal_review / assured
--     -> raise_dispute -> disputed -> resolve_dispute -> internal_review
--   filed -> restate_disclosure -> draft_compiled (reopens row)
--   any non-terminal -> cancel_year -> cancelled (terminal)
--
-- Tier RE-DERIVED on every transition from disclosure_scope x
-- climate_risk_exposure x assurance_level:
--   minor     : scope=entity_only AND exposure=low AND assurance=none
--   standard  : scope=entity+subs OR exposure=medium OR assurance=limited
--   material  : scope=group OR exposure=high OR assurance=limited
--   strategic : scope=group AND (exposure=high OR assurance=reasonable)
-- FLOOR-AT-MATERIAL when any of: jse_listed_strict,
-- scope3_inclusive_15cat, climate_scenario_required,
-- material_topics_count_8plus, sbti_committed_strict.
--
-- INVERTED SLA polarity (larger scope = MORE time; strategic-period_open =
-- 270d annual cycle; minor-publish = 7d). Reverses W102 URGENT polarity.
--
-- SIGNATURE (W103 - JSE SRL 8.62 + Companies Act + SAICA Code 8 +
-- Carbon Tax Act 6):
--   restate_disclosure   -> regulator EVERY tier (universal hard line -
--                            re-statement of public ESG disclosure ALWAYS
--                            reportable - sister of W42 reversal +
--                            W101 restate_year + W79 raise_dispute)
--   complete_assurance   -> regulator material+strategic when
--                            assurance_opinion in (qualified|adverse|disclaimer)
--   cancel_year          -> regulator EVERY tier when
--                            year_had_listed_disclosure = true
--   sla_breached         -> regulator strategic only (filing-deadline miss)
--
-- Write {admin, carbon_fund} (primary on Carbon workstation). Read all 9.
-- actor_party functional: esg_analyst / sustainability_director /
-- audit_committee_chair / board_chair / external_auditor /
-- regulator_observer.

CREATE TABLE IF NOT EXISTS oe_esg_disclosure (
  id                                  TEXT PRIMARY KEY,
  disclosure_number                   TEXT UNIQUE NOT NULL,

  source_event                        TEXT,
  source_entity_type                  TEXT,
  source_entity_id                    TEXT,
  source_wave                         TEXT,

  reporting_entity_id                 TEXT NOT NULL,
  reporting_entity_name               TEXT,
  reporting_entity_lei                TEXT,
  ticker                              TEXT,
  financial_year_label                TEXT,
  financial_year_end_at               TEXT,
  period_opened_at                    TEXT,

  disclosure_scope                    TEXT NOT NULL DEFAULT 'entity_only' CHECK (disclosure_scope IN (
    'entity_only','entity_plus_subsidiaries','group_consolidated'
  )),
  climate_risk_exposure               TEXT NOT NULL DEFAULT 'low' CHECK (climate_risk_exposure IN (
    'low','medium','high'
  )),
  assurance_level                     TEXT NOT NULL DEFAULT 'none' CHECK (assurance_level IN (
    'none','limited','reasonable'
  )),
  assurance_opinion                   TEXT CHECK (assurance_opinion IN (
    'unqualified','limited','qualified','adverse','disclaimer'
  )),
  assurance_provider                  TEXT,
  external_auditor_party_id           TEXT,

  jse_listed_strict                   INTEGER NOT NULL DEFAULT 0,
  scope3_inclusive_15cat              INTEGER NOT NULL DEFAULT 0,
  climate_scenario_required           INTEGER NOT NULL DEFAULT 0,
  material_topics_count               INTEGER NOT NULL DEFAULT 0,
  sbti_committed_strict               INTEGER NOT NULL DEFAULT 0,
  year_had_listed_disclosure          INTEGER NOT NULL DEFAULT 0,

  scope1_tco2e                        REAL,
  scope2_market_tco2e                 REAL,
  scope2_location_tco2e               REAL,
  scope3_total_tco2e                  REAL,
  baseline_year                       INTEGER,
  baseline_total_tco2e                REAL,
  reduction_pct_vs_baseline           REAL,
  sbti_alignment_score                REAL,

  tcfd_completeness_pct               REAL,
  gri_completeness_pct                REAL,
  cdp_score                           REAL,
  cdp_score_band                      TEXT,
  jse_srl_completeness_pct            REAL,
  king_iv_completeness_pct            REAL,
  issb_s1_s2_completeness_pct         REAL,
  assurance_confidence_level          TEXT,
  esg_disclosure_index                REAL,
  regulator_filing_window_days        INTEGER,
  urgency_band                        TEXT CHECK (urgency_band IN (
    'critical','high','medium','low'
  )),

  current_tier                        TEXT NOT NULL CHECK (current_tier IN (
    'minor','standard','material','strategic'
  )),
  effective_tier                      TEXT CHECK (effective_tier IN (
    'minor','standard','material','strategic'
  )),
  authority_required                  TEXT CHECK (authority_required IN (
    'esg_analyst','sustainability_director','audit_committee_chair','board_chair'
  )),

  dispute_count                       INTEGER NOT NULL DEFAULT 0,
  restate_count                       INTEGER NOT NULL DEFAULT 0,
  cancel_count                        INTEGER NOT NULL DEFAULT 0,

  parent_disclosure_id                TEXT,
  prior_disclosure_id                 TEXT,
  regulator_ref                       TEXT,
  jse_sens_ref                        TEXT,
  cipc_ref                            TEXT,
  dffe_ref                            TEXT,
  sars_ref                            TEXT,

  title                               TEXT,
  narrative                           TEXT,
  result_text                         TEXT,
  disputed_reason                     TEXT,
  cancelled_reason                    TEXT,
  restated_reason                     TEXT,
  reason_code                         TEXT,

  current_ball_in_court_party         TEXT,
  last_responder_party                TEXT,
  analyst_party                       TEXT,
  director_party                      TEXT,
  audit_committee_party               TEXT,
  board_party                         TEXT,

  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'period_open','data_collected','boundary_verified','metrics_computed',
    'draft_compiled','internal_review','assurance_engaged',
    'assurance_in_progress','assured','published','filed','archived',
    'disputed','cancelled'
  )),
  period_open_at                      TEXT,
  data_collected_at                   TEXT,
  boundary_verified_at                TEXT,
  metrics_computed_at                 TEXT,
  draft_compiled_at                   TEXT,
  internal_review_at                  TEXT,
  assurance_engaged_at                TEXT,
  assurance_in_progress_at            TEXT,
  assured_at                          TEXT,
  published_at                        TEXT,
  filed_at                            TEXT,
  archived_at                         TEXT,
  disputed_at                         TEXT,
  cancelled_at                        TEXT,

  is_reportable                       INTEGER NOT NULL DEFAULT 0,
  regulator_crossed_at                TEXT,
  regulator_inbox_ref                 TEXT,
  sla_deadline_at                     TEXT,
  last_sla_breach_at                  TEXT,
  escalation_level                    INTEGER NOT NULL DEFAULT 0,

  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_esg_status   ON oe_esg_disclosure(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_esg_tier     ON oe_esg_disclosure(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_esg_entity   ON oe_esg_disclosure(reporting_entity_id);
CREATE INDEX IF NOT EXISTS idx_oe_esg_fy       ON oe_esg_disclosure(financial_year_label);
CREATE INDEX IF NOT EXISTS idx_oe_esg_sla      ON oe_esg_disclosure(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_esg_ball     ON oe_esg_disclosure(current_ball_in_court_party);
CREATE INDEX IF NOT EXISTS idx_oe_esg_jse      ON oe_esg_disclosure(jse_listed_strict);
CREATE INDEX IF NOT EXISTS idx_oe_esg_listed   ON oe_esg_disclosure(year_had_listed_disclosure);
CREATE INDEX IF NOT EXISTS idx_oe_esg_opinion  ON oe_esg_disclosure(assurance_opinion);
CREATE INDEX IF NOT EXISTS idx_oe_esg_urgency  ON oe_esg_disclosure(urgency_band);

CREATE TABLE IF NOT EXISTS oe_esg_disclosure_events (
  id                  TEXT PRIMARY KEY,
  disclosure_id       TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_esg_events_d    ON oe_esg_disclosure_events(disclosure_id);
CREATE INDEX IF NOT EXISTS idx_oe_esg_events_type ON oe_esg_disclosure_events(event_type);
