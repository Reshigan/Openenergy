// Wave 114 — IPP Document Control & Drawing Register chain (P6).
//
// 9th IPP chain. THIRD wave of Phase A IPP-parity push (after W112 WBS &
// Gantt and W113 Cost & EVM). Drawing register + IDC matrix + transmittal
// + review + comment + revise + approve + IFC + as-built + archive engine.
// Beats Aconex / Procore Documents / Bluebeam Studio / Newforma / Asite /
// Oracle Aconex / Bentley ProjectWise / Autodesk Construction Cloud Docs /
// SharePoint AECOM / e-Builder.
//
// 12-state P6 forward + 3 branches (rejected, withdrawn, hold) with URGENT
// SLA polarity stored in HOURS: safety_critical 24h, electrical 72h,
// mechanical 120h, civil 168h on transmitted anchor (higher discipline-
// criticality gets TIGHTEST window). FLOOR-AT-SAFETY-CRITICAL on ANY one
// of 5 flags (hv_electrical, commissioning_critical_path,
// safety_signoff_required, ifc_blocking, regulatory_submittal). 3-step
// authority ladder: doc_controller -> engineer_of_record -> IPP_CEO.
// 20-field LIVE doc-control battery. 5-bridge architecture: W112 schedule,
// W113 EVM cost-book, W19 procurement, W20 COD, W18 planned outage.
//
// SIGNATURE Phase-A IPP regulator crossings:
//  * reject crosses EVERY tier when safety_critical OR ifc_blocking
//    (W114 SIGNATURE DOCUMENT-REJECT-CRITICAL hard line)
//  * withdraw crosses EVERY tier when issued_for_construction reached
//  * approve crosses safety_critical only when hv_electrical OR ccp
//  * archive never crosses regulator
//  * sla_breached crosses safety_critical + electrical (heavy tiers)
//
// Standards: ISO 19650-1/2/3 + AECOOEM ED2-2024 + REIPPPP Schedule 2 +
// DMRE site-records + IEC 61355 + ENAA EPC + FIDIC Silver Book §6.

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
  | 'draft_uploaded' | 'metadata_indexed' | 'revision_open' | 'IDC_assigned'
  | 'transmitted' | 'reviewed' | 'commented' | 'revised' | 'approved'
  | 'issued_for_construction' | 'as_built_finalised' | 'archived'
  | 'rejected' | 'withdrawn' | 'hold';

type IpdTier = 'civil' | 'mechanical' | 'electrical' | 'safety_critical';
type IpdUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'doc_controller' | 'engineer_of_record' | 'IPP_CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type IdcStatus = 'open' | 'review' | 'approved' | 'closed';

interface IpdRow {
  [key: string]: unknown;
  id: string;
  document_number: string;
  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  schedule_ref: string | null;
  evm_ref: string | null;
  procurement_ref: string | null;
  cod_ref: string | null;
  planned_outage_ref: string | null;
  document_class: string | null;
  document_type: string | null;
  discipline: string | null;
  package_code: string | null;
  drawing_number: string | null;
  drawing_title: string | null;
  iec_61355_code: string | null;
  current_revision: string | null;
  revisions_count: number;
  last_transmittal_number: string | null;
  last_transmittal_at: string | null;
  reviewer_name: string | null;
  reviewer_party: string | null;
  approver_name: string | null;
  approver_party: string | null;
  idc_status: string | null;
  idc_matrix_recomputed_at: string | null;
  hv_electrical: number;
  commissioning_critical_path: number;
  safety_signoff_required: number;
  ifc_blocking: number;
  regulatory_submittal: number;
  reached_ifc: number;
  current_tier: IpdTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  doc_health_band: HealthBand | null;
  document_completeness_index: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  withdraw_reason: string | null;
  hold_reason: string | null;
  comments_summary: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  draft_uploaded_at: string | null;
  metadata_indexed_at: string | null;
  revision_open_at: string | null;
  idc_assigned_at: string | null;
  transmitted_at: string | null;
  reviewed_at: string | null;
  commented_at: string | null;
  revised_at: string | null;
  approved_at: string | null;
  issued_for_construction_at: string | null;
  as_built_finalised_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  hold_at: string | null;
  resumed_at: string | null;
  signoff_at: string | null;
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
  // Decorated (LIVE 20-field battery)
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: IpdUrgency;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  floor_flag_count_live?: number;
  idc_status_live?: IdcStatus;
  document_completeness_index_live?: number;
  doc_health_band_live?: HealthBand;
  bridges_to_schedule_chain_live?: boolean;
  bridges_to_evm_chain_live?: boolean;
  bridges_to_procurement_chain_live?: boolean;
  bridges_to_cod_chain_live?: boolean;
  bridges_to_planned_outage_chain_live?: boolean;
}

