-- Wave 106 - Regulator NERSA Section 35 Administrative Enforcement Action &
-- Fine Imposition chain (P6). 10th Regulator chain. The formal NERSA
-- enforcement-action lifecycle: NOTICE -> RESPONSE -> ADJUDICATION ->
-- SANCTION (fine / licence suspension / licence revocation) -> APPEAL ->
-- settled / withdrawn / upheld. Sister of W40 compliance inspection (finds
-- the non-conformance) + W66 complaints (receives the complaint) + W31
-- disposition (exits). W106 is the formal ENFORCEMENT action between
-- detection and exit. Coexists with W93 enforcement-actions (admin-penalty
-- audi/PAJA layer) at a different surface — W106 is the full s35 state
-- machine including licence-suspension / revocation sanctions + appeals +
-- gazette.
--
-- Beats FCA Enforcement Decision Notice / ESMA Sanctions / FERC Enforcement
-- / ACCC enforcement / European Commission DG-COMP / Eskom IPP
-- non-compliance / DOJ Energy enforcement / OFCOM enforcement / FSCA
-- Administrative Sanctions Committee - every one of these surfaces
-- enforcement as a case-management spreadsheet with email reminders; W106
-- makes it a procedural state-machine with PAJA-fairness LIVE flag,
-- gazette-required LIVE flag, appeal-window countdown, repeat-offender
-- index, and 4-step authority ladder culminating at the full NERSA Council
-- for licence revocation.
--
-- Standards: ERA s35 + PAJA s5 + Companies Act s38 + Constitution s33 +
-- NERSA Rules of Procedure.
--
-- 12 named lifecycle states + 4 branch destinations (appealed,
-- re_adjudicated, withdrawn, cancelled). settled is SOFT terminal (accepts
-- archive_action only). archived / withdrawn / cancelled are HARD terminals.
--
-- Tier RE-DERIVED on every transition from
-- COALESCE(sanction_quantum_zar, sanction_quantum_zar_floor, 0) and 5
-- FLOOR-AT-MATERIAL flags:
--   minor      base < 1000000
--   standard   1000000 <= base < 10000000
--   material   10000000 <= base < 100000000  OR any 1 floor flag
--   strategic  >= 100000000                  OR 2+ floor flags
--                                            OR licence_revocation_proposed
--                                            OR criminal_referral_recommended
--
-- INVERTED SLA polarity (strategic = LONGEST runway for PAJA s5 procedural
-- fairness review). strategic 180d / material 120d / standard 60d / minor
-- 30d on triggered.
--
-- Authority ladder (4-step):
--   minor      nersa_compliance_officer
--   standard   nersa_legal_advisor
--   material   nersa_executive_manager_compliance
--   strategic  nersa_full_council
--
-- SIGNATURE regulator crossings (ERA s35 + PAJA s5 + Companies Act s38 +
-- Constitution s33):
--   impose_sanction         crosses regulator EVERY tier when
--                            licence_revocation_proposed = TRUE
--                            (W106 signature hard line)
--   commence_enforcement    crosses regulator EVERY tier on strategic
--                            (Gazette publication required)
--   mark_settled            crosses regulator material+strategic when
--                            sanction_type in
--                            (licence_suspended, licence_revoked,
--                             criminal_referral)
--   sla_breached            crosses regulator material+strategic
--                            (PAJA fairness review exposure)
--   criminal_intelligence trigger + commence_enforcement always crosses
--                            regulator EVERY tier (SAPS handoff)
--
-- Write {admin, regulator}. READ all 9 personas. actor_party derived from
-- ACTION: NERSA writes draft / issue / start_adjudication / adjudicate /
-- impose_sanction / decide_appeal / commence_enforcement / withdraw /
-- cancel / archive; respondent writes acknowledge / submit_response /
-- lodge_appeal; either mark_settled (bilateral).

