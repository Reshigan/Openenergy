import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface HraAssessment {
  id: string;
  participant_id: string;
  project_id: string;
  project_name?: string | null;
  trigger_category:
    | 'new_development'
    | 'scope_change'
    | 'layout_modification'
    | 'access_road'
    | 'substation_addition'
    | 'transmission_line';
  hra_category:
    | 'phase_1_desktop'
    | 'phase_2_field'
    | 'phase_3_excavation'
    | 'heritage_impact'
    | 'mitigation_plan';
  hra_capacity_tier: 'small' | 'medium' | 'large' | 'utility' | 'strategic';
  chain_status: string;
  sahra_reference: string | null;
  heritage_consultant: string | null;
  capacity_mw: number;
  hra_submitted_at: string | null;
  public_participation_closed_at: string | null;
  hra_decided_at: string | null;
  sla_due_at: string;
  sla_breached: number;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  hra_triggered:              'bg-[#eef2f7] text-[#6b7685]',
  desktop_study:              'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  field_survey:               'bg-sky-100 text-sky-700',
  hra_report_preparation:     'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  hra_submitted:              'bg-yellow-100 text-yellow-800',
  sahra_review:               'bg-teal-100 text-teal-700',
  public_participation:       'bg-cyan-100 text-cyan-700',
  specialist_assessment:      'bg-purple-100 text-purple-700',
  final_review:               'bg-amber-100 text-amber-700',
  hra_approved:               'bg-green-100 text-green-700',
  hra_refused:                'bg-red-100 text-red-700',
  heritage_watchlist:         'bg-orange-100 text-orange-700',
};

const STATUS_LABELS: Record<string, string> = {
  hra_triggered:              'HRA Triggered',
  desktop_study:              'Desktop Study',
  field_survey:               'Field Survey',
  hra_report_preparation:     'HRA Report Preparation',
  hra_submitted:              'HRA Submitted',
  sahra_review:               'SAHRA Review',
  public_participation:       'Public Participation',
  specialist_assessment:      'Specialist Assessment',
  final_review:               'Final Review',
  hra_approved:               'HRA Approved',
  hra_refused:                'HRA Refused',
  heritage_watchlist:         'Heritage Watchlist',
};

const TIER_COLORS: Record<string, string> = {
  small:     '#6b7280',
  medium:    '#3b82f6',
  large:     '#f59e0b',
  utility:   '#ef4444',
  strategic: '#7c3aed',
};

const TRIGGER_LABELS: Record<string, string> = {
  new_development:      'New Development',
  scope_change:         'Scope Change',
  layout_modification:  'Layout Modification',
  access_road:          'Access Road',
  substation_addition:  'Substation Addition',
  transmission_line:    'Transmission Line',
};

const HRA_CATEGORY_LABELS: Record<string, string> = {
  phase_1_desktop:  'Phase 1 Desktop',
  phase_2_field:    'Phase 2 Field',
  phase_3_excavation: 'Phase 3 Excavation',
  heritage_impact:  'Heritage Impact',
  mitigation_plan:  'Mitigation Plan',
};

const TERMINAL_STATUSES = new Set(['hra_approved', 'hra_refused', 'heritage_watchlist']);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS = ['small', 'medium', 'large', 'utility', 'strategic'] as const;
const TRIGGER_CATEGORIES = Object.keys(TRIGGER_LABELS);

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[#2d3748] bg-white';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function hasRegulatorFlag(row: HraAssessment): boolean {
  if (row.chain_status === 'hra_refused') return true;
  if (
    row.chain_status === 'heritage_watchlist' &&
    (row.hra_capacity_tier === 'utility' || row.hra_capacity_tier === 'strategic')
  ) return true;
  if (
    row.chain_status === 'hra_approved' &&
    (row.hra_capacity_tier === 'utility' || row.hra_capacity_tier === 'strategic')
  ) return true;
  return false;
}

