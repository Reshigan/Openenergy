// vcm_project_development — the structural validation gate, as a driven property.
//
// A VCM project must NEVER be registered before an independent validation opinion
// exists. This is enforced by the state graph, not a guard: register_project
// leaves ONLY validation_reported, and the ONLY path into validation_reported is
// report_validation from under_validation. So from under_validation (validation
// in progress, no opinion yet) register_project is an ILLEGAL_TRANSITION — the
// engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds under_validation (or validation_requested)
// to register_project's `from`, letting a project register — and start issuing
// carbon credits — on an unvalidated PDD.
//
// Also pins regulatorPresentIfStrategic: a ≥100 MW project cannot register without
// a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { vcmProjectDevelopment } from '../../src/v2/domain/chains/vcm_project_development';
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

const DEVELOPER: Actor = { id: 'user-dev', kind: 'user', participant_id: 'party-dev' };
const VALIDATOR: Actor = { id: 'user-vvb', kind: 'user', participant_id: 'party-vvb' };
const REGISTRY: Actor = { id: 'user-reg', kind: 'user', participant_id: 'party-registry' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { vcm_project_development: vcmProjectDevelopment },
    guards: GUARDS,
  };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'vcm_project_development',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      reason_code,
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'vcm_project_development', edge: 'open', actor: DEVELOPER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// small (non-strategic) project — validator + registry named, no regulator needed.
const baseOpen = {
  project_name: 'Free State cookstove programme',
  project_type: 'cookstove',
  methodology: 'AMS-II.G',
  host_location: 'Free State, ZA',
  capacity_mw: 0,
  validator_party: VALIDATOR.participant_id,
  registry_party: REGISTRY.participant_id,
};

describe('vcm_project_development — a project cannot register before validation is reported', () => {
  it('declares settles:false (a registry record, never a payment)', () => {
    expect(vcmProjectDevelopment.settles).toBe(false);
  });

  it('happy path drives @new → registered and register_project from under_validation is ILLEGAL', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-v', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-v', 'draft_pdd', DEVELOPER)).ok).toBe(true);
    expect((await act(deps, 'txn-v', 'submit_for_validation', DEVELOPER, { pdd_ref: 'PDD-001' })).ok).toBe(true);
    expect((await act(deps, 'txn-v', 'begin_validation', VALIDATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-v'))!.txn.state).toBe('under_validation');

    // the graph forbids registering here — no validation opinion exists yet.
    const early = await act(deps, 'txn-v', 'register_project', REGISTRY, { registration_id: 'VCS-9999' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-v'))!.txn.state).toBe('under_validation');

    // report validation FIRST, THEN register succeeds — and both stamps land.
    expect((await act(deps, 'txn-v', 'report_validation', VALIDATOR, { validation_opinion_ref: 'VAL-OP-7' })).ok).toBe(true);
    expect((await store.getTxn('txn-v'))!.txn.state).toBe('validation_reported');
    const registered = await act(deps, 'txn-v', 'register_project', REGISTRY, { registration_id: 'VCS-9999' });
    expect(registered.ok).toBe(true);

    const txn = (await store.getTxn('txn-v'))!.txn;
    expect(txn.state).toBe('registered');
    expect(typeof txn.fields.validation_reported_at).toBe('string');
    expect(typeof txn.fields.registered_at).toBe('string');
  });

  it('reject_project without a reason_code is rejected (BAD_INPUT)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    await act(deps, 'txn-r', 'draft_pdd', DEVELOPER);
    await act(deps, 'txn-r', 'submit_for_validation', DEVELOPER, { pdd_ref: 'PDD-002' });
    await act(deps, 'txn-r', 'begin_validation', VALIDATOR);

    const noReason = await act(deps, 'txn-r', 'reject_project', VALIDATOR);
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.code).toBe('BAD_INPUT');

    const withReason = await act(deps, 'txn-r', 'reject_project', VALIDATOR, {}, 'additionality_not_demonstrated');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('rejected');
  });
});

describe('vcm_project_development — regulatorPresentIfStrategic gates registration', () => {
  const strategicOpen = { ...baseOpen, project_name: 'Northern Cape 150MW solar', project_type: 'renewable', capacity_mw: 150 };

  async function driveToValidationReported(deps: EngineDeps, txnId: string, extraOpen: Record<string, unknown>) {
    await open(deps, txnId, { ...strategicOpen, ...extraOpen });
    await act(deps, txnId, 'draft_pdd', DEVELOPER);
    await act(deps, txnId, 'submit_for_validation', DEVELOPER, { pdd_ref: 'PDD-S' });
    await act(deps, txnId, 'begin_validation', VALIDATOR);
    await act(deps, txnId, 'report_validation', VALIDATOR, { validation_opinion_ref: 'VAL-S' });
  }

  it('a ≥100 MW project with NO regulator is refused at register_project', async () => {
    const deps = newDeps();
    await driveToValidationReported(deps, 'txn-s', {});
    const r = await act(deps, 'txn-s', 'register_project', REGISTRY, { registration_id: 'VCS-S' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-s'))!.txn.state).toBe('validation_reported');
  });

  it('a ≥100 MW project WITH a regulator party registers', async () => {
    const deps = newDeps();
    await driveToValidationReported(deps, 'txn-s', { regulator_party: REGULATOR_ID });
    const r = await act(deps, 'txn-s', 'register_project', REGISTRY, { registration_id: 'VCS-S' });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-s'))!.txn.state).toBe('registered');
  });
});
