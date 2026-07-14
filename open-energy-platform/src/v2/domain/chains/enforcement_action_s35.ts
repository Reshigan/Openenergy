// enforcement_action_s35 — NERSA enforcement action under ERA 2006 s35, as data.
//
// The regulator serves a compliance/enforcement notice on a licensee
// (respondent) for a contravention. The respondent may make representations;
// the regulator reviews them and then makes a determination (penalty /
// directive), orders remediation, and closes on compliance — or refers the
// matter for prosecution.
//
// The natural-justice spine is STRUCTURAL, not a guard: make_determination
// leaves ONLY under_review, and the ONLY paths into under_review are
// begin_review (from representations_made) and note_lapsed (representation
// period expired). So a determination can NEVER be imposed straight off the
// notice — the respondent must always be afforded representations first (audi
// alteram partem). No guard needed; the state graph enforces it.
//
// settles:false — an enforcement action is a regulatory control, never a
// payment. A penalty amount is a determination *field*, not custody or a
// settled transfer (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const enforcementActionS35: ChainDecl = {
  key: 'enforcement_action_s35',
  noun: 'Enforcement action (ERA s35)',
  refPrefix: 'EAS',
  title: (f) =>
    `s35 enforcement — ${(f.respondent_name as string) ?? 'respondent'} (${(f.contravention as string) ?? 'contravention'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Electricity Regulation Act 2006', provision: 's35 enforcement of licence conditions', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'compliance & directives', effect: 'requires' },
    { instrument: 'PAJA 2000', provision: 's3 procedurally fair administrative action', effect: 'requires' },
  ],
  roles: ['regulator', 'respondent'],

  fields: {
    action_number: { type: 'string', label: 'Action number' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    respondent_party: { type: 'party', role: 'respondent', label: 'Respondent (licensee)' },
    respondent_name: { type: 'string', required: true, label: 'Respondent name' },
    licence_ref: { type: 'string', label: 'Licence ref' },
    contravention: { type: 'string', required: true, label: 'Contravention (s35)' },
    statutory_provision: { type: 'string', label: 'Statutory provision breached' },
    notice_ref: { type: 'string', label: 'Notice ref' },
    severity: { type: 'string', label: 'Severity (minor/material/serious)' },
    representations_ref: { type: 'string', label: 'Representations ref' },
    finding: { type: 'string', label: 'Determination finding' },
    penalty_amount_zar: { type: 'number', min: 0, label: 'Penalty (ZAR)' },
    directive_ref: { type: 'string', label: 'Directive ref' },
    remediation_deadline: { type: 'string', label: 'Remediation deadline' },
    // written by derive, never by the client
    notice_served_at: { type: 'string', label: 'Notice served at' },
    determination_at: { type: 'string', label: 'Determination made at' },
    closed_at_action: { type: 'string', label: 'Action closed at' },
  },

  initial: 'notice_issued',

  states: {
    notice_issued: { label: 'Notice issued', terminal: false, holder: 'respondent', sla: { days: 30 } },
    representations_made: { label: 'Representations made', terminal: false, holder: 'regulator', sla: { days: 14 } },
    under_review: { label: 'Under review', terminal: false, holder: 'regulator', sla: { days: 30 } },
    determination_made: { label: 'Determination made', terminal: false, holder: 'respondent', sla: { days: 7 } },
    remediation_pending: { label: 'Remediation pending', terminal: false, holder: 'respondent', sla: { days: 60 } },
    action_closed: { label: 'Action closed (complied)', terminal: true, holder: 'none' },
    dismissed: { label: 'Dismissed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    referred: { label: 'Referred for prosecution', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'notice_issued',
      by: ['regulator'],
      actorBecomes: 'regulator',
      label: 'Serve enforcement notice',
      intent: 'primary',
      input: {
        respondent_party: { type: 'party', role: 'respondent', required: true },
        respondent_name: { type: 'string', required: true },
        licence_ref: { type: 'string' },
        contravention: { type: 'string', required: true },
        statutory_provision: { type: 'string' },
        notice_ref: { type: 'string' },
        severity: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ notice_served_at: isoUtc(at) }),
    },
    {
      id: 'make_representations',
      from: 'notice_issued',
      to: 'representations_made',
      by: ['respondent'],
      label: 'Make representations',
      intent: 'primary',
      input: { representations_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'begin_review',
      from: 'representations_made',
      to: 'under_review',
      by: ['regulator'],
      label: 'Begin review of representations',
      intent: 'primary',
      guards: [],
    },
    {
      // representation period lapsed with no submission — regulator may proceed
      // to review. Still funnels through under_review, so the natural-justice
      // gate below holds. Timer-fireable, hence 'system' in `by`.
      id: 'note_lapsed',
      from: 'notice_issued',
      to: 'under_review',
      by: ['regulator', 'system'],
      label: 'Note representation period lapsed',
      intent: 'secondary',
      guards: [],
    },
    {
      // natural-justice gate: the ONLY edge into determination_made, and it can
      // only fire from under_review — which is only reachable after
      // representations (begin_review) or a lapsed period (note_lapsed). A
      // determination therefore cannot be imposed straight off the notice.
      id: 'make_determination',
      from: 'under_review',
      to: 'determination_made',
      by: ['regulator'],
      label: 'Make determination',
      intent: 'primary',
      input: {
        finding: { type: 'string', required: true },
        penalty_amount_zar: { type: 'number', min: 0 },
        directive_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ determination_at: isoUtc(at) }),
    },
    {
      id: 'require_remediation',
      from: 'determination_made',
      to: 'remediation_pending',
      by: ['regulator'],
      label: 'Order remediation',
      intent: 'primary',
      input: { remediation_deadline: { type: 'string' } },
      guards: [],
    },
    {
      id: 'confirm_remediation',
      from: 'remediation_pending',
      to: 'action_closed',
      by: ['regulator'],
      label: 'Confirm remediation & close',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_action: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'dismiss',
      from: ['representations_made', 'under_review'],
      to: 'dismissed',
      by: ['regulator'],
      label: 'Dismiss action',
      intent: 'destructive',
      requiresReason: ['no_contravention_found', 'insufficient_evidence', 'representations_accepted'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['notice_issued', 'representations_made', 'under_review'],
      to: 'withdrawn',
      by: ['regulator'],
      label: 'Withdraw notice',
      intent: 'destructive',
      requiresReason: ['issued_in_error', 'superseded', 'regulator_discretion'],
      guards: [],
    },
    {
      id: 'refer_prosecution',
      from: ['determination_made', 'remediation_pending'],
      to: 'referred',
      by: ['regulator'],
      label: 'Refer for prosecution',
      intent: 'destructive',
      requiresReason: ['non_compliance', 'wilful_breach', 'repeat_offence'],
      guards: [],
    },
  ],

  // representation window: the notice affords the respondent a period to make
  // representations; on expiry the regulator may proceed to review. record-only
  // stub — the sweep computes the real bar off the state sla (ppa_contract
  // pattern).
  timers: [{ onState: 'notice_issued', after: { days: 30 }, fire: 'note_lapsed', kind: 'time_bar' }],
};
