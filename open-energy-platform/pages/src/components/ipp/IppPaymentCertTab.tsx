import { useState } from 'react';
import { api } from '../../lib/api';

interface PaymentCert {
  id: string;
  cert_number: string;
  claim_type: string;
  value_tier: string;
  chain_status: string;
  claimed_value_zar: number;
  certified_value_zar?: number;
  period_from?: string;
  period_to?: string;
  description?: string;
  payment_due_at?: string;
  sla_due_at?: string;
  sla_breached: number;
  submitted_at?: string;
  certified_at?: string;
  paid_at?: string;
  adjudicated_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  paid_count: number;
  disputed_count: number;
  lapsed_count: number;
  adjudicated_count: number;
  breached_count: number;
  open_value_zar: number;
  total_paid_zar: number;
  outstanding_zar: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft:                    'bg-[#eef2f7] text-[#6b7685]',
  submitted:                'bg-[oklch(0.94_0.006_250)] text-[oklch(0.17_0.010_250)]',
  assessed:                 'bg-[oklch(0.94_0.006_250)] text-[oklch(0.17_0.010_250)]',
  certified:                'bg-green-100 text-green-800',
  disputed:                 'bg-red-100 text-red-800',
  revised:                  'bg-yellow-100 text-yellow-800',
  paid:                     'bg-green-200 text-green-900',
  final_payment:            'bg-emerald-200 text-emerald-900',
  adjudicated:              'bg-[#e8ecf0] text-[#1e2a38]',
  withdrawn:                'bg-[#eef2f7] text-[#6b7685]',
  lapsed:                   'bg-orange-100 text-orange-800',
  rejected:                 'bg-red-200 text-red-900',
};

const TIER_COLORS: Record<string, string> = {
  minor:        'bg-[#eef2f7] text-[#3d4756]',
  moderate:     'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  significant:  'bg-yellow-100 text-yellow-800',
  major:        'bg-orange-100 text-orange-800',
  material:     'bg-red-100 text-red-800',
};

const TYPE_LABELS: Record<string, string> = {
  progress:          'Progress',
  retention_release: 'Retention',
  final_account:     'Final Acct',
  variation:         'Variation',
  dayworks:          'Dayworks',
  loss_and_expense:  'L&E',
  advance_payment:   'Advance',
};

const ACTION_MAP: Record<string, { label: string; action: string; danger?: boolean; tag?: string }[]> = {
  draft:     [{ label: 'Submit Claim', action: 'submit_claim' }, { label: 'Withdraw', action: 'withdraw_claim', danger: true }],
  submitted: [{ label: 'Assess', action: 'assess_claim' }, { label: 'Dispute', action: 'dispute_certificate', danger: true }, { label: 'Reject', action: 'reject_claim', danger: true }],
  assessed:  [{ label: 'Certify Payment', action: 'certify_payment', tag: 'PA' }, { label: 'Certify Final', action: 'certify_final', tag: 'PA+REGULATOR' }, { label: 'Dispute', action: 'dispute_certificate', danger: true }],
  certified: [{ label: 'Confirm Payment Received', action: 'confirm_payment' }, { label: 'Dispute', action: 'dispute_certificate', danger: true }],
  disputed:  [{ label: 'Revise Certificate', action: 'revise_certificate' }, { label: 'Refer Adjudication', action: 'refer_adjudication', danger: true, tag: 'REGULATOR' }, { label: 'Withdraw', action: 'withdraw_claim', danger: true }],
  revised:   [{ label: 'Re-certify', action: 'certify_payment' }, { label: 'Confirm Payment', action: 'confirm_payment' }],
  lapsed:    [{ label: 'Confirm Payment', action: 'confirm_payment' }, { label: 'Refer Adjudication', action: 'refer_adjudication', danger: true, tag: 'REGULATOR' }],
};

