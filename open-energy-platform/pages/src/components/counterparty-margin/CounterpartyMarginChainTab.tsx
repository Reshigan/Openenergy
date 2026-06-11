// Wave 68 — Counterparty Margin Call & Default Management lifecycle tab.
//
// The clearing / risk desk of a best-in-class trading venue manages the
// COUNTERPARTY CREDIT and COLLATERAL relationship for every participant with an
// open position, per the Financial Markets Act 19/2012 (clearing houses / CCPs),
// the FSCA Conduct Standards and the CPMI-IOSCO PFMI (Principle 4 credit, 5
// collateral, 6 margin, 13 participant-default rules). This is the trading-side
// counterparty-default waterfall — distinct from W2 (market VaR), W9 (market-maker
// obligations), W29 (position limits), W36 (best execution / RFQ), W44 (trade-
// repository reporting), W52 (market-abuse surveillance) and W60 (algo
// certification). It is the desk that decides whether a member can keep trading.
//
//   limit_active → exposure_warning → margin_call_issued → collateral_received
//     → (cure_breach) → limit_active
//   restriction:  {exposure_warning, margin_call_issued} → position_restriction
//   cure_period:  {margin_call_issued, position_restriction} → cure_period
//   waterfall:    {cure_period, position_restriction} → default_declared → close_out
//                   → default_fund_draw → recovered | written_off
//                 close_out → recovered | written_off (collateral sufficient)
//   withdraw:     {exposure_warning, margin_call_issued} → withdrawn
//
// URGENT SLA — the LARGER the exposure tier, the TIGHTER every window. Tier (5) by
// exposure-at-risk in ZAR with a systemic-importance (SIFI) floor at major. Single
// write: the clearing house / risk desk (trader role) drives every step; the member
// posts collateral out-of-band. The W68 signature — a declared default crosses to
// the regulator for EVERY tier; a default-fund draw, a write-off and an SLA breach
// cross for the large tiers (major + systemic).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

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
  | 'limit_active' | 'exposure_warning' | 'margin_call_issued' | 'collateral_received'
  | 'position_restriction' | 'cure_period' | 'default_declared' | 'close_out'
  | 'default_fund_draw' | 'recovered' | 'written_off' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'systemic';

interface MarginRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  counterparty_id: string;
  counterparty_name: string;
  member_code: string | null;
  account_type: 'house' | 'client' | 'omnibus' | null;
  systemically_important: number;
  product_class: string | null;
  exposure_zar: number | null;
  collateral_held_zar: number | null;
  margin_call_zar: number | null;
  collateral_posted_zar: number | null;
  shortfall_zar: number | null;
  default_fund_draw_zar: number | null;
  recovery_zar: number | null;
  write_off_zar: number | null;
  utilisation_pct: number | null;
  severity_tier: Tier;
  clearing_party_id: string | null;
  clearing_party_name: string | null;
  member_party_id: string | null;
  member_party_name: string | null;
  warning_ref: string | null;
  margin_call_ref: string | null;
  collateral_ref: string | null;
  restriction_ref: string | null;
  cure_ref: string | null;
  default_ref: string | null;
  close_out_ref: string | null;
  default_fund_ref: string | null;
  warning_basis: string | null;
  margin_call_basis: string | null;
  collateral_basis: string | null;
  restriction_basis: string | null;
  cure_basis: string | null;
  default_basis: string | null;
  close_out_basis: string | null;
  default_fund_basis: string | null;
  recovery_basis: string | null;
  write_off_basis: string | null;
  reason_code: string | null;
  resolution_summary: string | null;
  chain_status: ChainStatus;
  limit_active_at: string;
  exposure_warning_at: string | null;
  margin_call_issued_at: string | null;
  collateral_received_at: string | null;
  position_restriction_at: string | null;
  cure_period_at: string | null;
  default_declared_at: string | null;
  close_out_at: string | null;
  default_fund_draw_at: string | null;
  recovered_at: string | null;
  written_off_at: string | null;
  withdrawn_at: string | null;
  cure_round: number;
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

interface KpiSummary {
  total: number;
  active_count: number;
  open_count: number;
  default_count: number;
  close_out_count: number;
  fund_draw_count: number;
  recovered_count: number;
  written_off_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  high_open: number;
  total_exposure_zar: number;
  total_fund_draw_zar: number;
  total_write_off_zar: number;
}

