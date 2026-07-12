// cbt_sed — REIPPPP annual Community Benefit Trust / Socio-Economic
// Development report lifecycle as data.
//
// An IPP (REIPPPP project company) files an annual CBT/SED report against a
// reporting year; the DMRE reviews it → queries → approve / non-compliant →
// remediation → escalation to Enforcement / BBBEE Commission. The integrity
// spine is structural: `approve` leaves ONLY under_review, and the ONLY path
// into under_review is through `submitted` (begin_review). So a report can
// NEVER be approved without first being submitted to the DMRE — no guard
// needed, the state graph enforces it. `cancel` likewise fires only from the
// pre-submission states, so a submitted report can't be quietly voided.
//
// The DMRE (regulator) attaches as a party at '@new' (regulator_party) so it
// can act on the review edges; the IPP is the opener (actorBecomes 'ipp').
//
// One genuine guard: a DMRE submission needs a named completeness sign-off
// (completenessEvidencePresent) — the report can't go in half-populated.
//
// settles:false — a compliance report is a regulatory control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure REIPPPP local-content bucketing off the reported percentage. The Round
// 4+ threshold sits around 40%; below reads as a shortfall the DMRE flags.
// No clock, no env.
const localContentTier = (pct: Json | undefined): string => {
  if (typeof pct !== 'number') return 'unassessed';
  if (pct >= 40) return 'met';
  return 'below_threshold';
};

