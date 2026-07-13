// Wave 195 — Lender ESAP Compliance Monitoring Tab
//
// IFC Performance Standards 2012 + Equator Principles 4 + SARB + OHSA s8
// Environmental and Social Action Plan (ESAP) compliance lifecycle.

import React, { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface EsapRow {
  id: string;
  chain_status: string;
  project_id: string;
  reporting_period: string;
  commitment_tier: string;
  es_monitor_id: string | null;
  finding_count_minor: number;
  finding_count_major: number;
  remediation_deadline: string | null;
  breach_basis: string | null;
  sla_deadline: string | null;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface EsapKpis {
  open_periods: number;
  major_findings_count: number;
  breach_declared_count: number;
  avg_compliance_score?: number;
  in_progress?: number;
  sla_breached_count?: number;
  closed_clean?: number;
}

interface TimelineEvent {
  id: string;
  action: string;
  actor_id: string | null;
  created_at: string;
  data?: unknown;
}

// ─── Status metadata ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  monitoring_period_open:  'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  data_collection:         '',
  site_verification:       'bg-cyan-100 text-cyan-700',
  draft_report:            '',
  lender_review:           'bg-purple-100 text-purple-700',
  minor_findings:          'bg-amber-100 text-amber-700',
  accepted:                'bg-green-100 text-green-700',
  major_findings:          'bg-orange-100 text-orange-700',
  action_plan_required:    'bg-red-100 text-red-700',
  action_plan_submitted:   'bg-yellow-100 text-yellow-800',
  verified:                'bg-teal-100 text-teal-700',
  breach_declared:         'bg-red-200 text-red-900',
};

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  data_collection: { background: 'var(--s1, oklch(0.96 0.006 250))', color: 'var(--accent, oklch(0.40 0.12 250))' },
  draft_report:    { background: 'var(--s2, oklch(0.94 0.01 270))',  color: 'var(--accent, oklch(0.40 0.09 270))' },
};

const STATUS_LABELS: Record<string, string> = {
  monitoring_period_open:  'Period Open',
  data_collection:         'Data Collection',
  site_verification:       'Site Verification',
  draft_report:            'Draft Report',
  lender_review:           'Lender Review',
  minor_findings:          'Minor Findings',
  accepted:                'Accepted',
  major_findings:          'Major Findings',
  action_plan_required:    'Action Plan Required',
  action_plan_submitted:   'Action Plan Submitted',
  verified:                'Verified',
  breach_declared:         'Breach Declared',
};

const TIER_COLORS: Record<string, string> = {
  systemic:    'bg-red-100 text-red-800',
  major:       'bg-orange-100 text-orange-700',
  significant: 'bg-amber-100 text-amber-700',
  minor:       '',
  routine:     'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
};

const TIER_STYLES: Record<string, React.CSSProperties> = {
  minor: { background: 'var(--s1, oklch(0.96 0.006 250))', color: 'var(--accent, oklch(0.40 0.12 250))' },
};

const TIER_LABELS: Record<string, string> = {
  systemic:    'Systemic (90d)',
  major:       'Major (60d)',
  significant: 'Significant (45d)',
  minor:       'Minor (30d)',
  routine:     'Routine (21d)',
};

// ─── Actions per state ────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set(['accepted', 'verified', 'breach_declared']);

interface ActionDef {
  name: string;
  label: string;
  variant?: 'danger' | 'warn' | 'success';
}

const ACTION_LABELS: Record<string, string> = {
  open_monitoring_period: 'Open Monitoring Period',
  submit_data:            'Submit E&S Data',
  verify_site:            'Complete Site Verification',
  prepare_draft:          'Prepare Draft Report',
  complete_lender_review: 'Complete Lender Review',
  accept_report:          'Accept Report',
  flag_major_findings:    'Flag Major Findings',
  submit_action_plan:     'Submit Action Plan',
  verify_remediation:     'Verify Remediation',
  declare_breach:         'Declare Breach',
};

