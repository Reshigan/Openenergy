-- ═══════════════════════════════════════════════════════════════════════════
-- 013 Workflow Robustness: idempotency keys + cascade DLQ + advisory locks
-- ═══════════════════════════════════════════════════════════════════════════
-- Three concerns folded into one migration because they all support the same
-- goal (making every write survive partial failures) and they are referenced
-- together by the same endpoints:
--
--   1. idempotency_keys — replay-safe POST for orders/signatures/payments.
--      A client passes `Idempotency-Key: <uuid>` and the middleware replays
--      the stored response on repeat requests within the TTL window.
--
--   2. cascade_dlq — dead-letter queue for cascade handlers that fail after
--      the configured retry budget. Populated by fireCascade in
--      src/utils/cascade.ts. Surfaced on GET /support/cascade-dlq for the
--      support console, with requeue/resolve actions.
--
--   3. advisory_locks — lightweight named-row locks so we can serialise
--      contract signing (one signatory at a time) and order matching
--      (don't double-match the same two orders) without holding a long D1
--      transaction. Lock is released by DELETE or by expires_at passing.
-- ═══════════════════════════════════════════════════════════════════════════

-- IDEMPOTENCY KEYS -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,                  -- client-provided UUID (scoped below)
  scope TEXT NOT NULL,                   -- participant_id || tenant_id || 'anon'
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  request_hash TEXT NOT NULL,            -- sha256(method+path+body) for safety
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,           -- JSON blob as stored; replayed verbatim
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL               -- default +24h from write
);

CREATE INDEX IF NOT EXISTS idx_idem_expires ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idem_scope_created ON idempotency_keys(scope, created_at DESC);

-- CASCADE DEAD-LETTER QUEUE --------------------------------------------------
CREATE TABLE IF NOT EXISTS cascade_dlq (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,                   -- e.g. 'contract.signed'
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor_id TEXT,                         -- audit carry-through
  payload TEXT NOT NULL,                 -- JSON of the CascadeContext.data
  stage TEXT NOT NULL,                   -- 'audit' | 'notifications' | 'webhooks' | 'special'
  error_message TEXT NOT NULL,
  error_stack TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
  next_attempt_at TEXT,                  -- null if not scheduled for retry
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'abandoned')),
  resolved_at TEXT,
  resolved_by TEXT,                      -- participant_id (support operator) or 'auto_retry'
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_dlq_status_seen ON cascade_dlq(status, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_dlq_event ON cascade_dlq(event);
CREATE INDEX IF NOT EXISTS idx_dlq_next_attempt ON cascade_dlq(status, next_attempt_at);

-- ADVISORY LOCKS -------------------------------------------------------------
-- Not transactional — just a "first writer wins" guard with TTL.
CREATE TABLE IF NOT EXISTS advisory_locks (
  lock_key TEXT PRIMARY KEY,             -- 'contract_sign:<id>' or 'trade_match:<o1>:<o2>'
  holder_id TEXT NOT NULL,               -- participant_id of lock holder
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,              -- holder must heartbeat or release before this
  context TEXT                           -- optional JSON for debugging
);

CREATE INDEX IF NOT EXISTS idx_locks_expires ON advisory_locks(expires_at);
