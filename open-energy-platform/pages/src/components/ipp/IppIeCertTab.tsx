import { useState } from 'react';
import { api } from '../../lib/api';

interface IeCert {
  id: string;
  project_id: string;
  milestone_value_zar: number;
  milestone_tier: string;
  milestone_category?: string;
  ie_firm?: string;
  lender_reference?: string;
  cert_number?: string;
  description?: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  cert_issued_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  issued_count: number;
  comments_count: number;
  rejected_count: number;
  breached_count: number;
  total_certified_zar: number;
}

const STATUS_COLORS: Record<string, string> = {
  cert_request_submitted: 'bg-gray-100 text-gray-500',
  ie_site_visit:          'bg-blue-100 text-blue-700',
  draft_report:           'bg-indigo-100 text-indigo-700',
  borrower_review:        'bg-purple-100 text-purple-700',
  comments_raised:        'bg-orange-100 text-orange-800',
  comments_resolved:      'bg-yellow-100 text-yellow-800',
  cert_issued:            'bg-green-200 text-green-900',
  cert_rejected:          'bg-red-100 text-red-800',
  withdrawn:              'bg-gray-100 text-gray-400',
};

const TIER_COLORS: Record<string, string> = {
  minor:        'bg-gray-100 text-gray-600',
  moderate:     'bg-blue-100 text-blue-700',
  significant:  'bg-yellow-100 text-yellow-800',
  major:        'bg-orange-100 text-orange-800',
  material:     'bg-red-100 text-red-800',
};

const CATEGORY_LABELS: Record<string, string> = {
  financial_close:    'Financial Close',
  construction_start: 'Construction Start',
  pac:                'PAC',
  cod:                'COD',
  fac:                'FAC',
  loan_drawdown:      'Loan Drawdown',
};

