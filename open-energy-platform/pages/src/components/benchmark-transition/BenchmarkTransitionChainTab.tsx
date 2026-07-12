// Wave 90 - Trader JIBAR Cessation Benchmark Transition tab.
//
// Post-execution transition of legacy benchmark trades (JIBAR 1m/3m/6m/12m
// referenced IRS, basis swaps, FRAs, FRNs, syndicated loans, structured notes,
// cross-currency swaps) onto ZARONIA-based replacement rates with ISDA spread
// adjustment, ISDA 2020 Protocol adherence, value-transfer settlement, and
// SARB Market Practitioners Group integrity oversight. The SA equivalent of
// the global LIBOR cessation programme: a fixed-window programme that ends
// no later than the cessation date, with a TRANSITION-INTEGRITY signature
// that crosses the regulator inbox on terminate_legacy EVERY tier (SARB MPG
// hard line), complete_transition on material+systemic, raise_dispute on
// systemic only, and SLA breach on material+systemic.
//
// DISTINCTIVE move (beat Bloomberg AIM BSBY transition / Refinitiv Eikon
// IBOR-transition / ICE LIBOR fallbacks / FINASTRA Loan IQ / MUREX MX.3
// transition / Calypso Capital Markets / NumeriX CrossAsset / Markit Wire
// / DTCC Transition Coordination Centre): the chain is a LIVE PORTFOLIO-
// INTEGRITY PROGRAMME with re-derived tier (RE-DERIVED EVERY transition
// from notional + interbank + days-to-cessation, floor-at-material when
// interbank OR <30d-to-cessation), transition-risk battery (PV01 ZAR,
// value-transfer ZAR, ISDA spread bps, compounded ZARONIA, days-to-
// cessation, counterparty response %, hedge effectiveness, predicted
// resolution days, urgency band, systemic-carrier flag), and signature
// crossings hard-wired to fallback class, tier and SLA polarity.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

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
  | 'inventoried' | 'impact_assessed' | 'classified' | 'notified'
  | 'responded' | 'amendment_drafted' | 'amendment_executed' | 'vt_settled'
  | 'transitioned_clean' | 'disputed' | 'on_hold'
  | 'terminated_legacy' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'systemic';
type UrgencyBand = 'green' | 'amber' | 'red' | 'critical';

interface BxtRow {
  [key: string]: unknown;
  id: string;
  transition_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  trade_ref: string;
  instrument_type: string;
  legacy_benchmark: string;
  replacement_rate: string | null;
  fallback_class: string | null;
  counterparty_id: string;
  counterparty_name: string;
  counterparty_interbank: number;
  counterparty_nav_zar: number;
  notional_zar: number;
  remaining_years: number;
  trade_start_at: string | null;
  trade_maturity_at: string | null;
  cessation_date: string;
  zaronia_overnight: number;
  isda_spread_bps: number;
  pv01_zar: number;
  value_transfer_zar: number;
  compounded_zaronia_rate: number;
  hedge_effective_flag: number;
  protocol_adherence_flag: number;
  counterparty_response_pct: number;
  dispute_concentration: number;
  predicted_resolution_days: number | null;
  days_to_cessation: number | null;
  transition_tier: Tier;
  last_action_ref: string | null;
  regulator_ref: string | null;
  transition_summary: string | null;
  chain_status: ChainStatus;
  inventoried_at: string;
  impact_assessed_at: string | null;
  classified_at: string | null;
  notified_at: string | null;
  responded_at: string | null;
  amendment_drafted_at: string | null;
  amendment_executed_at: string | null;
  vt_settled_at: string | null;
  transitioned_clean_at: string | null;
  disputed_at: string | null;
  on_hold_at: string | null;
  terminated_legacy_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  days_to_cessation_live?: number | null;
  pv01_zar_live?: number;
  value_transfer_zar_live?: number;
  fallback_basis_bps_live?: number;
  compounded_zaronia_rate_live?: number;
  hedge_effective_flag_live?: number;
  predicted_resolution_days_live?: number | null;
  urgency_band_live?: UrgencyBand;
  systemic_carrier_live?: boolean;
  interbank_flag_live?: boolean;
}

