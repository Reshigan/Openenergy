-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 11 — Carbon Article 6 / UNFCCC MRV verification chain (P6).
--
-- Deepens the L2 mrv_submissions / mrv_verifications schema from migration
-- 026 into a regulator-grade verification chain:
--
--   draft → submitted → doe_assigned → doe_review →
--     doe_opinion_positive | doe_opinion_qualified | doe_opinion_adverse | doe_opinion_disclaimer
--   → cra_review → cra_approved | cra_rejected
--   → issuance_authorized → issued
--
-- With:
--   • SLAs per state (DOE 90d per CDM rules; CRA 30d)
--   • SLA-breach auto-escalation
--   • DOE adverse opinion → regulator inbox (critical)
--   • CRA rejection → regulator inbox (high)
--   • Per-state audit-chain rows + cascade fan-out
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Extension columns on mrv_submissions ───────────────────────────────────
-- Per-column ALTERs are individually idempotent (duplicate column name ==
-- benign already-applied signal).
ALTER TABLE mrv_submissions ADD COLUMN chain_status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE mrv_submissions ADD COLUMN doe_assignee_id TEXT;
ALTER TABLE mrv_submissions ADD COLUMN doe_assigned_at TEXT;
ALTER TABLE mrv_submissions ADD COLUMN doe_due_at TEXT;
ALTER TABLE mrv_submissions ADD COLUMN doe_opinion TEXT;
ALTER TABLE mrv_submissions ADD COLUMN doe_opinion_at TEXT;
ALTER TABLE mrv_submissions ADD COLUMN cra_submitted_at TEXT;
ALTER TABLE mrv_submissions ADD COLUMN cra_due_at TEXT;
ALTER TABLE mrv_submissions ADD COLUMN cra_decision TEXT;
ALTER TABLE mrv_submissions ADD COLUMN cra_decision_at TEXT;
ALTER TABLE mrv_submissions ADD COLUMN cra_decision_by TEXT;
ALTER TABLE mrv_submissions ADD COLUMN cra_rejection_reason TEXT;
ALTER TABLE mrv_submissions ADD COLUMN issuance_authorized_at TEXT;
ALTER TABLE mrv_submissions ADD COLUMN issuance_authorized_by TEXT;
ALTER TABLE mrv_submissions ADD COLUMN last_sla_breach_at TEXT;

-- ─── Event log (audit chain rows for each state transition) ─────────────────
CREATE TABLE IF NOT EXISTS oe_mrv_chain_events (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES mrv_submissions(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'submitted','doe_assigned','doe_review_started','doe_opinion_recorded',
    'cra_submitted','cra_approved','cra_rejected',
    'issuance_authorized','sla_breached','withdrawn'
  )),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  notes TEXT,
  evidence_r2_key TEXT,
  body_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mrv_evt_submission ON oe_mrv_chain_events(submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrv_evt_type ON oe_mrv_chain_events(event_type);
