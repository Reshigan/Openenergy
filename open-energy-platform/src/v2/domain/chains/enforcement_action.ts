// enforcement_action — a regulator's compliance-enforcement lifecycle as data.
//
// The regulator (NERSA) opens an enforcement action against a licensee/participant
// for an alleged breach: notice → representations → determination → remediation →
// resolved. The due-process spine is STRUCTURAL, not a guard: confirm_remediation
// leaves ONLY remediation_pending, and the only path into remediation_pending is
// require_remediation, which fires ONLY from determination_made. So an enforcement
// action can NEVER be resolved before a determination is formally made — a
// respondent cannot be closed out (or a penalty deemed satisfied) on a breach the
// regulator never actually determined. No guard needed; the state graph forbids it.
//
// The respondent is a party attached at open (they must be able to submit
// representations on a later edge). Destructive exits — withdraw / dismiss /
// escalate (refer to s35) — all carry structured reason codes.
//
// settles:false — an enforcement action is a regulatory control, not a payment.
// A financial penalty here is a *determination*, not a settled cash movement
// (that would be its own settling chain). Record-only custody notice (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure penalty-tier bucketing off the determined amount (ZAR). No clock, no env.
const penaltyTier = (amount: Json | undefined): string => {
  if (typeof amount !== 'number' || amount <= 0) return 'none';
  if (amount >= 5_000_000) return 'major';
  if (amount >= 500_000) return 'material';
  return 'minor';
};

export const enforcementAction: ChainDecl = {
  key: 'enforcement_action',
  noun: 'Enforcement action',
  refPrefix: 'ENFO',
  title: (f) =>
    `Enforcement action — ${(f.respondent_name as string) ?? 'unnamed respondent'} (${(f.breach_ref as string) ?? 'no breach ref'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's34 compliance & enforcement', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'licence condition enforcement', effect: 'authorises' },
  ],
  roles: ['regulator', 'respondent', 'operator'],

  fields: {
    action_ref: { type: 'string', label: 'Action reference' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    respondent_party: { type: 'party', role: 'respondent', label: 'Respondent' },
    respondent_name: { type: 'string', required: true, label: 'Respondent name' },
    licence_ref: { type: 'string', label: 'Licence reference' },
    breach_ref: { type: 'string', required: true, label: 'Breach reference' },
    breach_summary: { type: 'string', required: true, label: 'Breach summary' },
    statutory_provision: { type: 'string', label: 'Statutory provision breached' },
    severity: { type: 'string', label: 'Severity (minor/material/serious)' },
    representations_summary: { type: 'string', label: 'Respondent representations' },
    determination: { type: 'string', label: 'Determination (compliance_notice/financial_penalty/no_action)' },
    penalty_amount: { type: 'number', min: 0, label: 'Penalty amount (ZAR)' },
    penalty_tier: { type: 'string', label: 'Penalty tier' },
    remediation_actions: { type: 'string', label: 'Required remediation' },
    remediation_evidence_ref: { type: 'string', label: 'Remediation evidence ref' },
    // written by derive, never by the client
    notice_issued_at: { type: 'string', label: 'Notice issued at' },
    determined_at: { type: 'string', label: 'Determination made at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
  },

  initial: 'notice_issued',

  states: {
    notice_issued: { label: 'Notice issued', terminal: false, holder: 'respondent', sla: { days: 14 } },
    under_representation: { label: 'Under representation review', terminal: false, holder: 'regulator', sla: { days: 21 } },
    determination_made: { label: 'Determination made', terminal: false, holder: 'regulator', sla: { days: 7 } },
    remediation_pending: { label: 'Remediation pending', terminal: false, holder: 'respondent', sla: { days: 30 } },
    resolved: { label: 'Resolved', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    dismissed: { label: 'Dismissed', terminal: true, holder: 'none' },
    escalated: { label: 'Escalated to s35', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'notice_issued',
      by: ['regulator', 'operator'],
      actorBecomes: 'regulator',
      label: 'Issue enforcement notice',
      intent: 'primary',
      input: {
        respondent_name: { type: 'string', required: true },
        licence_ref: { type: 'string' },
        breach_ref: { type: 'string', required: true },
        breach_summary: { type: 'string', required: true },
        statutory_provision: { type: 'string' },
        severity: { type: 'string' },
        respondent_party: { type: 'party', role: 'respondent' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ notice_issued_at: isoUtc(at) }),
    },
    {
      id: 'submit_representations',
      from: 'notice_issued',
      to: 'under_representation',
      by: ['respondent', 'operator'],
      label: 'Submit representations',
      intent: 'primary',
      input: { representations_summary: { type: 'string', required: true } },
      guards: [],
    },
    {
      // determination may follow representations, or issue directly if the notice
      // period lapsed with no response (both `from` states are pre-determination).
      id: 'make_determination',
      from: ['notice_issued', 'under_representation'],
      to: 'determination_made',
      by: ['regulator', 'system'],
      label: 'Make determination',
      intent: 'primary',
      input: {
        determination: { type: 'string' },
        penalty_amount: { type: 'number', min: 0 },
      },
      guards: [],
      // determination defaults to 'compliance_notice' when absent: a notice
      // unanswered past the response window stands as issued (never a penalty).
      derive: (f, at: Instant) => ({
        determination: typeof f.determination === 'string' ? f.determination : 'compliance_notice',
        determined_at: isoUtc(at),
        penalty_tier: penaltyTier(f.penalty_amount),
      }),
    },
    {
      id: 'require_remediation',
      from: 'determination_made',
      to: 'remediation_pending',
      by: ['regulator'],
      label: 'Require remediation',
      intent: 'primary',
      input: { remediation_actions: { type: 'string', required: true } },
      guards: [],
    },
    {
      // structural due-process gate: the ONLY edge into resolved, reachable ONLY
      // from remediation_pending — which only require_remediation reaches, and that
      // only from determination_made. An action therefore cannot resolve before a
      // determination is made. No guard.
      id: 'confirm_remediation',
      from: 'remediation_pending',
      to: 'resolved',
      by: ['regulator'],
      label: 'Confirm remediation complete',
      intent: 'primary',
      input: { remediation_evidence_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'dismiss',
      from: ['notice_issued', 'under_representation'],
      to: 'dismissed',
      by: ['regulator'],
      label: 'Dismiss — no breach',
      intent: 'destructive',
      requiresReason: ['no_breach_found', 'representations_accepted', 'insufficient_evidence'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['notice_issued', 'under_representation', 'determination_made', 'remediation_pending'],
      to: 'withdrawn',
      by: ['regulator'],
      label: 'Withdraw action',
      intent: 'destructive',
      requiresReason: ['issued_in_error', 'superseded', 'jurisdiction_declined'],
      guards: [],
    },
    {
      id: 'escalate',
      from: ['determination_made', 'remediation_pending'],
      to: 'escalated',
      by: ['regulator'],
      label: 'Escalate to s35',
      intent: 'destructive',
      requiresReason: ['non_compliance_persists', 'serious_breach', 'remediation_failed'],
      guards: [],
    },
  ],

  // representation time-bar: a notice left unanswered past the response window
  // lets the regulator proceed to determination. record-only stub; the sweep
  // computes the real bar off the state sla (permit_to_work / ppa_contract pattern).
  timers: [{ onState: 'notice_issued', after: { days: 14 }, fire: 'make_determination', kind: 'time_bar' }],
};
