// Wave 70 — REC / Guarantee-of-Origin Certificate Lifecycle tab.
//
// A best-in-class offtaker does not just buy electricity — it buys (and must be
// able to PROVE it owns and has CONSUMED) the renewable ATTRIBUTE of that
// electricity. The attribute travels separately from the energy as a tradeable
// certificate, one per MWh of verified renewable generation (I-REC, SAREC / AReP,
// EU Guarantee-of-Origin). The offtaker RETIRES the certificate to substantiate a
// renewable-consumption claim under the GHG Protocol Scope 2 market-based method
// (RE100 / CDP / carbon-tax offset). The lifecycle integrity prevents DOUBLE
// COUNTING — one MWh attribute is issued once, owned by one party at a time, and
// retired once. Distinct from the rest of the offtaker suite, which all govern the
// ENERGY / MONEY relationship (W22 PPA exec, W32 take-or-pay, W39 tariff CPI, W46
// curtailment, W54 payment security, W62 termination); W70 governs the ATTRIBUTE.
//
//   issuance_requested → eligibility_review → issued → listed_for_transfer
//     → transferred → allocated → retired
//   eligibility fail:  eligibility_review → rejected
//   dispute:   {transferred, allocated} → disputed → allocated (dismissed)
//                                                  | clawed_back (upheld)
//   cancel:    {issuance_requested, issued, listed_for_transfer} → cancelled
//   expiry:    {issued, listed_for_transfer, transferred, allocated} → expired
//
// INVERTED SLA — the LARGER the volume / the more it is a compliance claim, the
// MORE time each verification window allows. Tier (5) by MWh represented with a
// compliance floor at major. Two-party write: the ISSUER / REGISTRY (generator +
// registry) drives issuance, eligibility, listing, transfer, dispute resolution,
// claw-back, cancel and expiry; the HOLDER (offtaker) allocates consumption,
// retires the certificate and raises integrity disputes. The W70 signature — a
// CLAWED-BACK certificate crosses to the regulator for EVERY tier (always a
// double-counting / integrity event); a rejected issuance and an SLA breach cross
// for the high tiers (major + critical).

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
  | 'issuance_requested' | 'eligibility_review' | 'issued' | 'listed_for_transfer'
  | 'transferred' | 'allocated' | 'retired' | 'cancelled'
  | 'rejected' | 'disputed' | 'clawed_back' | 'expired';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

interface RecRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  generator_id: string | null;
  generator_name: string | null;
  project_id: string | null;
  project_name: string | null;
  offtaker_id: string;
  offtaker_name: string;
  certificate_standard: string;
  energy_source: string | null;
  certificate_serial: string | null;
  vintage_year: number | null;
  generation_period_start: string | null;
  generation_period_end: string | null;
  mwh_represented: number | null;
  registry: string | null;
  claim_purpose: string | null;
  compliance_critical: number;
  double_counting_checked: number;
  severity_tier: Tier;
  issuer_id: string | null;
  issuer_name: string | null;
  holder_id: string | null;
  holder_name: string | null;
  issuance_ref: string | null;
  eligibility_ref: string | null;
  transfer_ref: string | null;
  allocation_ref: string | null;
  retirement_ref: string | null;
  dispute_ref: string | null;
  claim_certificate_number: string | null;
  eligibility_basis: string | null;
  issuance_basis: string | null;
  transfer_basis: string | null;
  allocation_basis: string | null;
  retirement_basis: string | null;
  dispute_basis: string | null;
  clawback_basis: string | null;
  rejection_basis: string | null;
  reason_code: string | null;
  resolution_summary: string | null;
  chain_status: ChainStatus;
  issuance_requested_at: string;
  eligibility_review_at: string | null;
  issued_at: string | null;
  listed_for_transfer_at: string | null;
  transferred_at: string | null;
  allocated_at: string | null;
  retired_at: string | null;
  cancelled_at: string | null;
  rejected_at: string | null;
  disputed_at: string | null;
  clawed_back_at: string | null;
  expired_at: string | null;
  vintage_expiry_at: string | null;
  dispute_round: number;
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
  breach_crosses_regulator?: boolean;
}

