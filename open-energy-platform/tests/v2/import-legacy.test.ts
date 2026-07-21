// importChain — REBUILD_PLAN §11 legacy backfill.
//
// Pins the cutover contract: an imported log is indistinguishable to the
// verifier from a native one (genesis prev_hash + verbatim eventHash), re-runs
// are idempotent, unknown v1 statuses quarantine instead of writing, only
// non-terminal rows arm timers, and a real applyTransition continues the
// imported txn as seq 2 chained off the imported hash.

import { describe, it, expect } from 'vitest';
import { importChain, importIdempotencyKey, fetchLegacyRows, IMPORTABLE_CHAINS, RENAMED_IMPORTS, STATUS_MAP } from '../../src/v2/import/legacy';
import { MERIDIAN_CHAINS } from '../../src/utils/chain-registry-meridian';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { CHAINS } from '../../src/routes/v2';
import { GUARDS } from '../../src/v2/domain/guards/registry';
import { MemoryStore } from '../../src/v2/store/memory';
import { exportPack } from '../../src/v2/domain/export';
import { verifyPack } from '../../src/v2/verify/verifier';
import { genesisPrevHash } from '../../src/v2/domain/hash';
import type { Actor, Clock, IdSource, Instant } from '../../src/v2/domain/types';

const T0 = 1_700_000_000_000;

function counterClock(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: T0 + n++ * 1000, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: CHAINS, guards: GUARDS };
}

const BORROWER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// v1 oe_covenant_certificates shapes (refCol certificate_number, statusCol
// chain_status, counterpartyCol borrower_party_name)
const ccRows = () => [
  {
    id: 'cc-1',
    certificate_number: 'CERT-001',
    chain_status: 'breach_identified', // non-terminal
    facility_name: 'Karoo Solar',
    test_period: '2026-Q1',
    dscr_actual: 1.02,
    dscr_threshold: 1.2,
    borrower_party_name: BORROWER_ID, // UUID — confident participant id
    created_at: '2026-01-05 08:00:00',
    updated_at: '2026-02-01 09:30:00',
  },
  {
    id: 'cc-2',
    certificate_number: 'CERT-002',
    chain_status: 'compliant', // terminal
    facility_name: 'Karoo Solar',
    test_period: '2025-Q4',
    borrower_party_name: 'Standard Bank', // display name — no party
    created_at: '2025-10-05 08:00:00',
    updated_at: '2025-11-01 09:30:00',
  },
  {
    id: 'cc-3',
    certificate_number: 'CERT-003',
    chain_status: 'weird_legacy_status', // unknown → quarantine, no write
    facility_name: 'Karoo Solar',
    test_period: '2025-Q3',
  },
];

