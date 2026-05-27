-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 15 — OEM warranty / RMA claim chain.
--
-- New regulator-grade lifecycle for OEM warranty/RMA claims against
-- assets under O&M (om_devices). Severity-tiered SLA windows per stage
-- with audit chain table; safety severity crosses into regulator inbox
-- on dispute, denial, or breach.
--
-- States (10): opened → triaged → submitted → acknowledged → under_review
--                                  ↓                            ↓
--                                approved (→ fulfilled → closed)
--                                  ↓
--                                denied → disputed → {approved | closed}
--                                  or denied → closed (accept)
--
-- Per-severity SLA windows (minutes):
--   stage      safety   performance   cosmetic
--   triage      240       1440         4320     (4h / 1d / 3d)
--   submit      720       4320        14400     (12h / 3d / 10d)
--   ack         240       1440        10080     (4h / 1d / 7d)
--   review     1440      10080        43200     (1d / 7d / 30d)
--   approve    4320      43200       129600     (3d / 30d / 90d)
--   fulfill   20160      86400       259200     (14d / 60d / 180d)
--
-- CREATE TABLE IF NOT EXISTS — idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_warranty_claims (
  id TEXT PRIMARY KEY,
  claim_number TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  asset_id TEXT,             -- om_devices.id when traceable
  asset_label TEXT NOT NULL, -- e.g. "Sungrow SG250HX serial SGN-1234"
  oem_id TEXT,               -- vendor/OEM participant id when known
  oem_name TEXT NOT NULL,
  site_id TEXT,              -- om_sites.id
  reported_by TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('safety','performance','cosmetic')),
  fault_code TEXT,
  failure_mode TEXT,
  warranty_ref TEXT,         -- OEM warranty contract reference
  rma_number TEXT,           -- OEM-issued RMA after acknowledge
  chain_status TEXT NOT NULL DEFAULT 'opened'
    CHECK (chain_status IN (
      'opened','triaged','submitted','acknowledged','under_review',
      'approved','denied','disputed','fulfilled','closed'
    )),
  -- Stage timestamps
  triaged_at TEXT,
  submitted_at TEXT,
  acknowledged_at TEXT,
  review_started_at TEXT,
  approved_at TEXT,
  denied_at TEXT,
  disputed_at TEXT,
  fulfilled_at TEXT,
  closed_at TEXT,
  -- Actor refs
  triaged_by TEXT,
  submitted_by TEXT,
  approved_by TEXT,
  denied_by TEXT,
  closed_by TEXT,
  -- SLA bookkeeping
  next_sla_due_at TEXT,
  next_sla_window TEXT
    CHECK (next_sla_window IS NULL OR next_sla_window IN ('triage','submit','ack','review','approve','fulfill')),
  last_sla_breach_at TEXT,
  sla_breach_count INTEGER NOT NULL DEFAULT 0,
  -- Resolution
  resolution TEXT,
  denial_reason TEXT,
  dispute_reason TEXT,
  recovery_zar REAL,         -- estimated cost recovery from OEM
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_warranty_claims_chain
  ON oe_warranty_claims (chain_status, severity, created_at);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_sla
  ON oe_warranty_claims (next_sla_due_at) WHERE next_sla_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranty_claims_oem
  ON oe_warranty_claims (oem_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_site
  ON oe_warranty_claims (site_id);

-- Audit chain — append-only per-transition log.
CREATE TABLE IF NOT EXISTS oe_warranty_claim_events (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'opened','triaged','submitted','acknowledged','review_started',
    'approved','denied','disputed','fulfilled','closed',
    'sla_breached','note'
  )),
  from_status TEXT,
  to_status TEXT,
  sla_window TEXT,
  actor_id TEXT,
  notes TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_warranty_claim_evt_claim
  ON oe_warranty_claim_events (claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranty_claim_evt_type
  ON oe_warranty_claim_events (event_type);
