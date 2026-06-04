import { useState, useEffect } from 'react';

interface AelLicence {
  id: string;
  participant_id: string;
  project_id: string;
  project_name?: string | null;
  trigger_category:
    | 'new_installation'
    | 'capacity_increase'
    | 'fuel_change'
    | 'technology_substitution'
    | 'renewal'
    | 'amendment';
  ael_category:
    | 'category_1_major'
    | 'category_2_minor'
    | 's21_listed_activity'
    | 'point_source'
    | 'fugitive_emission';
  ael_capacity_tier: 'small' | 'medium' | 'large' | 'utility' | 'strategic';
  chain_status: string;
  authority_reference: string | null;
  emissions_consultant: string | null;
  capacity_mw: number;
  application_submitted_at: string | null;
  public_participation_closed_at: string | null;
  ael_decided_at: string | null;
  sla_due_at: string;
  sla_breached: number;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  ael_triggered:                   'bg-gray-100 text-gray-500',
  emissions_inventory:             'bg-blue-100 text-blue-700',
  application_preparation:         'bg-indigo-100 text-indigo-700',
  application_submitted:           'bg-yellow-100 text-yellow-800',
  authority_completeness_review:   'bg-cyan-100 text-cyan-700',
  public_participation_open:       'bg-sky-100 text-sky-700',
  public_participation_closed:     'bg-teal-100 text-teal-700',
  technical_assessment:            'bg-purple-100 text-purple-700',
  authority_final_review:          'bg-amber-100 text-amber-700',
  ael_granted:                     'bg-green-100 text-green-700',
  ael_refused:                     'bg-red-100 text-red-700',
  ael_lapsed:                      'bg-orange-100 text-orange-700',
};

const STATUS_LABELS: Record<string, string> = {
  ael_triggered:                   'AEL Triggered',
  emissions_inventory:             'Emissions Inventory',
  application_preparation:         'Application Preparation',
  application_submitted:           'Application Submitted',
  authority_completeness_review:   'Completeness Review',
  public_participation_open:       'Public Participation Open',
  public_participation_closed:     'Public Participation Closed',
  technical_assessment:            'Technical Assessment',
  authority_final_review:          'Authority Final Review',
  ael_granted:                     'AEL Granted',
  ael_refused:                     'AEL Refused',
  ael_lapsed:                      'AEL Lapsed',
};

const TIER_COLORS: Record<string, string> = {
  small:     '#6b7280',
  medium:    '#3b82f6',
  large:     '#f59e0b',
  utility:   '#ef4444',
  strategic: '#7c3aed',
};

const TRIGGER_LABELS: Record<string, string> = {
  new_installation:        'New Installation',
  capacity_increase:       'Capacity Increase',
  fuel_change:             'Fuel Change',
  technology_substitution: 'Technology Substitution',
  renewal:                 'Renewal',
  amendment:               'Amendment',
};

const AEL_CATEGORY_LABELS: Record<string, string> = {
  category_1_major:    'Category 1 Major',
  category_2_minor:    'Category 2 Minor',
  s21_listed_activity: 'S21 Listed Activity',
  point_source:        'Point Source',
  fugitive_emission:   'Fugitive Emission',
};

const TERMINAL_STATUSES = new Set(['ael_granted', 'ael_refused', 'ael_lapsed']);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS = ['small', 'medium', 'large', 'utility', 'strategic'] as const;
const TRIGGER_CATEGORIES = Object.keys(TRIGGER_LABELS);

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-gray-700 bg-white';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function hasRegulatorFlag(row: AelLicence): boolean {
  if (row.chain_status === 'ael_refused') return true;
  if (
    row.chain_status === 'ael_lapsed' &&
    (row.ael_capacity_tier === 'utility' || row.ael_capacity_tier === 'strategic')
  ) return true;
  if (
    row.chain_status === 'ael_granted' &&
    (row.ael_capacity_tier === 'utility' || row.ael_capacity_tier === 'strategic')
  ) return true;
  return false;
}

