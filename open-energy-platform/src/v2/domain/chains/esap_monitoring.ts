// esap_monitoring — lender-side E&S (Environmental & Social Action Plan)
// monitoring cycle as data.
//
// A project-finance lender monitors a borrower's IFC Performance Standards /
// Equator Principles compliance across a cycle: issue the monitoring instruction
// → schedule + complete a site visit → identify actions → borrower submits a
// corrective action plan (CAP) → remediation → independent third-party review →
// close. (oe_esap_monitoring in the prod schema.)
//
// The assurance spine is STRUCTURAL, not a guard: closed_satisfactory leaves
// ONLY third_party_review / partial_close, and the only path into
// third_party_review is commission_review. A monitoring cycle therefore can
// NEVER be signed off satisfactory without an independent review having been
// commissioned — the state graph enforces it. The satisfactory-close edge is
// additionally guarded by completenessEvidencePresent: no sign-off without a
// named completeness-evidence reference (the TPA assurance ref).
//
// settles:false — E&S monitoring is a compliance control, never a payment
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure severity bucketing off the finding counts. No clock, no env.
const severityTier = (major: Json | undefined, minor: Json | undefined): string => {
  const m = typeof major === 'number' ? major : 0;
  const n = typeof minor === 'number' ? minor : 0;
  if (m > 0) return 'material';
  if (n > 0) return 'minor';
  return 'clean';
};

