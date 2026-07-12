// trade_reporting — EMIR-style trade reporting to a trade repository (TR).
//
// A reporter (trader) files a derivative/energy-trade report against a trade
// repository; the TR/regulator either ACKNOWLEDGES it (accepted, terminal) or
// REJECTS it with a structured validation reason, which loops the report back to
// `reporting_pending` for correction and resubmission. This mirrors the EMIR
// Art. 9 report → TR-validation → ACK/NACK cycle.
//
// STRUCTURAL gate (no guard needed): a report can only be ACKNOWLEDGED or
// REJECTED from `submitted`. The only edge into `submitted` is `submit`/`resubmit`
// from a pending/rejected state, so the TR can never acknowledge a report that
// was never actually submitted — the state graph enforces the ordering, not a
// business guard. There is no registry guard for "was this submitted", and
// inventing one would duplicate what the FSM already guarantees.
//
// settles:false — a trade report is a regulatory notification; NO money and NO
// settlement finality move through this chain. The underlying trade settles on
// its own rails; this chain RECORDS the reporting obligation only (R-S5-1).
//
// Roles: reporter (the trader/reporting entity, opener), regulator (the TR /
// competent authority that validates), operator (platform back-office). The
// regulator must be attached at @new so it can later acknowledge/reject.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

/** pure increment of the carried rejection counter. No clock, no env. */
const bumpRejections = (f: Record<string, Json>): number =>
  (typeof f.rejection_count === 'number' ? f.rejection_count : 0) + 1;

export const tradeReporting: ChainDecl = {
  key: 'trade_reporting',
  noun: 'Trade reporting to trade repository',
  refPrefix: 'TREP',
  title: (f) =>
    `TR report — ${(f.trade_ref as string) ?? 'unref'} (${(f.action_type as string) ?? 'new'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    // EMIR Art. 9 is the archetype; the SA equivalent is the FMA TR-reporting duty.
    { instrument: 'EMIR (Regulation (EU) 648/2012)', provision: 'Art. 9 reporting obligation', effect: 'requires' },
    { instrument: 'Financial Markets Act 19 of 2012 (SA)', provision: 'trade-repository reporting duty', effect: 'requires' },
  ],
  roles: ['reporter', 'regulator', 'operator'],

  fields: {
    trade_ref: { type: 'string', required: true, label: 'Trade / UTI reference' },
    reporter_name: { type: 'string', required: true, label: 'Reporting entity' },
    asset_class: { type: 'string', required: true, label: 'Asset class (power/gas/carbon/rate)' },
    action_type: { type: 'string', label: 'EMIR action (new/modify/cancel/correct)' },
    notional_zar: { type: 'number', min: 0, label: 'Notional (ZAR)' },
    trade_repository: { type: 'string', label: 'Trade repository name' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Trade repository / competent authority' },
    tr_ack_ref: { type: 'string', label: 'TR acknowledgement ref (UTI confirmation)' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    rejection_count: { type: 'number', label: 'Times rejected by TR' },
  },

  initial: 'reporting_pending',

  states: {
    // reporter is drafting / preparing to submit within the reporting window.
    reporting_pending: { label: 'Reporting pending', terminal: false, holder: 'reporter', sla: { days: 1 } },
    // filed with the TR; awaiting TR validation (ACK / NACK).
    submitted: { label: 'Submitted to TR', terminal: false, holder: 'regulator', sla: { days: 1 } },
    // TR NACK'd it with a validation reason — back to the reporter to fix.
    rejected: { label: 'Rejected by TR', terminal: false, holder: 'reporter', sla: { days: 1 } },
    // TR ACK'd — the report is accepted and recorded. Terminal.
    acknowledged: { label: 'Acknowledged by TR', terminal: true, holder: 'none' },
    // reporter withdrew the report before acceptance (e.g. duplicate / trade busted).
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    // reporting window elapsed with no ACK on-platform — record-only marker; the
    // statutory obligation persists and is handled off-platform (late filing).
    lapsed: { label: 'Reporting window lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    // --- creation -----------------------------------------------------------
    {
      id: 'open',
      from: '@new',
      to: 'reporting_pending',
      by: ['reporter', 'operator'],
      actorBecomes: 'reporter',
      label: 'Open trade report',
      intent: 'primary',
      input: {
        trade_ref: { type: 'string', required: true },
        reporter_name: { type: 'string', required: true },
        asset_class: { type: 'string', required: true },
        action_type: { type: 'string' },
        notional_zar: { type: 'number', min: 0 },
        trade_repository: { type: 'string' },
        // regulator/TR attached at @new so it can later acknowledge/reject.
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },

    // --- submit / validate cycle -------------------------------------------
    {
      id: 'submit',
      from: 'reporting_pending',
      to: 'submitted',
      by: ['reporter', 'operator'],
      label: 'Submit to TR',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      // STRUCTURAL gate: only reachable from `submitted`, so a report that was
      // never filed cannot be acknowledged. No guard.
      id: 'acknowledge',
      from: 'submitted',
      to: 'acknowledged',
      by: ['regulator'],
      label: 'Acknowledge (TR accepted)',
      intent: 'primary',
      input: { tr_ack_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      // TR NACK with a structured validation reason (EMIR-style rejection codes).
      id: 'reject',
      from: 'submitted',
      to: 'rejected',
      by: ['regulator'],
      label: 'Reject (TR validation failure)',
      intent: 'destructive',
      requiresReason: [
        'schema_invalid',
        'uti_mismatch',
        'counterparty_unknown',
        'duplicate_report',
        'stale_valuation',
        'reference_data_missing',
      ],
      guards: [],
      derive: (f): Record<string, Json> => ({ rejection_count: bumpRejections(f) }),
    },
    {
      // correct-and-refile: back to pending for the reporter to fix and resubmit.
      id: 'resubmit',
      from: 'rejected',
      to: 'reporting_pending',
      by: ['reporter', 'operator'],
      label: 'Correct and re-file',
      intent: 'primary',
      guards: [],
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'withdraw',
      from: ['reporting_pending', 'rejected'],
      to: 'withdrawn',
      by: ['reporter', 'operator'],
      label: 'Withdraw report',
      intent: 'destructive',
      requiresReason: ['trade_busted', 'duplicate', 'reported_elsewhere', 'not_reportable'],
      guards: [],
    },
    {
      // time-bar auto-lapse: an unacknowledged report whose window elapsed is
      // parked (record-only; statutory duty survives — see states comment).
      id: 'auto_lapse',
      from: ['reporting_pending', 'submitted', 'rejected'],
      to: 'lapsed',
      by: ['system'],
      label: 'Reporting window lapsed',
      intent: 'secondary',
      guards: [],
    },
  ],

  // record-only stubs; the sweep computes the real bar off each state's sla days
  // (ppa_contract / permit_to_work pattern). `after:{days:0}` is a placeholder.
  timers: [
    { onState: 'reporting_pending', after: { days: 0 }, fire: 'auto_lapse', kind: 'time_bar' },
    { onState: 'submitted', after: { days: 0 }, fire: 'auto_lapse', kind: 'sla' },
  ],
};
