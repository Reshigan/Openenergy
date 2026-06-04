// ═══════════════════════════════════════════════════════════════════════════
// Wave 158 — IPP Force Majeure Declaration & Relief chain spec
//
// Legal basis:
//   REIPPPP PPA Schedule 6 (Force Majeure definitions & notice obligations)
//   ERA §35 (relief from PPA obligations during declared force majeure)
//   FIDIC Sub-Clause 19 (Force Majeure — notice, mitigation, consequences)
//   NERSA Grid Code §CSC-1 (grid-driven FM events / system-operator declarations)
//
// An IPP declares a Force Majeure event, issues a formal notice to the offtaker
// and NERSA, the notice is verified, relief is granted while the event persists,
// and the event is resolved once conditions return to normal. If the offtaker
// disputes the FM qualification the matter escalates to arbitration. If the FM
// event persists beyond six months the PPA termination right under Schedule 6
// §6.5 is triggered (prolonged termination). Either party may withdraw an FM
// claim before arbitration concludes.
//
// MIXED SLA rendered as URGENT:
//   Larger lost-generation quantum → TIGHTER SLA windows (urgency-driven).
//   minor      <   100 MWh  → SLA_DAYS = 90
//   moderate   <   500 MWh  → SLA_DAYS = 75
//   significant< 2 000 MWh  → SLA_DAYS = 60
//   major      <10 000 MWh  → SLA_DAYS = 45
//   material   >=10 000 MWh → SLA_DAYS = 30
//
// Signature reportability (NERSA/DoE notification):
//   grant_relief      → EVERY tier (PPA relief always notifiable)
//   dispute_claim     → significant + major + material
//   declare_prolonged → EVERY tier (potential PPA termination always notifiable)
//
// Hard terminals: fm_resolved | fm_arbitration_determined | fm_prolonged_termination | withdrawn
//
// Event prefix: fm_evt_
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ──────────────────────────────────────────────────────────────────

export type FmStatus =
  | 'fm_event_occurred'
  | 'fm_notice_issued'
  | 'fm_notice_verified'
  | 'fm_relief_in_progress'
  | 'fm_monitoring'
  | 'fm_resolved'
  | 'fm_disputed'
  | 'fm_arbitration'
  | 'fm_arbitration_determined'
  | 'fm_prolonged_termination'
  | 'withdrawn';

export type FmAction =
  | 'issue_fm_notice'
  | 'verify_notice'
  | 'grant_relief'
  | 'commence_monitoring'
  | 'resolve_event'
  | 'dispute_claim'
  | 'commence_arbitration'
  | 'determine_arbitration'
  | 'declare_prolonged'
  | 'withdraw_claim'
  | 'flag_sla_breach';

export type FmTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

export type FmCategory =
  | 'weather_event'
  | 'grid_failure'
  | 'natural_disaster'
  | 'regulatory_change'
  | 'pandemic'
  | 'war_civil_unrest'
  | 'supplier_fm';

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<FmStatus>([
  'fm_resolved',
  'fm_arbitration_determined',
  'fm_prolonged_termination',
  'withdrawn',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<FmAction, { from: FmStatus[]; to: FmStatus }> = {
  issue_fm_notice: {
    from: ['fm_event_occurred'],
    to: 'fm_notice_issued',
  },
  verify_notice: {
    from: ['fm_notice_issued'],
    to: 'fm_notice_verified',
  },
  grant_relief: {
    from: ['fm_notice_verified'],
    to: 'fm_relief_in_progress',
  },
  commence_monitoring: {
    from: ['fm_relief_in_progress'],
    to: 'fm_monitoring',
  },
  resolve_event: {
    from: ['fm_monitoring'],
    to: 'fm_resolved',
  },
  dispute_claim: {
    from: ['fm_notice_issued', 'fm_relief_in_progress', 'fm_monitoring'],
    to: 'fm_disputed',
  },
  commence_arbitration: {
    from: ['fm_disputed'],
    to: 'fm_arbitration',
  },
  determine_arbitration: {
    from: ['fm_arbitration'],
    to: 'fm_arbitration_determined',
  },
  declare_prolonged: {
    from: ['fm_monitoring'],
    to: 'fm_prolonged_termination',
  },
  withdraw_claim: {
    from: ['fm_event_occurred', 'fm_notice_issued', 'fm_disputed'],
    to: 'withdrawn',
  },
  // flag_sla_breach is a self-loop; no entry in VALID_TRANSITIONS is enforced
  // because the route handles it separately.
  flag_sla_breach: {
    from: ['fm_event_occurred', 'fm_notice_issued', 'fm_notice_verified', 'fm_relief_in_progress', 'fm_monitoring', 'fm_disputed', 'fm_arbitration'],
    to: 'fm_event_occurred', // placeholder — route keeps current status
  },
};

// ─── Tier derivation ─────────────────────────────────────────────────────────

/**
 * Derive the FM tier from the lost generation quantum (MWh).
 * URGENT pattern: larger loss → tighter SLA windows.
 */
export function deriveFmTier(lost_generation_mwh: number): FmTier {
  if (lost_generation_mwh < 100)    return 'minor';
  if (lost_generation_mwh < 500)    return 'moderate';
  if (lost_generation_mwh < 2000)   return 'significant';
  if (lost_generation_mwh < 10000)  return 'major';
  return 'material';
}

// ─── SLA (days) ──────────────────────────────────────────────────────────────
//
// URGENT: larger lost-generation quantum → TIGHTER windows.
// Single SLA_DAYS per tier applied from the moment of creation (fm_event_occurred).
// The route resets the deadline on each state transition using the same table.

export const SLA_DAYS: Record<FmTier, number> = {
  minor:       90,
  moderate:    75,
  significant: 60,
  major:       45,
  material:    30,
};

// ─── Reportability ───────────────────────────────────────────────────────────

const SIGNIFICANT_PLUS = new Set<FmTier>(['significant', 'major', 'material']);

/**
 * Returns true when this action at this tier must be cross-referred into the
 * NERSA/DoE regulator inbox. Mirrors the signature-event pattern used across
 * the P6 wave library.
 */
export function crossesIntoRegulator(action: FmAction, tier: FmTier): boolean {
  // grant_relief → EVERY tier (PPA obligation relief is always NERSA-notifiable)
  if (action === 'grant_relief') return true;
  // declare_prolonged → EVERY tier (potential PPA termination is always notifiable)
  if (action === 'declare_prolonged') return true;
  // dispute_claim → significant + major + material only
  if (action === 'dispute_claim') return SIGNIFICANT_PLUS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: FmTier): boolean {
  return SIGNIFICANT_PLUS.has(tier);
}
