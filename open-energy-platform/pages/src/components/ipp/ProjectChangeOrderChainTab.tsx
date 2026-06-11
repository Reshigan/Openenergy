// Wave 81 — IPP Project Change-Order / Variation Control & Earned-Value tab.
//
// The PROJECT-CONTROLS core of a best-in-class projects system. W1 gave the IPP
// the schedule (CPM / Gantt / resource-leveling); W19/W20 gave it procurement
// and the construction-to-COD lifecycle. None of them manage the CHANGE — a
// site condition, design change, regulatory shift or client request lands a
// variation against the approved baseline. Project controls quantifies its
// cost / schedule / earned-value impact, draws it against the contingency
// reserve, gates approval on an authority tiered by magnitude, and only then
// RE-BASELINES the plan. This is that layer.
//
// DISTINCTIVE move (beat Primavera P6 EVM / Procore Change Management / MS
// Project baselines / Oracle Aconex): every change order is scored LIVE against
// the project earned-value battery (CV/SV/CPI/SPI/EAC/VAC/TCPI) and its
// contingency, the approval authority is DERIVED from the variation magnitude,
// and a variation that pushes the project past its REIPPPP BID ENVELOPE crosses
// to the regulator (DMRE / IPP Office) as a viability signal. Tier is DERIVED
// from |cost_impact_zar| and re-derived on every transition. INVERTED SLA — a
// larger variation gets MORE time. Reportable is RE-BASELINE-driven: incorporate
// crosses for HIGH tiers; approve / reject cross for critical; sla_breach HIGH.

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
  | 'draft' | 'submitted' | 'screening' | 'impact_assessment' | 'pending_approval'
  | 'approved' | 'incorporated' | 'deferred' | 'disputed' | 'rejected'
  | 'withdrawn' | 'cancelled';

type Tier = 'minor' | 'moderate' | 'major' | 'critical';

interface CoRow {
  [key: string]: unknown;
  id: string;
  co_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string | null;
  project_name: string;
  participant_id: string | null;
  participant_name: string | null;
  contractor_name: string | null;
  change_type: string | null;
  title: string;
  description: string | null;
  variation_tier: Tier;
  cost_impact_zar: number;
  schedule_impact_days: number;
  baseline_cost_zar: number | null;
  baseline_duration_days: number | null;
  contingency_zar: number | null;
  contingency_drawn_zar: number;
  earned_value_zar: number | null;
  planned_value_zar: number | null;
  actual_cost_zar: number | null;
  budget_at_completion_zar: number | null;
  cumulative_approved_variation_zar: number;
  cumulative_approved_days: number;
  bid_envelope_cost_pct: number | null;
  bid_envelope_schedule_days: number | null;
  approval_authority: string | null;
  approved_by: string | null;
  raised_by_party: string | null;
  reason_code: string | null;
  rejection_reason: string | null;
  dispute_reason: string | null;
  submission_ref: string | null;
  screening_ref: string | null;
  assessment_ref: string | null;
  approval_ref: string | null;
  incorporation_ref: string | null;
  deferral_ref: string | null;
  dispute_ref: string | null;
  rejection_ref: string | null;
  regulator_ref: string | null;
  evidence_ref: string | null;
  submission_basis: string | null;
  screening_basis: string | null;
  assessment_basis: string | null;
  approval_basis: string | null;
  incorporation_basis: string | null;
  deferral_basis: string | null;
  dispute_basis: string | null;
  rejection_basis: string | null;
  notes: string | null;
  chain_status: ChainStatus;
  draft_at: string;
  submitted_at: string | null;
  screening_at: string | null;
  impact_assessment_at: string | null;
  pending_approval_at: string | null;
  approved_at: string | null;
  incorporated_at: string | null;
  deferred_at: string | null;
  disputed_at: string | null;
  rejected_at: string | null;
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
  is_reportable_flag?: boolean;
  approval_authority_derived?: string;
  breach_crosses_regulator?: boolean;
  cost_variance_zar?: number;
  schedule_variance_zar?: number;
  cpi?: number;
  spi?: number;
  estimate_at_completion_zar?: number;
  variance_at_completion_zar?: number;
  tcpi?: number;
  contingency_remaining_zar?: number;
  within_contingency?: boolean;
  revised_baseline_cost_zar?: number;
  cumulative_overrun_pct?: number;
  breaches_bid_envelope?: boolean;
}

