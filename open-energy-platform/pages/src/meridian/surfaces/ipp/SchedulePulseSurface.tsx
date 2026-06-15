// pages/src/meridian/surfaces/ipp/SchedulePulseSurface.tsx — IPP "Schedule pulse" surface.
// Bucket B: extracted verbatim from the retired IppWorkstationPage `schedule` tab body
// (per-project critical-path count + 21-day look-ahead). Self-contained `{ role }` body.
// Carries its own copy of the small Card helper (the husk shared one Card across tabs).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Project = { id: string; project_name?: string; name?: string };
type ScheduleRow = {
  id: string; name: string; wbs_code: string;
  planned_start?: string; planned_finish?: string;
  early_start?: string; early_finish?: string;
  total_float?: number; is_critical?: number; type?: string;
};

function Card({ label, value }: { label: string; value: number | null | undefined }) {
  const formatted = value != null ? Number(value).toLocaleString('en-ZA') : '—';
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
      <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className="text-[20px] font-semibold text-[#0f1c2e] mt-1">{formatted}</div>
    </div>
  );
}

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

  return (
    <div className="space-y-3" data-testid="ipp-schedule-pulse">
      {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
      <div className="flex items-center gap-2 text-sm">
        <label className="text-[#6b7685] text-xs uppercase tracking-wide">Project</label>
        <select value={pid} onChange={(e) => setPid(e.target.value)} className="border border-[#dde4ec] rounded px-2 py-1 text-sm">
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_name || p.name || p.id}</option>)}
        </select>
        {loading && <span className="text-xs text-[#6b7685]">loading…</span>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Card label="Critical activities" value={critical} />
        <Card label="Over-allocations" value={overAlloc} />
        <Card label="Look-ahead (21d)" value={lookAhead.length} />
      </div>
      <div className="rounded border border-[#dde4ec] bg-white">
        <div className="px-3 py-2 text-xs uppercase tracking-wide text-[#6b7685]">Next 21 days</div>
        {lookAhead.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[#6b7685]">No activities scheduled in window.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-[#f6f8fa] text-[#6b7685]">
              <tr><th className="text-left px-3 py-1.5">WBS</th><th className="text-left px-3 py-1.5">Activity</th><th className="text-left px-3 py-1.5">Start</th><th className="text-left px-3 py-1.5">Finish</th><th className="text-right px-3 py-1.5">TF</th></tr>
            </thead>
            <tbody>
              {lookAhead.slice(0, 20).map(r => (
                <tr key={r.id} className="border-t border-[#eef1f5]">
                  <td className="px-3 py-1 font-mono">{r.wbs_code}</td>
                  <td className="px-3 py-1">{r.name}{r.is_critical ? <span className="ml-1 text-red-600">●</span> : null}</td>
                  <td className="px-3 py-1 font-mono">{(r.planned_start || r.early_start || '').slice(0, 10)}</td>
                  <td className="px-3 py-1 font-mono">{(r.planned_finish || r.early_finish || '').slice(0, 10)}</td>
                  <td className="px-3 py-1 text-right">{r.total_float ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
