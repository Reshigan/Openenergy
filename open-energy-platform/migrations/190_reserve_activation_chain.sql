-- Wave 50 — Grid Ancillary Services Reserve Activation & Settlement chain.
-- NERSA SA Grid Code, System Operation Code (ancillary services + reserves) and
-- Network Code. 12-state P6 lifecycle for every formal reserve ACTIVATION the
-- System Operator (SO) dispatches during a frequency / contingency event.
--
-- The third Grid real-time-operations chain: pairs with W13 dispatch
-- nominations (scheduled energy) and W34 load curtailment (emergency demand
-- reduction). W50 is the supply-side reserve-response counterpart — the SO
-- instructs a contracted reserve provider, the provider responds, the SO
-- measures delivered response against the instruction, and the event is settled.
--
-- 12-state P6 lifecycle:
--   activation_issued → acknowledged → ramping → sustaining → released
--     → performance_review → verified → settled
--   non-performance: ramping|sustaining|performance_review → non_performance → settled (penalty)
--   dispute:         performance_review|verified|non_performance → disputed → dispute_resolved
--   early exit:      activation_issued|acknowledged|ramping → withdrawn
--
-- Reserve tiers (fastest → slowest; drive the URGENT SLA + reportability):
--   instantaneous_reserve — governor / frequency response (seconds)
--   regulating_reserve    — AGC (~30s)
--   ten_minute_reserve    — spinning reserve (10 min)
--   supplemental_reserve  — non-spinning / standing reserve (10-30 min)
--   emergency_reserve     — slow emergency / interruptible (30 min+)
--
-- URGENT SLA: the faster the reserve product, the TIGHTER the response window.
--
-- Reportability: flag_non_performance crosses for security tiers (instantaneous
-- / regulating / ten_minute); resolve_dispute + sla_breached cross for critical
-- tiers (instantaneous / regulating).
--
-- Two-party write split: the provider acknowledges / ramps / sustains / disputes;
-- the SO drives release / review / verify / settle / penalty / withdraw.
-- actor_party (system_operator / reserve_provider) records the function per step.

CREATE TABLE IF NOT EXISTS oe_reserve_activations (
  id                            TEXT PRIMARY KEY,
  activation_number             TEXT UNIQUE NOT NULL,

  -- Provenance (e.g. a frequency event, contingency, or dispatch shortfall)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (two-party split: System Operator + reserve provider)
  so_party_id                   TEXT NOT NULL,
  so_party_name                 TEXT NOT NULL,
  provider_party_id             TEXT NOT NULL,
  provider_party_name           TEXT NOT NULL,

  -- Activation identity
  reserve_tier                  TEXT NOT NULL CHECK (reserve_tier IN (
    'instantaneous_reserve','regulating_reserve','ten_minute_reserve',
    'supplemental_reserve','emergency_reserve'
  )),
  provider_type                 TEXT NOT NULL,     -- generator / pumped_storage / demand_response / battery_storage / interconnector
  service_name                  TEXT NOT NULL,
  contract_ref                  TEXT,              -- ancillary-services contract
  trigger_type                  TEXT,              -- frequency_drop / contingency / voltage / dispatch_shortfall / planned_test
  instructed_mw                 REAL,              -- MW the SO instructed
  delivered_mw                  REAL,              -- MW actually delivered (set at review)
  response_time_seconds         REAL,              -- contracted full-response time (drives tier)
  actual_response_seconds       REAL,              -- measured response time
  frequency_hz_at_event         REAL,              -- grid frequency that triggered the activation
  availability_payment_zar      REAL,              -- standing availability payment (R)
  utilisation_payment_zar       REAL,              -- delivered-energy utilisation payment (R)
  penalty_zar                   REAL,              -- non-performance penalty / clawback (R)

  -- Refs
  instruction_ref               TEXT,
  acknowledgement_ref           TEXT,
  ramp_ref                       TEXT,
  delivery_ref                  TEXT,
  release_ref                   TEXT,
  review_ref                     TEXT,
  verification_ref              TEXT,
  settlement_ref                TEXT,
  dispute_ref                    TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  instruction_basis             TEXT,
  response_basis                TEXT,
  performance_basis             TEXT,
  settlement_basis              TEXT,
  non_performance_basis         TEXT,
  dispute_basis                 TEXT,
  reason_code                   TEXT,
  notes                          TEXT,

  dispute_round                 INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'activation_issued','acknowledged','ramping','sustaining','released',
    'performance_review','verified','settled','non_performance','disputed',
    'dispute_resolved','withdrawn'
  )),
  activation_issued_at          TEXT NOT NULL,
  acknowledged_at               TEXT,
  ramping_at                    TEXT,
  sustaining_at                 TEXT,
  released_at                   TEXT,
  performance_review_at         TEXT,
  verified_at                   TEXT,
  settled_at                    TEXT,
  non_performance_at            TEXT,
  disputed_at                   TEXT,
  dispute_resolved_at           TEXT,
  withdrawn_at                  TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_resact_status   ON oe_reserve_activations(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_resact_tier     ON oe_reserve_activations(reserve_tier);
CREATE INDEX IF NOT EXISTS idx_oe_resact_provider ON oe_reserve_activations(provider_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_resact_issued   ON oe_reserve_activations(activation_issued_at);
CREATE INDEX IF NOT EXISTS idx_oe_resact_sla      ON oe_reserve_activations(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_reserve_activations_events (
  id                 TEXT PRIMARY KEY,
  activation_id      TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_resact_events_act  ON oe_reserve_activations_events(activation_id);
CREATE INDEX IF NOT EXISTS idx_oe_resact_events_type ON oe_reserve_activations_events(event_type);
