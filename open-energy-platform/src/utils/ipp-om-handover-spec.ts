// W149 — IPP O&M Handover Pack & H&S File
// OHSA §8 + IEC 62446-1 + NERSA Grid Code §C-5
// INVERTED SLA: larger plant = more review time (more documents)
// SIGNATURE: accept_handover crosses regulator EVERY tier (COD gate);
//            reject_handover crosses major/material

export type HandoverStatus =
  | 'compilation'
  | 'internal_review'
  | 'submitted_to_om'
  | 'om_review'
  | 'deficiencies_raised'
  | 'deficiencies_resolved'
  | 'accepted'
  | 'conditional_acceptance'
  | 'rejected'
  | 'superseded'
  | 'archived'
  | 'withdrawn';

export type HandoverAction =
  | 'submit_for_internal_review'
  | 'approve_internal'
  | 'submit_to_om'
  | 'raise_deficiencies'
  | 'resolve_deficiencies'
  | 'accept_handover'
  | 'conditionally_accept'
  | 'reject_handover'
  | 'supersede'
  | 'archive'
  | 'withdraw'
  | 'flag_sla_breach';

export type HandoverTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

// INVERTED SLA: larger plant → more O&M documents → more review time
export const SLA_DAYS: Record<HandoverTier, number> = {
  minor: 14,
  moderate: 21,
  significant: 30,
  major: 45,
  material: 60,
};

export const CAPACITY_TIER_THRESHOLDS: Array<[HandoverTier, number]> = [
  ['material', 200],   // ≥200 MW
  ['major',     50],   // 50–199 MW
  ['significant', 10], // 10–49 MW
  ['moderate',   1],   // 1–9 MW
  ['minor',      0],   // <1 MW
];

export function deriveCapacityTier(capacity_mw: number): HandoverTier {
  for (const [tier, threshold] of CAPACITY_TIER_THRESHOLDS) {
    if (capacity_mw >= threshold) return tier;
  }
  return 'minor';
}

export const HARD_TERMINALS: HandoverStatus[] = [
  'accepted', 'rejected', 'superseded', 'archived', 'withdrawn',
];

export const VALID_TRANSITIONS: Partial<Record<HandoverStatus, HandoverStatus[]>> = {
  compilation:            ['internal_review', 'withdrawn'],
  internal_review:        ['submitted_to_om', 'compilation'],
  submitted_to_om:        ['om_review'],
  om_review:              ['accepted', 'conditional_acceptance', 'deficiencies_raised', 'rejected'],
  deficiencies_raised:    ['deficiencies_resolved', 'withdrawn'],
  deficiencies_resolved:  ['om_review'],
  conditional_acceptance: ['accepted', 'deficiencies_raised'],
};

export function crossesIntoRegulator(action: HandoverAction, tier: HandoverTier): boolean {
  if (action === 'accept_handover') return true;  // EVERY tier — COD gate
  if (action === 'reject_handover' && (tier === 'major' || tier === 'material')) return true;
  return false;
}

export type HandoverCategory =
  | 'hs_file'          // OHSA §8 Health & Safety file
  | 'om_manual'        // IEC 62446-1 O&M manual
  | 'as_built'         // As-built drawings
  | 'equipment_data'   // Equipment data books / FAT records
  | 'warranties'       // Equipment warranties & guarantees
  | 'commissioning'    // Commissioning records & test reports
  | 'training'         // Training records & competency sign-offs
  | 'full_pack';       // Combined pack (all of the above)
