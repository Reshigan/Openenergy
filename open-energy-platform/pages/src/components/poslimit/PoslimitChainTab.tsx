// Wave 29 — Trader Position Limit Compliance chain — FSCA Section 41.
//
// 10-state lifecycle (+ 2 terminals) covering trader position-limit utilisation
// against per-instrument FSCA caps. Operational complement to W2 VaR (quality)
// and W9 MM compliance (consistency): this enforces quantity.
//
//   within_limit → warning → soft_breach → hard_breach →
//   margin_call_issued → reduction_required → reduction_executing → cured
//   (+ escalated = forced liquidation, false_alarm = stale telemetry)
//
// Mounted on the Trader workstation (read-only for traders, compliance gates
// all writes except begin-reduction). MIXED SLA matrix: FSCA hard windows
// for the breach progression (same across tiers), INVERTED windows for the
// cure cycle (bigger book gets more orderly-unwind time). Hard-breach +
// margin-call cross to FSCA inbox for prop + market_maker; forced liquidation
// crosses for ALL tiers; SLA-breach crosses for ALL tiers.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { prompt } from '../PromptDialog';

type ChainStatus =
  | 'within_limit' | 'warning' | 'soft_breach' | 'hard_breach'
  | 'margin_call_issued' | 'reduction_required' | 'reduction_executing'
  | 'cured' | 'escalated' | 'false_alarm';

type Tier = 'prop' | 'market_maker' | 'retail';

interface PosLimitRow {
  id: string;
  case_number: string;
  trader_party: string;
  trader_user_id: string;
  trader_tier: Tier;
  fsca_license_ref: string;
  instrument: string;
  instrument_class: string;
  tenor: string;
  cap_mw: number;
  position_mw: number;
  utilisation_pct: number;
  cap_zar: number;
  margin_called_zar: number | null;
  margin_posted_zar: number | null;
  reduction_target_mw: number | null;
  reduction_achieved_mw: number | null;
  jse_srl_ref: string | null;
  fsca_ref: string | null;
  liquidation_order_ref: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  regulator_authority: string | null;
  regulator_ref: string | null;
  chain_status: ChainStatus;
  detected_at: string;
  warning_at: string | null;
  soft_breach_at: string | null;
  hard_breach_at: string | null;
  margin_call_issued_at: string | null;
  reduction_required_at: string | null;
  reduction_executing_at: string | null;
  cured_at: string | null;
  escalated_at: string | null;
  false_alarm_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable?: boolean;
  breach_crosses_regulator?: boolean;
  sla_window_minutes?: number;
  created_by: string;
  created_at: string;
}

interface PosLimitEvent {
  id: string;
  poslimit_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  within_limit:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'Within limit' },
  warning:             { bg: '#fff4d6', fg: '#a06200', label: 'Warning' },
  soft_breach:         { bg: '#ffe4b5', fg: '#8a4a00', label: 'Soft breach' },
  hard_breach:         { bg: '#fde0e0', fg: '#9b1f1f', label: 'Hard breach' },
  margin_call_issued:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Margin call' },
  reduction_required:  { bg: '#fbe7d0', fg: '#7a4500', label: 'Reduction req' },
  reduction_executing: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Reducing' },
  cured:               { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Cured' },
  escalated:           { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Liquidated' },
  false_alarm:         { bg: '#e3e7ec', fg: '#557',    label: 'False alarm' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  prop:         { bg: '#fde0e0', fg: '#9b1f1f', label: 'Prop (Cat IIA)' },
  market_maker: { bg: '#fff4d6', fg: '#a06200', label: 'Market maker' },
  retail:       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Retail (Cat I)' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active' },
  { key: 'all',                 label: 'All' },
  { key: 'reportable',          label: 'FSCA reportable' },
  { key: 'prop',                label: 'Prop' },
  { key: 'market_maker',        label: 'Market maker' },
  { key: 'retail',              label: 'Retail' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'warning',             label: 'Warning' },
  { key: 'soft_breach',         label: 'Soft breach' },
  { key: 'hard_breach',         label: 'Hard breach' },
  { key: 'margin_call_issued',  label: 'Margin call' },
  { key: 'reduction_required',  label: 'Reduction req' },
  { key: 'reduction_executing', label: 'Reducing' },
  { key: 'cured',               label: 'Cured' },
  { key: 'escalated',           label: 'Liquidated' },
  { key: 'false_alarm',         label: 'False alarm' },
];

type ActionKind =
  | 'raise-warning' | 'escalate-intraday' | 'escalate-overnight'
  | 'issue-margin-call' | 'require-reduction' | 'begin-reduction'
  | 'accept-cure' | 'force-liquidate' | 'mark-false-alarm';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  within_limit:        'raise-warning',
  warning:             'escalate-intraday',
  soft_breach:         'escalate-overnight',
  hard_breach:         'issue-margin-call',
  margin_call_issued:  'require-reduction',
  reduction_required:  'begin-reduction',
  reduction_executing: 'accept-cure',
  cured:               null,
  escalated:           null,
  false_alarm:         null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'raise-warning':      'Raise warning (Compliance)',
  'escalate-intraday':  'Escalate to soft breach (Compliance)',
  'escalate-overnight': 'Escalate to hard breach (Compliance)',
  'issue-margin-call':  'Issue margin call (Compliance)',
  'require-reduction':  'Require reduction (Compliance)',
  'begin-reduction':    'Begin reduction (Trader)',
  'accept-cure':        'Accept cure (Compliance)',
  'force-liquidate':    'Force liquidation (Compliance)',
  'mark-false-alarm':   'Mark false alarm (Compliance)',
};

