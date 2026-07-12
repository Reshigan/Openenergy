// D1 (Cloudflare SQLite) Store — the P1 persistence adapter. Behaviourally
// identical to MemoryStore (src/v2/store/memory.ts): validate-BEFORE-mutate
// atomicity, the same ConstraintViolation names thrown in the same situations,
// and global_seq = (count of events so far) + 1 assigned at commit.
//
// commit() runs its constraint checks as SELECTs first, then applies every
// write in a single db.batch([...]) so the mutation is all-or-nothing. On a
// single-Worker request path the D1 primary serialises writes, so the pre-check
// is the real guard; the conditional UPDATE row-count and the UNIQUE/PK
// error-message mapping are the backstops for a genuine race.

import type {
  CommitBatch,
  EventRow,
  ExportQuery,
  Json,
  MerkleRootRow,
  PartyRow,
  Store,
  TxnBundle,
  TxnRow,
} from '../domain/types';
import { ConstraintViolation } from '../domain/types';
import type { D1Database } from '@cloudflare/workers-types';

// Row shapes as they come back from SQLite (JSON columns are TEXT).
interface EventDbRow {
  txn_id: string;
  seq: number;
  event_id: string;
  chain_key: string;
  type: string;
  from_state: string | null;
  to_state: string;
  actor_id: string;
  actor_kind: string;
  on_behalf_of: string | null;
  occurred_at: string;
  caused_by: string | null;
  reason_code: string | null;
  reason_text: string | null;
  payload: string;
  payload_version: number;
  prev_hash: string;
  hash: string;
  idempotency_key: string | null;
  global_seq: number;
}

interface TxnDbRow {
  id: string;
  chain_key: string;
  human_ref: string | null;
  title: string;
  state: string;
  seq: number;
  visibility: string;
  fields: string;
  opened_at: string;
  closed_at: string | null;
}

interface PartyDbRow {
  txn_id: string;
  participant_id: string;
  role_on_txn: string;
  terms: string;
  from_event_id: string;
  until_event_id: string | null;
}

function toEventRow(r: EventDbRow): EventRow {
  return {
    txn_id: r.txn_id,
    seq: r.seq,
    event_id: r.event_id,
    chain_key: r.chain_key,
    type: r.type,
    from_state: r.from_state,
    to_state: r.to_state,
    actor_id: r.actor_id,
    actor_kind: r.actor_kind as EventRow['actor_kind'],
    on_behalf_of: r.on_behalf_of,
    occurred_at: r.occurred_at,
    caused_by: r.caused_by,
    reason_code: r.reason_code,
    reason_text: r.reason_text,
    payload: JSON.parse(r.payload) as Json,
    payload_version: r.payload_version,
    prev_hash: r.prev_hash,
    hash: r.hash,
    idempotency_key: r.idempotency_key,
    global_seq: r.global_seq,
  };
}

function toTxnRow(r: TxnDbRow): TxnRow {
  return {
    id: r.id,
    chain_key: r.chain_key,
    human_ref: r.human_ref ?? '',
    title: r.title,
    state: r.state,
    seq: r.seq,
    visibility: r.visibility as TxnRow['visibility'],
    fields: JSON.parse(r.fields) as Record<string, Json>,
    opened_at: r.opened_at,
    closed_at: r.closed_at,
  };
}

function toPartyRow(r: PartyDbRow): PartyRow {
  return {
    txn_id: r.txn_id,
    participant_id: r.participant_id,
    role_on_txn: r.role_on_txn,
    terms: JSON.parse(r.terms) as Json,
    from_event_id: r.from_event_id,
    until_event_id: r.until_event_id,
  };
}

