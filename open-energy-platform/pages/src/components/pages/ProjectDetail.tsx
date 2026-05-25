import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { OEIcon } from '../OEIcon';
import { StitchPage, StitchCard, StitchKpi, StitchPill } from '../StitchPage';
import { VaultPanel } from '../VaultPanel';
import { ThreadPanel } from '../ThreadPanel';
import { ProjectScurve } from '../widgets/ProjectScurve';

/* ════════════════════════════════════════════════════════════════════════
 * Project Detail page — /projects/:id
 *
 * Surfaces the project's metadata, milestones, and a link out to the
 * Esums page filtered to its linked esums site (if any). Fixes the 404 path
 * the Projects list used to navigate to.
 * ═══════════════════════════════════════════════════════════════════════ */

interface Project {
  id: string;
  project_name: string;
  project_type?: string;
  technology?: string;
  capacity_mw?: number;
  status?: string;
  developer_id?: string;
  developer_name?: string;
  location?: string;
  province?: string;
  cod_date?: string;
  ppa_status?: string;
  total_capex_zar?: number;
  irr_target_pct?: number;
  description?: string;
  created_at?: string;
}

interface Milestone {
  id: string;
  milestone_name: string;
  milestone_type?: string;
  due_date?: string;
  achieved_date?: string;
  status: string;
}

