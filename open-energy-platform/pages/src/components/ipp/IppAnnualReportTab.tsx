import { useState, useEffect } from 'react';

interface IppAnnualReport {
  id: string;
  project_id: string;
  reporting_year: number;
  capacity_mw: number;
  capacity_tier: string;
  report_category: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  submitted_at?: string;
  accepted_at?: string;
  rejected_at?: string;
  description?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  submitted_count: number;
  accepted_count: number;
  rejected_count: number;
  appeal_count: number;
  breached_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  report_due:          'bg-gray-100 text-gray-500',
  report_drafting:     'bg-blue-100 text-blue-700',
  data_collection:     'bg-blue-100 text-blue-700',
  internal_review:     'bg-blue-100 text-blue-700',
  submitted:           'bg-yellow-100 text-yellow-800',
  under_review:        'bg-yellow-100 text-yellow-800',
  queries_raised:      'bg-orange-100 text-orange-700',
  responses_submitted: 'bg-orange-100 text-orange-700',
  accepted:            'bg-green-100 text-green-800',
  rejected:            'bg-red-100 text-red-700',
  appeal_lodged:       'bg-purple-100 text-purple-700',
  appeal_determined:   'bg-purple-100 text-purple-700',
};

const TIER_COLORS: Record<string, string> = {
  small:     'bg-slate-100 text-slate-600',
  medium:    'bg-blue-100 text-blue-700',
  large:     'bg-indigo-100 text-indigo-700',
  utility:   'bg-orange-100 text-orange-800',
  strategic: 'bg-red-100 text-red-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  annual_returns:       'Annual Returns',
  licence_conditions:   'Licence Conditions',
  technical_compliance: 'Technical Compliance',
  financial_compliance: 'Financial Compliance',
};

const STATUSES = Object.keys(STATUS_COLORS);
const TIERS = ['small', 'medium', 'large', 'utility', 'strategic'] as const;
const CATEGORIES = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[];
const LARGE_TIERS = ['large', 'utility', 'strategic'];

const sel = 'border rounded px-2 py-1 text-xs text-gray-700 bg-white';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function hasRegulatorFlag(row: IppAnnualReport): boolean {
  return !!(row.rejected_at || (row.accepted_at && LARGE_TIERS.includes(row.capacity_tier)));
}

type KpiChipProps = { label: string; value: number; mode?: 'alert' | 'good' | 'danger' | 'neutral' };
function KpiChip({ label, value, mode = 'neutral' }: KpiChipProps) {
  const border = mode === 'danger' ? 'border-red-200 bg-red-50' : mode === 'alert' ? 'border-orange-200 bg-orange-50' : mode === 'good' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white';
  const text   = mode === 'danger' ? 'text-red-700'    : mode === 'alert' ? 'text-orange-700'   : mode === 'good' ? 'text-green-700'  : 'text-gray-900';
  return (
    <div className={`rounded-lg p-3 border ${border}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
    </div>
  );
}

export function IppAnnualReportTab() {
  const [items, setItems] = useState<IppAnnualReport[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [form, setForm] = useState({ project_id: '', reporting_year: new Date().getFullYear(), capacity_mw: '', report_category: 'annual_returns', description: '' });

  async function load(status = filterStatus, tier = filterTier, category = filterCategory) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status)   params.set('status', status);
      if (tier)     params.set('tier', tier);
      if (category) params.set('report_category', category);
      const res = await fetch(`/api/ipp-annual-report?${params}`, {
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

  async function createReport() {
    if (!form.project_id || !form.capacity_mw) return;
    setCreatePending(true);
    try {
      await fetch('/api/ipp-annual-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ project_id: form.project_id, reporting_year: form.reporting_year, capacity_mw: parseFloat(form.capacity_mw as string), report_category: form.report_category, description: form.description || undefined }),
      });
      setShowCreate(false);
      setForm({ project_id: '', reporting_year: new Date().getFullYear(), capacity_mw: '', report_category: 'annual_returns', description: '' });
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
          <KpiChip label="Total"        value={kpis.total} />
          <KpiChip label="Open"         value={kpis.open_count}     mode={kpis.open_count > 0 ? 'alert' : 'neutral'} />
          <KpiChip label="Accepted"     value={kpis.accepted_count} mode={kpis.accepted_count > 0 ? 'good' : 'neutral'} />
          <KpiChip label="SLA breached" value={kpis.breached_count} mode={kpis.breached_count > 0 ? 'danger' : 'neutral'} />
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={filterStatus}   onChange={e => { setFilterStatus(e.target.value);   load(e.target.value, filterTier, filterCategory); }}   className={sel}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filterTier}     onChange={e => { setFilterTier(e.target.value);     load(filterStatus, e.target.value, filterCategory); }}  className={sel}>
          <option value="">All tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); load(filterStatus, filterTier, e.target.value); }}       className={sel}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <button type="button" onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">
          + New Annual Report
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
                <th className="pb-2 pr-4">Year</th>
                <th className="pb-2 pr-4">Capacity</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA</th>
                <th className="pb-2 pr-4">Submitted</th>
                <th className="pb-2 pr-4">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const overdue = !!(item.sla_breached || (item.sla_due_at && new Date(item.sla_due_at) < new Date()));
                const regulator = hasRegulatorFlag(item);
                const outcome = item.accepted_at ? '✓ Accepted' : item.rejected_at ? '✗ Rejected' : '—';
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 text-xs font-mono text-gray-600">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-gray-700">{item.reporting_year}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-gray-700">{item.capacity_mw} MW</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[item.capacity_tier] ?? 'bg-gray-100 text-gray-500'}`}>{item.capacity_tier}</span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-600">{CATEGORY_LABELS[item.report_category] ?? item.report_category}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-gray-100 text-gray-500'}`}>{item.chain_status.replace(/_/g, ' ')}</span>
                      {regulator && <span className="ml-1 px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">REGULATOR</span>}
                    </td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.sla_due_at)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-500">{fmtDate(item.submitted_at)}</td>
                    <td className={`py-2 pr-4 text-xs font-medium ${item.accepted_at ? 'text-green-700' : item.rejected_at ? 'text-red-600' : 'text-gray-400'}`}>
                      {outcome}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-gray-400 text-sm">No annual compliance reports found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New Annual Report modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">New Annual Regulatory Compliance Report</h3>
            <p className="text-xs text-gray-500 mb-4">ERA 2006 &sect;33 &mdash; Annual compliance submission to NERSA. SLA is set from the capacity tier.</p>
            <div className="space-y-3">
              <input placeholder="Project ID *" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Reporting year *" type="number" min={2000} max={2100} value={form.reporting_year} onChange={e => setForm(f => ({ ...f, reporting_year: parseInt(e.target.value, 10) }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Capacity (MW) *" type="number" min={0} step="0.1" value={form.capacity_mw} onChange={e => setForm(f => ({ ...f, capacity_mw: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <select value={form.report_category} onChange={e => setForm(f => ({ ...f, report_category: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm text-gray-700">
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>)}
              </select>
              <textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" rows={3} />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={createReport} disabled={createPending || !form.project_id || !form.capacity_mw} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
                {createPending ? 'Submitting…' : 'Create report'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