const CURABLE: ChainStatus[] = [
  'warning', 'soft_breach', 'hard_breach',
  'margin_call_issued', 'reduction_required', 'reduction_executing',
];

const LIQUIDATABLE: ChainStatus[] = [
  'margin_call_issued', 'reduction_required', 'reduction_executing',
];

const FALSE_ALARMABLE: ChainStatus[] = ['warning', 'soft_breach'];

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
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(0)}m`;
  if (Math.abs(n) >= 1_000)     return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtMW(n: number): string {
  if (n < 1) return `${(n * 1000).toFixed(0)}kW`;
  return `${n.toLocaleString('en-ZA')}MW`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

interface KpiSummary {
  total: number;
  warning_open: number;
  breach_open: number;
  margin_open: number;
  reduction_open: number;
  escalated_count: number;
  cured_count: number;
  false_alarm_count: number;
  breached: number;
  margin_called_total_zar: number;
  margin_posted_total_zar: number;
}

export function PoslimitChainTab() {
  const [rows, setRows] = useState<PosLimitRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<PosLimitRow | null>(null);
  const [events, setEvents] = useState<PosLimitEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: PosLimitRow[] } & KpiSummary }>('/poslimit/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          warning_open: data.warning_open || 0,
          breach_open: data.breach_open || 0,
          margin_open: data.margin_open || 0,
          reduction_open: data.reduction_open || 0,
          escalated_count: data.escalated_count || 0,
          cured_count: data.cured_count || 0,
          false_alarm_count: data.false_alarm_count || 0,
          breached: data.breached || 0,
          margin_called_total_zar: data.margin_called_total_zar || 0,
          margin_posted_total_zar: data.margin_posted_total_zar || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load position limit chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: PosLimitRow; events: PosLimitEvent[] } }>(`/poslimit/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load case history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal && r.chain_status !== 'within_limit';
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'prop' || filter === 'market_maker' || filter === 'retail') {
        return r.trader_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, warning_open: 0, breach_open: 0, margin_open: 0,
    reduction_open: 0, escalated_count: 0, cured_count: 0, false_alarm_count: 0,
    breached: 0, margin_called_total_zar: 0, margin_posted_total_zar: 0,
  };

  const act = useCallback(async (action: ActionKind, row: PosLimitRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'escalate-overnight') {
        const ref = await prompt('FSCA Section 41 reference (e.g. FSCA-S41-2026-0019, prop/market_maker only):', row.fsca_ref ?? '');
        if (ref) body.fsca_ref = ref;
      } else if (action === 'issue-margin-call') {
        const amt = await prompt('Margin call amount (ZAR):');
        if (!amt) return;
        body.margin_called_zar = Number(amt);
        const ref = await prompt('FSCA reference (optional):', row.fsca_ref ?? '');
        if (ref) body.fsca_ref = ref;
      } else if (action === 'require-reduction') {
        const tgt = await prompt('Reduction target (MW — how much to unwind):');
        if (!tgt) return;
        body.reduction_target_mw = Number(tgt);
      } else if (action === 'begin-reduction') {
        const ach = await prompt('Reduction achieved so far (MW — leave blank if 0):', String(row.reduction_achieved_mw ?? ''));
        if (ach) body.reduction_achieved_mw = Number(ach);
      } else if (action === 'accept-cure') {
        const rod = await prompt('Cure notes (how the breach was resolved — required for audit):');
        if (!rod) return;
        body.rod_notes = rod;
      } else if (action === 'force-liquidate') {
        const ref = await prompt('Liquidation order reference (e.g. LIQ-RCS-2026-0011):');
        if (!ref) return;
        body.liquidation_order_ref = ref;
        const rod = await prompt('ROD notes (rationale + venue + account action):');
        if (rod) body.rod_notes = rod;
      } else if (action === 'mark-false-alarm') {
        const rod = await prompt('False-alarm notes (telemetry source + recomputed value):');
        if (!rod) return;
        body.rod_notes = rod;
      }
      await api.post(`/poslimit/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Position Limit Compliance — FSCA Section 41</h2>
          <p className="text-xs text-[#4a5568]">
            10-state lifecycle enforcing per-instrument position caps against FSCA licenses:
            within_limit → warning → soft/hard breach → margin call → reduction required → reducing → cured
            (+ liquidated, false alarm). MIXED SLA matrix: hard FSCA windows on breach escalation, inverted
            cure windows on the unwind cycle (prop 72h margin grace, retail 24h). Hard breach + margin call
            cross to FSCA for prop + market maker only; forced liquidation crosses for ALL tiers.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"        value={kpis.total} />
        <Kpi label="Warning"      value={kpis.warning_open}    tone={kpis.warning_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="In breach"    value={kpis.breach_open}     tone={kpis.breach_open > 0 ? 'bad' : 'ok'} />
        <Kpi label="Margin call"  value={kpis.margin_open}     tone={kpis.margin_open > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reducing"     value={kpis.reduction_open}  tone={kpis.reduction_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="Liquidated"   value={kpis.escalated_count} tone={kpis.escalated_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis.breached}        tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Margin called" value={fmtZar(kpis.margin_called_total_zar)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Cured: <span className="font-semibold text-[#1f6b3a]">{kpis.cured_count}</span></span>
        <span>False alarms: <span className="font-semibold text-[#557]">{kpis.false_alarm_count}</span></span>
        <span>Margin posted: <span className="font-semibold text-[#1a3a5c]">{fmtZar(kpis.margin_posted_total_zar)}</span></span>
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Case #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Trader / desk</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Instrument</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Util%</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Pos / cap MW</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Reg ref</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Margin called</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.trader_tier];
                const regRef = r.fsca_ref ?? r.jse_srl_ref ?? r.liquidation_order_ref ?? '—';
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">{r.case_number}</td>
                    <td className="px-3 py-2 text-[#1a3a5c]">{r.trader_party}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <div className="font-mono text-[11px]">{r.instrument}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.instrument_class} · {r.tenor}</div>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.utilisation_pct >= 100 ? 'text-red-700 font-semibold' : r.utilisation_pct >= 90 ? 'text-[#a06200]' : 'text-[#1a3a5c]'}`}>
                      {fmtPct(r.utilisation_pct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">
                      {fmtMW(r.position_mw)} / {fmtMW(r.cap_mw)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#4a5568]">{regRef}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZar(r.margin_called_zar)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#4a5568]">No position limit cases match.</td></tr>
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
  row: PosLimitRow;
  events: PosLimitEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: PosLimitRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canCure = CURABLE.includes(row.chain_status) && nextAction !== 'accept-cure';
  const canLiquidate = LIQUIDATABLE.includes(row.chain_status);
  const canFalseAlarm = FALSE_ALARMABLE.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.case_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.trader_party}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.trader_tier].label} · {row.instrument} · {row.instrument_class} · {row.tenor}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Trading member"    value={row.trader_party} />
            <Pair label="Tier"               value={TIER_TONE[row.trader_tier].label} />
            <Pair label="FSCA license"       value={row.fsca_license_ref} />
            <Pair label="Instrument"         value={row.instrument} />
            <Pair label="Class"              value={row.instrument_class} />
            <Pair label="Tenor"              value={row.tenor} />
            <Pair label="Position"           value={fmtMW(row.position_mw)} />
            <Pair label="Cap"                value={fmtMW(row.cap_mw)} />
            <Pair label="Utilisation"        value={fmtPct(row.utilisation_pct)} />
            <Pair label="Cap (ZAR)"          value={fmtZar(row.cap_zar)} />
            <Pair label="Margin called"      value={fmtZar(row.margin_called_zar)} />
            <Pair label="Margin posted"      value={fmtZar(row.margin_posted_zar)} />
            <Pair label="Reduction target"   value={row.reduction_target_mw != null ? fmtMW(row.reduction_target_mw) : '—'} />
            <Pair label="Reduction achieved" value={row.reduction_achieved_mw != null ? fmtMW(row.reduction_achieved_mw) : '—'} />
            <Pair label="JSE-SRL ref"        value={row.jse_srl_ref ?? '—'} />
            <Pair label="FSCA ref"           value={row.fsca_ref ?? '—'} />
            <Pair label="Liquidation ref"    value={row.liquidation_order_ref ?? '—'} />
            <Pair label="Regulator"          value={row.regulator_authority ?? '—'} />
            <Pair label="State"              value={STATE_TONE[row.chain_status].label} />
            <Pair label="Escalation"         value={String(row.escalation_level)} />
            <Pair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"         value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Detected"           value={fmtDate(row.detected_at)} />
            <Pair label="Reason code"        value={row.reason_code ?? '—'} />
          </div>
          {row.rod_notes && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">ROD notes</div>
              {row.rod_notes}
            </div>
          )}
        </section>

        {(nextAction || canCure || canLiquidate || canFalseAlarm) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canCure && (
                <button type="button"
                  onClick={() => onAct('accept-cure', row)}
                  className="rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-green-700 hover:bg-green-50"
                >
                  {ACTION_LABEL['accept-cure']}
                </button>
              )}
              {canLiquidate && (
                <button type="button"
                  onClick={() => onAct('force-liquidate', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['force-liquidate']}
                </button>
              )}
              {canFalseAlarm && (
                <button type="button"
                  onClick={() => onAct('mark-false-alarm', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['mark-false-alarm']}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  {(e.from_status || e.to_status) && (
                    <div className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</div>
                  )}
                  {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}

export default PoslimitChainTab;
