// green_bond — annual green-bond allocation & impact report lifecycle as data.
//
// A bond issuer opens a reporting period, gathers use-of-proceeds data,
// calculates impact (kWh generated / tCO2e avoided / green capex), commissions
// an external reviewer (ICMA GBP second-party opinion / verification), takes it
// through board sign-off, then submits to the JSE for listings review before
// publication. The disclosure spine is structural: publish leaves ONLY
// `approved`, and the ONLY path into `approved` is approve_report from JSE
// review. So an impact report can NEVER be published before the exchange
// approves it — no guard needed, the state graph enforces it. Likewise the only
// path to board sign-off runs through the external reviewer's completeness
// certification (completenessEvidencePresent), so a report can't reach the JSE
// on unreviewed numbers.
//
// settles:false — a disclosure report is a regulatory filing, never a payment
// (R-S5-1). The bond's cash flows settle elsewhere.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const greenBond: ChainDecl = {
  key: 'green_bond',
  noun: 'Green bond impact report',
  refPrefix: 'GB',
  title: (f) =>
    `${(f.bond_class as string) ?? 'project'} green bond ${(f.report_year as number) ?? ''} — ${(f.bond_isin as string) ?? 'unlisted'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'JSE Sustainability Segment Listings Requirements', provision: 'green bond use-of-proceeds & impact disclosure', effect: 'requires' },
    { instrument: 'ICMA Green Bond Principles 2021', provision: 'external review + annual reporting', effect: 'requires' },
  ],
  roles: ['issuer', 'reviewer', 'regulator', 'operator'],

  fields: {
    bond_isin: { type: 'string', label: 'Bond ISIN' },
    bond_class: { type: 'string', required: true, label: 'Class (project/corporate/sovereign/securitised)' },
    report_year: { type: 'number', required: true, label: 'Report year' },
    issuance_size_zar: { type: 'number', min: 0, label: 'Issuance size (ZAR)' },
    reporting_period_start: { type: 'string', label: 'Reporting period start' },
    reporting_period_end: { type: 'string', label: 'Reporting period end' },
    issuer_party: { type: 'party', role: 'issuer', label: 'Issuer' },
    reviewer_party: { type: 'party', role: 'reviewer', label: 'External reviewer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'JSE / regulator' },
    // impact metrics
    kwh_generated: { type: 'number', min: 0, label: 'kWh generated' },
    carbon_avoided_tco2e: { type: 'number', min: 0, label: 'tCO2e avoided' },
    green_capex_deployed_zar: { type: 'number', min: 0, label: 'Green capex deployed (ZAR)' },
    eligible_projects_count: { type: 'number', min: 0, label: 'Eligible projects' },
    // external review
    external_reviewer: { type: 'string', label: 'External reviewer name' },
    review_type: { type: 'string', label: 'Review type (second_party/certification/verification/rating)' },
    completeness_ref: { type: 'string', label: 'Completeness evidence ref' },
    board_resolution_ref: { type: 'string', label: 'Board resolution ref' },
    jse_submission_ref: { type: 'string', label: 'JSE submission ref' },
    query_count: { type: 'number', min: 0, label: 'Query rounds' },
    // written by derive, never by the client
    review_completed_at: { type: 'string', label: 'Review completed at' },
    board_approved_at: { type: 'string', label: 'Board approved at' },
    submitted_at: { type: 'string', label: 'Submitted to JSE at' },
    last_response_at: { type: 'string', label: 'Last query response at' },
    jse_approved_at: { type: 'string', label: 'JSE approved at' },
    published_at: { type: 'string', label: 'Published at' },
  },

  initial: 'period_open',

  states: {
    period_open: { label: 'Reporting period open', terminal: false, holder: 'issuer', sla: { days: 30 } },
    data_gathering: { label: 'Data gathering', terminal: false, holder: 'issuer', sla: { days: 21 } },
    impact_calculated: { label: 'Impact calculated', terminal: false, holder: 'issuer', sla: { days: 7 } },
    external_review: { label: 'External review', terminal: false, holder: 'reviewer', sla: { days: 30 } },
    board_approval: { label: 'Board approval', terminal: false, holder: 'issuer', sla: { days: 14 } },
    submitted_jse: { label: 'Submitted to JSE', terminal: false, holder: 'regulator', sla: { days: 5 } },
    under_review: { label: 'JSE review', terminal: false, holder: 'regulator', sla: { days: 20 } },
    queries_raised: { label: 'Queries raised', terminal: false, holder: 'issuer', sla: { days: 10 } },
    approved: { label: 'Approved', terminal: false, holder: 'issuer', sla: { days: 5 } },
    published: { label: 'Published', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'period_open',
      by: ['issuer', 'operator'],
      actorBecomes: 'issuer',
      label: 'Open reporting period',
      intent: 'primary',
      input: {
        bond_isin: { type: 'string' },
        bond_class: { type: 'string', required: true },
        report_year: { type: 'number', required: true },
        issuance_size_zar: { type: 'number', min: 0 },
        reporting_period_start: { type: 'string' },
        reporting_period_end: { type: 'string' },
        reviewer_party: { type: 'party', role: 'reviewer' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    { id: 'begin_gathering', from: 'period_open', to: 'data_gathering', by: ['issuer'], label: 'Begin data gathering', intent: 'primary', guards: [] },
    {
      id: 'calculate_impact',
      from: 'data_gathering',
      to: 'impact_calculated',
      by: ['issuer'],
      label: 'Calculate impact',
      intent: 'primary',
      input: {
        kwh_generated: { type: 'number', min: 0 },
        carbon_avoided_tco2e: { type: 'number', min: 0 },
        green_capex_deployed_zar: { type: 'number', min: 0 },
        eligible_projects_count: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'commission_review',
      from: 'impact_calculated',
      to: 'external_review',
      by: ['issuer'],
      label: 'Commission external review',
      intent: 'primary',
      input: { external_reviewer: { type: 'string', required: true }, review_type: { type: 'string', required: true } },
      guards: [],
    },
    {
      // structural gate: the ONLY path to board sign-off runs through the
      // external reviewer certifying completeness (needs completeness_ref). A
      // report cannot reach the JSE on unreviewed numbers.
      id: 'certify_review',
      from: 'external_review',
      to: 'board_approval',
      by: ['reviewer'],
      label: 'Certify review complete',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ review_completed_at: isoUtc(at) }),
    },
    {
      id: 'approve_board',
      from: 'board_approval',
      to: 'submitted_jse',
      by: ['issuer'],
      label: 'Board approve & submit to JSE',
      intent: 'primary',
      input: { board_resolution_ref: { type: 'string', required: true }, jse_submission_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ board_approved_at: isoUtc(at), submitted_at: isoUtc(at) }),
    },
    { id: 'begin_jse_review', from: 'submitted_jse', to: 'under_review', by: ['regulator'], label: 'Begin JSE review', intent: 'primary', guards: [] },
    {
      id: 'raise_queries',
      from: 'under_review',
      to: 'queries_raised',
      by: ['regulator'],
      label: 'Raise queries',
      intent: 'secondary',
      requiresReason: ['impact_methodology', 'allocation_evidence', 'reviewer_scope', 'disclosure_gap'],
      guards: [],
      derive: (f, _at: Instant) => ({ query_count: (typeof f.query_count === 'number' ? f.query_count : 0) + 1 }),
    },
    {
      id: 'respond_queries',
      from: 'queries_raised',
      to: 'under_review',
      by: ['issuer'],
      label: 'Respond to queries',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ last_response_at: isoUtc(at) }),
    },
    {
      // structural gate: the ONLY edge into `approved`, and it fires ONLY from
      // JSE review. publish (below) leaves ONLY `approved`, so a report can never
      // be published before the exchange approves it.
      id: 'approve_report',
      from: 'under_review',
      to: 'approved',
      by: ['regulator'],
      label: 'Approve report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ jse_approved_at: isoUtc(at) }),
    },
    {
      id: 'publish',
      from: 'approved',
      to: 'published',
      by: ['issuer', 'regulator'],
      label: 'Publish report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ published_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_report',
      from: ['submitted_jse', 'under_review', 'queries_raised'],
      to: 'rejected',
      by: ['regulator', 'system'],
      label: 'Reject report',
      intent: 'destructive',
      requiresReason: ['material_misstatement', 'ineligible_allocation', 'review_deficient', 'non_responsive'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['period_open', 'data_gathering', 'impact_calculated', 'external_review', 'board_approval'],
      to: 'withdrawn',
      by: ['issuer'],
      label: 'Withdraw report',
      intent: 'destructive',
      requiresReason: ['bond_redeemed', 'restated', 'consolidated', 'no_longer_required'],
      guards: [],
    },
  ],

  // queries-raised response time-bar: an unanswered JSE query stales the filing.
  // record-only stub; the sweep computes the real bar off the state sla days.
  timers: [{ onState: 'queries_raised', after: { days: 30 }, fire: 'reject_report', kind: 'time_bar', reason: 'non_responsive' }],
};
