// W154 — IPP Third-Party Access & Wheeling Agreement
// ERA §22 + NERSA Grid Code §C-2 + Eskom Transmission TPA Guidelines
// Required when IPP sells cross-network to off-takers not on same MV grid
// INVERTED SLA: larger wheeling capacity = more commercial complexity = more time
// SIGNATURE: sign_tpa_agreement crosses regulator EVERY tier (wheeling activation notifiable)

export type TpaStatus =
  | 'tpa_application_submitted'
  | 'network_owner_review'
  | 'technical_assessment'
  | 'commercial_terms_proposed'
  | 'negotiation_in_progress'
  | 'terms_agreed'
  | 'tpa_agreement_signed'
  | 'wheeling_active'
  | 'application_rejected'
  | 'appeal_filed'
  | 'appeal_determined'
  | 'withdrawn';

export type TpaAction =
  | 'commence_review'
  | 'commence_technical_assessment'
  | 'propose_commercial_terms'
  | 'commence_negotiation'
  | 'agree_terms'
  | 'sign_tpa_agreement'
  | 'activate_wheeling'
  | 'reject_application'
  | 'file_appeal'
  | 'determine_appeal'
  | 'withdraw'
  | 'flag_sla_breach';

export type WheelCapacityTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

export type TpaCategory = 'eskom_transmission' | 'eskom_distribution' | 'municipality' | 'private_network';

// INVERTED SLA: larger wheeling capacity → more commercial complexity → more time (days)
export const SLA_DAYS: Record<WheelCapacityTier, number> = {
  minor:        30,
  moderate:     45,
  significant:  60,
  major:        90,
  material:    120,
};

// Tier derived from wheeling capacity (MW)
export const CAPACITY_TIER_THRESHOLDS: Array<[WheelCapacityTier, number]> = [
  ['material',  200],
  ['major',      50],
  ['significant', 10],
  ['moderate',    1],
  ['minor',       0],
];

export function deriveCapacityTier(mw: number): WheelCapacityTier {
  for (const [tier, threshold] of CAPACITY_TIER_THRESHOLDS) {
    if (mw >= threshold) return tier;
  }
  return 'minor';
}

export const HARD_TERMINALS: TpaStatus[] = ['wheeling_active', 'withdrawn'];

export const VALID_TRANSITIONS: Partial<Record<TpaStatus, TpaStatus[]>> = {
  tpa_application_submitted:  ['network_owner_review', 'withdrawn'],
  network_owner_review:       ['technical_assessment', 'application_rejected', 'withdrawn'],
  technical_assessment:       ['commercial_terms_proposed', 'application_rejected', 'withdrawn'],
  commercial_terms_proposed:  ['negotiation_in_progress', 'application_rejected', 'withdrawn'],
  negotiation_in_progress:    ['terms_agreed', 'application_rejected', 'withdrawn'],
  terms_agreed:               ['tpa_agreement_signed', 'withdrawn'],
  tpa_agreement_signed:       ['wheeling_active'],
  application_rejected:       ['appeal_filed', 'withdrawn'],
  appeal_filed:               ['appeal_determined'],
  appeal_determined:          ['tpa_application_submitted', 'withdrawn'],
};

export function crossesIntoRegulator(action: TpaAction, tier: WheelCapacityTier): boolean {
  if (action === 'sign_tpa_agreement') return true; // EVERY tier — wheeling activation notifiable
  if (action === 'reject_application' && (tier === 'major' || tier === 'material')) return true;
  return false;
}
