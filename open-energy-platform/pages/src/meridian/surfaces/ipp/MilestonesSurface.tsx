// pages/src/meridian/surfaces/ipp/MilestonesSurface.tsx — IPP "Milestones" surface.
// Bucket B: extracted verbatim from the retired IppWorkstationPage `milestones` tab body
// (per-project milestone listing + satisfy ActionModal). Self-contained `{ role }` body;
// the husk's `onRefresh` re-fetch trigger is replaced by a local refreshKey.
import { useEffect, useState } from 'react';
import { Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

type Project = { id: string; project_name?: string; name?: string };
type Milestone = { id: string; name: string; due_date: string | null; status: string };

export default function MilestonesSurface(_props: { role: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<string>('');
  const [items, setItems] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [satisfying, setSatisfying] = useState<Milestone | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/projects');
        const rows = (r.data?.data || []) as Project[];
        setProjects(rows);
        if (rows.length > 0) setPid(rows[0].id);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'failed to load projects');
      }
    })();
  }, []);

  useEffect(() => {
    if (!pid) return;
    setLoading(true); setErr(null);
    api.get(`/projects/${pid}/milestones`)
      .then((r) => setItems((r.data?.data || []) as Milestone[]))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false));
  }, [pid, refreshKey]);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <label className="block text-[13px]">
          <span className="text-[var(--ink3)]">Project</span>
          <select value={pid} onChange={(e) => setPid(e.target.value)} className="mt-1 h-9 px-3 border border-[var(--line)] rounded-md text-[13px]">
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_name || p.name || p.id}</option>)}
          </select>
        </label>
      </div>
      {err && <div className="text-[12px] text-[var(--oxide-deep)]">{err}</div>}
      {loading ? (
        <div className="text-[13px] text-[var(--ink3)]">Loading milestones…</div>
      ) : items.length === 0 ? (
        <div className="text-[13px] text-[var(--ink3)]">No milestones for this project.</div>
      ) : (
        <div className="rounded-lg border border-[var(--line)] bg-white overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[var(--raised)] text-left text-[10px] uppercase tracking-wide text-[var(--ink3)]">
              <tr><th className="px-4 py-2">Milestone</th><th className="px-4 py-2">Due</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody>
              {items.map(m => (
                <tr key={m.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-2">{m.name}</td>
                  <td className="px-4 py-2">{m.due_date || '—'}</td>
                  <td className="px-4 py-2"><Pill tone={m.status === 'satisfied' ? 'good' : m.status === 'overdue' ? 'bad' : 'warn'}>{m.status}</Pill></td>
                  <td className="px-4 py-2">
                    {m.status !== 'satisfied' && (
                      <button type="button" onClick={() => setSatisfying(m)} className="px-2 py-1 text-[11px] bg-[var(--petrol)] text-white rounded-md">Satisfy</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {satisfying && (
        <ActionModal
          title={`Satisfy milestone · ${satisfying.name}`}
          submitLabel="Mark satisfied"
          fields={[
            { key: 'evidence_url', label: 'Evidence URL or R2 key' },
            { key: 'notes', label: 'Notes', type: 'textarea', required: true },
          ] as FieldSpec[]}
          onClose={() => setSatisfying(null)}
          onSubmit={async (v) => {
            await api.post(`/projects/${pid}/milestones/${satisfying.id}/satisfy`, v);
            setSatisfying(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