const ALL_STATES = [
  'limit_active',
  'exposure_warning',
  'margin_call_issued',
  'collateral_received',
  'position_restriction',
  'cure_period',
  'default_declared',
  'close_out',
  'default_fund_draw',
] as const;

const BRANCH_STATES = ['recovered', 'written_off', 'withdrawn'] as const;

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',               label: 'Active' },
  { key: 'all',                  label: 'All' },
  { key: 'minor',                label: 'Minor' },
  { key: 'moderate',             label: 'Moderate' },
  { key: 'material',             label: 'Material' },
  { key: 'major',                label: 'Major' },
  { key: 'systemic',             label: 'Systemic' },
  { key: 'limit_active',         label: 'Limit active' },
  { key: 'exposure_warning',     label: 'Warning' },
  { key: 'margin_call_issued',   label: 'Margin call' },
  { key: 'collateral_received',  label: 'Collateral' },
  { key: 'position_restriction', label: 'Restricted' },
  { key: 'cure_period',          label: 'Cure period' },
  { key: 'default_declared',     label: 'Default' },
  { key: 'close_out',            label: 'Close-out' },
  { key: 'default_fund_draw',    label: 'Fund draw' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'reportable',           label: 'Reportable' },
  { key: 'recovered',            label: 'Recovered' },
  { key: 'written_off',          label: 'Written off' },
  { key: 'withdrawn',            label: 'Withdrawn' },
];

const TERMINAL_STATES: ChainStatus[] = ['recovered', 'written_off', 'withdrawn'];

const PRODUCT_LABEL: Record<string, string> = {
  power_forward:        'Power forward',
  power_spot:           'Power spot',
  carbon:               'Carbon',
  financial_derivative: 'Financial derivative',
  repo:                 'Repo',
  mixed:                'Mixed',
};

const TIER_LABEL: Record<Tier, string> = {
  minor:    'Minor (<R5m)',
  moderate: 'Moderate (<R50m)',
  material: 'Material (<R250m)',
  major:    'Major (<R1bn)',
  systemic: 'Systemic (≥R1bn)',
};

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}

