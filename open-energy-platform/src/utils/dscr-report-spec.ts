// ═══════════════════════════════════════════════════════════════════════════════
// W212 — IPP Revenue Bond / DSCR Reporting
// REIPPPP Schedule 2 + DFI covenant requirements + Basel III/LMA
// ═══════════════════════════════════════════════════════════════════════════════

export type DscrStatus =
  | 'data_gathering'       // collecting revenue, O&M, debt service figures
  | 'calculation'          // DSCR computed internally
  | 'ie_review'            // Independent Engineer reviewing the calculation
  | 'ie_certified'         // IE sign-off issued
  | 'dfi_submitted'        // report sent to DFI(s) / lenders
  | 'dfi_queries'          // DFI has queries on the numbers
  | 'queries_responded'    // IPP responded to queries
  | 'accepted'             // DFI accepted the report; terminal +
  | 'covenant_breach'      // DSCR below minimum covenant; terminal (triggers W38/W45)
  | 'withdrawn';           // report withdrawn (e.g. restatement needed); terminal

export type DscrAction =
  | 'start_calculation'
  | 'submit_to_ie'
  | 'ie_certify'
  | 'submit_to_dfi'
  | 'raise_dfi_query'
  | 'respond_to_queries'
  | 'accept'
  | 'flag_breach'
  | 'withdraw'
  | 'sla_breach';

export type DscrTier =
  | 'emerging'       // smaller IPP < 50MW; lenient
  | 'standard'       // 50MW–300MW
  | 'large'          // >300MW
  | 'systemically_important'; // DoE / Eskom-related; strictest scrutiny

// INVERTED SLA: larger/more systemically important → more time for review
export function deriveDscrSla(tier: DscrTier): number {
  const DAYS: Record<DscrTier, number> = {
    emerging:               21,
    standard:               30,
    large:                  45,
    systemically_important: 60,
  };
  return DAYS[tier] ?? 30;
}

export const DSCR_HARD_TERMINALS = new Set<DscrStatus>(['accepted', 'covenant_breach', 'withdrawn']);

export const DSCR_VALID_TRANSITIONS: Record<DscrStatus, DscrAction[]> = {
  data_gathering:    ['start_calculation', 'withdraw', 'sla_breach'],
  calculation:       ['submit_to_ie', 'flag_breach', 'sla_breach'],
  ie_review:         ['ie_certify', 'sla_breach'],
  ie_certified:      ['submit_to_dfi', 'sla_breach'],
  dfi_submitted:     ['raise_dfi_query', 'accept', 'sla_breach'],
  dfi_queries:       ['respond_to_queries', 'sla_breach'],
  queries_responded: ['accept', 'raise_dfi_query', 'flag_breach', 'sla_breach'],
  accepted:          [],
  covenant_breach:   [],
  withdrawn:         [],
};

export const DSCR_STATE_TRANSITIONS: Record<DscrAction, DscrStatus> = {
  start_calculation:    'calculation',
  submit_to_ie:         'ie_review',
  ie_certify:           'ie_certified',
  submit_to_dfi:        'dfi_submitted',
  raise_dfi_query:      'dfi_queries',
  respond_to_queries:   'queries_responded',
  accept:               'accepted',
  flag_breach:          'covenant_breach',
  withdraw:             'withdrawn',
  sla_breach:           'data_gathering',
};

// Regulator crossings
export function dscrCrossesIntoRegulator(action: DscrAction, tier: DscrTier): boolean {
  // covenant breach always crosses — REIPPPP/DFI reportable event
  if (action === 'flag_breach') return true;
  // accept for large/systemically_important → mandatory disclosure
  if (action === 'accept') return tier === 'large' || tier === 'systemically_important';
  return false;
}

export function dscrSlaBreachCrossesIntoRegulator(tier: DscrTier): boolean {
  return tier === 'large' || tier === 'systemically_important';
}