interface RecEvent {
  id: string;
  rec_id: string;
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
  retired_count: number;
  disputed_count: number;
  clawed_back_count: number;
  rejected_count: number;
  expired_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  compliance_open: number;
  high_open: number;
  total_mwh: number;
  retired_mwh: number;
  clawed_back_mwh: number;
}

const STANDARD_LABEL: Record<string, string> = {
  i_rec:               'I-REC',
  sarec:               'SAREC',
  arep:                'AReP',
  guarantee_of_origin: 'Guarantee of Origin',
  other:               'Other',
};

const SOURCE_LABEL: Record<string, string> = {
  solar_pv: 'Solar PV',
  wind:     'Wind',
  hydro:    'Hydro',
  biomass:  'Biomass',
  biogas:   'Biogas',
  csp:      'CSP',
  other:    'Other',
};

const REGISTRY_LABEL: Record<string, string> = {
  i_rec_registry:    'I-REC Registry',
  national_registry: 'National registry',
  strate:            'STRATE',
  contractual:       'Contractual',
  other:             'Other',
};

const PURPOSE_LABEL: Record<string, string> = {
  re100:                 'RE100',
  scope2_market_based:   'Scope 2 (market-based)',
  carbon_tax_offset:     'Carbon-tax offset',
  voluntary:             'Voluntary',
  compliance_obligation: 'Compliance obligation',
  other:                 'Other',
};

const TIER_LABEL: Record<Tier, string> = {
  minor:    'Minor (<1k MWh)',
  moderate: 'Moderate (<10k MWh)',
  material: 'Material (<50k MWh)',
  major:    'Major (<200k MWh)',
  critical: 'Critical (≥200k MWh)',
};

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'issuance_requested',
  'eligibility_review',
  'issued',
  'listed_for_transfer',
  'transferred',
  'allocated',
  'retired',
];

const BRANCH_STATES: readonly string[] = [
  'rejected',
  'disputed',
  'clawed_back',
  'cancelled',
  'expired',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                label: 'Open' },
  { key: 'all',                 label: 'All' },
  { key: 'minor',               label: 'Minor' },
  { key: 'moderate',            label: 'Moderate' },
  { key: 'material',            label: 'Material' },
  { key: 'major',               label: 'Major' },
  { key: 'critical',            label: 'Critical' },
  { key: 'issuance_requested',  label: 'Requested' },
  { key: 'eligibility_review',  label: 'Eligibility' },
  { key: 'issued',              label: 'Issued' },
  { key: 'listed_for_transfer', label: 'Listed' },
  { key: 'transferred',         label: 'Transferred' },
  { key: 'allocated',           label: 'Allocated' },
  { key: 'disputed',            label: 'Disputed' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'reportable',          label: 'Reportable' },
  { key: 'retired',             label: 'Retired' },
  { key: 'clawed_back',         label: 'Clawed back' },
  { key: 'rejected',            label: 'Rejected' },
  { key: 'expired',             label: 'Expired' },
  { key: 'cancelled',           label: 'Cancelled' },
];

const TERMINAL_STATES: ChainStatus[] = ['retired', 'cancelled', 'rejected', 'clawed_back', 'expired'];

// ── helpers ───────────────────────────────────────────────────────────────
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

