-- Wave 52 — Trader Market Abuse Surveillance & STOR (Suspicious Transaction /
-- Order Reporting) chain.
-- Financial Markets Act 19 of 2012 Chapter X (ss.78-82 prohibited trading
-- practices: insider trading, price manipulation, false/misleading reporting)
-- + the FSCA market-abuse / market-conduct regime + STOR obligations.
--
-- 12-state P6 lifecycle for every surveillance ALERT the exchange's
-- market-surveillance function raises against the order/trade flow. The
-- surveillance complement to the desk's own obligation chains (W2 VaR,
-- W9 MM compliance, W29 position limits, W36 best-execution, W44
-- trade-reporting): W52 governs whether the conduct ITSELF was abusive.
--
-- 12-state P6 lifecycle:
--   alert_raised → triaged → under_investigation → evidence_review
--     → analysis_complete → cleared                         (clean path)
--   analysis_complete → stor_filed → regulator_referred
--     → enforcement_action → sanctioned                     (abuse-found path)
--   early exit:  alert_raised|triaged → cleared             (dismiss false-positive)
--   dispute:     analysis_complete|stor_filed|regulator_referred|enforcement_action
--                  → disputed → dispute_resolved
--
-- Abuse typology severity tiers (drive the URGENT SLA + reportability):
--   info_alert / low_risk / medium_risk / high_risk / critical_abuse
--
-- URGENT SLA: the more severe the typology, the TIGHTER the window.
--
-- Reportability: file_stor crosses for EVERY tier (a STOR IS a filing to the
-- FSCA — the W52 signature); sanction + sla_breached cross for critical tiers
-- (high_risk / critical_abuse).
--
-- Single-party write: the trader is the SUBJECT of the case and cannot action
-- their own file. WRITE = {admin (surveillance fn), regulator}; the desk reads.
-- actor_party (surveillance / regulator / subject) records the function per step.

CREATE TABLE IF NOT EXISTS oe_market_abuse_cases (
  id                            TEXT PRIMARY KEY,
  case_number                   TEXT UNIQUE NOT NULL,

  -- Provenance (the surveillance signal / source that raised the alert)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (single-party write; the subject is read-only)
  subject_party_id              TEXT NOT NULL,     -- the trader / member under surveillance
  subject_party_name            TEXT NOT NULL,
  surveillance_party_id         TEXT NOT NULL,     -- the exchange market-surveillance function
  surveillance_party_name       TEXT NOT NULL,

  -- Case identity
  abuse_tier                    TEXT NOT NULL CHECK (abuse_tier IN (
    'info_alert','low_risk','medium_risk','high_risk','critical_abuse'
  )),
  typology                      TEXT NOT NULL,     -- insider_trading / price_manipulation / spoofing / wash_trade / front_running / layering / false_reporting / quote_stuffing
  alert_source                  TEXT,              -- automated_surveillance / mm_report / whistleblower / regulator_referral / news_screening
  instrument                    TEXT,
  energy_type                   TEXT,
  product                       TEXT,
  venue                         TEXT,              -- order_book / otc / auction
  risk_score                    REAL,              -- 0-100 surveillance risk score (drives the tier)
  suspect_volume_mwh            REAL,
  suspect_value_zar_m           REAL,
  estimated_benefit_zar         REAL,              -- estimated illicit gain (R)
  penalty_zar                   REAL,              -- administrative penalty / sanction (R)

  -- Refs
  triage_ref                    TEXT,
  investigation_ref             TEXT,
  evidence_ref                  TEXT,
  analysis_ref                  TEXT,
  stor_ref                      TEXT,
  referral_ref                  TEXT,
  enforcement_ref               TEXT,
  sanction_ref                  TEXT,
  dispute_ref                   TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  triage_basis                  TEXT,
  investigation_basis           TEXT,
  evidence_basis                TEXT,
  analysis_basis                TEXT,
  stor_basis                    TEXT,
  sanction_basis                TEXT,
  dispute_basis                 TEXT,
  reason_code                   TEXT,
  resolution_notes              TEXT,
  notes                         TEXT,

  dispute_round                 INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'alert_raised','triaged','under_investigation','evidence_review',
    'analysis_complete','cleared','stor_filed','regulator_referred',
    'enforcement_action','sanctioned','disputed','dispute_resolved'
  )),
  alert_raised_at               TEXT NOT NULL,
  triaged_at                    TEXT,
  under_investigation_at        TEXT,
  evidence_review_at            TEXT,
  analysis_complete_at          TEXT,
  cleared_at                    TEXT,
  stor_filed_at                 TEXT,
  regulator_referred_at         TEXT,
  enforcement_action_at         TEXT,
  sanctioned_at                 TEXT,
  disputed_at                   TEXT,
  dispute_resolved_at           TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_mac_status   ON oe_market_abuse_cases(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_mac_tier     ON oe_market_abuse_cases(abuse_tier);
CREATE INDEX IF NOT EXISTS idx_oe_mac_subject  ON oe_market_abuse_cases(subject_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_mac_raised   ON oe_market_abuse_cases(alert_raised_at);
CREATE INDEX IF NOT EXISTS idx_oe_mac_sla      ON oe_market_abuse_cases(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_market_abuse_cases_events (
  id                 TEXT PRIMARY KEY,
  case_id            TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_mac_events_case ON oe_market_abuse_cases_events(case_id);
CREATE INDEX IF NOT EXISTS idx_oe_mac_events_type ON oe_market_abuse_cases_events(event_type);
