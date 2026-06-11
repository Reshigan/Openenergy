// Wave 92 — IPP Project Risk Register & Quantitative Schedule-Risk Analysis tab.
//
// The PROJECT-RISK-MANAGEMENT core of a best-in-class projects system. W1 gave
// the schedule (CPM/Gantt); W19/W20 procurement + COD; W81 change-control + EVM.
// W92 fills the gap every real capital project relies on next: QUANTIFYING risk
// via probability × impact, EMV, triangular Monte-Carlo cost & schedule risk
// analysis (SRA), and contingency drawdown traceability against the REIPPPP bid
// envelope. Beats Acumen Fuse Risk / Primavera Risk Analysis (PRA) / Safran
// Risk / @Risk / Crystal Ball / Deltek Acumen Risk / Riskonnect / Predict! /
// Synergi Life / Active Risk Manager — all of which treat the risk register as
// a static spreadsheet disconnected from EVM and from the bid envelope — via a
// LIVE-scored P50/P80 EMV battery, residual EMV after planned response,
// contingency drawdown vs project_reserve, and a bid-envelope-breach %.

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
  | 'identified' | 'assessed' | 'quantified' | 'response_planned' | 'response_active'
  | 'monitoring' | 'realized' | 'closed' | 'accepted' | 'escalated'
  | 'withdrawn' | 'cancelled';

type Tier = 'low' | 'moderate' | 'high' | 'critical';

interface RiskRow {
  [key: string]: unknown;
  id: string;
  risk_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string | null;
  reipppp_bid_window: string | null;
  facility_id: string | null;
  facility_name: string | null;
  risk_owner_party_id: string | null;
  risk_owner_party_name: string | null;
  raised_by_party_id: string | null;
  raised_by_party_name: string | null;
  risk_class: string;
  risk_category: string | null;
  risk_title: string | null;
  risk_description: string | null;
  risk_tier: Tier;
  authority_required: string | null;
  probability_pct: number;
  probability_band: number | null;
  worst_case_cost_impact_zar: number;
  worst_case_schedule_impact_days: number;
  impact_band: number | null;
  cost_optimistic_zar: number | null;
  cost_most_likely_zar: number | null;
  cost_pessimistic_zar: number | null;
  schedule_optimistic_days: number | null;
  schedule_most_likely_days: number | null;
  schedule_pessimistic_days: number | null;
  emv_zar: number | null;
  residual_emv_zar: number | null;
  integrity_floor_applied_flag: number;
  response_strategy: string | null;
  response_action: string | null;
  response_effectiveness_pct: number | null;
  response_owner: string | null;
  response_due_at: string | null;
  response_complete_flag: number;
  contingency_drawn_zar: number;
  total_contingency_zar: number;
  bid_envelope_zar: number;
  realized_flag: number;
  realized_cost_zar: number | null;
  realized_schedule_days: number | null;
  realized_basis: string | null;
  assess_basis: string | null;
  quantify_basis: string | null;
  response_plan_basis: string | null;
  response_active_basis: string | null;
  close_basis: string | null;
  escalate_basis: string | null;
  reason_code: string | null;
  response_summary: string | null;
  chain_status: ChainStatus;
  identified_at: string;
  assessed_at: string | null;
  quantified_at: string | null;
  response_planned_at: string | null;
  response_active_at: string | null;
  monitoring_at: string | null;
  realized_at: string | null;
  closed_at: string | null;
  accepted_at: string | null;
  escalated_at: string | null;
  withdrawn_at: string | null;
  cancelled_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // decorated
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  urgency_band?: string;
  is_reportable_flag?: boolean;
  high_tier_flag?: boolean;
  floor_at_high_class_flag?: boolean;
  signature_class_flag?: boolean;
  authority_required_live?: string;
  emv_zar_live?: number;
  tier_live?: Tier;
  p50_cost_zar_live?: number | null;
  p80_cost_zar_live?: number | null;
  p50_schedule_days_live?: number | null;
  p80_schedule_days_live?: number | null;
  residual_emv_zar_live?: number;
  bid_envelope_risk_pct_live?: number;
  bid_envelope_breach_flag?: boolean;
  contingency_drawdown_ratio_live?: number;
  contingency_exceeded_flag?: boolean;
}

