// ═══════════════════════════════════════════════════════════════════════════
// Wave 173 — IPP Force Majeure Declaration & Relief Claim
//
// REIPPPP Power Purchase Agreement (PPPA) Force Majeure clauses + FIDIC
// Silver Book (EPC turnkey) FM provisions + NERSA Grid Code s.8.7
// (extended grid unavailability). IPP projects must issue a formal FM
// notice within the contractual deadline (typically 5–14 days of the FM
// event) and prosecute the relief claim through the Independent Engineer.
// Extended grid FM (Eskom unavailability) requires separate NERSA
// notification. Political and Change-in-Law FM may trigger a separate
// change-in-law relief claim under the PPPA.
//
// Mounted at /api/ipp-force-majeure.
//
// URGENT SLA: higher severity FM events (critical production loss, major
// contractual deadlines at risk) require FASTER resolution to preserve
// PPPA rights and prevent deadline forfeit.
//
// 12-state chain:
//   fm_identified → fm_notice_issued → counterparty_acknowledgment
//   → ie_assessment_requested → ie_assessment_in_progress
//   → ie_report_issued → relief_quantified → negotiation_in_progress
//   → relief_agreed (terminal)
//   → relief_refused (terminal)
//   → arbitration_commenced (terminal)
//
// Signature reportability:
//   declare_arbitration → EVERY tier (PPPA arbitration = regulatory/lender
//                          notification required at all scales)
//   refuse_relief       → EVERY tier (FM relief denial impacts project
//                          timelines, financial close covenants)
//   confirm_relief      → major + critical (large FM relief amounts require
//                          NERSA disclosure and lender notification)
// ═══════════════════════════════════════════════════════════════════════════

export type FmStatus =
  | 'fm_identified'
  | 'fm_notice_issued'
  | 'counterparty_acknowledgment'
  | 'ie_assessment_requested'
  | 'ie_assessment_in_progress'
  | 'ie_report_issued'
  | 'relief_quantified'
  | 'negotiation_in_progress'
  | 'relief_agreed'        // TERMINAL
  | 'relief_refused'       // TERMINAL
  | 'arbitration_commenced'; // TERMINAL

export type FmAction =
  | 'issue_fm_notice'
  | 'receive_acknowledgment'
  | 'request_ie_assessment'
  | 'commence_ie_assessment'
  | 'issue_ie_report'
  | 'quantify_relief'
  | 'commence_negotiation'
  | 'confirm_relief'
  | 'refuse_relief'
  | 'declare_arbitration';

export type FmSeverityTier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

export type FmCategory =
  | 'natural_disaster'
  | 'grid_unavailability'
  | 'political_event'
  | 'change_in_law'
  | 'pandemic'
  | 'civil_unrest';

export type FmReliefType =
  | 'time_extension'
  | 'cost_relief'
  | 'time_and_cost'
  | 'tariff_adjustment'
  | 'termination_right';

// ─── Tier derivation (keyed on estimated_relief_zar) ────────────────────────

export function deriveFmSeverityTier(relief_zar: number): FmSeverityTier {
  if (relief_zar < 1_000_000)   return 'minor';
  if (relief_zar < 10_000_000)  return 'moderate';
  if (relief_zar < 50_000_000)  return 'material';
  if (relief_zar < 200_000_000) return 'major';
  return 'critical';
}

// ─── URGENT SLA (higher severity FM → faster resolution to preserve rights) ─

