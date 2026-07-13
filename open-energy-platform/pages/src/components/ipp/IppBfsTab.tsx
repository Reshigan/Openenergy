import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface BfsStudy {
  id: string;
  participant_id: string;
  project_id: string;
  trigger_category: 'scope_change' | 'component_substitution' | 'tariff_rebid' | 'resource_update' | 'periodic_refresh' | 'lender_request';
  capacity_mw: number;
  bfs_capacity_tier: 'small' | 'medium' | 'large' | 'utility' | 'strategic';
  ie_firm_name: string | null;
  bfs_reference: string | null;
  p50_yield_gwh: number | null;
  p90_yield_gwh: number | null;
  chain_status: string;
  sla_due_at: string;
  sla_breached: number;
  submitted_to_ie_at: string | null;
  bfs_certified_at: string | null;
  bfs_rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

type StatusStyle = { className: string; style?: CSSProperties };
const STATUS_COLORS: Record<string, StatusStyle> = {
  bfs_triggered:             { className: 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]' },
  scope_definition:          { className: '', style: { background: 'var(--s2, oklch(0.94 0.006 250))', color: 'var(--accent, oklch(0.46 0.16 55))' } },
  data_collection:           { className: 'bg-sky-100 text-sky-700' },
  analysis_in_progress:      { className: '', style: { background: 'var(--s2, oklch(0.94 0.006 250))', color: 'var(--accent, oklch(0.46 0.16 55))' } },
  draft_bfs_issued:          { className: 'bg-yellow-100 text-yellow-800' },
  peer_review:               { className: 'bg-amber-100 text-amber-700' },
  ipp_comments_submitted:    { className: 'bg-teal-100 text-teal-700' },
  ie_review:                 { className: 'bg-purple-100 text-purple-700' },
  queries_raised:            { className: 'bg-orange-100 text-orange-700' },
  responses_submitted:       { className: 'bg-cyan-100 text-cyan-700' },
  bfs_certified:             { className: 'bg-green-100 text-green-700' },
  bfs_rejected:              { className: 'bg-red-100 text-red-700' },
};

const TIER_COLORS: Record<string, string> = {
  small:     'var(--ink-2, #6b7280)',
  medium:    '#3b82f6',
  large:     '#f59e0b',
  utility:   'var(--bad, #ef4444)',
  strategic: '#7c3aed',
};

const TRIGGER_LABELS: Record<string, string> = {
  scope_change:           'Scope Change',
  component_substitution: 'Component Sub.',
  tariff_rebid:           'Tariff Re-bid',
  resource_update:        'Resource Update',
  periodic_refresh:       'Periodic Refresh',
  lender_request:         'Lender Request',
};

const TERMINAL_STATUSES = new Set(['bfs_certified', 'bfs_rejected']);

const STATUSES = Object.keys(STATUS_COLORS);
const TIERS = ['small', 'medium', 'large', 'utility', 'strategic'] as const;
const CATEGORIES = Object.keys(TRIGGER_LABELS);

const sel = 'border rounded px-2 py-1 text-xs text-[var(--ink, #2d3748)] bg-surface-v2';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function hasRegulatorFlag(row: BfsStudy): boolean {
  if (row.bfs_rejected_at !== null) return true;
  if (row.bfs_certified_at !== null && (row.bfs_capacity_tier === 'utility' || row.bfs_capacity_tier === 'strategic')) return true;
  return false;
}

type KpiChipProps = { label: string; value: string | number; mode?: 'alert' | 'good' | 'danger' | 'neutral' };
function KpiChip({ label, value, mode = 'neutral' }: KpiChipProps) {
  const border = mode === 'danger' ? 'border-red-200 bg-red-50' : mode === 'alert' ? 'border-orange-200 bg-orange-50' : mode === 'good' ? 'border-green-200 bg-green-50' : 'border-[var(--border-subtle, #dde4ec)] bg-surface-v2';
  const text   = mode === 'danger' ? 'text-red-700' : mode === 'alert' ? 'text-orange-700' : mode === 'good' ? 'text-green-700' : 'text-[var(--ink, #0f1c2e)]';
  return (
    <div className={`rounded-lg p-3 border ${border}`}>
      <div className="text-xs text-[var(--ink-2, #6b7685)]">{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
    </div>
  );
}

export function IppBfsTab() {
  const [items, setItems] = useState<BfsStudy[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  async function load(status = filterStatus, tier = filterTier, category = filterCategory) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status)   params.set('status', status);
      if (tier)     params.set('tier', tier);
      if (category) params.set('category', category);
      const res = await fetch(`/api/ipp-bfs?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const json = await res.json();
      const d = json?.data ?? json;
      setItems(d?.items ?? d ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive KPIs client-side from items
  const total     = items.length;
  const open      = items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const certified = items.filter(i => i.bfs_certified_at !== null).length;
  const breached  = items.filter(i => i.sla_breached === 1).length;

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total BFS Studies" value={total} />
        <KpiChip label="Open"              value={open}      mode={open > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="Certified"         value={certified} mode={certified > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Breached"          value={breached}  mode={breached > 0 ? 'danger' : 'neutral'} />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterTier, filterCategory); }} className={sel}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filterTier} onChange={e => { setFilterTier(e.target.value); load(filterStatus, e.target.value, filterCategory); }} className={sel}>
          <option value="">All tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); load(filterStatus, filterTier, e.target.value); }} className={sel}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{TRIGGER_LABELS[c]}</option>)}
        </select>
        <button type="button" onClick={() => load()} className="ml-auto px-3 py-1 bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)] rounded text-xs border border-[var(--border-subtle, #dde4ec)] hover:bg-[var(--border-subtle, #e8ecf0)]">
          Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-[var(--ink-2, #9aa5b4)] py-8 text-center">Loading&hellip;</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--ink-2, #6b7685)]">
                <th className="pb-2 pr-4">ID</th>
                <th className="pb-2 pr-4">IE Firm</th>
                <th className="pb-2 pr-4">Trigger</th>
                <th className="pb-2 pr-4">Capacity (MW)</th>
                <th className="pb-2 pr-4">P50 (GWh)</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA Due</th>
                <th className="pb-2 pr-4">REGULATOR</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const overdue   = !!(item.sla_breached || (item.sla_due_at && new Date(item.sla_due_at) < new Date()));
                const regulator = hasRegulatorFlag(item);
                const tierColor = TIER_COLORS[item.bfs_capacity_tier] ?? 'var(--ink-2, #6b7280)';
                return (
                  <tr key={item.id} className="border-b hover:bg-[var(--s2, #eef2f7)]">
                    <td className="py-2 pr-4 text-xs font-mono text-[var(--ink-2, #3d4756)]">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink, #2d3748)]">{item.ie_firm_name ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink, #2d3748)]">{TRIGGER_LABELS[item.trigger_category] ?? item.trigger_category}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink, #2d3748)]">{item.capacity_mw.toFixed(1)}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink, #2d3748)]">{item.p50_yield_gwh != null ? item.p50_yield_gwh.toFixed(1) : '—'}</td>
                    <td className="py-2 pr-4">
                      <span className="px-2 py-0.5 rounded text-xs text-white font-medium" style={{ backgroundColor: tierColor }}>{item.bfs_capacity_tier}</span>
                    </td>
                    <td className="py-2 pr-4">
                      {(() => { const sc = STATUS_COLORS[item.chain_status] ?? { className: 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]' }; return <span className={`px-2 py-0.5 rounded text-xs ${sc.className}`} style={sc.style}>{statusLabel(item.chain_status).text}</span>; })()}
                    </td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-[var(--ink-2, #6b7685)]'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.sla_due_at)}
                    </td>
                    <td className="py-2 pr-4">
                      {regulator && (
                        <span className="px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">REGULATOR</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-[var(--ink-2, #9aa5b4)] text-sm">No BFS studies found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
