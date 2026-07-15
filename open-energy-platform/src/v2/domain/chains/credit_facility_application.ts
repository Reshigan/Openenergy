// credit_facility_application — lender-side credit origination lifecycle for a
// project-finance facility, as data (v1: W53, oe_credit_facility_applications).
//
// A prospective borrower (the applicant — typically an IPP/developer) applies
// for a credit facility. The lender screens, runs a full credit assessment
// (LTV/DSCR/gearing/PD/LGD/EAD), refers the file to committee, and the
// committee either declines, approves outright, or approves subject to
// conditions. Conditions-pending facilities are satisfied back into the same
// `approved` state as an outright approval — the two paths converge before
// agreement issuance. From there: issue the facility agreement, satisfy its
// conditions precedent, then activate the facility.
//
// Structural honesty (no invented guards):
//  - `facility_available` (the only non-decline/withdraw terminal state) is
//    reachable ONLY via `activate`, which is reachable ONLY from
//    `cp_satisfied`, which is reachable ONLY from `agreement_issued`, which is
//    reachable ONLY from `approved`. So a facility can NEVER go live without
//    passing through approval, agreement issuance and CP satisfaction — the
//    state graph enforces the whole chain, no guard required.
//  - `approve`, `approve_with_conditions` and `activate` (every edge that
//    creates or finalises a lending commitment) are guarded by
//    complianceHaltClear: a platform-wide compliance halt (Prudential
//    Authority / NERSA directive) blocks new commitments, but decline,
//    refer_back and withdraw are never blocked (de-risking must stay open).
//  - `open` is guarded by counterpartyDistinct: applicant and lender must be
//    different legal entities (no self-lending).
//  - `decline` is reachable from every pre-commitment state (application
//    through referred_back) because v1 exposes no separate early-rejection
//    action — a lender can kill an application at any stage before approval.
//
// settles:false — origination is a credit-committee decision + facility
// agreement record. The actual cash movement happens on drawdown (see
// drawdown.ts), which settles on its own rail (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const creditFacilityApplication: ChainDecl = {
  key: 'credit_facility_application',
  noun: 'Credit facility application',
  refPrefix: 'CFA',
  title: (f) =>
    `Credit facility — ${(f.facility_name as string) ?? 'unnamed facility'}${
      typeof f.facility_limit_zar_m === 'number' ? ` (ZAR ${f.facility_limit_zar_m}m)` : ''
    }`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'National Credit Act 34 of 2005', provision: 'credit-granting affordability & reckless-lending assessment', effect: 'requires' },
    { instrument: 'Banks Act 94 of 1990 (Basel III capital framework)', provision: 'credit-risk assessment & large-exposure limits for facility origination', effect: 'requires' },
  ],
  roles: ['applicant', 'lender', 'operator'],

  fields: {
    application_number: { type: 'string', label: 'Application number' },
    facility_name: { type: 'string', required: true, label: 'Facility name' },
    facility_limit_zar_m: { type: 'number', min: 0, label: 'Requested facility limit (ZAR m)' },
    applicant_party: { type: 'party', role: 'applicant', label: 'Applicant (borrower)' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender' },

    screening_ref: { type: 'string', label: 'Screening ref' },
    screening_basis: { type: 'string', label: 'Screening basis' },
    credit_rating: { type: 'string', label: 'Credit rating' },

    assessment_ref: { type: 'string', label: 'Assessment ref' },
    assessment_basis: { type: 'string', label: 'Assessment basis' },
    ltv_pct: { type: 'number', min: 0, max: 100, label: 'LTV (%)' },
    dscr_base: { type: 'number', min: 0, label: 'DSCR (base case)' },
    gearing_pct: { type: 'number', min: 0, max: 100, label: 'Gearing (%)' },
    pd_pct: { type: 'number', min: 0, max: 100, label: 'Probability of default (%)' },
    lgd_pct: { type: 'number', min: 0, max: 100, label: 'Loss given default (%)' },
    ead_zar_m: { type: 'number', min: 0, label: 'Exposure at default (ZAR m)' },

    committee_ref: { type: 'string', label: 'Committee ref' },
    committee_basis: { type: 'string', label: 'Committee basis' },
    reason_code: { type: 'string', label: 'Reason' },
    decision_notes: { type: 'string', label: 'Decision notes' },

    approval_ref: { type: 'string', label: 'Approval / committee minute ref' },
    approval_basis: { type: 'string', label: 'Approval basis / evidence' },
    approved_amount_zar_m: { type: 'number', min: 0, label: 'Approved facility limit (ZAR m)' },

    decline_ref: { type: 'string', label: 'Decline notice ref' },
    decline_basis: { type: 'string', label: 'Decline basis / evidence' },

    conditions_basis: { type: 'string', label: 'Conditions basis' },
    conditions_count: { type: 'number', min: 0, label: 'Conditions count' },

    agreement_ref: { type: 'string', label: 'Agreement ref' },
    cp_count: { type: 'number', min: 0, label: 'CP count' },
    cp_ref: { type: 'string', label: 'CP ref' },
    cp_basis: { type: 'string', label: 'CP basis' },

    activation_ref: { type: 'string', label: 'Activation ref' },
    activation_basis: { type: 'string', label: 'Activation basis' },
    regulator_ref: { type: 'string', label: 'Regulator ref (SARB large-exposure, systemic tier)' },

    // written by derive, never by the client
    applied_at: { type: 'string', label: 'Applied at' },
    screened_at: { type: 'string', label: 'Screened at' },
    assessed_at: { type: 'string', label: 'Assessed at' },
    committee_referred_at: { type: 'string', label: 'Referred to committee at' },
    referred_back_at: { type: 'string', label: 'Referred back at' },
    approved_at: { type: 'string', label: 'Approved at' },
    declined_at: { type: 'string', label: 'Declined at' },
    conditions_pending_at: { type: 'string', label: 'Conditions pending at' },
    agreement_issued_at: { type: 'string', label: 'Agreement issued at' },
    cp_satisfied_at: { type: 'string', label: 'CP satisfied at' },
    activated_at: { type: 'string', label: 'Activated at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'application_received',

  states: {
    application_received: { label: 'Application received', terminal: false, holder: 'lender', sla: { days: 5 } },
    screening: { label: 'Screening', terminal: false, holder: 'lender', sla: { days: 10 } },
    credit_assessment: { label: 'Credit assessment', terminal: false, holder: 'lender', sla: { days: 15 } },
    committee_review: { label: 'Committee review', terminal: false, holder: 'lender', sla: { days: 10 } },
    referred_back: { label: 'Referred back', terminal: false, holder: 'lender', sla: { days: 10 } },
    conditions_pending: { label: 'Conditions pending', terminal: false, holder: 'lender', sla: { days: 30 } },
    approved: { label: 'Approved', terminal: false, holder: 'lender', sla: { days: 15 } },
    agreement_issued: { label: 'Agreement issued', terminal: false, holder: 'lender', sla: { days: 15 } },
    cp_satisfied: { label: 'CP satisfied', terminal: false, holder: 'lender', sla: { days: 10 } },
    facility_available: { label: 'Facility available', terminal: true, holder: 'none' },
    declined: { label: 'Declined', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'application_received',
      by: ['applicant', 'operator'],
      actorBecomes: 'applicant',
      label: 'Submit credit facility application',
      intent: 'primary',
      input: {
        application_number: { type: 'string' },
        facility_name: { type: 'string', required: true },
        facility_limit_zar_m: { type: 'number', min: 0 },
        lender_party: { type: 'party', role: 'lender' },
      },
      // applicant ≠ lender (no self-lending).
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ applied_at: isoUtc(at) }),
    },
    {
      id: 'screen',
      from: 'application_received',
      to: 'screening',
      by: ['lender', 'operator'],
      label: 'Screen application',
      intent: 'primary',
      input: {
        screening_ref: { type: 'string' },
        screening_basis: { type: 'string' },
        credit_rating: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ screened_at: isoUtc(at) }),
    },
    {
      // reachable from referred_back too — the committee's send-back loops
      // straight into re-assessment, not back to intake.
      id: 'assess',
      from: ['screening', 'referred_back'],
      to: 'credit_assessment',
      by: ['lender', 'operator'],
      label: 'Run credit assessment',
      intent: 'primary',
      input: {
        assessment_ref: { type: 'string' },
        assessment_basis: { type: 'string' },
        ltv_pct: { type: 'number', min: 0, max: 100 },
        dscr_base: { type: 'number', min: 0 },
        gearing_pct: { type: 'number', min: 0, max: 100 },
        pd_pct: { type: 'number', min: 0, max: 100 },
        lgd_pct: { type: 'number', min: 0, max: 100 },
        ead_zar_m: { type: 'number', min: 0 },
        credit_rating: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ assessed_at: isoUtc(at) }),
    },
    {
      id: 'refer_committee',
      from: 'credit_assessment',
      to: 'committee_review',
      by: ['lender', 'operator'],
      label: 'Refer to committee',
      intent: 'primary',
      input: {
        committee_ref: { type: 'string' },
        committee_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ committee_referred_at: isoUtc(at) }),
    },
    {
      id: 'refer_back',
      from: 'committee_review',
      to: 'referred_back',
      by: ['lender', 'operator'],
      label: 'Refer back for rework',
      intent: 'secondary',
      input: { committee_basis: { type: 'string' } },
      requiresReason: ['insufficient_information', 'risk_concerns', 'pricing_review_required', 'additional_collateral_required'],
      guards: [],
      derive: (_f, at: Instant) => ({ referred_back_at: isoUtc(at) }),
    },
    {
      id: 'approve',
      from: 'committee_review',
      to: 'approved',
      by: ['lender', 'operator'],
      label: 'Approve facility',
      intent: 'primary',
      input: {
        approved_amount_zar_m: { type: 'number', min: 0 },
        approval_ref: { type: 'string' },
        approval_basis: { type: 'string' },
        decision_notes: { type: 'string' },
      },
      // outright approval is a new lending commitment — blocked under a halt.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'approve_with_conditions',
      from: 'committee_review',
      to: 'conditions_pending',
      by: ['lender', 'operator'],
      label: 'Approve with conditions',
      intent: 'primary',
      input: {
        approval_ref: { type: 'string' },
        approval_basis: { type: 'string' },
        conditions_basis: { type: 'string' },
        conditions_count: { type: 'number', min: 0 },
        approved_amount_zar_m: { type: 'number', min: 0 },
        decision_notes: { type: 'string' },
      },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ conditions_pending_at: isoUtc(at) }),
    },
    {
      // converges back into the same `approved` state as an outright approval
      // — agreement issuance downstream doesn't care which path got here.
      id: 'satisfy_conditions',
      from: 'conditions_pending',
      to: 'approved',
      by: ['lender', 'operator'],
      label: 'Satisfy conditions',
      intent: 'primary',
      input: { conditions_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'decline',
      from: ['application_received', 'screening', 'credit_assessment', 'committee_review', 'referred_back'],
      to: 'declined',
      by: ['lender', 'operator'],
      label: 'Decline application',
      intent: 'destructive',
      input: {
        decline_ref: { type: 'string' },
        decline_basis: { type: 'string' },
      },
      requiresReason: ['insufficient_dscr', 'adverse_credit', 'regulatory_objection', 'kyc_failure', 'collateral_shortfall'],
      guards: [],
      derive: (_f, at: Instant) => ({ declined_at: isoUtc(at) }),
    },
    {
      // structural gate: the only edge into agreement_issued, only from approved.
      id: 'issue_agreement',
      from: 'approved',
      to: 'agreement_issued',
      by: ['lender', 'operator'],
      label: 'Issue facility agreement',
      intent: 'primary',
      input: {
        agreement_ref: { type: 'string' },
        cp_count: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ agreement_issued_at: isoUtc(at) }),
    },
    {
      id: 'satisfy_cp',
      from: 'agreement_issued',
      to: 'cp_satisfied',
      by: ['lender', 'operator'],
      label: 'Satisfy conditions precedent',
      intent: 'primary',
      input: {
        cp_ref: { type: 'string' },
        cp_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ cp_satisfied_at: isoUtc(at) }),
    },
    {
      // the only edge into the non-decline terminal — a facility can never go
      // live without approval → agreement → CP satisfaction (state graph, not
      // a guard).
      id: 'activate',
      from: 'cp_satisfied',
      to: 'facility_available',
      by: ['lender', 'operator'],
      label: 'Activate facility',
      intent: 'primary',
      input: {
        activation_ref: { type: 'string' },
        activation_basis: { type: 'string' },
        regulator_ref: { type: 'string' },
      },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ activated_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: [
        'application_received',
        'screening',
        'credit_assessment',
        'committee_review',
        'referred_back',
        'conditions_pending',
        'approved',
        'agreement_issued',
        'cp_satisfied',
      ],
      to: 'withdrawn',
      by: ['lender', 'operator'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['applicant_withdrew', 'terms_unacceptable', 'financing_no_longer_required', 'superseded_facility'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],
};
