// sweepTimers — the cron seam that fires due SLA/time-bar timers.
//
// Pins the delete-after-attempt contract: a due timer fires its edge exactly
// once as system:timer (with the decl's reason_code), a definitively-rejected
// fire still deletes the row (no infinite refire every 15 min), and a not-yet-
// due timer is untouched.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { sweepTimers } from '../../src/routes/v2';
import { MemoryStore } from '../../src/v2/store/memory';
import type { Actor, ChainDecl, Clock, Command, IdSource, Instant } from '../../src/v2/domain/types';

const T0 = 1_700_000_000_000;

function counterClock(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: T0 + n++ * 1000, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

const OWNER: Actor = { id: 'user-o', kind: 'user', participant_id: 'party-o' };

function chain(key: string, expireGuards: string[]): ChainDecl {
  return {
    key,
    noun: 'Test',
    refPrefix: 'TT',
    title: () => 'test txn',
    visibility: 'public',
    fields: {},
    roles: ['owner'],
    initial: 'open',
    states: {
      open: { label: 'Open', terminal: false, holder: 'owner' },
      expired: { label: 'Expired', terminal: true, holder: 'none' },
    },
    transitions: [
      { id: 'start', from: '@new', to: 'open', by: ['owner'], label: 'Start', intent: 'primary', guards: [], actorBecomes: 'owner' },
      { id: 'expire', from: 'open', to: 'expired', by: ['system'], label: 'Expire', intent: 'destructive', guards: expireGuards, requiresReason: ['timed_out'] },
    ],
    timers: [{ onState: 'open', after: { hours: 1 }, fire: 'expire', kind: 'sla', reason: 'timed_out' }],
    settles: false,
  };
}

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { tt: chain('tt', []), tt_blocked: chain('tt_blocked', ['always_no']) },
    guards: { always_no: () => ({ ok: false, code: 'blocked' }) },
  };
}

function open(deps: EngineDeps, chainKey: string, txnId: string) {
  return applyTransition(
    { txn_id: txnId, chain_key: chainKey, edge: 'start', actor: OWNER, input: {} as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: `open-${txnId}` },
    deps,
  );
}

const iso = (ms: number): string => new Date(ms).toISOString();
const PAST_DUE = iso(T0 + 2 * 3_600_000); // 2h after open — 1h timer is due
const NOT_DUE = iso(T0 + 60_000); // 1 min after open — not due yet

describe('sweepTimers', () => {
  it('fires a due timer as system:timer with the decl reason, then deletes it', async () => {
    const deps = newDeps();
    expect((await open(deps, 'tt', 'txn-1')).ok).toBe(true);

    const out = await sweepTimers(deps, PAST_DUE);
    expect(out).toEqual({ fired: 1, rejected: 0, stale: 0, errors: 0 });

    const bundle = (await deps.store.getTxn('txn-1'))!;
    expect(bundle.txn.state).toBe('expired');
    const fired = bundle.events.at(-1)!;
    expect(fired.actor_kind).toBe('system:timer');
    expect(fired.reason_code).toBe('timed_out');

    // second sweep: nothing left to fire
    expect(await sweepTimers(deps, PAST_DUE)).toEqual({ fired: 0, rejected: 0, stale: 0, errors: 0 });
  });

  it('leaves a not-yet-due timer untouched', async () => {
    const deps = newDeps();
    await open(deps, 'tt', 'txn-1');
    expect(await sweepTimers(deps, NOT_DUE)).toEqual({ fired: 0, rejected: 0, stale: 0, errors: 0 });
    expect((await deps.store.getTxn('txn-1'))!.txn.state).toBe('open');
  });

  it('deletes a timer whose fire is guard-rejected instead of refiring forever', async () => {
    const deps = newDeps();
    await open(deps, 'tt_blocked', 'txn-b');

    const first = await sweepTimers(deps, PAST_DUE);
    expect(first).toEqual({ fired: 0, rejected: 1, stale: 0, errors: 0 });
    expect((await deps.store.getTxn('txn-b'))!.txn.state).toBe('open');

    // the row is gone — the dead timer does not come back every sweep
    expect(await sweepTimers(deps, PAST_DUE)).toEqual({ fired: 0, rejected: 0, stale: 0, errors: 0 });
  });
});
