// Wave 82 — Carbon Credit Issuance & Serialization chain tab.
//
// The MINTING step of the carbon-credit lifecycle: once a monitoring period
// has been verified (W11) and the project is in good standing (W37/W56), the
// registry serializes the verified reductions into a unique block of serial
// numbers and credits the proponent holding account. The tab surfaces the
// 12-state chain — requested → screening → verification_check → serialization
// → pending_registry → issued, with on_hold/returned/disputed loops back to
// screening or serialization, and terminal rejected/withdrawn/cancelled — and
// exposes the LIVE integrity battery that beats Verra Registry on APX, Gold
// Standard Impact Registry, S&P Global Environmental Registry, Cercarbono and
// Puro.earth: serial-block transparency, buffer-pool maths (AFOLU 20% / non-
// AFOLU 5%), project+vintage cumulative headroom, double-issuance / over-
// issuance flags, predicted issuance days, and Article-6 corresponding-
// adjustment binding — all derived from the same inputs each transition.
//
// INVERTED SLA — the larger the volume, the LONGER every window (deeper
// integrity diligence); a minor mint gets the fast track. The W82 signature
// is INTEGRITY-driven: raise_dispute crosses to the regulator inbox for
// EVERY tier (the W82 hard line); confirm_issuance crosses for EVERY tier
// when CA-required (Article 6), else for the large tiers (major + mega);
// reject and SLA breach cross for the large tiers.

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
  | 'requested' | 'screening' | 'verification_check' | 'serialization'
  | 'pending_registry' | 'issued' | 'on_hold' | 'returned'
  | 'disputed' | 'rejected' | 'withdrawn' | 'cancelled';

type Tier = 'minor' | 'moderate' | 'major' | 'mega';

type TransferType = 'article6' | 'voluntary' | 'compliance';

type Category = 'afolu' | 'renewables' | 'efficiency' | 'industrial' | 'methane' | 'cdr';

interface IssuanceRow {
  [key: string]: unknown;
  id: string;
  issuance_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string | null;
  registry_standard: string | null;
  methodology_id: string | null;
  proponent_party_id: string | null;
  proponent_party_name: string | null;
  registry_account_id: string | null;
  vvb_name: string | null;
  dna_name: string | null;
  host_country: string | null;
  transfer_type: TransferType;
  category: Category;
  issuance_tier: Tier;
  requested_tco2e: number;
  requires_corresponding_adjustment: number;
  corresponding_adjustment_ref: string | null;
  ca_applied_flag: number;
  vintage_year: number | null;
  monitoring_period_start: string | null;
  monitoring_period_end: string | null;
  vintage_monitoring_key: string | null;
  verified_tco2e: number | null;
  already_issued_tco2e: number | null;
  buffer_pct: number | null;
  buffer_contribution_tco2e: number | null;
  net_issuable_tco2e: number | null;
  project_vintage_headroom_tco2e: number | null;
  over_issuance_flag: number;
  double_issuance_guard_ok: number;
  predicted_issuance_days: number | null;
  serial_block_start: number | null;
  serial_block_end: number | null;
  serial_block_size: number | null;
  serial_number_prefix: string | null;
  screened_flag: number;
  verification_check_ok_flag: number;
  serials_assigned_flag: number;
  submitted_to_registry_flag: number;
  issued_flag: number;
  request_ref: string | null;
  screening_ref: string | null;
  verification_check_ref: string | null;
  serialization_ref: string | null;
  registry_submission_ref: string | null;
  issuance_ref: string | null;
  hold_ref: string | null;
  return_ref: string | null;
  dispute_ref: string | null;
  rejection_ref: string | null;
  withdrawal_ref: string | null;
  cancellation_ref: string | null;
  regulator_ref: string | null;
  request_basis: string | null;
  screening_basis: string | null;
  verification_check_basis: string | null;
  serialization_basis: string | null;
  registry_submission_basis: string | null;
  issuance_basis: string | null;
  hold_basis: string | null;
  return_basis: string | null;
  dispute_basis: string | null;
  rejection_basis: string | null;
  withdrawal_basis: string | null;
  cancellation_basis: string | null;
  reason_code: string | null;
  issuance_summary: string | null;
  chain_status: ChainStatus;
  requested_at: string;
  screening_at: string | null;
  verification_check_at: string | null;
  serialization_at: string | null;
  pending_registry_at: string | null;
  issued_at: string | null;
  on_hold_at: string | null;
  returned_at: string | null;
  disputed_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  requires_corresponding_adjustment_flag?: boolean;
  breach_crosses_regulator?: boolean;
  buffer_pct_live?: number;
  buffer_contribution_tco2e_live?: number;
  net_issuable_tco2e_live?: number;
  project_vintage_headroom_tco2e_live?: number;
  over_issuance_flag_live?: boolean;
  serial_block_end_live?: number | null;
  predicted_issuance_days_live?: number;
  double_issuance_guard_ok_flag?: boolean;
}

