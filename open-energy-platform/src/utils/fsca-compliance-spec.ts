// ═══════════════════════════════════════════════════════════════════════════════
// W201 — FSCA Annual Compliance Certificate & Compliance Officer Report
// FAIS Act §17 + Conduct Standard 1/2021 (Annual Compliance Report)
// ═══════════════════════════════════════════════════════════════════════════════

export type FsccStatus =
  | 'report_scheduled'
  | 'data_gathering'
  | 'drafting'
  | 'internal_review'
  | 'co_sign_off'
  | 'submitted'
  | 'under_review'
  | 'queries_received'
  | 'queries_responded'
  | 'filed'          // terminal + (clean outcome)
  | 'deficiency_found'
  | 'remediation'
  | 'refiled'        // terminal + (after remediation)
  | 'revocation_risk'; // terminal — licence at risk

export type FsccAction =
  | 'open_period'
  | 'start_data_gathering'
  | 'start_drafting'
  | 'submit_for_internal_review'
  | 'request_co_sign_off'
  | 'co_sign'
  | 'submit_to_fsca'
  | 'fsca_raises_queries'
  | 'respond_to_queries'
  | 'file_clean'
  | 'flag_deficiency'
  | 'start_remediation'
  | 'refile'
  | 'flag_revocation_risk'
  | 'sla_breach';

export type FspClass = 'micro' | 'standard' | 'large' | 'systemic';

// INVERTED SLA: larger FSP = more scrutiny time, same filing deadline
export function deriveFsccSla(fspClass: FspClass): number {
  const DAYS: Record<FspClass, number> = {
    micro:    30,
    standard: 45,
    large:    60,
    systemic: 90,
  };
  return DAYS[fspClass] ?? 45;
}

export const FSCC_HARD_TERMINALS = new Set<FsccStatus>([
  'filed', 'refiled', 'revocation_risk',
]);

// Valid transitions map
export const FSCC_VALID_TRANSITIONS: Record<FsccStatus, FsccAction[]> = {
  report_scheduled:  ['open_period', 'sla_breach'],
  data_gathering:    ['start_drafting', 'sla_breach'],
  drafting:          ['submit_for_internal_review', 'sla_breach'],
  internal_review:   ['request_co_sign_off', 'flag_deficiency', 'sla_breach'],
  co_sign_off:       ['co_sign', 'flag_deficiency', 'sla_breach'],
  submitted:         ['fsca_raises_queries', 'file_clean', 'sla_breach'],
  under_review:      ['fsca_raises_queries', 'file_clean', 'flag_revocation_risk', 'sla_breach'],
  queries_received:  ['respond_to_queries', 'sla_breach'],
  queries_responded: ['file_clean', 'flag_revocation_risk', 'sla_breach'],
  deficiency_found:  ['start_remediation', 'sla_breach'],
  remediation:       ['refile', 'flag_revocation_risk', 'sla_breach'],
  filed:             [],
  refiled:           [],
  revocation_risk:   [],
};

export const FSCC_STATE_TRANSITIONS: Record<FsccAction, FsccStatus> = {
  open_period:             'data_gathering',
  start_data_gathering:    'data_gathering',
  start_drafting:          'drafting',
  submit_for_internal_review: 'internal_review',
  request_co_sign_off:     'co_sign_off',
  co_sign:                 'submitted',
  submit_to_fsca:          'under_review',
  fsca_raises_queries:     'queries_received',
  respond_to_queries:      'queries_responded',
  file_clean:              'filed',
  flag_deficiency:         'deficiency_found',
  start_remediation:       'remediation',
  refile:                  'refiled',
  flag_revocation_risk:    'revocation_risk',
  sla_breach:              'report_scheduled', // stays in place, flag set
};

// Regulator inbox crossings (FSCA)
export function fsccCrossesIntoRegulator(action: FsccAction, _fspClass: FspClass): boolean {
  // submit_to_fsca, file_clean, refiled, flag_revocation_risk → ALL tiers
  return ['co_sign', 'file_clean', 'refile', 'flag_revocation_risk', 'flag_deficiency'].includes(action);
}

export function fsccSlaBreachCrossesIntoRegulator(_fspClass: FspClass): boolean {
  return true; // ALL FSP tiers — filing deadline miss is always reportable
}
