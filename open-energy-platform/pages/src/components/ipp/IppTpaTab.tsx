import { useState } from 'react';
import { api } from '../../lib/api';

interface Tpa {
  id: string;
  project_id: string;
  wheeling_capacity_mw: number;
  capacity_tier: string;
  tpa_category?: string;
  network_owner?: string;
  offtaker_reference?: string;
  agreement_reference?: string;
  description?: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  tpa_signed_at?: string;
  wheeling_activated_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  active_count: number;
  negotiating_count: number;
  rejected_count: number;
  breached_count: number;
  active_mw: number;
}

const STATUS_COLORS: Record<string, string> = {
  tpa_application_submitted:  'bg-[#eef2f7] text-[#6b7685]',
  network_owner_review:       'bg-blue-100 text-blue-700',
  technical_assessment:       'bg-indigo-100 text-indigo-700',
  commercial_terms_proposed:  'bg-purple-100 text-purple-700',
  negotiation_in_progress:    'bg-yellow-100 text-yellow-800',
  terms_agreed:               'bg-lime-100 text-lime-800',
  tpa_agreement_signed:       'bg-cyan-100 text-cyan-700',
  wheeling_active:            'bg-green-200 text-green-900',
  application_rejected:       'bg-red-100 text-red-800',
  appeal_filed:               'bg-orange-100 text-orange-800',
  appeal_determined:          'bg-orange-200 text-orange-900',
  withdrawn:                  'bg-[#eef2f7] text-[#9aa5b4]',
};

const TIER_COLORS: Record<string, string> = {
  minor:        'bg-[#eef2f7] text-[#3d4756]',
  moderate:     'bg-blue-100 text-blue-700',
  significant:  'bg-yellow-100 text-yellow-800',
  major:        'bg-orange-100 text-orange-800',
  material:     'bg-red-100 text-red-800',
};

const CATEGORY_LABELS: Record<string, string> = {
  eskom_transmission:  'Eskom Transmission',
  eskom_distribution:  'Eskom Distribution',
  municipality:        'Municipality',
  private_network:     'Private Network',
};

