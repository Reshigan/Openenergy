// ═══════════════════════════════════════════════════════════════════════════════
// W218 — IPP Offtake Credit Insurance Lifecycle
// ECIC / ATIDI / Lloyd's / World Bank MIGA political risk + credit insurance
// ═══════════════════════════════════════════════════════════════════════════════

export type CiStatus =
  | 'application'           // policy application submitted
  | 'underwriting'          // insurer underwriting assessment
  | 'terms_issued'          // indicative terms / term-sheet issued
  | 'negotiation'           // policy wording negotiation
  | 'bound'                 // policy bound / inception
  | 'active'                // policy in force; annual premium cycle
  | 'renewal_due'           // approaching annual renewal
  | 'claim_lodged'          // payment default or political event; claim filed
  | 'claim_assessed'        // insurer assessing claim
  | 'claim_paid'            // claim approved and paid; terminal +
  | 'lapsed'                // policy lapsed / premium unpaid; terminal
  | 'cancelled'             // cancelled by either party; terminal
  | 'declined';             // application / claim declined; terminal

export type CiAction =
  | 'commence_underwriting'
  | 'issue_terms'
  | 'commence_negotiation'
  | 'bind_policy'
  | 'activate'
  | 'flag_renewal'
  | 'lodge_claim'
  | 'complete_assessment'
  | 'pay_claim'
  | 'lapse'
  | 'cancel'
  | 'decline'
  | 'sla_breach';

export type CiTier =
  | 'short_term'         // 1–3 year cover; standard SME
  | 'medium_term'        // 3–7 years
  | 'long_term'          // 7–15 years (most REIPPPP PPAs)
  | 'project_finance';   // 15–25 years; ECIC/MIGA; full project finance cover

// INVERTED SLA: longer tenors have deeper underwriting and more time to process
export function deriveCiSla(tier: CiTier): number {
  const DAYS: Record<CiTier, number> = {
    short_term:      14,
    medium_term:     30,
    long_term:       60,
    project_finance: 90,
  };
  return DAYS[tier] ?? 30;
}

export const CI_HARD_TERMINALS = new Set<CiStatus>([
  'claim_paid', 'lapsed', 'cancelled', 'declined',
]);

export const CI_VALID_TRANSITIONS: Record<CiStatus, CiAction[]> = {
  application:     ['commence_underwriting', 'decline', 'cancel', 'sla_breach'],
  underwriting:    ['issue_terms', 'decline', 'sla_breach'],
  terms_issued:    ['commence_negotiation', 'cancel', 'sla_breach'],
  negotiation:     ['bind_policy', 'cancel', 'sla_breach'],
  bound:           ['activate', 'cancel', 'sla_breach'],
  active:          ['flag_renewal', 'lodge_claim', 'lapse', 'cancel', 'sla_breach'],
  renewal_due:     ['activate', 'lapse', 'cancel', 'sla_breach'],
  claim_lodged:    ['complete_assessment', 'sla_breach'],
  claim_assessed:  ['pay_claim', 'decline', 'sla_breach'],
  claim_paid:      [],
  lapsed:          [],
  cancelled:       [],
  declined:        [],
};

export const CI_STATE_TRANSITIONS: Record<CiAction, CiStatus> = {
  commence_underwriting: 'underwriting',
  issue_terms:           'terms_issued',
  commence_negotiation:  'negotiation',
  bind_policy:           'bound',
  activate:              'active',
  flag_renewal:          'renewal_due',
  lodge_claim:           'claim_lodged',
  complete_assessment:   'claim_assessed',
  pay_claim:             'claim_paid',
  lapse:                 'lapsed',
  cancel:                'cancelled',
  decline:               'declined',
  sla_breach:            'application',
};

// Regulator crossings
export function ciCrossesIntoRegulator(action: CiAction, tier: CiTier): boolean {
  // Claim payment always crosses — ECIC/ATIDI payment is reportable to SARB/NT
  if (action === 'pay_claim') return true;
  // Lapse for project finance is systemic risk — reportable
  if (action === 'lapse') return tier === 'project_finance';
  // Policy binding for project_finance / long_term — large exposure reporting
  if (action === 'bind_policy') return tier === 'project_finance' || tier === 'long_term';
  return false;
}

export function ciSlaBreachCrossesIntoRegulator(tier: CiTier): boolean {
  return tier === 'project_finance' || tier === 'long_term';
}
