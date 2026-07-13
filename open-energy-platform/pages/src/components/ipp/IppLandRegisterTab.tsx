import { useState } from 'react';
import { api } from '../../lib/api';
import { statusLabel } from '../../meridian/ease/statusLabel';

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
  survey_commissioned:   'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
  field_survey:          'bg-[var(--s2, oklch(0.94_0.008_250))] text-[var(--accent, oklch(0.46_0.16_55))]',
  diagram_drafted:       'bg-[var(--s2, oklch(0.94_0.008_250))] text-[var(--accent, oklch(0.46_0.16_55))]',
  sg_approved:           'bg-[var(--s2, oklch(0.90_0.015_250))] text-[var(--ink, oklch(0.17_0.010_250))]',
  servitude_notarised:   'bg-lime-100 text-lime-800',
  deeds_lodged:          'bg-yellow-100 text-yellow-800',
  deeds_registered:      'bg-green-200 text-green-900',
  defective_title:       'bg-orange-100 text-orange-800',
  survey_rejected:       'bg-red-100 text-red-800',
  abandoned:             'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #9aa5b4)]',
  superseded:            'bg-[var(--border-subtle, #e8ecf0)] text-[var(--ink-2, #6b7685)]',
};

const TIER_COLORS: Record<string, string> = {
  minor:        'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  moderate:     'bg-[var(--s2, oklch(0.94_0.008_250))] text-[var(--accent, oklch(0.46_0.16_55))]',
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
    const res = await api.get(`/ipp-land-register?${params}`);
    setItems(res.data?.data?.items ?? []);
    setKpis(res.data?.data?.kpis ?? null);
    setLoaded(true);
    setLoading(false);
  }

  async function doAction(id: string, action: string) {
    setActionPending(true);
    await api.put(`/ipp-land-register/${id}/action`, { action });
    setActionPending(false);
    setSelected(null);
    load(filterStatus, filterTier);
  }

  async function createRecord() {
    await api.post('/ipp-land-register', {
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
      <button type="button" onClick={() => load()} className="px-4 py-2 bg-[#c2873a] text-white rounded hover:bg-[#a3702f] text-sm">Load Land Register</button>
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
            <div key={k.label} className={`rounded-lg p-3 border ${k.alert ? 'border-orange-300 bg-orange-50' : k.good ? 'border-green-200 bg-green-50' : 'border-[var(--border-subtle, #dde4ec)] bg-surface-v2'}`}>
              <div className="text-xs text-[var(--ink-2, #6b7685)]">{k.label}</div>
              <div className={`text-xl font-bold ${k.alert ? 'text-orange-700' : k.good ? 'text-green-700' : 'text-[var(--ink, #0f1c2e)]'}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => { setFilterStatus(''); load('', filterTier); }} className={`px-3 py-1 rounded text-xs border ${!filterStatus ? 'bg-[var(--ink, #1e2a38)] text-white' : 'bg-surface-v2 text-[var(--ink-2, #3d4756)] border-[var(--border-subtle, #dde4ec)]'}`}>All</button>
        {['survey_commissioned','field_survey','sg_approved','deeds_lodged','deeds_registered','defective_title'].map(s => (
          <button type="button" key={s} onClick={() => { setFilterStatus(s); load(s, filterTier); }} className={`px-3 py-1 rounded text-xs border ${filterStatus === s ? 'bg-[var(--ink, #1e2a38)] text-white' : 'bg-surface-v2 text-[var(--ink-2, #3d4756)] border-[var(--border-subtle, #dde4ec)]'}`}>{s.replace(/_/g, ' ')}</button>
        ))}
        <span className="ml-1 text-[var(--ink-2, #9aa5b4)]">|</span>
        {['minor','moderate','significant','major','material'].map(t => (
          <button type="button" key={t} onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt); }} className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'text-white' : 'bg-surface-v2 text-[var(--ink-2, #3d4756)] border-[var(--border-subtle, #dde4ec)]'}`} style={filterTier === t ? { background: 'var(--accent, oklch(0.46 0.16 55))' } : undefined}>{t}</button>
        ))}
        <button type="button" onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]">+ New Survey</button>
        <button type="button" onClick={() => load(filterStatus, filterTier)} className="px-3 py-1 bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)] rounded text-xs border">Refresh</button>
      </div>

      {loading ? <div className="text-sm text-[var(--ink-2, #9aa5b4)] py-4">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--ink-2, #6b7685)]">
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
                <tr key={lr.id} className="border-b hover:bg-[var(--s2, #eef2f7)] cursor-pointer" onClick={() => setSelected(lr)}>
                  <td className="py-2 pr-4 text-xs max-w-[180px] truncate">{lr.description?.slice(0, 60) ?? lr.project_id}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[lr.area_tier]}`}>{lr.area_tier}</span></td>
                  <td className="py-2 pr-4 text-xs font-medium">{lr.area_ha.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-xs text-[var(--ink-2, #6b7685)]">{lr.erf_count ?? '—'}</td>
                  <td className="py-2 pr-4 text-xs text-[var(--ink-2, #6b7685)]">{lr.servitude_count ?? '—'}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[lr.chain_status]}`}>{statusLabel(lr.chain_status).text}</span></td>
                  <td className="py-2 pr-4 text-xs font-mono text-[var(--ink-2, #3d4756)]">{lr.deeds_reference ?? '—'}</td>
                  <td className={`py-2 pr-4 text-xs ${lr.sla_breached ? 'text-red-600 font-semibold' : 'text-[var(--ink-2, #6b7685)]'}`}>
                    {lr.sla_breached ? '⚠ BREACHED' : fmtDate(lr.sla_due_at)}
                  </td>
                  <td className="py-2 text-xs" style={{ color: 'var(--accent, oklch(0.46 0.16 55))' }}>View →</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-[var(--ink-2, #9aa5b4)] text-sm">No land register records found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-surface-v2 w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold">Land Register</h2>
                <div className="text-xs text-[var(--ink-2, #6b7685)] mt-1">{selected.area_tier} · {selected.area_ha} ha</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-[var(--ink-2, #9aa5b4)] hover:text-[var(--ink-2, #3d4756)]">✕</button>
            </div>
            {selected.description && <div className="text-sm text-[var(--ink-2, #3d4756)] bg-[var(--s1, #f8fafc)] rounded p-3 mb-4">{selected.description}</div>}
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-[var(--ink-2, #6b7685)]">Status:</span> <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status]}`}>{statusLabel(selected.chain_status).text}</span></div>
              <div><span className="text-[var(--ink-2, #6b7685)]">Erven:</span> {selected.erf_count ?? '—'}</div>
              <div><span className="text-[var(--ink-2, #6b7685)]">Servitudes:</span> {selected.servitude_count ?? '—'}</div>
              <div><span className="text-[var(--ink-2, #6b7685)]">Surveyor:</span> {selected.surveyor_firm ?? '—'}</div>
              {selected.deeds_reference && <div><span className="text-[var(--ink-2, #6b7685)]">Deeds Ref:</span> <span className="font-mono text-green-700">{selected.deeds_reference}</span></div>}
              {selected.deeds_registered_at && <div><span className="text-[var(--ink-2, #6b7685)]">Registered:</span> <span className="text-green-700">{fmtDate(selected.deeds_registered_at)}</span></div>}
            </div>
            {ACTION_MAP[selected.chain_status] && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--ink-2, #6b7685)] uppercase mb-1">Actions</div>
                {ACTION_MAP[selected.chain_status].map(a => (
                  <button type="button" key={a.action} disabled={actionPending}
                    onClick={() => doAction(selected.id, a.action)}
                    className={`w-full text-left px-3 py-2 rounded border text-sm ${a.danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-[var(--border-subtle, #dde4ec)] text-[var(--ink, #2d3748)]'}`}>
                    {a.label}
                    {a.tag && <span className={`ml-2 text-xs px-1 rounded ${a.tag.includes('REGULATOR') ? 'bg-red-100 text-red-700' : ''}`} style={!a.tag.includes('REGULATOR') ? { background: 'var(--s2, oklch(0.94 0.006 250))', color: 'var(--accent, oklch(0.46 0.16 55))' } : undefined}>{a.tag}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-surface-v2 rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
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
              <button type="button" onClick={createRecord} disabled={!form.area_ha} className="px-4 py-2 bg-[#c2873a] text-white rounded text-sm hover:bg-[#a3702f] disabled:opacity-50">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)] rounded text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
