// ═══════════════════════════════════════════════════════════════════════════
// Governed-chain spec invariants — catches a whole defect class across every
// chain, and stays as a permanent regression guard.
//
// Each governed chain exports a trio with a shared <PREFIX>:
//   <PREFIX>_HARD_TERMINALS    : Set<Status>
//   <PREFIX>_VALID_TRANSITIONS : Record<Status, Action[]>   (status-keyed)
//                             OR Record<Action, {from: Status[]}>  (action-keyed)
//   <PREFIX>_STATE_TRANSITIONS : Record<Action, Status>
//
// UNIVERSAL INVARIANT — ORPHANED ACTION:
//   Every action in STATE_TRANSITIONS must be dispatchable. Every route guards
//   a transition with `VALID_TRANSITIONS.includes(action)` (status-keyed) or by
//   `action in VALID_TRANSITIONS` (action-keyed), so an action that appears in
//   no VALID row can never fire — and its target state becomes unreachable.
//   sla_breach is excluded: it is a flag-only marker that never advances state.
//
// NOT checked here (deliberately): "a HARD_TERMINAL with outgoing valid edges
// is a dead-end". That is route-dependent — only chains whose route guards
// terminals BEFORE the valid check (e.g. green-bond, slb-kpi) dead-end. Chains
// like ISDA guard solely on VALID_TRANSITIONS and use HARD_TERMINALS only to
// suppress SLA auto-termination, so a terminal-with-edges is intentional there.
// Those dead-ends are covered by per-chain route tests, not this structural one.
import { describe, it, expect } from 'vitest';

// Vite-native eager glob — pulls every spec module at collect time.
const modules = import.meta.glob('../src/utils/*-spec.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

type Trio = {
  file: string;
  prefix: string;
  valid: Record<string, unknown>;
  state: Record<string, string>;
};

function collectTrios(): Trio[] {
  const trios: Trio[] = [];
  for (const [file, mod] of Object.entries(modules)) {
    const prefixes = new Set<string>();
    for (const name of Object.keys(mod)) {
      const m = name.match(/^(.+)_HARD_TERMINALS$/);
      if (m) prefixes.add(m[1]);
    }
    for (const prefix of prefixes) {
      const valid = mod[`${prefix}_VALID_TRANSITIONS`];
      const state = mod[`${prefix}_STATE_TRANSITIONS`];
      if (valid && state) {
        trios.push({
          file: file.split('/').pop()!,
          prefix,
          valid: valid as Record<string, unknown>,
          state: state as Record<string, string>,
        });
      }
    }
  }
  return trios;
}

// Dispatchable actions, regardless of which VALID shape the chain uses.
function dispatchableActions(valid: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  const firstVal = Object.values(valid)[0];
  if (Array.isArray(firstVal)) {
    // status-keyed: Record<Status, Action[]>
    for (const arr of Object.values(valid)) for (const a of arr as string[]) out.add(a);
  } else {
    // action-keyed: Record<Action, {from: Status[]}> — keys ARE the actions
    for (const a of Object.keys(valid)) out.add(a);
  }
  return out;
}

const trios = collectTrios();

describe('governed-chain spec structural invariants', () => {
  it('discovers the full governed-chain set', () => {
    expect(trios.length).toBeGreaterThanOrEqual(38);
  });

  describe.each(trios)('$file [$prefix]', (t) => {
    it('every STATE_TRANSITIONS action is dispatchable from some state (no orphaned action)', () => {
      const dispatchable = dispatchableActions(t.valid);
      const offenders: string[] = [];
      for (const action of Object.keys(t.state)) {
        if (action === 'sla_breach') continue; // flag-only marker, never advances state
        if (!dispatchable.has(action)) offenders.push(action);
      }
      expect(offenders, `${t.prefix}: actions defined but unreachable`).toEqual([]);
    });
  });
});
