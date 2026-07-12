// algo_cert — algorithmic-trading certification lifecycle as data.
//
// An applicant (a trading member) submits a trading algorithm for certification;
// the exchange/regulator reviews it, requires a conformance test run, and only
// then certifies it for live trading. FSCA/exchange algo-governance: an
// uncertified algo may not touch the live order book.
//
// STRUCTURAL certification gate: the `certify` edge ONLY leaves `testing`, and
// the ONLY path into `testing` is `require_testing` from `under_review`. So an
// algo can NEVER be certified without a documented conformance-test stage — the
// state graph enforces it, no guard needed (permit_to_work isolation pattern).
// Trying to certify straight from `under_review` is an ILLEGAL_TRANSITION.
//
// A certified algo can be suspended by the regulator (kill-switch of a
// misbehaving algo) and later recertified — recertify routes back through
// `under_review`, so re-approval must re-run review + testing before it goes
// live again. Revoke is the permanent decertification exit.
//
// settles:false — certification is a regulatory control, never a payment. No
// money moves through this chain (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const algoCert: ChainDecl = {
  key: 'algo_cert',
  noun: 'Algorithmic trading certification',
  refPrefix: 'ALGO',
  title: (f) => `Algo cert — ${(f.algo_name as string) ?? 'unnamed'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'FSCA FMA 2012', provision: 's67 electronic/algorithmic trading controls', effect: 'requires' },
    { instrument: 'JSE-SRL Trading Rules', provision: 'algorithm conformance & certification', effect: 'requires' },
  ],
  roles: ['applicant', 'regulator', 'operator'],

  fields: {
    algo_name: { type: 'string', required: true, label: 'Algorithm name' },
    strategy_class: { type: 'string', required: true, label: 'Strategy class (market_making/arb/execution/directional)' },
    version: { type: 'string', label: 'Algorithm version' },
    applicant_party: { type: 'party', role: 'applicant', label: 'Applicant (trading member)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator / exchange' },
    markets: { type: 'string', label: 'Markets / instruments' },
    max_order_rate: { type: 'number', min: 0, label: 'Max order rate (orders/sec)' },
    kill_switch_ref: { type: 'string', label: 'Kill-switch control ref' },
    risk_control_ref: { type: 'string', label: 'Pre-trade risk-control ref' },
    conformance_report_ref: { type: 'string', label: 'Conformance test report ref' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted at' },
    certified_at: { type: 'string', label: 'Certified at' },
    suspended_at: { type: 'string', label: 'Suspended at' },
  },

  initial: 'submitted',

  states: {
    submitted: { label: 'Submitted', terminal: false, holder: 'regulator', sla: { days: 5 } },
    under_review: { label: 'Under review', terminal: false, holder: 'regulator', sla: { days: 10 } },
    testing: { label: 'Conformance testing', terminal: false, holder: 'applicant', sla: { days: 20 } },
    certified: { label: 'Certified', terminal: false, holder: 'none' },
    suspended: { label: 'Suspended', terminal: false, holder: 'regulator', sla: { days: 30 } },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    revoked: { label: 'Revoked', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'submitted',
      by: ['applicant', 'operator'],
      actorBecomes: 'applicant',
      label: 'Submit for certification',
      intent: 'primary',
      input: {
        algo_name: { type: 'string', required: true },
        strategy_class: { type: 'string', required: true },
        version: { type: 'string' },
        markets: { type: 'string' },
        max_order_rate: { type: 'number', min: 0 },
        kill_switch_ref: { type: 'string' },
        risk_control_ref: { type: 'string' },
        // regulator must be attached at @new to act on later review/certify edges.
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // a platform compliance halt blocks admitting new algos to the certification pipeline.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },

    // --- review + conformance -------------------------------------------------
    { id: 'begin_review', from: 'submitted', to: 'under_review', by: ['regulator', 'operator'], label: 'Begin review', intent: 'primary', guards: [] },
    {
      // the ONLY edge into `testing`; certify can only fire from `testing`.
      id: 'require_testing',
      from: 'under_review',
      to: 'testing',
      by: ['regulator', 'operator'],
      label: 'Require conformance testing',
      intent: 'primary',
      guards: [],
    },
    {
      // structural gate: certify leaves ONLY `testing`, so a documented
      // conformance stage is unskippable. Needs the conformance report ref.
      id: 'certify',
      from: 'testing',
      to: 'certified',
      by: ['regulator', 'operator'],
      label: 'Certify',
      intent: 'primary',
      input: { conformance_report_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ certified_at: isoUtc(at) }),
    },

    // --- suspension / recertification ----------------------------------------
    {
      id: 'suspend',
      from: 'certified',
      to: 'suspended',
      by: ['regulator', 'operator'],
      label: 'Suspend certification',
      intent: 'destructive',
      requiresReason: ['risk_breach', 'runaway_orders', 'kill_switch_failure', 'material_change', 'regulatory_direction'],
      guards: [],
      derive: (_f, at: Instant) => ({ suspended_at: isoUtc(at) }),
    },
    {
      // recertify re-enters review — re-approval must re-run review + testing
      // before the algo can go live again (structural: no suspended→certified edge).
      id: 'recertify',
      from: 'suspended',
      to: 'under_review',
      by: ['regulator', 'operator'],
      label: 'Reopen for recertification',
      intent: 'primary',
      guards: [],
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: ['submitted', 'under_review', 'testing'],
      to: 'rejected',
      by: ['regulator', 'operator'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['inadequate_controls', 'conformance_failed', 'insufficient_evidence', 'strategy_prohibited'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['submitted', 'under_review', 'testing'],
      to: 'withdrawn',
      by: ['applicant'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['strategy_retired', 'resubmitting', 'no_longer_required'],
      guards: [],
    },
    {
      id: 'revoke',
      from: ['certified', 'suspended'],
      to: 'revoked',
      by: ['regulator', 'operator'],
      label: 'Revoke certification',
      intent: 'destructive',
      requiresReason: ['persistent_breach', 'material_misrepresentation', 'membership_terminated', 'regulatory_direction'],
      guards: [],
    },
  ],

  timers: [
    // an unactioned submission stales out of the regulator's queue (SLA breach).
    { onState: 'submitted', after: { days: 0 }, fire: 'reject', kind: 'sla' },
    // a suspension left unresolved time-bars into permanent revocation.
    { onState: 'suspended', after: { days: 0 }, fire: 'revoke', kind: 'time_bar' },
  ],
};
