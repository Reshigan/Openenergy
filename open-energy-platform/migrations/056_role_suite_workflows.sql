-- ════════════════════════════════════════════════════════════════════════
-- 056 · L4 workflow state machines for remaining 5 role suites
--
-- Brings carbon_fund / grid_operator / regulator / admin / support up to
-- the same "state machine + audit + AI suggestion" L4 standard the
-- trader / settlement / lender suites now have. One migration so the
-- whole suite lands or none does. Every CREATE uses IF NOT EXISTS and
-- the design is additive — no existing rows are touched.
--
-- One shared shape per workflow table:
--   id PRIMARY KEY
--   status state-machine column (open|investigating|resolved|rejected
--                                or the role-specific variants below)
--   *_at timestamps for filed / resolved
--   resolution_outcome enum constrained to the role's playbook
--   notes / resolution_notes free-text
-- ════════════════════════════════════════════════════════════════════════

-- ─── Carbon Fund ──────────────────────────────────────────────────────
-- Vintage lifecycle: track each vintage cohort from issuance → validation
-- → trading → partial / full retirement. The existing carbon_vintages
-- table (added in 040+) holds the cohort; this table tracks workflow.
CREATE TABLE IF NOT EXISTS carbon_vintage_workflow (
  id                    TEXT PRIMARY KEY,
  vintage_id            TEXT NOT NULL,
  participant_id        TEXT NOT NULL,
  current_stage         TEXT NOT NULL DEFAULT 'issued'
    CHECK (current_stage IN ('issued','validated','listed','traded','retired_partial','retired_full','expired')),
  validated_at          TEXT,
  validated_by          TEXT,
  listed_at             TEXT,
  retired_volume_tco2e  REAL NOT NULL DEFAULT 0,
  outstanding_tco2e     REAL NOT NULL DEFAULT 0,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_carbon_vintage_workflow_vintage
  ON carbon_vintage_workflow (vintage_id);
CREATE INDEX IF NOT EXISTS idx_carbon_vintage_workflow_stage
  ON carbon_vintage_workflow (current_stage, participant_id);

-- MRV submission workflow — Measurement, Reporting, Verification.
CREATE TABLE IF NOT EXISTS carbon_mrv_workflow (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL,
  participant_id      TEXT NOT NULL,
  period_start        TEXT NOT NULL,
  period_end          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','under_verification','verified','rejected','published')),
  submitted_at        TEXT,
  submitted_by        TEXT,
  verified_at         TEXT,
  verified_by         TEXT,
  verifier_org        TEXT,
  reduction_tco2e     REAL,
  evidence_r2_key     TEXT,
  rejection_reason    TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_carbon_mrv_project
  ON carbon_mrv_workflow (project_id, status);
CREATE INDEX IF NOT EXISTS idx_carbon_mrv_participant
  ON carbon_mrv_workflow (participant_id, submitted_at);

-- Retirement certificate workflow — when a holder retires credits,
-- track issuance + delivery to the requesting party.
CREATE TABLE IF NOT EXISTS carbon_retirement_certificates (
  id                      TEXT PRIMARY KEY,
  retirement_id           TEXT NOT NULL,
  participant_id          TEXT NOT NULL,
  beneficiary_name        TEXT,
  beneficiary_email       TEXT,
  retired_volume_tco2e    REAL NOT NULL,
  certificate_number      TEXT UNIQUE NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','issued','delivered','revoked')),
  issued_at               TEXT,
  delivered_at            TEXT,
  delivery_method         TEXT,
  pdf_r2_key              TEXT,
  notes                   TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_carbon_certs_retirement
  ON carbon_retirement_certificates (retirement_id);
CREATE INDEX IF NOT EXISTS idx_carbon_certs_participant
  ON carbon_retirement_certificates (participant_id, status);

-- ─── Grid Operator ────────────────────────────────────────────────────
-- Curtailment workflow on top of existing curtailment_notices: track
-- issuance, party acknowledgement, and lift decision audit.
CREATE TABLE IF NOT EXISTS grid_curtailment_events (
  id                  TEXT PRIMARY KEY,
  curtailment_id      TEXT NOT NULL,
  event_type          TEXT NOT NULL CHECK (event_type IN (
    'issued','acknowledged','disputed','partial_lift','full_lift','escalated'
  )),
  actor_id            TEXT NOT NULL,
  occurred_at         TEXT NOT NULL DEFAULT (datetime('now')),
  notes               TEXT,
  payload_json        TEXT
);
CREATE INDEX IF NOT EXISTS idx_grid_curtail_events_curtail
  ON grid_curtailment_events (curtailment_id, occurred_at);

-- Outage incident response — track who responded and what they did.
CREATE TABLE IF NOT EXISTS grid_outage_responses (
  id                  TEXT PRIMARY KEY,
  outage_id           TEXT NOT NULL,
  responder_id        TEXT NOT NULL,
  response_type       TEXT NOT NULL CHECK (response_type IN (
    'acknowledged','dispatched_crew','rerouted','restored','escalated','closed'
  )),
  notes               TEXT,
  eta_minutes         INTEGER,
  responded_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grid_outage_responses_outage
  ON grid_outage_responses (outage_id, responded_at);

-- Ancillary service award acknowledgement audit (depth on existing
-- ancillary_service_awards).
CREATE TABLE IF NOT EXISTS grid_ancillary_award_events (
  id                  TEXT PRIMARY KEY,
  award_id            TEXT NOT NULL,
  event_type          TEXT NOT NULL CHECK (event_type IN (
    'awarded','accepted','declined','delivered','failed','settled'
  )),
  actor_id            TEXT NOT NULL,
  occurred_at         TEXT NOT NULL DEFAULT (datetime('now')),
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS idx_grid_ancillary_award_events
  ON grid_ancillary_award_events (award_id, occurred_at);

-- ─── Regulator ────────────────────────────────────────────────────────
-- Surveillance triage actions on top of regulator_surveillance_alerts.
CREATE TABLE IF NOT EXISTS regulator_surveillance_triage (
  id                  TEXT PRIMARY KEY,
  alert_id            TEXT NOT NULL,
  triaged_by          TEXT NOT NULL,
  triaged_at          TEXT NOT NULL DEFAULT (datetime('now')),
  decision            TEXT NOT NULL CHECK (decision IN (
    'false_positive','monitor','escalate_to_enforcement','contact_party','close_no_action'
  )),
  rationale           TEXT,
  enforcement_case_id TEXT,
  next_review_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_reg_surv_triage_alert
  ON regulator_surveillance_triage (alert_id);

-- Licence action workflow on top of regulator_licences + reg_licence_applications.
CREATE TABLE IF NOT EXISTS regulator_licence_action_workflow (
  id                  TEXT PRIMARY KEY,
  licence_id          TEXT,
  application_id      TEXT,
  action_type         TEXT NOT NULL CHECK (action_type IN (
    'grant','vary','suspend','revoke','reinstate','renew'
  )),
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_hearing','decided','executed','appealed','reversed')),
  initiated_by        TEXT NOT NULL,
  initiated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at          TEXT,
  decided_by          TEXT,
  decision_rationale  TEXT,
  appeal_deadline     TEXT,
  evidence_r2_key     TEXT,
  notes               TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_licence_action_licence
  ON regulator_licence_action_workflow (licence_id, status);
CREATE INDEX IF NOT EXISTS idx_reg_licence_action_app
  ON regulator_licence_action_workflow (application_id);

-- Enforcement case events — append-only event log per case.
CREATE TABLE IF NOT EXISTS regulator_enforcement_case_events (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL,
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'opened','evidence_filed','hearing_scheduled','hearing_held',
    'finding_issued','appeal_lodged','appeal_decided','closed'
  )),
  actor_id        TEXT NOT NULL,
  occurred_at     TEXT NOT NULL DEFAULT (datetime('now')),
  payload_json    TEXT,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_reg_enf_events_case
  ON regulator_enforcement_case_events (case_id, occurred_at);

-- ─── Admin ────────────────────────────────────────────────────────────
-- Tenant lifecycle events — every state transition on a participant.
CREATE TABLE IF NOT EXISTS admin_tenant_lifecycle_events (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'provisioned','activated','plan_changed','kyc_approved','kyc_rejected',
    'suspended','reactivated','offboarded','data_exported','data_erased'
  )),
  actor_id        TEXT NOT NULL,
  occurred_at     TEXT NOT NULL DEFAULT (datetime('now')),
  reason          TEXT,
  payload_json    TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_tenant_events_tenant
  ON admin_tenant_lifecycle_events (tenant_id, occurred_at);

-- Billing runs — monthly invoice generation against tenants.
CREATE TABLE IF NOT EXISTS admin_billing_runs (
  id              TEXT PRIMARY KEY,
  run_type        TEXT NOT NULL CHECK (run_type IN ('monthly','adhoc','correction')),
  period_start    TEXT NOT NULL,
  period_end      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','partially_completed')),
  tenants_billed  INTEGER NOT NULL DEFAULT 0,
  total_zar       REAL NOT NULL DEFAULT 0,
  started_at      TEXT,
  completed_at    TEXT,
  error_message   TEXT,
  initiated_by    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_billing_runs_status
  ON admin_billing_runs (status, created_at);

-- Feature flag override audit — every flag toggled by an admin.
CREATE TABLE IF NOT EXISTS admin_feature_flag_overrides (
  id              TEXT PRIMARY KEY,
  flag_key        TEXT NOT NULL,
  scope_type      TEXT NOT NULL CHECK (scope_type IN ('global','tenant','user')),
  scope_id        TEXT,
  previous_value  TEXT,
  new_value       TEXT NOT NULL,
  actor_id        TEXT NOT NULL,
  reason          TEXT,
  occurred_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_flag_overrides_flag
  ON admin_feature_flag_overrides (flag_key, occurred_at);

-- ─── Support ──────────────────────────────────────────────────────────
-- Support tickets — full ticket workflow.
CREATE TABLE IF NOT EXISTS support_tickets (
  id              TEXT PRIMARY KEY,
  ticket_number   TEXT UNIQUE NOT NULL,
  reporter_id     TEXT NOT NULL,
  tenant_id       TEXT,
  subject         TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL CHECK (category IN (
    'access','billing','feature_question','bug','data_issue','compliance','other'
  )),
  priority        TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','waiting_on_customer','resolved','closed')),
  assignee_id     TEXT,
  resolution      TEXT,
  resolved_at     TEXT,
  resolved_by     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets (status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee
  ON support_tickets (assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_reporter
  ON support_tickets (reporter_id, created_at);

-- Ticket comments — back-and-forth on a ticket.
CREATE TABLE IF NOT EXISTS support_ticket_comments (
  id              TEXT PRIMARY KEY,
  ticket_id       TEXT NOT NULL,
  author_id       TEXT NOT NULL,
  body            TEXT NOT NULL,
  visibility      TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','internal')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_support_comments_ticket
  ON support_ticket_comments (ticket_id, created_at);

-- Escalations — when a ticket bubbles up to engineering / management.
CREATE TABLE IF NOT EXISTS support_escalations (
  id              TEXT PRIMARY KEY,
  ticket_id       TEXT NOT NULL,
  escalated_by    TEXT NOT NULL,
  escalated_to    TEXT NOT NULL,
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','accepted','resolved','rejected')),
  resolution      TEXT,
  escalated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_support_escalations_ticket
  ON support_escalations (ticket_id);

-- Cross-tenant search audit — support agents searching across tenants
-- has POPIA implications; log every access.
CREATE TABLE IF NOT EXISTS support_cross_tenant_access (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL,
  tenant_accessed TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  justification   TEXT NOT NULL,
  ticket_id       TEXT,
  accessed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_support_xtenant_agent
  ON support_cross_tenant_access (agent_id, accessed_at);
CREATE INDEX IF NOT EXISTS idx_support_xtenant_tenant
  ON support_cross_tenant_access (tenant_accessed, accessed_at);
