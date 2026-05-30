-- Wave 113 - IPP Cost Management & Earned Value Management (EVM) chain.
-- 8th IPP chain. SECOND Phase-A IPP wave (sibling of W112 WBS+Gantt).
-- W112 owned the SCHEDULE side (where, when, float, late finish); W113
-- owns the COST BOOK side (each ZAR's state across budget set →
-- commit → incur → measure → variance → reforecast → CR → publish →
-- reconcile → close).
--
-- Beats Procore Cost / Aconex Cost / Oracle Primavera Unifier / SAP
-- S/4HANA EPC / Deltek Cobra / Coreworx / InEight Control / Oracle
-- Aconex Cost Management / Hexagon EcoSys / ARES PRISM. Each surfaces
-- cost as a journal + an exported BAC/EAC PDF; W113 turns it into a
-- 12-state P6 cost chain with INVERTED SLA polarity in HOURS, FLOOR-AT-
-- LARGE on 5 contextual cost flags (cpi_below_pct_85, contingency_
-- consumed_pct_75, management_reserve_drawn, forex_variance_above_pct
-- _10, multi_currency_book), 4-step authority ladder (cost_engineer →
-- PM → finance_director → CFO), 22-field LIVE EVM battery (PV/EV/AC/
-- CV/SV/CPI/SPI/EAC/ETC/TCPI/BAC/VAC + contingency/MR remaining %),
-- 4-bridge architecture (W112 schedule + W21 drawdown + W30
-- disbursement + W77 reserve-account), and the SIGNATURE MANAGEMENT-
-- RESERVE-DRAW EVERY-tier hard line.
--
-- Standards: PMBOK 7 + AACE International RP-67R-11 (EVM) + ANSI EIA-
-- 748-D (32-criteria EVM System Description) + ISO 21500 + REIPPPP
-- cost reporting + DMRE s34 + IFRS 15 / IAS 11 (long-term contract
-- revenue + cost) + SARB large-exposure cost-overrun disclosure.
--
-- 11-state forward path + 3 branch states:
--   budget_set -> commit_cost -> committed -> incur_cost -> incurred
--     -> measure_progress -> measured -> detect_variance
--     -> variance_detected -> draft_reforecast -> reforecast_drafted
--     -> log_CR -> CR_logged -> approve_CR -> CR_approved
--     -> publish_reforecast -> reforecast_published -> reconcile
--     -> reconciled -> close_book -> closed (HARD terminal)
--   any non-terminal -> cancel -> cancelled (HARD terminal)
--   CR_logged -> reject_reforecast -> reforecast_rejected
--     -> draft_reforecast -> reforecast_drafted (TERMINAL-RESTART)
--   CR_approved -> draw_contingency -> contingency_drawn
--     -> {measure_progress | reconcile}
--   variance_detected / reforecast_drafted / CR_logged / CR_approved /
--     reforecast_published -> draw_management_reserve -> variance_
--     detected (CFO escalation)
--
-- Tier RE-DERIVED on every transition from total_budget_zar:
--   small  : <R250m
--   medium : R250m - R1.5b
--   large  : R1.5b - R8b   OR 1 floor flag
--   mega   : >=R8b         OR 2+ floor flags
--
-- INVERTED SLA polarity (HOURS) anchored on variance_detected:
--   small 72h / medium 168h / large 336h / mega 480h
-- Larger budgets get LONGER cure runway (more coordination required to
-- produce a credible reforecast + drive it through CRB).
--
-- SIGNATURE Phase-A IPP regulator crossings:
--   draw_management_reserve -> EVERY tier when total_budget_zar >= 1
--                                (W113 SIGNATURE; board-level cost-
--                                 overrun event always reportable to
--                                 lenders + IPPO + DMRE)
--   cancel                  -> EVERY tier (project cost cancellation =
--                                lender + IPPO write-back)
--   publish_reforecast      -> large + mega when VAC<0 OR CPI<0.85
--                                (REIPPPP cost-overrun disclosure)
--   approve_CR              -> mega only when CR_value >= 10% budget
--                                (SARB large-exposure)
--   sla_breached            -> large + mega
--
-- Write {admin, ipp_developer}. Read all 9 personas. actor_party split:
--   cost_engineer    : set_budget, commit_cost, incur_cost,
--                       measure_progress, detect_variance,
--                       draft_reforecast, draw_contingency
--   PM               : log_CR, approve_CR, reject_reforecast,
--                       publish_reforecast, submit_to_PM_review
--   finance_director : reconcile, close_book
--   CFO              : cancel, draw_management_reserve

