// Wave 59 — Esums Preventive-Maintenance Schedule Compliance & Deferral chain tab.
//
// A single scheduled PM task instance on the maintenance calendar (IEC 62446 /
// 61724 + REIPPPP O&M service-agreement PM-program discipline). The PROACTIVE
// counterpart UPSTREAM of W51 availability guarantee and W24 PR underperformance:
// keeping PMs on schedule is what keeps availability and PR within guarantee. A
// skipped safety-critical PM is the leading indicator of the shortfall W51 books.
//
//   • KPI strip: total / open / in-progress / SLA breached / critical open /
//     skipped / deferred
//   • Filter pills by criticality tier + chain state + SLA breach + reportable
//   • Listing with tier pill + URGENT SLA countdown (more critical = tighter)
//   • Drill-down: timeline (owner/contractor party tags) + per-state actions
//
// Single-party write: Esums O&M operators record every party's action; the
// actor_party tag records whether the asset owner or the O&M contractor performed
// the contractual function. No create form — cases originate from WO-dispatch
// escalation / maintenance-calendar rollups and the operator field workflow.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'pm_scheduled' | 'work_assigned' | 'in_progress' | 'on_hold' | 'completed'
  | 'verification_pending' | 'rework_required' | 'deferral_requested'
  | 'closed' | 'deferred' | 'skipped' | 'cancelled';

type CriticalityTier =
  | 'routine' | 'standard' | 'significant' | 'critical' | 'safety_critical';

interface PmRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  owner_party_name: string;
  contractor_party_name: string;
  site_name: string;
  site_province: string | null;
  technology: string;
  asset_tag: string | null;
  asset_class: string | null;
  contract_ref: string | null;
  pm_code: string | null;
  pm_title: string;
  pm_frequency: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  deferred_to_date: string | null;
  criticality_score: number;
  criticality_tier: CriticalityTier;
  checklist_total_items: number | null;
  checklist_passed_items: number | null;
  labour_hours: number | null;
  estimated_cost_zar: number | null;
  actual_cost_zar: number | null;
  assignment_ref: string | null;
  completion_ref: string | null;
  verification_ref: string | null;
  rework_ref: string | null;
  deferral_ref: string | null;
  skip_ref: string | null;
  regulator_ref: string | null;
  assignment_basis: string | null;
  hold_basis: string | null;
  completion_basis: string | null;
  verification_basis: string | null;
  rework_basis: string | null;
  deferral_basis: string | null;
  skip_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  rework_round: number;
  deferral_round: number;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable?: boolean;
  breach_crosses_regulator?: boolean;
  created_at: string;
}

interface KpiData {
  total: number;
  open_count: number;
  closed_count: number;
  in_progress_count: number;
  on_hold_count: number;
  verification_count: number;
  rework_count: number;
  deferral_open_count: number;
  deferred_count: number;
  skipped_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  critical_open: number;
  total_estimated_cost_zar: number;
  total_actual_cost_zar: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'pm_scheduled',
  'work_assigned',
  'in_progress',
  'on_hold',
  'completed',
  'verification_pending',
  'rework_required',
  'deferral_requested',
  'closed',
];

const BRANCH_STATES: readonly string[] = [
  'deferred',
  'skipped',
  'cancelled',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',               label: 'Active (pre-terminal)' },
  { key: 'all',                  label: 'All' },
  { key: 'safety_critical',      label: 'Safety-critical' },
  { key: 'critical',             label: 'Critical' },
  { key: 'significant',          label: 'Significant' },
  { key: 'standard',             label: 'Standard' },
  { key: 'routine',              label: 'Routine' },
  { key: 'work_assigned',        label: 'Work assigned' },
  { key: 'in_progress',          label: 'In progress' },
  { key: 'on_hold',              label: 'On hold' },
  { key: 'verification_pending', label: 'Verification' },
  { key: 'rework_required',      label: 'Rework' },
  { key: 'deferral_requested',   label: 'Deferral requested' },
  { key: 'deferred',             label: 'Deferred' },
  { key: 'skipped',              label: 'Skipped' },
  { key: 'closed',               label: 'Closed' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'reportable',           label: 'Reportable' },
];

