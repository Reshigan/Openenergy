import { useState } from 'react';
import { api } from '../../lib/api';

interface LandRegister {
  id: string;
  project_id: string;
  area_ha: number;
  area_tier: string;
  erf_count?: number;
  servitude_count?: number;
  surveyor_firm?: string;
  deeds_reference?: string;
  description?: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  deeds_registered_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  registered_count: number;
  defective_count: number;
  rejected_count: number;
  breached_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  survey_commissioned:   'bg-gray-100 text-gray-500',
  field_survey:          'bg-blue-100 text-blue-700',
  diagram_drafted:       'bg-indigo-100 text-indigo-700',
  sg_approved:           'bg-indigo-200 text-indigo-900',
  servitude_notarised:   'bg-lime-100 text-lime-800',
  deeds_lodged:          'bg-yellow-100 text-yellow-800',
  deeds_registered:      'bg-green-200 text-green-900',
  defective_title:       'bg-orange-100 text-orange-800',
  survey_rejected:       'bg-red-100 text-red-800',
  abandoned:             'bg-gray-100 text-gray-400',
  superseded:            'bg-gray-200 text-gray-500',
};

const TIER_COLORS: Record<string, string> = {
  minor:        'bg-gray-100 text-gray-600',
  moderate:     'bg-blue-100 text-blue-700',
  significant:  'bg-yellow-100 text-yellow-800',
  major:        'bg-orange-100 text-orange-800',
  material:     'bg-red-100 text-red-800',
};

