// Wave 71 — Esums Predictive Asset Health & Prognostics chain tab.
//
// The NTT-beating predictive O&M brain. Each row is a prognostic raised off the
// existing Esums telemetry: an explainable, revenue-ranked prediction running
// through a 12-state lifecycle (predicted → triaged → diagnosed → action planned
// → WO raised → monitoring → resolved, plus escalate / dismiss / auto-suppress /
// expire / confirmed-failure branches).
//
//   • KPI strip: fleet health, open, safety open, SLA breached, confirmed
//     failures, and the headline "incremental vs NTT benchmark" saving
//   • Filter pills by tier + lifecycle state + safety + reportable
//   • Listing with a health bar, fault-mode fingerprint, RUL, revenue-at-risk
//     and an URGENT SLA countdown (higher revenue / safety = tighter window)
//   • Drill-down: predictive panel (anomaly ensemble, degradation trend, RUL,
//     evidence), the O&M savings ledger that quantifies the advantage over the
//     ~30% industry/NTT predictive-maintenance benchmark, an inline AI next-step
//     card with 1-click accept, per-state actions and the audit timeline
//
// Single-party write: the O&M / asset-performance desk ({admin, support}) drives
// the chain. All nine personas may read the fleet health register.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type PStatus =
  | 'predicted' | 'triaged' | 'diagnosed' | 'action_planned' | 'wo_raised'
  | 'monitoring' | 'resolved' | 'dismissed' | 'escalated' | 'auto_suppressed'
  | 'expired' | 'confirmed_failure';

type PTier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

interface AiSuggestion {
  action: string;
  endpoint: string;
  label: string;
  why: string;
}

interface PrognosticRow {
  id: string;
  site_id: string;
  device_id: string | null;
  asset_label: string | null;
  technology: string | null;
  status: PStatus;
  tier: PTier;
  prediction_type: string | null;
  fault_mode: string | null;
  fault_mode_confidence: number;
  safety_implicated: boolean;
  evidence: string[];
  health_score: number;
  performance_ratio: number | null;
  anomaly_score: number;
  anomaly_confidence: number;
  methods_triggered: string[];
  degradation_slope_per_day: number;
  degradation_r_squared: number;
  degradation_direction: string;
  rul_days: number | null;
  rul_confidence: number;
  rul_basis: string | null;
  lost_kwh_per_day: number;
  tariff_zar_per_mwh: number;
  revenue_at_risk_zar: number;
  reactive_cost_zar: number;
  predictive_cost_zar: number;
  savings_zar: number;
  savings_pct: number;
  benchmark_savings_zar: number;
  incremental_vs_benchmark_zar: number;
  lead_time_days: number;
  predicted_failure_at: string | null;
  detected_at: string | null;
  status_entered_at: string | null;
  sla_deadline: string | null;
  sla_breached: number;
  is_reportable: boolean;
  work_order_id: string | null;
  recurrence_count: number;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_now?: boolean;
  sla_window_minutes?: number;
  breach_crosses_regulator?: boolean;
  ai?: AiSuggestion | null;
}

interface PrognosticEvent {
  id: string;
  prognostic_id: string;
  event_type: string;
  actor_id: string | null;
  actor_party: string | null;
  from_status: string | null;
  to_status: string | null;
  detail: string | null;
  created_at: string;
}

interface KpiData {
  total: number;
  open_count: number;
  monitoring_count: number;
  escalated_count: number;
  confirmed_failures: number;
  resolved_count: number;
  dismissed_count: number;
  breached: number;
  reportable_total: number;
  safety_open: number;
  high_open: number;
  total_revenue_at_risk_zar: number;
  total_savings_zar: number;
  total_incremental_vs_benchmark_zar: number;
  total_benchmark_savings_zar: number;
  avg_health_score: number;
}

