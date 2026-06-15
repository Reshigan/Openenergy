// Wave 101 — Offtaker PPA Annual Reconciliation & True-Up tab.
//
// 12-state P6 chain on oe_ppa_annual_recon. The annual financial-close gate
// of a PPA: year_opened → collect_data → classify_variance → compute_top_residual
// → apply_cpi_capacity → reconcile → (raise_dispute ⇄ resolve_dispute) →
// sign_off → invoice → settle → (restate_year escape door) + cancel_year.
// Aggregates W87 nominations, W32 take-or-pay residual, W39 CPI indexation,
// W46 deemed-energy credits, W54 payment-security activity, and capacity
// payment roll into ONE closed-year ledger with auditor + counterparty
// signoff. Tier RE-DERIVED on every transition from MAX(|variance|% band,
// top_residual_zar band) with FLOOR-AT-MATERIAL on four flags.
//
// Reportability (the W101 signature — IFRS 15 + NERSA s34 financial-close
// hard line): restate_year crosses regulator EVERY tier (post-signoff
// restatement); raise_dispute crosses EVERY tier (PPA disputes to NERSA s30);
// sign_off crosses material + major; cancel_year crosses EVERY tier when
// year had any delivery; SLA breaches cross material + major.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'year_opened' | 'data_collected' | 'variance_classified'
  | 'top_residual_computed' | 'cpi_capacity_applied' | 'reconciled'
  | 'disputed' | 'signed_off' | 'invoiced' | 'settled'
  | 'restated' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'major';
type Urgency = 'critical' | 'high' | 'medium' | 'low';
type Authority = 'settlement_analyst' | 'finance_controller' | 'finance_director' | 'cfo';

interface ParRow {
  [key: string]: unknown;
  id: string;
  recon_number: string;
  ppa_id: string;
  ppa_name: string | null;
  buyer_party_id: string | null;
  buyer_party_name: string | null;
  seller_party_id: string | null;
  seller_party_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  contract_year: number;
  contract_year_label: string | null;
  contract_year_end_strict: number;
  year_period_start: string | null;
  year_period_end: string | null;
  contracted_mwh: number | null;
  delivered_mwh: number | null;
  metered_mwh: number | null;
  curtailed_mwh: number | null;
  variance_mwh: number | null;
  variance_pct: number | null;
  base_tariff_zar_per_mwh: number | null;
  indexed_tariff_zar_per_mwh: number | null;
  deviation_tariff_zar_per_mwh: number | null;
  deemed_tariff_zar_per_mwh: number | null;
  capacity_tariff_zar_per_mw_year: number | null;
  installed_capacity_mw: number | null;
  availability_factor_decimal: number | null;
  energy_revenue_zar: number | null;
  capacity_payment_zar: number | null;
  deemed_energy_credit_zar: number | null;
  cpi_true_up_zar: number | null;
  top_residual_zar: number | null;
  prior_year_overpayment_zar: number | null;
  net_cash_position_zar: number | null;
  min_offtake_mwh: number | null;
  offtake_shortfall_pct: number | null;
  top_residual_over_r100m: number;
  cpi_true_up_over_r50m: number;
  offtake_shortfall_over_20_pct: number;
  current_tier: Tier;
  authority_required: string | null;
  dispute_count: number;
  restate_count: number;
  year_had_delivery: number;
  parent_recon_id: string | null;
  prior_year_recon_id: string | null;
  regulator_ref: string | null;
  invoice_ref: string | null;
  payment_ref: string | null;
  ppa_contract_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  disputed_reason: string | null;
  restated_reason: string | null;
  cancelled_reason: string | null;
  reason_code: string | null;
  chain_status: ChainStatus;
  year_opened_at: string | null;
  data_collected_at: string | null;
  variance_classified_at: string | null;
  top_residual_computed_at: string | null;
  cpi_capacity_applied_at: string | null;
  reconciled_at: string | null;
  disputed_at: string | null;
  signed_off_at: string | null;
  invoiced_at: string | null;
  settled_at: string | null;
  restated_at: string | null;
  cancelled_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  floor_at_material_flag?: boolean;
  reconciliation_completeness_index_live?: number;
  top_residual_zar_live?: number;
  cpi_true_up_zar_live?: number;
  capacity_payment_year_zar_live?: number;
  deemed_energy_credit_zar_live?: number;
  net_cash_position_zar_live?: number;
  mwh_contracted_pct_delivered_live?: number;
  days_to_signoff_live?: number;
  sla_days_remaining_live?: number;
  urgency_band_live?: Urgency;
  predicted_year_close_date_live?: string | null;
  authority_required_live?: Authority;
  days_in_court_live?: number;
}

