// Wave 99 — IPP ITP / Quality Inspection & Test Plan tab.
//
// The forward-looking quality register a best-in-class IPP-PM stack drives at
// every construction stage. Beats Procore Quality + Aconex ITR + Bentley
// AssetWise + e-Builder ITR + Autodesk Construction Cloud Quality + Bluebeam
// Studio Quality via:
//   - 12-state P6 lifecycle (itp_drafted -> submitted -> under_review ->
//     approved -> released_to_site -> inspection_scheduled -> in_inspection
//     -> witness_attended -> result_recorded -> {passed | failed ->
//     corrective_action -> re_inspect -> in_inspection rejoin} ->
//     released_for_use -> archived) plus reject / withdraw / void terminals
//   - tier RE-DERIVED on every transition from priority x workflow class
//     with FLOOR-AT-HIGH for blocks_handover_milestone |
//     blocks_commercial_operation | safety_critical_test | regulator_hold_point
//   - URGENT SLA polarity (safety-critical and COD-blocker = tightest)
//   - ball-in-court tracking + authority tiered
//     (site_supervisor -> quality_engineer -> project_manager -> project_director)
//   - LIVE battery decoration on every fetch: minutes_until_sla,
//     ipp_quality_index (0-130 vs industry baseline=100 with witness,
//     first-time-pass, photo and root-cause bonuses), days_in_court,
//     predicted_close_date_live, urgency_band
//   - SIGNATURE regulator crossings (W99 - NERSA s.C-5 + REIPPPP + OHSA s24
//     + IEC 61508): submit crosses EVERY tier on safety_critical_test;
//     approve EVERY tier on blocks_commercial_operation; record_result
//     (failed) EVERY tier on safety_critical_test OR blocks_commercial_operation;
//     void EVERY tier on blocks_commercial_operation OR safety_critical_test;
//     sla_breached crosses regulator EVERY tier on safety_critical_test and
//     high+critical on blocks_commercial_operation.

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
  | 'itp_drafted' | 'submitted' | 'under_review' | 'approved' | 'released_to_site'
  | 'inspection_scheduled' | 'in_inspection' | 'witness_attended' | 'result_recorded'
  | 'passed' | 'failed' | 'corrective_action' | 'released_for_use' | 'archived'
  | 'rejected' | 'withdrawn' | 'voided';

type Tier = 'critical' | 'high' | 'standard' | 'low';

type WorkflowClass =
  | 'itp_civil_foundation' | 'itp_mechanical_assembly' | 'itp_electrical_lv'
  | 'itp_electrical_mv_hv' | 'itp_instrumentation_scada' | 'itp_pressure_vessel'
  | 'itp_protection_relay' | 'itp_grid_synchronisation' | 'itp_commissioning_test'
  | 'itp_handover_doc_pack';

interface ItpRow {
  [key: string]: unknown;
  id: string;
  itp_number: string;
  project_id: string;
  project_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
  owner_party_id: string | null;
  owner_party_name: string | null;
  workflow_class: WorkflowClass;
  priority_class: 'critical' | 'high' | 'standard' | 'low';
  construction_stage: string | null;
  hold_point_ref: string | null;
  drawing_ref: string | null;
  specification_ref: string | null;
  acceptance_criteria: string | null;
  identified_at: string | null;
  blocks_handover_milestone: number;
  blocks_commercial_operation: number;
  safety_critical_test: number;
  regulator_hold_point: number;
  current_tier: Tier;
  authority_required: string | null;
  reinspection_count: number;
  photo_evidence_count: number;
  witness_attended: number;
  first_time_pass: number;
  root_cause_documented: number;
  inspection_cost_zar: number | null;
  rework_cost_zar: number | null;
  parent_itp_id: string | null;
  cod_blocker_ref: string | null;
  handover_blocker_ref: string | null;
  regulator_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  rejected_reason: string | null;
  voided_reason: string | null;
  withdrawn_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  requester_party: string | null;
  approver_party: string | null;
  witness_party: string | null;
  chain_status: ChainStatus;
  submitted_at: string | null;
  under_review_at: string | null;
  approved_at: string | null;
  released_to_site_at: string | null;
  inspection_scheduled_at: string | null;
  in_inspection_at: string | null;
  witness_attended_at: string | null;
  result_recorded_at: string | null;
  passed_at: string | null;
  failed_at: string | null;
  corrective_action_at: string | null;
  released_for_use_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  voided_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // decorated
  is_terminal: boolean;
  minutes_until_sla: number | null;
  sla_breached: boolean;
  sla_window_minutes: number;
  urgency_band: 'red' | 'amber' | 'yellow' | 'green' | 'terminal';
  is_reportable_flag: boolean;
  high_tier_flag: boolean;
  floor_at_high_flag: boolean;
  signature_class_flag: boolean;
  authority_required_live: string;
  tier_live: Tier;
  ball_in_court_party_live: string | null;
  days_in_court_live: number;
  days_open_live: number;
  predicted_close_date_live: string | null;
  ipp_quality_index_live: number;
  inbox_severity_live: string;
  reportable_per_spec: boolean;
}

