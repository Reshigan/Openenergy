// connection_budget_quote — an Eskom/municipal network connection budget quote
// (cost-estimate letter) lifecycle as data. An applicant requests a connection
// cost estimate against a named network utility; the utility prices the work and
// issues a budget quote; the applicant accepts it with a credit approval for the
// connection charge, or declines it.
//
// The acceptance spine is STRUCTURAL, not a guard: accepted is reachable ONLY
// from quoted (via accept_quote), and quoted is reachable ONLY from pricing (via
// issue_quote). So a quote can NEVER be accepted before the utility has actually
// priced and issued it — firing accept_quote from pricing is an ILLEGAL_TRANSITION
// the engine's step-4 state check refuses before any guard runs.
//
// counterpartyDistinct blocks self-dealing at @new (an applicant cannot be its
// own network utility), and creditApprovalPresent forces a named credit-approval
// ref for the connection charge at acceptance (Pattern A — present-but-not-required
// so an absent ref surfaces MISSING_CREDIT_APPROVAL, not a generic BAD_INPUT).
//
// settles:false — a budget quote is a cost-estimate/notice record; the connection
// charge itself is billed and settled on the connection agreement it authorises,
// never through THIS chain (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const connectionBudgetQuote: ChainDecl = {
  key: 'connection_budget_quote',
  noun: 'Connection budget quote',
  refPrefix: 'CBQ',
  title: (f) =>
    `Connection budget quote — ${(f.applicant_name as string) ?? 'applicant'} / ${(f.utility_name as string) ?? 'utility'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Electricity Regulation Act 4 of 2006', provision: 's21 connection charges', effect: 'authorises' },
    { instrument: 'NRS 069', provision: 'network connection cost estimate', effect: 'requires' },
  ],
  roles: ['applicant', 'utility', 'operator'],

  fields: {
    applicant_name: { type: 'string', required: true, label: 'Applicant' },
    utility_name: { type: 'string', required: true, label: 'Network utility' },
    utility_party: { type: 'party', role: 'utility', label: 'Network utility participant' },
    connection_kva: { type: 'number', label: 'Requested connection (kVA)' },
    site_ref: { type: 'string', label: 'Site / erf ref' },
    quote_amount: { type: 'number', label: 'Budget quote amount (ZAR)' },
    credit_approval_ref: { type: 'string', label: 'Credit approval ref (connection charge)' },
    // written by derive, never by the client
    quoted_at: { type: 'string', label: 'Quote issued at' },
    accepted_at: { type: 'string', label: 'Quote accepted at' },
  },

  initial: 'requested',

  states: {
    requested: { label: 'Estimate requested', terminal: false, holder: 'utility', sla: { days: 30 } },
    pricing: { label: 'Pricing', terminal: false, holder: 'utility', sla: { days: 20 } },
    quoted: { label: 'Quoted', terminal: false, holder: 'applicant', sla: { days: 30 } },
    accepted: { label: 'Accepted', terminal: true, holder: 'none' },
    declined: { label: 'Declined', terminal: true, holder: 'none' },
    expired: { label: 'Expired', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'requested',
      by: ['applicant', 'operator'],
      actorBecomes: 'applicant',
      label: 'Request connection cost estimate',
      intent: 'primary',
      input: {
        applicant_name: { type: 'string', required: true },
        utility_name: { type: 'string', required: true },
        utility_party: { type: 'party', role: 'utility' },
        connection_kva: { type: 'number' },
        site_ref: { type: 'string' },
      },
      // no self-dealing: the applicant cannot be its own network utility.
      guards: ['counterpartyDistinct'],
    },

    // --- happy path -----------------------------------------------------------
    {
      id: 'begin_pricing',
      from: 'requested',
      to: 'pricing',
      by: ['utility', 'operator'],
      label: 'Begin pricing',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'issue_quote',
      from: 'pricing',
      to: 'quoted',
      by: ['utility', 'operator'],
      label: 'Issue budget quote',
      intent: 'primary',
      // the quote amount is genuinely mandatory-with-no-guard: you cannot issue a
      // quote with no price → an absent amount is a legitimate BAD_INPUT.
      input: { quote_amount: { type: 'number', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ quoted_at: isoUtc(at) }),
    },
    {
      // structural acceptance gate: the ONLY edge into accepted, and it can only
      // fire from quoted — which only issue_quote reaches. A quote can therefore
      // NEVER be accepted before it has been priced and issued. The credit-approval
      // ref for the connection charge rides creditApprovalPresent (Pattern A).
      id: 'accept_quote',
      from: 'quoted',
      to: 'accepted',
      by: ['applicant', 'operator'],
      label: 'Accept budget quote',
      intent: 'primary',
      // present-but-not-required so an absent ref surfaces the guard's
      // MISSING_CREDIT_APPROVAL, not a generic BAD_INPUT (Pattern A).
      input: { credit_approval_ref: { type: 'string' } },
      guards: ['creditApprovalPresent'],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'decline_quote',
      from: 'quoted',
      to: 'declined',
      by: ['applicant', 'operator'],
      label: 'Decline budget quote',
      intent: 'destructive',
      requiresReason: ['cost_too_high', 'project_shelved', 'alternative_connection', 'terms_unacceptable'],
      guards: [],
    },
    {
      id: 'expire',
      from: ['requested', 'pricing', 'quoted'],
      to: 'expired',
      by: ['system', 'operator'],
      label: 'Expire quote',
      intent: 'destructive',
      requiresReason: ['validity_lapsed', 'no_response', 'superseded'],
      guards: [],
    },
  ],

  // quote-validity time-bar: a budget quote left unaccepted past the standard
  // 90-day NRS 069 validity window expires (validity_lapsed).
  timers: [{ onState: 'quoted', after: { days: 90 }, fire: 'expire', kind: 'time_bar', reason: 'validity_lapsed' }],
};