CREATE TABLE IF NOT EXISTS oe_ipp_evm (
  id                                          TEXT PRIMARY KEY,
  evm_number                                  TEXT UNIQUE NOT NULL,

  -- Project linkage
  project_id                                  TEXT NOT NULL,
  project_name                                TEXT,
  project_capacity_mw                         REAL NOT NULL DEFAULT 0,
  project_type                                TEXT,
  cost_book_period                            TEXT,

  -- Cross-chain bridges (W112 schedule + W21 drawdown + W30 disb +
  -- W77 reserve-account)
  schedule_ref                                TEXT,
  drawdown_ref                                TEXT,
  disbursement_ref                            TEXT,
  reserve_account_ref                         TEXT,

  -- Budget (BAC + contingency + management reserve)
  total_budget_zar                            REAL NOT NULL DEFAULT 0,
  contingency_initial_zar                     REAL NOT NULL DEFAULT 0,
  contingency_drawn_zar                       REAL NOT NULL DEFAULT 0,
  contingency_remaining_pct                   REAL NOT NULL DEFAULT 0,
  management_reserve_initial_zar              REAL NOT NULL DEFAULT 0,
  management_reserve_drawn_zar                REAL NOT NULL DEFAULT 0,
  management_reserve_remaining_pct            REAL NOT NULL DEFAULT 0,
  currency_code                               TEXT NOT NULL DEFAULT 'ZAR',
  forex_component_pct                         REAL NOT NULL DEFAULT 0,

  -- Cost ledger
  committed_cost_zar                          REAL NOT NULL DEFAULT 0,
  incurred_cost_zar                           REAL NOT NULL DEFAULT 0,
  invoiced_cost_zar                           REAL NOT NULL DEFAULT 0,
  paid_cost_zar                               REAL NOT NULL DEFAULT 0,
  last_cost_update_at                         TEXT,

  -- EVM (Earned Value Management) 12-field block
  planned_value_zar                           REAL NOT NULL DEFAULT 0,
  earned_value_zar                            REAL NOT NULL DEFAULT 0,
  actual_cost_zar                             REAL NOT NULL DEFAULT 0,
  budget_at_completion_zar                    REAL NOT NULL DEFAULT 0,
  estimate_at_completion_zar                  REAL NOT NULL DEFAULT 0,
  estimate_to_complete_zar                    REAL NOT NULL DEFAULT 0,
  variance_at_completion_zar                  REAL NOT NULL DEFAULT 0,
  cpi                                         REAL NOT NULL DEFAULT 0,
  spi                                         REAL NOT NULL DEFAULT 0,
  tcpi                                        REAL NOT NULL DEFAULT 0,
  cost_variance_zar                           REAL NOT NULL DEFAULT 0,
  schedule_variance_zar                       REAL NOT NULL DEFAULT 0,

  -- Variance + reforecast + CR tracking
  variance_count                              INTEGER NOT NULL DEFAULT 0,
  reforecast_count                            INTEGER NOT NULL DEFAULT 0,
  cr_count                                    INTEGER NOT NULL DEFAULT 0,
  cr_value_zar                                REAL NOT NULL DEFAULT 0,
  last_variance_at                            TEXT,
  last_reforecast_at                          TEXT,
  last_cr_at                                  TEXT,
  variance_reason                             TEXT,
  reforecast_reason                           TEXT,
  reforecast_rejection_reason                 TEXT,
  cr_summary                                  TEXT,

  -- 5 floor flags
  cpi_below_pct_85                            INTEGER NOT NULL DEFAULT 0,
  contingency_consumed_pct_75                 INTEGER NOT NULL DEFAULT 0,
  management_reserve_drawn                    INTEGER NOT NULL DEFAULT 0,
  forex_variance_above_pct_10                 INTEGER NOT NULL DEFAULT 0,
  multi_currency_book                         INTEGER NOT NULL DEFAULT 0,

  -- Tier + authority + completeness battery
  current_tier                                TEXT NOT NULL CHECK (current_tier IN (
    'small','medium','large','mega'
  )),
  authority_required                          TEXT CHECK (authority_required IN (
    'cost_engineer','PM','finance_director','CFO'
  )),
  urgency_band                                TEXT,
  evm_health_band                             TEXT,
  evm_completeness_index                      INTEGER NOT NULL DEFAULT 0,

  -- Narrative
  title                                       TEXT,
  narrative                                   TEXT,
  reason_code                                 TEXT,
  cancel_reason                               TEXT,

  current_ball_in_court_party                 TEXT,
  last_responder_party                        TEXT,

  is_reportable                               INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                          INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                       TEXT,

  -- 11 lifecycle + 3 branch status timestamps
  chain_status                                TEXT NOT NULL CHECK (chain_status IN (
    'budget_set','committed','incurred','measured','variance_detected',
    'reforecast_drafted','CR_logged','CR_approved','reforecast_published',
    'reconciled','closed','cancelled','reforecast_rejected','contingency_drawn'
  )),
  budget_set_at                               TEXT,
  committed_at                                TEXT,
  incurred_at                                 TEXT,
  measured_at                                 TEXT,
  variance_detected_at                        TEXT,
  reforecast_drafted_at                       TEXT,
  cr_logged_at                                TEXT,
  cr_approved_at                              TEXT,
  reforecast_published_at                     TEXT,
  reconciled_at                               TEXT,
  closed_at                                   TEXT,
  cancelled_at                                TEXT,
  reforecast_rejected_at                      TEXT,
  contingency_drawn_at                        TEXT,
  signoff_at                                  TEXT,

  -- Regulator crossing
  regulator_crossed_at                        TEXT,
  regulator_inbox_ref                         TEXT,
  regulator_ref                               TEXT,

  -- SLA
  sla_target_hours                            INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                             TEXT,
  last_sla_breach_at                          TEXT,
  sla_breached                                INTEGER NOT NULL DEFAULT 0,
  escalation_level                            INTEGER NOT NULL DEFAULT 0,

  tenant_id                                   TEXT,
  created_by                                  TEXT NOT NULL,
  created_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ipe_status      ON oe_ipp_evm(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ipe_tier        ON oe_ipp_evm(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ipe_tenant      ON oe_ipp_evm(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipe_project     ON oe_ipp_evm(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipe_sla         ON oe_ipp_evm(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_ipe_breached    ON oe_ipp_evm(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ipe_reportable  ON oe_ipp_evm(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ipe_health      ON oe_ipp_evm(evm_health_band);
CREATE INDEX IF NOT EXISTS idx_oe_ipe_schedule    ON oe_ipp_evm(schedule_ref);

CREATE TABLE IF NOT EXISTS oe_ipp_evm_events (
  id                  TEXT PRIMARY KEY,
  evm_id              TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ipe_events_eid  ON oe_ipp_evm_events(evm_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipe_events_type ON oe_ipp_evm_events(event_type);
