import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface CepComplianceRecord {
  id: string;
  participant_id: string;
  project_ref: string;
  compliance_year: number;
  project_tier: 'small' | 'medium' | 'large' | 'major' | 'flagship';
  project_mw: number;
  cep_equity_pct: number | null;
  structure_type: string;
  distribution_amount_zar: number | null;
  community_dev_spend_zar: number | null;
  trustee_name: string | null;
  chain_status: string;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface CepComplianceKpis {
  total: number;
  active: number;
  sla_breached: number;
  compliant: number;
  non_compliant_lapsed: number;
}

const STATUS_COLORS: Record<string, string> = {
  cep_triggered:              'bg-[#eef2f7] text-[#6b7685]',
  stakeholder_identification: 'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  distribution_calculation:   'bg-cyan-100 text-cyan-700',
  trustee_approval:           'bg-sky-100 text-sky-700',
  payment_preparation:        'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  distributions_paid:         'bg-violet-100 text-violet-700',
  community_dev_verification: 'bg-purple-100 text-purple-700',
  documentation_compiled:     'bg-yellow-100 text-yellow-800',
  dmre_submission:            'bg-teal-100 text-teal-700',
  cep_compliant:              'bg-green-100 text-green-700',
  cep_non_compliant:          'bg-red-100 text-red-700',
  cep_lapsed:                 'bg-orange-100 text-orange-700',
};

const STATUS_LABELS: Record<string, string> = {
  cep_triggered:              'CEP Triggered',
  stakeholder_identification: 'Stakeholder Identification',
  distribution_calculation:   'Distribution Calculation',
  trustee_approval:           'Trustee Approval',
  payment_preparation:        'Payment Preparation',
  distributions_paid:         'Distributions Paid',
  community_dev_verification: 'Community Dev Verification',
  documentation_compiled:     'Documentation Compiled',
  dmre_submission:            'DMRE Submission',
  cep_compliant:              'CEP Compliant',
  cep_non_compliant:          'CEP Non-Compliant',
  cep_lapsed:                 'CEP Lapsed',
};

// INVERTED SLA — larger project = more community obligation = more dangerous colour
const TIER_BADGE_COLORS: Record<string, string> = {
  small:    'bg-[oklch(0.94_0.006_250)] text-[oklch(0.17_0.010_250)]',
  medium:   'bg-[oklch(0.94_0.006_250)] text-[oklch(0.17_0.010_250)]',
  large:    'bg-purple-100 text-purple-800',
  major:    'bg-orange-100 text-orange-800',
  flagship: 'bg-red-100 text-red-800',
};

const STRUCTURE_TYPE_LABELS: Record<string, string> = {
  community_trust: 'Community Trust',
  npc:             'NPC',
  spv:             'SPV',
  direct_equity:   'Direct Equity',
  blended:         'Blended',
};

const TERMINAL_STATUSES = new Set([
  'cep_compliant',
  'cep_non_compliant',
  'cep_lapsed',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS    = ['small', 'medium', 'large', 'major', 'flagship'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[#2d3748] bg-white';

function fmtZarM(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `R ${(amount / 1_000_000).toFixed(1)}M`;
}

function fmtMw(mw: number): string {
  return `${mw.toFixed(1)} MW`;
}

function fmtPct(pct: number | null | undefined): string {
  if (pct == null) return '—';
  return `${pct.toFixed(1)}%`;
}

type KpiChipProps = { label: string; value: string | number; mode?: 'alert' | 'good' | 'danger' | 'neutral' };
function KpiChip({ label, value, mode = 'neutral' }: KpiChipProps) {
  const border =
    mode === 'danger' ? 'border-red-200 bg-red-50'       :
    mode === 'alert'  ? 'border-orange-200 bg-orange-50' :
    mode === 'good'   ? 'border-green-200 bg-green-50'   :
    'border-[#dde4ec] bg-white';
  const text =
    mode === 'danger' ? 'text-red-700'    :
    mode === 'alert'  ? 'text-orange-700' :
    mode === 'good'   ? 'text-green-700'  :
    'text-[#0f1c2e]';
  return (
    <div className={`rounded-lg p-3 border ${border}`}>
      <div className="text-xs text-[#6b7685]">{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
    </div>
  );
}

export function IppCepComplianceTab() {
  const [items, setItems]               = useState<CepComplianceRecord[]>([]);
  const [kpis, setKpis]                 = useState<CepComplianceKpis | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier]     = useState('');
  const [page, setPage]                 = useState(1);

  // Create form state
  const [showCreate, setShowCreate]                         = useState(false);
  const [creating, setCreating]                             = useState(false);
  const [createError, setCreateError]                       = useState<string | null>(null);
  const [formProjectRef, setFormProjectRef]                 = useState('');
  const [formComplianceYear, setFormComplianceYear]         = useState(String(new Date().getFullYear()));
  const [formProjectMw, setFormProjectMw]                   = useState('');
  const [formCepEquityPct, setFormCepEquityPct]             = useState('');
  const [formStructureType, setFormStructureType]           = useState('community_trust');
  const [formDistributionAmt, setFormDistributionAmt]       = useState('');
  const [formCommunityDevSpend, setFormCommunityDevSpend]   = useState('');
  const [formTrusteeName, setFormTrusteeName]               = useState('');
  const [formTier, setFormTier]                             = useState<typeof TIERS[number]>('medium');
  const [formNotes, setFormNotes]                           = useState('');

  // Action modal state
  const [actionItem, setActionItem]       = useState<CepComplianceRecord | null>(null);
  const [actionName, setActionName]       = useState('');
  const [actionLabel, setActionLabel]     = useState('');
  const [actionNotes, setActionNotes]     = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError]     = useState<string | null>(null);

  async function load(
    status = filterStatus,
    tier   = filterTier,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (tier)   params.set('tier', tier);
      const res = await fetch(`/api/ipp-cep-compliance?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const d = json?.data ?? json;
      setItems(d?.items ?? d ?? []);
      if (d?.kpis) setKpis(d.kpis);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived KPIs (fallback to client-side if server doesn't return kpis)
  const total             = kpis?.total               ?? items.length;
  const active            = kpis?.active              ?? items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached          = kpis?.sla_breached        ?? items.filter(i => i.sla_breached === 1).length;
  const compliant         = kpis?.compliant           ?? items.filter(i => i.chain_status === 'cep_compliant').length;
  const nonCompliantLapsed = kpis?.non_compliant_lapsed ?? items.filter(i =>
    i.chain_status === 'cep_non_compliant' || i.chain_status === 'cep_lapsed'
  ).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formComplianceYear || !formProjectMw) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:     formProjectRef.trim(),
        compliance_year: parseInt(formComplianceYear, 10),
        project_mw:      parseFloat(formProjectMw),
        structure_type:  formStructureType,
        project_tier:    formTier,
      };
      if (formCepEquityPct.trim())    body.cep_equity_pct          = parseFloat(formCepEquityPct);
      if (formDistributionAmt.trim()) body.distribution_amount_zar = parseFloat(formDistributionAmt);
      if (formCommunityDevSpend.trim()) body.community_dev_spend_zar = parseFloat(formCommunityDevSpend);
      if (formTrusteeName.trim())     body.trustee_name            = formTrusteeName.trim();
      if (formNotes.trim())           body.notes                   = formNotes.trim();

      const res = await fetch('/api/ipp-cep-compliance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      setShowCreate(false);
      setFormProjectRef('');
      setFormComplianceYear(String(new Date().getFullYear()));
      setFormProjectMw('');
      setFormCepEquityPct('');
      setFormStructureType('community_trust');
      setFormDistributionAmt('');
      setFormCommunityDevSpend('');
      setFormTrusteeName('');
      setFormTier('medium');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function openAction(item: CepComplianceRecord, name: string, label: string) {
    setActionItem(item);
    setActionName(name);
    setActionLabel(label);
    setActionNotes('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setActionName('');
    setActionLabel('');
    setActionNotes('');
    setActionError(null);
  }

  async function submitAction() {
    if (!actionItem) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/ipp-cep-compliance/${actionItem.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          action: actionName,
          notes:  actionNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      closeAction();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  function getActions(item: CepComplianceRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    switch (item.chain_status) {
      case 'cep_triggered':
        return [{ name: 'identify_stakeholders', label: 'Identify Stakeholders' }];
      case 'stakeholder_identification':
        return [{ name: 'calculate_distributions', label: 'Calculate Distributions' }];
      case 'distribution_calculation':
        return [{ name: 'obtain_trustee_approval', label: 'Obtain Trustee Approval' }];
      case 'trustee_approval':
        return [{ name: 'prepare_payments', label: 'Prepare Payments' }];
      case 'payment_preparation':
        return [{ name: 'confirm_distributions_paid', label: 'Confirm Distributions Paid' }];
      case 'distributions_paid':
        return [{ name: 'verify_community_dev', label: 'Verify Community Dev' }];
      case 'community_dev_verification':
        return [{ name: 'compile_documentation', label: 'Compile Documentation' }];
      case 'documentation_compiled':
        return [{ name: 'submit_to_dmre', label: 'Submit to DMRE' }];
      case 'dmre_submission':
        return [
          { name: 'confirm_compliant',    label: 'Confirm Compliant',    variant: 'success' },
          { name: 'declare_non_compliant', label: 'Declare Non-Compliant', variant: 'danger'  },
          { name: 'lapse_cep',            label: 'Lapse CEP',            variant: 'danger'  },
        ];
      default:
        return [];
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiChip label="Total Records"          value={total} />
        <KpiChip label="Active"                 value={active}             mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"           value={breached}           mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Compliant"              value={compliant}          mode={compliant > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Non-Compliant / Lapsed" value={nonCompliantLapsed} mode={nonCompliantLapsed > 0 ? 'danger' : 'neutral'} />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterTier); }}
          className={sel}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
        <select
          value={filterTier}
          onChange={e => { setFilterTier(e.target.value); load(filterStatus, e.target.value); }}
          className={sel}
        >
          <option value="">All tiers</option>
          {TIERS.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <button type="button"
          onClick={() => load()}
          className="px-3 py-1 bg-[#eef2f7] text-[#2d3748] rounded text-xs border border-[#dde4ec] hover:bg-[#e8ecf0]"
        >
          Refresh
        </button>
        <button type="button"
          onClick={() => setShowCreate(v => !v)}
          className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]"
        >
          + New CEP Compliance
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'oklch(0.87 0.010 250)', background: 'oklch(0.94 0.006 250)' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>New CEP Compliance Record</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Project Ref *</label>
              <input
                type="text"
                value={formProjectRef}
                onChange={e => setFormProjectRef(e.target.value)}
                placeholder="PROJ-001"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Compliance Year *</label>
              <input
                type="number"
                value={formComplianceYear}
                onChange={e => setFormComplianceYear(e.target.value)}
                min={2000}
                max={2100}
                step={1}
                placeholder="2026"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Project MW *</label>
              <input
                type="number"
                value={formProjectMw}
                onChange={e => setFormProjectMw(e.target.value)}
                min={0}
                step={0.1}
                placeholder="200.0"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Project Tier *</label>
              <select
                value={formTier}
                onChange={e => setFormTier(e.target.value as typeof formTier)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {TIERS.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">CEP Equity % (optional)</label>
              <input
                type="number"
                value={formCepEquityPct}
                onChange={e => setFormCepEquityPct(e.target.value)}
                min={0}
                max={100}
                step={0.1}
                placeholder="30.0"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Structure Type *</label>
              <select
                value={formStructureType}
                onChange={e => setFormStructureType(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {Object.entries(STRUCTURE_TYPE_LABELS).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Distribution Amount (ZAR, optional)</label>
              <input
                type="number"
                value={formDistributionAmt}
                onChange={e => setFormDistributionAmt(e.target.value)}
                min={0}
                step={1}
                placeholder="4800000"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Community Dev Spend (ZAR, optional)</label>
              <input
                type="number"
                value={formCommunityDevSpend}
                onChange={e => setFormCommunityDevSpend(e.target.value)}
                min={0}
                step={1}
                placeholder="2200000"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Trustee Name (optional)</label>
              <input
                type="text"
                value={formTrusteeName}
                onChange={e => setFormTrusteeName(e.target.value)}
                placeholder="e.g. J. Dlamini"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs text-[#3d4756] mb-1">Notes</label>
              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
          </div>
          {createError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              {createError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-1.5 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f] disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 bg-white border rounded text-xs text-[#3d4756] hover:bg-[#eef2f7]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

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
                <th className="pb-2 pr-4">Project Ref</th>
                <th className="pb-2 pr-4">Year</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">MW</th>
                <th className="pb-2 pr-4">CEP Equity</th>
                <th className="pb-2 pr-4">Structure</th>
                <th className="pb-2 pr-4">Distribution</th>
                <th className="pb-2 pr-4">CD Spend</th>
                <th className="pb-2 pr-4">Trustee</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA Breached</th>
                <th className="pb-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const actions = getActions(item);
                return (
                  <tr key={item.id} className="border-b hover:bg-[#eef2f7]">
                    <td className="py-2 pr-4 text-xs font-mono text-[#2d3748]">{item.project_ref}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[#3d4756]">{item.compliance_year}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_BADGE_COLORS[item.project_tier] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {item.project_tier.charAt(0).toUpperCase() + item.project_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[#2d3748]">
                      {fmtMw(item.project_mw)}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[#3d4756]">
                      {fmtPct(item.cep_equity_pct)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#3d4756]">
                      {STRUCTURE_TYPE_LABELS[item.structure_type] ?? item.structure_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[#2d3748]">
                      {fmtZarM(item.distribution_amount_zar)}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[#2d3748]">
                      {fmtZarM(item.community_dev_spend_zar)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#6b7685] max-w-[120px] truncate" title={item.trustee_name ?? ''}>
                      {item.trustee_name ?? '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? statusLabel(item.chain_status).text}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {item.sla_breached === 1 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">Yes</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-[#eef2f7] text-[#9aa5b4]">No</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {actions.map(a => (
                          <button type="button"
                            key={a.name}
                            onClick={() => openAction(item, a.name, a.label)}
                            className={
                              a.variant === 'danger'
                                ? 'px-2 py-0.5 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 border border-red-200'
                                : a.variant === 'warn'
                                ? 'px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border border-yellow-200'
                                : a.variant === 'success'
                                ? 'px-2 py-0.5 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200 border border-green-200'
                                : 'px-2 py-0.5 text-xs rounded border'
                            }
                            style={
                              !a.variant ? {
                                background: 'oklch(0.94 0.006 250)',
                                color: 'oklch(0.46 0.16 55)',
                                borderColor: 'oklch(0.87 0.010 250)',
                              } : undefined
                            }
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-[#9aa5b4] text-sm">
                    No CEP compliance records found
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
            &larr; Prev
          </button>
          <span className="text-xs text-[#6b7685]">
            Page {page} of {totalPages}
          </span>
          <button type="button"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-[#eef2f7]"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Action modal */}
      {actionItem && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setActionItem(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-[#1e2a38] mb-1">{actionLabel}</div>
            <div className="text-xs text-[#6b7685] mb-4">
              CEP Compliance &mdash; {actionItem.project_ref} / {actionItem.compliance_year}
            </div>
            <div className="mb-3">
              <label className="block text-xs text-[#3d4756] mb-1">Notes (optional)</label>
              <textarea
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                rows={3}
                placeholder="Reason or remarks…"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            {actionError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 mb-3">
                {actionError}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button"
                onClick={closeAction}
                className="px-3 py-1.5 text-xs border rounded bg-white text-[#3d4756] hover:bg-[#eef2f7]"
              >
                Cancel
              </button>
              <button type="button"
                onClick={submitAction}
                disabled={actionLoading}
                className="px-4 py-1.5 text-xs rounded bg-[#c2873a] text-white hover:bg-[#a3702f] disabled:opacity-50"
              >
                {actionLoading ? 'Submitting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
