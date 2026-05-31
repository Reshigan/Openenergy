-- Wave 122 - SCADA / IEC 61850 Substation Connector.
--
-- PHASE C OPENER. Closes the audit-namespace family at W121 and opens
-- the external-system connector family (W122-W126). Real-time
-- bidirectional protocol bridge between the Open Energy Platform and
-- IPP / grid SCADA systems.
--
-- Goal: beat Triangle MicroWorks SCADA Data Gateway + Kalkitech SYNC
-- 4000 + NovaTech Orion LX + SEL RTAC + GE iFIX historian + OSIsoft
-- PI System + AVEVA System Platform.
--
-- Standards: IEC 61850 (MMS/GOOSE/SV), IEC 60870-5-104, IEC 62351,
-- DNP3 over TCP, Modbus TCP/RTU, IEEE C37.118 (synchrophasor PMU
-- streaming), OPC UA (OT-IT bridge), NERSA Grid Code C-3 (substation
-- telemetry), SANS 27001 cyber, SARB BA 700 (cyber-incident
-- notification).
--
-- 12-state forward path + 4 branch states:
--   connector_proposed -> endpoints_discovered -> tls_configured ->
--     handshake_completed -> telemetry_streaming -> quality_validated ->
--     alarms_subscribed -> control_commands_authorized ->
--     live_operations -> reconciliation_active -> archived (HARD)
--   any non-terminal -> disconnect -> disconnected (HARD - peer-side
--     hard fail)
--   any non-terminal -> revoke -> revoked (HARD - cert/credential
--     revoked by counterparty)
--   active states -> suspend -> suspended (SOFT - maintenance window)
--   live -> activate_failover -> failover_active (SOFT - primary
--     to secondary peer cutover)
--
-- Tier RE-DERIVED on every transition from substation_capacity_mva
-- with FLOOR-AT-LARGE-SUBSTATION on >=1 of 5 contextual flags;
-- FLOOR-AT-NATIONAL-GRID-BACKBONE on >=3 flags:
--   peak_demand_window / black_start_path_required / cross_border_link
--   / nersa_grid_code_compliance / critical_substation_n_minus_1
-- INVERTED polarity - LARGER substation = MORE commissioning time.
-- Stored as HOURS (pilot 168h .. national_grid_backbone 720h).
--
-- SIGNATURE Phase-C regulator crossings:
--   revoke -> EVERY tier (W122 SIGNATURE SCADA-CONNECTOR-REVOKE hard
--     line - counterparty cert revocation mid-stream = NERSA + SARB
--     BA 700 cyber notice + SOC report.)
--   activate_failover -> large_substation + national_grid_backbone
--     (Failover cutover at transmission level = grid-reliability event.)
--   disconnect -> EVERY tier WHEN critical_substation_n_minus_1
--     (N-1 substation disconnect = automatic grid-reliability notice.)
--   authorize_control_commands -> national_grid_backbone only
--     (Control authority at national-backbone = NERSA C-3 + SARB BA 700
--     mandatory disclosure.)
--   sla_breached -> large_substation + national_grid_backbone only.
--
-- Write {admin, grid_operator, ipp_developer}. READ all 9 personas +
-- EXTERNAL scada_counterparty via mTLS-gated PUBLIC peer endpoint.
--
-- Persisted column budget kept under D1 100-col limit. ~95 persisted
-- cols. LIVE 28-field battery decorated at fetch.

