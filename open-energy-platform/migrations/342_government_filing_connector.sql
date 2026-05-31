-- Wave 126 - CIPC / SARS / NERSA Government Filing APIs Connector.
--
-- PHASE C WAVE 5 OF 5 - FINAL Phase-C connector wave. The EXTERNAL
-- GOVERNMENT FILING spine. Where W122 = SCADA, W123 = IIoT broker,
-- W124 = interbank rails, W125 = ERP integration, W126 = EXTERNAL
-- GOVERNMENT FILING (CIPC + SARS + NERSA + DMRE + DFFE + SARB + FIC +
-- FSCA + Treasury + Municipal). Real bidirectional integration to
-- CIPC Annual Return XML, SARS e-Filing (IT14 / VAT201 / EMP201 /
-- IRP5 / PAYE Reconciliation), NERSA quarterly returns (electricity +
-- gas + petroleum), DMRE REIPPPP quarterly + mining royalties, and
-- DFFE GHG emissions reporting.
--
-- Goal: beat Sage Pastel Tax Tools + Greatsoft Tax + CaseWare Africa +
-- ProBeta + Tax Tim + LexisNexis CompanySecretarial + iCount + Adapt IT
-- Smart + Mango Practice + Stripe Tax SA filing stack.
--
-- Standards covered: CIPC Annual Return XML (Companies Act 71 of 2008
-- s.33) + SARS e-Filing (Income Tax Act 58/1962 + VAT Act 89/1991) +
-- NERSA quarterly returns (ERA 4/2006 + Gas Act 48/2001 + Petroleum
-- Pipelines Act 60/2003 + NERSA Levies Act 21/2002) + DMRE compliance
-- reporting (REIPPPP + mining royalties) + DFFE GHG emissions (Carbon
-- Tax Act 15/2019 + NGER 2017) + PAIA (Act 2/2000) + SARB exchange
-- control filings + FIC Act 38/2001 STR/CTR filings + FSCA Conduct
-- Standard filings + SOC 1 Type II SSAE 18 + ISO 27001.
--
-- 10-state forward path + 4 branch states:
--   connector_proposed -> filing_authority_validated ->
--     tax_registration_bound -> filing_template_mapped -> schemas_loaded
--     -> e_filing_session_established -> test_submission_validated ->
--     reconciliation_period_bound -> live_filing_active ->
--     filing_acknowledged -> archived (HARD)
--   any non-terminal -> disconnect -> disconnected (HARD)
--   any non-terminal -> revoke_credential -> credential_revoked (HARD
--     - efiling profile revoked; SOC 1 Type II + ISO 27001 incident)
--   active -> suspend -> suspended (SOFT - filing-deadline lockout)
--   live -> activate_failover -> failover_active (SOFT - primary->DR)
--
-- Tier RE-DERIVED on every transition from
--   tierForScope(filing_count, jurisdiction_count, national_statutory)
-- with FLOOR-AT-MULTI-JURISDICTION on >=1 of 5 contextual flags;
-- FLOOR-AT-SYSTEMIC-CRITICAL on >=3 flags:
--   companies_act_lateness_penalty_active / sars_admin_penalty_active /
--   nersa_levy_arrears / dffe_ghg_threshold_exceeded /
--   paia_subject_access_request_open
-- INVERTED polarity - LARGER filing scope = MORE preparation + review
-- time. Stored as HOURS (single_filing 168h .. systemic_critical 720h).
--
-- SIGNATURE Phase-C regulator crossings (CIPC + SARS + NERSA + DMRE +
-- DFFE + PAIA + SOC 1 Type II):
--   revoke_credential -> EVERY tier (W126 SIGNATURE GOVERNMENT-FILING-
--     CONNECTOR-REVOKE hard line - efiling profile revoked = CIPC +
--     SARS + NERSA notice + PAIA disclosure mandatory; sister of
--     W122/W123/W124/W125 hard lines.)
--   activate_failover -> multi_jurisdiction + systemic_critical only.
--   disconnect -> EVERY tier WHEN companies_act_lateness_penalty_active
--     OR sars_admin_penalty_active (statutory-penalty disconnect =
--     automatic regulator notice.)
--   acknowledge_filing -> systemic_critical only.
--   sla_breached -> multi_jurisdiction + systemic_critical only.
--
-- Write {admin, regulator, trader, lender, offtaker} (5 writers - KEY
-- DIFF from W124/W125 4-writer pattern; regulator JOINS because this
-- connector PUSHES TO regulators). READ all 9 personas + EXTERNAL
-- `government_authority_counterparty` pseudo-persona via mTLS-gated
-- PUBLIC peer endpoint.
--
-- Persisted column budget kept under D1 100-col limit. ~95 persisted
-- cols. LIVE 28-field battery decorated at fetch.

