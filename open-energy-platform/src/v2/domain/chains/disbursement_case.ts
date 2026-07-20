// disbursement_case — project-finance use-of-proceeds (UoP) disbursement
// lifecycle, as data.
//
// Standard REIPPPP/Equator Principles drawdown control: a lender releases a
// loan tranche to the borrower (IPP developer), then requests invoices to
// evidence how the funds were applied, validates them, has an independent
// engineer (IE) certify eligible use-of-proceeds, and finally reconciles the
// tranche clean. Misapplied funds trigger a clawback demand at any point
// after release; a lender can also waive the reconciliation obligation
// outright (e.g. immaterial variance, commercially resolved another way).
//
// Structural honesty (no invented actions):
//  - v1's terminal list is only ['reconciled', 'clawback_executed', 'waived'];
//    `lapsed` is added here as an SLA safety net (same call as
//    ipp_payment_cert's `lapsed`) — v1 carries a real sla_deadline_at column
//    but no action ever produces a lapse outcome, so a case stuck awaiting
//    borrower invoices or IE sign-off would otherwise sit open forever.
//    `lapse_case` is a dedicated system-only edge (no user input) so the
//    timer never has to fabricate business fields.
//  - demand_clawback and waive are reachable from every non-terminal working
//    state (not just uop_certified): misapplication of funds, or a decision
//    to release the obligation, can surface at any point in the drawdown
//    control, matching v1's action roles which never scope these two to a
//    single prior status.
//  - `open` is guarded by counterpartyDistinct (lender releasing to itself is
//    not a disbursement) and complianceHaltClear (a platform-wide compliance
//    halt blocks new tranche releases, same as every other new-commitment
//    edge in this cluster) — de-risking exits (clawback/waive) are never
//    halt-gated, so recovery action always stays available.
//
// settles:true — tranche_amount_zar / reconciled_amount_zar / clawback_amount_zar
// are real ZAR quantum moving against the loan facility, not an informational
// risk parameter (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

const WORKING_STATES = [
  'tranche_released',
  'invoices_pending',
  'invoices_submitted',
  'bank_validating',
  'ie_certifying',
  'uop_certified',
];

