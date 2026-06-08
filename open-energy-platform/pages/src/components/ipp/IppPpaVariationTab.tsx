import { useState, useEffect } from 'react';

interface PpaVariation {
  id: string;
  project_id: string;
  description?: string;
  variation_type: string;
  capacity_mw?: number;
  variation_tier: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  variation_approved_at?: string;
  ppa_amended_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  approved_count: number;
  amended_count: number;
  rejected_count: number;
  breached_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  variation_requested:   'bg-gray-100 text-gray-500',
  regulatory_screen:     'bg-blue-100 text-blue-700',
  technical_review:      'bg-indigo-100 text-indigo-700',
  commercial_review:     'bg-purple-100 text-purple-700',
  public_participation:  'bg-orange-100 text-orange-800',
  nersa_assessment:      'bg-yellow-100 text-yellow-800',
  variation_approved:    'bg-teal-100 text-teal-700',
  ppa_amended:           'bg-green-100 text-green-800',
  withdrawn:             'bg-gray-100 text-gray-400',
  rejected:              'bg-red-100 text-red-700',
  appeal_filed:          'bg-orange-100 text-orange-700',
  appeal_determined:     'bg-gray-200 text-gray-600',
};

const TIER_COLORS: Record<string, string> = {
  minor:        'bg-slate-100 text-slate-600',
  moderate:     'bg-blue-100 text-blue-700',
  significant:  'bg-indigo-100 text-indigo-700',
  major:        'bg-orange-100 text-orange-800',
  material:     'bg-red-100 text-red-700',
};

const VARIATION_TYPE_LABELS: Record<string, string> = {
  capacity_adjustment:    'Capacity adj.',
  tariff_revision:        'Tariff revision',
  term_extension:         'Term extension',
  offtaker_substitution:  'Offtaker sub.',
  technical_parameters:   'Tech. params',
};

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isOverdue(sla_due_at?: string, sla_breached?: number): boolean {
  if (sla_breached) return true;
  if (!sla_due_at) return false;
  return new Date(sla_due_at) < new Date();
}

