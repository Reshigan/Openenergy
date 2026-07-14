// credit_insurance — trade-credit / obligor-default insurance policy lifecycle
// as data. An insured (a trader carrying counterparty exposure) requests cover
// against an obligor's default; an insurer underwrites, quotes and binds; the
// insured incepts the policy; while active, a claim may be lodged on obligor
// default. A broker may intermediate. States: requested → underwriting → bound
// → active → expired, with a claim path off `active`.
//
// SETTLEMENT HONESTY: settles:false. This chain RECORDS an indemnity commitment
// and RECORDS a lodged claim — it moves no money. Premium is never collected and
// no claim is ever PAID through this chain. The terminal claim state is
// `claim_instructed` (not `claim_paid`): it is an instruction to the settlement
// rail, carrying no finality. See the state comment below.
//
// STRUCTURAL GATE: a claim can be lodged ONLY from `active` (lodge_claim has a
// single `from:'active'`). A policy still in underwriting, or bound but never
// incepted, therefore cannot be claimed against — no guard is needed, the state
// graph makes a claim-without-live-cover unreachable. Likewise `bind` is the
// only edge into `bound` and it comes only from `underwriting`, so nothing is
// bound without underwriting.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

/** UTC month-addition on an ISO instant string. Pure: deterministic given the
 *  string; explicit-arg `new Date(iso)`, not Date.now()/argless new Date(), so
 *  it respects the domain purity ban (same shape as ppa_contract.addYearsUtc). */
function addMonthsUtc(iso: string, months: number): string {
  const d = new Date(iso);
  const ms = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth() + months,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  );
  return new Date(ms).toISOString();
}

