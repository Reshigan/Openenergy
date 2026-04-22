import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, FileText, Clock, CheckCircle, XCircle, Eye, Edit } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { Skeleton, TableSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { ErrorBanner } from '../ErrorBanner';
import { ExportBar } from '../ExportBar';
import { EntityLink } from '../EntityLink';
import { useEscapeKey } from '../../hooks/useEscapeKey';

const phases = ['draft', 'loi', 'term_sheet', 'hoa', 'draft_agreement', 'legal_review', 'statutory_check', 'execution', 'active', 'amended', 'terminated', 'expired'];

const phaseColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  loi: 'bg-blue-100 text-blue-700',
  term_sheet: 'bg-indigo-100 text-indigo-700',
  hoa: 'bg-purple-100 text-purple-700',
  draft_agreement: 'bg-violet-100 text-violet-700',
  legal_review: 'bg-orange-100 text-orange-700',
  statutory_check: 'bg-amber-100 text-amber-700',
  execution: 'bg-teal-100 text-teal-700',
  active: 'bg-green-100 text-green-700',
  amended: 'bg-cyan-100 text-cyan-700',
  terminated: 'bg-red-100 text-red-700',
  expired: 'bg-gray-200 text-ionex-text-mute',
};

export function Contracts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => { fetchContracts(); }, []);

  const fetchContracts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/contracts');
      setContracts(res.data?.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredContracts = contracts.filter(c => {
    const matchesSearch = !search || c.title?.toLowerCase().includes(search.toLowerCase());
    const matchesPhase = !phaseFilter || c.phase === phaseFilter;
    return matchesSearch && matchesPhase;
  });

  if (loading) return <div className="p-6"><TableSkeleton columns={5} rows={5} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchContracts} /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
          <p className="text-ionex-text-mute">Manage your contract lifecycle</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-dark">
          <Plus className="w-4 h-4" /> New Contract
        </button>
      </div>

      <div className="bg-white rounded-xl border border-ionex-border-100">
        <div className="p-4 border-b border-ionex-border-100 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search contracts..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-ionex-border-200 rounded-lg text-sm" />
          </div>
          <select value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)} className="px-3 py-2 border border-ionex-border-200 rounded-lg text-sm">
            <option value="">All Phases</option>
            {phases.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {filteredContracts.length === 0 ? (
          <EmptyState icon={<FileText className="w-8 h-8" />} title="No contracts yet" description="Create your first contract to get started" action={{ label: 'Create Contract', onClick: () => setShowCreateModal(true) }} />
        ) : (
          <>
            <ExportBar data={filteredContracts} filename="contracts" columns={[{ key: 'title', header: 'Title' }, { key: 'phase', header: 'Phase' }, { key: 'document_type', header: 'Type' }]} />
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-ionex-border-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ionex-text-mute">Title</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ionex-text-mute">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ionex-text-mute">Phase</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ionex-text-mute">Counterparty</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ionex-text-mute">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredContracts.map(contract => (
                  <tr key={contract.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/contracts/${contract.id}`)}>
                    <td className="px-4 py-3"><span className="font-medium">{contract.title}</span><br /><span className="text-xs text-gray-400">{contract.id}</span></td>
                    <td className="px-4 py-3 text-sm">{contract.document_type?.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 text-xs font-medium rounded-full ${phaseColors[contract.phase] || phaseColors.draft}`}>{contract.phase?.replace(/_/g, ' ')}</span></td>
                    <td className="px-4 py-3"><EntityLink id={contract.counterparty_id} type="participant" /></td>
                    <td className="px-4 py-3"><button onClick={e => { e.stopPropagation(); navigate(`/contracts/${contract.id}`); }} className="p-1.5 hover:bg-gray-100 rounded"><Eye className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {showCreateModal && <CreateContractModal onClose={() => setShowCreateModal(false)} onCreated={fetchContracts} />}
    </div>
  );
}

type Template = {
  id: string;
  code: string;
  name: string;
  category: string;
  document_type: string;
  description: string;
  jurisdiction: string;
  governing_law: string;
  sa_law_references: string;
};

function CreateContractModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [formData, setFormData] = useState({ title: '', document_type: 'ppa_wheeling', contract_type: 'ppa_wheeling', phase: 'draft', counterparty_id: '', project_id: '', template_code: '' });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/contracts/templates')
      .then((res) => setTemplates((res.data?.data as Template[]) || []))
      .catch(() => setTemplates([]));
  }, []);

  const selectTemplate = (code: string) => {
    const tpl = templates.find((t) => t.code === code);
    if (!tpl) {
      setFormData((f) => ({ ...f, template_code: '' }));
      return;
    }
    setFormData((f) => ({
      ...f,
      template_code: code,
      document_type: tpl.document_type,
      contract_type: tpl.document_type,
      title: f.title || tpl.name,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/contracts', {
        title: formData.title,
        document_type: formData.document_type,
        contract_type: formData.contract_type,
        phase: formData.phase,
        counterparty_id: formData.counterparty_id,
        project_id: formData.project_id,
        commercial_terms: formData.template_code ? { template_code: formData.template_code } : undefined,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedTpl = templates.find((t) => t.code === formData.template_code);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-ionex-border-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-lg font-semibold">Create Contract</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><XCircle className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              SA-law template <span className="text-xs text-gray-400">(optional — pre-fills type)</span>
            </label>
            <select value={formData.template_code} onChange={(e) => selectTemplate(e.target.value)} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg">
              <option value="">— no template (blank draft) —</option>
              {templates.map((t) => (
                <option key={t.code} value={t.code}>
                  [{t.category}] {t.name}
                </option>
              ))}
            </select>
            {selectedTpl && (
              <div className="mt-2 text-xs text-gray-600 bg-gray-50 border border-ionex-border-100 rounded-md p-2">
                <div><strong>Governing law:</strong> {selectedTpl.governing_law} · {selectedTpl.jurisdiction}</div>
                <div><strong>SA references:</strong> {selectedTpl.sa_law_references}</div>
                {selectedTpl.description && <div className="mt-1">{selectedTpl.description}</div>}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" placeholder="Contract title" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select value={formData.document_type} onChange={e => setFormData({ ...formData, document_type: e.target.value, contract_type: e.target.value })} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg">
              <option value="ppa_wheeling">PPA Wheeling</option>
              <option value="ppa_btm">PPA BTM</option>
              <option value="direct_supply">Direct Supply</option>
              <option value="loi">LOI</option>
              <option value="term_sheet">Term Sheet</option>
              <option value="hoa">Heads of Agreement</option>
              <option value="nda">NDA</option>
              <option value="epc">EPC</option>
              <option value="om">O&amp;M</option>
              <option value="erpa">ERPA / Carbon Sale</option>
              <option value="intercreditor">Intercreditor</option>
              <option value="facility">Facility Agreement</option>
              <option value="security">Security Agreement</option>
              <option value="services">Services</option>
              <option value="grid_connection">Grid Connection</option>
              <option value="use_of_system">Use-of-System</option>
              <option value="net_metering">Net-Metering</option>
              <option value="jv">Joint Venture</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Counterparty ID</label>
            <input type="text" required value={formData.counterparty_id} onChange={e => setFormData({ ...formData, counterparty_id: e.target.value })} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" placeholder="e.g. demo_offtaker_001" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-ionex-border-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-dark disabled:opacity-50">{loading ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