const ACTION_MAP: Record<string, { label: string; action: string; danger?: boolean; tag?: string }[]> = {
  cert_request_submitted: [{ label: 'Commence IE Site Visit', action: 'commence_site_visit' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  ie_site_visit:          [{ label: 'Prepare Draft Report', action: 'prepare_draft' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  draft_report:           [{ label: 'Issue for Borrower Review', action: 'issue_for_borrower_review' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  borrower_review:        [{ label: 'Issue Certificate', action: 'issue_cert', tag: 'REGULATOR EVERY TIER' }, { label: 'Raise Comments', action: 'raise_comments' }],
  comments_raised:        [{ label: 'Mark Comments Resolved', action: 'resolve_comments' }, { label: 'Reject Certification', action: 'reject_certification', danger: true, tag: 'REGULATOR if major+' }],
  comments_resolved:      [{ label: 'Issue Certificate', action: 'issue_cert', tag: 'REGULATOR EVERY TIER' }, { label: 'Reject Certification', action: 'reject_certification', danger: true, tag: 'REGULATOR if major+' }],
};

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtZar(n?: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(0)}M`;
  return `R${n.toLocaleString()}`;
}

export function IppIeCertTab() {
  const [items, setItems] = useState<IeCert[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [selected, setSelected] = useState<IeCert | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ milestone_value_zar: '', milestone_category: '', ie_firm: '', lender_reference: '', description: '' });

  async function load(status?: string, tier?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (tier) params.set('tier', tier);
    const res = await api.get(`/api/ipp-ie-cert?${params}`);
    setItems(res.data?.data?.items ?? []);
    setKpis(res.data?.data?.kpis ?? null);
    setLoaded(true);
    setLoading(false);
  }

  async function doAction(id: string, action: string) {
    setActionPending(true);
    await api.put(`/api/ipp-ie-cert/${id}/action`, { action });
    setActionPending(false);
    setSelected(null);
    load(filterStatus, filterTier);
  }

  async function createRecord() {
    await api.post('/api/ipp-ie-cert', {
      project_id: 'proj_nxt_solar_001',
      milestone_value_zar: parseFloat(form.milestone_value_zar),
      milestone_category: form.milestone_category || undefined,
      ie_firm: form.ie_firm || undefined,
      lender_reference: form.lender_reference || undefined,
      description: form.description || undefined,
    });
    setShowCreate(false);
    setForm({ milestone_value_zar: '', milestone_category: '', ie_firm: '', lender_reference: '', description: '' });
    load(filterStatus, filterTier);
  }

  if (!loaded) return (
    <div className="p-6">
      <button onClick={() => load()} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm">Load IE Certifications</button>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Certs', value: kpis.total },
            { label: 'Comments Open', value: kpis.comments_count, alert: kpis.comments_count > 0 },
            { label: 'Certs Issued', value: kpis.issued_count, good: kpis.issued_count > 0 },
            { label: 'Value Certified', value: fmtZar(kpis.total_certified_zar), good: kpis.total_certified_zar > 0 },
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
        {['cert_request_submitted','ie_site_visit','borrower_review','comments_raised','cert_issued','cert_rejected'].map(s => (
          <button key={s} onClick={() => { setFilterStatus(s); load(s, filterTier); }} className={`px-3 py-1 rounded text-xs border ${filterStatus === s ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border-gray-300'}`}>{s.replace(/_/g, ' ')}</button>
        ))}
        <span className="ml-1 text-gray-300">|</span>
        {['minor','moderate','significant','major','material'].map(t => (
          <button key={t} onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt); }} className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'bg-indigo-700 text-white' : 'bg-white text-gray-600 border-gray-300'}`}>{t}</button>
        ))}
        <button onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">+ New IE Cert</button>
        <button onClick={() => load(filterStatus, filterTier)} className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs border">Refresh</button>
      </div>

      {loading ? <div className="text-sm text-gray-400 py-4">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2 pr-4">Description</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Value</th>
                <th className="pb-2 pr-4">Milestone</th>
                <th className="pb-2 pr-4">IE Firm</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Cert #</th>
                <th className="pb-2 pr-4">SLA</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(ie => (
                <tr key={ie.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(ie)}>
                  <td className="py-2 pr-4 text-xs max-w-[180px] truncate">{ie.description?.slice(0, 60) ?? ie.project_id}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[ie.milestone_tier]}`}>{ie.milestone_tier}</span></td>
                  <td className="py-2 pr-4 text-xs font-medium text-indigo-700">{fmtZar(ie.milestone_value_zar)}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500">{ie.milestone_category ? CATEGORY_LABELS[ie.milestone_category] ?? ie.milestone_category : '—'}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500 max-w-[120px] truncate">{ie.ie_firm ?? '—'}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[ie.chain_status]}`}>{ie.chain_status.replace(/_/g, ' ')}</span></td>
                  <td className="py-2 pr-4 text-xs font-mono text-green-700">{ie.cert_number ?? '—'}</td>
                  <td className={`py-2 pr-4 text-xs ${ie.sla_breached ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                    {ie.sla_breached ? '⚠ BREACHED' : fmtDate(ie.sla_due_at)}
                  </td>
                  <td className="py-2 text-xs text-indigo-600">View →</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-gray-400 text-sm">No IE certification records found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold">IE Certification</h2>
                <div className="text-xs text-gray-500 mt-1">{selected.milestone_tier} · {fmtZar(selected.milestone_value_zar)}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            {selected.description && <div className="text-sm text-gray-600 bg-gray-50 rounded p-3 mb-4">{selected.description}</div>}
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-gray-500">Status:</span> <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status]}`}>{selected.chain_status.replace(/_/g, ' ')}</span></div>
              <div><span className="text-gray-500">Milestone:</span> {selected.milestone_category ? CATEGORY_LABELS[selected.milestone_category] ?? selected.milestone_category : '—'}</div>
              {selected.ie_firm && <div className="col-span-2"><span className="text-gray-500">IE Firm:</span> {selected.ie_firm}</div>}
              {selected.lender_reference && <div><span className="text-gray-500">Lender Ref:</span> <span className="font-mono text-xs">{selected.lender_reference}</span></div>}
              {selected.cert_number && <div><span className="text-gray-500">Cert Number:</span> <span className="font-mono text-green-700">{selected.cert_number}</span></div>}
              {selected.cert_issued_at && <div><span className="text-gray-500">Issued:</span> <span className="text-green-700">{fmtDate(selected.cert_issued_at)}</span></div>}
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
            <h3 className="text-lg font-bold mb-4">New IE Certification Request</h3>
            <div className="space-y-3">
              <input placeholder="Milestone value (ZAR) *" type="number" value={form.milestone_value_zar} onChange={e => setForm(f => ({ ...f, milestone_value_zar: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <select value={form.milestone_category} onChange={e => setForm(f => ({ ...f, milestone_category: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm text-gray-700">
                <option value="">Milestone category (optional)</option>
                <option value="financial_close">Financial Close</option>
                <option value="construction_start">Construction Start</option>
                <option value="pac">PAC</option>
                <option value="cod">COD</option>
                <option value="fac">FAC</option>
                <option value="loan_drawdown">Loan Drawdown</option>
              </select>
              <input placeholder="IE firm" value={form.ie_firm} onChange={e => setForm(f => ({ ...f, ie_firm: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Lender reference" value={form.lender_reference} onChange={e => setForm(f => ({ ...f, lender_reference: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={createRecord} disabled={!form.milestone_value_zar} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50">Create</button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
