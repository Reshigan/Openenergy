// trade_report — Wave 44 OTC transaction / trade-repository reporting &
// reconciliation lifecycle, as data.
//
// Financial Markets Act 19 of 2012 (FMA) + the FSCA OTC Derivatives Reporting
// regulations (SA's analogue of EMIR / Dodd-Frank): every reportable trade the
// desk executes must be submitted to a licensed Trade Repository (TR) by a
// hard T+1 deadline, acknowledged, then RECONCILED against the counterparty's
// dual-sided submission before the report is confirmed complete.
//
// Forward path:
//   report_due → report_generated → submitted_to_tr → tr_acknowledged →
//   reconciled → confirmed_complete
// Branches: tr_rejected → corrected → submitted_to_tr (re-report loop);
//   break_identified → break_resolved → reconciled (dual-sided mismatch);
//   exempted (intragroup / de-minimis, no report required);
//   cancelled (trade busted / errored, report withdrawn).
//
// Structural honesty (no invented guards): this is the firm's OWN reporting
// obligation to a regulator, not a bilateral deal — there is no second live
// party to check for self-dealing (counterpartyDistinct doesn't apply;
// counterparty_name/lei are descriptive strings, not a party on the txn).
// None of the other 9 registry guards (credit approval, CP evidence, serial
// range, completeness, hazard/strategic regulator gates) speak to a trade
// report either, so every edge below carries guards: [] — the state graph
// (confirm_complete reachable ONLY from reconciled; reconciled ONLY from an
// acknowledged-then-clean or resolved-break path) is what enforces the
// reporting sequence, not a guard.
//
// settles:false — this chain records a regulatory reporting obligation; it
// never moves money (the underlying trade settles on its own rail, R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const tradeReport: ChainDecl = {
  key: 'trade_report',
  noun: 'Trade report',
  refPrefix: 'TRPT',
  title: (f) => `Trade report — ${(f.product as string) ?? (f.report_class as string) ?? 'unclassified'} (${(f.counterparty_name as string) ?? 'no counterparty'})`,
  visibility: 'owner',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Markets Act 19 of 2012', provision: 's34 OTC derivatives trade-reporting obligation (FSCA Reporting Regulations)', effect: 'requires' },
  ],
  roles: ['trader', 'operator'],

  fields: {
    report_class: { type: 'string', required: true, label: 'Report class (otc_derivative/physical_forward/spot_physical)' },
    product: { type: 'string', label: 'Product' },
    energy_type: { type: 'string', label: 'Energy type' },
    side: { type: 'string', label: 'Side' },
    counterparty_name: { type: 'string', label: 'Counterparty' },
    counterparty_lei: { type: 'string', label: 'Counterparty LEI' },
    trade_ref: { type: 'string', label: 'Trade ref' },
    trade_repository: { type: 'string', label: 'Trade repository' },
    trade_date: { type: 'string', label: 'Trade date' },
    value_date: { type: 'string', label: 'Value date' },
    notional_zar_m: { type: 'number', min: 0, label: 'Notional (ZAR m)' },
    volume_mwh: { type: 'number', min: 0, label: 'Volume (MWh)' },
    price_zar_mwh: { type: 'number', label: 'Price (ZAR/MWh)' },
    collateral_zar_m: { type: 'number', min: 0, label: 'Collateral (ZAR m)' },
    uti: { type: 'string', label: 'UTI' },
    generation_ref: { type: 'string', label: 'Generation ref' },
    generation_basis: { type: 'string', label: 'Generation basis' },
    submission_ref: { type: 'string', label: 'Submission ref' },
    submission_basis: { type: 'string', label: 'Submission basis' },
    acknowledgement_ref: { type: 'string', label: 'Acknowledgement ref' },
    reconciliation_ref: { type: 'string', label: 'Reconciliation ref' },
    reconciliation_basis: { type: 'string', label: 'Reconciliation basis' },
    break_ref: { type: 'string', label: 'Break ref' },
    break_basis: { type: 'string', label: 'Break basis' },
    rejection_ref: { type: 'string', label: 'Rejection ref' },
    rejection_basis: { type: 'string', label: 'Rejection basis' },
    correction_ref: { type: 'string', label: 'Correction ref' },
    correction_basis: { type: 'string', label: 'Correction basis' },
    exemption_ref: { type: 'string', label: 'Exemption ref' },
    exemption_basis: { type: 'string', label: 'Exemption basis' },
    resolution_notes: { type: 'string', label: 'Resolution notes' },
    // written by derive, never by the client
    report_generated_at: { type: 'string', label: 'Report generated at' },
    submitted_to_tr_at: { type: 'string', label: 'Submitted to TR at' },
    tr_acknowledged_at: { type: 'string', label: 'TR acknowledged at' },
    reconciled_at: { type: 'string', label: 'Reconciled at' },
    break_identified_at: { type: 'string', label: 'Break identified at' },
    break_resolved_at: { type: 'string', label: 'Break resolved at' },
    confirmed_complete_at: { type: 'string', label: 'Confirmed complete at' },
    tr_rejected_at: { type: 'string', label: 'TR rejected at' },
    corrected_at: { type: 'string', label: 'Corrected at' },
    exempted_at: { type: 'string', label: 'Exempted at' },
    cancelled_at: { type: 'string', label: 'Cancelled at' },
  },

  initial: 'report_due',

  states: {
    report_due: { label: 'Report due', terminal: false, holder: 'trader', sla: { hours: 12 } },
    report_generated: { label: 'Report generated', terminal: false, holder: 'trader', sla: { hours: 24 } },
    submitted_to_tr: { label: 'Submitted to TR', terminal: false, holder: 'trader', sla: { hours: 4 } },
    tr_acknowledged: { label: 'TR acknowledged', terminal: false, holder: 'trader', sla: { hours: 24 } },
    reconciled: { label: 'Reconciled', terminal: false, holder: 'trader', sla: { hours: 12 } },
    break_identified: { label: 'Reconciliation break identified', terminal: false, holder: 'trader', sla: { hours: 8 } },
    break_resolved: { label: 'Break resolved', terminal: false, holder: 'trader', sla: { hours: 12 } },
    tr_rejected: { label: 'TR rejected', terminal: false, holder: 'trader', sla: { hours: 24 } },
    corrected: { label: 'Corrected', terminal: false, holder: 'trader', sla: { hours: 12 } },
    confirmed_complete: { label: 'Confirmed complete', terminal: true, holder: 'none' },
    exempted: { label: 'Exempted', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'report_due',
      by: ['trader', 'operator'],
      actorBecomes: 'trader',
      label: 'Open trade report',
      intent: 'primary',
      input: {
        report_class: { type: 'string', required: true },
        product: { type: 'string' },
        energy_type: { type: 'string' },
        side: { type: 'string' },
        counterparty_name: { type: 'string' },
        counterparty_lei: { type: 'string' },
        trade_ref: { type: 'string' },
        trade_date: { type: 'string' },
        value_date: { type: 'string' },
        notional_zar_m: { type: 'number', min: 0 },
        volume_mwh: { type: 'number', min: 0 },
        price_zar_mwh: { type: 'number' },
        collateral_zar_m: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'generate_report',
      from: 'report_due',
      to: 'report_generated',
      by: ['trader', 'operator'],
      label: 'Generate report',
      intent: 'primary',
      input: {
        uti: { type: 'string' },
        generation_ref: { type: 'string' },
        generation_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ report_generated_at: isoUtc(at) }),
    },
    {
      // re-report loop rejoins here from `corrected`
      id: 'submit',
      from: ['report_generated', 'corrected'],
      to: 'submitted_to_tr',
      by: ['trader', 'operator'],
      label: 'Submit to repository',
      intent: 'primary',
      input: {
        submission_ref: { type: 'string' },
        submission_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_to_tr_at: isoUtc(at) }),
    },
    {
      id: 'acknowledge',
      from: 'submitted_to_tr',
      to: 'tr_acknowledged',
      by: ['trader', 'operator'],
      label: 'Acknowledge',
      intent: 'primary',
      input: { acknowledgement_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ tr_acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'reject',
      from: 'submitted_to_tr',
      to: 'tr_rejected',
      by: ['trader', 'operator'],
      label: 'Reject',
      intent: 'destructive',
      input: {
        rejection_ref: { type: 'string' },
        rejection_basis: { type: 'string' },
      },
      requiresReason: ['invalid_uti', 'missing_lei', 'data_mismatch', 'duplicate_submission', 'format_error'],
      guards: [],
      derive: (_f, at: Instant) => ({ tr_rejected_at: isoUtc(at) }),
    },
    {
      // reachable from a clean ack OR from a resolved break — never from a
      // still-open break, so an unreconciled mismatch can't be waved through.
      id: 'reconcile',
      from: ['tr_acknowledged', 'break_resolved'],
      to: 'reconciled',
      by: ['trader', 'operator'],
      label: 'Reconcile',
      intent: 'primary',
      input: {
        reconciliation_ref: { type: 'string' },
        reconciliation_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ reconciled_at: isoUtc(at) }),
    },
    {
      id: 'flag_break',
      from: ['tr_acknowledged', 'reconciled'],
      to: 'break_identified',
      by: ['trader', 'operator'],
      label: 'Flag reconciliation break',
      intent: 'destructive',
      input: {
        break_ref: { type: 'string' },
        break_basis: { type: 'string' },
      },
      requiresReason: ['notional_mismatch', 'price_mismatch', 'uti_mismatch', 'counterparty_dispute', 'timing_mismatch'],
      guards: [],
      derive: (_f, at: Instant) => ({ break_identified_at: isoUtc(at) }),
    },
    {
      id: 'resolve_break',
      from: 'break_identified',
      to: 'break_resolved',
      by: ['trader', 'operator'],
      label: 'Resolve break',
      intent: 'primary',
      input: {
        reconciliation_ref: { type: 'string' },
        resolution_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ break_resolved_at: isoUtc(at) }),
    },
    {
      // feeds back into `submit` — a corrected report always re-enters the TR.
      id: 'correct',
      from: ['tr_rejected', 'break_identified'],
      to: 'corrected',
      by: ['trader', 'operator'],
      label: 'Correct',
      intent: 'primary',
      input: {
        correction_ref: { type: 'string' },
        correction_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ corrected_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into the successful terminal state, and it can only
      // fire from `reconciled` — a report can never confirm-complete with an
      // outstanding break or a rejection unresolved.
      id: 'confirm_complete',
      from: 'reconciled',
      to: 'confirmed_complete',
      by: ['trader', 'operator'],
      label: 'Confirm complete',
      intent: 'primary',
      input: { resolution_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ confirmed_complete_at: isoUtc(at) }),
    },
    {
      id: 'exempt',
      from: ['report_due', 'report_generated'],
      to: 'exempted',
      by: ['trader', 'operator'],
      label: 'Exempt',
      intent: 'secondary',
      input: {
        exemption_ref: { type: 'string' },
        exemption_basis: { type: 'string' },
      },
      requiresReason: ['intragroup_transaction', 'de_minimis_exemption', 'regulatory_carve_out'],
      guards: [],
      derive: (_f, at: Instant) => ({ exempted_at: isoUtc(at) }),
    },
    {
      id: 'cancel',
      from: ['report_due', 'report_generated', 'submitted_to_tr', 'tr_acknowledged', 'reconciled', 'break_identified', 'break_resolved', 'tr_rejected', 'corrected'],
      to: 'cancelled',
      by: ['trader', 'operator'],
      label: 'Cancel',
      intent: 'destructive',
      input: { resolution_notes: { type: 'string' } },
      requiresReason: ['trade_busted', 'trade_errored', 'duplicate_entry', 'client_cancellation'],
      guards: [],
      derive: (_f, at: Instant) => ({ cancelled_at: isoUtc(at) }),
    },
  ],

  // no timers: v1's SLA windows are materiality-graded per report_class (mixed
  // matrix — see trade-reporting-spec.ts SLA_MINUTES), which a single static
  // TimerDecl per state can't represent faithfully. The state `sla` hints
  // above carry the uniform/tightest-class figure for display; the actual
  // per-class breach detection stays a cron sweep outside this bundle rather
  // than a fabricated timer that would misfire for two of three classes.
};