interface KpiSummary {
  total: number;
  active_count: number;
  draft_count: number;
  indexed_count: number;
  idc_assigned_count: number;
  transmitted_count: number;
  review_phase_count: number;
  approved_count: number;
  ifc_count: number;
  as_built_count: number;
  archived_count: number;
  rejected_count: number;
  withdrawn_count: number;
  hold_count: number;
  safety_critical_count: number;
  breached: number;
  reportable_total: number;
  reached_ifc_count: number;
  hv_electrical_count: number;
  ifc_blocking_count: number;
  ccp_count: number;
  schedule_bridged_count: number;
  evm_bridged_count: number;
  procurement_bridged_count: number;
  cod_bridged_count: number;
  planned_outage_bridged_count: number;
  revisions_total: number;
  completeness_avg: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'draft_uploaded',
  'metadata_indexed',
  'revision_open',
  'IDC_assigned',
  'transmitted',
  'reviewed',
  'commented',
  'revised',
  'approved',
  'issued_for_construction',
  'as_built_finalised',
  'archived',
];

const BRANCH_STATES: readonly string[] = [
  'rejected',
  'withdrawn',
  'hold',
];

// ── filters ───────────────────────────────────────────────────────────────
// Row 1: action / lifecycle (priority filters)
const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',                  label: 'Active' },
  { key: 'all',                     label: 'All' },
  { key: 'reportable',              label: 'Reportable' },
  { key: 'breached',                label: 'SLA breached' },
  { key: 'transmitted',             label: 'In transit' },
  { key: 'reviewed',                label: 'Reviewed' },
  { key: 'commented',               label: 'Commented' },
  { key: 'revised',                 label: 'Revised' },
  { key: 'approved',                label: 'Approved' },
  { key: 'hv_electrical',           label: 'HV electrical' },
  { key: 'ifc_blocking',            label: 'IFC blocking' },
  { key: 'ccp',                     label: 'CCP' },
  { key: 'health_red',              label: 'Health red' },
  { key: 'health_critical',         label: 'Health critical' },
];

// Row 2: lifecycle stages + tiers
const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'draft_uploaded',          label: 'Draft' },
  { key: 'metadata_indexed',        label: 'Indexed' },
  { key: 'IDC_assigned',            label: 'IDC assigned' },
  { key: 'issued_for_construction', label: 'IFC' },
  { key: 'as_built_finalised',      label: 'As-built' },
  { key: 'archived',                label: 'Archived' },
  { key: 'rejected',                label: 'Rejected' },
  { key: 'withdrawn',               label: 'Withdrawn' },
  { key: 'hold',                    label: 'Hold' },
  { key: 'civil',                   label: 'Civil' },
  { key: 'mechanical',              label: 'Mechanical' },
  { key: 'electrical',              label: 'Electrical' },
  { key: 'safety_critical',         label: 'Safety-critical' },
];

// ── action helpers ────────────────────────────────────────────────────────
const CAN_OPEN_REVISION: ChainStatus[] = ['metadata_indexed', 'issued_for_construction', 'as_built_finalised'];
const CAN_HOLD: ChainStatus[] = ['transmitted', 'reviewed', 'commented', 'revised'];
const CAN_REJECT: ChainStatus[] = [
  'draft_uploaded', 'metadata_indexed', 'revision_open', 'IDC_assigned',
  'transmitted', 'reviewed', 'commented', 'revised', 'approved',
  'issued_for_construction', 'as_built_finalised', 'hold',
];
const CAN_WITHDRAW: ChainStatus[] = CAN_REJECT;

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

