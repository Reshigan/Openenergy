// ccp_assessment — central-counterparty (CCP) risk-admission lifecycle as data.
//
// A risk officer opens a credit/risk assessment against a prospective clearing
// counterparty, runs due diligence (assessing), and then either APPROVES the
// counterparty for admission or DECLINES it with a structured reason. Approved
// counterparties are non-terminal: they carry a periodic-review obligation
// (initiate_review → under_review → conclude_review) so a stale approval can
// never sit unreviewed, and can be suspended or terminated on risk grounds.
//
// Structural honesty (no invented guards):
//  - APPROVAL is only reachable from `assessing`, and the only path into
//    `assessing` is begin_assessment. So a counterparty can NEVER be approved
//    without an assessment step — the state graph enforces the diligence gate,
//    no guard required.
//  - `approve`, `conclude_review` and `reinstate` (every edge that admits or
//    re-admits risk) are guarded by complianceHaltClear: a platform-wide
//    compliance halt (FSCA / NERSA directive) blocks new admissions, but does
//    NOT block decline/suspend/terminate (de-risking must always be possible).
//  - open is guarded by counterpartyDistinct: the CCP and the counterparty
//    under assessment must be different legal entities (no self-admission).
//
// settles:false — a CCP assessment is a credit/risk admission decision. Credit
// limits and default-fund figures it records are informational risk parameters;
// this chain never moves money and never posts margin (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ccpAssessment: ChainDecl = {
  key: 'ccp_assessment',
  noun: 'Central counterparty assessment',
  refPrefix: 'CCPA',
  title: (f) => `CCP assessment — ${(f.counterparty_name as string) ?? 'unnamed counterparty'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Markets Act 2012', provision: 's49 CCP licensing & participant risk management', effect: 'requires' },
    { instrument: 'CPMI-IOSCO PFMI', provision: 'Principle 4 (credit risk) + Principle 18 (access & participation)', effect: 'requires' },
  ],
  roles: ['risk', 'counterparty', 'regulator', 'operator'],

  fields: {
    counterparty_name: { type: 'string', required: true, label: 'Counterparty' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Counterparty entity' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    exposure_tier: { type: 'string', label: 'Exposure tier (tier1/tier2/tier3)' },
    risk_rating: { type: 'string', label: 'Risk rating' },
    credit_limit_zar: { type: 'number', min: 0, label: 'Credit limit (ZAR) — informational' },
    default_fund_contribution_zar: { type: 'number', min: 0, label: 'Default-fund contribution (ZAR) — informational' },
    assessment_scope_ref: { type: 'string', label: 'Assessment scope ref' },
    review_frequency_months: { type: 'number', min: 1, max: 60, label: 'Review frequency (months)' },
    // written by derive, never by the client
    initiated_at: { type: 'string', label: 'Initiated at' },
    assessed_at: { type: 'string', label: 'Assessment started at' },
    approved_at: { type: 'string', label: 'Approved at' },
    declined_at: { type: 'string', label: 'Declined at' },
    last_reviewed_at: { type: 'string', label: 'Last reviewed at' },
    suspended_at: { type: 'string', label: 'Suspended at' },
  },

  initial: 'initiated',

  states: {
    initiated: { label: 'Initiated', terminal: false, holder: 'risk', sla: { days: 5 } },
    assessing: { label: 'Assessing', terminal: false, holder: 'risk', sla: { days: 30 } },
    approved: { label: 'Approved', terminal: false, holder: 'none' },
    under_review: { label: 'Under periodic review', terminal: false, holder: 'risk', sla: { days: 15 } },
    suspended: { label: 'Suspended', terminal: false, holder: 'risk', sla: { days: 30 } },
    declined: { label: 'Declined', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    terminated: { label: 'Terminated', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'initiated',
      by: ['risk', 'operator'],
      actorBecomes: 'risk',
      label: 'Initiate CCP assessment',
      intent: 'primary',
      input: {
        counterparty_name: { type: 'string', required: true },
        counterparty_party: { type: 'party', role: 'counterparty' },
        regulator_party: { type: 'party', role: 'regulator' },
        exposure_tier: { type: 'string' },
      },
      // CCP ≠ counterparty (no self-admission) + no admissions under a halt.
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ initiated_at: isoUtc(at) }),
    },

    // --- diligence gate (structural): assessing is the ONLY door to approve ----
    {
      id: 'begin_assessment',
      from: 'initiated',
      to: 'assessing',
      by: ['risk', 'operator'],
      label: 'Begin assessment',
      intent: 'primary',
      input: { assessment_scope_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ assessed_at: isoUtc(at) }),
    },
    {
      id: 'approve',
      from: 'assessing',
      to: 'approved',
      by: ['risk', 'operator'],
      label: 'Approve admission',
      intent: 'primary',
      input: {
        exposure_tier: { type: 'string' },
        risk_rating: { type: 'string' },
        credit_limit_zar: { type: 'number', min: 0 },
        default_fund_contribution_zar: { type: 'number', min: 0 },
        review_frequency_months: { type: 'number', min: 1, max: 60 },
      },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'decline',
      from: 'assessing',
      to: 'declined',
      by: ['risk', 'operator'],
      label: 'Decline admission',
      intent: 'destructive',
      requiresReason: ['insufficient_capital', 'inadequate_risk_controls', 'adverse_credit', 'kyc_failure', 'regulatory_objection'],
      guards: [],
      derive: (_f, at: Instant) => ({ declined_at: isoUtc(at) }),
    },

    // --- periodic-review loop from approved ------------------------------------
    {
      id: 'initiate_review',
      from: 'approved',
      to: 'under_review',
      by: ['risk', 'regulator', 'operator', 'system'],
      label: 'Initiate periodic review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'conclude_review',
      from: 'under_review',
      to: 'approved',
      by: ['risk', 'operator'],
      label: 'Conclude review (pass)',
      intent: 'primary',
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ last_reviewed_at: isoUtc(at) }),
    },

    // --- de-risking exits (never blocked by a compliance halt) -----------------
    {
      id: 'suspend',
      from: ['approved', 'under_review'],
      to: 'suspended',
      by: ['risk', 'regulator', 'operator'],
      label: 'Suspend counterparty',
      intent: 'destructive',
      requiresReason: ['limit_breach', 'deteriorating_credit', 'missed_margin_call', 'regulatory_direction'],
      guards: [],
      derive: (_f, at: Instant) => ({ suspended_at: isoUtc(at) }),
    },
    {
      id: 'reinstate',
      from: 'suspended',
      to: 'approved',
      by: ['risk', 'operator'],
      label: 'Reinstate counterparty',
      intent: 'primary',
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['initiated', 'assessing'],
      to: 'withdrawn',
      by: ['counterparty', 'operator'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['no_longer_seeking_membership', 'terms_unacceptable', 'strategic_change'],
      guards: [],
    },
    {
      id: 'terminate',
      from: ['approved', 'under_review', 'suspended'],
      to: 'terminated',
      by: ['risk', 'regulator', 'operator'],
      label: 'Terminate membership',
      intent: 'destructive',
      requiresReason: ['default', 'sustained_breach', 'mutual_agreement', 'regulatory_direction', 'ceased_trading'],
      guards: [],
    },
  ],

  // periodic-review time-bar: an approved counterparty left unreviewed stales
  // out (an approval cannot be trusted indefinitely). record-only stub; the
  // sweep computes the real cadence off review_frequency_months (ppa pattern).
  timers: [{ onState: 'approved', after: { days: 0 }, fire: 'initiate_review', kind: 'time_bar' }],
};
