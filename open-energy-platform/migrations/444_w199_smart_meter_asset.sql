-- Wave 199: Smart Meter Asset Commissioning & Data Quality Lifecycle
-- NRS 047 (Metering) · NERSA Metering Code · SANS 1475 · NRS 048
-- Tracks every smart meter from procurement through commissioning to
-- operational service or decommissioning.

CREATE TABLE IF NOT EXISTS oe_smart_meter_assets (
  id                    TEXT PRIMARY KEY,
  chain_status          TEXT NOT NULL DEFAULT 'ordered',
  sla_deadline          TEXT,
  sla_breached          INTEGER NOT NULL DEFAULT 0,
  regulator_notified    INTEGER NOT NULL DEFAULT 0,
  actor_id              TEXT,
  reason                TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),

  -- Asset identity
  meter_serial          TEXT NOT NULL,
  meter_class           TEXT NOT NULL DEFAULT 'post_paid'
                          CHECK (meter_class IN ('hv_bulk','bulk','prepaid','post_paid')),
  site_id               TEXT NOT NULL,
  installer_id          TEXT,
  owner_id              TEXT NOT NULL,

  -- Specifications
  make_model            TEXT,
  firmware_version      TEXT,
  communication_tech    TEXT CHECK (communication_tech IN ('gprs','plc','rf_mesh','fibre','nb_iot',NULL)),
  tamper_detection      INTEGER NOT NULL DEFAULT 1,

  -- Commissioning evidence
  fat_certificate_ref   TEXT,
  installation_photo_ref TEXT,
  commissioning_cert_ref TEXT,
  data_quality_score    REAL,

  -- Fault tracking
  fault_code            TEXT,
  fault_detected_at     TEXT,
  replacement_reason    TEXT,
  decommissioned_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_sma_status  ON oe_smart_meter_assets(chain_status);
CREATE INDEX IF NOT EXISTS idx_sma_site    ON oe_smart_meter_assets(site_id);
CREATE INDEX IF NOT EXISTS idx_sma_owner   ON oe_smart_meter_assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_sma_class   ON oe_smart_meter_assets(meter_class);
