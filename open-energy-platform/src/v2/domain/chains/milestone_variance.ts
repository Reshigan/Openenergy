// milestone_variance — IPP construction milestone schedule-variance report as data.
//
// An IPP developer opens a variance report against a project, has it certified
// by an Independent Engineer (IE), then submits it to the DFI (lender) who
// raises queries, requires a remediation plan, or accepts it.
//
// Structural gate: submit_to_dfi leaves ONLY ie_certified, and the ONLY path
// into ie_certified is ie_certify. So a variance report can NEVER reach a DFI
// without independent-engineer certification — no guard needed, the state graph
// enforces it. A critical-delay escalation crosses to the regulator: when the
// report priority is 'critical', report_critical_delay is guarded by
// regulatorPresentIfCritical.
//
// settles:false — a variance report is a construction-governance control, never
// a payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure variance bucketing off the schedule-variance days (negative = behind).
// No clock, no env — deterministic.
const varianceTier = (days: Json | undefined): string => {
  if (typeof days !== 'number') return 'unassessed';
  if (days >= 0) return 'on_track';
  const behind = -days;
  if (behind >= 90) return 'critical';
  if (behind >= 30) return 'significant';
  if (behind >= 7) return 'moderate';
  return 'minor';
};

export const milestoneVariance: ChainDecl = {
  key: 'milestone_variance',
  noun: 'Milestone variance report',
  refPrefix: 'MV',
  title: (f) => `Milestone variance ${(f.report_period as string) ?? '—'} — ${(f.project_name as string) ?? 'unnamed project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Implementation Agreement', provision: 'construction milestone schedule reporting', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'IPP project delivery oversight', effect: 'requires' },
  ],
  roles: ['developer', 'ie', 'dfi', 'regulator'],

  fields: {
    developer_party: { type: 'party', role: 'developer', label: 'IPP developer' },
    ie_party: { type: 'party', role: 'ie', label: 'Independent engineer' },
    dfi_party: { type: 'party', role: 'dfi', label: 'DFI / lender' },
    project_name: { type: 'string', required: true, label: 'Project' },
    project_id: { type: 'string', label: 'Project id' },
    report_period: { type: 'string', required: true, label: 'Reporting period (e.g. 2026-Q2)' },
    reporting_date: { type: 'string', label: 'Reporting date' },
    priority: { type: 'string', label: 'Priority (minor/moderate/significant/critical)' },
    total_milestones: { type: 'number', min: 0, label: 'Total milestones' },
    milestones_delayed: { type: 'number', min: 0, label: 'Milestones delayed' },
    milestones_critical: { type: 'number', min: 0, label: 'Milestones critical' },
    overall_schedule_variance_days: { type: 'number', label: 'Schedule variance (days, negative = behind)' },
    critical_path_float_days: { type: 'number', label: 'Critical-path float (days)' },
    cod_forecast_date: { type: 'string', label: 'COD forecast date' },
    original_cod_date: { type: 'string', label: 'Original COD date' },
    variance_tier: { type: 'string', label: 'Variance tier' },
    ie_report_ref: { type: 'string', label: 'IE report ref' },
    dfi_submission_ref: { type: 'string', label: 'DFI submission ref' },
    remediation_plan_ref: { type: 'string', label: 'Remediation plan ref' },
    remediation_deadline: { type: 'string', label: 'Remediation deadline' },
    critical_delay_description: { type: 'string', label: 'Critical delay description' },
    // written by derive, never by the client
    ie_certified_at: { type: 'string', label: 'IE certified at' },
    dfi_submitted_at: { type: 'string', label: 'DFI submitted at' },
    dfi_accepted_at: { type: 'string', label: 'DFI accepted at' },
    critical_delay_reported_at: { type: 'string', label: 'Critical delay reported at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'developer', sla: { days: 5 } },
    ie_review: { label: 'IE review', terminal: false, holder: 'ie', sla: { days: 10 } },
    ie_certified: { label: 'IE certified', terminal: false, holder: 'developer', sla: { days: 5 } },
    dfi_submitted: { label: 'Submitted to DFI', terminal: false, holder: 'dfi', sla: { days: 10 } },
    dfi_queries: { label: 'DFI queries raised', terminal: false, holder: 'developer', sla: { days: 7 } },
    dfi_queries_responded: { label: 'DFI queries responded', terminal: false, holder: 'dfi', sla: { days: 7 } },
    remediation_plan: { label: 'Remediation plan required', terminal: false, holder: 'developer', sla: { days: 14 } },
    remediation_submitted: { label: 'Remediation submitted', terminal: false, holder: 'dfi', sla: { days: 10 } },
    dfi_accepted: { label: 'DFI accepted', terminal: true, holder: 'none' },
    critical_delay: { label: 'Critical delay escalated', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['developer'],
      actorBecomes: 'developer',
      label: 'Open variance report',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        project_id: { type: 'string' },
        report_period: { type: 'string', required: true },
        reporting_date: { type: 'string' },
        priority: { type: 'string' },
        total_milestones: { type: 'number', min: 0 },
        milestones_delayed: { type: 'number', min: 0 },
        milestones_critical: { type: 'number', min: 0 },
        overall_schedule_variance_days: { type: 'number' },
        critical_path_float_days: { type: 'number' },
        cod_forecast_date: { type: 'string' },
        original_cod_date: { type: 'string' },
        ie_party: { type: 'party', role: 'ie' },
        dfi_party: { type: 'party', role: 'dfi' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ variance_tier: varianceTier(f.overall_schedule_variance_days) }),
    },
    {
      id: 'submit_to_ie',
      from: 'draft',
      to: 'ie_review',
      by: ['developer'],
      label: 'Submit for IE certification',
      intent: 'primary',
      guards: [],
    },
    {
      // structural gate: the ONLY edge into ie_certified.
      id: 'ie_certify',
      from: 'ie_review',
      to: 'ie_certified',
      by: ['ie'],
      label: 'Certify variance report',
      intent: 'primary',
      input: { ie_report_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ ie_certified_at: isoUtc(at) }),
    },
    {
      id: 'ie_return',
      from: 'ie_review',
      to: 'draft',
      by: ['ie'],
      label: 'Return for corrections',
      intent: 'secondary',
      requiresReason: ['data_incomplete', 'variance_understated', 'evidence_missing', 'baseline_mismatch'],
      guards: [],
    },
    {
      // structural safety gate: leaves ONLY ie_certified — a report cannot reach
      // a DFI without independent-engineer certification. No guard needed.
      id: 'submit_to_dfi',
      from: 'ie_certified',
      to: 'dfi_submitted',
      by: ['developer'],
      label: 'Submit to DFI',
      intent: 'primary',
      input: { dfi_submission_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ dfi_submitted_at: isoUtc(at) }),
    },
    {
      id: 'raise_query',
      from: 'dfi_submitted',
      to: 'dfi_queries',
      by: ['dfi'],
      label: 'Raise DFI queries',
      intent: 'secondary',
      requiresReason: ['clarification_needed', 'assumptions_challenged', 'forecast_disputed', 'evidence_requested'],
      guards: [],
    },
    {
      id: 'respond_query',
      from: 'dfi_queries',
      to: 'dfi_queries_responded',
      by: ['developer'],
      label: 'Respond to DFI queries',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'request_remediation',
      from: ['dfi_submitted', 'dfi_queries_responded'],
      to: 'remediation_plan',
      by: ['dfi'],
      label: 'Require remediation plan',
      intent: 'secondary',
      requiresReason: ['schedule_recovery_required', 'cod_slip_unacceptable', 'float_exhausted', 'mitigation_inadequate'],
      input: { remediation_deadline: { type: 'string' } },
      guards: [],
    },
    {
      id: 'submit_remediation',
      from: 'remediation_plan',
      to: 'remediation_submitted',
      by: ['developer'],
      label: 'Submit remediation plan',
      intent: 'primary',
      input: { remediation_plan_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'accept',
      from: ['dfi_submitted', 'dfi_queries_responded', 'remediation_submitted'],
      to: 'dfi_accepted',
      by: ['dfi'],
      label: 'Accept variance report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ dfi_accepted_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      // critical-delay escalation. When priority is 'critical' the regulator must
      // be a party (regulatorPresentIfCritical) — the escalation crosses to NERSA.
      id: 'report_critical_delay',
      from: ['draft', 'ie_review', 'ie_certified', 'dfi_submitted', 'dfi_queries', 'dfi_queries_responded', 'remediation_plan', 'remediation_submitted'],
      to: 'critical_delay',
      by: ['developer', 'dfi', 'regulator', 'system'],
      label: 'Escalate critical delay',
      intent: 'destructive',
      requiresReason: ['cod_at_risk', 'force_majeure', 'grid_connection_delay', 'funding_shortfall', 'contractor_default', 'remediation_deadline_missed'],
      // optional at coercion so the remediation time-bar can fire without an
      // author; derive defaults the description when the sweep escalates.
      input: { critical_delay_description: { type: 'string' } },
      guards: ['regulatorPresentIfCritical'],
      derive: (f, at: Instant) => ({
        critical_delay_reported_at: isoUtc(at),
        critical_delay_description:
          typeof f.critical_delay_description === 'string' && f.critical_delay_description !== ''
            ? f.critical_delay_description
            : 'Remediation plan not submitted within the required window; escalated automatically.',
      }),
    },
    {
      id: 'withdraw',
      from: ['draft', 'ie_review', 'ie_certified'],
      to: 'withdrawn',
      by: ['developer'],
      label: 'Withdraw report',
      intent: 'destructive',
      requiresReason: ['superseded', 'period_reissued', 'no_longer_required'],
      guards: [],
    },
  ],

  // remediation time-bar: an outstanding remediation plan left unsubmitted 14
  // days out (the remediation_plan state sla) stales into a critical-delay
  // escalation.
  timers: [{ onState: 'remediation_plan', after: { days: 14 }, fire: 'report_critical_delay', kind: 'time_bar', reason: 'remediation_deadline_missed' }],
};
