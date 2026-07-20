// pages/src/meridian/surfaces/ipp/SchedulePulseSurface.tsx — IPP "Schedule pulse" surface.
// Bucket B: extracted from the retired IppWorkstationPage `schedule` tab body
// (per-project critical-path count + 21-day look-ahead), reframed journey-first:
// schedule-health KPIs (on-track / slipping / overdue) derived client-side from the
// look-ahead rows, with the worst-health activities surfaced first. Self-contained `{ role }` body.
import { useEffect, useState } from 'react';
import { Pill } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

type Project = { id: string; project_name?: string; name?: string };
type ScheduleRow = {
  id: string; name: string; wbs_code: string;
  planned_start?: string; planned_finish?: string;
  early_start?: string; early_finish?: string;
  total_float?: number; is_critical?: number; type?: string;
};

type Health = 'overdue' | 'slipping' | 'ontrack';

export default function SchedulePulseSurface(_props: { role: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<string>('');
  const [lookAhead, setLookAhead] = useState<ScheduleRow[]>([]);
  const [critical, setCritical] = useState<number>(0);
  const [overAlloc, setOverAlloc] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/projects');
        const rows = (r.data?.data || []) as Project[];
        setProjects(rows);
        if (rows[0]) setPid(rows[0].id);
      } catch (e: any) { setErr(e?.message || 'Failed to load projects'); }
    })();
  }, []);

  useEffect(() => {
    if (!pid) return;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const [la, acts, over] = await Promise.all([
          api.get(`/projects/${pid}/schedule/look-ahead?days=21`).then(r => r.data?.data || []).catch(() => []),
          api.get(`/projects/${pid}/schedule/activities`).then(r => r.data?.data || []).catch(() => []),
          api.get(`/projects/${pid}/schedule/over-allocations`).then(r => r.data?.data || []).catch(() => []),
        ]);
        setLookAhead(la);
        setCritical(((acts as ScheduleRow[]).filter(a => a.is_critical && a.type !== 'summary')).length);
        setOverAlloc((over as any[]).length);
      } catch (e: any) {
        setErr(e?.response?.data?.error || e?.message || 'Failed to load schedule pulse');
      } finally { setLoading(false); }
    })();
  }, [pid]);

  // Client-side schedule-health rollup over the look-ahead window (summaries excluded).
  const today = new Date().toISOString().slice(0, 10);
  const finishOf = (r: ScheduleRow) => (r.planned_finish || r.early_finish || '').slice(0, 10);
  const healthOf = (r: ScheduleRow): Health => {
    const f = finishOf(r);
    if (f && f < today) return 'overdue';       // past due
    if ((r.total_float ?? 0) < 0) return 'slipping'; // negative float = behind
    return 'ontrack';
  };
  const rowsView = lookAhead.filter(r => r.type !== 'summary');
  const overdue = rowsView.filter(r => healthOf(r) === 'overdue').length;
  const slipping = rowsView.filter(r => healthOf(r) === 'slipping').length;
  const onTrack = rowsView.length - overdue - slipping;
  const rank: Record<Health, number> = { overdue: 0, slipping: 1, ontrack: 2 };
  const sorted = [...rowsView].sort(
    (a, b) => rank[healthOf(a)] - rank[healthOf(b)] || (a.total_float ?? 0) - (b.total_float ?? 0),
  );
  const tone: Record<Health, 'bad' | 'warn' | 'good'> = { overdue: 'bad', slipping: 'warn', ontrack: 'good' };

  const kpi = (label: string, value: number) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] uppercase tracking-wider text-[var(--ink3)]">{label}</span>
      <span className="text-[20px] font-bold text-[var(--ink)]">{value.toLocaleString('en-ZA')}</span>
    </div>
  );

  return (
    <div className="space-y-3" data-testid="ipp-schedule-pulse">
      {err && <div className="rounded-md border border-[var(--oxide)] bg-[var(--oxide-tint)] px-3 py-2 text-xs text-[var(--oxide-deep)]" role="alert">{err}</div>}

      <div className="flex items-center gap-2 text-sm">
        <label className="text-[var(--ink3)] text-xs uppercase tracking-wide">Project</label>
        <select value={pid} onChange={(e) => setPid(e.target.value)} className="border border-[var(--line)] rounded-md px-2 py-1 text-sm">
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_name || p.name || p.id}</option>)}
        </select>
        {loading && <span className="text-xs text-[var(--ink3)]">loading…</span>}
      </div>

      {/* Schedule-health summary */}
      <div className="rounded-lg border border-[var(--line)] p-4" style={{ background: 'linear-gradient(135deg, color-mix(in oklab, var(--petrol) 14%, transparent), transparent)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[13px] font-bold text-[var(--ink)]">Schedule health — next 21 days</span>
          {overdue > 0
            ? <Pill tone="bad">{overdue} overdue</Pill>
            : slipping > 0
              ? <Pill tone="warn">{slipping} slipping</Pill>
              : rowsView.length > 0 ? <Pill tone="good">on track</Pill> : null}
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          {kpi('On-track', onTrack)}
          {kpi('Slipping', slipping)}
          {kpi('Overdue', overdue)}
          {kpi('Critical activities', critical)}
          {kpi('Over-allocations', overAlloc)}
        </div>
      </div>

      {/* Primary view: worst schedule health first */}
      <div className="rounded-md border border-[var(--line)] bg-surface-v2">
        <div className="px-3 py-2 text-xs uppercase tracking-wide text-[var(--ink3)]">Look-ahead — worst schedule health first</div>
        {sorted.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[var(--ink3)]">
            No activities in the 21-day look-ahead window. Once schedule activities are baselined for this project, upcoming work and its float appear here, worst-health first.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-[var(--raised)] text-[var(--ink3)]">
              <tr>
                <th className="text-left px-3 py-1.5">WBS</th>
                <th className="text-left px-3 py-1.5">Activity</th>
                <th className="text-left px-3 py-1.5">Start</th>
                <th className="text-left px-3 py-1.5">Finish</th>
                <th className="text-right px-3 py-1.5">TF</th>
                <th className="text-left px-3 py-1.5">Health</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 20).map(r => {
                const h = healthOf(r);
                return (
                  <tr key={r.id} className="border-t border-[var(--raised)]">
                    <td className="px-3 py-1 font-mono">{r.wbs_code}</td>
                    <td className="px-3 py-1">{r.name}{r.is_critical ? <span className="ml-1 text-[var(--oxide-deep)]">●</span> : null}</td>
                    <td className="px-3 py-1 font-mono">{(r.planned_start || r.early_start || '').slice(0, 10)}</td>
                    <td className="px-3 py-1 font-mono">{finishOf(r)}</td>
                    <td className="px-3 py-1 text-right">{r.total_float ?? '—'}</td>
                    <td className="px-3 py-1"><Pill tone={tone[h]}>{h === 'ontrack' ? 'on track' : h}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
