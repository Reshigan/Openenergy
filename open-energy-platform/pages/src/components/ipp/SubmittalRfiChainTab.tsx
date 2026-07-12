// Wave 96 — IPP Submittal Log & RFI Register tab.
//
// The construction-document review pipeline for a best-in-class IPP-PM stack.
// Beats Procore submittal log + ball-in-court, Aconex transmittals + spec
// coverage, Newforma RFI, Asite document control, Kahua e-Builder and
// Primavera Submittal Exchange via:
//   - 13-state P6 lifecycle (drafted → submitted → distributed → under_review
//     → clarification_requested → responded → approved → distributed_for_
//     construction → incorporated → closed_clean) + the revision loop
//     (returned_for_revision → revised → distributed) + void/withdraw
//     exception terminals
//   - tier RE-DERIVED on every transition from priority × workflow × the
//     four coverage flags (grid_code / life_safety / bid_envelope /
//     holds_construction) with FLOOR-AT-HIGH on those flags
//   - URGENT SLA polarity — critical RFI must turn in hours not weeks
//     (construction is time-money)
//   - ball-in-court tracking + authority tiering (construction_coordinator
//     → lead_engineer → project_manager → project_director)
//   - LIVE battery decoration on every fetch: minutes_until_sla,
//     ipp_pm_quality_index (0-130 vs Procore=100 baseline),
//     days_in_court, predicted_close_date_live, urgency_band
//   - SIGNATURE regulator crossings: approve EVERY tier when grid_code OR
//     bid_envelope; void EVERY tier when grid_code OR life_safety;
//     distribute_for_construction high+critical with grid_code;
//     return_for_revision high+critical with grid_code; sla_breached
//     high+critical with grid_code OR holds_construction.

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
  | 'drafted' | 'submitted' | 'distributed' | 'under_review'
  | 'clarification_requested' | 'responded' | 'approved'
  | 'returned_for_revision' | 'revised' | 'distributed_for_construction'
  | 'incorporated' | 'closed_clean' | 'voided' | 'withdrawn';

type Tier = 'critical' | 'high' | 'standard' | 'low';

type WorkflowClass =
  | 'submittal_design' | 'submittal_product_data' | 'submittal_mockup'
  | 'submittal_om_manuals' | 'rfi_design_clarification' | 'rfi_field_condition'
  | 'rfi_substitution_request' | 'rfi_change_in_scope';

interface SubmittalRow {
  [key: string]: unknown;
  id: string;
  submittal_rfi_number: string;
  project_id: string;
  project_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  contractor_name: string | null;
  designer_name: string | null;
  vendor_name: string | null;
  owner_party_name: string | null;
  workflow_class: WorkflowClass;
  priority_class: 'critical' | 'high' | 'standard' | 'low';
  document_type: string | null;
  spec_section: string | null;
  csi_division: string | null;
  csi_section_code: string | null;
  uniclass_code: string | null;
  sans_section: string | null;
  transmittal_number: string | null;
  sequence_number: number | null;
  current_tier: Tier;
  authority_required: string | null;
  affects_grid_code: number;
  affects_life_safety: number;
  affects_bid_envelope: number;
  holds_construction: number;
  requires_designer_response: number;
  requires_ie_review: number;
  requires_owner_review: number;
  clarification_count: number;
  revision_count: number;
  rejection_count: number;
  response_count: number;
  bid_envelope_drift_pct: number | null;
  grid_code_clauses_affected: number;
  estimated_cost_impact_zar: number | null;
  estimated_schedule_impact_days: number | null;
  parent_submittal_id: string | null;
  superseded_by_id: string | null;
  parent_rfi_id: string | null;
  drawing_ref: string | null;
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
  drafted_at: string;
  submitted_at: string | null;
  distributed_at: string | null;
  under_review_at: string | null;
  clarification_requested_at: string | null;
  responded_at: string | null;
  approved_at: string | null;
  returned_for_revision_at: string | null;
  revised_at: string | null;
  distributed_for_construction_at: string | null;
  incorporated_at: string | null;
  closed_clean_at: string | null;
  voided_at: string | null;
  withdrawn_at: string | null;
  construction_hold_started_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  response_due_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // decorated
  is_terminal: boolean;
  minutes_until_sla: number | null;
  minutes_until_response_sla: number | null;
  sla_breached: boolean;
  response_sla_breached: boolean;
  sla_window_minutes: number;
  response_window_minutes: number;
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
  supersede_chain_depth_live: number;
}

