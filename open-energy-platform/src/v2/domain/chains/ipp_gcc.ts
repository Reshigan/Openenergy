// ipp_gcc — an IPP plant's NERSA Grid Code compliance assessment as data
// (W165: power quality / protection relay / fault-ride-through / reactive
// power / frequency response / earthing & bonding testing & certification).
//
// The developer opens an annual assessment, submits the report to NERSA, and
// the case resolves one of three ways: certify_compliant (clean pass),
// issue_non_compliance (adverse notice, terminal), or note_deficiency (fixable
// gap). A noted deficiency is NOT a dead end — submit_to_nersa is reachable
// from BOTH assessment_open and deficiency_noted, so re-verification after
// corrective action reuses the same edge; this is the "30-day corrective-action
// window before re-verification" from the legacy cascadeHint made structural,
// not a separate resubmit action.
//
// certify_compliant crosses the regulator inbox for utility/strategic plants
// (regulatorPresentIfStrategic reads capacity_mw ≥ 100). issue_non_compliance's
// legacy cascadeHint claims a regulator crossing "on every tier", but the guard
// registry has no always-require-regulator rule — that crossing is a cascade
// notification, not a structural gate, so guards stay empty there (judgment
// call, not an omission).
//
// A deficiency left unresolved for 30 days (the legacy deadlineCol's SLA
// concept) time-bars to a non-compliance notice automatically.
//
// settles:false — a grid-code compliance case is a certification record, never
// a payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippGcc: ChainDecl = {
  key: 'ipp_gcc',
  noun: 'IPP grid compliance assessment',
  refPrefix: 'GCC',
  title: (f) =>
    `GCC ${(f.assessment_year as number) ?? ''} — ${(f.compliance_category as string) ?? 'category'} (${(f.project_id as string) ?? 'project'})`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'grid-code compliance testing & certification', effect: 'requires' },
    { instrument: 'ERA 2006', provision: 'generation licence grid-code condition', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator', 'admin'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Project' },
    ipp_developer_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer (SPV)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    compliance_category: { type: 'string', required: true, label: 'Compliance category' },
    assessment_year: { type: 'number', required: true, label: 'Assessment year' },
    capacity_mw: { type: 'number', required: true, min: 0, label: 'Installed capacity (MW)' },
    nersa_reference: { type: 'string', label: 'NERSA reference' },
    deficiency_notes: { type: 'string', label: 'Deficiency notes' },
    notes: { type: 'string', label: 'Notes' },
    // derive-stamped timestamps
    submitted_at: { type: 'string', label: 'Submitted to NERSA at' },
    certified_at: { type: 'string', label: 'Certified compliant at' },
    non_compliant_at: { type: 'string', label: 'Non-compliance notice issued at' },
    deficiency_noted_at: { type: 'string', label: 'Deficiency noted at' },
  },

  initial: 'assessment_open',

  states: {
    assessment_open: { label: 'Assessment open', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    under_nersa_review: { label: 'Under NERSA review', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    deficiency_noted: { label: 'Deficiency noted', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    compliant: { label: 'Compliant', terminal: true, holder: 'none' },
    non_compliant_notice: { label: 'Non-compliance notice issued', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'assessment_open',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Open grid compliance assessment',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        compliance_category: { type: 'string', required: true },
        assessment_year: { type: 'number', required: true },
        capacity_mw: { type: 'number', required: true, min: 0 },
        nersa_reference: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
        notes: { type: 'string' },
      },
      guards: [],
    },
    {
      // reachable from assessment_open (first submission) AND deficiency_noted
      // (re-verification after corrective action) — one edge, no separate
      // "resubmit" action needed.
      id: 'submit_to_nersa',
      from: ['assessment_open', 'deficiency_noted'],
      to: 'under_nersa_review',
      by: ['ipp_developer', 'admin'],
      label: 'Submit to NERSA',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'certify_compliant',
      from: 'under_nersa_review',
      to: 'compliant',
      by: ['ipp_developer', 'admin'],
      label: 'Certify compliant',
      intent: 'primary',
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ certified_at: isoUtc(at) }),
    },
    {
      id: 'issue_non_compliance',
      from: 'under_nersa_review',
      to: 'non_compliant_notice',
      by: ['ipp_developer', 'admin'],
      label: 'Issue non-compliance',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ non_compliant_at: isoUtc(at) }),
    },
    {
      id: 'note_deficiency',
      from: 'under_nersa_review',
      to: 'deficiency_noted',
      by: ['ipp_developer', 'admin'],
      label: 'Note deficiency',
      intent: 'secondary',
      input: { deficiency_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ deficiency_noted_at: isoUtc(at) }),
    },

    // --- exits ------------------------------------------------------------
    {
      // fired by the 30-day corrective-action timer, never by hand — 'system'
      // in `by` mirrors that; a human can still force it early via the same edge.
      id: 'escalate_deficiency',
      from: 'deficiency_noted',
      to: 'non_compliant_notice',
      by: ['ipp_developer', 'admin', 'system'],
      label: 'Escalate unresolved deficiency',
      intent: 'destructive',
      requiresReason: ['corrective_action_expired'],
      guards: [],
      derive: (_f, at: Instant) => ({ non_compliant_at: isoUtc(at) }),
    },
  ],

  // corrective-action window: a deficiency unresolved for 30 days time-bars to
  // a non-compliance notice, mirroring the legacy deadlineCol (sla_due_at).
  timers: [{ onState: 'deficiency_noted', after: { days: 30 }, fire: 'escalate_deficiency', kind: 'time_bar', reason: 'corrective_action_expired' }],
};