interface KpiSummary {
  total: number;
  open_count: number;
  pending_approval: number;
  in_assessment: number;
  disputed_count: number;
  deferred_count: number;
  incorporated_count: number;
  rejected_count: number;
  breached: number;
  reportable_total: number;
  bid_envelope_breaches: number;
  high_tier_count: number;
  total_cost_impact_zar: number;
  total_schedule_impact_days: number;
}

// Approval authority derived from the variation magnitude.
const AUTHORITY_LABEL: Record<string, string> = {
  project_manager: 'Project manager',
  sponsor:         'Sponsor',
  board:           'Board capital committee',
  dmre_notify:     'Board + DMRE notification',
};

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'draft',
  'submitted',
  'screening',
  'impact_assessment',
  'pending_approval',
  'approved',
  'incorporated',
];

const BRANCH_STATES: readonly string[] = [
  'deferred',
  'disputed',
  'rejected',
  'withdrawn',
  'cancelled',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',               label: 'Open' },
  { key: 'all',                label: 'All' },
  { key: 'critical',           label: 'Critical' },
  { key: 'major',              label: 'Major' },
  { key: 'moderate',           label: 'Moderate' },
  { key: 'minor',              label: 'Minor' },
  { key: 'pending_approval',   label: 'Pending approval' },
  { key: 'impact_assessment',  label: 'In assessment' },
  { key: 'disputed',           label: 'Disputed' },
  { key: 'deferred',           label: 'Deferred' },
  { key: 'bid_envelope',       label: 'Bid-envelope breach' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'incorporated',       label: 'Incorporated' },
  { key: 'rejected',           label: 'Rejected' },
];

const TERMINAL_STATES: ChainStatus[] = ['incorporated', 'rejected', 'withdrawn', 'cancelled'];

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

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

