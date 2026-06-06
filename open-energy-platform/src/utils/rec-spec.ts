// ═══════════════════════════════════════════════════════════════════════════════
// W226 — REC Device Registration & Issuance Specification
// I-REC Standard (GCC) + zaRECs/RECSA (EECS-aligned SA domestic)
// ═══════════════════════════════════════════════════════════════════════════════

export type RecDeviceStatus =
  | 'draft'
  | 'submitted'
  | 'issuer_review'
  | 'queries'
  | 'responded'
  | 'approved'
  | 'registered'
  | 'active'
  | 'rejected'
  | 'suspended';

export type RecDeviceAction =
  | 'submit'
  | 'issuer_review'
  | 'raise_queries'
  | 'respond_to_queries'
  | 'approve'
  | 'register'
  | 'activate'
  | 'reject'
  | 'suspend'
  | 'sla_breach';

export type RecIssuanceTier =
  | 'micro'    // <500 MWh/yr
  | 'small'    // 500–21,900 MWh/yr
  | 'medium'   // 21,900–87,600 MWh/yr
  | 'large'    // 87,600–219,000 MWh/yr
  | 'bulk';    // >219,000 MWh/yr

// INVERTED SLA — larger device = more complex = more time
export function deriveRecDeviceSla(tier: RecIssuanceTier): number {
  const DAYS: Record<RecIssuanceTier, number> = {
    micro: 14, small: 21, medium: 30, large: 45, bulk: 60,
  };
  return DAYS[tier] ?? 21;
}

export const REC_DEVICE_HARD_TERMINALS = new Set<RecDeviceStatus>([
  'rejected', 'suspended',
]);

export const REC_DEVICE_VALID_TRANSITIONS: Record<RecDeviceStatus, RecDeviceAction[]> = {
  draft:          ['submit', 'sla_breach'],
  submitted:      ['issuer_review', 'reject', 'sla_breach'],
  issuer_review:  ['raise_queries', 'approve', 'reject', 'sla_breach'],
  queries:        ['respond_to_queries', 'reject', 'sla_breach'],
  responded:      ['approve', 'raise_queries', 'reject', 'sla_breach'],
  approved:       ['register', 'sla_breach'],
  registered:     ['activate', 'sla_breach'],
  active:         ['suspend', 'sla_breach'],
  rejected:       [],
  suspended:      [],
};

export const REC_DEVICE_STATE_TRANSITIONS: Record<RecDeviceAction, RecDeviceStatus> = {
  submit:                'submitted',
  issuer_review:         'issuer_review',
  raise_queries:         'queries',
  respond_to_queries:    'responded',
  approve:               'approved',
  register:              'registered',
  activate:              'active',
  reject:                'rejected',
  suspend:               'suspended',
  sla_breach:            'rejected',
};

export function recDeviceCrossesIntoRegulator(
  action: RecDeviceAction,
  tier: RecIssuanceTier,
): boolean {
  if (action === 'register' || action === 'activate') return tier === 'bulk';
  return false;
}

export function recDeviceSlaBreachCrossesIntoRegulator(tier: RecIssuanceTier): boolean {
  return tier === 'bulk' || tier === 'large';
}

// ── Issuance request spec ──────────────────────────────────────────────────────

export type RecIssuanceStatus =
  | 'draft'
  | 'submitted_to_issuer'
  | 'payment_pending'
  | 'payment_confirmed'
  | 'processing'
  | 'issued'
  | 'rejected'
  | 'cancelled';

export type RecIssuanceAction =
  | 'submit_to_issuer'
  | 'await_payment'
  | 'confirm_payment'
  | 'commence_processing'
  | 'issue_certificates'
  | 'reject'
  | 'cancel'
  | 'sla_breach';

export function deriveRecIssuanceSla(tier: RecIssuanceTier): number {
  const DAYS: Record<RecIssuanceTier, number> = {
    micro: 7, small: 10, medium: 14, large: 21, bulk: 30,
  };
  return DAYS[tier] ?? 10;
}

export const REC_ISSUANCE_HARD_TERMINALS = new Set<RecIssuanceStatus>([
  'issued', 'rejected', 'cancelled',
]);

export const REC_ISSUANCE_VALID_TRANSITIONS: Record<RecIssuanceStatus, RecIssuanceAction[]> = {
  draft:                ['submit_to_issuer', 'cancel', 'sla_breach'],
  submitted_to_issuer:  ['await_payment', 'reject', 'sla_breach'],
  payment_pending:      ['confirm_payment', 'cancel', 'sla_breach'],
  payment_confirmed:    ['commence_processing', 'sla_breach'],
  processing:           ['issue_certificates', 'reject', 'sla_breach'],
  issued:               [],
  rejected:             [],
  cancelled:            [],
};

export const REC_ISSUANCE_STATE_TRANSITIONS: Record<RecIssuanceAction, RecIssuanceStatus> = {
  submit_to_issuer:     'submitted_to_issuer',
  await_payment:        'payment_pending',
  confirm_payment:      'payment_confirmed',
  commence_processing:  'processing',
  issue_certificates:   'issued',
  reject:               'rejected',
  cancel:               'cancelled',
  sla_breach:           'rejected',
};

export function recIssuanceCrossesIntoRegulator(
  action: RecIssuanceAction,
  tier: RecIssuanceTier,
): boolean {
  if (action === 'issue_certificates') return tier === 'bulk' || tier === 'large';
  return false;
}

export function recIssuanceSlaBreachCrossesIntoRegulator(tier: RecIssuanceTier): boolean {
  return tier === 'bulk' || tier === 'large';
}
