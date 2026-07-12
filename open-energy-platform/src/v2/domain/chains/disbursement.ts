// disbursement — facility funds pay-out lifecycle as data.
//
// A borrower requests a disbursement under an approved drawdown; the lender
// verifies conditions precedent, authorises against a credit approval, releases
// funds, and the borrower confirms receipt. The credit spine is structural:
// pay_funds ONLY leaves `authorised`, and the ONLY path into `authorised` is
// `authorise` — which is guarded by creditApprovalPresent. So funds can NEVER
// be paid without a named credit approval on the authorising edge; the state
// graph, not a pay-time check, is what enforces it. Conditions-precedent are
// gated one step earlier by cpEvidencePresent on `verify`.
//
// settles:false — this records a movement of facility funds as an operational
// control event; it is not itself the custodial payment rail (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const disbursement: ChainDecl = {
  key: 'disbursement',
  noun: 'Disbursement',
  refPrefix: 'DISB',
  title: (f) =>
    `Disbursement — ${(f.currency as string) ?? 'ZAR'} ${(f.amount as number) ?? 0} under ${(f.facility_ref as string) ?? 'facility'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NCA 2005', provision: 's90 lawful credit disbursement', effect: 'requires' },
    { instrument: 'Facility Agreement', provision: 'drawdown conditions precedent', effect: 'requires' },
  ],
  roles: ['borrower', 'lender', 'regulator', 'operator'],

  fields: {
    disbursement_number: { type: 'string', label: 'Disbursement number' },
    borrower_party: { type: 'party', role: 'borrower', label: 'Borrower' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender' },
    facility_ref: { type: 'string', required: true, label: 'Facility ref' },
    drawdown_ref: { type: 'string', label: 'Drawdown ref' },
    amount: { type: 'number', required: true, min: 0, label: 'Amount' },
    currency: { type: 'string', label: 'Currency' },
    purpose: { type: 'string', label: 'Purpose of funds' },
    value_date: { type: 'string', label: 'Value date' },
    beneficiary_account_ref: { type: 'string', label: 'Beneficiary account ref' },
    // supplied on their edges, carried for audit
    cp_evidence_ref: { type: 'string', label: 'CP evidence ref' },
    credit_approval_ref: { type: 'string', label: 'Credit approval ref' },
    payment_reference: { type: 'string', label: 'Payment reference' },
    // written by derive, never by the client
    verified_at: { type: 'string', label: 'CP verified at' },
    authorised_at: { type: 'string', label: 'Authorised at' },
    paid_at: { type: 'string', label: 'Funds paid at' },
    confirmed_at: { type: 'string', label: 'Receipt confirmed at' },
  },

  initial: 'requested',

  states: {
    requested: { label: 'Requested', terminal: false, holder: 'lender', sla: { hours: 24 } },
    verified: { label: 'CP verified', terminal: false, holder: 'lender', sla: { hours: 8 } },
    authorised: { label: 'Authorised', terminal: false, holder: 'lender', sla: { hours: 24 } },
    paid: { label: 'Funds paid', terminal: false, holder: 'borrower', sla: { hours: 48 } },
    confirmed: { label: 'Receipt confirmed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'requested',
      by: ['borrower', 'operator'],
      actorBecomes: 'borrower',
      label: 'Request disbursement',
      intent: 'primary',
      input: {
        facility_ref: { type: 'string', required: true },
        drawdown_ref: { type: 'string' },
        amount: { type: 'number', required: true, min: 0 },
        currency: { type: 'string' },
        purpose: { type: 'string' },
        value_date: { type: 'string' },
        beneficiary_account_ref: { type: 'string' },
        lender_party: { type: 'party', role: 'lender' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // no self-lending, and no new commitments under a platform compliance halt.
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
    },
    {
      id: 'verify',
      from: 'requested',
      to: 'verified',
      by: ['lender'],
      label: 'Verify conditions precedent',
      intent: 'primary',
      // cp_evidence_ref is NOT `required` here — cpEvidencePresent is the gate
      // (it also enforces a real ref length), so it must reach the guard, not be
      // shadowed by the engine's step-5 required-field check.
      input: { cp_evidence_ref: { type: 'string' } },
      guards: ['cpEvidencePresent'],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      // structural credit gate: the ONLY edge into `authorised`, guarded by a
      // named credit approval. pay_funds leaves only `authorised`, so funds
      // cannot move without this approval landing first.
      id: 'authorise',
      from: 'verified',
      to: 'authorised',
      by: ['lender'],
      label: 'Authorise disbursement',
      intent: 'primary',
      // credit_approval_ref NOT `required` — creditApprovalPresent is the gate.
      input: { credit_approval_ref: { type: 'string' } },
      guards: ['creditApprovalPresent'],
      derive: (_f, at: Instant) => ({ authorised_at: isoUtc(at) }),
    },
    {
      id: 'pay_funds',
      from: 'authorised',
      to: 'paid',
      by: ['lender'],
      label: 'Release funds',
      intent: 'primary',
      input: { payment_reference: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ paid_at: isoUtc(at) }),
    },
    {
      id: 'confirm_receipt',
      from: 'paid',
      to: 'confirmed',
      by: ['borrower'],
      label: 'Confirm receipt',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ confirmed_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: ['requested', 'verified'],
      to: 'rejected',
      by: ['lender'],
      label: 'Reject disbursement',
      intent: 'destructive',
      requiresReason: ['cp_not_satisfied', 'facility_exhausted', 'credit_declined', 'documentation_deficient'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['requested', 'verified', 'authorised'],
      to: 'cancelled',
      by: ['borrower'],
      label: 'Cancel request',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'amount_revised', 'rescheduled'],
      guards: [],
    },
    {
      id: 'lapse',
      from: ['authorised'],
      to: 'lapsed',
      by: ['lender', 'operator'],
      label: 'Lapse authorisation',
      intent: 'destructive',
      requiresReason: ['value_date_passed', 'reauthorisation_required'],
      guards: [],
    },
  ],

  // authorised funds not released by the value date lapse — an authorisation
  // cannot be trusted indefinitely. Record-only stub; the sweep computes the
  // real bar off the state sla hours (ppa_contract pattern).
  timers: [{ onState: 'authorised', after: { hours: 0 }, fire: 'lapse', kind: 'time_bar' }],
};