// ── getActions ─────────────────────────────────────────────────────────────
function getActions(row: CoRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // submit (draft)
  if (s === 'draft') {
    actions.push({
      key: 'submit',
      label: 'Submit (project manager)',
      fields: [
        { key: 'cost_impact_zar', label: 'Cost impact (ZAR) — tier is derived from this', type: 'number', required: false, placeholder: String(row.cost_impact_zar ?? '') },
        { key: 'schedule_impact_days', label: 'Schedule impact (days)', type: 'number', required: false, placeholder: String(row.schedule_impact_days ?? '') },
        { key: 'submission_basis', label: 'Submission basis — the variation cause + scope', type: 'textarea', required: false, placeholder: '' },
        { key: 'submission_ref', label: 'Submission reference', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({ key: 'withdraw', label: 'Withdraw (project manager)', fields: [{ key: 'notes', label: 'Withdrawal note — raiser pulls the variation', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
    actions.push({ key: 'cancel', label: 'Cancel (project manager)', fields: [{ key: 'notes', label: 'Cancellation note', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
  }

  // begin-screening (submitted)
  if (s === 'submitted') {
    actions.push({
      key: 'begin-screening',
      label: 'Begin screening (project controls)',
      fields: [
        { key: 'screening_basis', label: 'Screening basis — initial triage / merit', type: 'textarea', required: false, placeholder: '' },
        { key: 'screening_ref', label: 'Screening reference', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({ key: 'withdraw', label: 'Withdraw (project manager)', fields: [{ key: 'notes', label: 'Withdrawal note — raiser pulls the variation', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
    actions.push({ key: 'cancel', label: 'Cancel (project manager)', fields: [{ key: 'notes', label: 'Cancellation note', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
  }

  // assess-impact (screening)
  if (s === 'screening') {
    actions.push({
      key: 'assess-impact',
      label: 'Assess impact / EVM (project controls)',
      fields: [
        { key: 'cost_impact_zar', label: 'Assessed cost impact (ZAR) — re-derives tier', type: 'number', required: false, placeholder: String(row.cost_impact_zar ?? '') },
        { key: 'schedule_impact_days', label: 'Assessed schedule impact (days)', type: 'number', required: false, placeholder: String(row.schedule_impact_days ?? '') },
        { key: 'earned_value_zar', label: 'Earned value to date (ZAR)', type: 'number', required: false, placeholder: row.earned_value_zar != null ? String(row.earned_value_zar) : '' },
        { key: 'planned_value_zar', label: 'Planned value to date (ZAR)', type: 'number', required: false, placeholder: row.planned_value_zar != null ? String(row.planned_value_zar) : '' },
        { key: 'actual_cost_zar', label: 'Actual cost to date (ZAR)', type: 'number', required: false, placeholder: row.actual_cost_zar != null ? String(row.actual_cost_zar) : '' },
        { key: 'budget_at_completion_zar', label: 'Budget at completion (ZAR)', type: 'number', required: false, placeholder: row.budget_at_completion_zar != null ? String(row.budget_at_completion_zar) : '' },
        { key: 'assessment_basis', label: 'Assessment basis — cost / schedule / EVM rationale', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({ key: 'defer', label: 'Defer / park (project controls)', fields: [{ key: 'deferral_basis', label: 'Deferral basis — why the variation is parked', type: 'textarea', required: true, placeholder: '' }, { key: 'deferral_ref', label: 'Deferral reference', type: 'text', required: false, placeholder: '' }], cascadeTo: [], tone: 'danger' });
    actions.push({ key: 'reject', label: 'Reject (sponsor)', fields: [{ key: 'rejection_reason', label: 'Rejection reason', type: 'textarea', required: true, placeholder: '' }, { key: 'rejection_basis', label: 'Rejection basis', type: 'textarea', required: false, placeholder: '' }, { key: 'regulator_ref', label: 'Regulator reference (rejecting a critical variation can signal project distress — reportable)', type: 'text', required: false, placeholder: '' }], cascadeTo: ['regulator'], tone: 'danger' });
    actions.push({ key: 'withdraw', label: 'Withdraw (project manager)', fields: [{ key: 'notes', label: 'Withdrawal note — raiser pulls the variation', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
    actions.push({ key: 'cancel', label: 'Cancel (project manager)', fields: [{ key: 'notes', label: 'Cancellation note', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
  }

  // submit-for-approval (impact_assessment)
  if (s === 'impact_assessment') {
    actions.push({
      key: 'submit-for-approval',
      label: 'Submit for approval (project controls)',
      fields: [
        { key: 'assessment_basis', label: 'Assessment basis — package routed to approval authority', type: 'textarea', required: false, placeholder: '' },
        { key: 'approval_ref', label: 'Approval reference', type: 'text', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({ key: 'reject', label: 'Reject (sponsor)', fields: [{ key: 'rejection_reason', label: 'Rejection reason', type: 'textarea', required: true, placeholder: '' }, { key: 'rejection_basis', label: 'Rejection basis', type: 'textarea', required: false, placeholder: '' }, { key: 'regulator_ref', label: 'Regulator reference (rejecting a critical variation can signal project distress — reportable)', type: 'text', required: false, placeholder: '' }], cascadeTo: ['regulator'], tone: 'danger' });
    actions.push({ key: 'withdraw', label: 'Withdraw (project manager)', fields: [{ key: 'notes', label: 'Withdrawal note — raiser pulls the variation', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
    actions.push({ key: 'cancel', label: 'Cancel (project manager)', fields: [{ key: 'notes', label: 'Cancellation note', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
  }

  // approve (pending_approval)
  if (s === 'pending_approval') {
    actions.push({
      key: 'approve',
      label: 'Approve (sponsor)',
      fields: [
        { key: 'approved_by', label: 'Approved by (authority)', type: 'text', required: false, placeholder: AUTHORITY_LABEL[row.approval_authority_derived ?? ''] ?? (row.approval_authority ?? '') },
        { key: 'approval_basis', label: 'Approval basis — authority + decision rationale', type: 'textarea', required: false, placeholder: '' },
        { key: 'approval_ref', label: 'Approval reference', type: 'text', required: false, placeholder: '' },
      ],
      // approve crosses regulator for critical tier
      cascadeTo: row.variation_tier === 'critical' ? ['regulator'] : [],
    });
    actions.push({ key: 'raise-dispute', label: 'Raise dispute (project controls)', fields: [{ key: 'dispute_reason', label: 'Dispute reason — contractor contests the assessed quantum', type: 'textarea', required: true, placeholder: '' }, { key: 'dispute_basis', label: 'Dispute basis', type: 'textarea', required: false, placeholder: '' }, { key: 'dispute_ref', label: 'Dispute reference', type: 'text', required: false, placeholder: '' }], cascadeTo: [], tone: 'danger' });
    actions.push({ key: 'reject', label: 'Reject (sponsor)', fields: [{ key: 'rejection_reason', label: 'Rejection reason', type: 'textarea', required: true, placeholder: '' }, { key: 'rejection_basis', label: 'Rejection basis', type: 'textarea', required: false, placeholder: '' }, { key: 'regulator_ref', label: 'Regulator reference (rejecting a critical variation can signal project distress — reportable)', type: 'text', required: false, placeholder: '' }], cascadeTo: ['regulator'], tone: 'danger' });
    actions.push({ key: 'withdraw', label: 'Withdraw (project manager)', fields: [{ key: 'notes', label: 'Withdrawal note — raiser pulls the variation', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
    actions.push({ key: 'cancel', label: 'Cancel (project manager)', fields: [{ key: 'notes', label: 'Cancellation note', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
  }

  // incorporate (approved) — HIGH-tier re-baseline crosses regulator
  if (s === 'approved') {
    actions.push({
      key: 'incorporate',
      label: 'Incorporate / re-baseline (sponsor)',
      fields: [
        { key: 'incorporation_basis', label: 'Incorporation basis — baseline re-issued; a HIGH-tier re-baseline is reportable', type: 'textarea', required: true, placeholder: '' },
        { key: 'incorporation_ref', label: 'Incorporation reference', type: 'text', required: false, placeholder: '' },
        { key: 'regulator_ref', label: 'Regulator reference (a material bid-envelope move is reportable to DMRE / IPPO)', type: 'text', required: false, placeholder: '' },
      ],
      // incorporate crosses for HIGH tiers (major + critical)
      cascadeTo: (row.variation_tier === 'major' || row.variation_tier === 'critical') ? ['regulator'] : [],
    });
    actions.push({ key: 'cancel', label: 'Cancel (project manager)', fields: [{ key: 'notes', label: 'Cancellation note', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
  }

  // resubmit (deferred)
  if (s === 'deferred') {
    actions.push({
      key: 'resubmit',
      label: 'Resubmit (project manager)',
      fields: [
        { key: 'cost_impact_zar', label: 'Revised cost impact (ZAR)', type: 'number', required: false, placeholder: String(row.cost_impact_zar ?? '') },
        { key: 'schedule_impact_days', label: 'Revised schedule impact (days)', type: 'number', required: false, placeholder: String(row.schedule_impact_days ?? '') },
        { key: 'submission_basis', label: 'Resubmission basis — what changed since deferral', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({ key: 'reject', label: 'Reject (sponsor)', fields: [{ key: 'rejection_reason', label: 'Rejection reason', type: 'textarea', required: true, placeholder: '' }, { key: 'rejection_basis', label: 'Rejection basis', type: 'textarea', required: false, placeholder: '' }, { key: 'regulator_ref', label: 'Regulator reference (rejecting a critical variation can signal project distress — reportable)', type: 'text', required: false, placeholder: '' }], cascadeTo: ['regulator'], tone: 'danger' });
    actions.push({ key: 'cancel', label: 'Cancel (project manager)', fields: [{ key: 'notes', label: 'Cancellation note', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
  }

  // resolve-dispute (disputed)
  if (s === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute (project controls)',
      fields: [
        { key: 'cost_impact_zar', label: 'Re-assessed cost impact (ZAR), if revised', type: 'number', required: false, placeholder: String(row.cost_impact_zar ?? '') },
        { key: 'schedule_impact_days', label: 'Re-assessed schedule impact (days), if revised', type: 'number', required: false, placeholder: String(row.schedule_impact_days ?? '') },
        { key: 'dispute_basis', label: 'Resolution basis — dispute settled, re-assessing', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({ key: 'reject', label: 'Reject (sponsor)', fields: [{ key: 'rejection_reason', label: 'Rejection reason', type: 'textarea', required: true, placeholder: '' }, { key: 'rejection_basis', label: 'Rejection basis', type: 'textarea', required: false, placeholder: '' }, { key: 'regulator_ref', label: 'Regulator reference (rejecting a critical variation can signal project distress — reportable)', type: 'text', required: false, placeholder: '' }], cascadeTo: ['regulator'], tone: 'danger' });
    actions.push({ key: 'cancel', label: 'Cancel (project manager)', fields: [{ key: 'notes', label: 'Cancellation note', type: 'textarea', required: true, placeholder: '' }], cascadeTo: [], tone: 'danger' });
  }

  return actions;
}

// ── renderDetail ──────────────────────────────────────────────────────────
function renderDetail(row: CoRow): React.ReactNode {
  const authority = AUTHORITY_LABEL[row.approval_authority_derived ?? row.approval_authority ?? ''] ?? (row.approval_authority ?? '—');

  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      {/* Live earned-value battery */}
      <div className="mb-3 rounded border px-3 py-2" style={{ background: BG2, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>Live earned-value battery</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <EvMetric label="CPI" value={fmtNum(row.cpi)} bad={(row.cpi ?? 1) < 1} hint="Cost performance" />
          <EvMetric label="SPI" value={fmtNum(row.spi)} bad={(row.spi ?? 1) < 1} hint="Schedule performance" />
          <EvMetric label="CV" value={fmtZar(row.cost_variance_zar)} bad={(row.cost_variance_zar ?? 0) < 0} hint="Cost variance" />
          <EvMetric label="SV" value={fmtZar(row.schedule_variance_zar)} bad={(row.schedule_variance_zar ?? 0) < 0} hint="Schedule variance" />
          <EvMetric label="EAC" value={fmtZar(row.estimate_at_completion_zar)} hint="Estimate at completion" />
          <EvMetric label="VAC" value={fmtZar(row.variance_at_completion_zar)} bad={(row.variance_at_completion_zar ?? 0) < 0} hint="Variance at completion" />
          <EvMetric label="TCPI" value={fmtNum(row.tcpi)} bad={(row.tcpi ?? 1) > 1} hint="To-complete performance" />
          <EvMetric label="BAC" value={fmtZar(row.budget_at_completion_zar)} hint="Budget at completion" />
        </div>
      </div>

      {/* Contingency & re-baseline */}
      <div className="mb-3 rounded border px-3 py-2" style={{ background: BG2, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>Contingency &amp; re-baseline</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <EvMetric label="Contingency left" value={fmtZar(row.contingency_remaining_zar)} bad={(row.contingency_remaining_zar ?? 0) < 0} />
          <EvMetric label="Within contingency" value={row.within_contingency ? 'Yes' : 'No'} bad={row.within_contingency === false} />
          <EvMetric label="Revised baseline" value={fmtZar(row.revised_baseline_cost_zar)} />
          <EvMetric label="Cumulative overrun" value={row.cumulative_overrun_pct != null ? `${fmtNum(row.cumulative_overrun_pct, 1)}%` : '—'} bad={(row.cumulative_overrun_pct ?? 0) > 0} />
          <EvMetric label="Bid envelope" value={row.breaches_bid_envelope ? 'BREACHED' : 'Within'} bad={!!row.breaches_bid_envelope} hint="REIPPPP commitment" />
          <EvMetric label="Bid cost tol." value={row.bid_envelope_cost_pct != null ? `${row.bid_envelope_cost_pct}%` : '—'} />
          <EvMetric label="Bid COD tol." value={row.bid_envelope_schedule_days != null ? `${row.bid_envelope_schedule_days}d` : '—'} />
          <EvMetric label="Approval authority" value={authority} hint="Derived from magnitude" />
        </div>
      </div>

      {/* Key fields grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2">
        <DetailPair label="Change type" value={row.change_type ?? '—'} />
        <DetailPair label="Cost impact" value={fmtZar(row.cost_impact_zar)} />
        <DetailPair label="Schedule impact" value={row.schedule_impact_days != null ? `${row.schedule_impact_days}d` : '—'} />
        <DetailPair label="Baseline cost" value={fmtZar(row.baseline_cost_zar)} />
        <DetailPair label="Baseline duration" value={row.baseline_duration_days != null ? `${row.baseline_duration_days}d` : '—'} />
        <DetailPair label="Contingency" value={fmtZar(row.contingency_zar)} />
        <DetailPair label="Contingency drawn" value={fmtZar(row.contingency_drawn_zar)} />
        <DetailPair label="Cumulative approved" value={fmtZar(row.cumulative_approved_variation_zar)} />
        <DetailPair label="Cumulative days" value={`${row.cumulative_approved_days ?? 0}d`} />
        <DetailPair label="Project" value={row.project_name} />
        <DetailPair label="Participant" value={row.participant_name ?? '—'} />
        <DetailPair label="Contractor" value={row.contractor_name ?? '—'} />
        <DetailPair label="Approved by" value={row.approved_by ?? '—'} />
        <DetailPair label="Reason code" value={row.reason_code ?? '—'} />
        <DetailPair label="Rejection reason" value={row.rejection_reason ?? '—'} />
        <DetailPair label="Dispute reason" value={row.dispute_reason ?? '—'} />
        <DetailPair label="Regulator ref" value={row.regulator_ref ?? '—'} />
        <DetailPair label="Drafted" value={fmtDate(row.draft_at)} />
        <DetailPair label="Submitted" value={fmtDate(row.submitted_at)} />
        <DetailPair label="Assessed" value={fmtDate(row.impact_assessment_at)} />
        <DetailPair label="Approved" value={fmtDate(row.approved_at)} />
        <DetailPair label="Incorporated" value={fmtDate(row.incorporated_at)} />
        <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl" value={String(row.escalation_level)} />
        <DetailPair label="Reportable" value={row.is_reportable_flag ? 'Yes' : 'No'} />
      </div>

      {row.source_wave && (
        <div className="mb-1.5 text-[10px]" style={{ color: TX3 }}>
          Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
        </div>
      )}

      {row.description && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Description</div>
          <div style={{ color: TX2 }}>{row.description}</div>
        </div>
      )}
      {row.submission_basis && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Submission basis</div>
          <div style={{ color: TX2 }}>{row.submission_basis}</div>
        </div>
      )}
      {row.screening_basis && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Screening basis</div>
          <div style={{ color: TX2 }}>{row.screening_basis}</div>
        </div>
      )}
      {row.assessment_basis && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>Assessment basis</div>
          <div style={{ color: TX2 }}>{row.assessment_basis}</div>
        </div>
      )}
      {row.approval_basis && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOOD }}>Approval basis</div>
          <div style={{ color: TX2 }}>{row.approval_basis}</div>
        </div>
      )}
      {row.incorporation_basis && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOOD }}>Incorporation basis</div>
          <div style={{ color: TX2 }}>{row.incorporation_basis}</div>
        </div>
      )}
      {row.deferral_basis && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>Deferral basis</div>
          <div style={{ color: TX2 }}>{row.deferral_basis}</div>
        </div>
      )}
      {row.dispute_basis && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>Dispute basis</div>
          <div style={{ color: TX2 }}>{row.dispute_basis}</div>
        </div>
      )}
      {row.rejection_basis && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Rejection basis</div>
          <div style={{ color: TX2 }}>{row.rejection_basis}</div>
        </div>
      )}
      {row.notes && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Notes</div>
          <div style={{ color: TX2 }}>{row.notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function ProjectChangeOrderChainTab() {
  const [rows, setRows] = useState<CoRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CoRow[] } & KpiSummary }>('/ipp/change-order/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, pending_approval: d.pending_approval,
          in_assessment: d.in_assessment, disputed_count: d.disputed_count,
          deferred_count: d.deferred_count, incorporated_count: d.incorporated_count,
          rejected_count: d.rejected_count, breached: d.breached,
          reportable_total: d.reportable_total, bid_envelope_breaches: d.bid_envelope_breaches,
          high_tier_count: d.high_tier_count, total_cost_impact_zar: d.total_cost_impact_zar,
          total_schedule_impact_days: d.total_schedule_impact_days,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load change orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      // Convert numeric string values to numbers where appropriate
      const body: Record<string, string | number> = {};
      const numericKeys = ['cost_impact_zar', 'schedule_impact_days', 'earned_value_zar', 'planned_value_zar', 'actual_cost_zar', 'budget_at_completion_zar'];
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v === undefined) continue;
        if (numericKeys.includes(k) && !Number.isNaN(Number(v))) {
          body[k] = Number(v);
        } else {
          body[k] = v;
        }
      }
      // Inject reason_code for actions that require it
      if (key === 'defer') body.reason_code = 'deferred';
      if (key === 'withdraw') body.reason_code = 'withdrawn';
      if (key === 'cancel') body.reason_code = 'cancelled';
      if (key === 'reject') body.reason_code = 'rejected';

      await api.post(`/ipp/change-order/chain/${rowId}/${key}`, body);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/change-order/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: CoRow; events: ChainEvent[] } }>(`/ipp/change-order/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'open')         return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')     return !!r.sla_breached;
      if (filter === 'reportable')   return !!r.is_reportable_flag;
      if (filter === 'bid_envelope') return !!r.breaches_bid_envelope;
      if (['minor', 'moderate', 'major', 'critical'].includes(filter)) {
        return r.variation_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis ?? {
    total: 0, open_count: 0, pending_approval: 0, in_assessment: 0,
    disputed_count: 0, deferred_count: 0, incorporated_count: 0, rejected_count: 0,
    breached: 0, reportable_total: 0, bid_envelope_breaches: 0, high_tier_count: 0,
    total_cost_impact_zar: 0, total_schedule_impact_days: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Change orders &amp; variation control · earned-value management</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage integrated change-control chain · draft → submitted → screening → impact assessment →
          pending approval → approved → incorporated (baseline re-issued), with a deferral park and dispute loop.
          Live EVM battery (CV / SV / CPI / SPI / EAC / VAC / TCPI). Tier derived from cost impact. INVERTED SLA.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total variations" value={k.total} />
        <KpiTile label="Open" value={k.open_count} tone={k.open_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Pending approval" value={k.pending_approval} tone={k.pending_approval > 0 ? 'warn' : undefined} />
        <KpiTile label="In assessment" value={k.in_assessment} />
        <KpiTile label="Disputed" value={k.disputed_count} tone={k.disputed_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Deferred" value={k.deferred_count} tone={k.deferred_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Incorporated" value={k.incorporated_count} tone={k.incorporated_count > 0 ? 'ok' : undefined} />
        <KpiTile label="Bid-envelope breach" value={k.bid_envelope_breaches} tone={k.bid_envelope_breaches > 0 ? 'bad' : undefined} />
        <KpiTile label="High-tier" value={k.high_tier_count} tone={k.high_tier_count > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached" value={k.breached} tone={k.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable" value={k.reportable_total} tone={k.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Net cost impact" value={fmtZar(k.total_cost_impact_zar)} />
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
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.co_number} · ${row.project_name} · ${row.title}`}
              meta={[
                row.variation_tier,
                row.change_type ?? '',
                row.contractor_name ?? '',
              ].filter(Boolean).join(' · ')}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No change orders match.</div>
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

function EvMetric({ label, value, bad, hint }: { label: string; value: string; bad?: boolean; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div className="text-[12px] font-semibold tabular-nums" style={{ color: bad ? BAD : TX1, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

export default ProjectChangeOrderChainTab;
