// Wave 117 — IPP Change Orders & Variations chain (P6).
//
// 12th and TARGET-CLOSING IPP-pure chain — CLOSES the Phase-A IPP-pure
// 12-chain target (W1/W10/W19/W20/W23/W27/W112/W113/W114/W115/W116/W117).
// SIXTH and final Phase-A world-class wave. Sibling of W112 schedule,
// W113 EVM, W114 doc control, W115 submittals, W116 RFIs. W117 owns the
// CHANGE ORDER LIFECYCLE — the formal route by which scope / cost /
// schedule changes are proposed, priced, negotiated, approved, scheduled,
// executed and closed out under FIDIC sec.13 / NEC4 sec.60-65 /
// AIA G701/G714 / CSI 01 26 00 / REIPPPP variations protocol / DMRE EPC
// change-control.
//
// Beats Procore Change Management / Aconex Cost Mgmt CRs / Oracle Aconex
// Variations / Autodesk Construction Cloud Cost / e-Builder Change Mgmt /
// Asite CRs / Coreworx Change / SAP S/4HANA EPC variations / Deltek
// Cobra change mgmt / InEight Control change mgmt. Each surfaces CRs as
// a list with status. W117 turns it into a 12-state P6 CR chain with
// INVERTED SLA polarity (HOURS), FLOOR-AT-MAJOR on 5 contextual flags
// (scope_baseline_change / regulatory_re_consent_required /
// schedule_impact_critical_path / lender_consent_required /
// safety_design_change), 4-step authority ladder
// (PM → engineer → owner_rep → IPP_CEO) and a 22-field LIVE CR battery.
//
// 12-state forward path + 4 branch states:
//   change_proposed → impact_assessed → cost_quoted → owner_review
//     → negotiated → approved → issued_for_execution → scheduled
//     → executing → executed → closed_out → archived (HARD terminal)
//   any non-terminal → reject → rejected (TERMINAL — out of scope)
//   pre-approval → void → void (TERMINAL — withdrawn before approval)
//   pre-execution → hold_resume → on_hold (SOFT)
//   review-touch → dispute → disputed (SOFT)
//
// INVERTED SLA polarity (HOURS) anchored on owner_review:
//   minor 168h / material 336h / major 720h / transformational 1080h.
//   (Larger CR-value gets MORE time for diligence — the polarity that
//   distinguishes W117 from the URGENT W116 RFI sister.)
//
// SIGNATURE Phase-A IPP regulator crossings:
//   * approve crosses EVERY tier when scope_baseline_change ||
//     regulatory_re_consent_required (W117 SIGNATURE SCOPE-BASELINE-
//     CHANGE-APPROVE hard line)
//   * reject crosses EVERY tier when cumulative_change_value_pct >= 15
//     (REIPPPP cumulative CR cap signal)
//   * dispute crosses major + transformational only
//   * close_out, archive, void, hold_resume never cross regulator
//   * sla_breached crosses major + transformational only

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
  | 'change_proposed' | 'impact_assessed' | 'cost_quoted' | 'owner_review'
  | 'negotiated' | 'approved' | 'issued_for_execution' | 'scheduled'
  | 'executing' | 'executed' | 'closed_out' | 'archived'
  | 'rejected' | 'void' | 'on_hold' | 'disputed';

type IcoTier = 'minor' | 'material' | 'major' | 'transformational';
type IcoUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'PM' | 'engineer' | 'owner_rep' | 'IPP_CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type CapBand = 'clear' | 'watch' | 'warning' | 'breach';