interface ParEvent {
  id: string;
  recon_id: string;
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
  settled_count: number;
  signed_off_count: number;
  invoiced_count: number;
  reconciled_count: number;
  disputed_count: number;
  restated_count: number;
  cancelled_count: number;
  signoff_pending_count: number;
  breached: number;
  reportable_total: number;
  total_top_residual_zar: number;
  total_cpi_true_up_zar: number;
  total_deemed_energy_zar: number;
  total_capacity_payment_zar: number;
  total_net_cash_position_zar: number;
  avg_net_cash_position_zar: number;
  avg_completeness_index: number;
  critical_urgency_count: number;
  major_tier_count: number;
  floor_at_material_count: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'year_opened',
  'data_collected',
  'variance_classified',
  'top_residual_computed',
  'cpi_capacity_applied',
  'reconciled',
  'signed_off',
  'invoiced',
  'settled',
];

const BRANCH_STATES: readonly string[] = [
  'disputed',
  'restated',
  'cancelled',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active_open',           label: 'Open' },
  { key: 'all',                   label: 'All' },
  { key: 'minor',                 label: 'Minor' },
  { key: 'standard',              label: 'Standard' },
  { key: 'material',              label: 'Material' },
  { key: 'major',                 label: 'Major' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'year_opened',           label: 'Year opened' },
  { key: 'data_collected',        label: 'Data' },
  { key: 'variance_classified',   label: 'Classified' },
  { key: 'top_residual_computed', label: 'ToP residual' },
  { key: 'cpi_capacity_applied',  label: 'CPI/capacity' },
  { key: 'reconciled',            label: 'Reconciled' },
  { key: 'disputed',              label: 'Disputed' },
  { key: 'signed_off',            label: 'Signed off' },
  { key: 'invoiced',              label: 'Invoiced' },
  { key: 'settled',               label: 'Settled' },
  { key: 'restated',              label: 'Restated' },
  { key: 'cancelled',             label: 'Cancelled' },
];

const TERMINAL_STATES: ChainStatus[] = ['settled', 'restated', 'cancelled'];
const CANCEL_FROM: ChainStatus[] = ['year_opened', 'data_collected'];

const AUTHORITY_LABEL: Record<Authority, string> = {
  settlement_analyst: 'Settlement analyst',
  finance_controller: 'Finance controller',
  finance_director:   'Finance director',
  cfo:                'CFO',
};

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

