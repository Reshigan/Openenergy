// pages/src/meridian/lib-pure.ts — Meridian pure helpers (no api / no axios).
// Split out of lib.ts so the server vitest suite can unit-test this logic
// without resolving axios (a pages-only dependency). lib.ts re-exports these.

// A Horizon lane whose cases all belong to one chain can deep-link straight to
// that chain's Ledger (the lane label becomes a <Link>). Mixed lanes return null
// and stay a collapse toggle. Empty lanes are not single-chain.
export function singleChainOf(cases: { chain: string }[]): string | null {
  const set = new Set(cases.map((c) => c.chain));
  return set.size === 1 ? [...set][0] : null;
}

// Classify a failed axios load so surfaces can show an honest message.
// axios puts the HTTP status on .response.status; a request that never got a
// response (network/CORS/offline) has .request but no .response.
export type LoadErrorKind = 'forbidden' | 'notfound' | 'network' | 'unknown';
export function classifyLoadError(e: unknown): LoadErrorKind {
  const status = (e as { response?: { status?: number } })?.response?.status;
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notfound';
  if (status === undefined && (e as { request?: unknown })?.request) return 'network';
  return 'unknown';
}
