// pnl_attribution — W111 daily desk P&L attribution & risk-adjusted returns,
// as data.
//
// A trader opens the day's book, runs MTM, then walks realised → unrealised →
// factor attribution (delta/gamma/vega/theta/FX/carry/residual) → risk
// decomposition (VaR contribution, scenario impact, KRI exceedances) →
// benchmark comparison (alpha, tracking error, Sharpe/Sortino/max drawdown).
// The package then goes to the desk head for review: approved and published,
// or parked (held_for_review / variance_investigation) until cleared via the
// same override-hold edge. A published day can be corrected (restate_pnl,
// tone 'oxide' in v1 — a correction, not a routine step) before finance
// reconciles it against the operational books and archives it (hard
// terminal; the only door into `archived`).
//
// Structural honesty (no invented guards):
//  - Every step in the compute pipeline (run_mtm..submit_to_review) is a
//    single linear chain of states — there is no path to `approved` that
//    skips a computation stage, so no guard is needed to enforce sequencing.
//  - None of the 10 registry guards model a real rejection rule for this
//    chain: there is no counterparty (counterpartyCol is null in v1 — this
//    is a single-desk internal workflow, not a bilateral deal), no board
//    approval, no credit/CP evidence, no serial range, and none of the three
//    domain-specific regulator gates (capacity_mw / priority / hazard) apply
//    to a P&L run. Every transition below carries guards: [] rather than
//    reach for a guard that doesn't fit the fact pattern.
//
// settles:false — this chain computes and reports P&L; it never moves money
// or posts margin itself (R-S5-1). gross_notional_zar is the book's
// reference quantum for KPIs, not a settlement amount.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const pnlAttribution: ChainDecl = {
  key: 'pnl_attribution',
  noun: 'Daily P&L attribution',
  refPrefix: 'PNLA',
  title: (f) => `P&L attribution — ${(f.book_label as string) ?? 'unnamed book'} (${(f.business_date as string) ?? 'undated'})`,
  visibility: 'party',
  settles: false,
  roles: ['trader', 'risk_analyst', 'desk_head', 'finance', 'operator'],

  fields: {
    book_id: { type: 'string', label: 'Book ID' },
    book_label: { type: 'string', required: true, label: 'Book label' },
    desk_id: { type: 'string', label: 'Desk ID' },
    business_date: { type: 'string', required: true, label: 'Business date' },
    gross_notional_zar: { type: 'number', min: 0, label: 'Gross notional (ZAR)' },
    benchmark_label: { type: 'string', label: 'Benchmark label' },
    narrative: { type: 'string', label: 'Narrative' },
    mtm_zar: { type: 'number', label: 'MTM value (ZAR)' },
    realised_pnl_zar: { type: 'number', label: 'Realised P&L (ZAR)' },
    unrealised_pnl_zar: { type: 'number', label: 'Unrealised P&L (ZAR)' },
    delta_zar: { type: 'number', label: 'Delta attribution (ZAR)' },
    gamma_zar: { type: 'number', label: 'Gamma attribution (ZAR)' },
    vega_zar: { type: 'number', label: 'Vega attribution (ZAR)' },
    theta_zar: { type: 'number', label: 'Theta attribution (ZAR)' },
    fx_zar: { type: 'number', label: 'FX attribution (ZAR)' },
    carry_zar: { type: 'number', label: 'Carry attribution (ZAR)' },
    residual_zar: { type: 'number', label: 'Residual (unexplained) P&L (ZAR)' },
    var_contribution_zar: { type: 'number', label: 'VaR contribution (ZAR)' },
    scenario_impact_zar: { type: 'number', label: 'Scenario impact (ZAR)' },
    kri_exceedance_count: { type: 'number', min: 0, label: 'KRI exceedances' },
    benchmark_return_pct: { type: 'number', label: 'Benchmark return (%)' },
    alpha_pct: { type: 'number', label: 'Alpha (%)' },
    tracking_error_pct: { type: 'number', label: 'Tracking error (%)' },
    sharpe_ratio: { type: 'number', label: 'Sharpe ratio' },
    sortino_ratio: { type: 'number', label: 'Sortino ratio' },
    information_ratio: { type: 'number', label: 'Information ratio' },
    max_drawdown_pct: { type: 'number', label: 'Max drawdown (%)' },
    // written by derive, never by the client
    opened_at: { type: 'string', label: 'Opened at' },
    mtm_run_at: { type: 'string', label: 'MTM run at' },
    submitted_at: { type: 'string', label: 'Submitted for review at' },
    approved_at: { type: 'string', label: 'Approved at' },
    published_at: { type: 'string', label: 'Published at' },
    archived_at: { type: 'string', label: 'Archived at' },
  },

  initial: 'day_open',

  states: {
    day_open: { label: 'Day open', terminal: false, holder: 'trader', sla: { hours: 4 } },
    mtm_run: { label: 'MTM run', terminal: false, holder: 'trader', sla: { hours: 2 } },
    realised_computed: { label: 'Realised P&L computed', terminal: false, holder: 'trader', sla: { hours: 2 } },
    unrealised_computed: { label: 'Unrealised P&L computed', terminal: false, holder: 'risk_analyst', sla: { hours: 2 } },
    attribution_decomposed: { label: 'Attribution decomposed', terminal: false, holder: 'risk_analyst', sla: { hours: 2 } },
    risk_decomposed: { label: 'Risk decomposed', terminal: false, holder: 'risk_analyst', sla: { hours: 2 } },
    benchmark_compared: { label: 'Benchmark compared', terminal: false, holder: 'risk_analyst', sla: { hours: 2 } },
    reviewed: { label: 'Submitted for review', terminal: false, holder: 'desk_head', sla: { hours: 4 } },
    held_for_review: { label: 'Held for review', terminal: false, holder: 'desk_head', sla: { days: 2 } },
    variance_investigation: { label: 'Variance investigation', terminal: false, holder: 'desk_head', sla: { days: 3 } },
    approved: { label: 'Approved', terminal: false, holder: 'trader', sla: { hours: 4 } },
    published: { label: 'Published', terminal: false, holder: 'finance', sla: { days: 1 } },
    restated: { label: 'Restated', terminal: false, holder: 'finance', sla: { days: 1 } },
    reconciled: { label: 'Reconciled', terminal: false, holder: 'finance', sla: { days: 1 } },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'day_open',
      by: ['trader', 'operator'],
      actorBecomes: 'trader',
      label: 'Open daily P&L attribution',
      intent: 'primary',
      input: {
        book_id: { type: 'string' },
        book_label: { type: 'string', required: true },
        desk_id: { type: 'string' },
        business_date: { type: 'string', required: true },
        gross_notional_zar: { type: 'number', min: 0 },
        benchmark_label: { type: 'string' },
        narrative: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ opened_at: isoUtc(at) }),
    },
    {
      id: 'run_mtm',
      from: 'day_open',
      to: 'mtm_run',
      by: ['trader', 'operator'],
      label: 'Run MTM',
      intent: 'primary',
      input: { mtm_zar: { type: 'number', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ mtm_run_at: isoUtc(at) }),
    },
    {
      id: 'compute_realised',
      from: 'mtm_run',
      to: 'realised_computed',
      by: ['trader', 'operator'],
      label: 'Compute realised P&L',
      intent: 'primary',
      input: { realised_pnl_zar: { type: 'number', required: true } },
      guards: [],
    },
    {
      id: 'compute_unrealised',
      from: 'realised_computed',
      to: 'unrealised_computed',
      by: ['trader', 'operator'],
      label: 'Compute unrealised P&L',
      intent: 'primary',
      input: { unrealised_pnl_zar: { type: 'number', required: true } },
      guards: [],
    },
    {
      id: 'decompose_attribution',
      from: 'unrealised_computed',
      to: 'attribution_decomposed',
      by: ['risk_analyst', 'operator'],
      label: 'Decompose attribution',
      intent: 'primary',
      input: {
        delta_zar: { type: 'number' },
        gamma_zar: { type: 'number' },
        vega_zar: { type: 'number' },
        theta_zar: { type: 'number' },
        fx_zar: { type: 'number' },
        carry_zar: { type: 'number' },
        residual_zar: { type: 'number' },
      },
      guards: [],
    },
    {
      id: 'decompose_risk',
      from: 'attribution_decomposed',
      to: 'risk_decomposed',
      by: ['risk_analyst', 'operator'],
      label: 'Decompose risk',
      intent: 'primary',
      input: {
        var_contribution_zar: { type: 'number' },
        scenario_impact_zar: { type: 'number' },
        kri_exceedance_count: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'compare_to_benchmark',
      from: 'risk_decomposed',
      to: 'benchmark_compared',
      by: ['risk_analyst', 'operator'],
      label: 'Compare to benchmark',
      intent: 'primary',
      input: {
        benchmark_return_pct: { type: 'number' },
        alpha_pct: { type: 'number' },
        tracking_error_pct: { type: 'number' },
        sharpe_ratio: { type: 'number' },
        sortino_ratio: { type: 'number' },
        information_ratio: { type: 'number' },
        max_drawdown_pct: { type: 'number' },
      },
      guards: [],
    },
    {
      id: 'submit_to_review',
      from: 'benchmark_compared',
      to: 'reviewed',
      by: ['risk_analyst', 'operator'],
      label: 'Submit to review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },

    // --- desk-head review: approve, or park (two parking lots, one door out) --
    {
      id: 'hold_for_review',
      from: 'reviewed',
      to: 'held_for_review',
      by: ['desk_head', 'operator'],
      label: 'Hold for review',
      intent: 'destructive',
      requiresReason: ['unexplained_variance', 'data_quality_issue', 'pending_source_confirmation', 'model_review_required', 'sign_off_pending'],
      guards: [],
    },
    {
      id: 'flag_variance_investigation',
      from: 'reviewed',
      to: 'variance_investigation',
      by: ['risk_analyst', 'operator'],
      label: 'Flag variance investigation',
      intent: 'destructive',
      requiresReason: ['attribution_gap_exceeded', 'model_discrepancy', 'data_source_conflict', 'stale_market_data'],
      guards: [],
    },
    {
      // the one door back from either parking lot — v1 ships a single
      // override-hold action for both, so there is one edge here too.
      id: 'override_hold',
      from: ['held_for_review', 'variance_investigation'],
      to: 'reviewed',
      by: ['desk_head', 'operator'],
      label: 'Override hold',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'approve_pnl',
      from: 'reviewed',
      to: 'approved',
      by: ['trader', 'operator'],
      label: 'Approve P&L',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'publish_pnl',
      from: 'approved',
      to: 'published',
      by: ['trader', 'operator'],
      label: 'Publish P&L',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ published_at: isoUtc(at) }),
    },

    // --- post-publish correction (tone 'oxide' in v1 — a correction, not routine) --
    {
      id: 'restate_pnl',
      from: ['published', 'reconciled'],
      to: 'restated',
      by: ['trader', 'operator'],
      label: 'Restate P&L',
      intent: 'destructive',
      requiresReason: ['pricing_error', 'trade_booking_correction', 'fx_rate_correction', 'late_trade_capture', 'model_recalibration'],
      guards: [],
    },

    // --- close-out ---------------------------------------------------------
    {
      id: 'reconcile',
      from: ['published', 'restated'],
      to: 'reconciled',
      by: ['finance', 'operator'],
      label: 'Reconcile',
      intent: 'primary',
      guards: [],
    },
    {
      // the only door into `archived` — a day can never close without
      // finance reconciling it against the operational books first.
      id: 'archive_pnl',
      from: 'reconciled',
      to: 'archived',
      by: ['finance', 'operator'],
      label: 'Archive P&L',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ archived_at: isoUtc(at) }),
    },
  ],
};
