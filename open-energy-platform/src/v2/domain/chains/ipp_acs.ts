// ipp_acs — IPP annual compliance self-assessment (NERSA Grid Code) as data.
//
// A generator self-assesses six technical domains (protection, metering/SCADA,
// reactive power, frequency response, FRT/PQ, then an internal technical
// review) before handing the package to the System Operator (NTCSA). The SO
// review resolves to exactly one of: accept (certificate issued), deficiency
// notice, or a missed-window lapse — all three are terminal, mirroring the v1
// descriptor's `terminal` set exactly (assessment_accepted / _deficient /
// _lapsed).
//
// Strategic crossing: accepting a ≥100 MW (major/flagship) plant's assessment
// needs the regulator on the txn — regulatorPresentIfStrategic reads
// capacity_mw, so the field is named to match rather than the v1 column name
// (plant_mw).
//
// No timer here even though v1 carries a `sla_deadline` column (an "inverted"
// SLA — a missed window, not a completion clock): a lapse can legitimately
// fire from any of eight in-flight states, but TimerDecl.onState is a single
// state, and the bundle test requires the fired edge take no required input.
// Modelling that honestly needs either N timers or a broader engine primitive
// than exists today — omitted rather than guessed at (declare_lapsed stays a
// manual/ops-triggered edge for now).
//
// settles:false — a compliance self-assessment is a regulatory record, never
// a payment (R-S5-1); quantumCol was null in the v1 descriptor too.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippAcs: ChainDecl = {
  key: 'ipp_acs',
  noun: 'IPP annual compliance assessment',
  refPrefix: 'IACS',
  title: (f) =>
    `Annual compliance assessment — ${(f.plant_name as string) ?? (f.project_id as string) ?? 'unnamed plant'} (${(f.assessment_year as number) ?? 'year TBD'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'Annual Grid Code compliance self-assessment (Grid Connection Code)', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator'],

  fields: {
    assessment_year: { type: 'number', required: true, label: 'Assessment year' },
    capacity_mw: { type: 'number', required: true, min: 0, label: 'Plant capacity (MW)' },
    project_id: { type: 'string', label: 'Project' },
    plant_name: { type: 'string', label: 'Plant name' },
    grid_connection_voltage_kv: { type: 'number', min: 0, label: 'Grid connection voltage (kV)' },
    protection_systems_score: { type: 'number', label: 'Protection systems score' },
    metering_scada_score: { type: 'number', label: 'Metering / SCADA score' },
    reactive_power_score: { type: 'number', label: 'Reactive power score' },
    frequency_response_score: { type: 'number', label: 'Frequency response score' },
    frt_pq_score: { type: 'number', label: 'FRT / PQ score' },
    notes: { type: 'string', label: 'Notes' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA/DMRE)' },
    // derive-stamped timestamps
    submitted_to_so_at: { type: 'string', label: 'Submitted to SO at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    deficiency_notice_at: { type: 'string', label: 'Deficiency notice issued at' },
    lapsed_at: { type: 'string', label: 'Declared lapsed at' },
  },

  initial: 'self_assessment_drafted',

  states: {
    self_assessment_drafted: { label: 'Self-assessment drafted', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    protection_audit_underway: { label: 'Protection systems audit underway', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    metering_scada_audit_underway: { label: 'Metering & SCADA audit underway', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    reactive_power_audit_underway: { label: 'Reactive power audit underway', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    frequency_response_audit_underway: { label: 'Frequency response audit underway', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    frt_pq_audit_underway: { label: 'FRT & power quality audit underway', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    internal_review_complete: { label: 'Internal technical review complete', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    so_review_underway: { label: 'System Operator review underway', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    submitted_to_so: { label: 'Submitted to System Operator', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    assessment_accepted: { label: 'Assessment accepted', terminal: true, holder: 'none' },
    assessment_deficient: { label: 'Assessment deficient', terminal: true, holder: 'none' },
    assessment_lapsed: { label: 'Assessment lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'self_assessment_drafted',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Draft self-assessment',
      intent: 'primary',
      input: {
        assessment_year: { type: 'number', required: true },
        capacity_mw: { type: 'number', required: true, min: 0 },
        project_id: { type: 'string' },
        plant_name: { type: 'string' },
        grid_connection_voltage_kv: { type: 'number', min: 0 },
        protection_systems_score: { type: 'number' },
        metering_scada_score: { type: 'number' },
        reactive_power_score: { type: 'number' },
        frequency_response_score: { type: 'number' },
        frt_pq_score: { type: 'number' },
        notes: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'commence_protection_audit',
      from: 'self_assessment_drafted',
      to: 'protection_audit_underway',
      by: ['ipp_developer'],
      label: 'Commence protection audit',
      intent: 'primary',
      input: { notes: { type: 'string', label: 'Audit notes' } },
      guards: [],
    },
    {
      id: 'commence_metering_scada_audit',
      from: 'protection_audit_underway',
      to: 'metering_scada_audit_underway',
      by: ['ipp_developer'],
      label: 'Commence metering & SCADA audit',
      intent: 'primary',
      input: { notes: { type: 'string', label: 'Audit notes' } },
      guards: [],
    },
    {
      id: 'commence_reactive_power_audit',
      from: 'metering_scada_audit_underway',
      to: 'reactive_power_audit_underway',
      by: ['ipp_developer'],
      label: 'Commence reactive power audit',
      intent: 'primary',
      input: { notes: { type: 'string', label: 'Audit notes' } },
      guards: [],
    },
    {
      id: 'commence_frequency_response_audit',
      from: 'reactive_power_audit_underway',
      to: 'frequency_response_audit_underway',
      by: ['ipp_developer'],
      label: 'Commence frequency response audit',
      intent: 'primary',
      input: { notes: { type: 'string', label: 'Audit notes' } },
      guards: [],
    },
    {
      id: 'commence_frt_pq_audit',
      from: 'frequency_response_audit_underway',
      to: 'frt_pq_audit_underway',
      by: ['ipp_developer'],
      label: 'Commence FRT & power quality audit',
      intent: 'primary',
      input: { notes: { type: 'string', label: 'Audit notes' } },
      guards: [],
    },
    {
      id: 'conduct_internal_technical_review',
      from: 'frt_pq_audit_underway',
      to: 'internal_review_complete',
      by: ['ipp_developer'],
      label: 'Conduct internal technical review',
      intent: 'primary',
      input: { notes: { type: 'string', label: 'Review notes' } },
      guards: [],
    },
    {
      id: 'commence_so_review',
      from: 'internal_review_complete',
      to: 'so_review_underway',
      by: ['ipp_developer'],
      label: 'Commence System Operator review',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: [],
    },
    {
      // formal handover to NTCSA — blocked under a platform-wide compliance
      // halt like any other new commitment.
      id: 'submit_to_so',
      from: 'so_review_underway',
      to: 'submitted_to_so',
      by: ['ipp_developer'],
      label: 'Submit to System Operator',
      intent: 'primary',
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ submitted_to_so_at: isoUtc(at) }),
    },
    {
      // certificate issuance. Major/flagship (≥100 MW) plants need the
      // regulator on the txn — mirrors the v1 cascadeHint exactly.
      id: 'accept_assessment',
      from: ['so_review_underway', 'submitted_to_so'],
      to: 'assessment_accepted',
      by: ['ipp_developer'],
      label: 'Accept assessment',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },

    // --- exits ------------------------------------------------------------
    {
      id: 'issue_deficiency_notice',
      from: ['so_review_underway', 'submitted_to_so'],
      to: 'assessment_deficient',
      by: ['ipp_developer'],
      label: 'Issue deficiency notice',
      intent: 'destructive',
      input: { notes: { type: 'string', label: 'Deficiency detail' } },
      requiresReason: [
        'protection_systems_deficiency',
        'metering_scada_deficiency',
        'reactive_power_deficiency',
        'frequency_response_deficiency',
        'frt_pq_deficiency',
        'documentation_incomplete',
      ],
      guards: [],
      derive: (_f, at: Instant) => ({ deficiency_notice_at: isoUtc(at) }),
    },
    {
      id: 'declare_lapsed',
      from: [
        'self_assessment_drafted',
        'protection_audit_underway',
        'metering_scada_audit_underway',
        'reactive_power_audit_underway',
        'frequency_response_audit_underway',
        'frt_pq_audit_underway',
        'internal_review_complete',
        'so_review_underway',
        'submitted_to_so',
      ],
      to: 'assessment_lapsed',
      by: ['ipp_developer'],
      label: 'Declare lapsed',
      intent: 'destructive',
      requiresReason: ['sla_deadline_missed', 'self_assessment_abandoned', 'so_response_window_missed'],
      guards: [],
      derive: (_f, at: Instant) => ({ lapsed_at: isoUtc(at) }),
    },
  ],
};