function getActions(row: MarginRow): ChainAction[] {
  const s = row.chain_status;

  if (s === 'limit_active') {
    return [{
      key: 'issue-warning',
      label: 'Issue exposure warning (clearing house)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        { key: 'warning_basis',         label: 'Warning basis — why exposure is approaching the credit limit', type: 'textarea', required: true },
        { key: 'warning_ref',           label: 'Warning reference (e.g. WARN-2026-0011)', type: 'text', required: false },
        { key: 'exposure_zar',          label: 'Exposure at risk (ZAR)', type: 'text', required: false },
        { key: 'collateral_held_zar',   label: 'Collateral held (ZAR)', type: 'text', required: false },
        { key: 'utilisation_pct',       label: 'Utilisation %', type: 'text', required: false },
        { key: 'systemically_important', label: 'Systemically important counterparty? (yes/no)', type: 'text', required: false },
      ],
    }];
  }

  if (s === 'exposure_warning') {
    return [
      {
        key: 'issue-margin-call',
        label: 'Issue margin call (clearing house)',
        tone: 'warn',
        cascadeTo: [],
        fields: [
          { key: 'margin_call_basis', label: 'Margin-call basis — the shortfall the member must cover', type: 'textarea', required: true },
          { key: 'margin_call_ref',   label: 'Margin-call reference (e.g. MC-2026-0011)', type: 'text', required: false },
          { key: 'margin_call_zar',   label: 'Margin call amount (ZAR)', type: 'text', required: false },
        ],
      },
      {
        key: 'cure-breach',
        label: 'Cure breach — restore limit (clearing house)',
        tone: 'primary',
        cascadeTo: [],
        fields: [
          { key: 'reason_code',        label: 'Reason code (e.g. collateral_sufficient / exposure_reduced)', type: 'text', required: true },
          { key: 'resolution_summary', label: 'Resolution summary (one line for the audit record)', type: 'textarea', required: false },
        ],
      },
      {
        key: 'restrict-positions',
        label: 'Restrict positions (clearing house)',
        tone: 'warn',
        cascadeTo: [],
        fields: [
          { key: 'restriction_basis', label: 'Restriction basis — why the member may not increase positions', type: 'textarea', required: true },
          { key: 'restriction_ref',   label: 'Restriction reference (e.g. RES-2026-0011)', type: 'text', required: false },
          { key: 'reason_code',       label: 'Reason code (e.g. call_unmet / concentration_risk)', type: 'text', required: false },
        ],
      },
      {
        key: 'withdraw',
        label: 'Withdraw (clearing house)',
        tone: 'ghost',
        cascadeTo: [],
        fields: [
          { key: 'reason_code',        label: 'Withdrawal reason — false positive / position closed / netted out', type: 'text', required: true },
          { key: 'resolution_summary', label: 'Resolution summary (one line for the audit record)', type: 'textarea', required: false },
        ],
      },
    ];
  }

  if (s === 'margin_call_issued') {
    return [
      {
        key: 'record-collateral',
        label: 'Record collateral posted (member)',
        tone: 'primary',
        cascadeTo: [],
        fields: [
          { key: 'collateral_basis',    label: 'Collateral basis — what the member posted to meet the call', type: 'textarea', required: true },
          { key: 'collateral_ref',      label: 'Collateral reference (e.g. COL-2026-0011)', type: 'text', required: false },
          { key: 'collateral_posted_zar', label: 'Collateral posted (ZAR)', type: 'text', required: false },
        ],
      },
      {
        key: 'open-cure-period',
        label: 'Open cure period (clearing house)',
        tone: 'warn',
        cascadeTo: [],
        fields: [
          { key: 'cure_basis', label: 'Cure-period basis — the grace window granted to remedy the shortfall', type: 'textarea', required: true },
          { key: 'cure_ref',   label: 'Cure reference (e.g. CURE-2026-0011)', type: 'text', required: false },
        ],
      },
      {
        key: 'restrict-positions',
        label: 'Restrict positions (clearing house)',
        tone: 'warn',
        cascadeTo: [],
        fields: [
          { key: 'restriction_basis', label: 'Restriction basis — why the member may not increase positions', type: 'textarea', required: true },
          { key: 'restriction_ref',   label: 'Restriction reference (e.g. RES-2026-0011)', type: 'text', required: false },
          { key: 'reason_code',       label: 'Reason code (e.g. call_unmet / concentration_risk)', type: 'text', required: false },
        ],
      },
      {
        key: 'withdraw',
        label: 'Withdraw (clearing house)',
        tone: 'ghost',
        cascadeTo: [],
        fields: [
          { key: 'reason_code',        label: 'Withdrawal reason — false positive / position closed / netted out', type: 'text', required: true },
          { key: 'resolution_summary', label: 'Resolution summary (one line for the audit record)', type: 'textarea', required: false },
        ],
      },
    ];
  }

  if (s === 'collateral_received') {
    return [{
      key: 'cure-breach',
      label: 'Cure breach — restore limit (clearing house)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'reason_code',        label: 'Reason code (e.g. collateral_sufficient / exposure_reduced)', type: 'text', required: true },
        { key: 'resolution_summary', label: 'Resolution summary (one line for the audit record)', type: 'textarea', required: false },
      ],
    }];
  }

  if (s === 'position_restriction') {
    return [
      {
        key: 'open-cure-period',
        label: 'Open cure period (clearing house)',
        tone: 'warn',
        cascadeTo: [],
        fields: [
          { key: 'cure_basis', label: 'Cure-period basis — the grace window granted to remedy the shortfall', type: 'textarea', required: true },
          { key: 'cure_ref',   label: 'Cure reference (e.g. CURE-2026-0011)', type: 'text', required: false },
        ],
      },
      {
        key: 'issue-margin-call',
        label: 'Issue margin call (clearing house)',
        tone: 'warn',
        cascadeTo: [],
        fields: [
          { key: 'margin_call_basis', label: 'Margin-call basis — the shortfall the member must cover', type: 'textarea', required: true },
          { key: 'margin_call_ref',   label: 'Margin-call reference (e.g. MC-2026-0011)', type: 'text', required: false },
          { key: 'margin_call_zar',   label: 'Margin call amount (ZAR)', type: 'text', required: false },
        ],
      },
      {
        key: 'declare-default',
        label: 'Declare default (clearing house)',
        tone: 'danger',
        cascadeTo: ['regulator'],
        fields: [
          { key: 'default_basis',  label: 'Default basis — why the counterparty is declared in default', type: 'textarea', required: true },
          { key: 'default_ref',    label: 'Default reference (e.g. DEF-2026-0011)', type: 'text', required: false },
          { key: 'reason_code',    label: 'Reason code (e.g. call_unmet / cure_lapsed / insolvency)', type: 'text', required: false },
          { key: 'shortfall_zar',  label: 'Shortfall (ZAR)', type: 'text', required: false },
        ],
      },
    ];
  }

  if (s === 'cure_period') {
    return [
      {
        key: 'record-collateral',
        label: 'Record collateral posted (member)',
        tone: 'primary',
        cascadeTo: [],
        fields: [
          { key: 'collateral_basis',      label: 'Collateral basis — what the member posted to meet the call', type: 'textarea', required: true },
          { key: 'collateral_ref',        label: 'Collateral reference (e.g. COL-2026-0011)', type: 'text', required: false },
          { key: 'collateral_posted_zar', label: 'Collateral posted (ZAR)', type: 'text', required: false },
        ],
      },
      {
        key: 'declare-default',
        label: 'Declare default (clearing house)',
        tone: 'danger',
        cascadeTo: ['regulator'],
        fields: [
          { key: 'default_basis', label: 'Default basis — why the counterparty is declared in default', type: 'textarea', required: true },
          { key: 'default_ref',   label: 'Default reference (e.g. DEF-2026-0011)', type: 'text', required: false },
          { key: 'reason_code',   label: 'Reason code (e.g. call_unmet / cure_lapsed / insolvency)', type: 'text', required: false },
          { key: 'shortfall_zar', label: 'Shortfall (ZAR)', type: 'text', required: false },
        ],
      },
    ];
  }

  if (s === 'default_declared') {
    return [{
      key: 'begin-close-out',
      label: 'Begin close-out (clearing house)',
      tone: 'danger',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'close_out_basis', label: 'Close-out basis — the orderly liquidation of the defaulter positions', type: 'textarea', required: true },
        { key: 'close_out_ref',   label: 'Close-out reference (e.g. CO-2026-0011)', type: 'text', required: false },
        { key: 'shortfall_zar',   label: 'Residual shortfall after collateral (ZAR)', type: 'text', required: false },
      ],
    }];
  }

  if (s === 'close_out') {
    return [
      {
        key: 'record-recovery',
        label: 'Record recovery (clearing house)',
        tone: 'primary',
        cascadeTo: [],
        fields: [
          { key: 'recovery_basis',     label: 'Recovery basis — recovery from collateral / estate / fund replenishment', type: 'textarea', required: true },
          { key: 'recovery_zar',       label: 'Recovery amount (ZAR)', type: 'text', required: false },
          { key: 'resolution_summary', label: 'Resolution summary (one line for the audit record)', type: 'textarea', required: false },
        ],
      },
      {
        key: 'draw-default-fund',
        label: 'Draw default fund (clearing house)',
        tone: 'danger',
        cascadeTo: ['regulator'],
        fields: [
          { key: 'default_fund_basis',     label: 'Default-fund basis — the mutualised draw to cover the residual loss', type: 'textarea', required: true },
          { key: 'default_fund_ref',       label: 'Default-fund reference (e.g. DF-2026-0011)', type: 'text', required: false },
          { key: 'default_fund_draw_zar',  label: 'Default-fund draw (ZAR)', type: 'text', required: false },
        ],
      },
      {
        key: 'write-off',
        label: 'Write off loss (clearing house)',
        tone: 'danger',
        cascadeTo: ['regulator'],
        fields: [
          { key: 'write_off_basis',    label: 'Write-off basis — the unrecoverable residual loss', type: 'textarea', required: true },
          { key: 'write_off_zar',      label: 'Write-off amount (ZAR)', type: 'text', required: false },
          { key: 'reason_code',        label: 'Reason code (e.g. estate_exhausted / unrecoverable)', type: 'text', required: false },
          { key: 'resolution_summary', label: 'Resolution summary (one line for the audit record)', type: 'textarea', required: false },
        ],
      },
    ];
  }

  if (s === 'default_fund_draw') {
    return [
      {
        key: 'record-recovery',
        label: 'Record recovery (clearing house)',
        tone: 'primary',
        cascadeTo: [],
        fields: [
          { key: 'recovery_basis',     label: 'Recovery basis — recovery from collateral / estate / fund replenishment', type: 'textarea', required: true },
          { key: 'recovery_zar',       label: 'Recovery amount (ZAR)', type: 'text', required: false },
          { key: 'resolution_summary', label: 'Resolution summary (one line for the audit record)', type: 'textarea', required: false },
        ],
      },
      {
        key: 'write-off',
        label: 'Write off loss (clearing house)',
        tone: 'danger',
        cascadeTo: ['regulator'],
        fields: [
          { key: 'write_off_basis',    label: 'Write-off basis — the unrecoverable residual loss', type: 'textarea', required: true },
          { key: 'write_off_zar',      label: 'Write-off amount (ZAR)', type: 'text', required: false },
          { key: 'reason_code',        label: 'Reason code (e.g. estate_exhausted / unrecoverable)', type: 'text', required: false },
          { key: 'resolution_summary', label: 'Resolution summary (one line for the audit record)', type: 'textarea', required: false },
        ],
      },
    ];
  }

  return [];
}