describe('importChain', () => {
  it('imports clean rows, quarantines unknown statuses, and verifies as a pack', async () => {
    const deps = newDeps();
    const report = await importChain(ccRows(), 'covenant_certificate', deps);
    expect(report).toEqual({
      chain_key: 'covenant_certificate',
      imported: 2,
      skipped_existing: 0,
      quarantined: [{ id: 'cc-3', status: 'weird_legacy_status' }],
      dry_run: false,
    });

    const open = (await deps.store.getTxn('cc-1'))!;
    expect(open.txn.state).toBe('breach_identified');
    expect(open.txn.human_ref).toBe('CERT-001');
    expect(open.txn.closed_at).toBeNull();
    expect(open.txn.fields.facility_name).toBe('Karoo Solar');
    expect(open.events).toHaveLength(1);
    const ev = open.events[0];
    expect(ev.seq).toBe(1);
    expect(ev.type).toBe('covenant_certificate.imported');
    expect(ev.from_state).toBeNull();
    expect(ev.actor_kind).toBe('system:import');
    expect(ev.prev_hash).toBe(await genesisPrevHash('covenant_certificate'));
    expect(ev.occurred_at).toBe('2026-02-01T09:30:00.000Z'); // updated_at, UTC-normalised
    expect((ev.payload as { provenance: string }).provenance).toBe('legacy');
    expect(ev.idempotency_key).toBe(importIdempotencyKey('covenant_certificate', 'cc-1'));
    // UUID counterparty became a live borrower party; display-name row did not
    expect(open.parties).toEqual([
      expect.objectContaining({ participant_id: BORROWER_ID, role_on_txn: 'borrower', until_event_id: null }),
    ]);
    expect((await deps.store.getTxn('cc-2'))!.parties).toEqual([]);
    expect((await deps.store.getTxn('cc-2'))!.txn.closed_at).toBe('2025-11-01T09:30:00.000Z');

    // the imported log passes the standalone verifier unmodified
    const pack = await exportPack(
      { chain_keys: ['covenant_certificate'] },
      { store: deps.store, chains: CHAINS, generated_at: '2026-07-01T00:00:00.000Z', generated_by: 'test' },
    );
    const verdict = await verifyPack(pack);
    expect(verdict.checks.filter((c) => !c.ok)).toEqual([]);
    expect(verdict.ok).toBe(true);
  });

  it('re-run is idempotent: nothing new is written', async () => {
    const deps = newDeps();
    await importChain(ccRows(), 'covenant_certificate', deps);
    const again = await importChain(ccRows(), 'covenant_certificate', deps);
    expect(again.imported).toBe(0);
    expect(again.skipped_existing).toBe(2);
    expect(again.quarantined).toHaveLength(1);
    expect(await deps.store.maxGlobalSeq()).toBe(2);
  });

  it('dry_run processes rows but commits nothing', async () => {
    const deps = newDeps();
    const report = await importChain(ccRows(), 'covenant_certificate', deps, { dry_run: true });
    expect(report.imported).toBe(2);
    expect(report.dry_run).toBe(true);
    expect(await deps.store.maxGlobalSeq()).toBe(0);
  });

  it('suffix-retries a colliding human_ref instead of failing the row', async () => {
    const deps = newDeps();
    const [a] = ccRows();
    const dupe = { ...a, id: 'cc-9', chain_status: 'compliant' }; // same certificate_number
    const report = await importChain([a, dupe], 'covenant_certificate', deps);
    expect(report.imported).toBe(2);
    expect((await deps.store.getTxn('cc-9'))!.txn.human_ref).toBe('CERT-001~2');
  });

  it('non-terminal rows arm the state timers; terminal rows arm nothing', async () => {
    const deps = newDeps();
    // cyber_incident: timers = [{ onState: 'reported', after: {hours:4}, fire: 'triage', kind: 'sla' }]
    const rows = [
      {
        id: 'cy-1',
        case_number: 'CYBE-1',
        chain_status: 'reported',
        incident_title: 'phish',
        updated_at: '2026-03-01 10:00:00',
      },
      { id: 'cy-2', case_number: 'CYBE-2', chain_status: 'closed', incident_title: 'old', updated_at: '2026-01-01 10:00:00' },
    ];
    const report = await importChain(rows, 'cyber_incident', deps);
    expect(report.imported).toBe(2);

    const due = await deps.store.dueTimers('2999-01-01T00:00:00.000Z', 10, 'sla');
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      txn_id: 'cy-1',
      fire: 'triage',
      key: 'cy-1:reported:triage',
      due_at: '2026-03-01T14:00:00.000Z', // occurred_at + 4h
    });
    expect(await deps.store.dueTimers('2999-01-01T00:00:00.000Z', 10, 'time_bar')).toEqual([]);
  });

  it('a real transition continues an imported txn as seq 2 off the imported hash', async () => {
    const deps = newDeps();
    await importChain(ccRows(), 'covenant_certificate', deps);
    const imported = (await deps.store.getTxn('cc-1'))!.events[0];

    const borrower: Actor = { id: BORROWER_ID, kind: 'user', participant_id: BORROWER_ID };
    const r = await applyTransition(
      {
        txn_id: 'cc-1',
        chain_key: 'covenant_certificate',
        edge: 'request_waiver', // breach_identified → waiver_requested, by borrower
        actor: borrower,
        input: { waiver_ref: 'WVR-1' },
        expected_seq: { 'cc-1': 1 },
        idempotency_key: 'waiver-1',
      },
      deps,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.seq).toBe(2);
      expect(r.event.prev_hash).toBe(imported.hash);
      expect(r.txn.state).toBe('waiver_requested');
    }
  });

  it('maps legacy-only statuses to their written v2 state and arms that state timers', async () => {
    const deps = newDeps();
    const rows = [
      // 'detected' has no v2 state — STATUS_MAP sends it to 'reported' (non-terminal)
      { id: 'cy-3', case_number: 'CYBE-3', chain_status: 'detected', incident_title: 'probe', updated_at: '2026-04-01 10:00:00' },
      // 'false_alarm' maps to terminal 'dismissed'
      { id: 'cy-4', case_number: 'CYBE-4', chain_status: 'false_alarm', incident_title: 'noise', updated_at: '2026-04-02 10:00:00' },
    ];
    const report = await importChain(rows, 'cyber_incident', deps);
    expect(report.imported).toBe(2);
    expect(report.quarantined).toEqual([]);

    const mapped = (await deps.store.getTxn('cy-3'))!;
    expect(mapped.txn.state).toBe('reported');
    expect(mapped.events[0].to_state).toBe('reported');
    // original v1 status survives verbatim inside the preserved row
    expect((mapped.events[0].payload as { row: { chain_status: string } }).row.chain_status).toBe('detected');
    // mapped non-terminal state arms ITS timers (reported → triage sla)
    const due = await deps.store.dueTimers('2999-01-01T00:00:00.000Z', 10, 'sla');
    expect(due.map((t) => t.txn_id)).toEqual(['cy-3']);

    const dismissed = (await deps.store.getTxn('cy-4'))!;
    expect(dismissed.txn.state).toBe('dismissed');
    expect(dismissed.txn.closed_at).not.toBeNull();
  });

  it('every STATUS_MAP target is a real state of its chain', () => {
    for (const [ck, map] of Object.entries(STATUS_MAP)) {
      expect(ck in IMPORTABLE_CHAINS).toBe(true);
      const chain = CHAINS[RENAMED_IMPORTS[ck] ?? ck];
      for (const [from, to] of Object.entries(map)) {
        expect(chain.states[to], `${ck}: ${from} → ${to}`).toBeDefined();
        // a mapping for a status that IS already a v2 state would silently shadow it
        expect(chain.states[from], `${ck}: '${from}' is already a v2 state`).toBeUndefined();
      }
    }
  });

  it('every RENAMED_IMPORTS entry resolves: allow-listed source, real descriptor, real v2 chain', () => {
    for (const [v1Key, v2Key] of Object.entries(RENAMED_IMPORTS)) {
      expect(v1Key in IMPORTABLE_CHAINS, `${v1Key} missing from IMPORTABLE_CHAINS`).toBe(true);
      expect(MERIDIAN_CHAINS.some((d) => d.key === v1Key), `${v1Key} has no MERIDIAN_CHAINS descriptor`).toBe(true);
      expect(CHAINS[v2Key], `${v1Key} → ${v2Key}: no such v2 chain`).toBeDefined();
    }
  });

  it('rejects a chain outside the allow-list', async () => {
    expect(Object.keys(IMPORTABLE_CHAINS)).toHaveLength(122);
    await expect(importChain([], 'ppa_contract', newDeps())).rejects.toThrow(/not importable/);
  });

  // v2_txns.id IS the raw v1 row id, but v1 ids are only unique WITHIN a table —
  // two different legacy tables can both hold a row 'cc-1'. The second one to be
  // imported must be reported as un-imported, not silently counted as an
  // already-present skip, or the cutover reconciliation over-reports coverage.
  it('a v1 id already owned by another chain quarantines instead of counting as skipped', async () => {
    const deps = newDeps();
    await importChain(ccRows(), 'covenant_certificate', deps);
    expect((await deps.store.getTxn('cc-1'))!.txn.chain_key).toBe('covenant_certificate');

    // same id, different legacy table (oe_availability_guarantees)
    const report = await importChain(
      [{ id: 'cc-1', case_number: 'AG-001', chain_status: 'period_open', created_at: '2026-03-01 08:00:00' }],
      'availability_guarantee',
      deps,
    );
    expect(report.imported).toBe(0);
    expect(report.skipped_existing).toBe(0);
    expect(report.quarantined).toEqual([{ id: 'cc-1', status: 'period_open' }]);
    // the incumbent txn is untouched
    expect((await deps.store.getTxn('cc-1'))!.txn.chain_key).toBe('covenant_certificate');
  });
});