interface IcoRow {
  [key: string]: unknown;
  id: string;
  change_order_number: string;
  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  contract_ref: string | null;
  contract_value_zar: number;
  rfi_ref: string | null;
  submittal_ref: string | null;
  document_control_ref: string | null;
  schedule_ref: string | null;
  evm_ref: string | null;
  procurement_ref: string | null;
  cod_ref: string | null;
  change_type: string | null;
  change_class: string | null;
  initiator_role: string | null;
  discipline: string | null;
  package_code: string | null;
  drawing_number: string | null;
  spec_section: string | null;
  csi_section: string | null;
  basis_clause: string | null;
  scope_summary_short: string | null;
  scope_summary_long: string | null;
  proposed_resolution: string | null;
  pm_name: string | null;
  engineer_name: string | null;
  owner_rep_name: string | null;
  ceo_name: string | null;
  current_ball_in_court_party: string | null;
  last_actor_party: string | null;
  scope_baseline_change: number;
  regulatory_re_consent_required: number;
  schedule_impact_critical_path: number;
  lender_consent_required: number;
  safety_design_change: number;
  change_value_zar: number;
  schedule_impact_days: number;
  eac_delta_zar: number;
  cumulative_change_value_zar: number;
  cumulative_change_value_pct: number;
  cumulative_cap_band: CapBand | null;
  current_tier: IcoTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  change_order_health_band: HealthBand | null;
  change_order_completeness_index: number;
  change_order_age_days: number;
  days_to_critical_path_recovery: number | null;
  regulator_filing_window_hours: number;
  title: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  void_reason: string | null;
  hold_reason: string | null;
  dispute_reason: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  change_proposed_at: string | null;
  impact_assessed_at: string | null;
  cost_quoted_at: string | null;
  owner_review_at: string | null;
  negotiated_at: string | null;
  approved_at: string | null;
  issued_for_execution_at: string | null;
  scheduled_at: string | null;
  executing_at: string | null;
  executed_at: string | null;
  closed_out_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  void_at: string | null;
  on_hold_at: string | null;
  disputed_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  hash_chain_position: number;
  merkle_root_segment: string | null;
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
  urgency_band_live?: IcoUrgency;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  floor_flag_count_live?: number;
  change_order_completeness_index_live?: number;
  change_order_health_band_live?: HealthBand;
  change_order_age_days_live?: number;
  days_to_critical_path_recovery_live?: number | null;
  cumulative_cap_band_live?: CapBand;
  eac_delta_sign_live?: 'positive' | 'negative' | 'flat';
  bridges_to_rfi_chain_live?: boolean;
  bridges_to_submittal_chain_live?: boolean;
  bridges_to_document_control_chain_live?: boolean;
  bridges_to_schedule_chain_live?: boolean;
  bridges_to_evm_chain_live?: boolean;
  bridges_to_procurement_chain_live?: boolean;
  bridges_to_cod_chain_live?: boolean;
}

interface IcoEvent {
  id: string;
  change_order_id: string;
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
  proposed_count: number;
  impact_assessed_count: number;
  cost_quoted_count: number;
  owner_review_count: number;
  negotiated_count: number;
  approved_count: number;
  issued_count: number;
  scheduled_count: number;
  executing_count: number;
  executed_count: number;
  closed_out_count: number;
  archived_count: number;
  rejected_count: number;
  void_count: number;
  on_hold_count: number;
  disputed_count: number;
  transformational_count: number;
  major_count: number;
  breached: number;
  reportable_total: number;
  scope_baseline_count: number;
  regulatory_consent_count: number;
  critical_path_count: number;
  lender_consent_count: number;
  safety_design_count: number;
  rfi_bridged_count: number;
  submittal_bridged_count: number;
  document_control_bridged_count: number;
  schedule_bridged_count: number;
  evm_bridged_count: number;
  procurement_bridged_count: number;
  cod_bridged_count: number;
  completeness_avg: number;
  change_value_zar_total: number;
  cumulative_value_zar_total: number;
  schedule_impact_days_total: number;
  eac_delta_zar_total: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0, proposed_count: 0, impact_assessed_count: 0,
  cost_quoted_count: 0, owner_review_count: 0, negotiated_count: 0,
  approved_count: 0, issued_count: 0, scheduled_count: 0, executing_count: 0,
  executed_count: 0, closed_out_count: 0, archived_count: 0,
  rejected_count: 0, void_count: 0, on_hold_count: 0, disputed_count: 0,
  transformational_count: 0, major_count: 0, breached: 0, reportable_total: 0,
  scope_baseline_count: 0, regulatory_consent_count: 0, critical_path_count: 0,
  lender_consent_count: 0, safety_design_count: 0, rfi_bridged_count: 0,
  submittal_bridged_count: 0, document_control_bridged_count: 0,
  schedule_bridged_count: 0, evm_bridged_count: 0,
  procurement_bridged_count: 0, cod_bridged_count: 0,
  completeness_avg: 0, change_value_zar_total: 0,
  cumulative_value_zar_total: 0, schedule_impact_days_total: 0,
  eac_delta_zar_total: 0,
};

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'change_proposed', 'impact_assessed', 'cost_quoted', 'owner_review',
  'negotiated', 'approved', 'issued_for_execution', 'scheduled',
  'executing', 'executed', 'closed_out', 'archived',
];
const BRANCH_STATES: readonly string[] = [
  'rejected', 'void', 'on_hold', 'disputed',
];

