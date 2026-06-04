-- Migration 382: SolaX inverter integration
--
-- Maps SolaX Cloud plants + inverter serial numbers to our om_sites.
-- businessType=4 (C&I) throughout — GoldRush sites are all C&I.
--
-- Auth flow: OAuth2 client_credentials → access_token (30-day TTL).
-- Credentials stored as Cloudflare Worker vars (SOLAX_CLIENT_ID / _SECRET).
-- Token cached in-memory per isolate; this table is the persistent station map.

CREATE TABLE IF NOT EXISTS solax_stations (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  site_id         TEXT REFERENCES om_sites(id) ON DELETE SET NULL,
  plant_id        TEXT NOT NULL,        -- SolaX plantId
  plant_name      TEXT,
  device_sn       TEXT NOT NULL,        -- Inverter SN (primary key on SolaX side)
  device_type     INTEGER NOT NULL DEFAULT 1,   -- 1=Inverter, 100=EMS
  business_type   INTEGER NOT NULL DEFAULT 4,   -- 4=C&I
  rated_power_kw  REAL,
  online_status   INTEGER DEFAULT 0,    -- 0=Offline, 1=Online
  last_sync_at    TEXT,
  last_error      TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK(status IN ('active','inactive','error')),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_solax_stations_sn
  ON solax_stations(participant_id, device_sn);

CREATE INDEX IF NOT EXISTS idx_solax_stations_site
  ON solax_stations(site_id);

CREATE INDEX IF NOT EXISTS idx_solax_stations_plant
  ON solax_stations(plant_id);
