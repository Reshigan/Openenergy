-- 526: v2 domain engine event log + supporting tables (D1 persistence adapter).
-- Backs src/v2/store/d1.ts (D1Store). All tables prefixed `v2_` to avoid any
-- collision with the legacy schema. The event log is append-only and
-- hash-chained; global_seq is the single total order the merkle seal folds over.
-- Column set transcribed 1:1 from the row types in src/v2/domain/types.ts.
-- Idempotent (CREATE ... IF NOT EXISTS throughout).

-- Hash-chained event log. PK(txn_id, seq) is the per-txn concurrency guard;
-- UNIQUE(event_id) and UNIQUE(idempotency_key) are the dedup guards (SQLite
-- treats multiple NULL idempotency_key rows as distinct, so a null key never
-- collides). global_seq is stamped at commit = (count of events) + 1 and carries
-- the total order; its UNIQUE index enforces gaplessness of the assignment.
CREATE TABLE IF NOT EXISTS v2_events (
  txn_id           TEXT    NOT NULL,
  seq              INTEGER NOT NULL,
  event_id         TEXT    NOT NULL,
  chain_key        TEXT    NOT NULL,
  type             TEXT    NOT NULL,
  from_state       TEXT,
  to_state         TEXT    NOT NULL,
  actor_id         TEXT    NOT NULL,
  actor_kind       TEXT    NOT NULL,
  on_behalf_of     TEXT,
  occurred_at      TEXT    NOT NULL,
  caused_by        TEXT,
  reason_code      TEXT,
  reason_text      TEXT,
  payload          TEXT    NOT NULL,
  payload_version  INTEGER NOT NULL,
  prev_hash        TEXT    NOT NULL,
  hash             TEXT    NOT NULL,
  idempotency_key  TEXT,
  global_seq       INTEGER NOT NULL,
  PRIMARY KEY (txn_id, seq),
  UNIQUE (event_id),
  UNIQUE (idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_events_global_seq ON v2_events(global_seq);
CREATE INDEX IF NOT EXISTS idx_v2_events_chain_key ON v2_events(chain_key);

-- Transaction projection of the log tail. seq == seq of last event (optimistic
-- concurrency token). human_ref is unique when present.
CREATE TABLE IF NOT EXISTS v2_txns (
  id          TEXT    PRIMARY KEY,
  chain_key   TEXT    NOT NULL,
  human_ref   TEXT,
  title       TEXT    NOT NULL,
  state       TEXT    NOT NULL,
  seq         INTEGER NOT NULL,
  visibility  TEXT    NOT NULL,
  fields      TEXT    NOT NULL,
  opened_at   TEXT    NOT NULL,
  closed_at   TEXT,
  UNIQUE (human_ref)
);

-- Party attachments. Insert-only: a party is ended by stamping until_event_id,
-- never DELETEd.
CREATE TABLE IF NOT EXISTS v2_parties (
  txn_id          TEXT NOT NULL,
  participant_id  TEXT NOT NULL,
  role_on_txn     TEXT NOT NULL,
  terms           TEXT NOT NULL,
  from_event_id   TEXT NOT NULL,
  until_event_id  TEXT
);
CREATE INDEX IF NOT EXISTS idx_v2_parties_txn_id ON v2_parties(txn_id);

-- Sealed merkle roots (nightly seal job is the only writer).
CREATE TABLE IF NOT EXISTS v2_merkle_roots (
  from_global_seq  INTEGER NOT NULL,
  to_global_seq    INTEGER NOT NULL,
  root             TEXT    NOT NULL,
  sealed_at        TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_v2_merkle_roots_to ON v2_merkle_roots(to_global_seq);

-- Effect outbox — the engine writes rows here, never runs effects inline.
CREATE TABLE IF NOT EXISTS v2_outbox (
  id          TEXT PRIMARY KEY,
  caused_by   TEXT NOT NULL,
  effect      TEXT NOT NULL,
  txn_id      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_v2_outbox_txn_id ON v2_outbox(txn_id);

-- Pending timers (SLA / time-bar). Re-armed by clearing then re-inserting per txn.
CREATE TABLE IF NOT EXISTS v2_timers (
  id       TEXT PRIMARY KEY,
  txn_id   TEXT NOT NULL,
  fire     TEXT NOT NULL,
  due_at   TEXT NOT NULL,
  key      TEXT NOT NULL,
  class    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_v2_timers_txn_id ON v2_timers(txn_id);
CREATE INDEX IF NOT EXISTS idx_v2_timers_due_at ON v2_timers(due_at);

-- Flat key/value reference store (compliance flags etc.).
-- ponytail: flat key→value, atEpochMs ignored; upgrade to a
-- (key, from_epoch_ms, value) log when a guard needs a point-in-time read.
CREATE TABLE IF NOT EXISTS v2_reference (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Append-only unique-claim ledger (double-spend prevention, e.g. carbon serial
-- ranges). The UNIQUE(key) index IS the enforcement: a concurrent double-claim
-- has its loser trip this atomically. A claimed key is permanent, never deleted.
CREATE TABLE IF NOT EXISTS v2_claims (
  key  TEXT NOT NULL,
  UNIQUE(key)
);
