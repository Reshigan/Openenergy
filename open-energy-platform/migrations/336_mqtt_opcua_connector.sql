-- Wave 123 - MQTT / OPC-UA Edge-Device IIoT Connector.
--
-- PHASE C WAVE 2 OF 5. Sister-wave to W122 substation-grade IEC 61850
-- bridge - this is the EDGE-DEVICE / IIoT BROKER tier connecting
-- inverters, BESS controllers, RTUs, weather stations, met masts,
-- substation gateways, SCADA RTUs, and Sparkplug-B fleets.
--
-- Goal: beat AWS IoT Core + Azure IoT Hub + HiveMQ Enterprise +
-- EMQX + VerneMQ + Kepware KEPServerEX + Matrikon OPC UA Server +
-- Prosys OPC UA Server + Unified Automation UaGateway + Cogent
-- DataHub + Inductive Automation Ignition Edge.
--
-- Standards: MQTT v5, MQTT-SN, OPC UA 1.05, OPC UA Pub/Sub,
-- Sparkplug B (Eclipse Tahu), IEC 61400-25 (wind), IEEE 2030.5
-- (CSIP / smart-inverter Common Smart Inverter Profile), SunSpec
-- Modbus + ModBus TCP, NERSA Grid Code C-3 + DOE-IPP DA-1, POPIA s19
-- (cross-border IoT data flows), IEC 62443 (OT cybersecurity),
-- SARB BA 700 (cyber-incident notification).
--
-- 11-state forward path + 4 branch states:
--   connector_proposed -> broker_provisioned -> topics_mapped ->
--     tls_mutual_configured -> client_registered ->
--     publishing_active -> subscription_validated ->
--     companion_spec_bound -> live_streaming ->
--     reconciliation_active -> archived (HARD)
--   any non-terminal -> disconnect -> disconnected (HARD - peer-side
--     hard fail)
--   any non-terminal -> revoke_credential -> credential_revoked
--     (HARD - cert/credential revoked by counterparty)
--   active states -> suspend -> suspended (SOFT - maintenance window)
--   live -> activate_failover -> failover_active (SOFT - primary
--     to secondary broker cutover)
--
-- Tier RE-DERIVED on every transition from endpoint_count
-- with FLOOR-AT-LARGE-FLEET on >=1 of 5 contextual flags;
-- FLOOR-AT-NATIONAL-IOT-BACKBONE on >=3 flags:
--   critical_safety_payload / cross_border_iot_traffic /
--   sparkplug_b_required / ieee_2030_5_csip_inverter_control /
--   aggregated_demand_response_above_50mw
-- INVERTED polarity - LARGER fleet = MORE provisioning time.
-- Stored as HOURS (edge_device 168h .. national_iot_backbone 720h).
--
-- SIGNATURE Phase-C regulator crossings:
--   revoke_credential -> EVERY tier (W123 SIGNATURE MQTT-OPCUA-
--     REVOKE hard line - counterparty cert revocation mid-stream =
--     NERSA + SARB BA 700 cyber notice + IEC 62443 SOC.)
--   activate_failover -> large_fleet + national_iot_backbone
--     (Failover cutover at fleet level = grid-reliability event.)
--   disconnect -> EVERY tier WHEN critical_safety_payload
--     (Safety-payload disconnect = automatic POPIA + IEC 62443
--     reportable.)
--   bind_companion_spec -> national_iot_backbone only WHEN
--     ieee_2030_5_csip_inverter_control
--     (CSIP inverter control authority at national-backbone =
--     NERSA C-3 + SARB BA 700 mandatory disclosure.)
--   sla_breached -> large_fleet + national_iot_backbone only.
--
-- Write {admin, grid_operator, ipp_developer, support}. READ all 9
-- personas + EXTERNAL iot_peer via mTLS-gated PUBLIC peer endpoint.
--
-- Persisted column budget kept under D1 100-col limit. ~96 persisted
-- cols. LIVE 28-field battery decorated at fetch.

