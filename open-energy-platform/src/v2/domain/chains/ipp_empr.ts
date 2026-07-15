// ipp_empr — Annual Environmental Management Programme (EMP) compliance report
// for an IPP plant, as data.
//
// A straight-line evidence build: ECO fieldwork → monitoring compilation →
// incident review → draft report → internal sign-off → ECO certification →
// competent-authority (DFFE/provincial) review → submission → determination.
// Nothing here reorders or skips a stage — the v1 action pipeline this maps
// from is linear and each state is reachable only from its predecessor.
//
// Determination is a three-way fork off submitted_to_ca: accept, reject, or
// declare the submission window lapsed. A major/flagship plant (≥100 MW)
// crosses the regulator inbox on accept and on a lapse (regulatorPresentIfStrategic
// reads capacity_mw); a rejection crosses the regulator inbox on ALL tiers —
// modelled structurally as a required regulator_party input on reject_report,
// not a guard, since the "all tiers" rule doesn't vary by capacity.
//
// settles:false — a compliance report is a regulatory record, never a payment
// (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

const NON_TERMINAL = [
  'report_opened',
  'eco_data_collection',
  'monitoring_compiled',
  'incident_reviewed',
  'draft_report_prepared',
  'internal_review_completed',
  'eco_signed_off',
  'ca_review_commenced',
  'submitted_to_ca',
];

export const ippEmpr: ChainDecl = {
  key: 'ipp_empr',
  noun: 'EMP compliance report',
  refPrefix: 'EMPR',
  title: (f) => `EMP compliance — ${(f.project_name as string) ?? 'project'} (${(f.report_year as number) ?? 'n/a'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement environmental compliance monitoring', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'operator', 'regulator'],

  fields: {
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Competent authority (DFFE / provincial)' },
    project_name: { type: 'string', required: true, label: 'Project name' },
    capacity_mw: { type: 'number', min: 0, label: 'Plant capacity (MW)' },
    annual_revenue_zar: { type: 'number', min: 0, label: 'Annual revenue (ZAR)' },
    report_year: { type: 'number', label: 'Report year' },
    eco_name: { type: 'string', label: 'ECO name' },
    incident_count: { type: 'number', min: 0, label: 'Environmental incident count' },
    determination_notes: { type: 'string', label: 'Determination notes' },
    // derive-stamped timestamps
    opened_at: { type: 'string', label: 'Opened at' },
    submitted_at: { type: 'string', label: 'Submitted to competent authority at' },
    determined_at: { type: 'string', label: 'Determined at' },
  },

  initial: 'report_opened',

  states: {
    report_opened: { label: 'Report opened', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    eco_data_collection: { label: 'ECO data collection', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    monitoring_compiled: { label: 'Monitoring results compiled', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    incident_reviewed: { label: 'Incident review complete', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    draft_report_prepared: { label: 'Draft report prepared', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    internal_review_completed: { label: 'Internal review complete', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    eco_signed_off: { label: 'ECO sign-off obtained', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    ca_review_commenced: { label: 'CA review commenced', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    submitted_to_ca: { label: 'Submitted to competent authority', terminal: false, holder: 'regulator', sla: { days: 120 } },
    report_accepted: { label: 'Report accepted', terminal: true, holder: 'none' },
    report_rejected: { label: 'Report rejected', terminal: true, holder: 'none' },
    report_lapsed: { label: 'Report lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'report_opened',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Open EMP compliance report',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        annual_revenue_zar: { type: 'number', min: 0 },
        report_year: { type: 'number' },
        eco_name: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ opened_at: isoUtc(at) }),
    },
    {
      id: 'commence_eco_data_collection',
      from: 'report_opened',
      to: 'eco_data_collection',
      by: ['ipp_developer', 'operator'],
      label: 'Commence ECO data collection',
      intent: 'primary',
      input: { eco_name: { type: 'string' } },
      guards: [],
    },
    {
      id: 'compile_monitoring_results',
      from: 'eco_data_collection',
      to: 'monitoring_compiled',
      by: ['ipp_developer', 'operator'],
      label: 'Compile monitoring results',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'conduct_incident_review',
      from: 'monitoring_compiled',
      to: 'incident_reviewed',
      by: ['ipp_developer', 'operator'],
      label: 'Conduct incident review',
      intent: 'primary',
      input: { incident_count: { type: 'number', min: 0 } },
      guards: [],
    },
    {
      id: 'prepare_draft_report',
      from: 'incident_reviewed',
      to: 'draft_report_prepared',
      by: ['ipp_developer', 'operator'],
      label: 'Prepare draft report',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'complete_internal_review',
      from: 'draft_report_prepared',
      to: 'internal_review_completed',
      by: ['ipp_developer', 'operator'],
      label: 'Complete internal review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'obtain_eco_sign_off',
      from: 'internal_review_completed',
      to: 'eco_signed_off',
      by: ['ipp_developer', 'operator'],
      label: 'Obtain ECO sign-off',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'commence_ca_review',
      from: 'eco_signed_off',
      to: 'ca_review_commenced',
      by: ['ipp_developer', 'operator'],
      label: 'Commence CA review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_to_competent_authority',
      from: 'ca_review_commenced',
      to: 'submitted_to_ca',
      by: ['ipp_developer', 'operator'],
      label: 'Submit to competent authority',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },

    // --- determination (three-way fork off submitted_to_ca) -------------------
    {
      // major/flagship plant (>=100MW) crosses the regulator inbox on acceptance.
      id: 'accept_report',
      from: 'submitted_to_ca',
      to: 'report_accepted',
      by: ['ipp_developer', 'operator'],
      label: 'Accept report',
      intent: 'primary',
      input: { determination_notes: { type: 'string' } },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ determined_at: isoUtc(at) }),
    },
    {
      // rejection crosses the regulator inbox on ALL tiers — a required party
      // input, not a tier-conditional guard, since it doesn't vary by capacity.
      id: 'reject_report',
      from: 'submitted_to_ca',
      to: 'report_rejected',
      by: ['ipp_developer', 'operator'],
      label: 'Reject report',
      intent: 'destructive',
      input: { regulator_party: { type: 'party', role: 'regulator', required: true } },
      requiresReason: ['nema_non_compliance', 'monitoring_data_incomplete', 'eco_signoff_missing', 'unauthorized_incident', 'condition_breach'],
      guards: [],
      derive: (_f, at: Instant) => ({ determined_at: isoUtc(at) }),
    },
    {
      // missed submission window; major/flagship plant crosses the regulator
      // inbox here too. Reachable from any open stage (an annual deadline can
      // lapse the report at any point in the pipeline, not only post-submission),
      // and fireable by the SLA sweep off submitted_to_ca.
      id: 'declare_lapsed',
      from: NON_TERMINAL,
      to: 'report_lapsed',
      by: ['ipp_developer', 'operator', 'system'],
      label: 'Declare lapsed',
      intent: 'destructive',
      requiresReason: ['submission_window_missed', 'eco_signoff_lapsed', 'ca_review_stalled', 'documentation_incomplete'],
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ determined_at: isoUtc(at) }),
    },
  ],

  // annual report sat with the competent authority past its SLA window without
  // a determination — auto-lapse. No required input on declare_lapsed, so the
  // sweep can fire it clean.
  timers: [{ onState: 'submitted_to_ca', after: { days: 120 }, fire: 'declare_lapsed', kind: 'sla', reason: 'submission_window_missed' }],
};