CREATE TABLE IF NOT EXISTS oe_scada_connector (
  id                                  TEXT PRIMARY KEY,
  connector_number                    TEXT UNIQUE NOT NULL,
  peer_id                             TEXT NOT NULL,
  substation_name                     TEXT,
  substation_capacity_mva             REAL,
  protocol                            TEXT NOT NULL CHECK (protocol IN (
    'iec_61850_mms','iec_61850_goose','iec_61850_sv',
    'iec_60870_5_104','dnp3_tcp','modbus_tcp','modbus_rtu',
    'ieee_c37_118','opc_ua'
  )),
  endpoint_url                        TEXT,
  tls_cert_fingerprint                TEXT,
  tls_cert_expiry_at                  TEXT,

  -- 5 cross-chain bridges (W118 mandatory + W110/W50/W67/W26)
  w110_transmission_outage_ref        TEXT,
  w50_reserve_activation_ref          TEXT,
  w67_grid_code_compliance_ref        TEXT,
  w26_cyber_incident_ref              TEXT,
  w118_block_ref                      TEXT,

  -- 5 floor flags (FLOOR-AT-LARGE >=1 / FLOOR-AT-NATIONAL >=3)
  peak_demand_window                  INTEGER NOT NULL DEFAULT 0,
  black_start_path_required           INTEGER NOT NULL DEFAULT 0,
  cross_border_link                   INTEGER NOT NULL DEFAULT 0,
  nersa_grid_code_compliance          INTEGER NOT NULL DEFAULT 0,
  critical_substation_n_minus_1       INTEGER NOT NULL DEFAULT 0,

  -- Telemetry quality components (0-130 composite)
  logical_node_count                  INTEGER,
  data_object_count                   INTEGER,
  messages_per_minute                 INTEGER,
  signal_to_noise_db                  REAL,
  latency_p50_ms                      REAL,
  latency_p99_ms                      REAL,
  jitter_ms                           REAL,
  packet_loss_pct                     REAL,
  tls_cert_valid                      INTEGER NOT NULL DEFAULT 0,
  iec_62351_cipher_ok                 INTEGER NOT NULL DEFAULT 0,
  protocol_compliant                  INTEGER NOT NULL DEFAULT 0,
  telemetry_quality_index             INTEGER,

  -- Composite indexes + bands
  current_tier                        TEXT NOT NULL CHECK (current_tier IN (
    'pilot','small_substation','medium_substation','large_substation','national_grid_backbone'
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
    'connector_proposed','endpoints_discovered','tls_configured',
    'handshake_completed','telemetry_streaming','quality_validated',
    'alarms_subscribed','control_commands_authorized',
    'live_operations','reconciliation_active','archived',
    'disconnected','revoked','suspended','failover_active'
  )),
  connector_proposed_at               TEXT,
  endpoints_discovered_at             TEXT,
  tls_configured_at                   TEXT,
  handshake_completed_at              TEXT,
  telemetry_streaming_at              TEXT,
  quality_validated_at                TEXT,
  alarms_subscribed_at                TEXT,
  control_commands_authorized_at      TEXT,
  live_operations_at                  TEXT,
  reconciliation_active_at            TEXT,
  archived_at                         TEXT,
  disconnected_at                     TEXT,
  suspended_at                        TEXT,
  revoked_at                          TEXT,
  failover_activated_at               TEXT,

  -- Regulator crossing
  regulator_crossed_at                TEXT,

  -- SLA (HOURS, INVERTED polarity)
  sla_target_hours                    INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                     TEXT,
  sla_breached                        INTEGER NOT NULL DEFAULT 0,
  last_sla_breach_at                  TEXT,
  escalation_level                    INTEGER NOT NULL DEFAULT 0,
  days_to_cert_renewal                INTEGER,

  tenant_id                           TEXT,
  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_scc_status        ON oe_scada_connector(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_scc_tier          ON oe_scada_connector(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_scc_protocol      ON oe_scada_connector(protocol);
CREATE INDEX IF NOT EXISTS idx_oe_scc_peer_id       ON oe_scada_connector(peer_id);
CREATE INDEX IF NOT EXISTS idx_oe_scc_breached      ON oe_scada_connector(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_scc_created       ON oe_scada_connector(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_scc_w118_block    ON oe_scada_connector(w118_block_ref);
CREATE INDEX IF NOT EXISTS idx_oe_scc_w110_outage   ON oe_scada_connector(w110_transmission_outage_ref);
CREATE INDEX IF NOT EXISTS idx_oe_scc_regulator_ref ON oe_scada_connector(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_scc_inbox_ref     ON oe_scada_connector(regulator_inbox_ref);

CREATE TABLE IF NOT EXISTS oe_scada_connector_events (
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

CREATE INDEX IF NOT EXISTS idx_oe_scc_events_cnn  ON oe_scada_connector_events(connector_id);
CREATE INDEX IF NOT EXISTS idx_oe_scc_events_type ON oe_scada_connector_events(event_type);