interface ItpEvent {
  id: string;
  itp_id: string;
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
  archived_count: number;
  rejected_count: number;
  withdrawn_count: number;
  voided_count: number;
  breached: number;
  reportable_total: number;
  signature_count: number;
  cod_count: number;
  handover_count: number;
  safety_count: number;
  hold_count: number;
  witness_count: number;
  first_time_pass_count: number;
  avg_quality_index: number;
  avg_days_in_court: number;
  total_inspection_cost_zar: number;
  total_rework_cost_zar: number;
  witness_attendance_rate: number;
  first_time_pass_rate: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'itp_drafted',
  'submitted',
  'under_review',
  'approved',
  'released_to_site',
  'inspection_scheduled',
  'in_inspection',
  'witness_attended',
  'result_recorded',
  'passed',
  'released_for_use',
  'archived',
];

const BRANCH_STATES: readonly string[] = [
  'failed',
  'corrective_action',
  'rejected',
  'withdrawn',
  'voided',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',              label: 'Open' },
  { key: 'all',               label: 'All' },
  { key: 'critical',          label: 'Critical' },
  { key: 'high',              label: 'High' },
  { key: 'standard',          label: 'Standard' },
  { key: 'low',               label: 'Low' },
  { key: 'itp_drafted',       label: 'Drafted' },
  { key: 'submitted',         label: 'Submitted' },
  { key: 'under_review',      label: 'Under review' },
  { key: 'in_inspection',     label: 'In inspection' },
  { key: 'corrective_action', label: 'Corrective action' },
  { key: 'failed',            label: 'Failed' },
  { key: 'released_for_use',  label: 'Released for use' },
  { key: 'archived',          label: 'Archived' },
  { key: 'breached',          label: 'SLA breached' },
  { key: 'reportable',        label: 'Reportable' },
  { key: 'signature',         label: 'Signature' },
  { key: 'cod_only',          label: 'COD-blocking' },
  { key: 'safety_only',       label: 'Safety-critical' },
  { key: 'hold_only',         label: 'Reg. hold point' },
];

const TERMINAL_STATES: ChainStatus[] = ['archived', 'rejected', 'withdrawn', 'voided'];

const WORKFLOW_LABEL: Record<WorkflowClass, string> = {
  itp_civil_foundation:      'Civil / foundation',
  itp_mechanical_assembly:   'Mechanical assembly',
  itp_electrical_lv:         'Electrical LV',
  itp_electrical_mv_hv:      'Electrical MV/HV',
  itp_instrumentation_scada: 'Instrumentation / SCADA',
  itp_pressure_vessel:       'Pressure vessel',
  itp_protection_relay:      'Protection relay',
  itp_grid_synchronisation:  'Grid synchronisation',
  itp_commissioning_test:    'Commissioning test',
  itp_handover_doc_pack:     'Handover doc pack',
};

const AUTHORITY_LABEL: Record<string, string> = {
  site_supervisor:  'Site supervisor',
  quality_engineer: 'Quality engineer',
  project_manager:  'Project manager',
  project_director: 'Project director',
};

