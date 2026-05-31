-- Wave 142 — IPP Technical Query (TQ) Log
-- ISO 9001:2015 design communication requirements + FIDIC EPC contracts + CIDB best practice.
-- TQ = contractor → designer (DISTINCT from RFI which is contractor → PM/client).
-- URGENT SLA: safety_critical 24h (tightest) / construction_blocking 48h / standard 168h / information_only 336h.
-- SIGNATURE: flag_design_change EVERY tier when floor_structural_safety;
--            escalate_tq when floor_ie_notification_required;
--            issue_response when floor_nersa_impact.
-- Beats Aconex (static document workflow) with full designer-response lifecycle.

CREATE TABLE IF NOT EXISTS oe_ipp_tqs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_name TEXT,
  tq_number TEXT,
  chain_status TEXT NOT NULL DEFAULT 'raised',
  tq_title TEXT NOT NULL,
  discipline TEXT,
  query_urgency TEXT,
  contractor_ref TEXT,

  -- Query content
  query_description TEXT NOT NULL,
  drawing_ref TEXT,
  specification_ref TEXT,
  proposed_solution TEXT,

  -- Assignment
  assigned_designer TEXT,
  design_company TEXT,
  assigned_at TEXT,

  -- Response
  response_description TEXT,
  response_type TEXT,
  design_change_ref TEXT,
  rejection_reason TEXT,
  escalation_reason TEXT,
  escalation_notes TEXT,

  -- Floor flags (5)
  floor_structural_safety INTEGER NOT NULL DEFAULT 0,
  floor_ie_notification_required INTEGER NOT NULL DEFAULT 0,
  floor_lender_notification INTEGER NOT NULL DEFAULT 0,
  floor_nersa_impact INTEGER NOT NULL DEFAULT 0,
  floor_specification_deviation INTEGER NOT NULL DEFAULT 0,

  -- SLA
  sla_target_hours INTEGER,
  sla_deadline_at TEXT,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  sla_breach_count INTEGER NOT NULL DEFAULT 0,

  -- Regulator
  is_reportable INTEGER NOT NULL DEFAULT 0,
  regulator_ref TEXT,

  -- Cross-refs
  rfi_ref TEXT,
  ncr_ref TEXT,
  ms_ref TEXT,
  submittal_ref TEXT,

  -- State timestamps (12)
  raised_at TEXT,
  logged_at TEXT,
  allocated_at TEXT,
  under_review_at TEXT,
  response_drafted_at TEXT,
  response_approved_at TEXT,
  response_issued_at TEXT,
  acknowledged_at TEXT,
  closed_at TEXT,
  rejected_at TEXT,
  design_change_required_at TEXT,
  escalated_at TEXT,

  -- Meta
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_ipp_tq_events (
  id TEXT PRIMARY KEY,
  tq_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_id TEXT,
  actor_role TEXT,
  notes TEXT,
  regulator_crossed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_tqs_chain_status ON oe_ipp_tqs(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_tqs_query_urgency ON oe_ipp_tqs(query_urgency);
CREATE INDEX IF NOT EXISTS idx_ipp_tqs_discipline ON oe_ipp_tqs(discipline);
CREATE INDEX IF NOT EXISTS idx_ipp_tqs_project_id ON oe_ipp_tqs(project_id);
CREATE INDEX IF NOT EXISTS idx_ipp_tqs_sla_breached ON oe_ipp_tqs(sla_breached);
CREATE INDEX IF NOT EXISTS idx_ipp_tqs_is_reportable ON oe_ipp_tqs(is_reportable);
CREATE INDEX IF NOT EXISTS idx_ipp_tqs_floor_structural_safety ON oe_ipp_tqs(floor_structural_safety);
CREATE INDEX IF NOT EXISTS idx_ipp_tqs_floor_ie_notification_required ON oe_ipp_tqs(floor_ie_notification_required);
