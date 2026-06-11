// Wave 98 — IPP Punch List / COD Snag Handover tab.
//
// The construction-completion defect lifecycle for a best-in-class IPP-PM
// stack. Beats Procore Punch List, BIM 360 Field, PlanGrid Punch List,
// Fieldwire snag, Autodesk Construction Cloud Punch List, Bluebeam Revu
// Snag, Aconex Defects via:
//   - 11-state P6 lifecycle (identified → assessed → assigned →
//     in_remediation → reinspect_requested → reinspected → accepted →
//     closed) with reject_reinspection → assigned rejoin, on_hold park,
//     and void / withdraw exception terminals
//   - tier RE-DERIVED on every transition from priority × workflow class
//     with FLOOR-AT-HIGH for blocks_commercial_operation | blocks_handover
//     | life_safety_critical | warranty_critical
//   - URGENT SLA polarity (COD-blocking is hours-money; critical 60min)
//   - ball-in-court tracking + authority tiered
//     (site_supervisor → quality_engineer → project_manager → project_director)
//   - LIVE battery decoration on every fetch: minutes_until_sla,
//     ipp_pm_quality_index (0-130 vs Procore baseline=100),
//     days_in_court, predicted_close_date_live, urgency_band
//   - SIGNATURE regulator crossings (W98 — NERSA §C-5 + REIPPPP COD):
//     close crosses EVERY tier with COD-blocking OR life-safety; accept
//     high+critical with life-safety; reject_reinspection high+critical
//     with COD-blocking; void EVERY tier with handover OR life-safety;
//     sla_breached high+critical with COD OR life-safety.

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
  | 'identified' | 'assessed' | 'assigned' | 'in_remediation'
  | 'reinspect_requested' | 'reinspected' | 'accepted' | 'closed'
  | 'on_hold' | 'voided' | 'withdrawn';

type Tier = 'critical' | 'high' | 'standard' | 'low';

type WorkflowClass =
  | 'punch_safety_critical' | 'punch_functional_performance' | 'punch_cosmetic'
  | 'punch_documentation' | 'punch_commissioning' | 'punch_handover_blocker'
  | 'punch_warranty_carryover' | 'snag_post_handover';

interface PunchRow {
  [key: string]: unknown;
  id: string;
  punch_number: string;
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
  identified_location: string | null;
  identified_zone: string | null;
  identified_drawing_ref: string | null;
  identified_specification_ref: string | null;
  identified_at: string | null;
  blocks_commercial_operation: number;
  blocks_handover: number;
  life_safety_critical: number;
  warranty_critical: number;
  current_tier: Tier;
  authority_required: string | null;
  rejection_count: number;
  reinspection_count: number;
  photo_evidence_count: number;
  root_cause_documented: number;
  commissioning_evidence: number;
  remediation_cost_zar: number | null;
  recovered_from_contractor_zar: number | null;
  parent_punch_id: string | null;
  cod_blocker_ref: string | null;
  handover_blocker_ref: string | null;
  warranty_ref: string | null;
  regulator_ref: string | null;
  title: string | null;
  narrative: string | null;
  response_text: string | null;
  voided_reason: string | null;
  withdrawn_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  requester_party: string | null;
  approver_party: string | null;
  chain_status: ChainStatus;
  assessed_at: string | null;
  assigned_at: string | null;
  in_remediation_at: string | null;
  reinspect_requested_at: string | null;
  reinspected_at: string | null;
  accepted_at: string | null;
  closed_at: string | null;
  on_hold_at: string | null;
  voided_at: string | null;
  withdrawn_at: string | null;
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
  ipp_pm_quality_index_live: number;
  inbox_severity_live: string;
  reportable_per_spec: boolean;
}

interface KpiSummary {
  total: number;
  open_count: number;
  closed_count: number;
  voided_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  signature_count: number;
  cod_count: number;
  handover_count: number;
  safety_count: number;
  warranty_count: number;
  avg_quality_index: number;
  avg_days_in_court: number;
  avg_rejection_count: number;
  total_remediation_cost_zar: number;
  total_recovered_zar: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'identified',
  'assessed',
  'assigned',
  'in_remediation',
  'reinspect_requested',
  'reinspected',
  'accepted',
  'closed',
];

