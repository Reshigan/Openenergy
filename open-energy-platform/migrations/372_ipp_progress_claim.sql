-- Wave 141 — IPP Progress Claims & Payment Certificates
-- JBCC (Joint Building Contracts Committee) SA standard construction contract +
-- NEC4 payment assessment process + REIPPPP payment milestones +
-- Equator Principles EP4 disbursement certification.
-- 12-state P6 lifecycle on oe_ipp_progress_claims.
-- INVERTED SLA: major (>R10m) gets most time (720h); minor (<R100k) gets least (72h).

CREATE TABLE IF NOT EXISTS oe_ipp_progress_claims (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_name TEXT,
  claim_number TEXT,
  chain_status TEXT NOT NULL DEFAULT 'submitted',
  claim_type TEXT,
  claim_tier TEXT,
  contractor_name TEXT,
  subcontractor_ref TEXT,

  -- Claim period
  claim_period_from TEXT,
  claim_period_to TEXT,
  contractor_invoice_ref TEXT,

  -- Financial amounts (all ZAR)
  claim_amount_zar INTEGER NOT NULL,
  qs_assessed_zar INTEGER,
  certified_amount_zar INTEGER,
  approved_amount_zar INTEGER,
  retention_amount_zar INTEGER,
  vat_amount_zar INTEGER,
  net_payable_zar INTEGER,
  previous_certified_total_zar INTEGER,
  this_period_zar INTEGER,
  contract_completion_pct REAL,

  -- Assessment notes
  qs_notes TEXT,
  pm_notes TEXT,
  engineer_certification_notes TEXT,
  dispute_reason TEXT,
  rejection_reason TEXT,
  suspension_reason TEXT,

  -- Floor flags (5)
  floor_ie_milestone_payment INTEGER NOT NULL DEFAULT 0,
  floor_lender_certification_required INTEGER NOT NULL DEFAULT 0,
  floor_retention_release INTEGER NOT NULL DEFAULT 0,
  floor_variation_included INTEGER NOT NULL DEFAULT 0,
  floor_defects_outstanding INTEGER NOT NULL DEFAULT 0,

  -- SLA fields
  sla_target_hours INTEGER,
  sla_deadline_at TEXT,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  sla_breach_count INTEGER NOT NULL DEFAULT 0,

  -- Regulator
  is_reportable INTEGER NOT NULL DEFAULT 0,
  regulator_ref TEXT,

  -- Cross-refs
  change_order_ref TEXT,
  milestone_ref TEXT,
  drawdown_ref TEXT,

  -- State timestamps
  submitted_at TEXT,
  quantity_survey_review_at TEXT,
  pm_review_at TEXT,
  engineer_certified_at TEXT,
  approved_at TEXT,
  payment_processed_at TEXT,
  closed_at TEXT,
  disputed_at TEXT,
  suspended_at TEXT,
  rejected_at TEXT,
  partial_payment_at TEXT,
  final_account_at TEXT,

  -- Meta
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_ipp_pcn_events (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_id TEXT,
  actor_role TEXT,
  notes TEXT,
  regulator_crossed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_progress_claims_chain_status ON oe_ipp_progress_claims(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_progress_claims_claim_tier ON oe_ipp_progress_claims(claim_tier);
CREATE INDEX IF NOT EXISTS idx_ipp_progress_claims_claim_type ON oe_ipp_progress_claims(claim_type);
CREATE INDEX IF NOT EXISTS idx_ipp_progress_claims_project_id ON oe_ipp_progress_claims(project_id);
CREATE INDEX IF NOT EXISTS idx_ipp_progress_claims_sla_breached ON oe_ipp_progress_claims(sla_breached);
CREATE INDEX IF NOT EXISTS idx_ipp_progress_claims_is_reportable ON oe_ipp_progress_claims(is_reportable);
CREATE INDEX IF NOT EXISTS idx_ipp_progress_claims_floor_ie_milestone ON oe_ipp_progress_claims(floor_ie_milestone_payment);
CREATE INDEX IF NOT EXISTS idx_ipp_progress_claims_floor_lender_cert ON oe_ipp_progress_claims(floor_lender_certification_required);
CREATE INDEX IF NOT EXISTS idx_ipp_pcn_events_claim_id ON oe_ipp_pcn_events(claim_id);
