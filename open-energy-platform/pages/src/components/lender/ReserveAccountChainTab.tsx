// Wave 77 — Reserve-Account (DSRA / MRA) Funding, Drawdown, Cure & Release tab.
//
// A best-in-class project-finance lender requires the borrower to fund and MAINTAIN
// controlled reserve accounts — the Debt Service Reserve Account (DSRA, typically the
// next 6 months of debt service) and the Maintenance Reserve Account (MRA). The agent
// bank monitors the target balance on every test date; a shortfall must be CURED inside
// a contractual window and a legitimate DRAW must be REPLENISHED inside a top-up window.
// At final maturity / step-down the reserve is RELEASED. A failure to cure or replenish
// is an EVENT OF DEFAULT. Distinct from the rest of the lender book — W21 releases the
// FUNDS, W30 reconciles USE of proceeds, W38 tests COVENANTS, W45 ENFORCES on default,
// W53 APPROVES the credit, W69 perfects the SECURITY; W77 keeps the debt-service and
// maintenance BUFFERS whole.
//
//   reserve_required → funding_scheduled → funding_in_progress → funded
//     → (monitored) → release_requested → released
//   shortfall: funded → shortfall_flagged → cure_pending → (replenish|waive) funded
//                                                        → (declare_breach) breached
//   draw:      funded → drawdown_authorized → drawn → (replenish|waive) funded
//                                                   → (declare_breach) breached
//   cancel:    {reserve_required, funding_scheduled, funding_in_progress} → cancelled
//
// URGENT SLA — the LARGER the reserve target, the TIGHTER every window. Tier (5) by
// target amount in ZAR. Single write — the agent / lender drives every step; actor_party
// records whether a step represents the lender, the borrower or the account bank. The W77
// signature — a reserve BREACH (event of default) crosses to the regulator for EVERY tier;
// a waiver and an SLA breach cross for the large tiers (major + systemic).

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
  | 'reserve_required' | 'funding_scheduled' | 'funding_in_progress' | 'funded'
  | 'shortfall_flagged' | 'cure_pending' | 'drawdown_authorized' | 'drawn'
  | 'release_requested' | 'released' | 'breached' | 'cancelled';

type Tier = 'small' | 'medium' | 'large' | 'major' | 'systemic';

interface ReserveRow {
  [key: string]: unknown;
  id: string;
  reserve_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_ref: string | null;
  project_id: string | null;
  loan_agreement_ref: string | null;
  lender_name: string;
  borrower_name: string;
  account_bank: string | null;
  reserve_type: string | null;
  funding_mode: string | null;
  target_basis: string | null;
  account_number: string | null;
  currency: string | null;
  target_amount_zar: number;
  current_balance_zar: number | null;
  drawn_amount_zar: number | null;
  shortfall_amount_zar: number | null;
  reserve_tier: Tier;
  next_test_date: string | null;
  cure_deadline: string | null;
  release_due_date: string | null;
  shortfall_reason_code: string | null;
  funding_ref: string | null;
  shortfall_ref: string | null;
  cure_ref: string | null;
  drawdown_ref: string | null;
  replenishment_ref: string | null;
  waiver_ref: string | null;
  release_ref: string | null;
  breach_ref: string | null;
  cancel_ref: string | null;
  funding_basis: string | null;
  shortfall_basis: string | null;
  cure_basis: string | null;
  drawdown_basis: string | null;
  replenishment_basis: string | null;
  waiver_basis: string | null;
  release_basis: string | null;
  breach_basis: string | null;
  cancel_basis: string | null;
  reason_code: string | null;
  chain_status: ChainStatus;
  reserve_required_at: string;
  funding_scheduled_at: string | null;
  funding_in_progress_at: string | null;
  funded_at: string | null;
  shortfall_flagged_at: string | null;
  cure_pending_at: string | null;
  drawdown_authorized_at: string | null;
  drawn_at: string | null;
  release_requested_at: string | null;
  released_at: string | null;
  breached_at: string | null;
  cancelled_at: string | null;
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

interface ReserveEvent {
  id: string;
  reserve_account_id: string;
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
  funded_count: number;
  shortfall_count: number;
  drawn_count: number;
  release_count: number;
  breach_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  large_open: number;
  total_target_zar: number;
  funded_target_zar: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'reserve_required',
  'funding_scheduled',
  'funding_in_progress',
  'funded',
  'shortfall_flagged',
  'cure_pending',
  'drawdown_authorized',
  'drawn',
  'release_requested',
  'released',
];
const BRANCH_STATES: readonly string[] = [
  'breached',
  'cancelled',
];

const RESERVE_TYPE_LABEL: Record<string, string> = {
  dsra:        'DSRA',
  mra:         'MRA',
  om_reserve:  'O&M reserve',
  tax_reserve: 'Tax reserve',
};

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                label: 'Open' },
  { key: 'all',                 label: 'All' },
  { key: 'small',               label: 'Small' },
  { key: 'medium',              label: 'Medium' },
  { key: 'large',               label: 'Large' },
  { key: 'major',               label: 'Major' },
  { key: 'systemic',            label: 'Systemic' },
  { key: 'reserve_required',    label: 'Required' },
  { key: 'funding_scheduled',   label: 'Scheduled' },
  { key: 'funding_in_progress', label: 'Funding' },
  { key: 'funded',              label: 'Funded' },
  { key: 'shortfall_flagged',   label: 'Shortfall' },
  { key: 'cure_pending',        label: 'Cure pending' },
  { key: 'drawdown_authorized', label: 'Draw authorised' },
  { key: 'drawn',               label: 'Drawn' },
  { key: 'release_requested',   label: 'Release req.' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'reportable',          label: 'Reportable' },
  { key: 'released',            label: 'Released' },
  { key: 'cancelled',           label: 'Cancelled' },
];

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

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

