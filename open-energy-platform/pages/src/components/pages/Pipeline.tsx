import React, { useState, useEffect } from 'react';
import { Briefcase, TrendingUp, DollarSign, Users, Calendar, MapPin, ChevronRight, Plus, Filter, RefreshCw, Clock, CheckCircle, AlertCircle, BarChart2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { ExportBar } from '../ExportBar';

const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

interface Project {
  id: string;
  name: string;
  developer: string;
  type: string;
  capacity_mw: number;
  status: string;
  investment_required: number;
  investment_raised: number;
  location: string;
  cod_date: string;
}

export function Pipeline() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => { fetchPipelineData(); }, []);

  const fetchPipelineData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/pipeline/projects').catch(() => ({ data: { success: true, data: getDefaultProjects() } }));
      setProjects(res.data?.data || getDefaultProjects());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={5} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchPipelineData} /></div>;

  const filteredProjects = projects.filter(p => {
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchesType = typeFilter === 'all' || p.type === typeFilter;
    return matchesStatus && matchesType;
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'development': 'bg-blue-100 text-blue-700',
      'financing': 'bg-yellow-100 text-yellow-700',
      'construction': 'bg-orange-100 text-orange-700',
      'operational': 'bg-green-100 text-green-700',
      'completed': 'bg-gray-100 text-gray-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'solar': return <span className="text-yellow-500">☀</span>;
      case 'wind': return <span className="text-blue-500">🌬</span>;
      case 'storage': return <span className="text-purple-500">⚡</span>;
      default: return <span className="text-green-500">⚡</span>;
    }
  };

  const totalValue = filteredProjects.reduce((sum, p) => sum + p.investment_required, 0);
  const totalRaised = filteredProjects.reduce((sum, p) => sum + p.investment_raised, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project Pipeline</h1>
          <p className="text-ionex-text-mute">IPP projects seeking investment</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchPipelineData} className="p-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light">
            <Plus className="w-4 h-4" /> Add Project
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <p className="text-ionex-text-mute text-sm mb-1">Total Projects</p>
          <p className="text-2xl font-bold">{filteredProjects.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <p className="text-ionex-text-mute text-sm mb-1">Total Capacity</p>
          <p className="text-2xl font-bold">{filteredProjects.reduce((s, p) => s + p.capacity_mw, 0).toLocaleString()} MW</p>
        </div>
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <p className="text-ionex-text-mute text-sm mb-1">Investment Required</p>
          <p className="text-2xl font-bold">{formatZAR(totalValue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <p className="text-ionex-text-mute text-sm mb-1">Capital Raised</p>
          <p className="text-2xl font-bold text-green-600">{formatZAR(totalRaised)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ionex-text-mute">Status:</span>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-ionex-border-200 rounded-lg text-sm">
            <option value="all">All</option>
            <option value="development">Development</option>
            <option value="financing">Financing</option>
            <option value="construction">Construction</option>
            <option value="operational">Operational</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ionex-text-mute">Type:</span>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-1.5 border border-ionex-border-200 rounded-lg text-sm">
            <option value="all">All Types</option>
            <option value="solar">Solar</option>
            <option value="wind">Wind</option>
            <option value="storage">Storage</option>
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setView('list')} className={`px-3 py-1.5 rounded-lg ${view === 'list' ? 'bg-ionex-brand text-white' : 'border border-ionex-border-200'}`}>
            List
          </button>
          <button onClick={() => setView('grid')} className={`px-3 py-1.5 rounded-lg ${view === 'grid' ? 'bg-ionex-brand text-white' : 'border border-ionex-border-200'}`}>
            Grid
          </button>
        </div>
      </div>

      {/* Projects List */}
      {filteredProjects.length === 0 ? (
        <EmptyState icon={<Briefcase className="w-8 h-8" />} title="No projects found" description="Try adjusting your filters" />
      ) : view === 'list' ? (
        <div className="bg-white rounded-xl border border-ionex-border-100 overflow-hidden">
          <ExportBar data={filteredProjects} filename="pipeline_projects" />
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-ionex-border-100">
                <th className="text-left py-3 px-4 font-semibold">Project</th>
                <th className="text-left py-3 px-4 font-semibold">Type</th>
                <th className="text-right py-3 px-4 font-semibold">Capacity</th>
                <th className="text-right py-3 px-4 font-semibold">Investment</th>
                <th className="text-right py-3 px-4 font-semibold">Raised</th>
                <th className="text-center py-3 px-4 font-semibold">Status</th>
                <th className="text-left py-3 px-4 font-semibold">COD Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map(project => (
                <tr key={project.id} className="border-b border-ionex-border-50 hover:bg-gray-50 transition-colors cursor-pointer">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center text-lg">
                        {getTypeIcon(project.type)}
                      </div>
                      <div>
                        <p className="font-medium">{project.name}</p>
                        <p className="text-xs text-ionex-text-mute flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {project.location}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 capitalize">{project.type}</td>
                  <td className="py-4 px-4 text-right font-medium">{project.capacity_mw} MW</td>
                  <td className="py-4 px-4 text-right">{formatZAR(project.investment_required)}</td>
                  <td className="py-4 px-4 text-right">
                    <div>
                      <span className="text-green-600 font-medium">{formatZAR(project.investment_raised)}</span>
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1 ml-auto">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${(project.investment_raised / project.investment_required) * 100}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(project.status)}`}>
                      {project.status}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-ionex-text-mute">{project.cod_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map(project => (
            <ProjectCard key={project.id} project={project} getStatusColor={getStatusColor} getTypeIcon={getTypeIcon} />
          ))}
        </div>
      )}

      {/* Pipeline Funnel */}
      <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
        <h2 className="text-lg font-semibold mb-4">Pipeline Funnel</h2>
        <div className="flex items-center gap-4">
          {['development', 'financing', 'construction', 'operational'].map((stage, i) => {
            const count = filteredProjects.filter(p => p.status === stage).length;
            const width = 25 - (i * 5);
            return (
              <div key={stage} className="flex-1 text-center">
                <div className="h-16 bg-ionex-brand/10 rounded-t-lg flex items-center justify-center">
                  <span className="text-2xl font-bold text-ionex-brand">{count}</span>
                </div>
                <div className="h-2 bg-ionex-brand rounded-b-lg" style={{ width: `${width}%`, margin: '0 auto' }} />
                <p className="text-sm text-ionex-text-mute mt-2 capitalize">{stage}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project, getStatusColor, getTypeIcon }: {
  project: Project;
  getStatusColor: (status: string) => string;
  getTypeIcon: (type: string) => React.ReactNode;
}) {
  const progress = (project.investment_raised / project.investment_required) * 100;

  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center text-xl">
            {getTypeIcon(project.type)}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{project.name}</h3>
            <p className="text-xs text-ionex-text-mute">{project.developer}</p>
          </div>
        </div>
        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(project.status)}`}>
          {project.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-ionex-text-mute">Capacity</p>
          <p className="font-semibold">{project.capacity_mw} MW</p>
        </div>
        <div>
          <p className="text-xs text-ionex-text-mute">Location</p>
          <p className="font-semibold">{project.location}</p>
        </div>
        <div>
          <p className="text-xs text-ionex-text-mute">COD Date</p>
          <p className="font-semibold">{project.cod_date}</p>
        </div>
        <div>
          <p className="text-xs text-ionex-text-mute">Investment</p>
          <p className="font-semibold">{formatZAR(project.investment_required)}</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-ionex-text-mute">Progress</span>
          <span className="font-medium text-green-600">{progress.toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-ionex-brand to-ionex-accent" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-ionex-text-mute mt-1">{formatZAR(project.investment_raised)} raised</p>
      </div>

      <button className="w-full py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light transition-colors">
        View Project
      </button>
    </div>
  );
}

function getDefaultProjects(): Project[] {
  return [
    { id: '1', name: 'SolarField Northern Cape', developer: 'SolarCorp SA', type: 'solar', capacity_mw: 50, status: 'financing', investment_required: 45000000, investment_raised: 32000000, location: 'Northern Cape', cod_date: '2025-06' },
    { id: '2', name: 'WindPark Western Cape', developer: 'WindCo', type: 'wind', capacity_mw: 120, status: 'construction', investment_required: 120000000, investment_raised: 95000000, location: 'Western Cape', cod_date: '2024-12' },
    { id: '3', name: 'Battery Storage Gauteng', developer: 'StorageTech', type: 'storage', capacity_mw: 20, status: 'development', investment_required: 25000000, investment_raised: 5000000, location: 'Gauteng', cod_date: '2026-03' },
    { id: '4', name: 'Solar Farm Limpopo', developer: 'GreenEnergy', type: 'solar', capacity_mw: 75, status: 'financing', investment_required: 68000000, investment_raised: 40000000, location: 'Limpopo', cod_date: '2025-09' },
    { id: '5', name: 'Wind Farm Eastern Cape', developer: 'CoastalWind', type: 'wind', capacity_mw: 80, status: 'operational', investment_required: 85000000, investment_raised: 85000000, location: 'Eastern Cape', cod_date: '2024-03' },
    { id: '6', name: 'Hybrid Solar-Wind', developer: 'HybridPower', type: 'solar', capacity_mw: 100, status: 'development', investment_required: 95000000, investment_raised: 15000000, location: 'Free State', cod_date: '2026-06' },
  ];
}