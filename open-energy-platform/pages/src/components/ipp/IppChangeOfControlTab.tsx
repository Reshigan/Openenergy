import { useState, useEffect } from 'react';

interface ChangeOfControl {
  id: string;
  project_id: string;
  acquirer_name: string;
  transaction_type: string;
  capacity_mw?: number;
  ownership_tier: string;
  foreign_ownership_flag: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  approval_granted_at?: string;
  description?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  transferred_count: number;
  rejected_count: number;
  breached_count: number;
  foreign_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  notification_submitted:   'bg-gray-100 text-gray-500',
  completeness_check:       'bg-blue-100 text-blue-700',
  foreign_ownership_screen: 'bg-purple-100 text-purple-700',
  competition_screen:       'bg-indigo-100 text-indigo-700',
  technical_assessment:     'bg-cyan-100 text-cyan-700',
  public_participation:     'bg-orange-100 text-orange-800',
  nersa_evaluation:         'bg-yellow-100 text-yellow-800',
  conditional_approval:     'bg-teal-100 text-teal-700',
  control_transferred:      'bg-green-100 text-green-800',
  withdrawn:                'bg-gray-100 text-gray-400',
  rejected:                 'bg-red-100 text-red-700',
  appeal_filed:             'bg-orange-200 text-orange-800',
  appeal_determined:        'bg-gray-200 text-gray-600',
};

const TIER_COLORS: Record<string, string> = {
  minor:       'bg-slate-100 text-slate-600',
  moderate:    'bg-blue-100 text-blue-700',
  significant: 'bg-indigo-100 text-indigo-700',
  major:       'bg-orange-100 text-orange-800',
  material:    'bg-red-100 text-red-700',
};

