// fsca_compliance_report — FSP periodic compliance-report lifecycle to the
// Financial Sector Conduct Authority, as data.
//
// A compliance officer opens a reporting period, drafts the report, and
// submits it for internal review. From there the report reaches the
// regulator's inbox by ONE of two paths: a direct submit_to_fsca (micro-tier
// FSPs, no co-sign mandated) or the request_co_sign_off → co_sign gate
// (compliance-officer sign-off required before it leaves the building). Both
// paths converge on `submitted_to_fsca` — there is no third way in, so a
// report can never reach FSCA without either an explicit direct submission or
// a completed co-sign. co_sign is guarded by completenessEvidencePresent: a
// compliance officer cannot sign off a licence-compliance filing without a
// named completeness-evidence ref.
//
// FSCA may raise queries (answered via respond_to_queries) before reaching
// its filing decision, or decide straight off `submitted_to_fsca`. The
// decision is one of: file_clean (terminal — clean pass), flag_deficiency
// (routes to a remediation cycle that ends in refile, terminal), or
// flag_revocation_risk (terminal — FSP licence at risk), the last of which
// can also fire out of an in-flight remediation that isn't curing the issue.
//
// settles:false — this is a regulatory filing record (v1 quantumCol: null,
// no ZAR-at-risk column). It never moves money (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const fscaComplianceReport: ChainDecl = {
  key: 'fsca_compliance_report',
  noun: 'FSCA compliance report',
  refPrefix: 'FSCA',
  title: (f) =>
    `FSCA compliance report — ${(f.fsp_licence_number as string) ?? 'unlicensed'} (${(f.report_year as number) ?? 'year TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Advisory and Intermediary Services Act 37 of 2002', provision: 's17 FSP compliance reporting', effect: 'requires' },
    { instrument: 'Financial Sector Regulation Act 9 of 2017', provision: 's58 FSCA supervisory & enforcement powers', effect: 'requires' },
  ],
  roles: ['compliance', 'support', 'regulator', 'operator'],

  fields: {
    report_year: { type: 'number', label: 'Report year' },
    reporting_period_start: { type: 'string', label: 'Reporting period start' },
    reporting_period_end: { type: 'string', label: 'Reporting period end' },
    fsp_licence_number: { type: 'string', required: true, label: 'FSP licence number' },
    fsp_class: { type: 'string', label: 'FSP class (micro/standard/large/systemic)' },
    compliance_officer_name: { type: 'string', label: 'Compliance officer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'FSCA' },
    fsca_reference: { type: 'string', label: 'FSCA reference number' },
    completeness_ref: { type: 'string', label: 'Completeness-evidence ref' },
    query_note: { type: 'string', label: 'Query response summary' },
    deficiency_description: { type: 'string', label: 'Deficiency description' },
    remediation_plan: { type: 'string', label: 'Remediation plan' },
    remediation_deadline: { type: 'string', label: 'Remediation deadline' },
    revocation_risk_reason: { type: 'string', label: 'Revocation-risk basis' },
    // written by derive, never by the client
    period_opened_at: { type: 'string', label: 'Period opened at' },
    submitted_at: { type: 'string', label: 'Submitted to FSCA at' },
    filed_at: { type: 'string', label: 'Filed at' },
    deficiency_flagged_at: { type: 'string', label: 'Deficiency flagged at' },
    remediation_started_at: { type: 'string', label: 'Remediation started at' },
    refiled_at: { type: 'string', label: 'Refiled at' },
    revocation_flagged_at: { type: 'string', label: 'Revocation risk flagged at' },
  },

  initial: 'period_open',

  states: {
    period_open: { label: 'Reporting period open', terminal: false, holder: 'compliance', sla: { days: 14 } },
    drafting: { label: 'Drafting', terminal: false, holder: 'compliance', sla: { days: 21 } },
    internal_review: { label: 'Internal review', terminal: false, holder: 'compliance', sla: { days: 10 } },
    co_sign_pending: { label: 'Awaiting compliance-officer co-sign', terminal: false, holder: 'compliance', sla: { days: 5 } },
    submitted_to_fsca: { label: 'Submitted to FSCA', terminal: false, holder: 'regulator', sla: { days: 30 } },
    queries_answered: { label: 'Queries answered — awaiting filing decision', terminal: false, holder: 'regulator', sla: { days: 15 } },
    deficiency_flagged: { label: 'Deficiency flagged', terminal: false, holder: 'compliance', sla: { days: 5 } },
    remediation: { label: 'Remediation in progress', terminal: false, holder: 'compliance', sla: { days: 60 } },
    filed: { label: 'Filed clean', terminal: true, holder: 'none' },
    refiled: { label: 'Refiled after remediation', terminal: true, holder: 'none' },
    revocation_risk: { label: 'Licence revocation risk flagged', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open_period',
      from: '@new',
      to: 'period_open',
      by: ['compliance', 'operator'],
      actorBecomes: 'compliance',
      label: 'Open reporting period',
      intent: 'primary',
      input: {
        report_year: { type: 'number' },
        reporting_period_start: { type: 'string' },
        reporting_period_end: { type: 'string' },
        fsp_licence_number: { type: 'string', required: true },
        fsp_class: { type: 'string' },
        compliance_officer_name: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ period_opened_at: isoUtc(at) }),
    },
    {
      id: 'start_drafting',
      from: 'period_open',
      to: 'drafting',
      by: ['compliance', 'operator'],
      label: 'Start drafting',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_for_internal_review',
      from: 'drafting',
      to: 'internal_review',
      by: ['compliance', 'operator'],
      label: 'Submit for internal review',
      intent: 'primary',
      guards: [],
    },

    // --- two convergent doors into submitted_to_fsca ---------------------------
    {
      id: 'request_co_sign_off',
      from: 'internal_review',
      to: 'co_sign_pending',
      by: ['compliance', 'operator'],
      label: 'Request co-sign off',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_to_fsca',
      from: 'internal_review',
      to: 'submitted_to_fsca',
      by: ['compliance', 'operator'],
      label: 'Submit to FSCA directly',
      intent: 'primary',
      input: {
        fsca_reference: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      // the completeness sign-off gate: a compliance officer cannot co-sign a
      // licence-compliance filing without a named completeness-evidence ref.
      id: 'co_sign',
      from: 'co_sign_pending',
      to: 'submitted_to_fsca',
      by: ['compliance', 'operator'],
      label: 'Compliance-officer co-sign & submit',
      intent: 'primary',
      input: {
        fsca_reference: { type: 'string' },
        completeness_ref: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },

    {
      id: 'respond_to_queries',
      from: 'submitted_to_fsca',
      to: 'queries_answered',
      by: ['compliance', 'support', 'operator'],
      label: 'Respond to FSCA queries',
      intent: 'primary',
      input: { query_note: { type: 'string' } },
      guards: [],
    },

    // --- FSCA's filing decision — reachable straight off submission or after
    //     queries are answered; never before the report has actually crossed
    //     into the regulator's inbox. -----------------------------------------
    {
      id: 'file_clean',
      from: ['submitted_to_fsca', 'queries_answered'],
      to: 'filed',
      by: ['regulator', 'operator'],
      label: 'File clean',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ filed_at: isoUtc(at) }),
    },
    {
      id: 'flag_deficiency',
      from: ['submitted_to_fsca', 'queries_answered'],
      to: 'deficiency_flagged',
      by: ['regulator', 'operator'],
      label: 'Flag deficiency',
      intent: 'destructive',
      input: { deficiency_description: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ deficiency_flagged_at: isoUtc(at) }),
    },
    {
      id: 'flag_revocation_risk',
      from: ['submitted_to_fsca', 'queries_answered', 'remediation'],
      to: 'revocation_risk',
      by: ['regulator', 'operator'],
      label: 'Flag revocation risk',
      intent: 'destructive',
      input: { revocation_risk_reason: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ revocation_flagged_at: isoUtc(at) }),
    },

    // --- remediation cycle off a flagged deficiency -----------------------------
    {
      id: 'start_remediation',
      from: 'deficiency_flagged',
      to: 'remediation',
      by: ['compliance', 'operator'],
      label: 'Start remediation',
      intent: 'primary',
      input: {
        remediation_plan: { type: 'string', required: true },
        remediation_deadline: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ remediation_started_at: isoUtc(at) }),
    },
    {
      id: 'refile',
      from: 'remediation',
      to: 'refiled',
      by: ['compliance', 'operator'],
      label: 'Refile after remediation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ refiled_at: isoUtc(at) }),
    },
  ],
};
