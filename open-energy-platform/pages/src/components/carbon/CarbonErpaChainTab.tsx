// Wave 65 — Carbon ERPA (Emission Reduction Purchase Agreement) Forward Delivery
// & Make-Good lifecycle tab.
//
// The commercial FORWARD-SALE contract on top of the carbon-credit lifecycle. A
// buyer contracts today to purchase a contracted volume of a project's future
// emission reductions; the seller (project developer) must DELIVER that volume
// against a delivery schedule. A short delivery triggers a MAKE-GOOD obligation
// (re-deliver replacement reductions, or settle the gap). Where W37 registers a
// project, W11 verifies each monitoring period, W56 re-validates the crediting
// period, W17 retires the credit and W48 monetises the tax offset, THIS chain
// governs how reductions are SOLD FORWARD and physically delivered.
//
//   erpa_drafted → erpa_executed → delivery_scheduled → delivery_initiated →
//     delivery_verified → settled → completed.
//   shortfall/make-good: delivery_initiated → shortfall_flagged →
//     make_good_pending → (initiate_delivery) → delivery_initiated; or settle the gap.
//   dispute: delivery_verified | settled → disputed → (resolve_dispute) → settled.
//   terminate from any executed/active state; withdraw before performance begins.
//
// INVERTED SLA — the larger the forward sale, the LONGER every window. Single
// carbon-fund desk write; actor_party records the functional party (seller /
// buyer / registry) for audit. Reportability — the W65 signature is
// CORRESPONDING-ADJUSTMENT driven: a verified delivery of an Article 6 transfer
// (an ITMO needing an NDC correction) crosses to the regulator inbox for EVERY
// tier; voluntary/compliance verify, terminate and SLA breach cross for the
// large tiers (major + mega).

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
  | 'erpa_drafted' | 'erpa_executed' | 'delivery_scheduled' | 'delivery_initiated'
  | 'delivery_verified' | 'shortfall_flagged' | 'make_good_pending' | 'settled'
  | 'completed' | 'disputed' | 'terminated' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'mega';

type Standard = 'verra_vcs' | 'gold_standard' | 'article_6_4' | 'cdm';

type TransferType = 'article6' | 'voluntary' | 'compliance';

interface ErpaRow {
  [key: string]: unknown;
  id: string;
  erpa_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string;
  registry_standard: Standard;
  methodology_id: string | null;
  seller_party_id: string;
  seller_party_name: string;
  buyer_party_id: string;
  buyer_party_name: string;
  transfer_type: TransferType;
  volume_tier: Tier;
  contracted_volume_tco2e: number | null;
  delivered_volume_tco2e: number | null;
  shortfall_volume_tco2e: number | null;
  price_per_tco2e: number | null;
  contract_currency: string | null;
  contract_value: number | null;
  vintage_year: number | null;
  host_country: string | null;
  corresponding_adjustment_required: number;
  corresponding_adjustment_ref: string | null;
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  erpa_ref: string | null;
  delivery_ref: string | null;
  verification_ref: string | null;
  settlement_ref: string | null;
  dispute_ref: string | null;
  execution_basis: string | null;
  schedule_basis: string | null;
  delivery_basis: string | null;
  verification_basis: string | null;
  shortfall_basis: string | null;
  make_good_basis: string | null;
  settlement_basis: string | null;
  dispute_basis: string | null;
  termination_basis: string | null;
  reason_code: string | null;
  erpa_summary: string | null;
  chain_status: ChainStatus;
  drafted_at: string;
  executed_at: string | null;
  delivery_scheduled_at: string | null;
  delivery_initiated_at: string | null;
  delivery_verified_at: string | null;
  shortfall_flagged_at: string | null;
  make_good_pending_at: string | null;
  settled_at: string | null;
  completed_at: string | null;
  disputed_at: string | null;
  terminated_at: string | null;
  withdrawn_at: string | null;
  delivery_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: boolean;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  requires_ca_flag?: boolean;
  breach_crosses_regulator?: boolean;
}

interface KpiSummary {
  total: number;
  open_count: number;
  completed_count: number;
  terminated_count: number;
  withdrawn_count: number;
  in_delivery_count: number;
  shortfall_count: number;
  make_good_count: number;
  disputed_count: number;
  breached: number;
  reportable_total: number;
  ca_required_total: number;
  large_open: number;
  total_contracted_volume: number;
  total_delivered_volume: number;
  total_shortfall_volume: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'erpa_drafted',
  'erpa_executed',
  'delivery_scheduled',
  'delivery_initiated',
  'delivery_verified',
  'settled',
  'completed',
];

