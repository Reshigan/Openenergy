// ipp_env_monitoring — IPP environmental monitoring round, as data.
//
// Ported from the v1 oe_ipp_env_monitoring state machine (env_monitoring
// "standard shape": POST /:id/:action, dedicated events table, refCol/
// titleCol/counterpartyCol, no quantum). A round runs sample → lab result →
// compliance assessment → report to the authority, with an exceedance branch
// when a result breaches the permit limit.
//
// Structural honesty (fidelity to v1, not a rewrite):
//  - v1's filters list `report_drafted` as a valid status, but no action in
//    v1's own actions array ever transitions into or out of it — it is
//    genuinely dead in the legacy machine, unlike cp_tracker's
//    under_verification (which WAS a legitimate `from` there). This port
//    omits `report_drafted` for exactly that reason rather than inventing a
//    draft/submit split v1 never had.
//  - `corrective_action` and `under_investigation` are real v1 statuses (the
//    "exceedance" filter group) but likewise have no wiring action in v1's
//    actions array. They are kept as declared states, for fidelity to the
//    status list, but are currently unreachable — this port does not invent
//    the missing corrective/investigation actions v1 never shipped.
//  - v1's `monitoring_tier` options include `critical`; `priority` is a
//    derive-only alias of it set at `open`, purely so the existing
//    regulatorPresentIfCritical guard (which reads a `priority` field) can
//    gate the regulator crossing on submit_report / flag_exceedance that
//    v1's cascadeHints describe ("may cross regulator" / "may cross ...
//    sensitive receptors") — no new guard semantics invented.
//  - cancel_monitoring is also the timer backstop off v1's sla_deadline_at:
//    a round left `scheduled` for 30 days auto-cancels with reason
//    sla_deadline_missed (same disposition as cp_tracker's time-bar).
//
// settles:false — an environmental monitoring round is a compliance record,
// never a payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippEnvMonitoring: ChainDecl = {
  key: 'ipp_env_monitoring',
  noun: 'IPP environmental monitoring round',
  refPrefix: 'IEM',
  title: (f) =>
    `Env monitoring — ${(f.parameter_name as string) ?? (f.monitoring_title as string) ?? 'unnamed'} @ ${(f.sampling_location as string) ?? 'site TBC'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement environmental management programme (EMP) compliance', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator', 'operator'],

  fields: {
    monitoring_ref: { type: 'string', label: 'Monitoring reference' },
    monitoring_title: { type: 'string', required: true, label: 'Monitoring title' },
    ipp_developer_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (if crossing)' },
    project_id: { type: 'string', label: 'Project id' },
    project_name: { type: 'string', label: 'Project name' },
    monitoring_category: { type: 'string', required: true, label: 'Monitoring category' },
    monitoring_tier: { type: 'string', required: true, label: 'Monitoring tier (critical/regular/routine/baseline)' },
    eia_condition_ref: { type: 'string', label: 'EIA condition ref' },
    sampling_location: { type: 'string', label: 'Sampling location' },
    parameter_name: { type: 'string', label: 'Parameter' },
    measurement_unit: { type: 'string', label: 'Measurement unit' },
    permit_limit_max: { type: 'number', label: 'Permit limit max' },
    is_near_sensitive_receptor: { type: 'boolean', label: 'Near sensitive receptor' },
    measured_value: { type: 'number', label: 'Measured value' },
    lab_name: { type: 'string', label: 'Lab' },
    findings: { type: 'string', label: 'Findings' },
    exceedance_pct: { type: 'number', label: 'Exceedance %' },
    exceedance_cause: { type: 'string', label: 'Exceedance cause' },
    report_title: { type: 'string', label: 'Report title' },
    report_submitted_to: { type: 'string', label: 'Submitted to' },
    // written by derive, never by the client
    priority: { type: 'string', label: 'Priority (mirrors monitoring_tier)' },
    sampling_started_at: { type: 'string', label: 'Sampling started at' },
    sample_submitted_at: { type: 'string', label: 'Sample submitted at' },
    results_received_at: { type: 'string', label: 'Results received at' },
    compliance_assessed_at: { type: 'string', label: 'Compliance assessed at' },
    report_submitted_at: { type: 'string', label: 'Report submitted at' },
    exceedance_flagged_at: { type: 'string', label: 'Exceedance flagged at' },
    closed_at_env: { type: 'string', label: 'Closed at' },
    cancelled_at: { type: 'string', label: 'Cancelled at' },
  },

  initial: 'scheduled',

  states: {
    scheduled: { label: 'Scheduled', terminal: false, holder: 'ipp_developer' },
    sampling: { label: 'Sampling', terminal: false, holder: 'ipp_developer' },
    sample_submitted: { label: 'Sample submitted', terminal: false, holder: 'ipp_developer' },
    results_received: { label: 'Results received', terminal: false, holder: 'ipp_developer' },
    compliance_assessed: { label: 'Compliance assessed', terminal: false, holder: 'ipp_developer' },
    report_submitted: { label: 'Report submitted', terminal: false, holder: 'ipp_developer' },
    exceedance_flagged: { label: 'Exceedance flagged', terminal: false, holder: 'ipp_developer' },
    // unreachable in v1 — see structural-honesty note above.
    corrective_action: { label: 'Corrective action', terminal: false, holder: 'ipp_developer' },
    under_investigation: { label: 'Under investigation', terminal: false, holder: 'ipp_developer' },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'scheduled',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Schedule monitoring round',
      intent: 'primary',
      input: {
        monitoring_title: { type: 'string', required: true },
        project_id: { type: 'string' },
        project_name: { type: 'string' },
        monitoring_category: { type: 'string', required: true },
        monitoring_tier: { type: 'string', required: true },
        monitoring_ref: { type: 'string' },
        eia_condition_ref: { type: 'string' },
        sampling_location: { type: 'string' },
        parameter_name: { type: 'string' },
        measurement_unit: { type: 'string' },
        permit_limit_max: { type: 'number' },
        is_near_sensitive_receptor: { type: 'boolean' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ priority: f.monitoring_tier ?? null }),
    },
    {
      id: 'start_sampling',
      from: 'scheduled',
      to: 'sampling',
      by: ['ipp_developer', 'operator'],
      label: 'Start sampling',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ sampling_started_at: isoUtc(at) }),
    },
    {
      id: 'submit_sample',
      from: 'sampling',
      to: 'sample_submitted',
      by: ['ipp_developer', 'operator'],
      label: 'Submit sample to lab',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ sample_submitted_at: isoUtc(at) }),
    },
    {
      id: 'record_results',
      from: 'sample_submitted',
      to: 'results_received',
      by: ['ipp_developer', 'operator'],
      label: 'Record lab results',
      intent: 'primary',
      input: {
        measured_value: { type: 'number' },
        measurement_unit: { type: 'string' },
        lab_name: { type: 'string' },
        findings: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ results_received_at: isoUtc(at) }),
    },
    {
      id: 'assess_compliance',
      from: 'results_received',
      to: 'compliance_assessed',
      by: ['ipp_developer', 'operator'],
      label: 'Assess compliance',
      intent: 'primary',
      input: { findings: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ compliance_assessed_at: isoUtc(at) }),
    },
    {
      // critical-tier rounds cross to the regulator on submission — see
      // priority alias note above.
      id: 'submit_report',
      from: 'compliance_assessed',
      to: 'report_submitted',
      by: ['ipp_developer', 'operator'],
      label: 'Submit report',
      intent: 'primary',
      input: {
        report_title: { type: 'string' },
        report_submitted_to: { type: 'string' },
      },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ report_submitted_at: isoUtc(at) }),
    },
    {
      // reachable any time after results are in — a breach can surface at
      // results, at assessment, or even after the report went out.
      id: 'flag_exceedance',
      from: ['results_received', 'compliance_assessed', 'report_submitted'],
      to: 'exceedance_flagged',
      by: ['ipp_developer', 'operator'],
      label: 'Flag exceedance',
      intent: 'secondary',
      input: {
        exceedance_pct: { type: 'number' },
        exceedance_cause: { type: 'string' },
      },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ exceedance_flagged_at: isoUtc(at) }),
    },
    {
      id: 'close_monitoring',
      from: ['report_submitted', 'compliance_assessed', 'exceedance_flagged'],
      to: 'closed',
      by: ['ipp_developer', 'operator'],
      label: 'Close',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_env: isoUtc(at) }),
    },
    {
      // also the timer backstop's fire edge (see timers below) — by includes
      // 'system', from includes 'scheduled', no required input.
      id: 'cancel_monitoring',
      from: ['scheduled', 'sampling', 'sample_submitted', 'results_received', 'compliance_assessed'],
      to: 'cancelled',
      by: ['ipp_developer', 'operator', 'system'],
      label: 'Cancel',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'permit_lapsed', 'monitoring_no_longer_required', 'duplicate_round', 'sla_deadline_missed'],
      guards: [],
      derive: (_f, at: Instant) => ({ cancelled_at: isoUtc(at) }),
    },
  ],

  // worst-case backstop off v1's sla_deadline_at: a round never started
  // within 30 days auto-cancels, same disposition as cp_tracker's time-bar.
  timers: [{ onState: 'scheduled', after: { days: 30 }, fire: 'cancel_monitoring', kind: 'time_bar', reason: 'sla_deadline_missed' }],
};