export function IppPpaVariationTab() {
  const [items, setItems] = useState<PpaVariation[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [selected, setSelected] = useState<PpaVariation | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [form, setForm] = useState({
    project_id: '',
    capacity_mw: '',
    variation_type: 'capacity_adjustment',
    description: '',
  });

  async function load(status?: string, tier?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (tier) params.set('tier', tier);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/ipp-ppa-variation?${params}`, {
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

  async function createVariation() {
    if (!form.project_id || !form.description) return;
    setCreatePending(true);
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/ipp-ppa-variation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          project_id: form.project_id,
          variation_type: form.variation_type,
          capacity_mw: form.capacity_mw ? parseFloat(form.capacity_mw) : undefined,
          description: form.description,
        }),
      });
      setShowCreate(false);
      setForm({ project_id: '', capacity_mw: '', variation_type: 'capacity_adjustment', description: '' });
      load(filterStatus, filterTier);
    } finally {
      setCreatePending(false);
    }
  }

  const kpiCards = kpis
    ? [
        { label: 'Total', value: kpis.total },
        { label: 'Open / In-progress', value: kpis.open_count, alert: kpis.open_count > 0 },
        { label: 'Approved', value: kpis.approved_count, good: kpis.approved_count > 0 },
        { label: 'PPA Amended', value: kpis.amended_count, good: kpis.amended_count > 0 },
        { label: 'Rejected', value: kpis.rejected_count, danger: kpis.rejected_count > 0 },
        { label: 'SLA Breached', value: kpis.breached_count, danger: kpis.breached_count > 0 },
      ]
    : [];

  const FILTER_STATUSES = [
    'variation_requested', 'technical_review', 'commercial_review',
    'nersa_assessment', 'variation_approved', 'ppa_amended', 'rejected',
  ];

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      {kpiCards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {kpiCards.map(k => (
            <div
              key={k.label}
              className={`rounded-lg p-3 border ${
                k.danger
                  ? 'border-red-200 bg-red-50'
                  : k.alert
                  ? 'border-orange-300 bg-orange-50'
                  : k.good
                  ? 'border-green-200 bg-green-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="text-xs text-gray-500">{k.label}</div>
              <div
                className={`text-xl font-bold ${
                  k.danger ? 'text-red-700' : k.alert ? 'text-orange-700' : k.good ? 'text-green-700' : 'text-gray-900'
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
        <button type="button"
          onClick={() => { setFilterStatus(''); load('', filterTier); }}
          className={`px-3 py-1 rounded text-xs border ${!filterStatus ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300'}`}
        >
          All
        </button>
        {FILTER_STATUSES.map(s => (
          <button type="button"
            key={s}
            onClick={() => { setFilterStatus(s); load(s, filterTier); }}
            className={`px-3 py-1 rounded text-xs border ${filterStatus === s ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300'}`}
          >
            {s.replace(/_/g, ' ')}
          </button>
        ))}
        <span className="text-gray-300">|</span>
        {(['minor', 'moderate', 'significant', 'major', 'material'] as const).map(t => (
          <button type="button"
            key={t}
            onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt); }}
            className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-300'}`}
          >
            {t}
          </button>
        ))}
        <button type="button"
          onClick={() => setShowCreate(true)}
          className="ml-auto px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
        >
          + New variation
        </button>
        <button type="button"
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
                <th className="pb-2 pr-4">Cap (MW)</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA due</th>
                <th className="pb-2 pr-4">Created</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const overdue = isOverdue(item.sla_due_at, item.sla_breached);
                const hasRegulator = !!item.variation_approved_at;
                return (
                  <tr
                    key={item.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelected(item)}
                  >
                    <td className="py-2 pr-4 text-xs max-w-[200px]">
                      <div className="truncate font-medium text-gray-800">{item.description?.slice(0, 60) ?? item.project_id}</div>
                      <div className="text-gray-400 truncate">{item.project_id}</div>
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-600">
                      {VARIATION_TYPE_LABELS[item.variation_type] ?? item.variation_type}
                    </td>
                    <td className="py-2 pr-4 text-xs font-medium">{item.capacity_mw ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[item.variation_tier] ?? 'bg-gray-100 text-gray-500'}`}>
                        {item.variation_tier}
                      </span>
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
                    <td className="py-2 text-xs text-indigo-600 whitespace-nowrap">View →</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-400 text-sm">
                    No PPA variation applications found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail slide-over */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex justify-end"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold">PPA Variation</h2>
                <div className="text-xs text-gray-500 mt-1">
                  {VARIATION_TYPE_LABELS[selected.variation_type] ?? selected.variation_type}
                  {' · '}
                  <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[selected.variation_tier] ?? ''}`}>{selected.variation_tier}</span>
                </div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
            </div>

            {selected.description && (
              <div className="text-sm text-gray-600 bg-gray-50 rounded p-3 mb-4">{selected.description}</div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <span className="text-gray-500 text-xs">Status</span>
                <div>
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status] ?? ''}`}>
                    {selected.chain_status.replace(/_/g, ' ')}
                  </span>
                  {selected.variation_approved_at && (
                    <span className="ml-1 px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">REGULATOR</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Project</span>
                <div className="text-xs font-mono">{selected.project_id}</div>
              </div>
              {selected.capacity_mw != null && (
                <div>
                  <span className="text-gray-500 text-xs">Capacity</span>
                  <div className="font-medium">{selected.capacity_mw} MW</div>
                </div>
              )}
              <div>
                <span className="text-gray-500 text-xs">SLA due</span>
                <div className={isOverdue(selected.sla_due_at, selected.sla_breached) ? 'text-red-600 font-semibold' : ''}>
                  {isOverdue(selected.sla_due_at, selected.sla_breached) ? '⚠ ' : ''}{fmtDate(selected.sla_due_at)}
                </div>
              </div>
              {selected.variation_approved_at && (
                <div>
                  <span className="text-gray-500 text-xs">Approved</span>
                  <div className="text-green-700">{fmtDate(selected.variation_approved_at)}</div>
                </div>
              )}
              {selected.ppa_amended_at && (
                <div>
                  <span className="text-gray-500 text-xs">PPA amended</span>
                  <div className="text-green-700">{fmtDate(selected.ppa_amended_at)}</div>
                </div>
              )}
              <div>
                <span className="text-gray-500 text-xs">Created</span>
                <div>{fmtDate(selected.created_at)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New variation modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">New PPA Variation</h3>
            <div className="space-y-3">
              <input
                placeholder="Project ID *"
                value={form.project_id}
                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <select
                value={form.variation_type}
                onChange={e => setForm(f => ({ ...f, variation_type: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm text-gray-700"
              >
                {Object.entries(VARIATION_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <input
                placeholder="Capacity (MW) — if applicable"
                type="number"
                value={form.capacity_mw}
                onChange={e => setForm(f => ({ ...f, capacity_mw: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Description *"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
                rows={3}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button"
                onClick={createVariation}
                disabled={createPending || !form.project_id || !form.description}
                className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {createPending ? 'Creating…' : 'Create'}
              </button>
              <button type="button"
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
