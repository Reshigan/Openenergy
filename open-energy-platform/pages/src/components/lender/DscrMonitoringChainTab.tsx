// Wave 86 — Lender DSCR Monitoring & Cure tab.
//
// The COVERAGE-DEFENSE engine of the project-finance loan book. LMA covenant
// schedule + SARB IFRS 9 Stage 2/3 trigger framework + Basel III LCR/NSFR. A
// best-in-class lender treasury tests DSCR / LLCR / PLCR on each contractual
// test date and runs a 12-state cure lifecycle when the loan slips below the
// pass threshold: clean certification, watch, breach, lock-up, cure proposal,
// execution, validation, acceleration to W45 or waiver. Distinct from W38
// (point-in-time CERTIFICATE chain) — W86 is the rolling MONITOR.
//
//   period_open → data_collected → computed → certified_clean
//                                          → watch → certified_clean
//                                          → breach_recorded →
//                                               (waive)        waived
//                                               (lock_up)      lock_up →
//                                                   (propose_cure) cure_proposed
//                                                   (declare_acc.) accelerated
//                                               (propose_cure) cure_proposed →
//                                                   (reject)  breach_recorded
//                                                   (execute) cure_in_progress →
//                                                       (validate) cure_validated → certified_clean
//                                                       (fail)     accelerated
//
// URGENT SLA — the LOWER the current DSCR (the more stressed the loan), the
// TIGHTER every window. Tier (4) is RE-DERIVED on every transition from the
// current DSCR so a project that started at minor can deteriorate into severe
// across periods, and a project that breached at material can recover after
// cure. Single write — the lender desk drives every step; actor_party records
// lender / borrower / independent_engineer per step.
//
// The W86 SIGNATURE is COVERAGE-DEFENSE — declare_acceleration crosses the
// regulator for EVERY tier (IFRS 9 Stage 3 trigger, sister of W45 write_off,
// W77 declare_breach, W68 declare_default — a categorical prudential event).
// waive_breach, enter_lock_up and sla_breached cross for material + severe.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'var(--s0, oklch(0.96 0.003 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG2    = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX2    = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';
const BAD    = 'var(--bad, oklch(0.48 0.20 20))';
const WARN   = 'var(--accent, oklch(0.50 0.18 55))';
const GOOD   = 'var(--good, oklch(0.40 0.16 155))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'period_open' | 'data_collected' | 'computed' | 'certified_clean'
  | 'watch' | 'breach_recorded' | 'cure_proposed' | 'cure_in_progress'
  | 'cure_validated' | 'lock_up' | 'accelerated' | 'waived';

type Tier = 'minor' | 'standard' | 'material' | 'severe';
type Urgency = 'critical' | 'high' | 'medium' | 'low';

interface DscrRow {
  [key: string]: unknown;
  id: string;
  monitoring_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_id: string;
  facility_name: string;
  project_id: string;
  project_name: string;
  borrower_id: string;
  borrower_name: string;
  lender_agent_id: string;
  lender_agent_name: string;
  test_period_label: string;
  test_period_start: string;
  test_period_end: string;
  test_date: string;
  pass_threshold: number;
  lockup_threshold: number;
  default_floor: number;
  equity_cure_cap_multiple: number;
  current_dscr: number | null;
  forward_dscr_p12m: number | null;
  backward_dscr_12m: number | null;
  llcr_value: number | null;
  plcr_value: number | null;
  cfads_period_zar: number;
  debt_service_period_zar: number;
  shortfall_zar: number;
  outstanding_debt_zar: number;
  npv_loan_life_zar: number;
  npv_project_life_zar: number;
  equity_cure_available_zar: number;
  dsra_balance_zar: number;
  proposed_cure_amount_zar: number;
  executed_cure_amount_zar: number;
  sister_loan_id: string | null;
  sister_loan_dscr: number | null;
  dscr_tier: Tier;
  is_systemic_carrier: number;
  annual_trend: number;
  watch_flag: number;
  breach_flag: number;
  lock_up_flag: number;
  cure_proposed_flag: number;
  cure_executing_flag: number;
  cure_validated_flag: number;
  accelerated_flag: number;
  waived_flag: number;
  last_action_ref: string | null;
  regulator_ref: string | null;
  chain_basis: string | null;
  reason_code: string | null;
  monitoring_summary: string | null;
  chain_status: ChainStatus;
  period_open_at: string;
  data_collected_at: string | null;
  computed_at: string | null;
  certified_clean_at: string | null;
  watch_at: string | null;
  breach_recorded_at: string | null;
  cure_proposed_at: string | null;
  cure_in_progress_at: string | null;
  cure_validated_at: string | null;
  lock_up_at: string | null;
  accelerated_at: string | null;
  waived_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  is_systemic_carrier_flag?: boolean;
  breach_crosses_regulator?: boolean;
  severity_index_live?: number;
  headroom_to_lockup_months_live?: number | null;
  cure_runway_days_live?: number | null;
  equity_cure_coverage_ratio_live?: number | null;
  dsra_coverage_ratio_live?: number | null;
  cross_default_risk_flag_live?: boolean;
  forward_dscr_live?: number | null;
  llcr_live?: number | null;
  plcr_live?: number | null;
  urgency_band_live?: Urgency;
}

