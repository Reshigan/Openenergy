// construction_cost_report — periodic EPC construction cost report as data.
//
// During an IPP build the contractor submits a periodic (usually monthly) cost
// report: budget-at-completion, actual cost-to-date, earned value, planned
// value. The owner's engineer / quantity surveyor reviews it and either returns
// it for revision or certifies it. The earned-value metrics (cost variance,
// schedule variance, CPI, %-complete) are pure derivations off the submitted
// numbers — computed by derive, never trusted from the client.
//
// Structural certification gate: certify ONLY leaves under_review, and the ONLY
// path into under_review is submit. So a fresh draft can NEVER be certified
// without first being submitted for review — the state graph enforces it, no
// guard needed. Certification additionally requires a named completeness-
// evidence ref (completenessEvidencePresent) — a QS signs off that the reported
// costs are complete before the report becomes drawdown-grade.
//
// settles:false — a cost report is an assurance record, not a payment. The
// certified report is an input to a drawdown, but the money moves on the
// facility-drawdown chain (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure earned-value metrics off the submitted numbers. No clock, no env.
// Division guards return 0 rather than NaN/Infinity so the projection stays JSON-clean.
const evm = (f: Record<string, Json>): Record<string, Json> => {
  const num = (k: string): number => (typeof f[k] === 'number' ? (f[k] as number) : 0);
  const bac = num('budget_at_completion');
  const ac = num('actual_cost_to_date');
  const ev = num('earned_value');
  const pv = num('planned_value');
  return {
    cost_variance: ev - ac,
    schedule_variance: ev - pv,
    cost_performance_index: ac > 0 ? ev / ac : 0,
    schedule_performance_index: pv > 0 ? ev / pv : 0,
    percent_complete: bac > 0 ? ev / bac : 0,
  };
};

export const constructionCostReport: ChainDecl = {
  key: 'construction_cost_report',
  noun: 'Construction cost report',
  refPrefix: 'CCR',
  title: (f) => `Cost report — ${(f.project_name as string) ?? 'unnamed project'} (${(f.report_period as string) ?? 'period?'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Implementation Agreement', provision: 'construction reporting & drawdown certification', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'connection project progress reporting', effect: 'requires' },
  ],
  roles: ['contractor', 'reviewer', 'operator'],

  fields: {
    report_number: { type: 'string', label: 'Report number' },
    contractor_party: { type: 'party', role: 'contractor', label: 'Reporting contractor' },
    reviewer_party: { type: 'party', role: 'reviewer', label: "Owner's engineer / QS" },
    project_name: { type: 'string', required: true, label: 'Project' },
    report_period: { type: 'string', required: true, label: 'Report period (e.g. 2026-06)' },
    currency: { type: 'string', label: 'Currency' },
    // submitted numbers (edge input at submit)
    budget_at_completion: { type: 'number', min: 0, label: 'Budget at completion (BAC)' },
    actual_cost_to_date: { type: 'number', min: 0, label: 'Actual cost to date (AC)' },
    earned_value: { type: 'number', min: 0, label: 'Earned value (EV)' },
    planned_value: { type: 'number', min: 0, label: 'Planned value (PV)' },
    narrative: { type: 'string', label: 'Progress narrative' },
    revision_count: { type: 'number', label: 'Times returned for revision' },
    // written by derive, never by the client
    cost_variance: { type: 'number', label: 'Cost variance (EV-AC)' },
    schedule_variance: { type: 'number', label: 'Schedule variance (EV-PV)' },
    cost_performance_index: { type: 'number', label: 'CPI (EV/AC)' },
    schedule_performance_index: { type: 'number', label: 'SPI (EV/PV)' },
    percent_complete: { type: 'number', label: '% complete (EV/BAC)' },
    submitted_at: { type: 'string', label: 'Submitted at' },
    certified_at: { type: 'string', label: 'Certified at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'contractor', sla: { days: 5 } },
    under_review: { label: 'Under review', terminal: false, holder: 'reviewer', sla: { days: 3 } },
    certified: { label: 'Certified', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['contractor', 'operator'],
      actorBecomes: 'contractor',
      label: 'Start cost report',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        report_period: { type: 'string', required: true },
        currency: { type: 'string' },
        reviewer_party: { type: 'party', role: 'reviewer' },
      },
      guards: [],
    },
    {
      id: 'submit',
      from: 'draft',
      to: 'under_review',
      by: ['contractor'],
      label: 'Submit for review',
      intent: 'primary',
      input: {
        budget_at_completion: { type: 'number', min: 0, required: true },
        actual_cost_to_date: { type: 'number', min: 0, required: true },
        earned_value: { type: 'number', min: 0, required: true },
        planned_value: { type: 'number', min: 0, required: true },
        narrative: { type: 'string' },
      },
      guards: [],
      derive: (f, at: Instant) => ({ ...evm(f), submitted_at: isoUtc(at) }),
    },
    {
      id: 'return_for_revision',
      from: 'under_review',
      to: 'draft',
      by: ['reviewer'],
      label: 'Return for revision',
      intent: 'secondary',
      requiresReason: ['cost_unsupported', 'evm_inconsistent', 'narrative_insufficient', 'missing_backup'],
      guards: [],
      derive: (f, _at: Instant) => ({ revision_count: (typeof f.revision_count === 'number' ? f.revision_count : 0) + 1 }),
    },
    {
      // structural gate: the ONLY edge into certified, and it can only fire from
      // under_review — which only submit reaches. A draft can therefore never be
      // certified without going through review. Certification also needs a named
      // completeness-evidence ref (QS sign-off).
      id: 'certify',
      from: 'under_review',
      to: 'certified',
      by: ['reviewer'],
      label: 'Certify cost report',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ certified_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: ['draft', 'under_review'],
      to: 'rejected',
      by: ['reviewer'],
      label: 'Reject report',
      intent: 'destructive',
      requiresReason: ['material_misstatement', 'fraudulent_costs', 'project_terminated', 'superseded'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['draft', 'under_review'],
      to: 'withdrawn',
      by: ['contractor'],
      label: 'Withdraw report',
      intent: 'destructive',
      requiresReason: ['period_reissued', 'submitted_in_error', 'no_longer_required'],
      guards: [],
    },
  ],
};