function getActions(item: EsapRow): ActionDef[] {
  if (HARD_TERMINALS.has(item.chain_status)) return [];
  switch (item.chain_status) {
    case 'monitoring_period_open':
      return [
        { name: 'open_monitoring_period', label: ACTION_LABELS.open_monitoring_period, variant: 'success' },
        { name: 'declare_breach',         label: ACTION_LABELS.declare_breach,         variant: 'danger'  },
      ];
    case 'data_collection':
      return [
        { name: 'submit_data',    label: ACTION_LABELS.submit_data,    variant: 'success' },
        { name: 'declare_breach', label: ACTION_LABELS.declare_breach, variant: 'danger'  },
      ];
    case 'site_verification':
      return [
        { name: 'verify_site',    label: ACTION_LABELS.verify_site,    variant: 'success' },
        { name: 'declare_breach', label: ACTION_LABELS.declare_breach, variant: 'danger'  },
      ];
    case 'draft_report':
      return [
        { name: 'prepare_draft',  label: ACTION_LABELS.prepare_draft,  variant: 'success' },
        { name: 'declare_breach', label: ACTION_LABELS.declare_breach, variant: 'danger'  },
      ];
    case 'lender_review':
      return [
        { name: 'complete_lender_review', label: ACTION_LABELS.complete_lender_review },
        { name: 'flag_major_findings',    label: ACTION_LABELS.flag_major_findings,    variant: 'warn'   },
        { name: 'declare_breach',         label: ACTION_LABELS.declare_breach,         variant: 'danger' },
      ];
    case 'minor_findings':
      return [
        { name: 'accept_report',  label: ACTION_LABELS.accept_report,  variant: 'success' },
        { name: 'declare_breach', label: ACTION_LABELS.declare_breach, variant: 'danger'  },
      ];
    case 'major_findings':
      return [
        { name: 'declare_breach', label: ACTION_LABELS.declare_breach, variant: 'danger' },
      ];
    case 'action_plan_required':
      return [
        { name: 'submit_action_plan', label: ACTION_LABELS.submit_action_plan, variant: 'success' },
        { name: 'declare_breach',     label: ACTION_LABELS.declare_breach,     variant: 'danger'  },
      ];
    case 'action_plan_submitted':
      return [
        { name: 'verify_remediation', label: ACTION_LABELS.verify_remediation, variant: 'success' },
        { name: 'declare_breach',     label: ACTION_LABELS.declare_breach,     variant: 'danger'  },
      ];
    default:
      return [];
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined): { text: string; isPast: boolean } {
  if (!s) return { text: '—', isPast: false };
  const d = new Date(s);
  if (isNaN(d.getTime())) return { text: '—', isPast: false };
  return {
    text: d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }),
    isPast: d < new Date(),
  };
}