CREATE TABLE IF NOT EXISTS oe_mqtt_opcua_connector (
  id                                  TEXT PRIMARY KEY,
  connector_number                    TEXT UNIQUE NOT NULL,
  peer_id                             TEXT NOT NULL,
  broker_name                         TEXT,
  endpoint_count                      INTEGER,
  protocol                            TEXT NOT NULL CHECK (protocol IN (
    'mqtt_v5','mqtt_sn','opc_ua_1_05','opc_ua_pubsub',
    'sparkplug_b','iec_61400_25','ieee_2030_5','sunspec_modbus'
  )),
  companion_spec                      TEXT CHECK (companion_spec IN (
    'pv_industry','energy','battery','inverter','wind'
  )),
  companion_spec_version              TEXT,
  endpoint_url                        TEXT,
  tls_cert_fingerprint                TEXT,
  tls_cert_expiry_at                  TEXT,

  -- 5 cross-chain bridges (W118 mandatory + W122/W71/W50/W26)
  w122_scada_connector_ref            TEXT,
  w71_asset_prognostics_ref           TEXT,
  w50_reserve_activation_ref          TEXT,
  w26_cyber_incident_ref              TEXT,
  w118_block_ref                      TEXT,

  -- 5 floor flags (FLOOR-AT-LARGE >=1 / FLOOR-AT-NATIONAL >=3)
  critical_safety_payload                       INTEGER NOT NULL DEFAULT 0,
  cross_border_iot_traffic                      INTEGER NOT NULL DEFAULT 0,
  sparkplug_b_required                          INTEGER NOT NULL DEFAULT 0,
  ieee_2030_5_csip_inverter_control             INTEGER NOT NULL DEFAULT 0,
  aggregated_demand_response_above_50mw         INTEGER NOT NULL DEFAULT 0,

  -- Telemetry quality components (0-130 composite)
  active_publishers                   INTEGER,
  active_subscribers                  INTEGER,
  subscription_topic_count            INTEGER,
  retained_message_count              INTEGER,
  messages_per_second                 INTEGER,
  qos_p99_ms                          REAL,
  payload_quality_index               INTEGER,
  control_commands_authorized_count   INTEGER,
  control_commands_executed_24h       INTEGER,
  tls_cert_valid                      INTEGER NOT NULL DEFAULT 0,
  iec_62443_cipher_ok                 INTEGER NOT NULL DEFAULT 0,
  protocol_compliant                  INTEGER NOT NULL DEFAULT 0,
  telemetry_quality_index             INTEGER,

  -- Composite indexes + bands
  current_tier                        TEXT NOT NULL CHECK (current_tier IN (
    'edge_device','small_fleet','medium_fleet','large_fleet','national_iot_backbone'
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
    'connector_proposed','broker_provisioned','topics_mapped',
    'tls_mutual_configured','client_registered','publishing_active',
    'subscription_validated','companion_spec_bound',
    'live_streaming','reconciliation_active','archived',
    'disconnected','credential_revoked','suspended','failover_active'
  )),
  connector_proposed_at               TEXT,
  broker_provisioned_at               TEXT,
  topics_mapped_at                    TEXT,
  tls_mutual_configured_at            TEXT,
  client_registered_at                TEXT,
  publishing_active_at                TEXT,
  subscription_validated_at           TEXT,
  companion_spec_bound_at             TEXT,
  live_streaming_at                   TEXT,
  reconciliation_active_at            TEXT,
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
  days_to_cert_renewal                INTEGER,

  tenant_id                           TEXT,
  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_moc_status        ON oe_mqtt_opcua_connector(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_moc_tier          ON oe_mqtt_opcua_connector(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_moc_protocol      ON oe_mqtt_opcua_connector(protocol);
CREATE INDEX IF NOT EXISTS idx_oe_moc_peer_id       ON oe_mqtt_opcua_connector(peer_id);
CREATE INDEX IF NOT EXISTS idx_oe_moc_breached      ON oe_mqtt_opcua_connector(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_moc_created       ON oe_mqtt_opcua_connector(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_moc_w118_block    ON oe_mqtt_opcua_connector(w118_block_ref);
CREATE INDEX IF NOT EXISTS idx_oe_moc_w122_scada    ON oe_mqtt_opcua_connector(w122_scada_connector_ref);
CREATE INDEX IF NOT EXISTS idx_oe_moc_regulator_ref ON oe_mqtt_opcua_connector(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_moc_inbox_ref     ON oe_mqtt_opcua_connector(regulator_inbox_ref);

CREATE TABLE IF NOT EXISTS oe_mqtt_opcua_connector_events (
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

CREATE INDEX IF NOT EXISTS idx_oe_moc_events_cnn  ON oe_mqtt_opcua_connector_events(connector_id);
CREATE INDEX IF NOT EXISTS idx_oe_moc_events_type ON oe_mqtt_opcua_connector_events(event_type);
