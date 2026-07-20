// fsca_conduct_report — FSCA market-conduct report lifecycle as data.
//
// A market participant (reporter, typically a trader) files a conduct report
// against a subject firm/individual; the FSCA (regulator) acknowledges,
// investigates, and reaches a finding (substantiated / unfounded) before the
// case is closed. Roles: reporter (trader), regulator, operator.
//
// STRUCTURAL FINDING GATE: a finding state (substantiated / unfounded) is
// reachable ONLY from under_investigation, and under_investigation is reachable
// ONLY from acknowledged (via open_investigation). So the FSCA can NEVER stamp a
// substantiated/unfounded finding without first acknowledging and opening an
// investigation — the state graph enforces due process, no guard needed.
//
// settles:false — a conduct report is a regulatory/supervisory record. No money
// ever moves through this chain; any administrative penalty is a separate
// enforcement action, not a settlement here (R-S5-1). Export carries the
// record-only notice.
//
// No registry guard fits FSCA conduct supervision, so guards are []. The two
// business rules that matter (due-process ordering; findings carry a
// contravention/dismissal code) are enforced structurally via the state graph
// and via requiresReason[] reason codes respectively.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const fscaConductReport: ChainDecl = {
  key: 'fsca_conduct_report',
  noun: 'FSCA market conduct report',
  refPrefix: 'FSCR',
  title: (f) =>
    `FSCA conduct — ${(f.subject_name as string) ?? 'unnamed'} (${(f.conduct_category as string) ?? 'general'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Sector Regulation Act 2017', provision: 's167 market-conduct investigation', effect: 'authorises' },
    { instrument: 'Financial Markets Act 2012', provision: 's78-82 market-abuse referral', effect: 'requires' },
  ],
  roles: ['reporter', 'regulator', 'operator'],

  fields: {
    reference_no: { type: 'string', label: 'FSCA reference' },
    subject_name: { type: 'string', required: true, label: 'Subject (firm/individual)' },
    subject_type: { type: 'string', label: 'Subject type (firm/individual/product)' },
    conduct_category: { type: 'string', required: true, label: 'Conduct category' },
    description: { type: 'string', required: true, label: 'Description of conduct' },
    occurred_on: { type: 'string', label: 'When conduct occurred' },
    case_officer_ref: { type: 'string', label: 'FSCA case officer ref' },
    finding_summary: { type: 'string', label: 'Finding summary' },
    // written by derive, never by the client
    filed_at: { type: 'string', label: 'Filed at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    investigation_opened_at: { type: 'string', label: 'Investigation opened at' },
    finding_at: { type: 'string', label: 'Finding recorded at' },
    closed_at_report: { type: 'string', label: 'Report closed at' },
  },

  initial: 'filed',

  states: {
    filed: { label: 'Filed', terminal: false, holder: 'regulator', sla: { days: 30 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'regulator', sla: { days: 90 } },
    under_investigation: { label: 'Under investigation', terminal: false, holder: 'regulator', sla: { days: 180 } },
    substantiated: { label: 'Substantiated', terminal: false, holder: 'regulator', sla: { days: 30 } },
    unfounded: { label: 'Unfounded', terminal: false, holder: 'regulator', sla: { days: 30 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'filed',
      by: ['reporter', 'operator'],
      actorBecomes: 'reporter',
      label: 'File conduct report',
      intent: 'primary',
      input: {
        subject_name: { type: 'string', required: true },
        subject_type: { type: 'string' },
        conduct_category: { type: 'string', required: true },
        description: { type: 'string', required: true },
        occurred_on: { type: 'string' },
        // regulator acts on every later edge, so it must be a live party from @new.
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ filed_at: isoUtc(at) }),
    },

    // --- FSCA supervision path ------------------------------------------------
    {
      id: 'acknowledge',
      from: 'filed',
      to: 'acknowledged',
      by: ['regulator', 'operator'],
      label: 'Acknowledge receipt',
      intent: 'primary',
      input: { reference_no: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'open_investigation',
      from: 'acknowledged',
      to: 'under_investigation',
      by: ['regulator'],
      label: 'Open investigation',
      intent: 'primary',
      input: { case_officer_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ investigation_opened_at: isoUtc(at) }),
    },
    {
      // structural finding gate: the ONLY edge to a substantiated finding, and it
      // fires ONLY from under_investigation. Due process is enforced by the graph.
      id: 'substantiate',
      from: 'under_investigation',
      to: 'substantiated',
      by: ['regulator'],
      label: 'Substantiate finding',
      intent: 'primary',
      input: { finding_summary: { type: 'string', required: true } },
      requiresReason: ['market_abuse', 'insider_trading', 'price_manipulation', 'mis_selling', 'tcf_breach', 'unlicensed_conduct'],
      guards: [],
      derive: (_f, at: Instant) => ({ finding_at: isoUtc(at) }),
    },
    {
      // the ONLY edge to an unfounded finding — also gated on under_investigation.
      id: 'dismiss_unfounded',
      from: 'under_investigation',
      to: 'unfounded',
      by: ['regulator'],
      label: 'Find unfounded',
      intent: 'secondary',
      input: { finding_summary: { type: 'string', required: true } },
      requiresReason: ['no_contravention', 'insufficient_evidence', 'outside_mandate'],
      guards: [],
      derive: (_f, at: Instant) => ({ finding_at: isoUtc(at) }),
    },
    {
      id: 'close',
      from: ['substantiated', 'unfounded'],
      to: 'closed',
      by: ['regulator', 'operator'],
      label: 'Close case',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_report: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: ['filed', 'acknowledged'],
      to: 'rejected',
      by: ['regulator', 'system'],
      label: 'Reject report',
      intent: 'destructive',
      requiresReason: ['out_of_jurisdiction', 'vexatious', 'insufficient_particulars', 'anonymous_unverifiable', 'duplicate', 'time_barred'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['filed', 'acknowledged'],
      to: 'withdrawn',
      by: ['reporter'],
      label: 'Withdraw report',
      intent: 'destructive',
      requiresReason: ['filed_in_error', 'resolved_directly', 'no_longer_pursuing'],
      guards: [],
    },
  ],

  // Statutory acknowledgement bar: a report left unacknowledged past the filed
  // SLA is administratively rejected (the reporter may re-file). Record-only
  // stub, same as ppa/permit — the sweep computes the real bar off state sla days
  // and supplies the reason_code the reject edge requires.
  timers: [{ onState: 'filed', after: { days: 365 }, fire: 'reject', kind: 'time_bar', reason: 'time_barred' }],
};
