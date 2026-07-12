// Wave 100 — IPP Mechanical / Electrical Handover Dossier + Turnover-to-
// Operations tab. The construction-to-O&M turnover package a best-in-class
// IPP-PM stack ships at practical completion. Beats Procore Handover, Aconex
// Handover, BIM 360 Handover, Bentley ProjectWise/AssetWise, e-Builder
// Closeout, ServiceNow Handover, SAP S/4HANA Asset Handover and IBM Maximo
// Asset Handover via:
//   - 12-state P6 lifecycle (dossier_compiled -> submitted -> under_review
//     -> revision_required loop -> approved -> witnessed_acceptance_scheduled
//     -> witnessed_acceptance -> punch_remediated -> training_transferred
//     -> warranty_activated -> operations_owned -> archived) plus reject /
//     withdraw / void terminals
//   - tier RE-DERIVED on every transition from priority x workflow class
//     with FLOOR-AT-HIGH for blocks_warranty_start | blocks_om_handover |
//     incomplete_as_built | untransferred_spares
//   - URGENT SLA polarity (warranty-clock-running = tightest)
//   - ball-in-court tracking + authority tiered (project_engineer ->
//     commissioning_engineer -> operations_manager -> handover_director)
//   - LIVE battery decoration on every fetch: minutes_until_sla,
//     handover_completeness_index (0-130 vs industry baseline=100 with
//     as-built/spares/training/witness/warranty bonuses), days_in_court,
//     predicted_close_date_live, urgency_band
//   - SIGNATURE regulator crossings (W100 - REIPPPP O&M handover + NERSA
//     s.C-5 + OHSA s24): approve crosses EVERY tier on blocks_warranty_start;
//     transfer_to_operations EVERY tier on warranty OR om; void EVERY tier
//     on incomplete_as_built OR untransferred_spares; sla_breached crosses
//     regulator EVERY tier on warranty; high+critical on om.

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
  | 'dossier_compiled' | 'submitted' | 'under_review' | 'revision_required'
  | 'approved' | 'witnessed_acceptance_scheduled' | 'witnessed_acceptance'
  | 'punch_remediated' | 'training_transferred' | 'warranty_activated'
  | 'operations_owned' | 'archived'
  | 'rejected' | 'withdrawn' | 'voided';

type Tier = 'critical' | 'high' | 'standard' | 'low';

type WorkflowClass =
  | 'mechanical_drivetrain' | 'electrical_balance_of_plant' | 'inverter_skid'
  | 'transformer_bay' | 'battery_storage_skid' | 'scada_dms_integration'
  | 'civil_structural' | 'protection_relay_package' | 'spare_parts_kit'
  | 'training_documentation_pack';

