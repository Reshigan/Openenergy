-- W233: POPIA Data Subject Request (DSR) Lifecycle
-- POPIA Part 3 §23-25 + PAIA §18 + Information Regulator of SA Guidance Note 1/2022
-- Right of access, correction, deletion, objection, portability

CREATE TABLE IF NOT EXISTS oe_data_subject_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  -- Request metadata
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  requester_id_number TEXT,          -- SA ID or passport (POPIA §26 verification)
  relationship TEXT NOT NULL CHECK (relationship IN ('data_subject','authorised_representative','guardian')),
  -- Request classification
  request_type TEXT NOT NULL CHECK (request_type IN ('access','correction','deletion','objection','portability','restriction')),
  -- Tier drives SLA (MIXED by type, stored as snapshot)
  sla_days INTEGER NOT NULL,         -- computed from request_type at creation
  -- Subject matter
  data_categories TEXT,              -- JSON array: personal_info, financial, health, etc.
  systems_involved TEXT,             -- JSON array: D1 tables / KV namespaces
  -- Processing chain
  chain_status TEXT NOT NULL DEFAULT 'received' CHECK (chain_status IN (
    'received','acknowledged','identity_verified','data_mapped','legal_assessment',
    'response_drafted','fulfilled','partial_disclosure','refused',
    'erasure_completed','objection_upheld','withdrawn'
  )),
  -- Outcome tracking
  legal_ground_for_refusal TEXT,     -- POPIA §11 / PAIA exemption
  partial_disclosure_rationale TEXT,
  response_ref TEXT,                  -- reference number issued to subject
  -- Regulator notification
  ir_notified INTEGER NOT NULL DEFAULT 0,   -- Information Regulator notified?
  ir_notification_ref TEXT,
  -- SLA
  sla_deadline TEXT NOT NULL,
  -- Audit
  actor_id TEXT,
  reason_code TEXT,
  reason_detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dsr_tenant ON oe_data_subject_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dsr_status ON oe_data_subject_requests(chain_status);
CREATE INDEX IF NOT EXISTS idx_dsr_type ON oe_data_subject_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_dsr_deadline ON oe_data_subject_requests(sla_deadline);
