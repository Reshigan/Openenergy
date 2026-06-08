export type IcsStatus =
  | 'schedule_draft'
  | 'submitted_to_sapp'
  | 'sapp_review'
  | 'counter_schedule_received'
  | 'negotiation'
  | 'agreed'
  | 'operating'
  | 'deviated'
  | 'deviation_resolved'
  | 'completed'
  | 'dispute'
  | 'cancelled';

export type IcsAction =
  | 'submit_to_sapp'
  | 'sapp_acknowledge'
  | 'receive_counter_schedule'
  | 'open_negotiation'
  | 'agree_schedule'
  | 'commence_delivery'
  | 'flag_deviation'
  | 'resolve_deviation'
  | 'complete_delivery'
  | 'raise_dispute'
  | 'cancel';

export type CapacityTier = 'small' | 'medium' | 'large' | 'strategic';

export function deriveCapacityTier(scheduled_mw: number): CapacityTier {
  if (scheduled_mw >= 500) return 'strategic';
  if (scheduled_mw >= 200) return 'large';
  if (scheduled_mw >= 50) return 'medium';
  return 'small';
}

// INVERTED SLA: larger MW = more bilateral review needed
export function deriveIcsSlaWindowDays(tier: CapacityTier): number {
  return { small: 1, medium: 2, large: 3, strategic: 5 }[tier];
}

export const ICS_HARD_TERMINALS = new Set<IcsStatus>(['completed', 'cancelled']);

export const ICS_VALID_TRANSITIONS: Record<IcsStatus, IcsAction[]> = {
  schedule_draft:           ['submit_to_sapp', 'cancel'],
  submitted_to_sapp:        ['sapp_acknowledge', 'cancel'],
  sapp_review:              ['receive_counter_schedule', 'agree_schedule', 'cancel'],
  counter_schedule_received:['open_negotiation', 'cancel'],
  negotiation:              ['agree_schedule', 'cancel'],
  agreed:                   ['commence_delivery', 'cancel'],
  operating:                ['flag_deviation', 'complete_delivery'],
  deviated:                 ['resolve_deviation', 'raise_dispute'],
  deviation_resolved:       ['complete_delivery', 'flag_deviation'],
  completed:                [],
  dispute:                  ['complete_delivery', 'cancel'],
  cancelled:                [],
};

export const ICS_STATE_TRANSITIONS: Record<IcsAction, IcsStatus> = {
  submit_to_sapp:       'submitted_to_sapp',
  sapp_acknowledge:     'sapp_review',
  receive_counter_schedule: 'counter_schedule_received',
  open_negotiation:     'negotiation',
  agree_schedule:       'agreed',
  commence_delivery:    'operating',
  flag_deviation:       'deviated',
  resolve_deviation:    'deviation_resolved',
  complete_delivery:    'completed',
  raise_dispute:        'dispute',
  cancel:               'cancelled',
};

export function crossesIcsIntoRegulator(
  action: IcsAction,
  tier: CapacityTier,
): boolean {
  // NERSA §E.5: disputes on interconnectors must be reported
  if (action === 'raise_dispute') return true;
  // Strategic/large bilateral schedules completion notified (SADC Energy Protocol)
  if (action === 'complete_delivery' && (tier === 'strategic' || tier === 'large')) return true;
  return false;
}

export type IcsEvent =
  | 'ics_evt_created'
  | 'ics_evt_submitted'
  | 'ics_evt_sapp_review'
  | 'ics_evt_counter_received'
  | 'ics_evt_negotiation'
  | 'ics_evt_agreed'
  | 'ics_evt_operating'
  | 'ics_evt_deviated'
  | 'ics_evt_deviation_resolved'
  | 'ics_evt_completed'
  | 'ics_evt_dispute'
  | 'ics_evt_cancelled'
  | 'ics_evt_sla_breach';
