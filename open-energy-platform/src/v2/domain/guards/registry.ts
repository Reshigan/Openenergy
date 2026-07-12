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

import type { Guard, GuardVerdict, Json } from '../types';

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

/** a facility drawdown approval needs a named credit-approval ref. */
export const creditApprovalPresent: Guard = (ctx): GuardVerdict => {
  const ref = ctx.input['credit_approval_ref'];
  if (typeof ref !== 'string' || ref.length < 3) return { ok: false, code: 'MISSING_CREDIT_APPROVAL' };
  return { ok: true };
};

/** conditions-precedent satisfaction needs a named CP-evidence ref. */
export const cpEvidencePresent: Guard = (ctx): GuardVerdict => {
  const ref = ctx.input['cp_evidence_ref'];
  if (typeof ref !== 'string' || ref.length < 3) return { ok: false, code: 'MISSING_CP_EVIDENCE' };
  return { ok: true };
};

/** a carbon serial range must be well-formed: end ≥ start, and quantity must
 *  equal the inclusive range size (guards against a mis-stated burn quantity —
 *  a double-count vector). Reads the edge input first, else the txn's carried
 *  fields (submit/retire don't re-supply them). */
export const serialRangeConsistent: Guard = (ctx): GuardVerdict => {
  const get = (k: string): Json | undefined => (k in ctx.input ? ctx.input[k] : ctx.txn.fields[k]);
  const start = get('serial_start');
  const end = get('serial_end');
  const qty = get('quantity_tco2e');
  if (typeof start !== 'number' || typeof end !== 'number' || typeof qty !== 'number') {
    return { ok: false, code: 'SERIAL_RANGE_INCOMPLETE' };
  }
  if (end < start) return { ok: false, code: 'SERIAL_RANGE_INVERTED', evidence: { start, end } };
  const size = end - start + 1;
  if (qty !== size) return { ok: false, code: 'SERIAL_QUANTITY_MISMATCH', evidence: { size, qty } };
  return { ok: true };
};

/** a licence-completeness sign-off needs a named completeness-evidence ref. */
export const completenessEvidencePresent: Guard = (ctx): GuardVerdict => {
  const ref = ctx.input['completeness_ref'];
  if (typeof ref !== 'string' || ref.length < 3) return { ok: false, code: 'MISSING_COMPLETENESS_EVIDENCE' };
  return { ok: true };
};

/** a live regulator party must be on the txn when `cond` holds (a safety/severity
 *  crossing). Shared by the strategic/critical/high-hazard gates. */
const requireRegulatorWhen = (ctx: Parameters<Guard>[0], cond: boolean, evidence: Json): GuardVerdict => {
  if (!cond) return { ok: true };
  const hasRegulator = ctx.parties.some((p) => p.until_event_id === null && p.role_on_txn === 'regulator');
  if (!hasRegulator) return { ok: false, code: 'REGULATOR_REQUIRED', evidence: { reason: evidence } };
  return { ok: true };
};

/** a critical-priority work order crosses to the regulator: one must be a party. */
export const regulatorPresentIfCritical: Guard = (ctx): GuardVerdict => {
  const priority = ('priority' in ctx.input ? ctx.input['priority'] : ctx.txn.fields['priority']);
  return requireRegulatorWhen(ctx, priority === 'critical', { priority });
};

/** live-work or a confined-space permit crosses to the regulator: one must be a party. */
export const regulatorPresentIfHighHazard: Guard = (ctx): GuardVerdict => {
  const get = (k: string): Json | undefined => (k in ctx.input ? ctx.input[k] : ctx.txn.fields[k]);
  const highHazard = get('live_work') === true || get('work_class') === 'confined_space';
  return requireRegulatorWhen(ctx, highHazard, { live_work: get('live_work') ?? null, work_class: get('work_class') ?? null });
};

export const GUARDS: Record<string, Guard> = {
  counterpartyDistinct,
  complianceHaltClear,
  executionEvidencePresent,
  regulatorPresentIfStrategic,
  creditApprovalPresent,
  cpEvidencePresent,
  serialRangeConsistent,
  completenessEvidencePresent,
  regulatorPresentIfCritical,
  regulatorPresentIfHighHazard,
};
