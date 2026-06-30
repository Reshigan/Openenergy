-- 525: journey feature governance + per-action charge (admin-crafted).
-- Per (role, feature_key): an availability status and an optional charge. Only
-- admin OVERRIDES are stored; absent rows fall back to the derived default
-- (a reachable feature = 'optional', otherwise 'unavailable'), so the cockpit
-- works before any curation. `charge_zar` + `charge_event` wire an action to the
-- fee engine (the action's cascade bills the configured amount). Idempotent.
CREATE TABLE IF NOT EXISTS journey_feature_config (
  id           TEXT PRIMARY KEY,
  role         TEXT NOT NULL,
  feature_key  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'optional' CHECK (status IN ('required','optional','unavailable')),
  charge_zar   REAL,
  charge_event TEXT,
  updated_by   TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (role, feature_key)
);
CREATE INDEX IF NOT EXISTS idx_journey_feature_config_role ON journey_feature_config(role);
