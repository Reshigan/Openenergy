// credit_origination — project-finance credit facility origination as data.
//
// A lender originates a NEW credit facility for an applicant (IPP developer):
// application → credit assessment → credit-committee approval → facility offer →
// acceptance → origination. This is the ORIGINATION of the facility, distinct
// from `drawdown` (drawing money against a facility that already exists).
//
// Credit-committee spine is structural: offer_facility leaves ONLY credit_approved,
// and the ONLY path into credit_approved is credit_committee_approve. So a facility
// can NEVER be offered before the credit committee has approved it — no guard
// needed, the state graph enforces it (permit_to_work isolation-gate pattern).
// credit_committee_approve is additionally guarded by creditApprovalPresent so the
// approval carries a named committee reference.
//
// settles:false — originating a facility is a credit decision recorded here, NOT a
// disbursement. Money moves on an external rail via `drawdown` against no custody
// and no payment rails (R-S5-1). `originated` is the honest terminal: we recorded
// the lender established the facility, nothing about funds.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure credit-grade bucketing off the DSCR estimate. Higher DSCR ⇒ stronger
// coverage. No clock, no env.
const riskGrade = (dscr: Json | undefined): string => {
  if (typeof dscr !== 'number') return 'ungraded';
  if (dscr >= 1.5) return 'strong';
  if (dscr >= 1.2) return 'adequate';
  if (dscr >= 1.0) return 'marginal';
  return 'sub_investment';
};

export const creditOrigination: ChainDecl = {
  key: 'credit_origination',
  noun: 'Credit facility origination',
  refPrefix: 'CO',
  title: (f) =>
    `Credit facility — ${(f.applicant_name as string) ?? 'unnamed'} (${(f.facility_type as string) ?? 'facility'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'facility agreement origination', effect: 'requires' },
    { instrument: 'NCA 2005', provision: 'reckless-credit prohibition — affordability assessment', effect: 'requires' },
  ],
  roles: ['applicant', 'lender', 'operator'],

  fields: {
    application_ref: { type: 'string', required: true, label: 'Application ref' },
    applicant_name: { type: 'string', required: true, label: 'Applicant' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender' },
    facility_type: { type: 'string', required: true, label: 'Facility type (term_loan/revolving/bridge)' },
    facility_amount_zar: { type: 'number', required: true, min: 0, label: 'Facility amount (ZAR)' },
    tenor_months: { type: 'number', min: 1, label: 'Tenor (months)' },
    purpose: { type: 'string', label: 'Purpose' },
    dscr_estimate: { type: 'number', min: 0, label: 'DSCR estimate' },
    risk_grade: { type: 'string', label: 'Risk grade' },
    credit_approval_ref: { type: 'string', label: 'Credit-committee approval ref' },
    margin_bps: { type: 'number', min: 0, label: 'Pricing margin (bps)' },
    // written by derive, never by the client
    offered_at: { type: 'string', label: 'Offered at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    originated_at: { type: 'string', label: 'Originated at' },
  },

  initial: 'submitted',

  states: {
    submitted: { label: 'Application submitted', terminal: false, holder: 'lender', sla: { days: 10 } },
    under_assessment: { label: 'Under credit assessment', terminal: false, holder: 'lender', sla: { days: 30 } },
    credit_approved: { label: 'Credit-committee approved', terminal: false, holder: 'lender', sla: { days: 5 } },
    facility_offered: { label: 'Facility offered', terminal: false, holder: 'applicant', sla: { days: 14 } },
    facility_accepted: { label: 'Offer accepted', terminal: false, holder: 'lender', sla: { days: 5 } },
    // record-only terminal: the lender established the facility. No custody, no funds.
    originated: { label: 'Facility originated (credit decision — no funds moved here)', terminal: true, holder: 'none' },
    declined: { label: 'Declined', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    lapsed: { label: 'Offer lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'submitted',
      by: ['applicant', 'operator'],
      actorBecomes: 'applicant',
      label: 'Submit credit application',
      intent: 'primary',
      input: {
        application_ref: { type: 'string', required: true },
        applicant_name: { type: 'string', required: true },
        facility_type: { type: 'string', required: true },
        facility_amount_zar: { type: 'number', required: true, min: 0 },
        tenor_months: { type: 'number', min: 1 },
        purpose: { type: 'string' },
        lender_party: { type: 'party', role: 'lender' },
      },
      // lender and applicant must be distinct entities (no self-lending); no new
      // commitments under a platform compliance halt.
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
    },
    {
      id: 'begin_assessment',
      from: 'submitted',
      to: 'under_assessment',
      by: ['lender'],
      label: 'Begin credit assessment',
      intent: 'primary',
      input: { dscr_estimate: { type: 'number', min: 0 } },
      guards: [],
      derive: (f, _at: Instant) => ({ risk_grade: riskGrade(f.dscr_estimate) }),
    },
    {
      id: 'credit_committee_approve',
      from: 'under_assessment',
      to: 'credit_approved',
      by: ['lender'],
      label: 'Credit-committee approve',
      intent: 'primary',
      input: { credit_approval_ref: { type: 'string', required: true } },
      // approval must carry a named committee reference.
      guards: ['creditApprovalPresent'],
    },
    {
      // structural credit gate: the ONLY edge into facility_offered, and it can
      // only fire from credit_approved — which only credit_committee_approve
      // reaches. A facility therefore cannot be offered before committee approval.
      id: 'offer_facility',
      from: 'credit_approved',
      to: 'facility_offered',
      by: ['lender'],
      label: 'Offer facility',
      intent: 'primary',
      input: { margin_bps: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ offered_at: isoUtc(at) }),
    },
    {
      id: 'accept_offer',
      from: 'facility_offered',
      to: 'facility_accepted',
      by: ['applicant'],
      label: 'Accept offer',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      id: 'originate',
      from: 'facility_accepted',
      to: 'originated',
      by: ['lender'],
      label: 'Originate facility',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ originated_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'decline',
      from: ['submitted', 'under_assessment', 'credit_approved', 'facility_accepted'],
      to: 'declined',
      by: ['lender'],
      label: 'Decline application',
      intent: 'destructive',
      requiresReason: ['affordability_fail', 'covenant_risk', 'incomplete_information', 'policy_exclusion', 'pricing_rejected'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['submitted', 'under_assessment', 'credit_approved', 'facility_offered'],
      to: 'withdrawn',
      by: ['applicant'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'financed_elsewhere', 'project_cancelled'],
      guards: [],
    },
    {
      // an unaccepted offer expires — record-only terminal, timer-fired.
      id: 'lapse',
      from: 'facility_offered',
      to: 'lapsed',
      by: ['lender', 'operator', 'system'],
      label: 'Offer lapsed',
      intent: 'destructive',
      guards: [],
    },
  ],

  // offer validity time-bar: an unaccepted facility offer lapses. record-only stub;
  // the sweep computes the real bar off the facility_offered sla days.
  timers: [{ onState: 'facility_offered', after: { days: 0 }, fire: 'lapse', kind: 'time_bar' }],
};
