// levy_assessment — a regulatory levy determination lifecycle as data.
//
// A regulator (NERSA / SARS carbon-tax authority) raises a levy assessment
// against a licensee (the levy payer) for a period, computed off a taxable base
// and a rate. The payer either accepts or lodges an objection; the regulator
// resolves the objection; then payment is confirmed and the levy is recorded as
// settled — or the assessment is withdrawn / waived.
//
// Structural spine: confirm_payment is the ONLY edge into levy_settled, and it
// leaves ONLY payment_pending. The only paths into payment_pending are
// accept_assessment (from assessment_issued) and resolve_objection (from
// under_objection). So a levy can NEVER be recorded settled while still a draft,
// nor while issued-but-not-yet-accepted — it must be served on the payer and
// accepted (or its objection resolved) first. No guard needed; the state graph
// enforces due process.
//
// settles:false — this is a regulatory determination, not a payment. The money
// moves through SARS/Treasury rails externally; confirm_payment only records
// that it did (R-S5-1 record-only custody notice).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure levy computation off base * rate; non-numeric inputs yield 0 (the derive
// only runs on issue, where both are carried required fields). No clock, no env.
const levyAmount = (base: Json | undefined, rate: Json | undefined): number =>
  typeof base === 'number' && typeof rate === 'number' ? base * rate : 0;

export const levyAssessment: ChainDecl = {
  key: 'levy_assessment',
  noun: 'Levy assessment',
  refPrefix: 'LA',
  title: (f) =>
    `${(f.levy_type as string) ?? 'levy'} assessment — ${(f.assessment_period as string) ?? 'period'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's5B NERSA levies & fees', effect: 'authorises' },
    { instrument: 'Carbon Tax Act 2019', provision: 's6 levy calculation & assessment', effect: 'requires' },
  ],
  roles: ['regulator', 'levy_payer', 'operator'],

  fields: {
    levy_number: { type: 'string', label: 'Levy number' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Levy authority' },
    levy_payer_party: { type: 'party', role: 'levy_payer', label: 'Levy payer' },
    levy_type: { type: 'string', required: true, label: 'Levy type (nersa_levy/carbon_tax)' },
    assessment_period: { type: 'string', required: true, label: 'Assessment period' },
    taxable_base: { type: 'number', min: 0, label: 'Taxable base' },
    levy_rate: { type: 'number', min: 0, label: 'Levy rate' },
    currency: { type: 'string', label: 'Currency' },
    objection_grounds: { type: 'string', label: 'Objection grounds' },
    revised_amount: { type: 'number', min: 0, label: 'Revised amount' },
    payment_reference: { type: 'string', label: 'Payment reference' },
    // written by derive, never by the client
    assessment_amount: { type: 'number', label: 'Assessment amount' },
    issued_at: { type: 'string', label: 'Issued at' },
    settled_at: { type: 'string', label: 'Settled at' },
  },

  initial: 'draft_assessment',

  states: {
    draft_assessment: { label: 'Draft assessment', terminal: false, holder: 'regulator', sla: { hours: 24 } },
    assessment_issued: { label: 'Assessment issued', terminal: false, holder: 'levy_payer', sla: { days: 30 } },
    under_objection: { label: 'Under objection', terminal: false, holder: 'regulator', sla: { days: 60 } },
    payment_pending: { label: 'Payment pending', terminal: false, holder: 'levy_payer', sla: { days: 30 } },
    levy_settled: { label: 'Levy settled', terminal: true, holder: 'none' },
    assessment_withdrawn: { label: 'Assessment withdrawn', terminal: true, holder: 'none' },
    assessment_waived: { label: 'Assessment waived', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft_assessment',
      by: ['regulator', 'operator'],
      actorBecomes: 'regulator',
      label: 'Raise assessment',
      intent: 'primary',
      input: {
        levy_payer_party: { type: 'party', role: 'levy_payer', required: true },
        levy_type: { type: 'string', required: true },
        assessment_period: { type: 'string', required: true },
        taxable_base: { type: 'number', min: 0 },
        levy_rate: { type: 'number', min: 0 },
        currency: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'issue_assessment',
      from: 'draft_assessment',
      to: 'assessment_issued',
      by: ['regulator'],
      label: 'Issue assessment',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => ({
        assessment_amount: levyAmount(f.taxable_base, f.levy_rate),
        issued_at: isoUtc(at),
      }),
    },
    {
      id: 'accept_assessment',
      from: 'assessment_issued',
      to: 'payment_pending',
      by: ['levy_payer', 'system'],
      label: 'Accept assessment',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'lodge_objection',
      from: 'assessment_issued',
      to: 'under_objection',
      by: ['levy_payer'],
      label: 'Lodge objection',
      intent: 'secondary',
      input: { objection_grounds: { type: 'string', required: true } },
      requiresReason: ['incorrect_base', 'exempt_activity', 'duplicate_assessment', 'rate_dispute'],
      guards: [],
    },
    {
      id: 'resolve_objection',
      from: 'under_objection',
      to: 'payment_pending',
      by: ['regulator'],
      label: 'Resolve objection',
      intent: 'primary',
      input: { revised_amount: { type: 'number', min: 0 } },
      requiresReason: ['objection_dismissed', 'partially_allowed', 'recalculated'],
      guards: [],
    },
    {
      // structural settlement gate: the ONLY edge into levy_settled, and it can
      // only fire from payment_pending — reachable solely via accept_assessment
      // or resolve_objection. A draft or un-accepted assessment can never settle.
      id: 'confirm_payment',
      from: 'payment_pending',
      to: 'levy_settled',
      by: ['regulator', 'operator'],
      label: 'Confirm payment',
      intent: 'primary',
      input: { payment_reference: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ settled_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'withdraw_assessment',
      from: ['draft_assessment', 'assessment_issued', 'under_objection'],
      to: 'assessment_withdrawn',
      by: ['regulator'],
      label: 'Withdraw assessment',
      intent: 'destructive',
      requiresReason: ['issued_in_error', 'payer_deregistered', 'superseded'],
      guards: [],
    },
    {
      id: 'waive_levy',
      from: ['assessment_issued', 'under_objection', 'payment_pending'],
      to: 'assessment_waived',
      by: ['regulator'],
      label: 'Waive levy',
      intent: 'destructive',
      requiresReason: ['de_minimis', 'hardship_relief', 'settlement_agreement', 'write_off'],
      guards: [],
    },
  ],

  // objection/payment window: an issued assessment left unanswered is deemed
  // accepted once the 30-day statutory objection window closes (matches the
  // assessment_issued state sla; permit pattern).
  timers: [{ onState: 'assessment_issued', after: { days: 30 }, fire: 'accept_assessment', kind: 'time_bar' }],
};
