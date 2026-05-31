-- Wave 125 - SAP / Oracle ERP Connector.
--
-- PHASE C WAVE 4 OF 5. The ENTERPRISE BACK-OFFICE financial-integration
-- spine. Where W124 = interbank rails (between banks), W125 = ERP
-- integration (between platform and customer back-office GL/AP/AR).
-- Bidirectional integration to SAP S/4HANA Cloud, SAP ECC, Oracle
-- E-Business Suite, Oracle Fusion, Workday, SAGE 300, Microsoft
-- Dynamics 365, NetSuite, Epicor, IFS.
--
-- Goal: beat SAP S/4HANA Cloud Integration + Oracle Integration Cloud +
-- Workday Integration Cloud + MuleSoft + Boomi + Informatica + TIBCO +
-- IBM AppConnect + SnapLogic + Celigo integrator.io.
--
-- Standards covered: SAP S/4HANA OData v4 + SAP ECC IDoc (FIDCC1/FIDCC2/
-- REMADV/INVOIC/PEXR2002) + Oracle Fusion SOAP + Workday SOAP/REST +
-- NetSuite SuiteTalk + IFRS 15/9/16/17 + SARS e-Filing + CIPC XBRL +
-- SOC 1 Type II SSAE 18 + ISO 27001 + PCAOB AS 5.
--
-- 10-state forward path + 4 branch states:
--   connector_proposed -> erp_endpoint_validated -> company_code_mapped
--     -> chart_of_accounts_bound -> schemas_loaded ->
--     idoc_session_established -> test_postings_validated ->
--     reconciliation_period_bound -> live_posting_active ->
--     period_close_reconciled -> archived (HARD)
--   any non-terminal -> disconnect -> disconnected (HARD)
--   any non-terminal -> revoke_credential -> credential_revoked (HARD
--     - service-account compromise; SOC 1 Type II + ISO 27001 incident)
--   active -> suspend -> suspended (SOFT - period close lockout)
--   live -> activate_failover -> failover_active (SOFT - primary->DR)
--
-- Tier RE-DERIVED on every transition from
--   tierForScope(module_count, company_code_count, jurisdiction_count)
-- with FLOOR-AT-ENTERPRISE-WIDE on >=1 of 5 contextual flags;
-- FLOOR-AT-MULTI-COUNTRY on >=3 flags:
--   sox_404_in_scope / ifrs_consolidation_required /
--   cross_border_transfer_pricing / sars_efiling_critical_path /
--   cipc_annual_filing_gate
-- INVERTED polarity - LARGER ERP scope = MORE onboarding/validation
-- time. Stored as HOURS (single_module 168h .. multi_country 720h).
--
-- SIGNATURE Phase-C regulator crossings (SARS + CIPC + SOC 1 Type II +
-- ISO 27001 + PCAOB AS 5):
--   revoke_credential -> EVERY tier (W125 SIGNATURE SAP-ORACLE-ERP-
--     CONNECTOR-REVOKE hard line - service-account compromise = SARB +
--     SARS + CIPC + SOC report mandatory; sister of W122/W123/W124.)
--   activate_failover -> enterprise_wide + group_consolidation +
--     multi_country only.
--   disconnect -> EVERY tier WHEN sox_404_in_scope OR
--     sars_efiling_critical_path (Material-weakness PCAOB AS 5 or SARS
--     filing-gate disconnect = automatic regulator notice.)
--   reconcile_period_close -> multi_country only (Multi-jurisdiction
--     close requires SARS + CIPC + group consolidator sign-off.)
--   sla_breached -> enterprise_wide + group_consolidation + multi_country.
--
-- Write {admin, trader, lender, offtaker} (SAME AS W124 - 4 financial
-- writers). READ all 9 personas + EXTERNAL `erp_counterparty` pseudo-
-- persona via mTLS-gated PUBLIC peer endpoint.
--
-- Persisted column budget kept under D1 100-col limit. ~95 persisted
-- cols. LIVE 28-field battery decorated at fetch.