export const disbursementCase: ChainDecl = {
  key: 'disbursement_case',
  noun: 'Disbursement case',
  refPrefix: 'DISB',
  title: (f) =>
    `Disbursement UoP — ${(f.project_name as string) ?? 'unnamed project'} R${typeof f.tranche_amount_zar === 'number' ? f.tranche_amount_zar : 0}`,
  visibility: 'party',
  settles: true,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement — use-of-proceeds reconciliation', effect: 'requires' },
    { instrument: 'SARB Exchange Control Regulations', provision: 'cross-border loan drawdown reporting', effect: 'requires' },
  ],
  roles: ['borrower', 'lender', 'funder', 'operator'],

  fields: {
    project_name: { type: 'string', required: true, label: 'Project' },
    borrower_party: { type: 'party', role: 'borrower', label: 'Borrower (IPP developer)' },
    funder_party: { type: 'party', role: 'funder', label: 'Funder' },
    tranche_amount_zar: { type: 'number', min: 0, label: 'Tranche amount (ZAR)' },
    uop_category: { type: 'string', label: 'Use-of-proceeds category' },
    invoices_amount_zar: { type: 'number', min: 0, label: 'Invoices amount (ZAR)' },
    invoice_count: { type: 'number', min: 0, label: 'Invoice count' },
    ie_firm: { type: 'string', label: 'Independent engineer firm' },
    ie_certificate_ref: { type: 'string', label: 'IE certificate ref' },
    reconciled_amount_zar: { type: 'number', min: 0, label: 'Reconciled amount (ZAR)' },
    clawback_amount_zar: { type: 'number', min: 0, label: 'Clawback amount (ZAR)' },
    sarb_exchange_control_ref: { type: 'string', label: 'SARB Exchange Control ref' },
    equator_principles_ref: { type: 'string', label: 'Equator Principles ref' },
    rod_notes: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    released_at: { type: 'string', label: 'Tranche released at' },
    invoices_submitted_at: { type: 'string', label: 'Invoices submitted at' },
    validation_started_at: { type: 'string', label: 'Validation started at' },
    ie_requested_at: { type: 'string', label: 'IE requested at' },
    ie_accepted_at: { type: 'string', label: 'IE certified at' },
    reconciled_at: { type: 'string', label: 'Reconciled at' },
    clawback_executed_at: { type: 'string', label: 'Clawback executed at' },
    waived_at: { type: 'string', label: 'Waived at' },
  },

  initial: 'tranche_released',

  states: {
    tranche_released: { label: 'Tranche released', terminal: false, holder: 'lender', sla: { days: 5 } },
    invoices_pending: { label: 'Invoices pending', terminal: false, holder: 'borrower', sla: { days: 30 } },
    invoices_submitted: { label: 'Invoices submitted', terminal: false, holder: 'lender', sla: { days: 7 } },
    bank_validating: { label: 'Bank validating', terminal: false, holder: 'lender', sla: { days: 10 } },
    ie_certifying: { label: 'IE certifying', terminal: false, holder: 'lender', sla: { days: 21 } },
    uop_certified: { label: 'UoP certified', terminal: false, holder: 'lender', sla: { days: 14 } },
    reconciled: { label: 'Reconciled', terminal: true, holder: 'none' },
    clawback_executed: { label: 'Clawback executed', terminal: true, holder: 'none' },
    waived: { label: 'Waived', terminal: true, holder: 'none' },
    // SLA safety net — see header note.
    lapsed: { label: 'Lapsed (SLA missed)', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'tranche_released',
      by: ['lender', 'funder', 'operator'],
      actorBecomes: 'lender',
      label: 'Release tranche',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        borrower_party: { type: 'party', role: 'borrower' },
        funder_party: { type: 'party', role: 'funder' },
        tranche_amount_zar: { type: 'number', min: 0 },
        uop_category: { type: 'string' },
      },
      // lender ≠ borrower (no self-disbursement) + no new tranche under a halt.
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ released_at: isoUtc(at) }),
    },
    {
      id: 'request_invoices',
      from: 'tranche_released',
      to: 'invoices_pending',
      by: ['lender', 'funder', 'operator'],
      label: 'Request invoices',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_invoices',
      from: 'invoices_pending',
      to: 'invoices_submitted',
      by: ['lender', 'funder', 'operator'],
      label: 'Submit invoices',
      intent: 'primary',
      input: {
        invoices_amount_zar: { type: 'number', min: 0 },
        invoice_count: { type: 'number', min: 0 },
        uop_category: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ invoices_submitted_at: isoUtc(at) }),
    },
    {
      id: 'begin_validation',
      from: 'invoices_submitted',
      to: 'bank_validating',
      by: ['lender', 'funder', 'operator'],
      label: 'Begin validation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ validation_started_at: isoUtc(at) }),
    },
    {
      id: 'request_ie',
      from: 'bank_validating',
      to: 'ie_certifying',
      by: ['lender', 'funder', 'operator'],
      label: 'Request IE certification',
      intent: 'primary',
      input: { ie_firm: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ ie_requested_at: isoUtc(at) }),
    },
    {
      id: 'accept_ie',
      from: 'ie_certifying',
      to: 'uop_certified',
      by: ['lender', 'funder', 'operator'],
      label: 'Accept IE certificate',
      intent: 'primary',
      input: { ie_certificate_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ ie_accepted_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into a clean close — only reachable once the IE has
      // certified, so a case can never reconcile without independent sign-off.
      id: 'close_reconciliation',
      from: 'uop_certified',
      to: 'reconciled',
      by: ['lender', 'operator'],
      label: 'Close reconciliation',
      intent: 'primary',
      input: {
        reconciled_amount_zar: { type: 'number', min: 0 },
        sarb_exchange_control_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ reconciled_at: isoUtc(at) }),
    },

    // --- exits (reachable from any working state — see header note) -----------
    {
      id: 'demand_clawback',
      from: WORKING_STATES,
      to: 'clawback_executed',
      by: ['lender', 'operator'],
      label: 'Demand clawback',
      intent: 'destructive',
      requiresReason: [
        'ineligible_uop_category',
        'misappropriation_of_funds',
        'invoice_fraud',
        'breach_of_disbursement_conditions',
        'regulatory_direction',
      ],
      input: {
        clawback_amount_zar: { type: 'number', required: true, min: 0 },
        sarb_exchange_control_ref: { type: 'string' },
        equator_principles_ref: { type: 'string' },
        rod_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ clawback_executed_at: isoUtc(at) }),
    },
    {
      id: 'waive',
      from: WORKING_STATES,
      to: 'waived',
      by: ['lender', 'funder', 'operator'],
      label: 'Waive reconciliation',
      intent: 'secondary',
      input: { rod_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ waived_at: isoUtc(at) }),
    },
    {
      // SLA time-bar only — no user-facing input, fired by the timers below.
      id: 'lapse_case',
      from: ['invoices_pending', 'ie_certifying'],
      to: 'lapsed',
      by: ['system'],
      label: 'Disbursement case lapses (SLA missed)',
      intent: 'destructive',
      requiresReason: ['sla_missed'],
      guards: [],
    },
  ],

  // borrower slow to evidence spend, or IE slow to certify — both are the
  // realistic stall points in a drawdown control, so both get their own bar.
  timers: [
    { onState: 'invoices_pending', after: { days: 30 }, fire: 'lapse_case', kind: 'sla', reason: 'sla_missed' },
    { onState: 'ie_certifying', after: { days: 21 }, fire: 'lapse_case', kind: 'sla', reason: 'sla_missed' },
  ],
};
