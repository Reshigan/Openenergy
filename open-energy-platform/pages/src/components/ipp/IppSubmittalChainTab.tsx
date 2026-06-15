// Wave 115 — IPP Submittal / Transmittal Lifecycle chain (P6).
//
// 10th IPP chain. FOURTH Phase-A IPP wave (sibling of W112 schedule,
// W113 EVM, W114 document control). W112 owns the SCHEDULE; W113 owns
// the COST BOOK; W114 owns the DRAWING REGISTER; W115 owns the
// SUBMITTAL / TRANSMITTAL workflow — the rolling contractor → engineer
// → owner_rep delivery loop where every package can cycle through
// CSI 01 33 00 stamps A/B/C/D/E.
//
// Beats Procore Submittals / Aconex Workflows / Newforma Transmittals /
// Autodesk Construction Cloud Submittals / e-Builder Submittals / Asite
// Workflows / Oracle CCS Submittals / Coreworx EDMS / SmartUse Submittals.
//
// 12-state forward + 3 branches (rejected, void, escalated) on a P6
// submittal chain with URGENT SLA polarity (HOURS) anchored on submitted:
// critical_safety 24h, shop_drawing 168h, material_approval 240h,
// om_manual 480h (higher submittal-criticality = TIGHTEST window).
// FLOOR-AT-CRITICAL-SAFETY on ANY one of 5 flags (long_lead_item,
// commissioning_critical, regulatory_witness_required,
// lender_information_covenant, dispute_history). 3-step authority ladder:
// contractor_PM → engineer → owner_rep. 20-field LIVE submittal battery.
// 6-bridge architecture: W114 doc-control, W112 schedule, W113 EVM,
// W19 procurement, W23 insurance, W20 COD.
//
// SIGNATURE Phase-A IPP regulator crossings:
//  * stamp_return crosses EVERY tier when stamp_code='E' AND
//    (critical_safety OR commissioning_critical)
//    (W115 SIGNATURE STAMP-E-REJECT-CRITICAL hard line)
//  * reject crosses EVERY tier when long_lead_item AND cycle_count >= 3
//  * escalate crosses critical_safety + material_approval only when
//    regulatory_witness_required
//  * close_out never crosses regulator
//  * sla_breached crosses critical_safety + shop_drawing (heavy tiers)
//
// Standards: ISO 19650-2 §5.7 (information delivery workflows) +
// CSI 01 33 00 (Submittal Procedures — STAMPS A/B/C/D/E) +
// FIDIC Silver Book §6 (engineer review) + NEC4 §54 (contractor
// information) + REIPPPP Schedule 4 (submittal protocol) +
// DMRE EPC submittal requirements.

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
  | 'contractor_drafted' | 'package_assembled' | 'submitted' | 'screening'
  | 'assigned_to_reviewer' | 'under_review' | 'coordination_review'
  | 'response_drafted' | 'stamped_returned' | 'resubmission_requested'
  | 'closed_out' | 'archived'
  | 'rejected' | 'void' | 'escalated';

type IpsTier = 'om_manual' | 'material_approval' | 'shop_drawing' | 'critical_safety';
type IpsUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'contractor_PM' | 'engineer' | 'owner_rep';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type StampCode = 'A' | 'B' | 'C' | 'D' | 'E';

