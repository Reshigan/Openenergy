import { useState } from 'react';
import { api } from '../../lib/api';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface CommissioningTest {
  id: string;
  project_id: string;
  capacity_mw: number;
  capacity_tier: string;
  test_category?: string;
  contractor_firm?: string;
  ie_firm?: string;
  cert_reference?: string;
  description?: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  pac_issued_at?: string;
  performance_cert_issued_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  certified_count: number;
  pac_count: number;
  punch_list_count: number;
  failed_count: number;
  breached_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  test_plan_submitted:              'bg-[#eef2f7] text-[#6b7685]',
  witness_inspection:               'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  hold_point_open:                  'bg-orange-100 text-orange-800',
  hold_point_cleared:               'bg-yellow-100 text-yellow-800',
  performance_test_running:         'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  punch_list_issued:                'bg-orange-200 text-orange-900',
  punch_list_cleared:               'bg-yellow-200 text-yellow-900',
  pac_recommended:                  'bg-cyan-100 text-cyan-700',
  pac_issued:                       'bg-cyan-200 text-cyan-900',
  performance_test_running_post_pac:'bg-[oklch(0.94_0.006_250)] text-[oklch(0.17_0.010_250)]',
  fac_recommended:                  'bg-lime-100 text-lime-800',
  performance_cert_issued:          'bg-green-200 text-green-900',
  test_failed:                      'bg-red-100 text-red-800',
  withdrawn:                        'bg-[#eef2f7] text-[#9aa5b4]',
};

const TIER_COLORS: Record<string, string> = {
  minor:        'bg-[#eef2f7] text-[#3d4756]',
  moderate:     'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  significant:  'bg-yellow-100 text-yellow-800',
  major:        'bg-orange-100 text-orange-800',
  material:     'bg-red-100 text-red-800',
};

const TEST_LABELS: Record<string, string> = {
  string_iv_test:         'String IV',
  ac_performance_test:    'AC Performance',
  protection_relay_test:  'Protection Relay',
  grid_compliance_test:   'Grid Compliance',
  full_commissioning:     'Full Commissioning',
};

