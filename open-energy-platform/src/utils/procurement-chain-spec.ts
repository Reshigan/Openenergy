// ═══════════════════════════════════════════════════════════════════════════
// Wave 19 — IPP procurement / RFP chain spec.
//
// Pure functions. 10-state P6-grade machine for IPP-issued RFPs against EPC
// contractors and OEM equipment suppliers. Mirrors REIPPPP procurement
// transparency requirements (Bid Window Round-style award visibility).
//
//   draft → published → bidding → bid_closed → evaluation →
//            ├─→ shortlisted → awarded → contracted → delivered
//            └─→ rejected (terminal — no bids met threshold)
//
//   cancelled — pre-contracted operator pull (post-contract = breach, not cancel)
//   disputed  — diversion from any pre-delivered state into hold + escalation,
//               resolvable back into contracted (resolution doc filed)
//
// Per capex-tier SLAs (publication/bid/evaluation/award/contract windows):
//   • high   (≥ R500m, REIPPPP-scale)        — 30d / 60d / 30d / 14d / 60d
//   • medium (R50m – R500m, major EPC/OEM)   — 14d / 30d / 21d /  7d / 45d
//   • low    (< R50m, services / spares)     —  7d / 14d / 10d /  3d / 21d
//
// Regulator inbox crossings (NERSA + REIPPPP transparency mandates):
//   • awarded   for high-tier  — public bid award transparency
//   • disputed  for high-tier  — bid-protest visibility
//   • sla_breached for high-tier
//
// Imported by:
//   - tests/procurement-chain-spec.test.ts
//   - src/routes/procurement-chain.ts
// ═══════════════════════════════════════════════════════════════════════════

export type ProcurementStatus =
  | 'draft'
  | 'published'
  | 'bidding'
  | 'bid_closed'
  | 'evaluation'
  | 'shortlisted'
  | 'awarded'
  | 'contracted'
  | 'delivered'
  | 'rejected'
  | 'cancelled'
  | 'disputed';

export type ProcurementAction =
  | 'publish'         // draft → published
  | 'open_bids'       // published → bidding
  | 'close_bids'      // bidding → bid_closed
  | 'begin_evaluation'// bid_closed → evaluation
  | 'shortlist'       // evaluation → shortlisted
  | 'reject_all'      // evaluation → rejected (no bid met threshold)
  | 'award'           // shortlisted → awarded
  | 'sign_contract'   // awarded → contracted
  | 'mark_delivered'  // contracted → delivered
  | 'cancel'          // any pre-contracted non-terminal → cancelled
  | 'dispute'         // any pre-delivered non-terminal → disputed
  | 'resolve';        // disputed → contracted (resolution doc filed)

export type ProcurementTier = 'high' | 'medium' | 'low';

export const ALL_STATES: readonly ProcurementStatus[] = [
  'draft', 'published', 'bidding', 'bid_closed', 'evaluation',
  'shortlisted', 'awarded', 'contracted', 'delivered',
  'rejected', 'cancelled', 'disputed',
];

export const TERMINAL_STATES: readonly ProcurementStatus[] = [
  'delivered', 'rejected', 'cancelled',
];

export function isTerminal(s: ProcurementStatus): boolean {
  return TERMINAL_STATES.includes(s);
}

export const TRANSITIONS: Record<ProcurementStatus, Partial<Record<ProcurementAction, ProcurementStatus>>> = {
  draft:       { publish: 'published',                                                              cancel: 'cancelled' },
  published:   { open_bids: 'bidding',                            dispute: 'disputed',              cancel: 'cancelled' },
  bidding:     { close_bids: 'bid_closed',                        dispute: 'disputed',              cancel: 'cancelled' },
  bid_closed:  { begin_evaluation: 'evaluation',                  dispute: 'disputed',              cancel: 'cancelled' },
  evaluation:  { shortlist: 'shortlisted', reject_all: 'rejected', dispute: 'disputed',             cancel: 'cancelled' },
  shortlisted: { award: 'awarded',                                dispute: 'disputed',              cancel: 'cancelled' },
  awarded:     { sign_contract: 'contracted',                     dispute: 'disputed',              cancel: 'cancelled' },
  contracted:  { mark_delivered: 'delivered',                     dispute: 'disputed' },
  disputed:    { resolve: 'contracted',                                                             cancel: 'cancelled' },
  delivered:   {},
  rejected:    {},
  cancelled:   {},
};