interface IpsRow {
  [key: string]: unknown;
  id: string;
  submittal_number: string;
  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  document_control_ref: string | null;
  schedule_ref: string | null;
  evm_ref: string | null;
  procurement_ref: string | null;
  insurance_ref: string | null;
  cod_ref: string | null;
  submittal_class: string | null;
  submittal_type: string | null;
  discipline: string | null;
  package_code: string | null;
  drawing_number: string | null;
  drawing_title: string | null;
  csi_section: string | null;
  contractor_name: string | null;
  supplier_name: string | null;
  stamp_code: StampCode | null;
  cycle_count: number;
  last_transmittal_number: string | null;
  last_transmittal_at: string | null;
  contractor_pm_name: string | null;
  doc_controller_name: string | null;
  reviewer_name: string | null;
  reviewer_party: string | null;
  owner_rep_name: string | null;
  long_lead_item: number;
  commissioning_critical: number;
  regulatory_witness_required: number;
  lender_information_covenant: number;
  dispute_history: number;
  long_lead_deadline_at: string | null;
  current_tier: IpsTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  submittal_health_band: HealthBand | null;
  submittal_completeness_index: number;
  regulatory_witness_window_hours: number;
  coordination_disciplines: string | null;
  comments_open: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  void_reason: string | null;
  escalation_reason: string | null;
  comments_summary: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  contractor_drafted_at: string | null;
  package_assembled_at: string | null;
  submitted_at: string | null;
  screening_at: string | null;
  assigned_to_reviewer_at: string | null;
  under_review_at: string | null;
  coordination_review_at: string | null;
  response_drafted_at: string | null;
  stamped_returned_at: string | null;
  resubmission_requested_at: string | null;
  closed_out_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  void_at: string | null;
  escalated_at: string | null;
  resumed_at: string | null;
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
  urgency_band_live?: IpsUrgency;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  regulatory_witness_window_hours_live?: number;
  floor_flag_count_live?: number;
  submittal_completeness_index_live?: number;
  submittal_health_band_live?: HealthBand;
  days_to_long_lead_deadline_live?: number | null;
  bridges_to_document_control_chain_live?: boolean;
  bridges_to_schedule_chain_live?: boolean;
  bridges_to_evm_chain_live?: boolean;
  bridges_to_procurement_chain_live?: boolean;
  bridges_to_insurance_chain_live?: boolean;
  bridges_to_cod_chain_live?: boolean;
}

interface IpsEvent {
  id: string;
  submittal_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  stamp_code: string | null;
  cycle_count: number | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiSummary {
  total: number;
  active_count: number;
  drafted_count: number;
  assembled_count: number;
  submitted_count: number;
  screening_count: number;
  assigned_count: number;
  review_phase_count: number;
  stamped_count: number;
  resub_count: number;
  closed_out_count: number;
  archived_count: number;
  rejected_count: number;
  void_count: number;
  escalated_count: number;
  critical_safety_count: number;
  breached: number;
  reportable_total: number;
  long_lead_count: number;
  ccp_count: number;
  witness_count: number;
  dispute_count: number;
  stamp_e_count: number;
  document_control_bridged_count: number;
  schedule_bridged_count: number;
  evm_bridged_count: number;
  procurement_bridged_count: number;
  insurance_bridged_count: number;
  cod_bridged_count: number;
  cycles_total: number;
  completeness_avg: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'contractor_drafted',
  'package_assembled',
  'submitted',
  'screening',
  'assigned_to_reviewer',
  'under_review',
  'coordination_review',
  'response_drafted',
  'stamped_returned',
  'resubmission_requested',
  'closed_out',
  'archived',
];
const BRANCH_STATES: readonly string[] = [
  'rejected',
  'void',
  'escalated',
];

// ── filters ───────────────────────────────────────────────────────────────
// Row 1: action / lifecycle pills (priority filters)
const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',           label: 'Active' },
  { key: 'all',              label: 'All' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'submitted',        label: 'Submitted' },
  { key: 'under_review',     label: 'Under review' },
  { key: 'stamped_returned', label: 'Stamped' },
  { key: 'stamp_e',          label: 'Stamp E' },
  { key: 'long_lead',        label: 'Long-lead' },
  { key: 'ccp',              label: 'CCP' },
  { key: 'witness',          label: 'Witness req' },
  { key: 'dispute',          label: 'Dispute' },
  { key: 'health_red',       label: 'Health red' },
  { key: 'health_critical',  label: 'Health critical' },
];

// Row 2: lifecycle stages + tiers
const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'contractor_drafted',     label: 'Draft' },
  { key: 'package_assembled',      label: 'Assembled' },
  { key: 'screening',              label: 'Screening' },
  { key: 'assigned_to_reviewer',   label: 'Assigned' },
  { key: 'coordination_review',    label: 'Coordination' },
  { key: 'response_drafted',       label: 'Response drafted' },
  { key: 'resubmission_requested', label: 'Resub' },
  { key: 'closed_out',             label: 'Closed' },
  { key: 'archived',               label: 'Archived' },
  { key: 'rejected',               label: 'Rejected' },
  { key: 'void',                   label: 'Void' },
  { key: 'escalated',              label: 'Escalated' },
  { key: 'om_manual',              label: 'O&M' },
  { key: 'material_approval',      label: 'Material' },
  { key: 'shop_drawing',           label: 'Shop drawing' },
  { key: 'critical_safety',        label: 'Critical safety' },
];

