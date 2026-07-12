// loan_default — event-of-default lifecycle on a project-finance facility as data.
//
// REBUILD_FUNCTIONAL_FLOOR row `loan-default`: a default is NOT terminal. Once a
// lender declares an event of default, the loan is cured (hands to
// loan-restructure), waived, or enforced (hands to security-perfection) — only
// enforcement-complete is a true terminal end. The legacy isTerminal() wrongly
// marked `defaulted` terminal; here `default_declared` is terminal:false, so a
// defaulted loan still transitions.
//
// Structural anti-shortcut (the safety spine): a lender can NEVER seize security
// on a whim. `enforced` is reachable ONLY via complete_enforcement, which fires
// ONLY from enforcement_pending, which is reachable ONLY via elect_enforcement —
// an edge that demands a reason code AND a named credit-committee approval ref
// (creditApprovalPresent). So there is no path from a fresh default straight to
// enforcement: the recorded election + approval is unavoidable. No guard enforces
// the ordering — the state graph does.
//
// `cured` is a non-terminal record-only rest state (holder 'none'): the default
// is remedied and the loan continues on another chain (loan-restructure). We do
// not model that continuation here, we just record that the cure landed — same
// honesty pattern as drawdown's disbursement_instructed.
//
// settles:false — a default is a credit-status record, never a movement of money
// (R-S5-1). Enforcement recovery happens on external rails this system has no
// custody over.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const loanDefault: ChainDecl = {
  key: 'loan_default',
  noun: 'Loan default',
  refPrefix: 'LD',
  title: (f) =>
    `Default — ${(f.borrower_name as string) ?? 'unnamed'} (facility ${(f.facility_ref as string) ?? '?'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'facility agreement — events of default', effect: 'creates_offence' },
    { instrument: 'NERSA Grid Code', provision: 'project registration', effect: 'requires' },
  ],
  roles: ['lender', 'borrower', 'operator', 'regulator'],

  fields: {
    facility_ref: { type: 'string', required: true, label: 'Facility ref' },
    borrower_name: { type: 'string', required: true, label: 'Borrower' },
    borrower_party: { type: 'party', role: 'borrower', label: 'Borrower' },
    default_type: { type: 'string', required: true, label: 'Default type (payment/covenant/cross_default)' },
    default_amount_zar: { type: 'number', required: true, min: 0, label: 'Default amount (ZAR)' },
    default_event_ref: { type: 'string', label: 'Driving covenant-breach ref' },
    cure_period_days: { type: 'number', min: 0, label: 'Cure period (days)' },
    cure_plan_ref: { type: 'string', label: 'Cure plan ref' },
    credit_approval_ref: { type: 'string', label: 'Credit-committee approval ref' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    // written by derive, never by the client
    declared_at: { type: 'string', label: 'Declared at' },
    cured_at: { type: 'string', label: 'Cured at' },
    enforced_at: { type: 'string', label: 'Enforcement completed at' },
  },

  initial: 'default_declared',

  states: {
    // NOT terminal — the legacy isTerminal() bug this chain corrects (floor R1).
    default_declared: { label: 'Default declared', terminal: false, holder: 'borrower', sla: { days: 20 } },
    cure_in_progress: { label: 'Cure in progress', terminal: false, holder: 'borrower', sla: { days: 30 } },
    enforcement_pending: { label: 'Enforcement pending', terminal: false, holder: 'lender', sla: { days: 30 } },
    // record-only rest state: default remedied, loan continues on loan-restructure.
    cured: { label: 'Cured (loan continues — not observed here)', terminal: false, holder: 'none' },
    enforced: { label: 'Enforcement complete', terminal: true, holder: 'none' },
    waived: { label: 'Waived', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'default_declared',
      by: ['lender', 'operator'],
      actorBecomes: 'lender',
      label: 'Declare default',
      intent: 'primary',
      input: {
        facility_ref: { type: 'string', required: true },
        borrower_name: { type: 'string', required: true },
        default_type: { type: 'string', required: true },
        default_amount_zar: { type: 'number', required: true, min: 0 },
        default_event_ref: { type: 'string' },
        cure_period_days: { type: 'number', min: 0 },
        borrower_party: { type: 'party', role: 'borrower' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ declared_at: isoUtc(at) }),
    },

    {
      id: 'submit_cure_plan',
      from: 'default_declared',
      to: 'cure_in_progress',
      by: ['borrower'],
      label: 'Submit cure plan',
      intent: 'primary',
      input: { cure_plan_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      // structural: the ONLY path to `cured` — the lender, not the borrower,
      // confirms the remedy landed. A borrower cannot self-clear a default.
      id: 'confirm_cure',
      from: 'cure_in_progress',
      to: 'cured',
      by: ['lender'],
      label: 'Confirm cure',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ cured_at: isoUtc(at) }),
    },
    {
      // the recorded election — the ONLY gateway to enforcement. Demands a
      // reason AND a credit-committee approval ref. No shortcut to `enforced`.
      id: 'elect_enforcement',
      from: ['default_declared', 'cure_in_progress'],
      to: 'enforcement_pending',
      by: ['lender'],
      label: 'Elect enforcement',
      intent: 'destructive',
      requiresReason: ['uncured_beyond_bar', 'cure_plan_rejected', 'material_adverse_change', 'cross_default'],
      input: { credit_approval_ref: { type: 'string' } },
      guards: ['creditApprovalPresent'],
    },
    {
      id: 'complete_enforcement',
      from: 'enforcement_pending',
      to: 'enforced',
      by: ['lender'],
      label: 'Complete enforcement',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ enforced_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'waive',
      from: ['default_declared', 'cure_in_progress'],
      to: 'waived',
      by: ['lender'],
      label: 'Waive default',
      intent: 'destructive',
      requiresReason: ['de_minimis', 'commercial_forbearance', 'restructure_agreed', 'technical_default_only'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: 'default_declared',
      to: 'withdrawn',
      by: ['lender'],
      label: 'Withdraw notice',
      intent: 'destructive',
      requiresReason: ['declared_in_error', 'payment_reconciled', 'notice_defective'],
      guards: [],
    },
  ],

  // cure-period time-bar: a default left uncured past the bar escalates to
  // enforcement. record-only stub; the sweep computes the real bar off state sla
  // days (ppa_contract / permit_to_work pattern). elect_enforcement's reason +
  // approval are supplied by the operator acting on the fired timer.
  timers: [{ onState: 'default_declared', after: { days: 0 }, fire: 'elect_enforcement', kind: 'time_bar' }],
};