const STATE_TONE: Record<PStatus, { bg: string; fg: string; label: string }> = {
  predicted:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Predicted' },
  triaged:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'Triaged' },
  diagnosed:         { bg: '#fff4d6', fg: '#a06200', label: 'Diagnosed' },
  action_planned:    { bg: '#fff4d6', fg: '#a06200', label: 'Action planned' },
  wo_raised:         { bg: '#fff4d6', fg: '#a06200', label: 'WO raised' },
  monitoring:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Monitoring' },
  resolved:          { bg: '#daf5e2', fg: '#1f6b3a', label: 'Resolved' },
  dismissed:         { bg: '#e3e7ec', fg: '#557',    label: 'Dismissed' },
  escalated:         { bg: '#fde0e0', fg: '#9b1f1f', label: 'Escalated' },
  auto_suppressed:   { bg: '#e3e7ec', fg: '#557',    label: 'Auto-suppressed' },
  expired:           { bg: '#e3e7ec', fg: '#557',    label: 'Expired' },
  confirmed_failure: { bg: '#fbd0d0', fg: '#7a1414', label: 'Confirmed failure' },
};

const TIER_TONE: Record<PTier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material' },
  major:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Major' },
  critical: { bg: '#fbd0d0', fg: '#7a1414', label: 'Critical' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',            label: 'Active (pre-terminal)' },
  { key: 'all',               label: 'All' },
  { key: 'safety',            label: 'Safety-implicated' },
  { key: 'critical',          label: 'Critical' },
  { key: 'major',             label: 'Major' },
  { key: 'material',          label: 'Material' },
  { key: 'moderate',          label: 'Moderate' },
  { key: 'minor',             label: 'Minor' },
  { key: 'predicted',         label: 'Predicted' },
  { key: 'triaged',           label: 'Triaged' },
  { key: 'diagnosed',         label: 'Diagnosed' },
  { key: 'action_planned',    label: 'Action planned' },
  { key: 'wo_raised',         label: 'WO raised' },
  { key: 'monitoring',        label: 'Monitoring' },
  { key: 'escalated',         label: 'Escalated' },
  { key: 'confirmed_failure', label: 'Confirmed failure' },
  { key: 'resolved',          label: 'Resolved' },
  { key: 'breached',          label: 'SLA breached' },
  { key: 'reportable',        label: 'Reportable' },
];

const TIERS = new Set<string>(['minor', 'moderate', 'material', 'major', 'critical']);

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  admin:   { bg: '#dbecfb', fg: '#1a3a5c' },
  support: { bg: '#fff4d6', fg: '#a06200' },
  system:  { bg: '#e3e7ec', fg: '#557' },
};

function fmtZar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

function healthColor(score: number): string {
  if (score >= 70) return '#1f6b3a';
  if (score >= 40) return '#a06200';
  return '#9b1f1f';
}

