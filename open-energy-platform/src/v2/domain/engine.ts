// L2 — applyTransition: the only writer of the event log.
// Ten steps, in order (REBUILD_PLAN.md §L2, lines 420–557). No SQL, no clock,
// no randomness inline: everything time/id-shaped comes from injected deps so
// the domain stays pure and the hash chain is reproducible by the verifier.

import type {
  Actor,
  ChainDecl,
  Clock,
  Command,
  EventRow,
  Guard,
  GuardCtx,
  GuardVerdict,
  IdSource,
  Json,
  PartyRow,
  Result,
  Store,
  TransitionDecl,
  TxnRow,
  ActionView,
  CommitBatch,
  OutboxRow,
  TimerRow,
} from './types';
import { ConstraintViolation } from './types';
import { eventHash, genesisPrevHash } from './hash';
import { addDuration, isoUtc } from './time';

export interface EngineDeps {
  store: Store;
  clock: Clock;
  ids: IdSource;
  chains: Record<string, ChainDecl>;
  guards: Record<string, Guard>;
}

const MAX_RETRIES = 3;

function reject(code: string, message: string, guard?: string, evidence?: Json): Result {
  return { ok: false, code, message, guard, evidence };
}

/** input coercion (step 5): explicit per-field, no implicit casts. */
function coerceInput(
  edge: TransitionDecl,
  raw: Record<string, Json>,
): { values: Record<string, Json>; parties: Array<{ participant_id: string; role: string }> } | { error: string } {
  const values: Record<string, Json> = {};
  const parties: Array<{ participant_id: string; role: string }> = [];
  for (const [name, decl] of Object.entries(edge.input ?? {})) {
    const v = raw[name];
    if (v === undefined || v === null || v === '') {
      if (decl.required) return { error: `missing required field '${name}'` };
      continue;
    }
    switch (decl.type) {
      case 'string':
        if (typeof v !== 'string') return { error: `field '${name}' must be a string` };
        values[name] = v;
        break;
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) return { error: `field '${name}' must be a finite number` };
        if (decl.min !== undefined && v < decl.min) return { error: `field '${name}' below min ${decl.min}` };
        if (decl.max !== undefined && v > decl.max) return { error: `field '${name}' above max ${decl.max}` };
        values[name] = v;
        break;
      case 'boolean':
        if (typeof v !== 'boolean') return { error: `field '${name}' must be a boolean` };
        values[name] = v;
        break;
      case 'party':
        if (typeof v !== 'string') return { error: `field '${name}' must be a participant id` };
        values[name] = v;
        if (decl.role) parties.push({ participant_id: v, role: decl.role });
        break;
    }
  }
  return { values, parties };
}

/** step 10 — affordances the UI must not compute itself. */
async function availableActions(
  chain: ChainDecl,
  txn: TxnRow,
  parties: PartyRow[],
  events: EventRow[],
  actor: Actor,
  deps: EngineDeps,
  at: { epoch_ms: number; zone: 'UTC' },
): Promise<ActionView[]> {
  const out: ActionView[] = [];
  const liveRoles = new Set(
    parties.filter((p) => p.until_event_id === null && p.participant_id === actor.participant_id).map((p) => p.role_on_txn),
  );
  for (const edge of chain.transitions) {
    if (edge.from === '@new') continue;
    const from = Array.isArray(edge.from) ? edge.from : [edge.from];
    if (!from.includes(txn.state)) continue;
    const authorized =
      actor.kind === 'user'
        ? edge.by.some((r) => r !== 'system' && liveRoles.has(r))
        : edge.by.includes('system');
    if (!authorized) continue;
    const view: ActionView = { edge: edge.id, label: edge.label, intent: edge.intent, enabled: true };
    for (const gname of edge.guards) {
      const guard = deps.guards[gname];
      if (!guard) continue;
      const ctx = buildCtx(txn, parties, events, {}, actor, at, deps);
      const verdict = await guard(ctx);
      if (!verdict.ok) {
        view.enabled = false;
        view.blockedBy = { guard: gname, code: verdict.code ?? 'BLOCKED' };
        break;
      }
    }
    out.push(view);
  }
  return out;
}

