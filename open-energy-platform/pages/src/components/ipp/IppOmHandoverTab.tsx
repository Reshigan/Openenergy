import { useState } from 'react';
import { api } from '../../lib/api';

interface OmHandover {
  id: string;
  project_id: string;
  capacity_mw: number;
  capacity_tier: string;
  category: string;
  title: string;
  document_count?: number;
  deficiency_count?: number;
  conditions?: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  accepted_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  accepted_count: number;
  conditional_count: number;
  deficiencies_count: number;
  rejected_count: number;
  breached_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  compilation:            'bg-[#eef2f7] text-[#6b7685]',
  internal_review:        'bg-[oklch(0.94_0.006_250)] text-[oklch(0.17_0.010_250)]',
  submitted_to_om:        'bg-[oklch(0.94_0.006_250)] text-[oklch(0.17_0.010_250)]',
  om_review:              'bg-[oklch(0.87_0.010_250)] text-[oklch(0.17_0.010_250)]',
  deficiencies_raised:    'bg-orange-100 text-orange-800',
  deficiencies_resolved:  'bg-lime-100 text-lime-800',
  accepted:               'bg-green-200 text-green-900',
  conditional_acceptance: 'bg-yellow-100 text-yellow-800',
  rejected:               'bg-red-200 text-red-900',
  superseded:             'bg-[#e8ecf0] text-[#3d4756]',
  archived:               'bg-[#eef2f7] text-[#9aa5b4]',
  withdrawn:              'bg-[#eef2f7] text-[#9aa5b4]',
};

const TIER_COLORS: Record<string, string> = {
  minor:        'bg-[#eef2f7] text-[#3d4756]',
  moderate:     'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  significant:  'bg-yellow-100 text-yellow-800',
  major:        'bg-orange-100 text-orange-800',
  material:     'bg-red-100 text-red-800',
};

const CATEGORY_LABELS: Record<string, string> = {
  hs_file:       'H&S File',
  om_manual:     'O&M Manual',
  as_built:      'As-Builts',
  equipment_data:'Equipment Data',
  warranties:    'Warranties',
  commissioning: 'Commissioning',
  training:      'Training',
  full_pack:     'Full Pack',
};