// ── format helpers ────────────────────────────────────────────────────────
function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  const abs = Math.abs(m);
  const sign = m < 0 ? '-' : '';
  if (abs >= 1440) return `${sign}${Math.round(abs / 1440)}d`;
  if (abs >= 60)   return `${sign}${Math.round(abs / 60)}h`;
  return `${sign}${abs}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}R${(a / 1_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}m`;
  if (a >= 1000)      return `${sign}R${(a / 1000).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}k`;
  return `${sign}R${a.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${(v * 100).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}%`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: ItpRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary action per state
  if (s === 'itp_drafted') {
    actions.push({
      key: 'submit',
      label: 'Submit (quality engineer)',
      tone: 'primary',
      // submit crosses EVERY tier on safety_critical_test
      cascadeTo: row.safety_critical_test ? ['regulator'] : [],
      fields: [
        {
          key: 'narrative',
          label: 'Submission note (safety-critical tests cross NERSA inbox on submit)',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'submitted') {
    actions.push({
      key: 'open-review',
      label: 'Open review (independent engineer)',
      tone: 'primary',
      cascadeTo: [],
      fields: [],
    });
  }

  if (s === 'under_review') {
    actions.push({
      key: 'approve',
      label: 'Approve (independent engineer)',
      tone: 'primary',
      // approve crosses EVERY tier on blocks_commercial_operation
      cascadeTo: row.blocks_commercial_operation ? ['regulator'] : [],
      fields: [
        {
          key: 'regulator_ref',
          label: 'Regulator reference (COD-blocking approvals cross EVERY tier) — leave blank if not applicable',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'approved') {
    actions.push({
      key: 'release',
      label: 'Release to site (project manager)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'narrative',
          label: 'Release note (project manager)',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'released_to_site') {
    actions.push({
      key: 'schedule-inspection',
      label: 'Schedule inspection (site supervisor)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'narrative',
          label: 'Scheduled inspection window / date',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'inspection_scheduled') {
    actions.push({
      key: 'begin-inspection',
      label: 'Begin inspection (site supervisor)',
      tone: 'primary',
      cascadeTo: [],
      fields: [],
    });
  }

  if (s === 'in_inspection') {
    actions.push({
      key: 'attend-witness',
      label: 'Witness attended (witness)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'witness_party',
          label: 'Witness party (independent_engineer / regulator / lender)',
          type: 'text',
          required: false,
          placeholder: 'witness',
        },
      ],
    });
  }

  if (s === 'witness_attended') {
    actions.push({
      key: 'record-result',
      label: 'Record result (independent engineer)',
      tone: 'primary',
      // record_result(failed) crosses EVERY tier on safety OR COD — set at action level
      cascadeTo: [],
      fields: [
        {
          key: 'result_text',
          label: 'Result text (pass / observations / non-conformance)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'result_recorded') {
    actions.push({
      key: 'pass',
      label: 'Pass (independent engineer)',
      tone: 'primary',
      // pass crosses regulator at high+critical on hold-point
      cascadeTo: row.regulator_hold_point && (row.current_tier === 'critical' || row.current_tier === 'high') ? ['regulator'] : [],
      fields: [
        {
          key: 'regulator_ref',
          label: 'Regulator reference (hold-point pass at high+critical crosses regulator) — leave blank if not applicable',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'passed') {
    actions.push({
      key: 'release-for-use',
      label: 'Release for use (commissioning engineer)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'narrative',
          label: 'Release for use note (commissioning engineer)',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'failed') {
    actions.push({
      key: 'raise-corrective-action',
      label: 'Raise corrective action (contractor)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'narrative',
          label: 'Corrective action plan (contractor — root-cause + remediation steps)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'corrective_action') {
    actions.push({
      key: 're-inspect',
      label: 'Re-inspect (site supervisor)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'narrative',
          label: 'Re-inspection note (auto-increments reinspection count)',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'released_for_use') {
    actions.push({
      key: 'archive',
      label: 'Archive (project manager)',
      tone: 'primary',
      cascadeTo: [],
      fields: [],
    });
  }

  // Secondary: fail (available in in_inspection, witness_attended, result_recorded)
  if (s === 'in_inspection' || s === 'witness_attended' || s === 'result_recorded') {
    actions.push({
      key: 'fail',
      label: 'Fail (independent engineer)',
      tone: 'danger',
      // fail on safety OR COD crosses regulator EVERY tier
      cascadeTo: (row.safety_critical_test || row.blocks_commercial_operation) ? ['regulator'] : [],
      fields: [
        {
          key: 'result_text',
          label: 'Failure reason (safety OR COD failures cross regulator EVERY tier)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  // Secondary: reject
  if (s === 'submitted' || s === 'under_review') {
    actions.push({
      key: 'reject',
      label: 'Reject (independent engineer)',
      tone: 'danger',
      cascadeTo: [],
      fields: [
        {
          key: 'rejected_reason',
          label: 'Rejection reason (independent engineer)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  // Secondary: withdraw
  if (s === 'itp_drafted' || s === 'submitted') {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (quality engineer)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        {
          key: 'withdrawn_reason',
          label: 'Withdrawal reason (quality engineer)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  // Secondary: void (available in many non-terminal states)
  if (
    s === 'under_review' || s === 'approved' || s === 'released_to_site' ||
    s === 'inspection_scheduled' || s === 'in_inspection' || s === 'witness_attended' ||
    s === 'result_recorded' || s === 'passed' || s === 'failed' ||
    s === 'corrective_action' || s === 'released_for_use'
  ) {
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      tone: 'danger',
      // void crosses regulator EVERY tier on COD OR safety
      cascadeTo: (row.blocks_commercial_operation || row.safety_critical_test) ? ['regulator'] : [],
      fields: [
        {
          key: 'voided_reason',
          label: 'Void reason — voiding with COD-blocking OR safety-critical crosses regulator EVERY tier',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: ItpRow): React.ReactNode {
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');

  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      {/* Live battery */}
      <div className="rounded border px-3 py-2 mb-2" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: TX3 }}>Live IPP quality battery</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <DetailPair label="Quality index" value={`${fmtNum(row.ipp_quality_index_live, 0)} / 130 (baseline 100)`} />
          <DetailPair label="Days open" value={String(row.days_open_live ?? 0)} />
          <DetailPair label="Days in court" value={String(row.days_in_court_live ?? 0)} />
          <DetailPair label="Ball in court" value={row.ball_in_court_party_live ?? '—'} />
          <DetailPair label="Tier (live)" value={row.tier_live} />
          <DetailPair label="Urgency band" value={row.urgency_band} />
          <DetailPair label="Predicted close" value={fmtDate(row.predicted_close_date_live)} />
          <DetailPair label="Authority" value={authority} />
        </div>
      </div>

      {/* Coverage flags */}
      <div className="rounded border px-3 py-2 mb-2" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: TX3 }}>Coverage flags (FLOOR-AT-HIGH)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <DetailPair label="Blocks handover" value={row.blocks_handover_milestone ? 'Yes' : 'No'} />
          <DetailPair label="Blocks COD" value={row.blocks_commercial_operation ? 'Yes' : 'No'} />
          <DetailPair label="Safety-critical" value={row.safety_critical_test ? 'Yes' : 'No'} />
          <DetailPair label="Reg. hold point" value={row.regulator_hold_point ? 'Yes' : 'No'} />
          <DetailPair label="Reinspections" value={String(row.reinspection_count ?? 0)} />
          <DetailPair label="Witness attended" value={row.witness_attended ? 'Yes' : 'No'} />
          <DetailPair label="1st-time pass" value={row.first_time_pass ? 'Yes' : 'No'} />
          <DetailPair label="Photos" value={String(row.photo_evidence_count ?? 0)} />
          <DetailPair label="Root cause documented" value={row.root_cause_documented ? 'Yes' : 'No'} />
          <DetailPair label="Hold point ref" value={row.hold_point_ref ?? '—'} />
          <DetailPair label="Drawing ref" value={row.drawing_ref ?? '—'} />
          <DetailPair label="Spec ref" value={row.specification_ref ?? '—'} />
        </div>
      </div>

      {/* Quality economics */}
      <div className="rounded border px-3 py-2 mb-2" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: TX3 }}>Quality economics</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <DetailPair label="Inspection cost" value={fmtZar(row.inspection_cost_zar)} />
          <DetailPair label="Rework cost" value={fmtZar(row.rework_cost_zar)} />
          <DetailPair label="Total cost" value={fmtZar((row.inspection_cost_zar ?? 0) + (row.rework_cost_zar ?? 0))} />
        </div>
      </div>

      {/* Core fields */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
        <DetailPair label="Workflow class" value={WORKFLOW_LABEL[row.workflow_class]} />
        <DetailPair label="Priority" value={row.priority_class} />
        <DetailPair label="Construction stage" value={row.construction_stage ?? '—'} />
        <DetailPair label="Identified at" value={fmtDate(row.identified_at)} />
        <DetailPair label="Acceptance criteria" value={row.acceptance_criteria ?? '—'} />
        <DetailPair label="Contractor" value={row.contractor_name ?? '—'} />
        <DetailPair label="Facility" value={row.facility_name ?? '—'} />
        <DetailPair label="Owner" value={row.owner_party_name ?? '—'} />
        <DetailPair label="Witness party" value={row.witness_party ?? '—'} />
        <DetailPair label="Last responder" value={row.last_responder_party ?? '—'} />
        <DetailPair label="Requester" value={row.requester_party ?? '—'} />
        <DetailPair label="Approver" value={row.approver_party ?? '—'} />
        <DetailPair label="COD blocker ref" value={row.cod_blocker_ref ?? '—'} />
        <DetailPair label="Handover blocker" value={row.handover_blocker_ref ?? '—'} />
        <DetailPair label="Regulator ref" value={row.regulator_ref ?? '—'} />
        <DetailPair label="Escalation lvl" value={String(row.escalation_level)} />
        <DetailPair label="Reportable" value={row.is_reportable_flag ? 'Yes' : 'No'} />
        <DetailPair label="Submitted" value={fmtDate(row.submitted_at)} />
        <DetailPair label="Approved" value={fmtDate(row.approved_at)} />
        <DetailPair label="Released to site" value={fmtDate(row.released_to_site_at)} />
        <DetailPair label="Insp. scheduled" value={fmtDate(row.inspection_scheduled_at)} />
        <DetailPair label="In inspection" value={fmtDate(row.in_inspection_at)} />
        <DetailPair label="Witness attended" value={fmtDate(row.witness_attended_at)} />
        <DetailPair label="Result recorded" value={fmtDate(row.result_recorded_at)} />
        <DetailPair label="Passed" value={fmtDate(row.passed_at)} />
        <DetailPair label="Failed" value={fmtDate(row.failed_at)} />
        <DetailPair label="Corrective action" value={fmtDate(row.corrective_action_at)} />
        <DetailPair label="Released for use" value={fmtDate(row.released_for_use_at)} />
        <DetailPair label="Archived" value={fmtDate(row.archived_at)} />
        <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      </div>

      {row.title && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Title</div>
          <div style={{ color: TX2 }}>{row.title}</div>
        </div>
      )}
      {row.narrative && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Narrative</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.narrative}</div>
        </div>
      )}
      {row.result_text && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOOD }}>Result</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.result_text}</div>
        </div>
      )}
      {row.rejected_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Rejected reason</div>
          <div style={{ color: BAD }}>{row.rejected_reason}</div>
        </div>
      )}
      {row.voided_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Voided reason</div>
          <div style={{ color: BAD }}>{row.voided_reason}</div>
        </div>
      )}
      {row.withdrawn_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>Withdrawn reason</div>
          <div style={{ color: WARN }}>{row.withdrawn_reason}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function ItpChainTab() {
  const [rows, setRows] = useState<ItpRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ItpRow[] } & KpiSummary }>('/ipp/itp/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setKpis({
          total: d.total,
          open_count: d.open_count,
          archived_count: d.archived_count,
          rejected_count: d.rejected_count,
          withdrawn_count: d.withdrawn_count,
          voided_count: d.voided_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          signature_count: d.signature_count,
          cod_count: d.cod_count,
          handover_count: d.handover_count,
          safety_count: d.safety_count,
          hold_count: d.hold_count,
          witness_count: d.witness_count,
          first_time_pass_count: d.first_time_pass_count,
          avg_quality_index: d.avg_quality_index,
          avg_days_in_court: d.avg_days_in_court,
          total_inspection_cost_zar: d.total_inspection_cost_zar,
          total_rework_cost_zar: d.total_rework_cost_zar,
          witness_attendance_rate: d.witness_attendance_rate,
          first_time_pass_rate: d.first_time_pass_rate,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load ITP chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      // Reconstruct body matching original act() logic
      const body: Record<string, unknown> = { ...values };
      // For attend-witness: also set last_responder_party
      if (key === 'attend-witness') {
        body.last_responder_party = 'witness';
        if (!body.witness_party) body.witness_party = 'witness';
      }
      // For record-result: also set last_responder_party
      if (key === 'record-result') {
        body.last_responder_party = 'independent_engineer';
      }
      // For approve: also set approver_party
      if (key === 'approve') {
        body.approver_party = 'independent_engineer';
      }
      // For release-for-use: also set last_responder_party
      if (key === 'release-for-use') {
        body.last_responder_party = 'commissioning_engineer';
      }
      // For raise-corrective-action: also set last_responder_party
      if (key === 'raise-corrective-action') {
        body.last_responder_party = 'contractor';
      }
      // For fail: set reason_code
      if (key === 'fail') {
        body.reason_code = 'FAILED';
        // result_text already in values
      }
      await api.post(`/ipp/itp/chain/${rowId}/${key}`, body);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { itp: ItpRow; events: ChainEvent[] } }>(`/ipp/itp/chain/${rowId}`);
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
      const res = await api.get<{ data: { itp: ItpRow; events: ChainEvent[] } }>(`/ipp/itp/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'open')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')    return r.sla_breached;
      if (filter === 'reportable')  return r.is_reportable_flag;
      if (filter === 'signature')   return r.signature_class_flag;
      if (filter === 'cod_only')    return r.blocks_commercial_operation === 1;
      if (filter === 'safety_only') return r.safety_critical_test === 1;
      if (filter === 'hold_only')   return r.regulator_hold_point === 1;
      if (['critical', 'high', 'standard', 'low'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis ?? {
    total: 0, open_count: 0, archived_count: 0, rejected_count: 0,
    withdrawn_count: 0, voided_count: 0, breached: 0, reportable_total: 0,
    signature_count: 0, cod_count: 0, handover_count: 0, safety_count: 0,
    hold_count: 0, witness_count: 0, first_time_pass_count: 0,
    avg_quality_index: 0, avg_days_in_court: 0, total_inspection_cost_zar: 0,
    total_rework_cost_zar: 0, witness_attendance_rate: 0, first_time_pass_rate: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>ITP · Inspection &amp; test plan</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state P6 lifecycle for the forward-looking quality register of an IPP project.
          Beats Procore Quality, Aconex ITR, Bentley AssetWise, e-Builder ITR, Autodesk Construction Cloud
          Quality and Bluebeam Studio Quality. SIGNATURE regulator crossings: submit on safety-critical,
          approve on COD-blocking, fail on safety OR COD, void on COD OR safety (NERSA §C-5 + REIPPPP + OHSA s24 + IEC 61508).
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"          value={k.total} />
        <KpiTile label="Open"           value={k.open_count}           tone={k.open_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Archived"       value={k.archived_count}        tone="ok" />
        <KpiTile label="Rejected"       value={k.rejected_count}        tone={k.rejected_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Voided"         value={k.voided_count}          tone={k.voided_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"   value={k.breached}              tone={k.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Signature"      value={k.signature_count}       tone={k.signature_count > 0 ? 'warn' : undefined} />
        <KpiTile label="COD-blocking"   value={k.cod_count}             tone={k.cod_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Safety-crit"    value={k.safety_count}          tone={k.safety_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Reg. hold"      value={k.hold_count}            tone={k.hold_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Reportable"     value={k.reportable_total}      tone={k.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="IPP quality"    value={fmtNum(k.avg_quality_index, 0)} />
        <KpiTile label="Witness rate"   value={fmtPct(k.witness_attendance_rate)} tone={k.witness_attendance_rate < 0.5 ? 'warn' : undefined} />
        <KpiTile label="1st-time pass"  value={fmtPct(k.first_time_pass_rate)}    tone={k.first_time_pass_rate < 0.5 ? 'warn' : undefined} />
        <KpiTile label="Insp. cost"     value={fmtZar(k.total_inspection_cost_zar)} />
        <KpiTile label="Rework cost"    value={fmtZar(k.total_rework_cost_zar)}    tone={k.total_rework_cost_zar > 0 ? 'warn' : undefined} />
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
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
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
              title={`${row.itp_number}${row.title ? ` · ${row.title}` : ''}`}
              meta={
                <span style={{ color: TX3, fontSize: 10 }}>
                  {WORKFLOW_LABEL[row.workflow_class]}
                  {row.project_name ? ` · ${row.project_name}` : ''}
                  {row.construction_stage ? ` · ${row.construction_stage}` : ''}
                  {row.contractor_name ? ` · ${row.contractor_name}` : ''}
                  {row.signature_class_flag ? ' · ▲ SIGNATURE' : ''}
                  {row.is_reportable_flag ? ' · ● REPORTABLE' : ''}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No ITP records match.
            </div>
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

export default ItpChainTab;
