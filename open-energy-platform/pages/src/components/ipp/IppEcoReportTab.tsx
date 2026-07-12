import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface EcoReport {
  id: string;
  project_id: string;
  reporting_year: number;
  capacity_mw: number;
  capacity_tier: string;
  eco_name?: string;
  ea_reference?: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  violation_category?: string;
  compliant_at?: string;
  non_compliance_at?: string;
  enforcement_referral_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  compliant_count: number;
  non_compliant_count: number;
  enforcement_count: number;
  breached_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  audit_due:                      'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
  eco_appointed:                  'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  site_inspection_in_progress:    'bg-yellow-100 text-yellow-800',
  report_drafting:                'bg-yellow-100 text-yellow-800',
  submitted_to_dffe:              'bg-amber-100 text-amber-700',
  under_review:                   'bg-amber-100 text-amber-700',
  queries_raised:                 'bg-orange-100 text-orange-700',
  responses_submitted:            'bg-orange-100 text-orange-700',
  compliant:                      'bg-green-100 text-green-700',
  non_compliance_identified:      'bg-red-100 text-red-700',
  corrective_action_in_progress:  'bg-orange-200 text-orange-800',
  enforcement_referral:           'bg-red-200 text-red-800 animate-pulse',
};

const TIER_COLORS: Record<string, string> = {
  small:     'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  medium:    'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  large:     'bg-[var(--border-subtle, #e8ecf0)] text-[var(--ink-2, #3d4756)]',
  utility:   'bg-orange-100 text-orange-800',
  strategic: 'bg-red-100 text-red-700',
};

const VIOLATION_LABELS: Record<string, string> = {
  none:                '—',
  water_management:    'Water Management',
  waste_management:    'Waste Management',
  vegetation_clearing: 'Vegetation Clearing',
  noise_dust:          'Noise / Dust',
  heritage_resources:  'Heritage Resources',
  biodiversity:        'Biodiversity',
  rehabilitation:      'Rehabilitation',
};

const STATUSES = Object.keys(STATUS_COLORS);
const TIERS = ['small', 'medium', 'large', 'utility', 'strategic'] as const;