function fmtMwh(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}m MWh`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k MWh`;
  return `${n.toLocaleString('en-ZA')} MWh`;
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: RecRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'issuance_requested') {
    actions.push({
      key: 'begin-eligibility-review',
      label: 'Begin eligibility review (issuer/registry)',
      fields: [
        {
          key: 'eligibility_basis',
          label: 'Eligibility basis — accreditation / vintage / metering check on the generation',
          type: 'textarea',
          required: true,
        },
        {
          key: 'eligibility_ref',
          label: 'Eligibility reference (e.g. ELG-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'mwh_represented',
          label: 'MWh represented (restate certified volume)',
          type: 'number',
          required: false,
          placeholder: String(row.mwh_represented ?? ''),
        },
        {
          key: 'compliance_critical',
          label: 'Compliance / regulatory claim (carbon-tax offset / mandated obligation)? (1 = yes, 0 = no)',
          type: 'text',
          required: false,
          placeholder: String(row.compliance_critical ?? '0'),
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'cancel-certificate',
      label: 'Cancel certificate (issuer/registry)',
      fields: [
        {
          key: 'reason_code',
          label: 'Cancellation reason — certificate withdrawn before issuance / listing (voluntary)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'eligibility_review') {
    actions.push({
      key: 'approve-issuance',
      label: 'Approve issuance (issuer/registry)',
      fields: [
        {
          key: 'issuance_basis',
          label: 'Issuance basis — the registry issuing the certificate against verified generation',
          type: 'textarea',
          required: true,
        },
        {
          key: 'issuance_ref',
          label: 'Issuance reference (e.g. ISS-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'certificate_serial',
          label: 'Certificate serial (registry-assigned)',
          type: 'text',
          required: false,
          placeholder: row.certificate_serial ?? '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'reject-issuance',
      label: 'Reject — eligibility fail (issuer/registry)',
      fields: [
        {
          key: 'rejection_basis',
          label: 'Rejection basis — why eligibility failed (accreditation / vintage / metering)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. eligibility_fail / vintage_lapsed / metering_gap)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      // reject-issuance crosses regulator for major + critical
      cascadeTo: (row.severity_tier === 'major' || row.severity_tier === 'critical') ? ['regulator'] : [],
    });
  }

  if (s === 'issued') {
    actions.push({
      key: 'list-for-transfer',
      label: 'List for transfer (issuer/registry)',
      fields: [
        {
          key: 'transfer_basis',
          label: 'Listing basis — putting the issued certificate up for transfer to the offtaker',
          type: 'textarea',
          required: true,
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'cancel-certificate',
      label: 'Cancel certificate (issuer/registry)',
      fields: [
        {
          key: 'reason_code',
          label: 'Cancellation reason — certificate withdrawn before issuance / listing (voluntary)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'expire-certificate',
      label: 'Expire — vintage lapse (issuer/registry)',
      fields: [
        {
          key: 'reason_code',
          label: 'Expiry reason — the certificate vintage has lapsed (no longer claimable)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'listed_for_transfer') {
    actions.push({
      key: 'transfer-certificate',
      label: 'Transfer certificate (issuer/registry)',
      fields: [
        {
          key: 'transfer_basis',
          label: 'Transfer basis — moving ownership of the certificate to the holder',
          type: 'textarea',
          required: true,
        },
        {
          key: 'transfer_ref',
          label: 'Transfer reference (e.g. TRF-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'holder_id',
          label: 'Holder id (the offtaker now owning the certificate)',
          type: 'text',
          required: false,
          placeholder: row.holder_id ?? '',
        },
        {
          key: 'holder_name',
          label: 'Holder name',
          type: 'text',
          required: false,
          placeholder: row.holder_name ?? row.offtaker_name ?? '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'cancel-certificate',
      label: 'Cancel certificate (issuer/registry)',
      fields: [
        {
          key: 'reason_code',
          label: 'Cancellation reason — certificate withdrawn before issuance / listing (voluntary)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'expire-certificate',
      label: 'Expire — vintage lapse (issuer/registry)',
      fields: [
        {
          key: 'reason_code',
          label: 'Expiry reason — the certificate vintage has lapsed (no longer claimable)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'transferred') {
    actions.push({
      key: 'allocate-consumption',
      label: 'Allocate consumption (offtaker/holder)',
      fields: [
        {
          key: 'allocation_basis',
          label: 'Allocation basis — matching the certificate to a consumption period / reporting boundary',
          type: 'textarea',
          required: true,
        },
        {
          key: 'allocation_ref',
          label: 'Allocation reference (e.g. ALC-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'raise-dispute',
      label: 'Raise integrity dispute (offtaker/holder)',
      fields: [
        {
          key: 'dispute_basis',
          label: 'Dispute basis — the integrity challenge (double counting / wrong vintage / metering error)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'dispute_ref',
          label: 'Dispute reference (e.g. DSP-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. double_counting / vintage_mismatch / metering_error)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'expire-certificate',
      label: 'Expire — vintage lapse (issuer/registry)',
      fields: [
        {
          key: 'reason_code',
          label: 'Expiry reason — the certificate vintage has lapsed (no longer claimable)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'allocated') {
    actions.push({
      key: 'retire-certificate',
      label: 'Retire certificate (offtaker/holder)',
      fields: [
        {
          key: 'retirement_basis',
          label: 'Retirement basis — the renewable-consumption claim being substantiated (RE100 / Scope 2 / carbon-tax)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'retirement_ref',
          label: 'Retirement reference (e.g. RET-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'claim_certificate_number',
          label: 'Claim certificate number (the retirement claim record)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'raise-dispute',
      label: 'Raise integrity dispute (offtaker/holder)',
      fields: [
        {
          key: 'dispute_basis',
          label: 'Dispute basis — the integrity challenge (double counting / wrong vintage / metering error)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'dispute_ref',
          label: 'Dispute reference (e.g. DSP-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. double_counting / vintage_mismatch / metering_error)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'expire-certificate',
      label: 'Expire — vintage lapse (issuer/registry)',
      fields: [
        {
          key: 'reason_code',
          label: 'Expiry reason — the certificate vintage has lapsed (no longer claimable)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute — restore (issuer/registry)',
      fields: [
        {
          key: 'dispute_basis',
          label: 'Resolution basis — dismissing the dispute and restoring the certificate to allocated',
          type: 'textarea',
          required: true,
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'claw-back',
      label: 'Claw back — revoke (issuer/registry)',
      fields: [
        {
          key: 'clawback_basis',
          label: 'Claw-back basis — upholding the dispute and revoking the certificate (double-counting / fraud)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. double_counting / fraudulent_issuance / metering_void)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'resolution_summary',
          label: 'Resolution summary (one line for the audit record)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
      // claw_back crosses regulator EVERY tier — signature action
      cascadeTo: ['regulator'],
    });
  }

  return actions;
}

// ── renderDetail ──────────────────────────────────────────────────────────
function renderDetail(row: RecRow): React.ReactNode {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <DetailPair label="State"               value={row.chain_status.replace(/_/g, ' ')} />
        <DetailPair label="Tier"                value={TIER_LABEL[row.severity_tier]} />
        <DetailPair label="Standard"            value={STANDARD_LABEL[row.certificate_standard] ?? row.certificate_standard} />
        <DetailPair label="Energy source"       value={row.energy_source ? (SOURCE_LABEL[row.energy_source] ?? row.energy_source) : '—'} />
        <DetailPair label="Registry"            value={row.registry ? (REGISTRY_LABEL[row.registry] ?? row.registry) : '—'} />
        <DetailPair label="Claim purpose"       value={row.claim_purpose ? (PURPOSE_LABEL[row.claim_purpose] ?? row.claim_purpose) : '—'} />
        <DetailPair label="MWh represented"     value={fmtMwh(row.mwh_represented)} />
        <DetailPair label="Vintage year"        value={row.vintage_year != null ? String(row.vintage_year) : '—'} />
        <DetailPair label="Generation period"   value={row.generation_period_start ? `${fmtDate(row.generation_period_start)} → ${fmtDate(row.generation_period_end)}` : '—'} />
        <DetailPair label="Certificate serial"  value={row.certificate_serial ?? '—'} />
        <DetailPair label="Compliance claim"    value={row.compliance_critical ? 'Yes' : 'No'} />
        <DetailPair label="Double-counting check" value={row.double_counting_checked ? 'Complete' : 'Pending'} />
        <DetailPair label="Issuance ref"        value={row.issuance_ref ?? '—'} />
        <DetailPair label="Eligibility ref"     value={row.eligibility_ref ?? '—'} />
        <DetailPair label="Transfer ref"        value={row.transfer_ref ?? '—'} />
        <DetailPair label="Allocation ref"      value={row.allocation_ref ?? '—'} />
        <DetailPair label="Retirement ref"      value={row.retirement_ref ?? '—'} />
        <DetailPair label="Dispute ref"         value={row.dispute_ref ?? '—'} />
        <DetailPair label="Claim certificate #" value={row.claim_certificate_number ?? '—'} />
        <DetailPair label="Reason code"         value={row.reason_code ?? '—'} />
        <DetailPair label="Dispute round"       value={String(row.dispute_round)} />
        <DetailPair label="Issuer"              value={row.issuer_name ?? row.generator_name ?? '—'} />
        <DetailPair label="Holder"              value={row.holder_name ?? row.offtaker_name} />
        {row.generator_name && <DetailPair label="Generator"   value={row.generator_name} />}
        {row.project_name   && <DetailPair label="Project"     value={row.project_name} />}
        {row.source_wave    && <DetailPair label="Source wave" value={row.source_wave + (row.source_entity_id ? ` · ${row.source_entity_id}` : '')} />}
        <DetailPair label="Requested"           value={fmtDate(row.issuance_requested_at)} />
        <DetailPair label="Eligibility review"  value={fmtDate(row.eligibility_review_at)} />
        <DetailPair label="Issued"              value={fmtDate(row.issued_at)} />
        <DetailPair label="Listed"              value={fmtDate(row.listed_for_transfer_at)} />
        <DetailPair label="Transferred"         value={fmtDate(row.transferred_at)} />
        <DetailPair label="Allocated"           value={fmtDate(row.allocated_at)} />
        <DetailPair label="Retired"             value={fmtDate(row.retired_at)} />
        <DetailPair label="Disputed"            value={fmtDate(row.disputed_at)} />
        <DetailPair label="Clawed back"         value={fmtDate(row.clawed_back_at)} />
        <DetailPair label="Rejected"            value={fmtDate(row.rejected_at)} />
        <DetailPair label="Expired"             value={fmtDate(row.expired_at)} />
        <DetailPair label="Vintage expiry"      value={fmtDate(row.vintage_expiry_at)} />
        <DetailPair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl"      value={String(row.escalation_level)} />
        <DetailPair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
      </div>

      {row.resolution_summary && (
        <BasisBlock label="Resolution summary" text={row.resolution_summary} />
      )}
      {row.eligibility_basis && (
        <BasisBlock label="Eligibility basis" text={row.eligibility_basis} />
      )}
      {row.issuance_basis && (
        <BasisBlock label="Issuance basis" text={row.issuance_basis} />
      )}
      {row.transfer_basis && (
        <BasisBlock label="Transfer / listing basis" text={row.transfer_basis} />
      )}
      {row.allocation_basis && (
        <BasisBlock label="Allocation basis (holder)" text={row.allocation_basis} />
      )}
      {row.retirement_basis && (
        <BasisBlock label="Retirement basis (holder)" text={row.retirement_basis} />
      )}
      {row.dispute_basis && (
        <BasisBlock label="Dispute basis" text={row.dispute_basis} />
      )}
      {row.clawback_basis && (
        <BasisBlock label="Claw-back basis" text={row.clawback_basis} />
      )}
      {row.rejection_basis && (
        <BasisBlock label="Rejection basis" text={row.rejection_basis} />
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function RecLifecycleChainTab() {
  const [rows, setRows] = useState<RecRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RecRow[] } & KpiSummary }>('/rec-lifecycle/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setSummary({
          total: d.total,
          open_count: d.open_count,
          issued_count: d.issued_count,
          retired_count: d.retired_count,
          disputed_count: d.disputed_count,
          clawed_back_count: d.clawed_back_count,
          rejected_count: d.rejected_count,
          expired_count: d.expired_count,
          cancelled_count: d.cancelled_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          compliance_open: d.compliance_open,
          high_open: d.high_open,
          total_mwh: d.total_mwh,
          retired_mwh: d.retired_mwh,
          clawed_back_mwh: d.clawed_back_mwh,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load REC certificates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/rec-lifecycle/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/rec-lifecycle/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: RecRow; events: ChainEvent[] } }>(`/rec-lifecycle/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'minor' || filter === 'moderate' || filter === 'material' || filter === 'major' || filter === 'critical') {
        return r.severity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: 0, open_count: 0, issued_count: 0, retired_count: 0,
    disputed_count: 0, clawed_back_count: 0, rejected_count: 0,
    expired_count: 0, cancelled_count: 0, breached: 0,
    reportable_total: 0, compliance_open: 0, high_open: 0,
    total_mwh: 0, retired_mwh: 0, clawed_back_mwh: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          REC / Guarantee-of-Origin certificate lifecycle
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state renewable-attribute certificate chain (I-REC Standard · SAREC / AReP · EU Guarantee-of-Origin
          · GHG Protocol Scope 2 market-based method) · requested → eligibility → issued → listed → transferred
          → allocated → retired. The offtaker retires the certificate to substantiate a renewable-consumption
          claim (RE100 / CDP / carbon-tax offset); the lifecycle integrity prevents DOUBLE COUNTING. A failed
          eligibility review rejects the issuance; a post-issuance integrity challenge sends the certificate to
          dispute, then either restored (dismissed) or clawed back (revoked). INVERTED SLA: the larger the volume
          / the more it is a compliance claim, the more time each verification window allows. Two-party write —
          the issuer / registry drives issuance, listing, transfer, dispute resolution, claw-back, cancel and
          expiry; the holder (offtaker) allocates consumption, retires and raises integrity disputes. W70 signature:
          a CLAWED-BACK certificate crosses to the regulator for every tier.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"           value={kpis.total} />
        <KpiTile label="Open"            value={kpis.open_count}        tone={kpis.open_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Compliance open" value={kpis.compliance_open}   tone={kpis.compliance_open > 0 ? 'warn' : undefined} />
        <KpiTile label="High open"       value={kpis.high_open}         tone={kpis.high_open > 0 ? 'warn' : undefined} />
        <KpiTile label="Issued"          value={kpis.issued_count}      tone="ok" />
        <KpiTile label="Retired"         value={kpis.retired_count}     tone="ok" />
        <KpiTile label="Disputed"        value={kpis.disputed_count}    tone={kpis.disputed_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Clawed back"     value={kpis.clawed_back_count} tone={kpis.clawed_back_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"    value={kpis.breached}          tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable"      value={kpis.reportable_total}  tone={kpis.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Retired MWh"     value={fmtMwh(kpis.retired_mwh)}  tone="ok" />
        <KpiTile label="Total MWh"       value={fmtMwh(kpis.total_mwh)} />
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
        <div
          className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}
        >
          {err}
        </div>
      )}

      {loading ? (
        <div
          className="rounded border px-4 py-6 text-center text-[12px]"
          style={{ background: BG1, borderColor: BORDER, color: TX3 }}
        >
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
              title={`${row.case_number} — ${row.offtaker_name}`}
              meta={[
                TIER_LABEL[row.severity_tier],
                STANDARD_LABEL[row.certificate_standard] ?? row.certificate_standard,
                fmtMwh(row.mwh_represented),
                row.compliance_critical ? 'Compliance' : null,
                row.is_reportable ? 'Reportable' : null,
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
            <div
              className="rounded border px-4 py-6 text-center text-[12px]"
              style={{ background: BG1, borderColor: BORDER, color: TX3 }}
            >
              No certificates match.
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

function BasisBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="whitespace-pre-wrap text-[11px]" style={{ color: TX2 }}>{text}</div>
    </div>
  );
}

export default RecLifecycleChainTab;
