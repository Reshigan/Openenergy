// green_tariff — green (renewable) tariff enrollment lifecycle as data.
//
// A customer (offtaker) requests enrollment onto a certified green/renewable
// tariff product; the utility verifies eligibility, a tariff approval is
// granted, the enrollment goes active, and the customer may later withdraw.
//
// Structural gate (permit_to_work pattern): the ONLY edge into `approved` is
// `approve`, whose ONLY `from` is `verified`; and the ONLY edge into `active`
// is `activate`, whose ONLY `from` is `approved`. So an enrollment can NEVER
// be approved before eligibility is verified, nor go active before it is
// approved — the state graph enforces the order, no guard needed.
//
// Reused guards (registry.ts — no new guards invented):
//  - regulatorPresentIfStrategic: a large enrollment (≥100 MW) crossing NERSA's
//    strategic threshold needs a regulator on the txn before approval.
//  - complianceHaltClear: a platform-wide POPIA/NERSA compliance halt blocks a
//    new tariff approval.
//
// settles:false — a tariff enrollment is a regulatory/commercial registration;
// no money moves through this chain (billing lands elsewhere), so export always
// carries the record-only custody notice (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const greenTariff: ChainDecl = {
  key: 'green_tariff',
  noun: 'Green tariff enrollment',
  refPrefix: 'GTAR',
  title: (f) => `Green tariff — ${(f.customer_name as string) ?? 'unnamed'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's15 tariff conditions', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'retail tariff determination', effect: 'requires' },
  ],
  roles: ['customer', 'utility', 'regulator', 'operator'],

  fields: {
    customer_name: { type: 'string', required: true, label: 'Customer' },
    tariff_product: { type: 'string', required: true, label: 'Green tariff product' },
    account_number: { type: 'string', label: 'Account number' },
    capacity_mw: { type: 'number', min: 0, label: 'Contracted capacity (MW)' },
    premium_zar_mwh: { type: 'number', min: 0, label: 'Green premium (ZAR/MWh)' },
    // parties attached at @new so they can fire later edges (types.ts party rule)
    utility_party: { type: 'party', role: 'utility', label: 'Supplying utility' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    // written by derive, never by the client
    verified_at: { type: 'string', label: 'Eligibility verified at' },
    approved_at: { type: 'string', label: 'Tariff approved at' },
    activated_at: { type: 'string', label: 'Enrollment activated at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'requested',

  states: {
    requested: { label: 'Requested', terminal: false, holder: 'utility', sla: { days: 10 } },
    verified: { label: 'Eligibility verified', terminal: false, holder: 'utility', sla: { days: 10 } },
    approved: { label: 'Tariff approved', terminal: false, holder: 'utility', sla: { days: 5 } },
    active: { label: 'Active', terminal: false, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    // --- creation -----------------------------------------------------------
    {
      id: 'open',
      from: '@new',
      to: 'requested',
      by: ['customer', 'operator'],
      actorBecomes: 'customer',
      label: 'Request green tariff',
      intent: 'primary',
      input: {
        customer_name: { type: 'string', required: true },
        tariff_product: { type: 'string', required: true },
        account_number: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        premium_zar_mwh: { type: 'number', min: 0 },
        utility_party: { type: 'party', role: 'utility' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: ['complianceHaltClear'],
    },

    // --- happy path (order enforced structurally) ---------------------------
    {
      id: 'verify',
      from: 'requested',
      to: 'verified',
      by: ['utility', 'operator'],
      label: 'Verify eligibility',
      intent: 'primary',
      input: { eligibility_evidence_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      // structural gate: only edge into `approved`, only from `verified`.
      id: 'approve',
      from: 'verified',
      to: 'approved',
      by: ['utility', 'operator'],
      label: 'Approve tariff',
      intent: 'primary',
      guards: ['regulatorPresentIfStrategic', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      // structural gate: only edge into `active`, only from `approved`.
      id: 'activate',
      from: 'approved',
      to: 'active',
      by: ['utility', 'operator'],
      label: 'Activate enrollment',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ activated_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'withdraw',
      from: 'active',
      to: 'withdrawn',
      by: ['customer', 'utility', 'operator'],
      label: 'Withdraw enrollment',
      intent: 'destructive',
      requiresReason: ['customer_request', 'relocation', 'switched_supplier', 'non_payment'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
    {
      id: 'reject',
      from: ['requested', 'verified'],
      to: 'rejected',
      by: ['utility', 'operator', 'regulator', 'system'],
      label: 'Reject enrollment',
      intent: 'destructive',
      requiresReason: ['ineligible', 'incomplete_application', 'no_renewable_capacity', 'account_in_arrears', 'application_lapsed'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['requested', 'verified', 'approved'],
      to: 'cancelled',
      by: ['customer', 'operator', 'system'],
      label: 'Cancel request',
      intent: 'destructive',
      requiresReason: ['withdrawn_by_customer', 'duplicate', 'terms_declined', 'acceptance_window_lapsed'],
      guards: [],
    },
  ],

  // record-only time-bars. The sweep computes the real bar off state sla days
  // (ppa_contract pattern); an unactioned request/approval stales out.
  timers: [
    { onState: 'requested', after: { days: 90 }, fire: 'reject', kind: 'time_bar', reason: 'application_lapsed' },
    { onState: 'approved', after: { days: 30 }, fire: 'cancel', kind: 'time_bar', reason: 'acceptance_window_lapsed' },
  ],
};
