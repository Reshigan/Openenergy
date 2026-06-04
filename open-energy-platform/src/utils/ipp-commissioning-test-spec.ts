// W152 — IPP Commissioning Test Protocol & Performance Certificate
// IEC 61724-1 (PV performance monitoring) + NERSA Grid Code §C-5 + REIPPPP Schedule 12
// PAC/FAC framework with structured hold points and punch-list gates
// INVERTED SLA: larger plant capacity = more test duration required = more time
// SIGNATURE: issue_performance_cert crosses regulator EVERY tier (COD prerequisite gate)

export type CommissioningStatus =
  | 'test_plan_submitted'
  | 'witness_inspection'
  | 'hold_point_open'
  | 'hold_point_cleared'
  | 'performance_test_running'
  | 'punch_list_issued'
  | 'punch_list_cleared'
  | 'pac_recommended'
  | 'pac_issued'
  | 'performance_test_running_post_pac'
  | 'fac_recommended'
  | 'performance_cert_issued'
  | 'test_failed'
  | 'withdrawn';

export type CommissioningAction =
  | 'commence_witness_inspection'
  | 'open_hold_point'
  | 'clear_hold_point'
  | 'start_performance_test'
  | 'issue_punch_list'
  | 'clear_punch_list'
  | 'recommend_pac'
  | 'issue_pac'
  | 'start_post_pac_test'
  | 'recommend_fac'
  | 'issue_performance_cert'
  | 'declare_test_failure'
  | 'withdraw'
  | 'flag_sla_breach';

export type CapacityTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

// INVERTED SLA: larger plant = longer test duration required (days from submission)
export const SLA_DAYS: Record<CapacityTier, number> = {
  minor:        21,
  moderate:     30,
  significant:  45,
  major:        60,
  material:     90,
};

// Tier derived from installed capacity (MW)
export const CAPACITY_TIER_THRESHOLDS: Array<[CapacityTier, number]> = [
  ['material',  200],
  ['major',      50],
  ['significant', 10],
  ['moderate',    1],
  ['minor',       0],
];

export function deriveCapacityTier(mw: number): CapacityTier {
  for (const [tier, threshold] of CAPACITY_TIER_THRESHOLDS) {
    if (mw >= threshold) return tier;
  }
  return 'minor';
}

export const HARD_TERMINALS: CommissioningStatus[] = ['performance_cert_issued', 'test_failed', 'withdrawn'];

export const VALID_TRANSITIONS: Partial<Record<CommissioningStatus, CommissioningStatus[]>> = {
  test_plan_submitted:             ['witness_inspection', 'withdrawn'],
  witness_inspection:              ['hold_point_open', 'performance_test_running', 'withdrawn'],
  hold_point_open:                 ['hold_point_cleared', 'test_failed'],
  hold_point_cleared:              ['performance_test_running', 'hold_point_open'],
  performance_test_running:        ['punch_list_issued', 'pac_recommended', 'test_failed'],
  punch_list_issued:               ['punch_list_cleared', 'test_failed'],
  punch_list_cleared:              ['pac_recommended', 'test_failed'],
  pac_recommended:                 ['pac_issued', 'test_failed'],
  pac_issued:                      ['performance_test_running_post_pac'],
  performance_test_running_post_pac: ['fac_recommended', 'punch_list_issued', 'test_failed'],
  fac_recommended:                 ['performance_cert_issued', 'test_failed'],
};

export type TestCategory = 'string_iv_test' | 'ac_performance_test' | 'protection_relay_test' | 'grid_compliance_test' | 'full_commissioning';

export function crossesIntoRegulator(action: CommissioningAction, tier: CapacityTier): boolean {
  if (action === 'issue_performance_cert') return true; // EVERY tier — COD prerequisite
  if (action === 'declare_test_failure' && (tier === 'major' || tier === 'material')) return true;
  return false;
}
