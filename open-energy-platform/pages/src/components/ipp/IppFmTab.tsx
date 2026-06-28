import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface IppFm {
  id: string;
  project_id: string;
  fm_category: string;
  lost_generation_mwh: number;
  fm_tier: string;
  description?: string;
  event_date?: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  notice_issued_at?: string;
  notice_verified_at?: string;
  relief_granted_at?: string;
  resolved_at?: string;
  arbitration_determined_at?: string;
  prolonged_declared_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  resolved_count: number;
  disputed_count: number;
  prolonged_count: number;
  breached_count: number;
  total_lost_mwh: number;
}

const STATUS_COLORS: Record<string, string> = {
  fm_event_occurred:          'bg-[#eef2f7] text-[#6b7685]',
  fm_notice_issued:           'bg-orange-100 text-orange-700',
  fm_notice_verified:         'bg-yellow-100 text-yellow-800',
  fm_relief_in_progress:      'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  fm_monitoring:              'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  fm_resolved:                'bg-green-100 text-green-800',
  fm_disputed:                'bg-red-100 text-red-700',
  fm_arbitration:             'bg-red-200 text-red-900',
  fm_arbitration_determined:  'bg-[#e8ecf0] text-[#2d3748]',
  fm_prolonged_termination:   'bg-red-300 text-red-950 font-semibold animate-pulse',
  withdrawn:                  'bg-[#eef2f7] text-[#9aa5b4]',
};

const TIER_COLORS: Record<string, string> = {
  minor:       'bg-[#eef2f7] text-[#3d4756]',
  moderate:    'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  significant: 'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  major:       'bg-orange-100 text-orange-800',
  material:    'bg-red-100 text-red-700',
};

const FM_CATEGORY_LABELS: Record<string, string> = {
  weather_event:     'Weather event',
  grid_failure:      'Grid failure',
  natural_disaster:  'Natural disaster',
  regulatory_change: 'Regulatory change',
  pandemic:          'Pandemic',
  war_civil_unrest:  'War/civil unrest',
  supplier_fm:       'Supplier FM',
};

const TIERS = ['minor', 'moderate', 'significant', 'major', 'material'] as const;

const FM_CATEGORIES = Object.keys(FM_CATEGORY_LABELS) as (keyof typeof FM_CATEGORY_LABELS)[];

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMwh(n?: number | null): string {
  if (n == null) return '—';
  return `${n.toLocaleString('en-ZA')} MWh`;
}

function isOverdue(sla_due_at?: string, sla_breached?: number): boolean {
  if (sla_breached) return true;
  if (!sla_due_at) return false;
  return new Date(sla_due_at) < new Date();
}

function hasRegulatorFlag(item: IppFm): boolean {
  return !!(item.relief_granted_at || item.prolonged_declared_at);
}