interface KpiSummary {
  total: number;
  open_count: number;
  inventoried_count: number;
  impact_assessed_count: number;
  classified_count: number;
  notified_count: number;
  responded_count: number;
  amendment_drafted_count: number;
  amendment_executed_count: number;
  vt_settled_count: number;
  transitioned_clean_count: number;
  disputed_count: number;
  on_hold_count: number;
  terminated_legacy_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  systemic_count: number;
  material_count: number;
  interbank_count: number;
  critical_urgency_count: number;
  total_notional_zar: number;
  total_open_notional_zar: number;
  total_pv01_zar: number;
  total_value_transfer_zar: number;
  protocol_adoption_pct: number;
  transitioned_clean_pct: number;
}

const ALL_STATES = [
  'inventoried', 'impact_assessed', 'classified', 'notified',
  'responded', 'amendment_drafted', 'amendment_executed', 'vt_settled',
  'transitioned_clean',
] as const;

const BRANCH_STATES = ['disputed', 'on_hold', 'terminated_legacy', 'cancelled'] as const;

const FILTERS = [
  { key: 'open',               label: 'Open' },
  { key: 'all',                label: 'All' },
  { key: 'minor',              label: 'Minor' },
  { key: 'standard',           label: 'Standard' },
  { key: 'material',           label: 'Material' },
  { key: 'systemic',           label: 'Systemic' },
  { key: 'disputed',           label: 'Disputed' },
  { key: 'on_hold',            label: 'On hold' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'interbank',          label: 'Interbank' },
  { key: 'transitioned_clean', label: 'Transitioned' },
  { key: 'terminated_legacy',  label: 'Terminated' },
  { key: 'cancelled',          label: 'Cancelled' },
];

const TERMINAL_STATES: ChainStatus[] = ['transitioned_clean', 'terminated_legacy', 'cancelled'];

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '-';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  if (Math.abs(v) >= 1_000_000_000) return `R${(v / 1_000_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}bn`;
  if (Math.abs(v) >= 1_000_000) return `R${(v / 1_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}m`;
  if (Math.abs(v) >= 1000) return `R${(v / 1000).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}k`;
  return `R${v.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 2 })}%`;
}

function fmtBps(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 1 })} bps`;
}

function fmtDays(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}d`;
}

function fmtRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${(v * 100).toLocaleString('en-ZA', { maximumFractionDigits: 4 })}%`;
}

function fmtDate(s: string | null): string {
  if (!s) return '-';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function getActions(row: BxtRow): ChainAction[] {
  const actions: ChainAction[] = [];

  if (row.chain_status === 'inventoried') {
    actions.push({
      key: 'assess-impact',
      label: 'Assess impact (risk validation)',
      tone: 'primary',
      fields: [
        { key: 'pv01_zar', label: 'PV01 ZAR (sensitivity to 1 bp parallel shift)', type: 'text', required: false, placeholder: String(row.pv01_zar || 0) },
        { key: 'value_transfer_zar', label: 'Value transfer ZAR (estimated economic delta on switch)', type: 'text', required: false, placeholder: String(row.value_transfer_zar || 0) },
        { key: 'hedge_effective_flag', label: 'Hedge effective flag (1 = effective, 0 = ineffective)', type: 'text', required: false, placeholder: String(row.hedge_effective_flag ?? 1) },
        { key: 'last_action_ref', label: 'Last action ref (impact study id)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'place-on-hold', label: 'Place on hold', tone: 'warn', fields: [{ key: 'transition_summary', label: 'Hold reason (counterparty unresponsive / waiting on legal opinion / pending market consultation)', type: 'textarea', required: true }] });
    actions.push({ key: 'cancel', label: 'Cancel transition', tone: 'danger', fields: [{ key: 'transition_summary', label: 'Cancellation reason (trade matured / closed-out / superseded by master amendment)', type: 'textarea', required: true }] });
  }

  if (row.chain_status === 'impact_assessed') {
    actions.push({
      key: 'classify-fallback',
      label: 'Classify fallback (docs / legal)',
      tone: 'primary',
      fields: [
        { key: 'replacement_rate', label: 'Replacement rate (compounded_zaronia_1m / 3m / 6m / term_zaronia_1m / 3m / 6m / zaronia_overnight)', type: 'text', required: false, placeholder: row.replacement_rate || '' },
        { key: 'fallback_class', label: 'Fallback class (isda_protocol / bilateral_amendment / hardwired / legislative_safe_harbour / synthetic_legacy)', type: 'text', required: false, placeholder: row.fallback_class || '' },
        { key: 'protocol_adherence_flag', label: 'Protocol adherence flag (1 = ISDA 2020 adhered, 0 = bilateral path)', type: 'text', required: false, placeholder: String(row.protocol_adherence_flag ?? 0) },
        { key: 'last_action_ref', label: 'Last action ref (legal opinion id)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'raise-dispute', label: 'Raise dispute', tone: 'danger', fields: [
      { key: 'dispute_concentration', label: 'Dispute concentration (number of disputed trades for this counterparty)', type: 'text', required: false, placeholder: String(row.dispute_concentration || 1) },
      { key: 'predicted_resolution_days', label: 'Predicted resolution days', type: 'text', required: false, placeholder: String(row.predicted_resolution_days || 30) },
      { key: 'last_action_ref', label: 'Last action ref (dispute notice id)', type: 'text', required: false },
      { key: 'regulator_ref', label: 'Regulator reference (REQUIRED if systemic - SARB MPG dispute notification)', type: 'text', required: false, placeholder: row.regulator_ref || '' },
    ], cascadeTo: ['regulator'] });
    actions.push({ key: 'place-on-hold', label: 'Place on hold', tone: 'warn', fields: [{ key: 'transition_summary', label: 'Hold reason', type: 'textarea', required: true }] });
    actions.push({ key: 'cancel', label: 'Cancel transition', tone: 'danger', fields: [{ key: 'transition_summary', label: 'Cancellation reason', type: 'textarea', required: true }] });
  }

  if (row.chain_status === 'classified') {
    actions.push({
      key: 'notify-counterparty',
      label: 'Notify counterparty (transition desk)',
      tone: 'primary',
      fields: [
        { key: 'last_action_ref', label: 'Last action ref (notification dispatch id)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'raise-dispute', label: 'Raise dispute', tone: 'danger', fields: [
      { key: 'dispute_concentration', label: 'Dispute concentration', type: 'text', required: false, placeholder: String(row.dispute_concentration || 1) },
      { key: 'predicted_resolution_days', label: 'Predicted resolution days', type: 'text', required: false, placeholder: String(row.predicted_resolution_days || 30) },
      { key: 'last_action_ref', label: 'Last action ref (dispute notice id)', type: 'text', required: false },
      { key: 'regulator_ref', label: 'Regulator reference (REQUIRED if systemic)', type: 'text', required: false, placeholder: row.regulator_ref || '' },
    ], cascadeTo: ['regulator'] });
    actions.push({ key: 'place-on-hold', label: 'Place on hold', tone: 'warn', fields: [{ key: 'transition_summary', label: 'Hold reason', type: 'textarea', required: true }] });
    actions.push({ key: 'cancel', label: 'Cancel transition', tone: 'danger', fields: [{ key: 'transition_summary', label: 'Cancellation reason', type: 'textarea', required: true }] });
  }

  if (row.chain_status === 'notified') {
    actions.push({
      key: 'record-response',
      label: 'Record counterparty response',
      tone: 'primary',
      fields: [
        { key: 'counterparty_response_pct', label: 'Counterparty response percentage (0-100)', type: 'text', required: false, placeholder: String(row.counterparty_response_pct || 0) },
        { key: 'last_action_ref', label: 'Last action ref (counterparty response id)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'raise-dispute', label: 'Raise dispute', tone: 'danger', fields: [
      { key: 'dispute_concentration', label: 'Dispute concentration', type: 'text', required: false, placeholder: String(row.dispute_concentration || 1) },
      { key: 'predicted_resolution_days', label: 'Predicted resolution days', type: 'text', required: false, placeholder: String(row.predicted_resolution_days || 30) },
      { key: 'last_action_ref', label: 'Last action ref (dispute notice id)', type: 'text', required: false },
      { key: 'regulator_ref', label: 'Regulator reference (REQUIRED if systemic)', type: 'text', required: false, placeholder: row.regulator_ref || '' },
    ], cascadeTo: ['regulator'] });
    actions.push({ key: 'place-on-hold', label: 'Place on hold', tone: 'warn', fields: [{ key: 'transition_summary', label: 'Hold reason', type: 'textarea', required: true }] });
    actions.push({ key: 'cancel', label: 'Cancel transition', tone: 'danger', fields: [{ key: 'transition_summary', label: 'Cancellation reason', type: 'textarea', required: true }] });
  }

  if (row.chain_status === 'responded') {
    actions.push({
      key: 'draft-amendment',
      label: 'Draft confirmation amendment (docs / legal)',
      tone: 'primary',
      fields: [
        { key: 'last_action_ref', label: 'Last action ref (draft amendment id)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'raise-dispute', label: 'Raise dispute', tone: 'danger', fields: [
      { key: 'dispute_concentration', label: 'Dispute concentration', type: 'text', required: false, placeholder: String(row.dispute_concentration || 1) },
      { key: 'predicted_resolution_days', label: 'Predicted resolution days', type: 'text', required: false, placeholder: String(row.predicted_resolution_days || 30) },
      { key: 'last_action_ref', label: 'Last action ref (dispute notice id)', type: 'text', required: false },
      { key: 'regulator_ref', label: 'Regulator reference (REQUIRED if systemic)', type: 'text', required: false, placeholder: row.regulator_ref || '' },
    ], cascadeTo: ['regulator'] });
    actions.push({ key: 'place-on-hold', label: 'Place on hold', tone: 'warn', fields: [{ key: 'transition_summary', label: 'Hold reason', type: 'textarea', required: true }] });
    actions.push({ key: 'cancel', label: 'Cancel transition', tone: 'danger', fields: [{ key: 'transition_summary', label: 'Cancellation reason', type: 'textarea', required: true }] });
  }

  if (row.chain_status === 'amendment_drafted') {
    actions.push({
      key: 'execute-amendment',
      label: 'Execute amendment (docs / legal)',
      tone: 'primary',
      fields: [
        { key: 'last_action_ref', label: 'Last action ref (executed amendment id / MarkitWire ack)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'raise-dispute', label: 'Raise dispute', tone: 'danger', fields: [
      { key: 'dispute_concentration', label: 'Dispute concentration', type: 'text', required: false },
      { key: 'predicted_resolution_days', label: 'Predicted resolution days', type: 'text', required: false },
      { key: 'last_action_ref', label: 'Last action ref (dispute notice id)', type: 'text', required: false },
      { key: 'regulator_ref', label: 'Regulator reference (REQUIRED if systemic)', type: 'text', required: false },
    ], cascadeTo: ['regulator'] });
    actions.push({ key: 'place-on-hold', label: 'Place on hold', tone: 'warn', fields: [{ key: 'transition_summary', label: 'Hold reason', type: 'textarea', required: true }] });
    actions.push({ key: 'terminate-legacy', label: 'Terminate legacy trade (last resort)', tone: 'danger', fields: [
      { key: 'transition_summary', label: 'Termination reason - SARB MPG hard line, ALWAYS crosses regulator', type: 'textarea', required: true },
      { key: 'regulator_ref', label: 'Regulator reference (REQUIRED - SARB MPG termination notice)', type: 'text', required: false, placeholder: row.regulator_ref || '' },
      { key: 'last_action_ref', label: 'Last action ref (termination notice id)', type: 'text', required: false },
    ], cascadeTo: ['regulator'] });
    actions.push({ key: 'cancel', label: 'Cancel transition', tone: 'danger', fields: [{ key: 'transition_summary', label: 'Cancellation reason', type: 'textarea', required: true }] });
  }

  if (row.chain_status === 'amendment_executed') {
    actions.push({
      key: 'settle-vt',
      label: 'Settle value transfer (counterparty credit)',
      tone: 'primary',
      fields: [
        { key: 'value_transfer_zar', label: 'Value transfer ZAR settled (final agreed quantum)', type: 'text', required: false, placeholder: String(row.value_transfer_zar || 0) },
        { key: 'last_action_ref', label: 'Last action ref (settlement instruction id)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'raise-dispute', label: 'Raise dispute', tone: 'danger', fields: [
      { key: 'dispute_concentration', label: 'Dispute concentration', type: 'text', required: false },
      { key: 'predicted_resolution_days', label: 'Predicted resolution days', type: 'text', required: false },
      { key: 'last_action_ref', label: 'Last action ref (dispute notice id)', type: 'text', required: false },
      { key: 'regulator_ref', label: 'Regulator reference (REQUIRED if systemic)', type: 'text', required: false },
    ], cascadeTo: ['regulator'] });
    actions.push({ key: 'terminate-legacy', label: 'Terminate legacy trade (last resort)', tone: 'danger', fields: [
      { key: 'transition_summary', label: 'Termination reason - SARB MPG hard line, ALWAYS crosses regulator', type: 'textarea', required: true },
      { key: 'regulator_ref', label: 'Regulator reference (REQUIRED - SARB MPG termination notice)', type: 'text', required: false, placeholder: row.regulator_ref || '' },
      { key: 'last_action_ref', label: 'Last action ref (termination notice id)', type: 'text', required: false },
    ], cascadeTo: ['regulator'] });
  }

  if (row.chain_status === 'vt_settled') {
    actions.push({
      key: 'complete-transition',
      label: 'Complete transition',
      tone: 'primary',
      fields: [
        { key: 'regulator_ref', label: 'Regulator reference (REQUIRED if material / systemic - SARB MPG completion report)', type: 'text', required: false, placeholder: row.regulator_ref || '' },
        { key: 'last_action_ref', label: 'Last action ref (completion certificate id)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({ key: 'raise-dispute', label: 'Raise dispute', tone: 'danger', fields: [
      { key: 'dispute_concentration', label: 'Dispute concentration', type: 'text', required: false },
      { key: 'predicted_resolution_days', label: 'Predicted resolution days', type: 'text', required: false },
      { key: 'last_action_ref', label: 'Last action ref (dispute notice id)', type: 'text', required: false },
      { key: 'regulator_ref', label: 'Regulator reference (REQUIRED if systemic)', type: 'text', required: false },
    ], cascadeTo: ['regulator'] });
  }

  if (row.chain_status === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute',
      tone: 'primary',
      fields: [
        { key: 'last_action_ref', label: 'Last action ref (dispute resolution memo)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'terminate-legacy', label: 'Terminate legacy trade (last resort)', tone: 'danger', fields: [
      { key: 'transition_summary', label: 'Termination reason - SARB MPG hard line, ALWAYS crosses regulator', type: 'textarea', required: true },
      { key: 'regulator_ref', label: 'Regulator reference (REQUIRED - SARB MPG termination notice)', type: 'text', required: false, placeholder: row.regulator_ref || '' },
      { key: 'last_action_ref', label: 'Last action ref (termination notice id)', type: 'text', required: false },
    ], cascadeTo: ['regulator'] });
    actions.push({ key: 'cancel', label: 'Cancel transition', tone: 'danger', fields: [{ key: 'transition_summary', label: 'Cancellation reason', type: 'textarea', required: true }] });
  }

  if (row.chain_status === 'on_hold') {
    actions.push({
      key: 'resume',
      label: 'Resume transition',
      tone: 'primary',
      fields: [
        { key: 'last_action_ref', label: 'Last action ref (resume order id)', type: 'text', required: false },
      ],
    });
    actions.push({ key: 'cancel', label: 'Cancel transition', tone: 'danger', fields: [{ key: 'transition_summary', label: 'Cancellation reason', type: 'textarea', required: true }] });
  }

  return actions;
}

function renderDetail(row: BxtRow): React.ReactNode {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 8 }}>
        Live transition-risk &amp; integrity battery
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 12 }}>
        <DetailPair label="PV01 ZAR (1 bp shift)"   value={fmtZar(row.pv01_zar_live ?? row.pv01_zar)} />
        <DetailPair label="Value transfer ZAR"       value={fmtZar(row.value_transfer_zar_live ?? row.value_transfer_zar)} />
        <DetailPair label="Fallback basis"           value={fmtBps(row.fallback_basis_bps_live ?? row.isda_spread_bps)} />
        <DetailPair label="Compounded ZARONIA rate"  value={fmtRate(row.compounded_zaronia_rate_live ?? row.compounded_zaronia_rate)} />
        <DetailPair label="ZARONIA overnight"        value={fmtRate(row.zaronia_overnight)} />
        <DetailPair label="ISDA spread"              value={fmtBps(row.isda_spread_bps)} />
        <DetailPair label="Days to cessation"        value={fmtDays(row.days_to_cessation_live ?? row.days_to_cessation)} />
        <DetailPair label="Hedge effective"          value={(row.hedge_effective_flag_live ?? row.hedge_effective_flag) === 1 ? 'Yes' : 'No'} />
        <DetailPair label="Counterparty response"    value={fmtPct(row.counterparty_response_pct)} />
        <DetailPair label="Protocol adherence"       value={row.protocol_adherence_flag === 1 ? 'ISDA 2020 adhered' : 'Bilateral path'} />
        <DetailPair label="Predicted resolution"     value={fmtDays(row.predicted_resolution_days_live ?? row.predicted_resolution_days)} />
        <DetailPair label="Dispute concentration"    value={String(row.dispute_concentration || 0)} />
        <DetailPair label="Urgency band"             value={row.urgency_band_live ? row.urgency_band_live.charAt(0).toUpperCase() + row.urgency_band_live.slice(1) : '-'} />
        <DetailPair label="Systemic carrier"         value={row.systemic_carrier_live ? 'YES' : 'No'} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        <DetailPair label="Trade ref"          value={row.trade_ref} />
        <DetailPair label="Instrument"         value={row.instrument_type} />
        <DetailPair label="Legacy benchmark"   value={row.legacy_benchmark} />
        <DetailPair label="Replacement rate"   value={row.replacement_rate ?? '-'} />
        <DetailPair label="Fallback class"     value={row.fallback_class ?? '-'} />
        <DetailPair label="Counterparty"       value={row.counterparty_name} />
        <DetailPair label="Interbank"          value={row.counterparty_interbank === 1 ? 'Yes' : 'No'} />
        <DetailPair label="Counterparty NAV"   value={fmtZar(row.counterparty_nav_zar)} />
        <DetailPair label="Notional"           value={fmtZar(row.notional_zar)} />
        <DetailPair label="Remaining years"    value={`${(row.remaining_years || 0).toLocaleString('en-ZA', { maximumFractionDigits: 2 })} yr`} />
        <DetailPair label="Trade start"        value={fmtDate(row.trade_start_at)} />
        <DetailPair label="Trade maturity"     value={fmtDate(row.trade_maturity_at)} />
        <DetailPair label="Cessation date"     value={fmtDate(row.cessation_date)} />
        <DetailPair label="Last action ref"    value={row.last_action_ref ?? '-'} />
        <DetailPair label="Regulator ref"      value={row.regulator_ref ?? '-'} />
        <DetailPair label="Inventoried"        value={fmtDate(row.inventoried_at)} />
        <DetailPair label="Impact assessed"    value={fmtDate(row.impact_assessed_at)} />
        <DetailPair label="Classified"         value={fmtDate(row.classified_at)} />
        <DetailPair label="Notified"           value={fmtDate(row.notified_at)} />
        <DetailPair label="Response recorded"  value={fmtDate(row.responded_at)} />
        <DetailPair label="Amendment drafted"  value={fmtDate(row.amendment_drafted_at)} />
        <DetailPair label="Amendment executed" value={fmtDate(row.amendment_executed_at)} />
        <DetailPair label="VT settled"         value={fmtDate(row.vt_settled_at)} />
        <DetailPair label="Transitioned clean" value={fmtDate(row.transitioned_clean_at)} />
        <DetailPair label="Disputed"           value={fmtDate(row.disputed_at)} />
        <DetailPair label="On hold"            value={fmtDate(row.on_hold_at)} />
        <DetailPair label="Terminated legacy"  value={fmtDate(row.terminated_legacy_at)} />
        <DetailPair label="Cancelled"          value={fmtDate(row.cancelled_at)} />
        <DetailPair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA window"         value={row.sla_window_minutes ? fmtMinutes(row.sla_window_minutes) : '-'} />
        <DetailPair label="SLA status"         value={row.is_terminal ? '-' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation lvl"     value={String(row.escalation_level)} />
        <DetailPair label="Reportable"         value={row.is_reportable_flag ? 'Yes' : 'No'} />
        <DetailPair label="Breach crosses reg." value={row.breach_crosses_regulator ? 'Yes' : 'No'} />
      </div>
      {row.transition_summary && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX2, marginBottom: 2 }}>Transition summary</div>
          <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.transition_summary}</div>
        </div>
      )}
      {row.source_wave && (
        <div style={{ marginTop: 8, fontSize: 11, color: TX3 }}>
          Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
        </div>
      )}
    </div>
  );
}

export function BenchmarkTransitionChainTab() {
  const [rows, setRows] = useState<BxtRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: BxtRow[] } & KpiSummary }>('/benchmark-transition/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setSummary({
          total: d.total, open_count: d.open_count,
          inventoried_count: d.inventoried_count,
          impact_assessed_count: d.impact_assessed_count,
          classified_count: d.classified_count,
          notified_count: d.notified_count,
          responded_count: d.responded_count,
          amendment_drafted_count: d.amendment_drafted_count,
          amendment_executed_count: d.amendment_executed_count,
          vt_settled_count: d.vt_settled_count,
          transitioned_clean_count: d.transitioned_clean_count,
          disputed_count: d.disputed_count,
          on_hold_count: d.on_hold_count,
          terminated_legacy_count: d.terminated_legacy_count,
          cancelled_count: d.cancelled_count,
          breached: d.breached, reportable_total: d.reportable_total,
          systemic_count: d.systemic_count,
          material_count: d.material_count,
          interbank_count: d.interbank_count,
          critical_urgency_count: d.critical_urgency_count,
          total_notional_zar: d.total_notional_zar,
          total_open_notional_zar: d.total_open_notional_zar,
          total_pv01_zar: d.total_pv01_zar,
          total_value_transfer_zar: d.total_value_transfer_zar,
          protocol_adoption_pct: d.protocol_adoption_pct,
          transitioned_clean_pct: d.transitioned_clean_pct,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load benchmark transitions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      const body: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '') continue;
        if (['pv01_zar', 'value_transfer_zar', 'hedge_effective_flag', 'protocol_adherence_flag',
             'counterparty_response_pct', 'dispute_concentration', 'predicted_resolution_days'].includes(k)) {
          const n = Number(v);
          if (!Number.isNaN(n)) body[k] = n;
        } else {
          body[k] = v;
        }
      }
      await api.post(`/benchmark-transition/chain/${rowId}/${key}`, body);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: BxtRow; events: ChainEvent[] } }>(
        `/benchmark-transition/chain/${id}`
      );
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch {
      // non-fatal
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag;
      if (filter === 'interbank')  return r.counterparty_interbank === 1;
      if (['minor', 'standard', 'material', 'systemic'].includes(filter)) {
        return r.transition_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ padding: 20, background: BG, minHeight: '100%' }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: TX1, margin: 0 }}>
          Benchmark transition &middot; JIBAR cessation &amp; ZARONIA fallback
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 4, lineHeight: 1.5 }}>
          13-stage JIBAR-cessation transition chain &middot; inventoried &rarr; impact assessed &rarr; fallback classified
          &rarr; notified &rarr; response recorded &rarr; amendment drafted &rarr; amendment executed &rarr; value-transfer
          settled &rarr; transitioned clean &mdash; ZARONIA-based replacement rates, ISDA spread-adjustment, SARB MPG oversight.
          TRANSITION-INTEGRITY signature: terminate_legacy crosses regulator EVERY tier, complete_transition material+systemic,
          raise_dispute systemic only.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
        <KpiTile label="Total transitions"     value={summary?.total ?? rows.length} />
        <KpiTile label="Open"                  value={summary?.open_count ?? 0} />
        <KpiTile label="Transitioned clean"    value={summary?.transitioned_clean_count ?? 0} tone="ok" />
        <KpiTile label="Disputed"              value={summary?.disputed_count ?? 0} tone={(summary?.disputed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Terminated legacy"     value={summary?.terminated_legacy_count ?? 0} tone={(summary?.terminated_legacy_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Cancelled"             value={summary?.cancelled_count ?? 0} />
        <KpiTile label="Systemic"              value={summary?.systemic_count ?? 0} tone={(summary?.systemic_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Material"              value={summary?.material_count ?? 0} tone={(summary?.material_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Interbank"             value={summary?.interbank_count ?? 0} tone={(summary?.interbank_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Critical urgency"      value={summary?.critical_urgency_count ?? 0} tone={(summary?.critical_urgency_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="SLA breached"          value={summary?.breached ?? 0} tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Reportable"            value={summary?.reportable_total ?? 0} tone={(summary?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Total notional"        value={fmtZar(summary?.total_notional_zar)} />
        <KpiTile label="Open notional"         value={fmtZar(summary?.total_open_notional_zar)} />
        <KpiTile label="Total PV01"            value={fmtZar(summary?.total_pv01_zar)} />
        <KpiTile label="Total value transfer"  value={fmtZar(summary?.total_value_transfer_zar)} tone={(summary?.total_value_transfer_zar ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Protocol adoption"     value={fmtPct(summary?.protocol_adoption_pct)} />
        <KpiTile label="Clean transition rate" value={fmtPct(summary?.transitioned_clean_pct)} tone="ok" />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 4, background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', border: `1px solid ${BAD}`, color: BAD, fontSize: 12 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 6, border: `1px solid ${BORDER}` }}>
          Loading...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 6, border: `1px solid ${BORDER}` }}>
              No transitions match.
            </div>
          ) : (
            filtered.map((row) => (
              <ChainCard
                key={row.id}
                item={{ ...row, case_number: row.transition_number }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={`${row.trade_ref} · ${row.counterparty_name}`}
                meta={
                  <span>
                    {row.instrument_type} · {row.legacy_benchmark} → {row.replacement_rate || '-'} · {fmtZar(row.notional_zar)} · {row.transition_tier}
                    {row.counterparty_interbank === 1 ? ' · interbank' : ''}
                    {row.is_reportable_flag ? ' · reportable' : ''}
                    {row.urgency_band_live ? ` · urgency:${row.urgency_band_live}` : ''}
                    {(row.days_to_cessation_live ?? 9999) < 30 ? ` · ⚠ ${fmtDays(row.days_to_cessation_live)} to cessation` : ''}
                  </span>
                }
                actions={getActions(row)}
                onAction={(key, values) => handleAction(row.id, key, values)}
                onExpand={handleExpand}
                events={expandedEvents[row.id]}
                cascadeTo={['regulator']}
                detail={renderDetail(row)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1, marginTop: 1 }}>{value}</div>
    </div>
  );
}

export default BenchmarkTransitionChainTab;
