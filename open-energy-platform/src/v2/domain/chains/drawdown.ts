// drawdown — project-finance facility drawdown lifecycle as data.
//
// Pilot chain 2 (docs/architecture/REBUILD_FUNCTIONAL_FLOOR.md). Motivating
// case: the settlement-honesty stamp. A drawdown request runs borrower →
// lender through conditions-precedent, credit approval, and a disbursement
// INSTRUCTION — but money never moves on this chain. The platform has no
// custody and no payment rails (R-S5-1), so:
//
//  - settles:false (build-checked; export always carries the custody notice).
//  - the terminal state that WOULD represent settled money — `disbursed` — is
//    DECLARED but UNREACHABLE: no transition targets it. It exists so the view
//    and export can name the honest end-state ("funds disbursed") while making
//    it structurally impossible for this system to claim it happened.
//  - the reachable rest-state is `disbursement_instructed`: we recorded that
//    the lender instructed disbursement to an external rail. That is all we know.
//
// lender is assigned on the @new `open` edge, so no mid-lifecycle party
// assignment — Fix 1 (register coerced.parties on non-@new edges) is not
// needed here.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const drawdown: ChainDecl = {
  key: 'drawdown',
  noun: 'Facility drawdown',
  refPrefix: 'DRW',
  title: (f) => `Drawdown — ${(f.borrower_name as string) ?? 'unnamed'} #${(f.tranche_no as number) ?? '?'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'facility agreement', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'project registration', effect: 'requires' },
  ],
  roles: ['borrower', 'lender', 'operator', 'regulator'],

  fields: {
    facility_ref: { type: 'string', required: true, label: 'Facility ref' },
    borrower_name: { type: 'string', required: true, label: 'Borrower' },
    drawdown_amount_zar: { type: 'number', required: true, min: 0, label: 'Amount (ZAR)' },
    tranche_no: { type: 'number', required: true, min: 1, label: 'Tranche #' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender' },
    credit_approval_ref: { type: 'string', label: 'Credit approval ref' },
    cp_evidence_ref: { type: 'string', label: 'CP evidence ref' },
    // written by derive, never by the client
    instructed_at: { type: 'string', label: 'Instructed at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'borrower', sla: { days: 14 } },
    submitted: { label: 'Submitted', terminal: false, holder: 'lender', sla: { days: 10 } },
    conditions_pending: { label: 'Conditions pending', terminal: false, holder: 'borrower', sla: { days: 30 } },
    approved: { label: 'Approved', terminal: false, holder: 'lender', sla: { days: 5 } },
    // record-only rest state: instruction issued to an external rail, no custody.
    disbursement_instructed: { label: 'Disbursement instructed', terminal: false, holder: 'none' },
    // DECLARED BUT UNREACHABLE — settlement-honesty stamp. No transition targets it.
    disbursed: { label: 'Funds disbursed (external — not observed here)', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['borrower', 'operator'],
      actorBecomes: 'borrower',
      label: 'Open drawdown',
      intent: 'primary',
      input: {
        facility_ref: { type: 'string', required: true },
        borrower_name: { type: 'string', required: true },
        drawdown_amount_zar: { type: 'number', required: true, min: 0 },
        tranche_no: { type: 'number', required: true, min: 1 },
        lender_party: { type: 'party', role: 'lender' },
      },
      guards: ['complianceHaltClear'],
    },

    { id: 'submit', from: 'draft', to: 'submitted', by: ['borrower'], label: 'Submit to lender', intent: 'primary', guards: ['complianceHaltClear'] },
    { id: 'request_conditions', from: 'submitted', to: 'conditions_pending', by: ['lender'], label: 'Request conditions', intent: 'secondary', guards: [] },
    {
      id: 'satisfy_conditions',
      from: 'conditions_pending',
      to: 'submitted',
      by: ['borrower'],
      label: 'Satisfy conditions',
      intent: 'primary',
      input: { cp_evidence_ref: { type: 'string', required: true } },
      guards: ['cpEvidencePresent'],
    },
    {
      id: 'approve',
      from: 'submitted',
      to: 'approved',
      by: ['lender'],
      label: 'Approve',
      intent: 'primary',
      input: { credit_approval_ref: { type: 'string', required: true } },
      guards: ['creditApprovalPresent', 'complianceHaltClear'],
    },
    {
      id: 'instruct_disbursement',
      from: 'approved',
      to: 'disbursement_instructed',
      by: ['lender'],
      label: 'Instruct disbursement',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ instructed_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'reject',
      from: ['submitted', 'conditions_pending', 'approved'],
      to: 'rejected',
      by: ['lender'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['covenant_breach', 'cp_not_met', 'credit_declined', 'facility_lapsed'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['draft', 'submitted', 'conditions_pending'],
      to: 'withdrawn',
      by: ['borrower'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'refinanced', 'project_delay'],
      guards: [],
    },
  ],
};
