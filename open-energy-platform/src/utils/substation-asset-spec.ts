// ═══════════════════════════════════════════════════════════════════════════════
// W211 — Grid Transformer / Substation Asset Lifecycle
// NERSA Grid Code Chapter 3 + NRS 048-2 + IEC 60076 + NRS 097
// ═══════════════════════════════════════════════════════════════════════════════

export type SasStatus =
  | 'registered'          // asset record created; not yet commissioned
  | 'commissioning'       // installation and acceptance tests
  | 'energised'           // in-service; normal operation
  | 'condition_assessment'// periodic technical assessment (5-7 yr cycle)
  | 'assessment_complete' // condition score finalised
  | 'refurbishment_planned' // decision to refurbish vs replace
  | 'out_of_service'      // taken offline for works
  | 'refurbishment'       // active refurbishment works
  | 'returned_to_service' // post-refurb recommissioning
  | 'decommission_decision' // EoL or stranded-asset decision
  | 'decommissioned'      // asset retired from service; terminal +
  | 'failed';             // unexpected failure event; terminal

export type SasAction =
  | 'start_commissioning'
  | 'energise'
  | 'schedule_assessment'
  | 'complete_assessment'
  | 'plan_refurbishment'
  | 'take_out_of_service'
  | 'start_refurbishment'
  | 'return_to_service'
  | 'initiate_decommission'
  | 'decommission'
  | 'record_failure'
  | 'sla_breach';

export type SubstationAssetTier =
  | 'distribution'   // 11kV–66kV; routine
  | 'subtransmission' // 88kV–132kV; elevated
  | 'transmission'   // 220kV–765kV; critical
  | 'critical_node'; // N-1 constrained; most critical

// INVERTED SLA: more critical assets get MORE time for thorough assessment
export function deriveSasSla(tier: SubstationAssetTier): number {
  const DAYS: Record<SubstationAssetTier, number> = {
    distribution:     30,
    subtransmission:  45,
    transmission:     60,
    critical_node:    90,
  };
  return DAYS[tier] ?? 45;
}

export const SAS_HARD_TERMINALS = new Set<SasStatus>(['decommissioned', 'failed']);

export const SAS_VALID_TRANSITIONS: Record<SasStatus, SasAction[]> = {
  registered:              ['start_commissioning', 'sla_breach'],
  commissioning:           ['energise', 'record_failure', 'sla_breach'],
  energised:               ['schedule_assessment', 'record_failure', 'take_out_of_service', 'initiate_decommission', 'sla_breach'],
  condition_assessment:    ['complete_assessment', 'record_failure', 'sla_breach'],
  assessment_complete:     ['plan_refurbishment', 'energise', 'initiate_decommission', 'sla_breach'],
  refurbishment_planned:   ['take_out_of_service', 'sla_breach'],
  out_of_service:          ['start_refurbishment', 'return_to_service', 'record_failure', 'sla_breach'],
  refurbishment:           ['return_to_service', 'record_failure', 'sla_breach'],
  returned_to_service:     ['energise', 'sla_breach'],
  decommission_decision:   ['decommission', 'energise', 'sla_breach'],
  decommissioned:          [],
  failed:                  [],
};

export const SAS_STATE_TRANSITIONS: Record<SasAction, SasStatus> = {
  start_commissioning:     'commissioning',
  energise:                'energised',
  schedule_assessment:     'condition_assessment',
  complete_assessment:     'assessment_complete',
  plan_refurbishment:      'refurbishment_planned',
  take_out_of_service:     'out_of_service',
  start_refurbishment:     'refurbishment',
  return_to_service:       'returned_to_service',
  initiate_decommission:   'decommission_decision',
  decommission:            'decommissioned',
  record_failure:          'failed',
  sla_breach:              'registered',
};

// Regulator crossings
export function sasCrossesIntoRegulator(action: SasAction, tier: SubstationAssetTier): boolean {
  // record_failure always crosses — unplanned outage is a reportable grid event
  if (action === 'record_failure') return true;
  // decommission for transmission/critical_node → regulatory notification
  if (action === 'decommission') return tier === 'transmission' || tier === 'critical_node';
  // take_out_of_service for critical_node → notification
  if (action === 'take_out_of_service') return tier === 'critical_node';
  return false;
}

export function sasSlaBreachCrossesIntoRegulator(tier: SubstationAssetTier): boolean {
  return tier === 'transmission' || tier === 'critical_node';
}
