// licence_application — the completeness-evidence and compliance-halt seams.
//
// A NERSA licence cannot be ACCEPTED for processing on a bare assertion: the
// accept_application edge is guarded by completenessEvidencePresent, which needs
// a named completeness_ref (≥3 chars). The engine's required-field check only
// proves the field is non-empty; the guard proves it is a real reference, so a
// throwaway "ab" is refused where a genuine ref passes.
//
// Two compliance-halt seams: open (lodging) and grant_licence (the decision) are
// both guarded by complianceHaltClear — a platform-wide halt blocks both a new
// application and a grant, read as-of via ctx.reference('compliance:halt').
//
// Failure mode this guards: someone drops completenessEvidencePresent and an
// application is accepted with no completeness record; or drops complianceHaltClear
// and a licence is granted while the platform is under a regulatory halt.
//
// Also pins settles:false (a licence grant is a regulatory act, not a payment).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { licenceApplication } from '../../src/v2/domain/chains/licence_application';
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

const APPLICANT: Actor = { id: 'user-applicant', kind: 'user', participant_id: 'party-applicant' };
const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: 'party-regulator' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { licence_application: licenceApplication }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'licence_application', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string) {
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'licence_application',
      edge: 'open',
      actor: APPLICANT,
      input: {
        applicant_name: 'Karoo Solar SPV',
        facility_ref: 'FAC-77',
        licence_class: 'standard',
        activity: 'generate',
        regulator_party: REGULATOR.participant_id,
      } as Command['input'],
      expected_seq: { [txnId]: -1 },
      idempotency_key: key(),
    },
    deps,
  );
}

// drive a fresh application up to completeness_review (where accept sits).
async function toCompletenessReview(deps: EngineDeps, txnId: string) {
  await open(deps, txnId);
  await act(deps, txnId, 'begin_review', REGULATOR);
}

describe('licence_application — completenessEvidencePresent gates acceptance', () => {
  it('declares settles:false (a regulatory act, not a payment)', () => {
    expect(licenceApplication.settles).toBe(false);
  });

  it('accept with a throwaway completeness_ref (<3 chars) is refused (MISSING_COMPLETENESS_EVIDENCE)', async () => {
    const deps = newDeps();
    await toCompletenessReview(deps, 'txn-thin');

    const r = await act(deps, 'txn-thin', 'accept_application', REGULATOR, { completeness_ref: 'ab' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-thin'))!.txn.state).toBe('completeness_review');
  });

  it('accept with a real completeness_ref proceeds to accepted', async () => {
    const deps = newDeps();
    await toCompletenessReview(deps, 'txn-ok');

    const r = await act(deps, 'txn-ok', 'accept_application', REGULATOR, { completeness_ref: 'COMPLETE-2026-001' });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('accepted');
  });
});

describe('licence_application — complianceHaltClear blocks lodging and granting under halt', () => {
  it('lodging is refused while the platform is under a compliance halt', async () => {
    const deps = newDeps();
    (deps.store as MemoryStore).setReference('compliance:halt', { reason: 'POPIA directive' });

    const r = await open(deps, 'txn-halt');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('COMPLIANCE_HALT');
  });

  it('a halt raised mid-flight blocks grant_licence at the decision', async () => {
    const deps = newDeps();
    const store = deps.store as MemoryStore;

    // full run to council_decision with no halt in place…
    await toCompletenessReview(deps, 'txn-mid');
    expect((await act(deps, 'txn-mid', 'accept_application', REGULATOR, { completeness_ref: 'COMPLETE-2026-002' })).ok).toBe(true);
    expect((await act(deps, 'txn-mid', 'open_participation', REGULATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-mid', 'begin_evaluation', REGULATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-mid', 'refer_to_council', REGULATOR)).ok).toBe(true);

    // …now a halt lands, and the grant is refused at the last gate.
    store.setReference('compliance:halt', { reason: 'NERSA directive' });
    const blocked = await act(deps, 'txn-mid', 'grant_licence', REGULATOR);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('COMPLIANCE_HALT');
    expect((await store.getTxn('txn-mid'))!.txn.state).toBe('council_decision');

    // clear the halt and the grant goes through, stamping granted_at.
    store.setReference('compliance:halt', null);
    const granted = await act(deps, 'txn-mid', 'grant_licence', REGULATOR);
    expect(granted.ok).toBe(true);
    const txn = (await store.getTxn('txn-mid'))!.txn;
    expect(txn.state).toBe('licence_granted');
    expect(typeof txn.fields.granted_at).toBe('string');
  });
});
