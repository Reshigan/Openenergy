export type DsrStatus =
  | 'received'
  | 'acknowledged'
  | 'identity_verified'
  | 'data_mapped'
  | 'legal_assessment'
  | 'response_drafted'
  | 'fulfilled'
  | 'partial_disclosure'
  | 'refused'
  | 'erasure_completed'
  | 'objection_upheld'
  | 'withdrawn';

export type DsrAction =
  | 'acknowledge'
  | 'verify_identity'
  | 'map_data'
  | 'commence_legal_assessment'
  | 'draft_response'
  | 'fulfill'
  | 'partially_disclose'
  | 'refuse'
  | 'complete_erasure'
  | 'uphold_objection'
  | 'withdraw';

export type RequestType = 'access' | 'correction' | 'deletion' | 'objection' | 'portability' | 'restriction';

// MIXED SLA: POPIA calendar-day mandates by request type
export function deriveDsrSlaDays(request_type: RequestType): number {
  return {
    access: 30,
    correction: 15,
    deletion: 15,
    objection: 21,
    portability: 30,
    restriction: 21,
  }[request_type];
}

export const DSR_HARD_TERMINALS = new Set<DsrStatus>([
  'fulfilled', 'partial_disclosure', 'refused', 'erasure_completed', 'objection_upheld', 'withdrawn',
]);

export const DSR_VALID_TRANSITIONS: Record<DsrStatus, DsrAction[]> = {
  received:           ['acknowledge', 'withdraw'],
  acknowledged:       ['verify_identity', 'withdraw'],
  identity_verified:  ['map_data', 'withdraw'],
  data_mapped:        ['commence_legal_assessment'],
  legal_assessment:   ['draft_response'],
  response_drafted:   ['fulfill', 'partially_disclose', 'refuse', 'complete_erasure', 'uphold_objection'],
  fulfilled:          [],
  partial_disclosure: [],
  refused:            [],
  erasure_completed:  [],
  objection_upheld:   [],
  withdrawn:          [],
};

export const DSR_STATE_TRANSITIONS: Record<DsrAction, DsrStatus> = {
  acknowledge:               'acknowledged',
  verify_identity:           'identity_verified',
  map_data:                  'data_mapped',
  commence_legal_assessment: 'legal_assessment',
  draft_response:            'response_drafted',
  fulfill:                   'fulfilled',
  partially_disclose:        'partial_disclosure',
  refuse:                    'refused',
  complete_erasure:          'erasure_completed',
  uphold_objection:          'objection_upheld',
  withdraw:                  'withdrawn',
};

export function crossesDsrIntoRegulator(
  action: DsrAction,
  _request_type: RequestType,
): boolean {
  // Refusal of access/portability must be notified to the Information Regulator
  if (action === 'refuse' || action === 'partially_disclose') return true;
  return false;
}

export type DsrEvent =
  | 'dsr_evt_received'
  | 'dsr_evt_acknowledged'
  | 'dsr_evt_identity_verified'
  | 'dsr_evt_data_mapped'
  | 'dsr_evt_legal_assessment'
  | 'dsr_evt_response_drafted'
  | 'dsr_evt_fulfilled'
  | 'dsr_evt_partial_disclosure'
  | 'dsr_evt_refused'
  | 'dsr_evt_erasure_completed'
  | 'dsr_evt_objection_upheld'
  | 'dsr_evt_withdrawn'
  | 'dsr_evt_sla_breach';
