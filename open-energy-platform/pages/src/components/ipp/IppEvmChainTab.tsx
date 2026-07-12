// Wave 113 — IPP Cost Management & Earned Value Management (EVM) chain (P6).
//
// 8th IPP chain. SECOND wave of Phase A IPP-parity push (after W112
// WBS & Gantt). BAC + committed/incurred + PV/EV/AC + CPI/SPI +
// EAC/ETC/TCPI + VAC + contingency/MR + variance + reforecast + CR +
// reconcile engine. Beats Primavera P6 / MS Project Cost / Procore
// Project Financials / Aconex Cost / Oracle Primavera Cloud Cost /
// Deltek Acumen Fuse / Deltek Cobra / SAP PS / Oracle EBS Projects.
//
// 14-state P6 (11-state forward + 3 branches) with INVERTED SLA polarity
// stored in HOURS: small 72h, medium 168h, large 336h, mega 480h on
// variance_detected anchor (larger budgets get LONGER cure runway).
// FLOOR-AT-LARGE tier overlay on 5 flags (cpi<0.85, contingency>=75%,
// MR drawn, forex_var>=10%, multi_currency_book); FLOOR-AT-MEGA on 2+
// flags. 4-step authority ladder: cost_engineer -> PM ->
// finance_director -> CFO. 22-field LIVE battery. 4-bridge architecture
// to W112 schedule + W21 drawdown + W30 disbursement + W77 reserve-acc.
//
// SIGNATURE crossings:
//  * draw_management_reserve crosses regulator EVERY tier when budget>=1
//    (signature hard line — MR draw is GOVERNANCE event always reportable)
//  * cancel crosses regulator EVERY tier when budget>=1
//  * publish_reforecast crosses regulator large+mega when VAC<0 OR CPI<0.85
//  * approve_CR crosses regulator mega only when cr_value>=10% of budget
//  * sla_breached crosses regulator large+mega
//
// Standards: PMBOK 7 + AACE RP-67R-11 + ANSI EIA-748-D + ISO 21500 +
// IFRS 15/IAS 11 + REIPPPP IPP Office + DMRE + SARB + NERSA Grid Code.

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
  | 'budget_set' | 'committed' | 'incurred' | 'measured'
  | 'variance_detected' | 'reforecast_drafted' | 'CR_logged' | 'CR_approved'
  | 'reforecast_published' | 'reconciled' | 'closed'
  | 'cancelled' | 'reforecast_rejected' | 'contingency_drawn';

type IpeTier = 'small' | 'medium' | 'large' | 'mega';
type IpeUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'cost_engineer' | 'PM' | 'finance_director' | 'CFO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';

