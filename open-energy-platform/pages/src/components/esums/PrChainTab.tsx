// Wave 24 — Esums Performance-Ratio sustained-underperformance chain.
//
// 9-state machine surfaced as a P6 audit chain on the Esums O&M workstation.
//
//   • KPI strip: total / utility open / intervention / escalated / breached / revenue loss
//   • Filter pills by chain state + tier
//   • Listing with tier pill + SLA countdown + PR shortfall
//   • Drill-down: timeline + per-state action button (10 transitions)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'monitoring' | 'warning' | 'investigating'
  | 'intervention_planned' | 'intervention_executing'
  | 'verified' | 'escalated' | 'closed' | 'false_alarm';

type Tier = 'utility' | 'midscale' | 'ci' | 'microgrid';

interface PrRow {
  id: string;
  case_number: string;
  site_id: string;
  site_name: string;
  technology: string;
  capacity_mw: number;
  capacity_tier: Tier;
  baseline_pr: number;
  observed_pr: number;
  pr_shortfall: number;
  window_days: number;
  detected_at: string;
  primary_cause: string | null;
  rca_summary: string | null;
  action_plan: string | null;
  linked_wo_id: string | null;
  linked_warranty_claim_id: string | null;
  revenue_loss_zar: number | null;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  created_by: string;
  created_at: string;
}

interface PrEvent {
  id: string;
  case_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  monitoring:             { bg: '#e3e7ec', fg: '#557',    label: 'Monitoring' },
  warning:                { bg: '#fff4d6', fg: '#a06200', label: 'Warning' },
  investigating:          { bg: '#dbecfb', fg: '#1a3a5c', label: 'Investigating' },
  intervention_planned:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Intervention planned' },
  intervention_executing: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Intervention executing' },
  verified:               { bg: '#daf5e2', fg: '#1f6b3a', label: 'Verified' },
  escalated:              { bg: '#fde0e0', fg: '#9b1f1f', label: 'Escalated' },
  closed:                 { bg: '#e3e7ec', fg: '#557',    label: 'Closed' },
  false_alarm:            { bg: '#e3e7ec', fg: '#557',    label: 'False alarm' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  utility:   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Utility ≥50MW' },
  midscale:  { bg: '#ffe4b5', fg: '#8a4a00', label: 'Mid 10-50MW' },
  ci:        { bg: '#fff4d6', fg: '#a06200', label: 'C&I 1-10MW' },
  microgrid: { bg: '#e3e7ec', fg: '#557',    label: 'Microgrid <1MW' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                 label: 'Active' },
  { key: 'all',                    label: 'All' },
  { key: 'utility',                label: 'Utility' },
  { key: 'midscale',               label: 'Mid-scale' },
  { key: 'ci',                     label: 'C&I' },
  { key: 'microgrid',              label: 'Microgrid' },
  { key: 'breached',               label: 'SLA breached' },
  { key: 'escalated',              label: 'Escalated' },
  { key: 'warning',                label: 'Warning' },
  { key: 'investigating',          label: 'Investigating' },
  { key: 'intervention_planned',   label: 'Intervention planned' },
  { key: 'intervention_executing', label: 'Intervention executing' },
  { key: 'verified',               label: 'Verified' },
  { key: 'closed',                 label: 'Closed' },
  { key: 'false_alarm',            label: 'False alarm' },
];

type ActionKind =
  | 'start-warning' | 'begin-investigation' | 'complete-rca'
  | 'dispatch-intervention' | 'verify-recovery' | 'close'
  | 'escalate' | 'close-escalated'
  | 'mark-false-alarm' | 'close-false-alarm';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  monitoring:             'start-warning',
  warning:                'begin-investigation',
  investigating:          'complete-rca',
  intervention_planned:   'dispatch-intervention',
  intervention_executing: 'verify-recovery',
  verified:               'close',
  escalated:              'close-escalated',
  false_alarm:            'close-false-alarm',
  closed:                 null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'start-warning':         'Start warning',
  'begin-investigation':   'Begin investigation',
  'complete-rca':          'Complete RCA',
  'dispatch-intervention': 'Dispatch intervention',
  'verify-recovery':       'Verify recovery',
  'close':                 'Close + archive',
  'escalate':              'Escalate (warranty)',
  'close-escalated':       'Close escalated',
  'mark-false-alarm':      'Mark false alarm',
  'close-false-alarm':     'Close false alarm',
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

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) >= 1_000_000) return `R${(v / 1_000_000).toFixed(1)}m`;
  if (Math.abs(v) >= 1_000) return `R${(v / 1_000).toFixed(0)}k`;
  return `R${Math.round(v)}`;
}