export const SLA_DAYS: Record<FmSeverityTier, number> = {
  minor:    90,
  moderate: 60,
  material: 45,
  major:    30,
  critical: 21,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<FmStatus>([
  'relief_agreed',
  'relief_refused',
  'arbitration_commenced',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  FmAction,
  { from: FmStatus[] }
> = {
  issue_fm_notice:       { from: ['fm_identified'] },
  receive_acknowledgment:{ from: ['fm_notice_issued'] },
  request_ie_assessment: { from: ['counterparty_acknowledgment'] },
  commence_ie_assessment:{ from: ['ie_assessment_requested'] },
  issue_ie_report:       { from: ['ie_assessment_in_progress'] },
  quantify_relief:       { from: ['ie_report_issued'] },
  commence_negotiation:  { from: ['relief_quantified'] },
  confirm_relief:        { from: ['negotiation_in_progress'] },
  refuse_relief:         { from: ['negotiation_in_progress'] },
  declare_arbitration:   {
    from: ['counterparty_acknowledgment', 'negotiation_in_progress', 'relief_refused'],
  },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: FmSeverityTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];
const MAJOR_PLUS: FmSeverityTier[] = ['major', 'critical'];

export function crossesIntoRegulator(
  action: FmAction,
  tier: FmSeverityTier,
): boolean {
  switch (action) {
    case 'declare_arbitration': return ALL_TIERS.includes(tier);
    case 'refuse_relief':       return ALL_TIERS.includes(tier);
    case 'confirm_relief':      return MAJOR_PLUS.includes(tier);
    default:                    return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: FmSeverityTier): boolean {
  return MAJOR_PLUS.includes(tier);
}

// ═══════════════════════════════════════════════════════════════════════════
// Wave 194 — IPP Force Majeure Notification & Relief (PPA-based chain)
//
// When an extraordinary event beyond a generator's control prevents or
// materially impairs power delivery under a PPA, the IPP must formally
// notify the offtaker and regulator, substantiate the event, and prosecute
// a relief claim for the affected capacity and associated revenue loss.
//
// Regulatory: PPA force majeure clause + ERA 4/2006 s34 + REIPPPP Schedule 4
// Primary actor: ipp_developer (submits), admin (adjudicates)
// Secondary: offtaker / regulator (acknowledge)
//
// SLA polarity — URGENT (more severe / time-critical categories get LESS time)
// Mounted at /api/ipp-force-majeure-chain.
// ═══════════════════════════════════════════════════════════════════════════

export type ForceMajeureStatus =
  | 'fm_submitted'
  | 'notice_verified'
  | 'mitigation_assessed'
  | 'period_active'
  | 'relief_period_running'
  | 'relief_claimed'
  | 'quantum_assessed'
  | 'relief_granted'    // TERMINAL +
  | 'relief_denied'     // TERMINAL -
  | 'disputed'          // TERMINAL
  | 'fm_lapsed'         // TERMINAL
  | 'cancelled';        // TERMINAL

export type ForceMajeureAction =
  | 'verify_notice'
  | 'assess_mitigation'
  | 'activate_period'
  | 'run_relief_period'
  | 'submit_relief_claim'
  | 'assess_quantum'
  | 'grant_relief'
  | 'deny_relief'
  | 'raise_dispute'
  | 'lapse_event';

// URGENT SLA keyed on fm_category — more severe/time-critical gets LESS time
export type FmEventCategory =
  | 'extreme_weather'
  | 'severe_storm'
  | 'network_fault'
  | 'regulatory_action'
  | 'general';

export const FM_CHAIN_SLA_DAYS: Record<FmEventCategory, number> = {
  extreme_weather:   2,
  severe_storm:      3,
  network_fault:     7,
  regulatory_action: 14,
  general:           21,
};

export function deriveFmChainSla(category: FmEventCategory): number {
  return FM_CHAIN_SLA_DAYS[category];
}

export const FM_CHAIN_HARD_TERMINALS = new Set<ForceMajeureStatus>([
  'relief_granted',
  'relief_denied',
  'disputed',
  'fm_lapsed',
  'cancelled',
]);

export const FM_CHAIN_VALID_TRANSITIONS: Record<ForceMajeureAction, { from: ForceMajeureStatus[] }> = {
  verify_notice:       { from: ['fm_submitted'] },
  assess_mitigation:   { from: ['notice_verified'] },
  activate_period:     { from: ['mitigation_assessed'] },
  run_relief_period:   { from: ['period_active'] },
  submit_relief_claim: { from: ['relief_period_running'] },
  assess_quantum:      { from: ['relief_claimed'] },
  grant_relief:        { from: ['quantum_assessed'] },
  deny_relief: {
    from: [
      'fm_submitted', 'notice_verified', 'mitigation_assessed',
      'period_active', 'relief_period_running', 'relief_claimed',
      'quantum_assessed',
    ],
  },
  raise_dispute: {
    from: [
      'fm_submitted', 'notice_verified', 'mitigation_assessed',
      'period_active', 'relief_period_running', 'relief_claimed',
      'quantum_assessed',
    ],
  },
  lapse_event: {
    from: [
      'fm_submitted', 'notice_verified', 'mitigation_assessed',
      'period_active', 'relief_period_running',
    ],
  },
};

export const FM_CHAIN_STATE_TRANSITIONS: Record<ForceMajeureAction, ForceMajeureStatus> = {
  verify_notice:       'notice_verified',
  assess_mitigation:   'mitigation_assessed',
  activate_period:     'period_active',
  run_relief_period:   'relief_period_running',
  submit_relief_claim: 'relief_claimed',
  assess_quantum:      'quantum_assessed',
  grant_relief:        'relief_granted',
  deny_relief:         'relief_denied',
  raise_dispute:       'disputed',
  lapse_event:         'fm_lapsed',
};

// Tiers where relief_granted crosses into regulator
const RELIEF_GRANTED_CATEGORIES: FmEventCategory[] = [
  'extreme_weather',
  'severe_storm',
  'network_fault',
];

export function fmChainCrossesIntoRegulator(
  action: ForceMajeureAction,
  category: FmEventCategory,
): boolean {
  switch (action) {
    case 'activate_period':
      return true; // ALL tiers — any active FM period is reportable to NERSA
    case 'grant_relief':
      return RELIEF_GRANTED_CATEGORIES.includes(category);
    default:
      return false;
  }
}

// SLA breach crosses ALL tiers for force majeure events
export function fmChainSlaBreachCrossesIntoRegulator(_category: FmEventCategory): boolean {
  return true;
}
