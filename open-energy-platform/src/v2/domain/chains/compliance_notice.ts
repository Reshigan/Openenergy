// compliance_notice — a regulator-issued enforcement notice against a licensee,
// as data (v1: oe_compliance_notices, wave 5).
//
// The regulator opens a notice (remediation/warning/penalty/suspension/
// revocation/information_request) against a named licensee with a remedy
// deadline. The licensee may acknowledge receipt — this is purely
// informational, the remedy clock keeps running regardless (v1 cascadeHint).
// A notice left unremedied past its deadline is swept to `overdue` by the
// platform's daily SLA sweep (mark_overdue, system-only, no data of its own —
// the deadline itself lives on `remedy_deadline_at` and is asserted per
// record, not as a fixed chain-level SLA, so no TimerDecl is declared here).
// The regulator closes the matter either by confirming remedy evidence
// (satisfy) or by withdrawing a notice issued in error or superseded.
//
// Structural honesty: `open` is guarded by counterpartyDistinct — a regulator
// cannot issue a notice against itself. Nothing else here needs a guard: the
// state graph alone keeps `satisfied`/`withdrawn` reachable only from the
// three live states (issued/acknowledged/overdue).
//
// settles:false — an enforcement notice is a governance/compliance record; it
// carries no quantum and moves no money (R-S5-1). Any penalty it triggers
// settles on its own rail.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const complianceNotice: ChainDecl = {
  key: 'compliance_notice',
  noun: 'Compliance notice',
  refPrefix: 'CN',
  title: (f) => `Compliance notice — ${(f.notice_type as string) ?? 'notice'}: ${(f.title as string) ?? 'untitled'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Electricity Regulation Act 2006', provision: 's21 compliance & enforcement directives (NERSA)', effect: 'requires' },
  ],
  roles: ['regulator', 'licensee', 'operator'],

  fields: {
    licensee_party: { type: 'party', role: 'licensee', label: 'Licensee' },
    notice_type: { type: 'string', label: 'Notice type (remediation/warning/penalty/suspension/revocation/information_request)' },
    title: { type: 'string', required: true, label: 'Title' },
    body: { type: 'string', required: true, label: 'Notice body' },
    remedy_deadline_at: { type: 'string', label: 'Remedy deadline' },
    satisfied_evidence: { type: 'string', label: 'Remedy evidence' },
    // written by derive, never by the client
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    overdue_at: { type: 'string', label: 'Marked overdue at' },
    satisfied_at: { type: 'string', label: 'Satisfied at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'issued',

  states: {
    issued: { label: 'Issued', terminal: false, holder: 'licensee' },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'licensee' },
    overdue: { label: 'Overdue', terminal: false, holder: 'licensee' },
    satisfied: { label: 'Satisfied', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'issued',
      by: ['regulator', 'operator'],
      actorBecomes: 'regulator',
      label: 'Issue compliance notice',
      intent: 'primary',
      input: {
        licensee_party: { type: 'party', role: 'licensee', required: true },
        notice_type: { type: 'string' },
        title: { type: 'string', required: true },
        body: { type: 'string', required: true },
        remedy_deadline_at: { type: 'string' },
      },
      // a regulator cannot issue a notice against itself
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'ack',
      from: 'issued',
      to: 'acknowledged',
      by: ['licensee'],
      label: 'Acknowledge notice',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      // daily SLA sweep marks an unremedied notice overdue; no data of its own.
      id: 'mark_overdue',
      from: ['issued', 'acknowledged'],
      to: 'overdue',
      by: ['system'],
      label: 'Mark overdue',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ overdue_at: isoUtc(at) }),
    },
    {
      id: 'satisfy',
      from: ['issued', 'acknowledged', 'overdue'],
      to: 'satisfied',
      by: ['regulator', 'operator'],
      label: 'Mark satisfied',
      intent: 'primary',
      input: { satisfied_evidence: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ satisfied_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['issued', 'acknowledged', 'overdue'],
      to: 'withdrawn',
      by: ['regulator', 'operator'],
      label: 'Withdraw notice',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],
};
