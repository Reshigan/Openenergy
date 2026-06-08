-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 489 — W230 REIPPPP Community Benefit Trust (CBT) &
-- Socio-Economic Development (SED) Annual Compliance Reporting
-- P6 chain on oe_cbt_sed_reports
--
-- Legal basis:
--  REIPPPP Request for Proposals (Sch.2 socio-economic development obligations)
--  DMRE CBT/SED Reporting Guidelines (bidder obligations)
--  Trust Property Control Act 57/1988 (trust governance & reporting)
--  BBBEE Act 53/2003 + Codes of Good Practice (verification & scoring)
--
-- Domain: every REIPPPP IPP must establish a Community Benefit Trust (CBT)
-- holding equity in the project and make annual SED expenditures. This chain
-- tracks the end-to-end annual reporting lifecycle — from opening the DMRE
-- reporting window through data collection, submission, DMRE review, any
-- queries, and final approval or non-compliance/escalation. None of the
-- existing physical PPA, IPP construction, or ED commitment chains (W27) model
-- the annual REPORTING workflow for CBT disbursements and SED spend.
--
-- SLA: INVERTED by cbt_disbursement_tier — larger CBT = more DMRE scrutiny =
-- longer review window before a determination is due
-- (micro=14d, small=21d, medium=30d, major=45d).
-- Regulator crossings: escalate + issue_non_compliance ALWAYS; approve_report
-- for medium/major; SLA breach for medium/major.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_cbt_sed_reports (
  id TEXT PRIMARY KEY,
  ipp_id TEXT NOT NULL,                          -- IPP / generator (ipp_developer user id)
  project_name TEXT NOT NULL,                    -- REIPPPP project name
  reipppp_bid_window TEXT NOT NULL,              -- e.g. BW1, BW2, BW3, BW4, BW5, BW6
  reporting_year INTEGER NOT NULL,               -- calendar year being reported
  cbt_disbursement_tier TEXT NOT NULL CHECK(cbt_disbursement_tier IN (
    'micro', 'small', 'medium', 'major'
  )),

  -- CBT trust details
  trust_registration_number TEXT,               -- Master of the High Court trust registration
  beneficiary_community TEXT,                   -- community name / municipal ward
  beneficiary_count INTEGER,                    -- number of registered beneficiaries
  cbt_equity_percentage REAL,                   -- % equity held by CBT in the project SPV

  -- Financial reporting (ZAR)
  annual_cbt_disbursement_zar REAL,             -- CBT disbursement for the reporting year
  cumulative_cbt_disbursement_zar REAL,         -- total disbursements since project COD
  sed_spend_zar REAL,                           -- SED expenditure for the reporting year
  sed_spend_percentage REAL,                    -- sed_spend as % of project revenue
  local_content_percentage REAL,                -- % local content in procurement

  -- Documentary trail
  report_ref TEXT,                              -- DMRE submission reference number
  queries_ref TEXT,                             -- DMRE query/information-request reference
  remediation_plan_ref TEXT,                    -- remediation plan document reference
  non_compliance_reason TEXT,                   -- DMRE grounds for non-compliance finding
  escalation_reason TEXT,
  cancellation_reason TEXT,

  -- Chain state
  chain_status TEXT NOT NULL DEFAULT 'reporting_period_open'
    CHECK(chain_status IN (
      'reporting_period_open',   -- DMRE reporting window opened; IPP must begin data collection
      'data_collection',         -- IPP gathering disbursement and SED expenditure data
      'report_drafted',          -- annual CBT/SED report draft complete; awaiting IPP sign-off
      'submitted',               -- submitted to DMRE; SLA clock starts
      'under_review',            -- DMRE conducting initial review of the submission
      'queries_issued',          -- DMRE issued information requests / clarifications to IPP
      'response_submitted',      -- IPP submitted responses to DMRE queries
      'approved',                -- DMRE approved the annual CBT/SED report; terminal
      'non_compliant',           -- DMRE found the report / disbursements non-compliant
      'remediation_submitted',   -- IPP submitted a remediation plan to address non-compliance
      'cancelled',               -- report voided before submission; terminal
      'escalated'                -- escalated to DMRE Enforcement and/or BBBEE Commission; terminal
    )),

  -- SLA
  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  regulator_notified INTEGER DEFAULT 0,
  actor_id TEXT,
  reason TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cbt_sed_ipp
  ON oe_cbt_sed_reports(ipp_id, reporting_year);
CREATE INDEX IF NOT EXISTS idx_cbt_sed_status
  ON oe_cbt_sed_reports(chain_status, sla_deadline);
CREATE INDEX IF NOT EXISTS idx_cbt_sed_project
  ON oe_cbt_sed_reports(project_name, reipppp_bid_window);