const TIERS = new Set<string>(['routine', 'standard', 'significant', 'critical', 'safety_critical']);

// ── format helpers ────────────────────────────────────────────────────────
function fmtZar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

// ── action helpers ────────────────────────────────────────────────────────
function getActions(row: PmRow): ChainAction[] {
  const cs = row.chain_status;
  const actions: ChainAction[] = [];

  // pm_scheduled → work_assigned
  if (cs === 'pm_scheduled') {
    actions.push({
      key: 'assign-work',
      label: 'Assign work (owner)',
      fields: [
        { key: 'assignment_ref',   label: 'Assignment reference', type: 'text',     required: false, placeholder: row.assignment_ref ?? '' },
        { key: 'assignment_basis', label: 'Assignment basis',     type: 'textarea', required: false, placeholder: row.assignment_basis ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // work_assigned | on_hold | rework_required → in_progress
  if (cs === 'work_assigned' || cs === 'on_hold' || cs === 'rework_required') {
    actions.push({
      key: 'start-work',
      label: 'Start work (contractor)',
      fields: [
        { key: 'labour_hours', label: 'Labour hours so far', type: 'number', required: false, placeholder: String(row.labour_hours ?? '') },
      ],
      cascadeTo: [],
    });
  }

  // in_progress → on_hold
  if (cs === 'in_progress') {
    actions.push({
      key: 'place-on-hold',
      label: 'Place on hold (contractor)',
      fields: [
        { key: 'hold_basis',   label: 'Hold basis (e.g. awaiting spares / access)', type: 'textarea', required: false, placeholder: row.hold_basis ?? '' },
        { key: 'reason_code',  label: 'Reason code',                                type: 'text',     required: false, placeholder: row.reason_code ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // in_progress → completed
  if (cs === 'in_progress') {
    actions.push({
      key: 'complete-work',
      label: 'Complete work (contractor)',
      fields: [
        { key: 'checklist_total_items',  label: 'Checklist total items',  type: 'number',   required: false, placeholder: String(row.checklist_total_items ?? '') },
        { key: 'checklist_passed_items', label: 'Checklist passed items', type: 'number',   required: false, placeholder: String(row.checklist_passed_items ?? '') },
        { key: 'actual_cost_zar',        label: 'Actual cost (ZAR)',      type: 'number',   required: false, placeholder: String(row.actual_cost_zar ?? '') },
        { key: 'completion_basis',       label: 'Completion basis',       type: 'textarea', required: false, placeholder: row.completion_basis ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // completed → verification_pending
  if (cs === 'completed') {
    actions.push({
      key: 'open-verification',
      label: 'Open verification (owner)',
      fields: [
        { key: 'verification_ref',   label: 'Verification reference', type: 'text',     required: false, placeholder: row.verification_ref ?? '' },
        { key: 'verification_basis', label: 'Verification basis',     type: 'textarea', required: false, placeholder: row.verification_basis ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // verification_pending → closed
  if (cs === 'verification_pending') {
    actions.push({
      key: 'close-pm',
      label: 'Close PM (owner)',
      fields: [
        { key: 'verification_ref',   label: 'Verification reference', type: 'text',     required: false, placeholder: row.verification_ref ?? '' },
        { key: 'verification_basis', label: 'Verification basis',     type: 'textarea', required: false, placeholder: row.verification_basis ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // verification_pending → rework_required
  if (cs === 'verification_pending') {
    actions.push({
      key: 'require-rework',
      label: 'Require rework (owner)',
      fields: [
        { key: 'rework_basis', label: 'Rework basis (deficiencies found)', type: 'textarea', required: false, placeholder: row.rework_basis ?? '' },
        { key: 'reason_code',  label: 'Reason code',                       type: 'text',     required: false, placeholder: row.reason_code ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // pm_scheduled | work_assigned | on_hold → deferral_requested
  if (cs === 'pm_scheduled' || cs === 'work_assigned' || cs === 'on_hold') {
    actions.push({
      key: 'request-deferral',
      label: 'Request deferral (contractor)',
      fields: [
        { key: 'deferred_to_date', label: 'Deferred-to date (YYYY-MM-DD)', type: 'date',     required: false, placeholder: row.deferred_to_date ?? '' },
        { key: 'deferral_basis',   label: 'Deferral basis',                type: 'textarea', required: false, placeholder: row.deferral_basis ?? '' },
        { key: 'reason_code',      label: 'Reason code',                   type: 'text',     required: false, placeholder: row.reason_code ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // deferral_requested → deferred (approve) — skip_pm crosses regulator critical+safety
  if (cs === 'deferral_requested') {
    actions.push({
      key: 'approve-deferral',
      label: 'Approve deferral (owner)',
      fields: [
        { key: 'deferred_to_date', label: 'Deferred-to date (YYYY-MM-DD)',                          type: 'date',     required: false, placeholder: row.deferred_to_date ?? '' },
        { key: 'deferral_basis',   label: 'Deferral basis',                                         type: 'textarea', required: false, placeholder: row.deferral_basis ?? '' },
        { key: 'regulator_ref',    label: 'Regulator reference (safety-critical only, optional)',   type: 'text',     required: false, placeholder: row.regulator_ref ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // deferral_requested → work_assigned (reject)
  if (cs === 'deferral_requested') {
    actions.push({
      key: 'reject-deferral',
      label: 'Reject deferral (owner)',
      fields: [
        { key: 'deferral_basis', label: 'Rejection basis', type: 'textarea', required: false, placeholder: row.deferral_basis ?? '' },
        { key: 'reason_code',    label: 'Reason code',     type: 'text',     required: false, placeholder: row.reason_code ?? '' },
      ],
      cascadeTo: [],
    });
  }

  // pm_scheduled | work_assigned | on_hold | deferral_requested → skipped
  // skip_pm crosses regulator critical+safety
  if (cs === 'pm_scheduled' || cs === 'work_assigned' || cs === 'on_hold' || cs === 'deferral_requested') {
    const skipCascade = (row.criticality_tier === 'critical' || row.criticality_tier === 'safety_critical')
      ? ['regulator'] as string[]
      : [] as string[];
    actions.push({
      key: 'skip-pm',
      label: 'Skip PM (owner)',
      fields: [
        { key: 'skip_basis',    label: 'Skip basis (window lapsed unexecuted)',        type: 'textarea', required: false, placeholder: row.skip_basis ?? '' },
        { key: 'regulator_ref', label: 'Regulator reference (critical / safety only)', type: 'text',     required: false, placeholder: row.regulator_ref ?? '' },
        { key: 'reason_code',   label: 'Reason code',                                 type: 'text',     required: false, placeholder: row.reason_code ?? '' },
      ],
      cascadeTo: skipCascade,
    });
  }

  // pm_scheduled | work_assigned → cancelled
  if (cs === 'pm_scheduled' || cs === 'work_assigned') {
    actions.push({
      key: 'cancel-pm',
      label: 'Cancel PM (owner)',
      fields: [
        { key: 'reason_code', label: 'Reason code (no longer applicable)', type: 'text', required: false, placeholder: row.reason_code ?? '' },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

function renderDetail(row: PmRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Asset owner"    value={row.owner_party_name} />
      <DetailPair label="O&M contractor" value={row.contractor_party_name} />
      <DetailPair label="Technology"     value={row.technology} />
      {row.site_province       && <DetailPair label="Province"    value={row.site_province} />}
      {row.asset_class         && <DetailPair label="Asset class" value={row.asset_class} />}
      {row.asset_tag           && <DetailPair label="Asset tag"   value={row.asset_tag} />}
      {row.pm_code             && <DetailPair label="PM code"     value={row.pm_code} />}
      {row.pm_frequency        && <DetailPair label="Frequency"   value={row.pm_frequency} />}
      <DetailPair label="Criticality score" value={`${row.criticality_score} / 100`} />
      {row.contract_ref        && <DetailPair label="O&M contract"   value={row.contract_ref} />}
      {row.scheduled_date      && <DetailPair label="Scheduled"       value={row.scheduled_date} />}
      {row.window_end          && <DetailPair label="Window closes"   value={row.window_end} />}
      {row.deferred_to_date    && <DetailPair label="Deferred to"     value={row.deferred_to_date} />}
      {row.checklist_total_items != null && (
        <DetailPair label="Checklist" value={`${row.checklist_passed_items ?? 0} / ${row.checklist_total_items} passed`} />
      )}
      {row.labour_hours != null && <DetailPair label="Labour" value={`${row.labour_hours} h`} />}
      {row.estimated_cost_zar != null && <DetailPair label="Estimated cost" value={fmtZar(row.estimated_cost_zar)} />}
      {row.actual_cost_zar    != null && <DetailPair label="Actual cost"    value={fmtZar(row.actual_cost_zar)} />}
      {row.rework_round   > 0 && <DetailPair label="Rework round"   value={String(row.rework_round)} />}
      {row.deferral_round > 0 && <DetailPair label="Deferral round" value={String(row.deferral_round)} />}
      {row.regulator_ref      && <DetailPair label="Regulator ref"  value={row.regulator_ref} />}
      {row.source_wave && (
        <div className="col-span-2">
          <DetailPair label="Provenance" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}${row.source_event ? ` (${row.source_event})` : ''}`} />
        </div>
      )}
      {row.sla_deadline_at && !row.is_terminal && (
        <div className="col-span-2">
          <DetailPair label="Next SLA" value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` · ${row.escalation_level} breach(es)` : ''}`} />
        </div>
      )}

      {row.assignment_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Assignment basis</div>
          <div style={{ color: TX2 }}>{row.assignment_basis}</div>
        </div>
      )}
      {row.hold_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Hold basis</div>
          <div style={{ color: TX2 }}>{row.hold_basis}</div>
        </div>
      )}
      {row.completion_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Completion basis</div>
          <div style={{ color: TX2 }}>{row.completion_basis}</div>
        </div>
      )}
      {row.verification_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Verification basis</div>
          <div style={{ color: TX2 }}>{row.verification_basis}</div>
        </div>
      )}
      {row.rework_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Rework basis</div>
          <div style={{ color: TX2 }}>{row.rework_basis}</div>
        </div>
      )}
      {row.deferral_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Deferral basis</div>
          <div style={{ color: TX2 }}>{row.deferral_basis}</div>
        </div>
      )}
      {row.skip_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Skip basis</div>
          <div style={{ color: TX2 }}>{row.skip_basis}</div>
        </div>
      )}
      {row.reason_code && (
        <div className="col-span-2">
          <DetailPair label="Reason code" value={row.reason_code} />
        </div>
      )}
      {row.notes && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Notes</div>
          <div style={{ color: TX2 }}>{row.notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function PmComplianceChainTab() {
  const [rows, setRows] = useState<PmRow[]>([]);
  const [summary, setSummary] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: PmRow[] } }>('/pm-compliance/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setSummary(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PM compliance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/pm-compliance/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { case: PmRow; events: ChainEvent[] } }>(`/pm-compliance/chain/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: PmRow; events: ChainEvent[] } }>(`/pm-compliance/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'reportable') return !!r.is_reportable;
      if (TIERS.has(filter))       return r.criticality_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: 0, open_count: 0, closed_count: 0, in_progress_count: 0,
    on_hold_count: 0, verification_count: 0, rework_count: 0,
    deferral_open_count: 0, deferred_count: 0, skipped_count: 0,
    cancelled_count: 0, breached: 0, reportable_total: 0, critical_open: 0,
    total_estimated_cost_zar: 0, total_actual_cost_zar: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>PM Schedule Compliance</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          IEC 62446 / 61724 preventive-maintenance compliance — proactive upstream of W51 availability guarantee and W24 PR underperformance.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"        value={kpis.total} />
        <KpiTile label="Open"         value={kpis.open_count} />
        <KpiTile label="In progress"  value={kpis.in_progress_count} />
        <KpiTile label="SLA breached" value={kpis.breached}       tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Critical open" value={kpis.critical_open} tone={kpis.critical_open > 0 ? 'bad' : undefined} />
        <KpiTile label="Skipped"      value={kpis.skipped_count}  tone={kpis.skipped_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Deferred"     value={kpis.deferred_count} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]"
          style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.site_name} · ${row.pm_title}`}
              meta={`${row.case_number} · ${row.criticality_tier.replace('_', '-')} · ${row.contractor_party_name}`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]"
              style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No PM tasks match the current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[80px]" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default PmComplianceChainTab;
