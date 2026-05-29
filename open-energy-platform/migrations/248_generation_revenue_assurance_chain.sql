-- Wave 79 — Esums Generation Revenue Assurance & Meter Reconciliation (P6).
-- Every MWh a plant generates should turn into cash. Between the inverter and the
-- bank account sit four numbers that should agree but rarely do: EXPECTED generation
-- (the W71 prognostics / W24 PR model), the REVENUE METER reading, the SETTLEMENT
-- statement (what the DSO / market operator settled) and the PPA INVOICE (what the
-- offtaker was billed). Where they diverge, money leaks — a drifting meter, a comms
-- gap back-filled with an under-estimate, a settlement error, un-credited curtailment
-- compensation, mis-accounted inverter clipping, or outright meter tampering.
--
-- Best-in-class O&M suites (Power Factors, AlsoEnergy, utility revenue-assurance tools)
-- reconcile meter-vs-settlement REACTIVELY and stop at a flagged variance. W79 beats
-- them by (1) using the EXPECTED-generation model as the recon baseline — catching
-- leakage even when the meter agrees with itself — (2) auto-classifying the leakage
-- signature, and (3) closing the loop to an SLA-driven recovery with a NERSA-visible
-- settlement-dispute branch and a quantified recovered-ZAR ledger.
--
-- 12-state P6 lifecycle (8 operative + 4 terminal):
--   period_open -> data_ingested -> reconciled -> variance_flagged
--     -> investigating -> classified -> recovery_pending -> recovered    (recovery path)
--   clean:      reconciled -> closed_clean                               (within tolerance)
--   dispute:    recovery_pending -> in_dispute
--                 -> recovered (resolve_dispute_recovered) | written_off (resolve_dispute_writeoff)
--   write-off:  {classified, recovery_pending} -> written_off            (unrecoverable)
--   cancel:     {period_open .. classified} -> cancelled                 (opened in error / superseded)
--
-- Tiers (5) by absolute revenue variance in ZAR: minor <50k / moderate <250k /
-- material <1m / major <5m / critical >=5m. LARGE_TIERS = {major, critical}.
--
-- SLA matrix is URGENT — a larger revenue variance is chased HARDER: windows strictly
-- DECREASE minor->critical for every graded state. Terminals 0.
--
-- Reportability — the W79 SIGNATURE: raise_dispute crosses for EVERY tier (a settlement /
-- metering dispute is a NERSA metering-code matter, always reportable); classify_leakage
-- crosses for EVERY tier when the category is meter_tampering; write-offs cross for the
-- material+ tiers; SLA breaches cross for major + critical only.
--
-- Single write {admin, support}: the Esums revenue-assurance desk operates the chain.
-- actor_party tags whether a step represents the analyst, the counterparty (DSO / market
-- operator / offtaker) or a reviewer, for the audit trail.

CREATE TABLE IF NOT EXISTS oe_generation_revenue_assurance (
  id                       TEXT PRIMARY KEY,
  gra_number               TEXT UNIQUE NOT NULL,

  -- Provenance (a recon period is opened against a live site / meter)
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,
  site_id                  TEXT,              -- generating site / SPV
  project_id               TEXT,
  meter_id                 TEXT,              -- revenue-grade meter
  ppa_ref                  TEXT,

  -- Reconciliation period
  reconciliation_period    TEXT NOT NULL,     -- e.g. 2026-04 (the settlement month)
  period_start             TEXT,
  period_end               TEXT,
  data_cutoff_date         TEXT,

  -- Parties
  site_name                TEXT NOT NULL,
  operator_name            TEXT NOT NULL,     -- Esums O&M operator
  counterparty_name        TEXT,              -- DSO / market operator / offtaker (recovery target)
  reviewer_name            TEXT,

  -- The four numbers (generation in MWh)
  expected_generation_mwh  REAL,              -- W71 model baseline
  metered_generation_mwh   REAL,              -- revenue meter
  settled_generation_mwh   REAL,              -- settlement statement
  invoiced_generation_mwh  REAL,              -- PPA invoice

  -- The four numbers (revenue in ZAR) + variance
  currency                 TEXT,              -- ZAR
  tariff_ref               TEXT,
  expected_revenue_zar     REAL,
  settled_revenue_zar      REAL,
  variance_zar             REAL NOT NULL,     -- absolute value drives the tier; sign = over/under-recovery
  variance_mwh             REAL,
  recovered_zar            REAL,
  written_off_zar          REAL,

  -- Classification
  leakage_category         TEXT,              -- meter_drift / comms_gap / settlement_error / curtailment_shortfall / clipping_loss / meter_tampering
  recovery_method          TEXT,              -- meter_recalibration / settlement_resubmission / dso_credit_note / ppa_true_up / none
  revenue_assurance_tier   TEXT NOT NULL CHECK (revenue_assurance_tier IN (
    'minor','moderate','material','major','critical'
  )),
  reason_code              TEXT,
  recovery_deadline        TEXT,
  dispute_deadline         TEXT,

  -- Refs
  ingest_ref               TEXT,
  reconciliation_ref       TEXT,
  investigation_ref        TEXT,
  classification_ref       TEXT,
  recovery_ref             TEXT,
  dispute_ref              TEXT,
  resolution_ref           TEXT,
  writeoff_ref             TEXT,
  cancellation_ref         TEXT,

  -- Narrative
  period_basis             TEXT,
  ingest_basis             TEXT,
  reconciliation_basis     TEXT,
  investigation_basis      TEXT,
  classification_basis     TEXT,
  recovery_basis           TEXT,
  dispute_basis            TEXT,
  resolution_basis         TEXT,
  writeoff_basis           TEXT,
  cancellation_basis       TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'period_open','data_ingested','reconciled','variance_flagged','investigating',
    'classified','recovery_pending','in_dispute','recovered','closed_clean',
    'written_off','cancelled'
  )),
  period_open_at             TEXT NOT NULL,
  data_ingested_at           TEXT,
  reconciled_at              TEXT,
  variance_flagged_at        TEXT,
  investigating_at           TEXT,
  classified_at              TEXT,
  recovery_pending_at        TEXT,
  in_dispute_at              TEXT,
  recovered_at               TEXT,
  closed_clean_at            TEXT,
  written_off_at             TEXT,
  cancelled_at               TEXT,

  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  is_reportable            INTEGER NOT NULL DEFAULT 0,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_gra_status   ON oe_generation_revenue_assurance(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_gra_tier     ON oe_generation_revenue_assurance(revenue_assurance_tier);
CREATE INDEX IF NOT EXISTS idx_oe_gra_site     ON oe_generation_revenue_assurance(site_id);
CREATE INDEX IF NOT EXISTS idx_oe_gra_category ON oe_generation_revenue_assurance(leakage_category);
CREATE INDEX IF NOT EXISTS idx_oe_gra_period   ON oe_generation_revenue_assurance(reconciliation_period);
CREATE INDEX IF NOT EXISTS idx_oe_gra_sla      ON oe_generation_revenue_assurance(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_generation_revenue_assurance_events (
  id                  TEXT PRIMARY KEY,
  assurance_id        TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_gra_events_gra  ON oe_generation_revenue_assurance_events(assurance_id);
CREATE INDEX IF NOT EXISTS idx_oe_gra_events_type ON oe_generation_revenue_assurance_events(event_type);