function fmt(n?: number | null): string {
  if (n == null) return '—';
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function IppPaymentCertTab() {
  const [items, setItems] = useState<PaymentCert[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [selected, setSelected] = useState<PaymentCert | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ claim_type: 'progress', claimed_value_zar: '', period_from: '', period_to: '', description: '' });

  async function load(status?: string, tier?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (tier) params.set('tier', tier);
    const res = await api.get(`/ipp-payment-cert?${params}`);
    const j = res.data;
    setItems(j.data?.items ?? []);
    setKpis(j.data?.kpis ?? null);
    setLoaded(true);
    setLoading(false);
  }

  async function doAction(id: string, action: string) {
    setActionPending(true);
    await api.put(`/ipp-payment-cert/${id}/action`, { action });
    setActionPending(false);
    setSelected(null);
    load(filterStatus, filterTier);
  }

  async function createCert() {
    await api.post('/ipp-payment-cert', {
      project_id: 'proj_nxt_solar_001',
      claim_type: form.claim_type,
      claimed_value_zar: parseFloat(form.claimed_value_zar),
      period_from: form.period_from || undefined,
      period_to: form.period_to || undefined,
      description: form.description || undefined,
    });
    setShowCreate(false);
    setForm({ claim_type: 'progress', claimed_value_zar: '', period_from: '', period_to: '', description: '' });
    load(filterStatus, filterTier);
  }

  if (!loaded) {
    return (
      <div className="p-6">
        <button type="button" onClick={() => load()} className="px-4 py-2 bg-[#c2873a] text-white rounded hover:bg-[#a3702f] text-sm">
          Load Payment Certificates
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
            { label: 'Total Certs', value: kpis.total },
            { label: 'Open', value: kpis.open_count },
            { label: 'Disputed', value: kpis.disputed_count, alert: kpis.disputed_count > 0 },
            { label: 'Lapsed', value: kpis.lapsed_count, alert: kpis.lapsed_count > 0 },
          ].map(k => (
            <div key={k.label} className={`rounded-lg p-3 border ${k.alert ? 'border-red-300 bg-red-50' : 'border-[#dde4ec] bg-white'}`}>
              <div className="text-xs text-[#6b7685]">{k.label}</div>
              <div className={`text-xl font-bold ${k.alert ? 'text-red-700' : 'text-[#0f1c2e]'}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}
      {kpis && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg p-3 border border-[#dde4ec] bg-white">
            <div className="text-xs text-[#6b7685]">Open Claims</div>
            <div className="text-lg font-bold text-[#0f1c2e]">{fmt(kpis.open_value_zar)}</div>
          </div>
          <div className="rounded-lg p-3 border border-green-200 bg-green-50">
            <div className="text-xs text-[#6b7685]">Total Paid</div>
            <div className="text-lg font-bold text-green-700">{fmt(kpis.total_paid_zar)}</div>
          </div>
          <div className="rounded-lg p-3 border border-orange-200 bg-orange-50">
            <div className="text-xs text-[#6b7685]">Outstanding (Certified)</div>
            <div className="text-lg font-bold text-orange-700">{fmt(kpis.outstanding_zar)}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => { setFilterStatus(''); load('', filterTier); }} className={`px-3 py-1 rounded text-xs border ${!filterStatus ? 'bg-[#1e2a38] text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>All</button>
        {['submitted','assessed','certified','disputed','paid','lapsed'].map(s => (
          <button type="button" key={s} onClick={() => { setFilterStatus(s); load(s, filterTier); }} className={`px-3 py-1 rounded text-xs border ${filterStatus === s ? 'bg-[#1e2a38] text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>
            {s}
          </button>
        ))}
        <span className="ml-2 text-[#9aa5b4]">|</span>
        {['minor','moderate','significant','major','material'].map(t => (
          <button type="button" key={t} onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt); }} className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'bg-[#1e2a38] text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>{t}</button>
        ))}
        <button type="button" onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]">+ New Cert</button>
        <button type="button" onClick={() => load(filterStatus, filterTier)} className="px-3 py-1 bg-[#eef2f7] text-[#2d3748] rounded text-xs border">Refresh</button>
      </div>

      {/* Table */}
      {loading ? <div className="text-sm text-[#9aa5b4] py-4">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[#6b7685]">
                <th className="pb-2 pr-4">Cert #</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Period</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Claimed</th>
                <th className="pb-2 pr-4">Certified</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Payment Due</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(pc => (
                <tr key={pc.id} className="border-b hover:bg-[#eef2f7] cursor-pointer" onClick={() => setSelected(pc)}>
                  <td className="py-2 pr-4 font-mono text-xs font-semibold">{pc.cert_number}</td>
                  <td className="py-2 pr-4 text-xs text-[#3d4756]">{TYPE_LABELS[pc.claim_type] ?? pc.claim_type}</td>
                  <td className="py-2 pr-4 text-xs text-[#6b7685]">
                    {pc.period_from ? `${fmtDate(pc.period_from)} – ${fmtDate(pc.period_to)}` : (pc.description?.slice(0, 30) ?? '—')}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[pc.value_tier]}`}>{pc.value_tier}</span>
                  </td>
                  <td className="py-2 pr-4 text-xs font-medium">{fmt(pc.claimed_value_zar)}</td>
                  <td className="py-2 pr-4 text-xs text-green-700">{fmt(pc.certified_value_zar)}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[pc.chain_status]}`}>{pc.chain_status}</span>
                  </td>
                  <td className={`py-2 pr-4 text-xs ${pc.sla_breached || pc.chain_status === 'lapsed' ? 'text-red-600 font-semibold' : 'text-[#6b7685]'}`}>
                    {pc.chain_status === 'lapsed' ? '⚠ LAPSED' : pc.sla_breached ? '⚠ SLA BREACHED' : fmtDate(pc.payment_due_at ?? pc.sla_due_at)}
                  </td>
                  <td className="py-2 text-xs" style={{ color: 'oklch(0.46 0.16 55)' }}>View →</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-[#9aa5b4] text-sm">No payment certificates found</td></tr>
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
                <h2 className="text-lg font-bold">{selected.cert_number}</h2>
                <div className="text-xs text-[#6b7685] mt-1">{TYPE_LABELS[selected.claim_type] ?? selected.claim_type} · {selected.value_tier}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-[#9aa5b4] hover:text-[#3d4756]">✕</button>
            </div>

            {selected.description && (
              <div className="text-sm text-[#3d4756] bg-[#f8fafc] rounded p-3 mb-4">{selected.description}</div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-[#6b7685]">Claimed:</span> <span className="font-bold">{fmt(selected.claimed_value_zar)}</span></div>
              <div><span className="text-[#6b7685]">Certified:</span> <span className="font-bold text-green-700">{fmt(selected.certified_value_zar)}</span></div>
              <div><span className="text-[#6b7685]">Status:</span> <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status]}`}>{selected.chain_status}</span></div>
              <div><span className="text-[#6b7685]">Payment Due:</span> <span className={selected.chain_status === 'lapsed' ? 'text-red-600 font-bold' : 'text-[#2d3748]'}>{selected.chain_status === 'lapsed' ? '⚠ LAPSED' : fmtDate(selected.payment_due_at)}</span></div>
              {selected.period_from && <div className="col-span-2"><span className="text-[#6b7685]">Period:</span> {fmtDate(selected.period_from)} – {fmtDate(selected.period_to)}</div>}
              <div><span className="text-[#6b7685]">Submitted:</span> {fmtDate(selected.submitted_at)}</div>
              {selected.certified_at && <div><span className="text-[#6b7685]">Certified:</span> {fmtDate(selected.certified_at)}</div>}
              {selected.paid_at && <div><span className="text-[#6b7685]">Paid:</span> {fmtDate(selected.paid_at)}</div>}
            </div>

            {/* Actions */}
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

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">New Payment Certificate</h3>
            <div className="space-y-3">
              <select value={form.claim_type} onChange={e => setForm(f => ({ ...f, claim_type: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input placeholder="Claimed Value (ZAR) *" type="number" value={form.claimed_value_zar}
                onChange={e => setForm(f => ({ ...f, claimed_value_zar: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Period From" type="date" value={form.period_from}
                  onChange={e => setForm(f => ({ ...f, period_from: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm" />
                <input placeholder="Period To" type="date" value={form.period_to}
                  onChange={e => setForm(f => ({ ...f, period_to: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm" />
              </div>
              <textarea placeholder="Description" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={createCert} disabled={!form.claimed_value_zar}
                className="px-4 py-2 bg-[#c2873a] text-white rounded text-sm hover:bg-[#a3702f] disabled:opacity-50">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-[#eef2f7] text-[#2d3748] rounded text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