export function PrChainTab() {
  const [rows, setRows] = useState<PrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<PrRow | null>(null);
  const [events, setEvents] = useState<PrEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: PrRow[] } }>('/esums/pr-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PR cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: PrRow; events: PrEvent[] } }>(`/esums/pr-chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PR case history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')       return true;
      if (filter === 'active')    return !r.is_terminal;
      if (filter === 'utility' || filter === 'midscale' || filter === 'ci' || filter === 'microgrid') {
        return r.capacity_tier === filter;
      }
      if (filter === 'breached')  return r.sla_breached;
      if (filter === 'escalated') return r.escalation_level > 0 || r.chain_status === 'escalated';
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let utility_open = 0, intervention = 0, escalated = 0, breached = 0;
    let revenue_loss = 0;
    for (const r of rows) {
      if (r.capacity_tier === 'utility' && !r.is_terminal) utility_open++;
      if (r.chain_status === 'intervention_executing') intervention++;
      if (r.chain_status === 'escalated' || r.escalation_level > 0) escalated++;
      if (r.sla_breached) breached++;
      revenue_loss += r.revenue_loss_zar || 0;
    }
    return { total: rows.length, utility_open, intervention, escalated, breached, revenue_loss };
  }, [rows]);

  const act = useCallback(async (action: ActionKind, row: PrRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'complete-rca') {
        const cause = window.prompt('Primary cause (soiling / inverter_fault / string_loss / shading / OEM_defect / weather):');
        if (!cause) return;
        body.primary_cause = cause;
        const rca = window.prompt('RCA summary:');
        if (rca) body.rca_summary = rca;
        const plan = window.prompt('Action plan:');
        if (plan) body.action_plan = plan;
      } else if (action === 'dispatch-intervention') {
        const wo = window.prompt('Linked work order ID (optional):');
        if (wo) body.linked_wo_id = wo;
      } else if (action === 'verify-recovery') {
        const pr = window.prompt('Observed PR after intervention (e.g. 0.84):');
        if (pr) body.observed_pr = Number(pr);
      } else if (action === 'escalate') {
        const war = window.prompt('Linked warranty claim ID (optional):');
        if (war) body.linked_warranty_claim_id = war;
      } else if (action === 'mark-false-alarm') {
        const reason = window.prompt('False-alarm reason (weather/grid attribution):');
        if (!reason) return;
        body.closure_notes = reason;
      } else if (action === 'close' || action === 'close-escalated' || action === 'close-false-alarm') {
        const notes = window.prompt('Closure notes:');
        if (notes) body.closure_notes = notes;
      }
      await api.post(`/esums/pr-chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">PR sustained-underperformance chain</h2>
          <p className="text-xs text-[#4a5568]">
            9-stage P6 chain · monitoring → warning → investigating → RCA → intervention → verified → closed.
            Tier SLAs (utility 24h warning, 30d intervention). Utility-tier escalations and breaches cross into the regulator inbox.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total cases"   value={kpis.total} />
        <Kpi label="Utility open"  value={kpis.utility_open} tone={kpis.utility_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="Intervention"  value={kpis.intervention} />
        <Kpi label="Escalated"     value={kpis.escalated} tone={kpis.escalated > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached"  value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Revenue loss"  value={fmtZar(kpis.revenue_loss)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Site</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">MW</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Baseline</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Observed</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Cause</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.capacity_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">{r.case_number}</td>
                    <td className="px-3 py-2 text-[#1a3a5c]">{r.site_name}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{r.capacity_mw.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{r.baseline_pr.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#9b1f1f] font-semibold">{r.observed_pr.toFixed(3)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.primary_cause ?? '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No PR cases match.</td></tr>
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
  row: PrRow;
  events: PrEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: PrRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canEscalate = row.chain_status === 'investigating' || row.chain_status === 'intervention_executing';
  const canFalseAlarm = row.chain_status === 'warning' || row.chain_status === 'investigating';

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[680px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.case_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.site_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">{row.technology} · {row.capacity_mw.toFixed(1)}MW · {TIER_TONE[row.capacity_tier].label}</div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Baseline PR"   value={row.baseline_pr.toFixed(3)} />
            <Pair label="Observed PR"   value={row.observed_pr.toFixed(3)} />
            <Pair label="PR shortfall"  value={`${(row.pr_shortfall * 100).toFixed(1)}pp`} />
            <Pair label="Window"        value={`${row.window_days} consecutive days`} />
            <Pair label="Primary cause" value={row.primary_cause ?? '—'} />
            <Pair label="Revenue loss"  value={fmtZar(row.revenue_loss_zar)} />
            <Pair label="State"         value={STATE_TONE[row.chain_status].label} />
            <Pair label="Escalation"    value={String(row.escalation_level)} />
            <Pair label="Linked WO"     value={row.linked_wo_id ?? '—'} />
            <Pair label="Linked claim"  value={row.linked_warranty_claim_id ?? '—'} />
            <Pair label="SLA deadline"  value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"    value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
          </div>
          {row.rca_summary && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">RCA summary</div>
              {row.rca_summary}
            </div>
          )}
          {row.action_plan && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Action plan</div>
              {row.action_plan}
            </div>
          )}
        </section>

        {(nextAction || canEscalate || canFalseAlarm) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canEscalate && (
                <button type="button"
                  onClick={() => onAct('escalate', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.escalate}
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