interface DscrEvent {
  id: string;
  monitoring_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiSummary {
  total: number;
  open_count: number;
  certified_clean_count: number;
  accelerated_count: number;
  waived_count: number;
  breach_count: number;
  cure_active_count: number;
  lock_up_count: number;
  watch_count: number;
  breached: number;
  reportable_total: number;
  total_outstanding_zar: number;
  total_shortfall_zar: number;
  critical_urgency_count: number;
  cross_default_count: number;
  severe_tier_count: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'period_open',
  'data_collected',
  'computed',
  'watch',
  'breach_recorded',
  'cure_proposed',
  'cure_in_progress',
  'cure_validated',
  'lock_up',
  'certified_clean',
];

const BRANCH_STATES: readonly string[] = [
  'accelerated',
  'waived',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',             label: 'Open' },
  { key: 'all',              label: 'All' },
  { key: 'minor',            label: 'Minor' },
  { key: 'standard',         label: 'Standard' },
  { key: 'material',         label: 'Material' },
  { key: 'severe',           label: 'Severe' },
  { key: 'period_open',      label: 'Period open' },
  { key: 'data_collected',   label: 'Data collected' },
  { key: 'computed',         label: 'Computed' },
  { key: 'certified_clean',  label: 'Certified' },
  { key: 'watch',            label: 'Watch' },
  { key: 'breach_recorded',  label: 'Breach' },
  { key: 'cure_proposed',    label: 'Cure proposed' },
  { key: 'cure_in_progress', label: 'Cure in progress' },
  { key: 'cure_validated',   label: 'Cure validated' },
  { key: 'lock_up',          label: 'Lock-up' },
  { key: 'accelerated',      label: 'Accelerated' },
  { key: 'waived',           label: 'Waived' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'systemic',         label: 'Systemic' },
  { key: 'cross_default',    label: 'Cross-default' },
  { key: 'critical',         label: 'Critical urgency' },
];

const TERMINAL_STATES: ChainStatus[] = ['certified_clean', 'accelerated', 'waived'];

// ── format helpers ────────────────────────────────────────────────────────
function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtRatio(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return `${n.toFixed(dp)}×`;
}

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return n.toFixed(dp);
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: DscrRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'period_open') {
    actions.push({
      key: 'collect-data',
      label: 'Collect data (borrower)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Basis — borrower submitting CFADS / debt-service data for the test period', type: 'textarea', required: true, placeholder: '' },
        { key: 'cfads_period_zar', label: 'CFADS for the period (ZAR)', type: 'number', required: false, placeholder: String(row.cfads_period_zar ?? '') },
        { key: 'debt_service_period_zar', label: 'Debt service for the period (ZAR)', type: 'number', required: false, placeholder: String(row.debt_service_period_zar ?? '') },
        { key: 'shortfall_zar', label: 'Shortfall vs scheduled debt service (ZAR, 0 if none)', type: 'number', required: false, placeholder: String(row.shortfall_zar ?? 0) },
        { key: 'outstanding_debt_zar', label: 'Outstanding debt (ZAR)', type: 'number', required: false, placeholder: String(row.outstanding_debt_zar ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'data_collected') {
    actions.push({
      key: 'compute-ratios',
      label: 'Compute ratios (lender)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Basis — lender desk computing DSCR / LLCR / PLCR from the collected cash data', type: 'textarea', required: true, placeholder: '' },
        { key: 'current_dscr', label: 'Measured DSCR for this period', type: 'number', required: false, placeholder: String(row.current_dscr ?? '') },
        { key: 'forward_dscr_p12m', label: 'Forward-looking DSCR (12m)', type: 'number', required: false, placeholder: String(row.forward_dscr_p12m ?? '') },
        { key: 'backward_dscr_12m', label: 'Backward-looking DSCR (12m)', type: 'number', required: false, placeholder: String(row.backward_dscr_12m ?? '') },
        { key: 'llcr_value', label: 'LLCR value', type: 'number', required: false, placeholder: String(row.llcr_value ?? '') },
        { key: 'plcr_value', label: 'PLCR value', type: 'number', required: false, placeholder: String(row.plcr_value ?? '') },
        { key: 'npv_loan_life_zar', label: 'NPV loan life cash-flows (ZAR)', type: 'number', required: false, placeholder: String(row.npv_loan_life_zar ?? '') },
        { key: 'npv_project_life_zar', label: 'NPV project life cash-flows (ZAR)', type: 'number', required: false, placeholder: String(row.npv_project_life_zar ?? '') },
        { key: 'annual_trend', label: 'Annual DSCR trend (negative = deteriorating)', type: 'number', required: false, placeholder: String(row.annual_trend ?? 0) },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'computed' || s === 'watch' || s === 'cure_validated') {
    actions.push({
      key: 'certify-clean',
      label: 'Certify clean (lender)',
      tone: 'ghost',
      fields: [
        { key: 'chain_basis', label: 'Basis — ratios met the pass threshold, certifying the period clean', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'computed') {
    actions.push({
      key: 'place-on-watch',
      label: 'Place on watch (lender)',
      tone: 'warn',
      fields: [
        { key: 'chain_basis', label: 'Basis — DSCR above lock-up but below pass; place on the watch list', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code (e.g. trend_negative / curtailment / fx_drift)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'record-breach',
      label: 'Record breach (lender)',
      tone: 'warn',
      fields: [
        { key: 'chain_basis', label: 'Basis — DSCR breached the lock-up threshold; record a covenant breach', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code (e.g. lockup_breach / hard_breach / default_floor)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'watch') {
    actions.push({
      key: 'record-breach',
      label: 'Record breach (lender)',
      tone: 'warn',
      fields: [
        { key: 'chain_basis', label: 'Basis — DSCR breached the lock-up threshold; record a covenant breach', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code (e.g. lockup_breach / hard_breach / default_floor)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'breach_recorded') {
    actions.push({
      key: 'propose-cure',
      label: 'Propose cure (borrower)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Basis — borrower proposing an equity cure / DSRA top-up / restructure', type: 'textarea', required: true, placeholder: '' },
        { key: 'proposed_cure_amount_zar', label: 'Proposed cure amount (ZAR)', type: 'number', required: false, placeholder: String(row.proposed_cure_amount_zar ?? row.shortfall_zar ?? '') },
        { key: 'equity_cure_available_zar', label: 'Equity cure available (ZAR)', type: 'number', required: false, placeholder: String(row.equity_cure_available_zar ?? '') },
        { key: 'dsra_balance_zar', label: 'DSRA balance available (ZAR)', type: 'number', required: false, placeholder: String(row.dsra_balance_zar ?? '') },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'enter-lock-up',
      label: 'Enter distribution lock-up (lender)',
      tone: 'warn',
      fields: [
        { key: 'chain_basis', label: 'Basis — distribution lock-up notice issued under the LMA waterfall', type: 'textarea', required: true, placeholder: '' },
      ],
      // crosses regulator for material + severe
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'waive-breach',
      label: 'Waive breach (lender)',
      tone: 'ghost',
      fields: [
        { key: 'chain_basis', label: 'Basis — lender granting forbearance / waiver of the breach (crosses regulator for material+severe)', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code (e.g. temporary_waiver / refinance_pending / restructure_under_way)', type: 'text', required: false, placeholder: '' },
      ],
      // crosses regulator for material + severe
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'cure_proposed') {
    actions.push({
      key: 'execute-cure',
      label: 'Execute cure (borrower)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Basis — borrower executing the agreed cure (equity injection / DSRA draw)', type: 'textarea', required: true, placeholder: '' },
        { key: 'executed_cure_amount_zar', label: 'Executed cure amount (ZAR)', type: 'number', required: false, placeholder: String(row.executed_cure_amount_zar ?? row.proposed_cure_amount_zar ?? '') },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'reject-cure',
      label: 'Reject cure (lender)',
      tone: 'warn',
      fields: [
        { key: 'chain_basis', label: 'Basis — lender rejecting the cure proposal (return to breach_recorded)', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code (e.g. insufficient_cure / over_cap / unrealistic_source)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'cure_in_progress') {
    actions.push({
      key: 'validate-cure',
      label: 'Validate cure (independent engineer)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Basis — independent engineer / agent validating the cure restores DSCR', type: 'textarea', required: true, placeholder: '' },
        { key: 'current_dscr', label: 'Restored DSCR (post-cure)', type: 'number', required: false, placeholder: String(row.current_dscr ?? '') },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'fail-cure',
      label: 'Fail cure — escalate (lender)',
      tone: 'danger',
      fields: [
        { key: 'chain_basis', label: 'Basis — cure failed / DSCR did not recover; escalating to acceleration', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code (e.g. cure_failed / dscr_not_restored / abandoned)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'lock_up') {
    actions.push({
      key: 'propose-cure',
      label: 'Propose cure (borrower)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Basis — borrower proposing an equity cure / DSRA top-up / restructure', type: 'textarea', required: true, placeholder: '' },
        { key: 'proposed_cure_amount_zar', label: 'Proposed cure amount (ZAR)', type: 'number', required: false, placeholder: String(row.proposed_cure_amount_zar ?? row.shortfall_zar ?? '') },
        { key: 'equity_cure_available_zar', label: 'Equity cure available (ZAR)', type: 'number', required: false, placeholder: String(row.equity_cure_available_zar ?? '') },
        { key: 'dsra_balance_zar', label: 'DSRA balance available (ZAR)', type: 'number', required: false, placeholder: String(row.dsra_balance_zar ?? '') },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'declare-acceleration',
      label: 'Declare acceleration — IFRS 9 Stage 3 (lender)',
      tone: 'danger',
      fields: [
        { key: 'chain_basis', label: 'Basis — declaring acceleration / event of default; IFRS 9 Stage 3 trigger (crosses regulator for EVERY tier)', type: 'textarea', required: true, placeholder: '' },
        { key: 'reason_code', label: 'Reason code (e.g. lockup_failed / cure_window_lapsed / hard_breach)', type: 'text', required: false, placeholder: '' },
      ],
      // SIGNATURE: crosses regulator for EVERY tier
      cascadeTo: ['regulator'],
    });
  }

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: DscrRow): React.ReactNode {
  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      {/* Live coverage-defense battery */}
      <div className="mb-2">
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>
          Live coverage-defense battery
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Severity index"           value={fmtNum(row.severity_index_live)} />
          <DetailPair label="Urgency band"             value={row.urgency_band_live ?? '—'} />
          <DetailPair label="Headroom to lock-up (mo)" value={row.headroom_to_lockup_months_live != null ? fmtNum(row.headroom_to_lockup_months_live, 1) : '—'} />
          <DetailPair label="Cure runway (days)"       value={row.cure_runway_days_live != null ? String(row.cure_runway_days_live) : '—'} />
          <DetailPair label="Equity-cure coverage"     value={fmtRatio(row.equity_cure_coverage_ratio_live)} />
          <DetailPair label="DSRA coverage"            value={fmtRatio(row.dsra_coverage_ratio_live)} />
          <DetailPair label="Forward DSCR (live)"      value={fmtRatio(row.forward_dscr_live)} />
          <DetailPair label="LLCR (live)"              value={fmtRatio(row.llcr_live)} />
          <DetailPair label="PLCR (live)"              value={fmtRatio(row.plcr_live)} />
          <DetailPair label="Cross-default risk"       value={row.cross_default_risk_flag_live ? 'YES' : 'No'} />
        </div>
      </div>

      {/* Ratios & cash */}
      <div className="mb-2">
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>
          Ratios &amp; cash
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Current DSCR"         value={fmtRatio(row.current_dscr)} />
          <DetailPair label="Forward DSCR (p12m)"  value={fmtRatio(row.forward_dscr_p12m)} />
          <DetailPair label="Backward DSCR (12m)"  value={fmtRatio(row.backward_dscr_12m)} />
          <DetailPair label="LLCR"                 value={fmtRatio(row.llcr_value)} />
          <DetailPair label="PLCR"                 value={fmtRatio(row.plcr_value)} />
          <DetailPair label="Annual trend"         value={fmtNum(row.annual_trend, 3)} />
          <DetailPair label="Pass threshold"       value={fmtRatio(row.pass_threshold)} />
          <DetailPair label="Lock-up threshold"    value={fmtRatio(row.lockup_threshold)} />
          <DetailPair label="Default floor"        value={fmtRatio(row.default_floor)} />
          <DetailPair label="Equity-cure cap (×)"  value={fmtNum(row.equity_cure_cap_multiple, 1)} />
          <DetailPair label="CFADS (period)"       value={fmtZar(row.cfads_period_zar)} />
          <DetailPair label="Debt service (period)" value={fmtZar(row.debt_service_period_zar)} />
          <DetailPair label="Shortfall"            value={fmtZar(row.shortfall_zar)} />
          <DetailPair label="Outstanding debt"     value={fmtZar(row.outstanding_debt_zar)} />
          <DetailPair label="NPV loan life"        value={fmtZar(row.npv_loan_life_zar)} />
          <DetailPair label="NPV project life"     value={fmtZar(row.npv_project_life_zar)} />
          <DetailPair label="Equity cure available" value={fmtZar(row.equity_cure_available_zar)} />
          <DetailPair label="DSRA balance"         value={fmtZar(row.dsra_balance_zar)} />
          <DetailPair label="Proposed cure"        value={fmtZar(row.proposed_cure_amount_zar)} />
          <DetailPair label="Executed cure"        value={fmtZar(row.executed_cure_amount_zar)} />
          <DetailPair label="Sister loan"          value={row.sister_loan_id ?? '—'} />
          <DetailPair label="Sister loan DSCR"     value={fmtRatio(row.sister_loan_dscr)} />
        </div>
      </div>

      {/* Lifecycle timestamps */}
      <div className="mb-2">
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>
          Lifecycle timestamps
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Period open"      value={fmtDate(row.period_open_at)} />
          <DetailPair label="Data collected"   value={fmtDate(row.data_collected_at)} />
          <DetailPair label="Computed"         value={fmtDate(row.computed_at)} />
          <DetailPair label="Certified clean"  value={fmtDate(row.certified_clean_at)} />
          <DetailPair label="Watch"            value={fmtDate(row.watch_at)} />
          <DetailPair label="Breach recorded"  value={fmtDate(row.breach_recorded_at)} />
          <DetailPair label="Cure proposed"    value={fmtDate(row.cure_proposed_at)} />
          <DetailPair label="Cure in progress" value={fmtDate(row.cure_in_progress_at)} />
          <DetailPair label="Cure validated"   value={fmtDate(row.cure_validated_at)} />
          <DetailPair label="Lock-up"          value={fmtDate(row.lock_up_at)} />
          <DetailPair label="Accelerated"      value={fmtDate(row.accelerated_at)} />
          <DetailPair label="Waived"           value={fmtDate(row.waived_at)} />
          <DetailPair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
          <DetailPair label="Last SLA breach"  value={fmtDate(row.last_sla_breach_at)} />
          <DetailPair label="SLA status"       value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
          <DetailPair label="Escalation lvl"   value={String(row.escalation_level)} />
          <DetailPair label="Reportable"       value={row.is_reportable_flag ? 'Yes' : 'No'} />
          <DetailPair label="Reason code"      value={row.reason_code ?? '—'} />
          <DetailPair label="Regulator ref"    value={row.regulator_ref ?? '—'} />
          <DetailPair label="Last action ref"  value={row.last_action_ref ?? '—'} />
        </div>
      </div>

      {/* Basis blocks */}
      {row.chain_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-2" style={{ background: BG1, borderColor: BORDER }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Chain basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.chain_basis}</div>
        </div>
      )}
      {row.monitoring_summary && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-2" style={{ background: BG1, borderColor: BORDER }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: GOOD, marginBottom: 2 }}>Monitoring summary</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.monitoring_summary}</div>
        </div>
      )}

      {/* Period & party info */}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <DetailPair label="Period"          value={`${row.test_period_label} (${row.test_period_start} → ${row.test_period_end})`} />
        <DetailPair label="Test date"       value={row.test_date} />
        <DetailPair label="Facility"        value={row.facility_name} />
        <DetailPair label="Project"         value={row.project_name} />
        <DetailPair label="Lender agent"    value={row.lender_agent_name} />
        {row.source_wave && (
          <DetailPair label="Source wave"   value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />
        )}
      </div>
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function DscrMonitoringChainTab() {
  const [rows, setRows] = useState<DscrRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: DscrRow[] } & KpiSummary }>('/dscr-monitoring/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setSummary({
          total: d.total,
          open_count: d.open_count,
          certified_clean_count: d.certified_clean_count,
          accelerated_count: d.accelerated_count,
          waived_count: d.waived_count,
          breach_count: d.breach_count,
          cure_active_count: d.cure_active_count,
          lock_up_count: d.lock_up_count,
          watch_count: d.watch_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          total_outstanding_zar: d.total_outstanding_zar,
          total_shortfall_zar: d.total_shortfall_zar,
          critical_urgency_count: d.critical_urgency_count,
          cross_default_count: d.cross_default_count,
          severe_tier_count: d.severe_tier_count,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load DSCR monitoring records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/dscr-monitoring/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/dscr-monitoring/chain/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: DscrRow; events: DscrEvent[] } }>(`/dscr-monitoring/chain/${id}`);
      const evts = (res.data?.data?.events ?? []).map((e: DscrEvent) => ({
        id: e.id,
        event_type: e.event_type,
        from_status: e.from_status,
        to_status: e.to_status,
        actor_party: e.actor_party,
        notes: e.notes,
        created_at: e.created_at,
      } as ChainEvent));
      setExpandedEvents(prev => ({ ...prev, [id]: evts }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all')          return true;
      if (filter === 'open')         return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')     return !!r.sla_breached;
      if (filter === 'reportable')   return !!r.is_reportable_flag;
      if (filter === 'systemic')     return !!r.is_systemic_carrier_flag;
      if (filter === 'cross_default') return !!r.cross_default_risk_flag_live;
      if (filter === 'critical')     return r.urgency_band_live === 'critical';
      if (filter === 'minor' || filter === 'standard' || filter === 'material' || filter === 'severe') {
        return r.dscr_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length,
    open_count: 0,
    certified_clean_count: 0,
    accelerated_count: 0,
    waived_count: 0,
    breach_count: 0,
    cure_active_count: 0,
    lock_up_count: 0,
    watch_count: 0,
    breached: 0,
    reportable_total: 0,
    total_outstanding_zar: 0,
    total_shortfall_zar: 0,
    critical_urgency_count: 0,
    cross_default_count: 0,
    severe_tier_count: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>DSCR monitoring &amp; cure — the coverage-defense engine</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state DSCR monitoring lifecycle · the rolling MONITOR counterpart to the periodic covenant CERTIFICATE.
          LMA covenant schedule + SARB IFRS 9 Stage 2/3 trigger framework + Basel III LCR/NSFR. URGENT SLA: the LOWER
          the current DSCR, the TIGHTER every window. Tier is RE-DERIVED on every transition. SIGNATURE:
          declare_acceleration crosses regulator for EVERY tier (IFRS 9 Stage 3). waive_breach + enter_lock_up cross
          for material + severe.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"            value={kpis.total} />
        <KpiTile label="Open"             value={kpis.open_count}             tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Certified clean"  value={kpis.certified_clean_count}  tone="ok" />
        <KpiTile label="Watch"            value={kpis.watch_count}            tone={kpis.watch_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Breach"           value={kpis.breach_count}           tone={kpis.breach_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Cure active"      value={kpis.cure_active_count}      tone={kpis.cure_active_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Lock-up"          value={kpis.lock_up_count}          tone={kpis.lock_up_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Accelerated"      value={kpis.accelerated_count}      tone={kpis.accelerated_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Waived"           value={kpis.waived_count} />
        <KpiTile label="SLA breached"     value={kpis.breached}               tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Reportable"       value={kpis.reportable_total}       tone={kpis.reportable_total > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Critical urgency" value={kpis.critical_urgency_count} tone={kpis.critical_urgency_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Cross-default"    value={kpis.cross_default_count}    tone={kpis.cross_default_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Severe tier"      value={kpis.severe_tier_count}      tone={kpis.severe_tier_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Outstanding"      value={fmtZar(kpis.total_outstanding_zar)} />
        <KpiTile label="Shortfall"        value={fmtZar(kpis.total_shortfall_zar)}   tone={kpis.total_shortfall_zar > 0 ? 'warn' : 'ok'} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]"
          style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.monitoring_number}
              meta={`${row.borrower_name} · ${row.project_name} · ${row.dscr_tier} · DSCR ${fmtRatio(row.current_dscr)}`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]"
              style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No DSCR monitoring records match.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[80px]" style={{ background: BG1, borderColor: BORDER }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO }} className="tabular-nums">{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>{label}</div>
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default DscrMonitoringChainTab;
