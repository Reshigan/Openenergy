// poa_cpa_inclusion — CDM/Article-6 Component Project Activity inclusion, as data.
//
// A Programme of Activities (PoA) is an umbrella carbon programme; individual
// Component Project Activities (CPAs) are "included" into it over time. A
// coordinating/managing entity requests inclusion of a new CPA; it passes
// eligibility screening, then a Designated Operational Entity (DOE) validates
// it, and only then is it included.
//
// The integrity spine is STRUCTURAL: confirm_inclusion leaves ONLY doe_validation,
// and the ONLY path into doe_validation is accept_eligibility from
// eligibility_screening. So a CPA can NEVER be included without passing DOE
// validation — no guard needed, the state graph enforces it. confirm_inclusion
// additionally requires a named validation-completeness ref
// (completenessEvidencePresent) so an inclusion is never recorded on empty
// evidence — the double-count vector CDM inclusion review exists to close.
//
// settles:false — CPA inclusion is a registry/eligibility control, never a
// payment (R-S5-1). Issued credits settle on a different chain.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const poaCpaInclusion: ChainDecl = {
  key: 'poa_cpa_inclusion',
  noun: 'PoA CPA inclusion',
  refPrefix: 'PCI',
  title: (f) => `CPA inclusion — ${(f.cpa_name as string) ?? 'unnamed CPA'} into ${(f.poa_ref as string) ?? 'PoA'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'CDM Modalities & Procedures', provision: 'PoA CPA inclusion & DOE validation', effect: 'requires' },
    { instrument: 'Carbon Tax Act 2019', provision: 's13 offset eligibility', effect: 'requires' },
  ],
  roles: ['coordinator', 'validator', 'regulator', 'operator'],

  fields: {
    cpa_ref: { type: 'string', label: 'CPA reference' },
    cpa_name: { type: 'string', required: true, label: 'CPA name' },
    poa_ref: { type: 'string', required: true, label: 'PoA reference' },
    coordinator_party: { type: 'party', role: 'coordinator', label: 'Coordinating/managing entity' },
    validator_party: { type: 'party', role: 'validator', label: 'DOE (validator)' },
    technology_type: { type: 'string', label: 'Technology type' },
    methodology_ref: { type: 'string', label: 'Approved methodology ref' },
    host_location: { type: 'string', label: 'Host location' },
    estimated_annual_reductions_tco2e: { type: 'number', min: 0, label: 'Estimated annual reductions (tCO2e)' },
    eligibility_criteria_ref: { type: 'string', label: 'Eligibility-criteria ref' },
    completeness_ref: { type: 'string', label: 'Validation-completeness evidence ref' },
    // written by derive, never by the client
    eligibility_confirmed_at: { type: 'string', label: 'Eligibility confirmed at' },
    included_at: { type: 'string', label: 'Included at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
  },

  initial: 'inclusion_requested',

  states: {
    inclusion_requested: { label: 'Inclusion requested', terminal: false, holder: 'validator', sla: { hours: 24 } },
    eligibility_screening: { label: 'Eligibility screening', terminal: false, holder: 'validator', sla: { days: 5 } },
    doe_validation: { label: 'DOE validation', terminal: false, holder: 'validator', sla: { days: 30 } },
    included: { label: 'Included in PoA', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'inclusion_requested',
      by: ['coordinator', 'operator'],
      actorBecomes: 'coordinator',
      label: 'Request CPA inclusion',
      intent: 'primary',
      input: {
        cpa_ref: { type: 'string' },
        cpa_name: { type: 'string', required: true },
        poa_ref: { type: 'string', required: true },
        technology_type: { type: 'string' },
        methodology_ref: { type: 'string' },
        host_location: { type: 'string' },
        estimated_annual_reductions_tco2e: { type: 'number', min: 0 },
        validator_party: { type: 'party', role: 'validator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_screening',
      from: 'inclusion_requested',
      to: 'eligibility_screening',
      by: ['validator', 'operator'],
      label: 'Begin eligibility screening',
      intent: 'primary',
      input: { eligibility_criteria_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      // structural gate: the ONLY path into doe_validation. Combined with
      // confirm_inclusion (whose only `from` is doe_validation) this makes DOE
      // validation an unskippable predecessor of inclusion.
      id: 'accept_eligibility',
      from: 'eligibility_screening',
      to: 'doe_validation',
      by: ['validator', 'operator'],
      label: 'Accept eligibility, refer to DOE',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ eligibility_confirmed_at: isoUtc(at) }),
    },
    {
      // structural integrity gate: the ONLY edge into `included`, and it can only
      // fire from doe_validation — a CPA therefore cannot be included before DOE
      // validation. The completeness ref guard blocks inclusion on empty evidence.
      id: 'confirm_inclusion',
      from: 'doe_validation',
      to: 'included',
      by: ['validator'],
      label: 'Confirm inclusion',
      intent: 'primary',
      // presence enforced by the guard (min length), not `required`, so the
      // guard's MISSING_COMPLETENESS_EVIDENCE surfaces rather than BAD_INPUT.
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ included_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_inclusion',
      from: ['inclusion_requested', 'eligibility_screening', 'doe_validation'],
      to: 'rejected',
      by: ['validator', 'regulator', 'system'],
      label: 'Reject inclusion',
      intent: 'destructive',
      requiresReason: ['additionality_failed', 'methodology_ineligible', 'double_counting_risk', 'evidence_inadequate', 'validation_window_expired'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['inclusion_requested', 'eligibility_screening'],
      to: 'withdrawn',
      by: ['coordinator'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'rescoped', 'no_longer_eligible'],
      guards: [],
    },
  ],

  // DOE validation review window: a referral unvalidated 90 days out (triple the
  // 30-day state sla) stales out to a rejection.
  timers: [{ onState: 'doe_validation', after: { days: 90 }, fire: 'reject_inclusion', kind: 'time_bar', reason: 'validation_window_expired' }],
};
