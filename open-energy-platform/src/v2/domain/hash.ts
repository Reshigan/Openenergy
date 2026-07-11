import { canonicalJson } from './canonical';
import type { EventRow } from './types';

/** Fields never covered by the event hash: the hash itself, and global_seq
 *  (assigned by the store after the hash is computed). */
export const HASH_EXCLUDED = ['hash', 'global_seq'] as const;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Genesis prev_hash for seq 1 of any txn on a chain. */
export function genesisPrevHash(chainKey: string): Promise<string> {
  return sha256Hex(chainKey);
}

export async function eventHash(row: Omit<EventRow, 'hash'> & { hash?: string }): Promise<string> {
  const rest: Record<string, unknown> = { ...row };
  for (const k of HASH_EXCLUDED) delete rest[k];
  return sha256Hex(canonicalJson(rest));
}

/** Merkle fold over event hashes in global_seq order. Pairs hash as
 *  sha256(left + right) over the lowercase-hex strings; an odd trailing leaf
 *  is promoted unchanged to the next level. Empty window → sha256(''). */
export async function merkleRoot(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return sha256Hex('');
  let level = leaves;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? await sha256Hex(level[i] + level[i + 1]) : level[i]);
    }
    level = next;
  }
  return level[0];
}
