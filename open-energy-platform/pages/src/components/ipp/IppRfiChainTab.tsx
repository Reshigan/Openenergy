// Wave 116 — IPP RFI (Request For Information) Management chain (P6).
//
// 11th IPP-pure chain. FIFTH Phase-A IPP wave (sibling of W112 schedule,
// W113 EVM, W114 document control, W115 submittals). W112 owns the SCHEDULE;
// W113 owns the COST BOOK; W114 owns the DRAWING REGISTER; W115 owns the
// SUBMITTAL workflow; W116 owns the RFI LIFECYCLE — the rolling contractor →
// engineer → owner_rep question/answer loop where every information request
// can escalate through AIA G716 / FIDIC §1.3 notice channels and feed W117
// change orders downstream.
//
// Beats Procore RFIs / Aconex RFIs / Newforma RFIs / Autodesk Construction
// Cloud RFIs / e-Builder RFIs / Asite RFIs / SmartUse RFIs / Bluebeam Studio
// / Fieldwire RFIs / Bentley AssetWise RFIs.
//
// 12-state forward + 3 branches (rejected, void, escalated) on a P6
// RFI chain with URGENT SLA polarity (HOURS) anchored on submitted:
// emergency_safety 4h, construction_blocking 24h, coordination 72h,
// clarification 168h (higher RFI-criticality = TIGHTEST window).
// FLOOR-AT-EMERGENCY-SAFETY on ANY one of 5 contextual flags
// (safety_hazard_identified, construction_stoppage_in_effect,
// contractor_claim_basis, dispute_basis_referenced,
// regulatory_inquiry_triggered). 4-party split:
// contractor_PM / doc_controller / engineer / owner_rep.
// 20-field LIVE RFI battery. 6-bridge architecture: W114 doc-control,
// W115 submittals, W112 schedule, W113 EVM, W19 procurement, W20 COD.
//
// SIGNATURE Phase-A IPP regulator crossings:
//  * escalate crosses EVERY tier when safety_hazard_identified OR
//    regulatory_inquiry_triggered (W116 SIGNATURE SAFETY-RFI-ESCALATE hard line)
//  * reject crosses EVERY tier when contractor_claim_basis AND
//    cost_impact_zar ≥ R10m
//  * convert_to_change_order crosses construction_blocking +
//    emergency_safety only (W117 auto-link)
//  * link_to_dispute crosses EVERY tier when dispute_basis_referenced
//    AND (claim OR stoppage)
//  * close_out never crosses regulator
//  * SLA breach crosses emergency_safety + construction_blocking only
//
// Standards: CSI 01 31 19 + ISO 19650-2 §5.7 + FIDIC Silver §1.3 +
// AIA G716 + NEC4 §61 + REIPPPP technical-coordination protocol.

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

// ── types ────────────────────────────────────────────────────────────────
type ChainStatus =
  | 'question_drafted' | 'submitted' | 'triage' | 'assigned_to_responder'
  | 'research_in_progress' | 'response_drafted' | 'cross_discipline_review'
  | 'answer_returned' | 'clarification_requested' | 'closed_out' | 'archived'
  | 'rejected' | 'void' | 'escalated';

type IprTier = 'clarification' | 'coordination' | 'construction_blocking' | 'emergency_safety';
type IprUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'contractor_PM' | 'engineer' | 'owner_rep';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';