export function IppFmTab() {
  const [items, setItems] = useState<IppFm[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [form, setForm] = useState({
    project_id: '',
    fm_category: 'weather_event',
    lost_generation_mwh: '',
    description: '',
    event_date: '',
  });

  async function load(status?: string, tier?: string, category?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status)   params.set('status', status);
      if (tier)     params.set('tier', tier);
      if (category) params.set('fm_category', category);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/ipp-fm?${params}`, {
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

  async function createFmDeclaration() {
    if (!form.project_id || !form.lost_generation_mwh || !form.fm_category) return;
    setCreatePending(true);
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/ipp-fm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          project_id: form.project_id,
          fm_category: form.fm_category,
          lost_generation_mwh: parseFloat(form.lost_generation_mwh),
          description: form.description || undefined,
          event_date: form.event_date || undefined,
        }),
      });
      setShowCreate(false);
      setForm({ project_id: '', fm_category: 'weather_event', lost_generation_mwh: '', description: '', event_date: '' });
      load(filterStatus, filterTier, filterCategory);
    } finally {
      setCreatePending(false);
    }
  }

  const kpiCards = kpis
    ? [
        { label: 'Total',           value: kpis.total },
        { label: 'Open',            value: kpis.open_count,     alert: kpis.open_count > 0 },
        { label: 'Resolved',        value: kpis.resolved_count, good: kpis.resolved_count > 0 },
        { label: 'Disputed',        value: kpis.disputed_count, danger: kpis.disputed_count > 0 },
        { label: 'Prolonged',       value: kpis.prolonged_count, danger: kpis.prolonged_count > 0 },
        { label: 'SLA breached',    value: kpis.breached_count, danger: kpis.breached_count > 0 },
        { label: 'Total lost MWh',  value: fmtMwh(kpis.total_lost_mwh), wide: true },
      ]
    : [];

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      {kpiCards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
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
                  : 'border-[#dde4ec] bg-white'
              }`}
            >
              <div className="text-xs text-[#6b7685]">{k.label}</div>
              <div
                className={`text-xl font-bold ${
                  (k as any).danger
                    ? 'text-red-700'
                    : (k as any).alert
                    ? 'text-orange-700'
                    : (k as any).good
                    ? 'text-green-700'
                    : 'text-[#0f1c2e]'
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
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterTier, filterCategory); }}
          className="border rounded px-2 py-1 text-xs text-[#2d3748] bg-white"
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={e => { setFilterCategory(e.target.value); load(filterStatus, filterTier, e.target.value); }}
          className="border rounded px-2 py-1 text-xs text-[#2d3748] bg-white"
        >
          <option value="">All categories</option>
          {FM_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{FM_CATEGORY_LABELS[cat]}</option>
          ))}
        </select>
        <span className="text-[#9aa5b4]">|</span>
        {TIERS.map(t => (
          <button type="button"
            key={t}
            onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt, filterCategory); }}
            className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'text-white' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}
            style={filterTier === t ? { background: 'oklch(0.46 0.16 55)', borderColor: 'oklch(0.46 0.16 55)' } : undefined}
          >
            {t}
          </button>
        ))}
        <span className="text-[#9aa5b4]">|</span>
        <button type="button"
          onClick={() => setShowCreate(true)}
          className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]"
        >
          + New FM declaration
        </button>
        <button type="button"
          onClick={() => load(filterStatus, filterTier, filterCategory)}
          className="px-3 py-1 bg-[#eef2f7] text-[#2d3748] rounded text-xs border border-[#dde4ec] hover:bg-[#e8ecf0]"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-[#9aa5b4] py-8 text-center">Loading&hellip;</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[#6b7685]">
                <th className="pb-2 pr-4">Project / Description</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">Lost gen</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Event date</th>
                <th className="pb-2 pr-4">SLA due</th>
                <th className="pb-2 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const overdue   = isOverdue(item.sla_due_at, item.sla_breached);
                const regulator = hasRegulatorFlag(item);
                return (
                  <tr key={item.id} className="border-b hover:bg-[#eef2f7]">
                    <td className="py-2 pr-4 text-xs max-w-[220px]">
                      <div className="truncate font-medium text-[#1e2a38] font-mono">{item.project_id}</div>
                      {item.description && (
                        <div className="text-[#9aa5b4] truncate">{item.description}</div>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#3d4756]">
                      {FM_CATEGORY_LABELS[item.fm_category] ?? item.fm_category}
                    </td>
                    <td className="py-2 pr-4 text-xs font-medium tabular-nums">
                      {fmtMwh(item.lost_generation_mwh)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[item.fm_tier] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {item.fm_tier}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {statusLabel(item.chain_status).text}
                      </span>
                      {regulator && (
                        <span className="ml-1 px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">
                          REGULATOR
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#6b7685]">{fmtDate(item.event_date)}</td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-[#6b7685]'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.sla_due_at)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#9aa5b4]">{fmtDate(item.created_at)}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#9aa5b4] text-sm">
                    No force majeure declarations found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New FM declaration modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">New FM Declaration</h3>
            <p className="text-xs text-[#6b7685] mb-4">
              REIPPPP PPA Schedule 6 &mdash; Force Majeure notice. SLA deadline is set automatically from
              the lost generation quantum.
            </p>
            <div className="space-y-3">
              <input
                placeholder="Project ID *"
                value={form.project_id}
                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <select
                value={form.fm_category}
                onChange={e => setForm(f => ({ ...f, fm_category: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm text-[#2d3748]"
              >
                {FM_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{FM_CATEGORY_LABELS[cat]}</option>
                ))}
              </select>
              <input
                placeholder="Lost generation (MWh) *"
                type="number"
                min={0}
                step="0.1"
                value={form.lost_generation_mwh}
                onChange={e => setForm(f => ({ ...f, lost_generation_mwh: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <input
                placeholder="Event date (YYYY-MM-DD)"
                type="date"
                value={form.event_date}
                onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm text-[#2d3748]"
              />
              <textarea
                placeholder="Description (optional)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
                rows={3}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button"
                onClick={createFmDeclaration}
                disabled={createPending || !form.project_id || !form.lost_generation_mwh}
                className="px-4 py-2 bg-[#c2873a] text-white rounded text-sm hover:bg-[#a3702f] disabled:opacity-50"
              >
                {createPending ? 'Submitting…' : 'Declare FM event'}
              </button>
              <button type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-[#eef2f7] text-[#2d3748] rounded text-sm hover:bg-[#e8ecf0]"
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
