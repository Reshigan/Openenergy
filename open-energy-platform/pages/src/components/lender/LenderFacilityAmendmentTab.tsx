import React, { useState, useEffect } from 'react';

interface FacilityAmendmentItem {
  id: string;
  facility_id: string;
  amendment_ref: string | null;
  amendment_class: string;
  amendment_type: string | null;
  majority_threshold_pct: number | null;
  unanimous_required: number;
  consent_deadline: string | null;
  effective_date: string | null;
  security_variation: number;
  pricing_change_bps: number | null;
  description: string | null;
  chain_status: string;
  sla_deadline: string | null;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface AmendmentKpis {
  total: number;
  pending_amendments: number;
  consented_count: number;
  refused_count: number;
  unanimous_pending: number;
  lapsed_count: number;
  sla_breached_count: number;
}

// ─── Status meta ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { className: string; style?: React.CSSProperties }> = {
  amendment_requested:    { className: 'bg-[#eef2f7] text-[#3d4756]' },
  eligibility_assessed:   { className: '', style: { background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)' } },
  lender_circulated:      { className: 'bg-cyan-100 text-cyan-700' },
  majority_response:      { className: '', style: { background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)' } },
  unanimous_required:     { className: 'bg-amber-100 text-amber-700' },
  consent_obtained:       { className: 'bg-teal-100 text-teal-700' },
  documentation_prepared: { className: 'bg-violet-100 text-violet-700' },
  execution_signed:       { className: 'bg-purple-100 text-purple-700' },
  effective:              { className: 'bg-green-100 text-green-700' },
  refused:                { className: 'bg-red-100 text-red-700' },
  lapsed:                 { className: 'bg-[#eef2f7] text-[#9aa5b4]' },
  withdrawn:              { className: 'bg-[#eef2f7] text-[#6b7685]' },
};

const STATUS_LABELS: Record<string, string> = {
  amendment_requested:    'Requested',
  eligibility_assessed:   'Eligibility Assessed',
  lender_circulated:      'Circulated to Lenders',
  majority_response:      'Majority Response',
  unanimous_required:     'Unanimous Required',
  consent_obtained:       'Consent Obtained',
  documentation_prepared: 'Documentation Prepared',
  execution_signed:       'Execution Signed',
  effective:              'Effective',
  refused:                'Refused',
  lapsed:                 'Lapsed',
  withdrawn:              'Withdrawn',
};

// ─── Amendment class badges ───────────────────────────────────────────────────

const CLASS_COLORS: Record<string, { className: string; style?: React.CSSProperties }> = {
  unanimous_consent:        { className: 'bg-red-100 text-red-700' },
  majority_consent:         { className: 'bg-amber-100 text-amber-700' },
  technical_amendment:      { className: '', style: { background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)' } },
  administrative_amendment: { className: 'bg-cyan-100 text-cyan-700' },
  clerical_correction:      { className: 'bg-[#eef2f7] text-[#3d4756]' },
};

const CLASS_LABELS: Record<string, string> = {
  unanimous_consent:        'Unanimous Consent',
  majority_consent:         'Majority Consent',
  technical_amendment:      'Technical Amendment',
  administrative_amendment: 'Administrative',
  clerical_correction:      'Clerical Correction',
};

const CLASS_SLA: Record<string, string> = {
  unanimous_consent:        '60d SLA',
  majority_consent:         '45d SLA',
  technical_amendment:      '30d SLA',
  administrative_amendment: '21d SLA',
  clerical_correction:      '14d SLA',
};

// ─── Actions per state ────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set([
  'effective', 'refused', 'lapsed', 'withdrawn',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const AMENDMENT_CLASSES = [
  'unanimous_consent',
  'majority_consent',
  'technical_amendment',
  'administrative_amendment',
  'clerical_correction',
] as const;

interface ActionDef {
  name: string;
  label: string;
  variant?: 'danger' | 'warn' | 'success';
}

const ACTION_LABELS: Record<string, string> = {
  assess_eligibility:       'Assess Eligibility',
  circulate_to_lenders:     'Circulate to Lenders',
  record_majority_response: 'Record Majority Response',
  escalate_to_unanimous:    'Escalate to Unanimous',
  obtain_consent:           'Obtain Consent',
  prepare_documentation:    'Prepare Documentation',
  execute_amendment:        'Execute Amendment',
  record_effective_date:    'Record Effective Date',
  refuse_amendment:         'Refuse Amendment',
  lapse_amendment:          'Lapse Amendment',
};

function getActions(item: FacilityAmendmentItem): ActionDef[] {
  if (HARD_TERMINALS.has(item.chain_status)) return [];
  switch (item.chain_status) {
    case 'amendment_requested':
      return [
        { name: 'assess_eligibility', label: ACTION_LABELS.assess_eligibility, variant: 'success' },
        { name: 'lapse_amendment',    label: ACTION_LABELS.lapse_amendment,    variant: 'warn'    },
      ];
    case 'eligibility_assessed':
      return [
        { name: 'circulate_to_lenders', label: ACTION_LABELS.circulate_to_lenders, variant: 'success' },
        { name: 'refuse_amendment',     label: ACTION_LABELS.refuse_amendment,     variant: 'danger'  },
        { name: 'lapse_amendment',      label: ACTION_LABELS.lapse_amendment,      variant: 'warn'    },
      ];
    case 'lender_circulated':
      return [
        { name: 'record_majority_response', label: ACTION_LABELS.record_majority_response                    },
        { name: 'refuse_amendment',         label: ACTION_LABELS.refuse_amendment,         variant: 'danger' },
        { name: 'lapse_amendment',          label: ACTION_LABELS.lapse_amendment,          variant: 'warn'   },
      ];
    case 'majority_response':
      return [
        { name: 'obtain_consent',           label: ACTION_LABELS.obtain_consent,           variant: 'success' },
        { name: 'escalate_to_unanimous',    label: ACTION_LABELS.escalate_to_unanimous                       },
        { name: 'refuse_amendment',         label: ACTION_LABELS.refuse_amendment,         variant: 'danger'  },
        { name: 'lapse_amendment',          label: ACTION_LABELS.lapse_amendment,          variant: 'warn'    },
      ];
    case 'unanimous_required':
      return [
        { name: 'obtain_consent',   label: ACTION_LABELS.obtain_consent,   variant: 'success' },
        { name: 'refuse_amendment', label: ACTION_LABELS.refuse_amendment, variant: 'danger'  },
        { name: 'lapse_amendment',  label: ACTION_LABELS.lapse_amendment,  variant: 'warn'    },
      ];
    case 'consent_obtained':
      return [
        { name: 'prepare_documentation', label: ACTION_LABELS.prepare_documentation, variant: 'success' },
        { name: 'refuse_amendment',      label: ACTION_LABELS.refuse_amendment,      variant: 'danger'  },
        { name: 'lapse_amendment',       label: ACTION_LABELS.lapse_amendment,       variant: 'warn'    },
      ];
    case 'documentation_prepared':
      return [
        { name: 'execute_amendment', label: ACTION_LABELS.execute_amendment, variant: 'success' },
        { name: 'lapse_amendment',   label: ACTION_LABELS.lapse_amendment,   variant: 'warn'    },
      ];
    case 'execution_signed':
      return [
        { name: 'record_effective_date', label: ACTION_LABELS.record_effective_date, variant: 'success' },
        { name: 'lapse_amendment',       label: ACTION_LABELS.lapse_amendment,       variant: 'warn'    },
      ];
    default:
      return [];
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string | null | undefined): { text: string; isPast: boolean } {
  if (!dateStr) return { text: '—', isPast: false };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { text: '—', isPast: false };
  const isPast = d < new Date();
  const text = d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  return { text, isPast };
}

function truncate(s: string, n = 32): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const sel = 'border rounded px-2 py-1 text-xs text-[#2d3748] bg-white';
const PAGE_SIZE = 20;

// ─── KPI chip ─────────────────────────────────────────────────────────────────

type KpiMode = 'neutral' | 'good' | 'alert' | 'danger';
function KpiChip({ label, value, mode = 'neutral' }: { label: string; value: string | number; mode?: KpiMode }) {
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

// ─── Component ────────────────────────────────────────────────────────────────

export function LenderFacilityAmendmentTab() {
  const [items, setItems]           = useState<FacilityAmendmentItem[]>([]);
  const [kpis, setKpis]             = useState<AmendmentKpis | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [filterStatus, setFilterStatus]         = useState('');
  const [filterClass, setFilterClass]           = useState('');
  const [filterSlaBreached, setFilterSlaBreached] = useState(false);
  const [page, setPage]             = useState(1);

  // Create form
  const [showCreate, setShowCreate]         = useState(false);
  const [creating, setCreating]             = useState(false);
  const [createError, setCreateError]       = useState<string | null>(null);
  const [formFacilityId, setFormFacilityId] = useState('FAC-2024-001');
  const [formAmendmentRef, setFormAmendmentRef] = useState('');
  const [formClass, setFormClass]           = useState<string>(AMENDMENT_CLASSES[0]);
  const [formAmendmentType, setFormAmendmentType] = useState('');
  const [formSecurityVariation, setFormSecurityVariation] = useState(false);
  const [formPricingChangeBps, setFormPricingChangeBps]   = useState('');
  const [formDescription, setFormDescription]             = useState('');

  // Detail drawer
  const [detailItem, setDetailItem] = useState<FacilityAmendmentItem | null>(null);

  // Action modal
  const [actionItem, setActionItem]         = useState<FacilityAmendmentItem | null>(null);
  const [selectedAction, setSelectedAction] = useState('');
  const [actionReason, setActionReason]     = useState('');
  const [actionEffectiveDate, setActionEffectiveDate] = useState('');
  const [actionLoading, setActionLoading]   = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);

  async function load(
    status      = filterStatus,
    cls         = filterClass,
    slaBreached = filterSlaBreached,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status)      params.set('status', status);
      if (cls)         params.set('amendment_class', cls);
      if (slaBreached) params.set('sla_breached', '1');
      const res = await fetch(`/api/facility-amendments?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setItems(json?.data ?? []);
      if (json?.kpis) setKpis(json.kpis);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const total           = kpis?.total              ?? items.length;
  const pending         = kpis?.pending_amendments ?? items.filter(i => !HARD_TERMINALS.has(i.chain_status)).length;
  const consented       = kpis?.consented_count    ?? items.filter(i => i.chain_status === 'effective').length;
  const refused         = kpis?.refused_count      ?? items.filter(i => i.chain_status === 'refused').length;
  const unanimousPend   = kpis?.unanimous_pending  ?? items.filter(i => i.chain_status === 'unanimous_required').length;
  const slaBreachedCnt  = kpis?.sla_breached_count ?? items.filter(i => i.sla_breached === 1).length;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Create handler ───────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formFacilityId.trim() || !formClass) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        facility_id:    formFacilityId.trim(),
        amendment_class: formClass,
        security_variation: formSecurityVariation ? 1 : 0,
      };
      if (formAmendmentRef.trim())    body.amendment_ref   = formAmendmentRef.trim();
      if (formAmendmentType.trim())   body.amendment_type  = formAmendmentType.trim();
      if (formPricingChangeBps.trim()) body.pricing_change_bps = parseFloat(formPricingChangeBps);
      if (formDescription.trim())     body.description     = formDescription.trim();

      const res = await fetch('/api/facility-amendments', {
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
      setFormFacilityId('FAC-2024-001');
      setFormAmendmentRef('');
      setFormClass(AMENDMENT_CLASSES[0]);
      setFormAmendmentType('');
      setFormSecurityVariation(false);
      setFormPricingChangeBps('');
      setFormDescription('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  // ─── Action handlers ──────────────────────────────────────────────────────

  function openActionPicker(item: FacilityAmendmentItem) {
    const actions = getActions(item);
    if (actions.length === 0) return;
    setActionItem(item);
    setSelectedAction(actions[0].name);
    setActionReason('');
    setActionEffectiveDate('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setSelectedAction('');
    setActionReason('');
    setActionEffectiveDate('');
    setActionError(null);
  }

  async function submitAction() {
    if (!actionItem || !selectedAction) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { action: selectedAction };
      if (actionReason.trim()) body.reason = actionReason.trim();
      if (actionEffectiveDate.trim() && selectedAction === 'record_effective_date') {
        body.effective_date = actionEffectiveDate.trim();
      }

      const res = await fetch(`/api/facility-amendments/${actionItem.id}/action`, {
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
      closeAction();
      if (detailItem?.id === actionItem.id) setDetailItem(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  const modalActions       = actionItem ? getActions(actionItem) : [];
  const actionLabelCurrent = modalActions.find(a => a.name === selectedAction)?.label ?? 'Confirm';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4">

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiChip label="Total Amendments"  value={total} />
        <KpiChip label="Pending"           value={pending}       mode={pending > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="Consented / Effective" value={consented} mode={consented > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Unanimous Pending" value={unanimousPend} mode={unanimousPend > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"      value={slaBreachedCnt} mode={slaBreachedCnt > 0 ? 'danger' : 'neutral'} />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterClass, filterSlaBreached); }}
          className={sel}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
        <select
          value={filterClass}
          onChange={e => { setFilterClass(e.target.value); load(filterStatus, e.target.value, filterSlaBreached); }}
          className={sel}
        >
          <option value="">All classes</option>
          {AMENDMENT_CLASSES.map(c => (
            <option key={c} value={c}>{CLASS_LABELS[c]} — {CLASS_SLA[c]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[#2d3748] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterSlaBreached}
            onChange={e => { setFilterSlaBreached(e.target.checked); load(filterStatus, filterClass, e.target.checked); }}
            className="accent-red-600"
          />
          SLA Breached only
        </label>
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
          + New Amendment
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'oklch(0.87 0.010 250)', background: 'oklch(0.94 0.006 250)' }}
        >
          <div className="text-sm font-semibold text-[oklch(0.40_0.009_250)]">New Facility Amendment Request</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Facility ID *</label>
              <input
                type="text"
                value={formFacilityId}
                onChange={e => setFormFacilityId(e.target.value)}
                placeholder="e.g. FAC-2024-001"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Amendment Reference</label>
              <input
                type="text"
                value={formAmendmentRef}
                onChange={e => setFormAmendmentRef(e.target.value)}
                placeholder="e.g. AMD-2026-013"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Amendment Class *</label>
              <select
                value={formClass}
                onChange={e => setFormClass(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {AMENDMENT_CLASSES.map(c => (
                  <option key={c} value={c}>{CLASS_LABELS[c]} — {CLASS_SLA[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Amendment Type</label>
              <input
                type="text"
                value={formAmendmentType}
                onChange={e => setFormAmendmentType(e.target.value)}
                placeholder="e.g. tenor_extension, covenant_waiver"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Pricing Change (bps)</label>
              <input
                type="number"
                step="0.01"
                value={formPricingChangeBps}
                onChange={e => setFormPricingChangeBps(e.target.value)}
                placeholder="e.g. 15.0"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input
                id="security-variation"
                type="checkbox"
                checked={formSecurityVariation}
                onChange={e => setFormSecurityVariation(e.target.checked)}
                className="accent-amber-600"
              />
              <label htmlFor="security-variation" className="text-xs text-[#2d3748] cursor-pointer">
                Security variation (triggers SARB Reg 29)
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[#3d4756] mb-1">Description</label>
              <textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                rows={2}
                placeholder="Brief description of the proposed amendment and commercial rationale"
                className="w-full border rounded px-2 py-1 text-xs resize-none"
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
                <th className="pb-2 pr-3">Amendment Ref</th>
                <th className="pb-2 pr-3">Facility</th>
                <th className="pb-2 pr-3">Class</th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2 pr-3">Chain Status</th>
                <th className="pb-2 pr-3">SLA Deadline</th>
                <th className="pb-2 pr-3 text-center">Sec.</th>
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
                    className="border-b hover:bg-[#eef2f7] cursor-pointer"
                    onClick={() => setDetailItem(item)}
                  >
                    <td className="py-2 pr-3 text-xs font-medium text-[#1e2a38]">
                      {item.amendment_ref ?? item.id.slice(0, 12)}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[#3d4756]">
                      {item.facility_id}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${CLASS_COLORS[item.amendment_class]?.className ?? 'bg-[#eef2f7] text-[#6b7685]'}`}
                          style={CLASS_COLORS[item.amendment_class]?.style}
                        >
                          {CLASS_LABELS[item.amendment_class] ?? item.amendment_class}
                        </span>
                        <span className="text-xs text-[#9aa5b4]">{CLASS_SLA[item.amendment_class]}</span>
                      </div>
                    </td>
                    <td
                      className="py-2 pr-3 text-xs text-[#3d4756] max-w-[120px] truncate"
                      title={item.amendment_type ?? undefined}
                    >
                      {item.amendment_type
                        ? item.amendment_type.replace(/_/g, ' ')
                        : <span className="text-[#9aa5b4]">—</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status]?.className ?? 'bg-[#eef2f7] text-[#6b7685]'}`}
                        style={STATUS_COLORS[item.chain_status]?.style}
                      >
                        {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                      </span>
                      {item.sla_breached === 1 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600 font-semibold">SLA</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums">
                      <span className={due.isPast && !HARD_TERMINALS.has(item.chain_status) ? 'text-red-600 font-medium' : 'text-[#3d4756]'}>
                        {due.text}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      {item.security_variation === 1 ? (
                        <span title="Security variation" className="text-amber-500 text-sm leading-none">&#9679;</span>
                      ) : (
                        <span className="text-[#e8ecf0] text-sm leading-none">&#9675;</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      {item.regulator_notified === 1 ? (
                        <span title="Regulator notified" className="text-orange-500 text-base leading-none">&#9873;</span>
                      ) : (
                        <span className="text-[#e8ecf0] text-base leading-none">&#9873;</span>
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
                          style={{ background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)', borderColor: 'oklch(0.87 0.010 250)' }}
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
                  <td colSpan={9} className="py-10 text-center text-[#9aa5b4] text-sm">
                    No facility amendments found
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
          <span className="text-xs text-[#6b7685]">Page {page} of {totalPages}</span>
          <button type="button"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-[#eef2f7]"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Stats footer */}
      {kpis && (
        <div className="text-xs text-[#9aa5b4] pt-1">
          {total} total &middot; {pending} pending &middot; {consented} effective &middot; {refused} refused &middot; {(kpis.lapsed_count ?? 0)} lapsed
        </div>
      )}

      {/* ─── Detail drawer ─────────────────────────────────────────────────── */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30">
          <div className="bg-white h-full w-full max-w-lg shadow-2xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="text-sm font-semibold text-[#1e2a38]">
                  Facility Amendment
                </div>
                <div className="text-xs text-[#6b7685] mt-0.5">
                  {detailItem.amendment_ref ?? detailItem.id}
                  {' '}&middot;{' '}
                  {CLASS_LABELS[detailItem.amendment_class] ?? detailItem.amendment_class}
                </div>
              </div>
              <button type="button"
                onClick={() => setDetailItem(null)}
                className="text-[#9aa5b4] hover:text-[#2d3748] text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 p-5 space-y-5">
              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[detailItem.chain_status]?.className ?? 'bg-[#eef2f7] text-[#6b7685]'}`}
                  style={STATUS_COLORS[detailItem.chain_status]?.style}
                >
                  {STATUS_LABELS[detailItem.chain_status] ?? detailItem.chain_status.replace(/_/g, ' ')}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${CLASS_COLORS[detailItem.amendment_class]?.className ?? 'bg-[#eef2f7] text-[#6b7685]'}`}
                  style={CLASS_COLORS[detailItem.amendment_class]?.style}
                >
                  {CLASS_LABELS[detailItem.amendment_class] ?? detailItem.amendment_class} — {CLASS_SLA[detailItem.amendment_class] ?? ''}
                </span>
                {detailItem.sla_breached === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">SLA Breached</span>
                )}
                {detailItem.security_variation === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-semibold">Security Variation</span>
                )}
                {detailItem.regulator_notified === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700 font-semibold">Regulator Notified</span>
                )}
              </div>

              {/* Core fields */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Facility ID</div>
                  <div className="font-medium text-[#1e2a38]">{detailItem.facility_id}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Amendment Ref</div>
                  <div className="text-[#1e2a38]">{detailItem.amendment_ref ?? '—'}</div>
                </div>
                {detailItem.amendment_type && (
                  <div>
                    <div className="text-[#9aa5b4] mb-0.5">Amendment Type</div>
                    <div className="text-[#1e2a38]">{detailItem.amendment_type.replace(/_/g, ' ')}</div>
                  </div>
                )}
                {detailItem.majority_threshold_pct != null && (
                  <div>
                    <div className="text-[#9aa5b4] mb-0.5">Majority Threshold</div>
                    <div className="text-[#1e2a38]">{detailItem.majority_threshold_pct}%</div>
                  </div>
                )}
                {detailItem.pricing_change_bps != null && (
                  <div>
                    <div className="text-[#9aa5b4] mb-0.5">Pricing Change</div>
                    <div className="text-[#1e2a38]">{detailItem.pricing_change_bps > 0 ? '+' : ''}{detailItem.pricing_change_bps} bps</div>
                  </div>
                )}
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">SLA Deadline</div>
                  <div className={`tabular-nums ${fmtDate(detailItem.sla_deadline).isPast && !HARD_TERMINALS.has(detailItem.chain_status) ? 'text-red-600 font-medium' : 'text-[#1e2a38]'}`}>
                    {fmtDate(detailItem.sla_deadline).text}
                  </div>
                </div>
                {detailItem.consent_deadline && (
                  <div>
                    <div className="text-[#9aa5b4] mb-0.5">Consent Deadline</div>
                    <div className="text-[#1e2a38] tabular-nums">{fmtDate(detailItem.consent_deadline).text}</div>
                  </div>
                )}
                {detailItem.effective_date && (
                  <div>
                    <div className="text-[#9aa5b4] mb-0.5">Effective Date</div>
                    <div className="text-green-700 font-medium tabular-nums">{fmtDate(detailItem.effective_date).text}</div>
                  </div>
                )}
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Unanimous Required</div>
                  <div className={detailItem.unanimous_required === 1 ? 'text-amber-700 font-medium' : 'text-[#9aa5b4]'}>
                    {detailItem.unanimous_required === 1 ? 'Yes' : 'No'}
                  </div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Created</div>
                  <div className="text-[#3d4756]">{fmtDate(detailItem.created_at).text}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Updated</div>
                  <div className="text-[#3d4756]">{fmtDate(detailItem.updated_at).text}</div>
                </div>
              </div>

              {/* Description */}
              {detailItem.description && (
                <div>
                  <div className="text-xs text-[#9aa5b4] mb-1">Description</div>
                  <div className="text-xs text-[#2d3748] bg-[#f8fafc] rounded p-2 border leading-relaxed">
                    {detailItem.description}
                  </div>
                </div>
              )}

              {/* Reason */}
              {detailItem.reason && (
                <div>
                  <div className="text-xs text-[#9aa5b4] mb-1">Reason / Notes</div>
                  <div className="text-xs text-[#2d3748] bg-[#f8fafc] rounded p-2 border whitespace-pre-wrap">
                    {detailItem.reason}
                  </div>
                </div>
              )}

              {/* AI insight strip */}
              {detailItem.security_variation === 1 && !HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs">
                  <div className="font-semibold text-amber-800 mb-1">SARB Reg 29 Notification Required</div>
                  <div className="text-amber-700">
                    This amendment involves a security variation on a {CLASS_LABELS[detailItem.amendment_class]} amendment.
                    Upon execution, SARB Regulation 29 large-exposure notification must be filed within 5 business days.
                  </div>
                </div>
              )}

              {/* Actions section */}
              {!HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="border-t pt-4">
                  <div className="text-xs font-semibold text-[#2d3748] mb-2">Advance State Machine</div>
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
                  <div className="text-xs text-[#9aa5b4] italic">
                    This amendment is in a terminal state — no further transitions are available.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Action modal ──────────────────────────────────────────────────── */}
      {actionItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-[#1e2a38] mb-1">Facility Amendment Action</div>
            <div className="text-xs text-[#6b7685] mb-4">
              {truncate(actionItem.amendment_ref ?? actionItem.id, 24)}
              {' '}—{' '}
              {CLASS_LABELS[actionItem.amendment_class] ?? actionItem.amendment_class}
              {' '}—{' '}
              {STATUS_LABELS[actionItem.chain_status] ?? actionItem.chain_status}
            </div>

            <div className="mb-3">
              <label className="block text-xs text-[#3d4756] mb-1">Action *</label>
              <select
                value={selectedAction}
                onChange={e => setSelectedAction(e.target.value)}
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {modalActions.map(a => (
                  <option key={a.name} value={a.name}>{a.label}</option>
                ))}
              </select>
            </div>

            {selectedAction === 'record_effective_date' && (
              <div className="mb-3">
                <label className="block text-xs text-[#3d4756] mb-1">Effective Date</label>
                <input
                  type="date"
                  value={actionEffectiveDate}
                  onChange={e => setActionEffectiveDate(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs text-[#3d4756] mb-1">Reason (optional)</label>
              <input
                type="text"
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="Brief reason or reference"
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

export default LenderFacilityAmendmentTab;
