-- Wave 74 — Regulator NERSA Levy Assessment & Collection chain (P6).
-- The Energy Regulator recovering its running costs from the industries it
-- regulates. NERSA imposes an annual levy on licensees under section 5B of the
-- National Energy Regulator Act 40 of 2004 (and fees under the Electricity
-- Regulation Act 4 of 2006 section 10), assessed on a declared base (turnover,
-- throughput volume, or a fixed schedule) across NERSAs three regulated
-- industries (electricity, piped-gas, petroleum-pipelines). NERSA computes the
-- assessment, QA-reviews it, issues a levy notice (invoice), entertains an
-- objection, confirms the amount payable, receives payment, ages the debt past
-- due, issues a final demand, escalates an uncollected debt into enforcement
-- (where non-payment becomes a licence good-standing matter), and either settles
-- it on payment or writes it off with Council approval. An assessment raised in
-- error may be withdrawn before payment.
--
-- DISTINCT from every other regulator chain by SUBJECT: W43 tariff-determination
-- sets what a licensee CHARGES ITS CUSTOMERS; W74 sets what the licensee OWES THE
-- REGULATOR. It is the financial counterpart to the licensing chains (W33/W49/W57)
-- — a licence grants the right to operate; the levy funds the regulator that
-- grants it, so non-payment is a licence good-standing matter.
--
-- 12-state P6 lifecycle:
--   levy_assessed -> assessment_review -> invoiced -> payment_pending
--     -> (partially_paid ...) -> settled                      (happy path)
--   objection: invoiced -> objection_review -> payment_pending (resolve_objection)
--   arrears:   payment_pending | partially_paid -> in_arrears -> final_demand
--                -> enforcement -> settled | written_off
--   withdraw:  levy_assessed | assessment_review | invoiced | objection_review -> withdrawn
--
-- Tiers (by assessed levy amount ZAR): micro <100k / small <1m / medium <10m /
-- large <50m / major >=50m.
--
-- URGENT SLA — the LARGER the assessed levy, the TIGHTER every window (same
-- flavour as W66 complaints / W40 inspection; OPPOSITE of the INVERTED
-- licensing / renewal / tariff-determination / SSEG SLAs).
--
-- Single-party regulator-owned write {admin, regulator}; actor_party records the
-- functional party (regulator / licensee) for audit only.
--
-- Reportability (NERSA Council oversight queue):
--   escalate_enforcement crosses for EVERY tier (licence good-standing at risk —
--     the W74 signature). write_off crosses for EVERY tier (fiscal write-off of
--     public revenue). issue_final_demand crosses for large + major. SLA breaches
--     cross for large + major.

CREATE TABLE IF NOT EXISTS oe_regulator_levies (
  id                       TEXT PRIMARY KEY,
  levy_number              TEXT UNIQUE NOT NULL,

  -- Provenance (a levy is regulator-originated; kept for cascade symmetry)
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,

  -- Licensee being levied
  licensee_id              TEXT NOT NULL,
  licensee_name            TEXT NOT NULL,
  licensee_licence_no      TEXT,

  -- Classification
  sector                   TEXT NOT NULL CHECK (sector IN (
    'electricity','piped_gas','petroleum_pipeline'
  )),
  levy_basis               TEXT NOT NULL CHECK (levy_basis IN (
    'turnover_based','volume_based','fixed'
  )),
  levy_tier                TEXT NOT NULL CHECK (levy_tier IN (
    'micro','small','medium','large','major'
  )),
  financial_year           TEXT NOT NULL,

  -- Financials
  declared_base            REAL,              -- declared turnover (ZAR) or throughput volume
  base_unit                TEXT,              -- ZAR / MWh / GJ / m3
  levy_rate                REAL,              -- fraction of turnover, ZAR per unit, or flat amount
  assessed_amount          REAL NOT NULL,     -- ZAR — drives the tier
  paid_to_date             REAL NOT NULL DEFAULT 0,
  outstanding_amount       REAL NOT NULL DEFAULT 0,
  due_date                 TEXT,

  -- Refs
  assessment_ref           TEXT,
  invoice_ref              TEXT,
  objection_ref            TEXT,
  final_demand_ref         TEXT,
  enforcement_ref          TEXT,
  settlement_ref           TEXT,
  writeoff_ref             TEXT,

  -- Narrative
  assessment_basis         TEXT,
  review_basis             TEXT,
  invoice_basis            TEXT,
  objection_basis          TEXT,
  payable_basis            TEXT,
  payment_basis            TEXT,
  arrears_basis            TEXT,
  final_demand_basis       TEXT,
  enforcement_basis        TEXT,
  settlement_basis         TEXT,
  writeoff_basis           TEXT,
  withdrawal_basis         TEXT,
  reason_code              TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'levy_assessed','assessment_review','invoiced','objection_review',
    'payment_pending','partially_paid','in_arrears','final_demand','enforcement',
    'settled','written_off','withdrawn'
  )),
  assessed_at              TEXT NOT NULL,
  assessment_review_at     TEXT,
  invoiced_at              TEXT,
  objection_review_at      TEXT,
  payment_pending_at       TEXT,
  partially_paid_at        TEXT,
  in_arrears_at            TEXT,
  final_demand_at          TEXT,
  enforcement_at           TEXT,
  settled_at               TEXT,
  written_off_at           TEXT,
  withdrawn_at             TEXT,

  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  is_reportable            INTEGER NOT NULL DEFAULT 0,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_levy_status   ON oe_regulator_levies(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_levy_tier      ON oe_regulator_levies(levy_tier);
CREATE INDEX IF NOT EXISTS idx_oe_levy_licensee  ON oe_regulator_levies(licensee_id);
CREATE INDEX IF NOT EXISTS idx_oe_levy_sector    ON oe_regulator_levies(sector);
CREATE INDEX IF NOT EXISTS idx_oe_levy_sla       ON oe_regulator_levies(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_regulator_levies_events (
  id              TEXT PRIMARY KEY,
  levy_id         TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_levy_events_levy ON oe_regulator_levies_events(levy_id);
CREATE INDEX IF NOT EXISTS idx_oe_levy_events_type ON oe_regulator_levies_events(event_type);