interface IprRow {
  [key: string]: unknown;
  id: string;
  rfi_number: string;
  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  document_control_ref: string | null;
  submittal_ref: string | null;
  schedule_ref: string | null;
  evm_ref: string | null;
  procurement_ref: string | null;
  cod_ref: string | null;
  linked_change_order_ref: string | null;
  rfi_class: string | null;
  rfi_type: string | null;
  discipline: string | null;
  package_code: string | null;
  drawing_number: string | null;
  spec_section: string | null;
  csi_section: string | null;
  contractor_name: string | null;
  question_short: string | null;
  question_long: string | null;
  proposed_answer: string | null;
  contractor_pm_name: string | null;
  doc_controller_name: string | null;
  responder_name: string | null;
  responder_party: string | null;
  owner_rep_name: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  safety_hazard_identified: number;
  construction_stoppage_in_effect: number;
  contractor_claim_basis: number;
  dispute_basis_referenced: number;
  regulatory_inquiry_triggered: number;
  stoppage_started_at: string | null;
  cost_impact_zar: number;
  schedule_impact_days: number;
  current_tier: IprTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  rfi_health_band: HealthBand | null;
  rfi_completeness_index: number;
  rfi_age_days: number;
  escalation_count: number;
  regulator_filing_window_hours: number;
  coordination_disciplines: string | null;
  comments_open: number;
  title: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  void_reason: string | null;
  escalation_reason: string | null;
  comments_summary: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  question_drafted_at: string | null;
  submitted_at: string | null;
  triage_at: string | null;
  assigned_to_responder_at: string | null;
  research_in_progress_at: string | null;
  response_drafted_at: string | null;
  cross_discipline_review_at: string | null;
  answer_returned_at: string | null;
  clarification_requested_at: string | null;
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
  urgency_band_live?: IprUrgency;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  floor_flag_count_live?: number;
  rfi_completeness_index_live?: number;
  rfi_health_band_live?: HealthBand;
  rfi_age_days_live?: number;
  days_construction_blocked_live?: number;
  bridges_to_document_control_chain_live?: boolean;
  bridges_to_submittal_chain_live?: boolean;
  bridges_to_schedule_chain_live?: boolean;
  bridges_to_evm_chain_live?: boolean;
  bridges_to_procurement_chain_live?: boolean;
  bridges_to_cod_chain_live?: boolean;
  has_change_order_link_live?: boolean;
}

interface KpiSummary {
  total: number;
  active_count: number;
  drafted_count: number;
  submitted_count: number;
  triage_count: number;
  assigned_count: number;
  research_count: number;
  answered_count: number;
  clarification_count: number;
  closed_out_count: number;
  archived_count: number;
  rejected_count: number;
  void_count: number;
  escalated_count: number;
  emergency_safety_count: number;
  breached: number;
  reportable_total: number;
  safety_count: number;
  stoppage_count: number;
  claim_count: number;
  dispute_count: number;
  regulatory_count: number;
  document_control_bridged_count: number;
  submittal_bridged_count: number;
  schedule_bridged_count: number;
  evm_bridged_count: number;
  procurement_bridged_count: number;
  cod_bridged_count: number;
  change_order_linked_count: number;
  completeness_avg: number;
  cost_impact_zar_total: number;
  schedule_impact_days_total: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'question_drafted',
  'submitted',
  'triage',
  'assigned_to_responder',
  'research_in_progress',
  'response_drafted',
  'cross_discipline_review',
  'answer_returned',
  'clarification_requested',
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
  { key: 'active',          label: 'Active' },
  { key: 'all',             label: 'All' },
  { key: 'reportable',      label: 'Reportable' },
  { key: 'breached',        label: 'SLA breached' },
  { key: 'submitted',       label: 'Submitted' },
  { key: 'research',        label: 'Research' },
  { key: 'answered',        label: 'Answered' },
  { key: 'clarification',   label: 'Clarification' },
  { key: 'safety',          label: 'Safety hazard' },
  { key: 'stoppage',        label: 'Stoppage' },
  { key: 'claim',           label: 'Claim basis' },
  { key: 'dispute',         label: 'Dispute' },
  { key: 'regulatory',      label: 'Regulatory' },
  { key: 'health_red',      label: 'Health red' },
  { key: 'health_critical', label: 'Health critical' },
];

// Row 2: lifecycle stages + tiers
const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'question_drafted',        label: 'Drafted' },
  { key: 'triage',                  label: 'Triage' },
  { key: 'assigned_to_responder',   label: 'Assigned' },
  { key: 'research_in_progress',    label: 'Research' },
  { key: 'response_drafted',        label: 'Response drafted' },
  { key: 'cross_discipline_review', label: 'Cross-disc' },
  { key: 'answer_returned',         label: 'Answered' },
  { key: 'clarification_requested', label: 'Clarification req' },
  { key: 'closed_out',              label: 'Closed' },
  { key: 'archived',                label: 'Archived' },
  { key: 'rejected',                label: 'Rejected' },
  { key: 'void',                    label: 'Void' },
  { key: 'escalated',               label: 'Escalated' },
  { key: 'clarification',           label: 'Tier: Clarification' },
  { key: 'coordination',            label: 'Tier: Coordination' },
  { key: 'construction_blocking',   label: 'Tier: Construction-blocking' },
  { key: 'emergency_safety',        label: 'Tier: Emergency-safety' },
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
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000)     return `R${(n / 1_000).toFixed(1)}k`;
  return `R${n.toFixed(0)}`;
}

