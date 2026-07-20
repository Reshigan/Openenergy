// vcm_project_development — voluntary-carbon-market project development lifecycle
// as data: concept → PDD → validation (by an independent VVB) → registry admission.
//
// The credibility spine is STRUCTURAL, not a guard: register_project leaves ONLY
// validation_reported, and the ONLY path into validation_reported is
// report_validation from under_validation. So a project can NEVER be registered
// (and start issuing credits) before an independent validation opinion exists —
// the state graph forbids it. No guard needed for that invariant.
//
// One genuine guard fits: a strategic-scale project (capacity_mw ≥ 100) crossing
// into a registry is a NERSA-relevant grid event, so register_project is gated by
// regulatorPresentIfStrategic — a regulator must be a party before it registers.
//
// NO claim key. Project development is not consumption of a finite unique key
// (that's carbon_retirement's serial range); many projects use the same
// methodology. A claim would wrongly block the methodology forever.
//
// settles:false — registering a project is a regulatory/registry record, never a
// payment (R-S5-1). Credit settlement lives on carbon_issuance / carbon_retirement.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const vcmProjectDevelopment: ChainDecl = {
  key: 'vcm_project_development',
  noun: 'VCM project development',
  refPrefix: 'VPD',
  title: (f) =>
    `${(f.project_name as string) ?? 'unnamed project'} — ${(f.methodology as string) ?? 'no methodology'} (${(f.project_type as string) ?? 'unclassified'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'VCS Standard v4', provision: 'project validation & registration', effect: 'requires' },
    { instrument: 'Carbon Tax Act 2019', provision: 's13 offset allowance eligibility', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'strategic-scale generation oversight', effect: 'requires' },
  ],
  roles: ['developer', 'validator', 'registry', 'regulator'],

  fields: {
    project_ref: { type: 'string', label: 'Project ref' },
    developer_party: { type: 'party', role: 'developer', label: 'Project developer' },
    validator_party: { type: 'party', role: 'validator', label: 'Validation/verification body' },
    registry_party: { type: 'party', role: 'registry', label: 'Registry' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    project_name: { type: 'string', required: true, label: 'Project name' },
    project_type: { type: 'string', required: true, label: 'Type (renewable/afforestation/cookstove/…)' },
    methodology: { type: 'string', required: true, label: 'Methodology (e.g. VM0007)' },
    host_location: { type: 'string', required: true, label: 'Host location' },
    registry_name: { type: 'string', label: 'Registry (Verra/Gold Standard)' },
    capacity_mw: { type: 'number', min: 0, label: 'Project capacity (MW)' },
    estimated_annual_tco2e: { type: 'number', min: 0, label: 'Estimated annual tCO2e' },
    crediting_period_years: { type: 'number', min: 0, label: 'Crediting period (years)' },
    pdd_ref: { type: 'string', label: 'Project Design Document ref' },
    validation_opinion_ref: { type: 'string', label: 'Validation opinion ref' },
    registration_id: { type: 'string', label: 'Registry registration id' },
    // written by derive, never by the client
    validation_reported_at: { type: 'string', label: 'Validation reported at' },
    registered_at: { type: 'string', label: 'Registered at' },
  },

  initial: 'concept',

  states: {
    concept: { label: 'Project concept', terminal: false, holder: 'developer', sla: { days: 30 } },
    pdd_preparation: { label: 'PDD in preparation', terminal: false, holder: 'developer', sla: { days: 60 } },
    validation_requested: { label: 'Validation requested', terminal: false, holder: 'validator', sla: { days: 14 } },
    under_validation: { label: 'Under validation', terminal: false, holder: 'validator', sla: { days: 90 } },
    validation_reported: { label: 'Validation reported', terminal: false, holder: 'registry', sla: { days: 30 } },
    registered: { label: 'Registered', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'concept',
      by: ['developer'],
      actorBecomes: 'developer',
      label: 'Conceive project',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        project_type: { type: 'string', required: true },
        methodology: { type: 'string', required: true },
        host_location: { type: 'string', required: true },
        registry_name: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        estimated_annual_tco2e: { type: 'number', min: 0 },
        crediting_period_years: { type: 'number', min: 0 },
        validator_party: { type: 'party', role: 'validator' },
        registry_party: { type: 'party', role: 'registry' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'draft_pdd',
      from: 'concept',
      to: 'pdd_preparation',
      by: ['developer'],
      label: 'Begin PDD',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_for_validation',
      from: 'pdd_preparation',
      to: 'validation_requested',
      by: ['developer'],
      label: 'Submit for validation',
      intent: 'primary',
      input: { pdd_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'begin_validation',
      from: 'validation_requested',
      to: 'under_validation',
      by: ['validator'],
      label: 'Begin validation',
      intent: 'primary',
      guards: [],
    },
    {
      // the ONLY edge that produces a validation opinion. register_project can
      // only fire from validation_reported, and this is the only way to reach it.
      id: 'report_validation',
      from: 'under_validation',
      to: 'validation_reported',
      by: ['validator'],
      label: 'Report positive validation',
      intent: 'primary',
      input: { validation_opinion_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ validation_reported_at: isoUtc(at) }),
    },
    {
      // strategic-scale (≥100 MW) projects need a regulator on the txn to register.
      // Structurally reachable ONLY from validation_reported — no credible opinion,
      // no registration.
      id: 'register_project',
      from: 'validation_reported',
      to: 'registered',
      by: ['registry'],
      label: 'Register project',
      intent: 'primary',
      input: { registration_id: { type: 'string', required: true } },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ registered_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_project',
      from: ['validation_requested', 'under_validation', 'validation_reported'],
      to: 'rejected',
      by: ['validator', 'registry'],
      label: 'Reject project',
      intent: 'destructive',
      requiresReason: [
        'negative_validation_opinion',
        'methodology_ineligible',
        'additionality_not_demonstrated',
        'baseline_flawed',
        'documentation_incomplete',
        'double_counting_risk',
      ],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['concept', 'pdd_preparation', 'validation_requested', 'under_validation', 'validation_reported'],
      to: 'withdrawn',
      by: ['developer'],
      label: 'Withdraw project',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'funding_lost', 'rescoped', 'superseded'],
      guards: [],
    },
  ],
};