interface IpeRow {
  [key: string]: unknown;
  id: string;
  evm_number: string;
  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  cost_book_period: string | null;
  schedule_ref: string | null;
  drawdown_ref: string | null;
  disbursement_ref: string | null;
  reserve_account_ref: string | null;
  total_budget_zar: number;
  contingency_initial_zar: number;
  contingency_drawn_zar: number;
  contingency_remaining_pct: number;
  management_reserve_initial_zar: number;
  management_reserve_drawn_zar: number;
  management_reserve_remaining_pct: number;
  currency_code: string;
  forex_component_pct: number;
  committed_cost_zar: number;
  incurred_cost_zar: number;
  invoiced_cost_zar: number;
  paid_cost_zar: number;
  last_cost_update_at: string | null;
  planned_value_zar: number;
  earned_value_zar: number;
  actual_cost_zar: number;
  budget_at_completion_zar: number;
  estimate_at_completion_zar: number;
  estimate_to_complete_zar: number;
  variance_at_completion_zar: number;
  cpi: number;
  spi: number;
  tcpi: number;
  cost_variance_zar: number;
  schedule_variance_zar: number;
  variance_count: number;
  reforecast_count: number;
  cr_count: number;
  cr_value_zar: number;
  last_variance_at: string | null;
  last_reforecast_at: string | null;
  last_cr_at: string | null;
  variance_reason: string | null;
  reforecast_reason: string | null;
  reforecast_rejection_reason: string | null;
  cr_summary: string | null;
  cpi_below_pct_85: number;
  contingency_consumed_pct_75: number;
  management_reserve_drawn: number;
  forex_variance_above_pct_10: number;
  multi_currency_book: number;
  current_tier: IpeTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  evm_health_band: HealthBand | null;
  evm_completeness_index: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  cancel_reason: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  budget_set_at: string | null;
  committed_at: string | null;
  incurred_at: string | null;
  measured_at: string | null;
  variance_detected_at: string | null;
  reforecast_drafted_at: string | null;
  cr_logged_at: string | null;
  cr_approved_at: string | null;
  reforecast_published_at: string | null;
  reconciled_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  reforecast_rejected_at: string | null;
  contingency_drawn_at: string | null;
  signoff_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated (LIVE 22-field battery)
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: IpeUrgency;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  cpi_live?: number;
  spi_live?: number;
  cost_variance_zar_live?: number;
  schedule_variance_zar_live?: number;
  estimate_at_completion_zar_live?: number;
  estimate_to_complete_zar_live?: number;
  variance_at_completion_zar_live?: number;
  tcpi_live?: number;
  vac_pct_of_bac_live?: number;
  contingency_remaining_pct_live?: number;
  management_reserve_remaining_pct_live?: number;
  evm_health_band_live?: HealthBand;
  floor_flag_count_live?: number;
  evm_completeness_index_live?: number;
  bridges_to_schedule_chain_live?: boolean;
  bridges_to_drawdown_chain_live?: boolean;
  bridges_to_disbursement_chain_live?: boolean;
  bridges_to_reserve_account_chain_live?: boolean;
}

interface IpeEvent {
  id: string;
  evm_id: string;
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
  active_count: number;
  variance_count: number;
  reforecast_drafted_count: number;
  cr_logged_count: number;
  cr_approved_count: number;
  published_count: number;
  contingency_drawn_count: number;
  rejected_count: number;
  closed_count: number;
  cancelled_count: number;
  mega_count: number;
  breached: number;
  reportable_total: number;
  mr_drawn_count: number;
  cpi_below_count: number;
  schedule_bridged_count: number;
  drawdown_bridged_count: number;
  disbursement_bridged_count: number;
  reserve_account_bridged_count: number;
  total_budget_zar_sum: number;
  earned_value_zar_sum: number;
  actual_cost_zar_sum: number;
  contingency_drawn_zar_sum: number;
  mr_drawn_zar_sum: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'budget_set', 'committed', 'incurred', 'measured',
  'variance_detected', 'reforecast_drafted', 'CR_logged', 'CR_approved',
  'reforecast_published', 'reconciled', 'closed',
];
const BRANCH_STATES: readonly string[] = [
  'cancelled', 'reforecast_rejected', 'contingency_drawn',
];

// ── filters ───────────────────────────────────────────────────────────────
// Row 1: action / lifecycle (priority filters)
const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'variance_detected',     label: 'Variance' },
  { key: 'reforecast_drafted',    label: 'Reforecast draft' },
  { key: 'CR_logged',             label: 'CR logged' },
  { key: 'CR_approved',           label: 'CR approved' },
  { key: 'contingency_drawn',     label: 'Contingency drawn' },
  { key: 'mr_drawn',              label: 'MR drawn' },
  { key: 'cpi_below',             label: 'CPI<0.85' },
  { key: 'health_red',            label: 'Health red' },
  { key: 'health_critical',       label: 'Health critical' },
];

// Row 2: lifecycle stages + tiers
const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'budget_set',            label: 'Budget set' },
  { key: 'committed',             label: 'Committed' },
  { key: 'incurred',              label: 'Incurred' },
  { key: 'measured',              label: 'Measured' },
  { key: 'reforecast_published',  label: 'Published' },
  { key: 'reconciled',            label: 'Reconciled' },
  { key: 'closed',                label: 'Closed' },
  { key: 'cancelled',             label: 'Cancelled' },
  { key: 'reforecast_rejected',   label: 'Reforecast reject' },
  { key: 'small',                 label: 'Small' },
  { key: 'medium',                label: 'Medium' },
  { key: 'large',                 label: 'Large' },
  { key: 'mega',                  label: 'Mega' },
];

