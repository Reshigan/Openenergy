-- Wave 109 - Carbon Credit Quality Rating & Continuous Re-rating chain.
-- 11th Carbon chain. Buyer-side due-diligence rating engine over
-- registered + verified carbon credits. Bridges to W37 (registration
-- PDD), W11 (MRV verification), W42 (reversal / buffer pool) so that
-- material downgrades or fraud findings auto-feed the buffer pool
-- drawdown queue.
--
-- Beats Sylvera / BeZero Carbon Ratings / Pachama Verified Credits /
-- Renoster Carbon Ratings / Calyx Global / Carbon Direct CDx / Patch
-- Quality Layer / Cloverly Quality Tags / S&P Global carbon methodology
-- / Moody KYC Carbon. Each surfaces a rating as a single static
-- letter; W109 turns it into a 12-state P6 chain with INVERTED SLA
-- polarity, FLOOR-AT-PREMIUM tier overlay, 4-step authority ladder,
-- 17-field LIVE battery (composite_score + 5 sub-scores + S&P-style
-- 8-band + 3-bridge architecture to W37 / W11 / W42 + ICROA bonus),
-- continuous monitoring with auto re-rating, and signature regulator
-- crossings.
--
-- Standards: CCP Core Carbon Principles + ICROA Code of Best Practice
-- + Article 6.4 Methodologies + ISO 14064-3 (GHG validation and
-- verification) + VCS / Verra integrity standards.
--
-- 12-state P6 lifecycle plus 3 terminal branches:
--   rating_requested -> start_desk_review -> desk_review
--     -> score_methodology -> methodology_score
--       -> score_additionality -> additionality_score
--         -> score_permanence -> permanence_score
--           -> score_leakage -> leakage_score
--             -> score_cobenefits -> cobenefit_score
--               -> compute_composite -> composite_score
--                 -> publish_rating -> published
--                   -> start_monitoring -> monitoring
--                     -> trigger_rerating -> re_rating_triggered
--                       -> rerate -> re_rated (hard terminal)
--   monitoring or re_rating_triggered -> downgrade -> downgraded
--                                                     (soft terminal
--                                                     - issuer can
--                                                     re-enter via
--                                                     remediate)
--   any pre-published state -> withdraw -> withdrawn (hard terminal)
--   any non-terminal state -> escalate_to_integrity ->
--                              escalated_to_integrity (hard terminal)
--   downgraded -> remediate -> monitoring (re-entry)
--
-- Tier RE-DERIVED on every transition from credit_vintage_year +
-- scope_scale_tonnes:
--   basic         : <50k tCO2e single-vintage voluntary
--   standard      : 50k-500k tCO2e OR multi-vintage
--   premium       : 500k-5m tCO2e
--   institutional : >=5m tCO2e
-- FLOOR-AT-PREMIUM on any one of 5 floor flags OR Article 6.
-- FLOOR-AT-INSTITUTIONAL on 2+ floor flags OR ccp_aligned_project OR
-- institutional_buyer.
--
-- INVERTED SLA polarity stored as HOURS (multi-week chain).
-- institutional gets LONGEST runway. rating_requested window:
--   basic         30d / standard      60d /
--   premium      120d / institutional 180d
-- Re-rating windows tighter (monitoring data already in-hand):
--   basic         14d / institutional  90d
--
-- SIGNATURE regulator crossings (CCP + ICROA + Art 6.4 + ISO 14064-3
-- + VCS / Verra integrity):
--   downgrade              -> regulator EVERY tier on composite_drop_pct
--                              >=20% OR rating_band drops to CCC/D
--                              (W109 SIGNATURE)
--   escalate_to_integrity  -> regulator EVERY tier (fraud finding hands
--                              off to W42 reversal)
--   publish_rating         -> regulator premium+institutional when
--                              Article 6 (authorization status disclosed)
--   withdraw               -> regulator EVERY tier when issuer_disputed
--                              (withdrawing under dispute = integrity
--                              event)
--   sla_breached           -> premium+institutional only
--
-- Write {admin, carbon_fund}. Read all 9 personas. actor_party split:
--   rater: start_desk_review, score_methodology, score_additionality,
--          score_permanence, score_leakage, score_cobenefits,
--          compute_composite, publish_rating, start_monitoring,
--          trigger_rerating, rerate, downgrade, withdraw,
--          escalate_to_integrity
--   issuer: request_rating, remediate

