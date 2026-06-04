import { useState, useEffect } from 'react';

interface ForceMajeureCase {
  id: string;
  participant_id: string;
  project_id: string;
  project_name?: string | null;
  fm_severity_tier: 'minor' | 'moderate' | 'material' | 'major' | 'critical';
  fm_category:
    | 'natural_disaster'
    | 'grid_unavailability'
    | 'political_event'
    | 'change_in_law'
    | 'pandemic'
    | 'civil_unrest';
  relief_type:
    | 'time_extension'
    | 'cost_relief'
    | 'time_and_cost'
    | 'tariff_adjustment'
    | 'termination_right';
  chain_status: string;
  counterparty_name: string | null;
  ie_firm_name: string | null;
  estimated_relief_zar: number | null;
  fm_notice_issued_at: string | null;
  ie_report_issued_at: string | null;
  fm_resolved_at: string | null;
  sla_due_at: string;
  sla_breached: number;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  fm_identified:               'bg-gray-100 text-gray-500',
  fm_notice_issued:            'bg-blue-100 text-blue-700',
  counterparty_acknowledgment: 'bg-cyan-100 text-cyan-700',
  ie_assessment_requested:     'bg-indigo-100 text-indigo-700',
  ie_assessment_in_progress:   'bg-purple-100 text-purple-700',
  ie_report_issued:            'bg-sky-100 text-sky-700',
  relief_quantified:           'bg-teal-100 text-teal-700',
  negotiation_in_progress:     'bg-yellow-100 text-yellow-800',
  relief_agreed:               'bg-green-100 text-green-700',
  relief_refused:              'bg-red-100 text-red-700',
  arbitration_commenced:       'bg-orange-100 text-orange-700',
};

const STATUS_LABELS: Record<string, string> = {
  fm_identified:               'FM Identified',
  fm_notice_issued:            'FM Notice Issued',
  counterparty_acknowledgment: 'Counterparty Acknowledgment',
  ie_assessment_requested:     'IE Assessment Requested',
  ie_assessment_in_progress:   'IE Assessment In Progress',
  ie_report_issued:            'IE Report Issued',
  relief_quantified:           'Relief Quantified',
  negotiation_in_progress:     'Negotiation In Progress',
  relief_agreed:               'Relief Agreed',
  relief_refused:              'Relief Refused',
  arbitration_commenced:       'Arbitration Commenced',
};

const TIER_COLORS: Record<string, string> = {
  minor:    '#6b7280',
  moderate: '#3b82f6',
  material: '#f59e0b',
  major:    '#ef4444',
  critical: '#7c3aed',
};

const FM_CATEGORY_LABELS: Record<string, string> = {
  natural_disaster:    'Natural Disaster',
  grid_unavailability: 'Grid Unavailability',
  political_event:     'Political Event',
  change_in_law:       'Change in Law',
  pandemic:            'Pandemic',
  civil_unrest:        'Civil Unrest',
};

const RELIEF_TYPE_LABELS: Record<string, string> = {
  time_extension:    'Time Extension',
  cost_relief:       'Cost Relief',
  time_and_cost:     'Time & Cost',
  tariff_adjustment: 'Tariff Adjustment',
  termination_right: 'Termination Right',
};

const TERMINAL_STATUSES = new Set(['relief_agreed', 'relief_refused', 'arbitration_commenced']);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS = ['minor', 'moderate', 'material', 'major', 'critical'] as const;
const FM_CATEGORIES = Object.keys(FM_CATEGORY_LABELS);

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-gray-700 bg-white';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtZar(amount: number | null | undefined): string {
  if (amount == null) return '—';
  if (amount >= 1_000_000_000) return `R ${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `R ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `R ${(amount / 1_000).toFixed(1)}K`;
  return `R ${amount.toLocaleString('en-ZA')}`;
}

function hasRegulatorFlag(row: ForceMajeureCase): boolean {
  if (row.chain_status === 'arbitration_commenced') return true;
  if (row.chain_status === 'relief_refused') return true;
  if (
    row.chain_status === 'relief_agreed' &&
    (row.fm_severity_tier === 'major' || row.fm_severity_tier === 'critical')
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

export function IppForceMajeureTab() {
  const [items, setItems]                   = useState<ForceMajeureCase[]>([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterTier, setFilterTier]         = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [page, setPage]                     = useState(1);

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
      const res = await fetch(`/api/ipp-force-majeure?${params}`, {
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
  const total       = items.length;
  const active      = items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached    = items.filter(i => i.sla_breached === 1).length;
  const arbitration = items.filter(i => i.chain_status === 'arbitration_commenced').length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total"         value={total} />
        <KpiChip label="Active"        value={active}      mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"  value={breached}    mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Arbitration"   value={arbitration} mode={arbitration > 0 ? 'danger' : 'neutral'} />
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
          {TIERS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={e => { setFilterCategory(e.target.value); load(filterStatus, filterTier, e.target.value); }}
          className={sel}
        >
          <option value="">All categories</option>
          {FM_CATEGORIES.map(c => (
            <option key={c} value={c}>{FM_CATEGORY_LABELS[c]}</option>
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
                <th className="pb-2 pr-4">FM Category</th>
                <th className="pb-2 pr-4">Relief Type</th>
                <th className="pb-2 pr-4">Estimated Relief</th>
                <th className="pb-2 pr-4">Severity</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Counterparty</th>
                <th className="pb-2 pr-4">SLA Due</th>
                <th className="pb-2 pr-4">SLA Breached</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const overdue   = !!(item.sla_breached || (item.sla_due_at && new Date(item.sla_due_at) < new Date()));
                const regulator = hasRegulatorFlag(item);
                const tierColor = TIER_COLORS[item.fm_severity_tier] ?? '#6b7280';
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 text-xs font-mono text-gray-600">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs text-gray-700">{item.project_name ?? item.project_id?.slice(0, 12) ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-gray-700">
                      {FM_CATEGORY_LABELS[item.fm_category] ?? item.fm_category}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-700">
                      {RELIEF_TYPE_LABELS[item.relief_type] ?? item.relief_type}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-gray-700">
                      {fmtZar(item.estimated_relief_zar)}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className="px-1.5 py-0.5 rounded text-xs text-white font-medium"
                        style={{ backgroundColor: tierColor }}
                      >
                        {item.fm_severity_tier.charAt(0).toUpperCase() + item.fm_severity_tier.slice(1)}
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
                    <td className="py-2 pr-4 text-xs text-gray-700">{item.counterparty_name ?? '—'}</td>
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
                    No force majeure records found
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
