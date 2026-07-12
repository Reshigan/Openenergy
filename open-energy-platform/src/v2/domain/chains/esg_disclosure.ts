// esg_disclosure — sustainability / ESG disclosure lifecycle as data.
//
// A preparer (reporting entity) compiles an ESG disclosure for a reporting
// period, runs internal review → external assurance → board approval →
// publication/filing (JSE-SRL Sustainability & Climate Disclosure). The
// assurance spine is STRUCTURAL, not a guard: publish leaves ONLY board_review,
// and the only path into board_review is assurance_complete (from
// under_assurance). So a disclosure can NEVER be published before an external
// assurer has signed off and the board has approved — the state graph enforces
// it. No guard can be bypassed because there is no unguarded edge into publish.
//
// One guard: submit_for_review requires a named completeness-evidence ref
// (completenessEvidencePresent) — you cannot advance an incomplete data set.
//
// settles:false — a disclosure is a regulatory statement, never a payment
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure emissions-materiality bucketing off total tCO2e. No clock, no env.
const emissionsTier = (total: Json | undefined): string => {
  if (typeof total !== 'number') return 'unquantified';
  if (total >= 50_000) return 'high';
  if (total >= 5_000) return 'medium';
  return 'low';
};

const totalEmissions = (f: Record<string, Json>): number =>
  (typeof f.scope1_tco2e === 'number' ? f.scope1_tco2e : 0) +
  (typeof f.scope2_tco2e === 'number' ? f.scope2_tco2e : 0);

