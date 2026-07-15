// ipp_ie_cert — Independent Engineer milestone certification, as data.
//
// A lender's IE firm certifies REIPPPP construction/financing milestones
// (financial close, construction start, PAC, COD, FAC, loan drawdown) before
// the linked lender drawdown chain (W21/W30/W38) is allowed to release funds.
// The spine mirrors a real IE review: request → site visit → draft report →
// borrower review, then either straight to issue, or out to comments and back.
// issue_cert is reachable from BOTH borrower_review and comments_resolved —
// a clean review can issue directly; a commented one issues only after
// resolution, never mid-comment.
//
// settles:false — the certificate unlocks a drawdown, it doesn't move money
// itself (R-S5-1); the actual disbursement settles in the linked lender chain.
//
// Major+-tier milestones cross to the regulator on rejection (cascadeHint on
// the v1 action) — modelled with regulatorPresentIfStrategic off capacity_mw,
// the same strategic-crossing convention as the rest of the IPP cluster.
//
// An unactioned request that sits open past its SLA auto-withdraws — the only
// v1-documented terminal with no v1 action is withdrawn, so it's driven by a
// time_bar off cert_request_submitted rather than invented as a user action.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippIeCert: ChainDecl = {
  key: 'ipp_ie_cert',
  noun: 'IE milestone certification',
  refPrefix: 'IIEC',
  title: (f) => `IE cert — ${(f.project_id as string) ?? 'project'} (${(f.milestone_category as string) ?? 'milestone'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation/Facility Agreement milestone certification', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'ie_firm', 'lender', 'regulator'],

  fields: {
    cert_number: { type: 'string', label: 'Certificate number' },
    project_id: { type: 'string', required: true, label: 'Project' },
    milestone_value_zar: { type: 'number', min: 0, label: 'Milestone disbursement value (ZAR)' },
    milestone_category: { type: 'string', label: 'Milestone category' },
    capacity_mw: { type: 'number', min: 0, label: 'Project capacity (MW)' },
    lender_reference: { type: 'string', label: 'Lender reference' },
    description: { type: 'string', label: 'Description' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    ie_firm_party: { type: 'party', role: 'ie_firm', label: 'Independent engineer firm' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    comments: { type: 'string', label: 'IE comments' },
    // derive-stamped
    site_visit_at: { type: 'string', label: 'Site visit commenced at' },
    draft_report_at: { type: 'string', label: 'Draft report submitted at' },
    issued_at: { type: 'string', label: 'Certificate issued at' },
  },

  initial: 'cert_request_submitted',

  states: {
    cert_request_submitted: { label: 'Request submitted', terminal: false, holder: 'ie_firm', sla: { days: 3 } },
    ie_site_visit: { label: 'IE site visit', terminal: false, holder: 'ie_firm', sla: { days: 7 } },
    draft_report: { label: 'Draft report', terminal: false, holder: 'ie_firm', sla: { days: 5 } },
    borrower_review: { label: 'Borrower review', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    comments_raised: { label: 'Comments raised', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    comments_resolved: { label: 'Comments resolved', terminal: false, holder: 'ie_firm', sla: { days: 3 } },
    cert_issued: { label: 'Certificate issued', terminal: true, holder: 'none' },
    cert_rejected: { label: 'Certification rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'cert_request_submitted',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Submit certification request',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        milestone_value_zar: { type: 'number', min: 0 },
        milestone_category: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        lender_reference: { type: 'string' },
        description: { type: 'string' },
        ie_firm_party: { type: 'party', role: 'ie_firm' },
        lender_party: { type: 'party', role: 'lender' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: ['complianceHaltClear'],
    },
    {
      id: 'commence_site_visit',
      from: 'cert_request_submitted',
      to: 'ie_site_visit',
      by: ['ipp_developer'],
      label: 'Commence IE site visit',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ site_visit_at: isoUtc(at) }),
    },
    {
      id: 'submit_draft_report',
      from: 'ie_site_visit',
      to: 'draft_report',
      by: ['ipp_developer'],
      label: 'Submit draft IE report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ draft_report_at: isoUtc(at) }),
    },
    {
      id: 'issue_for_borrower_review',
      from: 'draft_report',
      to: 'borrower_review',
      by: ['ipp_developer'],
      label: 'Issue for review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'raise_comments',
      from: 'borrower_review',
      to: 'comments_raised',
      by: ['ipp_developer'],
      label: 'Raise comments',
      intent: 'secondary',
      input: { comments: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'resolve_comments',
      from: 'comments_raised',
      to: 'comments_resolved',
      by: ['ipp_developer'],
      label: 'Resolve comments',
      intent: 'primary',
      guards: [],
    },
    {
      // reachable straight off a clean review OR after comments are resolved —
      // never mid-comment (comments_raised has no path here).
      id: 'issue_cert',
      from: ['borrower_review', 'comments_resolved'],
      to: 'cert_issued',
      by: ['ipp_developer'],
      label: 'Issue certificate',
      intent: 'primary',
      input: { cert_number: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ issued_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      // major+-tier (≥100 MW) rejections cross to the regulator.
      id: 'reject_certification',
      from: ['cert_request_submitted', 'ie_site_visit', 'draft_report', 'borrower_review', 'comments_raised', 'comments_resolved'],
      to: 'cert_rejected',
      by: ['ipp_developer'],
      label: 'Reject certification',
      intent: 'destructive',
      requiresReason: ['non_compliant_works', 'incomplete_documentation', 'milestone_not_achieved', 'quality_deficiency', 'safety_issue'],
      guards: ['regulatorPresentIfStrategic'],
    },
    {
      id: 'withdraw_request',
      from: ['cert_request_submitted', 'ie_site_visit', 'draft_report', 'borrower_review', 'comments_raised', 'comments_resolved'],
      to: 'withdrawn',
      by: ['ipp_developer', 'system'],
      label: 'Withdraw certification request',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'duplicate_request', 'superseded_milestone', 'sla_expired'],
      guards: [],
    },
  ],

  // an unactioned request stales out and auto-withdraws — the only
  // v1-documented terminal (withdrawn) with no dedicated v1 action.
  timers: [{ onState: 'cert_request_submitted', after: { days: 30 }, fire: 'withdraw_request', kind: 'time_bar', reason: 'sla_expired' }],
};
