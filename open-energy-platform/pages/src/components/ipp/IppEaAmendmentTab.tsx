import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface EaAmendment {
  id: string;
  participant_id: string;
  project_id: string;
  project_name?: string | null;
  trigger_category:
    | 'scope_change'
    | 'technology_substitution'
    | 'capacity_increase'
    | 'access_route_change'
    | 'footprint_expansion'
    | 'component_modification';
  amendment_category:
    | 'basic_assessment'
    | 'scoping_and_eia'
    | 'variation_application'
    | 's24g_rectification'
    | 'exemption_application';
  ea_capacity_tier: 'small' | 'medium' | 'large' | 'utility' | 'strategic';
  chain_status: string;
  dffe_reference: string | null;
  environmental_consultant: string | null;
  capacity_mw: number;
  application_submitted_at: string | null;
  public_participation_closed_at: string | null;
  amendment_decided_at: string | null;
  sla_due_at: string;
  sla_breached: number;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  ea_amendment_triggered:      'bg-[#eef2f7] text-[#6b7685]',
  scope_defined:               'bg-[#eef2f7] text-[#3d4756]',
  application_in_preparation:  'bg-sky-100 text-sky-700',
  application_submitted:       'bg-[#e8ecf0] text-[#3d4756]',
  dffe_completeness_review:    'bg-yellow-100 text-yellow-800',
  public_participation_open:   'bg-teal-100 text-teal-700',
  public_participation_closed: 'bg-cyan-100 text-cyan-700',
  specialist_review:           'bg-purple-100 text-purple-700',
  dffe_final_review:           'bg-amber-100 text-amber-700',
  amendment_granted:           'bg-green-100 text-green-700',
  amendment_refused:           'bg-red-100 text-red-700',
  s24g_referral:               'bg-orange-100 text-orange-700',
};

const STATUS_LABELS: Record<string, string> = {
  ea_amendment_triggered:      'EA Amendment Triggered',
  scope_defined:               'Scope Defined',
  application_in_preparation:  'Application In Preparation',
  application_submitted:       'Application Submitted',
  dffe_completeness_review:    'DFFE Completeness Review',
  public_participation_open:   'Public Participation Open',
  public_participation_closed: 'Public Participation Closed',
  specialist_review:           'Specialist Review',
  dffe_final_review:           'DFFE Final Review',
  amendment_granted:           'Amendment Granted',
  amendment_refused:           'Amendment Refused',
  s24g_referral:               'S24G Referral',
};

const TIER_COLORS: Record<string, string> = {
  small:     '#6b7280',
  medium:    'oklch(0.46 0.16 55)',
  large:     '#f59e0b',
  utility:   '#ef4444',
  strategic: '#7c3aed',
};

const TRIGGER_LABELS: Record<string, string> = {
  scope_change:           'Scope Change',
  technology_substitution:'Technology Substitution',
  capacity_increase:      'Capacity Increase',
  access_route_change:    'Access Route Change',
  footprint_expansion:    'Footprint Expansion',
  component_modification: 'Component Modification',
};

const AMENDMENT_CATEGORY_LABELS: Record<string, string> = {
  basic_assessment:       'Basic Assessment',
  scoping_and_eia:        'Scoping & EIA',
  variation_application:  'Variation Application',
  s24g_rectification:     'S24G Rectification',
  exemption_application:  'Exemption Application',
};

const TERMINAL_STATUSES = new Set(['amendment_granted', 'amendment_refused', 's24g_referral']);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS = ['small', 'medium', 'large', 'utility', 'strategic'] as const;
const TRIGGER_CATEGORIES = Object.keys(TRIGGER_LABELS);

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[#2d3748] bg-white';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function hasRegulatorFlag(row: EaAmendment): boolean {
  if (row.chain_status === 'amendment_refused') return true;
  if (row.chain_status === 's24g_referral') return true;
  if (
    row.chain_status === 'amendment_granted' &&
    (row.ea_capacity_tier === 'utility' || row.ea_capacity_tier === 'strategic')
  ) return true;
  return false;
}

type KpiChipProps = { label: string; value: string | number; mode?: 'alert' | 'good' | 'danger' | 'neutral' };
function KpiChip({ label, value, mode = 'neutral' }: KpiChipProps) {
  const border =
    mode === 'danger'  ? 'border-red-200 bg-red-50'    :
    mode === 'alert'   ? 'border-orange-200 bg-orange-50' :
    mode === 'good'    ? 'border-green-200 bg-green-50' :
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

export function IppEaAmendmentTab() {
  const [items, setItems]               = useState<EaAmendment[]>([]);
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
      const res = await fetch(`/api/ipp-ea-amendment?${params}`, {
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
  const s24gCount = items.filter(i => i.chain_status === 's24g_referral').length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total Amendments"  value={total} />
        <KpiChip label="Active"            value={active}   mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"      value={breached} mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="S24G Referrals"    value={s24gCount} mode={s24gCount > 0 ? 'danger' : 'neutral'} />
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
                <th className="pb-2 pr-4">Amendment Category</th>
                <th className="pb-2 pr-4">Capacity (MW)</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">DFFE Reference</th>
                <th className="pb-2 pr-4">Env. Consultant</th>
                <th className="pb-2 pr-4">SLA Due</th>
                <th className="pb-2 pr-4">SLA Breached</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const overdue    = !!(item.sla_breached || (item.sla_due_at && new Date(item.sla_due_at) < new Date()));
                const regulator  = hasRegulatorFlag(item);
                const tierColor  = TIER_COLORS[item.ea_capacity_tier] ?? '#6b7280';
                return (
                  <tr key={item.id} className="border-b hover:bg-[#eef2f7]">
                    <td className="py-2 pr-4 text-xs font-mono text-[#3d4756]">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">{item.project_name ?? item.project_id?.slice(0, 12) ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">
                      {TRIGGER_LABELS[item.trigger_category] ?? item.trigger_category}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">
                      {AMENDMENT_CATEGORY_LABELS[item.amendment_category] ?? item.amendment_category}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-xs tabular-nums text-[#2d3748] mr-1">{item.capacity_mw.toFixed(1)}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-xs text-white font-medium"
                        style={{ backgroundColor: tierColor }}
                      >
                        {item.ea_capacity_tier}
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
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">{item.dffe_reference ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">{item.environmental_consultant ?? '—'}</td>
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
                    No EA amendment records found
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
