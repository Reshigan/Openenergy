// W151 — IPP Environmental Compliance Closure & NEMA Closure Certificate
// NEMA 107/1998 §24G + EIA Regulations 2014 (GN R982) + DFFE
// INVERTED SLA: larger disturbed area = more regulatory scrutiny = more time
// SIGNATURE: issue_closure_cert crosses regulator EVERY tier (environmental COD gate)

export type EnvClosureStatus =
  | 'emp_audit_initiated'
  | 'site_inspection'
  | 'audit_report_drafted'
  | 'stakeholder_review'
  | 'remediation_required'
  | 'remediation_complete'
  | 'closure_recommended'
  | 'nema_submission'
  | 'nema_review'
  | 'closure_issued'
  | 'rejected'
  | 'withdrawn';

export type EnvClosureAction =
  | 'commence_inspection'
  | 'draft_report'
  | 'commence_stakeholder_review'
  | 'raise_remediation'
  | 'confirm_remediation'
  | 'recommend_closure'
  | 'submit_to_nema'
  | 'nema_commence_review'
  | 'issue_closure_cert'
  | 'reject_application'
  | 'withdraw'
  | 'flag_sla_breach';

export type AreaTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

export type EiaCategory = 'basic_assessment' | 'scoping_eir' | 'amendments' | 'exemption';

// INVERTED SLA: larger disturbed area → more regulatory time (days from creation)
export const SLA_DAYS: Record<AreaTier, number> = {
  minor:        30,
  moderate:     45,
  significant:  60,
  major:        90,
  material:    120,
};

// Tier derived from disturbed area (ha)
export const AREA_TIER_THRESHOLDS: Array<[AreaTier, number]> = [
  ['material',  500],
  ['major',     200],
  ['significant', 50],
  ['moderate',    5],
  ['minor',       0],
];

export function deriveAreaTier(ha: number): AreaTier {
  for (const [tier, threshold] of AREA_TIER_THRESHOLDS) {
    if (ha >= threshold) return tier;
  }
  return 'minor';
}

export const HARD_TERMINALS: EnvClosureStatus[] = ['closure_issued', 'rejected', 'withdrawn'];

export const VALID_TRANSITIONS: Partial<Record<EnvClosureStatus, EnvClosureStatus[]>> = {
  emp_audit_initiated:   ['site_inspection', 'withdrawn'],
  site_inspection:       ['audit_report_drafted', 'withdrawn'],
  audit_report_drafted:  ['stakeholder_review', 'withdrawn'],
  stakeholder_review:    ['remediation_required', 'closure_recommended', 'withdrawn'],
  remediation_required:  ['remediation_complete', 'withdrawn'],
  remediation_complete:  ['closure_recommended', 'withdrawn'],
  closure_recommended:   ['nema_submission', 'withdrawn'],
  nema_submission:       ['nema_review', 'withdrawn'],
  nema_review:           ['closure_issued', 'rejected'],
};

export function crossesIntoRegulator(action: EnvClosureAction, tier: AreaTier): boolean {
  if (action === 'issue_closure_cert') return true; // EVERY tier — environmental COD gate
  if (action === 'reject_application' && (tier === 'major' || tier === 'material')) return true;
  return false;
}
