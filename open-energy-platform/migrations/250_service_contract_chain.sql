-- Wave 80 — OEM-Support Service-Contract / AMC Renewal, Entitlement & Coverage (P6).
-- The COMMERCIAL GATE of the OEM-Support profile: the contract that decides whether a
-- deployed asset can get manufacturer support at all, at what response-time service level,
-- and within what entitlement limits. Every other OEM-Support chain runs UNDER a service
-- contract — a ticket (W14) is answered to the contract's response-time SLA, an RMA (W15)
-- draws on its parts allowance, a spare (W72) is provisioned against its coverage — but none
-- manage the contract itself: its quote, activation, the annual renewal loop, suspension for
-- non-payment, the grace buffer, and the coverage gap that opens when it lapses.
--
-- Best-in-class entitlement systems (ServiceMax, SAP Service Cloud, Salesforce Field Service
-- entitlements, IFS) manage entitlements in a silo. W80 beats them by live-wiring the
-- entitlement into the platform as a real coverage gate, making the renewal urgency COVERAGE-
-- GAP-aware, and crossing a lapse on important coverage to the regulator as a security-of-
-- supply concern.
--
-- 12-state P6 lifecycle (9 operative + 3 terminal):
--   draft -> quoted -> pending_activation -> active -> renewal_due
--     -> renewal_quoted -> negotiating -> renewed                         (renewal path)
--   confirm_renewal closes from renewal_due / renewal_quoted / negotiating / in_grace
--   grace:   {renewal_due, renewal_quoted, negotiating} -> in_grace -> expired   (grace blown)
--   suspend: active -> suspended -> active (reinstate) | expired | cancelled
--   cancel:  {draft, quoted, pending_activation, active, renewal_due, renewal_quoted,
--             negotiating, suspended} -> cancelled
--
-- Tiers (4) — COVERAGE TIER (explicit attribute): basic / standard / premium /
-- mission_critical. HIGH = {premium, mission_critical}. The coverage tier drives the
-- response-time SLA entitlement owed to the customer, the renewal-window urgency, and
-- the reportability hard line.
--
-- SLA matrix is URGENT — a higher coverage tier is chased HARDER: renewal windows strictly
-- DECREASE basic->mission_critical for every graded state. Terminals 0.
--
-- Reportability — the W80 SIGNATURE is COVERAGE-GAP-driven: expire_coverage crosses for
-- HIGH tiers; suspend_coverage / cancel_contract cross for mission_critical only;
-- sla_breached crosses for HIGH tiers.
--
-- Single write {admin, support}: the OEM-Support desk operates the chain. actor_party tags
-- whether a step represents the account_manager, the service_desk or finance.

CREATE TABLE IF NOT EXISTS oe_service_contracts (
  id                       TEXT PRIMARY KEY,
  contract_number          TEXT UNIQUE NOT NULL,

  -- Provenance / scope
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,
  customer_party_id        TEXT,
  customer_name            TEXT NOT NULL,        -- IPP / SPV / site owner under coverage
  oem_name                 TEXT,                 -- manufacturer / support provider
  site_id                  TEXT,
  site_name                TEXT,
  product_line             TEXT,                 -- inverters / turbines / BESS / tracker

  -- Coverage definition
  contract_type            TEXT,                 -- amc / extended_warranty / full_service / spares_only
  coverage_tier            TEXT NOT NULL CHECK (coverage_tier IN (
    'basic','standard','premium','mission_critical'
  )),
  covered_fault_classes    TEXT,                 -- JSON array; ["all"] wildcard
  covered_assets           TEXT,                 -- JSON array; [] / ["all"] wildcard
  response_sla_minutes     INTEGER,              -- entitlement response time owed to the customer
  preventive_visits_included  INTEGER,
  preventive_visits_consumed  INTEGER NOT NULL DEFAULT 0,
  parts_allowance_zar      REAL,
  parts_consumed_zar       REAL NOT NULL DEFAULT 0,

  -- Term + economics
  currency                 TEXT,                 -- ZAR
  annual_value_zar         REAL NOT NULL,
  term_days                INTEGER,
  term_start               TEXT,
  term_end                 TEXT,
  renewal_window_days      INTEGER NOT NULL DEFAULT 90,
  renewal_uplift_pct       REAL,
  renewal_value_zar        REAL,
  refund_zar               REAL,

  -- Parties
  account_manager_name     TEXT,
  service_desk_name        TEXT,
  finance_contact_name     TEXT,

  reason_code              TEXT,
  suspend_reason           TEXT,

  -- Refs
  quote_ref                TEXT,
  acceptance_ref           TEXT,
  activation_ref           TEXT,
  renewal_ref              TEXT,
  renewal_quote_ref        TEXT,
  negotiation_ref          TEXT,
  grace_ref                TEXT,
  suspension_ref           TEXT,
  reinstatement_ref        TEXT,
  expiry_ref               TEXT,
  cancellation_ref         TEXT,
  regulator_ref            TEXT,

  -- Narrative
  quote_basis              TEXT,
  acceptance_basis         TEXT,
  activation_basis         TEXT,
  renewal_basis            TEXT,
  renewal_quote_basis      TEXT,
  negotiation_basis        TEXT,
  grace_basis              TEXT,
  suspension_basis         TEXT,
  reinstatement_basis      TEXT,
  expiry_basis             TEXT,
  cancellation_basis       TEXT,
  notes                    TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'draft','quoted','pending_activation','active','renewal_due','renewal_quoted',
    'negotiating','in_grace','suspended','renewed','expired','cancelled'
  )),
  draft_at                   TEXT NOT NULL,
  quoted_at                  TEXT,
  pending_activation_at      TEXT,
  active_at                  TEXT,
  renewal_due_at             TEXT,
  renewal_quoted_at          TEXT,
  negotiating_at             TEXT,
  in_grace_at                TEXT,
  suspended_at               TEXT,
  renewed_at                 TEXT,
  expired_at                 TEXT,
  cancelled_at               TEXT,

  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  is_reportable            INTEGER NOT NULL DEFAULT 0,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_svc_status   ON oe_service_contracts(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_svc_tier     ON oe_service_contracts(coverage_tier);
CREATE INDEX IF NOT EXISTS idx_oe_svc_customer ON oe_service_contracts(customer_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_svc_site     ON oe_service_contracts(site_id);
CREATE INDEX IF NOT EXISTS idx_oe_svc_type     ON oe_service_contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_oe_svc_sla      ON oe_service_contracts(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_service_contract_events (
  id                  TEXT PRIMARY KEY,
  contract_id         TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_svc_events_contract ON oe_service_contract_events(contract_id);
CREATE INDEX IF NOT EXISTS idx_oe_svc_events_type     ON oe_service_contract_events(event_type);
