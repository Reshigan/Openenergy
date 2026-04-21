import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Briefcase, MapPin, Calendar, DollarSign, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { Skeleton, TableSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { ErrorBanner } from '../ErrorBanner';
import { ExportBar } from '../ExportBar';
import { EntityLink } from '../EntityLink';

const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

const phaseColors: Record<string, string> = {
  development: 'bg-blue-100 text-blue-700',
  construction: 'bg-orange-100 text-orange-700',
  operational: 'bg-green-100 text-green-700',
  commissioning: 'bg-purple-100 text-purple-700',
  suspended: 'bg-gray-100 text-ionex-text-sub',
};

export function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchProjects(); }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/projects');
      setProjects(res.data?.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = projects.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="p-6"><TableSkeleton columns={5} rows={5} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchProjects} /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IPP Projects</h1>
          <p className="text-ionex-text-mute">Track and manage energy projects</p>
        </div>
        <button onClick={() => navigate('/projects/new')} className="flex items-center gap-2 px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-dark">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      <div className="bg-white rounded-xl border border-ionex-border-100">
        <div className="p-4 border-b border-ionex-border-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-ionex-border-200 rounded-lg text-sm" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<Briefcase className="w-8 h-8" />} title="No projects yet" description="Create your first project to get started" action={{ label: 'Create Project', onClick: () => navigate('/projects/new') }} />
        ) : (
          <>
            <ExportBar data={filtered} filename="projects" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {filtered.map(project => (
                <div key={project.id} onClick={() => navigate(`/projects/${project.id}`)} className="border border-ionex-border-100 rounded-xl p-4 hover:shadow-md cursor-pointer transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{project.name}</h3>
                      <p className="text-xs text-ionex-text-mute"><EntityLink id={project.id} type="project" /></p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${phaseColors[project.phase] || phaseColors.development}`}>{project.phase?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="space-y-2 text-sm text-ionex-text-sub">
                    <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> {project.location || 'Location TBD'}</div>
                    <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /> COD: {project.cod || 'TBD'}</div>
                    <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-gray-400" /> {formatZAR(project.capacity_mw * 1500000)}</div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-ionex-border-100 flex items-center justify-between">
                    <div className="text-xs text-ionex-text-mute">{project.capacity_mw || 0} MW Capacity</div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
