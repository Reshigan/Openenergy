import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Briefcase, MapPin, Calendar, DollarSign, ArrowRight, Edit2, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { TableSkeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EntityLink } from '../EntityLink';
import { useEscapeKey } from '../../hooks/useEscapeKey';

const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const BAD_BG = 'oklch(0.97 0.04 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const WARN_BG= 'oklch(0.96 0.05 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const GOOD_BG= 'oklch(0.95 0.04 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

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

function statusColor(s: string): { bg: string; fg: string } {
  if (s === 'operational') return { bg: GOOD_BG, fg: GOOD };
  if (s === 'construction' || s === 'commissioning') return { bg: WARN_BG, fg: WARN };
  if (s === 'suspended') return { bg: BAD_BG, fg: BAD };
  return { bg: BG2, fg: TX2 };
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

  const totalCapacity = projects.reduce((s, p) => s + (p.capacity_mw || 0), 0);
  const operational = projects.filter(p => (p.status || p.phase) === 'operational').length;
  const inProgress = projects.filter(p => ['construction', 'commissioning', 'development'].includes(p.status || p.phase || '')).length;

  if (loading) return (
    <div style={{ padding: 24, background: BG, minHeight: '100vh' }}>
      <TableSkeleton columns={5} rows={5} />
    </div>
  );

  if (error) return (
    <div style={{ padding: 24, background: BG, minHeight: '100vh' }}>
      <ErrorBanner message={error} onRetry={fetchProjects} />
    </div>
  );

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>
      {/* LEFT COLUMN */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Briefcase size={14} style={{ color: TX3 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>IPP</span>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>IPP Projects</h1>
              <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>Track and manage energy projects</p>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={openCreate}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: ACC, color: '#fff', border: 'none',
                  padding: '8px 16px', borderRadius: 6, fontWeight: 600,
                  cursor: 'pointer', fontSize: 13,
                }}
              >
                <Plus size={14} /> New Project
              </button>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total Projects</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>{projects.length}</div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total Capacity</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>{totalCapacity.toFixed(0)} <span style={{ fontSize: 13, fontWeight: 500, color: TX2 }}>MW</span></div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Operational</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: GOOD, fontFamily: MONO, marginTop: 4 }}>{operational}</div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>In Progress</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: WARN, fontFamily: MONO, marginTop: 4 }}>{inProgress}</div>
          </div>
        </div>

        {/* Project cards */}
        {filtered.length === 0 ? (
          <div style={{
            background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '48px 24px', textAlign: 'center',
          }}>
            <Briefcase size={32} style={{ color: TX3, marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: TX1, marginBottom: 6 }}>No projects yet</div>
            <div style={{ fontSize: 13, color: TX2, marginBottom: canManage ? 20 : 0 }}>
              {canManage ? 'Create your first project to get started' : 'No projects are visible for your role yet.'}
            </div>
            {canManage && (
              <button
                type="button"
                onClick={openCreate}
                style={{
                  background: ACC, color: '#fff', border: 'none',
                  padding: '8px 16px', borderRadius: 6, fontWeight: 600,
                  cursor: 'pointer', fontSize: 13,
                }}
              >
                Create Project
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filtered.map(project => {
              const displayName = project.project_name || project.name || '(Unnamed project)';
              const displayStatus = (project.status || project.phase || 'development') as string;
              const ownProject = project.developer_id === user?.id || user?.role === 'admin';
              const { bg: stBg, fg: stFg } = statusColor(displayStatus);
              const estValue = (project.capacity_mw || 0) * 1500000;
              return (
                <div
                  key={project.id}
                  style={{
                    background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
                    padding: '16px', display: 'flex', flexDirection: 'column',
                    transition: 'box-shadow 0.15s',
                  }}
                >
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: TX1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayName}
                      </div>
                      <div style={{ fontSize: 11, color: TX3, marginTop: 2, fontFamily: MONO }}>
                        <EntityLink id={project.id} type="project" />
                      </div>
                    </div>
                    <span style={{
                      background: stBg, color: stFg,
                      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      marginLeft: 8, whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {displayStatus.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Card details */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: TX2, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={12} style={{ color: TX3, flexShrink: 0 }} />
                      <span>{project.location || 'Location TBD'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={12} style={{ color: TX3, flexShrink: 0 }} />
                      <span>COD: {project.cod || 'TBD'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <DollarSign size={12} style={{ color: TX3, flexShrink: 0 }} />
                      <span style={{ fontFamily: MONO }}>{formatZAR(estValue)}</span>
                    </div>
                  </div>

                  {/* Card footer */}
                  <div style={{
                    marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ fontSize: 11, color: TX3, fontFamily: MONO }}>
                      {project.capacity_mw || 0} MW
                      {project.technology && (
                        <span style={{ marginLeft: 6, color: TX3, textTransform: 'capitalize' }}>· {project.technology}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {ownProject && canManage && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEdit(project); }}
                            title="Edit project"
                            style={{ padding: '4px 6px', borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: TX2 }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); doDelete(project.id); }}
                            title="Delete project"
                            style={{ padding: '4px 6px', borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: BAD }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(`/projects/${project.id}`)}
                        title="Open project"
                        style={{
                          padding: '4px 6px', borderRadius: 5, border: 'none',
                          background: 'transparent', cursor: 'pointer', color: TX2,
                        }}
                      >
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RIGHT COLUMN */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Search */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Search
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: TX3 }} />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', paddingLeft: 30, paddingRight: 12,
                paddingTop: 7, paddingBottom: 7,
                border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13,
                background: BG1, color: TX1, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Quick actions */}
        {canManage && (
          <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Actions
            </div>
            <button
              type="button"
              onClick={openCreate}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', background: ACC, color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13,
              }}
            >
              <Plus size={13} /> New Project
            </button>
          </div>
        )}

        {/* Summary stats */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Portfolio Summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Total projects', value: String(projects.length) },
              { label: 'Total capacity', value: `${totalCapacity.toFixed(0)} MW` },
              { label: 'Operational', value: String(operational) },
              { label: 'In progress', value: String(inProgress) },
              { label: 'Suspended', value: String(projects.filter(p => (p.status || p.phase) === 'suspended').length) },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: TX2 }}>{label}</span>
                <span style={{ fontFamily: MONO, fontWeight: 600, color: TX1 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Phase breakdown */}
        {projects.length > 0 && (
          <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              By Technology
            </div>
            {(['solar', 'wind', 'hybrid', 'bess', 'hydro', 'biomass'] as const).map(tech => {
              const count = projects.filter(p => p.technology === tech).length;
              if (!count) return null;
              return (
                <div key={tech} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: TX2, textTransform: 'capitalize' }}>{tech === 'bess' ? 'BESS' : tech.charAt(0).toUpperCase() + tech.slice(1)}</span>
                  <span style={{ fontFamily: MONO, fontWeight: 600, color: TX1 }}>{count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Filtered count */}
        {search && (
          <div style={{ fontSize: 12, color: TX3, textAlign: 'center', padding: '4px 0' }}>
            Showing {filtered.length} of {projects.length} projects
          </div>
        )}
      </div>

      {/* Modal */}
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

  const inputStyle: React.CSSProperties = {
    width: '100%', border: `1px solid ${BORDER}`, borderRadius: 6,
    padding: '7px 10px', fontSize: 13, color: TX1, background: BG1,
    outline: 'none', boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle, background: BG1, cursor: 'pointer',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="projects-modal-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '16px', overflowY: 'auto',
      }}
    >
      <div style={{
        background: BG1, borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        width: '100%', maxWidth: 640, marginTop: 32,
        border: `1px solid ${BORDER}`,
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
        }}>
          <h2 id="projects-modal-title" style={{ fontSize: 16, fontWeight: 700, color: TX1, margin: 0 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ padding: 4, borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: TX2 }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Project name" required>
            <input value={form.project_name} onChange={(e) => f('project_name')(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Location" required>
            <input value={form.location} onChange={(e) => f('location')(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Structure">
            <select value={form.structure_type} onChange={(e) => f('structure_type')(e.target.value)} style={selectStyle}>
              <option value="ppa">PPA</option>
              <option value="wheeling">Wheeling</option>
              <option value="merchant">Merchant</option>
              <option value="self_build">Self-build</option>
              <option value="aggregation">Aggregation</option>
            </select>
          </Field>
          <Field label="Technology">
            <select value={form.technology} onChange={(e) => f('technology')(e.target.value)} style={selectStyle}>
              <option value="solar">Solar PV</option>
              <option value="wind">Wind</option>
              <option value="hybrid">Hybrid</option>
              <option value="bess">BESS</option>
              <option value="hydro">Hydro</option>
              <option value="biomass">Biomass</option>
            </select>
          </Field>
          <Field label="Capacity (MW)" required>
            <input value={form.capacity_mw} onChange={(e) => f('capacity_mw')(e.target.value)} inputMode="decimal" style={inputStyle} />
          </Field>
          <Field label="Grid connection point">
            <input value={form.grid_connection_point} onChange={(e) => f('grid_connection_point')(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="PPA price (R / MWh)">
            <input value={form.ppa_price_per_mwh} onChange={(e) => f('ppa_price_per_mwh')(e.target.value)} inputMode="decimal" style={inputStyle} />
          </Field>
          <Field label="PPA duration (years)">
            <input value={form.ppa_duration_years} onChange={(e) => f('ppa_duration_years')(e.target.value)} inputMode="numeric" style={inputStyle} />
          </Field>
          {showStatus && (
            <Field label="Status">
              <select value={form.status} onChange={(e) => f('status')(e.target.value)} style={selectStyle}>
                <option value="development">Development</option>
                <option value="construction">Construction</option>
                <option value="commissioning">Commissioning</option>
                <option value="operational">Operational</option>
                <option value="suspended">Suspended</option>
              </select>
            </Field>
          )}
        </div>

        {err && (
          <div style={{ padding: '0 20px 12px', fontSize: 12, color: BAD }}>
            {err}
          </div>
        )}

        {/* Modal footer */}
        <div style={{
          padding: '14px 20px', borderTop: `1px solid ${BORDER}`,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              background: 'transparent', color: TX1, border: `1px solid ${BORDER}`,
              padding: '7px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            style={{
              background: ACC, color: '#fff', border: 'none',
              padding: '7px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save project'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: TX3, marginBottom: 5, letterSpacing: '0.03em' }}>
        {label}{required && <span style={{ color: BAD, marginLeft: 2 }}>*</span>}
      </span>
      {children}
    </label>
  );
}

export default Projects;