CREATE TABLE IF NOT EXISTS oe_sap_oracle_erp_connector (
  id                                      TEXT PRIMARY KEY,
  connector_number                        TEXT UNIQUE NOT NULL,
  peer_id                                 TEXT NOT NULL,
  counterparty_name                       TEXT,
  erp_system                              TEXT NOT NULL CHECK (erp_system IN (
    'sap_s4hana','sap_ecc','oracle_ebs','oracle_fusion','workday',
    'sage_300','dynamics_365','netsuite','epicor','ifs'
  )),
  protocol                                TEXT NOT NULL CHECK (protocol IN (
    'odata_v4','soap','rest','idoc','suitetalk','dataverse','proprietary'
  )),
  schema_version                          TEXT,
  service_account_credential_fingerprint  TEXT,
  credential_expiry_at                    TEXT,
  endpoint_url                            TEXT,
  module_count                            INTEGER,
  company_code_count                      INTEGER,
  chart_of_accounts_node_count            INTEGER,
  jurisdiction_count                      INTEGER,
  idoc_session_id                         TEXT,
  period_end_at                           TEXT,

  -- 5 cross-chain bridges (W118 mandatory + W124/W3/W68/W21)
  w124_settlement_connector_ref           TEXT,
  w3_settlement_p6_ref                    TEXT,
  w68_counterparty_margin_ref             TEXT,
  w21_drawdown_ref                        TEXT,
  w118_block_ref                          TEXT,

  -- 5 floor flags (FLOOR-AT-ENTERPRISE >=1 / FLOOR-AT-MULTI-COUNTRY >=3)
  sox_404_in_scope                        INTEGER NOT NULL DEFAULT 0,
  ifrs_consolidation_required             INTEGER NOT NULL DEFAULT 0,
  cross_border_transfer_pricing           INTEGER NOT NULL DEFAULT 0,
  sars_efiling_critical_path              INTEGER NOT NULL DEFAULT 0,
  cipc_annual_filing_gate                 INTEGER NOT NULL DEFAULT 0,

  -- Control effectiveness components (0-130 composite)
  posting_volume_per_hour                 INTEGER,
  successful_posting_count_24h            INTEGER,
  failed_posting_count_24h                INTEGER,
  failure_rate_pct                        REAL,
  average_posting_latency_ms              REAL,
  reconciliation_break_count              INTEGER,
  ifrs_15_revenue_contribution_pct        REAL,
  ifrs_9_financial_instrument_contribution_pct REAL,
  sars_efiling_status                     TEXT CHECK (sars_efiling_status IN (
    'current','pending','overdue'
  )),
  cipc_annual_filing_status               TEXT CHECK (cipc_annual_filing_status IN (
    'current','pending','overdue'
  )),
  schemas_compliant                       INTEGER NOT NULL DEFAULT 0,
  iso27001_controls_ok                    INTEGER NOT NULL DEFAULT 0,
  soc1_type2_audit_ok                     INTEGER NOT NULL DEFAULT 0,
  control_effectiveness_index             INTEGER,

  -- Composite indexes + bands
  current_tier                            TEXT NOT NULL CHECK (current_tier IN (
    'single_module','multi_module','enterprise_wide','group_consolidation','multi_country'
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
    'connector_proposed','erp_endpoint_validated','company_code_mapped',
    'chart_of_accounts_bound','schemas_loaded','idoc_session_established',
    'test_postings_validated','reconciliation_period_bound',
    'live_posting_active','period_close_reconciled','archived',
    'disconnected','credential_revoked','suspended','failover_active'
  )),
  connector_proposed_at                   TEXT,
  erp_endpoint_validated_at               TEXT,
  company_code_mapped_at                  TEXT,
  chart_of_accounts_bound_at              TEXT,
  schemas_loaded_at                       TEXT,
  idoc_session_established_at             TEXT,
  test_postings_validated_at              TEXT,
  reconciliation_period_bound_at          TEXT,
  live_posting_active_at                  TEXT,
  period_close_reconciled_at              TEXT,
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
  days_to_period_close                    INTEGER,

  tenant_id                               TEXT,
  created_by                              TEXT NOT NULL,
  created_at                              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_soec_status        ON oe_sap_oracle_erp_connector(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_soec_tier          ON oe_sap_oracle_erp_connector(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_soec_erp_system    ON oe_sap_oracle_erp_connector(erp_system);
CREATE INDEX IF NOT EXISTS idx_oe_soec_peer_id       ON oe_sap_oracle_erp_connector(peer_id);
CREATE INDEX IF NOT EXISTS idx_oe_soec_breached      ON oe_sap_oracle_erp_connector(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_soec_created       ON oe_sap_oracle_erp_connector(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_soec_w118_block    ON oe_sap_oracle_erp_connector(w118_block_ref);
CREATE INDEX IF NOT EXISTS idx_oe_soec_w124_ssc      ON oe_sap_oracle_erp_connector(w124_settlement_connector_ref);
CREATE INDEX IF NOT EXISTS idx_oe_soec_regulator_ref ON oe_sap_oracle_erp_connector(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_soec_inbox_ref     ON oe_sap_oracle_erp_connector(regulator_inbox_ref);

CREATE TABLE IF NOT EXISTS oe_sap_oracle_erp_connector_events (
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

CREATE INDEX IF NOT EXISTS idx_oe_soec_events_cnn  ON oe_sap_oracle_erp_connector_events(connector_id);
CREATE INDEX IF NOT EXISTS idx_oe_soec_events_type ON oe_sap_oracle_erp_connector_events(event_type);
