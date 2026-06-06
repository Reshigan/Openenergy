// ═══════════════════════════════════════════════════════════════════════════════
// W226 — Certificate Bundle & Attestation Specification
// Cross-track attestation for CDP/JSE ESG/RE100/SBTi disclosure
// ═══════════════════════════════════════════════════════════════════════════════

export type BundleStatus =
  | 'assembling'
  | 'validated'
  | 'issued'
  | 'applied'
  | 'retired'
  | 'expired'
  | 'cancelled';

export type BundleAction =
  | 'submit_for_validation'
  | 'validate'
  | 'issue_certificate'
  | 'apply_to_disclosure'
  | 'retire'
  | 'expire'
  | 'cancel'
  | 'sla_breach';

export type BundleTier =
  | 'basic'          // rec_only or vcm_only
  | 'dual'           // rec + vcm bundled
  | 'comprehensive'  // all three tracks
  | 'institutional'; // comprehensive + W225 scope3 assurance

// SLA in HOURS (bundles are time-sensitive attestations)
export function deriveBundleSla(tier: BundleTier): number {
  const HOURS: Record<BundleTier, number> = {
    basic: 24, dual: 48, comprehensive: 72, institutional: 120,
  };
  return HOURS[tier] ?? 48;
}

export const BUNDLE_HARD_TERMINALS = new Set<BundleStatus>([
  'retired', 'expired', 'cancelled',
]);

export const BUNDLE_VALID_TRANSITIONS: Record<BundleStatus, BundleAction[]> = {
  assembling: ['submit_for_validation', 'cancel', 'sla_breach'],
  validated:  ['issue_certificate', 'cancel', 'sla_breach'],
  issued:     ['apply_to_disclosure', 'retire', 'expire', 'cancel', 'sla_breach'],
  applied:    ['retire', 'expire', 'sla_breach'],
  retired:    [],
  expired:    [],
  cancelled:  [],
};

export const BUNDLE_STATE_TRANSITIONS: Record<BundleAction, BundleStatus> = {
  submit_for_validation: 'validated',
  validate:              'validated',
  issue_certificate:     'issued',
  apply_to_disclosure:   'applied',
  retire:                'retired',
  expire:                'expired',
  cancel:                'cancelled',
  sla_breach:            'expired',
};

export function bundleCrossesIntoRegulator(
  action: BundleAction,
  tier: BundleTier,
): boolean {
  if (action === 'retire') return true;
  if (action === 'issue_certificate') {
    return tier === 'institutional' || tier === 'comprehensive';
  }
  return false;
}

export function bundleSlaBreachCrossesIntoRegulator(tier: BundleTier): boolean {
  return tier === 'institutional' || tier === 'comprehensive';
}
