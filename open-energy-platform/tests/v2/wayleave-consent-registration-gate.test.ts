// wayleave_consent — the structural registration gate, as a driven property.
//
// A servitude must NEVER be registered without the landowner's consent. This is
// enforced by the state graph, not a guard: register_servitude leaves ONLY
// `consented`, and the ONLY path into `consented` is grant_consent (by the
// landowner). So from `negotiating` (unconsented) register_servitude is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds `negotiating` to register_servitude's
// `from`, letting a servitude register on the applicant's word alone — the
// landowner is bound over land it never consented to.
//
// Also pins: counterpartyDistinct at '@new' (an applicant that names itself as
// landowner is refused SELF_DEALING) and completenessEvidencePresent at
// registration (no completeness ref → MISSING_COMPLETENESS_EVIDENCE).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { wayleaveConsent } from '../../src/v2/domain/chains/wayleave_consent';
import { GUARDS } from '../../src/v2/domain/guards/registry';
import type { Actor, Clock, Command, IdSource, Instant } from '../../src/v2/domain/types';

function counterClock(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: 1_700_000_000_000 + n++ * 1000, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

const APPLICANT: Actor = { id: 'user-app', kind: 'user', participant_id: 'party-app' };
const LANDOWNER: Actor = { id: 'user-lo', kind: 'user', participant_id: 'party-lo' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { wayleave_consent: wayleaveConsent }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'wayleave_consent', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>, actor: Actor = APPLICANT) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'wayleave_consent', edge: 'open', actor, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  applicant_name: 'Eskom Transmission',
  landowner_party: LANDOWNER.participant_id,
  erf_number: 'ERF-4471',
  line_ref: 'LINE-400kV-Beta',
  servitude_width_m: 31,
};

describe('wayleave_consent — a servitude cannot register before the landowner consents', () => {
  it('declares settles:false (a land-access record, never a payment)', () => {
    expect(wayleaveConsent.settles).toBe(false);
  });

  it('happy path: open -> begin_negotiation -> grant_consent -> register_servitude -> registered', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-h', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'begin_negotiation', APPLICANT)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'grant_consent', LANDOWNER)).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('consented');
    expect((await act(deps, 'txn-h', 'register_servitude', APPLICANT, { completeness_ref: 'PKT-9001' })).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('registered');
    expect(typeof txn.fields.consented_at).toBe('string');
    expect(typeof txn.fields.registered_at).toBe('string');
  });

  it('register_servitude from negotiating (landowner never consented) is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'begin_negotiation', APPLICANT)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('negotiating');

    // the graph forbids registering here — no landowner consent exists.
    const early = await act(deps, 'txn-e', 'register_servitude', APPLICANT, { completeness_ref: 'PKT-9001' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('negotiating');
  });
});

describe('wayleave_consent — evidence + independence gates', () => {
  it('an applicant that names itself as landowner is refused SELF_DEALING at @new', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-self', { ...baseOpen, landowner_party: APPLICANT.participant_id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SELF_DEALING');
  });

  it('registering with no completeness ref is refused MISSING_COMPLETENESS_EVIDENCE', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    await act(deps, 'txn-c', 'begin_negotiation', APPLICANT);
    await act(deps, 'txn-c', 'grant_consent', LANDOWNER);
    // consent on record, completeness_ref absent → the guard speaks.
    const r = await act(deps, 'txn-c', 'register_servitude', APPLICANT, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('consented');
  });
});