function getActions(row: IpdRow): ChainAction[] {
  const actions: ChainAction[] = [];

  // Primary forward action based on state
  if (row.chain_status === 'draft_uploaded') {
    actions.push({
      key: 'index-metadata',
      label: 'Index metadata (Doc Controller)',
      fields: [
        { key: 'document_class', label: 'Document class (civil / mechanical / electrical / safety_critical)', type: 'text', required: false, placeholder: row.document_class ?? '' },
        { key: 'iec_61355_code', label: 'IEC 61355 code (optional)', type: 'text', required: false, placeholder: row.iec_61355_code ?? '' },
        { key: 'drawing_title', label: 'Drawing title', type: 'text', required: false, placeholder: row.drawing_title ?? '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'metadata_indexed' || row.chain_status === 'revision_open') {
    actions.push({
      key: 'assign-idc',
      label: 'Assign IDC reviewer (Doc Controller)',
      fields: [
        { key: 'reviewer_name', label: 'Reviewer name', type: 'text', required: false, placeholder: row.reviewer_name ?? '' },
        { key: 'reviewer_party', label: 'Reviewer party (engineer_of_record / IE / SHEQ)', type: 'text', required: false, placeholder: row.reviewer_party ?? 'engineer_of_record' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'IDC_assigned') {
    actions.push({
      key: 'transmit',
      label: 'Transmit to reviewer (Doc Controller — anchors URGENT SLA)',
      fields: [
        { key: 'last_transmittal_number', label: 'Transmittal number (TM-YYYYNNNN). NOTE: anchors URGENT SLA clock.', type: 'text', required: false, placeholder: row.last_transmittal_number ?? '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'transmitted') {
    actions.push({
      key: 'start-review',
      label: 'Start review (Engineer of Record)',
      fields: [
        { key: 'notes', label: 'Review start note (Engineer of Record)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'reviewed') {
    actions.push({
      key: 'comment',
      label: 'Comment (Engineer of Record)',
      fields: [
        { key: 'comments_summary', label: 'Comments summary (required for audit)', type: 'textarea', required: true, placeholder: row.comments_summary ?? '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'commented') {
    actions.push({
      key: 'revise',
      label: 'Revise (Engineer of Record)',
      fields: [
        { key: 'current_revision', label: 'Revised revision (e.g. B)', type: 'text', required: false, placeholder: row.current_revision ?? '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'revised') {
    actions.push({
      key: 'approve',
      label: 'Approve (Engineer of Record — safety-critical crosses regulator when HV electrical OR CCP)',
      fields: [
        { key: 'approver_name', label: 'Approver name (Engineer of Record). NOTE: safety-critical crosses regulator when HV electrical OR commissioning critical path.', type: 'text', required: false, placeholder: row.approver_name ?? '' },
        { key: 'approver_party', label: 'Approver party (engineer_of_record / IPP_CEO)', type: 'text', required: false, placeholder: row.approver_party ?? 'engineer_of_record' },
      ],
      // crosses regulator for safety_critical when hv_electrical OR ccp — always include regulator in cascadeTo so ChainCard can handle conditional display
      cascadeTo: (row.current_tier === 'safety_critical' && (!!row.hv_electrical || !!row.commissioning_critical_path)) ? ['regulator'] : [],
    });
  } else if (row.chain_status === 'approved') {
    actions.push({
      key: 'issue-for-construction',
      label: 'Issue for construction (Engineer of Record — sticky reached_ifc marker)',
      fields: [
        { key: 'notes', label: 'IFC note (Engineer of Record — sticky reached_ifc marker, withdraw will cross regulator after IFC).', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'issued_for_construction') {
    actions.push({
      key: 'finalise-as-built',
      label: 'Finalise as-built (Engineer of Record)',
      fields: [
        { key: 'notes', label: 'As-built finalisation note (Engineer of Record)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'as_built_finalised') {
    actions.push({
      key: 'archive',
      label: 'Archive (Doc Controller — HARD terminal, never crosses regulator)',
      fields: [
        { key: 'notes', label: 'Archive note (Doc Controller — HARD terminal, never crosses regulator)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  } else if (row.chain_status === 'hold') {
    actions.push({
      key: 'resume',
      label: 'Resume from hold (Doc Controller)',
      fields: [
        { key: 'notes', label: 'Resume note (returns to reviewed)', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  // Open new revision — available on certain states
  if (CAN_OPEN_REVISION.includes(row.chain_status)) {
    actions.push({
      key: 'open-revision',
      label: 'Open new revision (Doc Controller)',
      fields: [
        { key: 'current_revision', label: 'New revision (e.g. B)', type: 'text', required: false, placeholder: row.current_revision ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // Hold — soft pause from review states
  if (CAN_HOLD.includes(row.chain_status)) {
    actions.push({
      key: 'hold',
      label: 'Hold (Doc Controller — soft pause from review states)',
      fields: [
        { key: 'hold_reason', label: 'Hold reason (soft pause; resume returns to reviewed)', type: 'textarea', required: true, placeholder: row.hold_reason ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // Reject — SIGNATURE: crosses regulator EVERY tier when safety_critical OR ifc_blocking
  if (CAN_REJECT.includes(row.chain_status)) {
    actions.push({
      key: 'reject',
      label: 'Reject (Engineer of Record — SIGNATURE DOCUMENT-REJECT-CRITICAL: crosses regulator EVERY tier when safety_critical OR ifc_blocking)',
      fields: [
        { key: 'reject_reason', label: 'Reject reason (required). NOTE: W114 SIGNATURE DOCUMENT-REJECT-CRITICAL — crosses regulator EVERY tier when safety_critical OR ifc_blocking flag set.', type: 'textarea', required: true, placeholder: row.reject_reason ?? '' },
      ],
      // crosses ALL tiers when safety_critical OR ifc_blocking (SIGNATURE hard line)
      cascadeTo: (row.current_tier === 'safety_critical' || !!row.ifc_blocking) ? ['regulator'] : [],
    });
  }

  // Withdraw — crosses regulator EVERY tier when issued_for_construction was reached
  if (CAN_WITHDRAW.includes(row.chain_status)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (IPP CEO — crosses regulator EVERY tier when issued_for_construction was reached)',
      fields: [
        { key: 'withdraw_reason', label: 'Withdraw reason (required). NOTE: crosses regulator EVERY tier when issued_for_construction was reached (post-IFC withdrawal = construction-record void).', type: 'textarea', required: true, placeholder: row.withdraw_reason ?? '' },
      ],
      cascadeTo: !!row.reached_ifc ? ['regulator'] : [],
    });
  }

  return actions;
}

function renderDetail(row: IpdRow): React.ReactNode {
  const completeness = row.document_completeness_index_live ?? row.document_completeness_index ?? 0;
  const idcLive = (row.idc_status_live ?? row.idc_status ?? 'open') as IdcStatus;
  const IDC_LABEL: Record<IdcStatus, string> = { open: 'Open', review: 'Review', approved: 'Approved', closed: 'Closed' };
  const TIER_LABEL: Record<IpdTier, string> = { civil: 'Civil', mechanical: 'Mechanical', electrical: 'Electrical', safety_critical: 'Safety-critical' };
  const HEALTH_LABEL: Record<HealthBand, string> = { green: 'Green', amber: 'Amber', red: 'Red', critical: 'Critical' };

  return (
    <div className="space-y-3 text-[11px]">
      {/* LIVE 20-field battery */}
      <div>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>LIVE battery (20 fields)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Current revision"        value={row.current_revision ?? '-'} />
          <DetailPair label="Revisions count"         value={String(row.revisions_count)} />
          <DetailPair label="IDC status (live)"       value={IDC_LABEL[idcLive]} />
          <DetailPair label="Document class"          value={row.document_class ?? '-'} />
          <DetailPair label="Tier (re-derived)"       value={TIER_LABEL[row.current_tier]} />
          <DetailPair label="Floor flags"             value={String(row.floor_flag_count_live ?? 0)} />
          <DetailPair label="Authority required"      value={row.authority_required_live ? row.authority_required_live.replace(/_/g, ' ') : '-'} />
          <DetailPair label="Completeness"            value={`${completeness} / 130`} />
          <DetailPair label="Health band"             value={row.doc_health_band_live ? HEALTH_LABEL[row.doc_health_band_live] : '-'} />
          <DetailPair label="Urgency"                 value={row.urgency_band_live ?? '-'} />
          <DetailPair label="SLA hours remaining"     value={fmtHoursSla(row.sla_hours_remaining_live)} />
          <DetailPair label="SLA window"              value={fmtHoursSla(row.sla_window_hours)} />
          <DetailPair label="Regulator filing window" value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
          <DetailPair label="Reached IFC"             value={row.reached_ifc ? 'YES' : 'no'} />
          <DetailPair label="Hash chain position"     value={String(row.hash_chain_position)} />
          <DetailPair label="Merkle segment (W118)"   value={(row.merkle_root_segment ?? '-').slice(0, 12) + '...'} />
          <DetailPair label="Last transmittal #"      value={row.last_transmittal_number ?? '-'} />
          <DetailPair label="Last transmittal at"     value={fmtDate(row.last_transmittal_at)} />
          <DetailPair label="Reviewer"                value={row.reviewer_name ?? '-'} />
          <DetailPair label="Approver"                value={row.approver_name ?? '-'} />
        </div>
      </div>

      {/* Drawing identity */}
      <div>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>Drawing identity (IEC 61355 + ISO 19650)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Drawing number"  value={row.drawing_number ?? '-'} />
          <DetailPair label="Drawing title"   value={row.drawing_title ?? '-'} />
          <DetailPair label="Discipline"      value={row.discipline ?? '-'} />
          <DetailPair label="Document type"   value={row.document_type ?? '-'} />
          <DetailPair label="Package code"    value={row.package_code ?? '-'} />
          <DetailPair label="IEC 61355 code"  value={row.iec_61355_code ?? '-'} />
          <DetailPair label="Project type"    value={row.project_type ?? '-'} />
          <DetailPair label="Project ID"      value={row.project_id} />
        </div>
      </div>

      {/* 5-bridge architecture */}
      <div>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>5-bridge architecture (W112 / W113 / W19 / W20 / W18)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="W112 schedule ref"      value={row.schedule_ref ?? '-'} />
          <DetailPair label="W113 EVM ref"           value={row.evm_ref ?? '-'} />
          <DetailPair label="W19 procurement ref"    value={row.procurement_ref ?? '-'} />
          <DetailPair label="W20 COD ref"            value={row.cod_ref ?? '-'} />
          <DetailPair label="W18 planned outage ref" value={row.planned_outage_ref ?? '-'} />
          <DetailPair label="Regulator inbox ref"    value={row.regulator_inbox_ref ?? '-'} />
          <DetailPair label="Regulator ref"          value={row.regulator_ref ?? '-'} />
          <DetailPair label="Last responder"         value={row.last_responder_party ?? '-'} />
        </div>
      </div>

      {/* Floor flags */}
      <div>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>Floor flags (5) — ANY one triggers FLOOR-AT-SAFETY-CRITICAL</div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { label: 'HV electrical',               on: !!row.hv_electrical },
              { label: 'Commissioning critical path',  on: !!row.commissioning_critical_path },
              { label: 'Safety sign-off required',     on: !!row.safety_signoff_required },
              { label: 'IFC blocking',                 on: !!row.ifc_blocking },
              { label: 'Regulatory submittal',         on: !!row.regulatory_submittal },
            ] as { label: string; on: boolean }[]
          ).map(({ label, on }) => (
            <span
              key={label}
              className="inline-block rounded px-2 py-0.5 font-medium text-[10px]"
              style={{ background: on ? 'oklch(0.97 0.04 20)' : BG2, color: on ? BAD : TX3 }}
            >
              {label}{on ? ' ✓' : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Reasons / narrative */}
      {(row.reject_reason || row.withdraw_reason || row.hold_reason || row.comments_summary || row.narrative) && (
        <div className="space-y-1.5">
          {row.reject_reason && (
            <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Reject reason</div>
              <div style={{ color: TX2 }}>{row.reject_reason}</div>
            </div>
          )}
          {row.withdraw_reason && (
            <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Withdraw reason</div>
              <div style={{ color: TX2 }}>{row.withdraw_reason}</div>
            </div>
          )}
          {row.hold_reason && (
            <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Hold reason</div>
              <div style={{ color: TX2 }}>{row.hold_reason}</div>
            </div>
          )}
          {row.comments_summary && (
            <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Comments summary</div>
              <div style={{ color: TX2 }}>{row.comments_summary}</div>
            </div>
          )}
          {row.narrative && (
            <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Narrative</div>
              <div style={{ color: TX2 }}>{row.narrative}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function IppDocumentControlChainTab() {
  const [rows, setRows] = useState<IpdRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IpdRow[] } & KpiSummary }>('/ipp/document-control/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          draft_count: data.draft_count || 0,
          indexed_count: data.indexed_count || 0,
          idc_assigned_count: data.idc_assigned_count || 0,
          transmitted_count: data.transmitted_count || 0,
          review_phase_count: data.review_phase_count || 0,
          approved_count: data.approved_count || 0,
          ifc_count: data.ifc_count || 0,
          as_built_count: data.as_built_count || 0,
          archived_count: data.archived_count || 0,
          rejected_count: data.rejected_count || 0,
          withdrawn_count: data.withdrawn_count || 0,
          hold_count: data.hold_count || 0,
          safety_critical_count: data.safety_critical_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          reached_ifc_count: data.reached_ifc_count || 0,
          hv_electrical_count: data.hv_electrical_count || 0,
          ifc_blocking_count: data.ifc_blocking_count || 0,
          ccp_count: data.ccp_count || 0,
          schedule_bridged_count: data.schedule_bridged_count || 0,
          evm_bridged_count: data.evm_bridged_count || 0,
          procurement_bridged_count: data.procurement_bridged_count || 0,
          cod_bridged_count: data.cod_bridged_count || 0,
          planned_outage_bridged_count: data.planned_outage_bridged_count || 0,
          revisions_total: data.revisions_total || 0,
          completeness_avg: data.completeness_avg || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load IPP Document Control chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ipp/document-control/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/document-control/chain/${rowId}`);
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
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/document-control/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !r.is_terminal;
      if (filter === 'reportable')      return r.is_reportable_flag;
      if (filter === 'breached')        return r.sla_breached_live;
      if (filter === 'hv_electrical')   return !!r.hv_electrical;
      if (filter === 'ifc_blocking')    return !!r.ifc_blocking;
      if (filter === 'ccp')             return !!r.commissioning_critical_path;
      if (filter === 'health_red')      return r.doc_health_band_live === 'red';
      if (filter === 'health_critical') return r.doc_health_band_live === 'critical';
      if (['civil', 'mechanical', 'electrical', 'safety_critical'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, active_count: 0, draft_count: 0, indexed_count: 0,
    idc_assigned_count: 0, transmitted_count: 0, review_phase_count: 0,
    approved_count: 0, ifc_count: 0, as_built_count: 0, archived_count: 0,
    rejected_count: 0, withdrawn_count: 0, hold_count: 0,
    safety_critical_count: 0, breached: 0, reportable_total: 0,
    reached_ifc_count: 0, hv_electrical_count: 0, ifc_blocking_count: 0,
    ccp_count: 0, schedule_bridged_count: 0, evm_bridged_count: 0,
    procurement_bridged_count: 0, cod_bridged_count: 0,
    planned_outage_bridged_count: 0, revisions_total: 0,
    completeness_avg: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          IPP Document Control &amp; Drawing Register — ISO 19650-1/2/3 + AECOOEM ED2-2024 + REIPPPP Schedule 2 + DMRE + IEC 61355 + FIDIC Silver Book §6
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state P6 drawing-control lifecycle: draft uploaded → metadata indexed → revision open → IDC assigned → transmitted → reviewed → commented → revised → approved →
          issued for construction → as-built finalised → archived, with rejected (terminal) / withdrawn (terminal) / hold (soft pause) branches.
          URGENT SLA on transmitted: safety_critical 24h, electrical 72h, mechanical 120h, civil 168h. FLOOR-AT-SAFETY-CRITICAL on any of 5 flags.
          SIGNATURE: reject crosses regulator EVERY tier when safety_critical OR ifc_blocking (W114 DOCUMENT-REJECT-CRITICAL hard line).
        </p>
      </header>

      {/* Primary 8-card KPI strip */}
      <div className="mb-3 grid grid-cols-2 md:grid-cols-8 gap-2">
        <KpiTile label="Active"          value={kpis.active_count}          tone={kpis.active_count > 0 ? 'warn' : undefined} />
        <KpiTile label="In transit"      value={kpis.transmitted_count}     tone={kpis.transmitted_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Review phase"    value={kpis.review_phase_count}    tone={kpis.review_phase_count > 0 ? 'warn' : undefined} />
        <KpiTile label="HV electrical"   value={kpis.hv_electrical_count}   tone={kpis.hv_electrical_count > 0 ? 'bad' : undefined} />
        <KpiTile label="IFC blocking"    value={kpis.ifc_blocking_count}    tone={kpis.ifc_blocking_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"    value={kpis.breached}              tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Safety-critical" value={kpis.safety_critical_count} tone={kpis.safety_critical_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Total"           value={kpis.total} />
      </div>

      {/* Sub-KPI bridge + portfolio totals strip */}
      <div className="mb-3 flex flex-wrap items-center gap-3" style={{ fontSize: 11, color: TX2 }}>
        <span>Reportable: <span style={{ fontWeight: 600, color: BAD }}>{kpis.reportable_total}</span></span>
        <span>Reached IFC: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.reached_ifc_count}</span></span>
        <span>Draft: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.draft_count}</span></span>
        <span>Indexed: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.indexed_count}</span></span>
        <span>IDC assigned: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.idc_assigned_count}</span></span>
        <span>Approved: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.approved_count}</span></span>
        <span>IFC: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.ifc_count}</span></span>
        <span>As-built: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.as_built_count}</span></span>
        <span>Archived: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.archived_count}</span></span>
        <span>Rejected: <span style={{ fontWeight: 600, color: BAD }}>{kpis.rejected_count}</span></span>
        <span>Withdrawn: <span style={{ fontWeight: 600, color: TX3 }}>{kpis.withdrawn_count}</span></span>
        <span>Hold: <span style={{ fontWeight: 600, color: WARN }}>{kpis.hold_count}</span></span>
        <span>CCP: <span style={{ fontWeight: 600, color: BAD }}>{kpis.ccp_count}</span></span>
        <span>Revisions: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.revisions_total}</span></span>
        <span>Completeness avg: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.completeness_avg}/130</span></span>
        <span>W112 (schedule): <span style={{ fontWeight: 600, color: TX1 }}>{kpis.schedule_bridged_count}</span></span>
        <span>W113 (EVM): <span style={{ fontWeight: 600, color: TX1 }}>{kpis.evm_bridged_count}</span></span>
        <span>W19 (procurement): <span style={{ fontWeight: 600, color: TX1 }}>{kpis.procurement_bridged_count}</span></span>
        <span>W20 (COD): <span style={{ fontWeight: 600, color: TX1 }}>{kpis.cod_bridged_count}</span></span>
        <span>W18 (planned outage): <span style={{ fontWeight: 600, color: TX1 }}>{kpis.planned_outage_bridged_count}</span></span>
      </div>

      {/* Row 1: action / lifecycle filter pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ACTION.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 2: lifecycle stages + tiers */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS_LIFECYCLE.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX3,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}
          >
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
          {filtered.map((row) => {
            const TIER_LABEL: Record<IpdTier, string> = { civil: 'Civil', mechanical: 'Mechanical', electrical: 'Electrical', safety_critical: 'Safety-critical' };
            const completeness = row.document_completeness_index_live ?? row.document_completeness_index ?? 0;
            const slaDisplay = row.sla_breached_live ? 'BREACHED' : fmtHoursSla(row.sla_hours_remaining_live);
            return (
              <ChainCard
                key={row.id}
                item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null, sla_breached: !!row.sla_breached }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.document_number}
                meta={[
                  `${row.project_name ?? row.project_id} ${fmtMw(row.project_capacity_mw)}`,
                  TIER_LABEL[row.current_tier],
                  row.drawing_number ? `Drawing: ${row.drawing_number}` : null,
                  row.current_revision ? `Rev ${row.current_revision}` : null,
                  `Completeness ${completeness}/130`,
                  `SLA ${slaDisplay}`,
                  row.hv_electrical ? 'HV' : null,
                  row.ifc_blocking ? 'IFC-BLK' : null,
                  row.commissioning_critical_path ? 'CCP' : null,
                  row.is_reportable_flag ? 'REG' : null,
                ].filter(Boolean).join(' · ')}
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No documents match.
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

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default IppDocumentControlChainTab;