CREATE TABLE IF NOT EXISTS oe_government_filing_connector (
  id                                      TEXT PRIMARY KEY,
  connector_number                        TEXT UNIQUE NOT NULL,
  peer_id                                 TEXT NOT NULL,
  counterparty_name                       TEXT,
  filing_authority                        TEXT NOT NULL CHECK (filing_authority IN (
    'cipc','sars','nersa','dmre','dffe','sarb','fic','fsca','treasury','municipal'
  )),
  filing_type                             TEXT NOT NULL CHECK (filing_type IN (
    'annual_return','vat201','emp201','it14','nersa_quarterly_electricity',
    'nersa_quarterly_gas','dmre_quarterly_reippppp','dffe_ghg','carbon_tax','paia_response'
  )),
  schema_version                          TEXT,
  efiling_credential_fingerprint          TEXT,
  credential_expiry_at                    TEXT,
  endpoint_url                            TEXT,
  tax_registration_number                 TEXT,
  filing_period                           TEXT,
  filing_count                            INTEGER,
  jurisdiction_count                      INTEGER,
  national_statutory                      INTEGER NOT NULL DEFAULT 0,
  next_filing_deadline_at                 TEXT,

  -- 5 cross-chain bridges (W118 mandatory + W125/W124/W74/W48)
  w125_erp_connector_ref                  TEXT,
  w124_settlement_connector_ref           TEXT,
  w74_nersa_levy_ref                      TEXT,
  w48_carbon_tax_ref                      TEXT,
  w118_block_ref                          TEXT,

  -- 5 floor flags (FLOOR-AT-MULTI-JURIS >=1 / FLOOR-AT-SYSTEMIC >=3)
  companies_act_lateness_penalty_active   INTEGER NOT NULL DEFAULT 0,
  sars_admin_penalty_active               INTEGER NOT NULL DEFAULT 0,
  nersa_levy_arrears                      INTEGER NOT NULL DEFAULT 0,
  dffe_ghg_threshold_exceeded             INTEGER NOT NULL DEFAULT 0,
  paia_subject_access_request_open        INTEGER NOT NULL DEFAULT 0,

  -- Performance / control effectiveness components (0-130 composite)
  filings_per_quarter                     INTEGER,
  successful_filing_count_quarter         INTEGER,
  failed_filing_count_quarter             INTEGER,
  failure_rate_pct                        REAL,
  average_filing_latency_ms               REAL,
  reconciliation_break_count              INTEGER,
  cipc_compliance_score                   INTEGER,
  sars_compliance_score                   INTEGER,
  nersa_compliance_score                  INTEGER,
  companies_act_filing_status             TEXT CHECK (companies_act_filing_status IN (
    'current','pending','overdue'
  )),
  sars_tax_clearance_status               TEXT CHECK (sars_tax_clearance_status IN (
    'active','pending','revoked'
  )),
  nersa_levy_status                       TEXT CHECK (nersa_levy_status IN (
    'current','arrears'
  )),
  dffe_ghg_threshold_status               TEXT CHECK (dffe_ghg_threshold_status IN (
    'under','over'
  )),
  schemas_compliant                       INTEGER NOT NULL DEFAULT 0,
  iso27001_controls_ok                    INTEGER NOT NULL DEFAULT 0,
  soc1_type2_audit_ok                     INTEGER NOT NULL DEFAULT 0,
  control_effectiveness_index             INTEGER,

  -- Composite indexes + bands
  current_tier                            TEXT NOT NULL CHECK (current_tier IN (
    'single_filing','quarterly_returns','annual_returns','multi_jurisdiction','systemic_critical'
  )),
  authority_required                      TEXT,
  urgency_band                            TEXT,
  connector_health_band                   TEXT,

  -- Narrative + reason codes
  title                                   TEXT,
  reason_code                             TEXT,

  is_reportable                           INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                      INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                   TEXT,
  regulator_ref                           TEXT,
  regulator_inbox_ref                     TEXT,

  -- 10 forward + 4 branch lifecycle timestamps
  chain_status                            TEXT NOT NULL CHECK (chain_status IN (
    'connector_proposed','filing_authority_validated','tax_registration_bound',
    'filing_template_mapped','schemas_loaded','e_filing_session_established',
    'test_submission_validated','reconciliation_period_bound',
    'live_filing_active','filing_acknowledged','archived',
    'disconnected','credential_revoked','suspended','failover_active'
  )),
  connector_proposed_at                   TEXT,
  filing_authority_validated_at           TEXT,
  tax_registration_bound_at               TEXT,
  filing_template_mapped_at               TEXT,
  schemas_loaded_at                       TEXT,
  e_filing_session_established_at         TEXT,
  test_submission_validated_at            TEXT,
  reconciliation_period_bound_at          TEXT,
  live_filing_active_at                   TEXT,
  filing_acknowledged_at                  TEXT,
  archived_at                             TEXT,
  disconnected_at                         TEXT,
  suspended_at                            TEXT,
  credential_revoked_at                   TEXT,
  failover_activated_at                   TEXT,

  -- Regulator crossing
  regulator_crossed_at                    TEXT,

  -- SLA (HOURS, INVERTED polarity)
  sla_target_hours                        INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                         TEXT,
  sla_breached                            INTEGER NOT NULL DEFAULT 0,
  last_sla_breach_at                      TEXT,
  escalation_level                        INTEGER NOT NULL DEFAULT 0,
  days_to_credential_renewal              INTEGER,
  days_to_next_filing_deadline            INTEGER,

  tenant_id                               TEXT,
  created_by                              TEXT NOT NULL,
  created_at                              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_gfc_status        ON oe_government_filing_connector(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_gfc_tier          ON oe_government_filing_connector(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_gfc_authority     ON oe_government_filing_connector(filing_authority);
CREATE INDEX IF NOT EXISTS idx_oe_gfc_peer_id       ON oe_government_filing_connector(peer_id);
CREATE INDEX IF NOT EXISTS idx_oe_gfc_breached      ON oe_government_filing_connector(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_gfc_created       ON oe_government_filing_connector(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_gfc_w118_block    ON oe_government_filing_connector(w118_block_ref);
CREATE INDEX IF NOT EXISTS idx_oe_gfc_w125_erp      ON oe_government_filing_connector(w125_erp_connector_ref);
CREATE INDEX IF NOT EXISTS idx_oe_gfc_regulator_ref ON oe_government_filing_connector(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_gfc_inbox_ref     ON oe_government_filing_connector(regulator_inbox_ref);

CREATE TABLE IF NOT EXISTS oe_government_filing_connector_events (
  id                  TEXT PRIMARY KEY,
  connector_id        TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  from_tier           TEXT,
  to_tier             TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_gfc_events_cnn  ON oe_government_filing_connector_events(connector_id);
CREATE INDEX IF NOT EXISTS idx_oe_gfc_events_type ON oe_government_filing_connector_events(event_type);
