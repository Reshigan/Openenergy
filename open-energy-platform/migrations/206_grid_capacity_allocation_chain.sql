-- Wave 58 — Grid Connection Capacity Allocation & Queue Management chain.
-- NERSA Grid Code + the National Transmission Company SA (NTCSA) Interim Grid
-- Capacity Allocation and Curtailment Rules (2024). Transmission and distribution
-- headroom is the binding constraint on South Africa energy transition: far more
-- generation wants to connect than the network can host. Before a generator can
-- sign a Grid Connection Agreement it must SECURE an allocation of scarce grid
-- capacity at a supply point. A developer applies for capacity at a chosen
-- connection point; the network operator screens completeness, may request more
-- information, runs a network / capacity assessment (load-flow, fault-level,
-- stability, available headroom), assigns a QUEUE POSITION (priority date /
-- ranking), then a capacity-allocation committee ISSUES AN OFFER, the applicant
-- ACCEPTS (reserving the capacity pending milestones), and the operator finally
-- ALLOCATES the capacity firmly — which feeds the W28 Grid Connection Agreement.
--
-- This is the capacity-rights QUEUE that sits UPSTREAM of the grid lifecycle —
-- the front-end gate to physical connection, the way W57 SSEG registration / W49
-- licensing are front-ends to the regulated market. It pairs with the existing
-- grid chains: W28 negotiates the GCA for capacity W58 has ALLOCATED (W58 -> W28
-- handoff), W18 coordinates outages, W34 curtails when stressed, W50 activates
-- reserves, W13 schedules dispatch, W8 bills transmission use-of-system.
--
-- 12-state P6 lifecycle:
--   application_received -> completeness_screening -> capacity_assessment
--     -> queue_positioned -> offer_issued -> capacity_reserved -> capacity_allocated
--   information-gap loop: completeness_screening -> information_requested -> completeness_screening
--   rejection:           capacity_assessment|queue_positioned -> rejected
--   lapse:               offer_issued|capacity_reserved -> lapsed
--   relinquishment:      capacity_reserved -> relinquished
--   early withdraw:      application_received|completeness_screening|information_requested|capacity_assessment|queue_positioned|offer_issued -> withdrawn
--
-- Tiers (by requested capacity MW — drive SLA windows + reportability):
--   minor   — < 10 MW   | small  — < 50 MW    | medium — < 100 MW
--   large   — < 250 MW  | strategic — >= 250 MW
--
-- INVERTED SLA: the bigger the requested connection, the MORE time every window
-- allows (a transmission-level connection needs a far deeper load-flow / fault-
-- level / system-impact study than a small distribution tie-in).
--
-- Reportability: reject_application crosses for EVERY tier (denying grid access is
-- always material in a capacity-constrained grid — universal, the W58 signature);
-- relinquish crosses for the large + strategic tiers only; sla_breached crosses for
-- large + strategic.
--
-- Two-party write split: the applicant files / supplies info / accepts offers /
-- relinquishes / withdraws; the network operator drives screening / assessment /
-- queueing / lapse, and the allocation committee issues offers / allocates /
-- rejects. actor_party (applicant/network/committee) records the grid function per
-- step, derived from the ACTION not the JWT role.

CREATE TABLE IF NOT EXISTS oe_grid_capacity_allocations (
  id                            TEXT PRIMARY KEY,
  allocation_number             TEXT UNIQUE NOT NULL,

  -- Provenance (e.g. a licence/registration or IRP allocation that triggered it)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (two-party split: applicant developer + network operator)
  applicant_party_id            TEXT NOT NULL,
  applicant_party_name          TEXT NOT NULL,
  operator_party_id             TEXT NOT NULL,
  operator_party_name           TEXT NOT NULL,

  -- Allocation identity
  capacity_tier                 TEXT NOT NULL CHECK (capacity_tier IN (
    'minor', 'small', 'medium', 'large', 'strategic'
  )),
  connection_type               TEXT NOT NULL,     -- generation / load / storage / hybrid
  technology                    TEXT,              -- solar_pv / wind / battery / gas / hydro / chp
  network_level                 TEXT,              -- transmission / distribution
  project_name                  TEXT NOT NULL,
  project_location              TEXT,              -- province / supply area
  requested_capacity_mw         REAL NOT NULL,     -- requested connection capacity (MW) — drives tier
  granted_capacity_mw           REAL,              -- firmly allocated capacity (MW)
  queue_rank                    INTEGER,           -- position in the capacity queue
  priority_date                 TEXT,              -- queue priority / ranking date
  substation                    TEXT,              -- connection substation / supply point
  supply_area                   TEXT,              -- network supply area / grid zone
  estimated_capex_zar_m         REAL,              -- estimated connection capex (R millions)
  gca_ref                       TEXT,              -- W28 Grid Connection Agreement ref (handoff)

  -- Refs
  application_ref               TEXT,
  screening_ref                 TEXT,
  info_request_ref              TEXT,
  assessment_ref                TEXT,              -- network / system-impact study ref
  queue_ref                     TEXT,              -- queue-position notice ref
  offer_ref                     TEXT,              -- capacity-allocation offer ref
  reservation_ref               TEXT,              -- capacity-reservation agreement ref
  allocation_ref                TEXT,              -- firm capacity-allocation certificate ref
  regulator_ref                 TEXT,              -- NERSA grid-access oversight ref

  -- Narrative
  application_basis             TEXT,
  screening_basis               TEXT,
  info_request_basis            TEXT,
  assessment_basis              TEXT,
  queue_basis                   TEXT,
  offer_basis                   TEXT,
  reservation_basis             TEXT,
  allocation_basis              TEXT,
  rejection_basis               TEXT,
  relinquish_basis              TEXT,
  reason_code                   TEXT,
  decision_notes                TEXT,

  info_request_round            INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'application_received','completeness_screening','information_requested',
    'capacity_assessment','queue_positioned','offer_issued','capacity_reserved',
    'capacity_allocated','rejected','lapsed','relinquished','withdrawn'
  )),
  application_received_at       TEXT NOT NULL,
  completeness_screening_at     TEXT,
  information_requested_at      TEXT,
  capacity_assessment_at        TEXT,
  queue_positioned_at           TEXT,
  offer_issued_at               TEXT,
  capacity_reserved_at          TEXT,
  capacity_allocated_at         TEXT,
  rejected_at                   TEXT,
  lapsed_at                     TEXT,
  relinquished_at               TEXT,
  withdrawn_at                  TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_gcap_status    ON oe_grid_capacity_allocations(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_gcap_tier      ON oe_grid_capacity_allocations(capacity_tier);
CREATE INDEX IF NOT EXISTS idx_oe_gcap_conn      ON oe_grid_capacity_allocations(connection_type);
CREATE INDEX IF NOT EXISTS idx_oe_gcap_applicant ON oe_grid_capacity_allocations(applicant_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_gcap_received  ON oe_grid_capacity_allocations(application_received_at);
CREATE INDEX IF NOT EXISTS idx_oe_gcap_sla       ON oe_grid_capacity_allocations(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_grid_capacity_allocations_events (
  id                 TEXT PRIMARY KEY,
  allocation_id      TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_gcap_events_alloc ON oe_grid_capacity_allocations_events(allocation_id);
CREATE INDEX IF NOT EXISTS idx_oe_gcap_events_type  ON oe_grid_capacity_allocations_events(event_type);
