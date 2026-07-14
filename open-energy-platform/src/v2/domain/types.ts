// v2 domain — L0/L1/L2 types per docs/architecture/REBUILD_PLAN.md.
// Purity rule (plan §4, line 763): Date.now(), argless new Date(), and
// Math.random() are banned in domain/. Time comes from an injected Clock,
// ids from an injected IdSource. Deterministic hashing is allowed.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface Instant {
  epoch_ms: number;
  zone: 'UTC';
}

export interface Clock {
  now(): Instant;
}

export interface IdSource {
  uuid(): string;
}

export type RoleOnTxn = string;
export type ActorKind = 'user' | 'system:timer' | 'system:cascade' | 'system:import' | 'connector';
export type Visibility = 'public' | 'party' | 'owner';

export interface Duration {
  days?: number;
  hours?: number;
  minutes?: number;
}

export interface FieldDecl {
  type: 'string' | 'number' | 'boolean' | 'party';
  required?: boolean;
  /** party fields: the role_on_txn the referenced participant takes */
  role?: RoleOnTxn;
  min?: number;
  max?: number;
  label?: string;
}

export interface LegalBasis {
  instrument: string;
  provision: string;
  effect: 'authorises' | 'requires' | 'restricts' | 'creates_offence';
}

export interface StateDecl {
  label: string;
  terminal: boolean;
  holder: RoleOnTxn | 'none';
  sla?: Duration;
}

export interface TransitionDecl {
  id: string;
  from: '@new' | string | string[];
  to: string;
  by: Array<RoleOnTxn | 'system'>;
  label: string;
  intent: 'primary' | 'secondary' | 'destructive';
  decisionGroup?: string;
  input?: Record<string, FieldDecl>;
  /** ordered guard refs into the guard registry — first rejection surfaces */
  guards: string[];
  /** effect refs — engine writes outbox rows, never runs effects inline */
  effects?: string[];
  sets?: string[];
  /** allowed reason codes; presence makes reason_code mandatory */
  requiresReason?: string[];
  /** '@new' edges only: role the initiating actor takes on the txn */
  actorBecomes?: RoleOnTxn;
  compensates?: string;
  /** pure computed fields merged after coercion (fields + event instant only) */
  derive?: (fields: Record<string, Json>, at: Instant) => Record<string, Json>;
  /** pure: the unique key this edge claims (double-spend prevention). Null = no
   *  claim. The store inserts it under a UNIQUE index; a friendly guard may read
   *  it back via reference('claim:'+key) to surface a nice reason pre-commit. */
  claim?: (fields: Record<string, Json>) => string | null;
}

export interface TimerDecl {
  onState: string;
  after: Duration;
  fire: string;
  escalate?: string;
  kind: 'sla' | 'time_bar';
  /** reason_code the sweep passes when firing an edge with requiresReason.
   *  Bundle test enforces: fire edge requiresReason ⇒ reason set and in list. */
  reason?: string;
}

export interface ChainDecl {
  key: string;
  noun: string;
  refPrefix: string;
  title: (fields: Record<string, Json>) => string;
  legalBasis?: LegalBasis[];
  visibility: Visibility;
  fields: Record<string, FieldDecl>;
  roles: RoleOnTxn[];
  initial: string;
  states: Record<string, StateDecl>;
  transitions: TransitionDecl[];
  timers?: TimerDecl[];
  /** mandatory, never defaulted (R-S5-1). false ⇒ record-only notice on view + export */
  settles: boolean;
}

// ---------------------------------------------------------------------------
// L0/L1 rows

export interface TxnRow {
  id: string;
  chain_key: string;
  human_ref: string;
  title: string;
  /** projection of the log tail — NOT authoritative */
  state: string;
  /** optimistic-concurrency token == seq of last event */
  seq: number;
  visibility: Visibility;
  fields: Record<string, Json>;
  opened_at: string;
  closed_at: string | null;
}

export interface PartyRow {
  txn_id: string;
  participant_id: string;
  role_on_txn: RoleOnTxn;
  terms: Json;
  from_event_id: string;
  /** never DELETE — end a party by stamping until_event_id */
  until_event_id: string | null;
}

export interface EventRow {
  txn_id: string;
  /** gapless 1..n per txn — PK(txn_id, seq) is the concurrency guard */
  seq: number;
  event_id: string;
  chain_key: string;
  type: string;
  from_state: string | null;
  to_state: string;
  actor_id: string;
  actor_kind: ActorKind;
  on_behalf_of: string | null;
  /** RFC3339 UTC from the injected clock */
  occurred_at: string;
  caused_by: string | null;
  reason_code: string | null;
  reason_text: string | null;
  payload: Json;
  payload_version: number;
  /** seq 1: sha256(chain_key); else hash of event (txn_id, seq-1) */
  prev_hash: string;
  /** sha256(canonical_json(row without hash, global_seq)) */
  hash: string;
  idempotency_key: string | null;
  /** assigned by the store at commit; excluded from hash */
  global_seq?: number;
}

export interface Actor {
  id: string;
  kind: ActorKind;
  participant_id: string | null;
  on_behalf_of?: string | null;
}

// ---------------------------------------------------------------------------
// L2 command / result

