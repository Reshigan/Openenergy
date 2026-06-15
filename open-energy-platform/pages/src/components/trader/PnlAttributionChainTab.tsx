// Wave 111 — Trader Daily P&L Attribution & Risk-Adjusted Returns (P6).
//
// 11th Trader chain. EOD P&L decomposition + risk-decomp + benchmark
// comparison + IFRS 9 stage classification engine. Beats Murex MX.3 /
// Calypso / Bloomberg PORT / FIS Adaptiv / OpenLink Endur / OneTick /
// Imagine Risk / Kondor+ / Front Arena / SunGard FastVal.
//
// 12-state P6 + 3 branches with URGENT SLA polarity stored in HOURS,
// FLOOR-AT-MATERIAL tier overlay, 4-step authority ladder, LIVE 17-field
// battery, 3-bridge architecture to W2 / W107 / W44.
//
// Standards: FMA Ch.X + FSCA Conduct Standard 1/2020 + IFRS 9 + IFRS 13
// + Basel III FRTB IMA + SA + GIPS 2020 + MAR.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'day_open' | 'mtm_run' | 'realised_computed' | 'unrealised_computed'
  | 'attribution_decomposed' | 'risk_decomposed' | 'benchmark_compared'
  | 'reviewed' | 'approved' | 'published' | 'reconciled' | 'archived'
  | 'held_for_review' | 'variance_investigation' | 'restated';

type PnaTier = 'minor' | 'standard' | 'material' | 'systemic';
type PnaUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'trader' | 'desk_head' | 'market_risk_manager' | 'CFO';
type Ifrs9Stage = 'stage_1' | 'stage_2' | 'stage_3';

interface PnaRow {
  [key: string]: unknown;
  id: string;
  pnl_number: string;
  book_id: string;
  book_label: string | null;
  desk_id: string | null;
  business_date: string;
  gross_notional_zar: number;
  trading_risk_ref: string | null;
  pretrade_credit_ref: string | null;
  trade_reporting_ref: string | null;
  mtm_zar: number;
  realised_pnl_zar: number;
  unrealised_pnl_zar: number;
  total_daily_pnl_zar: number;
  mtd_pnl_zar: number;
  ytd_pnl_zar: number;
  delta_zar: number;
  gamma_zar: number;
  vega_zar: number;
  theta_zar: number;
  fx_zar: number;
  carry_zar: number;
  residual_zar: number;
  attribution_gap_pct: number;
  var_contribution_zar: number;
  scenario_impact_zar: number;
  kri_exceedance_count: number;
  benchmark_label: string | null;
  benchmark_return_pct: number;
  alpha_pct: number;
  tracking_error_pct: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  information_ratio: number;
  max_drawdown_pct: number;
  restate_count: number;
  last_restate_at: string | null;
  ifrs9_stage: Ifrs9Stage | null;
  stress_period_active: number;
  restated_within_30d: number;
  large_attribution_gap_pct_5_plus: number;
  regulatory_book_FRTB_IMA: number;
  cross_border_consolidation: number;
  current_tier: PnaTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  pnl_completeness_index: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  hold_reason: string | null;
  variance_reason: string | null;
  restate_reason: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  day_open_at: string | null;
  mtm_run_at: string | null;
  realised_computed_at: string | null;
  unrealised_computed_at: string | null;
  attribution_decomposed_at: string | null;
  risk_decomposed_at: string | null;
  benchmark_compared_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  reconciled_at: string | null;
  archived_at: string | null;
  held_for_review_at: string | null;
  variance_investigation_at: string | null;
  restated_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: PnaUrgency;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  total_daily_pnl_zar_live?: number;
  attribution_gap_pct_live?: number;
  ifrs9_stage_live?: Ifrs9Stage;
  variance_investigation_imminent_live?: boolean;
  restate_risk_live?: boolean;
  floor_flag_count_live?: number;
  pnl_completeness_index_live?: number;
  bridges_to_trading_risk_chain_live?: boolean;
  bridges_to_pretrade_credit_chain_live?: boolean;
  bridges_to_trade_reporting_chain_live?: boolean;
}