// Map a UNIQUE/PK error that slipped past the pre-check (a real write race) to
// the matching ConstraintViolation by inspecting the SQLite error text. Mirrors
// the settlement-fees.ts UNIQUE-absorb style; this is the backstop, not the
// primary guard.
function mapUniqueError(err: unknown): ConstraintViolation | null {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (!msg.includes('unique') && !msg.includes('primary key')) return null;
  if (msg.includes('v2_events.event_id')) return new ConstraintViolation('event_id');
  if (msg.includes('v2_events.idempotency_key')) return new ConstraintViolation('idempotency_key');
  if (msg.includes('v2_events.txn_id') || msg.includes('v2_events.seq')) {
    return new ConstraintViolation('event_pk');
  }
  if (msg.includes('v2_txns.human_ref')) return new ConstraintViolation('human_ref');
  if (msg.includes('v2_claims')) return new ConstraintViolation('unique_claim');
  // idx_v2_events_global_seq is UNIQUE: a write race can have two commits compute
  // the same (count)+1. Loser trips this — map to a retriable violation so the
  // engine recomputes a fresh COUNT. SQLite names the index, not the column.
  if (msg.includes('global_seq') || msg.includes('idx_v2_events_global_seq')) {
    return new ConstraintViolation('global_seq');
  }
  return null;
}

export class D1Store implements Store {
  // Fixed contract: another workstream constructs `new D1Store(env.DB)`.
  constructor(private db: D1Database) {}

  async getTxn(id: string): Promise<TxnBundle | null> {
    const txnRow = await this.db
      .prepare(`SELECT * FROM v2_txns WHERE id = ?`)
      .bind(id)
      .first<TxnDbRow>();
    if (!txnRow) return null;
    const events = await this.db
      .prepare(`SELECT * FROM v2_events WHERE txn_id = ? ORDER BY seq ASC`)
      .bind(id)
      .all<EventDbRow>();
    const parties = await this.db
      .prepare(`SELECT * FROM v2_parties WHERE txn_id = ?`)
      .bind(id)
      .all<PartyDbRow>();
    return {
      txn: toTxnRow(txnRow),
      parties: (parties.results ?? []).map(toPartyRow),
      events: (events.results ?? []).map(toEventRow),
    };
  }

  async findEventByIdempotencyKey(key: string): Promise<EventRow | null> {
    const row = await this.db
      .prepare(`SELECT * FROM v2_events WHERE idempotency_key = ?`)
      .bind(key)
      .first<EventDbRow>();
    return row ? toEventRow(row) : null;
  }

  // ponytail: flat key→value read, atEpochMs ignored (matches MemoryStore).
  // Upgrade to a point-in-time read when a guard needs one.
  async reference(key: string, _atEpochMs: number): Promise<Json | null> {
    const row = await this.db
      .prepare(`SELECT value FROM v2_reference WHERE key = ?`)
      .bind(key)
      .first<{ value: string }>();
    return row ? (JSON.parse(row.value) as Json) : null;
  }

  // Test/seed-only writer, matching MemoryStore.setReference. Not on the Store
  // interface — the engine reads references, it never writes them.
  async setReference(key: string, value: Json): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO v2_reference (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .bind(key, JSON.stringify(value))
      .run();
  }

