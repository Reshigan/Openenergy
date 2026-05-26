// ═══════════════════════════════════════════════════════════════════════════
// ScheduleTab — P6-grade schedule view for the IPP project file.
//
// Sub-views: KPI strip, WBS+activity table, SVG Gantt, resource panel,
// baselines list. Action buttons: recompute, level, save baseline.
// AI inline cards from /api/ai/schedule/* (Task 18).
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

export interface ScheduleActivity {
  id: string;
  project_id: string;
  parent_id: string | null;
  wbs_code: string;
  sort_order: number;
  name: string;
  type: 'summary' | 'task' | 'milestone';
  duration_days: number;
  planned_start: string | null;
  planned_finish: string | null;
  early_start: string | null;
  early_finish: string | null;
  late_start: string | null;
  late_finish: string | null;
  total_float: number | null;
  free_float: number | null;
  is_critical: number;
  percent_complete: number;
}

export interface ScheduleState {
  project_id: string;
  version: number;
  status_date?: string;
  last_computed_at?: string;
  total_duration_days?: number;
  start_date?: string;
  finish_date?: string;
  has_cycles?: number;
}

export interface ScheduleResource {
  id: string;
  name: string;
  resource_type: 'labor' | 'equipment' | 'material';
  max_units: number;
  unit?: string;
}

export interface ScheduleBaseline {
  id: string;
  name: string;
  is_current: number;
  saved_by: string;
  saved_at: string;
  notes?: string;
}

const fmtDate = (d?: string | null) => d ? d.slice(0, 10) : '—';

