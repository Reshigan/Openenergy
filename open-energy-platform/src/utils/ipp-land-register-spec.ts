// W150 — IPP As-Built Survey & Land Register Update
// Deeds Registries Act 47/1937 + NERSA Grid Code §C-5 + SPLUMA 16/2013
// INVERTED SLA: larger plant footprint = more erven/servitudes = more time
// SIGNATURE: lodge_deeds crosses regulator EVERY tier (title deed milestone);
//            reject_survey crosses major/material

export type LandRegisterStatus =
  | 'survey_commissioned'
  | 'field_survey'
  | 'diagram_drafted'
  | 'sg_approved'           // Surveyor-General approved
  | 'servitude_notarised'
  | 'deeds_lodged'
  | 'deeds_registered'
  | 'defective_title'
  | 'survey_rejected'
  | 'abandoned'
  | 'superseded';

export type LandRegisterAction =
  | 'commence_field_survey'
  | 'submit_diagram'
  | 'sg_approve'
  | 'notarise_servitude'
  | 'lodge_deeds'
  | 'confirm_registration'
  | 'raise_defective_title'
  | 'resolve_defective_title'
  | 'reject_survey'
  | 'abandon'
  | 'supersede'
  | 'flag_sla_breach';

export type LandTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

// INVERTED SLA: larger plant = more erven/servitudes = longer title process
export const SLA_DAYS: Record<LandTier, number> = {
  minor: 30,
  moderate: 45,
  significant: 60,
  major: 90,
  material: 120,
};

export const AREA_TIER_THRESHOLDS: Array<[LandTier, number]> = [
  ['material', 1000],   // ≥1000 ha
  ['major',    200],    // 200–999 ha
  ['significant', 50],  // 50–199 ha
  ['moderate',   10],   // 10–49 ha
  ['minor',       0],   // <10 ha
];

export function deriveAreaTier(area_ha: number): LandTier {
  for (const [tier, threshold] of AREA_TIER_THRESHOLDS) {
    if (area_ha >= threshold) return tier;
  }
  return 'minor';
}

export const HARD_TERMINALS: LandRegisterStatus[] = [
  'deeds_registered', 'abandoned', 'superseded',
];

export const VALID_TRANSITIONS: Partial<Record<LandRegisterStatus, LandRegisterStatus[]>> = {
  survey_commissioned:  ['field_survey', 'abandoned'],
  field_survey:         ['diagram_drafted', 'survey_rejected'],
  diagram_drafted:      ['sg_approved', 'survey_rejected'],
  sg_approved:          ['servitude_notarised'],
  servitude_notarised:  ['deeds_lodged'],
  deeds_lodged:         ['deeds_registered', 'defective_title'],
  defective_title:      ['deeds_lodged', 'abandoned'],
  survey_rejected:      ['survey_commissioned', 'abandoned'],
};

export function crossesIntoRegulator(action: LandRegisterAction, tier: LandTier): boolean {
  if (action === 'lodge_deeds') return true;         // EVERY tier — deeds office milestone
  if (action === 'reject_survey' && (tier === 'major' || tier === 'material')) return true;
  return false;
}
