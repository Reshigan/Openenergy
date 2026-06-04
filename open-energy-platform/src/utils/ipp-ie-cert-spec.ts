// W153 — IPP Independent Engineer (IE) Milestone Certification
// REIPPPP PPA Schedule 5 + LMA IE role + NERSA §C-5 milestone requirements
// IE certs are the keystone linking IPP-PM milestones to lender drawdowns (W21/W30/W38)
// INVERTED SLA: larger disbursement milestone = more IE scrutiny = more time
// SIGNATURE: issue_cert crosses regulator EVERY tier (unlocks drawdown; notifiable to NERSA)

export type IeCertStatus =
  | 'cert_request_submitted'
  | 'ie_site_visit'
  | 'draft_report'
  | 'borrower_review'
  | 'comments_raised'
  | 'comments_resolved'
  | 'cert_issued'
  | 'cert_rejected'
  | 'withdrawn';

export type IeCertAction =
  | 'commence_site_visit'
  | 'prepare_draft'
  | 'issue_for_borrower_review'
  | 'raise_comments'
  | 'resolve_comments'
  | 'issue_cert'
  | 'reject_certification'
  | 'withdraw'
  | 'flag_sla_breach';

export type MilestoneTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

export type MilestoneCategory =
  | 'financial_close'
  | 'construction_start'
  | 'pac'
  | 'cod'
  | 'fac'
  | 'loan_drawdown';

// INVERTED SLA: larger milestone disbursement → deeper IE review → more time (days)
export const SLA_DAYS: Record<MilestoneTier, number> = {
  minor:        7,
  moderate:     14,
  significant:  21,
  major:        30,
  material:     45,
};

// Tier derived from milestone disbursement value (ZAR)
export const MILESTONE_TIER_THRESHOLDS: Array<[MilestoneTier, number]> = [
  ['material',  500_000_000],
  ['major',     100_000_000],
  ['significant', 25_000_000],
  ['moderate',    5_000_000],
  ['minor',       0],
];

export function deriveMilestoneTier(amountZar: number): MilestoneTier {
  for (const [tier, threshold] of MILESTONE_TIER_THRESHOLDS) {
    if (amountZar >= threshold) return tier;
  }
  return 'minor';
}

export const HARD_TERMINALS: IeCertStatus[] = ['cert_issued', 'cert_rejected', 'withdrawn'];

export const VALID_TRANSITIONS: Partial<Record<IeCertStatus, IeCertStatus[]>> = {
  cert_request_submitted: ['ie_site_visit', 'withdrawn'],
  ie_site_visit:          ['draft_report', 'withdrawn'],
  draft_report:           ['borrower_review', 'withdrawn'],
  borrower_review:        ['comments_raised', 'cert_issued'],
  comments_raised:        ['comments_resolved', 'cert_rejected'],
  comments_resolved:      ['cert_issued', 'cert_rejected'],
};

export function crossesIntoRegulator(action: IeCertAction, tier: MilestoneTier): boolean {
  if (action === 'issue_cert') return true; // EVERY tier — drawdown notifiable
  if (action === 'reject_certification' && (tier === 'major' || tier === 'material')) return true;
  return false;
}
