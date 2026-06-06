// ═══════════════════════════════════════════════════════════════════════════════
// W225 — Carbon Scope 3 Value Chain Emission Calculation & Third-Party Assurance
// TCFD + ISSB IFRS S2 + GHG Protocol Scope 3 Standard + CDP
// Related to: W11 (MRV), W17 (retirement), W48 (carbon offset claim)
// ═══════════════════════════════════════════════════════════════════════════════

export type S3Status =
  | 'scope3_initiated'            // disclosure period opened for reporting year
  | 'category_boundaries_set'     // Scope 3 categories 1–15 identified & scoped
  | 'data_collection_open'        // primary data requests sent to value chain
  | 'data_collection_complete'    // activity data collected for all categories
  | 'emission_calculations'       // GHG Protocol calculations running
  | 'calculations_reviewed'       // internal data quality check complete
  | 'assurance_submitted'         // submitted to third-party assurance provider
  | 'limited_assurance_complete'  // limited assurance issued (AA1000/ISO 14064-3)
  | 'reasonable_assurance_complete' // reasonable assurance issued (higher standard)
  | 'disclosure_filed'            // filed with CDP/ISSB/sustainability report; terminal+
  | 'assurance_qualified'         // qualified opinion — material error; terminal
  | 'withdrawn';                  // disclosure withdrawn; terminal

export type S3Action =
  | 'set_categories'
  | 'open_data_collection'
  | 'close_data_collection'
  | 'run_calculations'
  | 'complete_internal_review'
  | 'submit_for_assurance'
  | 'issue_limited_assurance'
  | 'issue_reasonable_assurance'
  | 'file_disclosure'
  | 'qualify_assurance'
  | 'withdraw'
  | 'sla_breach';

export type S3Tier =
  | 'micro'        // <5 Scope 3 categories; 21d
  | 'standard'     // 5–10 categories; 30d
  | 'comprehensive'// 10–13 categories; 45d
  | 'full_chain';  // all 15+ categories + upstream suppliers; 60d

// INVERTED SLA: wider Scope 3 boundary = more data collection time
export function deriveS3Sla(tier: S3Tier): number {
  const DAYS: Record<S3Tier, number> = {
    micro:         21,
    standard:      30,
    comprehensive: 45,
    full_chain:    60,
  };
  return DAYS[tier] ?? 30;
}

export const S3_HARD_TERMINALS = new Set<S3Status>([
  'disclosure_filed', 'assurance_qualified', 'withdrawn',
]);

export const S3_VALID_TRANSITIONS: Record<S3Status, S3Action[]> = {
  scope3_initiated:            ['set_categories', 'withdraw', 'sla_breach'],
  category_boundaries_set:     ['open_data_collection', 'withdraw', 'sla_breach'],
  data_collection_open:        ['close_data_collection', 'sla_breach'],
  data_collection_complete:    ['run_calculations', 'sla_breach'],
  emission_calculations:       ['complete_internal_review', 'sla_breach'],
  calculations_reviewed:       ['submit_for_assurance', 'file_disclosure', 'sla_breach'],
  assurance_submitted:         ['issue_limited_assurance', 'issue_reasonable_assurance', 'qualify_assurance', 'sla_breach'],
  limited_assurance_complete:  ['issue_reasonable_assurance', 'file_disclosure', 'sla_breach'],
  reasonable_assurance_complete: ['file_disclosure', 'sla_breach'],
  disclosure_filed:            [],
  assurance_qualified:         [],
  withdrawn:                   [],
};

export const S3_STATE_TRANSITIONS: Record<S3Action, S3Status> = {
  set_categories:              'category_boundaries_set',
  open_data_collection:        'data_collection_open',
  close_data_collection:       'data_collection_complete',
  run_calculations:            'emission_calculations',
  complete_internal_review:    'calculations_reviewed',
  submit_for_assurance:        'assurance_submitted',
  issue_limited_assurance:     'limited_assurance_complete',
  issue_reasonable_assurance:  'reasonable_assurance_complete',
  file_disclosure:             'disclosure_filed',
  qualify_assurance:           'assurance_qualified',
  withdraw:                    'withdrawn',
  sla_breach:                  'category_boundaries_set',
};

// Regulator crossings
export function s3CrossesIntoRegulator(action: S3Action, tier: S3Tier): boolean {
  // Qualified assurance = material misstatement in climate disclosure = always reportable
  if (action === 'qualify_assurance') return true;
  // Large-scope filings cross CDP/JSE mandatory disclosure threshold
  if (action === 'file_disclosure') return tier === 'comprehensive' || tier === 'full_chain';
  return false;
}

export function s3SlaBreachCrossesIntoRegulator(tier: S3Tier): boolean {
  return tier === 'comprehensive' || tier === 'full_chain';
}
