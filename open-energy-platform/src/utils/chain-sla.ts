// ═══════════════════════════════════════════════════════════════════════════
// sla_breach is a FLAG event, never a state transition.
//
// Governed chains compute their next state as `STATE_TRANSITIONS[action]`. For
// the `sla_breach` action those flat maps point at a FIXED state — usually the
// chain's START state, sometimes a TERMINAL. Applied unconditionally, a cron SLA
// sweep that fires `sla_breach` would REWIND an in-flight chain to that fixed
// state (or kill it). The documented intent across the codebase is "stays in
// place, flag set" / "no-move": the chain holds its current status and only the
// sla_breached flag is raised. This helper enforces that invariant at the single
// point where the next status is resolved, so call-sites can't reintroduce it.
export function resolveNextStatus<S extends string, A extends string>(
  action: A,
  currentStatus: S,
  transitions: Record<A, S>,
): S {
  if ((action as string) === 'sla_breach') return currentStatus;
  return transitions[action];
}