interface KpiSummary {
  total: number;
  open_count: number;
  closed_clean_count: number;
  voided_count: number;
  withdrawn_count: number;
  distributed_for_construction_count: number;
  incorporated_count: number;
  returned_for_revision_count: number;
  breached: number;
  response_breached_count: number;
  reportable_total: number;
  signature_count: number;
  grid_code_count: number;
  bid_envelope_count: number;
  life_safety_count: number;
  construction_hold_count: number;
  avg_quality_index: number;
  avg_days_in_court: number;
  total_estimated_cost_impact_zar: number;
  total_estimated_schedule_impact_days: number;
  max_bid_envelope_drift_pct: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'drafted',
  'submitted',
  'distributed',
  'under_review',
  'clarification_requested',
  'responded',
  'approved',
  'distributed_for_construction',
  'incorporated',
  'closed_clean',
];
const BRANCH_STATES: readonly string[] = [
  'returned_for_revision',
  'revised',
  'voided',
  'withdrawn',
];

const AUTHORITY_LABEL: Record<string, string> = {
  construction_coordinator: 'Construction coordinator',
  lead_engineer:            'Lead engineer',
  project_manager:          'Project manager',
  project_director:         'Project director',
};

const WORKFLOW_LABEL: Record<WorkflowClass, string> = {
  submittal_design:          'Design submittal',
  submittal_product_data:    'Product-data submittal',
  submittal_mockup:          'Mock-up submittal',
  submittal_om_manuals:      'O&M manuals',
  rfi_design_clarification:  'RFI · design clarification',
  rfi_field_condition:       'RFI · field condition',
  rfi_substitution_request:  'RFI · substitution request',
  rfi_change_in_scope:       'RFI · change in scope',
};

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                         label: 'Open' },
  { key: 'all',                          label: 'All' },
  { key: 'critical',                     label: 'Critical' },
  { key: 'high',                         label: 'High' },
  { key: 'standard',                     label: 'Standard' },
  { key: 'low',                          label: 'Low' },
  { key: 'under_review',                 label: 'Under review' },
  { key: 'clarification_requested',      label: 'Awaiting clarification' },
  { key: 'returned_for_revision',        label: 'Returned' },
  { key: 'distributed_for_construction', label: 'For construction' },
  { key: 'incorporated',                 label: 'Incorporated' },
  { key: 'closed_clean',                 label: 'Closed clean' },
  { key: 'breached',                     label: 'SLA breached' },
  { key: 'reportable',                   label: 'Reportable' },
  { key: 'signature',                    label: 'Signature flagged' },
  { key: 'grid_code',                    label: 'Grid-code' },
];

const TERMINAL_STATES: ChainStatus[] = ['closed_clean', 'voided', 'withdrawn'];

