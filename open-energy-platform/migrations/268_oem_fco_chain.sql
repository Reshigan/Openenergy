-- Wave 89 — OEM-Support Field Change Order / Engineering Change Notice
-- Campaign Management (P6).
--
-- OEM-pushed, fleet-wide retrofit campaigns: Tesla Megapack module replacements,
-- Vestas gearbox upgrades, GE blade-bond inspection bulletins, Sungrow inverter
-- capacitor service bulletins, SolarEdge optimizer recalls, SMA firmware-coupled
-- hardware revisions. Distinct from W47 (customer-initiated RFC), W55 (firmware
-- only), W15 (single-unit RMA), W63 (commercial warranty recovery).
--
-- 12-state P6 lifecycle:
--   draft -> under_review -> approved -> population_identified
--     -> notification_sent -> acknowledged -> scheduling -> in_progress
--     -> completed (terminal)
--   in_progress -> suspend_campaign -> suspended; suspended -> resume
--     -> in_progress
--   draft / under_review -> withdraw_campaign -> withdrawn (terminal)
--   approved / population_identified / notification_sent / acknowledged
--     / scheduling / in_progress / suspended -> cancel_campaign -> cancelled
--     (terminal)
--
-- Tier RE-DERIVED on every transition from change_class:
--   mandatory_safety       (highest — safety-of-life / regulator-driven)
--   mandatory_performance  (warranty / contractual performance breach)
--   recommended            (performance / reliability uplift)
--   optional               (informational only)
--
-- URGENT SLA — mandatory_safety = tightest. Family of W34/W50/W51/W64/W67/W75/
-- W84/W85/W86/W87/W88 URGENT band.
--
-- FLEET-PROPAGATION SIGNATURE (W89 hard line):
--   approve_campaign  EVERY tier when mandatory_safety (NRCS + SANS).
--   send_notification EVERY tier when affected_capacity_mw >= 50 MW
--                     (NERSA Grid Code grid-significant); mandatory tiers
--                     otherwise.
--   complete_campaign EVERY tier when mandatory_safety.
--   suspend_campaign  EVERY tier when mandatory_safety.
--   cancel_campaign   EVERY tier always (post-approval cancellation hard line).
--   withdraw_campaign EVERY tier when mandatory_safety.
--   sla_breached      mandatory_safety + mandatory_performance only.
--
-- Write {admin, support}. actor_party tags whether the step represents
-- oem / operator / owner / regulator for attribution only.