export function PredictiveAssetHealthChainTab() {
  const [rows, setRows] = useState<PrognosticRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<PrognosticRow | null>(null);
  const [events, setEvents] = useState<PrognosticEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: PrognosticRow[] } }>('/asset-prognostics/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load prognostics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { prognostic: PrognosticRow; events: PrognosticEvent[] } }>(`/asset-prognostics/chain/${id}`);
      if (res.data?.data?.prognostic) setSelected(res.data.data.prognostic);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load prognostic history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'safety')     return r.safety_implicated;
      if (filter === 'breached')   return r.sla_breached_now || !!r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (TIERS.has(filter))       return r.tier === filter;
      return r.status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/asset-prognostics/chain/${selected.id}/${path}`, body ?? {});
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [selected, load, loadEvents]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-3">
        <Kpi label="Fleet health" value={kpis?.avg_health_score ?? 100} tone={(kpis?.avg_health_score ?? 100) < 50 ? 'bad' : (kpis?.avg_health_score ?? 100) < 70 ? 'warn' : 'ok'} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Safety open" value={kpis?.safety_open ?? 0} tone={(kpis?.safety_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Confirmed failures" value={kpis?.confirmed_failures ?? 0} tone={(kpis?.confirmed_failures ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="O&M savings" value={fmtZar(kpis?.total_savings_zar ?? 0)} tone="ok" small />
        <Kpi label="Beat NTT 30% by" value={fmtZar(kpis?.total_incremental_vs_benchmark_zar ?? 0)} tone="ok" small />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]'
                : 'bg-white text-[#4a5568] border-[#dde4ec] hover:bg-gray-50'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {err && <div className="px-3 py-2 bg-red-50 text-red-700 text-[12px] rounded-md">{err}</div>}

      <div className="bg-white border border-[#e5ebf2] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f7f9fb] text-[11px] uppercase tracking-wide text-[#6b7685]">
            <tr>
              <th className="px-3 py-2 text-left">Asset</th>
              <th className="px-3 py-2 text-left">Health</th>
              <th className="px-3 py-2 text-left">Fault mode</th>
              <th className="px-3 py-2 text-right">RUL</th>
              <th className="px-3 py-2 text-right">Rev at risk</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">Δ SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">No prognostics match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.status];
              const tierTone  = TIER_TONE[r.tier];
              const breached = r.sla_breached_now || !!r.sla_breached;
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 max-w-[14rem] truncate" title={`${r.asset_label ?? r.id} · ${r.technology ?? ''}`}>
                    {r.asset_label ?? r.id}
                    {r.safety_implicated && <span className="ml-1.5 text-[#9b1f1f]" title="Safety-implicated">⚠</span>}
                  </td>
                  <td className="px-3 py-2">
                    <HealthBar score={r.health_score} />
                  </td>
                  <td className="px-3 py-2 text-[#4a5568] text-[12px] max-w-[12rem] truncate" title={r.fault_mode ?? ''}>
                    {r.fault_mode ?? '—'}
                    {r.fault_mode_confidence > 0 && <span className="text-[#6b7685]"> · {Math.round(r.fault_mode_confidence * 100)}%</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums text-[#4a5568]">
                    {r.rul_basis === 'already_failed' ? 'failed' : r.rul_days != null ? `${r.rul_days}d` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{fmtZar(r.revenue_at_risk_zar)}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: tierTone.bg, color: tierTone.fg }}>
                      {tierTone.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: stateTone.bg, color: stateTone.fg }}>
                      {stateTone.label}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                    {r.is_terminal ? '—' : fmtMin(r.minutes_until_sla)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <PrognosticDrawer
          row={selected}
          events={events}
          onClose={() => { setSelected(null); setEvents([]); }}
          doAction={doAction}
        />
      )}
    </div>
  );
}

function HealthBar({ score }: { score: number }) {
  const color = healthColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-[#eef2f6] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, score))}%`, background: color }} />
      </div>
      <span className="text-[12px] tabular-nums font-semibold" style={{ color }}>{score}</span>
    </div>
  );
}

function Kpi({ label, value, tone = 'ok', small = false }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad'; small?: boolean }) {
  const fg = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0f1c2e';
  return (
    <div className="bg-white border border-[#e5ebf2] rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className={small ? 'text-[15px] font-semibold tabular-nums mt-0.5' : 'text-[20px] font-semibold tabular-nums mt-0.5'} style={{ color: fg }}>{value}</div>
    </div>
  );
}

