-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 10 — IPP performance bond + insurance expiry escalation (P6).
--
-- Adds a dedicated performance bond / surety / guarantee registry alongside
-- the existing insurance_policies table, with a shared expiry-escalation
-- state machine: 90d-out warning → 30d-out cycle 1 notice → 14d-out cycle 2
-- notice → expired cycle 3 → regulator escalation.
--
-- Mirrors the Wave 6 lender dunning pattern but driven by date-based cure
-- windows rather than covenant breach signals. Idempotent (CREATE TABLE
-- IF NOT EXISTS + per-column ALTERs).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ipp_performance_bonds (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  bond_number TEXT NOT NULL,
  bond_type TEXT NOT NULL CHECK (bond_type IN (
    'performance','advance_payment','retention','warranty',
    'environmental_rehabilitation','parental_guarantee','letter_of_credit','bank_guarantee'
  )),
  issuer TEXT NOT NULL,
  beneficiary TEXT,
  face_value_zar REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  issued_at TEXT NOT NULL,
  expiry_at TEXT NOT NULL,
  release_conditions TEXT,
  document_r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active','call_pending','released','expired','forfeited','replaced'
  )),
  -- Wave 10 escalation columns.
  expiry_status TEXT NOT NULL DEFAULT 'green' CHECK (expiry_status IN (
    'green','warning','cycle_1','cycle_2','cycle_3','escalated'
  )),
  last_warning_at TEXT,
  last_cycle_1_at TEXT,
  last_cycle_2_at TEXT,
  last_cycle_3_at TEXT,
  last_escalated_at TEXT,
  last_acknowledged_at TEXT,
  last_acknowledged_by TEXT,
  -- When operator/insurer files a renewal that supersedes this bond.
  replaced_by_bond_id TEXT,
  -- Claim/forfeit metadata when status flips to call_pending/forfeited.
  claim_amount_zar REAL,
  claim_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bond_project ON ipp_performance_bonds(project_id);
CREATE INDEX IF NOT EXISTS idx_bond_expiry  ON ipp_performance_bonds(expiry_at);
CREATE INDEX IF NOT EXISTS idx_bond_status  ON ipp_performance_bonds(status);
CREATE INDEX IF NOT EXISTS idx_bond_exp_status ON ipp_performance_bonds(expiry_status);

-- Per-cycle notice log so the UI + regulator inbox have a stable audit trail
-- (mirrors oe_lender_dunning_notices from Wave 6).
CREATE TABLE IF NOT EXISTS ipp_bond_notices (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL REFERENCES ipp_performance_bonds(id),
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  cycle INTEGER NOT NULL CHECK (cycle IN (0, 1, 2, 3)),
  title TEXT NOT NULL,
  body_json TEXT,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','acknowledged','superseded','escalated')),
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  issued_by TEXT NOT NULL DEFAULT 'system',
  cure_deadline_at TEXT NOT NULL,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  escalated_at TEXT,
  parent_notice_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bnotice_bond ON ipp_bond_notices(bond_id);
CREATE INDEX IF NOT EXISTS idx_bnotice_status ON ipp_bond_notices(status);

-- Wave 10 also adds expiry-cycle tracking to insurance_policies so the same
-- sweep covers both bonds + insurance. Per-column ALTERs are individually
-- idempotent (duplicate column name == benign already-applied signal).
ALTER TABLE insurance_policies ADD COLUMN expiry_status TEXT NOT NULL DEFAULT 'green';
ALTER TABLE insurance_policies ADD COLUMN last_warning_at TEXT;
ALTER TABLE insurance_policies ADD COLUMN last_cycle_1_at TEXT;
ALTER TABLE insurance_policies ADD COLUMN last_cycle_2_at TEXT;
ALTER TABLE insurance_policies ADD COLUMN last_cycle_3_at TEXT;
ALTER TABLE insurance_policies ADD COLUMN last_escalated_at TEXT;
ALTER TABLE insurance_policies ADD COLUMN last_acknowledged_at TEXT;
ALTER TABLE insurance_policies ADD COLUMN last_acknowledged_by TEXT;
