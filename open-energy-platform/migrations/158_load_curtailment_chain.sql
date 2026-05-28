-- Wave 34 — Grid CSC-1 Load Curtailment / Emergency Load Reduction.
-- NERSA Grid Code System Operations Code section CSC-1 + C-3.
-- 11-state P6 lifecycle (8 forward + 3 branch terminals) for every formal
-- System Operator load-curtailment instruction issued during a Stage 1-8
-- load-shedding event.
--
-- Stages (load_shed_stage CHECK):
--   stage_1_2  — mild (1-2 GW shed nationally)
--   stage_3_4  — moderate (3-4 GW)
--   stage_5_6  — high (5-6 GW)
--   stage_7_8  — critical national (7-8 GW + grid collapse risk)
--
-- URGENT SLA matrix — higher stage gets TIGHTER deadlines.
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/source_wave.

CREATE TABLE IF NOT EXISTS oe_load_curtailment (
  id                      TEXT PRIMARY KEY,
  case_number             TEXT UNIQUE NOT NULL,

  -- Provenance (W13 dispatch nominations + W18 emergency outages can initiate)
  source_event            TEXT,
  source_entity_type      TEXT,
  source_entity_id        TEXT,
  source_wave             TEXT,

  -- SO (system operator) party
  so_party_id             TEXT NOT NULL,
  so_party_name           TEXT NOT NULL,

  -- Customer / Distribution / IPP target party (curtailment respondent)
  customer_party_id       TEXT NOT NULL,
  customer_party_name     TEXT NOT NULL,
  customer_category       TEXT NOT NULL CHECK (customer_category IN (
    'distribution', 'large_industrial', 'embedded_generator', 'mining', 'metro'
  )),
  facility_name           TEXT,
  facility_province       TEXT,

  -- Stage + targets
  load_shed_stage         TEXT NOT NULL CHECK (load_shed_stage IN (
    'stage_1_2','stage_3_4','stage_5_6','stage_7_8'
  )),
  national_shed_gw        REAL NOT NULL,
  target_mw               REAL NOT NULL,
  actual_shed_mw          REAL,
  variance_pct            REAL,
  duration_hours          REAL NOT NULL,

  -- Refs
  grid_code_section       TEXT NOT NULL DEFAULT 'CSC-1',
  instruction_ref         TEXT,
  acknowledgement_ref     TEXT,
  metering_reconcile_ref  TEXT,
  post_mortem_ref         TEXT,
  refusal_ref             TEXT,
  partial_ref             TEXT,
  withdrawal_ref          TEXT,

  -- Penalty (only for refused + partial_compliance)
  penalty_zar             REAL,
  penalty_basis           TEXT,
  tribunal_case_ref       TEXT,

  -- Narrative + ROD
  refusal_grounds         TEXT,
  partial_basis           TEXT,
  withdrawal_basis        TEXT,
  post_mortem_findings    TEXT,
  reason_code             TEXT,
  rod_notes               TEXT,

  -- State + lifecycle
  chain_status            TEXT NOT NULL CHECK (chain_status IN (
    'instruction_issued','acknowledged','curtailment_started',
    'target_achieved','instruction_lifted','reconciled','post_mortem',
    'closed','refused','partial_compliance','withdrawn'
  )),
  instruction_issued_at   TEXT NOT NULL,
  acknowledged_at         TEXT,
  curtailment_started_at  TEXT,
  target_achieved_at      TEXT,
  partial_compliance_at   TEXT,
  instruction_lifted_at   TEXT,
  reconciled_at           TEXT,
  post_mortem_opened_at   TEXT,
  closed_at               TEXT,
  refused_at              TEXT,
  withdrawn_at            TEXT,

  sla_deadline_at         TEXT,
  last_sla_breach_at      TEXT,
  escalation_level        INTEGER NOT NULL DEFAULT 0,

  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_load_curtailment_status     ON oe_load_curtailment(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_load_curtailment_stage      ON oe_load_curtailment(load_shed_stage);
CREATE INDEX IF NOT EXISTS idx_oe_load_curtailment_customer   ON oe_load_curtailment(customer_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_load_curtailment_so         ON oe_load_curtailment(so_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_load_curtailment_issued     ON oe_load_curtailment(instruction_issued_at);
CREATE INDEX IF NOT EXISTS idx_oe_load_curtailment_sla        ON oe_load_curtailment(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_load_curtailment_events (
  id              TEXT PRIMARY KEY,
  curtailment_id  TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_load_curtailment_events_case ON oe_load_curtailment_events(curtailment_id);
CREATE INDEX IF NOT EXISTS idx_oe_load_curtailment_events_type ON oe_load_curtailment_events(event_type);
