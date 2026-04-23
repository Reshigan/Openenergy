-- 031_siem_forwarders.sql
-- External SIEM / audit-log forwarders. Lets operators send cascade audit
-- events, PII access, and cron failures to an external SIEM (Splunk HEC,
-- Elastic, Datadog, Sumo Logic, generic HTTPS). Credentials live in KV;
-- this table tracks WHICH endpoints are configured, WHAT they subscribe
-- to, and the last delivery outcome.

CREATE TABLE IF NOT EXISTS siem_forwarders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                          -- human label
  vendor TEXT NOT NULL CHECK (vendor IN (
    'splunk_hec','elastic','datadog','sumo','generic_https'
  )),
  endpoint_url TEXT NOT NULL,
  secret_kv_key TEXT,                          -- KV key for HEC token / API key
  subscribe_json TEXT NOT NULL,                -- JSON: {"events":["audit","pii","cron_failure","cascade_dlq"], "min_severity":"info"}
  enabled BOOLEAN DEFAULT 1,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  rows_forwarded_total INTEGER DEFAULT 0,
  created_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_siem_enabled ON siem_forwarders(enabled);

-- Cursor per forwarder so we can pick up where we left off.
CREATE TABLE IF NOT EXISTS siem_forwarder_cursors (
  forwarder_id TEXT NOT NULL REFERENCES siem_forwarders(id) ON DELETE CASCADE,
  stream TEXT NOT NULL,                        -- 'audit' | 'pii' | 'cascade_dlq' | 'cron_failure'
  last_cursor TEXT,                            -- ISO timestamp OR row id of last forwarded event
  last_forwarded_count INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (forwarder_id, stream)
);

-- Delivery log so operators can audit "did the SIEM receive row X?".
-- Small, rolling — keep only the last 30 days.
CREATE TABLE IF NOT EXISTS siem_delivery_log (
  id TEXT PRIMARY KEY,
  forwarder_id TEXT NOT NULL REFERENCES siem_forwarders(id),
  stream TEXT NOT NULL,
  batch_size INTEGER,
  http_status INTEGER,
  response_body_snippet TEXT,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_siem_delivery_forwarder ON siem_delivery_log(forwarder_id, attempted_at DESC);