export interface Command {
  txn_id: string;
  chain_key: string;
  edge: string;
  actor: Actor;
  input: Record<string, Json>;
  /** one entry per txn the batch touches; {[txn_id]: -1} for an initiating edge */
  expected_seq: Record<string, number>;
  /** client-generated; unique index — redelivery replays, never double-writes */
  idempotency_key: string;
  reason_code?: string;
  reason_text?: string;
  /** set by the cascade runner, never a browser */
  caused_by?: string;
}

export interface GuardVerdict {
  ok: boolean;
  code?: string;
  evidence?: Json;
}

export interface GuardCtx {
  txn: TxnRow;
  parties: PartyRow[];
  events: EventRow[];
  input: Record<string, Json>;
  actor: Actor;
  /** the event's occurred_at — NOT now() */
  at: Instant;
  reference(key: string): Promise<Json | null>;
  linked(kind: string): Promise<Array<{ txn: TxnRow; state: string }>>;
}

export type Guard = (ctx: GuardCtx) => Promise<GuardVerdict> | GuardVerdict;

export interface ActionView {
  edge: string;
  label: string;
  intent: string;
  enabled: boolean;
  blockedBy?: { guard: string; code: string };
}

export type Result =
  | { ok: true; event: EventRow; txn: TxnRow; actions: ActionView[]; replayed?: boolean }
  | { ok: false; code: string; message: string; guard?: string; evidence?: Json };

// ---------------------------------------------------------------------------
// Storage port — in-memory for P0; D1 adapter is P1. commit() is atomic:
// either every row lands or none does (D1: one env.DB.batch()).

export interface TxnBundle {
  txn: TxnRow;
  parties: PartyRow[];
  events: EventRow[];
}

export interface OutboxRow {
  id: string;
  caused_by: string;
  effect: string;
  txn_id: string;
  created_at: string;
}

export interface TimerRow {
  id: string;
  txn_id: string;
  fire: string;
  due_at: string;
  key: string;
  class: 'sla' | 'time_bar';
}

export interface MerkleRootRow {
  from_global_seq: number;
  to_global_seq: number;
  root: string;
  sealed_at: string;
}

export type ConstraintName =
  | 'event_pk'
  | 'event_id'
  | 'idempotency_key'
  | 'txn_seq'
  | 'human_ref'
  | 'global_seq'
  | 'unique_claim';

export class ConstraintViolation extends Error {
  constructor(public constraint: ConstraintName) {
    super(`constraint violated: ${constraint}`);
    this.name = 'ConstraintViolation';
  }
}

export interface CommitBatch {
  insertEvent: EventRow;
  insertTxn?: TxnRow;
  updateTxn?: {
    id: string;
    expectSeq: number;
    seq: number;
    state: string;
    fields: Record<string, Json>;
    closed_at: string | null;
  };
  insertParties?: PartyRow[];
  insertOutbox?: OutboxRow[];
  insertTimers?: TimerRow[];
  /** re-arm semantics: clear all pending timers for this txn, then insertTimers */
  clearTimersForTxn?: string;
  /** append-only unique keys claimed by this commit (e.g. carbon serial ranges).
   *  A duplicate throws ConstraintViolation('unique_claim') — the DB index, not a
   *  read-then-write guard, is what rejects a concurrent double-claim atomically. */
  claims?: string[];
}

export interface ExportQuery {
  chain_keys: string[];
  from?: string;
  to?: string;
  participant_ids?: string[];
}

/** Flexible list filter for Home/Find/Ledger. All predicates AND together.
 *  scope_participant_id set ⇒ only txns this participant is a live party to, OR
 *  public ones (non-operator scoping). Operators pass it undefined to see all. */
export interface TxnListFilter {
  scope_participant_id?: string;
  chain_key?: string;
  open_only?: boolean;
  /** substring over human_ref / title / fields (case-insensitive) */
  q?: string;
  limit: number;
}

export interface Store {
  getTxn(id: string): Promise<TxnBundle | null>;
  listTxns(f: TxnListFilter): Promise<TxnRow[]>;
  findEventByIdempotencyKey(key: string): Promise<EventRow | null>;
  reference(key: string, atEpochMs: number): Promise<Json | null>;
  commit(batch: CommitBatch): Promise<{ global_seq: number }>;
  maxGlobalSeq(): Promise<number>;
  lastSealedGlobalSeq(): Promise<number>;
  eventsByGlobalSeq(fromExclusive: number, toInclusive: number): Promise<EventRow[]>;
  appendMerkleRoot(row: MerkleRootRow): Promise<void>;
  merkleRoots(): Promise<MerkleRootRow[]>;
  partiesForTxns(txnIds: string[]): Promise<PartyRow[]>;
  eventsForExport(q: ExportQuery): Promise<EventRow[]>;
  /** due rows (due_at <= now), oldest first. One call per class so a noisy
   *  class can't starve the other (plan §timers). */
  dueTimers(nowIso: string, limit: number, cls: 'sla' | 'time_bar'): Promise<TimerRow[]>;
  /** delete-after-attempt: the sweep's idempotency key + engine replay make a
   *  double-fire harmless, so no claimed_at column is needed. */
  deleteTimer(id: string): Promise<void>;
}