const TERMINAL_STATES: ChainStatus[] = ['released', 'breached', 'cancelled'];

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: ReserveRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'reserve_required') {
    actions.push({
      key: 'schedule-funding',
      label: 'Schedule funding (lender)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'funding_basis',
          label: 'Funding basis — the funding instruction (cash deposit / LC issuance against the target balance)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'funding_mode',
          label: 'Funding mode (cash / letter_of_credit / hybrid)',
          type: 'text',
          required: false,
          placeholder: row.funding_mode ?? 'cash',
        },
        {
          key: 'account_bank',
          label: 'Account bank holding the controlled account',
          type: 'text',
          required: false,
          placeholder: row.account_bank ?? '',
        },
        {
          key: 'next_test_date',
          label: 'Next test date',
          type: 'date',
          required: false,
          placeholder: row.next_test_date ?? '',
        },
      ],
    });
    actions.push({
      key: 'cancel-reserve',
      label: 'Cancel reserve (lender)',
      tone: 'muted',
      cascadeTo: [],
      fields: [
        {
          key: 'cancel_basis',
          label: 'Cancel basis — the reserve obligation falling away before funding (facility cancelled / refinanced)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. facility_cancelled / refinanced / superseded)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'funding_scheduled') {
    actions.push({
      key: 'commence-funding',
      label: 'Commence funding (borrower)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'funding_basis',
          label: 'Funding basis — the borrower commencing the cash transfer / LC delivery',
          type: 'textarea',
          required: true,
        },
        {
          key: 'funding_ref',
          label: 'Funding reference (e.g. FUND-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'account_number',
          label: 'Reserve account number',
          type: 'text',
          required: false,
          placeholder: row.account_number ?? '',
        },
      ],
    });
    actions.push({
      key: 'cancel-reserve',
      label: 'Cancel reserve (lender)',
      tone: 'muted',
      cascadeTo: [],
      fields: [
        {
          key: 'cancel_basis',
          label: 'Cancel basis — the reserve obligation falling away before funding (facility cancelled / refinanced)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. facility_cancelled / refinanced / superseded)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'funding_in_progress') {
    actions.push({
      key: 'confirm-funding',
      label: 'Confirm funded (account bank)',
      tone: 'good',
      cascadeTo: [],
      fields: [
        {
          key: 'funding_basis',
          label: 'Funding basis — the account bank confirming the target balance is met',
          type: 'textarea',
          required: true,
        },
        {
          key: 'current_balance_zar',
          label: 'Confirmed current balance (ZAR)',
          type: 'number',
          required: false,
          placeholder: String(row.current_balance_zar ?? row.target_amount_zar ?? ''),
        },
        {
          key: 'next_test_date',
          label: 'Next test date',
          type: 'date',
          required: false,
          placeholder: row.next_test_date ?? '',
        },
      ],
    });
    actions.push({
      key: 'cancel-reserve',
      label: 'Cancel reserve (lender)',
      tone: 'muted',
      cascadeTo: [],
      fields: [
        {
          key: 'cancel_basis',
          label: 'Cancel basis — the reserve obligation falling away before funding (facility cancelled / refinanced)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. facility_cancelled / refinanced / superseded)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'funded') {
    actions.push({
      key: 'flag-shortfall',
      label: 'Flag shortfall (lender)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        {
          key: 'shortfall_basis',
          label: 'Shortfall basis — the test date showing balance below target',
          type: 'textarea',
          required: true,
        },
        {
          key: 'shortfall_reason_code',
          label: 'Shortfall reason code (lc_lapse / fx_move / missed_sweep / dscr_dip)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'shortfall_amount_zar',
          label: 'Shortfall amount (ZAR)',
          type: 'number',
          required: false,
          placeholder: String(row.shortfall_amount_zar ?? ''),
        },
        {
          key: 'current_balance_zar',
          label: 'Current balance at test (ZAR)',
          type: 'number',
          required: false,
          placeholder: String(row.current_balance_zar ?? ''),
        },
      ],
    });
    actions.push({
      key: 'authorize-drawdown',
      label: 'Authorise drawdown (lender)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        {
          key: 'drawdown_basis',
          label: 'Drawdown basis — authorising a draw to meet debt service the cashflow could not cover',
          type: 'textarea',
          required: true,
        },
        {
          key: 'drawdown_ref',
          label: 'Drawdown reference (e.g. DRAW-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
    actions.push({
      key: 'request-release',
      label: 'Request release (borrower)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'release_basis',
          label: 'Release basis — maturity / deleveraging / contractual step-down releasing the reserve',
          type: 'textarea',
          required: true,
        },
        {
          key: 'release_ref',
          label: 'Release reference (e.g. REL-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'release_due_date',
          label: 'Release due date',
          type: 'date',
          required: false,
          placeholder: row.release_due_date ?? '',
        },
      ],
    });
  }

  if (s === 'shortfall_flagged') {
    actions.push({
      key: 'open-cure',
      label: 'Open cure period (lender)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        {
          key: 'cure_basis',
          label: 'Cure basis — opening the contractual cure window for the shortfall',
          type: 'textarea',
          required: true,
        },
        {
          key: 'cure_ref',
          label: 'Cure reference (e.g. CURE-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'cure_deadline',
          label: 'Cure deadline',
          type: 'date',
          required: false,
          placeholder: row.cure_deadline ?? '',
        },
      ],
    });
    actions.push({
      key: 'authorize-drawdown',
      label: 'Authorise drawdown (lender)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        {
          key: 'drawdown_basis',
          label: 'Drawdown basis — authorising a draw to meet debt service the cashflow could not cover',
          type: 'textarea',
          required: true,
        },
        {
          key: 'drawdown_ref',
          label: 'Drawdown reference (e.g. DRAW-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'cure_pending' || s === 'drawn') {
    actions.push({
      key: 'replenish-reserve',
      label: 'Replenish reserve (borrower)',
      tone: 'good',
      cascadeTo: [],
      fields: [
        {
          key: 'replenishment_basis',
          label: 'Replenishment basis — the borrower topping the reserve back to target',
          type: 'textarea',
          required: true,
        },
        {
          key: 'replenishment_ref',
          label: 'Replenishment reference (e.g. REPL-2026-0011)',
          type: 'text',
          required: false,
          placeholder: '',
        },
        {
          key: 'current_balance_zar',
          label: 'Restored balance (ZAR)',
          type: 'number',
          required: false,
          placeholder: String(row.target_amount_zar ?? ''),
        },
      ],
    });
    actions.push({
      // waiver crosses regulator for major + systemic tiers
      key: 'waive-requirement',
      label: 'Waive requirement (lender)',
      tone: 'muted',
      cascadeTo: (row.reserve_tier === 'major' || row.reserve_tier === 'systemic') ? ['regulator'] : [],
      fields: [
        {
          key: 'waiver_basis',
          label: 'Waiver basis — lender forbearance on the shortfall / replenishment requirement',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. temporary_waiver / step_down / restructure)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
    actions.push({
      // declare_breach crosses regulator EVERY tier (W77 signature)
      key: 'declare-breach',
      label: 'Declare breach — event of default (lender)',
      tone: 'danger',
      cascadeTo: ['regulator'],
      fields: [
        {
          key: 'breach_basis',
          label: 'Breach basis — failure to cure / replenish inside the window (event of default)',
          type: 'textarea',
          required: true,
        },
        {
          key: 'reason_code',
          label: 'Reason code (e.g. cure_failed / replenish_failed / abandoned)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'drawdown_authorized') {
    actions.push({
      key: 'execute-drawdown',
      label: 'Execute drawdown (account bank)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        {
          key: 'drawdown_basis',
          label: 'Drawdown basis — the account bank moving cash out of the reserve',
          type: 'textarea',
          required: true,
        },
        {
          key: 'drawn_amount_zar',
          label: 'Drawn amount (ZAR)',
          type: 'number',
          required: false,
          placeholder: String(row.drawn_amount_zar ?? ''),
        },
        {
          key: 'current_balance_zar',
          label: 'Post-draw current balance (ZAR)',
          type: 'number',
          required: false,
          placeholder: String(row.current_balance_zar ?? ''),
        },
      ],
    });
  }

  if (s === 'release_requested') {
    actions.push({
      key: 'release-reserve',
      label: 'Release reserve (account bank)',
      tone: 'good',
      cascadeTo: [],
      fields: [
        {
          key: 'release_basis',
          label: 'Release basis — the account bank releasing the reserve cash back to the borrower',
          type: 'textarea',
          required: true,
        },
        {
          key: 'release_ref',
          label: 'Release reference',
          type: 'text',
          required: false,
          placeholder: row.release_ref ?? '',
        },
      ],
    });
  }

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: ReserveRow): React.ReactNode {
  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <DetailPair label="Reserve type"        value={row.reserve_type ? (RESERVE_TYPE_LABEL[row.reserve_type] ?? row.reserve_type) : '—'} />
        <DetailPair label="Funding mode"        value={row.funding_mode ?? '—'} />
        <DetailPair label="Target basis"        value={row.target_basis ?? '—'} />
        <DetailPair label="Target amount"       value={fmtZar(row.target_amount_zar)} />
        <DetailPair label="Current balance"     value={fmtZar(row.current_balance_zar)} />
        <DetailPair label="Drawn amount"        value={fmtZar(row.drawn_amount_zar)} />
        <DetailPair label="Shortfall amount"    value={fmtZar(row.shortfall_amount_zar)} />
        <DetailPair label="Account bank"        value={row.account_bank ?? '—'} />
        <DetailPair label="Account number"      value={row.account_number ?? '—'} />
        <DetailPair label="Currency"            value={row.currency ?? '—'} />
        <DetailPair label="Shortfall reason"    value={row.shortfall_reason_code ?? '—'} />
        <DetailPair label="Reason code"         value={row.reason_code ?? '—'} />
        <DetailPair label="Funding ref"         value={row.funding_ref ?? '—'} />
        <DetailPair label="Cure ref"            value={row.cure_ref ?? '—'} />
        <DetailPair label="Drawdown ref"        value={row.drawdown_ref ?? '—'} />
        <DetailPair label="Replenishment ref"   value={row.replenishment_ref ?? '—'} />
        <DetailPair label="Waiver ref"          value={row.waiver_ref ?? '—'} />
        <DetailPair label="Release ref"         value={row.release_ref ?? '—'} />
        <DetailPair label="Breach ref"          value={row.breach_ref ?? '—'} />
        <DetailPair label="Next test date"      value={fmtDate(row.next_test_date)} />
        <DetailPair label="Cure deadline"       value={fmtDate(row.cure_deadline)} />
        <DetailPair label="Release due"         value={fmtDate(row.release_due_date)} />
        <DetailPair label="Reserve required"    value={fmtDate(row.reserve_required_at)} />
        <DetailPair label="Funding scheduled"   value={fmtDate(row.funding_scheduled_at)} />
        <DetailPair label="Funding in progress" value={fmtDate(row.funding_in_progress_at)} />
        <DetailPair label="Funded"              value={fmtDate(row.funded_at)} />
        <DetailPair label="Shortfall flagged"   value={fmtDate(row.shortfall_flagged_at)} />
        <DetailPair label="Cure pending"        value={fmtDate(row.cure_pending_at)} />
        <DetailPair label="Drawdown authorised" value={fmtDate(row.drawdown_authorized_at)} />
        <DetailPair label="Drawn"               value={fmtDate(row.drawn_at)} />
        <DetailPair label="Release requested"   value={fmtDate(row.release_requested_at)} />
        <DetailPair label="Released"            value={fmtDate(row.released_at)} />
        <DetailPair label="Breached"            value={fmtDate(row.breached_at)} />
        <DetailPair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl"      value={String(row.escalation_level)} />
        <DetailPair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
        {row.facility_ref && <DetailPair label="Facility ref" value={row.facility_ref} />}
        {row.project_id && <DetailPair label="Project ID" value={row.project_id} />}
        {row.loan_agreement_ref && <DetailPair label="Loan agreement ref" value={row.loan_agreement_ref} />}
        {row.source_wave && <DetailPair label="Source wave" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />}
      </div>
      {row.funding_basis && (
        <BasisBlock label="Funding basis" text={row.funding_basis} />
      )}
      {row.shortfall_basis && (
        <BasisBlock label="Shortfall basis" text={row.shortfall_basis} />
      )}
      {row.cure_basis && (
        <BasisBlock label="Cure basis" text={row.cure_basis} />
      )}
      {row.drawdown_basis && (
        <BasisBlock label="Drawdown basis" text={row.drawdown_basis} />
      )}
      {row.replenishment_basis && (
        <BasisBlock label="Replenishment basis" text={row.replenishment_basis} />
      )}
      {row.waiver_basis && (
        <BasisBlock label="Waiver basis" text={row.waiver_basis} />
      )}
      {row.breach_basis && (
        <BasisBlock label="Breach basis (event of default)" text={row.breach_basis} />
      )}
      {row.release_basis && (
        <BasisBlock label="Release basis" text={row.release_basis} />
      )}
      {row.cancel_basis && (
        <BasisBlock label="Cancel basis" text={row.cancel_basis} />
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function ReserveAccountChainTab() {
  const [rows, setRows] = useState<ReserveRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ReserveRow[] } & KpiSummary }>('/reserve-account/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total,
          open_count: d.open_count,
          funded_count: d.funded_count,
          shortfall_count: d.shortfall_count,
          drawn_count: d.drawn_count,
          release_count: d.release_count,
          breach_count: d.breach_count,
          cancelled_count: d.cancelled_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          large_open: d.large_open,
          total_target_zar: d.total_target_zar,
          funded_target_zar: d.funded_target_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load reserve-account cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/reserve-account/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/reserve-account/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: ReserveRow; events: ChainEvent[] } }>(`/reserve-account/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'small' || filter === 'medium' || filter === 'large' || filter === 'major' || filter === 'systemic') {
        return r.reserve_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis ?? {
    total: rows.length, open_count: 0, funded_count: 0, shortfall_count: 0,
    drawn_count: 0, release_count: 0, breach_count: 0, cancelled_count: 0,
    breached: 0, reportable_total: 0, large_open: 0, total_target_zar: 0, funded_target_zar: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          Reserve accounts — DSRA / MRA funding, cure &amp; release
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-state reserve-account lifecycle · a project-finance facility requires the borrower to fund and
          MAINTAIN controlled reserve accounts (Debt Service Reserve Account + Maintenance Reserve Account).
          reserve required → funding scheduled → funding in progress → funded → (monitored) → release requested
          → released. A test date showing balance below target flags a SHORTFALL, which opens a cure window —
          replenished, waived or, on failure, BREACHED (event of default). URGENT SLA: the larger the reserve
          target, the tighter every window. The W77 signature — a reserve BREACH crosses to the regulator for
          EVERY tier; a waiver and an SLA breach cross for the large tiers (major + systemic).
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"        value={k.total} />
        <KpiTile label="Open"         value={k.open_count}         tone={k.open_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Funded"       value={k.funded_count}       tone="ok" />
        <KpiTile label="Shortfall"    value={k.shortfall_count}    tone={k.shortfall_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Drawn"        value={k.drawn_count}        tone={k.drawn_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Large open"   value={k.large_open}         tone={k.large_open > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached" value={k.breached}           tone={k.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable"   value={k.reportable_total}   tone={k.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Breached"     value={k.breach_count}       tone={k.breach_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Released"     value={k.release_count}      tone="ok" />
        <KpiTile label="Target value" value={fmtZar(k.total_target_zar)} />
        <KpiTile label="Funded value" value={fmtZar(k.funded_target_zar)} tone="ok" />
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
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.reserve_number}${row.is_reportable ? ' ●' : ''}`}
              meta={[
                `${row.borrower_name}`,
                row.reserve_type ? (RESERVE_TYPE_LABEL[row.reserve_type] ?? row.reserve_type) : null,
                `${row.reserve_tier} · ${fmtZar(row.target_amount_zar)}`,
                row.account_bank ?? null,
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
            <div className="rounded border px-4 py-6 text-center text-[12px]"
              style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No reserve accounts match.
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
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

function BasisBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="col-span-2 rounded border px-2 py-1.5 mt-2" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: TX2 }}>{text}</div>
    </div>
  );
}

export default ReserveAccountChainTab;
