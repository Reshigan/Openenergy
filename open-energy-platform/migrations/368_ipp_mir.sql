-- Wave 139 — IPP Material Inspection Record (MIR)
-- ISO 9001:2015 §8.6 + REIPPPP quality specs + Equator Principles EP4 + IE oversight.
-- 12-state P6 lifecycle on oe_ipp_mirs.
-- URGENT SLA: critical_structural 24h (TIGHTEST) → general 168h (loosest).
-- SIGNATURE: reject_material EVERY tier when floor_ie_witnessed;
--            quarantine_material EVERY tier when floor_critical_safety.

CREATE TABLE IF NOT EXISTS oe_ipp_mirs (
  -- Core
  id                          TEXT    PRIMARY KEY,
  project_id                  TEXT    NOT NULL,
  project_name                TEXT,
  mir_number                  TEXT,
  chain_status                TEXT    NOT NULL DEFAULT 'delivery_notified',

  -- Material identification
  material_description        TEXT    NOT NULL,
  material_category           TEXT,
  material_tier               TEXT,
  supplier_name               TEXT,
  manufacturer                TEXT,
  batch_number                TEXT,
  certificate_number          TEXT,
  quantity                    REAL,
  quantity_unit               TEXT,
  po_reference                TEXT,

  -- Delivery
  scheduled_delivery_date     TEXT,
  actual_delivery_date        TEXT,
  delivery_note_ref           TEXT,
  delivery_vehicle_ref        TEXT,

  -- Inspection
  inspection_type             TEXT,
  inspector_name              TEXT,
  inspection_findings         TEXT,
  dimensional_check_passed    INTEGER,
  quantity_check_passed       INTEGER,
  documentation_check_passed  INTEGER,
  visual_check_passed         INTEGER,

  -- Lab testing
  test_required               INTEGER NOT NULL DEFAULT 0,
  lab_name                    TEXT,
  lab_sample_ref              TEXT,
  test_results                TEXT,
  test_passed                 INTEGER,

  -- Outcome
  rejection_reason            TEXT,
  quarantine_reason           TEXT,
  conditional_notes           TEXT,
  incorporated_to             TEXT,
  incorporated_by             TEXT,

  -- Floor flags (5)
  floor_ie_witnessed              INTEGER NOT NULL DEFAULT 0,
  floor_lender_hold_point         INTEGER NOT NULL DEFAULT 0,
  floor_nersa_material            INTEGER NOT NULL DEFAULT 0,
  floor_critical_safety           INTEGER NOT NULL DEFAULT 0,
  floor_manufacturer_warranty_at_risk INTEGER NOT NULL DEFAULT 0,

  -- SLA
  sla_target_hours            INTEGER,
  sla_deadline_at             TEXT,
  sla_breached                INTEGER NOT NULL DEFAULT 0,
  sla_breach_count            INTEGER NOT NULL DEFAULT 0,

  -- Regulator
  is_reportable               INTEGER NOT NULL DEFAULT 0,
  regulator_ref               TEXT,

  -- Cross-refs
  ncr_ref                     TEXT,
  submittal_ref               TEXT,
  rfi_ref                     TEXT,
  change_order_ref            TEXT,

  -- State timestamps (12)
  delivery_notified_at        TEXT,
  delivered_at                TEXT,
  initial_inspection_at       TEXT,
  detailed_inspection_at      TEXT,
  test_sampling_at            TEXT,
  results_pending_at          TEXT,
  approved_at                 TEXT,
  conditional_approval_at     TEXT,
  incorporated_at             TEXT,
  rejected_on_site_at         TEXT,
  quarantined_at              TEXT,
  returned_to_supplier_at     TEXT,

  -- Meta
  created_by                  TEXT,
  created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_ipp_mir_events (
  id              TEXT    PRIMARY KEY,
  mir_id          TEXT    NOT NULL REFERENCES oe_ipp_mirs(id),
  action          TEXT    NOT NULL,
  from_status     TEXT    NOT NULL,
  to_status       TEXT    NOT NULL,
  actor_id        TEXT,
  actor_role      TEXT,
  notes           TEXT,
  regulator_crossed INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ipp_mirs_chain_status     ON oe_ipp_mirs(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_mirs_material_tier    ON oe_ipp_mirs(material_tier);
CREATE INDEX IF NOT EXISTS idx_ipp_mirs_material_category ON oe_ipp_mirs(material_category);
CREATE INDEX IF NOT EXISTS idx_ipp_mirs_project_id       ON oe_ipp_mirs(project_id);
CREATE INDEX IF NOT EXISTS idx_ipp_mirs_sla_breached     ON oe_ipp_mirs(sla_breached);
CREATE INDEX IF NOT EXISTS idx_ipp_mirs_is_reportable    ON oe_ipp_mirs(is_reportable);
CREATE INDEX IF NOT EXISTS idx_ipp_mirs_floor_ie_witnessed       ON oe_ipp_mirs(floor_ie_witnessed);
CREATE INDEX IF NOT EXISTS idx_ipp_mirs_floor_lender_hold_point  ON oe_ipp_mirs(floor_lender_hold_point);
CREATE INDEX IF NOT EXISTS idx_ipp_mir_events_mir_id     ON oe_ipp_mir_events(mir_id);
