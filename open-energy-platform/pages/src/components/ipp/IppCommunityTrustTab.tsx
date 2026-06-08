import { useState, useEffect } from 'react';

interface CommunityTrustReport {
  id: string;
  participant_id: string;
  project_id: string;
  trust_category: 'equity_dividend' | 'socio_economic_development' | 'enterprise_development' | 'education_bursary' | 'infrastructure_upliftment';
  reporting_year: number;
  disbursement_amount_zar: number;
  disbursement_tier: 'minor' | 'moderate' | 'significant' | 'major' | 'material';
  trust_name: string;
  chain_status: string;
  sla_due_at: string;
  sla_breached: number;
  submitted_to_dtic_at: string | null;
  report_accepted_at: string | null;
  report_rejected_at: string | null;
  appeal_filed_at: string | null;
  appeal_determined_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  report_due:           'bg-gray-100 text-gray-500',
  data_preparation:     'bg-blue-100 text-blue-700',
  trustee_review:       'bg-sky-100 text-sky-700',
  report_drafted:       'bg-indigo-100 text-indigo-700',
  ipp_review:           'bg-yellow-100 text-yellow-800',
  submitted_to_dtic:    'bg-amber-100 text-amber-700',
  dtic_review:          'bg-orange-100 text-orange-700',
  queries_raised:       'bg-rose-100 text-rose-700',
  responses_submitted:  'bg-teal-100 text-teal-700',
  report_accepted:      'bg-green-100 text-green-700',
  report_rejected:      'bg-red-100 text-red-700',
  appeal_filed:         'bg-purple-100 text-purple-700',
  appeal_determined:    'bg-purple-50 text-purple-600',
};

const TIER_COLORS: Record<string, string> = {
  minor:       '#6b7280',
  moderate:    '#3b82f6',
  significant: '#f59e0b',
  major:       '#ef4444',
  material:    '#7c3aed',
};

const CATEGORY_LABELS: Record<string, string> = {
  equity_dividend:            'Equity Dividend',
  socio_economic_development: 'Socio-Economic Dev',
  enterprise_development:     'Enterprise Dev',
  education_bursary:          'Education Bursary',
  infrastructure_upliftment:  'Infrastructure',
};

const TERMINAL_STATUSES = new Set(['report_accepted', 'report_rejected', 'appeal_determined']);

const STATUSES = Object.keys(STATUS_COLORS);
const TIERS = ['minor', 'moderate', 'significant', 'major', 'material'] as const;
const CATEGORIES = Object.keys(CATEGORY_LABELS);

const sel = 'border rounded px-2 py-1 text-xs text-gray-700 bg-white';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

const fmtZar = (n: number) => `R${(n / 1_000_000).toFixed(1)}M`;

function hasRegulatorFlag(row: CommunityTrustReport): boolean {
  if (row.report_rejected_at) return true;
  if (row.report_accepted_at && (row.disbursement_tier === 'major' || row.disbursement_tier === 'material')) return true;
  if (row.appeal_determined_at) return true;
  return false;
}

type KpiChipProps = { label: string; value: string | number; mode?: 'alert' | 'good' | 'danger' | 'neutral' };
function KpiChip({ label, value, mode = 'neutral' }: KpiChipProps) {
  const border = mode === 'danger' ? 'border-red-200 bg-red-50' : mode === 'alert' ? 'border-orange-200 bg-orange-50' : mode === 'good' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white';
  const text   = mode === 'danger' ? 'text-red-700' : mode === 'alert' ? 'text-orange-700' : mode === 'good' ? 'text-green-700' : 'text-gray-900';
  return (
    <div className={`rounded-lg p-3 border ${border}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
    </div>
  );
}

export function IppCommunityTrustTab() {
  const [items, setItems] = useState<CommunityTrustReport[]>([]);
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
      const res = await fetch(`/api/ipp-community-trust?${params}`, {
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
  const accepted = items.filter(i => i.report_accepted_at !== null).length;
  const breached = items.filter(i => i.sla_breached === 1).length;

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total Reports" value={total} />
        <KpiChip label="Open"          value={open}     mode={open > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="Accepted"      value={accepted} mode={accepted > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Breached"      value={breached} mode={breached > 0 ? 'danger' : 'neutral'} />
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
        <button type="button" onClick={() => load()} className="ml-auto px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs border border-gray-200 hover:bg-gray-200">
          Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading&hellip;</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2 pr-4">ID</th>
                <th className="pb-2 pr-4">Trust Name</th>
                <th className="pb-2 pr-4">Year</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">Disbursement</th>
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
                const tierColor = TIER_COLORS[item.disbursement_tier] ?? '#6b7280';
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 text-xs font-mono text-gray-600">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs text-gray-700">{item.trust_name}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-gray-700">{item.reporting_year}</td>
                    <td className="py-2 pr-4 text-xs text-gray-700">{CATEGORY_LABELS[item.trust_category] ?? item.trust_category}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-gray-700">{fmtZar(item.disbursement_amount_zar)}</td>
                    <td className="py-2 pr-4">
                      <span className="px-2 py-0.5 rounded text-xs text-white font-medium" style={{ backgroundColor: tierColor }}>{item.disbursement_tier}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-gray-100 text-gray-500'}`}>{item.chain_status.replace(/_/g, ' ')}</span>
                    </td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
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
                <tr><td colSpan={9} className="py-10 text-center text-gray-400 text-sm">No community trust reports found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