function authHeader(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const PAGE_SIZE = 20;
const sel = 'border rounded px-2 py-1 text-xs text-[var(--ink, #2d3748)] bg-surface-v2';

// ─── KPI chip ─────────────────────────────────────────────────────────────────

type KpiMode = 'neutral' | 'good' | 'alert' | 'danger';

function KpiChip({ label, value, mode = 'neutral' }: { label: string; value: string | number; mode?: KpiMode }) {
  const border =
    mode === 'danger' ? 'border-red-200 bg-red-50'       :
    mode === 'alert'  ? 'border-orange-200 bg-orange-50' :
    mode === 'good'   ? 'border-green-200 bg-green-50'   :
    'border-[var(--border-subtle, #dde4ec)] bg-surface-v2';
  const text =
    mode === 'danger' ? 'text-red-700'    :
    mode === 'alert'  ? 'text-orange-700' :
    mode === 'good'   ? 'text-green-700'  :
    'text-[var(--ink, #0f1c2e)]';
  return (
    <div className={`rounded-lg p-3 border ${border}`}>
      <div className="text-xs text-[var(--ink-2, #6b7685)]">{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const COMMITMENT_TIERS = ['systemic', 'major', 'significant', 'minor', 'routine'] as const;
const STATUSES = Object.keys(STATUS_LABELS);

export function LenderEsapTab() {
  const [items, setItems]         = useState<EsapRow[]>([]);
  const [kpis, setKpis]           = useState<EsapKpis | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [filterStatus, setFilterStatus]   = useState('');
  const [filterTier, setFilterTier]       = useState('');
  const [page, setPage]           = useState(1);

  // Detail drawer
  const [detailItem, setDetailItem]         = useState<EsapRow | null>(null);
  const [timeline, setTimeline]             = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Action modal
  const [actionItem, setActionItem]         = useState<EsapRow | null>(null);
  const [selectedAction, setSelectedAction] = useState('');
  const [actionReason, setActionReason]     = useState('');
  const [actionMajorFindings, setActionMajorFindings] = useState('');
  const [actionBreachBasis, setActionBreachBasis]     = useState('');
  const [actionLoading, setActionLoading]   = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate]         = useState(false);
  const [creating, setCreating]             = useState(false);
  const [createError, setCreateError]       = useState<string | null>(null);
  const [formProjectId, setFormProjectId]   = useState('');
  const [formPeriod, setFormPeriod]         = useState('');
  const [formTier, setFormTier]             = useState<string>('major');
  const [formMonitorId, setFormMonitorId]   = useState('');

  async function load(
    status = filterStatus,
    tier   = filterTier,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (tier)   params.set('commitment_tier', tier);
      params.set('per_page', '200');
      const res = await fetch(`/api/esap-compliance?${params}`, {
        headers: authHeader(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as {
        success: boolean;
        data: EsapRow[];
        kpis: EsapKpis;
      };
      setItems(json.data ?? []);
      if (json.kpis) setKpis(json.kpis);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDetail(id: string) {
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/esap-compliance/${id}`, {
        headers: authHeader(),
      });
      if (!res.ok) return;
      const json = await res.json() as { success: boolean; data: EsapRow & { timeline: TimelineEvent[] } };
      setTimeline(json.data?.timeline ?? []);
    } finally {
      setTimelineLoading(false);
    }
  }

  function openDetail(item: EsapRow) {
    setDetailItem(item);
    setTimeline([]);
    loadDetail(item.id);
  }

  // ─── Create handler ───────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectId.trim() || !formPeriod.trim() || !formTier) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_id:       formProjectId.trim(),
        reporting_period: formPeriod.trim(),
        commitment_tier:  formTier,
      };
      if (formMonitorId.trim()) body.es_monitor_id = formMonitorId.trim();

      const res = await fetch('/api/esap-compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setShowCreate(false);
      setFormProjectId('');
      setFormPeriod('');
      setFormTier('major');
      setFormMonitorId('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  // ─── Action handlers ──────────────────────────────────────────────────────

  function openActionPicker(item: EsapRow) {
    const actions = getActions(item);
    if (actions.length === 0) return;
    setActionItem(item);
    setSelectedAction(actions[0].name);
    setActionReason('');
    setActionMajorFindings('');
    setActionBreachBasis('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setSelectedAction('');
    setActionReason('');
    setActionMajorFindings('');
    setActionBreachBasis('');
    setActionError(null);
  }

  async function submitAction() {
    if (!actionItem || !selectedAction) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { action: selectedAction };
      if (actionReason.trim()) body.reason = actionReason.trim();
      if (selectedAction === 'flag_major_findings' && actionMajorFindings.trim()) {
        body.finding_count_major = parseInt(actionMajorFindings.trim(), 10) || 0;
      }
      if (selectedAction === 'declare_breach' && actionBreachBasis.trim()) {
        body.breach_basis = actionBreachBasis.trim();
      }

      const res = await fetch(`/api/esap-compliance/${actionItem.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      closeAction();
      if (detailItem?.id === actionItem.id) setDetailItem(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  // ─── Derived values ───────────────────────────────────────────────────────

  const openPeriods    = kpis?.open_periods         ?? items.filter(i => !HARD_TERMINALS.has(i.chain_status)).length;
  const majorFindings  = kpis?.major_findings_count ?? items.filter(i => i.chain_status === 'major_findings' || i.chain_status === 'action_plan_required').length;
  const breachCount    = kpis?.breach_declared_count ?? items.filter(i => i.chain_status === 'breach_declared').length;
  const slaBreached    = kpis?.sla_breached_count   ?? items.filter(i => i.sla_breached === 1).length;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const modalActions = actionItem ? getActions(actionItem) : [];
  const actionLabelCurrent = modalActions.find(a => a.name === selectedAction)?.label ?? 'Confirm';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4">

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip
          label="Open Periods"
          value={openPeriods}
          mode={openPeriods > 0 ? 'neutral' : 'good'}
        />
        <KpiChip
          label="Major Findings"
          value={majorFindings}
          mode={majorFindings > 0 ? 'alert' : 'good'}
        />
        <KpiChip
          label="Breach Declared"
          value={breachCount}
          mode={breachCount > 0 ? 'danger' : 'good'}
        />
        <KpiChip
          label="SLA Breached"
          value={slaBreached}
          mode={slaBreached > 0 ? 'danger' : 'neutral'}
        />
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
          {COMMITMENT_TIERS.map(t => (
            <option key={t} value={t}>{TIER_LABELS[t]}</option>
          ))}
        </select>
        <button type="button"
          onClick={() => load()}
          className="px-3 py-1 bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)] rounded text-xs border border-[var(--border-subtle, #dde4ec)] hover:bg-[var(--border-subtle, #e8ecf0)]"
        >
          Refresh
        </button>
        <button type="button"
          onClick={() => setShowCreate(v => !v)}
          className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]"
        >
          + New Period
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', background: 'var(--s1, oklch(0.97 0.003 250))' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>New ESAP Monitoring Period</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Project ID *</label>
              <input
                type="text"
                value={formProjectId}
                onChange={e => setFormProjectId(e.target.value)}
                placeholder="e.g. PROJ-WIND-001"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Reporting Period *</label>
              <input
                type="text"
                value={formPeriod}
                onChange={e => setFormPeriod(e.target.value)}
                placeholder="e.g. 2025-H1, 2025-Q3"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Commitment Tier *</label>
              <select
                value={formTier}
                onChange={e => setFormTier(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-surface-v2"
              >
                {COMMITMENT_TIERS.map(t => (
                  <option key={t} value={t}>{TIER_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">ES Monitor ID</label>
              <input
                type="text"
                value={formMonitorId}
                onChange={e => setFormMonitorId(e.target.value)}
                placeholder="e.g. ESM-IFC-001"
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
              {creating ? 'Creating…' : 'Create Period'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 bg-surface-v2 border rounded text-xs text-[var(--ink-2, #3d4756)] hover:bg-[var(--s2, #eef2f7)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-sm text-[var(--ink-2, #9aa5b4)] py-8 text-center">Loading&hellip;</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--ink-2, #6b7685)]">
                <th className="pb-2 pr-3">Project</th>
                <th className="pb-2 pr-3">Period</th>
                <th className="pb-2 pr-3">Tier</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3 text-right">Minor</th>
                <th className="pb-2 pr-3 text-right">Major</th>
                <th className="pb-2 pr-3">SLA</th>
                <th className="pb-2 pr-3 text-center">Reg.</th>
                <th className="pb-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const actions = getActions(item);
                const due     = fmtDate(item.sla_deadline);
                return (
                  <tr
                    key={item.id}
                    className="border-b hover:bg-[var(--s2, #eef2f7)] cursor-pointer"
                    onClick={() => openDetail(item)}
                  >
                    <td className="py-2 pr-3 text-xs font-medium text-[var(--ink, #1e2a38)]">
                      {item.project_id}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--ink-2, #3d4756)]">
                      {item.reporting_period}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[item.commitment_tier] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`} style={TIER_STYLES[item.commitment_tier]}>
                        {item.commitment_tier}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`} style={STATUS_STYLES[item.chain_status]}>
                        {STATUS_LABELS[item.chain_status] ?? statusLabel(item.chain_status).text}
                      </span>
                      {item.sla_breached === 1 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600 font-semibold">SLA</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums text-[var(--ink-2, #3d4756)]">
                      {item.finding_count_minor}
                    </td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">
                      <span className={item.finding_count_major > 0 ? 'text-orange-700 font-semibold' : 'text-[var(--ink-2, #9aa5b4)]'}>
                        {item.finding_count_major}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums">
                      <span className={due.isPast ? 'text-red-600 font-medium' : 'text-[var(--ink-2, #3d4756)]'}>
                        {due.text}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      {item.regulator_notified === 1 ? (
                        <span title="Regulator notified" className="text-orange-500 text-base leading-none">&#9873;</span>
                      ) : (
                        <span className="text-[var(--border-subtle, #e8ecf0)] text-base leading-none">&#9873;</span>
                      )}
                    </td>
                    <td
                      className="py-2 pr-3"
                      onClick={e => e.stopPropagation()}
                    >
                      {actions.length > 0 && (
                        <button type="button"
                          onClick={() => openActionPicker(item)}
                          className="px-2 py-0.5 text-xs rounded border"
                          style={{ background: 'var(--s1, oklch(0.96 0.006 250))', color: 'var(--accent, oklch(0.40 0.12 250))', borderColor: 'var(--border-subtle, oklch(0.87 0.006 250))' }}
                        >
                          Actions
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[var(--ink-2, #9aa5b4)] text-sm">
                    No ESAP compliance periods found
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
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-[var(--s2, #eef2f7)]"
          >
            &larr; Prev
          </button>
          <span className="text-xs text-[var(--ink-2, #6b7685)]">Page {page} of {totalPages}</span>
          <button type="button"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-[var(--s2, #eef2f7)]"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* ─── Detail drawer ────────────────────────────────────────────────── */}
      {detailItem && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailItem(null); }} className="fixed inset-0 z-50 flex items-center justify-end bg-black/30">
          <div className="bg-surface-v2 h-full w-full max-w-lg shadow-2xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="text-sm font-semibold text-[var(--ink, #1e2a38)]">
                  ESAP Compliance — {detailItem.project_id}
                </div>
                <div className="text-xs text-[var(--ink-2, #6b7685)] mt-0.5">
                  {detailItem.reporting_period} &nbsp;&middot;&nbsp; {detailItem.commitment_tier}
                </div>
              </div>
              <button type="button"
                onClick={() => setDetailItem(null)}
                className="text-[var(--ink-2, #9aa5b4)] hover:text-[var(--ink, #2d3748)] text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 p-5 space-y-5">
              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[detailItem.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`} style={STATUS_STYLES[detailItem.chain_status]}>
                  {STATUS_LABELS[detailItem.chain_status] ?? statusLabel(detailItem.chain_status).text}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[detailItem.commitment_tier] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`} style={TIER_STYLES[detailItem.commitment_tier]}>
                  {TIER_LABELS[detailItem.commitment_tier] ?? detailItem.commitment_tier}
                </span>
                {detailItem.sla_breached === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">SLA Breached</span>
                )}
                {detailItem.regulator_notified === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700 font-semibold">Regulator Notified</span>
                )}
              </div>

              {/* Core fields */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Project ID</div>
                  <div className="font-medium text-[var(--ink, #1e2a38)]">{detailItem.project_id}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Reporting Period</div>
                  <div className="text-[var(--ink, #1e2a38)]">{detailItem.reporting_period}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">ES Monitor ID</div>
                  <div className="text-[var(--ink, #2d3748)]">{detailItem.es_monitor_id ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">SLA Deadline</div>
                  <div className={`tabular-nums ${fmtDate(detailItem.sla_deadline).isPast ? 'text-red-600 font-medium' : 'text-[var(--ink, #1e2a38)]'}`}>
                    {fmtDate(detailItem.sla_deadline).text}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Minor Findings</div>
                  <div className="text-[var(--ink, #1e2a38)] tabular-nums">{detailItem.finding_count_minor}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Major Findings</div>
                  <div className={`tabular-nums font-semibold ${detailItem.finding_count_major > 0 ? 'text-orange-700' : 'text-[var(--ink-2, #9aa5b4)]'}`}>
                    {detailItem.finding_count_major}
                  </div>
                </div>
                {detailItem.remediation_deadline && (
                  <div>
                    <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Remediation Deadline</div>
                    <div className={`tabular-nums ${fmtDate(detailItem.remediation_deadline).isPast ? 'text-red-600 font-medium' : 'text-[var(--ink, #1e2a38)]'}`}>
                      {fmtDate(detailItem.remediation_deadline).text}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Actor</div>
                  <div className="text-[var(--ink, #2d3748)] break-all">{detailItem.actor_id ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Created</div>
                  <div className="text-[var(--ink-2, #3d4756)]">{fmtDate(detailItem.created_at).text}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Updated</div>
                  <div className="text-[var(--ink-2, #3d4756)]">{fmtDate(detailItem.updated_at).text}</div>
                </div>
              </div>

              {/* Breach basis */}
              {detailItem.breach_basis && (
                <div>
                  <div className="text-xs text-[var(--ink-2, #9aa5b4)] mb-1">Breach Basis</div>
                  <div className="text-xs text-red-700 bg-red-50 rounded p-2 border border-red-100 whitespace-pre-wrap">
                    {detailItem.breach_basis}
                  </div>
                </div>
              )}

              {/* Reason */}
              {detailItem.reason && (
                <div>
                  <div className="text-xs text-[var(--ink-2, #9aa5b4)] mb-1">Reason / Notes</div>
                  <div className="text-xs text-[var(--ink, #2d3748)] bg-[var(--s1, #f8fafc)] rounded p-2 border whitespace-pre-wrap">
                    {detailItem.reason}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="border-t pt-4">
                <div className="text-xs font-semibold text-[var(--ink, #2d3748)] mb-2">Event Timeline</div>
                {timelineLoading ? (
                  <div className="text-xs text-[var(--ink-2, #9aa5b4)]">Loading timeline&hellip;</div>
                ) : timeline.length === 0 ? (
                  <div className="text-xs text-[var(--ink-2, #9aa5b4)] italic">No events recorded yet</div>
                ) : (
                  <ol className="space-y-2">
                    {timeline.map(evt => (
                      <li key={evt.id} className="flex gap-3 text-xs">
                        <span className="text-[var(--ink-2, #9aa5b4)] tabular-nums shrink-0">
                          {fmtDate(evt.created_at).text}
                        </span>
                        <span className="text-[var(--ink, #2d3748)]">{evt.action ?? String(evt.id)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Actions */}
              {!HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="border-t pt-4">
                  <div className="text-xs font-semibold text-[var(--ink, #2d3748)] mb-2">Advance State Machine</div>
                  <button type="button"
                    onClick={() => {
                      setDetailItem(null);
                      openActionPicker(detailItem);
                    }}
                    className="px-4 py-1.5 text-xs rounded bg-[#c2873a] text-white hover:bg-[#a3702f]"
                  >
                    Open Action Picker
                  </button>
                </div>
              )}

              {HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="border-t pt-4">
                  <div className="text-xs text-[var(--ink-2, #9aa5b4)] italic">
                    This ESAP record is in a terminal state — no further actions available.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Action modal ────────────────────────────────────────────────── */}
      {actionItem && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setActionItem(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface-v2 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-[var(--ink, #1e2a38)] mb-1">
              ESAP Compliance Action
            </div>
            <div className="text-xs text-[var(--ink-2, #6b7685)] mb-4">
              {actionItem.project_id} &mdash; {actionItem.reporting_period}
              {' '}({TIER_LABELS[actionItem.commitment_tier] ?? actionItem.commitment_tier})
              &nbsp;&mdash;&nbsp;
              {STATUS_LABELS[actionItem.chain_status] ?? actionItem.chain_status}
            </div>

            <div className="mb-3">
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Action *</label>
              <select
                value={selectedAction}
                onChange={e => setSelectedAction(e.target.value)}
                className="w-full border rounded px-2 py-1 text-xs bg-surface-v2"
              >
                {modalActions.map(a => (
                  <option key={a.name} value={a.name}>{a.label}</option>
                ))}
              </select>
            </div>

            {selectedAction === 'flag_major_findings' && (
              <div className="mb-3">
                <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Major Finding Count</label>
                <input
                  type="number"
                  min="1"
                  value={actionMajorFindings}
                  onChange={e => setActionMajorFindings(e.target.value)}
                  placeholder="Number of major findings"
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </div>
            )}

            {selectedAction === 'declare_breach' && (
              <div className="mb-3">
                <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Breach Basis *</label>
                <textarea
                  value={actionBreachBasis}
                  onChange={e => setActionBreachBasis(e.target.value)}
                  placeholder="Regulatory basis for breach declaration (IFC PS, EP4 clause, SARB / NERSA provision)"
                  rows={3}
                  className="w-full border rounded px-2 py-1 text-xs resize-none"
                />
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Reason / Notes</label>
              <textarea
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="Supporting detail or reference"
                rows={2}
                className="w-full border rounded px-2 py-1 text-xs resize-none"
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
                className="px-3 py-1.5 text-xs border rounded bg-surface-v2 text-[var(--ink-2, #3d4756)] hover:bg-[var(--s2, #eef2f7)]"
              >
                Cancel
              </button>
              <button type="button"
                onClick={submitAction}
                disabled={actionLoading || !selectedAction}
                className={`px-4 py-1.5 text-xs rounded text-white disabled:opacity-50 ${
                  modalActions.find(a => a.name === selectedAction)?.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : modalActions.find(a => a.name === selectedAction)?.variant === 'warn'
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-[#c2873a] hover:bg-[#a3702f]'
                }`}
              >
                {actionLoading ? 'Submitting…' : actionLabelCurrent}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LenderEsapTab;
