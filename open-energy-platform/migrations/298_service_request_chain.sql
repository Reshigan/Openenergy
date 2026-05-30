-- Wave 104 — Support ITIL Service Request Fulfilment chain (P6). 11th
-- OEM-Support chain. The catalog + entitlement + fulfilment workflow,
-- distinct from W14 reactive triage, W41 root-cause analysis, W47 RFC/CAB,
-- and W55 vulnerability remediation. Service requests are catalog-driven,
-- pre-approved, low-risk requests like rotate API key, provision substation
-- read access, request a spare meter swap, request a site-visit window,
-- audit-evidence pull. They flow off the W80 service-contract entitlement
-- gate, route through approval (low-risk autonomic, configuration-change
-- CAB-mandated), assign to a fulfiller, run to fulfilled / verified /
-- closed, and feed first-time-fix and reopened metrics back into the
-- service desk. Beats ServiceNow ITSM Service Catalog + BMC Helix Request +
-- Jira SM Request + Atlassian Assist + Freshservice Request Catalog +
-- Ivanti Neurons Service Request + SolarWinds Service Desk Request +
-- ManageEngine ServiceDesk Plus Request + Cherwell SRC + TOPdesk by making
-- service requests a 12-state P6 chain with live entitlement score from
-- W80, CAB bridge to W47, first-time-fix telemetry, and signature
-- regulator crossings.
--
-- 12-state P6 lifecycle:
--   submitted -> check_entitlement -> entitlement_checked
--     -> request_approval -> approval_pending
--       -> approve -> approved -> assign -> assigned
--         -> start_fulfilment -> fulfilment_in_progress
--           -> request_user_info -> awaiting_user
--             -> receive_user_response -> user_responded
--               -> mark_fulfilled -> fulfilled (soft terminal)
--                 -> verify -> verified -> close -> closed (soft terminal)
--                   -> archive_request -> archived (hard terminal)
--   approval_pending -> reject -> rejected (hard terminal)
--   any non-terminal -> cancel_request -> cancelled (hard terminal)
--   fulfilled -> reopen_request -> fulfilment_in_progress
--
-- Tier RE-DERIVED on every transition from severity_zar:
--   minor    : severity < 50000
--   standard : 50000 <= severity < 500000
--   material : 500000 <= severity < 5000000
--   critical : severity >= 5000000
-- FLOOR-AT-MATERIAL on any of: data_export_popia, grid_significant,
-- sla_premium_contract. FLOOR-AT-CRITICAL on access_to_critical_system OR
-- oem_break_glass.
--
-- URGENT SLA polarity (higher tier = TIGHTER windows). critical 4h /
-- material 24h / standard 5d / minor 14d on submitted.
--
-- SIGNATURE (W104 hard line):
--   reject           -> regulator EVERY tier when regulator_relevant
--   mark_fulfilled   -> regulator on critical when grid_significant
--                       (security-of-supply signature)
--   cancel_request   -> regulator EVERY tier when entitled AND regulator_relevant
--   sla_breached     -> regulator on material + critical
--
-- Write {admin, support}. Read all 9 personas. actor_party functional:
-- requester / approver / fulfiller / verifier / archiver.