const ACTION_MAP: Record<string, { label: string; action: string; danger?: boolean; tag?: string }[]> = {
  compilation:            [{ label: 'Submit for Internal Review', action: 'submit_for_internal_review' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  internal_review:        [{ label: 'Approve Internal — Submit to O&M', action: 'approve_internal' }, { label: 'Return to Compilation', action: 'submit_for_internal_review', danger: true }],
  submitted_to_om:        [{ label: 'Confirm O&M Review Commenced', action: 'submit_to_om' }],
  om_review:              [
    { label: 'Accept Handover', action: 'accept_handover', tag: 'REGULATOR EVERY TIER' },
    { label: 'Conditional Acceptance', action: 'conditionally_accept' },
    { label: 'Raise Deficiencies', action: 'raise_deficiencies', danger: true },
    { label: 'Reject', action: 'reject_handover', danger: true, tag: 'REGULATOR if major+' },
  ],
  deficiencies_raised:    [{ label: 'Mark Deficiencies Resolved', action: 'resolve_deficiencies' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  deficiencies_resolved:  [{ label: 'Re-submit to O&M Review', action: 'submit_to_om' }],
  conditional_acceptance: [
    { label: 'Upgrade to Full Acceptance', action: 'accept_handover', tag: 'REGULATOR EVERY TIER' },
    { label: 'Raise Deficiencies', action: 'raise_deficiencies', danger: true },
  ],
};

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function IppOmHandoverTab() {
  const [items, setItems] = useState<OmHandover[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [selected, setSelected] = useState<OmHandover | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ category: 'full_pack', capacity_mw: '', title: '', document_count: '', description: '' });

  async function load(status?: string, tier?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (tier) params.set('tier', tier);
    const res = await api.get(`/api/ipp-om-handover?${params}`);
    setItems(res.data?.data?.items ?? []);
    setKpis(res.data?.data?.kpis ?? null);
    setLoaded(true);
    setLoading(false);
  }

  async function doAction(id: string, action: string) {
    setActionPending(true);
    await api.put(`/api/ipp-om-handover/${id}/action`, { action });
    setActionPending(false);
    setSelected(null);
    load(filterStatus, filterTier);
  }

  async function createHandover() {
    await api.post('/api/ipp-om-handover', {
      project_id: 'proj_nxt_solar_001',
      capacity_mw: parseFloat(form.capacity_mw),
      category: form.category,
      title: form.title,
      document_count: form.document_count ? parseInt(form.document_count) : undefined,
      description: form.description || undefined,
    });
    setShowCreate(false);
    setForm({ category: 'full_pack', capacity_mw: '', title: '', document_count: '', description: '' });
    load(filterStatus, filterTier);
  }

  if (!loaded) {
    return (
      <div className="p-6">
        <button type="button" onClick={() => load()} className="px-4 py-2 bg-[#c2873a] text-white rounded hover:bg-[#a3702f] text-sm">
          Load O&M Handover Packs
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Packs', value: kpis.total },
            { label: 'In Progress', value: kpis.open_count },
            { label: 'Deficiencies Open', value: kpis.deficiencies_count, alert: kpis.deficiencies_count > 0 },
            { label: 'Accepted', value: kpis.accepted_count, good: kpis.accepted_count > 0 },
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
        {['compilation','om_review','deficiencies_raised','accepted','conditional_acceptance','rejected'].map(s => (
          <button type="button" key={s} onClick={() => { setFilterStatus(s); load(s, filterTier); }} className={`px-3 py-1 rounded text-xs border ${filterStatus === s ? 'bg-[#1e2a38] text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>{s.replace(/_/g, ' ')}</button>
        ))}
        <span className="ml-1 text-[#9aa5b4]">|</span>
        {['minor','moderate','significant','major','material'].map(t => (
          <button type="button" key={t} onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt); }} className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'bg-[#1e2a38] text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>{t}</button>
        ))}
        <button type="button" onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]">+ New Pack</button>
        <button type="button" onClick={() => load(filterStatus, filterTier)} className="px-3 py-1 bg-[#eef2f7] text-[#2d3748] rounded text-xs border">Refresh</button>
      </div>

      {loading ? <div className="text-sm text-[#9aa5b4] py-4">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[#6b7685]">
                <th className="pb-2 pr-4">Title</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">MW</th>
                <th className="pb-2 pr-4">Docs</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(h => (
                <tr key={h.id} className="border-b hover:bg-[#eef2f7] cursor-pointer" onClick={() => setSelected(h)}>
                  <td className="py-2 pr-4 text-xs font-medium max-w-[200px] truncate">{h.title}</td>
                  <td className="py-2 pr-4 text-xs text-[#3d4756]">{CATEGORY_LABELS[h.category] ?? h.category}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[h.capacity_tier]}`}>{h.capacity_tier}</span></td>
                  <td className="py-2 pr-4 text-xs text-[#3d4756]">{h.capacity_mw} MW</td>
                  <td className="py-2 pr-4 text-xs text-[#6b7685]">{h.document_count ?? '—'}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[h.chain_status]}`}>{h.chain_status.replace(/_/g, ' ')}</span></td>
                  <td className={`py-2 pr-4 text-xs ${h.sla_breached ? 'text-red-600 font-semibold' : 'text-[#6b7685]'}`}>
                    {h.sla_breached ? '⚠ BREACHED' : fmtDate(h.sla_due_at)}
                  </td>
                  <td className="py-2 text-xs" style={{ color: 'oklch(0.46 0.16 55)' }}>View →</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-[#9aa5b4] text-sm">No handover packs found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold">{CATEGORY_LABELS[selected.category]}</h2>
                <div className="text-xs text-[#6b7685] mt-1">{selected.capacity_tier} · {selected.capacity_mw} MW</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-[#9aa5b4] hover:text-[#3d4756]">✕</button>
            </div>
            <div className="text-sm font-medium text-[#1e2a38] mb-3">{selected.title}</div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-[#6b7685]">Status:</span> <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status]}`}>{selected.chain_status.replace(/_/g, ' ')}</span></div>
              <div><span className="text-[#6b7685]">Documents:</span> {selected.document_count ?? '—'}</div>
              {selected.deficiency_count != null && <div><span className="text-[#6b7685]">Deficiencies:</span> <span className="text-orange-700 font-semibold">{selected.deficiency_count}</span></div>}
              {selected.conditions && <div className="col-span-2"><span className="text-[#6b7685]">Conditions:</span> <span className="text-yellow-700 text-xs">{selected.conditions}</span></div>}
              {selected.accepted_at && <div><span className="text-[#6b7685]">Accepted:</span> <span className="text-green-700">{fmtDate(selected.accepted_at)}</span></div>}
            </div>

            {ACTION_MAP[selected.chain_status] && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#6b7685] uppercase mb-1">Actions</div>
                {ACTION_MAP[selected.chain_status].map(a => (
                  <button type="button" key={a.action} disabled={actionPending}
                    onClick={() => doAction(selected.id, a.action)}
                    className={`w-full text-left px-3 py-2 rounded border text-sm ${a.danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-[#dde4ec] text-[#2d3748] hover:bg-[#eef2f7]'}`}>
                    {a.label}
                    {a.tag && <span className={`ml-2 text-xs px-1 rounded ${a.tag.includes('REGULATOR') ? 'bg-red-100 text-red-700' : 'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]'}`}>{a.tag}</span>}
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
            <h3 className="text-lg font-bold mb-4">New O&M Handover Pack</h3>
            <div className="space-y-3">
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input placeholder="Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Plant Capacity (MW) *" type="number" value={form.capacity_mw} onChange={e => setForm(f => ({ ...f, capacity_mw: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Document count" type="number" value={form.document_count} onChange={e => setForm(f => ({ ...f, document_count: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={createHandover} disabled={!form.title || !form.capacity_mw} className="px-4 py-2 bg-[#c2873a] text-white rounded text-sm hover:bg-[#a3702f] disabled:opacity-50">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-[#eef2f7] text-[#2d3748] rounded text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