function fmtMwh(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)} GWh`;
  return `${n.toFixed(1)} MWh`;
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(1)}k`;
  return `R${Math.round(n)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: ParRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const status = row.chain_status;

  // Primary forward action per state
  if (status === 'year_opened') {
    actions.push({
      key: 'collect-data',
      label: 'Collect annual data (settlement analyst)',
      fields: [
        { key: 'contracted_mwh', label: 'Contracted energy for year (MWh)', type: 'number', required: true, placeholder: String(row.contracted_mwh ?? '') },
        { key: 'delivered_mwh', label: 'Delivered energy for year (MWh)', type: 'number', required: false, placeholder: String(row.delivered_mwh ?? '') },
        { key: 'min_offtake_mwh', label: 'Minimum offtake / take-or-pay (MWh)', type: 'number', required: false, placeholder: String(row.min_offtake_mwh ?? '') },
        { key: 'curtailed_mwh', label: 'Curtailed energy for year (MWh)', type: 'number', required: false, placeholder: String(row.curtailed_mwh ?? '0') },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'data_collected') {
    actions.push({
      key: 'classify-variance',
      label: 'Classify variance (settlement analyst)',
      fields: [
        { key: 'variance_mwh', label: 'Variance (MWh = delivered − contracted)', type: 'number', required: false, placeholder: String(row.variance_mwh ?? '') },
        { key: 'variance_pct', label: 'Variance %', type: 'number', required: false, placeholder: String(row.variance_pct ?? '') },
        { key: 'offtake_shortfall_pct', label: 'Offtake shortfall %', type: 'number', required: false, placeholder: String(row.offtake_shortfall_pct ?? '0') },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'variance_classified') {
    actions.push({
      key: 'compute-top-residual',
      label: 'Compute take-or-pay residual (settlement analyst)',
      fields: [
        { key: 'top_residual_zar', label: 'Take-or-pay residual (ZAR)', type: 'number', required: false, placeholder: String(row.top_residual_zar ?? '') },
        { key: 'prior_year_overpayment_zar', label: 'Prior year overpayment to recover (ZAR)', type: 'number', required: false, placeholder: String(row.prior_year_overpayment_zar ?? '0') },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'top_residual_computed') {
    actions.push({
      key: 'apply-cpi-capacity',
      label: 'Apply CPI true-up + capacity roll (settlement analyst)',
      fields: [
        { key: 'cpi_true_up_zar', label: 'CPI true-up (ZAR)', type: 'number', required: false, placeholder: String(row.cpi_true_up_zar ?? '') },
        { key: 'capacity_payment_zar', label: 'Capacity payment for year (ZAR)', type: 'number', required: false, placeholder: String(row.capacity_payment_zar ?? '') },
        { key: 'deemed_energy_credit_zar', label: 'Deemed-energy credit (ZAR)', type: 'number', required: false, placeholder: String(row.deemed_energy_credit_zar ?? '0') },
        { key: 'energy_revenue_zar', label: 'Energy revenue for year (ZAR)', type: 'number', required: false, placeholder: String(row.energy_revenue_zar ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'cpi_capacity_applied') {
    actions.push({
      key: 'reconcile',
      label: 'Reconcile annual ledger (settlement analyst)',
      fields: [
        { key: 'net_cash_position_zar', label: 'Net cash position for year (ZAR)', type: 'number', required: false, placeholder: String(row.net_cash_position_zar_live ?? row.net_cash_position_zar ?? '') },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'reconciled') {
    // Primary: sign-off (crosses material + major)
    actions.push({
      key: 'sign-off',
      label: 'Sign off (finance controller + auditor + counterparty)',
      fields: [
        { key: 'auditor_party', label: 'Auditor confirming signoff', type: 'text', required: false, placeholder: 'PwC' },
        { key: 'counterparty_party', label: 'Counterparty confirming signoff', type: 'text', required: false, placeholder: String(row.seller_party_name ?? '') },
      ],
      cascadeTo: ['regulator'],
    });
    // Branch: raise dispute → crosses EVERY tier
    actions.push({
      key: 'raise-dispute',
      label: 'Raise dispute → NERSA s30 (counterparty)',
      fields: [
        { key: 'disputed_reason', label: 'Dispute reason (variance / tariff / curtailment / other)', type: 'textarea', required: true, placeholder: '' },
        { key: 'regulator_ref', label: 'NERSA s30 reference (if known)', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (status === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute → back to reconciled',
      fields: [],
      cascadeTo: [],
    });
  }

  if (status === 'signed_off') {
    actions.push({
      key: 'invoice',
      label: 'Issue annual invoice',
      fields: [
        { key: 'invoice_ref', label: 'Invoice reference', type: 'text', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'invoiced') {
    actions.push({
      key: 'settle',
      label: 'Mark settled (rest state — restate door stays open)',
      fields: [
        { key: 'payment_ref', label: 'Payment reference', type: 'text', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // Post-settled restate (crosses EVERY tier — IFRS 15 + NERSA s34 hard line)
  if (status === 'settled') {
    actions.push({
      key: 'restate-year',
      label: 'Restate year — IFRS 15 + NERSA s34 hard line',
      fields: [
        { key: 'restated_reason', label: 'Restatement reason (IFRS 15 + NERSA s34 disclosable)', type: 'textarea', required: true, placeholder: '' },
        { key: 'regulator_ref', label: 'NERSA inbox reference', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  // Cancel from year_opened or data_collected (crosses EVERY tier when year had delivery)
  if (CANCEL_FROM.includes(status)) {
    actions.push({
      key: 'cancel-year',
      label: 'Cancel year (pre-data abandonment)',
      fields: [
        { key: 'cancelled_reason', label: 'Cancellation reason', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: row.year_had_delivery ? ['regulator'] : [],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: ParRow): React.ReactNode {
  const authority = (row.authority_required_live ?? row.authority_required) as Authority | null;
  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      {/* Annual close battery */}
      <div className="mb-2" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>Annual close battery</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
        <DetailPair label="Completeness index" value={row.reconciliation_completeness_index_live != null ? `${row.reconciliation_completeness_index_live}` : '—'} />
        <DetailPair label="Days to signoff" value={row.days_to_signoff_live != null ? `${row.days_to_signoff_live.toFixed(1)}d` : '—'} />
        <DetailPair label="Days in court" value={row.days_in_court_live != null ? `${row.days_in_court_live}d` : '—'} />
        <DetailPair label="SLA window" value={fmtMinutes(row.sla_window_minutes)} />
        <DetailPair label="SLA days remaining" value={row.sla_days_remaining_live != null ? `${row.sla_days_remaining_live.toFixed(1)}d` : '—'} />
        <DetailPair label="Urgency" value={row.urgency_band_live ?? '—'} />
        <DetailPair label="ToP residual (live)" value={fmtZar(row.top_residual_zar_live ?? row.top_residual_zar)} />
        <DetailPair label="CPI true-up (live)" value={fmtZar(row.cpi_true_up_zar_live ?? row.cpi_true_up_zar)} />
        <DetailPair label="Capacity payment (live)" value={fmtZar(row.capacity_payment_year_zar_live ?? row.capacity_payment_zar)} />
        <DetailPair label="Deemed energy (live)" value={fmtZar(row.deemed_energy_credit_zar_live ?? row.deemed_energy_credit_zar)} />
        <DetailPair label="Net cash (live)" value={fmtZar(row.net_cash_position_zar_live ?? row.net_cash_position_zar)} />
        <DetailPair label="MWh contracted%delivered" value={fmtPct(row.mwh_contracted_pct_delivered_live)} />
        {authority && AUTHORITY_LABEL[authority] && (
          <DetailPair label="Authority required" value={AUTHORITY_LABEL[authority]} />
        )}
        {row.predicted_year_close_date_live && (
          <DetailPair label="Predicted close" value={fmtDate(row.predicted_year_close_date_live)} />
        )}
      </div>

      {/* Year inputs */}
      <div className="mb-2" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>Year inputs</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
        <DetailPair label="Contracted MWh" value={fmtMwh(row.contracted_mwh)} />
        <DetailPair label="Delivered MWh" value={fmtMwh(row.delivered_mwh)} />
        <DetailPair label="Metered MWh" value={fmtMwh(row.metered_mwh)} />
        <DetailPair label="Curtailed MWh" value={fmtMwh(row.curtailed_mwh)} />
        <DetailPair label="Variance MWh" value={fmtMwh(row.variance_mwh)} />
        <DetailPair label="Variance %" value={fmtPct(row.variance_pct)} />
        <DetailPair label="Min offtake MWh" value={fmtMwh(row.min_offtake_mwh)} />
        <DetailPair label="Offtake shortfall %" value={fmtPct(row.offtake_shortfall_pct)} />
        <DetailPair label="Installed MW" value={row.installed_capacity_mw != null ? `${row.installed_capacity_mw} MW` : '—'} />
        <DetailPair label="Availability" value={fmtPct(row.availability_factor_decimal != null ? row.availability_factor_decimal * 100 : null)} />
        <DetailPair label="Base tariff" value={row.base_tariff_zar_per_mwh != null ? `R${row.base_tariff_zar_per_mwh.toFixed(0)}/MWh` : '—'} />
        <DetailPair label="Indexed tariff" value={row.indexed_tariff_zar_per_mwh != null ? `R${row.indexed_tariff_zar_per_mwh.toFixed(0)}/MWh` : '—'} />
        <DetailPair label="Deviation tariff" value={row.deviation_tariff_zar_per_mwh != null ? `R${row.deviation_tariff_zar_per_mwh.toFixed(0)}/MWh` : '—'} />
        <DetailPair label="Deemed tariff" value={row.deemed_tariff_zar_per_mwh != null ? `R${row.deemed_tariff_zar_per_mwh.toFixed(0)}/MWh` : '—'} />
        <DetailPair label="Capacity tariff" value={row.capacity_tariff_zar_per_mw_year != null ? `R${(row.capacity_tariff_zar_per_mw_year / 1000).toFixed(0)}k/MW·yr` : '—'} />
        <DetailPair label="Energy revenue" value={fmtZar(row.energy_revenue_zar)} />
        <DetailPair label="Prior overpayment" value={fmtZar(row.prior_year_overpayment_zar)} />
        <DetailPair label="Year-end strict" value={row.contract_year_end_strict ? 'Yes (milestone)' : 'No'} />
      </div>

      {/* Floor & signoff flags */}
      <div className="mb-2" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>Floor &amp; signoff flags</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
        <DetailPair label="ToP > R100m" value={row.top_residual_over_r100m ? 'Yes — floor@material' : 'No'} />
        <DetailPair label="CPI true-up > R50m" value={row.cpi_true_up_over_r50m ? 'Yes — floor@material' : 'No'} />
        <DetailPair label="Shortfall > 20%" value={row.offtake_shortfall_over_20_pct ? 'Yes — floor@material' : 'No'} />
        <DetailPair label="Dispute count" value={String(row.dispute_count)} />
        <DetailPair label="Restate count" value={String(row.restate_count)} />
        <DetailPair label="Year had delivery" value={row.year_had_delivery ? 'Yes' : 'No'} />
        <DetailPair label="Reportable" value={row.is_reportable_flag ? 'Yes' : 'No'} />
        <DetailPair label="Breach crosses NERSA" value={row.breach_crosses_regulator ? 'Yes' : 'No'} />
        <DetailPair label="Invoice ref" value={row.invoice_ref ?? '—'} />
        <DetailPair label="Payment ref" value={row.payment_ref ?? '—'} />
        <DetailPair label="Reason code" value={row.reason_code ?? '—'} />
        <DetailPair label="Dispute count" value={String(row.dispute_count)} />
        <DetailPair label="PPA contract ref" value={row.ppa_contract_ref ?? '—'} />
        <DetailPair label="Regulator ref" value={row.regulator_ref ?? '—'} />
        <DetailPair label="Escalation level" value={String(row.escalation_level)} />
        <DetailPair label="Year opened" value={fmtDate(row.year_opened_at)} />
        <DetailPair label="Data collected" value={fmtDate(row.data_collected_at)} />
        <DetailPair label="Variance classified" value={fmtDate(row.variance_classified_at)} />
        <DetailPair label="ToP residual computed" value={fmtDate(row.top_residual_computed_at)} />
        <DetailPair label="CPI + capacity applied" value={fmtDate(row.cpi_capacity_applied_at)} />
        <DetailPair label="Reconciled at" value={fmtDate(row.reconciled_at)} />
        <DetailPair label="Disputed at" value={fmtDate(row.disputed_at)} />
        <DetailPair label="Signed off at" value={fmtDate(row.signed_off_at)} />
        <DetailPair label="Invoiced at" value={fmtDate(row.invoiced_at)} />
        <DetailPair label="Settled at" value={fmtDate(row.settled_at)} />
        <DetailPair label="Restated at" value={fmtDate(row.restated_at)} />
        <DetailPair label="Cancelled at" value={fmtDate(row.cancelled_at)} />
        <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      </div>

      {row.disputed_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Disputed reason</div>
          <div style={{ color: TX2 }}>{row.disputed_reason}</div>
        </div>
      )}
      {row.restated_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Restated reason</div>
          <div style={{ color: TX2 }}>{row.restated_reason}</div>
        </div>
      )}
      {row.cancelled_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Cancelled reason</div>
          <div style={{ color: TX2 }}>{row.cancelled_reason}</div>
        </div>
      )}
      {row.narrative && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Narrative</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.narrative}</div>
        </div>
      )}
      {row.result_text && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Result</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.result_text}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function PpaAnnualReconChainTab() {
  const [rows, setRows] = useState<ParRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active_open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ParRow[] } & KpiSummary }>('/offtaker/ppa-annual-recon/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setSummary({
          total: d.total,
          open_count: d.open_count,
          settled_count: d.settled_count,
          signed_off_count: d.signed_off_count,
          invoiced_count: d.invoiced_count,
          reconciled_count: d.reconciled_count,
          disputed_count: d.disputed_count,
          restated_count: d.restated_count,
          cancelled_count: d.cancelled_count,
          signoff_pending_count: d.signoff_pending_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          total_top_residual_zar: d.total_top_residual_zar,
          total_cpi_true_up_zar: d.total_cpi_true_up_zar,
          total_deemed_energy_zar: d.total_deemed_energy_zar,
          total_capacity_payment_zar: d.total_capacity_payment_zar,
          total_net_cash_position_zar: d.total_net_cash_position_zar,
          avg_net_cash_position_zar: d.avg_net_cash_position_zar,
          avg_completeness_index: d.avg_completeness_index,
          critical_urgency_count: d.critical_urgency_count,
          major_tier_count: d.major_tier_count,
          floor_at_material_count: d.floor_at_material_count,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PPA annual reconciliations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/offtaker/ppa-annual-recon/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/offtaker/ppa-annual-recon/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: ParRow; events: ChainEvent[] } }>(`/offtaker/ppa-annual-recon/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'active_open') return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'minor')       return r.current_tier === 'minor';
      if (filter === 'standard')    return r.current_tier === 'standard';
      if (filter === 'material')    return r.current_tier === 'material';
      if (filter === 'major')       return r.current_tier === 'major';
      if (filter === 'breached')    return !!r.sla_breached;
      if (filter === 'reportable')  return !!r.is_reportable_flag;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary;

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Offtaker PPA annual reconciliation &amp; true-up</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage P6 chain · year_opened → data_collected → variance_classified → top_residual_computed →
          cpi_capacity_applied → reconciled → signed_off → invoiced → settled (rest state · restate door open).
          Dispute branch loops via NERSA s30. INVERTED SLA — larger variance + residual = MORE time for forensic
          reconciliation, audit, counterparty signoff. Aggregates nominations, take-or-pay residual, CPI
          indexation, deemed-energy credits, and payment security into one signed-off ledger per year.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total" value={kpis?.total ?? rows.length} />
        <KpiTile label="Open" value={kpis?.open_count ?? 0} />
        <KpiTile label="Signoff pending" value={kpis?.signoff_pending_count ?? 0} />
        <KpiTile label="Signed off" value={kpis?.signed_off_count ?? 0} tone="ok" />
        <KpiTile label="Invoiced" value={kpis?.invoiced_count ?? 0} tone="ok" />
        <KpiTile label="Settled" value={kpis?.settled_count ?? 0} tone="ok" />
        <KpiTile label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Restated" value={kpis?.restated_count ?? 0} tone={(kpis?.restated_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Cancelled" value={kpis?.cancelled_count ?? 0} />
        <KpiTile label="Major tier" value={kpis?.major_tier_count ?? 0} tone={(kpis?.major_tier_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Critical urgency" value={kpis?.critical_urgency_count ?? 0} tone={(kpis?.critical_urgency_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Floor@material" value={kpis?.floor_at_material_count ?? 0} tone={(kpis?.floor_at_material_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Completeness avg" value={kpis ? kpis.avg_completeness_index.toFixed(1) : '—'} tone="ok" />
        <KpiTile label="ToP residual total" value={fmtZar(kpis?.total_top_residual_zar)} tone="warn" />
        <KpiTile label="CPI true-up total" value={fmtZar(kpis?.total_cpi_true_up_zar)} />
        <KpiTile label="Capacity total" value={fmtZar(kpis?.total_capacity_payment_zar)} />
        <KpiTile label="Deemed energy total" value={fmtZar(kpis?.total_deemed_energy_zar)} />
        <KpiTile label="Net cash total" value={fmtZar(kpis?.total_net_cash_position_zar)} tone="ok" />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{ background: filter === f.key ? ACC : BG2, color: filter === f.key ? '#fff' : TX2, border: `1px solid ${filter === f.key ? ACC : BORDER}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>{err}</div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const topRes = row.top_residual_zar_live ?? row.top_residual_zar;
            const netCash = row.net_cash_position_zar_live ?? row.net_cash_position_zar;
            return (
              <ChainCard
                key={row.id}
                item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.facility_name ?? row.ppa_name ?? row.recon_number}
                meta={`${row.recon_number} · Year ${row.contract_year_label ?? row.contract_year} · ${row.current_tier} · ${fmtZar(topRes)} ToP · ${fmtZar(netCash)} net`}
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No reconciliations match.</div>
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
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default PpaAnnualReconChainTab;
