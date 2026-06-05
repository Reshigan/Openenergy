// ═══════════════════════════════════════════════════════════════════════════════
// W215 — Grid Emergency Operations Plan (EOP) Activation & Post-Event Review
// NERSA Grid Code §G.4 + NTCSA SOC Emergency Procedures + NRS 048-2
// ═══════════════════════════════════════════════════════════════════════════════

export type EopStatus =
  | 'contingency_detected'    // N-1 or N-2 event detected, EOP triggered
  | 'eop_activated'           // formal EOP activation declared
  | 'operations_centre_alerted' // control room + NTCSA notified
  | 'load_shedding_assessed'  // load shedding requirement assessed
  | 'restoration_in_progress' // active network restoration
  | 'normal_operations_restored' // grid back to pre-event state
  | 'post_event_review'       // formal PER underway
  | 'per_completed'           // PER accepted and lessons recorded; terminal +
  | 'per_outstanding'         // PER overdue / not completed; terminal (SLA breach)
  | 'escalated_to_regulator'  // NERSA notified; terminal
  | 'withdrawn';              // false alarm / test; terminal

export type EopAction =
  | 'activate_eop'
  | 'alert_operations_centre'
  | 'assess_load_shedding'
  | 'commence_restoration'
  | 'restore_normal_operations'
  | 'initiate_per'
  | 'complete_per'
  | 'escalate_to_regulator'
  | 'withdraw'
  | 'sla_breach';

export type EopTier =
  | 'n1_minor'          // single component outage; < 100MW
  | 'n1_significant'    // high-impact N-1; 100–500MW
  | 'n2_double'         // double contingency; 500MW–1000MW
  | 'black_start';      // total or partial system collapse

// URGENT SLA: higher severity = TIGHTER deadline (hours)
export function deriveEopSla(tier: EopTier): number {
  const HOURS: Record<EopTier, number> = {
    n1_minor:       24,  // 24h PER
    n1_significant: 12,  // 12h PER
    n2_double:       6,  // 6h
    black_start:     2,  // 2h — NERSA mandated black-start review
  };
  return HOURS[tier] ?? 12;
}

export const EOP_HARD_TERMINALS = new Set<EopStatus>([
  'per_completed', 'per_outstanding', 'escalated_to_regulator', 'withdrawn',
]);

export const EOP_VALID_TRANSITIONS: Record<EopStatus, EopAction[]> = {
  contingency_detected:        ['activate_eop', 'withdraw', 'sla_breach'],
  eop_activated:               ['alert_operations_centre', 'sla_breach'],
  operations_centre_alerted:   ['assess_load_shedding', 'commence_restoration', 'sla_breach'],
  load_shedding_assessed:      ['commence_restoration', 'sla_breach'],
  restoration_in_progress:     ['restore_normal_operations', 'escalate_to_regulator', 'sla_breach'],
  normal_operations_restored:  ['initiate_per', 'sla_breach'],
  post_event_review:           ['complete_per', 'escalate_to_regulator', 'sla_breach'],
  per_completed:               [],
  per_outstanding:             [],
  escalated_to_regulator:      [],
  withdrawn:                   [],
};

export const EOP_STATE_TRANSITIONS: Record<EopAction, EopStatus> = {
  activate_eop:               'eop_activated',
  alert_operations_centre:    'operations_centre_alerted',
  assess_load_shedding:       'load_shedding_assessed',
  commence_restoration:       'restoration_in_progress',
  restore_normal_operations:  'normal_operations_restored',
  initiate_per:               'post_event_review',
  complete_per:               'per_completed',
  escalate_to_regulator:      'escalated_to_regulator',
  withdraw:                   'withdrawn',
  sla_breach:                 'per_outstanding',
};

// Regulator crossings
export function eopCrossesIntoRegulator(action: EopAction, tier: EopTier): boolean {
  // Escalation always
  if (action === 'escalate_to_regulator') return true;
  // Black-start activation and double contingency always notify NERSA
  if (action === 'activate_eop') return tier === 'black_start' || tier === 'n2_double';
  // PER completion for n2_double and black_start
  if (action === 'complete_per') return tier === 'black_start' || tier === 'n2_double';
  return false;
}

export function eopSlaBreachCrossesIntoRegulator(tier: EopTier): boolean {
  return tier === 'black_start' || tier === 'n2_double';
}
