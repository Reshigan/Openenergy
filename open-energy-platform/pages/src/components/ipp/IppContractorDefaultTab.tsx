import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface ContractorDefault {
  id: string;
  project_id: string;
  contractor_name?: string;
  contractor_reference?: string;
  contract_value_zar: number;
  contract_tier: string;
  default_category: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  default_confirmed_at?: string;
  replacement_appointed_at?: string;
  settlement_agreed_at?: string;
  withdrawn_at?: string;
  description?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  active_termination_count: number;
  replacement_count: number;
  settlement_count: number;
  breached_count: number;
  total_contract_value_zar: number;
}

const STATUS_COLORS: Record<string, string> = {
  default_identified:         'bg-[#eef2f7] text-[#6b7685]',
  notice_of_default_issued:   'bg-yellow-100 text-yellow-800',
  cure_period_in_progress:    'bg-yellow-100 text-yellow-800',
  default_confirmed:          'bg-orange-100 text-orange-700',
  termination_notice_issued:  'bg-red-100 text-red-700',
  step_in_assessed:           'bg-red-100 text-red-700',
  bond_call_initiated:        'bg-red-100 text-red-700',
  handover_in_progress:       'bg-amber-100 text-amber-700',
  replacement_tendering:      'bg-amber-100 text-amber-700',
  replacement_appointed:      'bg-green-100 text-green-800',
  settlement_agreed:          'bg-teal-100 text-teal-700',
  withdrawn:                  'bg-[#eef2f7] text-[#9aa5b4]',
};

const TIER_COLORS: Record<string, string> = {
  small:     'bg-[#eef2f7] text-[#3d4756]',
  medium:    'bg-[#eef2f7] text-[#3d4756]',
  large:     'bg-[#e8ecf0] text-[#3d4756]',
  utility:   'bg-orange-100 text-orange-800',
  strategic: 'bg-red-100 text-red-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  insolvency:          'Insolvency',
  material_breach:     'Material Breach',
  programme_delay:     'Programme Delay',
  quality_failure:     'Quality Failure',
  abandonment:         'Abandonment',
  force_majeure_related: 'Force Majeure Related',
};

const STATUSES = Object.keys(STATUS_COLORS);
const TIERS = ['small', 'medium', 'large', 'utility', 'strategic'] as const;
const CATEGORIES = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[];

