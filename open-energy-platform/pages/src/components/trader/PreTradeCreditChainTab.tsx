// Wave 107 — Trader Pre-Trade Credit Check & Settlement-Risk Exposure (P6).
//
// PRE-TRADE GATE upstream of W2 / W9 / W29 / W36 / W44 / W52 / W60 / W68 / W76.
// 12-state P6 chain with sub-second SLA, LIVE 14-field battery, FLOOR-AT-
// MATERIAL tier overlay, 4-step authority ladder (junior_trader -> desk_head
// -> market_risk_manager -> CRO), signature regulator crossings.
//
// Standards: FMA Ch.X s50 + FSCA Conduct Standard 1/2020 + BIS PFMI s3.5 +
// CFTC Reg 1.73 + MiFID II Art 17.
//
// Beats Numerix CrossAsset Pre-Trade / Calypso Pre-Trade Limits / Bloomberg
// AIM Pre-Trade Compliance / Murex MX.3 PFE / FIS Front Arena / OpenLink
// Endur Pre-Deal / SAS Risk Management / Misys Kondor+ / Wall Street Systems
// Front-Arena.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'order_submitted' | 'kyc_verified' | 'credit_line_checked'
  | 'settlement_risk_assessed' | 'concentration_checked'
  | 'halt_status_verified' | 'mark_age_validated'
  | 'cleared' | 'archived' | 'rejected'
  | 'held_for_review' | 'manually_cleared' | 'manually_rejected';

type PtcTier = 'micro' | 'standard' | 'material' | 'systemic';
type PtcUrgency = 'critical' | 'high' | 'medium' | 'low';
type HaltBand = 'none' | 'partial' | 'full';
type Authority = 'junior_trader' | 'desk_head' | 'market_risk_manager' | 'CRO';

interface PtcRow {
  [key: string]: unknown;
  id: string;
  check_number: string;
  order_ref: string;
  trader_party_id: string;
  trader_party_name: string | null;
  counterparty_id: string;
  counterparty_name: string | null;
  desk: string | null;
  venue: string | null;
  product_class: string | null;
  energy_type: string | null;
  side: string | null;
  volume_mwh: number;
  price_zar_per_mwh: number;
  notional_exposure_zar: number;
  credit_line_limit_zar: number;
  credit_line_used_zar: number;
  credit_line_utilization_pct: number;
  settlement_risk_score: number;
  dvp_pvp_unavailable: number;
  currency_mismatch: number;
  tenor_days: number;
  single_name_exposure_zar: number;
  book_value_zar: number;
  concentration_ratio_pct: number;
  kyc_verified_at: string | null;
  kyc_recency_days: number;
  last_mark_at: string | null;
  mark_age_seconds: number;
  underlying_halted: number;
  partial_halt_flag: number;
  halt_status_band: HaltBand | null;
  cross_border_settlement: number;
  counterparty_credit_grade_below_B: number;
  concentration_above_25pct: number;
  halted_underlying: number;
  first_trade_with_counterparty: number;
  hold_triggered_by_sla: number;
  hold_reason: string | null;
  reject_reason: string | null;
  override_reason: string | null;
  override_by: string | null;
  var_limit_zar: number;
  current_position_zar: number;
  position_limit_zar: number;
  counterparty_margin_ref: string | null;
  current_tier: PtcTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  pretrade_gate_completeness_index: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  chain_status: ChainStatus;
  order_submitted_at: string | null;
  kyc_verified_state_at: string | null;
  credit_line_checked_at: string | null;
  settlement_risk_assessed_at: string | null;
  concentration_checked_at: string | null;
  halt_status_verified_at: string | null;
  mark_age_validated_at: string | null;
  cleared_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  held_for_review_at: string | null;
  manually_cleared_at: string | null;
  manually_rejected_at: string | null;
  regulator_crossed_at: string | null;
  regulator_ref: string | null;
  sla_target_ms: number;
  sla_deadline_at: string | null;
  sla_breached: number;
  escalation_level: number;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  ms_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_ms?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  credit_line_utilization_pct_live?: number;
  settlement_risk_score_live?: number;
  concentration_ratio_pct_live?: number;
  kyc_recency_days_live?: number;
  mark_age_seconds_live?: number;
  halt_status_band_live?: HaltBand;
  pretrade_gate_completeness_index_live?: number;
  sla_seconds_remaining_live?: number;
  urgency_band_live?: PtcUrgency;
  breach_imminent_flag_live?: boolean;
  regulator_filing_window_hours_live?: number;
  authority_required_live?: Authority;
  bridges_to_trading_risk_chain_live?: boolean;
  bridges_to_position_limit_chain_live?: boolean;
  bridges_to_counterparty_margin_chain_live?: boolean;
}