interface HandoverRow {
  [key: string]: unknown;
  id: string;
  dossier_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
  owner_party_id: string | null;
  owner_party_name: string | null;
  independent_engineer_party_id: string | null;
  independent_engineer_party_name: string | null;
  workflow_class: WorkflowClass;
  priority_class: 'critical' | 'high' | 'standard' | 'low';
  dossier_scope: string | null;
  drawing_register_ref: string | null;
  spec_register_ref: string | null;
  acceptance_criteria: string | null;
  compiled_at: string | null;
  blocks_warranty_start: number;
  blocks_om_handover: number;
  incomplete_as_built: number;
  untransferred_spares: number;
  current_tier: Tier;
  authority_required: string | null;
  revision_count: number;
  punch_count_open: number;
  as_built_completeness_pct: number;
  spare_parts_completeness_pct: number;
  training_completion_pct: number;
  witnessed_acceptance_clear: number;
  warranty_activated: number;
  warranty_start_date: string | null;
  warranty_end_date: string | null;
  warranty_admin_party_id: string | null;
  warranty_admin_party_name: string | null;
  dossier_cost_zar: number | null;
  handover_cost_zar: number | null;
  parent_dossier_id: string | null;
  om_handover_blocker_ref: string | null;
  warranty_blocker_ref: string | null;
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
  revision_required_at: string | null;
  approved_at: string | null;
  witnessed_acceptance_scheduled_at: string | null;
  witnessed_acceptance_at: string | null;
  punch_remediated_at: string | null;
  training_transferred_at: string | null;
  warranty_activated_at: string | null;
  operations_owned_at: string | null;
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
  handover_completeness_index_live: number;
  inbox_severity_live: string;
  reportable_per_spec: boolean;
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
  warranty_count: number;
  om_count: number;
  asbuilt_count: number;
  spares_count: number;
  witness_clear_count: number;
  warranty_active_count: number;
  avg_completeness_index: number;
  avg_days_in_court: number;
  avg_as_built_pct: number;
  avg_spares_pct: number;
  avg_training_pct: number;
  total_dossier_cost_zar: number;
  total_handover_cost_zar: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'dossier_compiled',
  'submitted',
  'under_review',
  'revision_required',
  'approved',
  'witnessed_acceptance_scheduled',
  'witnessed_acceptance',
  'punch_remediated',
  'training_transferred',
  'warranty_activated',
  'operations_owned',
  'archived',
];
const BRANCH_STATES: readonly string[] = [
  'rejected',
  'withdrawn',
  'voided',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                           label: 'Open' },
  { key: 'all',                            label: 'All' },
  { key: 'critical',                       label: 'Critical' },
  { key: 'high',                           label: 'High' },
  { key: 'standard',                       label: 'Standard' },
  { key: 'low',                            label: 'Low' },
  { key: 'dossier_compiled',               label: 'Compiled' },
  { key: 'submitted',                      label: 'Submitted' },
  { key: 'under_review',                   label: 'Under review' },
  { key: 'revision_required',              label: 'Revision req.' },
  { key: 'witnessed_acceptance_scheduled', label: 'Witness sched.' },
  { key: 'witnessed_acceptance',           label: 'Witnessed' },
  { key: 'warranty_activated',             label: 'Warranty active' },
  { key: 'operations_owned',               label: 'Ops-owned' },
  { key: 'archived',                       label: 'Archived' },
  { key: 'breached',                       label: 'SLA breached' },
  { key: 'reportable',                     label: 'Reportable' },
  { key: 'signature',                      label: 'Signature' },
  { key: 'warranty_only',                  label: 'Warranty-blocking' },
  { key: 'om_only',                        label: 'O&M-blocking' },
  { key: 'asbuilt_only',                   label: 'As-built incomplete' },
  { key: 'spares_only',                    label: 'Spares untransferred' },
];

const TERMINAL_STATES: ChainStatus[] = ['archived', 'rejected', 'withdrawn', 'voided'];

const WORKFLOW_LABEL: Record<WorkflowClass, string> = {
  mechanical_drivetrain:        'Mechanical drivetrain',
  electrical_balance_of_plant:  'Electrical BoP',
  inverter_skid:                'Inverter skid',
  transformer_bay:              'Transformer bay',
  battery_storage_skid:        'Battery storage skid',
  scada_dms_integration:        'SCADA / DMS integration',
  civil_structural:             'Civil / structural',
  protection_relay_package:     'Protection relay package',
  spare_parts_kit:              'Spare parts kit',
  training_documentation_pack:  'Training documentation pack',
};

