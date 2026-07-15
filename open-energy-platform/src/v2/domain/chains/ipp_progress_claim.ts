// ipp_progress_claim — EPC/contractor progress-claim (interim payment
// certificate) lifecycle as data.
//
// A contractor submits a progress claim against the works completed; the
// developer's QS reviews and assesses the claimed value, PM reviews it, an
// engineer certifies the value, and the developer either approves it in full
// or in part for payment, then processes payment. A dispute can be raised at
// PM review and resolved back into review; payment can be suspended and
// reinstated. `record_final_account` is the conclusive, once-off close-out —
// distinct from an ordinary `close_claim` — matching JBCC/FIDIC practice
// where the final account supersedes every interim certificate on the
// contract (v1 cascadeHint: "crosses regulator inbox every tier").
//
// Structural honesty (no invented guards):
//  - `open` is guarded by counterpartyDistinct: the contractor submitting the
//    claim and the developer administering it must be different legal
//    entities (no self-certification).
//  - approving payment (full or partial) commits the developer to a new
//    payment obligation, which a platform-wide compliance halt (NERSA
//    directive) must be able to block — approve_payment / approve_partial
//    are guarded by complianceHaltClear; disputing, suspending, or rejecting
//    is never blocked (de-risking exits must always stay open).
//  - engineer_certified is reachable ONLY from pm_review (via
//    certify_by_engineer), and approve_payment / approve_partial are the only
//    edges out of it — so no claim can be approved for payment without
//    passing through QS assessment, PM review, and engineer certification;
//    the state graph enforces the review chain, no extra guard needed.
//
// settles:true — process_payment moves the certified/approved amount to
// payment_processed: this chain authorises the actual progress payment
// against the EPC/works contract, not just a governance record (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippProgressClaim: ChainDecl = {
  key: 'ipp_progress_claim',
  noun: 'IPP progress claim',
  refPrefix: 'IPC',
  title: (f) => `Progress claim — ${(f.project_name as string) ?? 'unnamed project'} (${(f.claim_type as string) ?? 'interim'})`,
  visibility: 'party',
  settles: true,
  legalBasis: [{ instrument: 'REIPPPP', provision: 'Implementation Agreement construction payment certificates', effect: 'requires' }],
  roles: ['ipp_developer', 'contractor', 'regulator', 'operator'],

  fields: {
    claim_number: { type: 'string', label: 'Claim number' },
    project_id: { type: 'string', required: true, label: 'Project' },
    project_name: { type: 'string', label: 'Project name' },
    contractor_party: { type: 'party', role: 'contractor', label: 'Contractor' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (final-account awareness)' },
    claim_amount_zar: { type: 'number', required: true, min: 0, label: 'Claim amount (ZAR)' },
    claim_type: { type: 'string', required: true, label: 'Claim type' },
    claim_tier: { type: 'string', required: true, label: 'Claim tier' },
    qs_assessed_zar: { type: 'number', min: 0, label: 'QS assessed amount (ZAR)' },
    qs_notes: { type: 'string', label: 'QS review notes' },
    certified_amount_zar: { type: 'number', min: 0, label: 'Certified amount (ZAR)' },
    engineer_certification_notes: { type: 'string', label: 'Certification notes' },
    pm_notes: { type: 'string', label: 'PM / dispute-resolution notes' },
    dispute_reason: { type: 'string', label: 'Dispute reason' },
    suspension_reason: { type: 'string', label: 'Suspension / reinstatement reason' },
    rejection_reason: { type: 'string', label: 'Rejection reason' },
    // written by derive, never by the client
    qs_reviewed_at: { type: 'string', label: 'QS reviewed at' },
    certified_at: { type: 'string', label: 'Certified at' },
    approved_at: { type: 'string', label: 'Approved at' },
    payment_processed_at: { type: 'string', label: 'Payment processed at' },
    closed_at_ipc: { type: 'string', label: 'Claim closed at' },
    final_account_at: { type: 'string', label: 'Final account recorded at' },
  },

  initial: 'submitted',

  states: {
    submitted: { label: 'Submitted', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    quantity_survey_review: { label: 'Quantity-survey review', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    pm_review: { label: 'PM review', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    engineer_certified: { label: 'Engineer certified', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    approved: { label: 'Approved', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    partial_payment: { label: 'Partial payment', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    payment_processed: { label: 'Payment processed', terminal: false, holder: 'ipp_developer' },
    disputed: { label: 'Disputed', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    suspended: { label: 'Payment suspended', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    final_account: { label: 'Final account', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'submitted',
      by: ['contractor', 'operator'],
      actorBecomes: 'contractor',
      label: 'Submit progress claim',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        project_name: { type: 'string' },
        claim_amount_zar: { type: 'number', required: true, min: 0 },
        claim_type: { type: 'string', required: true },
        claim_tier: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // contractor ≠ developer (no self-certification of own claim).
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'commence_qs_review',
      from: 'submitted',
      to: 'quantity_survey_review',
      by: ['ipp_developer', 'operator'],
      label: 'Commence QS review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'complete_qs_review',
      from: 'quantity_survey_review',
      to: 'pm_review',
      by: ['ipp_developer', 'operator'],
      label: 'Complete QS review',
      intent: 'primary',
      input: {
        qs_assessed_zar: { type: 'number', min: 0 },
        qs_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ qs_reviewed_at: isoUtc(at) }),
    },
    {
      id: 'certify_by_engineer',
      from: 'pm_review',
      to: 'engineer_certified',
      by: ['ipp_developer', 'operator'],
      label: 'Engineer certify',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ certified_at: isoUtc(at) }),
    },
    {
      // full approval commits the developer to a new payment obligation.
      id: 'approve_payment',
      from: 'engineer_certified',
      to: 'approved',
      by: ['ipp_developer', 'operator'],
      label: 'Approve payment',
      intent: 'primary',
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      // partial approval is an alternate outcome of certification — also a new
      // payment obligation, so the same compliance-halt gate applies.
      id: 'approve_partial',
      from: 'engineer_certified',
      to: 'partial_payment',
      by: ['ipp_developer', 'operator'],
      label: 'Approve partial payment',
      intent: 'primary',
      input: {
        certified_amount_zar: { type: 'number', min: 0 },
        engineer_certification_notes: { type: 'string' },
      },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'process_payment',
      from: ['approved', 'partial_payment'],
      to: 'payment_processed',
      by: ['ipp_developer', 'operator'],
      label: 'Process payment',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ payment_processed_at: isoUtc(at) }),
    },
    {
      id: 'close_claim',
      from: 'payment_processed',
      to: 'closed',
      by: ['ipp_developer', 'operator'],
      label: 'Close claim',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_ipc: isoUtc(at) }),
    },
    {
      // conclusive settlement — supersedes every interim certificate on the
      // contract. Reachable only from a processed payment, never a shortcut
      // around review/certification/approval.
      id: 'record_final_account',
      from: 'payment_processed',
      to: 'final_account',
      by: ['ipp_developer', 'operator'],
      label: 'Record final account',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ final_account_at: isoUtc(at) }),
    },

    // --- disputes / suspension -------------------------------------------
    {
      id: 'dispute_claim',
      from: 'pm_review',
      to: 'disputed',
      by: ['ipp_developer', 'contractor', 'operator'],
      label: 'Dispute',
      intent: 'destructive',
      input: { dispute_reason: { type: 'string', required: true } },
      requiresReason: ['measurement_disagreement', 'rate_disagreement', 'scope_disagreement', 'certification_withheld'],
      guards: [],
    },
    {
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'pm_review',
      by: ['ipp_developer', 'operator'],
      label: 'Resolve dispute',
      intent: 'primary',
      input: { pm_notes: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'suspend_payment',
      from: ['approved', 'partial_payment'],
      to: 'suspended',
      by: ['ipp_developer', 'operator'],
      label: 'Suspend payment',
      intent: 'destructive',
      input: { suspension_reason: { type: 'string', required: true } },
      requiresReason: ['funding_shortfall', 'quality_defect', 'compliance_hold', 'documentation_incomplete'],
      guards: [],
    },
    {
      id: 'reinstate_payment',
      from: 'suspended',
      to: 'pm_review',
      by: ['ipp_developer', 'operator'],
      label: 'Reinstate payment',
      intent: 'primary',
      input: { suspension_reason: { type: 'string', required: true } },
      guards: [],
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'reject_claim',
      from: ['submitted', 'quantity_survey_review', 'pm_review', 'engineer_certified', 'disputed'],
      to: 'rejected',
      by: ['ipp_developer', 'operator'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['insufficient_evidence', 'over_certification', 'duplicate_claim', 'contract_terminated'],
      guards: [],
    },
  ],
};
