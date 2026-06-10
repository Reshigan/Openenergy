import { useState, useEffect } from 'react';

interface OmContract {
  id: string;
  participant_id: string;
  project_id: string;
  om_contract_category: 'full_om' | 'maintenance_only' | 'operations_only' | 'asset_management' | 'specialist_equipment' | 'novation';
  annual_om_value_zar: number;
  om_value_tier: 'minor' | 'moderate' | 'significant' | 'major' | 'material';
  contractor_name: string;
  contract_expiry_date: string | null;
  chain_status: string;
  sla_due_at: string;
  sla_breached: number;
  preferred_bidder_name: string | null;
  lender_consent_at: string | null;
  contract_executed_at: string | null;
  renewal_failed_at: string | null;
  novation_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  renewal_triggered:          'bg-[#eef2f7] text-[#6b7685]',
  market_sounding:            'bg-blue-100 text-blue-700',
  tender_issued:              'bg-sky-100 text-sky-700',
  bids_received:              'bg-indigo-100 text-indigo-700',
  evaluation_complete:        'bg-yellow-100 text-yellow-800',
  preferred_bidder_selected:  'bg-amber-100 text-amber-700',
  lender_consent:             'bg-teal-100 text-teal-700',
  nersa_acknowledgement:      'bg-purple-100 text-purple-700',
  contract_executed:          'bg-green-100 text-green-700',
  renewal_failed:             'bg-red-100 text-red-700',
  novation_pending:           'bg-orange-100 text-orange-700',
  novation_executed:          'bg-emerald-100 text-emerald-700',
};

const TIER_COLORS: Record<string, string> = {
  minor:       '#6b7280',
  moderate:    '#3b82f6',
  significant: '#f59e0b',
  major:       '#ef4444',
  material:    '#7c3aed',
};

const CATEGORY_LABELS: Record<string, string> = {
  full_om:              'Full O&M',
  maintenance_only:     'Maintenance',
  operations_only:      'Operations',
  asset_management:     'Asset Mgmt',
  specialist_equipment: 'Specialist',
  novation:             'Novation',
};

const TERMINAL_STATUSES = new Set(['contract_executed', 'renewal_failed', 'novation_executed']);

const STATUSES = Object.keys(STATUS_COLORS);
const TIERS = ['minor', 'moderate', 'significant', 'major', 'material'] as const;
const CATEGORIES = Object.keys(CATEGORY_LABELS);

const sel = 'border rounded px-2 py-1 text-xs text-[#2d3748] bg-white';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

const fmtZar = (n: number) => `R${(n / 1e6).toFixed(1)}M`;

function hasRegulatorFlag(row: OmContract): boolean {
  if (row.renewal_failed_at !== null) return true;
  if (row.novation_executed_at !== null && (row.om_value_tier === 'significant' || row.om_value_tier === 'major' || row.om_value_tier === 'material')) return true;
  if (row.contract_executed_at !== null && (row.om_value_tier === 'major' || row.om_value_tier === 'material')) return true;
  return false;
}

type KpiChipProps = { label: string; value: string | number; mode?: 'alert' | 'good' | 'danger' | 'neutral' };
function KpiChip({ label, value, mode = 'neutral' }: KpiChipProps) {
  const border = mode === 'danger' ? 'border-red-200 bg-red-50' : mode === 'alert' ? 'border-orange-200 bg-orange-50' : mode === 'good' ? 'border-green-200 bg-green-50' : 'border-[#dde4ec] bg-white';
  const text   = mode === 'danger' ? 'text-red-700' : mode === 'alert' ? 'text-orange-700' : mode === 'good' ? 'text-green-700' : 'text-[#0f1c2e]';
  return (
    <div className={`rounded-lg p-3 border ${border}`}>
      <div className="text-xs text-[#6b7685]">{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
    </div>
  );
}

export function IppOmContractTab() {
  const [items, setItems] = useState<OmContract[]>([]);
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
      const res = await fetch(`/api/ipp-om-contract?${params}`, {
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
  const executed = items.filter(i => i.contract_executed_at !== null || i.novation_executed_at !== null).length;
  const breached = items.filter(i => i.sla_breached === 1).length;

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total Contracts" value={total} />
        <KpiChip label="Open"            value={open}     mode={open > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="Executed"        value={executed} mode={executed > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Breached"        value={breached} mode={breached > 0 ? 'danger' : 'neutral'} />
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
        <button type="button" onClick={() => load()} className="ml-auto px-3 py-1 bg-[#eef2f7] text-[#2d3748] rounded text-xs border border-[#dde4ec] hover:bg-[#e8ecf0]">
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
                <th className="pb-2 pr-4">ID</th>
                <th className="pb-2 pr-4">Contractor</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">Annual Value</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Expiry</th>
                <th className="pb-2 pr-4">Preferred Bidder</th>
                <th className="pb-2 pr-4">REGULATOR</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const overdue   = !!(item.sla_breached || (item.sla_due_at && new Date(item.sla_due_at) < new Date()));
                const regulator = hasRegulatorFlag(item);
                const tierColor = TIER_COLORS[item.om_value_tier] ?? '#6b7280';
                return (
                  <tr key={item.id} className="border-b hover:bg-[#eef2f7]">
                    <td className="py-2 pr-4 text-xs font-mono text-[#3d4756]">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">{item.contractor_name}</td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">{CATEGORY_LABELS[item.om_contract_category] ?? item.om_contract_category}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[#2d3748]">{fmtZar(item.annual_om_value_zar)}</td>
                    <td className="py-2 pr-4">
                      <span className="px-2 py-0.5 rounded text-xs text-white font-medium" style={{ backgroundColor: tierColor }}>{item.om_value_tier}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>{item.chain_status.replace(/_/g, ' ')}</span>
                    </td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-[#6b7685]'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.contract_expiry_date)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#6b7685]">{item.preferred_bidder_name ?? '—'}</td>
                    <td className="py-2 pr-4">
                      {regulator && (
                        <span className="px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">REGULATOR</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-[#9aa5b4] text-sm">No O&M contracts found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