// ── action helpers ────────────────────────────────────────────────────────
// Overflow action eligibility sets
const CAN_REQUEST_RESUB: ChainStatus[] = ['response_drafted', 'stamped_returned', 'under_review', 'coordination_review'];
const CAN_APPROVE_WITH_COMMENTS: ChainStatus[] = ['response_drafted', 'under_review', 'coordination_review'];
const CAN_ESCALATE: ChainStatus[] = [
  'screening', 'assigned_to_reviewer', 'under_review',
  'coordination_review', 'response_drafted', 'stamped_returned',
  'resubmission_requested',
];
const CAN_REJECT: ChainStatus[] = [
  'contractor_drafted', 'package_assembled', 'submitted', 'screening',
  'assigned_to_reviewer', 'under_review', 'coordination_review',
  'response_drafted', 'stamped_returned', 'resubmission_requested',
  'escalated',
];
const CAN_VOID: ChainStatus[] = [
  'contractor_drafted', 'package_assembled', 'submitted', 'screening',
];

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

function getActions(row: IpsRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward action per state
  if (s === 'contractor_drafted' || s === 'resubmission_requested') {
    actions.push({
      key: 'assemble-package',
      label: 'Assemble package (Contractor PM)',
      fields: [
        {
          key: 'submittal_class',
          label: 'Submittal class (om_manual / material_approval / shop_drawing / critical_safety)',
          type: 'text',
          required: false,
          placeholder: String(row.submittal_class ?? ''),
        },
        {
          key: 'title',
          label: 'Title / package description',
          type: 'text',
          required: false,
          placeholder: String(row.title ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'package_assembled') {
    actions.push({
      key: 'submit',
      label: 'Submit (Contractor PM — anchors URGENT SLA)',
      fields: [
        {
          key: 'last_transmittal_number',
          label: 'Transmittal number (TM-YYYYNNNN). NOTE: anchors URGENT SLA clock.',
          type: 'text',
          required: false,
          placeholder: String(row.last_transmittal_number ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'submitted') {
    actions.push({
      key: 'screen',
      label: 'Screen (Doc Controller)',
      fields: [
        {
          key: 'doc_controller_name',
          label: 'Doc Controller name',
          type: 'text',
          required: false,
          placeholder: String(row.doc_controller_name ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'screening') {
    actions.push({
      key: 'assign-reviewer',
      label: 'Assign reviewer (Doc Controller)',
      fields: [
        {
          key: 'reviewer_name',
          label: 'Reviewer name',
          type: 'text',
          required: false,
          placeholder: String(row.reviewer_name ?? ''),
        },
        {
          key: 'reviewer_party',
          label: 'Reviewer party (engineer / IE / SHEQ)',
          type: 'text',
          required: false,
          placeholder: String(row.reviewer_party ?? 'engineer'),
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'assigned_to_reviewer') {
    actions.push({
      key: 'commence-review',
      label: 'Commence review (Engineer)',
      fields: [
        {
          key: 'notes',
          label: 'Review start note (Engineer)',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'under_review') {
    actions.push({
      key: 'coordinate-review',
      label: 'Coordination review (Engineer)',
      fields: [
        {
          key: 'coordination_disciplines',
          label: 'Coordination disciplines (comma-separated, e.g. civil,mechanical,electrical)',
          type: 'text',
          required: false,
          placeholder: String(row.coordination_disciplines ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'coordination_review') {
    actions.push({
      key: 'draft-response',
      label: 'Draft response (Engineer)',
      fields: [
        {
          key: 'comments_summary',
          label: 'Comments summary (required for audit)',
          type: 'textarea',
          required: true,
          placeholder: String(row.comments_summary ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'response_drafted') {
    actions.push({
      key: 'stamp-return',
      label: 'Stamp return (Engineer — SIGNATURE: stamp E crosses regulator EVERY tier when critical_safety OR CCP)',
      fields: [
        {
          key: 'stamp_code',
          label: 'Stamp code (A / B / C / D / E). NOTE: SIGNATURE — E crosses regulator EVERY tier when critical_safety OR commissioning_critical.',
          type: 'text',
          required: true,
          placeholder: 'B',
        },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'stamped_returned' || s === 'escalated') {
    actions.push({
      key: 'close-out',
      label: 'Close out (Owner Rep)',
      fields: [
        {
          key: 'owner_rep_name',
          label: 'Owner Rep name (closes out the submittal)',
          type: 'text',
          required: false,
          placeholder: String(row.owner_rep_name ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'closed_out') {
    actions.push({
      key: 'archive',
      label: 'Archive (Owner Rep — HARD terminal)',
      fields: [
        {
          key: 'notes',
          label: 'Archive note (Owner Rep — HARD terminal, never crosses regulator)',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  // Overflow: approve-with-comments
  if (CAN_APPROVE_WITH_COMMENTS.includes(s)) {
    actions.push({
      key: 'approve-with-comments',
      label: 'Approve with comments (Engineer — stamp B default)',
      fields: [
        {
          key: 'comments_summary',
          label: 'Approval comments summary (stamp B default)',
          type: 'textarea',
          required: false,
          placeholder: String(row.comments_summary ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  // Overflow: request-resubmission
  if (CAN_REQUEST_RESUB.includes(s)) {
    actions.push({
      key: 'request-resubmission',
      label: 'Request resubmission (Engineer — loops back to assemble_package, +cycle)',
      fields: [
        {
          key: 'reason_code',
          label: 'Resubmission reason (required, +1 cycle, loops to assemble_package)',
          type: 'textarea',
          required: true,
          placeholder: String(row.reason_code ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  // Overflow: escalate
  if (CAN_ESCALATE.includes(s)) {
    actions.push({
      key: 'escalate',
      label: 'Escalate (Owner Rep — soft; crosses regulator on critical_safety + material_approval when witness required)',
      fields: [
        {
          key: 'escalation_reason',
          label: 'Escalation reason. NOTE: crosses regulator on critical_safety + material_approval when regulatory_witness_required.',
          type: 'textarea',
          required: true,
          placeholder: String(row.escalation_reason ?? ''),
        },
      ],
      cascadeTo: ['regulator'],
    });
  }

  // Overflow: reject
  if (CAN_REJECT.includes(s)) {
    actions.push({
      key: 'reject',
      label: 'Reject (Owner Rep — SIGNATURE: stamp E; crosses regulator EVERY tier when long_lead AND cycles ≥ 3)',
      fields: [
        {
          key: 'reject_reason',
          label: 'Reject reason (required). NOTE: SIGNATURE STAMP-E — crosses regulator EVERY tier when long_lead_item AND cycle_count ≥ 3.',
          type: 'textarea',
          required: true,
          placeholder: String(row.reject_reason ?? ''),
        },
      ],
      cascadeTo: ['regulator'],
    });
  }

  // Overflow: void
  if (CAN_VOID.includes(s)) {
    actions.push({
      key: 'void',
      label: 'Void (Contractor PM — issuer pull, pre-assignment only)',
      fields: [
        {
          key: 'void_reason',
          label: 'Void reason (issuer pull, pre-assignment only)',
          type: 'textarea',
          required: true,
          placeholder: String(row.void_reason ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

function renderDetail(row: IpsRow): React.ReactNode {
  const completeness = row.submittal_completeness_index_live ?? row.submittal_completeness_index ?? 0;
  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      {/* LIVE 20-field battery */}
      <div style={{ fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
        LIVE battery (20 fields, re-computed every fetch)
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-4">
        <DetailPair label="Stamp code" value={row.stamp_code ?? '-'} />
        <DetailPair label="Cycle count" value={String(row.cycle_count)} />
        <DetailPair label="Tier (re-derived)" value={row.current_tier.replace(/_/g, ' ')} />
        <DetailPair label="Floor flags" value={String(row.floor_flag_count_live ?? 0)} />
        <DetailPair label="Authority required" value={(row.authority_required_live ?? '-').replace(/_/g, ' ')} />
        <DetailPair label="Completeness" value={`${completeness} / 130`} />
        <DetailPair label="Health band" value={row.submittal_health_band_live ?? '-'} />
        <DetailPair label="Urgency" value={row.urgency_band_live ?? '-'} />
        <DetailPair label="SLA hours remaining" value={fmtHoursSla(row.sla_hours_remaining_live)} />
        <DetailPair label="SLA window" value={fmtHoursSla(row.sla_window_hours)} />
        <DetailPair label="Regulator filing window" value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
        <DetailPair label="Witness window" value={fmtHoursSla(row.regulatory_witness_window_hours_live)} />
        <DetailPair label="Days to long-lead" value={row.days_to_long_lead_deadline_live !== null && row.days_to_long_lead_deadline_live !== undefined ? `${row.days_to_long_lead_deadline_live}d` : '-'} />
        <DetailPair label="Comments open" value={String(row.comments_open)} />
        <DetailPair label="Hash chain position" value={String(row.hash_chain_position)} />
        <DetailPair label="Merkle segment" value={(row.merkle_root_segment ?? '-').slice(0, 12) + '...'} />
        <DetailPair label="Last transmittal #" value={row.last_transmittal_number ?? '-'} />
        <DetailPair label="Last transmittal at" value={fmtDate(row.last_transmittal_at)} />
        <DetailPair label="Reviewer" value={row.reviewer_name ?? '-'} />
        <DetailPair label="Owner Rep" value={row.owner_rep_name ?? '-'} />
      </div>

      {/* Submittal identity */}
      <div style={{ fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
        Submittal identity (CSI 01 33 00 + ISO 19650-2 §5.7)
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-4">
        <DetailPair label="Submittal class" value={row.submittal_class ?? '-'} />
        <DetailPair label="Submittal type" value={row.submittal_type ?? '-'} />
        <DetailPair label="Discipline" value={row.discipline ?? '-'} />
        <DetailPair label="Package code" value={row.package_code ?? '-'} />
        <DetailPair label="CSI section" value={row.csi_section ?? '-'} />
        <DetailPair label="Drawing number" value={row.drawing_number ?? '-'} />
        <DetailPair label="Drawing title" value={row.drawing_title ?? '-'} />
        <DetailPair label="Contractor" value={row.contractor_name ?? '-'} />
        <DetailPair label="Supplier" value={row.supplier_name ?? '-'} />
        <DetailPair label="Contractor PM" value={row.contractor_pm_name ?? '-'} />
        <DetailPair label="Doc Controller" value={row.doc_controller_name ?? '-'} />
        <DetailPair label="Reviewer party" value={row.reviewer_party ?? '-'} />
        <DetailPair label="Coord disciplines" value={row.coordination_disciplines ?? '-'} />
        <DetailPair label="Long-lead deadline" value={fmtDate(row.long_lead_deadline_at)} />
      </div>

      {/* 6-bridge architecture */}
      <div style={{ fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>
        6-bridge architecture (doc-control / schedule / EVM / procurement / insurance / COD)
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-4">
        <DetailPair label="Doc-control ref" value={row.document_control_ref ?? '-'} />
        <DetailPair label="Schedule ref" value={row.schedule_ref ?? '-'} />
        <DetailPair label="EVM ref" value={row.evm_ref ?? '-'} />
        <DetailPair label="Procurement ref" value={row.procurement_ref ?? '-'} />
        <DetailPair label="Insurance ref" value={row.insurance_ref ?? '-'} />
        <DetailPair label="COD ref" value={row.cod_ref ?? '-'} />
        <DetailPair label="Regulator inbox ref" value={row.regulator_inbox_ref ?? '-'} />
        <DetailPair label="Regulator ref" value={row.regulator_ref ?? '-'} />
        <DetailPair label="Last responder" value={row.last_responder_party ?? '-'} />
        <DetailPair label="Ball-in-court" value={row.current_ball_in_court_party ?? '-'} />
      </div>

      {/* Floor flags */}
      <div style={{ fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>
        Floor flags (5) — ANY one triggers FLOOR-AT-CRITICAL-SAFETY
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {[
          { label: 'Long-lead item', on: !!row.long_lead_item },
          { label: 'Commissioning critical', on: !!row.commissioning_critical },
          { label: 'Regulatory witness required', on: !!row.regulatory_witness_required },
          { label: 'Lender information covenant', on: !!row.lender_information_covenant },
          { label: 'Dispute history', on: !!row.dispute_history },
        ].map(({ label, on }) => (
          <span key={label} style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
            background: on ? 'oklch(0.93 0.08 20)' : BG2,
            color: on ? BAD : TX3,
          }}>
            {label}{on ? ' ✓' : ''}
          </span>
        ))}
      </div>

      {/* Reasons / narrative */}
      {(row.reject_reason || row.void_reason || row.escalation_reason || row.comments_summary || row.narrative || row.reason_code) && (
        <>
          <div style={{ fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>
            Reasons / narrative
          </div>
          <div className="space-y-1.5">
            {row.reason_code && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Reason code</div>
                <div style={{ color: TX2 }}>{row.reason_code}</div>
              </div>
            )}
            {row.reject_reason && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Reject reason</div>
                <div style={{ color: TX2 }}>{row.reject_reason}</div>
              </div>
            )}
            {row.void_reason && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Void reason</div>
                <div style={{ color: TX2 }}>{row.void_reason}</div>
              </div>
            )}
            {row.escalation_reason && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Escalation reason</div>
                <div style={{ color: TX2 }}>{row.escalation_reason}</div>
              </div>
            )}
            {row.comments_summary && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Comments summary</div>
                <div style={{ color: TX2 }}>{row.comments_summary}</div>
              </div>
            )}
            {row.narrative && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Narrative</div>
                <div style={{ color: TX2 }}>{row.narrative}</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function IppSubmittalChainTab() {
  const [rows, setRows] = useState<IpsRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IpsRow[] } & KpiSummary }>('/ipp/submittals/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          drafted_count: data.drafted_count || 0,
          assembled_count: data.assembled_count || 0,
          submitted_count: data.submitted_count || 0,
          screening_count: data.screening_count || 0,
          assigned_count: data.assigned_count || 0,
          review_phase_count: data.review_phase_count || 0,
          stamped_count: data.stamped_count || 0,
          resub_count: data.resub_count || 0,
          closed_out_count: data.closed_out_count || 0,
          archived_count: data.archived_count || 0,
          rejected_count: data.rejected_count || 0,
          void_count: data.void_count || 0,
          escalated_count: data.escalated_count || 0,
          critical_safety_count: data.critical_safety_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          long_lead_count: data.long_lead_count || 0,
          ccp_count: data.ccp_count || 0,
          witness_count: data.witness_count || 0,
          dispute_count: data.dispute_count || 0,
          stamp_e_count: data.stamp_e_count || 0,
          document_control_bridged_count: data.document_control_bridged_count || 0,
          schedule_bridged_count: data.schedule_bridged_count || 0,
          evm_bridged_count: data.evm_bridged_count || 0,
          procurement_bridged_count: data.procurement_bridged_count || 0,
          insurance_bridged_count: data.insurance_bridged_count || 0,
          cod_bridged_count: data.cod_bridged_count || 0,
          cycles_total: data.cycles_total || 0,
          completeness_avg: data.completeness_avg || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load IPP Submittal chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ipp/submittals/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/submittals/chain/${rowId}`);
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
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/submittals/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !r.is_terminal;
      if (filter === 'reportable')      return r.is_reportable_flag;
      if (filter === 'breached')        return r.sla_breached_live;
      if (filter === 'stamp_e')         return r.stamp_code === 'E';
      if (filter === 'long_lead')       return !!r.long_lead_item;
      if (filter === 'ccp')             return !!r.commissioning_critical;
      if (filter === 'witness')         return !!r.regulatory_witness_required;
      if (filter === 'dispute')         return !!r.dispute_history;
      if (filter === 'health_red')      return r.submittal_health_band_live === 'red';
      if (filter === 'health_critical') return r.submittal_health_band_live === 'critical';
      if (['om_manual', 'material_approval', 'shop_drawing', 'critical_safety'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, active_count: 0, drafted_count: 0, assembled_count: 0,
    submitted_count: 0, screening_count: 0, assigned_count: 0,
    review_phase_count: 0, stamped_count: 0, resub_count: 0,
    closed_out_count: 0, archived_count: 0, rejected_count: 0,
    void_count: 0, escalated_count: 0, critical_safety_count: 0,
    breached: 0, reportable_total: 0, long_lead_count: 0, ccp_count: 0,
    witness_count: 0, dispute_count: 0, stamp_e_count: 0,
    document_control_bridged_count: 0, schedule_bridged_count: 0,
    evm_bridged_count: 0, procurement_bridged_count: 0,
    insurance_bridged_count: 0, cod_bridged_count: 0,
    cycles_total: 0, completeness_avg: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          IPP Submittal &amp; Transmittal Lifecycle — ISO 19650-2 §5.7 + CSI 01 33 00 (stamps A/B/C/D/E) + FIDIC Silver Book §6 + NEC4 §54 + REIPPPP Schedule 4 + DMRE
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state P6 submittal chain: contractor drafted → package assembled → submitted → screening → assigned to reviewer → under review →
          coordination review → response drafted → stamped returned → resubmission (loops to assemble) → closed out → archived,
          with rejected (terminal, stamp E) / void (terminal, issuer pull) / escalated (soft) branches.
          URGENT SLA polarity (HOURS) on submitted: critical_safety 24h, shop_drawing 168h, material_approval 240h, om_manual 480h.
          FLOOR-AT-CRITICAL-SAFETY on ANY one of 5 flags. SIGNATURE: stamp_return crosses regulator EVERY tier when stamp_code=E AND (critical_safety OR CCP).
        </p>
      </header>

      {/* 8-card KPI strip */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <KpiTile label="Active"          value={kpis.active_count}          tone={kpis.active_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Submitted"       value={kpis.submitted_count}       tone={kpis.submitted_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Review phase"    value={kpis.review_phase_count}    tone={kpis.review_phase_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Stamp E"         value={kpis.stamp_e_count}         tone={kpis.stamp_e_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Long-lead"       value={kpis.long_lead_count}       tone={kpis.long_lead_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="SLA breached"    value={kpis.breached}              tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Critical safety" value={kpis.critical_safety_count} tone={kpis.critical_safety_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Total"           value={kpis.total} />
      </div>

      {/* Sub-KPI bridge + portfolio totals strip */}
      <div className="mb-3 flex flex-wrap items-center gap-4" style={{ fontSize: 11, color: TX2 }}>
        <span>Reportable: <span style={{ fontWeight: 600, color: BAD }}>{kpis.reportable_total}</span></span>
        <span>Drafted: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.drafted_count}</span></span>
        <span>Assembled: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.assembled_count}</span></span>
        <span>Screening: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.screening_count}</span></span>
        <span>Assigned: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.assigned_count}</span></span>
        <span>Stamped: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.stamped_count}</span></span>
        <span>Resub: <span style={{ fontWeight: 600, color: WARN }}>{kpis.resub_count}</span></span>
        <span>Closed: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.closed_out_count}</span></span>
        <span>Archived: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.archived_count}</span></span>
        <span>Rejected: <span style={{ fontWeight: 600, color: BAD }}>{kpis.rejected_count}</span></span>
        <span>Void: <span style={{ fontWeight: 600, color: TX3 }}>{kpis.void_count}</span></span>
        <span>Escalated: <span style={{ fontWeight: 600, color: BAD }}>{kpis.escalated_count}</span></span>
        <span>CCP: <span style={{ fontWeight: 600, color: WARN }}>{kpis.ccp_count}</span></span>
        <span>Witness: <span style={{ fontWeight: 600, color: WARN }}>{kpis.witness_count}</span></span>
        <span>Dispute: <span style={{ fontWeight: 600, color: BAD }}>{kpis.dispute_count}</span></span>
        <span>Cycles total: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.cycles_total}</span></span>
        <span>Completeness avg: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.completeness_avg}/130</span></span>
        <span>Doc control: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.document_control_bridged_count}</span></span>
        <span>Schedule: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.schedule_bridged_count}</span></span>
        <span>EVM: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.evm_bridged_count}</span></span>
        <span>Procurement: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.procurement_bridged_count}</span></span>
        <span>Insurance: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.insurance_bridged_count}</span></span>
        <span>COD: <span style={{ fontWeight: 600, color: TX1 }}>{kpis.cod_bridged_count}</span></span>
      </div>

      {/* Row 1: action / lifecycle pills */}
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
      <div className="mb-3 flex flex-wrap gap-1.5">
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
            const completeness = row.submittal_completeness_index_live ?? row.submittal_completeness_index ?? 0;
            const flags: string[] = [];
            if (row.long_lead_item) flags.push('LLI');
            if (row.commissioning_critical) flags.push('CCP');
            if (row.regulatory_witness_required) flags.push('WIT');
            if (row.lender_information_covenant) flags.push('LIC');
            if (row.dispute_history) flags.push('DSP');
            if (row.is_reportable_flag) flags.push('REG');
            if (row.cycle_count >= 3) flags.push('CYC≥3');

            return (
              <ChainCard
                key={row.id}
                item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={`${row.submittal_number}${row.title ? ` — ${row.title}` : row.drawing_title ? ` — ${row.drawing_title}` : ''}`}
                meta={[
                  row.current_tier.replace(/_/g, ' '),
                  row.project_name ?? row.project_id,
                  fmtMw(row.project_capacity_mw),
                  flags.length > 0 ? flags.join(' ') : null,
                  row.stamp_code ? `Stamp ${row.stamp_code}` : null,
                  row.sla_breached_live ? 'BREACHED' : fmtHoursSla(row.sla_hours_remaining_live),
                  `${completeness}/130`,
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
              No submittals match.
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

export default IppSubmittalChainTab;
