// generation_revenue_assurance — reconciles metered generation against settled
// revenue for a site, and chases any material shortfall to recovery, dispute,
// or write-off, as data.
//
// Legacy source: W79 (chain-registry-meridian.ts, table
// oe_generation_revenue_assurance). The ESCO/O&M desk ingests metered vs
// settled vs invoiced generation for a billing period, reconciles it, and
// either closes clean (no material variance) or flags a variance that opens
// an investigation → leakage classification → recovery-claim track. A claim
// either recovers, gets disputed by the counterparty (then resolves recovered
// or written-off), or is written off directly. The case can be cancelled from
// any working state.
//
// Structural honesty (no invented guards):
//  - `recovered` is reachable ONLY via confirm_recovery (from recovery_pending)
//    or resolve_dispute_recovered (from in_dispute) — never bypassing the
//    recovery-claim step. A variance can never be marked "recovered" without
//    a recovery claim having actually been issued.
//  - issue_recovery_claim is guarded by complianceHaltClear: issuing a formal
//    recovery demand against a counterparty is a new binding commitment, so a
//    platform-wide compliance halt (POPIA / NERSA directive) blocks new ones
//    — but never blocks the investigation/classification steps that precede
//    it, and never blocks write-off/cancel (de-risking must stay possible).
//  - cancel_reconciliation and write_off are the two exits that abandon
//    recovery; both require a structured reason code (the v1 action's
//    reason_code field), unlike the forward-flow steps.
//
// settles:false — this chain records a reconciliation finding and a recovery
// case; the actual cash movement it authorises (an invoice, a credit note)
// settles on its own rail (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const generationRevenueAssurance: ChainDecl = {
  key: 'generation_revenue_assurance',
  noun: 'Generation revenue assurance case',
  refPrefix: 'GRA',
  title: (f) =>
    `Revenue assurance — ${(f.site_name as string) ?? 'unnamed site'} (${(f.counterparty_name as string) ?? 'counterparty TBC'})`,
  visibility: 'party',
  settles: false,
  roles: ['admin', 'support', 'esco', 'counterparty'],

  fields: {
    gra_number: { type: 'string', label: 'GRA number' },
    site_name: { type: 'string', required: true, label: 'Site name' },
    counterparty_name: { type: 'string', label: 'Counterparty' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Counterparty entity' },
    // ingest-data
    ingest_basis: { type: 'string', label: 'Ingest basis' },
    ingest_ref: { type: 'string', label: 'Ingest reference' },
    metered_generation_mwh: { type: 'number', min: 0, label: 'Metered generation (MWh)' },
    settled_generation_mwh: { type: 'number', min: 0, label: 'Settled generation (MWh)' },
    invoiced_generation_mwh: { type: 'number', min: 0, label: 'Invoiced generation (MWh)' },
    data_cutoff_date: { type: 'string', label: 'Data cutoff date' },
    // run-reconciliation / flag-variance / close-clean
    reconciliation_basis: { type: 'string', label: 'Reconciliation basis' },
    reconciliation_ref: { type: 'string', label: 'Reconciliation reference' },
    expected_generation_mwh: { type: 'number', min: 0, label: 'Expected generation (MWh)' },
    expected_revenue_zar: { type: 'number', min: 0, label: 'Expected revenue (ZAR)' },
    settled_revenue_zar: { type: 'number', min: 0, label: 'Settled revenue (ZAR)' },
    variance_zar: { type: 'number', label: 'Variance (ZAR)' },
    variance_mwh: { type: 'number', label: 'Variance (MWh)' },
    reason_code: { type: 'string', label: 'Reason code' },
    // investigation / classification
    investigation_basis: { type: 'string', label: 'Investigation basis' },
    investigation_ref: { type: 'string', label: 'Investigation reference' },
    classification_basis: { type: 'string', label: 'Classification basis' },
    classification_ref: { type: 'string', label: 'Classification reference' },
    leakage_category: { type: 'string', label: 'Leakage category' },
    // recovery claim
    recovery_basis: { type: 'string', label: 'Recovery basis' },
    recovery_ref: { type: 'string', label: 'Recovery reference' },
    recovery_method: { type: 'string', label: 'Recovery method' },
    recovery_deadline: { type: 'string', label: 'Recovery deadline' },
    recovered_zar: { type: 'number', min: 0, label: 'Recovered (ZAR)' },
    reviewer_name: { type: 'string', label: 'Reviewer' },
    // dispute
    dispute_basis: { type: 'string', label: 'Dispute basis' },
    dispute_ref: { type: 'string', label: 'Dispute reference' },
    dispute_deadline: { type: 'string', label: 'Dispute deadline' },
    resolution_basis: { type: 'string', label: 'Resolution basis' },
    resolution_ref: { type: 'string', label: 'Resolution reference' },
    // write-off / cancellation
    writeoff_basis: { type: 'string', label: 'Write-off basis' },
    writeoff_ref: { type: 'string', label: 'Write-off reference' },
    written_off_zar: { type: 'number', min: 0, label: 'Written off (ZAR)' },
    cancellation_basis: { type: 'string', label: 'Cancellation basis' },
    cancellation_ref: { type: 'string', label: 'Cancellation reference' },
    // written by derive, never by the client
    opened_at: { type: 'string', label: 'Opened at' },
    data_ingested_at: { type: 'string', label: 'Data ingested at' },
    reconciled_at: { type: 'string', label: 'Reconciled at' },
    variance_flagged_at: { type: 'string', label: 'Variance flagged at' },
    recovered_at: { type: 'string', label: 'Recovered at' },
    closed_at: { type: 'string', label: 'Closed at' },
  },

  initial: 'period_open',

  states: {
    period_open: { label: 'Period open', terminal: false, holder: 'esco', sla: { days: 5 } },
    data_ingested: { label: 'Data ingested', terminal: false, holder: 'esco', sla: { days: 5 } },
    reconciled: { label: 'Reconciled', terminal: false, holder: 'esco', sla: { days: 5 } },
    variance_flagged: { label: 'Variance flagged', terminal: false, holder: 'esco', sla: { days: 10 } },
    investigating: { label: 'Investigating', terminal: false, holder: 'esco', sla: { days: 15 } },
    classified: { label: 'Classified', terminal: false, holder: 'esco', sla: { days: 5 } },
    recovery_pending: { label: 'Recovery pending', terminal: false, holder: 'esco', sla: { days: 30 } },
    in_dispute: { label: 'In dispute', terminal: false, holder: 'esco', sla: { days: 30 } },
    recovered: { label: 'Recovered', terminal: true, holder: 'none' },
    closed_clean: { label: 'Closed clean', terminal: true, holder: 'none' },
    written_off: { label: 'Written off', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'period_open',
      by: ['admin', 'support', 'esco'],
      actorBecomes: 'esco',
      label: 'Open revenue assurance case',
      intent: 'primary',
      input: {
        site_name: { type: 'string', required: true },
        counterparty_name: { type: 'string' },
        counterparty_party: { type: 'party', role: 'counterparty' },
        gra_number: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'ingest_data',
      from: 'period_open',
      to: 'data_ingested',
      by: ['admin', 'support', 'esco'],
      label: 'Ingest data',
      intent: 'primary',
      input: {
        ingest_basis: { type: 'string' },
        ingest_ref: { type: 'string' },
        metered_generation_mwh: { type: 'number', min: 0 },
        settled_generation_mwh: { type: 'number', min: 0 },
        invoiced_generation_mwh: { type: 'number', min: 0 },
        data_cutoff_date: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ data_ingested_at: isoUtc(at) }),
    },
    {
      id: 'run_reconciliation',
      from: 'data_ingested',
      to: 'reconciled',
      by: ['admin', 'support', 'esco'],
      label: 'Run reconciliation',
      intent: 'primary',
      input: {
        reconciliation_basis: { type: 'string' },
        reconciliation_ref: { type: 'string' },
        expected_generation_mwh: { type: 'number', min: 0 },
        expected_revenue_zar: { type: 'number', min: 0 },
        settled_revenue_zar: { type: 'number', min: 0 },
        variance_zar: { type: 'number' },
        variance_mwh: { type: 'number' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ reconciled_at: isoUtc(at) }),
    },
    {
      // no material variance found — the early, clean exit from reconciled.
      id: 'close_clean',
      from: 'reconciled',
      to: 'closed_clean',
      by: ['admin', 'support', 'esco'],
      label: 'Close clean',
      intent: 'secondary',
      input: { reconciliation_basis: { type: 'string' }, reason_code: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
    {
      // material variance found — the branch this chain exists to run down.
      id: 'flag_variance',
      from: 'reconciled',
      to: 'variance_flagged',
      by: ['admin', 'support', 'esco'],
      label: 'Flag variance',
      intent: 'primary',
      input: {
        reconciliation_basis: { type: 'string' },
        variance_zar: { type: 'number' },
        variance_mwh: { type: 'number' },
        reason_code: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ variance_flagged_at: isoUtc(at) }),
    },
    {
      id: 'open_investigation',
      from: 'variance_flagged',
      to: 'investigating',
      by: ['admin', 'support', 'esco'],
      label: 'Open investigation',
      intent: 'primary',
      input: { investigation_basis: { type: 'string' }, investigation_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'classify_leakage',
      from: 'investigating',
      to: 'classified',
      by: ['admin', 'support', 'esco'],
      label: 'Classify leakage',
      intent: 'primary',
      input: {
        classification_basis: { type: 'string' },
        classification_ref: { type: 'string' },
        leakage_category: { type: 'string' },
        reason_code: { type: 'string' },
      },
      guards: [],
    },
    {
      // a formal recovery demand against the counterparty is a new binding
      // commitment — blocked under a platform-wide compliance halt.
      id: 'issue_recovery_claim',
      from: 'classified',
      to: 'recovery_pending',
      by: ['admin', 'support', 'esco'],
      label: 'Issue recovery claim',
      intent: 'primary',
      input: {
        recovery_basis: { type: 'string' },
        recovery_ref: { type: 'string' },
        recovery_method: { type: 'string' },
        recovery_deadline: { type: 'string' },
        counterparty_name: { type: 'string' },
      },
      guards: ['complianceHaltClear'],
    },
    {
      // structural recovery gate: reachable only from recovery_pending, which
      // is reachable only via issue_recovery_claim — a case can never be
      // marked recovered without a claim actually having been issued.
      id: 'confirm_recovery',
      from: 'recovery_pending',
      to: 'recovered',
      by: ['admin', 'support', 'esco'],
      label: 'Confirm recovery',
      intent: 'primary',
      input: {
        recovery_basis: { type: 'string' },
        recovery_ref: { type: 'string' },
        recovered_zar: { type: 'number', min: 0 },
        reviewer_name: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ recovered_at: isoUtc(at) }),
    },
    {
      id: 'raise_dispute',
      from: 'recovery_pending',
      to: 'in_dispute',
      by: ['admin', 'support', 'esco'],
      label: 'Raise dispute',
      intent: 'secondary',
      input: {
        dispute_basis: { type: 'string' },
        dispute_ref: { type: 'string' },
        dispute_deadline: { type: 'string' },
        counterparty_name: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'write_off',
      from: 'recovery_pending',
      to: 'written_off',
      by: ['admin', 'support', 'esco'],
      label: 'Write off',
      intent: 'destructive',
      input: {
        writeoff_basis: { type: 'string' },
        writeoff_ref: { type: 'string' },
        written_off_zar: { type: 'number', min: 0 },
        reviewer_name: { type: 'string' },
      },
      guards: [],
      requiresReason: ['uncollectible', 'below_materiality_threshold', 'counterparty_insolvent', 'legal_costs_exceed_recovery', 'statute_barred'],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
    {
      id: 'resolve_dispute_recovered',
      from: 'in_dispute',
      to: 'recovered',
      by: ['admin', 'support', 'esco'],
      label: 'Resolve dispute — recovered',
      intent: 'primary',
      input: {
        resolution_basis: { type: 'string' },
        resolution_ref: { type: 'string' },
        recovered_zar: { type: 'number', min: 0 },
        reviewer_name: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ recovered_at: isoUtc(at) }),
    },
    {
      id: 'resolve_dispute_writeoff',
      from: 'in_dispute',
      to: 'written_off',
      by: ['admin', 'support', 'esco'],
      label: 'Resolve dispute — write off',
      intent: 'destructive',
      input: {
        resolution_basis: { type: 'string' },
        writeoff_basis: { type: 'string' },
        writeoff_ref: { type: 'string' },
        written_off_zar: { type: 'number', min: 0 },
        reviewer_name: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
    {
      id: 'cancel_reconciliation',
      from: ['period_open', 'data_ingested', 'reconciled', 'variance_flagged', 'investigating', 'classified', 'recovery_pending', 'in_dispute'],
      to: 'cancelled',
      by: ['admin', 'support', 'esco', 'system'],
      label: 'Cancel reconciliation',
      intent: 'destructive',
      input: { cancellation_basis: { type: 'string' }, cancellation_ref: { type: 'string' } },
      guards: [],
      requiresReason: ['no_material_variance', 'duplicate_case', 'data_unavailable', 'case_superseded', 'recovery_window_lapsed'],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
  ],

  // recovery-window time-bar: a claim left unresolved past the window lapses
  // into cancellation rather than sitting open indefinitely. Record-only
  // stub — the sweep computes the real bar off the state sla days, same
  // pattern as disposition's cp_long_stop timer.
  timers: [
    { onState: 'recovery_pending', after: { days: 90 }, fire: 'cancel_reconciliation', kind: 'time_bar', reason: 'recovery_window_lapsed' },
  ],
};