  async commit(batch: CommitBatch): Promise<{ global_seq: number }> {
    const ev = batch.insertEvent;

    // --- validate all constraints first; throw before any mutation ---
    const dup = await this.db
      .prepare(`SELECT 1 FROM v2_events WHERE event_id = ?`)
      .bind(ev.event_id)
      .first();
    if (dup) throw new ConstraintViolation('event_id');

    if (ev.idempotency_key !== null) {
      const dupIdem = await this.db
        .prepare(`SELECT 1 FROM v2_events WHERE idempotency_key = ?`)
        .bind(ev.idempotency_key)
        .first();
      if (dupIdem) throw new ConstraintViolation('idempotency_key');
    }

    const dupPk = await this.db
      .prepare(`SELECT 1 FROM v2_events WHERE txn_id = ? AND seq = ?`)
      .bind(ev.txn_id, ev.seq)
      .first();
    if (dupPk) throw new ConstraintViolation('event_pk');

    if (batch.insertTxn?.human_ref) {
      const dupRef = await this.db
        .prepare(`SELECT 1 FROM v2_txns WHERE human_ref = ?`)
        .bind(batch.insertTxn.human_ref)
        .first();
      if (dupRef) throw new ConstraintViolation('human_ref');
    }

    if (batch.updateTxn) {
      // Distinguish missing txn from stale seq exactly like MemoryStore: both
      // throw txn_seq, but only after a real read (never silently no-op).
      const cur = await this.db
        .prepare(`SELECT seq FROM v2_txns WHERE id = ?`)
        .bind(batch.updateTxn.id)
        .first<{ seq: number }>();
      if (!cur || cur.seq !== batch.updateTxn.expectSeq) {
        throw new ConstraintViolation('txn_seq');
      }
    }

    if (batch.claims) {
      for (const k of batch.claims) {
        const dupClaim = await this.db
          .prepare(`SELECT 1 FROM v2_claims WHERE key = ?`)
          .bind(k)
          .first();
        if (dupClaim) throw new ConstraintViolation('unique_claim');
      }
    }

    // --- assign global_seq = (count of events so far) + 1, like MemoryStore ---
    const countRow = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM v2_events`)
      .first<{ n: number }>();
    const global_seq = (countRow?.n ?? 0) + 1;

    // --- build one atomic batch: every row lands or none does ---
    const stmts: ReturnType<D1Database['prepare']>[] = [];

    stmts.push(
      this.db
        .prepare(
          `INSERT INTO v2_events (
             txn_id, seq, event_id, chain_key, type, from_state, to_state,
             actor_id, actor_kind, on_behalf_of, occurred_at, caused_by,
             reason_code, reason_text, payload, payload_version, prev_hash,
             hash, idempotency_key, global_seq
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          ev.txn_id,
          ev.seq,
          ev.event_id,
          ev.chain_key,
          ev.type,
          ev.from_state,
          ev.to_state,
          ev.actor_id,
          ev.actor_kind,
          ev.on_behalf_of,
          ev.occurred_at,
          ev.caused_by,
          ev.reason_code,
          ev.reason_text,
          JSON.stringify(ev.payload),
          ev.payload_version,
          ev.prev_hash,
          ev.hash,
          ev.idempotency_key,
          global_seq,
        ),
    );

