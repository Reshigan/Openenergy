import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface LandAmendment {
  id: string;
  participant_id: string;
  project_id: string;
  amendment_category: 'lease_amendment' | 'servitude_registration' | 'servitude_extension' | 'wayleave_grant' | 'wayleave_extension' | 'right_of_way';
  land_area_hectares: number;
  area_tier: 'minor' | 'moderate' | 'significant' | 'major' | 'material';
  counterparty_name: string;
  deeds_office_reference: string | null;
  chain_status: string;
  sla_due_at: string;
  sla_breached: number;
  survey_completed_at: string | null;
  amendment_granted_at: string | null;
  amendment_refused_at: string | null;
  appeal_filed_at: string | null;
  appeal_determined_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  amendment_requested:  'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
  surveyor_appointed:   'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  survey_completed:     'bg-sky-100 text-sky-700',
  application_submitted:'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  authority_review:     'bg-yellow-100 text-yellow-800',
  public_notice:        'bg-amber-100 text-amber-700',
  objection_period:     'bg-orange-100 text-orange-700',
  objections_resolved:  'bg-teal-100 text-teal-700',
  amendment_granted:    'bg-green-100 text-green-700',
  amendment_refused:    'bg-red-100 text-red-700',
  appeal_filed:         'bg-purple-100 text-purple-700',
  appeal_determined:    'bg-purple-50 text-purple-600',
};

const TIER_COLORS: Record<string, string> = {
  minor:      'var(--ink-2, #6b7280)',
  moderate:   '#3b82f6',
  significant:'#f59e0b',
  major:      'var(--bad, #ef4444)',
  material:   '#7c3aed',
};

const CATEGORY_LABELS: Record<string, string> = {
  lease_amendment:         'Lease Amendment',
  servitude_registration:  'Servitude Reg.',
  servitude_extension:     'Servitude Ext.',
  wayleave_grant:          'Wayleave Grant',
  wayleave_extension:      'Wayleave Ext.',
  right_of_way:            'Right of Way',
};

const TERMINAL_STATUSES = new Set(['amendment_granted', 'amendment_refused', 'appeal_determined']);

const STATUSES = Object.keys(STATUS_COLORS);
const TIERS = ['minor', 'moderate', 'significant', 'major', 'material'] as const;
const CATEGORIES = Object.keys(CATEGORY_LABELS);

const sel = 'border rounded px-2 py-1 text-xs text-[var(--ink, #2d3748)] bg-surface-v2';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function hasRegulatorFlag(row: LandAmendment): boolean {
  if (row.amendment_refused_at) return true;
  if (row.amendment_granted_at && (row.area_tier === 'major' || row.area_tier === 'material')) return true;
  if (row.appeal_determined_at) return true;
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

export function IppLandAmendmentTab() {
  const [items, setItems] = useState<LandAmendment[]>([]);
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
      const res = await fetch(`/api/ipp-land-amendment?${params}`, {
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
  const total    = items.length;
  const open     = items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const granted  = items.filter(i => i.amendment_granted_at !== null).length;
  const breached = items.filter(i => i.sla_breached === 1).length;

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total Amendments" value={total} />
        <KpiChip label="Open"             value={open}    mode={open > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="Granted"          value={granted} mode={granted > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Breached"         value={breached} mode={breached > 0 ? 'danger' : 'neutral'} />
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
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
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
                <th className="pb-2 pr-4">Project</th>
                <th className="pb-2 pr-4">Counterparty</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">Area (ha)</th>
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
                const tierColor = TIER_COLORS[item.area_tier] ?? 'var(--ink-2, #6b7280)';
                return (
                  <tr key={item.id} className="border-b hover:bg-[var(--s2, #eef2f7)]">
                    <td className="py-2 pr-4 text-xs font-mono text-[var(--ink-2, #3d4756)]">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink, #2d3748)]">{item.project_id}</td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink, #2d3748)]">{item.counterparty_name}</td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink, #2d3748)]">{CATEGORY_LABELS[item.amendment_category] ?? item.amendment_category}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink, #2d3748)]">{item.land_area_hectares.toLocaleString('en-ZA')}</td>
                    <td className="py-2 pr-4">
                      <span className="px-2 py-0.5 rounded text-xs text-white font-medium" style={{ backgroundColor: tierColor }}>{item.area_tier}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>{statusLabel(item.chain_status).text}</span>
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
                <tr><td colSpan={9} className="py-10 text-center text-[var(--ink-2, #9aa5b4)] text-sm">No land amendments found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
