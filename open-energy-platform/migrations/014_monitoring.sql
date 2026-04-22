-- ═══════════════════════════════════════════════════════════════════════════
-- 014 — Monitoring & Error Logs (PR-Prod-5)
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables supporting structured error collection for operators.
--   • error_log     — every 5xx + unhandled client-side exception
--   • request_stats — rolling 15-minute bucket counts/latency per route
--                     (used by /admin/monitoring dashboard).
-- Cloudflare Workers stdout JSON lines are still the source of truth for
-- high-volume traffic; these tables are for operator review + Support console.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS error_log (
  id              TEXT PRIMARY KEY,
  req_id          TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('server', 'client')),
  severity        TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'error', 'fatal')) DEFAULT 'error',
  route           TEXT,
  method          TEXT,
  status          INTEGER,
  participant_id  TEXT,
  tenant_id       TEXT,
  error_name      TEXT,
  error_message   TEXT,
  error_stack     TEXT,
  user_agent      TEXT,
  ip              TEXT,
  url             TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_error_log_created_at   ON error_log(created_at);
CREATE INDEX IF NOT EXISTS idx_error_log_participant  ON error_log(participant_id);
CREATE INDEX IF NOT EXISTS idx_error_log_source       ON error_log(source);
CREATE INDEX IF NOT EXISTS idx_error_log_route        ON error_log(route);

CREATE TABLE IF NOT EXISTS request_stats (
  id              TEXT PRIMARY KEY,
  bucket_start    TEXT NOT NULL,   -- ISO, floored to 15-minute boundaries
  route           TEXT NOT NULL,
  method          TEXT NOT NULL,
  status_class    TEXT NOT NULL,   -- '2xx' | '3xx' | '4xx' | '5xx'
  count           INTEGER NOT NULL DEFAULT 0,
  latency_ms_sum  INTEGER NOT NULL DEFAULT 0,
  latency_ms_max  INTEGER NOT NULL DEFAULT 0,
  slow_count      INTEGER NOT NULL DEFAULT 0  -- latency > 1000ms
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_request_stats_bucket
  ON request_stats(bucket_start, route, method, status_class);
CREATE INDEX IF NOT EXISTS idx_request_stats_bucket_start
  ON request_stats(bucket_start);
