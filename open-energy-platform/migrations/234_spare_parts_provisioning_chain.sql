-- Wave 72 — OEM-Support Spare-Parts Provisioning & Replenishment chain.
-- The SERVICE-PARTS-PLANNING brain of the OEM-Support profile: puts the right
-- spare in the right warehouse BEFORE the asset needs it, then runs the
-- requisition → purchase → receive → stock → issue lifecycle for one line. It is
-- the materials backbone under every other support chain — a work order (W16)
-- consumes a part, an RMA (W15) returns one, a warranty-recovery (W63) chases its
-- cost — but none plan or replenish inventory; W72 is that missing layer.
--
-- The DISTINCTIVE move (beat best-in-class — Syncron / Baxter / SAP SPP /
-- Servigistics): demand is PREDICTIVE. The W71 predictive-asset-health engine
-- produces RUL + ranked failure modes per asset; a line is raised PRE-FAILURE off
-- that signal (demand_source = 'predictive_rul') so the part is pre-positioned
-- before the breakdown. Criticality-tiered fill-rate SLAs with auto-expedite, a
-- reverse-logistics incoming-QA gate, and a quantified stockout-avoidance /
-- working-capital ledger complete the differentiation.
--
-- Standards: SANS/IEC 62402 obsolescence + VED criticality; OEM spares-
-- availability contract (fill rate + lead time per band); NERSA Grid Code /
-- security-of-supply (a backorder on a VITAL part for grid-connected generation
-- is a reliability concern, reportable when catastrophic or vital-on-high).
--
-- 12-state P6 lifecycle:
--   demand_identified → requisition_raised → requisition_approved → po_issued →
--     in_transit → received → stocked → reserved → issued        (happy)
--   backorder: po_issued → backordered → in_transit (expedite) | cancelled
--   QA gate:   received → stocked (pass) | received → returned (reject)
--   cancel:    any pre-receipt planning/ordering state → cancelled
--
-- Tiers — by stockout_impact_zar (downtime cost × outage hours waiting), VITAL
--   floor at critical: routine <50k / standard <250k / important <1m /
--   critical <5m / catastrophic >=5m. HIGH = {critical, catastrophic}.
--
-- URGENT SLA: more critical line = TIGHTER window at every active state.
--
-- Reportability (the W72 SIGNATURE is AVAILABILITY-RISK-driven):
--   flag_backorder crosses when (vital AND HIGH) OR catastrophic;
--   cancel_provisioning crosses when (vital AND HIGH); sla_breached crosses HIGH.
--
-- Single-party write {admin, support} (same as W41/W47/W55/W63). actor_party
-- (planner / buyer / warehouse / supplier) records the functional owner per step,
-- not the JWT role.