type KpiChipProps = { label: string; value: string | number; mode?: 'alert' | 'good' | 'danger' | 'neutral' };
function KpiChip({ label, value, mode = 'neutral' }: KpiChipProps) {
  const border =
    mode === 'danger'  ? 'border-red-200 bg-red-50'       :
    mode === 'alert'   ? 'border-orange-200 bg-orange-50' :
    mode === 'good'    ? 'border-green-200 bg-green-50'   :
    'border-gray-200 bg-white';
  const text =
    mode === 'danger'  ? 'text-red-700'    :
    mode === 'alert'   ? 'text-orange-700' :
    mode === 'good'    ? 'text-green-700'  :
    'text-gray-900';
  return (
    <div className={`rounded-lg p-3 border ${border}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
    </div>
  );
}

export function IppAelTab() {
  const [items, setItems]               = useState<AelLicence[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier]     = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [page, setPage]                 = useState(1);

  async function load(
    status   = filterStatus,
    tier     = filterTier,
    category = filterCategory,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status)   params.set('status', status);
      if (tier)     params.set('tier', tier);
      if (category) params.set('category', category);
      const res = await fetch(`/api/ipp-ael?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const d = json?.data ?? json;
      setItems(d?.items ?? d ?? []);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived KPIs
  const total   = items.length;
  const active  = items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached = items.filter(i => i.sla_breached === 1).length;
  const lapsed  = items.filter(i => i.chain_status === 'ael_lapsed').length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total Licences"  value={total} />
        <KpiChip label="Active"          value={active}   mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"    value={breached} mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Lapsed"          value={lapsed}   mode={lapsed > 0 ? 'danger' : 'neutral'} />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterTier, filterCategory); }}
          className={sel}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
        <select
          value={filterTier}
          onChange={e => { setFilterTier(e.target.value); load(filterStatus, e.target.value, filterCategory); }}
          className={sel}
        >
          <option value="">All tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={e => { setFilterCategory(e.target.value); load(filterStatus, filterTier, e.target.value); }}
          className={sel}
        >
          <option value="">All triggers</option>
          {TRIGGER_CATEGORIES.map(c => (
            <option key={c} value={c}>{TRIGGER_LABELS[c]}</option>
          ))}
        </select>
        <button
          onClick={() => load()}
          className="ml-auto px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs border border-gray-200 hover:bg-gray-200"
        >
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading&hellip;</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2 pr-4">ID</th>
                <th className="pb-2 pr-4">Project</th>
                <th className="pb-2 pr-4">Trigger</th>
                <th className="pb-2 pr-4">AEL Category</th>
                <th className="pb-2 pr-4">Capacity (MW)</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Authority Reference</th>
                <th className="pb-2 pr-4">Emissions Consultant</th>
                <th className="pb-2 pr-4">SLA Due</th>
                <th className="pb-2 pr-4">SLA Breached</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const overdue   = !!(item.sla_breached || (item.sla_due_at && new Date(item.sla_due_at) < new Date()));
                const regulator = hasRegulatorFlag(item);
                const tierColor = TIER_COLORS[item.ael_capacity_tier] ?? '#6b7280';
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 text-xs font-mono text-gray-600">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs text-gray-700">{item.project_name ?? item.project_id?.slice(0, 12) ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-gray-700">
                      {TRIGGER_LABELS[item.trigger_category] ?? item.trigger_category}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-700">
                      {AEL_CATEGORY_LABELS[item.ael_category] ?? item.ael_category}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-xs tabular-nums text-gray-700 mr-1">{item.capacity_mw.toFixed(1)}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-xs text-white font-medium"
                        style={{ backgroundColor: tierColor }}
                      >
                        {item.ael_capacity_tier}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                        </span>
                        {regulator && (
                          <span className="px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">
                            REGULATOR
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-700">{item.authority_reference ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-gray-700">{item.emissions_consultant ?? '—'}</td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.sla_due_at)}
                    </td>
                    <td className="py-2 pr-4">
                      {item.sla_breached === 1 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">Yes</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-400">No</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-gray-400 text-sm">
                    No atmospheric emission licence records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 pt-1">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-50"
          >
            &larr; Prev
          </button>
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-50"
          >
            Next &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