// ── overflow action sets ──────────────────────────────────────────────────
const CAN_REQUEST_CLARIFICATION: ChainStatus[] = [
  'answer_returned', 'response_drafted', 'cross_discipline_review',
];
const CAN_CONVERT_TO_CHANGE_ORDER: ChainStatus[] = [
  'research_in_progress', 'response_drafted', 'cross_discipline_review', 'answer_returned',
];
const CAN_LINK_TO_DISPUTE: ChainStatus[] = [
  'submitted', 'triage', 'assigned_to_responder', 'research_in_progress',
  'response_drafted', 'cross_discipline_review', 'answer_returned',
  'clarification_requested', 'escalated',
];
const CAN_ESCALATE: ChainStatus[] = [
  'submitted', 'triage', 'assigned_to_responder', 'research_in_progress',
  'response_drafted', 'cross_discipline_review', 'answer_returned',
  'clarification_requested',
];
const CAN_REJECT: ChainStatus[] = [
  'question_drafted', 'submitted', 'triage', 'assigned_to_responder',
  'research_in_progress', 'response_drafted', 'cross_discipline_review',
  'answer_returned', 'clarification_requested', 'escalated',
];
const CAN_VOID: ChainStatus[] = [
  'question_drafted', 'submitted',
];

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: IprRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward action per state
  if (s === 'question_drafted') {
    actions.push({
      key: 'submit',
      label: 'Submit (Contractor PM — anchors URGENT SLA)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'rfi_class',
          label: 'RFI class (clarification / coordination / construction_blocking / emergency_safety)',
          type: 'text',
          required: false,
          placeholder: row.rfi_class ?? '',
        },
        {
          key: 'question_short',
          label: 'Question short (1-line summary)',
          type: 'text',
          required: false,
          placeholder: row.question_short ?? '',
        },
      ],
    });
  }

  if (s === 'submitted') {
    actions.push({
      key: 'triage',
      label: 'Triage (Doc Controller)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'doc_controller_name',
          label: 'Doc Controller name',
          type: 'text',
          required: false,
          placeholder: row.doc_controller_name ?? '',
        },
      ],
    });
  }

  if (s === 'triage') {
    actions.push({
      key: 'assign-responder',
      label: 'Assign responder (Doc Controller)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'responder_name',
          label: 'Responder name (Engineer)',
          type: 'text',
          required: false,
          placeholder: row.responder_name ?? '',
        },
        {
          key: 'responder_party',
          label: 'Responder party (engineer / IE / SHEQ)',
          type: 'text',
          required: false,
          placeholder: row.responder_party ?? 'engineer',
        },
      ],
    });
  }

  if (s === 'assigned_to_responder' || s === 'clarification_requested' || s === 'escalated') {
    actions.push({
      key: 'commence-research',
      label: 'Commence research (Engineer)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'notes',
          label: 'Research start note (Engineer)',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'research_in_progress') {
    actions.push({
      key: 'draft-response',
      label: 'Draft response (Engineer)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'proposed_answer',
          label: 'Proposed answer (drafted by responder)',
          type: 'textarea',
          required: true,
          placeholder: row.proposed_answer ?? '',
        },
      ],
    });
  }

  if (s === 'response_drafted') {
    actions.push({
      key: 'coordinate-review',
      label: 'Cross-discipline review (Engineer)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'coordination_disciplines',
          label: 'Coordination disciplines (comma-separated, e.g. civil,mechanical,electrical)',
          type: 'text',
          required: false,
          placeholder: row.coordination_disciplines ?? '',
        },
      ],
    });
  }

  if (s === 'cross_discipline_review') {
    actions.push({
      key: 'return-answer',
      label: 'Return answer (Engineer)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'comments_summary',
          label: 'Answer summary (returned to Contractor PM)',
          type: 'textarea',
          required: false,
          placeholder: row.comments_summary ?? '',
        },
      ],
    });
  }

  if (s === 'answer_returned') {
    actions.push({
      key: 'close-out',
      label: 'Close out (Owner Rep)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'owner_rep_name',
          label: 'Owner Rep name (closes out the RFI)',
          type: 'text',
          required: false,
          placeholder: row.owner_rep_name ?? '',
        },
      ],
    });
  }

  if (s === 'closed_out') {
    actions.push({
      key: 'archive',
      label: 'Archive (Owner Rep — HARD terminal)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'notes',
          label: 'Archive note (Owner Rep — HARD terminal, never crosses regulator)',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  // Overflow: request clarification (loops back to research)
  if (CAN_REQUEST_CLARIFICATION.includes(s)) {
    actions.push({
      key: 'request-clarification',
      label: 'Request clarification (Engineer — loops to research)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        {
          key: 'reason_code',
          label: 'Clarification request reason (loops back to research, +1 cycle)',
          type: 'textarea',
          required: true,
          placeholder: row.reason_code ?? '',
        },
      ],
    });
  }

  // Overflow: convert to change order — W117 link; construction_blocking + emergency_safety only
  if (CAN_CONVERT_TO_CHANGE_ORDER.includes(s)) {
    actions.push({
      key: 'convert-to-change-order',
      label: 'Convert to change order (Engineer — W117 link; construction_blocking + emergency_safety only)',
      tone: 'warn',
      // crosses construction_blocking + emergency_safety only (W117 auto-link)
      cascadeTo: (row.current_tier === 'construction_blocking' || row.current_tier === 'emergency_safety') ? ['regulator'] : [],
      fields: [
        {
          key: 'linked_change_order_ref',
          label: 'Linked Change-Order reference (W117 link). NOTE: construction_blocking + emergency_safety only.',
          type: 'text',
          required: true,
          placeholder: row.linked_change_order_ref ?? '',
        },
      ],
    });
  }

  // Overflow: link to dispute — crosses EVERY tier when dispute_basis_referenced AND (claim || stoppage)
  if (CAN_LINK_TO_DISPUTE.includes(s)) {
    const disputeCrosses = !!(row.dispute_basis_referenced && (row.contractor_claim_basis || row.construction_stoppage_in_effect));
    actions.push({
      key: 'link-to-dispute',
      label: 'Link to dispute (Contractor PM — crosses EVERY tier when dispute basis AND claim/stoppage)',
      tone: 'warn',
      cascadeTo: disputeCrosses ? ['regulator'] : [],
      fields: [
        {
          key: 'reason_code',
          label: 'Dispute basis (Contractor PM). NOTE: crosses regulator EVERY tier when dispute_basis_referenced AND (claim || stoppage).',
          type: 'textarea',
          required: true,
          placeholder: row.reason_code ?? '',
        },
      ],
    });
  }

  // Overflow: escalate — SIGNATURE: crosses regulator EVERY tier when safety_hazard_identified OR regulatory_inquiry_triggered
  if (CAN_ESCALATE.includes(s)) {
    const escalateCrosses = !!(row.safety_hazard_identified || row.regulatory_inquiry_triggered);
    actions.push({
      key: 'escalate',
      label: 'Escalate (Owner Rep — SIGNATURE SAFETY-RFI-ESCALATE: crosses regulator EVERY tier when safety hazard OR regulatory inquiry)',
      tone: 'warn',
      cascadeTo: escalateCrosses ? ['regulator'] : [],
      fields: [
        {
          key: 'escalation_reason',
          label: 'Escalation reason. NOTE: W116 SIGNATURE SAFETY-RFI-ESCALATE — crosses regulator EVERY tier when safety_hazard_identified OR regulatory_inquiry_triggered.',
          type: 'textarea',
          required: true,
          placeholder: row.escalation_reason ?? '',
        },
      ],
    });
  }

  // Overflow: reject — SIGNATURE: crosses regulator EVERY tier when contractor_claim_basis AND cost_impact_zar >= R10m
  if (CAN_REJECT.includes(s)) {
    const rejectCrosses = !!(row.contractor_claim_basis && row.cost_impact_zar >= 10_000_000);
    actions.push({
      key: 'reject',
      label: 'Reject (Owner Rep — SIGNATURE: crosses regulator EVERY tier when claim AND cost ≥ R10m)',
      tone: 'danger',
      cascadeTo: rejectCrosses ? ['regulator'] : [],
      fields: [
        {
          key: 'reject_reason',
          label: 'Reject reason (required). NOTE: W116 SIGNATURE — crosses regulator EVERY tier when contractor_claim_basis AND cost_impact_zar ≥ R10m.',
          type: 'textarea',
          required: true,
          placeholder: row.reject_reason ?? '',
        },
      ],
    });
  }

  // Overflow: void — issuer pull, pre-triage only
  if (CAN_VOID.includes(s)) {
    actions.push({
      key: 'void',
      label: 'Void (Contractor PM — issuer pull, pre-triage only)',
      tone: 'danger',
      cascadeTo: [],
      fields: [
        {
          key: 'void_reason',
          label: 'Void reason (issuer pull, pre-triage only)',
          type: 'textarea',
          required: true,
          placeholder: row.void_reason ?? '',
        },
      ],
    });
  }

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: IprRow): React.ReactNode {
  const completeness = row.rfi_completeness_index_live ?? row.rfi_completeness_index ?? 0;
  const ageDays = row.rfi_age_days_live ?? row.rfi_age_days ?? 0;

  return (
    <div className="space-y-3 text-[11px]">
      {/* LIVE 20-field battery */}
      <div>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>
          LIVE battery (20 fields, re-computed every fetch)
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
          <DetailPair label="Tier (re-derived)"       value={row.current_tier?.replace(/_/g, ' ') ?? '-'} />
          <DetailPair label="Floor flags"             value={String(row.floor_flag_count_live ?? 0)} />
          <DetailPair label="Authority required"      value={row.authority_required_live?.replace(/_/g, ' ') ?? '-'} />
          <DetailPair label="Completeness"            value={`${completeness} / 130`} />
          <DetailPair label="Health band"             value={row.rfi_health_band_live ?? '-'} />
          <DetailPair label="Urgency"                 value={row.urgency_band_live ?? '-'} />
          <DetailPair label="SLA hours remaining"     value={fmtHoursSla(row.sla_hours_remaining_live)} />
          <DetailPair label="SLA window"              value={fmtHoursSla(row.sla_window_hours)} />
          <DetailPair label="Regulator filing window" value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
          <DetailPair label="RFI age (live)"          value={`${ageDays}d`} />
          <DetailPair label="Days blocked"            value={`${row.days_construction_blocked_live ?? 0}d`} />
          <DetailPair label="Escalations"             value={String(row.escalation_count)} />
          <DetailPair label="Comments open"           value={String(row.comments_open)} />
          <DetailPair label="Cost impact"             value={fmtZar(row.cost_impact_zar)} />
          <DetailPair label="Schedule impact"         value={`${row.schedule_impact_days}d`} />
          <DetailPair label="Hash chain position"     value={String(row.hash_chain_position)} />
          <DetailPair label="Merkle segment (W118)"   value={(row.merkle_root_segment ?? '-').slice(0, 12) + '...'} />
          <DetailPair label="W117 CO link"            value={row.linked_change_order_ref ?? '-'} />
          <DetailPair label="Last responder"          value={row.last_responder_party ?? '-'} />
          <DetailPair label="Ball-in-court"           value={row.current_ball_in_court_party ?? '-'} />
        </div>
      </div>

      {/* RFI identity */}
      <div>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>
          RFI identity (CSI 01 31 19 + AIA G716 + ISO 19650-2 §5.7)
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
          <DetailPair label="RFI class"         value={row.rfi_class ?? '-'} />
          <DetailPair label="RFI type"          value={row.rfi_type ?? '-'} />
          <DetailPair label="Discipline"        value={row.discipline ?? '-'} />
          <DetailPair label="Package code"      value={row.package_code ?? '-'} />
          <DetailPair label="CSI section"       value={row.csi_section ?? '-'} />
          <DetailPair label="Spec section"      value={row.spec_section ?? '-'} />
          <DetailPair label="Drawing number"    value={row.drawing_number ?? '-'} />
          <DetailPair label="Contractor"        value={row.contractor_name ?? '-'} />
          <DetailPair label="Contractor PM"     value={row.contractor_pm_name ?? '-'} />
          <DetailPair label="Doc Controller"    value={row.doc_controller_name ?? '-'} />
          <DetailPair label="Responder"         value={row.responder_name ?? '-'} />
          <DetailPair label="Responder party"   value={row.responder_party ?? '-'} />
          <DetailPair label="Owner Rep"         value={row.owner_rep_name ?? '-'} />
          <DetailPair label="Coord disciplines" value={row.coordination_disciplines ?? '-'} />
        </div>
      </div>

      {/* Bridges */}
      <div>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>
          6-bridge architecture (W114 / W115 / W112 / W113 / W19 / W20)
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
          <DetailPair label="W114 doc-control ref" value={row.document_control_ref ?? '-'} />
          <DetailPair label="W115 submittal ref"   value={row.submittal_ref ?? '-'} />
          <DetailPair label="W112 schedule ref"    value={row.schedule_ref ?? '-'} />
          <DetailPair label="W113 EVM ref"         value={row.evm_ref ?? '-'} />
          <DetailPair label="W19 procurement ref"  value={row.procurement_ref ?? '-'} />
          <DetailPair label="W20 COD ref"          value={row.cod_ref ?? '-'} />
          <DetailPair label="W117 CO ref"          value={row.linked_change_order_ref ?? '-'} />
          <DetailPair label="Regulator inbox ref"  value={row.regulator_inbox_ref ?? '-'} />
          <DetailPair label="Regulator ref"        value={row.regulator_ref ?? '-'} />
          <DetailPair label="Stoppage started at"  value={fmtDate(row.stoppage_started_at)} />
        </div>
      </div>

      {/* Floor flags */}
      <div>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>
          Floor flags (5) — ANY one triggers FLOOR-AT-EMERGENCY-SAFETY
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: 'Safety hazard',          on: !!row.safety_hazard_identified },
            { label: 'Construction stoppage',  on: !!row.construction_stoppage_in_effect },
            { label: 'Contractor claim basis', on: !!row.contractor_claim_basis },
            { label: 'Dispute basis',          on: !!row.dispute_basis_referenced },
            { label: 'Regulatory inquiry',     on: !!row.regulatory_inquiry_triggered },
          ].map(f => (
            <span key={f.label}
              className="inline-block rounded px-2 py-0.5 font-medium"
              style={{ background: f.on ? 'oklch(0.97 0.04 20)' : BG2, color: f.on ? BAD : TX3, border: `1px solid ${f.on ? BAD : BORDER}` }}>
              {f.label}{f.on ? ' ✓' : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Question / answer */}
      {(row.question_short || row.question_long || row.proposed_answer) && (
        <div className="rounded border px-3 py-2 space-y-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: TX3 }}>Question / answer</div>
          {row.question_short && (
            <div><span className="font-semibold" style={{ color: TX2 }}>Short: </span><span style={{ color: TX1 }}>{row.question_short}</span></div>
          )}
          {row.question_long && (
            <div><span className="font-semibold" style={{ color: TX2 }}>Long: </span><span style={{ color: TX1 }}>{row.question_long}</span></div>
          )}
          {row.proposed_answer && (
            <div><span className="font-semibold" style={{ color: TX2 }}>Proposed answer: </span><span style={{ color: TX1 }}>{row.proposed_answer}</span></div>
          )}
        </div>
      )}

      {/* Reasons / narrative */}
      {(row.reject_reason || row.void_reason || row.escalation_reason || row.comments_summary || row.reason_code) && (
        <div className="rounded border px-3 py-2 space-y-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: TX3 }}>Reasons / narrative</div>
          {row.reason_code && (
            <div><span className="font-semibold" style={{ color: TX2 }}>Reason code: </span><span style={{ color: TX1 }}>{row.reason_code}</span></div>
          )}
          {row.reject_reason && (
            <div><span className="font-semibold" style={{ color: BAD }}>Reject reason: </span><span style={{ color: TX1 }}>{row.reject_reason}</span></div>
          )}
          {row.void_reason && (
            <div><span className="font-semibold" style={{ color: TX2 }}>Void reason: </span><span style={{ color: TX1 }}>{row.void_reason}</span></div>
          )}
          {row.escalation_reason && (
            <div><span className="font-semibold" style={{ color: WARN }}>Escalation reason: </span><span style={{ color: TX1 }}>{row.escalation_reason}</span></div>
          )}
          {row.comments_summary && (
            <div><span className="font-semibold" style={{ color: TX2 }}>Comments summary: </span><span style={{ color: TX1 }}>{row.comments_summary}</span></div>
          )}
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function IppRfiChainTab() {
  const [rows, setRows] = useState<IprRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IprRow[] } & KpiSummary }>('/ipp/rfis/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          drafted_count: data.drafted_count || 0,
          submitted_count: data.submitted_count || 0,
          triage_count: data.triage_count || 0,
          assigned_count: data.assigned_count || 0,
          research_count: data.research_count || 0,
          answered_count: data.answered_count || 0,
          clarification_count: data.clarification_count || 0,
          closed_out_count: data.closed_out_count || 0,
          archived_count: data.archived_count || 0,
          rejected_count: data.rejected_count || 0,
          void_count: data.void_count || 0,
          escalated_count: data.escalated_count || 0,
          emergency_safety_count: data.emergency_safety_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          safety_count: data.safety_count || 0,
          stoppage_count: data.stoppage_count || 0,
          claim_count: data.claim_count || 0,
          dispute_count: data.dispute_count || 0,
          regulatory_count: data.regulatory_count || 0,
          document_control_bridged_count: data.document_control_bridged_count || 0,
          submittal_bridged_count: data.submittal_bridged_count || 0,
          schedule_bridged_count: data.schedule_bridged_count || 0,
          evm_bridged_count: data.evm_bridged_count || 0,
          procurement_bridged_count: data.procurement_bridged_count || 0,
          cod_bridged_count: data.cod_bridged_count || 0,
          change_order_linked_count: data.change_order_linked_count || 0,
          completeness_avg: data.completeness_avg || 0,
          cost_impact_zar_total: data.cost_impact_zar_total || 0,
          schedule_impact_days_total: data.schedule_impact_days_total || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load IPP RFI chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ipp/rfis/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/rfis/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: IprRow; events: ChainEvent[] } }>(`/ipp/rfis/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !r.is_terminal;
      if (filter === 'reportable')      return r.is_reportable_flag;
      if (filter === 'breached')        return r.sla_breached_live;
      if (filter === 'research')        return (
        r.chain_status === 'research_in_progress' ||
        r.chain_status === 'response_drafted' ||
        r.chain_status === 'cross_discipline_review'
      );
      if (filter === 'answered')        return r.chain_status === 'answer_returned';
      if (filter === 'clarification')   return r.chain_status === 'clarification_requested';
      if (filter === 'safety')          return !!r.safety_hazard_identified;
      if (filter === 'stoppage')        return !!r.construction_stoppage_in_effect;
      if (filter === 'claim')           return !!r.contractor_claim_basis;
      if (filter === 'dispute')         return !!r.dispute_basis_referenced;
      if (filter === 'regulatory')      return !!r.regulatory_inquiry_triggered;
      if (filter === 'health_red')      return r.rfi_health_band_live === 'red';
      if (filter === 'health_critical') return r.rfi_health_band_live === 'critical';
      if (['clarification', 'coordination', 'construction_blocking', 'emergency_safety'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, active_count: 0, drafted_count: 0, submitted_count: 0,
    triage_count: 0, assigned_count: 0, research_count: 0, answered_count: 0,
    clarification_count: 0, closed_out_count: 0, archived_count: 0,
    rejected_count: 0, void_count: 0, escalated_count: 0,
    emergency_safety_count: 0, breached: 0, reportable_total: 0,
    safety_count: 0, stoppage_count: 0, claim_count: 0, dispute_count: 0,
    regulatory_count: 0, document_control_bridged_count: 0,
    submittal_bridged_count: 0, schedule_bridged_count: 0,
    evm_bridged_count: 0, procurement_bridged_count: 0, cod_bridged_count: 0,
    change_order_linked_count: 0, completeness_avg: 0,
    cost_impact_zar_total: 0, schedule_impact_days_total: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          IPP RFI Lifecycle — CSI 01 31 19 + ISO 19650-2 §5.7 + FIDIC Silver §1.3 + AIA G716 + NEC4 §61 + REIPPPP technical-coord
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state P6 RFI chain: question drafted → submitted → triage → assigned to responder → research → response drafted →
          cross-discipline review → answer returned → clarification requested (loops to research) → closed out → archived,
          with rejected (terminal) / void (terminal, pre-triage pull) / escalated (soft) branches.
          URGENT SLA polarity (HOURS) on submitted: emergency_safety 4h, construction_blocking 24h, coordination 72h, clarification 168h
          (higher RFI-criticality gets TIGHTEST window). FLOOR-AT-EMERGENCY-SAFETY on ANY one of 5 contextual flags.
          SIGNATURE: escalate crosses regulator EVERY tier when safety_hazard_identified OR regulatory_inquiry_triggered (W116 SAFETY-RFI-ESCALATE);
          reject crosses EVERY tier when contractor_claim_basis AND cost_impact_zar ≥ R10m; close_out never crosses regulator.
          4-party split: contractor_PM → doc_controller → engineer → owner_rep. 6 bridges: W114 / W115 / W112 / W113 / W19 / W20.
        </p>
      </header>

      {/* 8-card KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Active"           value={kpis.active_count}           tone={kpis.active_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Submitted"        value={kpis.submitted_count}        tone={kpis.submitted_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Research"         value={kpis.research_count}         tone={kpis.research_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Answered"         value={kpis.answered_count}         tone={kpis.answered_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Safety"           value={kpis.safety_count}           tone={kpis.safety_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"     value={kpis.breached}               tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Emergency safety" value={kpis.emergency_safety_count} tone={kpis.emergency_safety_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Total"            value={kpis.total} />
      </div>

      {/* Sub-KPI bridge + portfolio totals strip */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ fontSize: 11, color: TX2 }}>
        <span>Reportable: <span style={{ fontWeight: 600, color: BAD }}>{kpis.reportable_total}</span></span>
        <span>Drafted: <span style={{ fontWeight: 600 }}>{kpis.drafted_count}</span></span>
        <span>Triage: <span style={{ fontWeight: 600 }}>{kpis.triage_count}</span></span>
        <span>Assigned: <span style={{ fontWeight: 600 }}>{kpis.assigned_count}</span></span>
        <span>Clarification: <span style={{ fontWeight: 600, color: WARN }}>{kpis.clarification_count}</span></span>
        <span>Closed: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.closed_out_count}</span></span>
        <span>Archived: <span style={{ fontWeight: 600, color: GOOD }}>{kpis.archived_count}</span></span>
        <span>Rejected: <span style={{ fontWeight: 600, color: BAD }}>{kpis.rejected_count}</span></span>
        <span>Void: <span style={{ fontWeight: 600, color: TX3 }}>{kpis.void_count}</span></span>
        <span>Escalated: <span style={{ fontWeight: 600, color: BAD }}>{kpis.escalated_count}</span></span>
        <span>Stoppage: <span style={{ fontWeight: 600, color: BAD }}>{kpis.stoppage_count}</span></span>
        <span>Claim: <span style={{ fontWeight: 600, color: WARN }}>{kpis.claim_count}</span></span>
        <span>Dispute: <span style={{ fontWeight: 600, color: BAD }}>{kpis.dispute_count}</span></span>
        <span>Regulatory: <span style={{ fontWeight: 600, color: BAD }}>{kpis.regulatory_count}</span></span>
        <span>CO linked: <span style={{ fontWeight: 600 }}>{kpis.change_order_linked_count}</span></span>
        <span>Completeness avg: <span style={{ fontWeight: 600 }}>{kpis.completeness_avg}/130</span></span>
        <span>Cost impact: <span style={{ fontWeight: 600, color: BAD }}>{fmtZar(kpis.cost_impact_zar_total)}</span></span>
        <span>Sched days: <span style={{ fontWeight: 600, color: WARN }}>{kpis.schedule_impact_days_total}</span></span>
        <span>W114 (doc): <span style={{ fontWeight: 600 }}>{kpis.document_control_bridged_count}</span></span>
        <span>W115 (sub): <span style={{ fontWeight: 600 }}>{kpis.submittal_bridged_count}</span></span>
        <span>W112 (sch): <span style={{ fontWeight: 600 }}>{kpis.schedule_bridged_count}</span></span>
        <span>W113 (EVM): <span style={{ fontWeight: 600 }}>{kpis.evm_bridged_count}</span></span>
        <span>W19 (proc): <span style={{ fontWeight: 600 }}>{kpis.procurement_bridged_count}</span></span>
        <span>W20 (COD): <span style={{ fontWeight: 600 }}>{kpis.cod_bridged_count}</span></span>
      </div>

      {/* Row 1: action / lifecycle filter pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ACTION.map((f) => (
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

      {/* Row 2: lifecycle stages + tiers */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_LIFECYCLE.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX3,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
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
          {filtered.map((row) => {
            const ageDays = row.rfi_age_days_live ?? row.rfi_age_days ?? 0;
            const compl = row.rfi_completeness_index_live ?? row.rfi_completeness_index ?? 0;
            return (
              <ChainCard
                key={row.id}
                item={row as unknown as { id: string; chain_status: string; sla_deadline_at?: string | null; sla_breached?: boolean; escalation_level?: number; is_terminal?: boolean; [k: string]: unknown }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={`${row.rfi_number}${row.is_reportable_flag ? ' · REG' : ''}`}
                meta={
                  <span style={{ color: TX3 }}>
                    {row.project_name ?? row.project_id}
                    {' · '}
                    {fmtMw(row.project_capacity_mw)}
                    {' · '}
                    {row.current_tier?.replace(/_/g, ' ')}
                    {row.safety_hazard_identified ? ' · SFTY' : ''}
                    {row.construction_stoppage_in_effect ? ' · STOP' : ''}
                    {row.contractor_claim_basis ? ' · CLM' : ''}
                    {row.dispute_basis_referenced ? ' · DSP' : ''}
                    {row.regulatory_inquiry_triggered ? ' · REG' : ''}
                    {' · '}
                    {`Age ${ageDays}d`}
                    {' · '}
                    {`${compl}/130`}
                    {row.sla_breached_live ? ' · BREACHED' : fmtHoursSla(row.sla_hours_remaining_live) !== '-' ? ` · SLA ${fmtHoursSla(row.sla_hours_remaining_live)}` : ''}
                  </span>
                }
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
            <div className="rounded border px-4 py-6 text-center text-[12px]"
              style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No RFIs match.
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

export default IppRfiChainTab;