CREATE TABLE IF NOT EXISTS oe_spare_parts_provisioning (
  id                            TEXT PRIMARY KEY,
  line_number                   TEXT UNIQUE NOT NULL,

  -- Provenance (the W71 prognostic / W16 WO / W15 RMA that generated the demand)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,
  demand_source                 TEXT NOT NULL DEFAULT 'manual' CHECK (demand_source IN (
    'predictive_rul','work_order','reorder_point','manual','rma_replacement'
  )),

  -- Part + asset
  part_number                   TEXT NOT NULL,
  part_description              TEXT,
  oem_name                      TEXT,
  asset_name                    TEXT,                  -- the plant / site served
  site_name                     TEXT,
  warehouse                     TEXT,                  -- stocking location
  supplier_party_id             TEXT,
  supplier_party_name           TEXT,
  criticality                   TEXT NOT NULL CHECK (criticality IN (
    'vital','essential','desirable'
  )),

  -- Quantities + cost
  qty_required                  INTEGER NOT NULL DEFAULT 1,
  qty_ordered                   INTEGER,
  qty_received                  INTEGER,
  qty_on_hand                   INTEGER NOT NULL DEFAULT 0,
  unit_cost_zar                 REAL,

  -- Demand & inventory economics
  daily_demand                  REAL DEFAULT 0,
  demand_std_dev                REAL DEFAULT 0,
  lead_time_days                INTEGER NOT NULL DEFAULT 0,
  service_z_factor              REAL DEFAULT 1.65,     -- ~95% service level
  reorder_point                 INTEGER DEFAULT 0,
  safety_stock                  INTEGER DEFAULT 0,
  rul_days                      INTEGER,               -- W71 remaining-useful-life signal
  predictive_lead_days          INTEGER,               -- RUL − lead time (positive = staged in time)

  -- Value ledger
  downtime_cost_per_hour_zar    REAL DEFAULT 0,
  stockout_impact_zar           REAL NOT NULL DEFAULT 0, -- drives the tier
  stockout_avoidance_zar        REAL DEFAULT 0,
  carried_inventory_zar         REAL DEFAULT 0,
  working_capital_efficiency    REAL DEFAULT 0,
  fill_rate                     REAL DEFAULT 0,        -- 0..1
  provisioning_tier             TEXT NOT NULL CHECK (provisioning_tier IN (
    'routine','standard','important','critical','catastrophic'
  )),

  -- Gates
  requisition_raised_flag       INTEGER NOT NULL DEFAULT 0,
  approved_flag                 INTEGER NOT NULL DEFAULT 0,
  po_issued_flag                INTEGER NOT NULL DEFAULT 0,
  backordered_flag              INTEGER NOT NULL DEFAULT 0,
  shipped_flag                  INTEGER NOT NULL DEFAULT 0,
  received_flag                 INTEGER NOT NULL DEFAULT 0,
  inspected_flag                INTEGER NOT NULL DEFAULT 0,
  reserved_flag                 INTEGER NOT NULL DEFAULT 0,
  issued_flag                   INTEGER NOT NULL DEFAULT 0,

  -- Refs
  requisition_ref               TEXT,
  approval_ref                  TEXT,
  po_ref                        TEXT,
  backorder_ref                 TEXT,
  expedite_ref                  TEXT,
  shipment_ref                  TEXT,
  receipt_ref                   TEXT,
  inspection_ref                TEXT,
  rejection_ref                 TEXT,
  reservation_ref               TEXT,
  issue_ref                     TEXT,
  cancellation_ref              TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  demand_basis                  TEXT,
  requisition_basis             TEXT,
  approval_basis                TEXT,
  po_basis                      TEXT,
  backorder_basis               TEXT,
  expedite_basis                TEXT,
  shipment_basis                TEXT,
  inspection_basis              TEXT,
  rejection_basis               TEXT,
  reservation_basis             TEXT,
  issue_basis                   TEXT,
  cancellation_basis            TEXT,
  reason_code                   TEXT,
  notes                         TEXT,

  reserved_for_wo               TEXT,                  -- the W16 work order it is reserved against
  backorder_round               INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'demand_identified','requisition_raised','requisition_approved','po_issued',
    'backordered','in_transit','received','stocked','reserved','issued',
    'returned','cancelled'
  )),
  demand_identified_at          TEXT NOT NULL,
  requisition_raised_at         TEXT,
  requisition_approved_at       TEXT,
  po_issued_at                  TEXT,
  backordered_at                TEXT,
  in_transit_at                 TEXT,
  received_at                   TEXT,
  stocked_at                    TEXT,
  reserved_at                   TEXT,
  issued_at                     TEXT,
  returned_at                   TEXT,
  cancelled_at                  TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_spp_status      ON oe_spare_parts_provisioning(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_spp_tier        ON oe_spare_parts_provisioning(provisioning_tier);
CREATE INDEX IF NOT EXISTS idx_oe_spp_criticality ON oe_spare_parts_provisioning(criticality);
CREATE INDEX IF NOT EXISTS idx_oe_spp_part        ON oe_spare_parts_provisioning(part_number);
CREATE INDEX IF NOT EXISTS idx_oe_spp_source      ON oe_spare_parts_provisioning(demand_source);
CREATE INDEX IF NOT EXISTS idx_oe_spp_demand      ON oe_spare_parts_provisioning(demand_identified_at);
CREATE INDEX IF NOT EXISTS idx_oe_spp_sla         ON oe_spare_parts_provisioning(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_spare_parts_provisioning_events (
  id                 TEXT PRIMARY KEY,
  provisioning_id    TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_spp_events_p    ON oe_spare_parts_provisioning_events(provisioning_id);
CREATE INDEX IF NOT EXISTS idx_oe_spp_events_type ON oe_spare_parts_provisioning_events(event_type);
