// green_bond_report — annual green-bond impact/allocation report lifecycle, as
// data. An IPP developer who has issued a JSE-listed green bond must, each
// reporting year, gather impact data (energy generated, carbon avoided, green
// capex deployed), have it externally reviewed (second-party opinion /
// certification / verification / rating), get board sign-off, and lodge the
// report with the JSE. The JSE may raise queries (answered in place) or flag
// a deficiency (a remediation loop back into review) before final approval
// and publication.
//
// Structural honesty (no invented guards):
//  - `published` is only reachable from `approved`, and the only edge into
//    `approved` is `jse_approve` — so a report can never be published without
//    a live JSE approval on file, no guard required.
//  - `jse_approve` and `publish` (the two regulatory-disclosure steps) are
//    guarded by complianceHaltClear: a platform-wide compliance halt blocks
//    new approvals/disclosures, matching how ccp_assessment gates admission.
//  - `board_approve` deliberately keeps the txn in `board_approval` (it
//    records the resolution ref only) — the real phase change into JSE hands
//    is `submit_to_jse`, which also folds in the "JSE begins review" step: v1
//    tracked `submitted_jse` and `under_review` as two statuses with no
//    action between them, so v2 collapses them into one `under_review` state
//    (see notes returned with this module).
//  - `reject`'s reason codes replace v1's free-text `rejection_reason` field,
//    consistent with every other terminal-rejection edge in this domain.
//
// settles:false — this is a disclosure/compliance reporting chain (JSE-SRL
// impact reporting). issuance_size_zar is context on the underlying bond, not
// a quantum this chain moves (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const greenBondReport: ChainDecl = {
  key: 'green_bond_report',
  noun: 'Green bond report',
  refPrefix: 'GBR',
  title: (f) => `Green bond report — ${(f.report_year as string) ?? 'FY?'}`,
  visibility: 'owner',
  settles: false,
  legalBasis: [
    { instrument: 'JSE Debt Listings Requirements — Sustainability Segment', provision: 'green bond framework: annual allocation & impact reporting', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'operator'],

  fields: {
    report_year: { type: 'string', required: true, label: 'Report year' },
    issuance_size_zar: { type: 'number', required: true, min: 0, label: 'Issuance size (ZAR)' },
    kwh_generated: { type: 'number', min: 0, label: 'kWh generated' },
    carbon_avoided_tco2e: { type: 'number', min: 0, label: 'Carbon avoided (tCO2e)' },
    green_capex_deployed_zar: { type: 'number', min: 0, label: 'Green capex deployed (ZAR)' },
    external_reviewer: { type: 'string', label: 'External reviewer' },
    review_type: { type: 'string', label: 'Review type (second_party/certification/verification/rating)' },
    review_ref: { type: 'string', label: 'Review ref' },
    board_resolution_ref: { type: 'string', label: 'Board resolution ref' },
    jse_submission_ref: { type: 'string', label: 'JSE submission ref' },
    deficiency_description: { type: 'string', label: 'Deficiency description' },
    // written by derive, never by the client
    period_opened_at: { type: 'string', label: 'Period opened at' },
  },

  initial: 'period_open',

  states: {
    period_open: { label: 'Period open', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    data_gathering: { label: 'Data gathering', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    impact_calculation: { label: 'Impact calculation', terminal: false, holder: 'ipp_developer', sla: { days: 15 } },
    external_review: { label: 'External review', terminal: false, holder: 'ipp_developer', sla: { days: 45 } },
    board_approval: { label: 'Board approval', terminal: false, holder: 'ipp_developer', sla: { days: 15 } },
    under_review: { label: 'Under JSE review', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    queries_raised: { label: 'JSE queries raised', terminal: false, holder: 'ipp_developer', sla: { days: 20 } },
    queries_responded: { label: 'Queries responded', terminal: false, holder: 'ipp_developer', sla: { days: 15 } },
    deficiency_noted: { label: 'Deficiency noted', terminal: false, holder: 'ipp_developer', sla: { days: 15 } },
    remediation: { label: 'In remediation', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    approved: { label: 'Approved', terminal: false, holder: 'ipp_developer' },
    published: { label: 'Published', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open_period',
      from: '@new',
      to: 'period_open',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Open reporting period',
      intent: 'primary',
      input: {
        report_year: { type: 'string', required: true },
        issuance_size_zar: { type: 'number', required: true, min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ period_opened_at: isoUtc(at) }),
    },
    {
      id: 'start_data_gathering',
      from: 'period_open',
      to: 'data_gathering',
      by: ['ipp_developer', 'operator'],
      label: 'Start data gathering',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'complete_impact_calc',
      from: 'data_gathering',
      to: 'impact_calculation',
      by: ['ipp_developer', 'operator'],
      label: 'Complete impact calculation',
      intent: 'primary',
      input: {
        kwh_generated: { type: 'number', min: 0 },
        carbon_avoided_tco2e: { type: 'number', min: 0 },
        green_capex_deployed_zar: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'submit_for_external_review',
      from: 'impact_calculation',
      to: 'external_review',
      by: ['ipp_developer', 'operator'],
      label: 'Submit for external review',
      intent: 'primary',
      input: {
        external_reviewer: { type: 'string' },
        review_type: { type: 'string' },
        review_ref: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'complete_external_review',
      from: 'external_review',
      to: 'board_approval',
      by: ['ipp_developer', 'operator'],
      label: 'Complete external review',
      intent: 'primary',
      guards: [],
    },
    {
      // annotation-only edge: records the resolution ref without leaving
      // board_approval — the real hand-off to the JSE is submit_to_jse.
      id: 'board_approve',
      from: 'board_approval',
      to: 'board_approval',
      by: ['ipp_developer', 'operator'],
      label: 'Board approve',
      intent: 'primary',
      input: { board_resolution_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'submit_to_jse',
      from: 'board_approval',
      to: 'under_review',
      by: ['ipp_developer', 'operator'],
      label: 'Submit to JSE',
      intent: 'primary',
      input: { jse_submission_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'jse_raises_queries',
      from: 'under_review',
      to: 'queries_raised',
      by: ['ipp_developer', 'operator'],
      label: 'JSE raises queries',
      intent: 'secondary',
      guards: [],
    },
    {
      id: 'respond_to_queries',
      from: 'queries_raised',
      to: 'queries_responded',
      by: ['ipp_developer', 'operator'],
      label: 'Respond to queries',
      intent: 'primary',
      guards: [],
    },
    {
      // the only door into `approved`, so publish (below) can never fire
      // without a live JSE approval — structural, no guard needed for that.
      id: 'jse_approve',
      from: ['under_review', 'queries_responded'],
      to: 'approved',
      by: ['ipp_developer', 'operator'],
      label: 'JSE approve',
      intent: 'primary',
      guards: ['complianceHaltClear'],
    },
    {
      id: 'publish',
      from: 'approved',
      to: 'published',
      by: ['ipp_developer', 'operator'],
      label: 'Publish',
      intent: 'primary',
      guards: ['complianceHaltClear'],
    },
    {
      id: 'note_deficiency',
      from: ['under_review', 'queries_responded'],
      to: 'deficiency_noted',
      by: ['ipp_developer', 'operator'],
      label: 'Note deficiency',
      intent: 'destructive',
      input: { deficiency_description: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'start_remediation',
      from: 'deficiency_noted',
      to: 'remediation',
      by: ['ipp_developer', 'operator'],
      label: 'Start remediation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'refile',
      from: 'remediation',
      to: 'under_review',
      by: ['ipp_developer', 'operator'],
      label: 'Refile',
      intent: 'primary',
      guards: [],
    },
    {
      // 'system' + no required input lets the stalled-review timer below fire
      // this edge; the human path still carries its own reason code.
      id: 'reject',
      from: ['board_approval', 'under_review', 'queries_responded'],
      to: 'rejected',
      by: ['ipp_developer', 'operator', 'system'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['incomplete_disclosure', 'impact_metrics_not_verified', 'non_compliant_framework', 'board_resolution_missing', 'jse_review_stalled'],
      guards: [],
    },
  ],

  // a report left sitting with the JSE (queries unanswered, review stalled)
  // past two reporting-cycle-relevant months time-bars into rejection rather
  // than staying in limbo indefinitely.
  timers: [{ onState: 'under_review', after: { days: 60 }, fire: 'reject', kind: 'time_bar', reason: 'jse_review_stalled' }],
};
