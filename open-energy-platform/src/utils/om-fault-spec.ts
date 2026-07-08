// om fault lifecycle guard — statuses from migration 058 (om_faults.status).
// Pure; routes in esums-om.ts do the DB wiring. Spec: docs/superpowers/specs/
// 2026-07-08-esco-depth-l4.md

export type OmFaultStatus =
  | 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed' | 'false_positive';

export interface GuardResult {
  ok: boolean;
  reason_code?: string;
}

export const FAULT_TRANSITIONS: Record<OmFaultStatus, OmFaultStatus[]> = {
  open: ['acknowledged', 'in_progress', 'resolved', 'false_positive'],
  acknowledged: ['in_progress', 'resolved', 'false_positive'],
  in_progress: ['resolved', 'false_positive'],
  resolved: ['closed'],
  closed: [],
  false_positive: [],
};

export function canTransitionFault(from: OmFaultStatus, to: OmFaultStatus): GuardResult {
  const allowed = FAULT_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    return { ok: false, reason_code: 'FAULT_INVALID_TRANSITION' };
  }
  return { ok: true };
}

// Mirrors the map; used as static SQL literal in WO auto-resolve UPDATE.
export const FAULT_RESOLVABLE_STATUSES: readonly OmFaultStatus[] =
  ['open', 'acknowledged', 'in_progress'];
