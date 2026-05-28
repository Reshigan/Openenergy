-- Wave 44 — Trader OTC Transaction / Trade-Repository Reporting & Reconciliation chain.
-- Financial Markets Act 19 of 2012 (FMA) + the FSCA OTC Derivatives Reporting
-- regulations — South Africa's analogue of EMIR (EU) / Dodd-Frank (US) trade
-- reporting. Every reportable transaction the desk executes must be reported to a
-- licensed Trade Repository (TR) by a hard regulatory deadline (T+1), acknowledged
-- by the TR, then RECONCILED against the counterparty's dual-sided submission.
--
-- Where W29 position-limits cap WHAT the desk may hold and W36 best-execution
-- governs HOW it fills, THIS chain governs whether the trade is correctly REPORTED
-- to the supervisor afterward — the desk's most L5 surface (reconciliation against
-- an external system).
--
-- 12-state P6 lifecycle:
--   report_due → report_generated → submitted_to_tr → tr_acknowledged →
--     reconciled → confirmed_complete
--   rejection branch:  submitted_to_tr → tr_rejected → corrected → submitted_to_tr
--   recon-break branch: tr_acknowledged|reconciled → break_identified →
--                       break_resolved → reconciled  (or break_identified → corrected)
--   exemption:         report_due|report_generated → exempted
--   error cancel:      any active → cancelled
--
-- Classes (reportable product — drive recon SLA windows + reportability):
--   otc_derivative   — OTC forward/swap/option; fully reportable, tightest recon
--   physical_forward — physical-delivery forward; reportable, mid
--   spot_physical    — spot / block physical; lightest, often de-minimis
--
-- MIXED SLA: regulatory submission windows are UNIFORM (EMIR-style T+1 hard line
-- for every product); reconciliation + break windows are graded (otc tightest).
--
-- Reportability (crosses to the FSCA reporting supervisor): sla_breach crosses for
-- EVERY class (a missed/late report IS the FMA violation — universal hard line);
-- reject crosses for material classes (otc_derivative + physical_forward); flag_break
-- crosses for otc_derivative only (systemic-risk product).
--
-- Single-party write {admin, support, trader} — the reporting obligation is the
-- firm's own (no counterparty login). actor_party (desk/reporting_ops/trade_repository)
-- records the post-trade function per step for audit attribution only.

CREATE TABLE IF NOT EXISTS oe_trade_reports (
  id                       TEXT PRIMARY KEY,
  report_number            TEXT UNIQUE NOT NULL,

  -- Provenance (the executed trade/match this report covers)
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,

  -- Firm / reporting identity
  desk_party_id            TEXT NOT NULL,
  desk_party_name          TEXT NOT NULL,
  trade_repository         TEXT,                 -- e.g. JSE Trade Repository

  -- Trade identity
  uti                      TEXT,                 -- Unique Transaction Identifier
  trade_ref                TEXT,                 -- internal trade/match ref
  counterparty_name        TEXT,
  counterparty_lei         TEXT,                 -- Legal Entity Identifier
  energy_type              TEXT,                 -- power / carbon / rec / gas
  product                  TEXT,                 -- forward / swap / option / spot / block
  report_class             TEXT NOT NULL CHECK (report_class IN (
    'otc_derivative', 'physical_forward', 'spot_physical'
  )),
  side                     TEXT,                 -- buy / sell
  trade_date               TEXT,
  value_date               TEXT,
  reporting_deadline       TEXT,                 -- the T+1 regulatory deadline

  -- Economics
  notional_zar_m           REAL,                 -- notional value (R millions)
  volume_mwh               REAL,
  price_zar_mwh            REAL,
  collateral_zar_m         REAL,

  -- Refs
  generation_ref           TEXT,
  submission_ref           TEXT,                 -- TR submission id
  acknowledgement_ref      TEXT,                 -- TR ack id
  reconciliation_ref       TEXT,
  break_ref                TEXT,
  rejection_ref            TEXT,                 -- TR NACK code/ref
  correction_ref           TEXT,
  exemption_ref            TEXT,                 -- intragroup/de-minimis exemption ref
  regulator_ref            TEXT,                 -- FSCA supervisory queue ref

  -- Narrative
  generation_basis         TEXT,
  submission_basis         TEXT,
  reconciliation_basis     TEXT,
  break_basis              TEXT,
  rejection_basis          TEXT,
  correction_basis         TEXT,
  exemption_basis          TEXT,
  reason_code              TEXT,
  resolution_notes         TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'report_due','report_generated','submitted_to_tr','tr_acknowledged',
    'reconciled','break_identified','break_resolved','confirmed_complete',
    'tr_rejected','corrected','exempted','cancelled'
  )),
  report_due_at            TEXT NOT NULL,
  report_generated_at      TEXT,
  submitted_to_tr_at       TEXT,
  tr_acknowledged_at       TEXT,
  reconciled_at            TEXT,
  break_identified_at      TEXT,
  break_resolved_at        TEXT,
  confirmed_complete_at    TEXT,
  tr_rejected_at           TEXT,
  corrected_at             TEXT,
  exempted_at              TEXT,
  cancelled_at             TEXT,

  is_reportable            INTEGER NOT NULL DEFAULT 0,
  resubmission_count       INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_trpt_status   ON oe_trade_reports(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_trpt_class    ON oe_trade_reports(report_class);
CREATE INDEX IF NOT EXISTS idx_oe_trpt_desk     ON oe_trade_reports(desk_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_trpt_product  ON oe_trade_reports(product);
CREATE INDEX IF NOT EXISTS idx_oe_trpt_uti      ON oe_trade_reports(uti);
CREATE INDEX IF NOT EXISTS idx_oe_trpt_due      ON oe_trade_reports(report_due_at);
CREATE INDEX IF NOT EXISTS idx_oe_trpt_sla      ON oe_trade_reports(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_trade_reports_events (
  id            TEXT PRIMARY KEY,
  report_id     TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  actor_id      TEXT,
  actor_party   TEXT,
  notes         TEXT,
  payload       TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_trpt_events_rep  ON oe_trade_reports_events(report_id);
CREATE INDEX IF NOT EXISTS idx_oe_trpt_events_type ON oe_trade_reports_events(event_type);
