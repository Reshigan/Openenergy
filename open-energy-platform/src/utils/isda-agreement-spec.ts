export type IsdaStatus =
  | 'draft'
  | 'term_sheet_issued'
  | 'counterparty_review'
  | 'negotiation'
  | 'credit_terms_agreed'
  | 'legal_review'
  | 'regulatory_notification'
  | 'executed'
  | 'active'
  | 'amendment_requested'
  | 'terminated'
  | 'suspended';

export type IsdaAction =
  | 'issue_term_sheet'
  | 'submit_for_counterparty_review'
  | 'open_negotiation'
  | 'agree_credit_terms'
  | 'submit_for_legal_review'
  | 'notify_regulators'
  | 'execute_agreement'
  | 'activate'
  | 'request_amendment'
  | 'approve_amendment'
  | 'terminate'
  | 'suspend';

export type CounterpartyTier = 'bilateral_small' | 'bilateral_medium' | 'bilateral_large' | 'systemic';

export function deriveCounterpartyTier(average_notional_zar: number): CounterpartyTier {
  if (average_notional_zar >= 50_000_000_000) return 'systemic';
  if (average_notional_zar >= 10_000_000_000) return 'bilateral_large';
  if (average_notional_zar >= 1_000_000_000) return 'bilateral_medium';
  return 'bilateral_small';
}

// INVERTED SLA: larger exposure = more regulatory scrutiny = longer window
export function deriveIsdaSlaWindowDays(tier: CounterpartyTier): number {
  return { bilateral_small: 21, bilateral_medium: 30, bilateral_large: 45, systemic: 60 }[tier];
}

export const ISDA_HARD_TERMINALS = new Set<IsdaStatus>(['executed', 'active', 'terminated', 'suspended']);

// active is not truly terminal — amendments re-open it — but we treat executed/active as stable
export const ISDA_SOFT_TERMINALS = new Set<IsdaStatus>(['executed', 'active']);

export const ISDA_VALID_TRANSITIONS: Record<IsdaStatus, IsdaAction[]> = {
  draft:                   ['issue_term_sheet'],
  term_sheet_issued:       ['submit_for_counterparty_review'],
  counterparty_review:     ['open_negotiation', 'terminate'],
  negotiation:             ['agree_credit_terms', 'terminate'],
  credit_terms_agreed:     ['submit_for_legal_review'],
  legal_review:            ['notify_regulators', 'terminate'],
  regulatory_notification: ['execute_agreement', 'terminate'],
  executed:                ['activate'],
  active:                  ['request_amendment', 'terminate', 'suspend'],
  amendment_requested:     ['approve_amendment', 'terminate'],
  terminated:              [],
  suspended:               ['activate', 'terminate'],
};

export const ISDA_STATE_TRANSITIONS: Record<IsdaAction, IsdaStatus> = {
  issue_term_sheet:               'term_sheet_issued',
  submit_for_counterparty_review: 'counterparty_review',
  open_negotiation:               'negotiation',
  agree_credit_terms:             'credit_terms_agreed',
  submit_for_legal_review:        'legal_review',
  notify_regulators:              'regulatory_notification',
  execute_agreement:              'executed',
  activate:                       'active',
  request_amendment:              'amendment_requested',
  approve_amendment:              'active',
  terminate:                      'terminated',
  suspend:                        'suspended',
};

export const ISDA_TRADER_ACTIONS: Set<IsdaAction> = new Set([
  'issue_term_sheet',
  'submit_for_counterparty_review',
  'open_negotiation',
  'agree_credit_terms',
  'submit_for_legal_review',
  'notify_regulators',
  'execute_agreement',
  'activate',
  'request_amendment',
  'approve_amendment',
  'terminate',
  'suspend',
]);

export function crossesIsdaIntoRegulator(
  action: IsdaAction,
  tier: CounterpartyTier,
): boolean {
  // Suspend/terminate always crosses — agreement disruption is always reportable
  if (action === 'suspend' || action === 'terminate') return true;
  // Execute with UMR/large notification crosses for large+systemic (SARB D3/2023 §12)
  if (action === 'execute_agreement' && (tier === 'bilateral_large' || tier === 'systemic')) return true;
  // Regulatory notification phase crosses for systemic (FSCA conduct standard)
  if (action === 'notify_regulators' && tier === 'systemic') return true;
  return false;
}

export type IsdaEvent =
  | 'isda_evt_opened'
  | 'isda_evt_term_sheet_issued'
  | 'isda_evt_counterparty_review'
  | 'isda_evt_negotiation_opened'
  | 'isda_evt_credit_terms_agreed'
  | 'isda_evt_legal_review'
  | 'isda_evt_regulatory_notification'
  | 'isda_evt_executed'
  | 'isda_evt_activated'
  | 'isda_evt_amendment_requested'
  | 'isda_evt_amendment_approved'
  | 'isda_evt_terminated'
  | 'isda_evt_suspended'
  | 'isda_evt_sla_breach';
