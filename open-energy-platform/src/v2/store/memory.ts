// In-memory Store for P0. The D1 adapter is P1 (plan §Storage port); this one
// exists so the engine, L6 export, and the standalone verifier are demonstrable
// end-to-end without a database. commit() is atomic: it validates every
// constraint BEFORE mutating any collection, so a ConstraintViolation leaves
// the store exactly as it was — same all-or-nothing contract D1's batch() gives.

import type {
  CommitBatch,
  EventRow,
  ExportQuery,
  Json,
  MerkleRootRow,
  OutboxRow,
  PartyRow,
  Store,
  TimerRow,
  TxnBundle,
  TxnListFilter,
  TxnRow,
} from '../domain/types';
import { ConstraintViolation } from '../domain/types';

export class MemoryStore implements Store {
  private events: EventRow[] = []; // global order; global_seq === index + 1
  private txns = new Map<string, TxnRow>();
  private parties = new Map<string, PartyRow[]>();
  private idem = new Map<string, EventRow>();
  private eventIds = new Set<string>();
  private humanRefs = new Set<string>();
  private claims = new Set<string>();
  private timers: TimerRow[] = [];
  private outbox: OutboxRow[] = [];
  private roots: MerkleRootRow[] = [];
  private sealed = 0;
  // ponytail: flat key→value, no bi-temporal history in P0. A reference is an
  // as-of read in the D1 adapter; the demo only needs "current". Upgrade to a
  // (key, from_epoch_ms, value) log when a guard needs a point-in-time read.
  private refs = new Map<string, Json>();

  setReference(key: string, value: Json): void {
    this.refs.set(key, value);
  }

  async getTxn(id: string): Promise<TxnBundle | null> {
    const txn = this.txns.get(id);
    if (!txn) return null;
    const events = this.events.filter((e) => e.txn_id === id).sort((a, b) => a.seq - b.seq);
    const timers = this.timers.filter((t) => t.txn_id === id);
    return { txn, parties: this.parties.get(id) ?? [], events, timers };
  }

  async findEventByIdempotencyKey(key: string): Promise<EventRow | null> {
    return this.idem.get(key) ?? null;
  }