function buildCtx(
  txn: TxnRow,
  parties: PartyRow[],
  events: EventRow[],
  input: Record<string, Json>,
  actor: Actor,
  at: { epoch_ms: number; zone: 'UTC' },
  deps: EngineDeps,
): GuardCtx {
  return {
    txn,
    parties,
    events,
    input,
    actor,
    at,
    reference: (key: string) => deps.store.reference(key, at.epoch_ms),
    linked: async () => [], // ponytail: no txn_link table in P0; single chain has no cross-links. Add when a chain declares links.
  };
}

/** derive a human ref deterministically from the injected id (Math.random banned). */
function humanRef(prefix: string, year: number, uuid: string): string {
  const suffix = uuid.replace(/-/g, '').slice(-4).toUpperCase();
  return `${prefix}-${String(year).slice(-2)}-${suffix}`;
}

export async function applyTransition(cmd: Command, deps: EngineDeps): Promise<Result> {
  // idempotency (fast path): a redelivered key replays, never double-writes.
  const existing = await deps.store.findEventByIdempotencyKey(cmd.idempotency_key);
  if (existing) {
    const bundle = await deps.store.getTxn(existing.txn_id);
    if (!bundle) return reject('INTERNAL', 'idempotent event without txn');
    const at = deps.clock.now();
    const actions = await availableActions(
      deps.chains[bundle.txn.chain_key],
      bundle.txn,
      bundle.parties,
      bundle.events,
      cmd.actor,
      deps,
      at,
    );
    return { ok: true, event: existing, txn: bundle.txn, actions, replayed: true };
  }

  // step 1 — resolve chain + edge
  const chain = deps.chains[cmd.chain_key];
  if (!chain) return reject('UNKNOWN_EDGE', `unknown chain '${cmd.chain_key}'`);
  const edge = chain.transitions.find((t) => t.id === cmd.edge);
  if (!edge) return reject('UNKNOWN_EDGE', `unknown edge '${cmd.edge}' on ${cmd.chain_key}`);

  const isNew = edge.from === '@new';

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // step 2 — load txn + parties + own log (one call), check the concurrency token
    let txn: TxnRow;
    let parties: PartyRow[];
    let events: EventRow[];
    if (isNew) {
      const clash = await deps.store.getTxn(cmd.txn_id);
      if (clash) return reject('CONFLICT', 'txn already exists');
      txn = {
        id: cmd.txn_id,
        chain_key: chain.key,
        human_ref: '',
        title: '',
        state: chain.initial,
        seq: 0,
        visibility: chain.visibility,
        fields: {},
        opened_at: '',
        closed_at: null,
      };
      parties = [];
      events = [];
    } else {
      const bundle = await deps.store.getTxn(cmd.txn_id);
      if (!bundle) return reject('NOT_FOUND', `txn ${cmd.txn_id} not found`);
      txn = bundle.txn;
      parties = bundle.parties;
      events = bundle.events;
      if (cmd.expected_seq[cmd.txn_id] !== txn.seq) {
        return reject('STALE', `expected seq ${cmd.expected_seq[cmd.txn_id]}, txn at ${txn.seq}`);
      }
    }

    // step 3 — authorize
    if (cmd.actor.kind === 'user') {
      if (isNew) {
        // @new authz is enforced upstream (API rbac); engine assigns actorBecomes.
        if (!edge.by.some((r) => r !== 'system')) return reject('FORBIDDEN', 'edge not open to users');
      } else {
        const liveRoles = new Set(
          parties
            .filter((p) => p.until_event_id === null && p.participant_id === cmd.actor.participant_id)
            .map((p) => p.role_on_txn),
        );
        if (!edge.by.some((r) => r !== 'system' && liveRoles.has(r))) {
          return reject('FORBIDDEN', `actor lacks a role in [${edge.by.join(',')}]`, undefined, {
            has: [...liveRoles],
          });
        }
      }
    } else if (cmd.actor.kind === 'system:timer' || cmd.actor.kind === 'system:cascade') {
      if (!edge.by.includes('system')) return reject('FORBIDDEN', 'edge not open to system actors');
    } else {
      return reject('FORBIDDEN', `actor kind ${cmd.actor.kind} not permitted`);
    }

    // step 4 — state check
    if (!isNew) {
      const from = Array.isArray(edge.from) ? edge.from : [edge.from];
      if (!from.includes(txn.state)) {
        return reject('ILLEGAL_TRANSITION', `edge '${edge.id}' not valid from '${txn.state}'`);
      }
    }

    // step 5 — validate + coerce input
    const coerced = coerceInput(edge, cmd.input);
    if ('error' in coerced) return reject('BAD_INPUT', coerced.error);

    // reason code
    if (edge.requiresReason) {
      if (!cmd.reason_code || !edge.requiresReason.includes(cmd.reason_code)) {
        return reject('BAD_INPUT', `edge '${edge.id}' requires reason_code in [${edge.requiresReason.join(',')}]`);
      }
    }

    // step 6 — run EVERY guard, keep all verdicts, surface the first rejection in order
    const at = deps.clock.now();
    const ctx = buildCtx(txn, parties, events, coerced.values, cmd.actor, at, deps);
    const verdicts: Array<{ guard: string; verdict: GuardVerdict }> = [];
    let firstReject: { guard: string; verdict: GuardVerdict } | null = null;
    for (const gname of edge.guards) {
      const guard = deps.guards[gname];
      if (!guard) return reject('INTERNAL', `guard '${gname}' not registered`);
      const verdict = await guard(ctx);
      verdicts.push({ guard: gname, verdict });
      if (!verdict.ok && !firstReject) firstReject = { guard: gname, verdict };
    }

    // step 7 — build the event (occurred_at from the clock; prev_hash from the tail)
    const occurred_at = isoUtc(at);
    const rejected = firstReject !== null;
    const from_state = txn.state;
    const to_state = rejected ? from_state : edge.to;
    const seq = txn.seq + 1;
    const prev_hash = isNew || events.length === 0 ? await genesisPrevHash(chain.key) : events[events.length - 1].hash;

    // event_id is a fresh uuid per attempt — deriving human_ref from it means a
    // collision self-heals on retry (actor.id+occurred_at was deterministic, so
    // two txns by one actor in the same second collided forever → CONTENTION).
    const event_id = deps.ids.uuid();
    const ref = isNew ? humanRef(chain.refPrefix, new Date(at.epoch_ms).getUTCFullYear(), event_id) : txn.human_ref;
    const coercedAndDerived = rejected
      ? {}
      : { ...coerced.values, ...(edge.derive ? edge.derive({ ...txn.fields, ...coerced.values }, at) : {}) };
    const mergedFields = rejected ? txn.fields : { ...txn.fields, ...coercedAndDerived };
    const title = rejected ? txn.title : chain.title(mergedFields);

    // pure claim key (double-spend): the DB UNIQUE index is the real constraint;
    // a friendly guard may pre-read it via reference('claim:'+key). Never on a reject.
    const claimKey = !rejected && edge.claim ? edge.claim(mergedFields) : null;

    const base: Omit<EventRow, 'hash'> = {
      txn_id: txn.id,
      seq,
      event_id,
      chain_key: chain.key,
      type: rejected ? `${chain.key}.${edge.id}.rejected` : `${chain.key}.${edge.id}`,
      from_state: isNew ? null : from_state,
      to_state,
      actor_id: cmd.actor.id,
      actor_kind: cmd.actor.kind,
      on_behalf_of: cmd.actor.on_behalf_of ?? null,
      occurred_at,
      caused_by: cmd.caused_by ?? null,
      reason_code: cmd.reason_code ?? null,
      reason_text: cmd.reason_text ?? null,
      payload: rejected ? ({ verdicts, input: coerced.values } as unknown as Json) : (coercedAndDerived as Json),
      payload_version: 1,
      prev_hash,
      idempotency_key: cmd.idempotency_key,
    };
    const hash = await eventHash(base);
    const event: EventRow = { ...base, hash };

    // step 8 — one atomic commit
    const terminal = !rejected && chain.states[to_state]?.terminal === true;
    const newParties: PartyRow[] = [];
    if (isNew && !rejected) {
      if (edge.actorBecomes && cmd.actor.participant_id) {
        newParties.push({
          txn_id: txn.id,
          participant_id: cmd.actor.participant_id,
          role_on_txn: edge.actorBecomes,
          terms: null,
          from_event_id: event.event_id,
          until_event_id: null,
        });
      }
      for (const p of coerced.parties) {
        newParties.push({
          txn_id: txn.id,
          participant_id: p.participant_id,
          role_on_txn: p.role,
          terms: null,
          from_event_id: event.event_id,
          until_event_id: null,
        });
      }
    }

    const outbox: OutboxRow[] = rejected
      ? []
      : (edge.effects ?? []).map((eff) => ({
          id: deps.ids.uuid(),
          caused_by: event.event_id,
          effect: eff,
          txn_id: txn.id,
          created_at: occurred_at,
        }));

    const timers: TimerRow[] = [];
    if (!rejected) {
      for (const t of chain.timers ?? []) {
        if (t.onState !== to_state) continue;
        timers.push({
          id: deps.ids.uuid(),
          txn_id: txn.id,
          fire: t.fire,
          due_at: isoUtc(addDuration(at, t.after)),
          key: `${txn.id}:${t.onState}:${t.fire}`,
          class: t.kind,
        });
      }
    }

    const batch: CommitBatch = {
      insertEvent: event,
      insertOutbox: outbox.length ? outbox : undefined,
      insertTimers: timers.length ? timers : undefined,
      clearTimersForTxn: !rejected && !isNew ? txn.id : undefined,
      claims: claimKey ? [claimKey] : undefined,
    };
    if (isNew) {
      batch.insertTxn = {
        ...txn,
        human_ref: rejected ? '' : ref,
        title,
        state: to_state,
        seq,
        fields: mergedFields,
        opened_at: occurred_at,
        closed_at: terminal ? occurred_at : null,
      };
      if (newParties.length) batch.insertParties = newParties;
    } else {
      batch.updateTxn = {
        id: txn.id,
        expectSeq: txn.seq,
        seq,
        state: to_state,
        fields: mergedFields,
        closed_at: terminal ? occurred_at : txn.closed_at,
      };
    }

    // step 9 — commit; on a race, reload + rebuild from scratch (new seq/prev_hash/hash)
    try {
      const { global_seq } = await deps.store.commit(batch);
      event.global_seq = global_seq;
    } catch (e) {
      if (e instanceof ConstraintViolation) {
        if (e.constraint === 'idempotency_key') {
          const dup = await deps.store.findEventByIdempotencyKey(cmd.idempotency_key);
          const bundle = dup ? await deps.store.getTxn(dup.txn_id) : null;
          if (dup && bundle) {
            const acts = await availableActions(chain, bundle.txn, bundle.parties, bundle.events, cmd.actor, deps, at);
            return { ok: true, event: dup, txn: bundle.txn, actions: acts, replayed: true };
          }
        }
        // a claimed unique key is permanent — retrying a double-claim is pointless.
        if (e.constraint === 'unique_claim') throw e;
        continue; // event_pk / txn_seq / human_ref — retry the whole thing
      }
      throw e;
    }

    // step 10 — return new state + affordances (with guard verdicts)
    const finalBundle = await deps.store.getTxn(txn.id);
    const finalTxn = finalBundle?.txn ?? { ...txn, state: to_state, seq };
    const actions = finalBundle
      ? await availableActions(chain, finalBundle.txn, finalBundle.parties, finalBundle.events, cmd.actor, deps, at)
      : [];
    if (rejected) {
      return reject(firstReject!.verdict.code ?? 'REJECTED', `guard '${firstReject!.guard}' rejected`, firstReject!.guard, firstReject!.verdict.evidence);
    }
    return { ok: true, event, txn: finalTxn, actions };
  }

  return reject('CONTENTION', `could not commit after ${MAX_RETRIES} attempts`);
}