const BRANCH_STATES: readonly string[] = [
  'shortfall_flagged',
  'make_good_pending',
  'disputed',
  'terminated',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'minor',              label: 'Minor' },
  { key: 'moderate',           label: 'Moderate' },
  { key: 'material',           label: 'Material' },
  { key: 'major',              label: 'Major' },
  { key: 'mega',               label: 'Mega' },
  { key: 'article6',           label: 'Article 6' },
  { key: 'in_delivery',        label: 'In delivery' },
  { key: 'shortfall',          label: 'Shortfall' },
  { key: 'make_good',          label: 'Make-good' },
  { key: 'disputed',           label: 'Disputed' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'erpa_drafted',       label: 'Drafted' },
  { key: 'erpa_executed',      label: 'Executed' },
  { key: 'delivery_scheduled', label: 'Scheduled' },
  { key: 'delivery_initiated', label: 'Initiated' },
  { key: 'delivery_verified',  label: 'Verified' },
  { key: 'settled',            label: 'Settled' },
  { key: 'completed',          label: 'Completed' },
  { key: 'terminated',         label: 'Terminated' },
  { key: 'withdrawn',          label: 'Withdrawn' },
];

// ── action helpers ────────────────────────────────────────────────────────
const TERMINAL_STATES: ChainStatus[] = ['completed', 'terminated', 'withdrawn'];
const IN_DELIVERY_STATES: ChainStatus[] = ['delivery_scheduled', 'delivery_initiated', 'delivery_verified'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['erpa_drafted', 'erpa_executed'];
const TERMINABLE_STATES: ChainStatus[] = [
  'erpa_executed', 'delivery_scheduled', 'delivery_initiated', 'delivery_verified',
  'shortfall_flagged', 'make_good_pending', 'disputed',
];
const DISPUTABLE_STATES: ChainStatus[] = ['delivery_verified', 'settled'];

const STANDARD_LABEL: Record<Standard, string> = {
  verra_vcs:    'Verra VCS',
  gold_standard:'Gold Standard',
  article_6_4:  'Article 6.4',
  cdm:          'CDM',
};

const TRANSFER_LABEL: Record<TransferType, string> = {
  article6:   'Article 6 (ITMO)',
  voluntary:  'Voluntary',
  compliance: 'Compliance',
};

const TIER_LABEL: Record<Tier, string> = {
  minor:    'Minor (<10k)',
  moderate: 'Moderate (<100k)',
  material: 'Material (<500k)',
  major:    'Major (<2m)',
  mega:     'Mega (≥2m)',
};

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
  if (!n) return '—';
  return `${n.toLocaleString('en-ZA')} tCO₂e`;
}

function fmtMoney(n: number | null | undefined, ccy: string | null | undefined): string {
  if (!n) return '—';
  return `${ccy || ''} ${n.toLocaleString('en-ZA')}`.trim();
}

