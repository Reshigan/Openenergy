// Bundle invariant: every timer must reference a real edge that a system actor
// may fire without inputs the timer cannot supply, and must carry a non-zero
// duration (a 0-duration SLA would auto-fire the instant its state is entered).
import { describe, expect, it } from 'vitest';
import { CHAINS } from '../src/routes/v2';

describe('v2 timer declarations', () => {
  it('every timer fires a real, system-fireable, non-instant edge', () => {
    const zero: string[] = [];
    const badEdge: string[] = [];
    const noSystem: string[] = [];
    const reasonClash: string[] = [];
    const requiredInput: string[] = [];
    const stateMismatch: string[] = [];
    for (const [key, chain] of Object.entries(CHAINS)) {
      for (const t of chain.timers ?? []) {
        const dur = Object.values(t.after ?? {});
        if (dur.length === 0 || dur.every((v) => !v)) zero.push(`${key}:${t.fire}`);
        const edge = chain.transitions.find((e) => e.id === t.fire);
        if (!edge) { badEdge.push(`${key}:${t.fire}`); continue; }
        if (!edge.by.includes('system')) noSystem.push(`${key}:${t.fire}`);
        // the edge must be legal FROM the state the timer arms on, or it can
        // never fire (engine step-4 ILLEGAL_TRANSITION every sweep)
        const from = Array.isArray(edge.from) ? edge.from : [edge.from];
        if (!from.includes(t.onState)) stateMismatch.push(`${key}:${t.onState}->${t.fire}`);
        // fire edge demands a reason ⇒ the timer must declare one from the list
        if (edge.requiresReason && (!t.reason || !edge.requiresReason.includes(t.reason))) {
          reasonClash.push(`${key}:${t.fire}`);
        }
        if (t.reason && !edge.requiresReason) reasonClash.push(`${key}:${t.fire}(stale reason)`);
        for (const [f, decl] of Object.entries(edge.input ?? {})) {
          if (decl.required) requiredInput.push(`${key}:${t.fire}.${f}`);
        }
      }
    }
    expect({ zero, badEdge, noSystem, reasonClash, requiredInput, stateMismatch }).toEqual({
      zero: [], badEdge: [], noSystem: [], reasonClash: [], requiredInput: [], stateMismatch: [],
    });
  });
});
