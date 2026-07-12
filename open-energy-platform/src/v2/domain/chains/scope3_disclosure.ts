// scope3_disclosure — GHG Scope 3 value-chain emissions disclosure as data.
//
// A reporting entity (carbon fund) sets category boundaries → collects supplier
// data → calculates emissions → has them independently assured → files the
// disclosure with a registry (CDP / JSE / ISSB / SA Climate Registry).
//
// The integrity spine is STRUCTURAL: file_disclosure leaves ONLY
// assurance_complete, and the ONLY path into assurance_complete is
// complete_assurance (from assurance_submitted). So a disclosure can NEVER be
// filed on figures an assurance provider hasn't signed off — no guard needed,
// the state graph enforces it. Filing additionally needs a completeness
// sign-off ref (completenessEvidencePresent) so an empty pack can't be filed.
//
// If the assurer cannot give a clean opinion they qualify_assurance out to a
// terminal assurance_qualified — a disclosure that never becomes filed.
//
// settles:false — a disclosure is a reporting/assurance control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure data-quality bucketing off primary-data coverage (0..100). No clock/env.
const dataQualityTier = (pct: Json | undefined): string => {
  if (typeof pct !== 'number') return 'unassessed';
  if (pct >= 60) return 'primary_led';
  if (pct >= 20) return 'blended';
  return 'spend_based';
};

