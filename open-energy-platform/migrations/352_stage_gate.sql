-- Wave 131 - Project Stage Gates (DG0-DG4) governance chain.
--
-- PHASE E WAVE 1 OF N - FIRST IPP-PM profile-completeness wave under
-- the "best-in-class projects system" directive (2026-05-31).
--
-- Standalone P6 chain oe_stage_gates. Each row = one gate (DG0-DG4)
-- for one project. 5 rows per project. Each row owns its own 12-state
-- P6 lifecycle. Bridges to W19/W20/W21/W113 supply the evidence pack;
-- bridges do not own the decision.
--
-- Satisfies PMBOK 7 / Primavera P6 / Equator Principles governance gate
-- requirements for REIPPPP IPPs. Without a stage-gate chain, there is no
-- audit-trail-grade record of who approved the project to advance from
-- DG2 to DG3 with what conditions on what evidence pack - the
-- load-bearing question for any lender Independent Engineer, the
-- REIPPPP IPPO, and the NERSA Section 14 review.
--
-- Gate index semantics:
--   0 - DG0 Concept screening
--   1 - DG1 Feasibility
--   2 - DG2 FEED / FID-prep
--   3 - DG3 Sanction (FID / REIPPPP bid commitment)
--   4 - DG4 COD / Operations entry
--
-- 12-state forward path + 4 branch states (= 16 chain states):
--   gate_proposed -> evidence_compiled -> ie_reviewed ->
--     lender_reviewed -> board_briefing_circulated -> cab_held ->
--     conditions_set -> decision_recorded -> conditions_satisfied ->
--     gate_passed -> notified_downstream -> archived (HARD)
--   any non-terminal -> defer_gate -> gate_deferred (SOFT, loops to
--     evidence_compiled once rescheduled)
--   any non-terminal -> withdraw_gate -> gate_withdrawn (SOFT)
--   any non-terminal -> reject_gate -> gate_rejected (HARD - W131 SIGNATURE)
--   conditions_satisfied/gate_passed -> conditional_pass ->
--     gate_conditional_pass (SOFT - loops to conditions_satisfied)
--
-- INVERTED SLA polarity at gate_proposed - LARGER / more E&S-sensitive
-- gates get MORE diligence time:
--   low_capex 168h (7d) -> medium_capex 336h (14d) ->
--   high_capex 720h (30d) -> mega_capex 1440h (60d) ->
--   equator_cat_a 2160h (90d)
--
-- SIGNATURE W131 regulator crossings:
--   reject_gate -> EVERY tier (W131 SIGNATURE - project termination is
--     universally reportable to NERSA + DMRE - REIPPPP bid death IS the
--     reportable event; sister of W127 rollback hard line)
--   record_decision for gate_index=4 (DG4 COD) -> EVERY tier
--     (NERSA Section 14 licence crossing)
--   record_decision for gate_index=0 or gate_index=3 ->
--     medium_capex + high_capex + mega_capex + equator_cat_a
--   defer_gate -> mega_capex + equator_cat_a only (lender consent)
--   sla_breached -> high_capex + mega_capex + equator_cat_a only
--
-- Tiers (capex x Equator hybrid):
--   low_capex      - < R100M, Equator C
--   medium_capex   - R100M <= capex < R500M, Equator B
--   high_capex     - R500M <= capex < R2bn, Equator B
--   mega_capex     - capex >= R2bn, Equator B (REIPPPP utility)
--   equator_cat_a  - Equator Cat A regardless of capex (FLOOR)
--
-- FLOOR-AT-HIGH >=1 flag / FLOOR-AT-MEGA >=3 flags.
--
-- 5 floor flags:
--   equator_cat_a               - Cat A high E&S risk -> FLOOR
--   fid_committed               - at DG3+ post-sanction (irreversible)
--   nersa_notifiable            - DG0 and DG4 always notifiable to NERSA
--   debt_sized                  - post-DG2 (W21 drawdown depends on gate)
--   shareholder_consent_required - mega_capex + equator_cat_a need NED
--
-- 17 actions: propose_gate / compile_evidence / ie_review /
--   lender_review / circulate_board_briefing / hold_cab / set_conditions /
--   record_decision / satisfy_conditions / pass_gate / notify_downstream /
--   archive / defer_gate / withdraw_gate / reject_gate / conditional_pass /
--   sla_breach (cron-only).
--
-- 4-step authority: project_manager -> ie_assessor -> cfo -> board_chair
--
-- Write {admin, ipp_developer}. READ all 9 personas.
-- No public peer / no mTLS - internal governance.
--
-- 5 bridges:
--   w19_procurement_ref  -> oe_procurement.id (DG2 evidence pack)
--   w20_cod_ref          -> oe_cod.id (DG4 evidence; DG4 outcome gates
--                          COD activation via READ check in W20)
--   w21_drawdown_ref     -> oe_drawdown.id (DG3 sanction triggers W21)
--   w113_evm_ref         -> oe_ipp_evm.id (cost confidence at each gate)
--   w118_block_ref       -> W118 spine (MANDATORY - Merkle-hash every
--                          record_decision event)
--
-- Persisted column budget: ~93 + 12 state-ts = 105. Safe (D1 limit ~100).
-- 4 LIVE fields derived at fetch: time_in_state_hours_live /
-- sla_remaining_hours_live / conditions_aging_days_live /
-- equator_category_live.
--
-- AUDIT_PREFIX_MAP: stage_gate -> 'ipp' (JOINS existing IPP-PM family
-- alongside ipp_schedule / ipp_evm / ipp_doc_control / ipp_submittal /
-- ipp_rfi / ipp_change_order - preserves IPP-PM audit-chain continuity;
-- do NOT open a new 'pm' namespace).