export const esgDisclosure: ChainDecl = {
  key: 'esg_disclosure',
  noun: 'ESG disclosure',
  refPrefix: 'ED',
  title: (f) =>
    `${(f.framework as string) ?? 'ESG'} disclosure — ${(f.entity_name as string) ?? 'unnamed entity'} (${(f.reporting_period as string) ?? 'period'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'JSE-SRL', provision: 'Sustainability & Climate Disclosure Guidance', effect: 'requires' },
    { instrument: 'Carbon Tax Act 2019', provision: 's6 GHG emissions reporting', effect: 'requires' },
  ],
  roles: ['preparer', 'assurer', 'board', 'regulator'],

  fields: {
    disclosure_ref: { type: 'string', label: 'Disclosure reference' },
    preparer_party: { type: 'party', role: 'preparer', label: 'Preparer' },
    assurer_party: { type: 'party', role: 'assurer', label: 'External assurer' },
    board_party: { type: 'party', role: 'board', label: 'Board / audit committee' },
    entity_name: { type: 'string', required: true, label: 'Reporting entity' },
    reporting_period: { type: 'string', required: true, label: 'Reporting period' },
    framework: { type: 'string', required: true, label: 'Framework (JSE-SRL/GRI/TCFD/ISSB)' },
    scope1_tco2e: { type: 'number', min: 0, label: 'Scope 1 (tCO2e)' },
    scope2_tco2e: { type: 'number', min: 0, label: 'Scope 2 (tCO2e)' },
    energy_mwh: { type: 'number', min: 0, label: 'Energy consumed (MWh)' },
    completeness_ref: { type: 'string', label: 'Completeness-evidence ref' },
    assurance_opinion: { type: 'string', label: 'Assurance opinion (reasonable/limited/adverse)' },
    assurance_ref: { type: 'string', label: 'Assurance report ref' },
    revision_count: { type: 'number', label: 'Times returned for revision' },
    // written by derive, never by the client
    total_emissions_tco2e: { type: 'number', label: 'Total emissions (tCO2e)' },
    emissions_tier: { type: 'string', label: 'Emissions materiality tier' },
    submitted_at: { type: 'string', label: 'Submitted for review at' },
    assured_at: { type: 'string', label: 'Assurance completed at' },
    published_at: { type: 'string', label: 'Published at' },
  },

  initial: 'data_collection',

  states: {
    data_collection: { label: 'Data collection', terminal: false, holder: 'preparer', sla: { days: 30 } },
    internal_review: { label: 'Internal review', terminal: false, holder: 'preparer', sla: { days: 10 } },
    under_assurance: { label: 'Under external assurance', terminal: false, holder: 'assurer', sla: { days: 21 } },
    board_review: { label: 'Board review', terminal: false, holder: 'board', sla: { days: 14 } },
    published: { label: 'Published', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'data_collection',
      by: ['preparer'],
      actorBecomes: 'preparer',
      label: 'Open disclosure',
      intent: 'primary',
      input: {
        entity_name: { type: 'string', required: true },
        reporting_period: { type: 'string', required: true },
        framework: { type: 'string', required: true },
        scope1_tco2e: { type: 'number', min: 0 },
        scope2_tco2e: { type: 'number', min: 0 },
        energy_mwh: { type: 'number', min: 0 },
        assurer_party: { type: 'party', role: 'assurer' },
        board_party: { type: 'party', role: 'board' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'submit_for_review',
      from: 'data_collection',
      to: 'internal_review',
      by: ['preparer'],
      label: 'Submit for internal review',
      intent: 'primary',
      // an incomplete data set cannot advance: the guard (not a required-field
      // check) enforces a named completeness ref, so its absence is a domain
      // rejection (MISSING_COMPLETENESS_EVIDENCE), not a plain field error.
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (f, at: Instant) => ({
        total_emissions_tco2e: totalEmissions(f),
        emissions_tier: emissionsTier(totalEmissions(f)),
        submitted_at: isoUtc(at),
      }),
    },
    {
      id: 'submit_for_assurance',
      from: 'internal_review',
      to: 'under_assurance',
      by: ['preparer'],
      label: 'Submit for external assurance',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'assurance_complete',
      from: 'under_assurance',
      to: 'board_review',
      by: ['assurer'],
      label: 'Complete assurance',
      intent: 'primary',
      input: { assurance_opinion: { type: 'string', required: true }, assurance_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ assured_at: isoUtc(at) }),
    },
    {
      // structural assurance gate: the ONLY edge into published, and it can only
      // fire from board_review — which only assurance_complete reaches. A
      // disclosure therefore cannot publish without external assurance + board
      // sign-off. No guard needed; the graph is the control.
      id: 'publish',
      from: 'board_review',
      to: 'published',
      by: ['board'],
      label: 'Approve & publish',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ published_at: isoUtc(at) }),
    },
    {
      id: 'return_for_revision',
      from: ['under_assurance', 'board_review'],
      to: 'internal_review',
      by: ['assurer', 'board'],
      label: 'Return for revision',
      intent: 'secondary',
      requiresReason: ['data_inconsistency', 'scope_gap', 'methodology_error', 'insufficient_evidence'],
      guards: [],
      derive: (f, _at: Instant) => ({ revision_count: (typeof f.revision_count === 'number' ? f.revision_count : 0) + 1 }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: ['internal_review', 'under_assurance', 'board_review'],
      to: 'rejected',
      by: ['board', 'regulator'],
      label: 'Reject disclosure',
      intent: 'destructive',
      requiresReason: ['adverse_assurance_opinion', 'material_misstatement', 'framework_non_conformance', 'governance_failure'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['data_collection', 'internal_review'],
      to: 'withdrawn',
      by: ['preparer'],
      label: 'Withdraw disclosure',
      intent: 'destructive',
      requiresReason: ['period_restated', 'entity_restructure', 'superseded', 'no_longer_required'],
      guards: [],
    },
  ],

  // filing-deadline time-bar: a disclosure stuck at board review past the
  // regulatory filing window is a compliance failure. record-only stub; the
  // sweep computes the real bar off the state sla days (ppa_contract pattern).
  timers: [{ onState: 'board_review', after: { days: 0 }, fire: 'reject', kind: 'time_bar' }],
};