interface PnaEvent {
  id: string;
  pnl_id: string;
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
  day_open:               { bg: '#e3e7ec', fg: '#445',    label: 'Day open' },
  mtm_run:                { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'MTM run' },
  realised_computed:      { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Realised computed' },
  unrealised_computed:    { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Unrealised computed' },
  attribution_decomposed: { bg: '#fff4d6', fg: '#a06200', label: 'Attribution decomposed' },
  risk_decomposed:        { bg: '#fff4d6', fg: '#a06200', label: 'Risk decomposed' },
  benchmark_compared:     { bg: '#fff4d6', fg: '#a06200', label: 'Benchmark compared' },
  reviewed:               { bg: '#daf5e2', fg: '#1f6b3a', label: 'Reviewed' },
  approved:               { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  published:              { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Published' },
  reconciled:             { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Reconciled' },
  archived:               { bg: '#d8dde6', fg: '#445',    label: 'Archived' },
  held_for_review:        { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Held for review' },
  variance_investigation: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Variance investigation' },
  restated:               { bg: '#7a0e0e', fg: '#fff',    label: 'Restated' },
};

const TIER_TONE: Record<PnaTier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  standard: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Standard' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material' },
  systemic: { bg: '#7a0e0e', fg: '#fff',    label: 'Systemic' },
};

const URGENCY_TONE: Record<PnaUrgency, { bg: string; fg: string; label: string }> = {
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
  medium:   { bg: '#daf5e2', fg: '#1f6b3a', label: 'Medium' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

const IFRS9_TONE: Record<Ifrs9Stage, { bg: string; fg: string; label: string }> = {
  stage_1: { bg: '#daf5e2', fg: '#1f6b3a', label: 'IFRS9 1' },
  stage_2: { bg: '#fff4d6', fg: '#a06200', label: 'IFRS9 2' },
  stage_3: { bg: '#7a0e0e', fg: '#fff',    label: 'IFRS9 3' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                 label: 'Active' },
  { key: 'all',                    label: 'All' },
  { key: 'reportable',             label: 'Reportable' },
  { key: 'breached',               label: 'SLA breached' },
  { key: 'held',                   label: 'Held' },
  { key: 'variance',               label: 'Variance' },
  { key: 'restated',               label: 'Restated' },
  { key: 'stage3',                 label: 'IFRS9 stage 3' },
  { key: 'frtb',                   label: 'FRTB IMA' },
  { key: 'cross_border',           label: 'Cross-border' },
  { key: 'stress',                 label: 'Stress period' },
  { key: 'minor',                  label: 'Minor' },
  { key: 'standard',               label: 'Standard' },
  { key: 'material',               label: 'Material' },
  { key: 'systemic',               label: 'Systemic' },
  { key: 'day_open',               label: 'Day open' },
  { key: 'mtm_run',                label: 'MTM' },
  { key: 'realised_computed',      label: 'Realised' },
  { key: 'unrealised_computed',    label: 'Unrealised' },
  { key: 'attribution_decomposed', label: 'Attribution' },
  { key: 'risk_decomposed',        label: 'Risk' },
  { key: 'benchmark_compared',     label: 'Benchmark' },
  { key: 'reviewed',               label: 'Reviewed' },
  { key: 'approved',               label: 'Approved' },
  { key: 'published',              label: 'Published' },
  { key: 'reconciled',             label: 'Reconciled' },
  { key: 'archived',               label: 'Archived' },
];

type ActionKind =
  | 'run-mtm' | 'compute-realised' | 'compute-unrealised'
  | 'decompose-attribution' | 'decompose-risk' | 'compare-to-benchmark'
  | 'submit-to-review' | 'approve-pnl' | 'hold-for-review'
  | 'override-hold' | 'publish-pnl' | 'reconcile' | 'archive-pnl'
  | 'flag-variance-investigation' | 'restate-pnl';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  day_open:               'run-mtm',
  mtm_run:                'compute-realised',
  realised_computed:      'compute-unrealised',
  unrealised_computed:    'decompose-attribution',
  attribution_decomposed: 'decompose-risk',
  risk_decomposed:        'compare-to-benchmark',
  benchmark_compared:     'submit-to-review',
  reviewed:               'approve-pnl',
  approved:               'publish-pnl',
  published:              'reconcile',
  reconciled:             'archive-pnl',
  archived:               null,
  held_for_review:        'override-hold',
  variance_investigation: 'decompose-attribution',
  restated:               'run-mtm',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'run-mtm':                     'Run MTM (Trader)',
  'compute-realised':            'Compute realised P&L (Trader)',
  'compute-unrealised':          'Compute unrealised P&L (Trader)',
  'decompose-attribution':       'Decompose attribution (Risk)',
  'decompose-risk':              'Decompose risk (Risk)',
  'compare-to-benchmark':        'Compare to benchmark (Risk)',
  'submit-to-review':            'Submit to review (Risk)',
  'approve-pnl':                 'Approve P&L (Desk head)',
  'hold-for-review':             'Hold for review (Desk head)',
  'override-hold':               'Override hold (Desk head)',
  'publish-pnl':                 'Publish P&L (Market Risk Mgr)',
  'reconcile':                   'Reconcile (Finance)',
  'archive-pnl':                 'Archive P&L (Finance)',
  'flag-variance-investigation': 'Flag variance investigation (Risk)',
  'restate-pnl':                 'Restate P&L (CFO — crosses regulator EVERY tier if 2nd within 30d)',
};

function fmtHoursSla(h: number | null | undefined): string {
  if (h === null || h === undefined) return '-';
  const sign = h < 0 ? '-' : '';
  const abs = Math.abs(h);
  if (abs >= 24) return `${sign}${(abs / 24).toFixed(1)}d`;
  if (abs >= 1)  return `${sign}${abs.toFixed(1)}h`;
  return `${sign}${Math.round(abs * 60)}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '-';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}R${(abs / 1_000_000_000).toFixed(2)}bn`;
  if (abs >= 1_000_000)     return `${sign}R${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1000)          return `${sign}R${(abs / 1000).toFixed(0)}k`;
  return `${sign}R${abs.toLocaleString('en-ZA')}`;
}

function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return '-';
  return `${n.toFixed(digits)}%`;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return '-';
  return n.toFixed(digits);
}

interface KpiSummary {
  total: number;
  active_count: number;
  variance_count: number;
  held_count: number;
  restated_count: number;
  systemic_count: number;
  breached: number;
  reportable_total: number;
  stage3_count: number;
  variance_imminent_count: number;
  restate_risk_count: number;
  trading_risk_bridged_count: number;
  pretrade_bridged_count: number;
  trade_reporting_bridged_count: number;
  total_daily_pnl_zar_sum: number;
}

export function PnlAttributionChainTab() {
  const [rows, setRows] = useState<PnaRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<PnaRow | null>(null);
  const [events, setEvents] = useState<PnaEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: PnaRow[] } & KpiSummary }>('/trader/pnl-attribution/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          variance_count: data.variance_count || 0,
          held_count: data.held_count || 0,
          restated_count: data.restated_count || 0,
          systemic_count: data.systemic_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          stage3_count: data.stage3_count || 0,
          variance_imminent_count: data.variance_imminent_count || 0,
          restate_risk_count: data.restate_risk_count || 0,
          trading_risk_bridged_count: data.trading_risk_bridged_count || 0,
          pretrade_bridged_count: data.pretrade_bridged_count || 0,
          trade_reporting_bridged_count: data.trade_reporting_bridged_count || 0,
          total_daily_pnl_zar_sum: data.total_daily_pnl_zar_sum || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load P&L attribution chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: PnaRow; events: PnaEvent[] } }>(`/trader/pnl-attribution/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'active')       return !r.is_terminal;
      if (filter === 'reportable')   return r.is_reportable_flag;
      if (filter === 'breached')     return r.sla_breached_live;
      if (filter === 'held')         return r.chain_status === 'held_for_review';
      if (filter === 'variance')     return r.chain_status === 'variance_investigation';
      if (filter === 'restated')     return r.chain_status === 'restated';
      if (filter === 'stage3')       return r.ifrs9_stage_live === 'stage_3';
      if (filter === 'frtb')         return !!r.regulatory_book_FRTB_IMA;
      if (filter === 'cross_border') return !!r.cross_border_consolidation;
      if (filter === 'stress')       return !!r.stress_period_active;
      if (['minor', 'standard', 'material', 'systemic'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, active_count: 0, variance_count: 0, held_count: 0,
    restated_count: 0, systemic_count: 0, breached: 0, reportable_total: 0,
    stage3_count: 0, variance_imminent_count: 0, restate_risk_count: 0,
    trading_risk_bridged_count: 0, pretrade_bridged_count: 0,
    trade_reporting_bridged_count: 0, total_daily_pnl_zar_sum: 0,
  };

  const act = useCallback(async (action: ActionKind, row: PnaRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'run-mtm') {
        const v = window.prompt('MTM ZAR (leave blank to keep):', String(row.mtm_zar));
        if (v && !isNaN(Number(v))) body.mtm_zar = Number(v);
      } else if (action === 'compute-realised') {
        const v = window.prompt('Realised P&L ZAR:', String(row.realised_pnl_zar));
        if (v && !isNaN(Number(v))) body.realised_pnl_zar = Number(v);
      } else if (action === 'compute-unrealised') {
        const v = window.prompt('Unrealised P&L ZAR:', String(row.unrealised_pnl_zar));
        if (v && !isNaN(Number(v))) body.unrealised_pnl_zar = Number(v);
      } else if (action === 'decompose-attribution') {
        const d = window.prompt('Delta ZAR:', String(row.delta_zar));
        if (d && !isNaN(Number(d))) body.delta_zar = Number(d);
        const g = window.prompt('Gamma ZAR:', String(row.gamma_zar));
        if (g && !isNaN(Number(g))) body.gamma_zar = Number(g);
        const v = window.prompt('Vega ZAR:', String(row.vega_zar));
        if (v && !isNaN(Number(v))) body.vega_zar = Number(v);
        const t = window.prompt('Theta ZAR:', String(row.theta_zar));
        if (t && !isNaN(Number(t))) body.theta_zar = Number(t);
        const fx = window.prompt('FX ZAR:', String(row.fx_zar));
        if (fx && !isNaN(Number(fx))) body.fx_zar = Number(fx);
        const c = window.prompt('Carry ZAR:', String(row.carry_zar));
        if (c && !isNaN(Number(c))) body.carry_zar = Number(c);
        const r = window.prompt('Residual ZAR:', String(row.residual_zar));
        if (r && !isNaN(Number(r))) body.residual_zar = Number(r);
      } else if (action === 'decompose-risk') {
        const v = window.prompt('VaR contribution ZAR:', String(row.var_contribution_zar));
        if (v && !isNaN(Number(v))) body.var_contribution_zar = Number(v);
        const s = window.prompt('Scenario impact ZAR:', String(row.scenario_impact_zar));
        if (s && !isNaN(Number(s))) body.scenario_impact_zar = Number(s);
        const k = window.prompt('KRI exceedance count:', String(row.kri_exceedance_count));
        if (k && !isNaN(Number(k))) body.kri_exceedance_count = Number(k);
      } else if (action === 'compare-to-benchmark') {
        const a = window.prompt('Alpha % vs benchmark:', String(row.alpha_pct));
        if (a && !isNaN(Number(a))) body.alpha_pct = Number(a);
        const t = window.prompt('Tracking error %:', String(row.tracking_error_pct));
        if (t && !isNaN(Number(t))) body.tracking_error_pct = Number(t);
        const sh = window.prompt('Sharpe ratio (blank for auto):', String(row.sharpe_ratio));
        if (sh && !isNaN(Number(sh))) body.sharpe_ratio = Number(sh);
        const so = window.prompt('Sortino ratio (blank for auto):', String(row.sortino_ratio));
        if (so && !isNaN(Number(so))) body.sortino_ratio = Number(so);
      } else if (action === 'hold-for-review') {
        const reason = window.prompt('Hold reason (required for audit):', row.hold_reason ?? '');
        if (!reason) return;
        body.hold_reason = reason;
      } else if (action === 'flag-variance-investigation') {
        const reason = window.prompt('Variance reason (required for audit):', row.variance_reason ?? '');
        if (!reason) return;
        body.variance_reason = reason;
      } else if (action === 'restate-pnl') {
        const reason = window.prompt('Restate reason (required). NOTE: 2nd restate within 30d crosses regulator EVERY tier:', row.restate_reason ?? '');
        if (!reason) return;
        body.restate_reason = reason;
      }
      await api.post(`/trader/pnl-attribution/chain/${row.id}/${action}`, body);
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
            Daily P&amp;L Attribution &amp; Risk-Adjusted Returns — FMA Ch.X + FSCA Conduct Standard 1/2020 + IFRS 9 + IFRS 13 + Basel III FRTB + GIPS 2020 + MAR
          </h2>
          <p className="text-xs text-[#4a5568]">
            12-state P6 EOD attribution lifecycle:
            day open {'→'} MTM run {'→'} realised {'→'} unrealised {'→'} attribution decomposed {'→'} risk decomposed {'→'} benchmark compared {'→'}
            reviewed {'→'} approved {'→'} published {'→'} reconciled {'→'} archived, with hold-for-review / variance-investigation / restated branches.
            URGENT SLA polarity (HOURS) on day_open: minor 24h, standard 18h, material 12h, systemic 6h. FLOOR-AT-MATERIAL on any
            one of 5 floor flags (stress period, restated&lt;30d, large gap, FRTB IMA, cross-border); FLOOR-AT-SYSTEMIC on 2+ flags
            OR FRTB IMA OR cross-border. SIGNATURE: <strong>restate-pnl crosses regulator EVERY tier when 2nd within 30d</strong> (IFRS 9
            stage 3 trigger); flag-variance crosses material+systemic at gap&ge;10%; approve-pnl crosses systemic when stress
            period active; publish-pnl crosses systemic when FRTB IMA; SLA breach crosses material+systemic. 4-step authority
            ladder: trader {'→'} desk_head {'→'} market_risk_manager {'→'} CFO. 3 bridges: trading risk, pre-trade credit,
            trade reporting.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"            value={kpis.total} />
        <Kpi label="Active"           value={kpis.active_count} tone={kpis.active_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Variance"         value={kpis.variance_count} tone={kpis.variance_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Held"             value={kpis.held_count}   tone={kpis.held_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Restated"         value={kpis.restated_count} tone={kpis.restated_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Systemic"         value={kpis.systemic_count} tone={kpis.systemic_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"     value={kpis.breached}     tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Stage 3"          value={kpis.stage3_count} tone={kpis.stage3_count > 0 ? 'bad' : 'ok'} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Variance imminent: <span className="font-semibold text-[#a06200]">{kpis.variance_imminent_count}</span></span>
        <span>Restate risk: <span className="font-semibold text-[#9b1f1f]">{kpis.restate_risk_count}</span></span>
        <span>Bridges to risk: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.trading_risk_bridged_count}</span></span>
        <span>Bridges to pretrade: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.pretrade_bridged_count}</span></span>
        <span>Bridges to reporting: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.trade_reporting_bridged_count}</span></span>
        <span>Total daily P&amp;L: <span className={`font-semibold ${kpis.total_daily_pnl_zar_sum >= 0 ? 'text-[#1f5b3a]' : 'text-[#9b1f1f]'}`}>{fmtZar(kpis.total_daily_pnl_zar_sum)}</span></span>
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>P&amp;L #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Book / Date</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Notional</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Daily P&amp;L</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Attr gap</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>IFRS9</th>
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
                const ifrs9 = IFRS9_TONE[r.ifrs9_stage_live ?? 'stage_1'];
                const pnl = r.total_daily_pnl_zar_live ?? r.total_daily_pnl_zar;
                const gap = r.attribution_gap_pct_live ?? r.attribution_gap_pct;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.pnl_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      <div className="text-[11px] font-medium">{r.book_label ?? r.book_id}</div>
                      <div className="text-[10px] text-[#6b7685]">
                        {r.business_date}
                        {r.regulatory_book_FRTB_IMA ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">FRTB</span> : null}
                        {r.cross_border_consolidation ? <span className="ml-1 text-[9px] font-semibold text-[#7a4500]">XB</span> : null}
                        {r.stress_period_active ? <span className="ml-1 text-[9px] font-semibold text-[#a06200]">STRESS</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtZar(r.gross_notional_zar)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${pnl >= 0 ? 'text-[#1f5b3a]' : 'text-[#9b1f1f]'}`}>{fmtZar(pnl)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${gap >= 10 ? 'text-[#9b1f1f] font-semibold' : gap >= 5 ? 'text-[#a06200]' : 'text-[#4a5568]'}`}>{fmtPct(gap)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ifrs9.bg, color: ifrs9.fg }}>
                        {ifrs9.label}
                      </span>
                    </td>
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
                      {r.sla_breached_live ? 'BREACHED' : fmtHoursSla(r.sla_hours_remaining_live)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#4a5568]">No P&amp;L rows match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
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

function Drawer({
  row, events, onClose, onAct,
}: {
  row: PnaRow;
  events: PnaEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: PnaRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const pnl = row.total_daily_pnl_zar_live ?? row.total_daily_pnl_zar;
  const gap = row.attribution_gap_pct_live ?? row.attribution_gap_pct;
  const completeness = row.pnl_completeness_index_live ?? row.pnl_completeness_index;
  const isPreReview: ChainStatus[] = [
    'day_open', 'mtm_run', 'realised_computed', 'unrealised_computed',
    'attribution_decomposed', 'risk_decomposed', 'benchmark_compared',
  ];
  const canHold = row.chain_status === 'reviewed';
  const canFlagVariance = row.chain_status === 'attribution_decomposed';
  const canRestate = row.chain_status === 'published' || row.chain_status === 'reconciled';

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[820px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.pnl_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.book_label ?? row.book_id} — {row.business_date}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.current_tier].label} {'•'} {fmtZar(row.gross_notional_zar)} notional {'•'} Daily P&amp;L <span className={pnl >= 0 ? 'text-[#1f5b3a]' : 'text-[#9b1f1f]'}>{fmtZar(pnl)}</span>
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
            {row.ifrs9_stage_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: IFRS9_TONE[row.ifrs9_stage_live].bg, color: IFRS9_TONE[row.ifrs9_stage_live].fg }}>
                {IFRS9_TONE[row.ifrs9_stage_live].label}
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

        <div className="p-5 space-y-4">
          {/* LIVE 17-field battery */}
          <Section title="LIVE battery (17 fields, re-computed every fetch)">
            <Grid>
              <Field label="MTM ZAR"             value={fmtZar(row.mtm_zar)} />
              <Field label="Realised P&L"        value={fmtZar(row.realised_pnl_zar)} />
              <Field label="Unrealised P&L"      value={fmtZar(row.unrealised_pnl_zar)} />
              <Field label="Total daily P&L"     value={fmtZar(pnl)} tone={pnl >= 0 ? 'ok' : 'bad'} />
              <Field label="MTD P&L"             value={fmtZar(row.mtd_pnl_zar)} />
              <Field label="YTD P&L"             value={fmtZar(row.ytd_pnl_zar)} />
              <Field label="Attribution gap"     value={fmtPct(gap)} tone={gap >= 10 ? 'bad' : gap >= 5 ? 'warn' : 'ok'} />
              <Field label="Completeness index"  value={`${completeness} / 130`} />
              <Field label="SLA hours remaining" value={fmtHoursSla(row.sla_hours_remaining_live)} tone={row.sla_breached_live ? 'bad' : 'ok'} />
              <Field label="SLA window"          value={fmtHoursSla(row.sla_window_hours)} />
              <Field label="Authority"           value={row.authority_required_live ?? '-'} />
              <Field label="Regulator filing"    value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
              <Field label="Sharpe ratio"        value={fmtNum(row.sharpe_ratio, 3)} />
              <Field label="Sortino ratio"       value={fmtNum(row.sortino_ratio, 3)} />
              <Field label="Information ratio"   value={fmtNum(row.information_ratio, 3)} />
              <Field label="Max drawdown"        value={fmtPct(row.max_drawdown_pct)} />
              <Field label="Floor flags"         value={String(row.floor_flag_count_live ?? 0)} tone={(row.floor_flag_count_live || 0) >= 2 ? 'bad' : (row.floor_flag_count_live || 0) >= 1 ? 'warn' : 'ok'} />
            </Grid>
          </Section>

          {/* Attribution decomposition */}
          <Section title="Attribution decomposition (greeks + carry + residual)">
            <Grid>
              <Field label="Delta ZAR"    value={fmtZar(row.delta_zar)} />
              <Field label="Gamma ZAR"    value={fmtZar(row.gamma_zar)} />
              <Field label="Vega ZAR"     value={fmtZar(row.vega_zar)} />
              <Field label="Theta ZAR"    value={fmtZar(row.theta_zar)} />
              <Field label="FX ZAR"       value={fmtZar(row.fx_zar)} />
              <Field label="Carry ZAR"    value={fmtZar(row.carry_zar)} />
              <Field label="Residual ZAR" value={fmtZar(row.residual_zar)} />
              <Field label="Gap"          value={fmtPct(gap)} tone={gap >= 10 ? 'bad' : gap >= 5 ? 'warn' : 'ok'} />
            </Grid>
          </Section>

          {/* Risk decomposition */}
          <Section title="Risk decomposition + benchmark">
            <Grid>
              <Field label="VaR contribution"  value={fmtZar(row.var_contribution_zar)} />
              <Field label="Scenario impact"   value={fmtZar(row.scenario_impact_zar)} />
              <Field label="KRI exceedance"    value={String(row.kri_exceedance_count)} tone={row.kri_exceedance_count > 0 ? 'bad' : 'ok'} />
              <Field label="Benchmark"         value={row.benchmark_label ?? '-'} />
              <Field label="Benchmark return"  value={fmtPct(row.benchmark_return_pct)} />
              <Field label="Alpha vs bench"    value={fmtPct(row.alpha_pct)} />
              <Field label="Tracking error"    value={fmtPct(row.tracking_error_pct)} />
              <Field label="Restate count"     value={String(row.restate_count)} tone={row.restate_count >= 2 ? 'bad' : row.restate_count >= 1 ? 'warn' : 'ok'} />
            </Grid>
          </Section>

          {/* Bridges */}
          <Section title="3-bridge architecture (trading risk / pre-trade credit / trade reporting)">
            <Grid>
              <Field label="Trading risk ref"      value={row.trading_risk_ref ?? '-'}  tone={row.bridges_to_trading_risk_chain_live ? 'ok' : 'warn'} />
              <Field label="Pre-trade credit ref"  value={row.pretrade_credit_ref ?? '-'} tone={row.bridges_to_pretrade_credit_chain_live ? 'ok' : 'warn'} />
              <Field label="Trade reporting ref"   value={row.trade_reporting_ref ?? '-'} tone={row.bridges_to_trade_reporting_chain_live ? 'ok' : 'warn'} />
              <Field label="Regulator inbox ref"     value={row.regulator_inbox_ref ?? '-'} />
              <Field label="Regulator ref"           value={row.regulator_ref ?? '-'} />
              <Field label="Last restate at"         value={fmtDate(row.last_restate_at)} />
            </Grid>
          </Section>

          {/* Floor flags */}
          <Section title="Floor flags (5)">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <FlagPill label="Stress period"    on={!!row.stress_period_active} />
              <FlagPill label="Restated <30d"    on={!!row.restated_within_30d} />
              <FlagPill label="Gap ≥5%"          on={!!row.large_attribution_gap_pct_5_plus} />
              <FlagPill label="FRTB IMA"         on={!!row.regulatory_book_FRTB_IMA} />
              <FlagPill label="Cross-border"     on={!!row.cross_border_consolidation} />
            </div>
          </Section>

          {/* Action ladder */}
          <Section title="Actions">
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <ActionButton tone="primary" onClick={() => onAct(nextAction, row)}>
                  {ACTION_LABEL[nextAction]}
                </ActionButton>
              )}
              {canHold && (
                <ActionButton tone="warn" onClick={() => onAct('hold-for-review', row)}>
                  {ACTION_LABEL['hold-for-review']}
                </ActionButton>
              )}
              {canFlagVariance && (
                <ActionButton tone="warn" onClick={() => onAct('flag-variance-investigation', row)}>
                  {ACTION_LABEL['flag-variance-investigation']}
                </ActionButton>
              )}
              {canRestate && (
                <ActionButton tone="danger" onClick={() => onAct('restate-pnl', row)}>
                  {ACTION_LABEL['restate-pnl']}
                </ActionButton>
              )}
            </div>
          </Section>

          {/* Timeline */}
          <Section title={`Timeline (${events.length} events)`}>
            <div className="space-y-1">
              {events.map((e) => (
                <div key={e.id} className="flex items-baseline gap-3 border-b border-[#e3e7ec] py-1 text-[11px]">
                  <span className="font-mono text-[#6b7685]">{fmtDate(e.created_at)}</span>
                  <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.event_type}</span>
                  {e.from_status && e.to_status && (
                    <span className="text-[#4a5568]">{e.from_status} {'→'} {e.to_status}</span>
                  )}
                  {e.actor_party && <span className="text-[#6b7685]">[{e.actor_party}]</span>}
                  {e.notes && <span className="text-[#4a5568] truncate">{e.notes}</span>}
                </div>
              ))}
              {events.length === 0 && <div className="text-[12px] text-[#6b7685]">No events yet.</div>}
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
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'oklch(0.46 0.16 55)' }}>{title}</h3>
      <div className="rounded border border-[#d8dde6] bg-[#fafbfd] p-3">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{children}</div>;
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : tone === 'ok' ? '#1f5b3a' : 'oklch(0.46 0.16 55)';
  return (
    <div className="rounded border border-[#e3e7ec] bg-white px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className="text-[12px] font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function FlagPill({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 font-medium ${on ? 'bg-[#fde0e0] text-[#9b1f1f]' : 'bg-[#e3e7ec] text-[#6b7685]'}`}>
      {label}{on ? ' ✓' : ''}
    </span>
  );
}

function ActionButton({
  children, onClick, tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: 'primary' | 'warn' | 'danger';
}) {
  const bg = tone === 'danger' ? '#7a0e0e' : tone === 'warn' ? '#a06200' : 'oklch(0.46 0.16 55)';
  return (
    <button type="button"
      onClick={onClick}
      className="rounded px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
      style={{ background: bg }}
    >
      {children}
    </button>
  );
}
