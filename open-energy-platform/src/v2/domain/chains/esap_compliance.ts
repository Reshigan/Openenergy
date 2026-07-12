// esap_compliance — Environmental & Social Action Plan compliance monitoring
// as data.
//
// A lender/ES-monitor opens a monitoring period against a financed project for
// a reporting period. The developer submits an E&S compliance report; the
// monitor reviews findings, then either closes the period compliant or (on
// major findings) demands a remediation plan. Unresolved / severe
// non-compliance is escalated to a declared breach.
//
// Structural integrity spine: `compliant` is reachable ONLY via close_compliant,
// and close_compliant leaves ONLY findings_review or remediation_submitted —
// both of which sit downstream of a submitted, reviewed report. So a monitoring
// period can NEVER be rubber-stamped compliant straight off the open state
// without a report having been submitted and reviewed. No guard needed — the
// state graph forbids the shortcut (ILLEGAL_TRANSITION).
//
// submit_report is gated by completenessEvidencePresent: an E&S report can't be
// tabled without a named completeness-evidence ref.
//
// settles:false — an ESAP compliance record is a regulatory/lender monitoring
// control, never a payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure findings-severity bucketing off the two finding counts. No clock, no env.
const findingSeverity = (major: Json | undefined, minor: Json | undefined): string => {
  if (typeof major === 'number' && major > 0) return 'major_findings';
  if (typeof minor === 'number' && minor > 0) return 'minor_findings';
  return 'clean';
};

export const esapCompliance: ChainDecl = {
  key: 'esap_compliance',
  noun: 'ESAP compliance',
  refPrefix: 'ESAP',
  title: (f) => `ESAP compliance — ${(f.project_id as string) ?? 'unnamed project'} ${(f.reporting_period as string) ?? ''}`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'IFC Performance Standards', provision: 'PS1 E&S management system & monitoring', effect: 'requires' },
    { instrument: 'Equator Principles', provision: 'EP4 ESAP + EP9 independent monitoring', effect: 'requires' },
  ],
  roles: ['monitor', 'developer', 'regulator', 'operator'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Project' },
    reporting_period: { type: 'string', required: true, label: 'Reporting period' },
    commitment_tier: { type: 'string', label: 'Commitment tier (systemic/major/significant/minor/routine)' },
    developer_party: { type: 'party', role: 'developer', label: 'Project developer' },
    monitor_party: { type: 'party', role: 'monitor', label: 'E&S monitor' },
    es_monitor_id: { type: 'string', label: 'ES monitor id' },
    report_ref: { type: 'string', label: 'Compliance report ref' },
    completeness_ref: { type: 'string', label: 'Completeness evidence ref' },
    finding_count_minor: { type: 'number', min: 0, label: 'Minor findings' },
    finding_count_major: { type: 'number', min: 0, label: 'Major findings' },
    finding_severity: { type: 'string', label: 'Findings severity' },
    remediation_deadline: { type: 'string', label: 'Remediation deadline' },
    remediation_ref: { type: 'string', label: 'Remediation evidence ref' },
    breach_basis: { type: 'string', label: 'Breach basis' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Report submitted at' },
    closed_at_esap: { type: 'string', label: 'Period closed at' },
  },

  initial: 'monitoring_period_open',

  states: {
    monitoring_period_open: { label: 'Monitoring period open', terminal: false, holder: 'developer', sla: { days: 30 } },
    report_submitted: { label: 'Report submitted', terminal: false, holder: 'monitor', sla: { days: 10 } },
    findings_review: { label: 'Findings review', terminal: false, holder: 'monitor', sla: { days: 10 } },
    remediation_required: { label: 'Remediation required', terminal: false, holder: 'developer', sla: { days: 30 } },
    remediation_submitted: { label: 'Remediation submitted', terminal: false, holder: 'monitor', sla: { days: 10 } },
    compliant: { label: 'Closed compliant', terminal: true, holder: 'none' },
    breach_declared: { label: 'Breach declared', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'monitoring_period_open',
      by: ['monitor', 'operator'],
      actorBecomes: 'monitor',
      label: 'Open monitoring period',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        reporting_period: { type: 'string', required: true },
        commitment_tier: { type: 'string' },
        es_monitor_id: { type: 'string' },
        developer_party: { type: 'party', role: 'developer' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      // developer tables the E&S compliance report — needs a completeness ref.
      id: 'submit_report',
      from: 'monitoring_period_open',
      to: 'report_submitted',
      by: ['developer'],
      label: 'Submit compliance report',
      intent: 'primary',
      input: {
        report_ref: { type: 'string', required: true },
        completeness_ref: { type: 'string' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'begin_review',
      from: 'report_submitted',
      to: 'findings_review',
      by: ['monitor'],
      label: 'Begin findings review',
      intent: 'primary',
      input: {
        finding_count_minor: { type: 'number', min: 0 },
        finding_count_major: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ finding_severity: findingSeverity(f.finding_count_major, f.finding_count_minor) }),
    },
    {
      id: 'require_remediation',
      from: 'findings_review',
      to: 'remediation_required',
      by: ['monitor'],
      label: 'Require remediation',
      intent: 'primary',
      requiresReason: ['major_findings', 'ps_non_conformance', 'cap_required', 'stakeholder_grievance'],
      input: {
        remediation_deadline: { type: 'string', required: true },
        breach_basis: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'submit_remediation',
      from: 'remediation_required',
      to: 'remediation_submitted',
      by: ['developer'],
      label: 'Submit remediation evidence',
      intent: 'primary',
      input: { remediation_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      // the ONLY edge into `compliant`, and it fires ONLY from a reviewed state —
      // never straight from monitoring_period_open. A period cannot be closed
      // compliant without a submitted, reviewed report. Structural, no guard.
      id: 'close_compliant',
      from: ['findings_review', 'remediation_submitted'],
      to: 'compliant',
      by: ['monitor'],
      label: 'Close period compliant',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_esap: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'declare_breach',
      from: ['findings_review', 'remediation_required', 'remediation_submitted'],
      to: 'breach_declared',
      by: ['monitor', 'regulator'],
      label: 'Declare breach',
      intent: 'destructive',
      requiresReason: ['unresolved_major', 'remediation_overdue', 'systemic_non_compliance', 'material_harm'],
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_esap: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['monitoring_period_open', 'report_submitted'],
      to: 'withdrawn',
      by: ['monitor', 'developer'],
      label: 'Withdraw monitoring period',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'facility_repaid', 'duplicate_period', 'reassigned'],
      guards: [],
    },
  ],

  // remediation-required time-bar: a corrective-action plan left unsubmitted past
  // its deadline escalates to a declared breach. record-only stub; the sweep
  // computes the real bar off the remediation_deadline / state sla.
  timers: [{ onState: 'remediation_required', after: { days: 0 }, fire: 'declare_breach', kind: 'time_bar' }],
};