interface PtcEvent {
  id: string;
  check_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  order_submitted:           { bg: '#e3e7ec', fg: '#445',    label: 'Order submitted' },
  kyc_verified:              { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'KYC verified' },
  credit_line_checked:       { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Credit line checked' },
  settlement_risk_assessed:  { bg: '#fff4d6', fg: '#a06200', label: 'Settlement risk assessed' },
  concentration_checked:     { bg: '#fff4d6', fg: '#a06200', label: 'Concentration checked' },
  halt_status_verified:      { bg: '#fff4d6', fg: '#a06200', label: 'Halt status verified' },
  mark_age_validated:        { bg: '#fff4d6', fg: '#a06200', label: 'Mark age validated' },
  cleared:                   { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Cleared' },
  archived:                  { bg: '#d8dde6', fg: '#445',    label: 'Archived' },
  rejected:                  { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Rejected' },
  held_for_review:           { bg: '#7a0e0e', fg: '#fff',    label: 'Held for review' },
  manually_cleared:          { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Manually cleared' },
  manually_rejected:         { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Manually rejected' },
};

const TIER_TONE: Record<PtcTier, { bg: string; fg: string; label: string }> = {
  micro:    { bg: '#e3e7ec', fg: '#557',    label: 'Micro' },
  standard: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Standard' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material' },
  systemic: { bg: '#7a0e0e', fg: '#fff',    label: 'Systemic' },
};

const URGENCY_TONE: Record<PtcUrgency, { bg: string; fg: string; label: string }> = {
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
  medium:   { bg: '#daf5e2', fg: '#1f6b3a', label: 'Medium' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                   label: 'Active' },
  { key: 'all',                      label: 'All' },
  { key: 'reportable',               label: 'Reportable' },
  { key: 'breached',                 label: 'SLA breached' },
  { key: 'held',                     label: 'Held' },
  { key: 'below_b',                  label: 'B-grade' },
  { key: 'cross_border',             label: 'Cross-border' },
  { key: 'overridden',               label: 'Overridden' },
  { key: 'micro',                    label: 'Micro' },
  { key: 'standard',                 label: 'Standard' },
  { key: 'material',                 label: 'Material' },
  { key: 'systemic',                 label: 'Systemic' },
  { key: 'order_submitted',          label: 'Submitted' },
  { key: 'kyc_verified',             label: 'KYC' },
  { key: 'credit_line_checked',      label: 'Credit' },
  { key: 'settlement_risk_assessed', label: 'Settle risk' },
  { key: 'concentration_checked',    label: 'Concentration' },
  { key: 'halt_status_verified',     label: 'Halt' },
  { key: 'mark_age_validated',       label: 'Mark age' },
  { key: 'cleared',                  label: 'Cleared' },
  { key: 'archived',                 label: 'Archived' },
  { key: 'rejected',                 label: 'Rejected' },
  { key: 'held_for_review',          label: 'Held for review' },
  { key: 'manually_cleared',         label: 'Man cleared' },
  { key: 'manually_rejected',        label: 'Man rejected' },
];

type ActionKind =
  | 'verify-kyc' | 'check-credit-line' | 'assess-settlement-risk'
  | 'check-concentration' | 'verify-halt-status' | 'validate-mark-age'
  | 'clear-order' | 'hold-for-review' | 'manually-clear' | 'manually-reject'
  | 'reject-order' | 'override-rejection' | 'archive-check';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  order_submitted:           'verify-kyc',
  kyc_verified:              'check-credit-line',
  credit_line_checked:       'assess-settlement-risk',
  settlement_risk_assessed:  'check-concentration',
  concentration_checked:     'verify-halt-status',
  halt_status_verified:      'validate-mark-age',
  mark_age_validated:        'clear-order',
  cleared:                   'archive-check',
  held_for_review:           'manually-clear',
  manually_cleared:          'clear-order',
  manually_rejected:         'reject-order',
  rejected:                  'override-rejection',
  archived:                  null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'verify-kyc':             'Verify KYC (Risk system)',
  'check-credit-line':      'Check credit line (Risk system)',
  'assess-settlement-risk': 'Assess settlement risk (Risk system)',
  'check-concentration':    'Check concentration (Risk system)',
  'verify-halt-status':     'Verify halt status (Risk system)',
  'validate-mark-age':      'Validate mark age (Risk system)',
  'clear-order':            'Clear order (Risk system)',
  'hold-for-review':        'Hold for review (Compliance)',
  'manually-clear':         'Manually clear (Compliance)',
  'manually-reject':        'Manually reject (Compliance)',
  'reject-order':           'Reject order (Compliance)',
  'override-rejection':     'Override rejection (Compliance — crosses regulator EVERY tier)',
  'archive-check':          'Archive check (Archiver)',
};

const PRE_CLEAR_STATES: ChainStatus[] = [
  'order_submitted', 'kyc_verified', 'credit_line_checked',
  'settlement_risk_assessed', 'concentration_checked',
  'halt_status_verified', 'mark_age_validated',
];

function fmtMsSla(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '-';
  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(ms);
  if (abs >= 86_400_000) return `${sign}${Math.round(abs / 86_400_000)}d`;
  if (abs >= 3_600_000)  return `${sign}${Math.round(abs / 3_600_000)}h`;
  if (abs >= 60_000)     return `${sign}${Math.round(abs / 60_000)}m`;
  if (abs >= 1000)       return `${sign}${(abs / 1000).toFixed(1)}s`;
  return `${sign}${abs}ms`;
}

function fmtSlaTarget(ms: number | null | undefined): string {
  if (!ms) return '-';
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function fmtDate(s: string | null): string {
  if (!s) return '-';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000)     return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1000)          return `R${(n / 1000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return `${n.toFixed(2)}%`;
}

interface KpiSummary {
  total: number;
  active_count: number;
  held_count: number;
  cleared_count: number;
  rejected_count: number;
  systemic_count: number;
  breached: number;
  reportable_total: number;
  below_b_count: number;
  cross_border_count: number;
  overridden_count: number;
  trading_risk_bridged_count: number;
  position_limit_bridged_count: number;
  counterparty_margin_bridged_count: number;
  total_notional_zar: number;
}

export function PreTradeCreditChainTab() {
  const [rows, setRows] = useState<PtcRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<PtcRow | null>(null);
  const [events, setEvents] = useState<PtcEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: PtcRow[] } & KpiSummary }>('/trader/pretrade-credit/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          held_count: data.held_count || 0,
          cleared_count: data.cleared_count || 0,
          rejected_count: data.rejected_count || 0,
          systemic_count: data.systemic_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          below_b_count: data.below_b_count || 0,
          cross_border_count: data.cross_border_count || 0,
          overridden_count: data.overridden_count || 0,
          trading_risk_bridged_count: data.trading_risk_bridged_count || 0,
          position_limit_bridged_count: data.position_limit_bridged_count || 0,
          counterparty_margin_bridged_count: data.counterparty_margin_bridged_count || 0,
          total_notional_zar: data.total_notional_zar || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load pre-trade credit chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: PtcRow; events: PtcEvent[] } }>(`/trader/pretrade-credit/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load check history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'active')       return !r.is_terminal;
      if (filter === 'reportable')   return r.is_reportable_flag;
      if (filter === 'breached')     return r.sla_breached_live;
      if (filter === 'held')         return r.chain_status === 'held_for_review';
      if (filter === 'below_b')      return !!r.counterparty_credit_grade_below_B;
      if (filter === 'cross_border') return !!r.cross_border_settlement;
      if (filter === 'overridden')   return !!r.override_by;
      if (['micro', 'standard', 'material', 'systemic'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, active_count: 0, held_count: 0, cleared_count: 0,
    rejected_count: 0, systemic_count: 0, breached: 0, reportable_total: 0,
    below_b_count: 0, cross_border_count: 0, overridden_count: 0,
    trading_risk_bridged_count: 0, position_limit_bridged_count: 0,
    counterparty_margin_bridged_count: 0, total_notional_zar: 0,
  };

  const act = useCallback(async (action: ActionKind, row: PtcRow, values: Record<string, string>) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'verify-kyc') {
        if (values.kyc_verified_at) body.kyc_verified_at = values.kyc_verified_at;
      } else if (action === 'check-credit-line') {
        if (values.credit_line_used_zar && !isNaN(Number(values.credit_line_used_zar))) body.credit_line_used_zar = Number(values.credit_line_used_zar);
        if (values.credit_line_limit_zar && !isNaN(Number(values.credit_line_limit_zar))) body.credit_line_limit_zar = Number(values.credit_line_limit_zar);
      } else if (action === 'assess-settlement-risk') {
        if (values.dvp_pvp_unavailable !== undefined && values.dvp_pvp_unavailable !== '') body.dvp_pvp_unavailable = Number(values.dvp_pvp_unavailable) ? 1 : 0;
        if (values.currency_mismatch !== undefined && values.currency_mismatch !== '') body.currency_mismatch = Number(values.currency_mismatch) ? 1 : 0;
        if (values.tenor_days && !isNaN(Number(values.tenor_days))) body.tenor_days = Number(values.tenor_days);
      } else if (action === 'check-concentration') {
        if (values.single_name_exposure_zar && !isNaN(Number(values.single_name_exposure_zar))) body.single_name_exposure_zar = Number(values.single_name_exposure_zar);
        if (values.book_value_zar && !isNaN(Number(values.book_value_zar))) body.book_value_zar = Number(values.book_value_zar);
      } else if (action === 'verify-halt-status') {
        if (values.underlying_halted !== undefined && values.underlying_halted !== '') body.underlying_halted = Number(values.underlying_halted) ? 1 : 0;
        if (values.partial_halt_flag !== undefined && values.partial_halt_flag !== '') body.partial_halt_flag = Number(values.partial_halt_flag) ? 1 : 0;
      } else if (action === 'validate-mark-age') {
        if (values.last_mark_at) body.last_mark_at = values.last_mark_at;
      } else if (action === 'hold-for-review') {
        if (!values.hold_reason) return;
        body.hold_reason = values.hold_reason;
        if (values.hold_triggered_by_sla !== undefined && values.hold_triggered_by_sla !== '') body.hold_triggered_by_sla = Number(values.hold_triggered_by_sla) ? 1 : 0;
      } else if (action === 'manually-reject') {
        if (!values.reject_reason) return;
        body.reject_reason = values.reject_reason;
      } else if (action === 'reject-order') {
        if (!values.reject_reason) return;
        body.reject_reason = values.reject_reason;
      } else if (action === 'override-rejection') {
        if (!values.override_reason || !values.override_by) return;
        body.override_reason = values.override_reason;
        body.override_by = values.override_by;
      }
      await api.post(`/trader/pretrade-credit/chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">
            Pre-Trade Credit Check &amp; Settlement-Risk Exposure — FMA Ch.X s50 + FSCA + BIS PFMI + CFTC Reg 1.73 + MiFID II Art 17
          </h2>
          <p className="text-xs text-[#4a5568]">
            12-state P6 pre-trade gate upstream of every other Trader chain (W2, W9, W29, W36, W44, W52, W60, W68, W76):
            order submitted {'->'} KYC verified {'->'} credit line checked {'->'} settlement risk assessed {'->'} concentration checked {'->'}
            halt status verified {'->'} mark age validated {'->'} cleared {'->'} archived, with hold-for-review / manually-clear /
            manually-reject / reject / override branches. URGENT sub-second SLA polarity: systemic 500ms, material 2s,
            standard 10s, micro 30s on order submitted. FLOOR-AT-MATERIAL on any one of 5 floor flags; FLOOR-AT-SYSTEMIC on
            cross-border settlement OR counterparty credit grade below B. SIGNATURE: reject-order crosses regulator EVERY tier
            when counterparty grade below B; override-rejection crosses EVERY tier; hold-for-review crosses material+systemic
            when SLA-triggered; SLA breach crosses systemic only (BIS PFMI s3.5).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"            value={kpis.total} />
        <Kpi label="Active"           value={kpis.active_count} tone={kpis.active_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Held for review"  value={kpis.held_count}   tone={kpis.held_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cleared"          value={kpis.cleared_count} tone="ok" />
        <Kpi label="Rejected"         value={kpis.rejected_count} tone={kpis.rejected_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Systemic"         value={kpis.systemic_count} tone={kpis.systemic_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"     value={kpis.breached}     tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="B-grade"          value={kpis.below_b_count} tone={kpis.below_b_count > 0 ? 'bad' : 'ok'} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Cross-border: <span className="font-semibold text-[#7a4500]">{kpis.cross_border_count}</span></span>
        <span>Overridden: <span className="font-semibold text-[#9b1f1f]">{kpis.overridden_count}</span></span>
        <span>Bridges to W2 (trading risk): <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.trading_risk_bridged_count}</span></span>
        <span>Bridges to W29 (position limit): <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.position_limit_bridged_count}</span></span>
        <span>Bridges to W68 (counterparty margin): <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.counterparty_margin_bridged_count}</span></span>
        <span>Total notional: <span className="font-semibold text-[#1f5b3a]">{fmtZar(kpis.total_notional_zar)}</span></span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Check #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Order / Counterparty</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Notional</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Credit util</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Settle risk</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Urgency</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const urgency = URGENCY_TONE[r.urgency_band_live ?? 'low'];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.check_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      <div className="text-[11px] font-medium">{r.order_ref}</div>
                      <div className="text-[10px] text-[#6b7685]">
                        {r.counterparty_name ?? r.counterparty_id}
                        {r.counterparty_credit_grade_below_B ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">B-GRADE</span> : null}
                        {r.cross_border_settlement ? <span className="ml-1 text-[9px] font-semibold text-[#7a4500]">XB</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtZar(r.notional_exposure_zar)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtPct(r.credit_line_utilization_pct_live ?? r.credit_line_utilization_pct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{(r.settlement_risk_score_live ?? r.settlement_risk_score)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: urgency.bg, color: urgency.fg }}>
                        {urgency.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached_live ? 'BREACHED' : fmtMsSla(r.ms_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No checks match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={(action, row, values) => act(action, row, values)} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

type ActionField = { key: string; label: string; placeholder?: string; required?: boolean };

const ACTION_FIELDS: Partial<Record<ActionKind, ActionField[]>> = {
  'verify-kyc': [
    { key: 'kyc_verified_at', label: 'KYC verified at (ISO timestamp, leave blank for now)', placeholder: '' },
  ],
  'check-credit-line': [
    { key: 'credit_line_used_zar', label: 'Credit line used (ZAR)', placeholder: '0' },
    { key: 'credit_line_limit_zar', label: 'Credit line limit (ZAR)', placeholder: '0' },
  ],
  'assess-settlement-risk': [
    { key: 'dvp_pvp_unavailable', label: 'DvP/PvP unavailable? (1=yes, 0=no)', placeholder: '0' },
    { key: 'currency_mismatch', label: 'Currency mismatch? (1=yes, 0=no)', placeholder: '0' },
    { key: 'tenor_days', label: 'Tenor days', placeholder: '0' },
  ],
  'check-concentration': [
    { key: 'single_name_exposure_zar', label: 'Single-name exposure (ZAR)', placeholder: '0' },
    { key: 'book_value_zar', label: 'Book value (ZAR)', placeholder: '0' },
  ],
  'verify-halt-status': [
    { key: 'underlying_halted', label: 'Underlying halted? (1=yes, 0=no)', placeholder: '0' },
    { key: 'partial_halt_flag', label: 'Partial halt? (1=yes, 0=no)', placeholder: '0' },
  ],
  'validate-mark-age': [
    { key: 'last_mark_at', label: 'Last mark at (ISO timestamp, leave blank for now)', placeholder: '' },
  ],
  'hold-for-review': [
    { key: 'hold_reason', label: 'Hold reason (required for audit)', required: true, placeholder: '' },
    { key: 'hold_triggered_by_sla', label: 'Triggered by SLA pressure? (1=yes, 0=no)', placeholder: '0' },
  ],
  'manually-reject': [
    { key: 'reject_reason', label: 'Manual reject reason (required for audit)', required: true, placeholder: '' },
  ],
  'reject-order': [
    { key: 'reject_reason', label: 'Reject reason (required for audit — B-grade crosses regulator EVERY tier)', required: true, placeholder: '' },
  ],
  'override-rejection': [
    { key: 'override_reason', label: 'Override reason (compliance override crosses regulator EVERY tier)', required: true, placeholder: '' },
    { key: 'override_by', label: 'Override by (compliance officer ID)', required: true, placeholder: '' },
  ],
};

function Drawer({
  row, events, onClose, onAct,
}: {
  row: PtcRow;
  events: PtcEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: PtcRow, values: Record<string, string>) => void;
}) {
  const [pendingAction, setPendingAction] = React.useState<ActionKind | null>(null);
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>({});

  const openModal = (action: ActionKind) => {
    const fields = ACTION_FIELDS[action];
    if (fields && fields.length > 0) {
      const defaults: Record<string, string> = {};
      for (const f of fields) defaults[f.key] = f.placeholder ?? '';
      setFieldValues(defaults);
      setPendingAction(action);
    } else {
      onAct(action, row, {});
    }
  };

  const submitModal = () => {
    if (!pendingAction) return;
    onAct(pendingAction, row, fieldValues);
    setPendingAction(null);
    setFieldValues({});
  };

  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const isPreClear = PRE_CLEAR_STATES.includes(row.chain_status);
  const canHold = isPreClear;
  const canReject = isPreClear || row.chain_status === 'held_for_review';
  const canManuallyClear = row.chain_status === 'held_for_review';
  const canManuallyReject = row.chain_status === 'held_for_review';
  const canOverride = row.chain_status === 'rejected';

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[760px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.check_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.order_ref}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.current_tier].label} - {row.counterparty_name ?? row.counterparty_id} - {fmtZar(row.notional_exposure_zar)}
              </div>
            </div>
            <button type="button"
              onClick={onClose}
              className="rounded border border-[#d8dde6] bg-white px-2 py-1 text-[12px] text-[#445] hover:bg-[#f3f5f9]"
            >
              Close
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: STATE_TONE[row.chain_status].bg, color: STATE_TONE[row.chain_status].fg }}>
              {STATE_TONE[row.chain_status].label}
            </span>
            {row.urgency_band_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: URGENCY_TONE[row.urgency_band_live].bg, color: URGENCY_TONE[row.urgency_band_live].fg }}>
                {URGENCY_TONE[row.urgency_band_live].label}
              </span>
            )}
            {row.authority_required_live && (
              <span className="inline-block rounded border border-[#d8dde6] bg-white px-2 py-0.5 text-[#445]">
                Authority: {row.authority_required_live.replace(/_/g, ' ')}
              </span>
            )}
            {row.is_reportable_flag && (
              <span className="inline-block rounded bg-[#fde0e0] px-2 py-0.5 font-semibold text-[#9b1f1f]">Reportable</span>
            )}
            {row.regulator_crossed_at && (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">Regulator crossed</span>
            )}
          </div>
        </header>

        <div className="px-5 py-4 space-y-4">
          <Section title="LIVE pre-trade battery">
            <Grid>
              <Field k="Completeness" v={`${row.pretrade_gate_completeness_index_live ?? row.pretrade_gate_completeness_index} / 130`} />
              <Field k="Credit utilization" v={fmtPct(row.credit_line_utilization_pct_live ?? row.credit_line_utilization_pct)} />
              <Field k="Settlement risk score" v={String(row.settlement_risk_score_live ?? row.settlement_risk_score)} />
              <Field k="Concentration ratio" v={fmtPct(row.concentration_ratio_pct_live ?? row.concentration_ratio_pct)} />
              <Field k="KYC recency" v={`${row.kyc_recency_days_live ?? row.kyc_recency_days}d`} />
              <Field k="Mark age" v={`${row.mark_age_seconds_live ?? row.mark_age_seconds}s`} />
              <Field k="Halt status" v={(row.halt_status_band_live ?? row.halt_status_band) ?? '-'} />
              <Field k="SLA remaining" v={fmtMsSla(row.ms_until_sla)} />
              <Field k="SLA target window" v={fmtSlaTarget(row.sla_target_ms)} />
              <Field k="Breach imminent" v={row.breach_imminent_flag_live ? 'YES' : 'no'} />
              <Field k="Regulator filing window" v={row.regulator_filing_window_hours_live ? `${row.regulator_filing_window_hours_live}h` : '-'} />
              <Field k="Authority required" v={row.authority_required_live ?? '-'} />
            </Grid>
          </Section>

          <Section title="Bridges">
            <Grid>
              <Field k="W2 trading-risk" v={row.bridges_to_trading_risk_chain_live ? 'YES' : 'no'} />
              <Field k="W29 position-limit" v={row.bridges_to_position_limit_chain_live ? 'YES' : 'no'} />
              <Field k="W68 counterparty-margin" v={row.bridges_to_counterparty_margin_chain_live ? 'YES' : 'no'} />
              <Field k="Counterparty margin ref" v={row.counterparty_margin_ref ?? '-'} />
              <Field k="VaR limit" v={fmtZar(row.var_limit_zar)} />
              <Field k="Current position" v={fmtZar(row.current_position_zar)} />
              <Field k="Position limit" v={fmtZar(row.position_limit_zar)} />
            </Grid>
          </Section>

          <Section title="Floor flags">
            <Grid>
              <Field k="Cross-border settlement" v={row.cross_border_settlement ? 'YES' : 'no'} />
              <Field k="Counterparty grade < B" v={row.counterparty_credit_grade_below_B ? 'YES' : 'no'} />
              <Field k="Concentration > 25%" v={row.concentration_above_25pct ? 'YES' : 'no'} />
              <Field k="Halted underlying" v={row.halted_underlying ? 'YES' : 'no'} />
              <Field k="First trade with cpty" v={row.first_trade_with_counterparty ? 'YES' : 'no'} />
            </Grid>
          </Section>

          <Section title="Order detail">
            <Grid>
              <Field k="Trader" v={row.trader_party_name ?? row.trader_party_id} />
              <Field k="Counterparty" v={row.counterparty_name ?? row.counterparty_id} />
              <Field k="Side" v={row.side ?? '-'} />
              <Field k="Volume" v={`${row.volume_mwh.toLocaleString('en-ZA')} MWh`} />
              <Field k="Price" v={`R${row.price_zar_per_mwh.toLocaleString('en-ZA')}/MWh`} />
              <Field k="Notional" v={fmtZar(row.notional_exposure_zar)} />
              <Field k="Desk" v={row.desk ?? '-'} />
              <Field k="Venue" v={row.venue ?? '-'} />
              <Field k="Product class" v={row.product_class ?? '-'} />
              <Field k="Energy type" v={row.energy_type ?? '-'} />
              <Field k="Tenor days" v={String(row.tenor_days)} />
              <Field k="DvP/PvP unavailable" v={row.dvp_pvp_unavailable ? 'YES' : 'no'} />
            </Grid>
          </Section>

          {row.reject_reason || row.override_reason || row.hold_reason ? (
            <Section title="Reason ledger">
              <Grid>
                {row.hold_reason && <Field k="Hold reason" v={row.hold_reason} />}
                {row.reject_reason && <Field k="Reject reason" v={row.reject_reason} />}
                {row.override_reason && <Field k="Override reason" v={row.override_reason} />}
                {row.override_by && <Field k="Override by" v={row.override_by} />}
              </Grid>
            </Section>
          ) : null}

          <Section title="Actions">
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <ActionButton tone="primary" onClick={() => openModal(nextAction)}>
                  {ACTION_LABEL[nextAction]}
                </ActionButton>
              )}
              {canHold && (
                <ActionButton tone="warn" onClick={() => openModal('hold-for-review')}>
                  {ACTION_LABEL['hold-for-review']}
                </ActionButton>
              )}
              {canManuallyClear && (
                <ActionButton tone="ok" onClick={() => openModal('manually-clear')}>
                  {ACTION_LABEL['manually-clear']}
                </ActionButton>
              )}
              {canManuallyReject && (
                <ActionButton tone="bad" onClick={() => openModal('manually-reject')}>
                  {ACTION_LABEL['manually-reject']}
                </ActionButton>
              )}
              {canReject && (
                <ActionButton tone="bad" onClick={() => openModal('reject-order')}>
                  {ACTION_LABEL['reject-order']}
                </ActionButton>
              )}
              {canOverride && (
                <ActionButton tone="bad" onClick={() => openModal('override-rejection')}>
                  {ACTION_LABEL['override-rejection']}
                </ActionButton>
              )}
              {row.chain_status === 'cleared' && (
                <ActionButton tone="neutral" onClick={() => openModal('archive-check')}>
                  {ACTION_LABEL['archive-check']}
                </ActionButton>
              )}
            </div>
          </Section>

          {pendingAction && ACTION_FIELDS[pendingAction] && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-md rounded-lg border border-[#d8dde6] bg-white p-5 shadow-2xl">
                <h3 className="mb-4 text-[13px] font-semibold text-[#0c2a4d]">{ACTION_LABEL[pendingAction]}</h3>
                <div className="space-y-3">
                  {(ACTION_FIELDS[pendingAction] ?? []).map((f) => (
                    <div key={f.key}>
                      <label className="mb-1 block text-[11px] font-medium text-[#4a5568]">
                        {f.label}{f.required && <span className="ml-1 text-red-600">*</span>}
                      </label>
                      <input
                        type="text"
                        value={fieldValues[f.key] ?? ''}
                        onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full rounded border border-[#d8dde6] px-2 py-1.5 text-[12px] text-[#0c2a4d] outline-none focus:border-[#c2873a]"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <ActionButton tone="neutral" onClick={() => { setPendingAction(null); setFieldValues({}); }}>
                    Cancel
                  </ActionButton>
                  <ActionButton tone="primary" onClick={submitModal}>
                    Confirm
                  </ActionButton>
                </div>
              </div>
            </div>
          )}

          <Section title="Timeline">
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="rounded border border-[#d8dde6] bg-white px-3 py-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[10px] text-[#6b7685]">{fmtDate(e.created_at)}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#4a5568]">
                    {e.from_status ?? '-'} {'->'} {e.to_status ?? '-'} - actor {e.actor_party ?? e.actor_id ?? '-'}
                  </div>
                  {e.notes && <div className="mt-1 text-[11px] text-[#445]">{e.notes}</div>}
                </div>
              ))}
              {events.length === 0 && (
                <div className="rounded border border-dashed border-[#d8dde6] px-3 py-3 text-center text-[11px] text-[#6b7685]">
                  No events yet.
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#4a5568]">{title}</h3>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{children}</div>;
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">{k}</div>
      <div className="text-[11px] font-medium text-[#0c2a4d]">{v}</div>
    </div>
  );
}

function ActionButton({
  tone, onClick, children,
}: {
  tone: 'primary' | 'ok' | 'warn' | 'bad' | 'neutral';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const bg =
    tone === 'primary' ? 'bg-[#c2873a] text-white' :
    tone === 'ok'      ? 'bg-[#1f6b3a] text-white' :
    tone === 'warn'    ? 'bg-[#a06200] text-white' :
    tone === 'bad'     ? 'bg-[#7a0e0e] text-white' :
                         'bg-white text-[#445] border border-[#d8dde6]';
  return (
    <button type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-[11px] font-medium ${bg}`}
    >
      {children}
    </button>
  );
}

export default PreTradeCreditChainTab;
