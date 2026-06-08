import { useState, useEffect } from 'react';

interface LtaCertificate {
  id: string;
  project_id: string;
  lta_firm_name?: string;
  drawdown_amount_zar: number;
  drawdown_tier: string;
  certificate_category: string;
  drawdown_reference?: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  site_inspection_at?: string;
  certificate_approved_at?: string;
  certificate_refused_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  approved_count: number;
  refused_count: number;
  appeal_count: number;
  breached_count: number;
  total_approved_zar: number;
}

const STATUS_COLORS: Record<string, string> = {
  certificate_requested:            'bg-gray-100 text-gray-500',
  site_inspection_in_progress:      'bg-blue-100 text-blue-700',
  progress_assessment:              'bg-yellow-100 text-yellow-800',
  draft_certificate_issued:         'bg-amber-100 text-amber-700',
  borrower_comments_submitted:      'bg-amber-100 text-amber-700',
  final_certificate_in_review:      'bg-orange-100 text-orange-700',
  certificate_approved:             'bg-green-100 text-green-700',
  certificate_qualified:            'bg-teal-100 text-teal-700',
  conditions_resolved:              'bg-green-100 text-green-700',
  certificate_refused:              'bg-red-100 text-red-700',
  appeal_raised:                    'bg-purple-100 text-purple-700',
  appeal_determined:                'bg-purple-50 text-purple-600',
};

const TIER_COLORS: Record<string, string> = {
  minor:      'bg-slate-100 text-slate-600',
  moderate:   'bg-blue-100 text-blue-700',
  significant:'bg-indigo-100 text-indigo-700',
  major:      'bg-orange-100 text-orange-800',
  material:   'bg-red-100 text-red-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  construction_progress:  'Construction Progress',
  completion_certificate: 'Completion Cert',
  cost_to_complete:       'Cost to Complete',
  change_order_approval:  'Change Order',
  commissioning_readiness:'Commissioning',
};

const STATUSES = Object.keys(STATUS_COLORS);
const TIERS = ['minor', 'moderate', 'significant', 'major', 'material'] as const;