function renderDetail(row: MarginRow): React.ReactNode {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
      <DetailPair label="State"               value={row.chain_status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
      <DetailPair label="Tier"                value={TIER_LABEL[row.severity_tier]} />
      <DetailPair label="Product class"       value={row.product_class ? (PRODUCT_LABEL[row.product_class] ?? row.product_class) : '—'} />
      <DetailPair label="Account type"        value={row.account_type ?? '—'} />
      <DetailPair label="Member code"         value={row.member_code ?? '—'} />
      <DetailPair label="Systemically important" value={row.systemically_important ? 'Yes' : 'No'} />
      <DetailPair label="Clearing party"      value={row.clearing_party_name ?? '—'} />
      <DetailPair label="Member party"        value={row.member_party_name ?? row.counterparty_name} />
      <DetailPair label="Exposure at risk"    value={fmtZar(row.exposure_zar)} />
      <DetailPair label="Collateral held"     value={fmtZar(row.collateral_held_zar)} />
      <DetailPair label="Margin call"         value={fmtZar(row.margin_call_zar)} />
      <DetailPair label="Collateral posted"   value={fmtZar(row.collateral_posted_zar)} />
      <DetailPair label="Shortfall"           value={fmtZar(row.shortfall_zar)} />
      <DetailPair label="Default-fund draw"   value={fmtZar(row.default_fund_draw_zar)} />
      <DetailPair label="Recovery"            value={fmtZar(row.recovery_zar)} />
      <DetailPair label="Write-off"           value={fmtZar(row.write_off_zar)} />
      <DetailPair label="Utilisation"         value={fmtPct(row.utilisation_pct)} />
      <DetailPair label="Warning ref"         value={row.warning_ref ?? '—'} />
      <DetailPair label="Margin-call ref"     value={row.margin_call_ref ?? '—'} />
      <DetailPair label="Collateral ref"      value={row.collateral_ref ?? '—'} />
      <DetailPair label="Restriction ref"     value={row.restriction_ref ?? '—'} />
      <DetailPair label="Cure ref"            value={row.cure_ref ?? '—'} />
      <DetailPair label="Default ref"         value={row.default_ref ?? '—'} />
      <DetailPair label="Close-out ref"       value={row.close_out_ref ?? '—'} />
      <DetailPair label="Default-fund ref"    value={row.default_fund_ref ?? '—'} />
      <DetailPair label="Reason code"         value={row.reason_code ?? '—'} />
      <DetailPair label="Cure round"          value={String(row.cure_round)} />
      <DetailPair label="Escalation level"    value={String(row.escalation_level)} />
      <DetailPair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
      <DetailPair label="Limit active since"  value={fmtDate(row.limit_active_at)} />
      <DetailPair label="Warning at"          value={fmtDate(row.exposure_warning_at)} />
      <DetailPair label="Margin call at"      value={fmtDate(row.margin_call_issued_at)} />
      <DetailPair label="Collateral received" value={fmtDate(row.collateral_received_at)} />
      <DetailPair label="Restriction at"      value={fmtDate(row.position_restriction_at)} />
      <DetailPair label="Cure period at"      value={fmtDate(row.cure_period_at)} />
      <DetailPair label="Default declared"    value={fmtDate(row.default_declared_at)} />
      <DetailPair label="Close-out at"        value={fmtDate(row.close_out_at)} />
      <DetailPair label="Fund draw at"        value={fmtDate(row.default_fund_draw_at)} />
      <DetailPair label="Recovered at"        value={fmtDate(row.recovered_at)} />
      <DetailPair label="Written off at"      value={fmtDate(row.written_off_at)} />
      <DetailPair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
      {row.source_wave && (
        <DetailPair label="Source wave" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />
      )}
      {row.resolution_summary && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Resolution summary" value={row.resolution_summary} />
        </div>
      )}
      {row.warning_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Warning basis" value={row.warning_basis} />
        </div>
      )}
      {row.margin_call_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Margin-call basis" value={row.margin_call_basis} />
        </div>
      )}
      {row.collateral_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Collateral basis (member)" value={row.collateral_basis} />
        </div>
      )}
      {row.restriction_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Restriction basis" value={row.restriction_basis} />
        </div>
      )}
      {row.cure_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Cure-period basis" value={row.cure_basis} />
        </div>
      )}
      {row.default_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Default basis" value={row.default_basis} />
        </div>
      )}
      {row.close_out_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Close-out basis" value={row.close_out_basis} />
        </div>
      )}
      {row.default_fund_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Default-fund basis" value={row.default_fund_basis} />
        </div>
      )}
      {row.recovery_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Recovery basis" value={row.recovery_basis} />
        </div>
      )}
      {row.write_off_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Write-off basis" value={row.write_off_basis} />
        </div>
      )}
    </div>
  );
}

