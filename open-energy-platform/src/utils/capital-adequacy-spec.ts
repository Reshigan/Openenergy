// ═══════════════════════════════════════════════════════════════════════════════
// W203 — Basel III Regulatory Capital & RWA Adequacy Report
// SARB BA 900 + Basel III / CRR III Pillar 2 ICAAP + SARB Directive 1/2014
// ═══════════════════════════════════════════════════════════════════════════════

export type CapStatus =
  | 'data_gathering'
  | 'rwa_calculation'
  | 'capital_aggregation'
  | 'icaap_review'
  | 'board_review'
  | 'submitted_sarb'
  | 'under_review'
  | 'queries_raised'
  | 'queries_responded'
  | 'accepted'         // terminal +
  | 'remediation_required'
  | 'remediation'
  | 'capital_breach'   // terminal — CET1 or Total Capital below minimum
  | 'withdrawn';       // terminal (filing withdrawn, must refile)

export type CapAction =
  | 'start_rwa_calc'
  | 'complete_rwa_calc'
  | 'aggregate_capital'
  | 'complete_icaap'
  | 'board_approve'
  | 'submit_to_sarb'
  | 'sarb_raises_queries'
  | 'respond_to_queries'
  | 'sarb_accept'
  | 'flag_remediation'
  | 'start_remediation'
  | 'refile'
  | 'declare_capital_breach'
  | 'withdraw'
  | 'sla_breach';

export type BankTier = 'smaller' | 'mid_tier' | 'large' | 'systemically_important';

// INVERTED SLA: larger/more systemic banks get more time (greater complexity)
export function deriveCapSla(bankTier: BankTier): number {
  const DAYS: Record<BankTier, number> = {
    smaller:               30,
    mid_tier:              45,
    large:                 60,
    systemically_important: 90,
  };
  return DAYS[bankTier] ?? 45;
}

export const CAP_HARD_TERMINALS = new Set<CapStatus>([
  'accepted', 'capital_breach', 'withdrawn',
]);

export const CAP_VALID_TRANSITIONS: Record<CapStatus, CapAction[]> = {
  data_gathering:      ['start_rwa_calc', 'sla_breach'],
  rwa_calculation:     ['complete_rwa_calc', 'sla_breach'],
  capital_aggregation: ['complete_icaap', 'declare_capital_breach', 'sla_breach'],
  icaap_review:        ['board_approve', 'declare_capital_breach', 'sla_breach'],
  board_review:        ['submit_to_sarb', 'declare_capital_breach', 'sla_breach'],
  submitted_sarb:      ['sarb_raises_queries', 'sarb_accept', 'sla_breach'],
  under_review:        ['sarb_raises_queries', 'sarb_accept', 'flag_remediation', 'sla_breach'],
  queries_raised:      ['respond_to_queries', 'sla_breach'],
  queries_responded:   ['sarb_accept', 'flag_remediation', 'sla_breach'],
  remediation_required: ['start_remediation', 'sla_breach'],
  remediation:         ['refile', 'declare_capital_breach', 'sla_breach'],
  accepted:            [],
  capital_breach:      [],
  withdrawn:           [],
};

export const CAP_STATE_TRANSITIONS: Record<CapAction, CapStatus> = {
  start_rwa_calc:          'rwa_calculation',
  complete_rwa_calc:       'capital_aggregation',
  aggregate_capital:       'capital_aggregation',
  complete_icaap:          'icaap_review',
  board_approve:           'board_review',
  submit_to_sarb:          'submitted_sarb',
  sarb_raises_queries:     'queries_raised',
  respond_to_queries:      'queries_responded',
  sarb_accept:             'accepted',
  flag_remediation:        'remediation_required',
  start_remediation:       'remediation',
  refile:                  'submitted_sarb',
  declare_capital_breach:  'capital_breach',
  withdraw:                'withdrawn',
  sla_breach:              'data_gathering',
};

// Regulator inbox crossings (SARB)
export function capCrossesIntoRegulator(action: CapAction, bankTier: BankTier): boolean {
  // submit_to_sarb, sarb_accept, declare_capital_breach → ALL tiers (always)
  if (['submit_to_sarb', 'sarb_accept', 'declare_capital_breach'].includes(action)) return true;
  // flag_remediation, refile → mid_tier and above
  if (['flag_remediation', 'refile'].includes(action)) {
    return bankTier !== 'smaller';
  }
  return false;
}

export function capSlaBreachCrossesIntoRegulator(bankTier: BankTier): boolean {
  return bankTier !== 'smaller'; // all tiers except smallest
}