export const scope3Disclosure: ChainDecl = {
  key: 'scope3_disclosure',
  noun: 'Scope 3 disclosure',
  refPrefix: 'SD',
  title: (f) =>
    `Scope 3 disclosure — ${(f.entity_name as string) ?? 'entity'} FY${(f.reporting_year as number) ?? '—'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'GHG Protocol', provision: 'Corporate Value Chain (Scope 3) Standard', effect: 'requires' },
    { instrument: 'IFRS S2 (ISSB)', provision: 'financed & value-chain emissions disclosure', effect: 'requires' },
    { instrument: 'King IV', provision: 'integrated sustainability reporting', effect: 'requires' },
  ],
  roles: ['reporter', 'assurer', 'regulator', 'operator'],

  fields: {
    entity_name: { type: 'string', required: true, label: 'Reporting entity' },
    reporting_year: { type: 'number', required: true, label: 'Reporting year' },
    s3_tier: { type: 'string', label: 'Tier (micro/standard/comprehensive/full_chain)' },
    reporting_framework: { type: 'string', label: 'Framework (ghg_protocol/issb_ifrs_s2/cdp/tcfd/king_iv)' },
    reporter_party: { type: 'party', role: 'reporter', label: 'Reporting entity' },
    assurer_party: { type: 'party', role: 'assurer', label: 'Assurance provider' },
    // category scope
    category_count: { type: 'number', min: 0, max: 15, label: 'Categories in scope' },
    category_list: { type: 'string', label: 'Category numbers (1-15, comma-separated)' },
    // data collection
    supplier_responses: { type: 'number', min: 0, label: 'Supplier data responses' },
    primary_data_coverage_pct: { type: 'number', min: 0, max: 100, label: 'Primary-data coverage %' },
    spend_based_pct: { type: 'number', min: 0, max: 100, label: 'Spend-based %' },
    data_quality_tier: { type: 'string', label: 'Data-quality tier' },
    // calculation
    scope3_total_tco2e: { type: 'number', min: 0, label: 'Scope 3 total (tCO2e)' },
    // assurance
    assurance_provider: { type: 'string', label: 'Assurance provider' },
    assurance_standard: { type: 'string', label: 'Standard (ISAE 3000 / ISO 14064-3 / AA1000AS)' },
    assurance_type: { type: 'string', label: 'Assurance level (limited/reasonable)' },
    // filing
    filing_platform: { type: 'string', label: 'Filing platform' },
    filing_ref: { type: 'string', label: 'Filing reference' },
    completeness_ref: { type: 'string', label: 'Completeness sign-off ref' },
    // written by derive, never by the client
    categories_set_at: { type: 'string', label: 'Categories set at' },
    data_collection_opened_at: { type: 'string', label: 'Data collection opened at' },
    data_collection_closed_at: { type: 'string', label: 'Data collection closed at' },
    calculations_completed_at: { type: 'string', label: 'Calculations completed at' },
    review_completed_at: { type: 'string', label: 'Review completed at' },
    assurance_completed_at: { type: 'string', label: 'Assurance completed at' },
    filing_submitted_at: { type: 'string', label: 'Filing submitted at' },
  },

  initial: 'scope3_initiated',

  states: {
    scope3_initiated: { label: 'Initiated', terminal: false, holder: 'reporter', sla: { days: 7 } },
    category_boundaries_set: { label: 'Category boundaries set', terminal: false, holder: 'reporter', sla: { days: 7 } },
    data_collection_open: { label: 'Data collection open', terminal: false, holder: 'reporter', sla: { days: 60 } },
    data_collection_complete: { label: 'Data collection complete', terminal: false, holder: 'reporter', sla: { days: 14 } },
    emission_calculations: { label: 'Emission calculations', terminal: false, holder: 'reporter', sla: { days: 14 } },
    calculations_reviewed: { label: 'Calculations reviewed', terminal: false, holder: 'reporter', sla: { days: 7 } },
    assurance_submitted: { label: 'Assurance submitted', terminal: false, holder: 'assurer', sla: { days: 30 } },
    assurance_complete: { label: 'Assurance complete', terminal: false, holder: 'reporter', sla: { days: 14 } },
    disclosure_filed: { label: 'Disclosure filed', terminal: true, holder: 'none' },
    assurance_qualified: { label: 'Assurance qualified', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'scope3_initiated',
      by: ['reporter', 'operator'],
      actorBecomes: 'reporter',
      label: 'Initiate disclosure',
      intent: 'primary',
      input: {
        entity_name: { type: 'string', required: true },
        reporting_year: { type: 'number', required: true },
        s3_tier: { type: 'string' },
        reporting_framework: { type: 'string' },
        assurer_party: { type: 'party', role: 'assurer' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'set_boundaries',
      from: 'scope3_initiated',
      to: 'category_boundaries_set',
      by: ['reporter', 'operator'],
      label: 'Set category boundaries',
      intent: 'primary',
      input: { category_count: { type: 'number', required: true, min: 0, max: 15 }, category_list: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ categories_set_at: isoUtc(at) }),
    },
    {
      id: 'open_data_collection',
      from: 'category_boundaries_set',
      to: 'data_collection_open',
      by: ['reporter', 'operator'],
      label: 'Open data collection',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ data_collection_opened_at: isoUtc(at) }),
    },
    {
      id: 'close_data_collection',
      from: 'data_collection_open',
      to: 'data_collection_complete',
      by: ['reporter', 'operator'],
      label: 'Close data collection',
      intent: 'primary',
      input: {
        supplier_responses: { type: 'number', min: 0 },
        primary_data_coverage_pct: { type: 'number', min: 0, max: 100 },
        spend_based_pct: { type: 'number', min: 0, max: 100 },
      },
      guards: [],
      derive: (f, at: Instant) => ({
        data_collection_closed_at: isoUtc(at),
        data_quality_tier: dataQualityTier(f.primary_data_coverage_pct),
      }),
    },
    {
      id: 'calculate_emissions',
      from: 'data_collection_complete',
      to: 'emission_calculations',
      by: ['reporter', 'operator'],
      label: 'Calculate emissions',
      intent: 'primary',
      input: { scope3_total_tco2e: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ calculations_completed_at: isoUtc(at) }),
    },
    {
      id: 'review_calculations',
      from: 'emission_calculations',
      to: 'calculations_reviewed',
      by: ['reporter', 'operator'],
      label: 'Review calculations',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ review_completed_at: isoUtc(at) }),
    },
    {
      id: 'submit_for_assurance',
      from: 'calculations_reviewed',
      to: 'assurance_submitted',
      by: ['reporter'],
      label: 'Submit for assurance',
      intent: 'primary',
      input: { assurance_provider: { type: 'string', required: true }, assurance_standard: { type: 'string' } },
      guards: [],
    },
    {
      // the ONLY edge into assurance_complete — an independent assurer signs the
      // figures. file_disclosure can only leave here, so nothing files unassured.
      id: 'complete_assurance',
      from: 'assurance_submitted',
      to: 'assurance_complete',
      by: ['assurer'],
      label: 'Complete assurance',
      intent: 'primary',
      input: { assurance_type: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ assurance_completed_at: isoUtc(at) }),
    },
    {
      // structural integrity gate: the ONLY edge to disclosure_filed, only from
      // assurance_complete — a disclosure cannot be filed without completed
      // assurance. Filing also needs a completeness sign-off ref.
      id: 'file_disclosure',
      from: 'assurance_complete',
      to: 'disclosure_filed',
      by: ['reporter'],
      label: 'File disclosure',
      intent: 'primary',
      input: {
        filing_platform: { type: 'string', required: true },
        filing_ref: { type: 'string' },
        // enforced by completenessEvidencePresent (not required:), so an absent
        // ref surfaces MISSING_COMPLETENESS_EVIDENCE rather than a generic BAD_INPUT.
        completeness_ref: { type: 'string' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ filing_submitted_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'qualify_assurance',
      from: 'assurance_submitted',
      to: 'assurance_qualified',
      by: ['assurer'],
      label: 'Qualify assurance opinion',
      intent: 'destructive',
      requiresReason: ['scope_limitation', 'material_misstatement', 'insufficient_evidence', 'data_quality_inadequate'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: [
        'scope3_initiated',
        'category_boundaries_set',
        'data_collection_open',
        'data_collection_complete',
        'emission_calculations',
        'calculations_reviewed',
      ],
      to: 'withdrawn',
      by: ['reporter'],
      label: 'Withdraw disclosure',
      intent: 'destructive',
      requiresReason: ['reporting_deferred', 'restructure', 'framework_change', 'no_longer_required'],
      guards: [],
    },
  ],

  // data-collection window time-bar: an open collection cannot stay open forever
  // (the reporting year closes). record-only stub; the sweep computes the real
  // bar off the state sla days (permit_to_work pattern).
  timers: [{ onState: 'data_collection_open', after: { days: 0 }, fire: 'close_data_collection', kind: 'time_bar' }],
};