const sel = 'border rounded px-2 py-1 text-xs text-gray-700 bg-white';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtZar(n: number): string {
  if (n >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `R${(n / 1_000_000).toFixed(1)}M`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function hasRegulatorFlag(row: LtaCertificate): boolean {
  const tier = row.drawdown_tier;
  if (row.certificate_refused_at && ['significant', 'major', 'material'].includes(tier)) return true;
  if (row.certificate_approved_at && ['major', 'material'].includes(tier)) return true;
  return false;
}

type KpiChipProps = { label: string; value: string | number; mode?: 'alert' | 'good' | 'danger' | 'neutral' };
function KpiChip({ label, value, mode = 'neutral' }: KpiChipProps) {
  const border = mode === 'danger' ? 'border-red-200 bg-red-50' : mode === 'alert' ? 'border-orange-200 bg-orange-50' : mode === 'good' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white';
  const text   = mode === 'danger' ? 'text-red-700' : mode === 'alert' ? 'text-orange-700' : mode === 'good' ? 'text-green-700' : 'text-gray-900';
  return (
    <div className={`rounded-lg p-3 border ${border}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
    </div>
  );
}

export function IppLtaCertificateTab() {
  const [items, setItems] = useState<LtaCertificate[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [form, setForm] = useState({
    project_id: '',
    drawdown_amount_zar: '',
    certificate_category: '',
    drawdown_reference: '',
    lta_firm_name: '',
  });

  async function load(status = filterStatus, tier = filterTier) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (tier)   params.set('tier', tier);
      const res = await fetch(`/api/ipp-lta-certificate?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const json = await res.json();
      const d = json?.data ?? json;
      setItems(d?.items ?? []);
      setKpis(d?.kpis ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createCertificate() {
    if (!form.project_id || !form.drawdown_amount_zar || !form.certificate_category) return;
    setCreatePending(true);
    try {
      await fetch('/api/ipp-lta-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          project_id:           form.project_id,
          drawdown_amount_zar:  parseFloat(form.drawdown_amount_zar),
          certificate_category: form.certificate_category,
          drawdown_reference:   form.drawdown_reference || undefined,
          lta_firm_name:        form.lta_firm_name || undefined,
        }),
      });
      setShowCreate(false);
      setForm({ project_id: '', drawdown_amount_zar: '', certificate_category: '', drawdown_reference: '', lta_firm_name: '' });
      load();
    } finally {
      setCreatePending(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiChip label="Total"    value={kpis.total} />
          <KpiChip label="Open"     value={kpis.open_count}     mode={kpis.open_count > 0 ? 'alert' : 'neutral'} />
          <KpiChip label="Approved" value={kpis.approved_count} mode={kpis.approved_count > 0 ? 'good' : 'neutral'} />
          <KpiChip label="Refused"  value={kpis.refused_count}  mode={kpis.refused_count > 0 ? 'danger' : 'neutral'} />
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterTier); }} className={sel}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filterTier} onChange={e => { setFilterTier(e.target.value); load(filterStatus, e.target.value); }} className={sel}>
          <option value="">All tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="button" onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">
          + New Certificate Request
        </button>
        <button type="button" onClick={() => load()} className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs border border-gray-200 hover:bg-gray-200">
          Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading&hellip;</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2 pr-4">ID</th>
                <th className="pb-2 pr-4">LTA Firm</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA</th>
                <th className="pb-2 pr-4">Inspection</th>
                <th className="pb-2 pr-4">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const overdue = !!(item.sla_breached || (item.sla_due_at && new Date(item.sla_due_at) < new Date()));
                const regulator = hasRegulatorFlag(item);
                const outcome = item.certificate_approved_at
                  ? { label: '✓ Approved', cls: 'text-green-700' }
                  : item.certificate_refused_at
                  ? { label: '✗ Refused', cls: 'text-red-700' }
                  : { label: '—', cls: 'text-gray-400' };
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 text-xs font-mono text-gray-600">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs text-gray-700">{item.lta_firm_name ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-gray-700">{fmtZar(item.drawdown_amount_zar)}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[item.drawdown_tier] ?? 'bg-gray-100 text-gray-500'}`}>{item.drawdown_tier}</span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-700">{CATEGORY_LABELS[item.certificate_category] ?? item.certificate_category}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-gray-100 text-gray-500'}`}>{item.chain_status.replace(/_/g, ' ')}</span>
                      {regulator && <span className="ml-1 px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">REGULATOR</span>}
                    </td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.sla_due_at)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-600">{fmtDate(item.site_inspection_at)}</td>
                    <td className={`py-2 pr-4 text-xs font-medium ${outcome.cls}`}>{outcome.label}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-gray-400 text-sm">No LTA drawdown certificates found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New Certificate Request modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">New Certificate Request</h3>
            <p className="text-xs text-gray-500 mb-4">LTA drawdown certificate — Tier and SLA are derived from the drawdown amount at submission.</p>
            <div className="space-y-3">
              <input placeholder="Project ID *" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Drawdown Amount (ZAR) *" type="number" min={0} step="0.01" value={form.drawdown_amount_zar} onChange={e => setForm(f => ({ ...f, drawdown_amount_zar: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <select value={form.certificate_category} onChange={e => setForm(f => ({ ...f, certificate_category: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm text-gray-700">
                <option value="">Certificate Category *</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input placeholder="Drawdown Reference" value={form.drawdown_reference} onChange={e => setForm(f => ({ ...f, drawdown_reference: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="LTA Firm Name" value={form.lta_firm_name} onChange={e => setForm(f => ({ ...f, lta_firm_name: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={createCertificate} disabled={createPending || !form.project_id || !form.drawdown_amount_zar || !form.certificate_category} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
                {createPending ? 'Submitting…' : 'Create request'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
