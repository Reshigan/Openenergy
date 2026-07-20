// carbon_registration — carbon project registration lifecycle as data.
//
// A project proponent lodges a mitigation project against a carbon registry
// (VCS / Gold Standard / SA national registry). The registry runs completeness →
// third-party validation → registry review → registration decision → register.
// The completeness sign-off (accept_completeness) is guarded: no acceptance
// without a named completeness-evidence ref (completenessEvidencePresent).
//
// Structural integrity gate: a project can NEVER be registered before its
// third-party validation is complete. issue_registration leaves ONLY
// registration_approved, and the only path into registration_approved is
// approve_registration from registry_review — which only complete_validation
// reaches. So issuing off an unvalidated project is an ILLEGAL_TRANSITION, no
// guard needed; the state graph is the control. This is what stops a registry
// from minting a credit-bearing project that was never independently validated.
//
// NO claim key. Registration is entry-gate exclusivity but WHILE-ACTIVE, not
// permanent: a lapsed registration frees the project to re-register. A permanent
// claim (carbon_retirement pattern) would wrongly block re-registration forever.
// While-active exclusivity needs a claim+release mechanism the domain does not
// yet model — deliberately out of scope (same call as licence_application).
//
// settles:false — registration is a regulatory/registry act, not a payment. No
// custody, no money moves here (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure lifetime-credit estimate off the two carried numeric fields. No clock.
const totalEstimatedTco2e = (annual: Json | undefined, years: Json | undefined): number => {
  if (typeof annual !== 'number' || typeof years !== 'number') return 0;
  return annual * years;
};

