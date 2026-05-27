-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 7 — Offtaker P6: PPA delivery-obligation tracking + take-or-pay
--
-- Closes the offtaker observation loop. Each active PPA emits a monthly
-- obligation row containing contracted MWh; as IPP-side readings are submitted
-- and verified, delivered MWh accumulates against it. If delivered < threshold
-- by the cure deadline, the row flips to take_or_pay, which fires a cascade
-- into the regulator inbox AND the lender watchlist if the borrower is
-- already under observation.
--
-- 2 new tables + 1 column on off_ppa_portfolio (cure_window_days for per-PPA
-- override; default 14d via spec). Per-statement ALTERs so deploy.yml shell
-- execute treats duplicate-column as benign.
-- ═══════════════════════════════════════════════════════════════════════════

-- Monthly obligations roll-up: one row per (ppa_id, period_month).
CREATE TABLE IF NOT EXISTS oe_offtaker_ppa_obligations (
  id                     TEXT PRIMARY KEY,
  ppa_id                 TEXT NOT NULL,                          -- off_ppa_portfolio.id
  participant_id         TEXT NOT NULL,                          -- offtaker (the buyer)
  counterparty_id        TEXT,                                   -- IPP (the seller); informational
  period_month           TEXT NOT NULL,                          -- YYYY-MM
  contracted_mwh         REAL NOT NULL DEFAULT 0,
  delivered_mwh          REAL NOT NULL DEFAULT 0,                -- sum of verified readings for the period
  threshold_pct          REAL NOT NULL DEFAULT 95,               -- % of contracted that must be delivered to avoid take-or-pay
  cure_deadline_at       TEXT,                                   -- ISO; null until shortfall detected
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','delivered','shortfall','cured','take_or_pay')),
  take_or_pay_amount_zar REAL DEFAULT 0,                         -- computed at cure expiry
  cured_at               TEXT,
  cured_by               TEXT,
  cure_evidence_r2_key   TEXT,
  escalated_at           TEXT,
  notes                  TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_offtaker_obl_status
  ON oe_offtaker_ppa_obligations(status);
CREATE INDEX IF NOT EXISTS idx_offtaker_obl_ppa_month
  ON oe_offtaker_ppa_obligations(ppa_id, period_month);
CREATE INDEX IF NOT EXISTS idx_offtaker_obl_participant
  ON oe_offtaker_ppa_obligations(participant_id);

-- Per-reading delivery verification chain. IPP submits a reading; offtaker
-- verifies it (or rejects). On verify, delivered_mwh on the obligation row
-- moves up. Append-only (no UPDATE; corrections via new reversal rows).
CREATE TABLE IF NOT EXISTS oe_offtaker_delivery_verification (
  id                    TEXT PRIMARY KEY,
  obligation_id         TEXT NOT NULL,                           -- oe_offtaker_ppa_obligations.id
  ppa_id                TEXT NOT NULL,
  period_month          TEXT NOT NULL,
  reading_mwh           REAL NOT NULL,                           -- delta vs the prior reading; can be negative for corrections
  reading_window_start  TEXT,                                    -- ISO; optional
  reading_window_end    TEXT,                                    -- ISO; optional
  submitted_by          TEXT NOT NULL,                           -- IPP user id
  submitted_at          TEXT NOT NULL DEFAULT (datetime('now')),
  status                TEXT NOT NULL DEFAULT 'submitted'
                        CHECK (status IN ('submitted','verified','rejected','reversed')),
  verified_by           TEXT,                                    -- offtaker user id
  verified_at           TEXT,
  rejection_reason      TEXT,
  meter_evidence_r2_key TEXT,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_offtaker_dv_obligation
  ON oe_offtaker_delivery_verification(obligation_id);
CREATE INDEX IF NOT EXISTS idx_offtaker_dv_status
  ON oe_offtaker_delivery_verification(status);

-- Per-PPA cure window override. Default 14d when null.
ALTER TABLE off_ppa_portfolio ADD COLUMN cure_window_days INTEGER;
ALTER TABLE off_ppa_portfolio ADD COLUMN take_or_pay_pct REAL;