CREATE TABLE IF NOT EXISTS oe_oem_field_change_orders (
  id                              TEXT PRIMARY KEY,
  campaign_number                 TEXT UNIQUE NOT NULL,

  source_event                    TEXT,
  source_entity_type              TEXT,
  source_entity_id                TEXT,
  source_wave                     TEXT,

  -- OEM + scope identity
  oem_id                          TEXT NOT NULL,
  oem_name                        TEXT NOT NULL,
  product_family                  TEXT NOT NULL,
  product_model                   TEXT NOT NULL,
  serial_range_start              TEXT,
  serial_range_end                TEXT,
  firmware_baseline               TEXT,

  -- Campaign metadata
  campaign_title                  TEXT NOT NULL,
  change_class                    TEXT NOT NULL CHECK (change_class IN (
    'mandatory_safety','mandatory_performance','recommended','optional'
  )),
  technical_summary               TEXT,
  regulatory_reference            TEXT,
  ecrb_decision_ref               TEXT,
  reason_code                     TEXT,

  -- Fleet population
  affected_units                  INTEGER NOT NULL DEFAULT 0,
  affected_capacity_mw            REAL NOT NULL DEFAULT 0,
  affected_owner_count            INTEGER NOT NULL DEFAULT 0,
  affected_site_count             INTEGER NOT NULL DEFAULT 0,
  acknowledged_units              INTEGER NOT NULL DEFAULT 0,
  scheduled_units                 INTEGER NOT NULL DEFAULT 0,
  completed_units                 INTEGER NOT NULL DEFAULT 0,
  warranty_covered_units          INTEGER NOT NULL DEFAULT 0,

  -- Economics
  retrofit_cost_per_unit_zar      REAL NOT NULL DEFAULT 0,
  total_campaign_capex_zar        REAL NOT NULL DEFAULT 0,
  warranty_coverage_pct           REAL NOT NULL DEFAULT 0,
  fleet_energy_at_risk_mw         REAL NOT NULL DEFAULT 0,
  mean_time_to_retrofit_hours     REAL NOT NULL DEFAULT 0,
  predicted_full_coverage_days    REAL,
  judicial_review_risk            INTEGER NOT NULL DEFAULT 0,

  -- Tier (RE-DERIVED)
  campaign_tier                   TEXT NOT NULL CHECK (campaign_tier IN (
    'mandatory_safety','mandatory_performance','recommended','optional'
  )),

  -- Lifecycle flags
  submitted_flag                  INTEGER NOT NULL DEFAULT 0,
  approved_flag                   INTEGER NOT NULL DEFAULT 0,
  population_flag                 INTEGER NOT NULL DEFAULT 0,
  notification_flag               INTEGER NOT NULL DEFAULT 0,
  acknowledged_flag               INTEGER NOT NULL DEFAULT 0,
  scheduling_flag                 INTEGER NOT NULL DEFAULT 0,
  in_progress_flag                INTEGER NOT NULL DEFAULT 0,
  completed_flag                  INTEGER NOT NULL DEFAULT 0,
  suspended_flag                  INTEGER NOT NULL DEFAULT 0,
  cancelled_flag                  INTEGER NOT NULL DEFAULT 0,
  withdrawn_flag                  INTEGER NOT NULL DEFAULT 0,

  -- Refs
  last_action_ref                 TEXT,
  regulator_ref                   TEXT,
  campaign_summary                TEXT,

  -- State machine
  chain_status                    TEXT NOT NULL CHECK (chain_status IN (
    'draft','under_review','approved','population_identified',
    'notification_sent','acknowledged','scheduling','in_progress',
    'completed','suspended','cancelled','withdrawn'
  )),
  draft_at                        TEXT NOT NULL,
  under_review_at                 TEXT,
  approved_at                     TEXT,
  population_identified_at        TEXT,
  notification_sent_at            TEXT,
  acknowledged_at                 TEXT,
  scheduling_at                   TEXT,
  in_progress_at                  TEXT,
  completed_at                    TEXT,
  suspended_at                    TEXT,
  cancelled_at                    TEXT,
  withdrawn_at                    TEXT,

  -- Audit / SLA
  is_reportable                   INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                 TEXT,
  last_sla_breach_at              TEXT,
  escalation_level                INTEGER NOT NULL DEFAULT 0,

  created_by                      TEXT NOT NULL,
  created_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_fco_status        ON oe_oem_field_change_orders(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_fco_tier          ON oe_oem_field_change_orders(campaign_tier);
CREATE INDEX IF NOT EXISTS idx_oe_fco_oem           ON oe_oem_field_change_orders(oem_id);
CREATE INDEX IF NOT EXISTS idx_oe_fco_family        ON oe_oem_field_change_orders(product_family);
CREATE INDEX IF NOT EXISTS idx_oe_fco_model         ON oe_oem_field_change_orders(product_model);
CREATE INDEX IF NOT EXISTS idx_oe_fco_class         ON oe_oem_field_change_orders(change_class);
CREATE INDEX IF NOT EXISTS idx_oe_fco_reportable    ON oe_oem_field_change_orders(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_fco_sla           ON oe_oem_field_change_orders(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_oem_field_change_order_events (
  id                 TEXT PRIMARY KEY,
  campaign_id        TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_fco_events_c    ON oe_oem_field_change_order_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_oe_fco_events_type ON oe_oem_field_change_order_events(event_type);