export const esapMonitoring: ChainDecl = {
  key: 'esap_monitoring',
  noun: 'ESAP monitoring cycle',
  refPrefix: 'EM',
  title: (f) =>
    `ESAP ${(f.esap_tier as string) ?? 'category'} monitoring — ${(f.site_name as string) ?? (f.project_ref as string) ?? 'project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'IFC Performance Standards 2012', provision: 'PS1 E&S management system + monitoring', effect: 'requires' },
    { instrument: 'Equator Principles IV', provision: 'Principle 9 independent monitoring & reporting', effect: 'requires' },
  ],
  roles: ['lender', 'borrower', 'auditor', 'regulator', 'operator'],

  fields: {
    monitoring_ref: { type: 'string', label: 'Monitoring reference' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender / PFI' },
    borrower_party: { type: 'party', role: 'borrower', label: 'Borrower' },
    project_ref: { type: 'string', label: 'Project reference' },
    facility_ref: { type: 'string', label: 'Credit facility reference' },
    loan_ref: { type: 'string', label: 'Loan agreement reference' },
    esap_tier: { type: 'string', required: true, label: 'ESAP tier (category_c/b/a/critical_ps)' },
    ep_category: { type: 'string', label: 'Equator category (A/B/C)' },
    ps_triggers: { type: 'string', label: 'IFC PS triggered (JSON array)' },
    monitoring_cycle: { type: 'string', label: 'Monitoring cycle' },
    site_name: { type: 'string', label: 'Site name' },
    site_location: { type: 'string', label: 'Site location' },
    auditor_name: { type: 'string', label: 'Auditor name' },
    auditor_firm: { type: 'string', label: 'Auditor firm' },
    visit_scheduled_date: { type: 'string', label: 'Visit scheduled date' },
    findings_summary: { type: 'string', label: 'Findings summary' },
    finding_count_major: { type: 'number', min: 0, label: 'Major findings' },
    finding_count_minor: { type: 'number', min: 0, label: 'Minor findings' },
    severity_tier: { type: 'string', label: 'Severity tier' },
    cap_reference: { type: 'string', label: 'CAP reference' },
    cap_due_date: { type: 'string', label: 'CAP due date' },
    tpa_firm: { type: 'string', label: 'Third-party assurance firm' },
    tpa_ref: { type: 'string', label: 'TPA reference' },
    tpa_outcome: { type: 'string', label: 'TPA outcome (satisfactory/conditional/unsatisfactory)' },
    completeness_ref: { type: 'string', label: 'Completeness-evidence ref' },
    // written by derive, never by the client
    visit_completed_at: { type: 'string', label: 'Visit completed at' },
    cap_submitted_at: { type: 'string', label: 'CAP submitted at' },
    remediation_started_at: { type: 'string', label: 'Remediation started at' },
    closed_at_esap: { type: 'string', label: 'Cycle closed at' },
  },

  initial: 'esap_issued',

  states: {
    esap_issued: { label: 'ESAP issued', terminal: false, holder: 'lender', sla: { days: 30 } },
    site_visit_scheduled: { label: 'Site visit scheduled', terminal: false, holder: 'auditor', sla: { days: 14 } },
    site_visit_completed: { label: 'Site visit completed', terminal: false, holder: 'lender', sla: { days: 7 } },
    action_identified: { label: 'Action identified', terminal: false, holder: 'borrower', sla: { days: 14 } },
    corrective_action_plan: { label: 'Corrective action plan', terminal: false, holder: 'borrower', sla: { days: 30 } },
    remediation_in_progress: { label: 'Remediation in progress', terminal: false, holder: 'borrower', sla: { days: 90 } },
    third_party_review: { label: 'Third-party review', terminal: false, holder: 'lender', sla: { days: 30 } },
    partial_close: { label: 'Partial close', terminal: false, holder: 'lender', sla: { days: 60 } },
    closed_satisfactory: { label: 'Closed — satisfactory', terminal: true, holder: 'none' },
    closed_escalated: { label: 'Closed — escalated', terminal: true, holder: 'none' },
    non_compliant: { label: 'Non-compliant', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'esap_issued',
      by: ['lender', 'operator'],
      actorBecomes: 'lender',
      label: 'Issue ESAP monitoring',
      intent: 'primary',
      input: {
        project_ref: { type: 'string' },
        facility_ref: { type: 'string' },
        loan_ref: { type: 'string' },
        esap_tier: { type: 'string', required: true },
        ep_category: { type: 'string' },
        ps_triggers: { type: 'string' },
        monitoring_cycle: { type: 'string' },
        site_name: { type: 'string' },
        site_location: { type: 'string' },
        borrower_party: { type: 'party', role: 'borrower' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'schedule_site_visit',
      from: 'esap_issued',
      to: 'site_visit_scheduled',
      by: ['lender', 'auditor', 'operator'],
      label: 'Schedule site visit',
      intent: 'primary',
      input: {
        auditor_name: { type: 'string' },
        auditor_firm: { type: 'string' },
        visit_scheduled_date: { type: 'string', required: true },
      },
      guards: [],
    },
    {
      id: 'complete_site_visit',
      from: 'site_visit_scheduled',
      to: 'site_visit_completed',
      by: ['lender', 'auditor'],
      label: 'Complete site visit',
      intent: 'primary',
      input: {
        findings_summary: { type: 'string' },
        finding_count_major: { type: 'number', min: 0 },
        finding_count_minor: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f, at: Instant) => ({
        severity_tier: severityTier(f.finding_count_major, f.finding_count_minor),
        visit_completed_at: isoUtc(at),
      }),
    },
    {
      id: 'identify_action',
      from: 'site_visit_completed',
      to: 'action_identified',
      by: ['lender', 'auditor'],
      label: 'Identify corrective action',
      intent: 'primary',
      input: { findings_summary: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'submit_cap',
      from: 'action_identified',
      to: 'corrective_action_plan',
      by: ['borrower', 'lender', 'operator'],
      label: 'Submit corrective action plan',
      intent: 'primary',
      input: {
        cap_reference: { type: 'string', required: true },
        cap_due_date: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ cap_submitted_at: isoUtc(at) }),
    },
    {
      id: 'start_remediation',
      from: 'corrective_action_plan',
      to: 'remediation_in_progress',
      by: ['borrower', 'lender', 'operator'],
      label: 'Start remediation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ remediation_started_at: isoUtc(at) }),
    },
    {
      // structural assurance gate: the ONLY edge into third_party_review. A clean
      // visit (no findings) can go straight here; a remediated one arrives after
      // start_remediation. Either way, closed_satisfactory only leaves here.
      id: 'commission_review',
      from: ['site_visit_completed', 'remediation_in_progress'],
      to: 'third_party_review',
      by: ['lender', 'operator'],
      label: 'Commission third-party review',
      intent: 'primary',
      input: {
        tpa_firm: { type: 'string', required: true },
        tpa_ref: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'partial_close',
      from: 'third_party_review',
      to: 'partial_close',
      by: ['lender'],
      label: 'Partial close (items outstanding)',
      intent: 'secondary',
      requiresReason: ['minor_items_open', 'monitoring_continues', 'phased_remediation'],
      guards: [],
    },
    {
      id: 'resume_remediation',
      from: 'partial_close',
      to: 'remediation_in_progress',
      by: ['lender', 'borrower'],
      label: 'Resume remediation',
      intent: 'primary',
      guards: [],
    },
    {
      // structural + guarded close: reachable ONLY from an independent review, and
      // needs a named completeness-evidence ref (the TPA assurance sign-off).
      id: 'close_satisfactory',
      from: ['third_party_review', 'partial_close'],
      to: 'closed_satisfactory',
      by: ['lender'],
      label: 'Close — satisfactory',
      intent: 'primary',
      // completeness_ref is enforced by completenessEvidencePresent (not a
      // required-input coercion) so the guard is the single source of the rule.
      input: {
        completeness_ref: { type: 'string' },
        tpa_outcome: { type: 'string' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ closed_at_esap: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'escalate',
      from: [
        'site_visit_completed',
        'action_identified',
        'corrective_action_plan',
        'remediation_in_progress',
        'third_party_review',
        'partial_close',
      ],
      to: 'closed_escalated',
      by: ['lender', 'regulator', 'system'],
      label: 'Escalate to lender committee / regulator',
      intent: 'destructive',
      requiresReason: ['cap_overdue', 'remediation_stalled', 'material_breach', 'covenant_trigger'],
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_esap: isoUtc(at) }),
    },
    {
      id: 'flag_non_compliant',
      from: ['remediation_in_progress', 'third_party_review', 'partial_close'],
      to: 'non_compliant',
      by: ['lender', 'regulator'],
      label: 'Flag non-compliant',
      intent: 'destructive',
      requiresReason: ['unsatisfactory_tpa', 'ps_breach_unresolved', 'irremediable_harm'],
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_esap: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['esap_issued', 'site_visit_scheduled'],
      to: 'withdrawn',
      by: ['lender'],
      label: 'Withdraw monitoring cycle',
      intent: 'destructive',
      requiresReason: ['loan_repaid', 'cycle_superseded', 'project_cancelled'],
      guards: [],
    },
  ],

  // remediation time-bar: a corrective action plan left un-remediated past its
  // due date escalates. record-only stub; the sweep computes the real bar off the
  // state sla days (permit_to_work pattern).
  timers: [{ onState: 'remediation_in_progress', after: { days: 90 }, fire: 'escalate', kind: 'time_bar', reason: 'remediation_stalled' }],
};