interface IssuanceEvent {
  id: string;
  issuance_id: string;
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
  issued_count: number;
  on_hold_count: number;
  returned_count: number;
  disputed_count: number;
  rejected_count: number;
  withdrawn_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  article6_count: number;
  afolu_count: number;
  over_issuance_count: number;
  total_requested_tco2e: number;
  total_net_issuable_tco2e: number;
  issued_tco2e: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'requested',
  'screening',
  'verification_check',
  'serialization',
  'pending_registry',
  'issued',
];

const BRANCH_STATES: readonly string[] = [
  'on_hold',
  'returned',
  'disputed',
  'rejected',
  'withdrawn',
  'cancelled',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'minor',              label: 'Minor' },
  { key: 'moderate',           label: 'Moderate' },
  { key: 'major',              label: 'Major' },
  { key: 'mega',               label: 'Mega' },
  { key: 'article6',           label: 'Article 6' },
  { key: 'afolu',              label: 'AFOLU' },
  { key: 'over_issuance',      label: 'Over-issuance' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'requested',          label: 'Requested' },
  { key: 'screening',          label: 'Screening' },
  { key: 'verification_check', label: 'Verif. check' },
  { key: 'serialization',      label: 'Serialization' },
  { key: 'pending_registry',   label: 'Pending registry' },
  { key: 'issued',             label: 'Issued' },
  { key: 'on_hold',            label: 'On hold' },
  { key: 'returned',           label: 'Returned' },
  { key: 'disputed',           label: 'Disputed' },
  { key: 'rejected',           label: 'Rejected' },
  { key: 'withdrawn',          label: 'Withdrawn' },
  { key: 'cancelled',          label: 'Cancelled' },
];