const formatZAR = (val: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val || 0);
const num = (val: number, digits = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(val || 0);

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const [p, m] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/milestones`).catch(() => ({ data: { success: true, data: [] } })),
      ]);
      setProject((p.data?.data || null) as Project | null);
      setMilestones((m.data?.data || []) as Milestone[]);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; message?: string };
      setError(err.response?.status === 404 ? 'Project not found.' : (err.message || 'Failed to load project.'));
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) {
    return (
      <StitchPage title="Project" subtitle="Loading…"><Skeleton variant="card" rows={4} /></StitchPage>
    );
  }
  if (error) {
    return (
      <StitchPage
        eyebrowIcon={() => <OEIcon name="building" size={12} />}
        eyebrowLabel="IPP Project"
        title="Project not available"
      >
        <ErrorBanner message={error} onRetry={refresh} />
        <div className="mt-4">
          <Link to="/projects" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#3b82c4] hover:underline">
            <OEIcon name="chevron-left" size={14} /> Back to projects
          </Link>
        </div>
      </StitchPage>
    );
  }
  if (!project) return null;

  const techIcon = ((t: string | undefined) => {
    const k = (t || '').toLowerCase();
    if (k.includes('solar') || k.includes('pv')) return 'sun';
    if (k.includes('wind')) return 'wind';
    if (k.includes('battery') || k.includes('storage')) return 'battery';
    return 'bolt';
  })(project.technology);

  return (
    <StitchPage
      eyebrowIcon={() => <OEIcon name={techIcon} size={12} />}
      eyebrowLabel={`${project.project_type || 'IPP Project'} · ${project.province || project.location || '—'}`}
      title={project.project_name}
      subtitle={project.description || `${project.technology || 'Renewable'} project at ${project.capacity_mw || 0} MW`}
      actions={
        <>
          <button onClick={() => navigate('/projects')} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <OEIcon name="chevron-left" size={14} /> Projects
          </button>
          <button onClick={() => navigate(`/projects/${project.id}/lifecycle`)} className="h-9 px-3 rounded-md text-white text-[12px] font-semibold inline-flex items-center gap-1" style={{ background: 'linear-gradient(135deg,#3b82c4 0%,#1a5d97 100%)' }}>
            <OEIcon name="flow" size={14} /> Lifecycle timeline
          </button>
          <button onClick={refresh} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <OEIcon name="refresh" size={14} /> Refresh
          </button>
        </>
      }
    >
      <ProjectScurve
        milestones={milestones.map((m) => ({
          id: m.id,
          milestone_name: m.milestone_name,
          milestone_type: m.milestone_type,
          due_date: m.due_date,
          achieved_date: m.achieved_date,
          status: m.status,
        }))}
        capexZar={project.total_capex_zar}
        startDate={project.created_at}
        codDate={project.cod_date}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StitchKpi label="Capacity"      value={`${num(project.capacity_mw || 0, 1)} MW`}     icon={() => <OEIcon name="bolt" size={14} />} />
        <StitchKpi label="Status"        value={project.status || '—'}                       icon={() => <OEIcon name="flag" size={14} />} />
        <StitchKpi label="COD"           value={project.cod_date ? new Date(project.cod_date).toLocaleDateString() : '—'} icon={() => <OEIcon name="calendar" size={14} />} />
        <StitchKpi label="Capex"         value={project.total_capex_zar ? formatZAR(project.total_capex_zar) : '—'}       icon={() => <OEIcon name="currency-zar" size={14} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <StitchCard title="Milestones">
            {milestones.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-[#6b7685]">No milestones recorded yet.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-[13px]">
                  <thead className="bg-[#fafbfd]">
                    <tr className="text-[11px] uppercase text-[#6b7685]">
                      <th className="px-4 py-2 text-left">Milestone</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-left">Due</th>
                      <th className="px-4 py-2 text-left">Achieved</th>
                      <th className="px-4 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map((m) => (
                      <tr key={m.id} className="border-t border-[#eef2f7]">
                        <td className="px-4 py-2 font-medium">{m.milestone_name}</td>
                        <td className="px-4 py-2 text-[#3d4756] capitalize">{(m.milestone_type || '').replace(/_/g, ' ') || '—'}</td>
                        <td className="px-4 py-2 font-mono text-[11px]">{m.due_date ? new Date(m.due_date).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-2 font-mono text-[11px]">{m.achieved_date ? new Date(m.achieved_date).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-2"><StitchPill status={m.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </StitchCard>
        </div>

        <div className="space-y-4">
          <StitchCard title="Project facts">
            <dl className="text-[13px] space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-[#6b7685]">Technology</dt>
                <dd className="text-[#0f1c2e] font-medium">{project.technology || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#6b7685]">Developer</dt>
                <dd className="text-[#0f1c2e]">{project.developer_name || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#6b7685]">Location</dt>
                <dd className="text-[#0f1c2e]">{project.province || project.location || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#6b7685]">PPA</dt>
                <dd className="text-[#0f1c2e]"><StitchPill status={project.ppa_status || 'pending'} /></dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#6b7685]">Target IRR</dt>
                <dd className="text-[#0f1c2e] font-mono">{project.irr_target_pct ? `${num(project.irr_target_pct, 2)}%` : '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#6b7685]">Created</dt>
                <dd className="text-[#0f1c2e] font-mono text-[11px]">{project.created_at ? new Date(project.created_at).toLocaleDateString() : '—'}</dd>
              </div>
            </dl>
          </StitchCard>

          <StitchCard title="Linked workspaces">
            <div className="space-y-2 text-[13px]">
              <Link to="/esums" className="flex items-center justify-between p-2 rounded hover:bg-[#eef2f7]">
                <span className="inline-flex items-center gap-2"><OEIcon name="wrench" size={14} tone="teal" /> Esums cockpit</span>
                <OEIcon name="chevron-right" size={14} tone="muted" />
              </Link>
              <Link to="/contracts" className="flex items-center justify-between p-2 rounded hover:bg-[#eef2f7]">
                <span className="inline-flex items-center gap-2"><OEIcon name="contract" size={14} tone="navy" /> Contracts</span>
                <OEIcon name="chevron-right" size={14} tone="muted" />
              </Link>
              <Link to="/pipeline" className="flex items-center justify-between p-2 rounded hover:bg-[#eef2f7]">
                <span className="inline-flex items-center gap-2"><OEIcon name="flow" size={14} tone="blue" /> Pipeline</span>
                <OEIcon name="chevron-right" size={14} tone="muted" />
              </Link>
              <Link to="/funds" className="flex items-center justify-between p-2 rounded hover:bg-[#eef2f7]">
                <span className="inline-flex items-center gap-2"><OEIcon name="piggy-bank" size={14} tone="amber" /> Funding</span>
                <OEIcon name="chevron-right" size={14} tone="muted" />
              </Link>
            </div>
          </StitchCard>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <VaultPanel entityType="projects" entityId={project.id} title="Documents" />
        <ThreadPanel entityType="projects" entityId={project.id} title="Discussion" />
      </div>
    </StitchPage>
  );
}

export default ProjectDetail;
