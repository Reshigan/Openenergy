-- Wave 124 - STRATE / SWIFT Settlement Connector.
--
-- PHASE C WAVE 3 OF 5. The MONEY-IN/MONEY-OUT financial settlement
-- spine. Where W122 = substation-grade SCADA bridge and W123 = IIoT
-- broker fleet, W124 = real bidirectional integration to STRATE
-- (SA Central Securities Depository), SWIFT MT/MX correspondent
-- network, SARB SAMOS RTGS, SADC RTGS, and commercial bank
-- EFT/ACH gateways.
--
-- Goal: beat SWIFT Alliance Access + Bottomline B2B + Cyrus +
-- FIS Open Payments Hub + ACI Worldwide Universal Payments +
-- TCS BaNCS Payments + Volante VolPay + Finastra
-- Payments-as-a-Service + Temenos Transact Payments + Murex MX.3
-- Post-Trade + Calypso Treasury + Misys Loan IQ.
--
-- Standards: ISO 20022 XML financial messages (pacs/camt/pain/admi/
-- auth families) + SWIFT MT legacy text 1xx/2xx/9xx + SWIFT MX
-- ISO 20022 wrapper + STRATE T+3 equities / T+1 bonds + SARB SAMOS
-- RTGS + SADC RTGS + SARB Exchange Control Regulations + Financial
-- Intelligence Centre Act (FIC Act AML/CFT) + Basel III LCR + Basel
-- III NSFR + ISO 27001 + PCI-DSS + PA-DSS + SARB BA 700 + EMIR EU
-- equivalence + CPMI-IOSCO PFMI Principle 9 (money settlements).
--
-- 11-state forward path + 4 branch states:
--   connector_proposed -> bic_validated -> bank_handshake_completed
--     -> iso20022_schemas_loaded -> messaging_session_established
--     -> test_messages_validated -> reconciliation_account_bound
--     -> live_settlement_active -> cycle_reconciled
--     -> archived (HARD)
--   any non-terminal -> disconnect -> disconnected (HARD - peer
--     BIC suspended)
--   any non-terminal -> revoke_credential -> credential_revoked
--     (HARD - SWIFT user-key compromise; FIC Act s28A reportable)
--   active states -> suspend -> suspended (SOFT - SARB scheduled
--     maintenance window)
--   live -> activate_failover -> failover_active (SOFT - primary
--     to secondary BIC cutover)
--
-- Tier RE-DERIVED on every transition from settlement_value_zar_per
-- _cycle with FLOOR-AT-SAMOS-RTGS on >=1 of 5 contextual flags;
-- FLOOR-AT-SWIFT-GLOBAL on >=3 flags:
--   cross_border_payment / sarb_excon_authorization_required /
--   fic_act_high_risk_jurisdiction /
--   basel_lcr_tier1_collateral /
--   cpmi_iosco_pfmi_principle9_systemic
-- INVERTED polarity - LARGER settlement scope = MORE onboarding/
-- validation time. Stored as HOURS (domestic_eft 168h ..
-- swift_global 720h).
--
-- SIGNATURE Phase-C regulator crossings (SARB ExCon + FIC Act +
-- Basel III + CPMI-IOSCO PFMI):
--   revoke_credential -> EVERY tier (W124 SIGNATURE STRATE-SWIFT-
--     CONNECTOR-REVOKE hard line - SWIFT user-key compromise =
--     mandatory SARB + FIC Act s28A + SOC report.)
--   activate_failover -> samos_rtgs + swift_global only.
--   disconnect -> EVERY tier WHEN cpmi_iosco_pfmi_principle9
--     _systemic (Systemic settlement disconnect = automatic CPMI
--     reportable.)
--   authorize_live_settlement -> swift_global only (Cross-border
--     global correspondent requires SARB ExCon clearance.)
--   settle_cycle when sarb_excon_authorization_required AND
--     excon_authorization_status_live=expired -> EVERY tier
--     (FIC Act material exposure.)
--   sla_breached -> samos_rtgs + swift_global only.
--
-- Write {admin, trader, lender, offtaker}. READ all 9 personas +
-- EXTERNAL bank_counterparty via mTLS-gated PUBLIC peer endpoint.
--
-- Persisted column budget kept under D1 100-col limit. ~96
-- persisted cols. LIVE 28-field battery decorated at fetch.