// ── filters ───────────────────────────────────────────────────────────────
// Row 1: action / lifecycle pills (priority filters)
const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'owner_review',       label: 'Owner review' },
  { key: 'approved',           label: 'Approved' },
  { key: 'executing',          label: 'Executing' },
  { key: 'scope_baseline',     label: 'Scope-baseline' },
  { key: 'regulatory_consent', label: 'Regulatory consent' },
  { key: 'critical_path',      label: 'Critical path' },
  { key: 'lender_consent',     label: 'Lender consent' },
  { key: 'safety_design',      label: 'Safety design' },
  { key: 'cap_warning',        label: 'Cap warning' },
  { key: 'cap_breach',         label: 'Cap BREACH' },
  { key: 'health_red',         label: 'Health red' },
  { key: 'health_critical',    label: 'Health critical' },
];

// Row 2: lifecycle stages + tiers
const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'change_proposed',      label: 'Proposed' },
  { key: 'impact_assessed',      label: 'Impact assessed' },
  { key: 'cost_quoted',          label: 'Cost quoted' },
  { key: 'owner_review',         label: 'Owner review' },
  { key: 'negotiated',           label: 'Negotiated' },
  { key: 'approved',             label: 'Approved' },
  { key: 'issued_for_execution', label: 'Issued' },
  { key: 'scheduled',            label: 'Scheduled' },
  { key: 'executing',            label: 'Executing' },
  { key: 'executed',             label: 'Executed' },
  { key: 'closed_out',           label: 'Closed' },
  { key: 'archived',             label: 'Archived' },
  { key: 'rejected',             label: 'Rejected' },
  { key: 'void',                 label: 'Void' },
  { key: 'on_hold',              label: 'On hold' },
  { key: 'disputed',             label: 'Disputed' },
  { key: 'minor',                label: 'Tier: Minor' },
  { key: 'material',             label: 'Tier: Material' },
  { key: 'major',                label: 'Tier: Major' },
  { key: 'transformational',     label: 'Tier: Transformational' },
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

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return `${n.toFixed(0)} MW`;
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return '-';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}R${(abs / 1_000_000_000).toFixed(2)}bn`;
  if (abs >= 1_000_000)     return `${sign}R${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000)         return `${sign}R${(abs / 1_000).toFixed(1)}k`;
  return `${sign}R${abs.toFixed(0)}`;
}

// ── action helpers ────────────────────────────────────────────────────────
const PRE_APPROVAL: ChainStatus[] = [
  'change_proposed', 'impact_assessed', 'cost_quoted', 'owner_review', 'negotiated',
];
const REVIEW_TOUCH: ChainStatus[] = [
  'impact_assessed', 'cost_quoted', 'owner_review', 'negotiated', 'approved',
];
const PRE_EXECUTION: ChainStatus[] = [
  'change_proposed', 'impact_assessed', 'cost_quoted', 'owner_review',
  'negotiated', 'approved', 'issued_for_execution', 'scheduled',
];
const REJECTABLE: ChainStatus[] = [
  'change_proposed', 'impact_assessed', 'cost_quoted', 'owner_review', 'negotiated',
];

