// W148 — IPP Final Completion Certificate & Retention Release
// JBCC 6.2 Cl.27-29 + NEC4 Cl.53-54
// INVERTED SLA: larger contract = more scrutiny time
// SIGNATURE: issue_fcc crosses regulator EVERY tier (market-entry signal);
//            reject_application crosses major/material

export type FccStatus =
  | 'application_submitted'
  | 'defects_outstanding'
  | 'inspection_scheduled'
  | 'inspection_complete'
  | 'snag_list_issued'
  | 'snag_list_cleared'
  | 'fcc_issued'
  | 'retention_released'
  | 'disputed'
  | 'adjudicated'
  | 'withdrawn'
  | 'rejected';

export type FccAction =
  | 'schedule_inspection'
  | 'complete_inspection'
  | 'issue_snag_list'
  | 'clear_snag_list'
  | 'issue_fcc'
  | 'release_retention'
  | 'reject_application'
  | 'dispute_rejection'
  | 'refer_adjudication'
  | 'withdraw_application'
  | 'flag_sla_breach';

export type ContractTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

// INVERTED SLA: larger contract → more review time (NERSA scrutiny on big plants)
export const SLA_DAYS: Record<ContractTier, number> = {
  minor: 21,
  moderate: 30,
  significant: 45,
  major: 60,
  material: 90,
};

// Contract value thresholds (ZAR) for tier classification
export const CONTRACT_TIER_THRESHOLDS: Array<[ContractTier, number]> = [
  ['material', 500_000_000],
  ['major',    100_000_000],
  ['significant', 25_000_000],
  ['moderate',   5_000_000],
  ['minor', 0],
];

export function deriveContractTier(value: number): ContractTier {
  for (const [tier, threshold] of CONTRACT_TIER_THRESHOLDS) {
    if (value >= threshold) return tier;
  }
  return 'minor';
}

export const HARD_TERMINALS: FccStatus[] = [
  'retention_released', 'adjudicated', 'withdrawn', 'rejected',
];

// Valid state transitions
export const VALID_TRANSITIONS: Partial<Record<FccStatus, FccStatus[]>> = {
  application_submitted:  ['inspection_scheduled', 'defects_outstanding', 'rejected'],
  defects_outstanding:    ['application_submitted', 'withdrawn'],
  inspection_scheduled:   ['inspection_complete'],
  inspection_complete:    ['fcc_issued', 'snag_list_issued'],
  snag_list_issued:       ['snag_list_cleared', 'disputed'],
  snag_list_cleared:      ['fcc_issued'],
  fcc_issued:             ['retention_released', 'disputed'],
  disputed:               ['adjudicated', 'fcc_issued', 'rejected'],
  // hard terminals have no outbound transitions
};

export function crossesIntoRegulator(action: FccAction, tier: ContractTier): boolean {
  // SIGNATURE: issue_fcc crosses regulator EVERY tier (grid connection milestone)
  if (action === 'issue_fcc') return true;
  // reject_application crosses major/material (large project denial)
  if (action === 'reject_application' && (tier === 'major' || tier === 'material')) return true;
  // adjudication always reportable
  if (action === 'refer_adjudication') return true;
  return false;
}
