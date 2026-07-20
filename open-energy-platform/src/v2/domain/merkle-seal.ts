// Nightly seal — the only writer of merkle roots. Folds every event committed
// since the last sealed global_seq into one root and appends it. Keeps L6
// export a PURE READ: the export never computes a root, it only quotes the
// roots this job already sealed, and the external verifier recomputes them
// from the event window. No seal, no anchor — integrity stays self-attested
// until P1 wires an external timestamp authority.

import type { Clock, MerkleRootRow, Store } from './types';
import { merkleRoot } from './hash';
import { isoUtc } from './time';

/** Seal all events in (lastSealed, maxGlobalSeq]. Returns the new root row, or
 *  null when there is nothing pending (empty window is not sealed). */
export async function sealPendingEvents(store: Store, clock: Clock): Promise<MerkleRootRow | null> {
  const from = await store.lastSealedGlobalSeq();
  const to = await store.maxGlobalSeq();
  if (to <= from) return null;

  const events = await store.eventsByGlobalSeq(from, to);
  // events come back ordered; fold their hashes in global_seq order.
  const root = await merkleRoot(events.map((e) => e.hash));
  const row: MerkleRootRow = {
    from_global_seq: from + 1,
    to_global_seq: to,
    root,
    sealed_at: isoUtc(clock.now()),
  };
  await store.appendMerkleRoot(row);
  return row;
}
