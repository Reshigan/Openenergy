// Guard registry — domain-specific rejection rules only. Role, state,
// required-field, and reason-code checks live in the engine (steps 3–5); a
// guard here answers a business question the engine can't: "are these two
// participants distinct?", "is the platform under a compliance halt?".
//
// A guard is pure over its GuardCtx: no env, no fetch, no clock, no SELECT.
// Anything external arrives through ctx.reference(key) (an as-of read the
// store resolves) or ctx.linked(kind). Return {ok:true} or
// {ok:false, code, evidence?} — the engine surfaces the first rejection in
// declared order and commits it as a `<chain>.<edge>.rejected` event.

import type { Guard, GuardVerdict } from '../types';

/** counterparties must be different legal entities (no self-dealing). */
export const counterpartyDistinct: Guard = (ctx): GuardVerdict => {
  const live = ctx.parties.filter((p) => p.until_event_id === null);
  const ids = new Set(live.map((p) => p.participant_id));
  // when a party field on this edge names a participant, count it too
  for (const v of Object.values(ctx.input)) {
    if (typeof v === 'string') ids.add(v);
  }
  const supplierAndBuyer = live.length + Object.keys(ctx.input).length;
  if (supplierAndBuyer >= 2 && ids.size < 2) {
    return { ok: false, code: 'SELF_DEALING', evidence: { participants: [...ids] } };
  }
  return { ok: true };
};

/** platform-wide compliance halt (POPIA / NERSA directive) blocks new commitments. */
export const complianceHaltClear: Guard = async (ctx): Promise<GuardVerdict> => {
  const halt = await ctx.reference('compliance:halt');
  if (halt) return { ok: false, code: 'COMPLIANCE_HALT', evidence: { halt } };
  return { ok: true };
};

/** an executed contract needs both a board approval ref and named legal counterparty. */
export const executionEvidencePresent: Guard = (ctx): GuardVerdict => {
  const board = ctx.input['board_approval_ref'];
  const legal = ctx.input['legal_counterparty_ref'];
  if (typeof board !== 'string' || board.length < 3) {
    return { ok: false, code: 'MISSING_BOARD_APPROVAL' };
  }
  if (typeof legal !== 'string' || legal.length < 3) {
    return { ok: false, code: 'MISSING_LEGAL_COUNTERPARTY' };
  }
  return { ok: true };
};

/** strategic-tier (≥100 MW) moves need a regulator on the txn to proceed. */
export const regulatorPresentIfStrategic: Guard = (ctx): GuardVerdict => {
  const mw = ctx.txn.fields['capacity_mw'];
  if (typeof mw !== 'number' || mw < 100) return { ok: true };
  const hasRegulator = ctx.parties.some((p) => p.until_event_id === null && p.role_on_txn === 'regulator');
  if (!hasRegulator) return { ok: false, code: 'REGULATOR_REQUIRED', evidence: { capacity_mw: mw } };
  return { ok: true };
};

export const GUARDS: Record<string, Guard> = {
  counterpartyDistinct,
  complianceHaltClear,
  executionEvidencePresent,
  regulatorPresentIfStrategic,
};
