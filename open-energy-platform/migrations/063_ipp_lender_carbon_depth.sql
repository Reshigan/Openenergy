-- ════════════════════════════════════════════════════════════════════════
-- 063_ipp_lender_carbon_depth.sql — L4/L5 depth for IPP, Lender, Carbon.
--
-- IPP:
--   oe_ipp_drawdowns         construction drawdown requests w/ CPs
--   oe_ipp_drawdown_cps      conditions-precedent state per drawdown
--   oe_ipp_ld_events         liquidated damages engine
--
-- Lender:
--   oe_lender_ecl_staging    IFRS 9 ECL stage 1/2/3 per facility
--   oe_lender_watchlist      facility watchlist with auto-score triggers
--   oe_lender_intercreditor  intercreditor agreement enforcement
--
-- Carbon:
--   oe_carbon_pdd            Project Design Documents
--   oe_carbon_monitoring     monitoring period reports
--   oe_carbon_verifications  DOE / verification body coordination
-- ════════════════════════════════════════════════════════════════════════

-- ─── IPP — Construction drawdowns ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS oe_ipp_drawdowns (
  id                       TEXT PRIMARY KEY,
  project_id               TEXT NOT NULL,
  drawdown_number          INTEGER NOT NULL,
  requested_amount_zar     REAL NOT NULL,
  approved_amount_zar      REAL,
  disbursed_amount_zar     REAL,
  requested_at             TEXT NOT NULL DEFAULT (datetime('now')),
  required_by              TEXT,
  status                   TEXT NOT NULL DEFAULT 'submitted',
                                                 -- submitted | cps_pending | approved |
                                                 -- disbursed | rejected | cancelled
  ie_certificate_id        TEXT,                 -- independent engineer cert
  approved_by              TEXT,
  approved_at              TEXT,
  disbursed_at             TEXT,
  rejection_reason         TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_drawdown_project ON oe_ipp_drawdowns(project_id, status);

CREATE TABLE IF NOT EXISTS oe_ipp_drawdown_cps (
  id              TEXT PRIMARY KEY,
  drawdown_id     TEXT NOT NULL,
  cp_type         TEXT NOT NULL,                 -- ie_certificate | insurance_renewal |
                                                  -- environmental_compliance | covenant_test |
                                                  -- title_perfection | tax_clearance |
                                                  -- engineering_milestone
  description     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | satisfied | waived | failed
  evidence_r2_key TEXT,
  satisfied_at    TEXT,
  satisfied_by    TEXT,
  waived_by       TEXT,
  waiver_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_drawdown_cps_dd ON oe_ipp_drawdown_cps(drawdown_id, status);

CREATE TABLE IF NOT EXISTS oe_ipp_ld_events (
  id                     TEXT PRIMARY KEY,
  project_id             TEXT NOT NULL,
  epc_contract_id        TEXT,
  event_type             TEXT NOT NULL,           -- delay | performance_shortfall
  reference_date         TEXT NOT NULL,           -- the milestone or COD date that was missed
  actual_date            TEXT,
  daily_rate_zar         REAL NOT NULL,
  cap_pct                REAL NOT NULL,           -- of contract price
  contract_price_zar     REAL NOT NULL,
  delay_days             INTEGER,
  accrued_amount_zar     REAL NOT NULL DEFAULT 0,
  cured_at               TEXT,
  status                 TEXT NOT NULL DEFAULT 'accruing',
                                                  -- accruing | cured | capped | invoiced |
                                                  -- paid | disputed
  cure_period_days       INTEGER DEFAULT 14,
  cure_deadline          TEXT,
  invoiced_amount_zar    REAL,
  invoiced_at            TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_ld_project ON oe_ipp_ld_events(project_id, status);

-- ─── Lender — IFRS 9 + watchlist + intercreditor ──────────────────────
CREATE TABLE IF NOT EXISTS oe_lender_ecl_staging (
  id                      TEXT PRIMARY KEY,
  facility_id             TEXT NOT NULL,
  participant_id          TEXT NOT NULL,         -- the borrower
  stage                   INTEGER NOT NULL,      -- 1=performing | 2=under-perf | 3=non-perf
  stage_changed_at        TEXT,
  stage_change_reason     TEXT,
  exposure_zar            REAL NOT NULL,
  pd_12m                  REAL,                  -- 12-month probability of default
  pd_lifetime             REAL,                  -- lifetime PD
  lgd_pct                 REAL,                  -- loss given default
  ead_zar                 REAL,                  -- exposure at default
  ecl_amount_zar          REAL NOT NULL,         -- expected credit loss
  next_assessment_at      TEXT,
  notes                   TEXT,
  computed_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_ecl_facility ON oe_lender_ecl_staging(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_ecl_stage    ON oe_lender_ecl_staging(stage, computed_at);

CREATE TABLE IF NOT EXISTS oe_lender_watchlist (
  id                     TEXT PRIMARY KEY,
  facility_id            TEXT NOT NULL,
  participant_id         TEXT NOT NULL,
  watchlist_tier         INTEGER NOT NULL,       -- 1=monitor, 2=concern, 3=critical
  trigger_signal         TEXT NOT NULL,          -- dscr_warning | covenant_breach |
                                                  -- payment_delay | rating_downgrade |
                                                  -- credit_deterioration
  trigger_value          REAL,
  action_plan            TEXT,
  added_at               TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at            TEXT,
  next_review_at         TEXT,
  cleared_at             TEXT,
  added_by               TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_watchlist_part ON oe_lender_watchlist(participant_id, cleared_at);

CREATE TABLE IF NOT EXISTS oe_lender_intercreditor (
  id                         TEXT PRIMARY KEY,
  project_id                 TEXT NOT NULL,
  agent_lender_id            TEXT NOT NULL,
  total_facility_zar         REAL NOT NULL,
  senior_pct                 REAL NOT NULL,
  mezzanine_pct              REAL,
  subordinated_pct           REAL,
  cash_sweep_rule            TEXT,                -- JSON priority of payments
  voting_thresholds_json     TEXT,                -- {amend: 66, accelerate: 75, …}
  signed_at                  TEXT,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_intercred_proj ON oe_lender_intercreditor(project_id);

-- ─── Carbon — PDD + monitoring + verification ─────────────────────────
CREATE TABLE IF NOT EXISTS oe_carbon_pdd (
  id                       TEXT PRIMARY KEY,
  project_id               TEXT NOT NULL,
  methodology              TEXT NOT NULL,         -- ACM0002 | AMS-I.D | etc.
  registry                 TEXT NOT NULL,         -- gold_standard | verra | clean_dev_mechanism
  pdd_version              TEXT NOT NULL DEFAULT 'draft',
  pdd_status               TEXT NOT NULL DEFAULT 'draft',
                                                  -- draft | submitted | under_validation |
                                                  -- registered | withdrawn
  crediting_period_years   INTEGER,
  estimated_annual_tco2e   REAL,
  doe_id                   TEXT,                  -- Designated Operational Entity
  validation_report_r2_key TEXT,
  pdd_doc_r2_key           TEXT,
  registered_at            TEXT,
  registry_id              TEXT,                  -- registry-assigned project ID
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_pdd_project ON oe_carbon_pdd(project_id, pdd_status);

CREATE TABLE IF NOT EXISTS oe_carbon_monitoring (
  id                     TEXT PRIMARY KEY,
  pdd_id                 TEXT NOT NULL,
  period_start           TEXT NOT NULL,
  period_end             TEXT NOT NULL,
  measured_tco2e         REAL,
  ex_ante_tco2e          REAL,                   -- from PDD
  data_quality_pct       REAL,
  monitoring_report_r2_key TEXT,
  status                 TEXT NOT NULL DEFAULT 'draft',
                                                  -- draft | submitted | verified |
                                                  -- issued | rejected
  submitted_at           TEXT,
  verified_at            TEXT,
  issued_at              TEXT,
  issued_serial_range    TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_mon_pdd ON oe_carbon_monitoring(pdd_id, status);

CREATE TABLE IF NOT EXISTS oe_carbon_verifications (
  id                  TEXT PRIMARY KEY,
  monitoring_id       TEXT NOT NULL,
  doe_id              TEXT NOT NULL,             -- verification body
  verification_type   TEXT NOT NULL,             -- initial | periodic | final
  status              TEXT NOT NULL DEFAULT 'engaged',
                                                  -- engaged | site_visit_done |
                                                  -- draft_opinion | final_opinion | issued
  site_visit_at       TEXT,
  draft_opinion_at    TEXT,
  final_opinion_at    TEXT,
  opinion_r2_key      TEXT,
  fee_zar             REAL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_verif_mon ON oe_carbon_verifications(monitoring_id);
