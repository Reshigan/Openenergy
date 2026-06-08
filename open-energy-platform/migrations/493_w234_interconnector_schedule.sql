-- W234: Grid SAPP Interconnector Schedule & Cross-Border Export Nomination
-- SAPP Operating Guidelines §6 + NERSA Grid Code §E + SADC Energy Protocol
-- Day-ahead and intraday import/export scheduling on SAPP interconnectors

CREATE TABLE IF NOT EXISTS oe_interconnector_schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  -- Interconnector details
  interconnector_id TEXT NOT NULL,    -- e.g. SA-ZIM-275kV, SA-MOZ-400kV
  interconnector_name TEXT NOT NULL,
  neighbour_utility TEXT NOT NULL,    -- ZESA, EDM, BPPC, BPC, etc.
  neighbour_country TEXT NOT NULL CHECK (neighbour_country IN ('ZW','MZ','BW','NA','LS','SZ','ZM')),
  direction TEXT NOT NULL CHECK (direction IN ('export','import','wheeling')),
  -- Schedule tier drives SLA (INVERTED: larger MW = more operator scrutiny)
  capacity_tier TEXT NOT NULL CHECK (capacity_tier IN ('small','medium','large','strategic')),
  -- Quantities
  scheduled_mw REAL NOT NULL,
  delivery_start TEXT NOT NULL,       -- ISO datetime
  delivery_end TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('day_ahead','intraday','week_ahead','bilateral')),
  -- Commercial
  price_per_mwh REAL,
  currency TEXT NOT NULL DEFAULT 'USD',  -- SAPP trades in USD
  counterparty_ref TEXT,
  -- Chain
  chain_status TEXT NOT NULL DEFAULT 'schedule_draft' CHECK (chain_status IN (
    'schedule_draft','submitted_to_sapp','sapp_review','counter_schedule_received',
    'negotiation','agreed','operating','deviated','deviation_resolved',
    'completed','dispute','cancelled'
  )),
  reason_code TEXT,
  reason_detail TEXT,
  sla_deadline TEXT,
  -- Regulator / NERSA
  nersa_notified INTEGER NOT NULL DEFAULT 0,
  -- Audit
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ics_tenant ON oe_interconnector_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ics_status ON oe_interconnector_schedules(chain_status);
CREATE INDEX IF NOT EXISTS idx_ics_interconnector ON oe_interconnector_schedules(interconnector_id);
CREATE INDEX IF NOT EXISTS idx_ics_delivery ON oe_interconnector_schedules(delivery_start);
