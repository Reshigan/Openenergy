// market_conduct_exam — regulator-run market conduct examination as data.
//
// A conduct regulator schedules an examination against a traded entity (a
// trader), runs on-site fieldwork, issues findings, the entity submits and
// executes a remediation plan, and the exam is closed — or escalated to
// enforcement. Roles: regulator (the opener/examiner), entity (the examined
// trader, attached at @new so it can later submit remediation), operator.
//
// STRUCTURAL gate (no invented guard): findings can ONLY be issued from
// `fieldwork`, remediation can ONLY be submitted from `findings_issued`, and
// the satisfactory close can ONLY be reached from `remediation`. So findings
// are never issued before fieldwork happened, and an exam is never signed off
// "remediated" without the entity having actually filed a plan — the state
// graph enforces the supervisory sequence, not a guard.
//
// The one domain guard used is completenessEvidencePresent on issue_findings:
// findings cannot be issued without a named examination-completeness sign-off
// ref (the examiner certifies the exam was complete before adverse findings
// bind the entity). completeness_ref is intentionally NOT a required input —
// the guard, not input coercion, is what rejects its absence, so the rule is a
// business gate rather than a form-validation error.
//
// settles:false — an examination is a supervisory/oversight instrument. It
// moves no money; any administrative penalty is imposed on a separate
// enforcement chain (R-S5-1). Export always carries the record-only notice.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const marketConductExam: ChainDecl = {
  key: 'market_conduct_exam',
  noun: 'Market conduct examination',
  refPrefix: 'MCEX',
  title: (f) =>
    `Market conduct exam — ${(f.examined_entity_name as string) ?? 'unnamed entity'} (${(f.exam_type as string) ?? 'routine'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Sector Regulation Act 2017', provision: 's132 supervisory on-site inspection', effect: 'authorises' },
    { instrument: 'Financial Markets Act 2012', provision: 's6 market conduct supervision', effect: 'authorises' },
    { instrument: 'FSCA Conduct Standard', provision: 'examination findings & remediation', effect: 'requires' },
  ],
  roles: ['regulator', 'entity', 'operator'],

  fields: {
    exam_number: { type: 'string', label: 'Exam number' },
    examined_entity_name: { type: 'string', required: true, label: 'Examined entity' },
    entity_party: { type: 'party', role: 'entity', label: 'Examined entity (party)' },
    exam_type: { type: 'string', required: true, label: 'Type (routine/thematic/for_cause)' },
    exam_scope: { type: 'string', required: true, label: 'Scope' },
    notice_ref: { type: 'string', label: 'Examination notice ref' },
    completeness_ref: { type: 'string', label: 'Examination completeness sign-off ref' },
    findings_summary: { type: 'string', label: 'Findings summary' },
    finding_count: { type: 'number', min: 0, label: 'Number of findings' },
    remediation_plan_ref: { type: 'string', label: 'Remediation plan ref' },
    // written by derive, never by the client
    fieldwork_started_at: { type: 'string', label: 'Fieldwork started at' },
    findings_issued_at: { type: 'string', label: 'Findings issued at' },
    remediation_started_at: { type: 'string', label: 'Remediation started at' },
    closed_at_exam: { type: 'string', label: 'Examination closed at' },
  },

  initial: 'scheduled',

  states: {
    scheduled: { label: 'Scheduled', terminal: false, holder: 'entity', sla: { days: 14 } },
    fieldwork: { label: 'Fieldwork', terminal: false, holder: 'regulator', sla: { days: 30 } },
    findings_issued: { label: 'Findings issued', terminal: false, holder: 'entity', sla: { days: 30 } },
    remediation: { label: 'Remediation in progress', terminal: false, holder: 'entity', sla: { days: 90 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    referred_enforcement: { label: 'Referred to enforcement', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'scheduled',
      by: ['regulator', 'operator'],
      actorBecomes: 'regulator',
      label: 'Schedule examination',
      intent: 'primary',
      input: {
        examined_entity_name: { type: 'string', required: true },
        entity_party: { type: 'party', role: 'entity' },
        exam_type: { type: 'string', required: true },
        exam_scope: { type: 'string', required: true },
        notice_ref: { type: 'string' },
      },
      guards: [],
    },

    // --- supervisory sequence (structural gate) -------------------------------
    {
      id: 'commence_fieldwork',
      from: 'scheduled',
      to: 'fieldwork',
      by: ['regulator', 'operator', 'system'],
      label: 'Commence fieldwork',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ fieldwork_started_at: isoUtc(at) }),
    },
    {
      // ONLY edge into findings_issued, and only from fieldwork: findings can
      // never precede fieldwork. completeness_ref is optional-in-coercion so the
      // guard (not BAD_INPUT) rejects its absence.
      id: 'issue_findings',
      from: 'fieldwork',
      to: 'findings_issued',
      by: ['regulator'],
      label: 'Issue findings',
      intent: 'primary',
      input: {
        completeness_ref: { type: 'string' },
        findings_summary: { type: 'string', required: true },
        finding_count: { type: 'number', min: 0 },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ findings_issued_at: isoUtc(at) }),
    },
    {
      // entity is a live party (attached at @new), so it can act here.
      id: 'submit_remediation',
      from: 'findings_issued',
      to: 'remediation',
      by: ['entity'],
      label: 'Submit remediation plan',
      intent: 'primary',
      input: { remediation_plan_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ remediation_started_at: isoUtc(at) }),
    },
    {
      // findings inadequate/insufficient — bounce back for a revised plan.
      id: 'reject_remediation',
      from: 'remediation',
      to: 'findings_issued',
      by: ['regulator'],
      label: 'Reject remediation plan',
      intent: 'secondary',
      requiresReason: ['plan_inadequate', 'evidence_insufficient', 'timeline_unacceptable'],
      guards: [],
    },
    {
      // satisfactory close — only reachable from remediation (entity actually
      // filed and executed a plan).
      id: 'close',
      from: 'remediation',
      to: 'closed',
      by: ['regulator', 'operator'],
      label: 'Close (remediation accepted)',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_exam: isoUtc(at) }),
    },
    {
      // clean close straight from fieldwork — no adverse findings to remediate.
      id: 'close_clean',
      from: 'fieldwork',
      to: 'closed',
      by: ['regulator', 'operator'],
      label: 'Close (no adverse findings)',
      intent: 'secondary',
      requiresReason: ['no_adverse_findings', 'de_minimis', 'out_of_scope'],
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_exam: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'refer_enforcement',
      from: ['findings_issued', 'remediation'],
      to: 'referred_enforcement',
      by: ['regulator', 'system'],
      label: 'Refer to enforcement',
      intent: 'destructive',
      requiresReason: ['persistent_breach', 'remediation_failed', 'material_misconduct', 'non_cooperation'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['scheduled', 'fieldwork'],
      to: 'cancelled',
      by: ['regulator', 'operator'],
      label: 'Cancel examination',
      intent: 'destructive',
      requiresReason: ['duplicate_exam', 'jurisdiction_transfer', 'resource_constraint', 'superseded_by_thematic'],
      guards: [],
    },
  ],

  // SLA + response time-bars (aligned to the state slas —
  // ppa_contract/permit_to_work pattern): a scheduled exam auto-commences at its
  // 14-day sla; an entity that lets the 30-day findings-response bar lapse
  // surfaces for enforcement referral as non-cooperation.
  timers: [
    { onState: 'scheduled', after: { days: 14 }, fire: 'commence_fieldwork', kind: 'sla' },
    { onState: 'findings_issued', after: { days: 30 }, fire: 'refer_enforcement', kind: 'time_bar', reason: 'non_cooperation' },
  ],
};
