-- Wave 63 — OEM-Support Warranty-Recovery / Supplier-Recovery Claim chain.
-- The COMMERCIAL cost-recovery counterpart to W15 (warranty / RMA): when a
-- deployed-asset component fails within the OEM supply warranty, W15 processes
-- the FIELD-side return (repair/replace) and W63 (this chain) recovers OUR cost
-- from the manufacturer under the supply-agreement warranty. Completes the
-- asset-warranty lifecycle — an RMA (W15) and/or work-order repair (W16)
-- generates a cost, then that cost is pursued against the OEM here.
--
-- Contractual / standards framing: OEM supply-agreement warranty + serial-defect
-- / epidemic-failure clauses; NRCS compulsory-specification SAFETY recall regime;
-- CPA 68/2008 s55/s56 (implied warranty of quality) + s61 (product liability);
-- NERSA Grid Code / security-of-supply (a serial defect derating a fleet of
-- grid-connected generation is reportable regardless of the rand value).
--
-- 12-state P6 lifecycle:
--   claim_drafted → submitted_to_oem → oem_acknowledged → under_assessment
--     → assessment_complete → approved → recovery_pending → recovered  (happy)
--   rejection:   assessment_complete → rejected           (OEM denies, uncontested)
--   dispute:     assessment_complete | recovery_pending → disputed; then
--                resolve_dispute → approved  OR  write_off → written_off
--   withdraw:    any pre-approval operative state → withdrawn
--
-- Recovery tiers (ZAR millions; drive the MIXED SLA + reportability):
--   minor < 1 / moderate < 10 / material < 50 / major < 250 / critical >= 250
--   LARGE = {major, critical}.
--
-- Defect classification — the DISTINCTIVE W63 dimension (drives the crossing):
--   isolated / batch / serial / safety / wear_out. SYSTEMIC = {serial, safety}.
--
-- MIXED SLA: claim_drafted / under_assessment / disputed INVERTED (bigger
-- recovery = MORE time, deeper evidence/RCA/legal); recovery_pending URGENT
-- (bigger approved recovery chased FASTER for working capital); submission /
-- acknowledgement / assessment_complete / approved fixed. Terminals 0.
--
-- Reportability (the W63 signature is DEFECT-CLASS-driven, not size-driven):
--   complete_assessment crosses for EVERY tier when the classified defect is
--   SYSTEMIC {serial, safety} (a serial/epidemic or safety defect on the
--   regulated generation estate is notifiable regardless of recovery value); a
--   non-systemic defect crosses only for the large tiers. write_off crosses for
--   the large tiers only. SLA breaches cross for the large tiers only.
--
-- Single-party write {admin, support} (same as W41/W47/W55) — no OEM login role;
-- the support desk records every party's action. actor_party (claimant /
-- oem_supplier / assessor) records the contractual function per step, not the
-- JWT role.