// fetchLegacyRows owns the paging contract for a full backfill. The cursor is
// load-bearing: quarantined rows never gain a v2_events row, so the NOT EXISTS
// clause alone re-selects them forever and a driver paging without a cursor
// never reaches the importable tail.
describe('fetchLegacyRows paging', () => {
  function stubDb() {
    const calls: { sql: string; binds: unknown[] }[] = [];
    const db = {
      prepare(sql: string) {
        const call = { sql, binds: [] as unknown[] };
        calls.push(call);
        return {
          bind(...b: unknown[]) {
            call.binds = b;
            return { all: async () => ({ results: [] }) };
          },
        };
      },
    };
    return { db: db as unknown as D1Database, calls };
  }

  it('binds the cursor, the chain key and the clamped limit in that order', async () => {
    const { db, calls } = stubDb();
    await fetchLegacyRows(db, 'covenant_certificate', 200, 'cc-9');
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('FROM oe_covenant_certificates');
    expect(calls[0].sql).toContain('t.id > ?');
    expect(calls[0].sql).toContain('ORDER BY t.id');
    expect(calls[0].binds).toEqual(['cc-9', 'covenant_certificate', 200]);
  });

  it('defaults to an empty cursor (start of table) and clamps the limit to 500', async () => {
    const { db, calls } = stubDb();
    await fetchLegacyRows(db, 'covenant_certificate', 10_000);
    expect(calls[0].binds).toEqual(['', 'covenant_certificate', 500]);
  });

  it('never lets a request-supplied chain key reach identifier position', async () => {
    const { db } = stubDb();
    await expect(fetchLegacyRows(db, 'oe_users; DROP TABLE v2_txns', 10)).rejects.toThrow(/not importable/);
  });
});
