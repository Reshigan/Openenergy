-- Wave 77 — Reserve-Account (DSRA / MRA) Funding, Drawdown, Cure & Release (P6).
-- A project-finance facility agreement requires the borrower to fund and MAINTAIN
-- controlled reserve accounts: the Debt Service Reserve Account (DSRA, typically the
-- next 6 months of debt service) and the Maintenance / Major-Maintenance Reserve
-- Account (MRA). The account is a charged / controlled account — the borrower funds
-- it (cash or an acceptable letter of credit), the agent bank monitors the target
-- balance on every test date, and a shortfall must be CURED inside a contractual
-- window. A legitimate DRAW (to meet debt service the cashflow could not cover) must
-- be REPLENISHED inside a top-up window. At final maturity, deleveraging or a
-- contractual step-down the reserve is RELEASED. A failure to cure a shortfall or
-- replenish a draw is an EVENT OF DEFAULT — always notifiable.
--
-- This is the L4 deepening of the flat /lender/reserves CRUD surface (reserve_accounts
-- table): it turns a static balance record into a funding -> shortfall -> cure ->
-- release lifecycle. DISTINCT from the rest of the Lender book:
--   W21 certifies LOAN drawdowns (money out to build); W30 reconciles USE OF PROCEEDS;
--   W38 tests DSCR/LLCR covenants; W45 runs enforcement once default is declared;
--   W53 originates the FACILITY; W69 perfects the SECURITY package. W77 keeps the
--   debt-service / maintenance BUFFERS whole.
--
-- 12-state P6 lifecycle:
--   reserve_required -> funding_scheduled -> funding_in_progress -> funded
--     -> (monitored) -> release_requested -> released
--   shortfall (test fails): funded -> shortfall_flagged -> cure_pending
--       -> (replenish | waive) funded | (declare_breach) breached
--   authorised draw: funded -> drawdown_authorized -> drawn
--       -> (replenish | waive) funded | (declare_breach) breached
--     (a draw may also be authorised straight out of shortfall_flagged)
--   cancel (obligation falls away before funding): {reserve_required,
--     funding_scheduled, funding_in_progress} -> cancelled
--
-- Tiers (5) by reserve TARGET amount (ZAR): small <R10m / medium <R50m / large <R250m
-- / major <R1bn / systemic >=R1bn. LARGE_TIERS = {major, systemic}.
--
-- SLA matrix is URGENT — the LARGER the reserve target, the TIGHTER every window (a
-- shortfall on a systemic-facility DSRA is a far more serious prudential signal). The
-- healthy steady state `funded` carries no deadline (not swept). Same flavour as W69.
--
-- Reportability — the W77 SIGNATURE is BREACH-DRIVEN: a failure to cure / replenish is
-- an event of default, so declare_breach crosses for EVERY tier (mirror of W45 write_off
-- / W69 mark_lapsed / W68 declare_default). waive_requirement + SLA breaches cross for
-- the LARGE tiers (major + systemic) only.
--
-- Single write: the agent / lender drives every step; the borrower funds and the
-- account bank moves cash out-of-band. actor_party tags whether a step represents the
-- lender (agent), the borrower or the account bank, for the audit trail.

CREATE TABLE IF NOT EXISTS oe_reserve_account_chain (
  id                       TEXT PRIMARY KEY,
  reserve_number           TEXT UNIQUE NOT NULL,

  -- Provenance (a reserve obligation is established by a facility at financial close)
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,
  facility_ref             TEXT,              -- originating credit facility
  project_id               TEXT,              -- financed project / SPV
  loan_agreement_ref       TEXT,

  -- Parties
  lender_name              TEXT NOT NULL,     -- agent / facility agent
  borrower_name            TEXT NOT NULL,     -- project company / SPV
  account_bank             TEXT,              -- account bank holding the controlled account

  -- Classification
  reserve_type             TEXT,              -- dsra / mra / om_reserve / tax_reserve
  funding_mode             TEXT,              -- cash / letter_of_credit / hybrid
  target_basis             TEXT,              -- e.g. next_6m_debt_service
  account_number           TEXT,
  currency                 TEXT,              -- ZAR / USD
  target_amount_zar        REAL NOT NULL,     -- required balance — drives the tier
  current_balance_zar      REAL,              -- current funded balance
  drawn_amount_zar         REAL,              -- amount drawn (authorised use)
  shortfall_amount_zar     REAL,              -- balance gap at the last test
  reserve_tier             TEXT NOT NULL CHECK (reserve_tier IN (
    'small','medium','large','major','systemic'
  )),

  -- Dates
  next_test_date           TEXT,
  cure_deadline            TEXT,
  release_due_date         TEXT,
  shortfall_reason_code    TEXT,              -- lc_lapse / fx_move / missed_sweep / dscr_dip

  -- Refs
  funding_ref              TEXT,
  shortfall_ref            TEXT,
  cure_ref                 TEXT,
  drawdown_ref             TEXT,
  replenishment_ref        TEXT,
  waiver_ref               TEXT,
  release_ref              TEXT,
  breach_ref               TEXT,
  cancel_ref               TEXT,

  -- Narrative
  funding_basis            TEXT,
  shortfall_basis          TEXT,
  cure_basis               TEXT,
  drawdown_basis           TEXT,
  replenishment_basis      TEXT,
  waiver_basis             TEXT,
  release_basis            TEXT,
  breach_basis             TEXT,
  cancel_basis             TEXT,
  reason_code              TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'reserve_required','funding_scheduled','funding_in_progress','funded',
    'shortfall_flagged','cure_pending','drawdown_authorized','drawn',
    'release_requested','released','breached','cancelled'
  )),
  reserve_required_at        TEXT NOT NULL,
  funding_scheduled_at       TEXT,
  funding_in_progress_at     TEXT,
  funded_at                  TEXT,
  shortfall_flagged_at       TEXT,
  cure_pending_at            TEXT,
  drawdown_authorized_at     TEXT,
  drawn_at                   TEXT,
  release_requested_at       TEXT,
  released_at                TEXT,
  breached_at                TEXT,
  cancelled_at               TEXT,

  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  is_reportable            INTEGER NOT NULL DEFAULT 0,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_rac_status   ON oe_reserve_account_chain(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_rac_tier     ON oe_reserve_account_chain(reserve_tier);
CREATE INDEX IF NOT EXISTS idx_oe_rac_lender   ON oe_reserve_account_chain(lender_name);
CREATE INDEX IF NOT EXISTS idx_oe_rac_type     ON oe_reserve_account_chain(reserve_type);
CREATE INDEX IF NOT EXISTS idx_oe_rac_sla      ON oe_reserve_account_chain(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_reserve_account_chain_events (
  id                 TEXT PRIMARY KEY,
  reserve_account_id TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_rac_events_res  ON oe_reserve_account_chain_events(reserve_account_id);
CREATE INDEX IF NOT EXISTS idx_oe_rac_events_type ON oe_reserve_account_chain_events(event_type);