export const creditInsurance: ChainDecl = {
  key: 'credit_insurance',
  noun: 'Credit insurance policy',
  refPrefix: 'CINS',
  title: (f) =>
    `Credit cover — ${(f.insured_name as string) ?? 'insured'} vs ${(f.obligor_name as string) ?? 'obligor'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Insurance Act 2017', provision: 'Sch 2 class 14 (credit) — underwriting a credit risk', effect: 'authorises' },
    { instrument: 'FAIS Act 2002', provision: 's13 intermediary services (broker)', effect: 'requires' },
  ],
  roles: ['insured', 'insurer', 'broker', 'operator'],

  fields: {
    insured_name: { type: 'string', required: true, label: 'Insured' },
    obligor_name: { type: 'string', required: true, label: 'Obligor (risk)' },
    cover_amount_zar: { type: 'number', required: true, min: 0, label: 'Cover amount (ZAR)' },
    cover_term_months: { type: 'number', required: true, min: 1, max: 60, label: 'Cover term (months)' },
    insurer_party: { type: 'party', role: 'insurer', label: 'Insurer' },
    broker_party: { type: 'party', role: 'broker', label: 'Broker' },
    premium_zar: { type: 'number', min: 0, label: 'Premium (ZAR)' },
    policy_number: { type: 'string', label: 'Policy number' },
    // written by derive, never by the client
    bound_at: { type: 'string', label: 'Bound at' },
    inception_at: { type: 'string', label: 'Inception at' },
    expiry_date: { type: 'string', label: 'Expiry' },
    claim_lodged_at: { type: 'string', label: 'Claim lodged at' },
  },

  initial: 'requested',

  states: {
    requested: { label: 'Cover requested', terminal: false, holder: 'insurer', sla: { days: 5 } },
    underwriting: { label: 'Underwriting', terminal: false, holder: 'insurer', sla: { days: 14 } },
    bound: { label: 'Bound (awaiting inception)', terminal: false, holder: 'insured', sla: { days: 30 } },
    active: { label: 'Active cover', terminal: false, holder: 'none' },
    // NO SETTLEMENT FINALITY — RECORD ONLY. A lodged claim is an instruction to
    // the settlement rail; no indemnity is paid through this chain.
    claim_instructed: { label: 'Claim lodged (record-only)', terminal: true, holder: 'none' },
    expired: { label: 'Expired', terminal: true, holder: 'none' },
    declined: { label: 'Declined', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    // --- creation -----------------------------------------------------------
    {
      id: 'open',
      from: '@new',
      to: 'requested',
      by: ['insured', 'operator'],
      actorBecomes: 'insured',
      label: 'Request cover',
      intent: 'primary',
      input: {
        insured_name: { type: 'string', required: true },
        obligor_name: { type: 'string', required: true },
        cover_amount_zar: { type: 'number', required: true, min: 0 },
        cover_term_months: { type: 'number', required: true, min: 1, max: 60 },
        insurer_party: { type: 'party', role: 'insurer' },
        broker_party: { type: 'party', role: 'broker' },
      },
      guards: ['counterpartyDistinct'],
    },

    // --- happy path ---------------------------------------------------------
    {
      id: 'begin_underwriting',
      from: 'requested',
      to: 'underwriting',
      by: ['insurer', 'operator'],
      label: 'Begin underwriting',
      intent: 'primary',
      guards: [],
    },
    {
      // the ONLY edge into `bound`, and only from `underwriting` — nothing is
      // bound without being underwritten first.
      id: 'bind',
      from: 'underwriting',
      to: 'bound',
      by: ['insurer'],
      label: 'Bind cover',
      intent: 'primary',
      input: {
        premium_zar: { type: 'number', required: true, min: 0 },
        policy_number: { type: 'string', required: true },
      },
      // insured and insurer must be distinct legal entities (no self-insurance).
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ bound_at: isoUtc(at) }),
    },
    {
      id: 'incept',
      from: 'bound',
      to: 'active',
      by: ['insured', 'operator'],
      label: 'Incept policy',
      intent: 'primary',
      // activating live cover is a new commitment — blocked under a platform halt.
      guards: ['complianceHaltClear'],
      derive: (f, at: Instant): Record<string, Json> => {
        const inception = isoUtc(at);
        return typeof f.cover_term_months === 'number'
          ? { inception_at: inception, expiry_date: addMonthsUtc(inception, f.cover_term_months) }
          : { inception_at: inception };
      },
    },

    // --- claim path (structural: ONLY from `active`) ------------------------
    {
      id: 'lodge_claim',
      from: 'active',
      to: 'claim_instructed',
      by: ['insured', 'broker'],
      label: 'Lodge claim',
      intent: 'destructive',
      requiresReason: ['obligor_default', 'insolvency', 'protracted_default', 'political_risk'],
      guards: [],
      derive: (_f, at: Instant) => ({ claim_lodged_at: isoUtc(at) }),
    },

    // --- expiry -------------------------------------------------------------
    { id: 'expire', from: 'active', to: 'expired', by: ['insurer', 'operator'], label: 'Expire cover', intent: 'secondary', guards: [] },
    { id: 'auto_expire', from: 'active', to: 'expired', by: ['system'], label: 'Auto-expire', intent: 'secondary', guards: [] },

    // --- exits --------------------------------------------------------------
    {
      id: 'decline',
      from: ['requested', 'underwriting'],
      to: 'declined',
      by: ['insurer'],
      label: 'Decline cover',
      intent: 'destructive',
      requiresReason: ['risk_appetite', 'obligor_uninsurable', 'incomplete_submission', 'sanctions'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['requested', 'underwriting'],
      to: 'withdrawn',
      by: ['insured', 'broker'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'covered_elsewhere', 'terms_unacceptable'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['requested', 'underwriting', 'bound', 'active'],
      to: 'cancelled',
      by: ['insured', 'insurer', 'operator', 'system'],
      label: 'Cancel policy',
      intent: 'destructive',
      requiresReason: ['non_payment', 'mutual_agreement', 'material_risk_change', 'cover_no_longer_required', 'validity_lapsed'],
      guards: [],
    },
  ],

  timers: [
    // a bound quote left un-incepted lapses; an active policy auto-expires at term.
    { onState: 'bound', after: { days: 30 }, fire: 'cancel', kind: 'time_bar', reason: 'validity_lapsed' },
    { onState: 'active', after: { days: 365 }, fire: 'auto_expire', kind: 'time_bar' },
  ],
};