const BRANCH_STATES: readonly string[] = [
  'on_hold',
  'voided',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                label: 'Open' },
  { key: 'all',                 label: 'All' },
  { key: 'critical',            label: 'Critical' },
  { key: 'high',                label: 'High' },
  { key: 'standard',            label: 'Standard' },
  { key: 'low',                 label: 'Low' },
  { key: 'identified',          label: 'Identified' },
  { key: 'assigned',            label: 'Assigned' },
  { key: 'in_remediation',      label: 'In remediation' },
  { key: 'reinspect_requested', label: 'Reinspect req' },
  { key: 'on_hold',             label: 'On hold' },
  { key: 'closed',              label: 'Closed' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'reportable',          label: 'Reportable' },
  { key: 'signature',           label: 'Signature' },
  { key: 'cod_only',            label: 'COD-blocking' },
  { key: 'safety_only',         label: 'Life-safety' },
];

// ── constants ─────────────────────────────────────────────────────────────
const TERMINAL_STATES: ChainStatus[] = ['closed', 'voided', 'withdrawn'];

const WORKFLOW_LABEL: Record<WorkflowClass, string> = {
  punch_safety_critical:        'Safety-critical',
  punch_functional_performance: 'Functional / performance',
  punch_cosmetic:               'Cosmetic',
  punch_documentation:          'Documentation',
  punch_commissioning:          'Commissioning',
  punch_handover_blocker:       'Handover blocker',
  punch_warranty_carryover:     'Warranty carryover',
  snag_post_handover:           'Post-handover snag',
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

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: PunchRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward action per state
  if (s === 'identified') {
    actions.push({
      key: 'assess',
      label: 'Assess (quality engineer)',
      fields: [
        { key: 'narrative', label: 'Assessment finding — tier and authority are re-derived after this step', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'assessed') {
    actions.push({
      key: 'assign',
      label: 'Assign (project manager)',
      fields: [
        { key: 'contractor_name', label: 'Assign to which contractor / subcontractor party', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'assigned') {
    actions.push({
      key: 'begin-remediation',
      label: 'Begin remediation (contractor)',
      fields: [
        { key: 'narrative', label: 'Remediation plan / start note', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'in_remediation') {
    actions.push({
      key: 'request-reinspection',
      label: 'Request reinspection (contractor)',
      fields: [
        { key: 'response_text', label: 'Evidence summary (photos / root-cause / commissioning) for reinspection', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'reinspect_requested') {
    actions.push({
      key: 'reinspect',
      label: 'Reinspect (independent engineer)',
      fields: [
        { key: 'narrative', label: 'Reinspection finding (independent engineer)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'reinspected') {
    // accept — crosses regulator for high+critical with life-safety
    actions.push({
      key: 'accept',
      label: 'Accept (independent engineer)',
      fields: [
        { key: 'regulator_ref', label: 'Regulator reference (life-safety high+critical crosses NERSA inbox) — leave blank if not applicable', type: 'text', required: false, placeholder: row.regulator_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });

    // reject-reinspection — secondary; crosses regulator high+critical with COD-blocking
    actions.push({
      key: 'reject-reinspection',
      label: 'Reject reinspection (independent engineer)',
      fields: [
        { key: 'narrative', label: 'Reason for reinspection rejection (COD-blocking high+critical crosses regulator)', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });

    // void secondary
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with handover OR life-safety crosses regulator EVERY tier', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'accepted') {
    // close — crosses EVERY tier with COD-blocking OR life-safety
    actions.push({
      key: 'close',
      label: 'Close (project manager)',
      fields: [
        { key: 'regulator_ref', label: 'Regulator reference (COD-blocking or life-safety crosses EVERY tier) — leave blank if not applicable', type: 'text', required: false, placeholder: row.regulator_ref ?? '' },
      ],
      cascadeTo: ['regulator'],
    });

    // void secondary
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with handover OR life-safety crosses regulator EVERY tier', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'on_hold') {
    actions.push({
      key: 'resume',
      label: 'Resume (contractor)',
      fields: [
        { key: 'narrative', label: 'Resume note', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });

    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with handover OR life-safety crosses regulator EVERY tier', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
  }

  // Secondary actions for identified/assessed/assigned states
  if (s === 'identified') {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (quality engineer)',
      fields: [
        { key: 'withdrawn_reason', label: 'Withdrawal reason', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'assessed') {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (quality engineer)',
      fields: [
        { key: 'withdrawn_reason', label: 'Withdrawal reason', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with handover OR life-safety crosses regulator EVERY tier', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'assigned') {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (quality engineer)',
      fields: [
        { key: 'withdrawn_reason', label: 'Withdrawal reason', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with handover OR life-safety crosses regulator EVERY tier', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'in_remediation') {
    actions.push({
      key: 'park',
      label: 'Park (project manager)',
      fields: [
        { key: 'narrative', label: 'Park reason (e.g. spare unavailable, weather, dependency)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with handover OR life-safety crosses regulator EVERY tier', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'reinspect_requested') {
    actions.push({
      key: 'park',
      label: 'Park (project manager)',
      fields: [
        { key: 'narrative', label: 'Park reason (e.g. spare unavailable, weather, dependency)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with handover OR life-safety crosses regulator EVERY tier', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
  }

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: PunchRow): React.ReactNode {
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');
  const netToOwner = (row.remediation_cost_zar ?? 0) - (row.recovered_from_contractor_zar ?? 0);

  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      {/* Live IPP-PM battery */}
      <div className="mb-3 rounded border px-3 py-2" style={{ background: BG, borderColor: BORDER }}>
        <div className="mb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>Live IPP-PM battery</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <DetailPair label="Quality index" value={fmtNum(row.ipp_pm_quality_index_live, 0)} hint="0-130 (Procore baseline=100; photo/root-cause/commissioning bonuses applied)" />
          <DetailPair label="Days open" value={String(row.days_open_live ?? 0)} />
          <DetailPair label="Days in court" value={String(row.days_in_court_live ?? 0)} hint="Aging in current state" />
          <DetailPair label="Ball in court" value={row.ball_in_court_party_live ?? '—'} hint="Auto-derived from current state" />
          <DetailPair label="Tier (live)" value={row.tier_live} hint="Re-derived every transition" />
          <DetailPair label="Urgency band" value={row.urgency_band} />
          <DetailPair label="Predicted close" value={fmtDate(row.predicted_close_date_live)} hint="Tier-derived ETA" />
          <DetailPair label="Authority" value={authority} hint="Site supervisor → quality engineer → project manager → project director" />
        </div>
      </div>

      {/* Coverage flags */}
      <div className="mb-3 rounded border px-3 py-2" style={{ background: BG, borderColor: BORDER }}>
        <div className="mb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>Coverage flags (FLOOR-AT-HIGH)</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <DetailPair label="Blocks COD" value={row.blocks_commercial_operation ? 'Yes' : 'No'} hint="NERSA §C-5 — blocks commercial operation" />
          <DetailPair label="Blocks handover" value={row.blocks_handover ? 'Yes' : 'No'} hint="REIPPPP COD prerequisite" />
          <DetailPair label="Life-safety" value={row.life_safety_critical ? 'Yes' : 'No'} hint="OHSA s24 life-safety critical" />
          <DetailPair label="Warranty critical" value={row.warranty_critical ? 'Yes' : 'No'} hint="Triggers warranty cost-recovery on close" />
          <DetailPair label="Rejections" value={String(row.rejection_count ?? 0)} />
          <DetailPair label="Reinspections" value={String(row.reinspection_count ?? 0)} />
          <DetailPair label="Photos" value={String(row.photo_evidence_count ?? 0)} hint="3+ photos = +10 quality" />
          <DetailPair label="Root cause" value={row.root_cause_documented ? 'Yes' : 'No'} hint="+5 quality" />
          <DetailPair label="Commissioning" value={row.commissioning_evidence ? 'Yes' : 'No'} hint="+5 quality" />
          <DetailPair label="Drawing ref" value={row.identified_drawing_ref ?? '—'} />
          <DetailPair label="Spec ref" value={row.identified_specification_ref ?? '—'} />
          <DetailPair label="Zone" value={row.identified_zone ?? '—'} />
        </div>
      </div>

      {/* Remediation economics */}
      <div className="mb-3 rounded border px-3 py-2" style={{ background: BG, borderColor: BORDER }}>
        <div className="mb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>Remediation economics</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <DetailPair label="Remediation cost" value={fmtZar(row.remediation_cost_zar)} hint="Total cost expended on this punch" />
          <DetailPair label="Recovered" value={fmtZar(row.recovered_from_contractor_zar)} hint="Recovered from contractor (back-charge)" />
          <DetailPair label="Net to owner" value={fmtZar(netToOwner)} />
        </div>
      </div>

      {/* Core details grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2">
        <DetailPair label="State"             value={row.chain_status} />
        <DetailPair label="Workflow class"    value={WORKFLOW_LABEL[row.workflow_class]} />
        <DetailPair label="Priority"          value={row.priority_class} />
        <DetailPair label="Identified at"     value={fmtDate(row.identified_at)} />
        <DetailPair label="Identified location" value={row.identified_location ?? '—'} />
        <DetailPair label="Zone"              value={row.identified_zone ?? '—'} />
        <DetailPair label="Drawing ref"       value={row.identified_drawing_ref ?? '—'} />
        <DetailPair label="Spec ref"          value={row.identified_specification_ref ?? '—'} />
        <DetailPair label="Contractor"        value={row.contractor_name ?? '—'} />
        <DetailPair label="Facility"          value={row.facility_name ?? '—'} />
        <DetailPair label="Owner"             value={row.owner_party_name ?? '—'} />
        <DetailPair label="Last responder"    value={row.last_responder_party ?? '—'} />
        <DetailPair label="Requester"         value={row.requester_party ?? '—'} />
        <DetailPair label="Approver"          value={row.approver_party ?? '—'} />
        <DetailPair label="COD blocker ref"   value={row.cod_blocker_ref ?? '—'} />
        <DetailPair label="Handover blocker"  value={row.handover_blocker_ref ?? '—'} />
        <DetailPair label="Warranty ref"      value={row.warranty_ref ?? '—'} />
        <DetailPair label="Regulator ref"     value={row.regulator_ref ?? '—'} />
        <DetailPair label="Assessed"          value={fmtDate(row.assessed_at)} />
        <DetailPair label="Assigned"          value={fmtDate(row.assigned_at)} />
        <DetailPair label="In remediation"    value={fmtDate(row.in_remediation_at)} />
        <DetailPair label="Reinspect req"     value={fmtDate(row.reinspect_requested_at)} />
        <DetailPair label="Reinspected"       value={fmtDate(row.reinspected_at)} />
        <DetailPair label="Accepted"          value={fmtDate(row.accepted_at)} />
        <DetailPair label="Closed"            value={fmtDate(row.closed_at)} />
        <DetailPair label="On hold"           value={fmtDate(row.on_hold_at)} />
        <DetailPair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA"               value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl"    value={String(row.escalation_level)} />
        <DetailPair label="Reportable"        value={row.is_reportable_flag ? 'Yes' : 'No'} />
      </div>

      {row.title && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Title</div>
          <div style={{ color: TX1, whiteSpace: 'pre-wrap' }}>{row.title}</div>
        </div>
      )}
      {row.narrative && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Narrative</div>
          <div style={{ color: TX1, whiteSpace: 'pre-wrap' }}>{row.narrative}</div>
        </div>
      )}
      {row.response_text && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Response</div>
          <div style={{ color: GOOD, whiteSpace: 'pre-wrap' }}>{row.response_text}</div>
        </div>
      )}
      {row.voided_reason && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Voided reason</div>
          <div style={{ color: BAD, whiteSpace: 'pre-wrap' }}>{row.voided_reason}</div>
        </div>
      )}
      {row.withdrawn_reason && (
        <div className="mb-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>Withdrawn reason</div>
          <div style={{ color: WARN, whiteSpace: 'pre-wrap' }}>{row.withdrawn_reason}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function PunchListChainTab() {
  const [rows, setRows] = useState<PunchRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: PunchRow[] } & KpiSummary }>('/ipp/punch-list/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total,
          open_count: d.open_count,
          closed_count: d.closed_count,
          voided_count: d.voided_count,
          withdrawn_count: d.withdrawn_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          signature_count: d.signature_count,
          cod_count: d.cod_count,
          handover_count: d.handover_count,
          safety_count: d.safety_count,
          warranty_count: d.warranty_count,
          avg_quality_index: d.avg_quality_index,
          avg_days_in_court: d.avg_days_in_court,
          avg_rejection_count: d.avg_rejection_count,
          total_remediation_cost_zar: d.total_remediation_cost_zar,
          total_recovered_zar: d.total_recovered_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load punch list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ipp/punch-list/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/punch-list/chain/${rowId}`);
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
      const res = await api.get<{ data: { punch_list: PunchRow; events: ChainEvent[] } }>(`/ipp/punch-list/chain/${id}`);
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
      if (filter === 'safety_only') return r.life_safety_critical === 1;
      if (['critical', 'high', 'standard', 'low'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis ?? {
    total: 0, open_count: 0, closed_count: 0, voided_count: 0,
    withdrawn_count: 0, breached: 0, reportable_total: 0,
    signature_count: 0, cod_count: 0, handover_count: 0,
    safety_count: 0, warranty_count: 0, avg_quality_index: 0,
    avg_days_in_court: 0, avg_rejection_count: 0,
    total_remediation_cost_zar: 0, total_recovered_zar: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Punch list &middot; COD snag handover</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          11-state P6 lifecycle for the construction-completion defect side of an IPP project — identified →
          assessed → assigned → in_remediation → reinspect_requested → reinspected → accepted → closed, with
          reject_reinspection → assigned rejoin, on_hold park and void / withdraw exception terminals.
          Beats Procore Punch List, BIM 360 Field, PlanGrid, Fieldwire, Autodesk Construction Cloud, Bluebeam Revu
          and Aconex Defects via tier RE-DERIVED on every transition (FLOOR-AT-HIGH for COD / handover / life-safety /
          warranty), URGENT SLA polarity, ball-in-court tracking, LIVE battery decoration and SIGNATURE NERSA §C-5 +
          REIPPPP COD regulator crossings.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"        value={k.total} />
        <KpiTile label="Open"         value={k.open_count}          tone={k.open_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Closed"       value={k.closed_count}        tone="ok" />
        <KpiTile label="Voided"       value={k.voided_count}        tone={k.voided_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached" value={k.breached}            tone={k.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Signature"    value={k.signature_count}     tone={k.signature_count > 0 ? 'warn' : undefined} />
        <KpiTile label="COD-blocking" value={k.cod_count}           tone={k.cod_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Handover blk" value={k.handover_count}      tone={k.handover_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Life-safety"  value={k.safety_count}        tone={k.safety_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable"   value={k.reportable_total}    tone={k.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="IPP-PM qual"  value={fmtNum(k.avg_quality_index, 0)} />
        <KpiTile label="Avg rejects"  value={fmtNum(k.avg_rejection_count, 2)} tone={k.avg_rejection_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Remediation"  value={fmtZar(k.total_remediation_cost_zar)} />
        <KpiTile label="Recovered"    value={fmtZar(k.total_recovered_zar)} />
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
              title={`${row.punch_number}${row.title ? ` — ${row.title}` : ''}`}
              meta={[
                WORKFLOW_LABEL[row.workflow_class],
                row.project_name ?? '',
                row.identified_location ?? '',
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No punch list items match.
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
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default PunchListChainTab;