function daysBetween(a: string, b: string): number {
  const dA = new Date(a + 'T00:00:00Z').getTime();
  const dB = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((dB - dA) / 86400000);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface ScheduleTabProps {
  projectId: string;
}

export function ScheduleTab({ projectId }: ScheduleTabProps) {
  const [activities, setActivities] = useState<ScheduleActivity[]>([]);
  const [resources, setResources] = useState<ScheduleResource[]>([]);
  const [baselines, setBaselines] = useState<ScheduleBaseline[]>([]);
  const [state, setState] = useState<ScheduleState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [a, r, b, s] = await Promise.all([
        api.get(`/projects/${projectId}/schedule/${projectId}/activities`),
        api.get(`/projects/${projectId}/schedule/${projectId}/resources`),
        api.get(`/projects/${projectId}/schedule/${projectId}/baselines`),
        api.get(`/projects/${projectId}/schedule/${projectId}/state`),
      ]);
      setActivities(a.data?.data || []);
      setResources(r.data?.data?.resources || []);
      setBaselines(b.data?.data || []);
      setState(s.data?.data || null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const recompute = async () => {
    setBusy('recompute');
    try {
      await api.post(`/projects/${projectId}/schedule/${projectId}/recompute`, {});
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Recompute failed');
    } finally {
      setBusy(null);
    }
  };

  const level = async () => {
    setBusy('level');
    try {
      await api.post(`/projects/${projectId}/schedule/${projectId}/level`, { mode: 'resource-limited' });
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Leveling failed');
    } finally {
      setBusy(null);
    }
  };

  const saveBaseline = async () => {
    setBusy('baseline');
    const name = `Baseline ${new Date().toISOString().slice(0, 10)} ${baselines.length + 1}`;
    try {
      await api.post(`/projects/${projectId}/schedule/${projectId}/baselines`, { name, is_current: true });
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Baseline failed');
    } finally {
      setBusy(null);
    }
  };

  const kpis = useMemo(() => {
    const tasks = activities.filter(a => a.type !== 'summary');
    const critical = tasks.filter(a => a.is_critical);
    const milestones = activities.filter(a => a.type === 'milestone');
    const startSet = activities.map(a => a.early_start || a.planned_start).filter(Boolean) as string[];
    const finishSet = activities.map(a => a.early_finish || a.planned_finish).filter(Boolean) as string[];
    const earliest = startSet.length ? startSet.reduce((m, v) => v < m ? v : m, startSet[0]) : null;
    const latest = finishSet.length ? finishSet.reduce((m, v) => v > m ? v : m, finishSet[0]) : null;
    return {
      total: tasks.length,
      critical: critical.length,
      milestones: milestones.length,
      start: earliest,
      finish: latest,
      duration: state?.total_duration_days || (earliest && latest ? daysBetween(earliest, latest) + 1 : null),
    };
  }, [activities, state]);

  // ── Gantt math ────────────────────────────────────────────────────────
  const gantt = useMemo(() => {
    const visible = activities.filter(a => a.type !== 'summary' && (a.early_start || a.planned_start));
    if (!visible.length || !kpis.start || !kpis.finish) return { rows: [], totalDays: 0 };
    const totalDays = daysBetween(kpis.start, kpis.finish) + 1;
    const rows = visible.map(a => {
      const start = a.planned_start || a.early_start!;
      const finish = a.planned_finish || a.early_finish || start;
      const offset = daysBetween(kpis.start!, start);
      const dur = Math.max(1, daysBetween(start, finish) + 1);
      return { ...a, offset, dur };
    });
    return { rows, totalDays };
  }, [activities, kpis.start, kpis.finish]);

  return (
    <div data-testid="schedule-tab" className="space-y-6">
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3" data-testid="schedule-kpis">
        <Kpi label="Activities" value={kpis.total} />
        <Kpi label="Critical" value={kpis.critical} accent="critical" />
        <Kpi label="Milestones" value={kpis.milestones} />
        <Kpi label="Start" value={fmtDate(kpis.start || undefined)} mono />
        <Kpi label="Finish" value={fmtDate(kpis.finish || undefined)} mono />
        <Kpi label="Duration (wd)" value={kpis.duration ?? '—'} />
      </div>

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          data-testid="schedule-recompute"
          disabled={loading || busy !== null}
          onClick={recompute}
          className="px-3 py-1.5 text-sm rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy === 'recompute' ? 'Recomputing…' : 'Recompute CPM'}
        </button>
        <button
          data-testid="schedule-level"
          disabled={loading || busy !== null}
          onClick={level}
          className="px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === 'level' ? 'Leveling…' : 'Level resources'}
        </button>
        <button
          data-testid="schedule-baseline"
          disabled={loading || busy !== null}
          onClick={saveBaseline}
          className="px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === 'baseline' ? 'Saving…' : 'Save baseline'}
        </button>
        {state?.last_computed_at ? (
          <span className="text-xs text-slate-500 ml-2">Last computed {fmtDate(state.last_computed_at)} · v{state.version}</span>
        ) : null}
      </div>

      {/* ── Gantt ──────────────────────────────────────────────────── */}
      <div className="rounded-md border border-slate-200 bg-white p-3 overflow-x-auto" data-testid="schedule-gantt">
        <div className="text-sm font-medium text-slate-700 mb-2">Gantt</div>
        <GanttBoard rows={gantt.rows} totalDays={gantt.totalDays} startDate={kpis.start || ''} />
      </div>

      {/* ── WBS table ─────────────────────────────────────────────── */}
      <div className="rounded-md border border-slate-200 bg-white overflow-x-auto" data-testid="schedule-table">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2 font-medium">WBS</th>
              <th className="text-left px-3 py-2 font-medium">Activity</th>
              <th className="text-right px-3 py-2 font-medium">Dur</th>
              <th className="text-left px-3 py-2 font-medium">ES</th>
              <th className="text-left px-3 py-2 font-medium">EF</th>
              <th className="text-right px-3 py-2 font-medium">TF</th>
              <th className="text-center px-3 py-2 font-medium">Crit</th>
            </tr>
          </thead>
          <tbody>
            {activities.map(a => (
              <tr key={a.id} className={`border-b border-slate-100 ${a.type === 'summary' ? 'font-semibold bg-slate-50' : ''}`}>
                <td className="px-3 py-1.5 font-mono text-xs">{a.wbs_code}</td>
                <td className="px-3 py-1.5">{a.name}{a.type === 'milestone' ? ' ◆' : ''}</td>
                <td className="px-3 py-1.5 text-right">{a.duration_days || 0}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{fmtDate(a.early_start)}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{fmtDate(a.early_finish)}</td>
                <td className="px-3 py-1.5 text-right">{a.total_float ?? '—'}</td>
                <td className="px-3 py-1.5 text-center">{a.is_critical ? <span className="text-red-600">●</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Resources ─────────────────────────────────────────────── */}
      <div className="rounded-md border border-slate-200 bg-white p-3" data-testid="schedule-resources">
        <div className="text-sm font-medium text-slate-700 mb-2">Resources</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          {resources.map(r => (
            <div key={r.id} className="text-xs border border-slate-200 rounded p-2">
              <div className="font-medium text-slate-800">{r.name}</div>
              <div className="text-slate-500">{r.resource_type} · max {r.max_units}{r.unit ? ` ${r.unit}` : ''}</div>
            </div>
          ))}
          {!resources.length && <div className="text-xs text-slate-500">No resources defined yet.</div>}
        </div>
      </div>

      {/* ── Baselines ─────────────────────────────────────────────── */}
      <div className="rounded-md border border-slate-200 bg-white p-3" data-testid="schedule-baselines">
        <div className="text-sm font-medium text-slate-700 mb-2">Baselines</div>
        {baselines.length ? (
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-xs">
              <tr>
                <th className="text-left py-1">Name</th>
                <th className="text-left py-1">Saved</th>
                <th className="text-left py-1">Current</th>
              </tr>
            </thead>
            <tbody>
              {baselines.map(b => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="py-1">{b.name}</td>
                  <td className="py-1 font-mono text-xs">{fmtDate(b.saved_at)}</td>
                  <td className="py-1">{b.is_current ? '●' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="text-xs text-slate-500">No baselines saved yet.</div>}
      </div>
    </div>
  );
}

// ── KPI tile ─────────────────────────────────────────────────────────────
function Kpi({ label, value, mono, accent }: { label: string; value: any; mono?: boolean; accent?: 'critical' }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-lg ${mono ? 'font-mono' : 'font-semibold'} ${accent === 'critical' ? 'text-red-600' : 'text-slate-900'}`}>
        {value}
      </div>
    </div>
  );
}

// ── Gantt SVG ────────────────────────────────────────────────────────────
function GanttBoard({ rows, totalDays, startDate }: {
  rows: Array<ScheduleActivity & { offset: number; dur: number }>;
  totalDays: number;
  startDate: string;
}) {
  if (!rows.length || !totalDays) return <div className="text-xs text-slate-500">Run “Recompute CPM” to schedule activities.</div>;
  const dayW = Math.max(2, Math.min(8, Math.floor(800 / totalDays)));
  const rowH = 22;
  const width = totalDays * dayW + 240;
  const height = rows.length * rowH + 40;

  // Month tick marks
  const monthTicks: Array<{ x: number; label: string }> = [];
  for (let i = 0; i < totalDays; i += 7) {
    const d = addDays(startDate, i);
    if (d.endsWith('-01') || i === 0) {
      monthTicks.push({ x: 240 + i * dayW, label: d.slice(0, 7) });
    }
  }

  return (
    <svg width={width} height={height} role="img" aria-label="Gantt chart">
      {/* axis grid */}
      {monthTicks.map((t, i) => (
        <g key={i}>
          <line x1={t.x} x2={t.x} y1={20} y2={height} stroke="#e2e8f0" />
          <text x={t.x + 2} y={14} fontSize="10" fill="#64748b">{t.label}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = 30 + i * rowH;
        const x = 240 + r.offset * dayW;
        const w = Math.max(2, r.dur * dayW);
        const color = r.is_critical ? '#dc2626' : '#0f766e';
        return (
          <g key={r.id}>
            <text x={4} y={y + 14} fontSize="11" fill="#0f172a">{r.wbs_code} · {r.name.slice(0, 28)}</text>
            {r.type === 'milestone'
              ? <polygon points={`${x},${y + 6} ${x + 8},${y + 14} ${x},${y + 22} ${x - 8},${y + 14}`} fill={color} />
              : <rect x={x} y={y + 6} width={w} height={12} fill={color} rx={2} />
            }
          </g>
        );
      })}
    </svg>
  );
}

export default ScheduleTab;
