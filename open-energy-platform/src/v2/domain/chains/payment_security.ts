// payment_security — PPA payment-security instrument lifecycle as data.
//
// A lodger (the offtaker under a PPA) lodges a payment-security instrument — a
// bank guarantee, letter of credit or cash deposit — issued by a provider
// (issuing bank), in favour of a beneficiary (the IPP developer). It backstops
// the offtaker's payment obligations: if the offtaker defaults, the beneficiary
// draws on it.
//
// The enforcement spine is structural, not a guard: call_security is the ONLY
// edge into call_pending, and it can fire ONLY from in_force. The only path
// into in_force is accept_security, which only reaches from instrument_issued,
// which only issue_instrument reaches. So a security can NEVER be drawn before
// it has actually been issued AND accepted into force — a draw on a
// non-existent instrument is an ILLEGAL_TRANSITION the state graph refuses.
// counterpartyDistinct at lodgement stops a party backstopping itself.
//
// settles:false — a payment security is a credit-support instrument (a custody
// notice), never a settlement leg in this engine (R-S5-1). The actual cash on a
// draw settles on external payment rails, not here.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const paymentSecurity: ChainDecl = {
  key: 'payment_security',
  noun: 'Payment security',
  refPrefix: 'PS',
  title: (f) =>
    `${(f.instrument_type as string) ?? 'guarantee'} payment security — R${(f.backstop_amount_zar as number) ?? 0} for PPA ${(f.ppa_ref as string) ?? '—'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement payment-security lodgement', effect: 'requires' },
    { instrument: 'PPA', provision: 'offtaker payment-security obligation', effect: 'requires' },
  ],
  roles: ['lodger', 'provider', 'beneficiary', 'operator'],

  fields: {
    security_ref: { type: 'string', label: 'Security reference' },
    lodger_party: { type: 'party', role: 'lodger', label: 'Lodger (offtaker)' },
    provider_party: { type: 'party', role: 'provider', label: 'Provider (issuing bank)' },
    beneficiary_party: { type: 'party', role: 'beneficiary', label: 'Beneficiary (IPP developer)' },
    ppa_ref: { type: 'string', required: true, label: 'PPA reference' },
    instrument_type: { type: 'string', required: true, label: 'Instrument (bank_guarantee/letter_of_credit/cash_deposit)' },
    instrument_number: { type: 'string', label: 'Instrument number' },
    backstop_amount_zar: { type: 'number', required: true, min: 0, label: 'Backstop amount (ZAR)' },
    issuing_bank: { type: 'string', label: 'Issuing bank' },
    validity_days: { type: 'number', min: 0, label: 'Validity (days)' },
    coverage_months: { type: 'number', min: 0, label: 'Coverage (months)' },
    called_amount_zar: { type: 'number', min: 0, label: 'Amount drawn (ZAR)' },
    // written by derive, never by the client
    issued_at: { type: 'string', label: 'Issued at' },
    in_force_at: { type: 'string', label: 'In force at' },
    called_at: { type: 'string', label: 'Called at' },
    honoured_at: { type: 'string', label: 'Honoured at' },
    released_at: { type: 'string', label: 'Released at' },
    expired_at: { type: 'string', label: 'Expired at' },
  },

  initial: 'security_requested',

  states: {
    security_requested: { label: 'Security requested', terminal: false, holder: 'provider', sla: { hours: 48 } },
    instrument_issued: { label: 'Instrument issued', terminal: false, holder: 'beneficiary', sla: { hours: 24 } },
    in_force: { label: 'In force', terminal: false, holder: 'beneficiary' },
    call_pending: { label: 'Call pending', terminal: false, holder: 'provider', sla: { hours: 24 } },
    called: { label: 'Called (drawn)', terminal: true, holder: 'none' },
    released: { label: 'Released', terminal: true, holder: 'none' },
    expired: { label: 'Expired', terminal: true, holder: 'none' },
    request_rejected: { label: 'Request rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'security_requested',
      by: ['lodger', 'operator'],
      actorBecomes: 'lodger',
      label: 'Lodge payment security',
      intent: 'primary',
      input: {
        ppa_ref: { type: 'string', required: true },
        instrument_type: { type: 'string', required: true },
        backstop_amount_zar: { type: 'number', required: true, min: 0 },
        issuing_bank: { type: 'string' },
        validity_days: { type: 'number', min: 0 },
        coverage_months: { type: 'number', min: 0 },
        provider_party: { type: 'party', role: 'provider' },
        beneficiary_party: { type: 'party', role: 'beneficiary' },
      },
      // lodger and beneficiary must be distinct entities — no self-backstop.
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'issue_instrument',
      from: 'security_requested',
      to: 'instrument_issued',
      by: ['provider'],
      label: 'Issue instrument',
      intent: 'primary',
      input: { instrument_number: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ issued_at: isoUtc(at) }),
    },
    {
      id: 'accept_security',
      from: 'instrument_issued',
      to: 'in_force',
      by: ['beneficiary'],
      label: 'Accept security',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ in_force_at: isoUtc(at) }),
    },
    {
      // structural enforcement gate: the ONLY edge into call_pending, and it can
      // fire ONLY from in_force. A security that was never issued/accepted can
      // therefore never be drawn — no guard needed, the graph refuses it.
      id: 'call_security',
      from: 'in_force',
      to: 'call_pending',
      by: ['beneficiary'],
      label: 'Call security',
      intent: 'destructive',
      input: { called_amount_zar: { type: 'number', required: true, min: 0 } },
      requiresReason: ['payment_default', 'ppa_breach', 'offtaker_insolvency', 'non_payment'],
      guards: [],
      derive: (_f, at: Instant) => ({ called_at: isoUtc(at) }),
    },
    {
      id: 'honour_call',
      from: 'call_pending',
      to: 'called',
      by: ['provider'],
      label: 'Honour call',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ honoured_at: isoUtc(at) }),
    },
    {
      // provider contests the draw and returns the instrument to force.
      id: 'reject_call',
      from: 'call_pending',
      to: 'in_force',
      by: ['provider'],
      label: 'Reject call',
      intent: 'destructive',
      requiresReason: ['call_unjustified', 'no_default_event', 'documents_deficient'],
      guards: [],
    },
    {
      id: 'release_security',
      from: 'in_force',
      to: 'released',
      by: ['beneficiary', 'provider'],
      label: 'Release security',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ released_at: isoUtc(at) }),
    },
    {
      id: 'expire_security',
      from: ['instrument_issued', 'in_force'],
      to: 'expired',
      by: ['provider', 'operator'],
      label: 'Expire security',
      intent: 'secondary',
      requiresReason: ['validity_lapsed', 'ppa_terminated', 'superseded'],
      guards: [],
      derive: (_f, at: Instant) => ({ expired_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_request',
      from: 'security_requested',
      to: 'request_rejected',
      by: ['provider'],
      label: 'Reject request',
      intent: 'destructive',
      requiresReason: ['terms_unacceptable', 'lodger_credit_insufficient', 'ppa_not_verified', 'amount_disputed'],
      guards: [],
    },
    {
      id: 'withdraw_request',
      from: ['security_requested', 'instrument_issued'],
      to: 'withdrawn',
      by: ['lodger'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['ppa_lapsed', 'alternative_security', 'no_longer_required'],
      guards: [],
    },
  ],

  // in-force validity time-bar: a standing instrument lapses at its validity
  // horizon. record-only stub; the sweep computes the real bar off validity_days
  // (permit_to_work / ppa_contract pattern).
  timers: [{ onState: 'in_force', after: { days: 0 }, fire: 'expire_security', kind: 'time_bar' }],
};
