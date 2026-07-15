// sla_performance_report — ITIL service-level performance reporting lifecycle
// as data (lanes.support = 'itil_service_mgmt' in the v1 descriptor).
//
// Support collects the period's raw data, calculates the SLA metrics against
// target, and — on a breach — opens a root-cause analysis before the report
// goes to management review. Review closes to approved, escalates into a
// remediation plan, or is disputed.
//
// Structural honesty (no invented guards):
//  - calculate_metrics needs a completeness_ref: you cannot compute an SLA
//    metric off data nobody attested was complete (completenessEvidencePresent).
//  - submit_for_review is reachable from metrics_calculated OR rca_complete —
//    a clean period skips RCA, a breached one must finish it first — but
//    review can NEVER be reached without metrics having been calculated at
//    least once. The state graph enforces that; no guard needed.
//  - escalate_remediation derives priority from breach_count at
//    calculate_metrics time; a critical-priority report crossing into a
//    remediation plan must carry a regulator (regulatorPresentIfCritical) —
//    NERSA Grid Code service-quality reporting has a regulator lane for
//    persistent breaches.
//
// settles:false — a performance report and its remediation plan are
// governance records; no quantum moves on this chain (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure breach-count → priority tier. No clock, no env.
const priorityFromBreaches = (count: Json | undefined): string => {
  if (typeof count !== 'number' || count <= 0) return 'low';
  if (count >= 5) return 'critical';
  if (count >= 2) return 'high';
  return 'medium';
};

export const slaPerformanceReport: ChainDecl = {
  key: 'sla_performance_report',
  noun: 'SLA performance report',
  refPrefix: 'SLAP',
  title: (f) => `SLA report — ${(f.reporting_period as string) ?? 'period TBC'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'service-quality performance reporting', effect: 'requires' },
  ],
  roles: ['support', 'operator', 'provider', 'regulator'],

  fields: {
    reporting_period: { type: 'string', required: true, label: 'Reporting period' },
    period_start: { type: 'string', required: true, label: 'Period start' },
    period_end: { type: 'string', required: true, label: 'Period end' },
    provider_party: { type: 'party', role: 'provider', label: 'Service provider' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    sla_target_pct: { type: 'number', min: 0, max: 100, label: 'SLA target (%)' },
    sla_actual_pct: { type: 'number', min: 0, max: 100, label: 'SLA actual (%)' },
    breach_count: { type: 'number', min: 0, label: 'Breach count' },
    priority: { type: 'string', label: 'Priority (derived from breach_count)' },
    completeness_ref: { type: 'string', label: 'Data-completeness evidence ref' },
    rca_owner: { type: 'string', label: 'RCA owner' },
    rca_root_cause: { type: 'string', label: 'Root cause' },
    remediation_plan_ref: { type: 'string', label: 'Remediation plan ref' },
    review_notes: { type: 'string', label: 'Review notes' },
    // written by derive, never by the client
    data_collected_at: { type: 'string', label: 'Data collection opened at' },
    metrics_calculated_at: { type: 'string', label: 'Metrics calculated at' },
    rca_initiated_at: { type: 'string', label: 'RCA initiated at' },
    rca_completed_at: { type: 'string', label: 'RCA completed at' },
    submitted_for_review_at: { type: 'string', label: 'Submitted for review at' },
    approved_at: { type: 'string', label: 'Approved at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
  },

  initial: 'data_collection',

  states: {
    data_collection: { label: 'Data collection', terminal: false, holder: 'support', sla: { days: 5 } },
    metrics_calculated: { label: 'Metrics calculated', terminal: false, holder: 'support', sla: { days: 2 } },
    rca_in_progress: { label: 'RCA in progress', terminal: false, holder: 'support', sla: { days: 5 } },
    rca_complete: { label: 'RCA complete', terminal: false, holder: 'support', sla: { days: 2 } },
    management_review: { label: 'Management review', terminal: false, holder: 'operator', sla: { days: 5 } },
    approved: { label: 'Approved', terminal: true, holder: 'none' },
    disputed: { label: 'Disputed', terminal: true, holder: 'none' },
    remediation_plan: { label: 'Remediation plan', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'data_collection',
      by: ['support', 'operator'],
      actorBecomes: 'support',
      label: 'Open SLA report',
      intent: 'primary',
      input: {
        reporting_period: { type: 'string', required: true },
        period_start: { type: 'string', required: true },
        period_end: { type: 'string', required: true },
        provider_party: { type: 'party', role: 'provider' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // the provider being measured cannot be the same entity recording the report.
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ data_collected_at: isoUtc(at) }),
    },
    {
      id: 'calculate_metrics',
      from: 'data_collection',
      to: 'metrics_calculated',
      by: ['support', 'operator'],
      label: 'Calculate metrics',
      intent: 'primary',
      input: {
        sla_target_pct: { type: 'number', min: 0, max: 100 },
        sla_actual_pct: { type: 'number', min: 0, max: 100 },
        breach_count: { type: 'number', min: 0 },
        completeness_ref: { type: 'string' },
      },
      // cannot compute a metric off data nobody attested was complete.
      guards: ['completenessEvidencePresent'],
      derive: (f, at: Instant) => ({
        metrics_calculated_at: isoUtc(at),
        priority: priorityFromBreaches(f.breach_count),
      }),
    },
    {
      id: 'initiate_rca',
      from: 'metrics_calculated',
      to: 'rca_in_progress',
      by: ['support', 'operator'],
      label: 'Initiate RCA',
      intent: 'primary',
      input: { rca_owner: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ rca_initiated_at: isoUtc(at) }),
    },
    {
      id: 'complete_rca',
      from: 'rca_in_progress',
      to: 'rca_complete',
      by: ['support', 'operator'],
      label: 'Complete RCA',
      intent: 'primary',
      input: {
        rca_root_cause: { type: 'string', required: true },
        remediation_plan_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ rca_completed_at: isoUtc(at) }),
    },
    {
      // reachable from a clean period (metrics_calculated) or a breached one
      // that finished RCA (rca_complete) — never from an open, unfinished RCA.
      id: 'submit_for_review',
      from: ['metrics_calculated', 'rca_complete'],
      to: 'management_review',
      by: ['support', 'operator'],
      label: 'Submit for review',
      intent: 'primary',
      input: { review_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_for_review_at: isoUtc(at) }),
    },
    {
      id: 'approve',
      from: 'management_review',
      to: 'approved',
      by: ['support', 'operator'],
      label: 'Approve report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      // a critical-priority report (5+ breaches) crossing into a remediation
      // plan must carry a regulator on the txn.
      id: 'escalate_remediation',
      from: 'management_review',
      to: 'remediation_plan',
      by: ['support', 'operator'],
      label: 'Escalate to remediation plan',
      intent: 'primary',
      input: { remediation_plan_ref: { type: 'string' } },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
    {
      id: 'dispute',
      from: 'management_review',
      to: 'disputed',
      by: ['support', 'operator'],
      label: 'Dispute report',
      intent: 'destructive',
      requiresReason: ['metrics_calculation_error', 'data_incomplete', 'methodology_disagreement', 'external_factor_excluded'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['data_collection', 'metrics_calculated', 'rca_in_progress', 'rca_complete', 'management_review'],
      to: 'withdrawn',
      by: ['support', 'operator'],
      label: 'Withdraw report',
      intent: 'destructive',
      requiresReason: ['report_superseded', 'duplicate_report', 'period_reopened'],
      guards: [],
    },
  ],
};
