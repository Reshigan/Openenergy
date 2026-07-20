// listTxns — the read-side that feeds Home / Find / Ledger. Non-trivial logic:
// party-scoping (a non-operator can never enumerate another party's txns), the
// public-visibility escape hatch, open_only, and the case-insensitive q filter.
// One runnable check per branch that would break if the filter regressed.

import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../../src/v2/store/memory';
import type { PartyRow, TxnRow } from '../../src/v2/domain/types';

function txn(p: Partial<TxnRow> & { id: string }): TxnRow {
  return {
    id: p.id,
    chain_key: p.chain_key ?? 'ppa_contract',
    human_ref: p.human_ref ?? p.id.toUpperCase(),
    title: p.title ?? 'Untitled',
    state: p.state ?? 'draft',
    seq: p.seq ?? 1,
    visibility: p.visibility ?? 'party',
    fields: p.fields ?? {},
    opened_at: p.opened_at ?? '2026-01-01T00:00:00.000Z',
    closed_at: p.closed_at ?? null,
  };
}

// seed via the private maps the same way commit() would leave them.
function seed(): MemoryStore {
  const s = new MemoryStore() as any;
  const put = (t: TxnRow, parties: PartyRow[]) => {
    s.txns.set(t.id, t);
    s.parties.set(t.id, parties);
  };
  const party = (txn_id: string, participant_id: string): PartyRow => ({
    txn_id, participant_id, role_on_txn: 'buyer', terms: null,
    from_event_id: 'e', until_event_id: null,
  });
  put(txn({ id: 'a', title: 'Solar PPA', opened_at: '2026-01-03T00:00:00.000Z' }), [party('a', 'alice')]);
  put(txn({ id: 'b', title: 'Wind PPA', chain_key: 'drawdown', opened_at: '2026-01-02T00:00:00.000Z', closed_at: '2026-02-01T00:00:00.000Z' }), [party('b', 'bob')]);
  put(txn({ id: 'c', title: 'Public notice', visibility: 'public', opened_at: '2026-01-01T00:00:00.000Z' }), [party('c', 'bob')]);
  return s as MemoryStore;
}

describe('MemoryStore.listTxns', () => {
  it('operator (no scope) sees everything, newest first', async () => {
    const rows = await seed().listTxns({ limit: 100 });
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('non-operator scope sees only own party + public, never a stranger', async () => {
    const rows = await seed().listTxns({ scope_participant_id: 'alice', limit: 100 });
    // alice is a party to a; c is public; b belongs to bob only -> hidden
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'c']);
  });

  it('open_only drops closed txns', async () => {
    const rows = await seed().listTxns({ open_only: true, limit: 100 });
    expect(rows.map((r) => r.id)).toEqual(['a', 'c']); // b is closed
  });

  it('chain_key + case-insensitive q filter compose', async () => {
    const rows = await seed().listTxns({ chain_key: 'ppa_contract', q: 'SOLAR', limit: 100 });
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });
});