CREATE TABLE IF NOT EXISTS oe_strate_swift_connector (
  id                                  TEXT PRIMARY KEY,
  connector_number                    TEXT UNIQUE NOT NULL,
  peer_id                             TEXT NOT NULL,
  counterparty_name                   TEXT,
  bic                                 TEXT,
  protocol                            TEXT NOT NULL CHECK (protocol IN (
    'iso_20022_xml','swift_mt','swift_mx','strate_proprietary',
    'samos_rtgs','sadc_rtgs','eft_ach','pcc_eb'
  )),
  iso20022_schema_version             TEXT,
  swift_user_key_fingerprint          TEXT,
  swift_user_key_expiry_at            TEXT,
  reconciliation_account_id           TEXT,
  endpoint_url                        TEXT,
  settlement_value_zar_per_cycle      REAL,

  -- 5 cross-chain bridges (W118 mandatory + W120 mandatory + W68/W3/W21)
  w120_reconciliation_attestation_ref TEXT,
  w68_counterparty_margin_ref         TEXT,
  w3_settlement_p6_ref                TEXT,
  w21_drawdown_ref                    TEXT,
  w118_block_ref                      TEXT,

  -- 5 floor flags (FLOOR-AT-SAMOS >=1 / FLOOR-AT-SWIFT-GLOBAL >=3)
  cross_border_payment                          INTEGER NOT NULL DEFAULT 0,
  sarb_excon_authorization_required             INTEGER NOT NULL DEFAULT 0,
  fic_act_high_risk_jurisdiction                INTEGER NOT NULL DEFAULT 0,
  basel_lcr_tier1_collateral                    INTEGER NOT NULL DEFAULT 0,
  cpmi_iosco_pfmi_principle9_systemic           INTEGER NOT NULL DEFAULT 0,

  -- Settlement quality components (0-130 composite)
  settlement_messages_per_minute      INTEGER,
  successful_settlement_count_24h     INTEGER,
  failed_settlement_count_24h         INTEGER,
  failure_rate_pct                    REAL,
  settlement_value_zar_last_24h       REAL,
  average_settlement_latency_ms       REAL,
  reconciliation_break_count          INTEGER,
  reconciliation_break_zar            REAL,
  lcr_contribution_pct                REAL,
  nsfr_contribution_pct               REAL,
  excon_authorization_status          TEXT CHECK (excon_authorization_status IN (
    'none','pending','authorized','expired'
  )),
  fic_act_kyc_status                  TEXT CHECK (fic_act_kyc_status IN (
    'clean','refresh_due','flagged'
  )),
  protocol_compliant                  INTEGER NOT NULL DEFAULT 0,
  iso27001_controls_ok                INTEGER NOT NULL DEFAULT 0,
  pci_dss_segmentation_ok             INTEGER NOT NULL DEFAULT 0,
  settlement_quality_index            INTEGER,

  -- Composite indexes + bands
  current_tier                        TEXT NOT NULL CHECK (current_tier IN (
    'domestic_eft','multi_bank_eft','strate_csd','samos_rtgs','swift_global'
  )),
  authority_required                  TEXT,
  urgency_band                        TEXT,
  connector_health_band               TEXT,

  -- Narrative + reason codes
  title                               TEXT,
  reason_code                         TEXT,

  is_reportable                       INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                  INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text               TEXT,
  regulator_ref                       TEXT,
  regulator_inbox_ref                 TEXT,

  -- 11 forward + 4 branch lifecycle timestamps
  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'connector_proposed','bic_validated','bank_handshake_completed',
    'iso20022_schemas_loaded','messaging_session_established',
    'test_messages_validated','reconciliation_account_bound',
    'live_settlement_active','cycle_reconciled','archived',
    'disconnected','credential_revoked','suspended','failover_active'
  )),
  connector_proposed_at               TEXT,
  bic_validated_at                    TEXT,
  bank_handshake_completed_at         TEXT,
  iso20022_schemas_loaded_at          TEXT,
  messaging_session_established_at    TEXT,
  test_messages_validated_at          TEXT,
  reconciliation_account_bound_at     TEXT,
  live_settlement_active_at           TEXT,
  cycle_reconciled_at                 TEXT,
  archived_at                         TEXT,
  disconnected_at                     TEXT,
  suspended_at                        TEXT,
  credential_revoked_at               TEXT,
  failover_activated_at               TEXT,

  -- Regulator crossing
  regulator_crossed_at                TEXT,

  -- SLA (HOURS, INVERTED polarity)
  sla_target_hours                    INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                     TEXT,
  sla_breached                        INTEGER NOT NULL DEFAULT 0,
  last_sla_breach_at                  TEXT,
  escalation_level                    INTEGER NOT NULL DEFAULT 0,
  days_to_key_renewal                 INTEGER,

  tenant_id                           TEXT,
  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ssc_status        ON oe_strate_swift_connector(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ssc_tier          ON oe_strate_swift_connector(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ssc_protocol      ON oe_strate_swift_connector(protocol);
CREATE INDEX IF NOT EXISTS idx_oe_ssc_peer_id       ON oe_strate_swift_connector(peer_id);
CREATE INDEX IF NOT EXISTS idx_oe_ssc_breached      ON oe_strate_swift_connector(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ssc_created       ON oe_strate_swift_connector(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_ssc_w118_block    ON oe_strate_swift_connector(w118_block_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ssc_w120_ratt     ON oe_strate_swift_connector(w120_reconciliation_attestation_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ssc_regulator_ref ON oe_strate_swift_connector(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ssc_inbox_ref     ON oe_strate_swift_connector(regulator_inbox_ref);

CREATE TABLE IF NOT EXISTS oe_strate_swift_connector_events (
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

CREATE INDEX IF NOT EXISTS idx_oe_ssc_events_cnn  ON oe_strate_swift_connector_events(connector_id);
CREATE INDEX IF NOT EXISTS idx_oe_ssc_events_type ON oe_strate_swift_connector_events(event_type);