const AUTHORITY_LABEL: Record<string, string> = {
  project_engineer:       'Project engineer',
  commissioning_engineer: 'Commissioning engineer',
  operations_manager:     'Operations manager',
  handover_director:      'Handover director',
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

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: HandoverRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'dossier_compiled') {
    actions.push({
      key: 'submit',
      label: 'Submit (commissioning engineer)',
      fields: [
        {
          key: 'narrative',
          label: 'Submission note (warranty-blocking dossiers cross NERSA inbox on approve)',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (handover coordinator)',
      fields: [
        { key: 'withdrawn_reason', label: 'Withdrawal reason (handover coordinator)', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'submitted') {
    actions.push({
      key: 'open-review',
      label: 'Open review (independent engineer)',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'reject',
      label: 'Reject (independent engineer)',
      fields: [
        { key: 'rejected_reason', label: 'Rejection reason (independent engineer)', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (handover coordinator)',
      fields: [
        { key: 'withdrawn_reason', label: 'Withdrawal reason (handover coordinator)', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'under_review') {
    actions.push({
      key: 'approve',
      label: 'Approve (independent engineer)',
      fields: [
        {
          key: 'regulator_ref',
          label: 'Regulator reference (warranty-blocking approvals cross EVERY tier) — leave blank if not applicable',
          type: 'text',
          required: false,
          placeholder: String(row.regulator_ref ?? ''),
        },
        {
          key: 'dossier_cost_zar',
          label: 'Dossier cost (ZAR, optional)',
          type: 'number',
          required: false,
          placeholder: String(row.dossier_cost_zar ?? ''),
        },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'require-revision',
      label: 'Require revision (independent engineer)',
      fields: [
        { key: 'narrative', label: 'Revision instructions (independent engineer)', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'reject',
      label: 'Reject (independent engineer)',
      fields: [
        { key: 'rejected_reason', label: 'Rejection reason (independent engineer)', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with as-built OR spares incomplete crosses regulator EVERY tier', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'revision_required') {
    actions.push({
      key: 'revise-and-resubmit',
      label: 'Revise & resubmit (handover coordinator)',
      fields: [
        {
          key: 'narrative',
          label: 'Revision note (auto-increments revision count)',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with as-built OR spares incomplete crosses regulator EVERY tier', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'approved') {
    actions.push({
      key: 'schedule-witnessed-acceptance',
      label: 'Schedule witnessed acceptance',
      fields: [
        {
          key: 'witness_party',
          label: 'Witness party (independent_engineer / regulator / lender)',
          type: 'text',
          required: false,
          placeholder: String(row.witness_party ?? 'independent_engineer'),
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with as-built OR spares incomplete crosses regulator EVERY tier', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'witnessed_acceptance_scheduled') {
    actions.push({
      key: 'complete-witnessed-acceptance',
      label: 'Complete witnessed acceptance',
      fields: [
        {
          key: 'witnessed_acceptance_clear',
          label: 'Witnessed acceptance clear? (1 = clear, 0 = punch raised)',
          type: 'number',
          required: false,
          placeholder: String(row.witnessed_acceptance_clear ?? '1'),
        },
        {
          key: 'punch_count_open',
          label: 'Open punch count (0 if clear)',
          type: 'number',
          required: false,
          placeholder: String(row.punch_count_open ?? '0'),
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with as-built OR spares incomplete crosses regulator EVERY tier', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'witnessed_acceptance') {
    actions.push({
      key: 'remediate-punch',
      label: 'Remediate punch list (contractor)',
      fields: [
        {
          key: 'punch_count_open',
          label: 'Open punch count after remediation (0 if all closed)',
          type: 'number',
          required: false,
          placeholder: String(row.punch_count_open ?? '0'),
        },
        {
          key: 'handover_cost_zar',
          label: 'Handover cost incurred (ZAR, optional)',
          type: 'number',
          required: false,
          placeholder: String(row.handover_cost_zar ?? ''),
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with as-built OR spares incomplete crosses regulator EVERY tier', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'punch_remediated') {
    actions.push({
      key: 'transfer-training',
      label: 'Transfer training (training lead)',
      fields: [
        {
          key: 'training_completion_pct',
          label: 'Training completion (0-100)',
          type: 'number',
          required: false,
          placeholder: String(row.training_completion_pct ?? '100'),
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with as-built OR spares incomplete crosses regulator EVERY tier', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'training_transferred') {
    actions.push({
      key: 'activate-warranty',
      label: 'Activate warranty (warranty administrator)',
      fields: [
        {
          key: 'warranty_admin_party_name',
          label: 'Warranty administrator party name',
          type: 'text',
          required: false,
          placeholder: String(row.warranty_admin_party_name ?? ''),
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with as-built OR spares incomplete crosses regulator EVERY tier', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'warranty_activated') {
    actions.push({
      key: 'transfer-to-operations',
      label: 'Transfer to operations (operations manager)',
      fields: [
        {
          key: 'narrative',
          label: 'Transfer-to-operations note — warranty OR O&M-blocking transfers cross regulator EVERY tier',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with as-built OR spares incomplete crosses regulator EVERY tier', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'operations_owned') {
    actions.push({
      key: 'archive',
      label: 'Archive (handover director)',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'void',
      label: 'Void (owner)',
      fields: [
        { key: 'voided_reason', label: 'Void reason — voiding with as-built OR spares incomplete crosses regulator EVERY tier', type: 'textarea', required: true, placeholder: '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: HandoverRow): React.ReactNode {
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');

  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      {/* Live handover completeness battery */}
      <div className="rounded border mb-2 px-3 py-2" style={{ background: BG2, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>Live handover completeness battery</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Completeness index" value={fmtNum(row.handover_completeness_index_live, 0)} hint="0-130 (industry baseline=100)" />
          <DetailPair label="Days open" value={String(row.days_open_live ?? 0)} />
          <DetailPair label="Days in court" value={String(row.days_in_court_live ?? 0)} hint="Aging in current state" />
          <DetailPair label="Ball in court" value={row.ball_in_court_party_live ?? '—'} hint="Auto-derived from current state" />
          <DetailPair label="Tier (live)" value={row.tier_live} />
          <DetailPair label="Urgency band" value={row.urgency_band} />
          <DetailPair label="Predicted close" value={fmtDate(row.predicted_close_date_live)} hint="Tier-derived forward-path ETA" />
          <DetailPair label="Authority" value={authority} />
        </div>
      </div>

      {/* Coverage flags */}
      <div className="rounded border mb-2 px-3 py-2" style={{ background: BG2, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>Coverage flags (FLOOR-AT-HIGH)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Blocks warranty" value={row.blocks_warranty_start ? 'Yes' : 'No'} />
          <DetailPair label="Blocks O&M handover" value={row.blocks_om_handover ? 'Yes' : 'No'} />
          <DetailPair label="As-built incomplete" value={row.incomplete_as_built ? 'Yes' : 'No'} />
          <DetailPair label="Spares untransferred" value={row.untransferred_spares ? 'Yes' : 'No'} />
          <DetailPair label="Revisions" value={String(row.revision_count ?? 0)} />
          <DetailPair label="Punch open" value={String(row.punch_count_open ?? 0)} />
          <DetailPair label="As-built %" value={fmtPct((row.as_built_completeness_pct ?? 0) / 100)} />
          <DetailPair label="Spares %" value={fmtPct((row.spare_parts_completeness_pct ?? 0) / 100)} />
          <DetailPair label="Training %" value={fmtPct((row.training_completion_pct ?? 0) / 100)} />
          <DetailPair label="Witness clear" value={row.witnessed_acceptance_clear ? 'Yes' : 'No'} />
          <DetailPair label="Warranty active" value={row.warranty_activated ? 'Yes' : 'No'} />
          <DetailPair label="Drawing register" value={row.drawing_register_ref ?? '—'} />
        </div>
      </div>

      {/* Handover economics */}
      <div className="rounded border mb-2 px-3 py-2" style={{ background: BG2, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>Handover economics</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Dossier cost" value={fmtZar(row.dossier_cost_zar)} />
          <DetailPair label="Handover cost" value={fmtZar(row.handover_cost_zar)} />
          <DetailPair label="Total cost" value={fmtZar((row.dossier_cost_zar ?? 0) + (row.handover_cost_zar ?? 0))} />
          <DetailPair label="Warranty start" value={row.warranty_start_date ?? '—'} />
          <DetailPair label="Warranty end" value={row.warranty_end_date ?? '—'} />
          <DetailPair label="Warranty admin" value={row.warranty_admin_party_name ?? '—'} />
        </div>
      </div>

      {/* Core fields */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <DetailPair label="Workflow class" value={WORKFLOW_LABEL[row.workflow_class]} />
        <DetailPair label="Priority" value={row.priority_class} />
        <DetailPair label="Dossier scope" value={row.dossier_scope ?? '—'} />
        <DetailPair label="Compiled at" value={fmtDate(row.compiled_at)} />
        <DetailPair label="Acceptance crit." value={row.acceptance_criteria ?? '—'} />
        <DetailPair label="Spec register" value={row.spec_register_ref ?? '—'} />
        <DetailPair label="Contractor" value={row.contractor_name ?? '—'} />
        <DetailPair label="Facility" value={row.facility_name ?? '—'} />
        <DetailPair label="Owner" value={row.owner_party_name ?? '—'} />
        <DetailPair label="Indep. engineer" value={row.independent_engineer_party_name ?? '—'} />
        <DetailPair label="Witness party" value={row.witness_party ?? '—'} />
        <DetailPair label="Last responder" value={row.last_responder_party ?? '—'} />
        <DetailPair label="Requester" value={row.requester_party ?? '—'} />
        <DetailPair label="Approver" value={row.approver_party ?? '—'} />
        <DetailPair label="O&M blocker ref" value={row.om_handover_blocker_ref ?? '—'} />
        <DetailPair label="Warranty blocker" value={row.warranty_blocker_ref ?? '—'} />
        <DetailPair label="Regulator ref" value={row.regulator_ref ?? '—'} />
        <DetailPair label="Submitted" value={fmtDate(row.submitted_at)} />
        <DetailPair label="Under review" value={fmtDate(row.under_review_at)} />
        <DetailPair label="Revision required" value={fmtDate(row.revision_required_at)} />
        <DetailPair label="Approved" value={fmtDate(row.approved_at)} />
        <DetailPair label="Witness scheduled" value={fmtDate(row.witnessed_acceptance_scheduled_at)} />
        <DetailPair label="Witnessed" value={fmtDate(row.witnessed_acceptance_at)} />
        <DetailPair label="Punch remediated" value={fmtDate(row.punch_remediated_at)} />
        <DetailPair label="Training xfer" value={fmtDate(row.training_transferred_at)} />
        <DetailPair label="Warranty active" value={fmtDate(row.warranty_activated_at)} />
        <DetailPair label="Ops-owned" value={fmtDate(row.operations_owned_at)} />
        <DetailPair label="Archived" value={fmtDate(row.archived_at)} />
        <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl" value={String(row.escalation_level)} />
        <DetailPair label="Reportable" value={row.is_reportable_flag ? 'Yes' : 'No'} />
      </div>

      {row.title && (
        <div className="col-span-2 rounded border mt-2 px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Title</div>
          <div style={{ color: TX2 }}>{row.title}</div>
        </div>
      )}
      {row.narrative && (
        <div className="col-span-2 rounded border mt-2 px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Narrative</div>
          <div style={{ color: TX2 }}>{row.narrative}</div>
        </div>
      )}
      {row.result_text && (
        <div className="col-span-2 rounded border mt-2 px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOOD }}>Result</div>
          <div style={{ color: TX2 }}>{row.result_text}</div>
        </div>
      )}
      {row.rejected_reason && (
        <div className="col-span-2 rounded border mt-2 px-2 py-1.5" style={{ background: BG1, borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Rejected reason</div>
          <div style={{ color: TX2 }}>{row.rejected_reason}</div>
        </div>
      )}
      {row.voided_reason && (
        <div className="col-span-2 rounded border mt-2 px-2 py-1.5" style={{ background: BG1, borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Voided reason</div>
          <div style={{ color: TX2 }}>{row.voided_reason}</div>
        </div>
      )}
      {row.withdrawn_reason && (
        <div className="col-span-2 rounded border mt-2 px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>Withdrawn reason</div>
          <div style={{ color: TX2 }}>{row.withdrawn_reason}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function HandoverDossierChainTab() {
  const [rows, setRows] = useState<HandoverRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get<{ data: { items: HandoverRow[] } & KpiSummary }>('/ipp/handover-dossier/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setSummary({
          total: d.total, open_count: d.open_count,
          archived_count: d.archived_count, rejected_count: d.rejected_count,
          withdrawn_count: d.withdrawn_count, voided_count: d.voided_count,
          breached: d.breached, reportable_total: d.reportable_total,
          signature_count: d.signature_count,
          warranty_count: d.warranty_count, om_count: d.om_count,
          asbuilt_count: d.asbuilt_count, spares_count: d.spares_count,
          witness_clear_count: d.witness_clear_count,
          warranty_active_count: d.warranty_active_count,
          avg_completeness_index: d.avg_completeness_index,
          avg_days_in_court: d.avg_days_in_court,
          avg_as_built_pct: d.avg_as_built_pct,
          avg_spares_pct: d.avg_spares_pct,
          avg_training_pct: d.avg_training_pct,
          total_dossier_cost_zar: d.total_dossier_cost_zar,
          total_handover_cost_zar: d.total_handover_cost_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load handover dossier chain');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      // convert-typed numeric fields
      const body: Record<string, unknown> = { ...values };
      for (const numKey of ['witnessed_acceptance_clear', 'punch_count_open', 'training_completion_pct', 'dossier_cost_zar', 'handover_cost_zar']) {
        if (body[numKey] !== undefined && body[numKey] !== '') {
          body[numKey] = Number(body[numKey]);
        }
        if (body[numKey] === '') delete body[numKey];
      }
      // inject last_responder_party from key context
      if (key === 'require-revision') body.last_responder_party = 'independent_engineer';
      if (key === 'revise-and-resubmit') body.last_responder_party = 'handover_coordinator';
      if (key === 'complete-witnessed-acceptance') body.last_responder_party = 'witness';
      if (key === 'remediate-punch') body.last_responder_party = 'contractor';
      if (key === 'transfer-training') body.last_responder_party = 'training_lead';
      if (key === 'transfer-to-operations') body.last_responder_party = 'operations_manager';
      if (key === 'approve') body.approver_party = 'independent_engineer';

      await api.post(`/ipp/handover-dossier/chain/${rowId}/${key}`, body);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/handover-dossier/chain/${rowId}`);
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
      const res = await api.get<{ data: { dossier: HandoverRow; events: ChainEvent[] } }>(`/ipp/handover-dossier/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all')           return true;
      if (filter === 'open')          return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')      return r.sla_breached;
      if (filter === 'reportable')    return r.is_reportable_flag;
      if (filter === 'signature')     return r.signature_class_flag;
      if (filter === 'warranty_only') return r.blocks_warranty_start === 1;
      if (filter === 'om_only')       return r.blocks_om_handover === 1;
      if (filter === 'asbuilt_only')  return r.incomplete_as_built === 1;
      if (filter === 'spares_only')   return r.untransferred_spares === 1;
      if (['critical', 'high', 'standard', 'low'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary;

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Handover dossier · Turnover-to-operations</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state P6 lifecycle for the construction-to-O&amp;M turnover package an IPP project ships at practical
          completion — dossier_compiled → submitted → under_review → revision_required loop → approved →
          witnessed_acceptance_scheduled → witnessed_acceptance → punch_remediated → training_transferred →
          warranty_activated → operations_owned → archived, with reject / withdraw / void exception terminals.
          Beats Procore Handover, Aconex Handover, BIM 360 Handover, Bentley ProjectWise/AssetWise, e-Builder
          Closeout, ServiceNow Handover, SAP S/4HANA Asset Handover and IBM Maximo Asset Handover.
          SIGNATURE regulator crossings (REIPPPP O&amp;M handover + NERSA §C-5 + OHSA s24): approve crosses
          EVERY tier on warranty; transfer_to_operations EVERY tier on warranty OR O&amp;M; void EVERY tier on
          as-built OR spares; sla_breached EVERY tier on warranty, high+critical on O&amp;M.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-2">
        <KpiTile label="Total"             value={kpis?.total ?? rows.length} />
        <KpiTile label="Open"              value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Archived"          value={kpis?.archived_count ?? 0} />
        <KpiTile label="Rejected"          value={kpis?.rejected_count ?? 0} tone={(kpis?.rejected_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Voided"            value={kpis?.voided_count ?? 0} tone={(kpis?.voided_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"      value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Signature"         value={kpis?.signature_count ?? 0} tone={(kpis?.signature_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Warranty-blocking" value={kpis?.warranty_count ?? 0} tone={(kpis?.warranty_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="O&M-blocking"      value={kpis?.om_count ?? 0} tone={(kpis?.om_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="As-built incompl." value={kpis?.asbuilt_count ?? 0} tone={(kpis?.asbuilt_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Spares untransf."  value={kpis?.spares_count ?? 0} tone={(kpis?.spares_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Reportable"        value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Completeness"      value={fmtNum(kpis?.avg_completeness_index, 0)} />
        <KpiTile label="As-built avg"      value={fmtPct((kpis?.avg_as_built_pct ?? 0) / 100)} tone={((kpis?.avg_as_built_pct ?? 0) / 100) < 0.9 ? 'warn' : undefined} />
        <KpiTile label="Spares avg"        value={fmtPct((kpis?.avg_spares_pct ?? 0) / 100)} tone={((kpis?.avg_spares_pct ?? 0) / 100) < 0.9 ? 'warn' : undefined} />
        <KpiTile label="Training avg"      value={fmtPct((kpis?.avg_training_pct ?? 0) / 100)} tone={((kpis?.avg_training_pct ?? 0) / 100) < 0.9 ? 'warn' : undefined} />
        <KpiTile label="Witness clear"     value={kpis?.witness_clear_count ?? 0} />
        <KpiTile label="Warranty active"   value={kpis?.warranty_active_count ?? 0} />
        <KpiTile label="Dossier cost"      value={fmtZar(kpis?.total_dossier_cost_zar)} />
        <KpiTile label="Handover cost"     value={fmtZar(kpis?.total_handover_cost_zar)} tone={(kpis?.total_handover_cost_zar ?? 0) > 0 ? 'warn' : undefined} />
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
              title={`${row.dossier_number}${row.project_name ? ` · ${row.project_name}` : ''}`}
              meta={`${WORKFLOW_LABEL[row.workflow_class]} · ${row.current_tier}${row.facility_name ? ` · ${row.facility_name}` : ''}`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No handover dossier records match.</div>
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

export default HandoverDossierChainTab;