const ACTION_MAP: Record<string, { label: string; action: string; danger?: boolean; tag?: string }[]> = {
  survey_commissioned:  [{ label: 'Commence Field Survey', action: 'commence_field_survey' }, { label: 'Abandon', action: 'abandon', danger: true }],
  field_survey:         [{ label: 'Submit SG Diagram', action: 'submit_diagram' }, { label: 'Reject Survey', action: 'reject_survey', danger: true, tag: 'REGULATOR if major+' }],
  diagram_drafted:      [{ label: 'SG Approve Diagram', action: 'sg_approve' }, { label: 'Reject Survey', action: 'reject_survey', danger: true, tag: 'REGULATOR if major+' }],
  sg_approved:          [{ label: 'Notarise Servitude', action: 'notarise_servitude' }],
  servitude_notarised:  [{ label: 'Lodge at Deeds Office', action: 'lodge_deeds', tag: 'REGULATOR EVERY TIER' }],
  deeds_lodged:         [{ label: 'Confirm Registration', action: 'confirm_registration' }, { label: 'Raise Defective Title', action: 'raise_defective_title', danger: true }],
  defective_title:      [{ label: 'Re-lodge (Defect Resolved)', action: 'resolve_defective_title', tag: 'REGULATOR EVERY TIER' }, { label: 'Abandon', action: 'abandon', danger: true }],
  survey_rejected:      [{ label: 'Re-commission Survey', action: 'commence_field_survey' }, { label: 'Abandon', action: 'abandon', danger: true }],
};

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function IppLandRegisterTab() {
  const [items, setItems] = useState<LandRegister[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [selected, setSelected] = useState<LandRegister | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ area_ha: '', erf_count: '', servitude_count: '', surveyor_firm: '', description: '' });

  async function load(status?: string, tier?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (tier) params.set('tier', tier);
    const res = await api.get(`/api/ipp-land-register?${params}`);
    setItems(res.data?.data?.items ?? []);
    setKpis(res.data?.data?.kpis ?? null);
    setLoaded(true);
    setLoading(false);
  }

  async function doAction(id: string, action: string) {
    setActionPending(true);
    await api.put(`/api/ipp-land-register/${id}/action`, { action });
    setActionPending(false);
    setSelected(null);
    load(filterStatus, filterTier);
  }

  async function createRecord() {
    await api.post('/api/ipp-land-register', {
      project_id: 'proj_nxt_solar_001',
      area_ha: parseFloat(form.area_ha),
      erf_count: form.erf_count ? parseInt(form.erf_count) : undefined,
      servitude_count: form.servitude_count ? parseInt(form.servitude_count) : undefined,
      surveyor_firm: form.surveyor_firm || undefined,
      description: form.description || undefined,
    });
    setShowCreate(false);
    setForm({ area_ha: '', erf_count: '', servitude_count: '', surveyor_firm: '', description: '' });
    load(filterStatus, filterTier);
  }

  if (!loaded) return (
    <div className="p-6">
      <button onClick={() => load()} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm">Load Land Register</button>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Surveys', value: kpis.total },
            { label: 'In Progress', value: kpis.open_count },
            { label: 'Defective Title', value: kpis.defective_count, alert: kpis.defective_count > 0 },
            { label: 'Registered', value: kpis.registered_count, good: kpis.registered_count > 0 },
          ].map(k => (
            <div key={k.label} className={`rounded-lg p-3 border ${k.alert ? 'border-orange-300 bg-orange-50' : k.good ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
              <div className="text-xs text-gray-500">{k.label}</div>
              <div className={`text-xl font-bold ${k.alert ? 'text-orange-700' : k.good ? 'text-green-700' : 'text-gray-900'}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => { setFilterStatus(''); load('', filterTier); }} className={`px-3 py-1 rounded text-xs border ${!filterStatus ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border-gray-300'}`}>All</button>
        {['survey_commissioned','field_survey','sg_approved','deeds_lodged','deeds_registered','defective_title'].map(s => (
          <button key={s} onClick={() => { setFilterStatus(s); load(s, filterTier); }} className={`px-3 py-1 rounded text-xs border ${filterStatus === s ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border-gray-300'}`}>{s.replace(/_/g, ' ')}</button>
        ))}
        <span className="ml-1 text-gray-300">|</span>
        {['minor','moderate','significant','major','material'].map(t => (
          <button key={t} onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt); }} className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'bg-indigo-700 text-white' : 'bg-white text-gray-600 border-gray-300'}`}>{t}</button>
        ))}
        <button onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">+ New Survey</button>
        <button onClick={() => load(filterStatus, filterTier)} className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs border">Refresh</button>
      </div>

      {loading ? <div className="text-sm text-gray-400 py-4">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2 pr-4">Description</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Area (ha)</th>
                <th className="pb-2 pr-4">Erven</th>
                <th className="pb-2 pr-4">Servitudes</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Deeds Ref</th>
                <th className="pb-2 pr-4">SLA</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(lr => (
                <tr key={lr.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(lr)}>
                  <td className="py-2 pr-4 text-xs max-w-[180px] truncate">{lr.description?.slice(0, 60) ?? lr.project_id}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[lr.area_tier]}`}>{lr.area_tier}</span></td>
                  <td className="py-2 pr-4 text-xs font-medium">{lr.area_ha.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500">{lr.erf_count ?? '—'}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500">{lr.servitude_count ?? '—'}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[lr.chain_status]}`}>{lr.chain_status.replace(/_/g, ' ')}</span></td>
                  <td className="py-2 pr-4 text-xs font-mono text-gray-600">{lr.deeds_reference ?? '—'}</td>
                  <td className={`py-2 pr-4 text-xs ${lr.sla_breached ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                    {lr.sla_breached ? '⚠ BREACHED' : fmtDate(lr.sla_due_at)}
                  </td>
                  <td className="py-2 text-xs text-indigo-600">View →</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-gray-400 text-sm">No land register records found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold">Land Register</h2>
                <div className="text-xs text-gray-500 mt-1">{selected.area_tier} · {selected.area_ha} ha</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            {selected.description && <div className="text-sm text-gray-600 bg-gray-50 rounded p-3 mb-4">{selected.description}</div>}
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-gray-500">Status:</span> <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status]}`}>{selected.chain_status.replace(/_/g, ' ')}</span></div>
              <div><span className="text-gray-500">Erven:</span> {selected.erf_count ?? '—'}</div>
              <div><span className="text-gray-500">Servitudes:</span> {selected.servitude_count ?? '—'}</div>
              <div><span className="text-gray-500">Surveyor:</span> {selected.surveyor_firm ?? '—'}</div>
              {selected.deeds_reference && <div><span className="text-gray-500">Deeds Ref:</span> <span className="font-mono text-green-700">{selected.deeds_reference}</span></div>}
              {selected.deeds_registered_at && <div><span className="text-gray-500">Registered:</span> <span className="text-green-700">{fmtDate(selected.deeds_registered_at)}</span></div>}
            </div>
            {ACTION_MAP[selected.chain_status] && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Actions</div>
                {ACTION_MAP[selected.chain_status].map(a => (
                  <button key={a.action} disabled={actionPending}
                    onClick={() => doAction(selected.id, a.action)}
                    className={`w-full text-left px-3 py-2 rounded border text-sm ${a.danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-gray-200 text-gray-700 hover:bg-indigo-50 hover:border-indigo-300'}`}>
                    {a.label}
                    {a.tag && <span className={`ml-2 text-xs px-1 rounded ${a.tag.includes('REGULATOR') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{a.tag}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">New As-Built Survey</h3>
            <div className="space-y-3">
              <input placeholder="Site area (ha) *" type="number" value={form.area_ha} onChange={e => setForm(f => ({ ...f, area_ha: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Erf count" type="number" value={form.erf_count} onChange={e => setForm(f => ({ ...f, erf_count: e.target.value }))} className="border rounded px-3 py-2 text-sm" />
                <input placeholder="Servitude count" type="number" value={form.servitude_count} onChange={e => setForm(f => ({ ...f, servitude_count: e.target.value }))} className="border rounded px-3 py-2 text-sm" />
              </div>
              <input placeholder="Surveyor firm" value={form.surveyor_firm} onChange={e => setForm(f => ({ ...f, surveyor_firm: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={createRecord} disabled={!form.area_ha} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50">Create</button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
