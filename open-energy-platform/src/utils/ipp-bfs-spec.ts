// ═══════════════════════════════════════════════════════════════════════════
// Wave 168 — IPP Bankable Feasibility Study (BFS) Update & Re-certification
//
// LMA project finance BFS covenant + IFC Environmental and Social Standards
// (Equator Principles) + REIPPPP Bid Submission Requirements. Lenders require
// a current, certified BFS before key financial milestones. A BFS update is
// triggered by: material scope changes (>10% capacity delta), component
// substitution, tariff re-bid, resource assessment updates (new P50/P90),
// or the standard 3–5 year refresh covenant. The Independent Engineer (IE)
// certifies the updated study.
//
// Mounted at /api/ipp-bfs.
//
// INVERTED SLA: larger project capacity → more complex technical assessment
// → MORE time for IE review.
//
// 12-state chain:
//   bfs_triggered → scope_definition → data_collection → analysis_in_progress
//   → draft_bfs_issued → peer_review → ipp_comments_submitted
//   → ie_review → queries_raised → responses_submitted
//   → bfs_certified (terminal) → bfs_rejected (terminal)
//
// Signature reportability:
//   bfs_rejected    → EVERY tier (uncertified BFS blocks drawdowns)
//   bfs_certified   → major + strategic (large plants NERSA/lender disclosure)
// ═══════════════════════════════════════════════════════════════════════════

export type BfsStatus =
  | 'bfs_triggered'
  | 'scope_definition'
  | 'data_collection'
  | 'analysis_in_progress'
  | 'draft_bfs_issued'
  | 'peer_review'
  | 'ipp_comments_submitted'
  | 'ie_review'
  | 'queries_raised'
  | 'responses_submitted'
  | 'bfs_certified'   // TERMINAL
  | 'bfs_rejected';   // TERMINAL

export type BfsAction =
  | 'define_scope'
  | 'commence_data_collection'
  | 'commence_analysis'
  | 'issue_draft_bfs'
  | 'commence_peer_review'
  | 'submit_ipp_comments'
  | 'submit_to_ie'
  | 'raise_queries'
  | 'submit_responses'
  | 'certify_bfs'
  | 'reject_bfs';

export type BfsCapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

export type BfsTriggerCategory =
  | 'scope_change'
  | 'component_substitution'
  | 'tariff_rebid'
  | 'resource_update'
  | 'periodic_refresh'
  | 'lender_request';

// ─── Tier derivation (keyed on capacity_mw) ─────────────────────────────────

export function deriveBfsCapacityTier(capacity_mw: number): BfsCapacityTier {
  if (capacity_mw < 10)   return 'small';
  if (capacity_mw < 50)   return 'medium';
  if (capacity_mw < 200)  return 'large';
  if (capacity_mw < 500)  return 'utility';
  return 'strategic';
}

// ─── INVERTED SLA (larger capacity → more complex study → more time) ─────────

export const SLA_DAYS: Record<BfsCapacityTier, number> = {
  small:     30,
  medium:    45,
  large:     60,
  utility:   90,
  strategic: 120,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<BfsStatus>([
  'bfs_certified',
  'bfs_rejected',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  BfsAction,
  { from: BfsStatus[] }
> = {
  define_scope:             { from: ['bfs_triggered'] },
  commence_data_collection: { from: ['scope_definition'] },
  commence_analysis:        { from: ['data_collection'] },
  issue_draft_bfs:          { from: ['analysis_in_progress'] },
  commence_peer_review:     { from: ['draft_bfs_issued'] },
  submit_ipp_comments:      { from: ['peer_review', 'draft_bfs_issued'] },
  submit_to_ie:             { from: ['ipp_comments_submitted', 'peer_review'] },
  raise_queries:            { from: ['ie_review'] },
  submit_responses:         { from: ['queries_raised'] },
  certify_bfs:              { from: ['ie_review', 'responses_submitted'] },
  reject_bfs:               { from: ['ie_review', 'responses_submitted'] },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: BfsCapacityTier[] = ['small', 'medium', 'large', 'utility', 'strategic'];
const MAJOR_PLUS: BfsCapacityTier[] = ['utility', 'strategic'];

export function crossesIntoRegulator(
  action: BfsAction,
  tier: BfsCapacityTier,
): boolean {
  switch (action) {
    case 'reject_bfs':    return ALL_TIERS.includes(tier);
    case 'certify_bfs':   return MAJOR_PLUS.includes(tier);
    default:              return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: BfsCapacityTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
