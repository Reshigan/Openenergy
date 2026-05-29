-- Wave 75 — Grid Connection Energization & Commissioning Hold-Point Gate (P6).
-- The PHYSICAL go-live gate for a new generator. Once a plant has won scarce
-- capacity (W58 capacity allocation) and signed its Grid Connection Agreement
-- (W28 GCA), the SA Grid Code (Network Code + Grid Connection Code for Renewable
-- Power Plants) and the NTCSA / System Operator commissioning procedures require
-- it to be COMMISSIONED and ENERGIZED through a sequence of witnessed HOLD-POINTS
-- before it can sell a single MWh: a commissioning programme is agreed, a
-- pre-energization safety inspection is passed, the connection assets are energized,
-- cold commissioning proves the protection / SCADA / telemetry, the plant is first
-- SYNCHRONIZED, a trial-operation (hot commissioning) run is completed under load,
-- the grid-code COMPLIANCE TESTS (fault ride-through, reactive capability, frequency
-- response) are witnessed, and finally a Commercial Operation Date (COD) certificate
-- is issued. A failed hold-point SUSPENDS commissioning until remediated; an
-- abandoned project may be withdrawn from any non-terminal state.
--
-- DISTINCT from every other grid chain by SUBJECT:
--   W58 capacity-allocation QUEUES who may connect; W28 GCA negotiates the connection
--   AGREEMENT (the terms); W75 physically ENERGIZES and commissions the connection
--   (turns it on); W67 grid-code-compliance monitors ONGOING conformance once live —
--   W75 hands a COD-certified connection across to it. W18 / W13 / W50 / W34 operate
--   the connection day-to-day; W8 bills its transmission use-of-system.
--
-- 12-state P6 lifecycle:
--   connection_ready -> program_review -> program_approved
--     -> pre_energization_inspection -> energization_authorized -> cold_commissioning
--     -> synchronized -> trial_operation -> compliance_testing -> commercial_operation
--   suspend (failed hold-point): {pre_energization_inspection, energization_authorized,
--     cold_commissioning, synchronized, trial_operation, compliance_testing}
--       -> commissioning_suspended -> (resume) -> program_approved
--   withdraw (project abandoned): any non-terminal -> connection_withdrawn
--
-- Tiers (5) by CONNECTION CAPACITY (MW) / voltage class: embedded <1MW (LV) /
-- distribution <10MW (MV) / sub_transmission <50MW / transmission <200MW / bulk >=200MW.
--
-- SLA matrix is INVERTED — the LARGER the connection, the LONGER every hold-point
-- window (a 300 MW bulk plant's FRT / reactive-capability campaign takes weeks; a
-- 500 kW rooftop generator is signed off in days). Same flavour as W58 / W49.
--
-- Split write: the connected FACILITY (IPP developer) submits the programme, performs
-- cold commissioning and the trial-operation run, and may withdraw; the System
-- Operator (operator) approves the programme, witnesses and clears each hold-point,
-- issues the COD, and suspends / resumes commissioning. actor_party tags the side.
--
-- Reportability — the W75 SIGNATURE is COD-DRIVEN and POSITIVE: bringing new
-- generation to commercial operation is ALWAYS notifiable (NERSA generation register /
-- national energy balance), so issue_cod crosses for EVERY tier (the mirror of W67's
-- escalate_disconnection, where the FAILURE terminal always reports).
-- authorize_energization + suspend_commissioning + SLA breaches cross for the large
-- tiers (transmission + bulk) only.

CREATE TABLE IF NOT EXISTS oe_connection_energization (
  id                       TEXT PRIMARY KEY,
  energization_number      TEXT UNIQUE NOT NULL,

  -- Provenance (W75 follows W28 GCA / W58 capacity allocation)
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,
  gca_ref                  TEXT,              -- W28 Grid Connection Agreement
  capacity_allocation_ref  TEXT,              -- W58 capacity allocation

  -- Connected facility (the IPP being energized)
  facility_id              TEXT NOT NULL,
  facility_name            TEXT NOT NULL,
  connection_point         TEXT,              -- substation / busbar name
  network_operator         TEXT,              -- NTCSA / municipal DNO

  -- Classification
  technology               TEXT,              -- solar_pv / wind / battery / chp / hydro
  connection_capacity_mw   REAL NOT NULL,     -- MW at the connection point — drives the tier
  voltage_kv               REAL,              -- connection voltage
  connection_tier          TEXT NOT NULL CHECK (connection_tier IN (
    'embedded','distribution','sub_transmission','transmission','bulk'
  )),

  -- Commercial Operation
  cod_certificate_no       TEXT,
  cod_date                 TEXT,

  -- Refs
  program_ref              TEXT,
  inspection_ref           TEXT,
  energization_ref         TEXT,
  synchronization_ref      TEXT,
  compliance_test_ref      TEXT,
  suspension_ref           TEXT,
  withdrawal_ref           TEXT,

  -- Narrative
  program_basis            TEXT,
  approval_basis           TEXT,
  inspection_basis         TEXT,
  energization_basis       TEXT,
  cold_commissioning_basis TEXT,
  synchronization_basis    TEXT,
  trial_operation_basis    TEXT,
  compliance_test_basis    TEXT,
  cod_basis                TEXT,
  suspension_basis         TEXT,
  resumption_basis         TEXT,
  withdrawal_basis         TEXT,
  reason_code              TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'connection_ready','program_review','program_approved','pre_energization_inspection',
    'energization_authorized','cold_commissioning','synchronized','trial_operation',
    'compliance_testing','commercial_operation','commissioning_suspended','connection_withdrawn'
  )),
  connection_ready_at            TEXT NOT NULL,
  program_review_at              TEXT,
  program_approved_at            TEXT,
  pre_energization_inspection_at TEXT,
  energization_authorized_at     TEXT,
  cold_commissioning_at          TEXT,
  synchronized_at                TEXT,
  trial_operation_at             TEXT,
  compliance_testing_at          TEXT,
  commercial_operation_at        TEXT,
  commissioning_suspended_at     TEXT,
  connection_withdrawn_at        TEXT,

  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  is_reportable            INTEGER NOT NULL DEFAULT 0,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cen_status    ON oe_connection_energization(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_cen_tier      ON oe_connection_energization(connection_tier);
CREATE INDEX IF NOT EXISTS idx_oe_cen_facility  ON oe_connection_energization(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_cen_tech      ON oe_connection_energization(technology);
CREATE INDEX IF NOT EXISTS idx_oe_cen_sla       ON oe_connection_energization(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_connection_energization_events (
  id              TEXT PRIMARY KEY,
  energization_id TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cen_events_cen  ON oe_connection_energization_events(energization_id);
CREATE INDEX IF NOT EXISTS idx_oe_cen_events_type ON oe_connection_energization_events(event_type);
