// milestone_variance_report — IPP construction milestone & schedule-variance
// report as data (W207: REIPPPP Schedule of Compliance + NERSA construction
// permit + DBSA/DFI milestone conditions).
//
// An IPP developer opens a report, has it certified by an Independent Engineer
// (IE), then submits it to the DFI (lender) who may raise queries, require a
// remediation plan, or accept it outright. A remediation plan is itself either
// accepted by the DFI or escalates into a critical-delay declaration.
//
// Structural gates:
//  - submit_to_dfi leaves ONLY ie_certified, and the ONLY edge into
//    ie_certified is certify_ie — a report can NEVER reach the DFI without
//    independent-engineer sign-off, no guard needed.
//  - dfi_accept_remediation leaves ONLY remediation_submitted, and the ONLY
//    edge into remediation_submitted is submit_remediation_plan — a
//    remediation cannot be accepted before a plan is on file.
// declare_critical_delay is the platform's REIPPPP escalation obligation: when
// the report's risk tier is critical, regulatorPresentIfCritical requires a
// live regulator party before the escalation can land (matches the sibling
// milestone_variance chain's pattern). dfi_accept / dfi_accept_remediation /
// flag_remediation_required also cross into the regulator inbox in the legacy
// implementation, but only as a non-blocking notification side effect — never
// gated — so no guard is attached to those edges (would change behaviour).
//
// settles:false — a variance report is a construction-governance control, not
// a payment; DFI disbursement it may gate settles on its own rail (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const milestoneVarianceReport: ChainDecl = {
  key: 'milestone_variance_report',
  noun: 'Milestone variance report',
  refPrefix: 'MVR',
  title: (f) =>
    `Milestone variance report ${(f.report_period as string) ?? '—'} — ${(f.project_id as string) ?? 'unassigned project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Implementation Agreement', provision: 'Schedule of Compliance — construction milestone reporting', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'construction permit milestone oversight', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'operator', 'regulator'],

  fields: {
    project_id: { type: 'string', label: 'Project id' },
    // doubles as the REIPPPP risk tier (minor/moderate/significant/critical);
    // named `priority` so it lines up with the shared registry guard's key.
    priority: { type: 'string', label: 'Risk tier (minor/moderate/significant/critical)' },
    report_period: { type: 'string', required: true, label: 'Report period' },
    reporting_date: { type: 'string', required: true, label: 'Reporting date' },
    original_cod_date: { type: 'string', label: 'Original COD date' },
    cod_forecast_date: { type: 'string', label: 'COD forecast date' },
    total_milestones: { type: 'number', min: 0, label: 'Total milestones' },
    milestones_on_track: { type: 'number', min: 0, label: 'Milestones on track' },
    milestones_delayed: { type: 'number', min: 0, label: 'Milestones delayed' },
    milestones_critical: { type: 'number', min: 0, label: 'Milestones critical' },
    overall_schedule_variance_days: { type: 'number', label: 'Schedule variance (days, negative = behind)' },
    critical_path_float_days: { type: 'number', label: 'Critical-path float (days)' },
    ie_firm_name: { type: 'string', label: 'IE firm name' },
    ie_report_ref: { type: 'string', label: 'IE report ref' },
    dfi_submission_ref: { type: 'string', label: 'DFI submission ref' },
    remediation_plan_ref: { type: 'string', label: 'Remediation plan ref' },
    remediation_deadline: { type: 'string', label: 'Remediation deadline' },
    critical_delay_description: { type: 'string', label: 'Critical delay description' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    // written by derive, never by the client
    ie_certified_at: { type: 'string', label: 'IE certified at' },
    dfi_submitted_at: { type: 'string', label: 'DFI submitted at' },
    dfi_accepted_at: { type: 'string', label: 'DFI accepted at' },
    remediation_accepted_at: { type: 'string', label: 'Remediation accepted at' },
    critical_delay_reported_at: { type: 'string', label: 'Critical delay reported at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    ie_review: { label: 'IE review', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    ie_certified: { label: 'IE certified', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    dfi_submitted: { label: 'Submitted to DFI', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    dfi_queries: { label: 'DFI queries raised', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    dfi_queries_responded: { label: 'DFI queries responded', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    remediation_plan: { label: 'Remediation plan required', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    remediation_submitted: { label: 'Remediation submitted', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    dfi_accepted: { label: 'DFI accepted', terminal: true, holder: 'none' },
    remediation_accepted: { label: 'Remediation accepted', terminal: true, holder: 'none' },
    critical_delay: { label: 'Critical delay escalated', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Open variance report',
      intent: 'primary',
      input: {
        project_id: { type: 'string' },
        priority: { type: 'string' },
        report_period: { type: 'string', required: true },
        reporting_date: { type: 'string', required: true },
        original_cod_date: { type: 'string' },
        total_milestones: { type: 'number', min: 0 },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'submit_for_ie_review',
      from: 'draft',
      to: 'ie_review',
      by: ['ipp_developer', 'operator'],
      label: 'Submit for IE review',
      intent: 'primary',
      input: {
        ie_firm_name: { type: 'string' },
        ie_report_ref: { type: 'string' },
      },
      guards: [],
    },
    {
      // structural gate: the ONLY edge into ie_certified.
      id: 'certify_ie',
      from: 'ie_review',
      to: 'ie_certified',
      by: ['ipp_developer', 'operator'],
      label: 'Certify IE',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ ie_certified_at: isoUtc(at) }),
    },
    {
      // structural gate: leaves ONLY ie_certified — a report can never reach a
      // DFI without independent-engineer certification.
      id: 'submit_to_dfi',
      from: 'ie_certified',
      to: 'dfi_submitted',
      by: ['ipp_developer', 'operator'],
      label: 'Submit to DFI',
      intent: 'primary',
      input: { dfi_submission_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ dfi_submitted_at: isoUtc(at) }),
    },
    {
      id: 'dfi_raises_queries',
      from: 'dfi_submitted',
      to: 'dfi_queries',
      by: ['ipp_developer', 'operator'],
      label: 'DFI raises queries',
      intent: 'secondary',
      guards: [],
    },
    {
      id: 'respond_to_dfi_queries',
      from: 'dfi_queries',
      to: 'dfi_queries_responded',
      by: ['ipp_developer', 'operator'],
      label: 'Respond to DFI queries',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'dfi_accept',
      from: ['dfi_submitted', 'dfi_queries_responded'],
      to: 'dfi_accepted',
      by: ['ipp_developer', 'operator'],
      label: 'DFI accept',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ dfi_accepted_at: isoUtc(at) }),
    },
    {
      id: 'flag_remediation_required',
      from: ['dfi_submitted', 'dfi_queries_responded'],
      to: 'remediation_plan',
      by: ['ipp_developer', 'operator'],
      label: 'Flag remediation required',
      intent: 'secondary',
      input: { overall_schedule_variance_days: { type: 'number' } },
      guards: [],
    },
    {
      id: 'submit_remediation_plan',
      from: 'remediation_plan',
      to: 'remediation_submitted',
      by: ['ipp_developer', 'operator'],
      label: 'Submit remediation plan',
      intent: 'primary',
      input: {
        remediation_plan_ref: { type: 'string' },
        remediation_deadline: { type: 'string' },
      },
      guards: [],
    },
    {
      // structural gate: the ONLY edge into remediation_submitted is
      // submit_remediation_plan, so a remediation can never be accepted
      // before a plan is on file.
      id: 'dfi_accept_remediation',
      from: 'remediation_submitted',
      to: 'remediation_accepted',
      by: ['ipp_developer', 'operator'],
      label: 'DFI accept remediation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ remediation_accepted_at: isoUtc(at) }),
    },
    {
      // REIPPPP escalation obligation: when the report is critical-tier, a
      // regulator must already be a party before the escalation can land.
      id: 'declare_critical_delay',
      from: ['remediation_plan', 'remediation_submitted'],
      to: 'critical_delay',
      by: ['ipp_developer', 'operator'],
      label: 'Declare critical delay',
      intent: 'destructive',
      input: { critical_delay_description: { type: 'string', required: true } },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ critical_delay_reported_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: 'draft',
      to: 'withdrawn',
      by: ['ipp_developer', 'operator'],
      label: 'Withdraw report',
      intent: 'destructive',
      guards: [],
    },
  ],
};
