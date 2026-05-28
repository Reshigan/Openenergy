-- Wave 60 — Trader Algorithmic / DEA Trading-System Certification & Kill-Switch
-- Governance chain. Financial Markets Act 19 of 2012 + FSCA Conduct Standards
-- for automated trading + JSE algorithmic-trading / Direct Electronic Access
-- (DEA/DMA) rules + the MiFID II RTS 6 analogue (pre-deployment conformance
-- testing, pre-trade risk controls, a mandatory kill-switch, periodic
-- recertification). 12-state P6 lifecycle for every automated / DEA trading
-- SYSTEM the desk wants to run.
--
-- The PRE-DEPLOYMENT GOVERNANCE GATE upstream of every other Trader chain: an
-- algo cannot quote (W9), build positions (W29), execute (W36) or be reported
-- (W44) until it is certified here, and once live it is watched by W52
-- surveillance. W60 is what lets an automated system go live and KEEPS it
-- within its authorised envelope.
--
-- 12-state P6 lifecycle:
--   registration_submitted → documentation_review → conformance_testing
--     → risk_controls_validation → certification_review → certified
--     → deployed                                                  (go-live path)
--   recert:   deployed → recertification_review → deployed
--   kill:     deployed → suspended → deployed (reinstate)
--   remediation: documentation_review|conformance_testing|
--               risk_controls_validation|certification_review|
--               recertification_review → remediation_required
--               → documentation_review (resubmit)
--   reject:   documentation_review|certification_review|
--               recertification_review → rejected
--   decommission: certified|deployed|suspended|remediation_required
--               → decommissioned
--
-- Authorised-footprint tiers (max order/daily notional ZAR millions; drive the
-- INVERTED SLA + reportability):
--   limited      — < 10      sandbox / very small authorised notional
--   standard     — < 50      routine desk algo
--   significant  — < 250     material authorised footprint
--   high_impact  — < 1000    large authorised footprint
--   systemic     — >= 1000   systemically significant automated/DEA system
--
-- INVERTED SLA: the LARGER the authorised footprint, the LONGER every
-- certification/review window (deeper conformance + risk-control testing for
-- bigger systems). EXCEPT `suspended` is FLAT and tight across tiers — a
-- suspended live system is an incident that must be reinstated or
-- decommissioned fast regardless of size.
--
-- Reportability: invoke_kill_switch (→ suspended) crosses for EVERY tier (the
-- W60 signature — emergency halt of a live automated system is a notifiable
-- market event); reject_certification (→ rejected) + sla_breached cross for
-- HIGH tiers {high_impact, systemic} only.
--
-- Two-party split write: the trading FIRM owns the system-lifecycle endpoints
-- (submit_certification, deploy, resubmit, decommission) and may always hit the
-- emergency kill-switch; the exchange/certification AUTHORITY owns the gating
-- machinery (review, conformance, controls validation, certify, recertify,
-- reinstate, remediation, reject). actor_party (trading_firm /
-- exchange_authority) records the post-event function per step.

CREATE TABLE IF NOT EXISTS oe_algo_certifications (
  id                            TEXT PRIMARY KEY,
  case_number                   TEXT UNIQUE NOT NULL,

  -- Provenance (a desk onboarding request / material-change trigger)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (two-party split write)
  firm_party_id                 TEXT NOT NULL,
  firm_party_name               TEXT NOT NULL,
  authority_party_id            TEXT NOT NULL,
  authority_party_name          TEXT NOT NULL,

  -- The automated / DEA trading system being certified
  system_code                   TEXT,              -- internal algo/system code
  system_name                   TEXT NOT NULL,     -- human name of the system
  system_type                   TEXT NOT NULL,     -- algo / dea / dma / smart_order_router / market_maker
  strategy_class                TEXT,              -- mm / arbitrage / execution / directional / hedging
  asset_classes                 TEXT,              -- comma list: power / carbon / gas / fx
  venue                         TEXT,              -- exchange / venue the system trades
  dea_provider                  TEXT,              -- sponsoring member firm for DEA
  software_version              TEXT,

  -- Authorised footprint
  authorised_notional_zar_m     REAL NOT NULL,     -- max order/daily notional (ZAR millions)
  max_order_value_zar           REAL,
  max_message_rate_per_sec      REAL,
  algo_tier                     TEXT NOT NULL CHECK (algo_tier IN (
    'limited','standard','significant','high_impact','systemic'
  )),

  -- Pre-trade risk controls (RTS-6 article 15 controls)
  kill_switch_present           INTEGER NOT NULL DEFAULT 0,
  price_collars_present         INTEGER NOT NULL DEFAULT 0,
  throttles_present             INTEGER NOT NULL DEFAULT 0,
  max_order_size_present        INTEGER NOT NULL DEFAULT 0,
  conformance_test_passed       INTEGER NOT NULL DEFAULT 0,
  controls_validated            INTEGER NOT NULL DEFAULT 0,

  -- Refs
  registration_ref              TEXT,
  documentation_ref             TEXT,
  conformance_ref               TEXT,
  controls_ref                  TEXT,
  certification_ref             TEXT,
  deployment_ref                TEXT,
  recertification_ref           TEXT,
  kill_switch_ref               TEXT,
  remediation_ref               TEXT,
  rejection_ref                 TEXT,
  decommission_ref              TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  documentation_basis           TEXT,
  conformance_basis             TEXT,
  controls_basis                TEXT,
  certification_basis           TEXT,
  recertification_basis         TEXT,
  kill_switch_basis             TEXT,
  remediation_basis             TEXT,
  rejection_basis               TEXT,
  reason_code                   TEXT,
  notes                         TEXT,

  recertification_round         INTEGER NOT NULL DEFAULT 0,
  remediation_round             INTEGER NOT NULL DEFAULT 0,
  suspension_round              INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'registration_submitted','documentation_review','conformance_testing',
    'risk_controls_validation','certification_review','certified','deployed',
    'recertification_review','suspended','remediation_required',
    'rejected','decommissioned'
  )),
  registration_submitted_at     TEXT NOT NULL,
  documentation_review_at       TEXT,
  conformance_testing_at        TEXT,
  risk_controls_validation_at   TEXT,
  certification_review_at        TEXT,
  certified_at                  TEXT,
  deployed_at                   TEXT,
  recertification_review_at     TEXT,
  suspended_at                  TEXT,
  remediation_required_at       TEXT,
  rejected_at                   TEXT,
  decommissioned_at             TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_aco_status    ON oe_algo_certifications(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_aco_tier      ON oe_algo_certifications(algo_tier);
CREATE INDEX IF NOT EXISTS idx_oe_aco_firm      ON oe_algo_certifications(firm_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_aco_system    ON oe_algo_certifications(system_code);
CREATE INDEX IF NOT EXISTS idx_oe_aco_submitted ON oe_algo_certifications(registration_submitted_at);
CREATE INDEX IF NOT EXISTS idx_oe_aco_sla       ON oe_algo_certifications(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_algo_certifications_events (
  id                 TEXT PRIMARY KEY,
  cert_id            TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_aco_events_c    ON oe_algo_certifications_events(cert_id);
CREATE INDEX IF NOT EXISTS idx_oe_aco_events_type ON oe_algo_certifications_events(event_type);