CREATE TABLE IF NOT EXISTS oe_warranty_recoveries (
  id                            TEXT PRIMARY KEY,
  case_number                   TEXT UNIQUE NOT NULL,

  -- Provenance (the W15 RMA / W16 work order that generated the recoverable cost)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (single-party write; functional tagging only)
  claimant_party_id             TEXT NOT NULL,     -- our O&M / asset side
  claimant_party_name           TEXT NOT NULL,
  oem_party_id                  TEXT NOT NULL,     -- the manufacturer / supplier
  oem_party_name                TEXT NOT NULL,
  assessor_party_id             TEXT,              -- independent / joint technical assessor
  assessor_party_name           TEXT,

  -- The defective asset / component
  asset_name                    TEXT,              -- the plant / site
  component_type                TEXT,              -- inverter / turbine / module / transformer / bms / scada
  oem_name                      TEXT,              -- OEM brand
  product_model                 TEXT,              -- model / part number
  serial_or_batch_ref           TEXT,              -- serial or manufacturing-batch reference
  warranty_ref                  TEXT,              -- supply-agreement warranty clause / number
  warranty_expiry               TEXT,              -- warranty expiry date

  -- Defect classification (the W63 signature)
  defect_class                  TEXT NOT NULL CHECK (defect_class IN (
    'isolated','batch','serial','safety','wear_out'
  )),
  defect_description            TEXT,
  failure_mode                  TEXT,
  units_affected                INTEGER,
  fleet_size                    INTEGER,

  -- Recovery economics (ZAR millions)
  repair_cost_zar_m             REAL,
  replacement_cost_zar_m        REAL,
  lost_generation_zar_m         REAL,
  claimed_zar_m                 REAL,              -- amount claimed against the OEM
  recovery_zar_m                REAL NOT NULL,     -- recovery amount (drives tier)
  recovered_zar_m               REAL,              -- amount actually recovered
  recovery_method               TEXT CHECK (recovery_method IS NULL OR recovery_method IN (
    'credit_note','replacement_in_kind','cash','repair_at_oem_cost'
  )),
  recovery_tier                 TEXT NOT NULL CHECK (recovery_tier IN (
    'minor','moderate','material','major','critical'
  )),

  -- Gates
  submitted_flag                INTEGER NOT NULL DEFAULT 0,
  acknowledged_flag             INTEGER NOT NULL DEFAULT 0,
  assessment_complete_flag      INTEGER NOT NULL DEFAULT 0,
  approved_flag                 INTEGER NOT NULL DEFAULT 0,
  dispute_raised                INTEGER NOT NULL DEFAULT 0,
  dispute_resolved              INTEGER NOT NULL DEFAULT 0,
  recovered_flag                INTEGER NOT NULL DEFAULT 0,

  -- Refs
  draft_ref                     TEXT,
  submission_ref                TEXT,
  acknowledgement_ref           TEXT,
  assessment_ref                TEXT,
  approval_ref                  TEXT,
  rejection_ref                 TEXT,
  dispute_ref                   TEXT,
  resolution_ref                TEXT,
  recovery_ref                  TEXT,
  confirmation_ref              TEXT,
  writeoff_ref                  TEXT,
  withdrawal_ref                TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  draft_basis                   TEXT,
  submission_basis              TEXT,
  acknowledgement_basis         TEXT,
  assessment_basis              TEXT,
  approval_basis                TEXT,
  rejection_basis               TEXT,
  dispute_basis                 TEXT,
  resolution_basis              TEXT,
  recovery_basis                TEXT,
  writeoff_basis                TEXT,
  withdrawal_basis              TEXT,
  reason_code                   TEXT,
  notes                         TEXT,

  dispute_round                 INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'claim_drafted','submitted_to_oem','oem_acknowledged','under_assessment',
    'assessment_complete','approved','disputed','recovery_pending',
    'recovered','rejected','withdrawn','written_off'
  )),
  claim_drafted_at              TEXT NOT NULL,
  submitted_to_oem_at           TEXT,
  oem_acknowledged_at           TEXT,
  under_assessment_at           TEXT,
  assessment_complete_at        TEXT,
  approved_at                   TEXT,
  disputed_at                   TEXT,
  recovery_pending_at           TEXT,
  recovered_at                  TEXT,
  rejected_at                   TEXT,
  withdrawn_at                  TEXT,
  written_off_at                TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_wrec_status   ON oe_warranty_recoveries(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_wrec_tier     ON oe_warranty_recoveries(recovery_tier);
CREATE INDEX IF NOT EXISTS idx_oe_wrec_defect   ON oe_warranty_recoveries(defect_class);
CREATE INDEX IF NOT EXISTS idx_oe_wrec_claimant ON oe_warranty_recoveries(claimant_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_wrec_oem      ON oe_warranty_recoveries(oem_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_wrec_drafted  ON oe_warranty_recoveries(claim_drafted_at);
CREATE INDEX IF NOT EXISTS idx_oe_wrec_sla      ON oe_warranty_recoveries(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_warranty_recoveries_events (
  id                 TEXT PRIMARY KEY,
  recovery_id        TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_wrec_events_r    ON oe_warranty_recoveries_events(recovery_id);
CREATE INDEX IF NOT EXISTS idx_oe_wrec_events_type ON oe_warranty_recoveries_events(event_type);