export const cbtSed: ChainDecl = {
  key: 'cbt_sed',
  noun: 'CBT/SED annual report',
  refPrefix: 'CS',
  title: (f) =>
    `${(f.reipppp_bid_window as string) ?? 'BW?'} CBT/SED ${(f.reporting_year as number) ?? '????'} — ${(f.project_name as string) ?? 'unnamed project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Implementation Agreement', provision: 'Economic Development obligations (SED / CBT)', effect: 'requires' },
    { instrument: 'B-BBEE Act 2013', provision: 's13G socio-economic development reporting', effect: 'requires' },
  ],
  roles: ['ipp', 'regulator', 'operator'],

  fields: {
    ipp_party: { type: 'party', role: 'ipp', label: 'IPP / project company' },
    regulator_party: { type: 'party', role: 'regulator', label: 'DMRE' },
    project_name: { type: 'string', required: true, label: 'REIPPPP project name' },
    reipppp_bid_window: { type: 'string', required: true, label: 'Bid window (BW1..BW6)' },
    reporting_year: { type: 'number', required: true, label: 'Reporting year' },
    cbt_disbursement_tier: { type: 'string', required: true, label: 'Disbursement tier (micro/small/medium/major)' },

    // CBT trust details
    trust_registration_number: { type: 'string', label: 'Trust registration number' },
    beneficiary_community: { type: 'string', label: 'Beneficiary community / ward' },
    beneficiary_count: { type: 'number', min: 0, label: 'Registered beneficiaries' },
    cbt_equity_percentage: { type: 'number', min: 0, max: 100, label: 'CBT equity in SPV (%)' },

    // financial reporting (ZAR)
    annual_cbt_disbursement_zar: { type: 'number', min: 0, label: 'Annual CBT disbursement (ZAR)' },
    cumulative_cbt_disbursement_zar: { type: 'number', min: 0, label: 'Cumulative CBT disbursement (ZAR)' },
    sed_spend_zar: { type: 'number', min: 0, label: 'SED spend (ZAR)' },
    sed_spend_percentage: { type: 'number', min: 0, label: 'SED spend (% of revenue)' },
    local_content_percentage: { type: 'number', min: 0, max: 100, label: 'Local content (%)' },
    local_content_status: { type: 'string', label: 'Local content status' },

    // documentary trail
    completeness_ref: { type: 'string', label: 'Completeness sign-off ref' },
    report_ref: { type: 'string', label: 'DMRE submission ref' },
    queries_ref: { type: 'string', label: 'DMRE query ref' },
    remediation_plan_ref: { type: 'string', label: 'Remediation plan ref' },

    // written by derive, never by the client
    drafted_at: { type: 'string', label: 'Drafted at' },
    submitted_at: { type: 'string', label: 'Submitted at' },
    approved_at: { type: 'string', label: 'Approved at' },
  },

  initial: 'reporting_period_open',

  states: {
    reporting_period_open: { label: 'Reporting period open', terminal: false, holder: 'ipp', sla: { days: 30 } },
    data_collection: { label: 'Data collection', terminal: false, holder: 'ipp', sla: { days: 30 } },
    report_drafted: { label: 'Report drafted', terminal: false, holder: 'ipp', sla: { days: 14 } },
    submitted: { label: 'Submitted to DMRE', terminal: false, holder: 'regulator', sla: { days: 60 } },
    under_review: { label: 'Under DMRE review', terminal: false, holder: 'regulator', sla: { days: 45 } },
    queries_issued: { label: 'Queries issued', terminal: false, holder: 'ipp', sla: { days: 21 } },
    response_submitted: { label: 'Query response submitted', terminal: false, holder: 'regulator', sla: { days: 30 } },
    non_compliant: { label: 'Non-compliant', terminal: false, holder: 'ipp', sla: { days: 30 } },
    remediation_submitted: { label: 'Remediation submitted', terminal: false, holder: 'regulator', sla: { days: 45 } },
    approved: { label: 'Approved', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
    escalated: { label: 'Escalated', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'reporting_period_open',
      by: ['ipp', 'operator'],
      actorBecomes: 'ipp',
      label: 'Open reporting period',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        reipppp_bid_window: { type: 'string', required: true },
        reporting_year: { type: 'number', required: true },
        cbt_disbursement_tier: { type: 'string', required: true },
        beneficiary_community: { type: 'string' },
        trust_registration_number: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_collection',
      from: 'reporting_period_open',
      to: 'data_collection',
      by: ['ipp'],
      label: 'Begin data collection',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'draft_report',
      from: 'data_collection',
      to: 'report_drafted',
      by: ['ipp'],
      label: 'Draft annual report',
      intent: 'primary',
      input: {
        beneficiary_count: { type: 'number', min: 0 },
        cbt_equity_percentage: { type: 'number', min: 0, max: 100 },
        annual_cbt_disbursement_zar: { type: 'number', min: 0 },
        cumulative_cbt_disbursement_zar: { type: 'number', min: 0 },
        sed_spend_zar: { type: 'number', min: 0 },
        sed_spend_percentage: { type: 'number', min: 0 },
        local_content_percentage: { type: 'number', min: 0, max: 100 },
      },
      guards: [],
      derive: (f, at: Instant) => ({
        local_content_status: localContentTier(f.local_content_percentage),
        drafted_at: isoUtc(at),
      }),
    },
    {
      // structural gate: the only path into DMRE review starts here, and
      // `approve` leaves only under_review — so no report reaches `approved`
      // without passing through `submitted`. A DMRE submission also needs a
      // named completeness sign-off (completenessEvidencePresent).
      id: 'submit_report',
      from: 'report_drafted',
      to: 'submitted',
      by: ['ipp'],
      label: 'Submit to DMRE',
      intent: 'primary',
      input: {
        completeness_ref: { type: 'string', required: true },
        report_ref: { type: 'string', required: true },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'begin_review',
      from: 'submitted',
      to: 'under_review',
      by: ['regulator'],
      label: 'Begin DMRE review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'issue_queries',
      from: 'under_review',
      to: 'queries_issued',
      by: ['regulator'],
      label: 'Issue queries',
      intent: 'secondary',
      input: { queries_ref: { type: 'string', required: true } },
      requiresReason: ['disbursement_variance', 'local_content_shortfall', 'trust_governance', 'evidence_gap', 'beneficiary_dispute'],
      guards: [],
    },
    {
      id: 'respond_queries',
      from: 'queries_issued',
      to: 'response_submitted',
      by: ['ipp'],
      label: 'Submit query response',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'resume_review',
      from: 'response_submitted',
      to: 'under_review',
      by: ['regulator'],
      label: 'Resume review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'approve',
      from: 'under_review',
      to: 'approved',
      by: ['regulator'],
      label: 'Approve report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'submit_remediation',
      from: 'non_compliant',
      to: 'remediation_submitted',
      by: ['ipp'],
      label: 'Submit remediation plan',
      intent: 'primary',
      input: { remediation_plan_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'review_remediation',
      from: 'remediation_submitted',
      to: 'under_review',
      by: ['regulator'],
      label: 'Review remediation',
      intent: 'primary',
      guards: [],
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'find_non_compliant',
      from: ['under_review', 'response_submitted'],
      to: 'non_compliant',
      by: ['regulator'],
      label: 'Find non-compliant',
      intent: 'destructive',
      requiresReason: ['disbursement_shortfall', 'sed_underspend', 'local_content_failure', 'trust_maladministration', 'no_beneficiary_benefit'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['reporting_period_open', 'data_collection', 'report_drafted'],
      to: 'cancelled',
      by: ['ipp', 'operator'],
      label: 'Cancel report',
      intent: 'destructive',
      requiresReason: ['duplicate', 'project_decommissioned', 'reporting_year_error', 'superseded'],
      guards: [],
    },
    {
      id: 'escalate',
      from: ['queries_issued', 'under_review', 'non_compliant', 'remediation_submitted'],
      to: 'escalated',
      by: ['regulator'],
      label: 'Escalate to Enforcement / BBBEE Commission',
      intent: 'destructive',
      requiresReason: ['persistent_non_compliance', 'no_response', 'remediation_rejected', 'material_misstatement'],
      guards: [],
    },
  ],

  // query-response time-bar: an unanswered DMRE query stales out and escalates.
  // record-only stub; the sweep computes the real bar off state sla days.
  timers: [{ onState: 'queries_issued', after: { days: 0 }, fire: 'escalate', kind: 'time_bar' }],
};