const sel = 'border rounded px-2 py-1 text-xs text-[#2d3748] bg-white';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtZar(n: number): string {
  if (n >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(0)}M`;
  return `R${n.toLocaleString()}`;
}

function hasRegulatorFlag(row: ContractorDefault): boolean {
  return !!(row.default_confirmed_at || row.replacement_appointed_at);
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

export function IppContractorDefaultTab() {
  const [items, setItems] = useState<ContractorDefault[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [form, setForm] = useState({
    project_id: '',
    contract_value_zar: '',
    default_category: 'material_breach',
    contractor_name: '',
    contractor_reference: '',
    description: '',
  });

  async function load(status = filterStatus, tier = filterTier, category = filterCategory) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status)   params.set('status', status);
      if (tier)     params.set('tier', tier);
      if (category) params.set('default_category', category);
      const res = await fetch(`/api/ipp-contractor-default?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const json = await res.json();
      const d = json?.data ?? json;
      setItems(d?.items ?? []);
      setKpis(d?.kpis ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createDefault() {
    if (!form.project_id || !form.contract_value_zar) return;
    setCreatePending(true);
    try {
      await fetch('/api/ipp-contractor-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          project_id: form.project_id,
          contract_value_zar: parseFloat(form.contract_value_zar),
          default_category: form.default_category,
          contractor_name: form.contractor_name || undefined,
          contractor_reference: form.contractor_reference || undefined,
          description: form.description || undefined,
        }),
      });
      setShowCreate(false);
      setForm({ project_id: '', contract_value_zar: '', default_category: 'material_breach', contractor_name: '', contractor_reference: '', description: '' });
      load();
    } finally {
      setCreatePending(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiChip label="Total"               value={kpis.total} />
          <KpiChip label="Open"                value={kpis.open_count}               mode={kpis.open_count > 0 ? 'alert' : 'neutral'} />
          <KpiChip label="Active Terminations" value={kpis.active_termination_count} mode={kpis.active_termination_count > 0 ? 'danger' : 'neutral'} />
          <KpiChip label="SLA Breached"        value={kpis.breached_count}           mode={kpis.breached_count > 0 ? 'danger' : 'neutral'} />
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={filterStatus}   onChange={e => { setFilterStatus(e.target.value);   load(e.target.value, filterTier, filterCategory); }}   className={sel}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filterTier}     onChange={e => { setFilterTier(e.target.value);     load(filterStatus, e.target.value, filterCategory); }}  className={sel}>
          <option value="">All tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); load(filterStatus, filterTier, e.target.value); }}       className={sel}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <button type="button" onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]">
          + New Default Event
        </button>
        <button type="button" onClick={() => load()} className="px-3 py-1 bg-[#eef2f7] text-[#2d3748] rounded text-xs border border-[#dde4ec] hover:bg-[#e8ecf0]">
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
                <th className="pb-2 pr-4">Contract Value</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Default Type</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA</th>
                <th className="pb-2 pr-4">Confirmed</th>
                <th className="pb-2 pr-4">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const overdue = !!(item.sla_breached || (item.sla_due_at && new Date(item.sla_due_at) < new Date()));
                const regulator = hasRegulatorFlag(item);
                const outcome = item.replacement_appointed_at
                  ? '✓ Replaced'
                  : item.settlement_agreed_at
                  ? '⚖ Settled'
                  : item.withdrawn_at
                  ? '↩ Withdrawn'
                  : '—';
                const outcomeColor = item.replacement_appointed_at
                  ? 'text-green-700'
                  : item.settlement_agreed_at
                  ? 'text-teal-700'
                  : item.withdrawn_at
                  ? 'text-[#6b7685]'
                  : 'text-[#9aa5b4]';
                return (
                  <tr key={item.id} className="border-b hover:bg-[#eef2f7]">
                    <td className="py-2 pr-4 text-xs font-mono text-[#3d4756]">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs text-[#2d3748]">{item.contractor_name ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[#2d3748]">{fmtZar(item.contract_value_zar)}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[item.contract_tier] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>{item.contract_tier}</span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#3d4756]">{CATEGORY_LABELS[item.default_category] ?? item.default_category}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>{statusLabel(item.chain_status).text}</span>
                      {regulator && <span className="ml-1 px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">REGULATOR</span>}
                    </td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-[#6b7685]'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.sla_due_at)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#6b7685]">{fmtDate(item.default_confirmed_at)}</td>
                    <td className={`py-2 pr-4 text-xs font-medium ${outcomeColor}`}>{outcome}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-[#9aa5b4] text-sm">No contractor default events found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New Default Event modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">New EPC Contractor Default Event</h3>
            <p className="text-xs text-[#6b7685] mb-4">REIPPPP EPC &mdash; Records a contractor default event. Tier and SLA are derived from contract value.</p>
            <div className="space-y-3">
              <input placeholder="Project ID *" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Contract Value (ZAR) *" type="number" min={0} step="1" value={form.contract_value_zar} onChange={e => setForm(f => ({ ...f, contract_value_zar: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <select value={form.default_category} onChange={e => setForm(f => ({ ...f, default_category: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm text-[#2d3748]">
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>)}
              </select>
              <input placeholder="Contractor Name" value={form.contractor_name} onChange={e => setForm(f => ({ ...f, contractor_name: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Contractor Reference" value={form.contractor_reference} onChange={e => setForm(f => ({ ...f, contractor_reference: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" rows={3} />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={createDefault} disabled={createPending || !form.project_id || !form.contract_value_zar} className="px-4 py-2 bg-[#c2873a] text-white rounded text-sm hover:bg-[#a3702f] disabled:opacity-50">
                {createPending ? 'Submitting…' : 'Create event'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-[#eef2f7] text-[#2d3748] rounded text-sm hover:bg-[#e8ecf0]">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
