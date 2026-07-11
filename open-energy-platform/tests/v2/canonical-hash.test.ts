// Byte-level tamper substrate — the contract EVERY hash in the platform rests on.
//
// verify-tamper proves the verifier rejects a doctored pack, but engine AND
// verifier both call THIS canonicalJson, so a bug in it is invisible there:
// both sides make the same mistake, the honest pack still verifies, and the
// "an external party can re-implement our hashing from the spec" claim silently
// breaks. The spec (canonical.ts header) is six bullet points; the load-bearing
// ones are asserted here directly, against the FUNCTION, not against agreement
// between two callers that share it:
//
//   - key-order independence: {a,b} and {b,a} must produce identical bytes.
//     This is what makes a hash survive a D1/JSON round-trip (SQLite returns
//     columns/JSON in whatever order it likes) and an independent verifier.
//   - recursive: nested object keys sort too; array order is PRESERVED (arrays
//     are ordered data, only object keys sort).
//   - undefined-valued keys omitted (distinct from null, which serialises).
//   - non-finite numbers REJECTED (a corrupt NaN/Infinity must throw, not hash).
//
// Plus the two hash.ts primitives the seal + chain depend on: eventHash must
// exclude exactly {hash, global_seq} (so re-hashing a stored row reproduces it,
// and a store-assigned global_seq never perturbs the chain), and merkleRoot's
// odd-leaf promotion + empty-window vector.
//
// No new production code — pure functions exercised as-is.

import { describe, it, expect } from 'vitest';
import { canonicalJson } from '../../src/v2/domain/canonical';
import { eventHash, merkleRoot, sha256Hex, genesisPrevHash, HASH_EXCLUDED } from '../../src/v2/domain/hash';
import type { EventRow } from '../../src/v2/domain/types';

describe('canonicalJson — the byte-level hashing contract', () => {
  it('is key-order independent: two objects equal-but-for-key-order hash the same', () => {
    // the property that lets a hash survive a store round-trip / independent re-impl.
    expect(canonicalJson({ a: 1, b: 2, c: 3 })).toBe(canonicalJson({ c: 3, b: 2, a: 1 }));
    expect(canonicalJson({ a: 1, b: 2, c: 3 })).toBe('{"a":1,"b":2,"c":3}'); // sorted, no whitespace
  });

  it('sorts recursively but preserves array order', () => {
    const a = { z: { y: 1, x: 2 }, list: [{ b: 1, a: 2 }, 3] };
    const b = { list: [{ a: 2, b: 1 }, 3], z: { x: 2, y: 1 } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"list":[{"a":2,"b":1},3],"z":{"x":2,"y":1}}');
    // array order is data — reversing it MUST change the bytes.
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it('omits undefined-valued keys but serialises null', () => {
    expect(canonicalJson({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
    expect(canonicalJson({ a: null })).toBe('{"a":null}'); // null is a value, undefined is absence
    // a key present-with-undefined must hash identically to the key being absent.
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it('rejects non-finite numbers instead of silently hashing them', () => {
    expect(() => canonicalJson(NaN)).toThrow(/non-finite/);
    expect(() => canonicalJson(Infinity)).toThrow(/non-finite/);
    expect(() => canonicalJson({ x: -Infinity })).toThrow(/non-finite/);
  });

  it('escapes strings via JSON.stringify (control chars, quotes, unicode)', () => {
    expect(canonicalJson('a"b\n\t')).toBe(JSON.stringify('a"b\n\t'));
    expect(canonicalJson({ '"quoted"': 1 })).toBe('{"\\"quoted\\"":1}'); // keys are escaped too
  });
});

describe('eventHash / merkleRoot — the chain + seal primitives', () => {
  const ROW: EventRow = {
    txn_id: 'txn-1', seq: 1, event_id: 'e1', chain_key: 'ppa_contract', type: 'ppa_contract.opened',
    from_state: null, to_state: 'draft', actor_id: 'u1', actor_kind: 'user', on_behalf_of: null,
    occurred_at: '2026-07-11T00:00:00.000Z', caused_by: null, reason_code: null, reason_text: null,
    payload: { capacity_mw: 50 }, payload_version: 1, prev_hash: 'p'.repeat(64), hash: 'STALE', idempotency_key: 'k1',
  };

  it('excludes exactly {hash, global_seq}: those fields never perturb the hash', async () => {
    expect(HASH_EXCLUDED).toEqual(['hash', 'global_seq']);
    const base = await eventHash(ROW);
    // re-hashing with a different (or absent) hash field reproduces the same digest…
    expect(await eventHash({ ...ROW, hash: 'DIFFERENT' })).toBe(base);
    // …and a store-assigned global_seq must not change the chain.
    expect(await eventHash({ ...ROW, global_seq: 999 })).toBe(base);
    expect(await eventHash({ ...ROW, global_seq: 1 })).toBe(base);
  });

  it('covers every other field: a payload change flips the hash', async () => {
    expect(await eventHash({ ...ROW, payload: { capacity_mw: 51 } })).not.toBe(await eventHash(ROW));
    expect(await eventHash({ ...ROW, seq: 2 })).not.toBe(await eventHash(ROW));
    expect(await eventHash({ ...ROW, actor_id: 'attacker' })).not.toBe(await eventHash(ROW));
  });

  it('genesis prev_hash is sha256(chain_key)', async () => {
    expect(await genesisPrevHash('ppa_contract')).toBe(await sha256Hex('ppa_contract'));
  });

  it('merkleRoot: empty window is sha256(""), single leaf is itself', async () => {
    expect(await merkleRoot([])).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'); // sha256('')
    expect(await merkleRoot(['abc'])).toBe('abc');
  });

  it('merkleRoot promotes a lone odd leaf unchanged, and order is load-bearing', async () => {
    // 3 leaves: level0 [a,b,c] → level1 [H(a+b), c] → root H(H(a+b)+c). The odd
    // c is promoted, NOT self-paired — assert against the explicit fold.
    const [a, b, c] = ['aa', 'bb', 'cc'];
    const expected = await sha256Hex((await sha256Hex(a + b)) + c);
    expect(await merkleRoot([a, b, c])).toBe(expected);
    // reordering leaves changes the root (the seal covers seq order, not a set).
    expect(await merkleRoot([a, b, c])).not.toBe(await merkleRoot([c, b, a]));
  });
});
