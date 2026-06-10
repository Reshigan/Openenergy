import { useState } from 'react';
import { api } from '../../lib/api';

interface FinalCompletion {
  id: string;
  project_id: string;
  contract_value_zar: number;
  retention_amount_zar: number;
  contract_tier: string;
  practical_completion_date: string;
  dlp_end_date: string;
  description?: string;
  snag_count?: number;
  chain_status: string;
  fcc_issued_at?: string;
  retention_released_at?: string;
  sla_due_at?: string;
  sla_breached: number;
  inspection_scheduled_at?: string;
  inspection_completed_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  fcc_issued_count: number;
  completed_count: number;
  disputed_count: number;
  defects_outstanding_count: number;
  breached_count: number;
  total_retention_released_zar: number;
  pending_retention_zar: number;
}

const STATUS_COLORS: Record<string, string> = {
  application_submitted:  'bg-blue-100 text-blue-800',
  defects_outstanding:    'bg-orange-100 text-orange-800',
  inspection_scheduled:   'bg-indigo-100 text-indigo-800',
  inspection_complete:    'bg-indigo-200 text-indigo-900',
  snag_list_issued:       'bg-yellow-100 text-yellow-800',
  snag_list_cleared:      'bg-lime-100 text-lime-800',
  fcc_issued:             'bg-green-100 text-green-800',
  retention_released:     'bg-green-200 text-green-900',
  disputed:               'bg-red-100 text-red-800',
  adjudicated:            'bg-[#e8ecf0] text-[#1e2a38]',
  withdrawn:              'bg-[#eef2f7] text-[#6b7685]',
  rejected:               'bg-red-200 text-red-900',
};

const TIER_COLORS: Record<string, string> = {
  minor:        'bg-[#eef2f7] text-[#3d4756]',
  moderate:     'bg-blue-100 text-blue-700',
  significant:  'bg-yellow-100 text-yellow-800',
  major:        'bg-orange-100 text-orange-800',
  material:     'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  application_submitted:  'App submitted',
  defects_outstanding:    'Defects outstanding',
  inspection_scheduled:   'Inspection scheduled',
  inspection_complete:    'Inspected',
  snag_list_issued:       'Snag list issued',
  snag_list_cleared:      'Snags cleared',
  fcc_issued:             'FCC issued',
  retention_released:     'Retention released',
  disputed:               'Disputed',
  adjudicated:            'Adjudicated',
  withdrawn:              'Withdrawn',
  rejected:               'Rejected',
};

const ACTION_MAP: Record<string, { label: string; action: string; danger?: boolean; tag?: string }[]> = {
  application_submitted:  [
    { label: 'Schedule Inspection', action: 'schedule_inspection' },
    { label: 'Return — Defects Outstanding', action: 'reject_application', danger: true, tag: 'REGULATOR if major+' },
  ],
  defects_outstanding:    [
    { label: 'Re-submit Application', action: 'schedule_inspection' },
    { label: 'Withdraw', action: 'withdraw_application', danger: true },
  ],
  inspection_scheduled:   [{ label: 'Complete Inspection', action: 'complete_inspection' }],
  inspection_complete:    [
    { label: 'Issue FCC (no snags)', action: 'issue_fcc', tag: 'REGULATOR EVERY TIER' },
    { label: 'Issue Snag List', action: 'issue_snag_list' },
  ],
  snag_list_issued:       [
    { label: 'Clear Snag List', action: 'clear_snag_list' },
    { label: 'Dispute Snag Assessment', action: 'dispute_rejection', danger: true },
  ],
  snag_list_cleared:      [{ label: 'Issue FCC', action: 'issue_fcc', tag: 'REGULATOR EVERY TIER' }],
  fcc_issued:             [
    { label: 'Release Retention', action: 'release_retention' },
    { label: 'Dispute', action: 'dispute_rejection', danger: true },
  ],
  disputed:               [
    { label: 'Issue FCC', action: 'issue_fcc', tag: 'REGULATOR EVERY TIER' },
    { label: 'Refer Adjudication', action: 'refer_adjudication', danger: true, tag: 'REGULATOR' },
    { label: 'Reject Application', action: 'reject_application', danger: true, tag: 'REGULATOR if major+' },
  ],
};

