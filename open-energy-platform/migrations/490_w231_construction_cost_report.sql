-- W231: Lender Construction-Period Monthly IE Cost-to-Complete Report
-- LMA project finance + SARB Directive 7/2018 + Equator Principles IV
-- Monthly independent engineer (IE) certified cost-to-complete lifecycle.
-- INVERTED SLA: larger budget → longer review window (more IE scrutiny).
-- Tiers: small (<R500M, 5d) · medium (R500M–R5B, 7d) · large (R5B–R20B, 10d) · mega (>R20B, 14d)
-- Cure windows: small=30d · medium=45d · large=60d · mega=90d
-- Regulator crossings: trigger_default ALL tiers; confirm_cost_overrun large+mega; sla_breach large+mega

CREATE TABLE IF NOT EXISTS oe_construction_cost_reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  lender_id TEXT NOT NULL,
  ipp_id TEXT NOT NULL,
  report_month TEXT NOT NULL,                -- YYYY-MM format
  budget_tier TEXT NOT NULL CHECK(budget_tier IN ('small','medium','large','mega')),

  -- Financial metrics
  total_project_budget_zar REAL,             -- original approved budget
  actual_spend_to_date_zar REAL,             -- cumulative certified spend
  cost_to_complete_estimate_zar REAL,        -- IE estimate to finish
  projected_final_cost_zar REAL,             -- actual_spend + cost_to_complete
  contingency_budget_zar REAL,
  contingency_spent_zar REAL,

  -- Progress
  physical_completion_percentage REAL,       -- 0–100
  scheduled_completion_date TEXT,            -- ISO date from contract
  revised_completion_date TEXT,              -- lender-acknowledged revision

  -- IE certification
  ie_name TEXT,                              -- IE firm name
  ie_certification_ref TEXT,                 -- IE report reference number
  ie_certified_at TEXT,                      -- datetime of IE certification

  -- Overrun tracking
  overrun_zar REAL,                          -- projected_final − budget
  overrun_percentage REAL,                   -- overrun / budget * 100
  equity_injection_required_zar REAL,        -- equity cure required
  standby_facility_amount_zar REAL,          -- drawn from standby facility

  -- State machine
  chain_status TEXT NOT NULL DEFAULT 'monitoring_period_open' CHECK(chain_status IN (
    'monitoring_period_open',
    'report_requested',
    'report_submitted',
    'ie_review',
    'ie_certified',
    'budget_compliant',
    'cost_overrun_risk',
    'equity_injection_required',
    'standby_drawdown',
    'resolved',
    'default_triggered',
    'cancelled'
  )),
  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  regulator_notified INTEGER DEFAULT 0,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ccr_project ON oe_construction_cost_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_ccr_lender ON oe_construction_cost_reports(lender_id);
CREATE INDEX IF NOT EXISTS idx_ccr_status ON oe_construction_cost_reports(chain_status);
CREATE INDEX IF NOT EXISTS idx_ccr_month ON oe_construction_cost_reports(report_month);