// ── action eligibility constants ──────────────────────────────────────────
const TERMINAL_STATES: ChainStatus[] = ['issued', 'rejected', 'withdrawn', 'cancelled'];
const HOLDABLE_STATES: ChainStatus[] = ['screening', 'verification_check', 'serialization', 'pending_registry'];
const RETURNABLE_STATES: ChainStatus[] = ['screening', 'verification_check'];
const DISPUTABLE_STATES: ChainStatus[] = ['verification_check', 'serialization', 'pending_registry'];
const REJECTABLE_STATES: ChainStatus[] = ['screening', 'verification_check', 'serialization', 'pending_registry', 'on_hold', 'returned', 'disputed'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['requested', 'screening', 'verification_check', 'returned'];
const CANCELLABLE_STATES: ChainStatus[] = ['requested', 'screening', 'verification_check', 'serialization', 'pending_registry', 'on_hold', 'returned', 'disputed'];

const TRANSFER_LABEL: Record<TransferType, string> = {
  article6:   'Article 6 (ITMO)',
  voluntary:  'Voluntary',
  compliance: 'Compliance',
};

const CATEGORY_LABEL: Record<Category, string> = {
  afolu:       'AFOLU (20% buffer)',
  renewables:  'Renewables',
  efficiency:  'Efficiency',
  industrial:  'Industrial',
  methane:     'Methane',
  cdr:         'CDR',
};

const TIER_LABEL: Record<Tier, string> = {
  minor:    'Minor (<10k)',
  moderate: 'Moderate (<100k)',
  major:    'Major (<500k)',
  mega:     'Mega (≥500k)',
};

// ── format helpers ────────────────────────────────────────────────────────
function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtTco2e(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA')} tCO₂e`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: IssuanceRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const status = row.chain_status;
  const requiresCA = row.requires_corresponding_adjustment_flag ?? !!row.requires_corresponding_adjustment;

  // Primary forward action per state
  if (status === 'requested') {
    actions.push({
      key: 'begin-screening',
      label: 'Begin screening (registry)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'screening_basis',
          label: 'Screening basis — the registry completeness assessment of the issuance request',
          type: 'textarea',
          required: true,
        },
        {
          key: 'screening_ref',
          label: 'Screening reference (e.g. SCR-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (status === 'screening') {
    actions.push({
      key: 'verify-against-mrv',
      label: 'Cross-check against MRV (VVB)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'verification_check_basis',
          label: 'Verification-check basis — the VVB cross-check of the request against the verified monitoring period',
          type: 'textarea',
          required: true,
        },
        {
          key: 'verification_check_ref',
          label: 'Verification-check reference (e.g. VER-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'vintage_monitoring_key',
          label: 'Vintage-monitoring key (project_id|vintage|period — drives the double-issuance guard)',
          type: 'text',
          required: false,
          placeholder: String(row.vintage_monitoring_key ?? ''),
        },
        {
          key: 'verified_tco2e',
          label: 'Verified tCO₂e (from the MRV statement)',
          type: 'number',
          required: false,
          placeholder: String(row.verified_tco2e ?? row.requested_tco2e),
        },
        {
          key: 'already_issued_tco2e',
          label: 'Already-issued tCO₂e for THIS project+vintage (drives headroom)',
          type: 'number',
          required: false,
          placeholder: String(row.already_issued_tco2e ?? 0),
        },
      ],
    });
  }

  if (status === 'verification_check') {
    actions.push({
      key: 'assign-serials',
      label: 'Assign serial block (registry)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'serialization_basis',
          label: 'Serialization basis — assignment of the unique serial-number block (serial transparency)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'serialization_ref',
          label: 'Serialization reference (e.g. SRL-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'serial_number_prefix',
          label: 'Serial-number prefix (e.g. ZA-CARBON-VER-2024)',
          type: 'text',
          required: false,
          placeholder: String(row.serial_number_prefix ?? ''),
        },
        {
          key: 'serial_block_start',
          label: 'Serial-block start (block end is derived from net issuable)',
          type: 'number',
          required: false,
          placeholder: String(row.serial_block_start ?? ''),
        },
        {
          key: 'buffer_pct',
          label: 'Buffer % override (blank = default — AFOLU 20%, non-AFOLU 5%)',
          type: 'number',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (status === 'serialization') {
    actions.push({
      key: 'submit-to-registry',
      label: 'Submit to registry (registry)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'registry_submission_basis',
          label: 'Registry-submission basis — the issuance request is submitted into the registry for confirmation',
          type: 'textarea',
          required: true,
        },
        {
          key: 'registry_submission_ref',
          label: 'Registry submission reference (e.g. RGS-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (status === 'pending_registry') {
    // confirm-issuance crosses regulator for EVERY tier when CA-required (Article 6),
    // else for the large tiers (major + mega)
    const confirmCascade = requiresCA
      ? ['regulator']
      : (row.issuance_tier === 'major' || row.issuance_tier === 'mega') ? ['regulator'] : [];
    const confirmFields: import('../ChainCard').ChainAction['fields'] = [
      {
        key: 'issuance_basis',
        label: 'Issuance basis — the registry confirms minting into the proponent holding account',
        type: 'textarea',
        required: true,
      },
      {
        key: 'issuance_ref',
        label: 'Issuance reference (e.g. ISS-2026-0007)',
        type: 'text',
        required: false,
        placeholder: '',
      },
    ];
    if (requiresCA) {
      confirmFields.push({
        key: 'corresponding_adjustment_ref',
        label: 'Corresponding-adjustment reference (Article 6 — the NDC authorisation)',
        type: 'text',
        required: false,
        placeholder: String(row.corresponding_adjustment_ref ?? ''),
      });
    }
    confirmFields.push({
      key: 'regulator_ref',
      label: 'Regulator reference (CA-required and large issuances cross to regulator inbox)',
      type: 'text',
      required: false,
      placeholder: '',
    });
    actions.push({
      key: 'confirm-issuance',
      label: 'Confirm issuance (registry)',
      tone: 'primary',
      cascadeTo: confirmCascade,
      fields: confirmFields,
    });
  }

  if (status === 'on_hold') {
    actions.push({
      key: 'resume',
      label: 'Resume (proponent)',
      tone: 'primary',
      cascadeTo: [],
      fields: [],
    });
  }

  if (status === 'returned') {
    actions.push({
      key: 'resubmit',
      label: 'Resubmit (proponent)',
      tone: 'primary',
      cascadeTo: [],
      fields: [],
    });
  }

  if (status === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute (registry)',
      tone: 'primary',
      cascadeTo: [],
      fields: [],
    });
  }

  // Secondary: place-on-hold
  if (HOLDABLE_STATES.includes(status)) {
    actions.push({
      key: 'place-on-hold',
      label: 'Place on hold (registry)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        {
          key: 'hold_basis',
          label: 'Hold basis — pause the issuance pending information',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. mrv_query / dna_query / serial_review)',
          type: 'text',
          required: false,
          placeholder: 'mrv_query',
        },
        {
          key: 'hold_ref',
          label: 'Hold reference (e.g. HLD-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  // Secondary: return-for-correction
  if (RETURNABLE_STATES.includes(status)) {
    actions.push({
      key: 'return-for-correction',
      label: 'Return for correction (registry)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        {
          key: 'return_basis',
          label: 'Return basis — bounce the request back to the proponent for correction',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. methodology_mismatch / quantum_mismatch / serial_overlap)',
          type: 'text',
          required: false,
          placeholder: 'quantum_mismatch',
        },
        {
          key: 'return_ref',
          label: 'Return reference (e.g. RET-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  // Secondary: raise-dispute — W82 signature: crosses regulator EVERY tier
  if (DISPUTABLE_STATES.includes(status)) {
    actions.push({
      key: 'raise-dispute',
      label: 'Raise dispute',
      tone: 'danger',
      cascadeTo: ['regulator'],
      fields: [
        {
          key: 'dispute_basis',
          label: 'Dispute basis — quantum or serial dispute (crosses regulator EVERY tier)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. serial_overlap / quantum_dispute / double_issuance)',
          type: 'text',
          required: false,
          placeholder: 'quantum_dispute',
        },
        {
          key: 'dispute_ref',
          label: 'Dispute reference (e.g. DSP-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'regulator_ref',
          label: 'Regulator reference (dispute always reportable)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  // Secondary: reject — crosses regulator for major / mega
  if (REJECTABLE_STATES.includes(status)) {
    const rejectCascade = (row.issuance_tier === 'major' || row.issuance_tier === 'mega') ? ['regulator'] : [];
    actions.push({
      key: 'reject',
      label: 'Reject (registry)',
      tone: 'danger',
      cascadeTo: rejectCascade,
      fields: [
        {
          key: 'rejection_basis',
          label: 'Rejection basis — the issuance request is not eligible to mint',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. methodology_fail / additionality_fail / over_issuance)',
          type: 'text',
          required: false,
          placeholder: 'methodology_fail',
        },
        {
          key: 'rejection_ref',
          label: 'Rejection reference (e.g. REJ-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'regulator_ref',
          label: 'Regulator reference (major / mega only)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  // Secondary: withdraw
  if (WITHDRAWABLE_STATES.includes(status)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (proponent)',
      tone: 'ghost',
      cascadeTo: [],
      fields: [
        {
          key: 'withdrawal_basis',
          label: 'Withdrawal basis — the proponent withdraws the issuance request',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. proponent_withdrawn / commercial)',
          type: 'text',
          required: false,
          placeholder: 'proponent_withdrawn',
        },
        {
          key: 'withdrawal_ref',
          label: 'Withdrawal reference (e.g. WDR-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  // Secondary: cancel
  if (CANCELLABLE_STATES.includes(status)) {
    actions.push({
      key: 'cancel',
      label: 'Cancel (registry)',
      tone: 'ghost',
      cascadeTo: [],
      fields: [
        {
          key: 'cancellation_basis',
          label: 'Cancellation basis — registry cancels the request',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. proponent_request / duplicate)',
          type: 'text',
          required: false,
          placeholder: 'proponent_request',
        },
        {
          key: 'cancellation_ref',
          label: 'Cancellation reference (e.g. CAN-2026-0007)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  return actions;
}

// ── detail renderer ────────────────────────────────────────────────────────
function renderDetail(row: IssuanceRow): React.ReactNode {
  const requiresCA = row.requires_corresponding_adjustment_flag ?? !!row.requires_corresponding_adjustment;
  const reportable = row.is_reportable_flag ?? !!row.is_reportable;
  const over = row.over_issuance_flag_live ?? !!row.over_issuance_flag;
  const guardOk = row.double_issuance_guard_ok_flag ?? !!row.double_issuance_guard_ok;
  const bufferPct = row.buffer_pct_live ?? row.buffer_pct;
  const bufferContribution = row.buffer_contribution_tco2e_live ?? row.buffer_contribution_tco2e;
  const netIssuable = row.net_issuable_tco2e_live ?? row.net_issuable_tco2e;
  const headroom = row.project_vintage_headroom_tco2e_live ?? row.project_vintage_headroom_tco2e;
  const serialEnd = row.serial_block_end_live ?? row.serial_block_end;
  const blockSize = row.serial_block_size ?? (row.serial_block_start != null && serialEnd != null ? serialEnd - row.serial_block_start + 1 : null);
  const predicted = row.predicted_issuance_days_live ?? row.predicted_issuance_days;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Registry standard"       value={row.registry_standard ?? '—'} />
      <DetailPair label="Transfer type"           value={TRANSFER_LABEL[row.transfer_type]} />
      <DetailPair label="Category"                value={CATEGORY_LABEL[row.category]} />
      <DetailPair label="Methodology"             value={row.methodology_id ?? '—'} />
      <DetailPair label="Host country"            value={row.host_country ?? '—'} />
      <DetailPair label="Corresp. adjustment"     value={requiresCA ? (row.ca_applied_flag ? 'Required + applied' : 'Required (Article 6)') : 'Not required'} />
      <DetailPair label="CA reference"            value={row.corresponding_adjustment_ref ?? '—'} />
      <DetailPair label="Vintage year"            value={row.vintage_year ? String(row.vintage_year) : '—'} />
      <DetailPair label="Monitoring period"       value={`${row.monitoring_period_start || '—'} → ${row.monitoring_period_end || '—'}`} />
      <DetailPair label="Vintage+monitoring"      value={row.vintage_monitoring_key ?? '—'} />
      <DetailPair label="Predicted issuance"      value={predicted ? `${predicted}d` : '—'} />
      <DetailPair label="Requested tCO₂e"         value={fmtTco2e(row.requested_tco2e)} />
      <DetailPair label="Verified tCO₂e"          value={fmtTco2e(row.verified_tco2e)} />
      <DetailPair label="Already issued"          value={fmtTco2e(row.already_issued_tco2e)} />
      <DetailPair label="Buffer %"                value={fmtPct(bufferPct)} />
      <DetailPair label="Buffer contribution"     value={fmtTco2e(bufferContribution)} />
      <DetailPair label="Net issuable"            value={fmtTco2e(netIssuable)} />
      <DetailPair label="Project+vintage headroom" value={fmtTco2e(headroom)} />
      <DetailPair label="Over-issuance"           value={over ? 'YES — exceeds verified - already' : 'No'} />
      <DetailPair label="Double-issuance guard"   value={guardOk ? 'Pass' : 'Pending'} />
      <DetailPair label="Serial prefix"           value={row.serial_number_prefix ?? '—'} />
      <DetailPair label="Serial block"            value={row.serial_block_start != null && serialEnd != null ? `${row.serial_block_start} → ${serialEnd}` : '—'} />
      <DetailPair label="Serial block size"       value={blockSize != null ? `${blockSize.toLocaleString('en-ZA')}` : '—'} />
      <DetailPair label="Registry account"        value={row.registry_account_id ?? '—'} />
      <DetailPair label="Proponent"               value={row.proponent_party_name ?? '—'} />
      <DetailPair label="VVB"                     value={row.vvb_name ?? '—'} />
      <DetailPair label="DNA"                     value={row.dna_name ?? '—'} />
      {row.source_wave && (
        <DetailPair label="Source wave" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />
      )}
      <DetailPair label="Screening ref"           value={row.screening_ref ?? '—'} />
      <DetailPair label="Verification ref"        value={row.verification_check_ref ?? '—'} />
      <DetailPair label="Serialization ref"       value={row.serialization_ref ?? '—'} />
      <DetailPair label="Registry submission ref" value={row.registry_submission_ref ?? '—'} />
      <DetailPair label="Issuance ref"            value={row.issuance_ref ?? '—'} />
      <DetailPair label="Regulator ref"           value={row.regulator_ref ?? '—'} />
      <DetailPair label="Reason code"             value={row.reason_code ?? '—'} />
      <DetailPair label="Requested"               value={fmtDate(row.requested_at)} />
      <DetailPair label="Screening"               value={fmtDate(row.screening_at)} />
      <DetailPair label="Verification check"      value={fmtDate(row.verification_check_at)} />
      <DetailPair label="Serialization"           value={fmtDate(row.serialization_at)} />
      <DetailPair label="Pending registry"        value={fmtDate(row.pending_registry_at)} />
      <DetailPair label="Issued"                  value={fmtDate(row.issued_at)} />
      <DetailPair label="On hold"                 value={fmtDate(row.on_hold_at)} />
      <DetailPair label="Returned"                value={fmtDate(row.returned_at)} />
      <DetailPair label="Disputed"                value={fmtDate(row.disputed_at)} />
      <DetailPair label="SLA deadline"            value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status"              value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Escalation lvl"          value={String(row.escalation_level)} />
      <DetailPair label="Reportable"              value={reportable ? 'Yes' : 'No'} />

      {row.issuance_summary && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Issuance summary</div>
          <div style={{ color: TX2 }}>{row.issuance_summary}</div>
        </div>
      )}
      {row.request_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Request basis</div>
          <div style={{ color: TX2 }}>{row.request_basis}</div>
        </div>
      )}
      {row.screening_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Screening basis (registry)</div>
          <div style={{ color: TX2 }}>{row.screening_basis}</div>
        </div>
      )}
      {row.verification_check_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Verification-check basis (VVB)</div>
          <div style={{ color: TX2 }}>{row.verification_check_basis}</div>
        </div>
      )}
      {row.serialization_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Serialization basis (registry)</div>
          <div style={{ color: TX2 }}>{row.serialization_basis}</div>
        </div>
      )}
      {row.registry_submission_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Registry submission basis</div>
          <div style={{ color: TX2 }}>{row.registry_submission_basis}</div>
        </div>
      )}
      {row.issuance_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Issuance basis</div>
          <div style={{ color: TX2 }}>{row.issuance_basis}</div>
        </div>
      )}
      {row.hold_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Hold basis</div>
          <div style={{ color: TX2 }}>{row.hold_basis}</div>
        </div>
      )}
      {row.return_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Return basis</div>
          <div style={{ color: TX2 }}>{row.return_basis}</div>
        </div>
      )}
      {row.dispute_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Dispute basis</div>
          <div style={{ color: TX2 }}>{row.dispute_basis}</div>
        </div>
      )}
      {row.rejection_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Rejection basis</div>
          <div style={{ color: TX2 }}>{row.rejection_basis}</div>
        </div>
      )}
      {row.withdrawal_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Withdrawal basis</div>
          <div style={{ color: TX2 }}>{row.withdrawal_basis}</div>
        </div>
      )}
      {row.cancellation_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Cancellation basis</div>
          <div style={{ color: TX2 }}>{row.cancellation_basis}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function CarbonIssuanceChainTab() {
  const [rows, setRows] = useState<IssuanceRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IssuanceRow[] } & KpiSummary }>('/carbon-issuance/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setKpis({
          total: d.total,
          open_count: d.open_count,
          issued_count: d.issued_count,
          on_hold_count: d.on_hold_count,
          returned_count: d.returned_count,
          disputed_count: d.disputed_count,
          rejected_count: d.rejected_count,
          withdrawn_count: d.withdrawn_count,
          cancelled_count: d.cancelled_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          article6_count: d.article6_count,
          afolu_count: d.afolu_count,
          over_issuance_count: d.over_issuance_count,
          total_requested_tco2e: d.total_requested_tco2e,
          total_net_issuable_tco2e: d.total_net_issuable_tco2e,
          issued_tco2e: d.issued_tco2e,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load issuance records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/carbon-issuance/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { case: IssuanceRow; events: IssuanceEvent[] } }>(`/carbon-issuance/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: IssuanceRow; events: IssuanceEvent[] } }>(`/carbon-issuance/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')           return true;
      if (filter === 'active')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')      return r.sla_breached ?? false;
      if (filter === 'reportable')    return r.is_reportable_flag ?? !!r.is_reportable;
      if (filter === 'article6')      return r.transfer_type === 'article6';
      if (filter === 'afolu')         return r.category === 'afolu';
      if (filter === 'over_issuance') return r.over_issuance_flag_live ?? !!r.over_issuance_flag;
      if (filter === 'minor' || filter === 'moderate' || filter === 'major' || filter === 'mega') {
        return r.issuance_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis;

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Carbon credit issuance &amp; serialization</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state minting chain · requested → screening → verification check → serialization →
          pending registry → issued, with on_hold/returned/disputed loops and terminal
          rejected/withdrawn/cancelled. INVERTED SLA: the larger the volume the longer every window.
          Raise-dispute crosses regulator EVERY tier; confirm-issuance crosses EVERY tier
          when CA-required (Article 6), else major/mega; reject and SLA breach cross for major/mega.
          Beats Verra Registry on APX, Gold Standard, S&amp;P Global Environmental Registry, Cercarbono and
          Puro.earth — live serial-block transparency, buffer-pool maths (AFOLU 20% / non-AFOLU 5%),
          project+vintage cumulative headroom, double-issuance/over-issuance flags, Article-6 CA binding.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"          value={k?.total ?? rows.length} />
        <KpiTile label="Open"           value={k?.open_count ?? 0} />
        <KpiTile label="Issued"         value={k?.issued_count ?? 0} tone="ok" />
        <KpiTile label="On hold"        value={k?.on_hold_count ?? 0} tone={(k?.on_hold_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Returned"       value={k?.returned_count ?? 0} tone={(k?.returned_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Disputed"       value={k?.disputed_count ?? 0} tone={(k?.disputed_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Rejected"       value={k?.rejected_count ?? 0} tone={(k?.rejected_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Withdrawn"      value={k?.withdrawn_count ?? 0} />
        <KpiTile label="Cancelled"      value={k?.cancelled_count ?? 0} />
        <KpiTile label="SLA breached"   value={k?.breached ?? 0} tone={(k?.breached ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Article 6 (CA)" value={k?.article6_count ?? 0} tone={(k?.article6_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="AFOLU"          value={k?.afolu_count ?? 0} />
        <KpiTile label="Over-issuance"  value={k?.over_issuance_count ?? 0} tone={(k?.over_issuance_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable"     value={k?.reportable_total ?? 0} tone={(k?.reportable_total ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Requested"      value={fmtTco2e(k?.total_requested_tco2e ?? 0)} />
        <KpiTile label="Net issuable"   value={fmtTco2e(k?.total_net_issuable_tco2e ?? 0)} />
        <KpiTile label="Issued tCO₂e"  value={fmtTco2e(k?.issued_tco2e ?? 0)} tone="ok" />
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
          {filtered.map(row => {
            const requiresCA = row.requires_corresponding_adjustment_flag ?? !!row.requires_corresponding_adjustment;
            const reportable = row.is_reportable_flag ?? !!row.is_reportable;
            const over = row.over_issuance_flag_live ?? !!row.over_issuance_flag;
            const netIssuable = row.net_issuable_tco2e_live ?? row.net_issuable_tco2e ?? 0;

            const meta = (
              <span style={{ fontFamily: MONO, fontSize: 10, color: TX3 }}>
                {TIER_LABEL[row.issuance_tier]}
                {' · '}
                {TRANSFER_LABEL[row.transfer_type]}
                {requiresCA && <span style={{ color: WARN }}> ⚑ CA</span>}
                {' · '}
                {(row.requested_tco2e || 0).toLocaleString('en-ZA')} req
                {' / '}
                {Number(netIssuable).toLocaleString('en-ZA')} net
                {reportable && <span style={{ color: BAD }}> ●</span>}
                {over && <span style={{ color: BAD }}> ⚠ over-issuance</span>}
                {row.proponent_party_name ? ` · ${row.proponent_party_name}` : ''}
                {row.registry_standard ? ` · ${row.registry_standard}` : ''}
              </span>
            );

            return (
              <ChainCard
                key={row.id}
                item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.project_name ? `${row.issuance_number} — ${row.project_name}` : row.issuance_number}
                meta={meta}
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No issuances match.</div>
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

export default CarbonIssuanceChainTab;