// ── helpers ───────────────────────────────────────────────────────────────
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
function getActions(row: SubmittalRow): ChainAction[] {
  const actions: ChainAction[] = [];

  // Primary action per state
  switch (row.chain_status) {
    case 'drafted':
      actions.push({
        key: 'submit',
        label: 'Submit (author)',
        fields: [
          { key: 'title',     label: 'Submittal/RFI title',                                   type: 'text',     required: false, placeholder: row.title ?? '' },
          { key: 'narrative', label: 'Narrative — design intent, RFI question, or scope',      type: 'textarea', required: true },
        ],
        cascadeTo: [],
      });
      break;
    case 'submitted':
      actions.push({
        key: 'distribute',
        label: 'Distribute (coordinator)',
        fields: [
          { key: 'transmittal_number', label: 'Transmittal reference', type: 'text', required: false, placeholder: '' },
        ],
        cascadeTo: [],
      });
      break;
    case 'distributed':
      actions.push({
        key: 'start-review',
        label: 'Start review (reviewer)',
        fields: [
          { key: 'last_responder_party', label: 'Reviewer party', type: 'text', required: false, placeholder: 'reviewer' },
        ],
        cascadeTo: [],
      });
      break;
    case 'under_review':
      actions.push({
        key: 'respond',
        label: 'Respond (designer)',
        fields: [
          { key: 'response_text', label: 'Designer response', type: 'textarea', required: true },
        ],
        cascadeTo: [],
      });
      break;
    case 'clarification_requested':
      actions.push({
        key: 'provide-clarification',
        label: 'Provide clarification (author)',
        fields: [
          { key: 'response_text', label: 'Clarification reply (author)', type: 'textarea', required: true },
        ],
        cascadeTo: [],
      });
      break;
    case 'responded':
      actions.push({
        key: 'approve',
        label: 'Approve (reviewer)',
        // approve crosses regulator EVERY tier when grid_code OR bid_envelope (SIGNATURE)
        fields: [
          { key: 'regulator_ref', label: 'Approval / regulator reference (NERSA C-1 / REIPPPP IPPO) — crosses regulator when grid_code OR bid_envelope', type: 'text', required: false, placeholder: '' },
        ],
        cascadeTo: (row.affects_grid_code || row.affects_bid_envelope) ? ['regulator'] : [],
      });
      break;
    case 'approved':
      actions.push({
        key: 'distribute-for-construction',
        label: 'Release for construction (coordinator)',
        // crosses regulator high+critical with grid_code
        fields: [
          { key: 'regulator_ref', label: 'Construction release reference (high+critical grid-code releases cross regulator)', type: 'text', required: false, placeholder: '' },
        ],
        cascadeTo: (row.affects_grid_code && (row.current_tier === 'high' || row.current_tier === 'critical')) ? ['regulator'] : [],
      });
      break;
    case 'returned_for_revision':
      actions.push({
        key: 'resubmit',
        label: 'Resubmit (author)',
        fields: [
          { key: 'narrative', label: 'Resubmission note — what changed', type: 'textarea', required: true },
        ],
        cascadeTo: [],
      });
      break;
    case 'revised':
      actions.push({
        key: 'distribute',
        label: 'Distribute (coordinator)',
        fields: [
          { key: 'transmittal_number', label: 'Transmittal reference', type: 'text', required: false, placeholder: '' },
        ],
        cascadeTo: [],
      });
      break;
    case 'distributed_for_construction':
      actions.push({
        key: 'incorporate',
        label: 'Incorporate / as-built (contractor)',
        fields: [
          { key: 'regulator_ref', label: 'As-built reference — incorporated into approved-for-construction set', type: 'text', required: false, placeholder: '' },
        ],
        cascadeTo: [],
      });
      break;
    case 'incorporated':
      actions.push({
        key: 'close',
        label: 'Close clean (coordinator)',
        fields: [
          { key: 'notes', label: 'Closure note (optional)', type: 'textarea', required: false, placeholder: '' },
        ],
        cascadeTo: [],
      });
      break;
    default:
      break;
  }

  // Secondary actions per state
  const secondaryMap: Partial<Record<ChainStatus, ChainAction[]>> = {
    drafted: [
      {
        key: 'withdraw',
        label: 'Withdraw (author)',
        tone: 'danger',
        fields: [{ key: 'withdrawn_reason', label: 'Withdrawal reason', type: 'textarea', required: true }],
        cascadeTo: [],
      },
    ],
    submitted: [
      {
        key: 'withdraw',
        label: 'Withdraw (author)',
        tone: 'danger',
        fields: [{ key: 'withdrawn_reason', label: 'Withdrawal reason', type: 'textarea', required: true }],
        cascadeTo: [],
      },
      {
        key: 'void',
        label: 'Void (owner)',
        tone: 'danger',
        // void crosses regulator EVERY tier when grid_code OR life_safety (SIGNATURE)
        fields: [{ key: 'voided_reason', label: 'Void reason — voiding with grid_code OR life_safety crosses regulator EVERY tier', type: 'textarea', required: true }],
        cascadeTo: (row.affects_grid_code || row.affects_life_safety) ? ['regulator'] : [],
      },
    ],
    distributed: [
      {
        key: 'void',
        label: 'Void (owner)',
        tone: 'danger',
        fields: [{ key: 'voided_reason', label: 'Void reason — voiding with grid_code OR life_safety crosses regulator EVERY tier', type: 'textarea', required: true }],
        cascadeTo: (row.affects_grid_code || row.affects_life_safety) ? ['regulator'] : [],
      },
      {
        key: 'withdraw',
        label: 'Withdraw (author)',
        tone: 'danger',
        fields: [{ key: 'withdrawn_reason', label: 'Withdrawal reason', type: 'textarea', required: true }],
        cascadeTo: [],
      },
    ],
    under_review: [
      {
        key: 'request-clarification',
        label: 'Request clarification (reviewer)',
        tone: 'warn',
        fields: [{ key: 'narrative', label: 'Clarification question', type: 'textarea', required: true }],
        cascadeTo: [],
      },
      {
        key: 'return-for-revision',
        label: 'Return for revision (reviewer)',
        tone: 'warn',
        // return_for_revision crosses regulator high+critical with grid_code
        fields: [{ key: 'narrative', label: 'Reason for revision', type: 'textarea', required: true }],
        cascadeTo: (row.affects_grid_code && (row.current_tier === 'high' || row.current_tier === 'critical')) ? ['regulator'] : [],
      },
      {
        key: 'void',
        label: 'Void (owner)',
        tone: 'danger',
        fields: [{ key: 'voided_reason', label: 'Void reason — voiding with grid_code OR life_safety crosses regulator EVERY tier', type: 'textarea', required: true }],
        cascadeTo: (row.affects_grid_code || row.affects_life_safety) ? ['regulator'] : [],
      },
    ],
    clarification_requested: [
      {
        key: 'withdraw',
        label: 'Withdraw (author)',
        tone: 'danger',
        fields: [{ key: 'withdrawn_reason', label: 'Withdrawal reason', type: 'textarea', required: true }],
        cascadeTo: [],
      },
      {
        key: 'void',
        label: 'Void (owner)',
        tone: 'danger',
        fields: [{ key: 'voided_reason', label: 'Void reason — voiding with grid_code OR life_safety crosses regulator EVERY tier', type: 'textarea', required: true }],
        cascadeTo: (row.affects_grid_code || row.affects_life_safety) ? ['regulator'] : [],
      },
    ],
    responded: [
      {
        key: 'return-for-revision',
        label: 'Return for revision (reviewer)',
        tone: 'warn',
        fields: [{ key: 'narrative', label: 'Reason for revision', type: 'textarea', required: true }],
        cascadeTo: (row.affects_grid_code && (row.current_tier === 'high' || row.current_tier === 'critical')) ? ['regulator'] : [],
      },
      {
        key: 'void',
        label: 'Void (owner)',
        tone: 'danger',
        fields: [{ key: 'voided_reason', label: 'Void reason — voiding with grid_code OR life_safety crosses regulator EVERY tier', type: 'textarea', required: true }],
        cascadeTo: (row.affects_grid_code || row.affects_life_safety) ? ['regulator'] : [],
      },
    ],
    approved: [
      {
        key: 'void',
        label: 'Void (owner)',
        tone: 'danger',
        fields: [{ key: 'voided_reason', label: 'Void reason — voiding with grid_code OR life_safety crosses regulator EVERY tier', type: 'textarea', required: true }],
        cascadeTo: (row.affects_grid_code || row.affects_life_safety) ? ['regulator'] : [],
      },
    ],
    returned_for_revision: [
      {
        key: 'withdraw',
        label: 'Withdraw (author)',
        tone: 'danger',
        fields: [{ key: 'withdrawn_reason', label: 'Withdrawal reason', type: 'textarea', required: true }],
        cascadeTo: [],
      },
      {
        key: 'void',
        label: 'Void (owner)',
        tone: 'danger',
        fields: [{ key: 'voided_reason', label: 'Void reason — voiding with grid_code OR life_safety crosses regulator EVERY tier', type: 'textarea', required: true }],
        cascadeTo: (row.affects_grid_code || row.affects_life_safety) ? ['regulator'] : [],
      },
    ],
    revised: [
      {
        key: 'void',
        label: 'Void (owner)',
        tone: 'danger',
        fields: [{ key: 'voided_reason', label: 'Void reason — voiding with grid_code OR life_safety crosses regulator EVERY tier', type: 'textarea', required: true }],
        cascadeTo: (row.affects_grid_code || row.affects_life_safety) ? ['regulator'] : [],
      },
    ],
    distributed_for_construction: [
      {
        key: 'void',
        label: 'Void (owner)',
        tone: 'danger',
        fields: [{ key: 'voided_reason', label: 'Void reason — voiding with grid_code OR life_safety crosses regulator EVERY tier', type: 'textarea', required: true }],
        cascadeTo: (row.affects_grid_code || row.affects_life_safety) ? ['regulator'] : [],
      },
    ],
  };

  const secondaries = secondaryMap[row.chain_status] ?? [];
  for (const s of secondaries) {
    actions.push(s);
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: SubmittalRow): React.ReactNode {
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');

  return (
    <div style={{ fontSize: 11 }}>
      {/* Live IPP-PM battery */}
      <div className="mb-3 rounded border px-3 py-2" style={{ background: BG2, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>Live IPP-PM battery</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Quality index (0-130, Procore=100)" value={fmtNum(row.ipp_pm_quality_index_live, 0)} />
          <DetailPair label="Days open" value={String(row.days_open_live ?? 0)} />
          <DetailPair label="Days in court" value={String(row.days_in_court_live ?? 0)} />
          <DetailPair label="Ball in court" value={row.ball_in_court_party_live ?? '—'} />
          <DetailPair label="Tier (live, re-derived)" value={row.tier_live} />
          <DetailPair label="Urgency band" value={row.urgency_band} />
          <DetailPair label="Predicted close" value={fmtDate(row.predicted_close_date_live)} />
          <DetailPair label="Authority required" value={authority} />
        </div>
      </div>

      {/* Coverage flags */}
      <div className="mb-3 rounded border px-3 py-2" style={{ background: BG2, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>Coverage flags (FLOOR-AT-HIGH)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Grid code (NERSA C-1/C-3)" value={row.affects_grid_code ? 'Yes' : 'No'} />
          <DetailPair label="Life safety" value={row.affects_life_safety ? 'Yes' : 'No'} />
          <DetailPair label="Bid envelope (REIPPPP)" value={row.affects_bid_envelope ? 'Yes' : 'No'} />
          <DetailPair label="Holds construction" value={row.holds_construction ? 'Yes' : 'No'} />
          <DetailPair label="Grid-code clauses affected" value={String(row.grid_code_clauses_affected ?? 0)} />
          <DetailPair label="Bid drift" value={row.bid_envelope_drift_pct != null ? `${fmtNum(row.bid_envelope_drift_pct, 2)}%` : '—'} />
          <DetailPair label="Est. cost impact" value={fmtZar(row.estimated_cost_impact_zar)} />
          <DetailPair label="Est. schedule impact" value={row.estimated_schedule_impact_days != null ? `${row.estimated_schedule_impact_days}d` : '—'} />
        </div>
      </div>

      {/* Core fields */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2">
        <DetailPair label="State" value={row.chain_status} />
        <DetailPair label="Workflow class" value={WORKFLOW_LABEL[row.workflow_class]} />
        <DetailPair label="Priority" value={row.priority_class} />
        <DetailPair label="Document type" value={row.document_type ?? '—'} />
        <DetailPair label="CSI section" value={row.csi_section_code ?? '—'} />
        <DetailPair label="Spec section" value={row.spec_section ?? '—'} />
        <DetailPair label="Uniclass code" value={row.uniclass_code ?? '—'} />
        <DetailPair label="SANS section" value={row.sans_section ?? '—'} />
        <DetailPair label="Transmittal #" value={row.transmittal_number ?? '—'} />
        <DetailPair label="Sequence #" value={row.sequence_number != null ? String(row.sequence_number) : '—'} />
        <DetailPair label="Contractor" value={row.contractor_name ?? '—'} />
        <DetailPair label="Designer" value={row.designer_name ?? '—'} />
        <DetailPair label="Vendor" value={row.vendor_name ?? '—'} />
        <DetailPair label="Owner" value={row.owner_party_name ?? '—'} />
        <DetailPair label="Last responder" value={row.last_responder_party ?? '—'} />
        <DetailPair label="Requester" value={row.requester_party ?? '—'} />
        <DetailPair label="Approver" value={row.approver_party ?? '—'} />
        <DetailPair label="Drawing ref" value={row.drawing_ref ?? '—'} />
        <DetailPair label="Regulator ref" value={row.regulator_ref ?? '—'} />
        <DetailPair label="Clarifications" value={String(row.clarification_count ?? 0)} />
        <DetailPair label="Revisions" value={String(row.revision_count ?? 0)} />
        <DetailPair label="Rejections" value={String(row.rejection_count ?? 0)} />
        <DetailPair label="Responses" value={String(row.response_count ?? 0)} />
        <DetailPair label="Drafted" value={fmtDate(row.drafted_at)} />
        <DetailPair label="Submitted" value={fmtDate(row.submitted_at)} />
        <DetailPair label="Distributed" value={fmtDate(row.distributed_at)} />
        <DetailPair label="Under review" value={fmtDate(row.under_review_at)} />
        <DetailPair label="Responded" value={fmtDate(row.responded_at)} />
        <DetailPair label="Approved" value={fmtDate(row.approved_at)} />
        <DetailPair label="For construction" value={fmtDate(row.distributed_for_construction_at)} />
        <DetailPair label="Incorporated" value={fmtDate(row.incorporated_at)} />
        <DetailPair label="Closed clean" value={fmtDate(row.closed_clean_at)} />
        <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="Response due" value={fmtDate(row.response_due_at)} />
        <DetailPair label="SLA" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Response SLA" value={row.is_terminal ? '—' : row.response_sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_response_sla)} />
        <DetailPair label="Escalation level" value={String(row.escalation_level)} />
        <DetailPair label="Reportable" value={row.is_reportable_flag ? 'Yes' : 'No'} />
      </div>

      {row.narrative && (
        <div className="mt-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Narrative</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.narrative}</div>
        </div>
      )}
      {row.response_text && (
        <div className="mt-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Response</div>
          <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{row.response_text}</div>
        </div>
      )}
      {row.voided_reason && (
        <div className="mt-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Voided reason</div>
          <div className="whitespace-pre-wrap" style={{ color: BAD }}>{row.voided_reason}</div>
        </div>
      )}
      {row.withdrawn_reason && (
        <div className="mt-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>Withdrawn reason</div>
          <div className="whitespace-pre-wrap" style={{ color: WARN }}>{row.withdrawn_reason}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function SubmittalRfiChainTab() {
  const [rows, setRows] = useState<SubmittalRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: SubmittalRow[] } & KpiSummary }>('/ipp/submittal-rfi/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total,
          open_count: d.open_count,
          closed_clean_count: d.closed_clean_count,
          voided_count: d.voided_count,
          withdrawn_count: d.withdrawn_count,
          distributed_for_construction_count: d.distributed_for_construction_count,
          incorporated_count: d.incorporated_count,
          returned_for_revision_count: d.returned_for_revision_count,
          breached: d.breached,
          response_breached_count: d.response_breached_count,
          reportable_total: d.reportable_total,
          signature_count: d.signature_count,
          grid_code_count: d.grid_code_count,
          bid_envelope_count: d.bid_envelope_count,
          life_safety_count: d.life_safety_count,
          construction_hold_count: d.construction_hold_count,
          avg_quality_index: d.avg_quality_index,
          avg_days_in_court: d.avg_days_in_court,
          total_estimated_cost_impact_zar: d.total_estimated_cost_impact_zar,
          total_estimated_schedule_impact_days: d.total_estimated_schedule_impact_days,
          max_bid_envelope_drift_pct: d.max_bid_envelope_drift_pct,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load submittal/RFI register');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    // For return-for-revision we also set reason_code
    const body: Record<string, unknown> = { ...values };
    if (key === 'return-for-revision') body.reason_code = 'returned';
    if (key === 'approve') body.approver_party = 'reviewer';
    if (key === 'start-review' && !body.last_responder_party) body.last_responder_party = 'reviewer';
    try {
      await api.post(`/ipp/submittal-rfi/chain/${rowId}/${key}`, body);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { submittal_rfi: SubmittalRow; events: ChainEvent[] } }>(`/ipp/submittal-rfi/chain/${rowId}`);
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
      const res = await api.get<{ data: { submittal_rfi: SubmittalRow; events: ChainEvent[] } }>(`/ipp/submittal-rfi/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag;
      if (filter === 'signature')  return r.signature_class_flag;
      if (filter === 'grid_code')  return r.affects_grid_code === 1;
      if (['critical', 'high', 'standard', 'low'].includes(filter)) return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis;

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Submittal log &amp; RFI register · construction-document review pipeline</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          13-state P6 lifecycle: drafted → submitted → distributed → under review → clarification loop → responded →
          approved → released for construction → incorporated → closed clean, with revision loop and void/withdraw terminals.
          Tier RE-DERIVED on every transition from priority × workflow × four coverage flags (grid_code / life_safety /
          bid_envelope / holds_construction) with FLOOR-AT-HIGH. URGENT SLA polarity — critical RFI turns in hours.
          SIGNATURE crossings: approve when grid_code OR bid_envelope; void when grid_code OR life_safety;
          distribute_for_construction high+critical with grid_code; return_for_revision high+critical with grid_code.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"                value={k?.total ?? rows.length} />
        <KpiTile label="Open"                 value={k?.open_count ?? 0}                          tone={(k?.open_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="For construction"     value={k?.distributed_for_construction_count ?? 0}  tone="ok" />
        <KpiTile label="Incorporated"         value={k?.incorporated_count ?? 0}                  tone="ok" />
        <KpiTile label="Returned for rev."    value={k?.returned_for_revision_count ?? 0}          tone={(k?.returned_for_revision_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Closed clean"         value={k?.closed_clean_count ?? 0}                  tone="ok" />
        <KpiTile label="Voided"               value={k?.voided_count ?? 0}                        tone={(k?.voided_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"         value={k?.breached ?? 0}                            tone={(k?.breached ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Response SLA breach"  value={k?.response_breached_count ?? 0}             tone={(k?.response_breached_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Signature flagged"    value={k?.signature_count ?? 0}                     tone={(k?.signature_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Reportable"           value={k?.reportable_total ?? 0}                    tone={(k?.reportable_total ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="IPP-PM quality index" value={fmtNum(k?.avg_quality_index)} />
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
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD, color: BAD }}>{err}</div>
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
              title={`${row.submittal_rfi_number}${row.title ? ` · ${row.title}` : ''}`}
              meta={[
                row.project_name ?? '—',
                WORKFLOW_LABEL[row.workflow_class],
                `${row.current_tier} · ${row.urgency_band}`,
                row.ball_in_court_party_live ? `BIC: ${row.ball_in_court_party_live}` : null,
                row.is_reportable_flag ? '● Reportable' : null,
                row.signature_class_flag ? '▲ Signature' : null,
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No submittals or RFIs match.</div>
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

export default SubmittalRfiChainTab;
