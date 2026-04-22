import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Briefcase, MapPin, Calendar, DollarSign, ArrowRight, Edit2, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { TableSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { ErrorBanner } from '../ErrorBanner';
import { ExportBar } from '../ExportBar';
import { EntityLink } from '../EntityLink';
import { useEscapeKey } from '../../hooks/useEscapeKey';

const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

const phaseColors: Record<string, string> = {
  development: 'bg-blue-100 text-blue-700',
  construction: 'bg-orange-100 text-orange-700',
  operational: 'bg-green-100 text-green-700',
  commissioning: 'bg-purple-100 text-purple-700',
  suspended: 'bg-gray-100 text-ionex-text-sub',
};

type Project = {
  id: string;
  project_name?: string;
  name?: string;
  structure_type?: string;
  technology?: string;
  capacity_mw?: number;
  location?: string;
  status?: string;
  phase?: string;
  cod?: string;
  grid_connection_point?: string;
  ppa_price_per_mwh?: number | null;
  ppa_duration_years?: number | null;
  developer_id?: string;
};

type FormState = {
  project_name: string;
  structure_type: string;
  technology: string;
  capacity_mw: string;
  location: string;
  grid_connection_point: string;
  ppa_price_per_mwh: string;
  ppa_duration_years: string;
  status: string;
};

const emptyForm: FormState = {
  project_name: '',
  structure_type: 'ppa',
  technology: 'solar',
  capacity_mw: '',
  location: '',
  grid_connection_point: '',
  ppa_price_per_mwh: '',
  ppa_duration_years: '',
  status: 'development',
};

function toFormState(p: Project): FormState {
  return {
    project_name: p.project_name || p.name || '',
    structure_type: p.structure_type || 'ppa',
    technology: p.technology || 'solar',
    capacity_mw: p.capacity_mw != null ? String(p.capacity_mw) : '',
    location: p.location || '',
    grid_connection_point: p.grid_connection_point || '',
    ppa_price_per_mwh: p.ppa_price_per_mwh != null ? String(p.ppa_price_per_mwh) : '',
    ppa_duration_years: p.ppa_duration_years != null ? String(p.ppa_duration_years) : '',
    status: p.status || p.phase || 'development',
  };
}

export function Projects() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const canManage = user?.role === 'ipp_developer' || user?.role === 'admin';

  useEffect(() => { fetchProjects(); }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/projects');
      setProjects(res.data?.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setFormErr(null);
    setModalOpen(true);
  }

  function openEdit(p: Project) {
    setEditId(p.id);
    setForm(toFormState(p));
    setFormErr(null);
    setModalOpen(true);
  }

  async function submit() {
    setFormErr(null);
    if (!form.project_name.trim()) { setFormErr('Project name is required'); return; }
    if (!form.capacity_mw || isNaN(Number(form.capacity_mw))) { setFormErr('Capacity (MW) must be a number'); return; }
    if (!form.location.trim()) { setFormErr('Location is required'); return; }

    const payload: Record<string, unknown> = {
      project_name: form.project_name.trim(),
      structure_type: form.structure_type,
      technology: form.technology,
      capacity_mw: Number(form.capacity_mw),
      location: form.location.trim(),
      grid_connection_point: form.grid_connection_point.trim() || null,
      ppa_price_per_mwh: form.ppa_price_per_mwh ? Number(form.ppa_price_per_mwh) : null,
      ppa_duration_years: form.ppa_duration_years ? Number(form.ppa_duration_years) : null,
    };
    if (editId) payload.status = form.status;

    setSaving(true);
    try {
      if (editId) {
        await api.put(`/projects/${editId}`, payload);
      } else {
        await api.post('/projects', payload);
      }
      setModalOpen(false);
      await fetchProjects();
    } catch (err: any) {
      setFormErr(err?.response?.data?.error || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: string) {
    if (!window.confirm('Delete this project? This cannot be undone.')) return;
    try {
      await api.delete(`/projects/${id}`);
      await fetchProjects();
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || 'Delete failed');
    }
  }

  const filtered = projects.filter(p => !search
    || (p.project_name || p.name || '').toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="p-6"><TableSkeleton columns={5} rows={5} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchProjects} /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IPP Projects</h1>
          <p className="text-ionex-text-mute">Track and manage energy projects</p>
        </div>
        {canManage && (
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-deep">
            <Plus className="w-4 h-4" /> New Project
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-ionex-border-soft">
        <div className="p-4 border-b border-ionex-border-soft">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-ionex-border rounded-lg text-sm" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<Briefcase className="w-8 h-8" />} title="No projects yet"
            description={canManage ? 'Create your first project to get started' : 'No projects are visible for your role yet.'}
            action={canManage ? { label: 'Create Project', onClick: openCreate } : undefined} />
        ) : (
          <>
            <ExportBar data={filtered} filename="projects" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {filtered.map(project => {
                const displayName = project.project_name || project.name || '(Unnamed project)';
                const displayStatus = (project.status || project.phase || 'development') as string;
                const ownProject = project.developer_id === user?.id || user?.role === 'admin';
                return (
                  <div key={project.id}
                    className="border border-ionex-border-soft rounded-xl p-4 hover:shadow-md transition-shadow flex flex-col">
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{displayName}</h3>
                        <p className="text-xs text-ionex-text-mute"><EntityLink id={project.id} type="project" /></p>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${phaseColors[displayStatus] || phaseColors.development}`}>
                        {displayStatus.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm text-ionex-text-sub">
                      <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> {project.location || 'Location TBD'}</div>
                      <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /> COD: {project.cod || 'TBD'}</div>
                      <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-gray-400" /> {formatZAR((project.capacity_mw || 0) * 1500000)}</div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-ionex-border-soft flex items-center justify-between">
                      <div className="text-xs text-ionex-text-mute">{project.capacity_mw || 0} MW Capacity</div>
                      <div className="flex items-center gap-2">
                        {ownProject && canManage && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); openEdit(project); }}
                              className="p-1.5 rounded hover:bg-gray-100" title="Edit project">
                              <Edit2 className="w-4 h-4 text-ionex-text-sub" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); doDelete(project.id); }}
                              className="p-1.5 rounded hover:bg-red-50" title="Delete project">
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </>
                        )}
                        <button onClick={() => navigate(`/projects/${project.id}`)}
                          className="p-1.5 rounded hover:bg-gray-100" title="Open project">
                          <ArrowRight className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <ProjectModal
          title={editId ? 'Edit project' : 'New project'}
          form={form}
          setForm={setForm}
          onClose={() => setModalOpen(false)}
          onSubmit={submit}
          saving={saving}
          err={formErr}
          showStatus={!!editId}
        />
      )}
    </div>
  );
}

function ProjectModal(props: {
  title: string;
  form: FormState;
  setForm: (f: FormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  err: string | null;
  showStatus: boolean;
}) {
  const { title, form, setForm, onClose, onSubmit, saving, err, showStatus } = props;
  useEscapeKey(onClose);
  const f = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="projects-modal-title">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mt-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ionex-border-soft">
          <h2 id="projects-modal-title" className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" aria-hidden="true" /></button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Field label="Project name" required>
            <input value={form.project_name} onChange={(e) => f('project_name')(e.target.value)}
              className="w-full border border-ionex-border rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="Location" required>
            <input value={form.location} onChange={(e) => f('location')(e.target.value)}
              className="w-full border border-ionex-border rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="Structure">
            <select value={form.structure_type} onChange={(e) => f('structure_type')(e.target.value)}
              className="w-full border border-ionex-border rounded-md px-3 py-2 text-sm bg-white">
              <option value="ppa">PPA</option>
              <option value="wheeling">Wheeling</option>
              <option value="merchant">Merchant</option>
              <option value="self_build">Self-build</option>
              <option value="aggregation">Aggregation</option>
            </select>
          </Field>
          <Field label="Technology">
            <select value={form.technology} onChange={(e) => f('technology')(e.target.value)}
              className="w-full border border-ionex-border rounded-md px-3 py-2 text-sm bg-white">
              <option value="solar">Solar PV</option>
              <option value="wind">Wind</option>
              <option value="hybrid">Hybrid</option>
              <option value="bess">BESS</option>
              <option value="hydro">Hydro</option>
              <option value="biomass">Biomass</option>
            </select>
          </Field>
          <Field label="Capacity (MW)" required>
            <input value={form.capacity_mw} onChange={(e) => f('capacity_mw')(e.target.value)}
              inputMode="decimal"
              className="w-full border border-ionex-border rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="Grid connection point">
            <input value={form.grid_connection_point} onChange={(e) => f('grid_connection_point')(e.target.value)}
              className="w-full border border-ionex-border rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="PPA price (R / MWh)">
            <input value={form.ppa_price_per_mwh} onChange={(e) => f('ppa_price_per_mwh')(e.target.value)}
              inputMode="decimal"
              className="w-full border border-ionex-border rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="PPA duration (years)">
            <input value={form.ppa_duration_years} onChange={(e) => f('ppa_duration_years')(e.target.value)}
              inputMode="numeric"
              className="w-full border border-ionex-border rounded-md px-3 py-2 text-sm" />
          </Field>
          {showStatus && (
            <Field label="Status">
              <select value={form.status} onChange={(e) => f('status')(e.target.value)}
                className="w-full border border-ionex-border rounded-md px-3 py-2 text-sm bg-white">
                <option value="development">Development</option>
                <option value="construction">Construction</option>
                <option value="commissioning">Commissioning</option>
                <option value="operational">Operational</option>
                <option value="suspended">Suspended</option>
              </select>
            </Field>
          )}
        </div>
        {err && <div className="px-5 pb-3 text-sm text-red-700">{err}</div>}
        <div className="px-5 py-4 border-t border-ionex-border-soft flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 border border-ionex-border rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onSubmit} disabled={saving}
            className="px-4 py-2 bg-ionex-brand text-white rounded-lg text-sm hover:bg-ionex-brand-deep disabled:opacity-50">
            {saving ? 'Saving…' : 'Save project'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-ionex-text-mute mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