const sel = 'border rounded px-2 py-1 text-xs text-[var(--ink, #2d3748)] bg-surface-v2';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function hasRegulatorFlag(row: EcoReport): boolean {
  return !!(row.non_compliance_at || row.enforcement_referral_at);
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

export function IppEcoReportTab() {
  const [items, setItems] = useState<EcoReport[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [form, setForm] = useState({
    project_id: '',
    reporting_year: String(new Date().getFullYear()),
    capacity_mw: '',
    ea_reference: '',
    eco_name: '',
  });

  async function load(status = filterStatus, tier = filterTier) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (tier)   params.set('tier', tier);
      const res = await fetch(`/api/ipp-eco-report?${params}`, {
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

  async function createReport() {
    if (!form.project_id || !form.capacity_mw) return;
    setCreatePending(true);
    try {
      await fetch('/api/ipp-eco-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          project_id:     form.project_id,
          reporting_year: parseInt(form.reporting_year, 10),
          capacity_mw:    parseFloat(form.capacity_mw),
          ea_reference:   form.ea_reference || undefined,
          eco_name:       form.eco_name || undefined,
        }),
      });
      setShowCreate(false);
      setForm({ project_id: '', reporting_year: String(new Date().getFullYear()), capacity_mw: '', ea_reference: '', eco_name: '' });
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
          <KpiChip label="Total"       value={kpis.total} />
          <KpiChip label="Open"        value={kpis.open_count}        mode={kpis.open_count > 0 ? 'alert' : 'neutral'} />
          <KpiChip label="Compliant"   value={kpis.compliant_count}   mode={kpis.compliant_count > 0 ? 'good' : 'neutral'} />
          <KpiChip label="Enforcement" value={kpis.enforcement_count} mode={kpis.enforcement_count > 0 ? 'danger' : 'neutral'} />
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterTier); }} className={sel}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filterTier} onChange={e => { setFilterTier(e.target.value); load(filterStatus, e.target.value); }} className={sel}>
          <option value="">All tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="button" onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]">
          + New ECO Report
        </button>
        <button type="button" onClick={() => load()} className="px-3 py-1 bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)] rounded text-xs border border-[var(--border-subtle, #dde4ec)] hover:bg-[var(--border-subtle, #e8ecf0)]">
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
                <th className="pb-2 pr-4">Year</th>
                <th className="pb-2 pr-4">Capacity</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">ECO</th>
                <th className="pb-2 pr-4">EA Ref</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Violation</th>
                <th className="pb-2 pr-4">SLA</th>
                <th className="pb-2 pr-4">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const overdue = !!(item.sla_breached || (item.sla_due_at && new Date(item.sla_due_at) < new Date()));
                const regulator = hasRegulatorFlag(item);
                const outcome = item.compliant_at
                  ? { label: '✓ Compliant', cls: 'text-green-700' }
                  : item.enforcement_referral_at
                  ? { label: '⚠ Enforcement', cls: 'text-red-700' }
                  : item.non_compliance_at
                  ? { label: '✗ Non-Compliant', cls: 'text-orange-700' }
                  : { label: '—', cls: 'text-[var(--ink-2, #9aa5b4)]' };
                const eaRef = item.ea_reference ? item.ea_reference.slice(0, 20) : '—';
                const violation = item.violation_category ? (VIOLATION_LABELS[item.violation_category] ?? item.violation_category) : '—';
                return (
                  <tr key={item.id} className="border-b hover:bg-[var(--s2, #eef2f7)]">
                    <td className="py-2 pr-4 text-xs font-mono text-[var(--ink-2, #3d4756)]">{item.id.slice(0, 12)}</td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink, #2d3748)]">{item.reporting_year}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink, #2d3748)]">{item.capacity_mw} MW</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[item.capacity_tier] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>{item.capacity_tier}</span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink, #2d3748)]">{item.eco_name ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink-2, #6b7685)] font-mono">{eaRef}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>{statusLabel(item.chain_status).text}</span>
                      {regulator && <span className="ml-1 px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">REGULATOR</span>}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink-2, #3d4756)]">{violation}</td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-[var(--ink-2, #6b7685)]'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.sla_due_at)}
                    </td>
                    <td className={`py-2 pr-4 text-xs font-medium ${outcome.cls}`}>{outcome.label}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={10} className="py-10 text-center text-[var(--ink-2, #9aa5b4)] text-sm">No ECO audit reports found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New ECO Report modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-surface-v2 rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">New ECO Annual Report</h3>
            <p className="text-xs text-[var(--ink-2, #6b7685)] mb-4">NEMA / EA condition — records an annual Environmental Compliance Officer audit report. Tier and SLA are derived from capacity.</p>
            <div className="space-y-3">
              <input placeholder="Project ID *" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Reporting Year *" type="number" min={2000} max={2100} value={form.reporting_year} onChange={e => setForm(f => ({ ...f, reporting_year: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Capacity (MW) *" type="number" min={0} step="0.01" value={form.capacity_mw} onChange={e => setForm(f => ({ ...f, capacity_mw: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="EA Reference" value={form.ea_reference} onChange={e => setForm(f => ({ ...f, ea_reference: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="ECO Name" value={form.eco_name} onChange={e => setForm(f => ({ ...f, eco_name: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={createReport} disabled={createPending || !form.project_id || !form.capacity_mw} className="px-4 py-2 bg-[#c2873a] text-white rounded text-sm hover:bg-[#a3702f] disabled:opacity-50">
                {createPending ? 'Submitting…' : 'Create report'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)] rounded text-sm hover:bg-[var(--border-subtle, #e8ecf0)]">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
