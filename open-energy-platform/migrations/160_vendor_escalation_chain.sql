-- Wave 35 — Esums O&M Warranty Vendor-Side Escalation.
-- Supplier-defect escalation lifecycle. When an Esums O&M operator detects a
-- recurring component defect across the fleet that is covered by a supplier /
-- OEM warranty, they file a vendor-defect escalation up to the manufacturer.
--
-- Distinct from W15 warranty/RMA (single-claim, customer→supplier RMA) and
-- W24 PR chain (fleet performance). This is the SUPPLIER-DEFECT side.
--
-- Standards: Consumer Protection Act 2008 §56 (implied warranty of quality) +
-- §61 (product liability); NRCS Act 2008 (recall powers for safety defects).
--
-- 11-state P6 lifecycle (8 forward + 3 branch terminals):
--   filed → vendor_triage → vendor_decision → escalated_to_oem →
--   oem_field_investigation → oem_decision → remediation → closed
--   + recall_issued / arbitration / withdrawn
--
-- Defect classes (URGENT SLA — more severe gets TIGHTER deadlines):
--   safety_recall  — safety-critical (fire/electrocution) — tightest
--   fleet_systemic — systemic across the fleet
--   batch_defect   — confined to a manufacturing batch / serial range
--   single_unit    — isolated single-unit defect — loosest
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/source_wave
-- (W15 warranty claims + W24 PR chain can initiate a vendor escalation).

CREATE TABLE IF NOT EXISTS oe_vendor_escalation (
  id                      TEXT PRIMARY KEY,
  case_number             TEXT UNIQUE NOT NULL,

  -- Provenance (W15 warranty.systemic_defect + W24 pr.component_defect)
  source_event            TEXT,
  source_entity_type      TEXT,
  source_entity_id        TEXT,
  source_wave             TEXT,

  -- Operator (Esums O&M) party
  operator_party_id       TEXT NOT NULL,
  operator_party_name     TEXT NOT NULL,

  -- Vendor / supplier party
  vendor_party_id         TEXT NOT NULL,
  vendor_party_name       TEXT NOT NULL,

  -- OEM / manufacturer party (set when escalated)
  oem_party_id            TEXT,
  oem_party_name          TEXT,

  -- Affected component / fleet
  component_type          TEXT NOT NULL,
  component_model         TEXT,
  serial_range            TEXT,
  fleet_units_affected    INTEGER NOT NULL DEFAULT 0,
  fleet_units_total       INTEGER NOT NULL DEFAULT 0,
  fleet_fraction          REAL,
  site_name               TEXT,
  site_province           TEXT,

  -- Defect class + safety flag
  defect_class            TEXT NOT NULL CHECK (defect_class IN (
    'safety_recall', 'fleet_systemic', 'batch_defect', 'single_unit'
  )),
  safety_critical         INTEGER NOT NULL DEFAULT 0,

  -- Refs
  warranty_clause         TEXT,
  filing_ref              TEXT,
  vendor_decision_ref     TEXT,
  oem_decision_ref        TEXT,
  remediation_ref         TEXT,
  recall_ref              TEXT,
  arbitration_case_ref    TEXT,
  withdrawal_ref          TEXT,

  -- Liability / remedy economics
  claim_value_zar         REAL,
  liability_accepted      INTEGER,
  remedy_type             TEXT,
  remedy_cost_zar         REAL,

  -- Narrative
  defect_summary          TEXT,
  vendor_decision_basis   TEXT,
  oem_decision_basis      TEXT,
  remediation_plan        TEXT,
  recall_basis            TEXT,
  arbitration_basis       TEXT,
  withdrawal_basis        TEXT,
  reason_code             TEXT,
  rod_notes               TEXT,

  -- State + lifecycle
  chain_status            TEXT NOT NULL CHECK (chain_status IN (
    'filed','vendor_triage','vendor_decision','escalated_to_oem',
    'oem_field_investigation','oem_decision','remediation',
    'closed','recall_issued','arbitration','withdrawn'
  )),
  filed_at                TEXT NOT NULL,
  vendor_triage_at        TEXT,
  vendor_decision_at      TEXT,
  escalated_to_oem_at     TEXT,
  oem_investigation_at    TEXT,
  oem_decision_at         TEXT,
  remediation_at          TEXT,
  closed_at               TEXT,
  recall_issued_at        TEXT,
  arbitration_at          TEXT,
  withdrawn_at            TEXT,

  sla_deadline_at         TEXT,
  last_sla_breach_at      TEXT,
  escalation_level        INTEGER NOT NULL DEFAULT 0,

  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_vendor_escalation_status    ON oe_vendor_escalation(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_vendor_escalation_class     ON oe_vendor_escalation(defect_class);
CREATE INDEX IF NOT EXISTS idx_oe_vendor_escalation_operator  ON oe_vendor_escalation(operator_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_vendor_escalation_vendor    ON oe_vendor_escalation(vendor_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_vendor_escalation_filed     ON oe_vendor_escalation(filed_at);
CREATE INDEX IF NOT EXISTS idx_oe_vendor_escalation_sla       ON oe_vendor_escalation(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_vendor_escalation_events (
  id              TEXT PRIMARY KEY,
  escalation_id   TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_vendor_escalation_events_case ON oe_vendor_escalation_events(escalation_id);
CREATE INDEX IF NOT EXISTS idx_oe_vendor_escalation_events_type ON oe_vendor_escalation_events(event_type);
