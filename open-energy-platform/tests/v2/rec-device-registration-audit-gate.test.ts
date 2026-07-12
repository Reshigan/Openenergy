// rec_device_registration — the structural audit gate, as a driven property.
//
// A REC production device must NEVER be registered before an independent audit
// is submitted. This is enforced by the state graph, not a guard: register_device
// leaves ONLY audit_verified, and the ONLY path into audit_verified is
// submit_audit_report. So from audit_pending (screening complete, audit not yet
// submitted) register_device is an ILLEGAL_TRANSITION — the engine's state check
// refuses it before any guard runs.
//
// Failure mode this guards: someone adds audit_pending to register_device's
// `from`, or reorders states so a device can register on an unverified audit — a
// device then issues RECs against generation no auditor ever confirmed.
//
// Also pins completenessEvidencePresent: the issuer cannot complete screening
// (and request audit) without a named completeness-evidence ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { recDeviceRegistration } from '../../src/v2/domain/chains/rec_device_registration';
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

const REGISTRANT: Actor = { id: 'user-registrant', kind: 'user', participant_id: 'party-registrant' };
const ISSUER: Actor = { id: 'user-issuer', kind: 'user', participant_id: 'party-issuer' };
const AUDITOR: Actor = { id: 'user-auditor', kind: 'user', participant_id: 'party-auditor' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { rec_device_registration: recDeviceRegistration }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'rec_device_registration', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'rec_device_registration', edge: 'open', actor: REGISTRANT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// small (non-strategic) solar device — issuer + auditor named, no regulator needed.
const baseOpen = {
  device_name: 'Kathu PV-4',
  technology: 'solar_pv',
  capacity_mw: 5,
  location: 'Northern Cape',
  standard: 'I-REC',
  issuer_party: ISSUER.participant_id,
  auditor_party: AUDITOR.participant_id,
};

describe('rec_device_registration — a device cannot register before it is audited', () => {
  it('declares settles:false (a registry control record, never a payment)', () => {
    expect(recDeviceRegistration.settles).toBe(false);
  });

  it('happy path submitted -> screening -> audit_pending -> audit_verified -> registered', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-h', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'begin_screening', ISSUER)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'complete_screening', ISSUER, { completeness_ref: 'CMP-2026-041' })).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('audit_pending');
    expect((await act(deps, 'txn-h', 'submit_audit_report', AUDITOR, { audit_ref: 'AUD-2026-9' })).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('audit_verified');

    const reg = await act(deps, 'txn-h', 'register_device', ISSUER);
    expect(reg.ok).toBe(true);
    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('registered');
    expect(typeof txn.fields.audit_verified_at).toBe('string');
    expect(typeof txn.fields.registered_at).toBe('string');
    expect(typeof txn.fields.registration_code).toBe('string');
  });

  it('register_device from audit_pending is ILLEGAL_TRANSITION (no audit yet)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'begin_screening', ISSUER)).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'complete_screening', ISSUER, { completeness_ref: 'CMP-2026-041' })).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('audit_pending');

    // the graph forbids registering here — audit report not yet submitted.
    const early = await act(deps, 'txn-g', 'register_device', ISSUER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('audit_pending');
  });
});

describe('rec_device_registration — completenessEvidencePresent gates the screening sign-off', () => {
  it('complete_screening with NO completeness_ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'begin_screening', ISSUER)).ok).toBe(true);

    const r = await act(deps, 'txn-c', 'complete_screening', ISSUER, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('screening');
  });
});