CREATE TABLE IF NOT EXISTS oe_carbon_credit_rating (
  id                                                  TEXT PRIMARY KEY,
  rating_number                                       TEXT UNIQUE NOT NULL,

  project_id                                          TEXT NOT NULL,
  project_name                                        TEXT,
  issuer_id                                           TEXT NOT NULL,
  issuer_name                                         TEXT,
  rater_id                                            TEXT NOT NULL,
  rater_name                                          TEXT,
  buyer_id                                            TEXT,
  buyer_name                                          TEXT,

  registration_chain_ref                              TEXT,
  mrv_chain_ref                                       TEXT,
  reversal_chain_ref                                  TEXT,

  credit_vintage_year                                 INTEGER NOT NULL DEFAULT 0,
  multi_vintage                                       INTEGER NOT NULL DEFAULT 0,
  scope_scale_tonnes                                  REAL NOT NULL DEFAULT 0,
  methodology_id                                      TEXT,
  methodology_name                                    TEXT,
  registry_name                                       TEXT,

  methodology_score                                   REAL,
  additionality_score                                 REAL,
  permanence_score                                    REAL,
  leakage_score                                       REAL,
  cobenefit_score                                     REAL,
  composite_score                                     REAL,
  rating_band                                         TEXT CHECK (rating_band IN (
    'AAA','AA','A','BBB','BB','B','CCC','D'
  )),
  prior_composite_score                               REAL,
  prior_rating_band                                   TEXT,
  composite_drop_pct                                  REAL NOT NULL DEFAULT 0,
  icroa_aligned                                       INTEGER NOT NULL DEFAULT 0,

  afolu_high_reversal_risk                            INTEGER NOT NULL DEFAULT 0,
  methodology_under_review                            INTEGER NOT NULL DEFAULT 0,
  external_credit_red_flag                            INTEGER NOT NULL DEFAULT 0,
  ccp_aligned_project                                 INTEGER NOT NULL DEFAULT 0,
  article_6_authorised                                INTEGER NOT NULL DEFAULT 0,
  institutional_buyer                                 INTEGER NOT NULL DEFAULT 0,
  issuer_disputed                                     INTEGER NOT NULL DEFAULT 0,

  current_tier                                        TEXT NOT NULL CHECK (current_tier IN (
    'basic','standard','premium','institutional'
  )),
  authority_required                                  TEXT CHECK (authority_required IN (
    'junior_analyst','senior_analyst','ratings_committee_chair','board_rating_committee'
  )),
  urgency_band                                        TEXT,
  rating_completeness_index                           INTEGER NOT NULL DEFAULT 0,
  rerating_count_30d                                  INTEGER NOT NULL DEFAULT 0,
  monitoring_freshness_days                           INTEGER,
  monitoring_data_stale                               INTEGER NOT NULL DEFAULT 0,
  vintage_age_years                                   INTEGER NOT NULL DEFAULT 0,
  last_monitoring_data_at                             TEXT,

  title                                               TEXT,
  narrative                                           TEXT,
  reason_code                                         TEXT,
  withdraw_reason                                     TEXT,
  downgrade_reason                                    TEXT,
  integrity_reason                                    TEXT,
  remediation_narrative                               TEXT,

  current_ball_in_court_party                         TEXT,
  last_responder_party                                TEXT,

  is_reportable                                       INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                                  INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                               TEXT,

  chain_status                                        TEXT NOT NULL CHECK (chain_status IN (
    'rating_requested','desk_review','methodology_score','additionality_score',
    'permanence_score','leakage_score','cobenefit_score','composite_score',
    'published','monitoring','re_rating_triggered','re_rated',
    'downgraded','withdrawn','escalated_to_integrity'
  )),
  rating_requested_at                                 TEXT,
  desk_review_at                                      TEXT,
  methodology_score_at                                TEXT,
  additionality_score_at                              TEXT,
  permanence_score_at                                 TEXT,
  leakage_score_at                                    TEXT,
  cobenefit_score_at                                  TEXT,
  composite_score_at                                  TEXT,
  published_at                                        TEXT,
  monitoring_at                                       TEXT,
  re_rating_triggered_at                              TEXT,
  re_rated_at                                         TEXT,
  downgraded_at                                       TEXT,
  withdrawn_at                                        TEXT,
  escalated_to_integrity_at                           TEXT,

  regulator_crossed_at                                TEXT,
  regulator_inbox_ref                                 TEXT,
  regulator_ref                                       TEXT,
  sla_target_hours                                    INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                                     TEXT,
  last_sla_breach_at                                  TEXT,
  sla_breached                                        INTEGER NOT NULL DEFAULT 0,
  escalation_level                                    INTEGER NOT NULL DEFAULT 0,

  tenant_id                                           TEXT,
  created_by                                          TEXT NOT NULL,
  created_at                                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ccr_status        ON oe_carbon_credit_rating(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ccr_tier          ON oe_carbon_credit_rating(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ccr_tenant        ON oe_carbon_credit_rating(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_ccr_project       ON oe_carbon_credit_rating(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ccr_issuer        ON oe_carbon_credit_rating(issuer_id);
CREATE INDEX IF NOT EXISTS idx_oe_ccr_rater         ON oe_carbon_credit_rating(rater_id);
CREATE INDEX IF NOT EXISTS idx_oe_ccr_sla           ON oe_carbon_credit_rating(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_ccr_breached      ON oe_carbon_credit_rating(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ccr_reportable    ON oe_carbon_credit_rating(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ccr_band          ON oe_carbon_credit_rating(rating_band);
CREATE INDEX IF NOT EXISTS idx_oe_ccr_monitoring    ON oe_carbon_credit_rating(last_monitoring_data_at);

CREATE TABLE IF NOT EXISTS oe_carbon_credit_rating_events (
  id                  TEXT PRIMARY KEY,
  rating_id           TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ccr_events_rid    ON oe_carbon_credit_rating_events(rating_id);
CREATE INDEX IF NOT EXISTS idx_oe_ccr_events_type   ON oe_carbon_credit_rating_events(event_type);
