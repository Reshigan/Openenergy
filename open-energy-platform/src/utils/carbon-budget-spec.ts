// ═══════════════════════════════════════════════════════════════════════════════
// W226 — Carbon Budget Management & Carbon Tax Compliance Specification
// Carbon Tax Act Phase 2 (2026): 15% combustion, 10% fugitive offset allowances
// SARS Carbon Tax Account (CTA) + DFFE COAS + eFiling workflow
// ═══════════════════════════════════════════════════════════════════════════════

export type CbStatus =
  | 'draft'
  | 'data_entered'
  | 'scope_calculated'
  | 'allowance_computed'
  | 'credits_selected'
  | 'coas_submitted'
  | 'credits_retired'
  | 'sars_prepared'
  | 'efiling_ready'
  | 'sars_submitted'
  | 'accepted'
  | 'queried'
  | 'responded'
  | 'final'
  | 'appeal';

export type CbAction =
  | 'enter_data'
  | 'calculate_scope'
  | 'compute_allowance'
  | 'select_credits'
  | 'submit_coas'
  | 'confirm_retirement'
  | 'prepare_sars'
  | 'generate_efiling'
  | 'submit_to_sars'
  | 'sars_accept'
  | 'sars_query'
  | 'respond_query'
  | 'finalise'
  | 'lodge_appeal'
  | 'sla_breach';

export type CbTier =
  | 'small'    // 30,000–100,000 tCO2e/yr
  | 'medium'   // 100,000–500,000 tCO2e/yr
  | 'large'    // 500,000–2,000,000 tCO2e/yr
  | 'major';   // >2,000,000 tCO2e/yr

// INVERTED SLA — larger emitter = deeper audit = more time
export function deriveCbSla(tier: CbTier): number {
  const DAYS: Record<CbTier, number> = {
    small: 30, medium: 60, large: 90, major: 120,
  };
  return DAYS[tier] ?? 60;
}

export const CB_HARD_TERMINALS = new Set<CbStatus>(['final', 'appeal']);

export const CB_VALID_TRANSITIONS: Record<CbStatus, CbAction[]> = {
  draft:             ['enter_data', 'sla_breach'],
  data_entered:      ['calculate_scope', 'sla_breach'],
  scope_calculated:  ['compute_allowance', 'sla_breach'],
  allowance_computed:['select_credits', 'sla_breach'],
  credits_selected:  ['submit_coas', 'sla_breach'],
  coas_submitted:    ['confirm_retirement', 'sla_breach'],
  credits_retired:   ['prepare_sars', 'sla_breach'],
  sars_prepared:     ['generate_efiling', 'sla_breach'],
  efiling_ready:     ['submit_to_sars', 'sla_breach'],
  sars_submitted:    ['sars_accept', 'sars_query', 'sla_breach'],
  accepted:          ['finalise', 'sla_breach'],
  queried:           ['respond_query', 'lodge_appeal', 'sla_breach'],
  responded:         ['sars_accept', 'sars_query', 'lodge_appeal', 'sla_breach'],
  final:             [],
  appeal:            [],
};

export const CB_STATE_TRANSITIONS: Record<CbAction, CbStatus> = {
  enter_data:         'data_entered',
  calculate_scope:    'scope_calculated',
  compute_allowance:  'allowance_computed',
  select_credits:     'credits_selected',
  submit_coas:        'coas_submitted',
  confirm_retirement: 'credits_retired',
  prepare_sars:       'sars_prepared',
  generate_efiling:   'efiling_ready',
  submit_to_sars:     'sars_submitted',
  sars_accept:        'accepted',
  sars_query:         'queried',
  respond_query:      'responded',
  finalise:           'final',
  lodge_appeal:       'appeal',
  sla_breach:         'queried',
};

export function cbCrossesIntoRegulator(action: CbAction, tier: CbTier): boolean {
  if (action === 'sla_breach') return true;
  if (action === 'lodge_appeal') return true;
  if (action === 'sars_accept') return tier === 'large' || tier === 'major';
  return false;
}

// All carbon budget SLA breaches are reportable — tax compliance is a hard statutory deadline
export function cbSlaBreachCrossesIntoRegulator(_tier: CbTier): boolean {
  return true;
}