const ACTION_MAP: Record<string, { label: string; action: string; danger?: boolean; tag?: string }[]> = {
  tpa_application_submitted: [{ label: 'Network Owner Commences Review', action: 'commence_review' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  network_owner_review:      [{ label: 'Commence Technical Assessment', action: 'commence_technical_assessment' }, { label: 'Reject Application', action: 'reject_application', danger: true, tag: 'REGULATOR if major+' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  technical_assessment:      [{ label: 'Propose Commercial Terms', action: 'propose_commercial_terms' }, { label: 'Reject Application', action: 'reject_application', danger: true, tag: 'REGULATOR if major+' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  commercial_terms_proposed: [{ label: 'Commence Negotiation', action: 'commence_negotiation' }, { label: 'Reject Application', action: 'reject_application', danger: true, tag: 'REGULATOR if major+' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  negotiation_in_progress:   [{ label: 'Agree Terms', action: 'agree_terms' }, { label: 'Reject Application', action: 'reject_application', danger: true, tag: 'REGULATOR if major+' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  terms_agreed:              [{ label: 'Sign TPA Agreement', action: 'sign_tpa_agreement', tag: 'REGULATOR EVERY TIER' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  tpa_agreement_signed:      [{ label: 'Activate Wheeling', action: 'activate_wheeling' }],
  application_rejected:      [{ label: 'File Appeal to NERSA', action: 'file_appeal', danger: true }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  appeal_filed:              [{ label: 'Record Appeal Determination', action: 'determine_appeal' }],
  appeal_determined:         [{ label: 'Re-submit Application', action: 'commence_review' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
};

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function IppTpaTab() {
  const [items, setItems] = useState<Tpa[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [selected, setSelected] = useState<Tpa | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ wheeling_capacity_mw: '', tpa_category: '', network_owner: '', offtaker_reference: '', description: '' });

  async function load(status?: string, tier?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (tier) params.set('tier', tier);
    const res = await api.get(`/api/ipp-tpa?${params}`);
    setItems(res.data?.data?.items ?? []);
    setKpis(res.data?.data?.kpis ?? null);
    setLoaded(true);
    setLoading(false);
  }

  async function doAction(id: string, action: string) {
    setActionPending(true);
    await api.put(`/api/ipp-tpa/${id}/action`, { action });
    setActionPending(false);
    setSelected(null);
    load(filterStatus, filterTier);
  }

  async function createRecord() {
    await api.post('/api/ipp-tpa', {
      project_id: 'proj_nxt_solar_001',
      wheeling_capacity_mw: parseFloat(form.wheeling_capacity_mw),
      tpa_category: form.tpa_category || undefined,
      network_owner: form.network_owner || undefined,
      offtaker_reference: form.offtaker_reference || undefined,
      description: form.description || undefined,
    });
    setShowCreate(false);
    setForm({ wheeling_capacity_mw: '', tpa_category: '', network_owner: '', offtaker_reference: '', description: '' });
    load(filterStatus, filterTier);
  }

  if (!loaded) return (
    <div className="p-6">
      <button type="button" onClick={() => load()} className="px-4 py-2 bg-[#c2873a] text-white rounded hover:bg-[#a3702f] text-sm">Load TPA Agreements</button>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Applications', value: kpis.total },
            { label: 'Negotiating', value: kpis.negotiating_count, alert: kpis.negotiating_count > 0 },
            { label: 'Active Wheeling', value: kpis.active_count, good: kpis.active_count > 0 },
            { label: 'Active MW', value: `${kpis.active_mw?.toLocaleString() ?? 0} MW`, good: (kpis.active_mw ?? 0) > 0 },
          ].map(k => (
            <div key={k.label} className={`rounded-lg p-3 border ${k.alert ? 'border-orange-300 bg-orange-50' : k.good ? 'border-green-200 bg-green-50' : 'border-[#dde4ec] bg-white'}`}>
              <div className="text-xs text-[#6b7685]">{k.label}</div>
              <div className={`text-xl font-bold ${k.alert ? 'text-orange-700' : k.good ? 'text-green-700' : 'text-[#0f1c2e]'}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => { setFilterStatus(''); load('', filterTier); }} className={`px-3 py-1 rounded text-xs border ${!filterStatus ? 'bg-[#1e2a38] text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>All</button>
        {['tpa_application_submitted','negotiation_in_progress','terms_agreed','wheeling_active','application_rejected'].map(s => (
          <button type="button" key={s} onClick={() => { setFilterStatus(s); load(s, filterTier); }} className={`px-3 py-1 rounded text-xs border ${filterStatus === s ? 'bg-[#1e2a38] text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>{s.replace(/_/g, ' ')}</button>
        ))}
        <span className="ml-1 text-[#9aa5b4]">|</span>
        {['minor','moderate','significant','major','material'].map(t => (
          <button type="button" key={t} onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt); }} className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'bg-indigo-700 text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>{t}</button>
        ))}
        <button type="button" onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]">+ New TPA</button>
        <button type="button" onClick={() => load(filterStatus, filterTier)} className="px-3 py-1 bg-[#eef2f7] text-[#2d3748] rounded text-xs border">Refresh</button>
      </div>

      {loading ? <div className="text-sm text-[#9aa5b4] py-4">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[#6b7685]">
                <th className="pb-2 pr-4">Description</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Cap (MW)</th>
                <th className="pb-2 pr-4">Network</th>
                <th className="pb-2 pr-4">Network Owner</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Signed</th>
                <th className="pb-2 pr-4">SLA</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(tpa => (
                <tr key={tpa.id} className="border-b hover:bg-[#eef2f7] cursor-pointer" onClick={() => setSelected(tpa)}>
                  <td className="py-2 pr-4 text-xs max-w-[180px] truncate">{tpa.description?.slice(0, 60) ?? tpa.project_id}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[tpa.capacity_tier]}`}>{tpa.capacity_tier}</span></td>
                  <td className="py-2 pr-4 text-xs font-medium">{tpa.wheeling_capacity_mw}</td>
                  <td className="py-2 pr-4 text-xs text-[#6b7685]">{tpa.tpa_category ? CATEGORY_LABELS[tpa.tpa_category] ?? tpa.tpa_category : '—'}</td>
                  <td className="py-2 pr-4 text-xs text-[#6b7685] max-w-[120px] truncate">{tpa.network_owner ?? '—'}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[tpa.chain_status]}`}>{tpa.chain_status.replace(/_/g, ' ')}</span></td>
                  <td className="py-2 pr-4 text-xs text-green-700">{fmtDate(tpa.tpa_signed_at)}</td>
                  <td className={`py-2 pr-4 text-xs ${tpa.sla_breached ? 'text-red-600 font-semibold' : 'text-[#6b7685]'}`}>
                    {tpa.sla_breached ? '⚠ BREACHED' : fmtDate(tpa.sla_due_at)}
                  </td>
                  <td className="py-2 text-xs text-indigo-600">View →</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-[#9aa5b4] text-sm">No TPA agreement records found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold">TPA Wheeling Agreement</h2>
                <div className="text-xs text-[#6b7685] mt-1">{selected.capacity_tier} · {selected.wheeling_capacity_mw} MW</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-[#9aa5b4] hover:text-[#3d4756]">✕</button>
            </div>
            {selected.description && <div className="text-sm text-[#3d4756] bg-[#f8fafc] rounded p-3 mb-4">{selected.description}</div>}
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-[#6b7685]">Status:</span> <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status]}`}>{selected.chain_status.replace(/_/g, ' ')}</span></div>
              <div><span className="text-[#6b7685]">Network:</span> {selected.tpa_category ? CATEGORY_LABELS[selected.tpa_category] ?? selected.tpa_category : '—'}</div>
              {selected.network_owner && <div className="col-span-2"><span className="text-[#6b7685]">Network Owner:</span> {selected.network_owner}</div>}
              {selected.offtaker_reference && <div><span className="text-[#6b7685]">Off-taker Ref:</span> <span className="font-mono text-xs">{selected.offtaker_reference}</span></div>}
              {selected.agreement_reference && <div><span className="text-[#6b7685]">Agreement Ref:</span> <span className="font-mono text-green-700">{selected.agreement_reference}</span></div>}
              {selected.tpa_signed_at && <div><span className="text-[#6b7685]">Signed:</span> <span className="text-green-700">{fmtDate(selected.tpa_signed_at)}</span></div>}
              {selected.wheeling_activated_at && <div><span className="text-[#6b7685]">Activated:</span> <span className="text-green-700">{fmtDate(selected.wheeling_activated_at)}</span></div>}
            </div>
            {ACTION_MAP[selected.chain_status] && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#6b7685] uppercase mb-1">Actions</div>
                {ACTION_MAP[selected.chain_status].map(a => (
                  <button type="button" key={a.action} disabled={actionPending}
                    onClick={() => doAction(selected.id, a.action)}
                    className={`w-full text-left px-3 py-2 rounded border text-sm ${a.danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-[#dde4ec] text-[#2d3748] hover:bg-indigo-50 hover:border-indigo-300'}`}>
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
            <h3 className="text-lg font-bold mb-4">New TPA Application</h3>
            <div className="space-y-3">
              <input placeholder="Wheeling capacity (MW) *" type="number" value={form.wheeling_capacity_mw} onChange={e => setForm(f => ({ ...f, wheeling_capacity_mw: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <select value={form.tpa_category} onChange={e => setForm(f => ({ ...f, tpa_category: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm text-[#2d3748]">
                <option value="">Network type (optional)</option>
                <option value="eskom_transmission">Eskom Transmission</option>
                <option value="eskom_distribution">Eskom Distribution</option>
                <option value="municipality">Municipality</option>
                <option value="private_network">Private Network</option>
              </select>
              <input placeholder="Network owner" value={form.network_owner} onChange={e => setForm(f => ({ ...f, network_owner: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Off-taker reference" value={form.offtaker_reference} onChange={e => setForm(f => ({ ...f, offtaker_reference: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={createRecord} disabled={!form.wheeling_capacity_mw} className="px-4 py-2 bg-[#c2873a] text-white rounded text-sm hover:bg-[#a3702f] disabled:opacity-50">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-[#eef2f7] text-[#2d3748] rounded text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