CREATE TABLE IF NOT EXISTS oe_service_request_chain (
  id                                                TEXT PRIMARY KEY,
  request_number                                    TEXT UNIQUE NOT NULL,

  source_event                                      TEXT,
  source_entity_type                                TEXT,
  source_entity_id                                  TEXT,
  source_wave                                       TEXT,

  catalog_item_id                                   TEXT,
  catalog_item_label                                TEXT,
  catalog_category                                  TEXT,

  requested_for_party_id                            TEXT,
  requested_for_party_label                         TEXT,
  requested_by_actor_id                             TEXT,
  requested_by_actor_role                           TEXT,
  business_justification                            TEXT,
  urgency_requested                                 TEXT,

  entitlement_status                                TEXT,
  entitlement_contract_id                           TEXT,
  entitlement_overage_units                         REAL,

  requires_cab_review                               INTEGER NOT NULL DEFAULT 0,
  cab_change_id                                     TEXT,

  approver_actor_id                                 TEXT,
  approver_actor_role                               TEXT,
  approval_decision                                 TEXT,
  approval_conditions_text                          TEXT,

  auto_fulfil_eligible                              INTEGER NOT NULL DEFAULT 0,
  auto_fulfil_playbook_ref                          TEXT,

  fulfiller_actor_id                                TEXT,
  assignee_team                                     TEXT,
  assigned_at                                       TEXT,
  fulfilment_started_at                             TEXT,
  fulfilled_at                                      TEXT,
  first_response_at                                 TEXT,
  closed_at                                         TEXT,

  first_time_fix                                    INTEGER NOT NULL DEFAULT 0,
  reopened_count                                    INTEGER NOT NULL DEFAULT 0,
  reopen_reason_text                                TEXT,

  customer_satisfaction_csat                        INTEGER,
  failure_reason_code                               TEXT,

  regulator_relevant                                INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                             TEXT,
  is_reportable                                     INTEGER NOT NULL DEFAULT 0,

  severity_zar                                      REAL NOT NULL DEFAULT 0,

  request_floor_flag_access_to_critical_system      INTEGER NOT NULL DEFAULT 0,
  request_floor_flag_data_export_popia              INTEGER NOT NULL DEFAULT 0,
  request_floor_flag_grid_significant               INTEGER NOT NULL DEFAULT 0,
  request_floor_flag_oem_break_glass                INTEGER NOT NULL DEFAULT 0,
  request_floor_flag_sla_premium_contract           INTEGER NOT NULL DEFAULT 0,

  current_tier                                      TEXT NOT NULL CHECK (current_tier IN (
    'minor','standard','material','critical'
  )),
  authority_required                                TEXT CHECK (authority_required IN (
    'end_user','service_desk_lead','asset_owner','support_director'
  )),

  title                                             TEXT,
  narrative                                         TEXT,
  result_text                                       TEXT,
  reject_reason                                     TEXT,
  cancelled_reason                                  TEXT,
  reason_code                                       TEXT,

  current_ball_in_court_party                       TEXT,
  last_responder_party                              TEXT,

  chain_status                                      TEXT NOT NULL CHECK (chain_status IN (
    'submitted','entitlement_checked','approval_pending','approved',
    'assigned','fulfilment_in_progress','awaiting_user','user_responded',
    'fulfilled','verified','closed','archived','rejected','cancelled'
  )),
  submitted_at                                      TEXT,
  entitlement_checked_at                            TEXT,
  approval_pending_at                               TEXT,
  approved_at                                       TEXT,
  awaiting_user_at                                  TEXT,
  user_responded_at                                 TEXT,
  verified_at                                       TEXT,
  archived_at                                       TEXT,
  rejected_at                                       TEXT,
  cancelled_at                                      TEXT,

  regulator_crossed_at                              TEXT,
  regulator_inbox_ref                               TEXT,
  regulator_ref                                     TEXT,
  sla_deadline_at                                   TEXT,
  last_sla_breach_at                                TEXT,
  sla_breached                                      INTEGER NOT NULL DEFAULT 0,
  escalation_level                                  INTEGER NOT NULL DEFAULT 0,

  tenant_id                                         TEXT,
  created_by                                        TEXT NOT NULL,
  created_at                                        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_sr_status     ON oe_service_request_chain(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_sr_tier       ON oe_service_request_chain(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_sr_tenant     ON oe_service_request_chain(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_sr_category   ON oe_service_request_chain(catalog_category);
CREATE INDEX IF NOT EXISTS idx_oe_sr_sla        ON oe_service_request_chain(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_sr_reg        ON oe_service_request_chain(regulator_relevant);
CREATE INDEX IF NOT EXISTS idx_oe_sr_breached   ON oe_service_request_chain(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_sr_requester  ON oe_service_request_chain(requested_by_actor_id);
CREATE INDEX IF NOT EXISTS idx_oe_sr_for        ON oe_service_request_chain(requested_for_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_sr_contract   ON oe_service_request_chain(entitlement_contract_id);
CREATE INDEX IF NOT EXISTS idx_oe_sr_cab        ON oe_service_request_chain(cab_change_id);

CREATE TABLE IF NOT EXISTS oe_service_request_chain_events (
  id                  TEXT PRIMARY KEY,
  request_id          TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_sr_events_req  ON oe_service_request_chain_events(request_id);
CREATE INDEX IF NOT EXISTS idx_oe_sr_events_type ON oe_service_request_chain_events(event_type);