const TX_TYPE_LABELS: Record<string, string> = {
  share_transfer:                  'Share transfer',
  asset_acquisition:               'Asset acquisition',
  merger_scheme_of_arrangement:    'Merger/scheme',
  management_buyout:               'MBO',
  fund_recycling:                  'Fund recycling',
  change_of_lender_step_in:        'Lender step-in',
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

const TIERS = ['minor', 'moderate', 'significant', 'major', 'material'] as const;

export function IppChangeOfControlTab() {
  const [items, setItems] = useState<ChangeOfControl[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterForeign, setFilterForeign] = useState<'all' | 'domestic' | 'foreign'>('all');
  const [selected, setSelected] = useState<ChangeOfControl | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [form, setForm] = useState({
    project_id: '',
    capacity_mw: '',
    transaction_type: 'share_transfer',
    acquirer_name: '',
    foreign_ownership_flag: 'domestic',
    description: '',
  });

  async function load(status?: string, tier?: string, foreign?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (tier) params.set('tier', tier);
      if (foreign && foreign !== 'all') params.set('foreign', foreign);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/ipp-change-of-control?${params}`, {
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

  async function createNotification() {
    if (!form.project_id || !form.acquirer_name) return;
    setCreatePending(true);
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/ipp-change-of-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          project_id: form.project_id,
          transaction_type: form.transaction_type,
          acquirer_name: form.acquirer_name,
          capacity_mw: form.capacity_mw ? parseFloat(form.capacity_mw) : undefined,
          foreign_ownership_flag: form.foreign_ownership_flag,
          description: form.description || undefined,
        }),
      });
      setShowCreate(false);
      setForm({ project_id: '', capacity_mw: '', transaction_type: 'share_transfer', acquirer_name: '', foreign_ownership_flag: 'domestic', description: '' });
      load(filterStatus, filterTier, filterForeign);
    } finally {
      setCreatePending(false);
    }
  }

  const kpiCards = kpis
    ? [
        { label: 'Total', value: kpis.total },
        { label: 'Open / In-progress', value: kpis.open_count, alert: kpis.open_count > 0 },
        { label: 'Control transferred', value: kpis.transferred_count, good: kpis.transferred_count > 0 },
        { label: 'Rejected', value: kpis.rejected_count, danger: kpis.rejected_count > 0 },
        { label: 'SLA breached', value: kpis.breached_count, danger: kpis.breached_count > 0 },
        { label: 'Foreign', value: kpis.foreign_count, alert: kpis.foreign_count > 0 },
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
                  ? 'border-orange-300 bg-orange-50'
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
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterTier, filterForeign); }}
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
            onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt, filterForeign); }}
            className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-300'}`}
          >
            {t}
          </button>
        ))}
        <span className="text-gray-300">|</span>
        {(['all', 'domestic', 'foreign'] as const).map(f => (
          <button
            key={f}
            onClick={() => { setFilterForeign(f); load(filterStatus, filterTier, f); }}
            className={`px-2 py-1 rounded text-xs border ${filterForeign === f ? 'bg-purple-700 text-white border-purple-700' : 'bg-white text-gray-600 border-gray-300'}`}
          >
            {f === 'all' ? 'All ownership' : f === 'foreign' ? '🌍 Foreign' : 'Domestic'}
          </button>
        ))}
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
        >
          + New notification
        </button>
        <button
          onClick={() => load(filterStatus, filterTier, filterForeign)}
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
                <th className="pb-2 pr-4">Acquirer / Project</th>
                <th className="pb-2 pr-4">Transaction type</th>
                <th className="pb-2 pr-4">Cap (MW)</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Foreign</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA due</th>
                <th className="pb-2 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const overdue = isOverdue(item.sla_due_at, item.sla_breached);
                const isForeign = item.foreign_ownership_flag !== 'domestic';
                const hasRegulator = !!item.approval_granted_at;
                return (
                  <tr
                    key={item.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelected(item)}
                  >
                    <td className="py-2 pr-4 text-xs max-w-[200px]">
                      <div className="truncate font-medium text-gray-800">{item.acquirer_name}</div>
                      <div className="text-gray-400 truncate font-mono">{item.project_id}</div>
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-600">
                      {TX_TYPE_LABELS[item.transaction_type] ?? item.transaction_type}
                    </td>
                    <td className="py-2 pr-4 text-xs font-medium">{item.capacity_mw ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[item.ownership_tier] ?? 'bg-gray-100 text-gray-500'}`}>
                        {item.ownership_tier}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {isForeign ? <span title={item.foreign_ownership_flag}>🌍</span> : <span className="text-gray-300">—</span>}
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
                    No change-of-control notifications found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail slide-over */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold">Change of Control</h2>
                <div className="text-xs text-gray-500 mt-1">
                  {TX_TYPE_LABELS[selected.transaction_type] ?? selected.transaction_type}
                  {' · '}
                  <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[selected.ownership_tier] ?? ''}`}>{selected.ownership_tier}</span>
                  {selected.foreign_ownership_flag !== 'domestic' && <span className="ml-1">🌍 {selected.foreign_ownership_flag}</span>}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
            </div>
            {selected.description && (
              <div className="text-sm text-gray-600 bg-gray-50 rounded p-3 mb-4">{selected.description}</div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <span className="text-gray-500 text-xs">Status</span>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status] ?? ''}`}>
                    {selected.chain_status.replace(/_/g, ' ')}
                  </span>
                  {selected.approval_granted_at && (
                    <span className="px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">REGULATOR</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Acquirer</span>
                <div className="text-xs font-medium">{selected.acquirer_name}</div>
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
                <span className="text-gray-500 text-xs">Ownership</span>
                <div className="text-xs">{selected.foreign_ownership_flag}</div>
              </div>
              <div>
                <span className="text-gray-500 text-xs">SLA due</span>
                <div className={isOverdue(selected.sla_due_at, selected.sla_breached) ? 'text-red-600 font-semibold' : ''}>
                  {isOverdue(selected.sla_due_at, selected.sla_breached) ? '⚠ ' : ''}{fmtDate(selected.sla_due_at)}
                </div>
              </div>
              {selected.approval_granted_at && (
                <div>
                  <span className="text-gray-500 text-xs">Approval granted</span>
                  <div className="text-green-700">{fmtDate(selected.approval_granted_at)}</div>
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

      {/* New notification modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">New Change-of-Control Notification</h3>
            <div className="space-y-3">
              <input
                placeholder="Project ID *"
                value={form.project_id}
                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <input
                placeholder="Acquirer name *"
                value={form.acquirer_name}
                onChange={e => setForm(f => ({ ...f, acquirer_name: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <select
                value={form.transaction_type}
                onChange={e => setForm(f => ({ ...f, transaction_type: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm text-gray-700"
              >
                {Object.entries(TX_TYPE_LABELS).map(([v, l]) => (
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
              <select
                value={form.foreign_ownership_flag}
                onChange={e => setForm(f => ({ ...f, foreign_ownership_flag: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm text-gray-700"
              >
                <option value="domestic">Domestic</option>
                <option value="sadc_resident">SADC resident</option>
                <option value="non_sadc_foreign">Non-SADC foreign</option>
              </select>
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
                onClick={createNotification}
                disabled={createPending || !form.project_id || !form.acquirer_name}
                className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {createPending ? 'Submitting…' : 'Submit notification'}
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