const ACTION_MAP: Record<string, { label: string; action: string; danger?: boolean; tag?: string }[]> = {
  test_plan_submitted:              [{ label: 'Commence Witness Inspection', action: 'commence_witness_inspection' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  witness_inspection:               [{ label: 'Open Hold Point', action: 'open_hold_point' }, { label: 'Start Performance Test', action: 'start_performance_test' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  hold_point_open:                  [{ label: 'Clear Hold Point', action: 'clear_hold_point' }, { label: 'Declare Test Failure', action: 'declare_test_failure', danger: true, tag: 'REGULATOR if major+' }],
  hold_point_cleared:               [{ label: 'Start Performance Test', action: 'start_performance_test' }, { label: 'Open Next Hold Point', action: 'open_hold_point' }],
  performance_test_running:         [{ label: 'Issue Punch List', action: 'issue_punch_list', danger: true }, { label: 'Recommend PAC', action: 'recommend_pac' }, { label: 'Declare Test Failure', action: 'declare_test_failure', danger: true, tag: 'REGULATOR if major+' }],
  punch_list_issued:                [{ label: 'Clear Punch List', action: 'clear_punch_list' }, { label: 'Declare Test Failure', action: 'declare_test_failure', danger: true, tag: 'REGULATOR if major+' }],
  punch_list_cleared:               [{ label: 'Recommend PAC', action: 'recommend_pac' }, { label: 'Declare Test Failure', action: 'declare_test_failure', danger: true, tag: 'REGULATOR if major+' }],
  pac_recommended:                  [{ label: 'Issue PAC', action: 'issue_pac' }, { label: 'Declare Test Failure', action: 'declare_test_failure', danger: true, tag: 'REGULATOR if major+' }],
  pac_issued:                       [{ label: 'Start Post-PAC Performance Test', action: 'start_post_pac_test' }],
  performance_test_running_post_pac:[{ label: 'Issue Punch List', action: 'issue_punch_list', danger: true }, { label: 'Recommend FAC', action: 'recommend_fac' }, { label: 'Declare Test Failure', action: 'declare_test_failure', danger: true, tag: 'REGULATOR if major+' }],
  fac_recommended:                  [{ label: 'Issue Performance Certificate', action: 'issue_performance_cert', tag: 'REGULATOR EVERY TIER' }, { label: 'Declare Test Failure', action: 'declare_test_failure', danger: true, tag: 'REGULATOR if major+' }],
};

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function IppCommissioningTestTab() {
  const [items, setItems] = useState<CommissioningTest[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [selected, setSelected] = useState<CommissioningTest | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ capacity_mw: '', test_category: '', contractor_firm: '', ie_firm: '', description: '' });

  async function load(status?: string, tier?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (tier) params.set('tier', tier);
    const res = await api.get(`/ipp-commissioning-test?${params}`);
    setItems(res.data?.data?.items ?? []);
    setKpis(res.data?.data?.kpis ?? null);
    setLoaded(true);
    setLoading(false);
  }

  async function doAction(id: string, action: string) {
    setActionPending(true);
    await api.put(`/ipp-commissioning-test/${id}/action`, { action });
    setActionPending(false);
    setSelected(null);
    load(filterStatus, filterTier);
  }

  async function createRecord() {
    await api.post('/ipp-commissioning-test', {
      project_id: 'proj_nxt_solar_001',
      capacity_mw: parseFloat(form.capacity_mw),
      test_category: form.test_category || undefined,
      contractor_firm: form.contractor_firm || undefined,
      ie_firm: form.ie_firm || undefined,
      description: form.description || undefined,
    });
    setShowCreate(false);
    setForm({ capacity_mw: '', test_category: '', contractor_firm: '', ie_firm: '', description: '' });
    load(filterStatus, filterTier);
  }

  if (!loaded) return (
    <div className="p-6">
      <button type="button" onClick={() => load()} className="px-4 py-2 bg-[#c2873a] text-white rounded hover:bg-[#a3702f] text-sm">Load Commissioning Tests</button>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Tests', value: kpis.total },
            { label: 'Punch Lists Open', value: kpis.punch_list_count, alert: kpis.punch_list_count > 0 },
            { label: 'PAC Issued', value: kpis.pac_count },
            { label: 'Certs Issued', value: kpis.certified_count, good: kpis.certified_count > 0 },
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
        {['test_plan_submitted','performance_test_running','punch_list_issued','pac_issued','fac_recommended','performance_cert_issued'].map(s => (
          <button type="button" key={s} onClick={() => { setFilterStatus(s); load(s, filterTier); }} className={`px-3 py-1 rounded text-xs border ${filterStatus === s ? 'bg-[#1e2a38] text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>{s.replace(/_/g, ' ')}</button>
        ))}
        <span className="ml-1 text-[#9aa5b4]">|</span>
        {['minor','moderate','significant','major','material'].map(t => (
          <button type="button" key={t} onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt); }} className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`} style={filterTier === t ? { background: 'oklch(0.46 0.16 55)' } : {}}>{t}</button>
        ))}
        <button type="button" onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]">+ New Test</button>
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
                <th className="pb-2 pr-4">Test Type</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Cert Ref</th>
                <th className="pb-2 pr-4">PAC</th>
                <th className="pb-2 pr-4">SLA</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(ct => (
                <tr key={ct.id} className="border-b hover:bg-[#eef2f7] cursor-pointer" onClick={() => setSelected(ct)}>
                  <td className="py-2 pr-4 text-xs max-w-[180px] truncate">{ct.description?.slice(0, 60) ?? ct.project_id}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[ct.capacity_tier]}`}>{ct.capacity_tier}</span></td>
                  <td className="py-2 pr-4 text-xs font-medium">{ct.capacity_mw}</td>
                  <td className="py-2 pr-4 text-xs text-[#6b7685]">{ct.test_category ? TEST_LABELS[ct.test_category] ?? ct.test_category : '—'}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[ct.chain_status]}`}>{statusLabel(ct.chain_status).text}</span></td>
                  <td className="py-2 pr-4 text-xs font-mono text-green-700">{ct.cert_reference ?? '—'}</td>
                  <td className="py-2 pr-4 text-xs text-cyan-700">{fmtDate(ct.pac_issued_at)}</td>
                  <td className={`py-2 pr-4 text-xs ${ct.sla_breached ? 'text-red-600 font-semibold' : 'text-[#6b7685]'}`}>
                    {ct.sla_breached ? '⚠ BREACHED' : fmtDate(ct.sla_due_at)}
                  </td>
                  <td className="py-2 text-xs" style={{ color: 'oklch(0.46 0.16 55)' }}>View →</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-[#9aa5b4] text-sm">No commissioning test records found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold">Commissioning Test</h2>
                <div className="text-xs text-[#6b7685] mt-1">{selected.capacity_tier} · {selected.capacity_mw} MW</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-[#9aa5b4] hover:text-[#3d4756]">✕</button>
            </div>
            {selected.description && <div className="text-sm text-[#3d4756] bg-[#f8fafc] rounded p-3 mb-4">{selected.description}</div>}
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-[#6b7685]">Status:</span> <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status]}`}>{statusLabel(selected.chain_status).text}</span></div>
              <div><span className="text-[#6b7685]">Test Type:</span> {selected.test_category ? TEST_LABELS[selected.test_category] ?? selected.test_category : '—'}</div>
              {selected.contractor_firm && <div className="col-span-2"><span className="text-[#6b7685]">Contractor:</span> {selected.contractor_firm}</div>}
              {selected.ie_firm && <div className="col-span-2"><span className="text-[#6b7685]">IE:</span> {selected.ie_firm}</div>}
              {selected.pac_issued_at && <div><span className="text-[#6b7685]">PAC Issued:</span> <span className="text-cyan-700">{fmtDate(selected.pac_issued_at)}</span></div>}
              {selected.cert_reference && <div className="col-span-2"><span className="text-[#6b7685]">Cert Reference:</span> <span className="font-mono text-green-700">{selected.cert_reference}</span></div>}
              {selected.performance_cert_issued_at && <div><span className="text-[#6b7685]">Cert Issued:</span> <span className="text-green-700">{fmtDate(selected.performance_cert_issued_at)}</span></div>}
            </div>
            {ACTION_MAP[selected.chain_status] && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#6b7685] uppercase mb-1">Actions</div>
                {ACTION_MAP[selected.chain_status].map(a => (
                  <button type="button" key={a.action} disabled={actionPending}
                    onClick={() => doAction(selected.id, a.action)}
                    className={`w-full text-left px-3 py-2 rounded border text-sm ${a.danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-[#dde4ec] text-[#2d3748] hover:border-[oklch(0.87_0.010_250)]'}`}>
                    {a.label}
                    {a.tag && <span className={`ml-2 text-xs px-1 rounded ${a.tag.includes('REGULATOR') ? 'bg-red-100 text-red-700' : ''}`} style={!a.tag.includes('REGULATOR') ? { background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)' } : {}}>{a.tag}</span>}
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
            <h3 className="text-lg font-bold mb-4">New Commissioning Test</h3>
            <div className="space-y-3">
              <input placeholder="Installed capacity (MW) *" type="number" value={form.capacity_mw} onChange={e => setForm(f => ({ ...f, capacity_mw: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <select value={form.test_category} onChange={e => setForm(f => ({ ...f, test_category: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm text-[#2d3748]">
                <option value="">Test category (optional)</option>
                <option value="string_iv_test">String IV Test</option>
                <option value="ac_performance_test">AC Performance Test</option>
                <option value="protection_relay_test">Protection Relay Test</option>
                <option value="grid_compliance_test">Grid Compliance Test</option>
                <option value="full_commissioning">Full Commissioning</option>
              </select>
              <input placeholder="Contractor firm" value={form.contractor_firm} onChange={e => setForm(f => ({ ...f, contractor_firm: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="IE firm" value={form.ie_firm} onChange={e => setForm(f => ({ ...f, ie_firm: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={createRecord} disabled={!form.capacity_mw} className="px-4 py-2 bg-[#c2873a] text-white rounded text-sm hover:bg-[#a3702f] disabled:opacity-50">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-[#eef2f7] text-[#2d3748] rounded text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
