-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 8 — Grid/Wheeling P6: monthly charge reconciliation + dispute lifecycle
--
-- The existing oe_wheeling_agreements is an agreement registry only — once
-- approved, no monthly reconciliation against actual transmission volumes,
-- and no structured dispute path. This wave closes that gap.
--
-- For each (agreement_id, period_month), the grid operator issues a single
-- charge row: gross = transmission_mwh × tariff, plus loss_zar (loss_factor
-- × tariff × transmission) and ancillaries. Offtaker (or admin/support) may
-- raise a dispute by dispute_deadline_at; if no resolution by that deadline,
-- the daily cron auto-flips the charge to 'escalated' and posts a regulator
-- inbox entry.
--
-- 2 new tables + 1 column on oe_wheeling_agreements (dispute_window_days,
-- default 14 via spec). Per-statement ALTER so deploy.yml shell execute
-- treats duplicate-column as benign.
-- ═══════════════════════════════════════════════════════════════════════════

-- Monthly wheeling charge ledger: one row per (agreement_id, period_month).
CREATE TABLE IF NOT EXISTS oe_grid_wheeling_charges (
  id                    TEXT PRIMARY KEY,
  agreement_id          TEXT NOT NULL,                              -- oe_wheeling_agreements.id
  period_month          TEXT NOT NULL,                              -- YYYY-MM
  issued_by             TEXT NOT NULL,                              -- grid_operator user id
  issued_at             TEXT NOT NULL DEFAULT (datetime('now')),
  transmission_mwh      REAL NOT NULL DEFAULT 0,                    -- delivered transmission for the month
  tariff_zar_per_mwh    REAL NOT NULL DEFAULT 0,                    -- snapshot of agreement tariff at issue
  loss_factor_pct       REAL NOT NULL DEFAULT 0,                    -- snapshot of agreement loss factor
  loss_mwh              REAL NOT NULL DEFAULT 0,                    -- transmission_mwh × loss_factor_pct / 100
  gross_zar             REAL NOT NULL DEFAULT 0,                    -- transmission_mwh × tariff
  loss_zar              REAL NOT NULL DEFAULT 0,                    -- loss_mwh × tariff
  ancillaries_zar       REAL NOT NULL DEFAULT 0,                    -- reactive power, balancing services
  total_zar             REAL NOT NULL DEFAULT 0,                    -- gross + loss + ancillaries
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','disputed','reconciled','paid','escalated')),
  dispute_deadline_at   TEXT,                                       -- ISO; issued_at + dispute_window_days
  paid_at               TEXT,
  paid_by               TEXT,
  paid_amount_zar       REAL,
  escalated_at          TEXT,
  escalated_to          TEXT,                                       -- 'regulator'
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grid_wheel_charges_status
  ON oe_grid_wheeling_charges(status);
CREATE INDEX IF NOT EXISTS idx_grid_wheel_charges_agreement_month
  ON oe_grid_wheeling_charges(agreement_id, period_month);
CREATE INDEX IF NOT EXISTS idx_grid_wheel_charges_deadline
  ON oe_grid_wheeling_charges(dispute_deadline_at);

-- Dispute lifecycle. A charge may have at most one open dispute at a time;
-- the route enforces that. Each dispute row is append-only on raise; status
-- is updated to 'resolved' or 'escalated' as the workflow advances.
CREATE TABLE IF NOT EXISTS oe_grid_wheeling_disputes (
  id                       TEXT PRIMARY KEY,
  charge_id                TEXT NOT NULL,                           -- oe_grid_wheeling_charges.id
  agreement_id             TEXT NOT NULL,
  raised_by                TEXT NOT NULL,                           -- offtaker / admin user id
  raised_at                TEXT NOT NULL DEFAULT (datetime('now')),
  dispute_reason           TEXT NOT NULL,
  claimed_amount_zar       REAL,                                    -- amount the offtaker thinks is correct
  status                   TEXT NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','resolved','escalated')),
  resolved_by              TEXT,
  resolved_at              TEXT,
  resolution_amount_zar    REAL,                                    -- final settled amount
  resolution_notes         TEXT,
  evidence_r2_key          TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grid_wheel_disputes_charge
  ON oe_grid_wheeling_disputes(charge_id);
CREATE INDEX IF NOT EXISTS idx_grid_wheel_disputes_status
  ON oe_grid_wheeling_disputes(status);

-- Per-agreement dispute window override. Default 14d when null.
ALTER TABLE oe_wheeling_agreements ADD COLUMN dispute_window_days INTEGER;