/**
 * SLA windows (minutes) by state × capex tier. Stage gating for the cron
 * sweep — time-in-state deadlines, not absolute times.
 */
export const SLA_MINUTES: Record<ProcurementStatus, Record<ProcurementTier, number>> = {
  draft:       { high: 43200, medium: 20160, low: 10080 },   // 30d / 14d / 7d to publish
  published:   { high: 4320,  medium: 1440,  low: 720 },     // 3d / 1d / 12h to open bidding
  bidding:     { high: 86400, medium: 43200, low: 20160 },   // 60d / 30d / 14d bid window
  bid_closed:  { high: 4320,  medium: 1440,  low: 720 },     // 3d / 1d / 12h to begin eval
  evaluation:  { high: 43200, medium: 30240, low: 14400 },   // 30d / 21d / 10d eval window
  shortlisted: { high: 20160, medium: 10080, low: 4320 },    // 14d / 7d / 3d to award
  awarded:     { high: 86400, medium: 64800, low: 30240 },   // 60d / 45d / 21d contract neg
  contracted:  { high: 525600, medium: 262800, low: 131400 }, // 365d / 182d / 91d delivery window
  disputed:    { high: 4320, medium: 4320, low: 4320 },      // 3d to file resolution regardless of tier
  delivered:   { high: 0, medium: 0, low: 0 },
  rejected:    { high: 0, medium: 0, low: 0 },
  cancelled:   { high: 0, medium: 0, low: 0 },
};

export function nextState(curr: ProcurementStatus, action: ProcurementAction): ProcurementStatus | null {
  return TRANSITIONS[curr]?.[action] ?? null;
}

export function advance(curr: ProcurementStatus, action: ProcurementAction): ProcurementStatus {
  const next = nextState(curr, action);
  if (!next) throw new Error(`Invalid transition: ${curr} --${action}--> ?`);
  return next;
}

export function slaDueAt(
  state: ProcurementStatus,
  tier: ProcurementTier,
  now: Date = new Date(),
): string {
  const mins = SLA_MINUTES[state]?.[tier] ?? 0;
  if (mins === 0) return '';
  return new Date(now.getTime() + mins * 60 * 1000).toISOString();
}

/**
 * Capex tier from ZAR estimate. R500m threshold mirrors REIPPPP bid-window
 * cutoff for full DMRE oversight. R50m matches DPSA preferential-procurement
 * BBBEE major-spend trigger.
 */
export function tierFromCapex(zar: number): ProcurementTier {
  if (zar >= 500_000_000) return 'high';
  if (zar >= 50_000_000)  return 'medium';
  return 'low';
}

/**
 * Regulator inbox crossings for state changes.
 *
 *   award (shortlisted → awarded) crosses for high-tier — REIPPPP requires
 *   public bid-award transparency. Medium/low operate quietly.
 *   dispute crosses for high-tier — bid-protest visibility for the regulator.
 */
export function crossesIntoRegulator(action: ProcurementAction, tier: ProcurementTier): boolean {
  if (action === 'award')   return tier === 'high';
  if (action === 'dispute') return tier === 'high';
  return false;
}

/**
 * High-tier SLA breaches cross into regulator inbox. Medium/low are
 * operational only — the IPP's PM is responsible for catching them.
 */
export function slaBreachCrossesIntoRegulator(tier: ProcurementTier): boolean {
  return tier === 'high';
}

export function isTier(s: string): s is ProcurementTier {
  return s === 'high' || s === 'medium' || s === 'low';
}

export function isStatus(s: string): s is ProcurementStatus {
  return ALL_STATES.includes(s as ProcurementStatus);
}