function fmt(n?: number | null): string {
  if (n == null) return '—';
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function IppFinalCompletionTab() {
  const [items, setItems] = useState<FinalCompletion[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [selected, setSelected] = useState<FinalCompletion | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    contract_value_zar: '', retention_amount_zar: '',
    practical_completion_date: '', dlp_end_date: '', description: '',
  });

  async function load(status?: string, tier?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (tier) params.set('tier', tier);
    const res = await api.get(`/api/ipp-final-completion?${params}`);
    const j = res.data;
    setItems(j.data?.items ?? []);
    setKpis(j.data?.kpis ?? null);
    setLoaded(true);
    setLoading(false);
  }

  async function doAction(id: string, action: string, extra?: Record<string, unknown>) {
    setActionPending(true);
    await api.put(`/api/ipp-final-completion/${id}/action`, { action, ...extra });
    setActionPending(false);
    setSelected(null);
    load(filterStatus, filterTier);
  }

  async function createFcc() {
    await api.post('/api/ipp-final-completion', {
      project_id: 'proj_nxt_solar_001',
      contract_value_zar: parseFloat(form.contract_value_zar),
      retention_amount_zar: parseFloat(form.retention_amount_zar),
      practical_completion_date: form.practical_completion_date,
      dlp_end_date: form.dlp_end_date,
      description: form.description || undefined,
    });
    setShowCreate(false);
    setForm({ contract_value_zar: '', retention_amount_zar: '', practical_completion_date: '', dlp_end_date: '', description: '' });
    load(filterStatus, filterTier);
  }

  if (!loaded) {
    return (
      <div className="p-6">
        <button type="button" onClick={() => load()} className="px-4 py-2 bg-[#c2873a] text-white rounded hover:bg-[#a3702f] text-sm">
          Load Final Completion Certificates
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total FCCs', value: kpis.total },
            { label: 'In Progress', value: kpis.open_count },
            { label: 'Defects Outstanding', value: kpis.defects_outstanding_count, alert: kpis.defects_outstanding_count > 0 },
            { label: 'Disputed', value: kpis.disputed_count, alert: kpis.disputed_count > 0 },
          ].map(k => (
            <div key={k.label} className={`rounded-lg p-3 border ${k.alert ? 'border-red-300 bg-red-50' : 'border-[#dde4ec] bg-white'}`}>
              <div className="text-xs text-[#6b7685]">{k.label}</div>
              <div className={`text-xl font-bold ${k.alert ? 'text-red-700' : 'text-[#0f1c2e]'}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}
      {kpis && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg p-3 border border-orange-200 bg-orange-50">
            <div className="text-xs text-[#6b7685]">Pending Retention</div>
            <div className="text-lg font-bold text-orange-700">{fmt(kpis.pending_retention_zar)}</div>
          </div>
          <div className="rounded-lg p-3 border border-green-200 bg-green-50">
            <div className="text-xs text-[#6b7685]">Retention Released</div>
            <div className="text-lg font-bold text-green-700">{fmt(kpis.total_retention_released_zar)}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => { setFilterStatus(''); load('', filterTier); }} className={`px-3 py-1 rounded text-xs border ${!filterStatus ? 'bg-[#1e2a38] text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>All</button>
        {['application_submitted','inspection_scheduled','snag_list_issued','fcc_issued','retention_released','disputed'].map(s => (
          <button type="button" key={s} onClick={() => { setFilterStatus(s); load(s, filterTier); }} className={`px-3 py-1 rounded text-xs border ${filterStatus === s ? 'bg-[#1e2a38] text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>
            {STATUS_LABELS[s] ?? s}
          </button>
        ))}
        <span className="ml-2 text-[#9aa5b4]">|</span>
        {['minor','moderate','significant','major','material'].map(t => (
          <button type="button" key={t} onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt); }} className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'bg-indigo-700 text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>{t}</button>
        ))}
        <button type="button" onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]">+ New FCC Application</button>
        <button type="button" onClick={() => load(filterStatus, filterTier)} className="px-3 py-1 bg-[#eef2f7] text-[#2d3748] rounded text-xs border">Refresh</button>
      </div>

      {/* Table */}
      {loading ? <div className="text-sm text-[#9aa5b4] py-4">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[#6b7685]">
                <th className="pb-2 pr-4">Project</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Contract Value</th>
                <th className="pb-2 pr-4">Retention</th>
                <th className="pb-2 pr-4">DLP End</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">FCC Date</th>
                <th className="pb-2 pr-4">SLA</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(fc => (
                <tr key={fc.id} className="border-b hover:bg-[#eef2f7] cursor-pointer" onClick={() => setSelected(fc)}>
                  <td className="py-2 pr-4 text-xs font-medium text-[#2d3748] max-w-[160px] truncate">{fc.description?.slice(0, 50) ?? fc.project_id}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[fc.contract_tier]}`}>{fc.contract_tier}</span>
                  </td>
                  <td className="py-2 pr-4 text-xs font-medium">{fmt(fc.contract_value_zar)}</td>
                  <td className="py-2 pr-4 text-xs text-orange-700">{fmt(fc.retention_amount_zar)}</td>
                  <td className="py-2 pr-4 text-xs text-[#6b7685]">{fmtDate(fc.dlp_end_date)}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[fc.chain_status]}`}>{STATUS_LABELS[fc.chain_status] ?? fc.chain_status}</span>
                  </td>
                  <td className="py-2 pr-4 text-xs text-green-700">{fc.fcc_issued_at ? fmtDate(fc.fcc_issued_at) : '—'}</td>
                  <td className={`py-2 pr-4 text-xs ${fc.sla_breached ? 'text-red-600 font-semibold' : 'text-[#6b7685]'}`}>
                    {fc.sla_breached ? '⚠ SLA BREACHED' : fmtDate(fc.sla_due_at)}
                  </td>
                  <td className="py-2 text-xs text-indigo-600">View →</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-[#9aa5b4] text-sm">No FCC applications found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold">Final Completion Certificate</h2>
                <div className="text-xs text-[#6b7685] mt-1">{selected.contract_tier} · {selected.project_id}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-[#9aa5b4] hover:text-[#3d4756]">✕</button>
            </div>

            {selected.description && (
              <div className="text-sm text-[#3d4756] bg-[#f8fafc] rounded p-3 mb-4">{selected.description}</div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-[#6b7685]">Contract Value:</span> <span className="font-bold">{fmt(selected.contract_value_zar)}</span></div>
              <div><span className="text-[#6b7685]">Retention:</span> <span className="font-bold text-orange-700">{fmt(selected.retention_amount_zar)}</span></div>
              <div><span className="text-[#6b7685]">Status:</span> <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status]}`}>{STATUS_LABELS[selected.chain_status]}</span></div>
              <div><span className="text-[#6b7685]">Snags:</span> {selected.snag_count ?? '—'}</div>
              <div><span className="text-[#6b7685]">Practical Completion:</span> {fmtDate(selected.practical_completion_date)}</div>
              <div><span className="text-[#6b7685]">DLP End:</span> {fmtDate(selected.dlp_end_date)}</div>
              {selected.fcc_issued_at && <div><span className="text-[#6b7685]">FCC Issued:</span> <span className="text-green-700 font-semibold">{fmtDate(selected.fcc_issued_at)}</span></div>}
              {selected.retention_released_at && <div><span className="text-[#6b7685]">Retention Released:</span> <span className="text-green-700 font-semibold">{fmtDate(selected.retention_released_at)}</span></div>}
            </div>

            {ACTION_MAP[selected.chain_status] && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#6b7685] uppercase mb-1">Actions</div>
                {ACTION_MAP[selected.chain_status].map(a => (
                  <button type="button" key={a.action} disabled={actionPending}
                    onClick={() => doAction(selected.id, a.action)}
                    className={`w-full text-left px-3 py-2 rounded border text-sm hover:bg-indigo-50 hover:border-indigo-300 ${a.danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-[#dde4ec] text-[#2d3748]'}`}>
                    {a.label}
                    {a.tag && <span className={`ml-2 text-xs px-1 rounded ${a.tag.includes('REGULATOR') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{a.tag}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">New FCC Application</h3>
            <div className="space-y-3">
              <input placeholder="Contract Value (ZAR) *" type="number" value={form.contract_value_zar}
                onChange={e => setForm(f => ({ ...f, contract_value_zar: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Retention Amount (ZAR) *" type="number" value={form.retention_amount_zar}
                onChange={e => setForm(f => ({ ...f, retention_amount_zar: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-[#6b7685] mb-1 block">Practical Completion *</label>
                  <input type="date" value={form.practical_completion_date}
                    onChange={e => setForm(f => ({ ...f, practical_completion_date: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] mb-1 block">DLP End Date *</label>
                  <input type="date" value={form.dlp_end_date}
                    onChange={e => setForm(f => ({ ...f, dlp_end_date: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
              </div>
              <textarea placeholder="Description" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={createFcc}
                disabled={!form.contract_value_zar || !form.retention_amount_zar || !form.practical_completion_date || !form.dlp_end_date}
                className="px-4 py-2 bg-[#c2873a] text-white rounded text-sm hover:bg-[#a3702f] disabled:opacity-50">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-[#eef2f7] text-[#2d3748] rounded text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