interface RiskEvent {
  id: string;
  risk_id: string;
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
  realized_count: number;
  escalated_count: number;
  accepted_count: number;
  closed_count: number;
  withdrawn_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  signature_count: number;
  floor_applied_count: number;
  envelope_breach_count: number;
  contingency_exceeded_count: number;
  total_emv_zar: number;
  total_residual_emv_zar: number;
  total_worst_case_zar: number;
  total_realized_cost_zar: number;
}

const AUTHORITY_LABEL: Record<string, string> = {
  project_manager: 'Project manager',
  risk_owner:      'Risk owner',
  sponsor:         'Sponsor',
  board:           'Board capital committee',
  dmre_notify:     'Board + DMRE notification',
};

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'identified',
  'assessed',
  'quantified',
  'response_planned',
  'response_active',
  'monitoring',
  'realized',
  'closed',
];
const BRANCH_STATES: readonly string[] = [
  'accepted',
  'escalated',
  'withdrawn',
  'cancelled',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',             label: 'Open' },
  { key: 'all',              label: 'All' },
  { key: 'critical',         label: 'Critical' },
  { key: 'high',             label: 'High' },
  { key: 'moderate',         label: 'Moderate' },
  { key: 'low',              label: 'Low' },
  { key: 'quantified',       label: 'Quantified' },
  { key: 'response_active',  label: 'Response active' },
  { key: 'monitoring',       label: 'Monitoring' },
  { key: 'realized',         label: 'Realized' },
  { key: 'escalated',        label: 'Escalated' },
  { key: 'envelope_breach',  label: 'Bid-envelope breach' },
  { key: 'contingency_over', label: 'Contingency exceeded' },
  { key: 'signature',        label: 'Force majeure / regulatory' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
];

const TERMINAL_STATES: ChainStatus[] = ['closed', 'accepted', 'withdrawn', 'cancelled'];

// ── helpers ───────────────────────────────────────────────────────────────
function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}R${(a / 1_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}m`;
  if (a >= 1000) return `${sign}R${(a / 1000).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}k`;
  return `${sign}R${a.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: RiskRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const status = row.chain_status;

  // Primary forward action
  if (status === 'identified') {
    actions.push({
      key: 'assess',
      label: 'Assess (risk owner)',
      fields: [
        { key: 'probability_pct', label: 'Probability % (0–100)', type: 'number', required: false, placeholder: String(row.probability_pct ?? '') },
        { key: 'worst_case_cost_impact_zar', label: 'Worst-case cost impact (ZAR) — tier is derived from probability × worst', type: 'number', required: false, placeholder: String(row.worst_case_cost_impact_zar ?? '') },
        { key: 'worst_case_schedule_impact_days', label: 'Worst-case schedule impact (days)', type: 'number', required: false, placeholder: String(row.worst_case_schedule_impact_days ?? '') },
        { key: 'assess_basis', label: 'Assessment basis — qualitative scoring rationale', type: 'textarea', required: false, placeholder: '' },
        { key: 'assess_ref', label: 'Assessment reference', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'assessed') {
    actions.push({
      key: 'quantify',
      label: 'Quantify / SRA (project controls)',
      fields: [
        { key: 'cost_optimistic_zar', label: 'Cost optimistic (ZAR)', type: 'number', required: false, placeholder: row.cost_optimistic_zar != null ? String(row.cost_optimistic_zar) : '' },
        { key: 'cost_most_likely_zar', label: 'Cost most-likely (ZAR)', type: 'number', required: false, placeholder: row.cost_most_likely_zar != null ? String(row.cost_most_likely_zar) : '' },
        { key: 'cost_pessimistic_zar', label: 'Cost pessimistic (ZAR)', type: 'number', required: false, placeholder: row.cost_pessimistic_zar != null ? String(row.cost_pessimistic_zar) : '' },
        { key: 'schedule_optimistic_days', label: 'Schedule optimistic (days)', type: 'number', required: false, placeholder: row.schedule_optimistic_days != null ? String(row.schedule_optimistic_days) : '' },
        { key: 'schedule_most_likely_days', label: 'Schedule most-likely (days)', type: 'number', required: false, placeholder: row.schedule_most_likely_days != null ? String(row.schedule_most_likely_days) : '' },
        { key: 'schedule_pessimistic_days', label: 'Schedule pessimistic (days)', type: 'number', required: false, placeholder: row.schedule_pessimistic_days != null ? String(row.schedule_pessimistic_days) : '' },
        { key: 'quantify_basis', label: 'Quantify basis — triangular distribution + Monte-Carlo rationale', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'quantified') {
    actions.push({
      key: 'plan-response',
      label: 'Plan response (risk owner)',
      fields: [
        { key: 'response_strategy', label: 'Response strategy (avoid / transfer / mitigate / accept / exploit / share / enhance)', type: 'text', required: false, placeholder: row.response_strategy ?? '' },
        { key: 'response_action', label: 'Response action — concrete mitigation', type: 'textarea', required: false, placeholder: '' },
        { key: 'response_effectiveness_pct', label: 'Response effectiveness % (0–100)', type: 'number', required: false, placeholder: row.response_effectiveness_pct != null ? String(row.response_effectiveness_pct) : '' },
        { key: 'response_owner', label: 'Response owner', type: 'text', required: false, placeholder: '' },
        { key: 'total_contingency_zar', label: 'Total project contingency (ZAR)', type: 'number', required: false, placeholder: row.total_contingency_zar != null ? String(row.total_contingency_zar) : '' },
        { key: 'bid_envelope_zar', label: 'REIPPPP bid envelope (ZAR)', type: 'number', required: false, placeholder: row.bid_envelope_zar != null ? String(row.bid_envelope_zar) : '' },
        { key: 'response_plan_basis', label: 'Plan basis — response strategy rationale', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'response_planned') {
    actions.push({
      key: 'execute-response',
      label: 'Execute response (project manager)',
      fields: [
        { key: 'contingency_drawn_zar', label: 'Contingency drawn so far (ZAR)', type: 'number', required: false, placeholder: String(row.contingency_drawn_zar ?? 0) },
        { key: 'response_active_basis', label: 'Execution basis — response now under way', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'response_active') {
    actions.push({
      key: 'begin-monitoring',
      label: 'Begin monitoring (project controls)',
      fields: [
        { key: 'monitor_ref', label: 'Monitoring reference', type: 'text', required: false, placeholder: '' },
        { key: 'notes', label: 'Monitoring note — what is being watched', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'monitoring' || status === 'realized') {
    actions.push({
      key: 'close-risk',
      label: 'Close (sponsor)',
      fields: [
        { key: 'close_basis', label: 'Close basis — outcome + lessons learned', type: 'textarea', required: true, placeholder: '' },
        { key: 'close_ref', label: 'Close reference', type: 'text', required: false, placeholder: '' },
        { key: 'regulator_ref', label: 'Regulator reference (closing a critical realized risk is reportable)', type: 'text', required: false, placeholder: '' },
      ],
      // close_risk crosses critical + realized only (post-event close-out)
      cascadeTo: row.risk_tier === 'critical' || row.realized_flag === 1 ? ['regulator'] : [],
    });
  }

  if (status === 'escalated') {
    actions.push({
      key: 'reanalyze',
      label: 'Re-analyze (project controls)',
      fields: [
        { key: 'quantify_basis', label: 'Re-analysis basis — revised quantification', type: 'textarea', required: true, placeholder: '' },
        { key: 'reanalyze_ref', label: 'Re-analysis reference', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // Secondary actions per state
  if (['identified', 'assessed', 'quantified', 'escalated'].includes(status)) {
    actions.push({
      key: 'accept-risk',
      label: 'Accept as-is (sponsor)',
      fields: [
        { key: 'notes', label: 'Acceptance basis — sponsor accepts risk as-is (critical tier crosses regulator)', type: 'textarea', required: true, placeholder: '' },
        { key: 'accept_ref', label: 'Acceptance reference', type: 'text', required: false, placeholder: '' },
        { key: 'regulator_ref', label: 'Regulator reference (accepting a critical risk is a governance event)', type: 'text', required: false, placeholder: '' },
      ],
      // accept_risk crosses critical only (governance event)
      cascadeTo: row.risk_tier === 'critical' ? ['regulator'] : [],
      tone: 'danger' as const,
    });
  }

  if (['quantified', 'response_planned', 'response_active', 'monitoring', 'realized'].includes(status)) {
    actions.push({
      key: 'escalate',
      label: 'Escalate (project manager)',
      fields: [
        { key: 'escalate_basis', label: 'Escalation basis — material residual EMV; re-analyze required', type: 'textarea', required: true, placeholder: '' },
        { key: 'escalate_ref', label: 'Escalation reference', type: 'text', required: false, placeholder: '' },
        { key: 'regulator_ref', label: 'Regulator reference (escalation crosses for high+critical tiers)', type: 'text', required: false, placeholder: '' },
      ],
      // escalate crosses high+critical
      cascadeTo: (row.risk_tier === 'high' || row.risk_tier === 'critical') ? ['regulator'] : [],
      tone: 'warn' as const,
    });
  }

  if (['response_planned', 'response_active', 'monitoring'].includes(status)) {
    actions.push({
      key: 'realize-risk',
      label: 'Realize risk (project manager)',
      fields: [
        { key: 'realized_cost_zar', label: 'Realized cost impact (ZAR)', type: 'number', required: false, placeholder: '' },
        { key: 'realized_schedule_days', label: 'Realized schedule impact (days)', type: 'number', required: false, placeholder: '' },
        { key: 'contingency_drawn_zar', label: 'Updated contingency drawn (ZAR)', type: 'number', required: false, placeholder: String(row.contingency_drawn_zar ?? 0) },
        { key: 'realized_basis', label: 'Realization basis — risk event description', type: 'textarea', required: true, placeholder: '' },
        { key: 'regulator_ref', label: 'Regulator reference (force_majeure / regulatory_change crosses to DMRE / NERSA for EVERY tier)', type: 'text', required: false, placeholder: '' },
      ],
      // realize_risk for force_majeure / regulatory_change crosses regulator EVERY tier (W92 SIGNATURE)
      // other realize_risk crosses high+critical
      cascadeTo: (row.risk_class === 'force_majeure' || row.risk_class === 'regulatory_change')
        ? ['regulator']
        : (row.risk_tier === 'high' || row.risk_tier === 'critical') ? ['regulator'] : [],
      tone: 'danger' as const,
    });
  }

  if (['identified', 'assessed', 'quantified'].includes(status)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (raiser)',
      fields: [
        { key: 'notes', label: 'Withdrawal note — raiser pulls the risk', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
      tone: 'danger' as const,
    });
  }

  if (!TERMINAL_STATES.includes(status)) {
    actions.push({
      key: 'cancel',
      label: 'Cancel',
      fields: [
        { key: 'notes', label: 'Cancellation note', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
      tone: 'danger' as const,
    });
  }

  return actions;
}

function renderDetail(row: RiskRow): React.ReactNode {
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');
  const envPct = row.bid_envelope_risk_pct_live ?? null;

  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      {/* Live SRA Monte-Carlo battery */}
      <div className="rounded border mb-3 px-3 py-2" style={{ background: BG, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>Live SRA Monte-Carlo battery</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="EMV" value={fmtZar(row.emv_zar_live)} />
          <DetailPair label="Residual EMV" value={fmtZar(row.residual_emv_zar_live)} />
          <DetailPair label="Tier (live)" value={(row.tier_live ?? row.risk_tier).toString()} />
          <DetailPair label="Floor applied" value={row.floor_at_high_class_flag ? 'Yes (high)' : 'No'} />
          <DetailPair label="P50 cost" value={fmtZar(row.p50_cost_zar_live)} />
          <DetailPair label="P80 cost" value={fmtZar(row.p80_cost_zar_live)} />
          <DetailPair label="P50 schedule" value={row.p50_schedule_days_live != null ? `${fmtNum(row.p50_schedule_days_live, 0)}d` : '—'} />
          <DetailPair label="P80 schedule" value={row.p80_schedule_days_live != null ? `${fmtNum(row.p80_schedule_days_live, 0)}d` : '—'} />
        </div>
      </div>

      {/* Contingency & bid envelope */}
      <div className="rounded border mb-3 px-3 py-2" style={{ background: BG, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>Contingency &amp; bid envelope</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Contingency drawn" value={fmtZar(row.contingency_drawn_zar)} />
          <DetailPair label="Total contingency" value={fmtZar(row.total_contingency_zar)} />
          <DetailPair label="Drawdown ratio" value={row.contingency_drawdown_ratio_live != null ? fmtPct(row.contingency_drawdown_ratio_live * 100, 1) : '—'} />
          <DetailPair label="Contingency over" value={row.contingency_exceeded_flag ? 'YES' : 'No'} />
          <DetailPair label="Bid envelope" value={fmtZar(row.bid_envelope_zar)} />
          <DetailPair label="Envelope risk %" value={envPct != null ? fmtPct(envPct, 1) : '—'} />
          <DetailPair label="Envelope breach" value={row.bid_envelope_breach_flag ? 'BREACHED' : 'Within'} />
          <DetailPair label="Authority" value={authority} />
        </div>
      </div>

      {/* Core risk fields */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
        <DetailPair label="Risk class" value={row.risk_class} />
        <DetailPair label="Category" value={row.risk_category ?? '—'} />
        <DetailPair label="Probability" value={fmtPct(row.probability_pct, 0)} />
        <DetailPair label="Worst-case cost" value={fmtZar(row.worst_case_cost_impact_zar)} />
        <DetailPair label="Worst-case sched" value={`${row.worst_case_schedule_impact_days}d`} />
        <DetailPair label="Response strategy" value={row.response_strategy ?? '—'} />
        <DetailPair label="Response action" value={row.response_action ?? '—'} />
        <DetailPair label="Response effectiveness" value={row.response_effectiveness_pct != null ? fmtPct(row.response_effectiveness_pct, 0) : '—'} />
        <DetailPair label="Response owner" value={row.response_owner ?? '—'} />
        <DetailPair label="Response due" value={fmtDate(row.response_due_at)} />
        <DetailPair label="Risk owner" value={row.risk_owner_party_name ?? '—'} />
        <DetailPair label="Raised by" value={row.raised_by_party_name ?? '—'} />
        <DetailPair label="REIPPPP window" value={row.reipppp_bid_window ?? '—'} />
        <DetailPair label="Realized?" value={row.realized_flag === 1 ? 'Yes' : 'No'} />
        <DetailPair label="Realized cost" value={fmtZar(row.realized_cost_zar)} />
        <DetailPair label="Realized sched" value={row.realized_schedule_days != null ? `${row.realized_schedule_days}d` : '—'} />
        <DetailPair label="Reason code" value={row.reason_code ?? '—'} />
        <DetailPair label="Identified" value={fmtDate(row.identified_at)} />
        <DetailPair label="Assessed" value={fmtDate(row.assessed_at)} />
        <DetailPair label="Quantified" value={fmtDate(row.quantified_at)} />
        <DetailPair label="Response planned" value={fmtDate(row.response_planned_at)} />
        <DetailPair label="Response active" value={fmtDate(row.response_active_at)} />
        <DetailPair label="Monitoring" value={fmtDate(row.monitoring_at)} />
        <DetailPair label="Realized at" value={fmtDate(row.realized_at)} />
        <DetailPair label="Closed" value={fmtDate(row.closed_at)} />
        <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl" value={String(row.escalation_level)} />
        <DetailPair label="Reportable" value={row.is_reportable_flag ? 'Yes' : 'No'} />
        {row.source_wave && <DetailPair label="Source wave" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />}
      </div>

      {row.risk_description && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Risk description</div>
          <div style={{ color: TX2 }}>{row.risk_description}</div>
        </div>
      )}
      {row.assess_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Assessment basis</div>
          <div style={{ color: TX2 }}>{row.assess_basis}</div>
        </div>
      )}
      {row.quantify_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Quantify basis (SRA)</div>
          <div style={{ color: TX2 }}>{row.quantify_basis}</div>
        </div>
      )}
      {row.response_plan_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Response plan basis</div>
          <div style={{ color: TX2 }}>{row.response_plan_basis}</div>
        </div>
      )}
      {row.response_active_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Response active basis</div>
          <div style={{ color: TX2 }}>{row.response_active_basis}</div>
        </div>
      )}
      {row.realized_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Realization basis</div>
          <div style={{ color: TX2 }}>{row.realized_basis}</div>
        </div>
      )}
      {row.escalate_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Escalation basis</div>
          <div style={{ color: TX2 }}>{row.escalate_basis}</div>
        </div>
      )}
      {row.close_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Close basis</div>
          <div style={{ color: TX2 }}>{row.close_basis}</div>
        </div>
      )}
      {row.response_summary && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Response summary</div>
          <div style={{ color: TX2 }}>{row.response_summary}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function ProjectRiskChainTab() {
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RiskRow[] } & KpiSummary }>('/ipp/project-risk/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, realized_count: d.realized_count,
          escalated_count: d.escalated_count, accepted_count: d.accepted_count,
          closed_count: d.closed_count, withdrawn_count: d.withdrawn_count,
          cancelled_count: d.cancelled_count, breached: d.breached,
          reportable_total: d.reportable_total, signature_count: d.signature_count,
          floor_applied_count: d.floor_applied_count,
          envelope_breach_count: d.envelope_breach_count,
          contingency_exceeded_count: d.contingency_exceeded_count,
          total_emv_zar: d.total_emv_zar, total_residual_emv_zar: d.total_residual_emv_zar,
          total_worst_case_zar: d.total_worst_case_zar, total_realized_cost_zar: d.total_realized_cost_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load project risks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    // Inject fixed reason_code fields for certain actions
    const body: Record<string, string> = { ...values };
    if (key === 'realize-risk') body.reason_code = 'realized';
    if (key === 'close-risk') body.reason_code = 'closed';
    if (key === 'accept-risk') body.reason_code = 'accepted';
    if (key === 'withdraw') body.reason_code = 'withdrawn';
    if (key === 'cancel') body.reason_code = 'cancelled';
    if (key === 'escalate') body.reason_code = 'escalated';

    try {
      await api.post(`/ipp/project-risk/chain/${rowId}/${key}`, body);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/project-risk/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: RiskRow; events: ChainEvent[] } }>(`/ipp/project-risk/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'open')             return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')         return !!r.sla_breached;
      if (filter === 'reportable')       return !!r.is_reportable_flag;
      if (filter === 'envelope_breach')  return !!r.bid_envelope_breach_flag;
      if (filter === 'contingency_over') return !!r.contingency_exceeded_flag;
      if (filter === 'signature')        return !!r.signature_class_flag;
      if (['low', 'moderate', 'high', 'critical'].includes(filter)) {
        return r.risk_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis ?? {
    total: 0, open_count: 0, realized_count: 0, escalated_count: 0,
    accepted_count: 0, closed_count: 0, withdrawn_count: 0, cancelled_count: 0,
    breached: 0, reportable_total: 0, signature_count: 0, floor_applied_count: 0,
    envelope_breach_count: 0, contingency_exceeded_count: 0,
    total_emv_zar: 0, total_residual_emv_zar: 0, total_worst_case_zar: 0, total_realized_cost_zar: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Project risk register &amp; quantitative SRA</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage integrated risk-management chain · identified → assessed → quantified → response_planned →
          response_active → monitoring → closed, with realized (event occurred), escalated (re-analyze),
          accepted (sponsor as-is), and withdrawn/cancelled terminals. LIVE-scored P50/P80 EMV battery
          (triangular Monte-Carlo cost &amp; schedule), residual EMV after planned response, contingency drawdown
          vs project_reserve, and bid-envelope-breach % vs the REIPPPP commitment.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-2">
        <KpiTile label="Total risks" value={k.total} />
        <KpiTile label="Open" value={k.open_count} tone={k.open_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Realized" value={k.realized_count} tone={k.realized_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Escalated" value={k.escalated_count} tone={k.escalated_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Accepted" value={k.accepted_count} />
        <KpiTile label="Closed" value={k.closed_count} tone="ok" />
        <KpiTile label="Envelope breach" value={k.envelope_breach_count} tone={k.envelope_breach_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Contingency over" value={k.contingency_exceeded_count} tone={k.contingency_exceeded_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Signature class" value={k.signature_count} tone={k.signature_count > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached" value={k.breached} tone={k.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable" value={k.reportable_total} tone={k.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Total EMV" value={fmtZar(k.total_emv_zar)} />
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
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>{err}</div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const tierLabel = row.risk_tier.charAt(0).toUpperCase() + row.risk_tier.slice(1);
            const flags = [
              row.is_reportable_flag ? 'Reportable' : null,
              row.signature_class_flag ? 'Force majeure/regulatory' : null,
              row.bid_envelope_breach_flag ? 'Bid-envelope breach' : null,
              row.contingency_exceeded_flag ? 'Contingency exceeded' : null,
            ].filter(Boolean).join(' · ');
            const metaParts = [
              tierLabel,
              row.risk_class,
              row.facility_name ?? row.project_name ?? null,
              flags || null,
            ].filter(Boolean).join(' · ');

            return (
              <ChainCard
                key={row.id}
                item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={`${row.risk_number} · ${row.risk_title ?? row.project_name ?? '—'}`}
                meta={metaParts}
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No risks match.</div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
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

export default ProjectRiskChainTab;