function getActions(row: IcoRow): ChainAction[] {
  const actions: ChainAction[] = [];

  // Primary forward action per state
  if (row.chain_status === 'change_proposed') {
    actions.push({
      key: 'assess-impact',
      label: 'Assess impact (Engineer)',
      fields: [
        { key: 'engineer_name', label: 'Engineer name', type: 'text', required: false, placeholder: row.engineer_name ?? '' },
        { key: 'schedule_impact_days', label: 'Schedule impact (days)', type: 'number', required: false, placeholder: String(row.schedule_impact_days ?? 0) },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'impact_assessed') {
    actions.push({
      key: 'quote-cost',
      label: 'Quote cost (Engineer)',
      fields: [
        { key: 'change_value_zar', label: 'Change value (ZAR)', type: 'number', required: true, placeholder: String(row.change_value_zar ?? 0) },
        { key: 'eac_delta_zar', label: 'EAC delta (ZAR, can be negative)', type: 'number', required: false, placeholder: String(row.eac_delta_zar ?? 0) },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'cost_quoted') {
    actions.push({
      key: 'submit-for-review',
      label: 'Submit for owner review (PM — anchors INVERTED SLA)',
      fields: [
        { key: 'owner_rep_name', label: 'Owner Rep name (anchors INVERTED SLA on owner_review)', type: 'text', required: false, placeholder: row.owner_rep_name ?? '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'owner_review' || row.chain_status === 'disputed') {
    actions.push({
      key: 'negotiate',
      label: 'Negotiate (Owner Rep)',
      fields: [
        { key: 'notes', label: 'Negotiation note (Owner Rep)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'negotiated') {
    actions.push({
      key: 'approve',
      label: 'Approve (IPP CEO — SIGNATURE SCOPE-BASELINE-CHANGE-APPROVE: crosses regulator EVERY tier when scope_baseline_change OR regulatory_re_consent_required)',
      fields: [
        { key: 'ceo_name', label: 'IPP CEO name. NOTE: SIGNATURE SCOPE-BASELINE-CHANGE-APPROVE — crosses regulator EVERY tier when scope_baseline_change OR regulatory_re_consent_required.', type: 'text', required: true, placeholder: row.ceo_name ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  } else if (row.chain_status === 'approved') {
    actions.push({
      key: 'issue',
      label: 'Issue for execution (IPP CEO)',
      fields: [
        { key: 'notes', label: 'Issue-for-execution note (IPP CEO)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'issued_for_execution') {
    actions.push({
      key: 'schedule',
      label: 'Schedule (IPP CEO)',
      fields: [
        { key: 'notes', label: 'Schedule note (IPP CEO)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'scheduled') {
    actions.push({
      key: 'commence-execution',
      label: 'Commence execution (IPP CEO)',
      fields: [
        { key: 'notes', label: 'Commence execution note (IPP CEO)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'executing') {
    actions.push({
      key: 'complete-execution',
      label: 'Complete execution (IPP CEO)',
      fields: [
        { key: 'notes', label: 'Complete execution note (IPP CEO)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'executed') {
    actions.push({
      key: 'close-out',
      label: 'Close out (IPP CEO)',
      fields: [
        { key: 'notes', label: 'Close-out note (IPP CEO)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'closed_out') {
    actions.push({
      key: 'archive',
      label: 'Archive (IPP CEO — HARD terminal)',
      fields: [
        { key: 'notes', label: 'Archive note (IPP CEO — HARD terminal)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'on_hold') {
    actions.push({
      key: 'hold-resume',
      label: 'Hold / resume (PM — soft pause)',
      fields: [
        { key: 'hold_reason', label: 'Hold / resume reason (PM — soft pause; toggles on_hold)', type: 'textarea', required: true, placeholder: row.hold_reason ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // Overflow: hold/resume for pre-execution non-on_hold states
  if (PRE_EXECUTION.includes(row.chain_status)) {
    actions.push({
      key: 'hold-resume',
      label: 'Hold / resume (PM — soft pause)',
      fields: [
        { key: 'hold_reason', label: 'Hold / resume reason (PM — soft pause; toggles on_hold)', type: 'textarea', required: true, placeholder: row.hold_reason ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // Overflow: dispute for review-touch states
  if (REVIEW_TOUCH.includes(row.chain_status)) {
    actions.push({
      key: 'dispute',
      label: 'Raise dispute (Owner Rep — crosses regulator major + transformational only)',
      fields: [
        { key: 'dispute_reason', label: 'Dispute reason (Owner Rep). NOTE: crosses regulator major + transformational only.', type: 'textarea', required: true, placeholder: row.dispute_reason ?? '' },
      ],
      cascadeTo: row.current_tier === 'major' || row.current_tier === 'transformational' ? ['regulator'] : [],
    });
  }

  // Overflow: reject for rejectable states
  if (REJECTABLE.includes(row.chain_status)) {
    actions.push({
      key: 'reject',
      label: 'Reject (Owner Rep — crosses regulator EVERY tier when cumulative CR pct >= 15%)',
      fields: [
        { key: 'reject_reason', label: 'Reject reason (required). NOTE: crosses regulator EVERY tier when cumulative_change_value_pct >= 15% (REIPPPP cumulative CR cap).', type: 'textarea', required: true, placeholder: row.reject_reason ?? '' },
      ],
      cascadeTo: row.cumulative_change_value_pct >= 15 ? ['regulator'] : [],
    });
  }

  // Overflow: void for pre-approval states
  if (PRE_APPROVAL.includes(row.chain_status)) {
    actions.push({
      key: 'void',
      label: 'Void (PM — pre-approval pull)',
      fields: [
        { key: 'void_reason', label: 'Void reason (PM — pre-approval pull only)', type: 'textarea', required: true, placeholder: row.void_reason ?? '' },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

function renderDetail(row: IcoRow): React.ReactNode {
  const completeness = row.change_order_completeness_index_live ?? row.change_order_completeness_index;
  const ageDays = row.change_order_age_days_live ?? row.change_order_age_days ?? 0;
  const cumPct = row.cumulative_change_value_pct ?? 0;

  return (
    <div style={{ fontFamily: 'inherit', fontSize: 11, color: TX2 }}>
      {/* LIVE 22-field battery */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 4 }}>
          LIVE battery (22 fields, re-computed every fetch)
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Tier (re-derived)"        value={row.current_tier} />
          <DetailPair label="Floor flags"              value={String(row.floor_flag_count_live ?? 0)} />
          <DetailPair label="Authority required"       value={row.authority_required_live ?? '-'} />
          <DetailPair label="Completeness"             value={`${completeness} / 130`} />
          <DetailPair label="Health band"              value={row.change_order_health_band_live ?? '-'} />
          <DetailPair label="Urgency"                  value={row.urgency_band_live ?? '-'} />
          <DetailPair label="Cap band"                 value={row.cumulative_cap_band_live ?? row.cumulative_cap_band ?? 'clear'} />
          <DetailPair label="SLA hrs remaining"        value={fmtHoursSla(row.sla_hours_remaining_live)} />
          <DetailPair label="SLA window"               value={fmtHoursSla(row.sla_window_hours)} />
          <DetailPair label="Reg filing window"        value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
          <DetailPair label="CR age (live)"            value={`${ageDays}d`} />
          <DetailPair label="Days to CP recovery"      value={row.days_to_critical_path_recovery_live != null ? `${row.days_to_critical_path_recovery_live}d` : '-'} />
          <DetailPair label="Change value"             value={fmtZar(row.change_value_zar)} />
          <DetailPair label="EAC delta"                value={fmtZar(row.eac_delta_zar)} />
          <DetailPair label="Cumulative CR value"      value={fmtZar(row.cumulative_change_value_zar)} />
          <DetailPair label="Cumulative CR %"          value={`${cumPct.toFixed(2)}%`} />
          <DetailPair label="Schedule impact (d)"      value={`${row.schedule_impact_days}d`} />
          <DetailPair label="Contract value"           value={fmtZar(row.contract_value_zar)} />
          <DetailPair label="Hash chain position"      value={String(row.hash_chain_position)} />
          <DetailPair label="Merkle segment (audit)"    value={(row.merkle_root_segment ?? '-').slice(0, 12) + '...'} />
          <DetailPair label="Last actor"               value={row.last_actor_party ?? '-'} />
          <DetailPair label="Ball-in-court"            value={row.current_ball_in_court_party ?? '-'} />
        </div>
      </div>

      {/* CR identity */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 4 }}>
          CR identity (FIDIC §13 + NEC4 §60-65 + AIA G701/G714 + CSI 01 26 00)
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Change type"     value={row.change_type ?? '-'} />
          <DetailPair label="Change class"    value={row.change_class ?? '-'} />
          <DetailPair label="Initiator role"  value={row.initiator_role ?? '-'} />
          <DetailPair label="Discipline"      value={row.discipline ?? '-'} />
          <DetailPair label="Package code"    value={row.package_code ?? '-'} />
          <DetailPair label="CSI section"     value={row.csi_section ?? '-'} />
          <DetailPair label="Spec section"    value={row.spec_section ?? '-'} />
          <DetailPair label="Drawing number"  value={row.drawing_number ?? '-'} />
          <DetailPair label="Basis clause"    value={row.basis_clause ?? '-'} />
          <DetailPair label="PM"              value={row.pm_name ?? '-'} />
          <DetailPair label="Engineer"        value={row.engineer_name ?? '-'} />
          <DetailPair label="Owner Rep"       value={row.owner_rep_name ?? '-'} />
          <DetailPair label="IPP CEO"         value={row.ceo_name ?? '-'} />
          <DetailPair label="Contract ref"    value={row.contract_ref ?? '-'} />
        </div>
      </div>

      {/* Bridges */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 4 }}>
          7-bridge architecture (RFI / submittal / doc-control / schedule / EVM / procurement / COD)
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="RFI ref"         value={row.rfi_ref ?? '-'} />
          <DetailPair label="Submittal ref"   value={row.submittal_ref ?? '-'} />
          <DetailPair label="Doc-control ref" value={row.document_control_ref ?? '-'} />
          <DetailPair label="Schedule ref"    value={row.schedule_ref ?? '-'} />
          <DetailPair label="EVM ref"         value={row.evm_ref ?? '-'} />
          <DetailPair label="Procurement ref"  value={row.procurement_ref ?? '-'} />
          <DetailPair label="COD ref"          value={row.cod_ref ?? '-'} />
          <DetailPair label="Regulator inbox ref"  value={row.regulator_inbox_ref ?? '-'} />
          <DetailPair label="Regulator ref"        value={row.regulator_ref ?? '-'} />
          <DetailPair label="Regulator crossed at" value={fmtDate(row.regulator_crossed_at)} />
        </div>
      </div>

      {/* Floor flags */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 4 }}>
          Floor flags (5) — FLOOR-AT-MAJOR (1+) / FLOOR-AT-TRANSFORMATIONAL (2+)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {[
            { label: 'Scope baseline change',   on: !!row.scope_baseline_change },
            { label: 'Regulatory re-consent',   on: !!row.regulatory_re_consent_required },
            { label: 'Schedule impact CP',      on: !!row.schedule_impact_critical_path },
            { label: 'Lender consent required', on: !!row.lender_consent_required },
            { label: 'Safety design change',    on: !!row.safety_design_change },
          ].map(f => (
            <span key={f.label} style={{
              display: 'inline-block',
              borderRadius: 4,
              padding: '1px 6px',
              fontWeight: 600,
              background: f.on ? 'oklch(0.93 0.06 20)' : BG2,
              color: f.on ? BAD : TX3,
            }}>
              {f.label}{f.on ? ' ✓' : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Scope / resolution */}
      {(row.scope_summary_short || row.scope_summary_long || row.proposed_resolution) && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 4 }}>
            Scope / resolution
          </div>
          <div className="rounded border px-2 py-1.5 space-y-1" style={{ background: BG1, borderColor: BORDER }}>
            {row.scope_summary_short && (
              <div style={{ color: TX2 }}><span style={{ fontWeight: 700, color: TX3 }}>Short: </span>{row.scope_summary_short}</div>
            )}
            {row.scope_summary_long && (
              <div style={{ color: TX2 }}><span style={{ fontWeight: 700, color: TX3 }}>Long: </span>{row.scope_summary_long}</div>
            )}
            {row.proposed_resolution && (
              <div style={{ color: TX2 }}><span style={{ fontWeight: 700, color: TX3 }}>Proposed resolution: </span>{row.proposed_resolution}</div>
            )}
          </div>
        </div>
      )}

      {/* Reasons / narrative */}
      {(row.reject_reason || row.void_reason || row.hold_reason || row.dispute_reason || row.reason_code) && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 4 }}>
            Reasons / narrative
          </div>
          <div className="rounded border px-2 py-1.5 space-y-1" style={{ background: BG1, borderColor: BORDER }}>
            {row.reason_code && (
              <div style={{ color: TX2 }}><span style={{ fontWeight: 700, color: TX3 }}>Reason code: </span>{row.reason_code}</div>
            )}
            {row.reject_reason && (
              <div style={{ color: BAD }}><span style={{ fontWeight: 700 }}>Reject reason: </span>{row.reject_reason}</div>
            )}
            {row.void_reason && (
              <div style={{ color: TX2 }}><span style={{ fontWeight: 700, color: TX3 }}>Void reason: </span>{row.void_reason}</div>
            )}
            {row.hold_reason && (
              <div style={{ color: WARN }}><span style={{ fontWeight: 700 }}>Hold reason: </span>{row.hold_reason}</div>
            )}
            {row.dispute_reason && (
              <div style={{ color: BAD }}><span style={{ fontWeight: 700 }}>Dispute reason: </span>{row.dispute_reason}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function IppChangeOrderChainTab() {
  const [rows, setRows] = useState<IcoRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IcoRow[] } & KpiSummary }>('/ipp/change-orders/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          impact_assessed_count: data.impact_assessed_count || 0,
          cost_quoted_count: data.cost_quoted_count || 0,
          owner_review_count: data.owner_review_count || 0,
          negotiated_count: data.negotiated_count || 0,
          approved_count: data.approved_count || 0,
          issued_count: data.issued_count || 0,
          scheduled_count: data.scheduled_count || 0,
          executing_count: data.executing_count || 0,
          executed_count: data.executed_count || 0,
          closed_out_count: data.closed_out_count || 0,
          archived_count: data.archived_count || 0,
          rejected_count: data.rejected_count || 0,
          void_count: data.void_count || 0,
          on_hold_count: data.on_hold_count || 0,
          disputed_count: data.disputed_count || 0,
          transformational_count: data.transformational_count || 0,
          major_count: data.major_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          scope_baseline_count: data.scope_baseline_count || 0,
          regulatory_consent_count: data.regulatory_consent_count || 0,
          critical_path_count: data.critical_path_count || 0,
          lender_consent_count: data.lender_consent_count || 0,
          safety_design_count: data.safety_design_count || 0,
          rfi_bridged_count: data.rfi_bridged_count || 0,
          submittal_bridged_count: data.submittal_bridged_count || 0,
          document_control_bridged_count: data.document_control_bridged_count || 0,
          schedule_bridged_count: data.schedule_bridged_count || 0,
          evm_bridged_count: data.evm_bridged_count || 0,
          procurement_bridged_count: data.procurement_bridged_count || 0,
          cod_bridged_count: data.cod_bridged_count || 0,
          completeness_avg: data.completeness_avg || 0,
          change_value_zar_total: data.change_value_zar_total || 0,
          cumulative_value_zar_total: data.cumulative_value_zar_total || 0,
          schedule_impact_days_total: data.schedule_impact_days_total || 0,
          eac_delta_zar_total: data.eac_delta_zar_total || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load IPP Change Order chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ipp/change-orders/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/change-orders/chain/${rowId}`);
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
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/change-orders/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')                return true;
      if (filter === 'active')             return !r.is_terminal;
      if (filter === 'reportable')         return r.is_reportable_flag;
      if (filter === 'breached')           return r.sla_breached_live;
      if (filter === 'scope_baseline')     return !!r.scope_baseline_change;
      if (filter === 'regulatory_consent') return !!r.regulatory_re_consent_required;
      if (filter === 'critical_path')      return !!r.schedule_impact_critical_path;
      if (filter === 'lender_consent')     return !!r.lender_consent_required;
      if (filter === 'safety_design')      return !!r.safety_design_change;
      if (filter === 'cap_warning')        return r.cumulative_cap_band_live === 'warning';
      if (filter === 'cap_breach')         return r.cumulative_cap_band_live === 'breach';
      if (filter === 'health_red')         return r.change_order_health_band_live === 'red';
      if (filter === 'health_critical')    return r.change_order_health_band_live === 'critical';
      if (['minor', 'material', 'major', 'transformational'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          IPP Change Orders &amp; Variations &mdash; FIDIC §13 + NEC4 §60-65 + AIA G701/G714 + CSI 01 26 00 + REIPPPP variations + DMRE EPC change-control
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state P6 CR chain: proposed → impact assessed → cost quoted → owner review → negotiated → approved →
          issued → scheduled → executing → executed → closed out → archived (HARD terminal),
          with rejected / void terminals + on_hold / disputed soft branches.
          INVERTED SLA (HOURS) on owner_review: minor 168h, material 336h, major 720h, transformational 1080h.
          FLOOR-AT-MAJOR on any of 5 contextual flags; 2+ flags lifts to transformational.
          SIGNATURE: approve crosses regulator EVERY tier when scope_baseline_change OR regulatory_re_consent_required.
        </p>
      </header>

      {/* 8-card KPI strip */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-2">
        <KpiTile label="Active"           value={kpis.active_count}           tone={kpis.active_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Owner review"     value={kpis.owner_review_count}     tone={kpis.owner_review_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Executing"        value={kpis.executing_count}        tone={kpis.executing_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Approved"         value={kpis.approved_count}         tone={kpis.approved_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Transformational" value={kpis.transformational_count} tone={kpis.transformational_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"     value={kpis.breached}               tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable"       value={kpis.reportable_total}       tone={kpis.reportable_total > 0 ? 'bad' : undefined} />
        <KpiTile label="Total"            value={kpis.total} />
      </div>

      {/* Sub-KPI strip */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: TX2 }}>
        <span>Scope-baseline: <span style={{ fontWeight: 700, color: BAD }}>{kpis.scope_baseline_count}</span></span>
        <span>Reg consent: <span style={{ fontWeight: 700, color: BAD }}>{kpis.regulatory_consent_count}</span></span>
        <span>Critical-path: <span style={{ fontWeight: 700, color: BAD }}>{kpis.critical_path_count}</span></span>
        <span>Lender consent: <span style={{ fontWeight: 700, color: WARN }}>{kpis.lender_consent_count}</span></span>
        <span>Safety design: <span style={{ fontWeight: 700, color: BAD }}>{kpis.safety_design_count}</span></span>
        <span>Major: <span style={{ fontWeight: 700, color: WARN }}>{kpis.major_count}</span></span>
        <span>Proposed: <span style={{ fontWeight: 700, color: TX1 }}>{kpis.proposed_count}</span></span>
        <span>Impact assessed: <span style={{ fontWeight: 700, color: TX1 }}>{kpis.impact_assessed_count}</span></span>
        <span>Cost quoted: <span style={{ fontWeight: 700, color: TX1 }}>{kpis.cost_quoted_count}</span></span>
        <span>Negotiated: <span style={{ fontWeight: 700, color: WARN }}>{kpis.negotiated_count}</span></span>
        <span>Issued: <span style={{ fontWeight: 700, color: GOOD }}>{kpis.issued_count}</span></span>
        <span>Scheduled: <span style={{ fontWeight: 700, color: GOOD }}>{kpis.scheduled_count}</span></span>
        <span>Executed: <span style={{ fontWeight: 700, color: GOOD }}>{kpis.executed_count}</span></span>
        <span>Closed: <span style={{ fontWeight: 700, color: GOOD }}>{kpis.closed_out_count}</span></span>
        <span>Archived: <span style={{ fontWeight: 700, color: GOOD }}>{kpis.archived_count}</span></span>
        <span>Rejected: <span style={{ fontWeight: 700, color: BAD }}>{kpis.rejected_count}</span></span>
        <span>Void: <span style={{ fontWeight: 700, color: TX3 }}>{kpis.void_count}</span></span>
        <span>On hold: <span style={{ fontWeight: 700, color: TX3 }}>{kpis.on_hold_count}</span></span>
        <span>Disputed: <span style={{ fontWeight: 700, color: BAD }}>{kpis.disputed_count}</span></span>
        <span>Change value: <span style={{ fontWeight: 700, color: TX1 }}>{fmtZar(kpis.change_value_zar_total)}</span></span>
        <span>Cumulative: <span style={{ fontWeight: 700, color: BAD }}>{fmtZar(kpis.cumulative_value_zar_total)}</span></span>
        <span>EAC {'Δ'}: <span style={{ fontWeight: 700, color: BAD }}>{fmtZar(kpis.eac_delta_zar_total)}</span></span>
        <span>Sched days: <span style={{ fontWeight: 700, color: WARN }}>{kpis.schedule_impact_days_total}</span></span>
        <span>Completeness avg: <span style={{ fontWeight: 700, color: TX1 }}>{kpis.completeness_avg}/130</span></span>
        <span>RFI: <span style={{ fontWeight: 700, color: TX1 }}>{kpis.rfi_bridged_count}</span></span>
        <span>Submittal: <span style={{ fontWeight: 700, color: TX1 }}>{kpis.submittal_bridged_count}</span></span>
        <span>Doc control: <span style={{ fontWeight: 700, color: TX1 }}>{kpis.document_control_bridged_count}</span></span>
        <span>Schedule: <span style={{ fontWeight: 700, color: TX1 }}>{kpis.schedule_bridged_count}</span></span>
        <span>EVM: <span style={{ fontWeight: 700, color: TX1 }}>{kpis.evm_bridged_count}</span></span>
        <span>Procurement: <span style={{ fontWeight: 700, color: TX1 }}>{kpis.procurement_bridged_count}</span></span>
        <span>COD: <span style={{ fontWeight: 700, color: TX1 }}>{kpis.cod_bridged_count}</span></span>
      </div>

      {/* Row 1: action / lifecycle pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ACTION.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{ background: filter === f.key ? ACC : BG2, color: filter === f.key ? '#fff' : TX2, border: `1px solid ${filter === f.key ? ACC : BORDER}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 2: lifecycle stages + tiers */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_LIFECYCLE.map(f => (
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
          {filtered.map(row => {
            const ageDays = row.change_order_age_days_live ?? row.change_order_age_days ?? 0;
            const cumPct = row.cumulative_change_value_pct ?? 0;
            const metaParts: string[] = [
              row.current_tier,
              fmtMw(row.project_capacity_mw),
              row.change_order_number,
            ];
            if (row.is_reportable_flag) metaParts.push('REG');
            if (row.scope_baseline_change) metaParts.push('SCP');
            if (row.regulatory_re_consent_required) metaParts.push('REG-CONSENT');
            if (row.schedule_impact_critical_path) metaParts.push('CP');
            if (row.lender_consent_required) metaParts.push('LDR');
            if (row.safety_design_change) metaParts.push('SFTY');
            metaParts.push(`Age ${ageDays}d`);
            metaParts.push(`Cum ${cumPct.toFixed(1)}%`);
            metaParts.push(fmtZar(row.change_value_zar));

            return (
              <ChainCard
                key={row.id}
                item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.scope_summary_short ?? row.title ?? row.change_order_number}
                meta={metaParts.join(' · ')}
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No change orders match.</div>
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

export default IppChangeOrderChainTab;
