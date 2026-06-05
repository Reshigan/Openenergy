// ═══════════════════════════════════════════════════════════════════════════════
// W206 — Carbon Registry Transfer & International Registry Notification
// UNFCCC Art 6.2 + Verra VCUS + Gold Standard + CORSIA registry transfers
// ═══════════════════════════════════════════════════════════════════════════════

export type CrtStatus =
  | 'transfer_requested'   // account holder submits transfer instruction
  | 'aml_kyc_check'        // registry runs AML/KYC on counterparty
  | 'aml_kyc_passed'       // check cleared
  | 'registry_review'      // source registry verifies serial range & quantity
  | 'authorized'           // registry authorizes transfer
  | 'transfer_in_flight'   // units in transit between registries
  | 'destination_receipt'  // destination registry confirms receipt
  | 'ca_notation_required' // corresponding adjustment notification to UNFCCC required
  | 'ca_notified'          // UNFCCC / DNA notified; terminal + (international)
  | 'completed'            // domestic transfer complete; terminal +
  | 'aml_rejected'         // AML/KYC failed; terminal —
  | 'registry_rejected'    // registry refused transfer; terminal —
  | 'cancelled';           // cancelled before authorization; terminal

export type CrtAction =
  | 'submit_aml_kyc'
  | 'pass_aml_kyc'
  | 'fail_aml_kyc'
  | 'submit_registry_review'
  | 'authorize'
  | 'reject_registry'
  | 'initiate_transfer'
  | 'confirm_receipt'
  | 'flag_ca_required'
  | 'notify_ca'
  | 'complete_domestic'
  | 'cancel'
  | 'sla_breach';

export type TransferType = 'domestic' | 'international_art6' | 'corsia' | 'voluntary_crossregistry';

// INVERTED SLA: international / CORSIA transfers get more scrutiny time
export function deriveCrtSla(transferType: TransferType): number {
  const DAYS: Record<TransferType, number> = {
    domestic:                 7,
    voluntary_crossregistry: 14,
    corsia:                  21,
    international_art6:      30,
  };
  return DAYS[transferType] ?? 14;
}

export const CRT_HARD_TERMINALS = new Set<CrtStatus>([
  'ca_notified', 'completed', 'aml_rejected', 'registry_rejected', 'cancelled',
]);

export const CRT_VALID_TRANSITIONS: Record<CrtStatus, CrtAction[]> = {
  transfer_requested:  ['submit_aml_kyc', 'cancel', 'sla_breach'],
  aml_kyc_check:       ['pass_aml_kyc', 'fail_aml_kyc', 'sla_breach'],
  aml_kyc_passed:      ['submit_registry_review', 'sla_breach'],
  registry_review:     ['authorize', 'reject_registry', 'sla_breach'],
  authorized:          ['initiate_transfer', 'cancel', 'sla_breach'],
  transfer_in_flight:  ['confirm_receipt', 'sla_breach'],
  destination_receipt: ['flag_ca_required', 'complete_domestic', 'sla_breach'],
  ca_notation_required: ['notify_ca', 'sla_breach'],
  ca_notified:         [],
  completed:           [],
  aml_rejected:        [],
  registry_rejected:   [],
  cancelled:           [],
};

export const CRT_STATE_TRANSITIONS: Record<CrtAction, CrtStatus> = {
  submit_aml_kyc:       'aml_kyc_check',
  pass_aml_kyc:         'aml_kyc_passed',
  fail_aml_kyc:         'aml_rejected',
  submit_registry_review: 'registry_review',
  authorize:            'authorized',
  reject_registry:      'registry_rejected',
  initiate_transfer:    'transfer_in_flight',
  confirm_receipt:      'destination_receipt',
  flag_ca_required:     'ca_notation_required',
  notify_ca:            'ca_notified',
  complete_domestic:    'completed',
  cancel:               'cancelled',
  sla_breach:           'transfer_requested',
};

// Regulator inbox crossings (DFFE / DNA / UNFCCC)
export function crtCrossesIntoRegulator(action: CrtAction, transferType: TransferType): boolean {
  // aml_rejected always crosses regulator (all types — FICA/FAIS compliance)
  if (action === 'fail_aml_kyc') return true;
  // notify_ca always (UNFCCC Article 6 requirement)
  if (action === 'notify_ca') return true;
  // authorize, initiate_transfer → international types only
  if (['authorize', 'initiate_transfer'].includes(action)) {
    return transferType === 'international_art6' || transferType === 'corsia';
  }
  return false;
}

export function crtSlaBreachCrossesIntoRegulator(transferType: TransferType): boolean {
  return transferType === 'international_art6' || transferType === 'corsia';
}