function getActions(row: ErpaRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const status = row.chain_status;

  // Primary forward action per state
  if (status === 'erpa_drafted') {
    actions.push({
      key: 'execute-erpa',
      label: 'Execute ERPA (seller)',
      fields: [
        {
          key: 'execution_basis',
          label: 'Execution basis — the ERPA signed between buyer and seller for the forward purchase of emission reductions',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'erpa_ref',
          label: 'ERPA reference (e.g. ERPA-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.erpa_ref ?? '',
        },
        {
          key: 'contracted_volume_tco2e',
          label: 'Contracted volume (tCO₂e — re-derives the tier)',
          type: 'number',
          required: false,
          placeholder: String(row.contracted_volume_tco2e ?? ''),
        },
        {
          key: 'price_per_tco2e',
          label: 'Price per tCO₂e',
          type: 'number',
          required: false,
          placeholder: String(row.price_per_tco2e ?? ''),
        },
        {
          key: 'contract_currency',
          label: 'Contract currency (ZAR / USD / EUR)',
          type: 'text',
          required: false,
          placeholder: row.contract_currency ?? 'USD',
        },
        {
          key: 'vintage_year',
          label: 'Credit vintage year',
          type: 'number',
          required: false,
          placeholder: String(row.vintage_year ?? ''),
        },
        {
          key: 'host_country',
          label: 'Host country (NDC for corresponding adjustment)',
          type: 'text',
          required: false,
          placeholder: row.host_country ?? '',
        },
        {
          key: 'delivery_window_start',
          label: 'Delivery window start',
          type: 'date',
          required: false,
          placeholder: row.delivery_window_start ?? '',
        },
        {
          key: 'delivery_window_end',
          label: 'Delivery window end',
          type: 'date',
          required: false,
          placeholder: row.delivery_window_end ?? '',
        },
      ],
      // Article 6 verify_delivery crosses ALL; voluntory/compliance cross large tiers. No crossing on execute itself.
      cascadeTo: [],
    });
  }

  if (status === 'erpa_executed') {
    actions.push({
      key: 'schedule-delivery',
      label: 'Schedule delivery (seller)',
      fields: [
        {
          key: 'schedule_basis',
          label: 'Schedule basis — the agreed delivery schedule against which the seller must deliver',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'delivery_window_start',
          label: 'Delivery window start',
          type: 'date',
          required: false,
          placeholder: row.delivery_window_start ?? '',
        },
        {
          key: 'delivery_window_end',
          label: 'Delivery window end',
          type: 'date',
          required: false,
          placeholder: row.delivery_window_end ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'delivery_scheduled' || status === 'make_good_pending') {
    actions.push({
      key: 'initiate-delivery',
      label: 'Initiate delivery (seller)',
      fields: [
        {
          key: 'delivery_basis',
          label: 'Delivery basis — the tranche of reductions the seller is delivering against the schedule',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'delivery_ref',
          label: 'Delivery reference (e.g. DEL-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.delivery_ref ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'delivery_initiated') {
    // Primary: verify delivery
    actions.push({
      key: 'verify-delivery',
      label: 'Verify delivery (buyer)',
      fields: [
        {
          key: 'verification_basis',
          label: 'Verification basis — buyer confirmation the delivered reductions match the contracted tranche',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'verification_ref',
          label: 'Verification reference (e.g. VER-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.verification_ref ?? '',
        },
        {
          key: 'delivered_volume_tco2e',
          label: 'Delivered volume (tCO₂e) this verification',
          type: 'number',
          required: false,
          placeholder: String(row.delivered_volume_tco2e ?? ''),
        },
        {
          key: 'corresponding_adjustment_ref',
          label: 'Corresponding-adjustment reference (Article 6 only — the NDC authorisation applied at delivery)',
          type: 'text',
          required: false,
          placeholder: row.corresponding_adjustment_ref ?? '',
        },
      ],
      // Article 6: crosses regulator EVERY tier; voluntary/compliance cross large tiers (major+mega)
      cascadeTo: row.transfer_type === 'article6' ? ['regulator'] : [],
    });

    // Secondary: flag shortfall
    actions.push({
      key: 'flag-shortfall',
      label: 'Flag shortfall (buyer)',
      fields: [
        {
          key: 'shortfall_basis',
          label: 'Shortfall basis — the delivered volume falls short of the contracted tranche',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'delivered_volume_tco2e',
          label: 'Delivered volume so far (tCO₂e)',
          type: 'number',
          required: false,
          placeholder: String(row.delivered_volume_tco2e ?? ''),
        },
        {
          key: 'shortfall_volume_tco2e',
          label: 'Shortfall volume (tCO₂e — leave blank to derive contracted − delivered)',
          type: 'number',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'shortfall_flagged') {
    actions.push({
      key: 'initiate-make-good',
      label: 'Initiate make-good (seller)',
      fields: [
        {
          key: 'make_good_basis',
          label: 'Make-good basis — the seller obligation to deliver replacement reductions for the shortfall',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });

    // Secondary: settle the gap directly
    actions.push({
      key: 'settle',
      label: 'Settle (buyer)',
      fields: [
        {
          key: 'settlement_basis',
          label: 'Settlement basis — payment for the delivered reductions (or settlement of the shortfall gap)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'settlement_ref',
          label: 'Settlement reference (e.g. SET-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.settlement_ref ?? '',
        },
        {
          key: 'erpa_summary',
          label: 'ERPA summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: row.erpa_summary ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'make_good_pending') {
    // Secondary: settle the gap directly from make_good_pending too
    actions.push({
      key: 'settle',
      label: 'Settle (buyer)',
      fields: [
        {
          key: 'settlement_basis',
          label: 'Settlement basis — payment for the delivered reductions (or settlement of the shortfall gap)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'settlement_ref',
          label: 'Settlement reference (e.g. SET-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.settlement_ref ?? '',
        },
        {
          key: 'erpa_summary',
          label: 'ERPA summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: row.erpa_summary ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'delivery_verified') {
    actions.push({
      key: 'settle',
      label: 'Settle (buyer)',
      fields: [
        {
          key: 'settlement_basis',
          label: 'Settlement basis — payment for the delivered reductions (or settlement of the shortfall gap)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'settlement_ref',
          label: 'Settlement reference (e.g. SET-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.settlement_ref ?? '',
        },
        {
          key: 'erpa_summary',
          label: 'ERPA summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: row.erpa_summary ?? '',
        },
      ],
      cascadeTo: [],
    });

    actions.push({
      key: 'raise-dispute',
      label: 'Raise dispute (buyer)',
      fields: [
        {
          key: 'dispute_basis',
          label: 'Dispute basis — what the buyer/seller contests in the verified delivery or settlement',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'dispute_ref',
          label: 'Dispute reference (e.g. DSP-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.dispute_ref ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'settled') {
    actions.push({
      key: 'complete',
      label: 'Complete ERPA (registry)',
      fields: [
        {
          key: 'erpa_summary',
          label: 'Completion summary — the ERPA is fully delivered and settled (registry close-out)',
          type: 'textarea',
          required: false,
          placeholder: row.erpa_summary ?? '',
        },
      ],
      cascadeTo: [],
    });

    actions.push({
      key: 'raise-dispute',
      label: 'Raise dispute (buyer)',
      fields: [
        {
          key: 'dispute_basis',
          label: 'Dispute basis — what the buyer/seller contests in the verified delivery or settlement',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'dispute_ref',
          label: 'Dispute reference (e.g. DSP-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.dispute_ref ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (status === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute (registry)',
      fields: [
        {
          key: 'dispute_basis',
          label: 'Resolution basis — how the dispute was resolved (registry), settling the ERPA',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'settlement_ref',
          label: 'Settlement reference (e.g. SET-2026-0007)',
          type: 'text',
          required: false,
          placeholder: row.settlement_ref ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  // Terminate — available from any executed/active state
  if (TERMINABLE_STATES.includes(status)) {
    actions.push({
      key: 'terminate',
      label: 'Terminate (seller)',
      fields: [
        {
          key: 'termination_basis',
          label: 'Termination basis — early exit of the executed contract (default / force majeure / non-delivery)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. non_delivery / force_majeure / buyer_default)',
          type: 'text',
          required: false,
          placeholder: 'non_delivery',
        },
      ],
      // voluntary/compliance terminate cross large tiers (major+mega); article6 crosses ALL
      cascadeTo: (row.transfer_type === 'article6' || row.volume_tier === 'major' || row.volume_tier === 'mega')
        ? ['regulator']
        : [],
    });
  }

  // Withdraw — available before performance begins
  if (WITHDRAWABLE_STATES.includes(status)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (seller)',
      fields: [
        {
          key: 'reason_code',
          label: 'Withdrawal reason — why the ERPA is pulled before performance begins',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

function renderDetail(row: ErpaRow): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <DetailPair label="State"               value={row.chain_status.replace(/_/g, ' ')} />
        <DetailPair label="Tier"                value={TIER_LABEL[row.volume_tier]} />
        <DetailPair label="Standard"            value={STANDARD_LABEL[row.registry_standard]} />
        <DetailPair label="Transfer type"       value={TRANSFER_LABEL[row.transfer_type]} />
        <DetailPair label="Methodology"         value={row.methodology_id ?? '—'} />
        <DetailPair label="Host country"        value={row.host_country ?? '—'} />
        <DetailPair label="Corresp. adjustment" value={row.requires_ca_flag ? 'Required (Article 6)' : 'Not required'} />
        <DetailPair label="CA reference"        value={row.corresponding_adjustment_ref ?? '—'} />
        <DetailPair label="Seller"              value={row.seller_party_name} />
        <DetailPair label="Buyer"               value={row.buyer_party_name} />
        <DetailPair label="Contracted volume"   value={fmtTco2e(row.contracted_volume_tco2e)} />
        <DetailPair label="Delivered volume"    value={fmtTco2e(row.delivered_volume_tco2e)} />
        <DetailPair label="Shortfall volume"    value={fmtTco2e(row.shortfall_volume_tco2e)} />
        <DetailPair label="Price / tCO₂e"       value={fmtMoney(row.price_per_tco2e, row.contract_currency)} />
        <DetailPair label="Contract value"      value={fmtMoney(row.contract_value, row.contract_currency)} />
        <DetailPair label="Vintage year"        value={row.vintage_year ? String(row.vintage_year) : '—'} />
        <DetailPair label="Delivery window"     value={`${fmtDate(row.delivery_window_start)} → ${fmtDate(row.delivery_window_end)}`} />
        <DetailPair label="Delivery round"      value={String(row.delivery_round)} />
        <DetailPair label="ERPA ref"            value={row.erpa_ref ?? '—'} />
        <DetailPair label="Delivery ref"        value={row.delivery_ref ?? '—'} />
        <DetailPair label="Verification ref"    value={row.verification_ref ?? '—'} />
        <DetailPair label="Settlement ref"      value={row.settlement_ref ?? '—'} />
        <DetailPair label="Dispute ref"         value={row.dispute_ref ?? '—'} />
        <DetailPair label="Reason code"         value={row.reason_code ?? '—'} />
        <DetailPair label="Drafted"             value={fmtDate(row.drafted_at)} />
        <DetailPair label="Executed"            value={fmtDate(row.executed_at)} />
        <DetailPair label="Delivery scheduled"  value={fmtDate(row.delivery_scheduled_at)} />
        <DetailPair label="Delivery initiated"  value={fmtDate(row.delivery_initiated_at)} />
        <DetailPair label="Delivery verified"   value={fmtDate(row.delivery_verified_at)} />
        <DetailPair label="Shortfall flagged"   value={fmtDate(row.shortfall_flagged_at)} />
        <DetailPair label="Make-good pending"   value={fmtDate(row.make_good_pending_at)} />
        <DetailPair label="Settled"             value={fmtDate(row.settled_at)} />
        <DetailPair label="Completed"           value={fmtDate(row.completed_at)} />
        <DetailPair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl"      value={String(row.escalation_level)} />
        <DetailPair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
        {row.source_wave && (
          <DetailPair label="Source wave"       value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />
        )}
      </div>

      {row.erpa_summary && (
        <BasisBlock label="ERPA summary" text={row.erpa_summary} />
      )}
      {row.execution_basis && (
        <BasisBlock label="Execution basis" text={row.execution_basis} />
      )}
      {row.schedule_basis && (
        <BasisBlock label="Schedule basis" text={row.schedule_basis} />
      )}
      {row.delivery_basis && (
        <BasisBlock label="Delivery basis" text={row.delivery_basis} tone="warn" />
      )}
      {row.verification_basis && (
        <BasisBlock label="Verification basis (buyer)" text={row.verification_basis} tone="warn" />
      )}
      {row.shortfall_basis && (
        <BasisBlock label="Shortfall basis" text={row.shortfall_basis} tone="bad" />
      )}
      {row.make_good_basis && (
        <BasisBlock label="Make-good basis" text={row.make_good_basis} tone="bad" />
      )}
      {row.settlement_basis && (
        <BasisBlock label="Settlement basis" text={row.settlement_basis} tone="ok" />
      )}
      {row.dispute_basis && (
        <BasisBlock label="Dispute basis" text={row.dispute_basis} tone="bad" />
      )}
      {row.termination_basis && (
        <BasisBlock label="Termination basis" text={row.termination_basis} tone="bad" />
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function CarbonErpaChainTab() {
  const [rows, setRows] = useState<ErpaRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ErpaRow[] } & KpiSummary }>('/carbon-erpa/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setSummary({
          total: d.total,
          open_count: d.open_count,
          completed_count: d.completed_count,
          terminated_count: d.terminated_count,
          withdrawn_count: d.withdrawn_count,
          in_delivery_count: d.in_delivery_count,
          shortfall_count: d.shortfall_count,
          make_good_count: d.make_good_count,
          disputed_count: d.disputed_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          ca_required_total: d.ca_required_total,
          large_open: d.large_open,
          total_contracted_volume: d.total_contracted_volume,
          total_delivered_volume: d.total_delivered_volume,
          total_shortfall_volume: d.total_shortfall_volume,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load carbon ERPA records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/carbon-erpa/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/carbon-erpa/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: ErpaRow; events: ChainEvent[] } }>(`/carbon-erpa/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all')         return true;
      if (filter === 'active')      return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'in_delivery') return IN_DELIVERY_STATES.includes(r.chain_status);
      if (filter === 'shortfall')   return r.chain_status === 'shortfall_flagged';
      if (filter === 'make_good')   return r.chain_status === 'make_good_pending';
      if (filter === 'disputed')    return r.chain_status === 'disputed';
      if (filter === 'breached')    return !!r.sla_breached;
      if (filter === 'reportable')  return r.is_reportable;
      if (filter === 'article6')    return r.transfer_type === 'article6';
      if (filter === 'minor' || filter === 'moderate' || filter === 'material' || filter === 'major' || filter === 'mega') {
        return r.volume_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, completed_count: 0, terminated_count: 0,
    withdrawn_count: 0, in_delivery_count: 0, shortfall_count: 0, make_good_count: 0,
    disputed_count: 0, breached: 0, reportable_total: 0, ca_required_total: 0,
    large_open: 0, total_contracted_volume: 0, total_delivered_volume: 0, total_shortfall_volume: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Carbon ERPA — forward delivery &amp; make-good</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage forward-sale chain · drafted → executed → delivery scheduled → delivery initiated →
          delivery verified → settled → completed. A short delivery flags a shortfall and a make-good obligation
          (re-deliver, or settle the gap); a verified delivery or settlement can be disputed and resolved; an
          executed contract can be terminated, and a drafted/executed ERPA withdrawn before performance. The
          commercial counterpart to the carbon-credit lifecycle — how a buyer contracts a project's future
          reductions and the seller delivers them against a binding schedule. INVERTED SLA: the larger the forward
          sale, the longer every window. The W65 signature is corresponding-adjustment driven — a verified delivery
          of an Article 6 transfer (an ITMO needing an NDC correction) crosses to the regulator inbox for every
          tier; voluntary/compliance verification, termination and SLA breach cross for the large tiers (major + mega).
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"         value={kpis.total} />
        <KpiTile label="Open"          value={kpis.open_count} />
        <KpiTile label="Large open"    value={kpis.large_open}            tone={kpis.large_open > 0 ? 'warn' : undefined} />
        <KpiTile label="In delivery"   value={kpis.in_delivery_count}     tone={kpis.in_delivery_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Shortfall"     value={kpis.shortfall_count}       tone={kpis.shortfall_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Make-good"     value={kpis.make_good_count}       tone={kpis.make_good_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Disputed"      value={kpis.disputed_count}        tone={kpis.disputed_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"  value={kpis.breached}              tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Completed"     value={kpis.completed_count}       tone="ok" />
        <KpiTile label="Terminated"    value={kpis.terminated_count}      tone={kpis.terminated_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Article 6 (CA)" value={kpis.ca_required_total}   tone={kpis.ca_required_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Reportable"    value={kpis.reportable_total}      tone={kpis.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Contracted"    value={fmtTco2e(kpis.total_contracted_volume)} />
        <KpiTile label="Delivered"     value={fmtTco2e(kpis.total_delivered_volume)} />
        <KpiTile label="Shortfall vol" value={fmtTco2e(kpis.total_shortfall_volume)} tone={kpis.total_shortfall_volume > 0 ? 'warn' : undefined} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
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
              title={`${row.erpa_number}${row.is_reportable ? ' ●' : ''}`}
              meta={`${TIER_LABEL[row.volume_tier]} · ${TRANSFER_LABEL[row.transfer_type]} · ${row.project_name}`}
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
              No ERPAs match.
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

function BasisBlock({ label, text, tone }: { label: string; text: string; tone?: 'warn' | 'bad' | 'ok' }) {
  const borderColor = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : BORDER;
  const labelColor  = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX3;
  return (
    <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: labelColor }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: TX2, fontSize: 11 }}>{text}</div>
    </div>
  );
}

export default CarbonErpaChainTab;
