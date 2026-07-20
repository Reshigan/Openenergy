// dfr — daily field report lifecycle for an IPP construction/O&M site, as data.
//
// A site engineer opens today's report, logs entries while it's open, closes
// entries for the day, and submits for review. A reviewer either approves
// (→ distribute → archive, terminal) or returns it for correction; a
// corrected report re-enters the SAME review step (start_review accepts both
// `submitted` and `corrected` as its `from` — no separate "resubmit" action
// invented, matching the two real v1 entry points into review). void/withdraw
// are exits available before the report is archived.
//
// Structural honesty: archive is the ONLY edge into the terminal `archived`
// state and it only fires from `distributed`, which only follows `approved`
// — so a report can never be archived without passing review. No guard is
// needed for that gate; it's the state graph.
//
// No counterparty here — a DFR is a single-site record, not a bilateral deal,
// so visibility is 'owner' and no counterpartyDistinct-style guard applies.
//
// settles:false — a field report carries evm_pv_zar (planned value) as an
// informational EVM figure; it records progress, it never moves money or
// posts a settlement (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const dfr: ChainDecl = {
  key: 'dfr',
  noun: 'Daily field report',
  refPrefix: 'DFR',
  title: (f) => `DFR — ${(f.title as string) ?? 'untitled'}`,
  visibility: 'owner',
  settles: false,
  roles: ['ipp_developer', 'operator'],

  fields: {
    title: { type: 'string', required: true, label: 'Title' },
    report_date: { type: 'string', label: 'Report date' },
    evm_pv_zar: { type: 'number', min: 0, label: 'Planned value (ZAR)' },
    notes: { type: 'string', label: 'Correction notes' },
    narrative: { type: 'string', label: 'Correction narrative' },
    response_text: { type: 'string', label: 'Response text' },
    voided_reason: { type: 'string', label: 'Voided reason' },
    withdrawn_reason: { type: 'string', label: 'Withdrawn reason' },
    // written by derive, never by the client
    opened_at: { type: 'string', label: 'Opened at' },
    entries_closed_at: { type: 'string', label: 'Entries closed at' },
    submitted_at: { type: 'string', label: 'Submitted at' },
    review_started_at: { type: 'string', label: 'Review started at' },
    returned_at: { type: 'string', label: 'Returned for correction at' },
    corrected_at: { type: 'string', label: 'Corrected at' },
    approved_at: { type: 'string', label: 'Approved at' },
    distributed_at: { type: 'string', label: 'Distributed at' },
    archived_at: { type: 'string', label: 'Archived at' },
    voided_at: { type: 'string', label: 'Voided at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'entries_open',

  states: {
    entries_open: { label: 'Entries open', terminal: false, holder: 'ipp_developer', sla: { hours: 24 } },
    entries_closed: { label: 'Entries closed', terminal: false, holder: 'ipp_developer', sla: { hours: 24 } },
    submitted: { label: 'Submitted', terminal: false, holder: 'operator', sla: { days: 2 } },
    under_review: { label: 'Under review', terminal: false, holder: 'operator', sla: { days: 3 } },
    returned_for_correction: { label: 'Returned for correction', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    corrected: { label: 'Corrected', terminal: false, holder: 'operator', sla: { days: 2 } },
    approved: { label: 'Approved', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    distributed: { label: 'Distributed', terminal: false, holder: 'ipp_developer' },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
    voided: { label: 'Voided', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'entries_open',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Open daily field report',
      intent: 'primary',
      input: {
        title: { type: 'string', required: true },
        report_date: { type: 'string' },
        evm_pv_zar: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ opened_at: isoUtc(at) }),
    },
    {
      // 'system' in `by` so the entries_open SLA timer can auto-close a report
      // nobody closed by end of day.
      id: 'close_entries',
      from: 'entries_open',
      to: 'entries_closed',
      by: ['ipp_developer', 'operator', 'system'],
      label: 'Close entries',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ entries_closed_at: isoUtc(at) }),
    },
    {
      id: 'submit',
      from: 'entries_closed',
      to: 'submitted',
      by: ['ipp_developer', 'operator'],
      label: 'Submit report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      // shared re-entry point: a fresh submission and a corrected resubmission
      // both land in review through this one edge — no separate action needed.
      id: 'start_review',
      from: ['submitted', 'corrected'],
      to: 'under_review',
      by: ['ipp_developer', 'operator'],
      label: 'Start review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ review_started_at: isoUtc(at) }),
    },
    {
      id: 'approve',
      from: 'under_review',
      to: 'approved',
      by: ['ipp_developer', 'operator'],
      label: 'Approve report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      // v1 carried only a free-text `notes` field here, no reason_code — so
      // no requiresReason (the rule is: only when the legacy action had one).
      id: 'return_for_correction',
      from: 'under_review',
      to: 'returned_for_correction',
      by: ['ipp_developer', 'operator'],
      label: 'Return for correction',
      intent: 'destructive',
      input: { notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ returned_at: isoUtc(at) }),
    },
    {
      id: 'correct',
      from: 'returned_for_correction',
      to: 'corrected',
      by: ['ipp_developer', 'operator'],
      label: 'Submit correction',
      intent: 'primary',
      input: { narrative: { type: 'string' }, response_text: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ corrected_at: isoUtc(at) }),
    },
    {
      id: 'distribute',
      from: 'approved',
      to: 'distributed',
      by: ['ipp_developer', 'operator'],
      label: 'Distribute report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ distributed_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into the terminal state, and only from `distributed` —
      // a report can't be archived without having passed review first.
      id: 'archive',
      from: 'distributed',
      to: 'archived',
      by: ['ipp_developer', 'operator'],
      label: 'Archive report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ archived_at: isoUtc(at) }),
    },

    // --- exits ------------------------------------------------------------
    {
      id: 'void',
      from: ['entries_open', 'entries_closed', 'submitted', 'under_review', 'returned_for_correction', 'corrected', 'approved', 'distributed'],
      to: 'voided',
      by: ['ipp_developer', 'operator'],
      label: 'Void report',
      intent: 'destructive',
      requiresReason: ['data_entry_error', 'duplicate_report', 'wrong_site', 'superseded', 'other'],
      input: { voided_reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ voided_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['entries_open', 'entries_closed'],
      to: 'withdrawn',
      by: ['ipp_developer'],
      label: 'Withdraw report',
      intent: 'destructive',
      requiresReason: ['created_in_error', 'duplicate_report', 'no_longer_required'],
      input: { withdrawn_reason: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],

  // a report left open past end-of-day auto-closes for entry; nobody has to
  // remember to do it manually. close_entries has no required input and its
  // `by` includes 'system', satisfying the timer-audit contract.
  timers: [{ onState: 'entries_open', after: { hours: 24 }, fire: 'close_entries', kind: 'sla' }],
};