export const carbonRegistration: ChainDecl = {
  key: 'carbon_registration',
  noun: 'Carbon project registration',
  refPrefix: 'CR',
  title: (f) => `${(f.project_type as string) ?? 'mitigation'} project — ${(f.project_name as string) ?? 'unnamed project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act 2019', provision: 's13 offset allowance / project registration', effect: 'requires' },
    { instrument: 'Paris Agreement Art. 6.4', provision: 'mechanism registry & validation', effect: 'authorises' },
  ],
  roles: ['proponent', 'validator', 'registry', 'operator'],

  fields: {
    registration_id: { type: 'string', label: 'Registration id' },
    project_name: { type: 'string', required: true, label: 'Project name' },
    project_type: { type: 'string', required: true, label: 'Type (afforestation/renewable/methane/cookstove)' },
    methodology: { type: 'string', required: true, label: 'Methodology' },
    registry_name: { type: 'string', required: true, label: 'Registry' },
    location: { type: 'string', label: 'Location' },
    estimated_annual_tco2e: { type: 'number', min: 0, label: 'Estimated annual tCO2e' },
    crediting_period_years: { type: 'number', min: 0, label: 'Crediting period (years)' },
    total_estimated_tco2e: { type: 'number', label: 'Total estimated tCO2e over period' },
    proponent_party: { type: 'party', role: 'proponent', label: 'Project proponent' },
    validator_party: { type: 'party', role: 'validator', label: 'Validation body' },
    registry_party: { type: 'party', role: 'registry', label: 'Registry' },
    validation_report_ref: { type: 'string', label: 'Validation report ref' },
    // written by derive, never by the client
    validated_at: { type: 'string', label: 'Validated at' },
    approved_at: { type: 'string', label: 'Approved at' },
    registered_at: { type: 'string', label: 'Registered at' },
  },

  initial: 'project_submitted',

  states: {
    project_submitted: { label: 'Project submitted', terminal: false, holder: 'registry', sla: { days: 5 } },
    completeness_review: { label: 'Completeness review', terminal: false, holder: 'registry', sla: { days: 30 } },
    info_requested: { label: 'Additional info requested', terminal: false, holder: 'proponent', sla: { days: 60 } },
    validation: { label: 'Under validation', terminal: false, holder: 'validator', sla: { days: 90 } },
    registry_review: { label: 'Registry review', terminal: false, holder: 'registry', sla: { days: 30 } },
    registration_approved: { label: 'Registration approved', terminal: false, holder: 'registry', sla: { days: 14 } },
    registered: { label: 'Registered', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'project_submitted',
      by: ['proponent', 'operator'],
      actorBecomes: 'proponent',
      label: 'Submit project',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        project_type: { type: 'string', required: true },
        methodology: { type: 'string', required: true },
        registry_name: { type: 'string', required: true },
        location: { type: 'string' },
        estimated_annual_tco2e: { type: 'number', min: 0 },
        crediting_period_years: { type: 'number', min: 0 },
        validator_party: { type: 'party', role: 'validator' },
        registry_party: { type: 'party', role: 'registry' },
      },
      guards: ['complianceHaltClear'],
      derive: (f, _at: Instant) => ({ total_estimated_tco2e: totalEstimatedTco2e(f.estimated_annual_tco2e, f.crediting_period_years) }),
    },

    { id: 'begin_review', from: 'project_submitted', to: 'completeness_review', by: ['registry'], label: 'Begin completeness review', intent: 'primary', guards: [] },
    {
      id: 'request_info',
      from: 'completeness_review',
      to: 'info_requested',
      by: ['registry'],
      label: 'Request additional information',
      intent: 'secondary',
      requiresReason: ['incomplete_pdd', 'baseline_unclear', 'additionality_evidence_missing', 'stakeholder_consultation_gap'],
      guards: [],
    },
    { id: 'submit_info', from: 'info_requested', to: 'completeness_review', by: ['proponent'], label: 'Submit requested information', intent: 'primary', input: { completeness_ref: { type: 'string', required: true } }, guards: [] },
    {
      id: 'accept_completeness',
      from: 'completeness_review',
      to: 'validation',
      by: ['registry'],
      label: 'Accept & send to validation',
      intent: 'primary',
      // NOT required at coercion — completenessEvidencePresent IS the check, so a
      // missing ref surfaces the domain reason code, not a generic BAD_INPUT.
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
    },
    {
      // third-party validation body signs off — the only path out of validation
      // into registry_review, and the only route toward registration.
      id: 'complete_validation',
      from: 'validation',
      to: 'registry_review',
      by: ['validator'],
      label: 'Complete validation',
      intent: 'primary',
      input: { validation_report_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ validated_at: isoUtc(at) }),
    },
    {
      id: 'approve_registration',
      from: 'registry_review',
      to: 'registration_approved',
      by: ['registry'],
      label: 'Approve registration',
      intent: 'primary',
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      // structural gate: the ONLY edge into registered, and it fires ONLY from
      // registration_approved — reachable ONLY after complete_validation. A
      // project therefore cannot register without third-party validation. No guard.
      id: 'issue_registration',
      from: 'registration_approved',
      to: 'registered',
      by: ['registry'],
      label: 'Issue registration',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ registered_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_registration',
      from: ['validation', 'registry_review', 'registration_approved'],
      to: 'rejected',
      by: ['registry', 'validator'],
      label: 'Reject registration',
      intent: 'destructive',
      requiresReason: ['additionality_failed', 'methodology_not_applicable', 'double_counting_risk', 'validation_adverse'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['project_submitted', 'completeness_review', 'info_requested', 'validation', 'registry_review'],
      to: 'withdrawn',
      by: ['proponent'],
      label: 'Withdraw project',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'refiling', 'no_longer_viable'],
      guards: [],
    },
    {
      id: 'lapse',
      from: 'info_requested',
      to: 'lapsed',
      by: ['registry', 'system'],
      label: 'Lapse (no response)',
      intent: 'destructive',
      requiresReason: ['info_deadline_missed'],
      guards: [],
    },
  ],

  // info-request time-bar: an information request unanswered for 90 days lapses
  // the project (same pattern as licence_application's lapse).
  timers: [{ onState: 'info_requested', after: { days: 90 }, fire: 'lapse', kind: 'time_bar', reason: 'info_deadline_missed' }],
};
