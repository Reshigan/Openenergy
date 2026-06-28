import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface GridComplianceRecord {
  id: string;
  participant_id: string;
  project_id: string;
  compliance_category: 'power_quality' | 'protection_relay' | 'fault_ride_through' | 'reactive_power' | 'frequency_response' | 'earthing_bonding';
  assessment_year: number;
  capacity_mw: number;
  capacity_tier: 'small' | 'medium' | 'large' | 'utility' | 'strategic';
  nersa_reference: string | null;
  chain_status: string;
  sla_due_at: string;
  sla_breached: number;
  submitted_to_nersa_at: string | null;
  deficiency_noted_at: string | null;
  corrective_action_due_at: string | null;
  compliant_at: string | null;
  non_compliant_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  assessment_due:        'bg-[#eef2f7] text-[#6b7685]',
  test_preparation:      'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  testing_in_progress:   'bg-sky-100 text-sky-700',
  test_completed:        'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  report_drafted:        'bg-yellow-100 text-yellow-800',
  submitted_to_nersa:    'bg-amber-100 text-amber-700',
  nersa_review:          'bg-orange-100 text-orange-700',
  deficiency_noted:      'bg-rose-100 text-rose-700',
  corrective_action:     'bg-teal-100 text-teal-700',
  verification_pending:  'bg-purple-100 text-purple-700',
  compliant:             'bg-green-100 text-green-700',
  non_compliant_notice:  'bg-red-100 text-red-700',
};

const TIER_COLORS: Record<string, string> = {
  small:     '#6b7280',
  medium:    '#3b82f6',
  large:     '#f59e0b',
  utility:   '#ef4444',
  strategic: '#7c3aed',
};

const CATEGORY_LABELS: Record<string, string> = {
  power_quality:      'Power Quality',
  protection_relay:   'Protection Relay',
  fault_ride_through: 'Fault Ride-Through',
  reactive_power:     'Reactive Power',
  frequency_response: 'Frequency Response',
  earthing_bonding:   'Earthing/Bonding',
};

const TERMINAL_STATUSES = new Set(['compliant', 'non_compliant_notice']);

const STATUSES = Object.keys(STATUS_COLORS);
const TIERS = ['small', 'medium', 'large', 'utility', 'strategic'] as const;
const CATEGORIES = Object.keys(CATEGORY_LABELS);

const sel = 'border rounded px-2 py-1 text-xs text-[#2d3748] bg-white';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function hasRegulatorFlag(row: GridComplianceRecord): boolean {
  if (row.non_compliant_at) return true;
  if (row.compliant_at && (row.capacity_tier === 'utility' || row.capacity_tier === 'strategic')) return true;
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

export function IppGridComplianceTab() {
  const [items, setItems] = useState<GridComplianceRecord[]>([]);
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
      const res = await fetch(`/api/ipp-grid-compliance?${params}`, {
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
  const compliant = items.filter(i => i.compliant_at !== null).length;
  const breached  = items.filter(i => i.sla_breached === 1).length;

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total Assessments" value={total} />
        <KpiChip label="Open"              value={open}      mode={open > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="Compliant"         value={compliant} mode={compliant > 0 ? 'good' : 'neutral'} />
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
                <th className="pb-2 pr-4">Project</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">Year</th>
                <th className="pb-2 pr-4">Capacity (MW)</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA Due</th>
                <th className="pb-2 pr-4">REGULATOR</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const overdue    = !!(item.sla_breached || (item.sla_due_at && new Date(item.sla_due_at) < new Date()));
                const regulator  = hasRegulatorFlag(item);
                const tierColor  = TIER_COLORS[item.capacity_tier] ?? '#6b7280';
                return (
                  <tr key={item.id} className="border-b hover:bg-[#eef2f7]">
                    <td className="py-2 pr-4 text-xs font-mono text-[#3d4756]">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">{item.project_id}</td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">{CATEGORY_LABELS[item.compliance_category] ?? item.compliance_category}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[#2d3748]">{item.assessment_year}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[#2d3748]">{item.capacity_mw.toFixed(1)}</td>
                    <td className="py-2 pr-4">
                      <span className="px-2 py-0.5 rounded text-xs text-white font-medium" style={{ backgroundColor: tierColor }}>{item.capacity_tier}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>{statusLabel(item.chain_status).text}</span>
                    </td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-[#6b7685]'}`}>
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
                <tr><td colSpan={9} className="py-10 text-center text-[#9aa5b4] text-sm">No grid compliance assessments found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
