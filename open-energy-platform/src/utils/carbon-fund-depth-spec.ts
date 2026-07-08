// carbon_fund L4 depth guards — MRV workflow (carbon_mrv_workflow),
// vintage workflow (carbon_vintage_workflow), retirement certificates
// (carbon_retirement_certificates). Pure functions; routes in
// carbon-registry.ts do the DB wiring. Spec: docs/superpowers/specs/
// 2026-07-08-carbon-fund-depth-l4.md

export type MrvStatus =
  | 'draft' | 'submitted' | 'under_verification' | 'verified' | 'rejected' | 'published';

export type VintageStage =
  | 'validated' | 'listed' | 'traded' | 'retired_partial' | 'retired_full' | 'expired';

export type CertStatus = 'queued' | 'issued' | 'delivered' | 'revoked';

export interface GuardResult {
  ok: boolean;
  reason_code?: string;
}

export const MRV_TRANSITIONS: Record<MrvStatus, MrvStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_verification', 'rejected'],
  under_verification: ['verified', 'rejected'],
  verified: ['published'],
  rejected: ['submitted'],
  published: [],
};

export function canTransitionMrv(
  from: MrvStatus,
  to: MrvStatus,
  opts?: { rejection_reason?: string | null },
): GuardResult {
  const allowed = MRV_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) return { ok: false, reason_code: 'MRV_INVALID_TRANSITION' };
  if (to === 'rejected' && !String(opts?.rejection_reason || '').trim()) {
    return { ok: false, reason_code: 'MRV_REJECTION_REASON_REQUIRED' };
  }
  return { ok: true };
}

export const VINTAGE_STAGES: VintageStage[] = [
  'validated', 'listed', 'traded', 'retired_partial', 'retired_full', 'expired',
];

export function canAdvanceVintage(from: VintageStage, to: VintageStage): GuardResult {
  const fi = VINTAGE_STAGES.indexOf(from);
  const ti = VINTAGE_STAGES.indexOf(to);
  if (fi === -1 || ti === -1) return { ok: false, reason_code: 'VINTAGE_INVALID_STAGE' };
  if (ti <= fi) return { ok: false, reason_code: 'VINTAGE_NOT_FORWARD' };
  return { ok: true };
}

// Matches the recon tolerance in the L5 section (0.0001 tCO2e).
const VOLUME_EPSILON = 0.0001;

export function certIssueGuard(input: {
  retirement: { id: string; quantity: number } | null | undefined;
  alreadyIssuedTco2e: number;
  requestedTco2e: number;
}): GuardResult {
  if (!input.retirement) return { ok: false, reason_code: 'CERT_RETIREMENT_NOT_FOUND' };
  const req = Number(input.requestedTco2e);
  if (!Number.isFinite(req) || req <= 0) return { ok: false, reason_code: 'CERT_VOLUME_INVALID' };
  if (input.alreadyIssuedTco2e + req > input.retirement.quantity + VOLUME_EPSILON) {
    return { ok: false, reason_code: 'CERT_VOLUME_EXCEEDS_RETIRED' };
  }
  return { ok: true };
}

export function certRevokeGuard(status: CertStatus): GuardResult {
  if (status !== 'issued' && status !== 'delivered') {
    return { ok: false, reason_code: 'CERT_NOT_REVOCABLE' };
  }
  return { ok: true };
}