export function CounterpartyMarginChainTab() {
  const [rows, setRows] = useState<MarginRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: MarginRow[] } & KpiSummary }>('/counterparty-margin/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setSummary({
          total: d.total, active_count: d.active_count, open_count: d.open_count,
          default_count: d.default_count, close_out_count: d.close_out_count,
          fund_draw_count: d.fund_draw_count, recovered_count: d.recovered_count,
          written_off_count: d.written_off_count, withdrawn_count: d.withdrawn_count,
          breached: d.breached, reportable_total: d.reportable_total, high_open: d.high_open,
          total_exposure_zar: d.total_exposure_zar, total_fund_draw_zar: d.total_fund_draw_zar,
          total_write_off_zar: d.total_write_off_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load margin cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/counterparty-margin/chain/${rowId}/${key}`, values);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: MarginRow; events: ChainEvent[] } }>(
        `/counterparty-margin/chain/${id}`
      );
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load margin history');
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (['minor', 'moderate', 'material', 'major', 'systemic'].includes(filter)) {
        return r.severity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ padding: '20px', background: BG, minHeight: '100%' }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: TX1, margin: 0 }}>
          Counterparty margin &amp; default management
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 4, lineHeight: 1.5 }}>
          12-state counterparty-credit waterfall (Financial Markets Act 19/2012 · FSCA Conduct Standards ·
          CPMI-IOSCO PFMI Principles 4/5/6/13) · limit active → exposure warning → margin call issued →
          collateral received → (cure) → limit active. URGENT SLA: larger exposure tier = tighter window.
          Single write — clearing house / risk desk drives every step. Declared default crosses to regulator every tier.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
        <KpiTile label="Total"         value={summary?.total ?? rows.length} />
        <KpiTile label="Limit active"  value={summary?.active_count ?? 0} tone="ok" />
        <KpiTile label="Open"          value={summary?.open_count ?? 0} tone={(summary?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="High open"     value={summary?.high_open ?? 0} tone={(summary?.high_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Default"       value={summary?.default_count ?? 0} tone={(summary?.default_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Close-out"     value={summary?.close_out_count ?? 0} tone={(summary?.close_out_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Fund draw"     value={summary?.fund_draw_count ?? 0} tone={(summary?.fund_draw_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="SLA breached"  value={summary?.breached ?? 0} tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Reportable"    value={summary?.reportable_total ?? 0} tone={(summary?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Recovered"     value={summary?.recovered_count ?? 0} tone="ok" />
        <KpiTile label="Written off"   value={summary?.written_off_count ?? 0} tone={(summary?.written_off_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Exposure"      value={fmtZar(summary?.total_exposure_zar ?? 0)} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 4,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 4, border: `1px solid ${BAD}40`, background: `${BAD}10`, fontSize: 12, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 6, border: `1px solid ${BORDER}` }}>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 6, border: `1px solid ${BORDER}` }}>
          No margin cases match.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((row) => (
            <ChainCard
              key={row.id}
              item={row}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.counterparty_name}
              meta={
                <span>
                  {TIER_LABEL[row.severity_tier]}
                  {row.product_class ? ` · ${PRODUCT_LABEL[row.product_class] ?? row.product_class}` : ''}
                  {row.account_type ? ` · ${row.account_type}` : ''}
                  {row.member_code ? ` · ${row.member_code}` : ''}
                  {row.systemically_important ? ' · ★ SIFI' : ''}
                  {row.is_reportable ? ' · ● Reportable' : ''}
                  {` · Exposure: ${fmtZar(row.exposure_zar)}`}
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
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, fontFamily: MONO, color }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1 }}>{value}</div>
    </div>
  );
}

export default CounterpartyMarginChainTab;
