// ═══════════════════════════════════════════════════════════════════════════════
// W205 — Grid Demand-Response Programme Participation & Settlement
// NERSA Grid Code §CSC + NTCSA DSR + IEC 61968 DR Interface
// ═══════════════════════════════════════════════════════════════════════════════

export type DrStatus =
  | 'registered'       // participant enrolled in DR programme
  | 'notification_sent' // SO sends day-ahead or real-time notification
  | 'acknowledged'     // participant acknowledges
  | 'activated'        // SO issues activation instruction
  | 'load_shed'        // participant is curtailing load
  | 'performance_metering' // metering window closes; measuring actual response
  | 'performance_verified' // independent meter verification complete
  | 'settlement_calc'  // SO calculates incentive payment
  | 'settlement_agreed' // parties agree settlement amount
  | 'settlement_disputed' // dispute on performance measurement
  | 'settled'          // incentive payment posted; terminal +
  | 'non_performance'  // participant failed to respond; terminal —
  | 'cancelled';       // activation cancelled before load shed; terminal

export type DrAction =
  | 'send_notification'
  | 'acknowledge'
  | 'activate'
  | 'confirm_load_shed'
  | 'close_metering'
  | 'verify_performance'
  | 'calculate_settlement'
  | 'agree_settlement'
  | 'dispute_settlement'
  | 'resolve_dispute'
  | 'post_settlement'
  | 'record_non_performance'
  | 'cancel'
  | 'sla_breach';

export type DrProgramme = 'real_time' | 'day_ahead' | 'interruptible_tariff' | 'frequency_response';

// URGENT SLA: faster response programmes get TIGHTER deadlines
export function deriveDrSla(programme: DrProgramme): number {
  const HOURS: Record<DrProgramme, number> = {
    real_time:           4,   // must settle same day
    day_ahead:          24,
    interruptible_tariff: 48,
    frequency_response:  2,   // near-real-time
  };
  return HOURS[programme] ?? 24;
}

export const DR_HARD_TERMINALS = new Set<DrStatus>([
  'settled', 'non_performance', 'cancelled',
]);

export const DR_VALID_TRANSITIONS: Record<DrStatus, DrAction[]> = {
  registered:             ['send_notification', 'sla_breach'],
  notification_sent:      ['acknowledge', 'cancel', 'sla_breach'],
  acknowledged:           ['activate', 'cancel', 'sla_breach'],
  activated:              ['confirm_load_shed', 'record_non_performance', 'cancel', 'sla_breach'],
  load_shed:              ['close_metering', 'sla_breach'],
  performance_metering:   ['verify_performance', 'sla_breach'],
  performance_verified:   ['calculate_settlement', 'sla_breach'],
  settlement_calc:        ['agree_settlement', 'dispute_settlement', 'sla_breach'],
  settlement_agreed:      ['post_settlement', 'sla_breach'],
  settlement_disputed:    ['resolve_dispute', 'sla_breach'],
  settled:                [],
  non_performance:        [],
  cancelled:              [],
};

export const DR_STATE_TRANSITIONS: Record<DrAction, DrStatus> = {
  send_notification:       'notification_sent',
  acknowledge:             'acknowledged',
  activate:                'activated',
  confirm_load_shed:       'load_shed',
  close_metering:          'performance_metering',
  verify_performance:      'performance_verified',
  calculate_settlement:    'settlement_calc',
  agree_settlement:        'settlement_agreed',
  dispute_settlement:      'settlement_disputed',
  resolve_dispute:         'settlement_agreed',
  post_settlement:         'settled',
  record_non_performance:  'non_performance',
  cancel:                  'cancelled',
  sla_breach:              'registered',
};

// Regulator inbox crossings (NERSA)
export function drCrossesIntoRegulator(action: DrAction, programme: DrProgramme): boolean {
  // non_performance crosses regulator for ALL programmes (market integrity)
  if (action === 'record_non_performance') return true;
  // dispute_settlement always crosses
  if (action === 'dispute_settlement') return true;
  // frequency_response + real_time: activate and non-performance cross
  if (['real_time', 'frequency_response'].includes(programme) && action === 'activate') return true;
  return false;
}

export function drSlaBreachCrossesIntoRegulator(programme: DrProgramme): boolean {
  return programme === 'frequency_response' || programme === 'real_time';
}