type KpiChipProps = { label: string; value: string | number; mode?: 'alert' | 'good' | 'danger' | 'neutral' };
function KpiChip({ label, value, mode = 'neutral' }: KpiChipProps) {
  const border =
    mode === 'danger'  ? 'border-red-200 bg-red-50'       :
    mode === 'alert'   ? 'border-orange-200 bg-orange-50' :
    mode === 'good'    ? 'border-green-200 bg-green-50'   :
    'border-[#dde4ec] bg-white';
  const text =
    mode === 'danger'  ? 'text-red-700'    :
    mode === 'alert'   ? 'text-orange-700' :
    mode === 'good'    ? 'text-green-700'  :
    'text-[#0f1c2e]';
  return (
    <div className={`rounded-lg p-3 border ${border}`}>
      <div className="text-xs text-[#6b7685]">{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
    </div>
  );
}

export function IppHraTab() {
  const [items, setItems]               = useState<HraAssessment[]>([]);
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
      const res = await fetch(`/api/ipp-hra?${params}`, {
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
  const total     = items.length;
  const active    = items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached  = items.filter(i => i.sla_breached === 1).length;
  const watchlist = items.filter(i => i.chain_status === 'heritage_watchlist').length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total Assessments" value={total} />
        <KpiChip label="Active"            value={active}    mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"      value={breached}  mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Watchlist"         value={watchlist} mode={watchlist > 0 ? 'danger' : 'neutral'} />
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
        <button type="button"
          onClick={() => load()}
          className="ml-auto px-3 py-1 bg-[#eef2f7] text-[#2d3748] rounded text-xs border border-[#dde4ec] hover:bg-[#e8ecf0]"
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
        <div className="text-sm text-[#9aa5b4] py-8 text-center">Loading&hellip;</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[#6b7685]">
                <th className="pb-2 pr-4">ID</th>
                <th className="pb-2 pr-4">Project</th>
                <th className="pb-2 pr-4">Trigger Category</th>
                <th className="pb-2 pr-4">HRA Category</th>
                <th className="pb-2 pr-4">Capacity (MW)</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SAHRA Reference</th>
                <th className="pb-2 pr-4">Heritage Consultant</th>
                <th className="pb-2 pr-4">SLA Due</th>
                <th className="pb-2 pr-4">SLA Breached</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const overdue   = !!(item.sla_breached || (item.sla_due_at && new Date(item.sla_due_at) < new Date()));
                const regulator = hasRegulatorFlag(item);
                const tierColor = TIER_COLORS[item.hra_capacity_tier] ?? '#6b7280';
                return (
                  <tr key={item.id} className="border-b hover:bg-[#eef2f7]">
                    <td className="py-2 pr-4 text-xs font-mono text-[#3d4756]">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">{item.project_name ?? item.project_id?.slice(0, 12) ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">
                      {TRIGGER_LABELS[item.trigger_category] ?? item.trigger_category}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">
                      {HRA_CATEGORY_LABELS[item.hra_category] ?? item.hra_category}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-xs tabular-nums text-[#2d3748] mr-1">{item.capacity_mw.toFixed(1)}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-xs text-white font-medium"
                        style={{ backgroundColor: tierColor }}
                      >
                        {item.hra_capacity_tier}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                          {STATUS_LABELS[item.chain_status] ?? statusLabel(item.chain_status).text}
                        </span>
                        {regulator && (
                          <span className="px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">
                            REGULATOR
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">{item.sahra_reference ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">{item.heritage_consultant ?? '—'}</td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-[#6b7685]'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.sla_due_at)}
                    </td>
                    <td className="py-2 pr-4">
                      {item.sla_breached === 1 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">Yes</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-[#eef2f7] text-[#9aa5b4]">No</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-[#9aa5b4] text-sm">
                    No heritage resources assessment records found
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
          <button type="button"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-[#eef2f7]"
          >
            ← Prev
          </button>
          <span className="text-xs text-[#6b7685]">
            Page {page} of {totalPages}
          </span>
          <button type="button"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-[#eef2f7]"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
