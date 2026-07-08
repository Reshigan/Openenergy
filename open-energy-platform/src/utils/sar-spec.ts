// POPIA SAR lifecycle guard — statuses from migration 061 (oe_popia_sar_requests.status).
// Pure; routes in popia-deep.ts do the DB wiring. Spec: docs/superpowers/specs/
// 2026-07-08-admin-depth-l4.md

export type SarStatus =
  | 'open' | 'acknowledged' | 'in_progress' | 'fulfilled' | 'rejected' | 'escalated';

export interface GuardResult {
  ok: boolean;
  reason_code?: string;
}

// Terminal: fulfilled, rejected. in_progress reassignment allowed.
export const SAR_ASSIGNABLE_STATUSES: readonly SarStatus[] =
  ['open', 'acknowledged', 'in_progress', 'escalated'];

export const SAR_RESPONDABLE_STATUSES: readonly SarStatus[] =
  ['open', 'acknowledged', 'in_progress', 'escalated'];

function guard(list: readonly SarStatus[], from: SarStatus): GuardResult {
  if (!list.includes(from)) {
    return { ok: false, reason_code: 'SAR_INVALID_TRANSITION' };
  }
  return { ok: true };
}

export function canAssignSar(from: SarStatus): GuardResult {
  return guard(SAR_ASSIGNABLE_STATUSES, from);
}

export function canRespondSar(from: SarStatus): GuardResult {
  return guard(SAR_RESPONDABLE_STATUSES, from);
}
