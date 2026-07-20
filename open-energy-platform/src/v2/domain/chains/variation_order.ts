// variation_order — EPC/contractor variation-instruction lifecycle as data.
//
// An IPP developer issues a variation instruction against the contractor's
// scope; the contractor acknowledges and quotes; the IPP reviews the
// quotation and either approves it, disputes the price, rejects it, or
// cancels the instruction outright. A price dispute can be resolved back
// into review or referred out to adjudication (terminal — the platform does
// not model the adjudicator's decision). Approval commits the parties to the
// varied work; completion and payment certification close the order out.
//
// Structural honesty (no invented guards):
//  - `approve_variation` is the ONLY edge into `approved`, which is the ONLY
//    non-terminal predecessor of `in_progress` → `completed_pending_payment`
//    → `paid`. So work can never be certified for payment without having
//    passed through an explicit approval — the state graph enforces the
//    approval gate, no guard required.
//  - `open` is guarded by counterpartyDistinct: the issuing IPP developer and
//    the contractor receiving the instruction must be different legal
//    entities (no self-instruction).
//  - `approve_variation` is guarded by complianceHaltClear: approving a
//    variation commits the IPP to a new payment obligation, which a
//    platform-wide compliance halt (NERSA directive) must be able to block;
//    disputing, rejecting, or cancelling is never blocked (de-risking exits
//    must always stay open).
//
// settles:true — certify_payment moves the order to `paid`: this chain
// authorises the actual payment of instructed_value_zar / agreed_value_zar
// against the EPC contract, not just a governance record (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const variationOrder: ChainDecl = {
  key: 'variation_order',
  noun: 'Variation order',
  refPrefix: 'VO',
  title: (f) => `Variation order — ${(f.title as string) ?? 'untitled variation'}`,
  visibility: 'party',
  settles: true,
  roles: ['ipp_developer', 'contractor', 'regulator', 'operator'],

  fields: {
    title: { type: 'string', required: true, label: 'Variation title' },
    contractor_party: { type: 'party', role: 'contractor', label: 'Contractor' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (adjudication awareness)' },
    instructed_value_zar: { type: 'number', min: 0, label: 'Instructed value (ZAR)' },
    agreed_value_zar: { type: 'number', min: 0, label: 'Agreed value (ZAR)' },
    quotation_notes: { type: 'string', label: 'Quotation review notes' },
    // written by derive, never by the client
    instructed_at: { type: 'string', label: 'Instructed at' },
    approved_at: { type: 'string', label: 'Approved at' },
    work_completed_at: { type: 'string', label: 'Work completed at' },
    paid_at: { type: 'string', label: 'Paid at' },
  },

  initial: 'instructed',

  states: {
    instructed: { label: 'Instructed', terminal: false, holder: 'contractor' },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'contractor' },
    quotation_submitted: { label: 'Quotation submitted', terminal: false, holder: 'ipp_developer' },
    quotation_reviewed: { label: 'Quotation reviewed', terminal: false, holder: 'ipp_developer' },
    disputed_pricing: { label: 'Pricing disputed', terminal: false, holder: 'ipp_developer' },
    approved: { label: 'Approved', terminal: false, holder: 'contractor' },
    in_progress: { label: 'Work in progress', terminal: false, holder: 'contractor' },
    completed_pending_payment: { label: 'Completed — pending payment', terminal: false, holder: 'ipp_developer' },
    paid: { label: 'Paid', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    adjudicated: { label: 'Referred to adjudication', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'instructed',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Issue variation instruction',
      intent: 'primary',
      input: {
        title: { type: 'string', required: true },
        instructed_value_zar: { type: 'number', min: 0 },
        contractor_party: { type: 'party', role: 'contractor' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // IPP ≠ contractor (no self-instruction).
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ instructed_at: isoUtc(at) }),
    },
    {
      id: 'acknowledge_instruction',
      from: 'instructed',
      to: 'acknowledged',
      by: ['ipp_developer', 'operator'],
      label: 'Acknowledge instruction',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_quotation',
      from: 'acknowledged',
      to: 'quotation_submitted',
      by: ['ipp_developer', 'operator'],
      label: 'Submit quotation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'review_quotation',
      from: 'quotation_submitted',
      to: 'quotation_reviewed',
      by: ['ipp_developer', 'operator'],
      label: 'Review quotation',
      intent: 'primary',
      input: {
        quotation_notes: { type: 'string' },
        instructed_value_zar: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'dispute_pricing',
      from: 'quotation_reviewed',
      to: 'disputed_pricing',
      by: ['ipp_developer', 'operator'],
      label: 'Dispute pricing',
      intent: 'secondary',
      requiresReason: ['pricing_dispute', 'scope_disagreement', 'measurement_dispute', 'rate_disagreement'],
      guards: [],
    },
    {
      id: 'resolve_dispute',
      from: 'disputed_pricing',
      to: 'quotation_reviewed',
      by: ['ipp_developer', 'operator'],
      label: 'Resolve dispute',
      intent: 'primary',
      input: { instructed_value_zar: { type: 'number', min: 0 } },
      guards: [],
    },
    {
      id: 'refer_adjudication',
      from: 'disputed_pricing',
      to: 'adjudicated',
      by: ['ipp_developer', 'operator'],
      label: 'Refer to adjudication',
      intent: 'destructive',
      requiresReason: ['unresolved_pricing_dispute', 'contractual_deadlock', 'independent_adjudication_requested'],
      guards: [],
    },
    {
      id: 'approve_variation',
      from: 'quotation_reviewed',
      to: 'approved',
      by: ['ipp_developer', 'operator'],
      label: 'Approve variation',
      intent: 'primary',
      input: { agreed_value_zar: { type: 'number', min: 0 } },
      // approving commits the IPP to a new payment obligation.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'commence_work',
      from: 'approved',
      to: 'in_progress',
      by: ['ipp_developer', 'operator'],
      label: 'Commence work',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'complete_work',
      from: 'in_progress',
      to: 'completed_pending_payment',
      by: ['ipp_developer', 'operator'],
      label: 'Complete work',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ work_completed_at: isoUtc(at) }),
    },
    {
      id: 'certify_payment',
      from: 'completed_pending_payment',
      to: 'paid',
      by: ['ipp_developer', 'operator'],
      label: 'Certify payment',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ paid_at: isoUtc(at) }),
    },

    // --- exits ------------------------------------------------------------
    {
      id: 'reject_variation',
      from: ['quotation_submitted', 'quotation_reviewed', 'disputed_pricing'],
      to: 'rejected',
      by: ['ipp_developer', 'operator'],
      label: 'Reject variation',
      intent: 'destructive',
      requiresReason: ['scope_not_approved', 'budget_exceeded', 'not_in_original_contract', 'duplicate_instruction'],
      guards: [],
    },
    {
      id: 'cancel_instruction',
      from: ['instructed', 'acknowledged', 'quotation_submitted', 'quotation_reviewed', 'disputed_pricing'],
      to: 'cancelled',
      by: ['ipp_developer', 'operator'],
      label: 'Cancel instruction',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'instruction_withdrawn', 'superseded_by_new_instruction'],
      guards: [],
    },
  ],
};