    if (batch.insertTxn) {
      const t = batch.insertTxn;
      stmts.push(
        this.db
          .prepare(
            `INSERT INTO v2_txns (
               id, chain_key, human_ref, title, state, seq, visibility,
               fields, opened_at, closed_at
             ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            t.id,
            t.chain_key,
            t.human_ref || null,
            t.title,
            t.state,
            t.seq,
            t.visibility,
            JSON.stringify(t.fields),
            t.opened_at,
            t.closed_at,
          ),
      );
    }

    // Conditional UPDATE is the backstop for the txn_seq pre-check: 0 rows
    // changed on a present txn ⇒ stale seq. Verified from meta after the batch.
    let updateStmtIndex = -1;
    if (batch.updateTxn) {
      const u = batch.updateTxn;
      updateStmtIndex = stmts.length;
      stmts.push(
        this.db
          .prepare(
            `UPDATE v2_txns SET seq = ?, state = ?, fields = ?, closed_at = ?
             WHERE id = ? AND seq = ?`,
          )
          .bind(u.seq, u.state, JSON.stringify(u.fields), u.closed_at, u.id, u.expectSeq),
      );
    }

    if (batch.insertParties) {
      for (const p of batch.insertParties) {
        stmts.push(
          this.db
            .prepare(
              `INSERT INTO v2_parties (
                 txn_id, participant_id, role_on_txn, terms, from_event_id, until_event_id
               ) VALUES (?,?,?,?,?,?)`,
            )
            .bind(
              p.txn_id,
              p.participant_id,
              p.role_on_txn,
              JSON.stringify(p.terms),
              p.from_event_id,
              p.until_event_id,
            ),
        );
      }
    }

    // Re-arm: clear all pending timers for the txn BEFORE inserting the new ones.
    if (batch.clearTimersForTxn) {
      stmts.push(
        this.db.prepare(`DELETE FROM v2_timers WHERE txn_id = ?`).bind(batch.clearTimersForTxn),
      );
    }
    if (batch.insertTimers) {
      for (const t of batch.insertTimers) {
        stmts.push(
          this.db
            .prepare(
              `INSERT INTO v2_timers (id, txn_id, fire, due_at, key, class)
               VALUES (?,?,?,?,?,?)`,
            )
            .bind(t.id, t.txn_id, t.fire, t.due_at, t.key, t.class),
        );
      }
    }

    if (batch.insertOutbox) {
      for (const o of batch.insertOutbox) {
        stmts.push(
          this.db
            .prepare(
              `INSERT INTO v2_outbox (id, caused_by, effect, txn_id, created_at)
               VALUES (?,?,?,?,?)`,
            )
            .bind(o.id, o.caused_by, o.effect, o.txn_id, o.created_at),
        );
      }
    }

    if (batch.claims) {
      for (const k of batch.claims) {
        stmts.push(this.db.prepare(`INSERT INTO v2_claims (key) VALUES (?)`).bind(k));
      }
    }

    let results;
    try {
      results = await this.db.batch(stmts);
    } catch (err) {
      // Backstop: a UNIQUE/PK violation that raced past the pre-check.
      const mapped = mapUniqueError(err);
      if (mapped) throw mapped;
      throw err;
    }

    // Backstop for the txn_seq pre-check: the conditional UPDATE changed 0 rows
    // ⇒ the seq moved under us between pre-check and write (real race only).
    if (updateStmtIndex >= 0) {
      const meta = results[updateStmtIndex]?.meta as { changes?: number; rows_written?: number } | undefined;
      const changed = meta?.changes ?? meta?.rows_written ?? 0;
      if (changed === 0) throw new ConstraintViolation('txn_seq');
    }

    return { global_seq };
  }

  async maxGlobalSeq(): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM v2_events`)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async lastSealedGlobalSeq(): Promise<number> {
    const row = await this.db
      .prepare(`SELECT MAX(to_global_seq) AS m FROM v2_merkle_roots`)
      .first<{ m: number | null }>();
    return row?.m ?? 0;
  }

  async eventsByGlobalSeq(fromExclusive: number, toInclusive: number): Promise<EventRow[]> {
    const rows = await this.db
      .prepare(
        `SELECT * FROM v2_events WHERE global_seq > ? AND global_seq <= ? ORDER BY global_seq ASC`,
      )
      .bind(fromExclusive, toInclusive)
      .all<EventDbRow>();
    return (rows.results ?? []).map(toEventRow);
  }

  async appendMerkleRoot(row: MerkleRootRow): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO v2_merkle_roots (from_global_seq, to_global_seq, root, sealed_at)
         VALUES (?,?,?,?)`,
      )
      .bind(row.from_global_seq, row.to_global_seq, row.root, row.sealed_at)
      .run();
  }

  async merkleRoots(): Promise<MerkleRootRow[]> {
    const rows = await this.db
      .prepare(`SELECT from_global_seq, to_global_seq, root, sealed_at FROM v2_merkle_roots`)
      .all<MerkleRootRow>();
    return rows.results ?? [];
  }

  async partiesForTxns(txnIds: string[]): Promise<PartyRow[]> {
    if (txnIds.length === 0) return [];
    const placeholders = txnIds.map(() => '?').join(',');
    const rows = await this.db
      .prepare(`SELECT * FROM v2_parties WHERE txn_id IN (${placeholders})`)
      .bind(...txnIds)
      .all<PartyDbRow>();
    return (rows.results ?? []).map(toPartyRow);
  }

  async eventsForExport(q: ExportQuery): Promise<EventRow[]> {
    if (q.chain_keys.length === 0) return [];
    const clauses: string[] = [];
    const binds: unknown[] = [];

    clauses.push(`chain_key IN (${q.chain_keys.map(() => '?').join(',')})`);
    binds.push(...q.chain_keys);

    if (q.from) {
      clauses.push(`occurred_at >= ?`);
      binds.push(q.from);
    }
    if (q.to) {
      clauses.push(`occurred_at <= ?`);
      binds.push(q.to);
    }
    if (q.participant_ids?.length) {
      const ph = q.participant_ids.map(() => '?').join(',');
      clauses.push(`txn_id IN (SELECT txn_id FROM v2_parties WHERE participant_id IN (${ph}))`);
      binds.push(...q.participant_ids);
    }

    const rows = await this.db
      .prepare(`SELECT * FROM v2_events WHERE ${clauses.join(' AND ')} ORDER BY global_seq ASC`)
      .bind(...binds)
      .all<EventDbRow>();
    return (rows.results ?? []).map(toEventRow);
  }
}