  async listTxns(f: TxnListFilter): Promise<TxnRow[]> {
    const isLiveParty = (id: string, pid: string) =>
      (this.parties.get(id) ?? []).some((p) => p.until_event_id === null && p.participant_id === pid);
    const q = f.q?.toLowerCase();
    let rows = [...this.txns.values()];
    if (f.scope_participant_id) {
      const pid = f.scope_participant_id;
      const keys = new Set(f.scope_chain_keys ?? []);
      rows = rows.filter(
        (t) =>
          t.visibility === 'public' ||
          isLiveParty(t.id, pid) ||
          (t.visibility === 'party' && keys.has(t.chain_key)),
      );
    }
    if (f.chain_key) rows = rows.filter((t) => t.chain_key === f.chain_key);
    if (f.open_only) rows = rows.filter((t) => t.closed_at === null);
    if (q) {
      rows = rows.filter(
        (t) =>
          t.human_ref.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          JSON.stringify(t.fields).toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => (a.opened_at < b.opened_at ? 1 : a.opened_at > b.opened_at ? -1 : 0));
    return rows.slice(0, Math.max(1, Math.min(f.limit, 200)));
  }

  async reference(key: string, _atEpochMs: number): Promise<Json | null> {
    return this.refs.has(key) ? (this.refs.get(key) as Json) : null;
  }

  async commit(batch: CommitBatch): Promise<{ global_seq: number }> {
    const ev = batch.insertEvent;

    // --- validate all constraints first; throw before any mutation ---
    if (this.eventIds.has(ev.event_id)) throw new ConstraintViolation('event_id');
    if (ev.idempotency_key !== null && this.idem.has(ev.idempotency_key)) {
      throw new ConstraintViolation('idempotency_key');
    }
    if (this.events.some((e) => e.txn_id === ev.txn_id && e.seq === ev.seq)) {
      throw new ConstraintViolation('event_pk'); // also catches a duplicate first event (re-created txn)
    }
    if (batch.insertTxn?.human_ref && this.humanRefs.has(batch.insertTxn.human_ref)) {
      throw new ConstraintViolation('human_ref');
    }
    if (batch.updateTxn) {
      const cur = this.txns.get(batch.updateTxn.id);
      if (!cur || cur.seq !== batch.updateTxn.expectSeq) throw new ConstraintViolation('txn_seq');
    }
    if (batch.claims?.some((k) => this.claims.has(k))) throw new ConstraintViolation('unique_claim');

    // --- apply atomically ---
    const global_seq = this.events.length + 1;
    ev.global_seq = global_seq;
    this.events.push(ev);
    this.eventIds.add(ev.event_id);
    if (ev.idempotency_key !== null) this.idem.set(ev.idempotency_key, ev);

    if (batch.insertTxn) {
      this.txns.set(batch.insertTxn.id, batch.insertTxn);
      if (batch.insertTxn.human_ref) this.humanRefs.add(batch.insertTxn.human_ref);
    }
    if (batch.updateTxn) {
      const cur = this.txns.get(batch.updateTxn.id)!;
      this.txns.set(cur.id, {
        ...cur,
        seq: batch.updateTxn.seq,
        state: batch.updateTxn.state,
        fields: batch.updateTxn.fields,
        closed_at: batch.updateTxn.closed_at,
      });
    }
    if (batch.insertParties) {
      const arr = this.parties.get(ev.txn_id) ?? [];
      arr.push(...batch.insertParties);
      this.parties.set(ev.txn_id, arr);
    }
    // re-arm: clear pending timers for the txn, THEN insert the new ones
    if (batch.clearTimersForTxn) this.timers = this.timers.filter((t) => t.txn_id !== batch.clearTimersForTxn);
    if (batch.insertTimers) this.timers.push(...batch.insertTimers);
    if (batch.insertOutbox) this.outbox.push(...batch.insertOutbox);
    if (batch.claims) for (const k of batch.claims) this.claims.add(k);

    return { global_seq };
  }

  async maxGlobalSeq(): Promise<number> {
    return this.events.length;
  }

  async lastSealedGlobalSeq(): Promise<number> {
    return this.sealed;
  }

  async eventsByGlobalSeq(fromExclusive: number, toInclusive: number): Promise<EventRow[]> {
    return this.events.filter((e) => (e.global_seq ?? 0) > fromExclusive && (e.global_seq ?? 0) <= toInclusive);
  }

  async appendMerkleRoot(row: MerkleRootRow): Promise<void> {
    this.roots.push(row);
    if (row.to_global_seq > this.sealed) this.sealed = row.to_global_seq;
  }

  async merkleRoots(): Promise<MerkleRootRow[]> {
    return [...this.roots];
  }

  async partiesForTxns(txnIds: string[]): Promise<PartyRow[]> {
    const set = new Set(txnIds);
    const out: PartyRow[] = [];
    for (const [id, ps] of this.parties) if (set.has(id)) out.push(...ps);
    return out;
  }

  async dueTimers(nowIso: string, limit: number, cls: 'sla' | 'time_bar'): Promise<TimerRow[]> {
    return this.timers
      .filter((t) => t.class === cls && t.due_at <= nowIso)
      .sort((a, b) => (a.due_at < b.due_at ? -1 : a.due_at > b.due_at ? 1 : 0))
      .slice(0, limit);
  }

  async deleteTimer(id: string): Promise<void> {
    this.timers = this.timers.filter((t) => t.id !== id);
  }

  async eventsForExport(q: ExportQuery): Promise<EventRow[]> {
    const chainSet = new Set(q.chain_keys);
    const partySet = q.participant_ids?.length ? new Set(q.participant_ids) : null;
    const txnHasParty = (txnId: string): boolean => {
      if (!partySet) return true;
      return (this.parties.get(txnId) ?? []).some((p) => partySet.has(p.participant_id));
    };
    return this.events
      .filter((e) => chainSet.has(e.chain_key))
      .filter((e) => (q.from ? e.occurred_at >= q.from : true))
      .filter((e) => (q.to ? e.occurred_at <= q.to : true))
      .filter((e) => txnHasParty(e.txn_id))
      .sort((a, b) => (a.global_seq ?? 0) - (b.global_seq ?? 0));
  }
}
