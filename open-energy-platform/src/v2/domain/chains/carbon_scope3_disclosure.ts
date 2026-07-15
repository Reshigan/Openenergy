// carbon_scope3_disclosure — GHG Protocol Scope 3 (value-chain) emissions
// disclosure lifecycle as data.
//
// A reporting entity (carbon_fund lane) scopes its Scope 3 category boundaries,
// opens data collection with value-chain partners, runs the GHG Protocol
// calculations, completes an internal review, and submits the inventory for
// third-party assurance. Assurance can land as a clean limited opinion (which
// may proceed straight to filing or escalate to reasonable assurance) or as a
// qualified opinion on a material misstatement — a dead end that never reaches
// filing.
//
// Structural honesty (no invented guards):
//  - file_disclosure is reachable ONLY from limited_assurance_issued or
//    reasonable_assurance_issued — so a disclosure can NEVER be filed without
//    at least a limited third-party assurance opinion on record. No guard
//    needed; the state graph enforces the assurance gate.
//  - qualify_assurance is reachable from submitted_for_assurance or
//    limited_assurance_issued (a material misstatement can surface during
//    initial fieldwork or after a limited opinion, before reasonable
//    assurance is sought) and is a dead end — assurance_qualified is terminal,
//    matching the v1 descriptor's terminal set.
//  - none of the ten registry guards model "did GHG Protocol fieldwork happen"
//    — that's an operational fact the assurance provider attests to off-chain,
//    not a cross-participant business rule this engine can check. So every
//    edge here relies on the state graph alone (guards: []).
//
// settles:false — a Scope 3 disclosure is a climate-reporting record; it never
// moves money or quantum through settlement (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const carbonScope3Disclosure: ChainDecl = {
  key: 'carbon_scope3_disclosure',
  noun: 'Scope 3 disclosure',
  refPrefix: 'S3D',
  title: (f) =>
    `Scope 3 disclosure — ${(f.entity_name as string) ?? 'unnamed entity'} (${
      f.reporting_year != null ? String(f.reporting_year) : 'year TBC'
    })`,
  visibility: 'party',
  settles: false,
  roles: ['carbon_fund', 'offtaker', 'regulator', 'operator'],

  fields: {
    entity_name: { type: 'string', required: true, label: 'Reporting entity' },
    entity_party: { type: 'party', role: 'offtaker', label: 'Reporting entity party' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    s3_tier: { type: 'string', label: 'Tier (standard/enhanced/comprehensive)' },
    reporting_year: { type: 'number', label: 'Reporting year' },
    reporting_framework: { type: 'string', label: 'Framework (e.g. IFRS S2 / CDP)' },
    category_count: { type: 'number', min: 0, label: 'Category count' },
    category_list: { type: 'string', label: 'Category list (pipe-delimited)' },
    primary_data_coverage_pct: { type: 'number', min: 0, max: 100, label: 'Primary-data coverage %' },
    scope3_total_tco2e: { type: 'number', min: 0, label: 'Scope 3 total (tCO2e)' },
    assurance_provider: { type: 'string', label: 'Assurance provider' },
    assurance_standard: { type: 'string', label: 'Assurance standard (e.g. ISAE 3410 / AA1000)' },
    qualified_opinion_reason: { type: 'string', label: 'Qualification detail' },
    filing_platform: { type: 'string', label: 'Filing platform' },
    filing_ref: { type: 'string', label: 'Filing ref' },
    // written by derive, never by the client
    opened_at: { type: 'string', label: 'Opened at' },
    data_collection_closed_at: { type: 'string', label: 'Data collection closed at' },
    internally_reviewed_at: { type: 'string', label: 'Internally reviewed at' },
    assurance_submitted_at: { type: 'string', label: 'Submitted for assurance at' },
    assurance_issued_at: { type: 'string', label: 'Assurance issued at' },
    qualified_at: { type: 'string', label: 'Assurance qualified at' },
    filed_at: { type: 'string', label: 'Filed at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'scoping',

  states: {
    scoping: { label: 'Scoping categories', terminal: false, holder: 'carbon_fund', sla: { days: 15 } },
    categories_set: { label: 'Categories set', terminal: false, holder: 'carbon_fund', sla: { days: 5 } },
    data_collection_open: { label: 'Data collection open', terminal: false, holder: 'carbon_fund', sla: { days: 45 } },
    data_collection_closed: { label: 'Data collection closed', terminal: false, holder: 'carbon_fund', sla: { days: 10 } },
    calculations_complete: { label: 'Calculations complete', terminal: false, holder: 'carbon_fund', sla: { days: 10 } },
    internally_reviewed: { label: 'Internally reviewed', terminal: false, holder: 'carbon_fund', sla: { days: 10 } },
    submitted_for_assurance: { label: 'Submitted for assurance', terminal: false, holder: 'carbon_fund', sla: { days: 30 } },
    limited_assurance_issued: { label: 'Limited assurance issued', terminal: false, holder: 'carbon_fund', sla: { days: 20 } },
    reasonable_assurance_issued: { label: 'Reasonable assurance issued', terminal: false, holder: 'carbon_fund', sla: { days: 10 } },
    disclosure_filed: { label: 'Disclosure filed', terminal: true, holder: 'none' },
    assurance_qualified: { label: 'Assurance qualified', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'scoping',
      by: ['carbon_fund', 'operator'],
      actorBecomes: 'carbon_fund',
      label: 'Open Scope 3 disclosure',
      intent: 'primary',
      input: {
        entity_name: { type: 'string', required: true },
        entity_party: { type: 'party', role: 'offtaker' },
        regulator_party: { type: 'party', role: 'regulator' },
        s3_tier: { type: 'string' },
        reporting_year: { type: 'number' },
        reporting_framework: { type: 'string' },
        category_count: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ opened_at: isoUtc(at) }),
    },
    {
      id: 'set_categories',
      from: 'scoping',
      to: 'categories_set',
      by: ['carbon_fund', 'operator'],
      label: 'Set categories',
      intent: 'primary',
      input: {
        category_count: { type: 'number', min: 0 },
        category_list: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'open_data_collection',
      from: 'categories_set',
      to: 'data_collection_open',
      by: ['carbon_fund', 'operator'],
      label: 'Open data collection',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'close_data_collection',
      from: 'data_collection_open',
      to: 'data_collection_closed',
      by: ['carbon_fund', 'operator'],
      label: 'Close data collection',
      intent: 'primary',
      input: { primary_data_coverage_pct: { type: 'number', min: 0, max: 100 } },
      guards: [],
      derive: (_f, at: Instant) => ({ data_collection_closed_at: isoUtc(at) }),
    },
    {
      id: 'run_calculations',
      from: 'data_collection_closed',
      to: 'calculations_complete',
      by: ['carbon_fund', 'operator'],
      label: 'Run calculations',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'complete_internal_review',
      from: 'calculations_complete',
      to: 'internally_reviewed',
      by: ['carbon_fund', 'operator'],
      label: 'Complete review',
      intent: 'primary',
      input: { scope3_total_tco2e: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ internally_reviewed_at: isoUtc(at) }),
    },
    {
      id: 'submit_for_assurance',
      from: 'internally_reviewed',
      to: 'submitted_for_assurance',
      by: ['carbon_fund', 'operator'],
      label: 'Submit for assurance',
      intent: 'primary',
      input: {
        assurance_provider: { type: 'string' },
        assurance_standard: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ assurance_submitted_at: isoUtc(at) }),
    },
    {
      id: 'issue_limited_assurance',
      from: 'submitted_for_assurance',
      to: 'limited_assurance_issued',
      by: ['carbon_fund', 'operator'],
      label: 'Issue limited assurance',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ assurance_issued_at: isoUtc(at) }),
    },
    {
      // optional escalation from a limited opinion to a reasonable one — the
      // v1 cascadeHint's "or escalate to reasonable assurance" branch.
      id: 'issue_reasonable_assurance',
      from: 'limited_assurance_issued',
      to: 'reasonable_assurance_issued',
      by: ['carbon_fund', 'operator'],
      label: 'Issue reasonable assurance',
      intent: 'secondary',
      input: {
        assurance_provider: { type: 'string' },
        assurance_standard: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ assurance_issued_at: isoUtc(at) }),
    },
    {
      // dead end: a material misstatement can surface during fieldwork or
      // after a limited opinion, before reasonable assurance is sought.
      id: 'qualify_assurance',
      from: ['submitted_for_assurance', 'limited_assurance_issued'],
      to: 'assurance_qualified',
      by: ['carbon_fund', 'operator', 'regulator'],
      label: 'Qualify assurance',
      intent: 'destructive',
      input: { qualified_opinion_reason: { type: 'string' } },
      requiresReason: [
        'material_misstatement',
        'scope_boundary_error',
        'data_quality_failure',
        'methodology_departure',
        'unresolved_estimation_uncertainty',
      ],
      guards: [],
      derive: (_f, at: Instant) => ({ qualified_at: isoUtc(at) }),
    },
    {
      // the ONLY door to filing — reachable from either assurance tier, never
      // from a still-unassured state.
      id: 'file_disclosure',
      from: ['limited_assurance_issued', 'reasonable_assurance_issued'],
      to: 'disclosure_filed',
      by: ['carbon_fund', 'operator'],
      label: 'File disclosure',
      intent: 'primary',
      input: {
        filing_platform: { type: 'string' },
        filing_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ filed_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: [
        'scoping',
        'categories_set',
        'data_collection_open',
        'data_collection_closed',
        'calculations_complete',
        'internally_reviewed',
        'submitted_for_assurance',
        'limited_assurance_issued',
        'reasonable_assurance_issued',
      ],
      to: 'withdrawn',
      by: ['carbon_fund', 'operator'],
      label: 'Withdraw disclosure',
      intent: 'destructive',
      requiresReason: [
        'entity_ceased_reporting',
        'scope_no_longer_material',
        'duplicate_disclosure',
        'regulatory_exemption_granted',
      ],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],
};
