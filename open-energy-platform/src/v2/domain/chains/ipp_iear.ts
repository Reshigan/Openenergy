// ipp_iear — an IPP's REIPPPP Independent Engineer annual performance review
// as data (W177; source table oe_ipp_ie_annual_reviews).
//
// A developer triggers the annual cycle, scopes it with the IE firm, submits
// data, and the IE firm runs fieldwork (inspection → analysis) to a draft
// report. The developer responds, the IE firm closes out its final review,
// and issues the report. From an issued report there are three forward
// branches — the ONLY paths out of report_issued: a clean close, a material
// finding that arms a remediation plan, or a serious finding escalated
// straight to lenders (NERSA s.34 notification). Both exit branches are
// structural dead ends — the register/lender-action work they trigger lives
// in a downstream chain, not here.
//
// The engagement is bilateral (developer vs the independent engineer firm):
// counterpartyDistinct on open stops an IPP "reviewing" itself — the "I" in
// IE only holds if the firm is a distinct legal entity. A large (≥100 MW)
// project's remediation finding needs the regulator already on the txn
// (regulatorPresentIfStrategic) — the "large+ projects" regulator-inbox
// crossing the legacy cascadeHint describes. Escalation to lenders crosses to
// the regulator inbox unconditionally (every tier) — that is cascade fan-out
// wiring, not a domain precondition, so it carries no guard here.
//
// settles:false — an IE annual review is an assurance/compliance record,
// never a payment (R-S5-1); quantumCol was null in the legacy descriptor too.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippIear: ChainDecl = {
  key: 'ipp_iear',
  noun: 'IE annual review',
  refPrefix: 'IEAR',
  title: (f) => `IE annual review ${(f.review_year as number) ?? ''} — ${(f.project_ref as string) ?? 'project'}`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement / PPA independent engineer annual performance review', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'generation licence performance & compliance reporting (s.34 escalation)', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'ie_firm', 'regulator', 'lender', 'admin'],

  fields: {
    review_ref: { type: 'string', label: 'Review reference' },
    project_ref: { type: 'string', required: true, label: 'Project reference' },
    review_year: { type: 'number', required: true, label: 'Review year' },
    capacity_mw: { type: 'number', min: 0, label: 'Project capacity (MW)' },
    focus_area: { type: 'string', label: 'Review focus area' },
    ipp_developer_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    ie_firm_party: { type: 'party', role: 'ie_firm', label: 'Independent engineer firm' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender' },
    notes: { type: 'string', label: 'Notes' },
    ipp_response_notes: { type: 'string', label: 'IPP response notes' },
    remediation_reason: { type: 'string', label: 'Findings / remediation scope' },
    // written by derive, never by the client
    review_triggered_at: { type: 'string', label: 'Review triggered at' },
    inspection_started_at: { type: 'string', label: 'Field inspection started at' },
    draft_report_issued_at: { type: 'string', label: 'Draft report issued at' },
    report_issued_at: { type: 'string', label: 'Report issued at' },
    remediation_required_at: { type: 'string', label: 'Remediation required at' },
    escalated_at: { type: 'string', label: 'Escalated to lenders at' },
    closed_at_iear: { type: 'string', label: 'Review closed at' },
  },

  initial: 'review_triggered',

  states: {
    review_triggered: { label: 'Review triggered', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    scope_definition: { label: 'Scope definition', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    data_submission: { label: 'Data submission', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    ie_field_inspection: { label: 'IE field inspection', terminal: false, holder: 'ie_firm', sla: { days: 15 } },
    ie_analysis: { label: 'IE analysis', terminal: false, holder: 'ie_firm', sla: { days: 10 } },
    draft_report_issued: { label: 'Draft report issued', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    ipp_response: { label: 'IPP response', terminal: false, holder: 'ie_firm', sla: { days: 5 } },
    ie_final_review: { label: 'IE final review', terminal: false, holder: 'ie_firm', sla: { days: 5 } },
    report_issued: { label: 'Report issued', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    review_closed: { label: 'Review closed', terminal: true, holder: 'none' },
    remediation_required: { label: 'Remediation required', terminal: true, holder: 'none' },
    escalated_to_lenders: { label: 'Escalated to lenders', terminal: true, holder: 'none' },
    review_lapsed: { label: 'Review lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'review_triggered',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Trigger annual review',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        review_year: { type: 'number', required: true },
        capacity_mw: { type: 'number', min: 0 },
        focus_area: { type: 'string' },
        ie_firm_party: { type: 'party', role: 'ie_firm' },
        regulator_party: { type: 'party', role: 'regulator' },
        lender_party: { type: 'party', role: 'lender' },
        notes: { type: 'string' },
      },
      // the IE must be a distinct entity from the developer it reviews — no
      // self-review.
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ review_triggered_at: isoUtc(at) }),
    },
    {
      id: 'define_scope',
      from: 'review_triggered',
      to: 'scope_definition',
      by: ['ipp_developer', 'admin'],
      label: 'Define review scope',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_data',
      from: 'scope_definition',
      to: 'data_submission',
      by: ['ipp_developer', 'admin'],
      label: 'Submit review data',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'commence_field_inspection',
      from: 'data_submission',
      to: 'ie_field_inspection',
      by: ['ipp_developer', 'admin'],
      label: 'Commence IE field inspection',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ inspection_started_at: isoUtc(at) }),
    },
    {
      id: 'complete_analysis',
      from: 'ie_field_inspection',
      to: 'ie_analysis',
      by: ['ipp_developer', 'admin'],
      label: 'Complete IE analysis',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'issue_draft_report',
      from: 'ie_analysis',
      to: 'draft_report_issued',
      by: ['ipp_developer', 'admin'],
      label: 'Issue draft report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ draft_report_issued_at: isoUtc(at) }),
    },
    {
      id: 'submit_ipp_response',
      from: 'draft_report_issued',
      to: 'ipp_response',
      by: ['ipp_developer', 'admin'],
      label: 'Submit IPP response',
      intent: 'primary',
      input: { ipp_response_notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'complete_final_review',
      from: 'ipp_response',
      to: 'ie_final_review',
      by: ['ipp_developer', 'admin'],
      label: 'Complete IE final review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'issue_report',
      from: 'ie_final_review',
      to: 'report_issued',
      by: ['ipp_developer', 'admin'],
      label: 'Issue report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ report_issued_at: isoUtc(at) }),
    },
    {
      // structural clean-pass gate: one of three edges out of report_issued.
      id: 'close_review',
      from: 'report_issued',
      to: 'review_closed',
      by: ['ipp_developer', 'admin'],
      label: 'Close review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_iear: isoUtc(at) }),
    },

    // --- exits (all three reachable only from report_issued) ------------------
    {
      // large (≥100 MW) projects need the regulator already on the txn before a
      // material finding can be recorded.
      id: 'require_remediation',
      from: 'report_issued',
      to: 'remediation_required',
      by: ['ipp_developer', 'admin'],
      label: 'Require remediation',
      intent: 'destructive',
      input: { remediation_reason: { type: 'string', required: true } },
      requiresReason: [
        'technical_underperformance',
        'financial_model_breach',
        'om_noncompliance',
        'grid_code_breach',
        'insurance_bond_shortfall',
        'documentation_gap',
      ],
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ remediation_required_at: isoUtc(at) }),
    },
    {
      id: 'escalate_to_lenders',
      from: 'report_issued',
      to: 'escalated_to_lenders',
      by: ['ipp_developer', 'admin'],
      label: 'Escalate to lenders',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
    {
      id: 'declare_lapsed',
      from: [
        'review_triggered',
        'scope_definition',
        'data_submission',
        'ie_field_inspection',
        'ie_analysis',
        'draft_report_issued',
        'ipp_response',
        'ie_final_review',
        'report_issued',
      ],
      to: 'review_lapsed',
      by: ['ipp_developer', 'admin'],
      label: 'Declare review lapsed',
      intent: 'destructive',
      requiresReason: ['sla_deadline_missed', 'ie_firm_withdrew', 'project_decommissioned', 'superseded_review'],
      guards: [],
    },
  ],
};
