import { useState, useEffect } from 'react';

interface Refinancing {
  id: string;
  project_id: string;
  description?: string;
  refinancing_type: string;
  debt_quantum_zar: number;
  ownership_tier: string;
  sarb_approval_required: number;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  financial_close_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  closed_count: number;
  rejected_count: number;
  breached_count: number;
  total_debt_zar: number;
}

const STATUS_COLORS: Record<string, string> = {
  refinancing_mandated:      'bg-gray-100 text-gray-500',
  term_sheet_signed:         'bg-blue-100 text-blue-700',
  credit_approval:           'bg-indigo-100 text-indigo-700',
  conditions_precedent:      'bg-purple-100 text-purple-700',
  sarb_exchange_control:     'bg-orange-100 text-orange-800',
  nersa_clearance:           'bg-yellow-100 text-yellow-800',
  legal_documentation:       'bg-teal-100 text-teal-700',
  financial_close:           'bg-green-100 text-green-800',
  abandoned:                 'bg-gray-100 text-gray-400',
  rejected:                  'bg-red-100 text-red-700',
  lender_default:            'bg-red-200 text-red-900',
  recovery_in_progress:      'bg-orange-200 text-orange-900',
};

const TIER_COLORS: Record<string, string> = {
  minor:       'bg-slate-100 text-slate-600',
  moderate:    'bg-blue-100 text-blue-700',
  significant: 'bg-indigo-100 text-indigo-700',
  major:       'bg-orange-100 text-orange-800',
  material:    'bg-red-100 text-red-700',
};

const REFI_TYPE_LABELS: Record<string, string> = {
  term_loan_refinancing:           'Term loan refi',
  bond_issuance:                   'Bond issuance',
  green_bond:                      'Green bond',
  refinancing_with_equity_release: 'Equity release refi',
  debt_restructuring:              'Debt restructuring',
  lender_substitution:             'Lender substitution',
};

const TIERS = ['minor', 'moderate', 'significant', 'major', 'material'] as const;

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtZar(n?: number | null): string {
  if (n == null) return '—';
  if (n < 1_000_000) return `R${n.toLocaleString('en-ZA')}`;
  if (n < 1_000_000_000) return `R${(n / 1_000_000).toFixed(1)}M`;
  return `R${(n / 1_000_000_000).toFixed(1)}B`;
}

function isOverdue(sla_due_at?: string, sla_breached?: number): boolean {
  if (sla_breached) return true;
  if (!sla_due_at) return false;
  return new Date(sla_due_at) < new Date();
}

export function IppRefinancingTab() {
  const [items, setItems] = useState<Refinancing[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [form, setForm] = useState({
    project_id: '',
    debt_quantum_zar: '',
    refinancing_type: 'term_loan_refinancing',
    sarb_approval_required: false,
    description: '',
  });

  async function load(status?: string, tier?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (tier) params.set('tier', tier);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/ipp-refinancing?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const data = json?.data ?? json;
      setItems(data?.items ?? []);
      setKpis(data?.kpis ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createRefinancing() {
    if (!form.project_id || !form.debt_quantum_zar) return;
    setCreatePending(true);
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/ipp-refinancing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          project_id: form.project_id,
          debt_quantum_zar: parseFloat(form.debt_quantum_zar),
          refinancing_type: form.refinancing_type,
          sarb_approval_required: form.sarb_approval_required ? 1 : 0,
          description: form.description || undefined,
        }),
      });
      setShowCreate(false);
      setForm({ project_id: '', debt_quantum_zar: '', refinancing_type: 'term_loan_refinancing', sarb_approval_required: false, description: '' });
      load(filterStatus, filterTier);
    } finally {
      setCreatePending(false);
    }
  }

  const kpiCards = kpis
    ? [
        { label: 'Total', value: kpis.total },
        { label: 'Open / In-progress', value: kpis.open_count, alert: kpis.open_count > 0 },
        { label: 'Financial close', value: kpis.closed_count, good: kpis.closed_count > 0 },
        { label: 'Rejected', value: kpis.rejected_count, danger: kpis.rejected_count > 0 },
        { label: 'SLA breached', value: kpis.breached_count, danger: kpis.breached_count > 0 },
        { label: 'Total debt', value: fmtZar(kpis.total_debt_zar), wide: true },
      ]
    : [];

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      {kpiCards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {kpiCards.map(k => (
            <div
              key={k.label}
              className={`rounded-lg p-3 border ${
                (k as any).danger
                  ? 'border-red-200 bg-red-50'
                  : (k as any).alert
                  ? 'border-orange-200 bg-orange-50'
                  : (k as any).good
                  ? 'border-green-200 bg-green-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="text-xs text-gray-500">{k.label}</div>
              <div
                className={`text-xl font-bold ${
                  (k as any).danger ? 'text-red-700' : (k as any).alert ? 'text-orange-700' : (k as any).good ? 'text-green-700' : 'text-gray-900'
                }`}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterTier); }}
          className="border rounded px-2 py-1 text-xs text-gray-700 bg-white"
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <span className="text-gray-300">|</span>
        {TIERS.map(t => (
          <button
            key={t}
            onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt); }}
            className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-300'}`}
          >
            {t}
          </button>
        ))}
        <span className="text-gray-300">|</span>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
        >
          + New refinancing
        </button>
        <button
          onClick={() => load(filterStatus, filterTier)}
          className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs border border-gray-200 hover:bg-gray-200"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2 pr-4">Project / Description</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Debt quantum</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">SARB</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA due</th>
                <th className="pb-2 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const overdue = isOverdue(item.sla_due_at, item.sla_breached);
                const hasRegulator = !!item.financial_close_at;
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 text-xs max-w-[200px]">
                      <div className="truncate font-medium text-gray-800 font-mono">{item.project_id}</div>
                      {item.description && (
                        <div className="text-gray-400 truncate">{item.description}</div>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-600">
                      {REFI_TYPE_LABELS[item.refinancing_type] ?? item.refinancing_type}
                    </td>
                    <td className="py-2 pr-4 text-xs font-medium tabular-nums">
                      {fmtZar(item.debt_quantum_zar)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[item.ownership_tier] ?? 'bg-gray-100 text-gray-500'}`}>
                        {item.ownership_tier}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {item.sarb_approval_required ? (
                        <span title="SARB exchange control approval required">🌍</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {item.chain_status.replace(/_/g, ' ')}
                      </span>
                      {hasRegulator && (
                        <span className="ml-1 px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">REGULATOR</span>
                      )}
                    </td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.sla_due_at)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-400">{fmtDate(item.created_at)}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-400 text-sm">
                    No refinancing deals found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New refinancing modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">New Refinancing</h3>
            <div className="space-y-3">
              <input
                placeholder="Project ID *"
                value={form.project_id}
                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <input
                placeholder="Debt quantum (ZAR) *"
                type="number"
                min={0}
                value={form.debt_quantum_zar}
                onChange={e => setForm(f => ({ ...f, debt_quantum_zar: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <select
                value={form.refinancing_type}
                onChange={e => setForm(f => ({ ...f, refinancing_type: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm text-gray-700"
              >
                {Object.entries(REFI_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.sarb_approval_required}
                  onChange={e => setForm(f => ({ ...f, sarb_approval_required: e.target.checked }))}
                  className="rounded"
                />
                SARB exchange control approval required
              </label>
              <textarea
                placeholder="Description (optional)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
                rows={3}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={createRefinancing}
                disabled={createPending || !form.project_id || !form.debt_quantum_zar}
                className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {createPending ? 'Submitting…' : 'Create refinancing'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
