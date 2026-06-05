// ═══════════════════════════════════════════════════════════════════════════════
// W210 — Offtaker Green Tariff / PPA Labelling & Disclosure
// GHG Protocol Scope 2 + I-REC Standard + CDP/SBTi + NERSA Green Energy Tariff
// ═══════════════════════════════════════════════════════════════════════════════

export type GtStatus =
  | 'application_received'  // offtaker applies for green tariff / additionality label
  | 'eligibility_check'     // verifying PPA meets green tariff criteria
  | 'attribute_matching'    // matching RECs/GOOs to consumption
  | 'independent_review'    // third-party verifier reviewing match
  | 'review_approved'       // verifier sign-off
  | 'label_issued'          // green label certificate issued
  | 'cdp_submitted'         // submitted to CDP / SBTi / GHG registry
  | 'disclosed'             // public disclosure complete; terminal +
  | 'rejected'              // fails eligibility; terminal
  | 'withdrawn';            // applicant withdraws; terminal

export type GtAction =
  | 'start_eligibility'
  | 'begin_attribute_matching'
  | 'submit_for_review'
  | 'approve_review'
  | 'issue_label'
  | 'submit_to_cdp'
  | 'complete_disclosure'
  | 'reject'
  | 'withdraw'
  | 'sla_breach';

export type GreenTariffClass =
  | 'voluntary'              // voluntary Scope-2 disclosure
  | 'corporate_ppa'          // direct PPA with additionality claim
  | 'utility_green_tariff'   // utility-offered green tariff product
  | 'sbti_aligned';          // SBTi-required RE100 or similar target

// INVERTED SLA: sbti_aligned requires most rigor (more time for review)
export function deriveGtSla(cls: GreenTariffClass): number {
  const DAYS: Record<GreenTariffClass, number> = {
    voluntary:           14,
    utility_green_tariff: 21,
    corporate_ppa:       30,
    sbti_aligned:        45,
  };
  return DAYS[cls] ?? 21;
}

export const GT_HARD_TERMINALS = new Set<GtStatus>(['disclosed', 'rejected', 'withdrawn']);

export const GT_VALID_TRANSITIONS: Record<GtStatus, GtAction[]> = {
  application_received:  ['start_eligibility', 'reject', 'withdraw', 'sla_breach'],
  eligibility_check:     ['begin_attribute_matching', 'reject', 'sla_breach'],
  attribute_matching:    ['submit_for_review', 'reject', 'sla_breach'],
  independent_review:    ['approve_review', 'reject', 'sla_breach'],
  review_approved:       ['issue_label', 'sla_breach'],
  label_issued:          ['submit_to_cdp', 'complete_disclosure', 'sla_breach'],
  cdp_submitted:         ['complete_disclosure', 'sla_breach'],
  disclosed:             [],
  rejected:              [],
  withdrawn:             [],
};

export const GT_STATE_TRANSITIONS: Record<GtAction, GtStatus> = {
  start_eligibility:         'eligibility_check',
  begin_attribute_matching:  'attribute_matching',
  submit_for_review:         'independent_review',
  approve_review:            'review_approved',
  issue_label:               'label_issued',
  submit_to_cdp:             'cdp_submitted',
  complete_disclosure:       'disclosed',
  reject:                    'rejected',
  withdraw:                  'withdrawn',
  sla_breach:                'application_received',
};

// Regulator crossings
export function gtCrossesIntoRegulator(action: GtAction, cls: GreenTariffClass): boolean {
  // issue_label for sbti_aligned/corporate_ppa → always (public claim is regulatory)
  if (action === 'issue_label') return cls === 'sbti_aligned' || cls === 'corporate_ppa';
  // reject → all (false green claim prevented, notify regulator)
  if (action === 'reject') return true;
  return false;
}

export function gtSlaBreachCrossesIntoRegulator(cls: GreenTariffClass): boolean {
  return cls === 'sbti_aligned' || cls === 'corporate_ppa';
}
