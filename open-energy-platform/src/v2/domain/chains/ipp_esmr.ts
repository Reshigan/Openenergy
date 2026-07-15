// ipp_esmr — IPP DFI Environmental & Social Monitoring Report (ESMR) cycle
// as data. (oe_ipp_esmr in the prod schema, W176.)
//
// A DFI-financed IPP opens a reporting period, submits its periodic E&S
// monitoring report, and the period resolves one of three ways: a clean
// compliance certificate (satisfies the DFI loan covenant), a withheld
// certificate (an unresolved lender-TA concern — requiresReason), or a
// declared material E&S breach against an IFC Performance Standard
// (requiresReason, and can be raised even before a report is submitted — a
// breach doesn't wait for the reporting cadence).
//
// issue_certificate is guarded by completenessEvidencePresent: you cannot
// close a covenant-satisfying certificate without a named completeness ref —
// the same rule esap_monitoring and audit.ts apply to their sign-offs.
//
// settles:false — an E&S monitoring report is a lender compliance record,
// never a payment (R-S5-1). loan_size_zar sizes the covenant exposure, it
// does not move here.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippEsmr: ChainDecl = {
  key: 'ipp_esmr',
  noun: 'IPP DFI E&S monitoring report',
  refPrefix: 'ESMR',
  title: (f) => `ESMR ${(f.reporting_period as string) ?? ''} — ${(f.project_ref as string) ?? 'project'}`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'IFC Performance Standards 2012', provision: 'PS1 E&S management system + monitoring', effect: 'requires' },
    { instrument: 'Equator Principles IV', provision: 'Principle 9 independent monitoring & reporting', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin'],

  fields: {
    ipp_developer_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer (SPV)' },
    project_ref: { type: 'string', required: true, label: 'Project reference' },
    reporting_period: { type: 'string', required: true, label: 'Reporting period' },
    loan_size_zar: { type: 'number', min: 0, label: 'DFI loan size (ZAR)' },
    dfi_names: { type: 'string', label: 'DFI names' },
    lender_ta_ref: { type: 'string', label: 'Lender technical advisor reference' },
    notes: { type: 'string', label: 'Notes' },
    withholding_basis: { type: 'string', label: 'Withholding basis' },
    breach_detail: { type: 'string', label: 'Breach detail' },
    completeness_ref: { type: 'string', label: 'Completeness-evidence ref' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Report submitted at' },
    certificate_issued_at: { type: 'string', label: 'Certificate issued at' },
    certificate_withheld_at: { type: 'string', label: 'Certificate withheld at' },
    breach_declared_at: { type: 'string', label: 'Material breach declared at' },
  },

  initial: 'reporting_period_open',

  states: {
    reporting_period_open: { label: 'Reporting period open', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    report_submitted: { label: 'Report submitted', terminal: false, holder: 'admin', sla: { days: 14 } },
    certificate_issued: { label: 'Certificate issued', terminal: true, holder: 'none' },
    certificate_withheld: { label: 'Certificate withheld', terminal: true, holder: 'none' },
    material_breach_declared: { label: 'Material breach declared', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'reporting_period_open',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Open reporting period',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        reporting_period: { type: 'string', required: true },
        loan_size_zar: { type: 'number', min: 0 },
        dfi_names: { type: 'string' },
        lender_ta_ref: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'submit_report',
      from: 'reporting_period_open',
      to: 'report_submitted',
      by: ['ipp_developer', 'admin'],
      label: 'Submit report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      // covenant-satisfying close: needs a named completeness-evidence ref, not
      // just the submission — you cannot certify a report you never checked.
      id: 'issue_certificate',
      from: 'report_submitted',
      to: 'certificate_issued',
      by: ['ipp_developer', 'admin'],
      label: 'Issue certificate',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ certificate_issued_at: isoUtc(at) }),
    },
    {
      id: 'withhold_certificate',
      from: 'report_submitted',
      to: 'certificate_withheld',
      by: ['ipp_developer', 'admin'],
      label: 'Withhold certificate',
      intent: 'destructive',
      input: { withholding_basis: { type: 'string', required: true } },
      requiresReason: ['evidence_insufficient', 'unresolved_finding', 'documentation_deficient', 'lender_ta_review_pending'],
      guards: [],
      derive: (_f, at: Instant) => ({ certificate_withheld_at: isoUtc(at) }),
    },
    {
      // a material breach doesn't wait for the reporting cadence — it can be
      // raised straight off an open period, or off a submitted report.
      id: 'declare_material_breach',
      from: ['reporting_period_open', 'report_submitted'],
      to: 'material_breach_declared',
      by: ['ipp_developer', 'admin'],
      label: 'Declare material breach',
      intent: 'destructive',
      input: { breach_detail: { type: 'string', required: true } },
      requiresReason: [
        'ps1_assessment', 'ps2_labour', 'ps3_pollution', 'ps4_community_health',
        'ps5_land_acquisition', 'ps6_biodiversity', 'ps7_indigenous', 'ps8_cultural',
      ],
      guards: [],
      derive: (_f, at: Instant) => ({ breach_declared_at: isoUtc(at) }),
    },
  ],

  // no timers: the legacy sla_due_date is loan-size-inverted (bigger loan ⇒
  // shorter SLA), which a fixed TimerDecl Duration can't express — omitted
  // rather than guessed, per the timer-audit bundle test's hard constraints.
};