function PrognosticDrawer({
  row, events, onClose, doAction,
}: {
  row: PrognosticRow;
  events: PrognosticEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.status;
  const transitionable = !row.is_terminal;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-stretch justify-end oe-overlay-in" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl shadow-xl overflow-y-auto oe-drawer-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Prognostic {row.id}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
              {row.asset_label ?? row.id}
              <span className="text-[#6b7685] font-normal"> · {row.technology ?? ''}</span>
            </h3>
            <div className="flex flex-wrap gap-2 mt-2 text-[12px]">
              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: TIER_TONE[row.tier].bg, color: TIER_TONE[row.tier].fg }}>
                {TIER_TONE[row.tier].label}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: STATE_TONE[cs].bg, color: STATE_TONE[cs].fg }}>
                {STATE_TONE[cs].label}
              </span>
              {row.safety_implicated && (
                <span className="px-2 py-0.5 rounded-full bg-[#fbd0d0] text-[#7a1414] font-semibold">⚠ Safety-implicated</span>
              )}
              {row.is_reportable && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Regulator reportable</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">✕</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          {/* Inline AI next-step card — 1-click accept */}
          {transitionable && row.ai && (
            <div className="bg-[#f0f7ff] border border-[#cfe2f7] rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[#1a3a5c] font-semibold">AI suggests</div>
                  <div className="text-[#0f1c2e] mt-0.5">{row.ai.why}</div>
                </div>
                <button type="button"
                  onClick={() => row.ai && void doAction(row.ai.endpoint)}
                  className="shrink-0 px-3 py-1.5 bg-[#1a3a5c] text-white text-[12px] rounded-md hover:opacity-90">
                  {row.ai.label}
                </button>
              </div>
            </div>
          )}

          {/* Health + predictive headline */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Health score</div>
              <div className="mt-1"><HealthBar score={row.health_score} /></div>
            </div>
            <Pair label="Prediction type" value={row.prediction_type ?? '—'} />
            <Pair label="Fault mode" value={row.fault_mode ? `${row.fault_mode} (${Math.round(row.fault_mode_confidence * 100)}%)` : '—'} />
            <Pair label="Site / device" value={`${row.site_id}${row.device_id ? ` · ${row.device_id}` : ''}`} />
          </div>

          {/* Anomaly + degradation + RUL */}
          <div className="border-t border-[#eef2f6] pt-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Predictive analytics</div>
            <div className="grid grid-cols-2 gap-4">
              <Pair label="Anomaly score" value={`${row.anomaly_score.toFixed(2)} (conf ${row.anomaly_confidence.toFixed(2)})`} />
              {row.performance_ratio != null && <Pair label="Performance ratio" value={row.performance_ratio.toFixed(2)} />}
              <Pair label="Degradation" value={`${row.degradation_direction} · ${row.degradation_slope_per_day.toFixed(4)}/day (R² ${row.degradation_r_squared.toFixed(2)})`} />
              <Pair label="RUL" value={row.rul_basis === 'already_failed' ? 'Already failed' : `${row.rul_days ?? '—'} days (${row.rul_basis ?? '—'}, conf ${row.rul_confidence.toFixed(2)})`} />
              {row.lead_time_days > 0 && <Pair label="Lead time caught" value={`${row.lead_time_days} days early`} />}
              {row.predicted_failure_at && <Pair label="Predicted failure" value={new Date(row.predicted_failure_at).toLocaleString()} />}
            </div>
            {row.methods_triggered.length > 0 && (
              <div className="mt-2">
                <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-1">Methods triggered</div>
                <div className="flex flex-wrap gap-1.5">
                  {row.methods_triggered.map((m) => (
                    <span key={m} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#dbecfb] text-[#1a3a5c]">{m}</span>
                  ))}
                </div>
              </div>
            )}
            {row.evidence.length > 0 && (
              <div className="mt-2">
                <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-1">Evidence</div>
                <ul className="list-disc list-inside text-[12px] text-[#4a5568] space-y-0.5">
                  {row.evidence.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* O&M savings ledger vs NTT benchmark */}
          <div className="border-t border-[#eef2f6] pt-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">O&M savings ledger (vs reactive &amp; vs NTT 30% benchmark)</div>
            <div className="grid grid-cols-2 gap-4">
              <Pair label="Revenue at risk" value={fmtZar(row.revenue_at_risk_zar)} />
              <Pair label="Reactive cost (run-to-fail)" value={fmtZar(row.reactive_cost_zar)} />
              <Pair label="Predictive cost (planned)" value={fmtZar(row.predictive_cost_zar)} />
              <Pair label="Savings" value={`${fmtZar(row.savings_zar)} (${Math.round(row.savings_pct * 100)}%)`} />
              <Pair label="NTT 30% benchmark would save" value={fmtZar(row.benchmark_savings_zar)} />
              <Pair label="Incremental vs NTT benchmark" value={fmtZar(row.incremental_vs_benchmark_zar)} />
            </div>
          </div>

          {/* Operational */}
          <div className="grid grid-cols-2 gap-4 border-t border-[#eef2f6] pt-4">
            {row.work_order_id && <Pair label="Work order" value={row.work_order_id} />}
            {row.assigned_to && <Pair label="Assigned to" value={row.assigned_to} />}
            {row.recurrence_count > 0 && <Pair label="Recurrence count" value={String(row.recurrence_count)} />}
            {row.detected_at && <Pair label="Detected" value={new Date(row.detected_at).toLocaleString()} />}
            {row.sla_deadline && !row.is_terminal && (
              <Pair label="SLA deadline" value={`${new Date(row.sla_deadline).toLocaleString()} (${fmtMin(row.minutes_until_sla)})`} />
            )}
            {row.notes && <Pair label="Notes" value={row.notes} />}
          </div>

          {transitionable && (
            <div className="border-t border-[#eef2f6] pt-4">
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                {cs === 'predicted' && (
                  <ActionBtn label="Triage" onClick={() => void doAction('triage-prediction')} />
                )}
                {(cs === 'triaged' || cs === 'monitoring') && (
                  <ActionBtn label="Diagnose root cause" onClick={() => {
                    const fm = window.prompt('Fault mode (optional override):') ?? undefined;
                    void doAction('diagnose-root-cause', fm ? { fault_mode: fm } : {});
                  }} />
                )}
                {cs === 'diagnosed' && (
                  <ActionBtn label="Plan intervention" onClick={() => void doAction('plan-action')} />
                )}
                {(cs === 'action_planned' || cs === 'escalated') && (
                  <ActionBtn label="Raise work order" tone="good" onClick={() => {
                    const wo = window.prompt('Work order ID (optional):') ?? undefined;
                    void doAction('raise-work-order', wo ? { work_order_id: wo } : {});
                  }} />
                )}
                {cs === 'wo_raised' && (
                  <ActionBtn label="Begin monitoring" onClick={() => void doAction('begin-monitoring')} />
                )}
                {cs === 'monitoring' && (
                  <ActionBtn label="Confirm resolved" tone="good" onClick={() => {
                    const s = window.prompt('Resolution summary (optional):') ?? undefined;
                    void doAction('confirm-resolved', s ? { resolution_summary: s } : {});
                  }} />
                )}
                {cs === 'monitoring' && (
                  <ActionBtn label="Reopen (recurrence)" tone="bad" onClick={() => void doAction('reopen-recurrence')} />
                )}
                {(cs === 'triaged' || cs === 'diagnosed' || cs === 'action_planned' || cs === 'monitoring') && (
                  <ActionBtn label="Escalate" tone="bad" onClick={() => void doAction('escalate-prognostic')} />
                )}
                {(cs === 'predicted' || cs === 'triaged') && (
                  <ActionBtn label="Dismiss (false positive)" onClick={() => {
                    const s = window.prompt('Why is this a false positive?') ?? undefined;
                    void doAction('dismiss-prediction', s ? { resolution_summary: s } : {});
                  }} />
                )}
                {cs === 'predicted' && (
                  <ActionBtn label="Auto-suppress" onClick={() => void doAction('auto-suppress')} />
                )}
                {(cs === 'predicted' || cs === 'triaged' || cs === 'diagnosed') && (
                  <ActionBtn label="Expire (stale)" onClick={() => void doAction('expire-prognostic')} />
                )}
                <ActionBtn label="Record failure" tone="bad" onClick={() => {
                  if (!window.confirm('Record that this asset has actually failed? This closes the loop for confidence tuning.')) return;
                  void doAction('record-failure');
                }} />
              </div>
            </div>
          )}

          <div className="border-t border-[#eef2f6] pt-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Timeline</div>
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-[12px] text-[#6b7685]">No events yet.</div>
              ) : events.map((e) => {
                const partyTone = PARTY_TONE[e.actor_party ?? 'system'] ?? PARTY_TONE.system;
                return (
                  <div key={e.id} className="flex gap-3 text-[12px] border-l-2 border-[#e5ebf2] pl-3 py-1">
                    <span className="font-mono text-[11px] text-[#6b7685] whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</span>
                    <div>
                      <span className="font-semibold text-[#0f1c2e]">{e.event_type}</span>
                      {e.actor_party && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase" style={{ background: partyTone.bg, color: partyTone.fg }}>
                          {e.actor_party}
                        </span>
                      )}
                      {e.from_status && e.to_status && e.from_status !== e.to_status && (
                        <span className="text-[#6b7685]"> · {e.from_status} → {e.to_status}</span>
                      )}
                      {e.detail && <div className="text-[#4a5568] mt-0.5">{e.detail}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="text-[#0f1c2e] mt-0.5">{value}</div>
    </div>
  );
}

function ActionBtn({ label, onClick, tone = 'neutral' }: { label: string; onClick: () => void; tone?: 'neutral' | 'good' | 'bad' }) {
  const bg = tone === 'good' ? 'bg-emerald-700' : tone === 'bad' ? 'bg-red-700' : 'bg-[#1a3a5c]';
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 ${bg} text-white text-[12px] rounded-md hover:opacity-90`}>
      {label}
    </button>
  );
}
