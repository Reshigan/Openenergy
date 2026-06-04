// ═══════════════════════════════════════════════════════════════════════════
// Wave 163 — IPP Lease & Servitude Amendment Request spec
//
// Deeds Registries Act 47/1937 + Spatial Planning and Land Use Management Act
// (SPLUMA) 16/2013 + Notarial Bond protocols. When operational changes (new
// substations, cable routes, road upgrades, expanded footprint) require
// amendment to existing servitudes, wayleaves, or lease agreements, the IPP
// must apply to the Deeds Office / municipality / network operator. Extends
// W150 (Land Register) which manages the register of rights; this chain
// manages the active amendment process.
//
// Mounted at /api/ipp-land-amendment.
//
// INVERTED SLA: larger land area affected → more complex survey and
// consultation process → MORE time.
//
// 12-state chain:
//   amendment_requested → surveyor_appointed → survey_completed
//   → application_submitted → authority_review → public_notice
//   → objection_period → objections_resolved → amendment_granted (terminal)
//   → amendment_refused (terminal)
//   → appeal_filed → appeal_determined (terminal)
//
// Signature reportability:
//   refuse_amendment   → EVERY tier (refused wayleave = network access risk)
//   grant_amendment    → major + material (large land changes reported to NERSA)
//   determine_appeal   → EVERY tier
// ═══════════════════════════════════════════════════════════════════════════

export type LandAmendmentStatus =
  | 'amendment_requested'
  | 'surveyor_appointed'
  | 'survey_completed'
  | 'application_submitted'
  | 'authority_review'
  | 'public_notice'
  | 'objection_period'
  | 'objections_resolved'
  | 'amendment_granted'    // TERMINAL
  | 'amendment_refused'    // TERMINAL
  | 'appeal_filed'
  | 'appeal_determined';   // TERMINAL

export type LandAmendmentAction =
  | 'appoint_surveyor'
  | 'complete_survey'
  | 'submit_application'
  | 'commence_authority_review'
  | 'issue_public_notice'
  | 'close_objection_period'
  | 'resolve_objections'
  | 'grant_amendment'
  | 'refuse_amendment'
  | 'file_appeal'
  | 'determine_appeal';

export type LandAreaTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

export type AmendmentCategory =
  | 'lease_amendment'
  | 'servitude_registration'
  | 'servitude_extension'
  | 'wayleave_grant'
  | 'wayleave_extension'
  | 'right_of_way';

// ─── Tier derivation (keyed on land area in hectares) ────────────────────────

export function deriveLandAreaTier(land_area_hectares: number): LandAreaTier {
  if (land_area_hectares < 1)    return 'minor';
  if (land_area_hectares < 10)   return 'moderate';
  if (land_area_hectares < 50)   return 'significant';
  if (land_area_hectares < 200)  return 'major';
  return 'material';
}

// ─── INVERTED SLA (larger area = more complex process = more time) ─────────

export const SLA_DAYS: Record<LandAreaTier, number> = {
  minor:       14,
  moderate:    21,
  significant: 30,
  major:       45,
  material:    60,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<LandAmendmentStatus>([
  'amendment_granted',
  'amendment_refused',
  'appeal_determined',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  LandAmendmentAction,
  { from: LandAmendmentStatus[] }
> = {
  appoint_surveyor:         { from: ['amendment_requested'] },
  complete_survey:          { from: ['surveyor_appointed'] },
  submit_application:       { from: ['survey_completed'] },
  commence_authority_review:{ from: ['application_submitted'] },
  issue_public_notice:      { from: ['authority_review'] },
  close_objection_period:   { from: ['public_notice', 'objection_period'] },
  resolve_objections:       { from: ['objection_period', 'objections_resolved'] },
  grant_amendment:          { from: ['authority_review', 'objections_resolved'] },
  refuse_amendment:         { from: ['authority_review', 'objections_resolved', 'objection_period'] },
  file_appeal:              { from: ['amendment_refused'] },
  determine_appeal:         { from: ['appeal_filed'] },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: LandAreaTier[] = ['minor', 'moderate', 'significant', 'major', 'material'];
const MAJOR_PLUS: LandAreaTier[] = ['major', 'material'];

export function crossesIntoRegulator(
  action: LandAmendmentAction,
  tier: LandAreaTier,
): boolean {
  switch (action) {
    case 'refuse_amendment':  return ALL_TIERS.includes(tier);
    case 'grant_amendment':   return MAJOR_PLUS.includes(tier);
    case 'determine_appeal':  return ALL_TIERS.includes(tier);
    default:                  return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: LandAreaTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