CREATE TABLE IF NOT EXISTS oe_enforcement_action (
  id                                                  TEXT PRIMARY KEY,
  enforcement_case_number                             TEXT UNIQUE NOT NULL,

  respondent_party_id                                 TEXT NOT NULL,
  respondent_party_label                              TEXT,
  respondent_licence_id                               TEXT,
  respondent_licence_class                            TEXT,

  triggering_event_type                               TEXT CHECK (triggering_event_type IN (
    'inspection_finding','complaint','sla_breach_referral',
    'regulator_initiated','criminal_intelligence'
  )),
  triggering_inspection_id                            TEXT,
  triggering_complaint_id                             TEXT,
  triggering_sla_breach_chain_ref                     TEXT,
  triggering_reason_summary_text                      TEXT,

  notice_drafted_by_actor_id                          TEXT,
  notice_issued_at                                    TEXT,
  notice_reference                                    TEXT,
  notice_legal_provisions                             TEXT,

  respondent_response_due_at                          TEXT,
  respondent_responded_at                             TEXT,
  respondent_position_text                            TEXT,

  adjudication_panel_label                            TEXT,
  adjudication_started_at                             TEXT,
  adjudication_completed_at                           TEXT,
  adjudication_decision_text                          TEXT,

  sanction_imposed_at                                 TEXT,
  sanction_type                                       TEXT,
  sanction_quantum_zar                                REAL NOT NULL DEFAULT 0,
  sanction_effective_at                               TEXT,
  sanction_end_at                                     TEXT,

  appeal_window_open_at                               TEXT,
  appeal_window_close_at                              TEXT,
  appeal_lodged_at                                    TEXT,
  appeal_lodged_by_actor_id                           TEXT,
  appeal_grounds_text                                 TEXT,
  appeal_outcome                                      TEXT,
  appeal_decided_at                                   TEXT,
  re_adjudication_decision_text                       TEXT,

  enforcement_started_at                              TEXT,
  enforcement_method                                  TEXT,
  amount_collected_zar                                REAL NOT NULL DEFAULT 0,

  settled_at                                          TEXT,
  withdrawn_at                                        TEXT,
  withdrawal_reason_code                              TEXT,
  cancellation_reason_text                            TEXT,
  archived_at                                         TEXT,
  cancelled_at                                        TEXT,

  regulator_relevant                                  INTEGER NOT NULL DEFAULT 1,
  regulator_reason_text                               TEXT,
  is_reportable                                       INTEGER NOT NULL DEFAULT 0,

  sanction_quantum_zar_floor                          REAL NOT NULL DEFAULT 0,

  enforcement_floor_flag_licence_revocation_proposed  INTEGER NOT NULL DEFAULT 0,
  enforcement_floor_flag_repeat_offender_within_36mo  INTEGER NOT NULL DEFAULT 0,
  enforcement_floor_flag_public_safety_impact_strict  INTEGER NOT NULL DEFAULT 0,
  enforcement_floor_flag_financial_quantum_over_50m   INTEGER NOT NULL DEFAULT 0,
  enforcement_floor_flag_criminal_referral_recommended INTEGER NOT NULL DEFAULT 0,

  repeat_offender_count_36mo                          INTEGER NOT NULL DEFAULT 0,
  cumulative_sanctions_history_zar                    REAL NOT NULL DEFAULT 0,

  current_tier                                        TEXT NOT NULL CHECK (current_tier IN (
    'minor','standard','material','strategic'
  )),
  authority_required                                  TEXT CHECK (authority_required IN (
    'nersa_compliance_officer','nersa_legal_advisor',
    'nersa_executive_manager_compliance','nersa_full_council'
  )),
  urgency_band                                        TEXT,

  title                                               TEXT,
  narrative                                           TEXT,

  chain_status                                        TEXT NOT NULL CHECK (chain_status IN (
    'triggered','notice_drafted','notice_issued',
    'respondent_acknowledged','response_received',
    'adjudication_in_progress','adjudicated','sanction_imposed',
    'appeal_window_open','enforcement_in_progress','settled','archived',
    'appealed','re_adjudicated','withdrawn','cancelled'
  )),

  triggered_at                                        TEXT,
  notice_drafted_at                                   TEXT,
  respondent_acknowledged_at                          TEXT,
  response_received_at                                TEXT,
  adjudication_in_progress_at                         TEXT,
  adjudicated_at                                      TEXT,
  appeal_window_open_state_at                         TEXT,
  appealed_at                                         TEXT,
  re_adjudicated_at                                   TEXT,
  enforcement_in_progress_at                          TEXT,

  regulator_crossed_at                                TEXT,
  regulator_inbox_ref                                 TEXT,
  regulator_ref                                       TEXT,

  sla_deadline_at                                     TEXT,
  last_sla_breach_at                                  TEXT,
  sla_breached                                        INTEGER NOT NULL DEFAULT 0,
  escalation_level                                    INTEGER NOT NULL DEFAULT 0,

  tenant_id                                           TEXT,
  created_by_actor_id                                 TEXT NOT NULL,
  updated_by_actor_id                                 TEXT,
  created_at                                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_enfact_tenant_status     ON oe_enforcement_action(tenant_id, chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_enfact_tenant_tier       ON oe_enforcement_action(tenant_id, current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_enfact_tenant_sla        ON oe_enforcement_action(tenant_id, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_enfact_tenant_respondent ON oe_enforcement_action(tenant_id, respondent_party_id, created_at);
CREATE INDEX IF NOT EXISTS idx_oe_enfact_tenant_trigger    ON oe_enforcement_action(tenant_id, triggering_event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_oe_enfact_inspection_ref    ON oe_enforcement_action(triggering_inspection_id);
CREATE INDEX IF NOT EXISTS idx_oe_enfact_complaint_ref     ON oe_enforcement_action(triggering_complaint_id);
CREATE INDEX IF NOT EXISTS idx_oe_enfact_reportable        ON oe_enforcement_action(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_enfact_breached          ON oe_enforcement_action(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_enfact_appeal_close      ON oe_enforcement_action(appeal_window_close_at);

CREATE TABLE IF NOT EXISTS oe_enforcement_action_events (
  id                  TEXT PRIMARY KEY,
  action_id           TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_enfact_events_action ON oe_enforcement_action_events(action_id);
CREATE INDEX IF NOT EXISTS idx_oe_enfact_events_type   ON oe_enforcement_action_events(event_type);
