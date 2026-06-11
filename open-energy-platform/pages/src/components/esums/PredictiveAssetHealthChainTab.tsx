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
  [key: string]: unknown;
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

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'predicted',
  'triaged',
  'diagnosed',
  'action_planned',
  'wo_raised',
  'monitoring',
  'resolved',
];

const BRANCH_STATES: readonly string[] = [
  'dismissed',
  'escalated',
  'auto_suppressed',
  'expired',
  'confirmed_failure',
];

// ── filters ───────────────────────────────────────────────────────────────
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

// ── format helpers ────────────────────────────────────────────────────────
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
  if (score >= 70) return GOOD;
  if (score >= 40) return WARN;
  return BAD;
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: PrognosticRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const cs = row.status;

  if (row.is_terminal) return actions;

  if (cs === 'predicted') {
    actions.push({
      key: 'triage-prediction',
      label: 'Triage',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'triaged' || cs === 'monitoring') {
    actions.push({
      key: 'diagnose-root-cause',
      label: 'Diagnose root cause',
      tone: 'primary',
      fields: [
        {
          key: 'fault_mode',
          label: 'Fault mode (optional override)',
          type: 'text',
          required: false,
          placeholder: row.fault_mode ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'diagnosed') {
    actions.push({
      key: 'plan-action',
      label: 'Plan intervention',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'action_planned' || cs === 'escalated') {
    actions.push({
      key: 'raise-work-order',
      label: 'Raise work order',
      tone: 'warn',
      fields: [
        {
          key: 'work_order_id',
          label: 'Work order ID (optional)',
          type: 'text',
          required: false,
          placeholder: row.work_order_id ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'wo_raised') {
    actions.push({
      key: 'begin-monitoring',
      label: 'Begin monitoring',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'monitoring') {
    actions.push({
      key: 'confirm-resolved',
      label: 'Confirm resolved',
      tone: 'primary',
      fields: [
        {
          key: 'resolution_summary',
          label: 'Resolution summary (optional)',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });

    actions.push({
      key: 'reopen-recurrence',
      label: 'Reopen (recurrence)',
      tone: 'danger',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'triaged' || cs === 'diagnosed' || cs === 'action_planned' || cs === 'monitoring') {
    actions.push({
      key: 'escalate-prognostic',
      label: 'Escalate',
      tone: 'danger',
      fields: [],
      // record_failure crosses safety||high — escalate itself has no explicit regulator crossing
      cascadeTo: [],
    });
  }

  if (cs === 'predicted' || cs === 'triaged') {
    actions.push({
      key: 'dismiss-prediction',
      label: 'Dismiss (false positive)',
      tone: 'ghost',
      fields: [
        {
          key: 'resolution_summary',
          label: 'Why is this a false positive?',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'predicted') {
    actions.push({
      key: 'auto-suppress',
      label: 'Auto-suppress',
      tone: 'ghost',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'predicted' || cs === 'triaged' || cs === 'diagnosed') {
    actions.push({
      key: 'expire-prognostic',
      label: 'Expire (stale)',
      tone: 'ghost',
      fields: [],
      cascadeTo: [],
    });
  }

  // record-failure crosses regulator when safety || high (critical/major tiers)
  const recordFailureCascade = (row.safety_implicated || row.tier === 'critical' || row.tier === 'major')
    ? ['regulator']
    : [];
  actions.push({
    key: 'record-failure',
    label: 'Record failure',
    tone: 'danger',
    description: 'Record that this asset has actually failed. This closes the loop for confidence tuning.',
    fields: [],
    cascadeTo: recordFailureCascade,
  });

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: PrognosticRow): React.ReactNode {
  return (
    <div className="space-y-3 text-[12px]">
      {/* Health + prediction headline */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Health score</div>
          <HealthBar score={row.health_score} />
        </div>
        <DetailPair label="Prediction type" value={row.prediction_type ?? '—'} />
        <DetailPair label="Fault mode" value={row.fault_mode ? `${row.fault_mode} (${Math.round(row.fault_mode_confidence * 100)}%)` : '—'} />
        <DetailPair label="Site / device" value={`${row.site_id}${row.device_id ? ` · ${row.device_id}` : ''}`} />
        {row.safety_implicated && (
          <div className="col-span-2">
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'oklch(0.97 0.04 20)', color: BAD }}>⚠ Safety-implicated</span>
          </div>
        )}
        {row.is_reportable && (
          <div className="col-span-2">
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: 'oklch(0.97 0.05 20)', color: BAD }}>Regulator reportable</span>
          </div>
        )}
      </div>

      {/* Predictive analytics */}
      <div className="rounded border px-3 py-2.5" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>Predictive analytics</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <DetailPair label="Anomaly score" value={`${row.anomaly_score.toFixed(2)} (conf ${row.anomaly_confidence.toFixed(2)})`} />
          {row.performance_ratio != null && <DetailPair label="Performance ratio" value={row.performance_ratio.toFixed(2)} />}
          <DetailPair label="Degradation" value={`${row.degradation_direction} · ${row.degradation_slope_per_day.toFixed(4)}/day (R² ${row.degradation_r_squared.toFixed(2)})`} />
          <DetailPair label="RUL" value={row.rul_basis === 'already_failed' ? 'Already failed' : `${row.rul_days ?? '—'} days (${row.rul_basis ?? '—'}, conf ${row.rul_confidence.toFixed(2)})`} />
          {row.lead_time_days > 0 && <DetailPair label="Lead time caught" value={`${row.lead_time_days} days early`} />}
          {row.predicted_failure_at && <DetailPair label="Predicted failure" value={new Date(row.predicted_failure_at).toLocaleString()} />}
        </div>
        {row.methods_triggered.length > 0 && (
          <div className="mt-2">
            <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: TX3 }}>Methods triggered</div>
            <div className="flex flex-wrap gap-1.5">
              {row.methods_triggered.map((m) => (
                <span key={m} className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: 'oklch(0.95 0.04 240)', color: 'oklch(0.35 0.14 240)' }}>{m}</span>
              ))}
            </div>
          </div>
        )}
        {row.evidence.length > 0 && (
          <div className="mt-2">
            <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: TX3 }}>Evidence</div>
            <ul className="list-disc list-inside space-y-0.5" style={{ color: TX2 }}>
              {row.evidence.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* O&M savings ledger vs NTT benchmark */}
      <div className="rounded border px-3 py-2.5" style={{ background: BG1, borderColor: BORDER }}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>O&M savings ledger (vs reactive &amp; vs NTT 30% benchmark)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <DetailPair label="Revenue at risk" value={fmtZar(row.revenue_at_risk_zar)} />
          <DetailPair label="Reactive cost (run-to-fail)" value={fmtZar(row.reactive_cost_zar)} />
          <DetailPair label="Predictive cost (planned)" value={fmtZar(row.predictive_cost_zar)} />
          <DetailPair label="Savings" value={`${fmtZar(row.savings_zar)} (${Math.round(row.savings_pct * 100)}%)`} />
          <DetailPair label="NTT 30% benchmark would save" value={fmtZar(row.benchmark_savings_zar)} />
          <DetailPair label="Incremental vs NTT benchmark" value={fmtZar(row.incremental_vs_benchmark_zar)} />
        </div>
      </div>

      {/* Operational */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {row.work_order_id && <DetailPair label="Work order" value={row.work_order_id} />}
        {row.assigned_to && <DetailPair label="Assigned to" value={row.assigned_to} />}
        {row.recurrence_count > 0 && <DetailPair label="Recurrence count" value={String(row.recurrence_count)} />}
        {row.detected_at && <DetailPair label="Detected" value={new Date(row.detected_at).toLocaleString()} />}
        {row.sla_deadline && !row.is_terminal && (
          <DetailPair label="SLA deadline" value={`${new Date(row.sla_deadline).toLocaleString()} (${fmtMin(row.minutes_until_sla)})`} />
        )}
      </div>

      {row.notes && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Notes</div>
          <div style={{ color: TX2 }}>{row.notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function PredictiveAssetHealthChainTab() {
  const [rows, setRows] = useState<PrognosticRow[]>([]);
  const [summary, setSummary] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: PrognosticRow[] } }>('/asset-prognostics/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setSummary(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load prognostics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/asset-prognostics/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: PrognosticEvent[] } }>(`/asset-prognostics/chain/${rowId}`);
          const evts = (res.data?.data?.events ?? []).map(e => ({
            id: e.id,
            event_type: e.event_type,
            from_status: e.from_status,
            to_status: e.to_status,
            actor_party: e.actor_party,
            actor_id: e.actor_id,
            notes: e.detail,
            created_at: e.created_at,
          }));
          setExpandedEvents(prev => ({ ...prev, [rowId]: evts }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { prognostic: PrognosticRow; events: PrognosticEvent[] } }>(`/asset-prognostics/chain/${id}`);
      const evts = (res.data?.data?.events ?? []).map(e => ({
        id: e.id,
        event_type: e.event_type,
        from_status: e.from_status,
        to_status: e.to_status,
        actor_party: e.actor_party,
        actor_id: e.actor_id,
        notes: e.detail,
        created_at: e.created_at,
      }));
      setExpandedEvents(prev => ({ ...prev, [id]: evts }));
    } catch { /* silent */ }
  }, [expandedEvents]);

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

  const kpis = summary ?? {
    total: 0,
    open_count: 0,
    monitoring_count: 0,
    escalated_count: 0,
    confirmed_failures: 0,
    resolved_count: 0,
    dismissed_count: 0,
    breached: 0,
    reportable_total: 0,
    safety_open: 0,
    high_open: 0,
    total_revenue_at_risk_zar: 0,
    total_savings_zar: 0,
    total_incremental_vs_benchmark_zar: 0,
    total_benchmark_savings_zar: 0,
    avg_health_score: 100,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Predictive Asset Health &amp; Prognostics</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          NTT-beating predictive O&M brain — anomaly ensemble, RUL, fault-mode fingerprinting, revenue-weighted savings ledger.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile
          label="Fleet health"
          value={kpis.avg_health_score}
          tone={kpis.avg_health_score < 50 ? 'bad' : kpis.avg_health_score < 70 ? 'warn' : 'ok'}
        />
        <KpiTile label="Open" value={kpis.open_count} />
        <KpiTile
          label="Safety open"
          value={kpis.safety_open}
          tone={kpis.safety_open > 0 ? 'bad' : 'ok'}
        />
        <KpiTile
          label="SLA breached"
          value={kpis.breached}
          tone={kpis.breached > 0 ? 'bad' : 'ok'}
        />
        <KpiTile
          label="Confirmed failures"
          value={kpis.confirmed_failures}
          tone={kpis.confirmed_failures > 0 ? 'warn' : 'ok'}
        />
        <KpiTile
          label="O&M savings"
          value={fmtZar(kpis.total_savings_zar)}
          tone="ok"
        />
        <KpiTile
          label="Beat NTT 30% by"
          value={fmtZar(kpis.total_incremental_vs_benchmark_zar)}
          tone="ok"
        />
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
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const breached = row.sla_breached_now || !!row.sla_breached;
            const rulLabel = row.rul_basis === 'already_failed'
              ? 'failed'
              : row.rul_days != null
              ? `RUL ${row.rul_days}d`
              : null;
            const meta = (
              <span style={{ color: TX3, fontSize: 11, fontFamily: MONO }}>
                {row.tier.charAt(0).toUpperCase() + row.tier.slice(1)}
                {row.technology ? ` · ${row.technology}` : ''}
                {row.fault_mode ? ` · ${row.fault_mode}` : ''}
                {rulLabel ? ` · ${rulLabel}` : ''}
                {' · '}
                <span style={{ color: healthColor(row.health_score) }}>
                  {`health ${row.health_score}`}
                </span>
                {' · '}
                {fmtZar(row.revenue_at_risk_zar)}
                {row.safety_implicated ? ' · ⚠ safety' : ''}
                {!row.is_terminal && breached ? ' · SLA !' : ''}
                {!row.is_terminal && !breached && row.minutes_until_sla != null ? ` · ${fmtMin(row.minutes_until_sla)}` : ''}
              </span>
            );
            return (
              <ChainCard
                key={row.id}
                item={{
                  ...row,
                  chain_status: row.status,
                  sla_deadline_at: row.sla_deadline ?? null,
                  sla_breached: breached,
                }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.asset_label ?? row.id}
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No prognostics match the current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HealthBar({ score }: { score: number }) {
  const color = healthColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: BG2 }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, score))}%`, background: color }} />
      </div>
      <span className="text-[12px] tabular-nums font-semibold" style={{ color, fontFamily: MONO }}>{score}</span>
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[90px]" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[16px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
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

export default PredictiveAssetHealthChainTab;
