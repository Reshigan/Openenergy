// ════════════════════════════════════════════════════════════════════════
// ProjectOperationsPage — drill-in at /projects/:id/operations
//
// Operational view of an IPP project: O&M work orders, site telemetry,
// nominations, spares, faults. Companion to /projects/:id/lifecycle.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { Pill } from '../launch/WorkstationShell';

export function ProjectOperationsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [spares, setSpares] = useState<any[]>([]);
  const [nominations, setNominations] = useState<any[]>([]);
  const [faults, setFaults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const safe = async (path: string, key: string) => {
    try {
      const res = await api.get(path);
      return (res.data?.data as any[]) || [];
    } catch { return []; }
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    try {
      const p = await api.get(`/projects/${id}`);
      setProject(p.data?.data);
      const [wo, sp, nom, ft] = await Promise.all([
        safe(`/projects/${id}/work-orders`, 'wo'),
        safe(`/projects/${id}/spares`, 'sp'),
        safe(`/projects/${id}/nominations`, 'nom'),
        safe(`/projects/${id}/faults`, 'ft'),
      ]);
      setWorkOrders(wo);
      setSpares(sp);
      setNominations(nom);
      setFaults(ft);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={6} /></div>;
  if (err) return <div className="p-6"><ErrorBanner message={err} onRetry={() => void load()} /></div>;
  if (!project) return null;

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: '#6b7685' }}>
            <Link to="/projects" className="hover:underline">Projects</Link>
            <span>/</span>
            <Link to={`/projects/${project.id}`} className="hover:underline">{project.project_name}</Link>
            <span>/</span>
            <span style={{ color: '#0f1c2e', fontWeight: 600 }}>Operations</span>
          </div>
          <h1 className="mt-2 font-display text-[28px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>
            Operations · {project.project_name}
          </h1>
          <p className="text-[13px] text-[#3d4756]">
            {project.capacity_mw} MW {project.technology} · {project.location}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate(`/projects/${id}/lifecycle`)} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            Lifecycle
          </button>
          <button onClick={() => navigate(`/projects/${id}`)} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Project file
          </button>
          <button onClick={() => void load()} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Open work orders" value={String(workOrders.filter(w => w.status === 'open' || w.status === 'in_progress').length)} />
        <Kpi label="Spare items" value={String(spares.length)} />
        <Kpi label="Nominations" value={String(nominations.length)} />
        <Kpi label="Active faults" value={String(faults.filter(f => f.status !== 'resolved').length)} />
      </div>

      <Section title={`Work orders (${workOrders.length})`}>
        {workOrders.length === 0 ? <Empty label="No work orders. Schedule preventive + corrective via the Esums page." /> : (
          <Table headers={['When', 'Type', 'Status', 'Asset', 'Notes']}>
            {workOrders.slice(0, 50).map(w => (
              <tr key={w.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{w.opened_at ? new Date(w.opened_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-2"><Pill tone="info">{w.work_type || '—'}</Pill></td>
                <td className="px-4 py-2"><Pill tone={w.status === 'completed' || w.status === 'closed' ? 'good' : w.status === 'open' ? 'warn' : 'info'}>{w.status || '—'}</Pill></td>
                <td className="px-4 py-2 text-[11px]">{w.asset_tag || w.equipment_tag || '—'}</td>
                <td className="px-4 py-2 text-[11px]"><span className="block truncate max-w-md" title={w.description || ''}>{w.description || '—'}</span></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Spares inventory (${spares.length})`}>
        {spares.length === 0 ? <Empty label="No spares stocked. EPC + O&M will list critical spares here." /> : (
          <Table headers={['Part', 'Qty', 'Reorder level', 'Location']}>
            {spares.slice(0, 50).map(s => (
              <tr key={s.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2">{s.part_name || s.part_number || '—'}</td>
                <td className="px-4 py-2">{s.quantity ?? '—'}</td>
                <td className="px-4 py-2">{s.reorder_level ?? '—'}</td>
                <td className="px-4 py-2 text-[11px]">{s.location || '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Nominations (${nominations.length})`}>
        {nominations.length === 0 ? <Empty label="No nominations scheduled." /> : (
          <Table headers={['Period', 'MWh nominated', 'Status']}>
            {nominations.slice(0, 50).map(n => (
              <tr key={n.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px]">{n.period_start} → {n.period_end}</td>
                <td className="px-4 py-2">{n.volume_mwh ?? '—'}</td>
                <td className="px-4 py-2"><Pill tone="info">{n.status || '—'}</Pill></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Faults (${faults.length})`}>
        {faults.length === 0 ? <Empty label="No faults — clean run. Deterministic fault engine surfaces issues here as they trip." /> : (
          <Table headers={['When', 'Severity', 'Status', 'Description']}>
            {faults.slice(0, 50).map(f => (
              <tr key={f.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{f.detected_at ? new Date(f.detected_at).toLocaleString() : '—'}</td>
                <td className="px-4 py-2"><Pill tone={f.severity === 'critical' || f.severity === 'high' ? 'bad' : 'warn'}>{f.severity || '—'}</Pill></td>
                <td className="px-4 py-2"><Pill tone={f.status === 'resolved' ? 'good' : 'bad'}>{f.status || '—'}</Pill></td>
                <td className="px-4 py-2 text-[11px]"><span className="block truncate max-w-md" title={f.description || ''}>{f.description || '—'}</span></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="mt-1 text-[16px] font-bold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7685' }}>{title}</h2>
      {children}
    </section>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
          <tr>{headers.map(h => <th key={h} className="px-4 py-2">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#6b7685]">{label}</div>;
}
