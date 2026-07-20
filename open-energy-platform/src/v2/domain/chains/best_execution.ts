// best_execution — periodic best-execution attestation lifecycle as data.
//
// A trader drafts a best-execution review over a period, submits it, and
// compliance reviews it. Compliance either ATTESTS (best execution demonstrated)
// or FLAGS a deficiency, which routes the record through remediation and back
// for re-review. The regulator is a party for supervisory visibility.
//
// STRUCTURAL SEPARATION-OF-DUTIES GATE: the only edge into `attested` is
// `attest`, and it fires ONLY from `under_review`, an edge held by
// compliance/operator — never the trader. So a record cannot be attested by the
// author, and a FLAGGED record cannot be attested without first being remediated
// (remediation → submitted → under_review). The graph enforces the four-eyes
// rule; no guard is needed and none in the registry expresses it.
//
// settles:false — an attestation is a regulatory conduct control, never a
// payment. Money never moves through this chain (R-S5-1); export always carries
// the record-only notice.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const bestExecution: ChainDecl = {
  key: 'best_execution',
  noun: 'Best-execution attestation',
  refPrefix: 'BEXE',
  title: (f) => `Best-execution — ${(f.period as string) ?? 'unnamed period'} (${(f.desk as string) ?? 'desk'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'FMA 2012', provision: 's — fair treatment & market conduct', effect: 'requires' },
    { instrument: 'FSCA Conduct Standard', provision: 'best execution of client orders', effect: 'requires' },
    { instrument: 'JSE Equities Rules', provision: 'order handling & execution', effect: 'requires' },
  ],
  roles: ['trader', 'compliance', 'regulator', 'operator'],

  fields: {
    desk: { type: 'string', required: true, label: 'Trading desk' },
    period: { type: 'string', required: true, label: 'Review period (e.g. 2026-Q2)' },
    order_count: { type: 'number', min: 0, label: 'Orders reviewed' },
    venue_summary: { type: 'string', label: 'Execution-venue summary' },
    compliance_party: { type: 'party', role: 'compliance', label: 'Reviewing compliance officer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Supervising regulator' },
    flag_finding_ref: { type: 'string', label: 'Deficiency finding ref' },
    remediation_ref: { type: 'string', label: 'Remediation evidence ref' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted at' },
    attested_at: { type: 'string', label: 'Attested at' },
  },

  initial: 'drafted',

  states: {
    drafted: { label: 'Drafted', terminal: false, holder: 'trader', sla: { days: 5 } },
    submitted: { label: 'Submitted', terminal: false, holder: 'compliance', sla: { days: 3 } },
    under_review: { label: 'Under review', terminal: false, holder: 'compliance', sla: { days: 5 } },
    flagged: { label: 'Flagged — deficiency', terminal: false, holder: 'trader', sla: { days: 10 } },
    remediation: { label: 'In remediation', terminal: false, holder: 'trader', sla: { days: 15 } },
    attested: { label: 'Attested', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    // --- creation -----------------------------------------------------------
    {
      id: 'open',
      from: '@new',
      to: 'drafted',
      by: ['trader', 'operator'],
      actorBecomes: 'trader',
      label: 'Draft attestation',
      intent: 'primary',
      input: {
        desk: { type: 'string', required: true },
        period: { type: 'string', required: true },
        order_count: { type: 'number', min: 0 },
        venue_summary: { type: 'string' },
        // parties attach only at @new — compliance/regulator must be named here
        // to hold live roles on the review/attest edges downstream.
        compliance_party: { type: 'party', role: 'compliance' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },

    // --- happy path ---------------------------------------------------------
    {
      id: 'submit',
      from: 'drafted',
      to: 'submitted',
      by: ['trader', 'operator'],
      label: 'Submit for review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'begin_review',
      from: 'submitted',
      to: 'under_review',
      by: ['compliance', 'operator', 'system'],
      label: 'Begin review',
      intent: 'primary',
      guards: [],
    },
    {
      // structural four-eyes gate: ONLY edge into `attested`, and it fires ONLY
      // from `under_review` (a compliance-held state). The trader who authored
      // and submitted the record can never reach it.
      id: 'attest',
      from: 'under_review',
      to: 'attested',
      by: ['compliance', 'operator'],
      label: 'Attest best execution',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ attested_at: isoUtc(at) }),
    },

    // --- deficiency / remediation loop -------------------------------------
    {
      id: 'flag',
      from: 'under_review',
      to: 'flagged',
      by: ['compliance', 'operator'],
      label: 'Flag deficiency',
      intent: 'destructive',
      input: { flag_finding_ref: { type: 'string', required: true } },
      requiresReason: ['venue_selection', 'price_improvement_missed', 'insufficient_evidence', 'policy_breach'],
      guards: [],
    },
    {
      id: 'begin_remediation',
      from: 'flagged',
      to: 'remediation',
      by: ['trader', 'operator'],
      label: 'Begin remediation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'resubmit',
      from: 'remediation',
      to: 'submitted',
      by: ['trader', 'operator'],
      label: 'Resubmit after remediation',
      intent: 'primary',
      input: { remediation_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'reject',
      from: ['under_review', 'flagged'],
      to: 'rejected',
      by: ['compliance', 'operator', 'system'],
      label: 'Reject attestation',
      intent: 'destructive',
      requiresReason: ['systemic_failure', 'unremediable', 'material_misstatement', 'remediation_deadline_missed'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['submitted', 'flagged', 'remediation'],
      to: 'withdrawn',
      by: ['trader', 'operator'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['superseded', 'data_error', 'reissued'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['drafted'],
      to: 'cancelled',
      by: ['trader', 'operator'],
      label: 'Cancel draft',
      intent: 'destructive',
      requiresReason: ['duplicate', 'not_required', 'period_merged'],
      guards: [],
    },
  ],

  timers: [
    // a submitted attestation left unreviewed for 5 days breaches the conduct SLA;
    // a flagged record left un-remediated for 30 days time-bars into rejection.
    { onState: 'submitted', after: { days: 5 }, fire: 'begin_review', kind: 'sla' },
    { onState: 'flagged', after: { days: 30 }, fire: 'reject', kind: 'time_bar', reason: 'remediation_deadline_missed' },
  ],
};