// ── format helpers ────────────────────────────────────────────────────────
function fmtHoursSla(h: number | null | undefined): string {
  if (h === null || h === undefined) return '-';
  const sign = h < 0 ? '-' : '';
  const abs = Math.abs(h);
  if (abs >= 24) return `${sign}${(abs / 24).toFixed(1)}d`;
  if (abs >= 1)  return `${sign}${abs.toFixed(1)}h`;
  return `${sign}${Math.round(abs * 60)}m`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}R${(abs / 1_000_000_000).toFixed(2)}bn`;
  if (abs >= 1_000_000)     return `${sign}R${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1000)          return `${sign}R${(abs / 1000).toFixed(0)}k`;
  return `${sign}R${abs.toLocaleString('en-ZA')}`;
}

function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return '-';
  return `${n.toFixed(digits)}%`;
}

function fmtNum(n: number | null | undefined, digits = 3): string {
  if (n === null || n === undefined) return '-';
  return n.toFixed(digits);
}

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return `${n.toFixed(0)} MW`;
}

// ── overflow action eligibility ───────────────────────────────────────────
const CAN_SUBMIT_REVIEW: ChainStatus[] = ['budget_set', 'committed', 'incurred', 'measured', 'variance_detected', 'reforecast_drafted'];
const CAN_DRAW_CONTINGENCY: ChainStatus[] = ['CR_approved'];
const CAN_DRAW_MR: ChainStatus[] = ['CR_approved', 'contingency_drawn'];
const CAN_REJECT: ChainStatus[] = ['CR_logged'];
const CAN_CANCEL: ChainStatus[] = ['budget_set', 'committed', 'incurred', 'measured', 'variance_detected', 'reforecast_drafted', 'CR_logged', 'CR_approved', 'reforecast_published', 'reconciled', 'reforecast_rejected', 'contingency_drawn'];

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: IpeRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward action per state
  if (s === 'budget_set') {
    actions.push({
      key: 'commit-cost',
      label: 'Commit cost (Cost Engineer)',
      fields: [
        { key: 'committed_cost_zar', label: 'Newly committed cost (ZAR)', type: 'number', required: false, placeholder: String(row.committed_cost_zar || 0) },
      ],
      cascadeTo: [],
    });
  } else if (s === 'committed') {
    actions.push({
      key: 'incur-cost',
      label: 'Incur cost (Cost Engineer)',
      fields: [
        { key: 'actual_cost_zar',   label: 'Actual cost incurred (AC) ZAR', type: 'number', required: false, placeholder: String(row.actual_cost_zar || 0) },
        { key: 'incurred_cost_zar', label: 'Incurred cost total (ZAR)',      type: 'number', required: false, placeholder: String(row.incurred_cost_zar || 0) },
      ],
      cascadeTo: [],
    });
  } else if (s === 'incurred') {
    actions.push({
      key: 'measure-progress',
      label: 'Measure progress (Cost Engineer)',
      fields: [
        { key: 'earned_value_zar',  label: 'Earned value (EV) ZAR',  type: 'number', required: false, placeholder: String(row.earned_value_zar || 0) },
        { key: 'planned_value_zar', label: 'Planned value (PV) ZAR',  type: 'number', required: false, placeholder: String(row.planned_value_zar || 0) },
        { key: 'actual_cost_zar',   label: 'Actual cost (AC) ZAR',    type: 'number', required: false, placeholder: String(row.actual_cost_zar || 0) },
      ],
      cascadeTo: [],
    });
  } else if (s === 'measured') {
    actions.push({
      key: 'detect-variance',
      label: 'Detect variance (Cost Engineer)',
      fields: [
        { key: 'variance_reason', label: 'Variance reason (required for audit)', type: 'textarea', required: true, placeholder: row.variance_reason ?? '' },
      ],
      cascadeTo: [],
    });
  } else if (s === 'variance_detected' || s === 'reforecast_rejected') {
    actions.push({
      key: 'draft-reforecast',
      label: 'Draft reforecast (Cost Engineer)',
      fields: [
        { key: 'reforecast_reason',          label: 'Reforecast reason (required)',        type: 'textarea', required: true,  placeholder: row.reforecast_reason ?? '' },
        { key: 'estimate_at_completion_zar', label: 'Proposed estimate at completion (EAC) ZAR', type: 'number', required: false, placeholder: String(row.estimate_at_completion_zar || 0) },
      ],
      cascadeTo: [],
    });
  } else if (s === 'reforecast_drafted') {
    actions.push({
      key: 'log-cr',
      label: 'Log change request (PM)',
      fields: [
        { key: 'cr_summary',   label: 'CR summary (required for audit)', type: 'textarea', required: true,  placeholder: row.cr_summary ?? '' },
        { key: 'cr_value_zar', label: 'CR value (ZAR)',                  type: 'number',   required: false, placeholder: String(row.cr_value_zar || 0) },
      ],
      cascadeTo: [],
    });
  } else if (s === 'CR_logged') {
    actions.push({
      key: 'approve-cr',
      // crosses regulator mega only when cr_value>=10% of budget
      label: 'Approve CR (PM)',
      fields: [
        { key: 'notes', label: 'CR approval note (audit). NOTE: crosses regulator mega only when cr_value>=10% of budget.', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  } else if (s === 'CR_approved' || s === 'contingency_drawn') {
    actions.push({
      key: 'publish-reforecast',
      // crosses regulator large+mega when VAC<0 OR CPI<0.85
      label: 'Publish reforecast (PM)',
      fields: [
        { key: 'notes', label: 'Publish note (audit). NOTE: crosses regulator large+mega when VAC<0 OR CPI<0.85.', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  } else if (s === 'reforecast_published') {
    actions.push({
      key: 'reconcile',
      label: 'Reconcile (Finance Director)',
      fields: [
        { key: 'notes', label: 'Reconciliation note (Finance Director)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (s === 'reconciled') {
    actions.push({
      key: 'close-book',
      label: 'Close book (Finance Director)',
      fields: [
        { key: 'notes', label: 'Closing note (Finance Director — HARD terminal)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // Overflow: submit to PM review
  if (CAN_SUBMIT_REVIEW.includes(s)) {
    actions.push({
      key: 'submit-to-pm-review',
      label: 'Submit to PM review (PM)',
      fields: [
        { key: 'notes', label: 'PM review submission note', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // Overflow: reject reforecast
  if (CAN_REJECT.includes(s)) {
    actions.push({
      key: 'reject-reforecast',
      label: 'Reject reforecast (PM)',
      fields: [
        { key: 'reforecast_rejection_reason', label: 'Rejection reason (required for audit)', type: 'textarea', required: true, placeholder: row.reforecast_rejection_reason ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // Overflow: draw contingency
  if (CAN_DRAW_CONTINGENCY.includes(s)) {
    actions.push({
      key: 'draw-contingency',
      label: 'Draw contingency (Cost Engineer)',
      fields: [
        { key: 'contingency_drawn_zar', label: 'Contingency draw amount (ZAR)', type: 'number',   required: false, placeholder: '' },
        { key: 'reason_code',           label: 'Contingency draw reason',        type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // Overflow: draw management reserve — SIGNATURE crosses regulator EVERY tier when budget>=R1
  if (CAN_DRAW_MR.includes(s)) {
    actions.push({
      key: 'draw-management-reserve',
      label: 'Draw MR (CFO — SIGNATURE crosses regulator EVERY tier when >=R1)',
      fields: [
        { key: 'management_reserve_drawn_zar', label: 'MR draw amount (ZAR). NOTE: SIGNATURE — crosses regulator EVERY tier when budget>=R1.', type: 'number',   required: false, placeholder: '' },
        { key: 'reason_code',                  label: 'MR draw reason (governance)',                                                                   type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  // Overflow: cancel — SIGNATURE crosses regulator EVERY tier when budget>=R1
  if (CAN_CANCEL.includes(s)) {
    actions.push({
      key: 'cancel',
      label: 'Cancel (CFO — SIGNATURE crosses regulator EVERY tier when >=R1)',
      fields: [
        { key: 'cancel_reason', label: 'Cancellation reason (required). NOTE: SIGNATURE — crosses regulator EVERY tier when budget>=R1.', type: 'textarea', required: true, placeholder: row.cancel_reason ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: IpeRow): React.ReactNode {
  const cpiV = row.cpi_live ?? row.cpi;
  const spiV = row.spi_live ?? row.spi;
  const cvZar = row.cost_variance_zar_live ?? row.cost_variance_zar;
  const svZar = row.schedule_variance_zar_live ?? row.schedule_variance_zar;
  const eacV = row.estimate_at_completion_zar_live ?? row.estimate_at_completion_zar;
  const etcV = row.estimate_to_complete_zar_live ?? row.estimate_to_complete_zar;
  const vacV = row.variance_at_completion_zar_live ?? row.variance_at_completion_zar;
  const tcpiV = row.tcpi_live ?? row.tcpi;
  const completeness = row.evm_completeness_index_live ?? row.evm_completeness_index;
  const contRem = row.contingency_remaining_pct_live ?? row.contingency_remaining_pct;
  const mrRem = row.management_reserve_remaining_pct_live ?? row.management_reserve_remaining_pct;

  return (
    <div className="space-y-3 text-[11px]">
      {/* LIVE 22-field battery */}
      <DetailSection title="LIVE battery (22 fields, re-computed every fetch)">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="CPI"                  value={fmtNum(cpiV)} />
          <DetailPair label="SPI"                  value={fmtNum(spiV)} />
          <DetailPair label="TCPI"                 value={fmtNum(tcpiV)} />
          <DetailPair label="CV (ZAR)"             value={fmtZar(cvZar)} />
          <DetailPair label="SV (ZAR)"             value={fmtZar(svZar)} />
          <DetailPair label="VAC (ZAR)"            value={fmtZar(vacV)} />
          <DetailPair label="VAC % of BAC"         value={fmtPct((row.vac_pct_of_bac_live ?? 0) * 100)} />
          <DetailPair label="EAC (ZAR)"            value={fmtZar(eacV)} />
          <DetailPair label="ETC (ZAR)"            value={fmtZar(etcV)} />
          <DetailPair label="BAC (ZAR)"            value={fmtZar(row.budget_at_completion_zar)} />
          <DetailPair label="Contingency remaining" value={fmtPct(contRem)} />
          <DetailPair label="MR remaining"         value={fmtPct(mrRem)} />
          <DetailPair label="Health band"          value={row.evm_health_band_live ?? '-'} />
          <DetailPair label="Floor flags"          value={String(row.floor_flag_count_live ?? 0)} />
          <DetailPair label="Completeness"         value={`${completeness} / 130`} />
          <DetailPair label="SLA hours remaining"  value={fmtHoursSla(row.sla_hours_remaining_live)} />
          <DetailPair label="SLA window"           value={fmtHoursSla(row.sla_window_hours)} />
          <DetailPair label="Authority"            value={row.authority_required_live ?? '-'} />
          <DetailPair label="Urgency"              value={row.urgency_band_live ?? '-'} />
          <DetailPair label="Regulator filing"     value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
          <DetailPair label="Variance count"       value={String(row.variance_count)} />
          <DetailPair label="CR count"             value={String(row.cr_count)} />
        </div>
      </DetailSection>

      {/* Budget block */}
      <DetailSection title="Budget block (BAC + contingency + management reserve)">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Total budget"         value={fmtZar(row.total_budget_zar)} />
          <DetailPair label="Currency code"        value={row.currency_code ?? 'ZAR'} />
          <DetailPair label="Forex component"      value={fmtPct(row.forex_component_pct)} />
          <DetailPair label="BAC"                  value={fmtZar(row.budget_at_completion_zar)} />
          <DetailPair label="Contingency initial"  value={fmtZar(row.contingency_initial_zar)} />
          <DetailPair label="Contingency drawn"    value={fmtZar(row.contingency_drawn_zar)} />
          <DetailPair label="MR initial"           value={fmtZar(row.management_reserve_initial_zar)} />
          <DetailPair label="MR drawn"             value={fmtZar(row.management_reserve_drawn_zar)} />
        </div>
      </DetailSection>

      {/* Cost ledger */}
      <DetailSection title="Cost ledger (committed / incurred / invoiced / paid)">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Committed cost"       value={fmtZar(row.committed_cost_zar)} />
          <DetailPair label="Incurred cost"        value={fmtZar(row.incurred_cost_zar)} />
          <DetailPair label="Invoiced cost"        value={fmtZar(row.invoiced_cost_zar)} />
          <DetailPair label="Paid cost"            value={fmtZar(row.paid_cost_zar)} />
          <DetailPair label="Planned value (PV)"   value={fmtZar(row.planned_value_zar)} />
          <DetailPair label="Earned value (EV)"    value={fmtZar(row.earned_value_zar)} />
          <DetailPair label="Actual cost (AC)"     value={fmtZar(row.actual_cost_zar)} />
          <DetailPair label="Last cost update"     value={fmtDate(row.last_cost_update_at)} />
        </div>
      </DetailSection>

      {/* Bridges */}
      <DetailSection title="4-bridge architecture">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Schedule ref"             value={row.schedule_ref ?? '-'} />
          <DetailPair label="Drawdown ref"             value={row.drawdown_ref ?? '-'} />
          <DetailPair label="Disbursement ref"         value={row.disbursement_ref ?? '-'} />
          <DetailPair label="Reserve-account ref"      value={row.reserve_account_ref ?? '-'} />
          <DetailPair label="Regulator inbox ref"      value={row.regulator_inbox_ref ?? '-'} />
          <DetailPair label="Regulator ref"            value={row.regulator_ref ?? '-'} />
          <DetailPair label="Last variance at"         value={fmtDate(row.last_variance_at)} />
          <DetailPair label="Last reforecast at"       value={fmtDate(row.last_reforecast_at)} />
        </div>
      </DetailSection>

      {/* Floor flags */}
      <DetailSection title="Floor flags (5)">
        <div className="flex flex-wrap gap-2">
          <FlagPill label="CPI<0.85"                  on={!!row.cpi_below_pct_85} />
          <FlagPill label="Contingency consumed>=75%" on={!!row.contingency_consumed_pct_75} />
          <FlagPill label="MR drawn"                  on={!!row.management_reserve_drawn} />
          <FlagPill label="Forex variance>=10%"       on={!!row.forex_variance_above_pct_10} />
          <FlagPill label="Multi-currency book"       on={!!row.multi_currency_book} />
        </div>
      </DetailSection>

      {/* Reasons / narrative */}
      {(row.variance_reason || row.reforecast_reason || row.reforecast_rejection_reason || row.cr_summary || row.cancel_reason || row.narrative) && (
        <DetailSection title="Reasons / narrative">
          <div className="space-y-1.5" style={{ color: TX1 }}>
            {row.variance_reason && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Variance reason</div>
                <div style={{ color: TX2 }}>{row.variance_reason}</div>
              </div>
            )}
            {row.reforecast_reason && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Reforecast reason</div>
                <div style={{ color: TX2 }}>{row.reforecast_reason}</div>
              </div>
            )}
            {row.reforecast_rejection_reason && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Reforecast rejection</div>
                <div style={{ color: TX2 }}>{row.reforecast_rejection_reason}</div>
              </div>
            )}
            {row.cr_summary && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>CR summary</div>
                <div style={{ color: TX2 }}>{row.cr_summary}</div>
              </div>
            )}
            {row.cancel_reason && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Cancel reason</div>
                <div style={{ color: TX2 }}>{row.cancel_reason}</div>
              </div>
            )}
            {row.narrative && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Narrative</div>
                <div style={{ color: TX2 }}>{row.narrative}</div>
              </div>
            )}
          </div>
        </DetailSection>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function IppEvmChainTab() {
  const [rows, setRows] = useState<IpeRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IpeRow[] } & KpiSummary }>('/ipp/cost-evm/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          variance_count: data.variance_count || 0,
          reforecast_drafted_count: data.reforecast_drafted_count || 0,
          cr_logged_count: data.cr_logged_count || 0,
          cr_approved_count: data.cr_approved_count || 0,
          published_count: data.published_count || 0,
          contingency_drawn_count: data.contingency_drawn_count || 0,
          rejected_count: data.rejected_count || 0,
          closed_count: data.closed_count || 0,
          cancelled_count: data.cancelled_count || 0,
          mega_count: data.mega_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          mr_drawn_count: data.mr_drawn_count || 0,
          cpi_below_count: data.cpi_below_count || 0,
          schedule_bridged_count: data.schedule_bridged_count || 0,
          drawdown_bridged_count: data.drawdown_bridged_count || 0,
          disbursement_bridged_count: data.disbursement_bridged_count || 0,
          reserve_account_bridged_count: data.reserve_account_bridged_count || 0,
          total_budget_zar_sum: data.total_budget_zar_sum || 0,
          earned_value_zar_sum: data.earned_value_zar_sum || 0,
          actual_cost_zar_sum: data.actual_cost_zar_sum || 0,
          contingency_drawn_zar_sum: data.contingency_drawn_zar_sum || 0,
          mr_drawn_zar_sum: data.mr_drawn_zar_sum || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load IPP Cost & EVM chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ipp/cost-evm/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/cost-evm/chain/${rowId}`);
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
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/cost-evm/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !r.is_terminal;
      if (filter === 'reportable')      return r.is_reportable_flag;
      if (filter === 'breached')        return r.sla_breached_live;
      if (filter === 'mr_drawn')        return !!r.management_reserve_drawn;
      if (filter === 'cpi_below')       return !!r.cpi_below_pct_85;
      if (filter === 'health_red')      return r.evm_health_band_live === 'red';
      if (filter === 'health_critical') return r.evm_health_band_live === 'critical';
      if (['small', 'medium', 'large', 'mega'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, active_count: 0, variance_count: 0,
    reforecast_drafted_count: 0, cr_logged_count: 0, cr_approved_count: 0,
    published_count: 0, contingency_drawn_count: 0, rejected_count: 0,
    closed_count: 0, cancelled_count: 0, mega_count: 0, breached: 0,
    reportable_total: 0, mr_drawn_count: 0, cpi_below_count: 0,
    schedule_bridged_count: 0, drawdown_bridged_count: 0,
    disbursement_bridged_count: 0, reserve_account_bridged_count: 0,
    total_budget_zar_sum: 0, earned_value_zar_sum: 0, actual_cost_zar_sum: 0,
    contingency_drawn_zar_sum: 0, mr_drawn_zar_sum: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          IPP Cost Management &amp; Earned Value Management (EVM) — PMBOK 7 + AACE RP-67R-11 + ANSI EIA-748-D + ISO 21500 + IFRS 15/IAS 11 + REIPPPP + DMRE + SARB
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          14-state P6 cost-control lifecycle: budget set → committed → incurred → measured → variance detected → reforecast drafted → CR logged → CR approved →
          reforecast published → reconciled → closed, with cancelled / reforecast_rejected (loops back to draft) / contingency_drawn branches.
          INVERTED SLA polarity (HOURS) on variance_detected: small 72h, medium 168h, large 336h, mega 480h (larger budgets get LONGER cure runway).
          SIGNATURE: draw-management-reserve crosses regulator EVERY tier when budget≥R1; cancel crosses regulator EVERY tier ≥R1;
          publish-reforecast crosses large+mega when VAC&lt;0 OR CPI&lt;0.85; approve-CR crosses mega only when CR≥10% of budget.
          4-step authority ladder: cost_engineer → PM → finance_director → CFO.
          4 bridges: schedule, drawdown, disbursement, reserve-account.
        </p>
      </header>

      {/* 8-card KPI strip */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <KpiTile label="Active"       value={kpis.active_count}    tone={kpis.active_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Variance"     value={kpis.variance_count}  tone={kpis.variance_count > 0 ? 'bad' : undefined} />
        <KpiTile label="CR logged"    value={kpis.cr_logged_count} tone={kpis.cr_logged_count > 0 ? 'warn' : undefined} />
        <KpiTile label="MR drawn"     value={kpis.mr_drawn_count}  tone={kpis.mr_drawn_count > 0 ? 'bad' : undefined} />
        <KpiTile label="CPI<0.85"     value={kpis.cpi_below_count} tone={kpis.cpi_below_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached" value={kpis.breached}        tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Mega"         value={kpis.mega_count}      tone={kpis.mega_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Total"        value={kpis.total} />
      </div>

      {/* Sub-KPI bridge + portfolio totals strip */}
      <div className="mb-3 flex flex-wrap items-center gap-4" style={{ fontSize: 11, color: TX2 }}>
        <span>Reportable: <span style={{ fontWeight: 600, color: BAD }}>{kpis.reportable_total}</span></span>
        <span>Reforecast draft: <span style={{ fontWeight: 600, color: WARN }}>{kpis.reforecast_drafted_count}</span></span>
        <span>CR approved: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.cr_approved_count}</span></span>
        <span>Published: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.published_count}</span></span>
        <span>Contingency drawn: <span style={{ fontWeight: 600, color: BAD }}>{kpis.contingency_drawn_count}</span></span>
        <span>Closed: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.closed_count}</span></span>
        <span>Bridges to schedule: <span style={{ fontWeight: 600 }}>{kpis.schedule_bridged_count}</span></span>
        <span>Drawdown: <span style={{ fontWeight: 600 }}>{kpis.drawdown_bridged_count}</span></span>
        <span>Disbursement: <span style={{ fontWeight: 600 }}>{kpis.disbursement_bridged_count}</span></span>
        <span>Reserve-acc: <span style={{ fontWeight: 600 }}>{kpis.reserve_account_bridged_count}</span></span>
        <span>Budget total: <span style={{ fontWeight: 600 }}>{fmtZar(kpis.total_budget_zar_sum)}</span></span>
        <span>EV total: <span style={{ fontWeight: 600, color: GOOD }}>{fmtZar(kpis.earned_value_zar_sum)}</span></span>
        <span>AC total: <span style={{ fontWeight: 600, color: WARN }}>{fmtZar(kpis.actual_cost_zar_sum)}</span></span>
        <span>MR drawn ZAR: <span style={{ fontWeight: 600, color: BAD }}>{fmtZar(kpis.mr_drawn_zar_sum)}</span></span>
      </div>

      {/* Row 1: action / lifecycle filter pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ACTION.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{ background: filter === f.key ? ACC : BG2, color: filter === f.key ? '#fff' : TX2, border: `1px solid ${filter === f.key ? ACC : BORDER}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 2: lifecycle stages + tiers */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_LIFECYCLE.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{ background: filter === f.key ? ACC : BG2, color: filter === f.key ? '#fff' : TX3, border: `1px solid ${filter === f.key ? ACC : BORDER}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD, color: BAD }}>{err}</div>
      )}
      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const cpiV = row.cpi_live ?? row.cpi;
            const vacV = row.variance_at_completion_zar_live ?? row.variance_at_completion_zar;
            return (
              <ChainCard
                key={row.id}
                item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.evm_number}
                meta={[
                  row.project_name ?? row.project_id,
                  fmtMw(row.project_capacity_mw),
                  `${row.current_tier.toUpperCase()} • BAC ${fmtZar(row.total_budget_zar)} • CPI ${fmtNum(cpiV)} • VAC ${fmtZar(vacV)}`,
                ].filter(Boolean).join(' — ')}
                actions={getActions(row)}
                onAction={(key, values) => handleAction(row.id, key, values)}
                cascadeTo={[]}
                detail={renderDetail(row)}
                events={expandedEvents[row.id]}
                onExpand={handleExpand}
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No EVM rows match.</div>
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
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>{title}</div>
      <div className="rounded border p-2" style={{ background: BG, borderColor: BORDER }}>{children}</div>
    </div>
  );
}

function FlagPill({ label, on }: { label: string; on: boolean }) {
  return (
    <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{
      background: on ? 'color-mix(in oklab, var(--bad) 15%, var(--s1))' : BG2,
      color: on ? BAD : TX3,
      border: `1px solid ${on ? BAD : BORDER}`,
    }}>
      {label}{on ? ' ✓' : ''}
    </span>
  );
}

export default IppEvmChainTab;