CREATE TABLE IF NOT EXISTS oe_stage_gates (
  id                                    TEXT PRIMARY KEY,
  gate_index                            INTEGER NOT NULL CHECK (gate_index IN (0,1,2,3,4)),
  project_id                            TEXT NOT NULL,
  title                                 TEXT,

  -- Capex + Equator tier inputs
  capex_zar                             REAL,
  capex_band                            TEXT CHECK (capex_band IN (
    'low','medium','high','mega'
  )),
  equator_category                      TEXT CHECK (equator_category IN (
    'cat_a','cat_b','cat_c'
  )),
  debt_sized                            INTEGER NOT NULL DEFAULT 0,

  -- Tier (re-derived at each transition)
  current_tier                          TEXT NOT NULL CHECK (current_tier IN (
    'low_capex','medium_capex','high_capex','mega_capex','equator_cat_a'
  )) DEFAULT 'low_capex',

  -- 5 floor flags
  floor_equator_cat_a                   INTEGER NOT NULL DEFAULT 0,
  floor_fid_committed                   INTEGER NOT NULL DEFAULT 0,
  floor_nersa_notifiable                INTEGER NOT NULL DEFAULT 0,
  floor_debt_sized                      INTEGER NOT NULL DEFAULT 0,
  floor_shareholder_consent_required    INTEGER NOT NULL DEFAULT 0,

  -- 5 bridges (W118 MANDATORY)
  w19_procurement_ref                   TEXT,
  w20_cod_ref                           TEXT,
  w21_drawdown_ref                      TEXT,
  w113_evm_ref                          TEXT,
  w118_block_ref                        TEXT,

  -- Decision artefacts
  decision                              TEXT CHECK (decision IN (
    'approved','conditional_approved','deferred','rejected','withdrawn',NULL
  )),
  conditions_payload                    TEXT,
  evidence_payload                      TEXT,
  ie_letter_r2_key                      TEXT,
  cab_minutes_r2_key                    TEXT,
  board_minutes_r2_key                  TEXT,

  -- LIVE 28-field battery (non-derived fields persisted here)
  cost_confidence_aace_class_live       TEXT CHECK (cost_confidence_aace_class_live IN (
    'class_5','class_4','class_3','class_2','class_1',NULL
  )),
  schedule_confidence_p50_live          REAL,
  irr_post_tax_live                     REAL,
  debt_sizing_zar_live                  REAL,
  e_s_risk_score_live                   REAL,
  ie_letter_attached_bool_live          INTEGER NOT NULL DEFAULT 0,
  cab_minutes_attached_bool_live        INTEGER NOT NULL DEFAULT 0,
  board_minutes_attached_bool_live      INTEGER NOT NULL DEFAULT 0,
  cumulative_capex_committed_zar_live   REAL,
  bridges_to_w19_live                   INTEGER NOT NULL DEFAULT 0,
  bridges_to_w20_live                   INTEGER NOT NULL DEFAULT 0,
  bridges_to_w21_live                   INTEGER NOT NULL DEFAULT 0,
  bridges_to_w113_live                  INTEGER NOT NULL DEFAULT 0,
  bridges_to_w118_live                  INTEGER NOT NULL DEFAULT 0,

  -- Governance narrative
  reason_code                           TEXT,
  authority_required                    TEXT,
  urgency_band                          TEXT,

  -- Regulator crossing
  is_reportable                         INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                    INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                 TEXT,
  regulator_ref                         TEXT,
  regulator_inbox_ref                   TEXT,
  regulator_crossed_at                  TEXT,

  -- SLA (HOURS, INVERTED polarity)
  sla_target_hours                      INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                       TEXT,
  sla_breached                          INTEGER NOT NULL DEFAULT 0,
  last_sla_breach_at                    TEXT,
  escalation_level                      INTEGER NOT NULL DEFAULT 0,

  -- 12 forward + 4 branch lifecycle timestamps
  chain_status                          TEXT NOT NULL CHECK (chain_status IN (
    'gate_proposed','evidence_compiled','ie_reviewed','lender_reviewed',
    'board_briefing_circulated','cab_held','conditions_set','decision_recorded',
    'conditions_satisfied','gate_passed','notified_downstream','archived',
    'gate_deferred','gate_withdrawn','gate_rejected','gate_conditional_pass'
  )),
  gate_proposed_at                      TEXT,
  evidence_compiled_at                  TEXT,
  ie_reviewed_at                        TEXT,
  lender_reviewed_at                    TEXT,
  board_briefing_circulated_at          TEXT,
  cab_held_at                           TEXT,
  conditions_set_at                     TEXT,
  decision_recorded_at                  TEXT,
  conditions_satisfied_at               TEXT,
  gate_passed_at                        TEXT,
  notified_downstream_at                TEXT,
  archived_at                           TEXT,
  gate_deferred_at                      TEXT,
  gate_withdrawn_at                     TEXT,
  gate_rejected_at                      TEXT,
  gate_conditional_pass_at              TEXT,

  tenant_id                             TEXT,
  created_by                            TEXT NOT NULL,
  created_at                            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_sg_status        ON oe_stage_gates(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_sg_tier          ON oe_stage_gates(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_sg_project       ON oe_stage_gates(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_sg_gate_index    ON oe_stage_gates(gate_index);
CREATE INDEX IF NOT EXISTS idx_oe_sg_breached      ON oe_stage_gates(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_sg_created       ON oe_stage_gates(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_sg_w118_block    ON oe_stage_gates(w118_block_ref);
CREATE INDEX IF NOT EXISTS idx_oe_sg_w19_ref       ON oe_stage_gates(w19_procurement_ref);
CREATE INDEX IF NOT EXISTS idx_oe_sg_w20_ref       ON oe_stage_gates(w20_cod_ref);
CREATE INDEX IF NOT EXISTS idx_oe_sg_w21_ref       ON oe_stage_gates(w21_drawdown_ref);
CREATE INDEX IF NOT EXISTS idx_oe_sg_w113_ref      ON oe_stage_gates(w113_evm_ref);
CREATE INDEX IF NOT EXISTS idx_oe_sg_regulator_ref ON oe_stage_gates(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_sg_inbox_ref     ON oe_stage_gates(regulator_inbox_ref);

CREATE TABLE IF NOT EXISTS oe_stage_gate_events (
  id                  TEXT PRIMARY KEY,
  gate_id             TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  actor_id            TEXT,
  actor_party         TEXT,
  from_status         TEXT,
  to_status           TEXT,
  payload             TEXT,
  regulator_crossed   INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gate_id) REFERENCES oe_stage_gates(id)
);

CREATE INDEX IF NOT EXISTS idx_oe_sge_gate_id   ON oe_stage_gate_events(gate_id);
CREATE INDEX IF NOT EXISTS idx_oe_sge_evt_type  ON oe_stage_gate_events(event_type);
CREATE INDEX IF NOT EXISTS idx_oe_sge_created   ON oe_stage_gate_events(created_at);
