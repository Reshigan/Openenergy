// Wave 104 - Support ITIL Service Request Fulfilment chain tab.
// Catalog-driven, pre-approved, low-risk request workflow distinct from
// W14 reactive ticket, W41 root-cause problem, W47 RFC/CAB, W55 vulnerability
// remediation. 12-state P6 lifecycle (submitted -> entitlement_checked ->
// approval_pending -> approved -> assigned -> fulfilment_in_progress ->
// awaiting_user -> user_responded -> fulfilled -> verified -> closed ->
// archived) + rejected + cancelled hard-terminal branches + reopen-from-
// fulfilled to fulfilment_in_progress. Tier RE-DERIVED on every transition
// from severity_zar (minor < 50k / standard < 500k / material < 5m /
// critical >= 5m), FLOOR-AT-MATERIAL on data_export_popia / grid_significant
// / sla_premium_contract, FLOOR-AT-CRITICAL on access_to_critical_system /
// oem_break_glass. URGENT SLA polarity (higher tier = TIGHTER, critical 4h
// on submitted, minor 14d). 4-step authority ladder (end_user ->
// service_desk_lead -> asset_owner -> support_director).
//
// Beats ServiceNow ITSM Service Catalog, BMC Helix Request, Jira SM Request,
// Atlassian Assist, Freshservice Request Catalog, Ivanti Neurons Service
// Request, SolarWinds Service Desk Request, ManageEngine ServiceDesk Plus
// Request, Cherwell SRC, TOPdesk via LIVE coverage battery (entitlement
// match score, first-time-fix rate 30d, avg fulfilment time, SLA days
// remaining, urgency band, breach-imminent flag, catalog completeness 0-130,
// regulator filing window hours, authority required, CAB bridge, problem
// bridge on reopen >= 2) composed every fetch from raw inputs.
//
// SIGNATURE regulator crossings:
//   reject           -> regulator EVERY tier when regulator_relevant
//   mark_fulfilled   -> regulator on critical when grid_significant
//   cancel_request   -> regulator EVERY tier when entitled AND regulator_relevant
//   sla_breached     -> regulator on material + critical
//
// Mounted on Support workstation (primary write {admin,support}); READ all 9
// personas.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'submitted' | 'entitlement_checked' | 'approval_pending' | 'approved'
  | 'assigned' | 'fulfilment_in_progress' | 'awaiting_user' | 'user_responded'
  | 'fulfilled' | 'verified' | 'closed' | 'archived'
  | 'rejected' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'critical';

type UrgencyBand = 'critical' | 'high' | 'medium' | 'low';

type Authority = 'end_user' | 'service_desk_lead' | 'asset_owner' | 'support_director';

type Party =
  | 'requester' | 'approver' | 'service_desk' | 'fulfiller'
  | 'verifier' | 'archiver' | 'system';

interface SrRow {
  [key: string]: unknown;
  id: string;
  request_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  catalog_item_id: string | null;
  catalog_item_label: string | null;
  catalog_category: string | null;
  requested_for_party_id: string | null;
  requested_for_party_label: string | null;
  requested_by_actor_id: string | null;
  requested_by_actor_role: string | null;
  business_justification: string | null;
  urgency_requested: string | null;
  entitlement_status: string | null;
  entitlement_contract_id: string | null;
  entitlement_overage_units: number | null;
  requires_cab_review: number;
  cab_change_id: string | null;
  approver_actor_id: string | null;
  approver_actor_role: string | null;
  approval_decision: string | null;
  approval_conditions_text: string | null;
  auto_fulfil_eligible: number;
  auto_fulfil_playbook_ref: string | null;
  fulfiller_actor_id: string | null;
  assignee_team: string | null;
  assigned_at: string | null;
  fulfilment_started_at: string | null;
  fulfilled_at: string | null;
  first_response_at: string | null;
  closed_at: string | null;
  first_time_fix: number;
  reopened_count: number;
  reopen_reason_text: string | null;
  customer_satisfaction_csat: number | null;
  failure_reason_code: string | null;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  is_reportable: number;
  severity_zar: number;
  request_floor_flag_access_to_critical_system: number;
  request_floor_flag_data_export_popia: number;
  request_floor_flag_grid_significant: number;
  request_floor_flag_oem_break_glass: number;
  request_floor_flag_sla_premium_contract: number;
  current_tier: Tier;
  authority_required: Authority | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  reject_reason: string | null;
  cancelled_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  chain_status: ChainStatus;
  submitted_at: string | null;
  entitlement_checked_at: string | null;
  approval_pending_at: string | null;
  approved_at: string | null;
  awaiting_user_at: string | null;
  user_responded_at: string | null;
  verified_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated by route
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  entitlement_match_score_live?: number;
  first_time_fix_rate_30d_live?: number;
  avg_fulfilment_time_hours_live?: number;
  sla_days_remaining_live?: number | null;
  urgency_band_live?: UrgencyBand;
  breach_imminent_flag_live?: boolean;
  catalog_completeness_index_live?: number;
  regulator_filing_window_hours_live?: number | null;
  authority_required_live?: Authority;
  bridges_to_change_chain_live?: boolean;
  bridges_to_problem_chain_live?: boolean;
}

interface SrEvent {
  id: string;
  request_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiData {
  total: number;
  active_count: number;
  approval_pending: number;
  awaiting_user: number;
  fulfilled_count: number;
  reopened_count: number;
  critical_count: number;
  breached: number;
  reportable_total: number;
  cab_bridged_count: number;
  problem_bridged: number;
  platform_first_time_fix_rate_30d: number;
  platform_avg_fulfilment_time_hours: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  submitted:               { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'Submitted' },
  entitlement_checked:     { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'Entitlement OK' },
  approval_pending:        { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Approval pending' },
  approved:                { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Approved' },
  assigned:                { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Assigned' },
  fulfilment_in_progress:  { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)', label: 'Fulfilling' },
  awaiting_user:           { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)', label: 'Awaiting user' },
  user_responded:          { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)', label: 'User responded' },
  fulfilled:               { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)', label: 'Fulfilled' },
  verified:                { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)', label: 'Verified' },
  closed:                  { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)', label: 'Closed' },
  archived:                { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Archived' },
  rejected:                { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad)', label: 'Rejected' },
  cancelled:               { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Minor' },
  standard: { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'Standard' },
  material: { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Material' },
  critical: { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad)', label: 'Critical' },
};

const URGENCY_TONE: Record<UrgencyBand, { bg: string; fg: string; label: string }> = {
  low:      { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Low' },
  medium:   { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'Medium' },
  high:     { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'High' },
  critical: { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad)', label: 'Critical' },
};

const AUTH_LABEL: Record<Authority, string> = {
  end_user:          'End user',
  service_desk_lead: 'Service desk lead',
  asset_owner:       'Asset owner',
  support_director:  'Support director',
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  requester:    { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)' },
  approver:     { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: '#a06200' },
  service_desk: { bg: '#e8defc', fg: '#5320a3' },
  fulfiller:    { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)' },
  verifier:     { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)' },
  archiver:     { bg: 'var(--border-subtle, #e3e7ec)', fg: '#557' },
  system:       { bg: 'var(--border-subtle, #e3e7ec)', fg: '#557' },
};

// UX revisit 2026-05-30 - pills grouped action-first then state. Cuts row
// pill density so the workstation stays scannable as the function catalog
// grows. Action row anchors the four numbers the service desk lead opens
// for: SLA breach, awaiting user, reopened, critical urgency.
const FILTER_ROW_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',           label: 'Active (pre-terminal)' },
  { key: 'all',              label: 'All' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'critical_urgency', label: 'Critical urgency' },
  { key: 'reopened',         label: 'Reopened' },
  { key: 'cab_bridged',      label: 'CAB bridged' },
  { key: 'problem_bridged',  label: 'Problem bridged' },
  { key: 'critical',         label: 'Critical' },
  { key: 'material',         label: 'Material' },
  { key: 'standard',         label: 'Standard' },
  { key: 'minor',            label: 'Minor' },
];

const FILTER_ROW_STATE: Array<{ key: string; label: string }> = [
  { key: 'submitted',              label: 'Submitted' },
  { key: 'entitlement_checked',    label: 'Entitlement OK' },
  { key: 'approval_pending',       label: 'Approval pending' },
  { key: 'approved',               label: 'Approved' },
  { key: 'assigned',               label: 'Assigned' },
  { key: 'fulfilment_in_progress', label: 'Fulfilling' },
  { key: 'awaiting_user',          label: 'Awaiting user' },
  { key: 'user_responded',         label: 'User responded' },
  { key: 'fulfilled',              label: 'Fulfilled' },
  { key: 'verified',               label: 'Verified' },
  { key: 'closed',                 label: 'Closed' },
  { key: 'rejected',               label: 'Rejected' },
];

const TIERS = new Set<string>(['minor', 'standard', 'material', 'critical']);

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '-';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R${(v / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000)     return `R${(v / 1_000).toFixed(0)}k`;
  return `R${v.toFixed(0)}`;
}

function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(digits)}%`;
}

function fmtHours(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(digits)}h`;
}

export function ServiceRequestChainTab() {
  const [rows, setRows] = useState<SrRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<SrRow | null>(null);
  const [events, setEvents] = useState<SrEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: SrRow[] } }>('/support/service-request/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d as any;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load service requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: SrRow; events: SrEvent[] } }>(`/support/service-request/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load service request history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !r.is_terminal;
      if (filter === 'breached')         return r.sla_breached_live;
      if (filter === 'reportable')       return r.is_reportable_flag;
      if (filter === 'critical_urgency') return r.urgency_band_live === 'critical';
      if (filter === 'reopened')         return (r.reopened_count || 0) > 0;
      if (filter === 'cab_bridged')      return r.bridges_to_change_chain_live;
      if (filter === 'problem_bridged')  return r.bridges_to_problem_chain_live;
      if (TIERS.has(filter))             return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/support/service-request/chain/${selected.id}/${path}`, body ?? {});
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [selected, load, loadEvents]);

  return (
    <div className="space-y-3">
      {/* UX revisit 2026-05-30 - KPI strip ordered so the four numbers the
          service desk lead opens for (SLA breach, awaiting user, reopened,
          critical tier) sit left. FTF rate + avg fulfilment time anchor
          right because those are the brag numbers vs ServiceNow / BMC. */}
      <div className="grid grid-cols-8 gap-3">
        <Kpi label="SLA breached"      value={kpis?.breached ?? 0}              tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Awaiting user"     value={kpis?.awaiting_user ?? 0}         tone={(kpis?.awaiting_user ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reopened"          value={kpis?.reopened_count ?? 0}        tone={(kpis?.reopened_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Critical tier"     value={kpis?.critical_count ?? 0}        tone={(kpis?.critical_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Active"            value={kpis?.active_count ?? 0} />
        <Kpi label="Total"             value={kpis?.total ?? 0} />
        <Kpi label="First-time-fix 30d" value={fmtPct(kpis?.platform_first_time_fix_rate_30d ?? 0)} />
        <Kpi label="Avg fulfilment"    value={fmtHours(kpis?.platform_avg_fulfilment_time_hours ?? 0)} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_ROW_ACTION.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#c2873a] text-white border-[oklch(0.46_0.16_55)]'
                : 'bg-surface-v2 text-[var(--ink-2, #4a5568)] border-[var(--border-subtle, #dde4ec)] hover:bg-[var(--s2, #eef2f7)]'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_ROW_STATE.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#c2873a] text-white border-[oklch(0.46_0.16_55)]'
                : 'bg-surface-v2 text-[var(--ink-2, #6b7685)] border-[#eef2f6] hover:bg-[var(--s2, #eef2f7)]'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {err && <div className="px-3 py-2 bg-red-50 text-red-700 text-[12px] rounded-md">{err}</div>}

      <div className="bg-surface-v2 border border-[var(--border-subtle, #e5ebf2)] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--s1, #f7f9fb)] text-[11px] uppercase tracking-wide text-[var(--ink-2, #6b7685)]">
            <tr>
              <th className="px-3 py-2 text-left">Request #</th>
              <th className="px-3 py-2 text-left">Catalog / requester</th>
              <th className="px-3 py-2 text-right">Severity</th>
              <th className="px-3 py-2 text-right">Entitlement</th>
              <th className="px-3 py-2 text-right">Completeness</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">D SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={8} className="p-6 text-center text-[var(--ink-2, #6b7685)]">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-[var(--ink-2, #6b7685)]">No service requests match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const tierTone  = TIER_TONE[r.current_tier];
              const floored = !!(r.request_floor_flag_access_to_critical_system
                || r.request_floor_flag_data_export_popia
                || r.request_floor_flag_grid_significant
                || r.request_floor_flag_oem_break_glass
                || r.request_floor_flag_sla_premium_contract);
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[var(--s1, #f7f9fb)] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.request_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.catalog_item_label ?? r.catalog_item_id ?? '-'} - ${r.requested_for_party_label ?? r.requested_for_party_id ?? '-'}`}>
                    {r.catalog_item_label ?? r.catalog_item_id ?? '-'}
                    <span className="text-[var(--ink-2, #6b7685)]"> - {r.requested_for_party_label ?? r.requested_for_party_id ?? '-'}</span>
                    {floored && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[color-mix(in oklab, var(--warn) 15%, var(--s1))] text-[#a06200]">FLOOR</span>}
                    {r.bridges_to_change_chain_live && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#e8defc] text-[#5320a3]">CAB</span>}
                    {(r.reopened_count ?? 0) > 0 && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[color-mix(in oklab, var(--bad) 15%, var(--s1))] text-[var(--bad, #9b1f1f)]">REOPEN x{r.reopened_count}</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{fmtZar(r.severity_zar)}</td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{(r.entitlement_match_score_live ?? 0).toFixed(0)}</td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{(r.catalog_completeness_index_live ?? 0).toFixed(0)}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: tierTone.bg, color: tierTone.fg }}>
                      {tierTone.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: stateTone.bg, color: stateTone.fg }}>
                      {stateTone.label}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[var(--ink-2, #4a5568)]'}`}>
                    {r.is_terminal ? '-' : fmtMin(r.minutes_until_sla)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <SrDrawer
          row={selected}
          events={events}
          onClose={() => { setSelected(null); setEvents([]); }}
          doAction={doAction}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone = 'ok' }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const fg = tone === 'bad' ? 'var(--bad, #9b1f1f)' : tone === 'warn' ? '#a06200' : 'var(--ink, #0f1c2e)';
  return (
    <div className="bg-surface-v2 border border-[var(--border-subtle, #e5ebf2)] rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--ink-2, #6b7685)]">{label}</div>
      <div className="text-[20px] font-semibold tabular-nums mt-0.5" style={{ color: fg }}>{value}</div>
    </div>
  );
}

function SrDrawer({
  row, events, onClose, doAction,
}: {
  row: SrRow;
  events: SrEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.chain_status;
  const transitionable = !row.is_hard_terminal;
  const cancellable = !row.is_hard_terminal && cs !== 'archived';
  const reopenable = cs === 'fulfilled';
  const urgencyTone = row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live] : null;
  const authorityNow = row.authority_required_live ?? row.authority_required ?? null;
  const floored = !!(row.request_floor_flag_access_to_critical_system
    || row.request_floor_flag_data_export_popia
    || row.request_floor_flag_grid_significant
    || row.request_floor_flag_oem_break_glass
    || row.request_floor_flag_sla_premium_contract);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-stretch justify-end oe-overlay-in" onClick={onClose}>
      <div className="bg-surface-v2 w-full max-w-2xl shadow-xl overflow-y-auto oe-drawer-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[var(--border-subtle, #e5ebf2)] flex items-start justify-between sticky top-0 bg-surface-v2 z-10">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--ink-2, #6b7685)]">Service request {row.request_number}</div>
            <h3 className="text-[16px] font-semibold text-[var(--ink, #0f1c2e)] mt-0.5">
              {row.catalog_item_label ?? row.catalog_item_id ?? '-'} - {row.requested_for_party_label ?? row.requested_for_party_id ?? '-'}
            </h3>
            <div className="flex flex-wrap gap-2 mt-2 text-[12px]">
              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: TIER_TONE[row.current_tier].bg, color: TIER_TONE[row.current_tier].fg }}>
                {TIER_TONE[row.current_tier].label}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: STATE_TONE[cs].bg, color: STATE_TONE[cs].fg }}>
                {STATE_TONE[cs].label}
              </span>
              {urgencyTone && (
                <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: urgencyTone.bg, color: urgencyTone.fg }}>
                  {urgencyTone.label} urgency
                </span>
              )}
              {floored && (
                <span className="px-2 py-0.5 rounded-full font-bold bg-[color-mix(in oklab, var(--warn) 15%, var(--s1))] text-[#a06200]">FLOOR</span>
              )}
              {row.is_reportable_flag && (
                <span className="px-2 py-0.5 rounded-full bg-[color-mix(in oklab, var(--bad) 15%, var(--s1))] text-[var(--bad, #9b1f1f)] font-medium">Regulator reportable</span>
              )}
              {authorityNow && (
                <span className="px-2 py-0.5 rounded-full bg-[oklch(0.94_0.02_250)] font-medium" style={{ color: 'oklch(0.46 0.16 55)' }}>Auth: {AUTH_LABEL[authorityNow]}</span>
              )}
              {row.bridges_to_change_chain_live && (
                <span className="px-2 py-0.5 rounded-full bg-[#e8defc] text-[#5320a3] font-medium">CAB bridge</span>
              )}
              {row.bridges_to_problem_chain_live && (
                <span className="px-2 py-0.5 rounded-full bg-[color-mix(in oklab, var(--bad) 15%, var(--s1))] text-[#7a1414] font-medium">Problem bridge</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--ink-2, #6b7685)] hover:text-[var(--ink, #0f1c2e)]">X</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="bg-[var(--s1, #f7f9fb)] border border-[var(--border-subtle, #e5ebf2)] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--ink-2, #6b7685)] mb-2">Catalog + entitlement</div>
            <div className="grid grid-cols-3 gap-3">
              <Pair label="Catalog item" value={row.catalog_item_label ?? row.catalog_item_id ?? '-'} />
              <Pair label="Category" value={row.catalog_category ?? '-'} />
              <Pair label="Urgency requested" value={row.urgency_requested ?? '-'} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[var(--border-subtle, #e5ebf2)]">
              <Pair label="Entitlement" value={row.entitlement_status ?? '-'} />
              <Pair label="Service contract" value={row.entitlement_contract_id ?? '-'} />
              <Pair label="Match score" value={`${(row.entitlement_match_score_live ?? 0).toFixed(0)} / 100`} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[var(--border-subtle, #e5ebf2)]">
              <Pair label="Requester" value={row.requested_by_actor_id ?? '-'} />
              <Pair label="For" value={row.requested_for_party_label ?? row.requested_for_party_id ?? '-'} />
              <Pair label="Justification" value={row.business_justification ?? '-'} />
            </div>
          </div>

          <div className="bg-[var(--s1, #f7f9fb)] border border-[var(--border-subtle, #e5ebf2)] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--ink-2, #6b7685)] mb-2">Fulfilment battery</div>
            <div className="grid grid-cols-4 gap-3">
              <Pair label="Catalog completeness" value={`${(row.catalog_completeness_index_live ?? 0).toFixed(0)} / 130`} />
              <Pair label="FTF rate 30d" value={fmtPct(row.first_time_fix_rate_30d_live ?? 0)} />
              <Pair label="Avg fulfilment" value={fmtHours(row.avg_fulfilment_time_hours_live ?? 0)} />
              <Pair label="SLA days left" value={row.sla_days_remaining_live != null ? `${row.sla_days_remaining_live.toFixed(1)}d` : '-'} />
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-[var(--border-subtle, #e5ebf2)]">
              <Pair label="Severity (ZAR)" value={fmtZar(row.severity_zar)} />
              <Pair label="Reopened" value={`${row.reopened_count}`} />
              <Pair label="First time fix" value={row.first_time_fix ? 'Yes' : 'No'} />
              <Pair label="CSAT" value={row.customer_satisfaction_csat != null ? `${row.customer_satisfaction_csat} / 5` : '-'} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[var(--border-subtle, #e5ebf2)]">
              <Pair label="Reg filing window" value={row.regulator_filing_window_hours_live != null ? `${row.regulator_filing_window_hours_live}h` : '-'} />
              <Pair label="Assignee" value={row.assignee_team ?? row.fulfiller_actor_id ?? '-'} />
              <Pair label="Approver" value={row.approver_actor_id ?? '-'} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FlagPill on={!!row.request_floor_flag_access_to_critical_system} label="Access to critical system (CRITICAL)" />
            <FlagPill on={!!row.request_floor_flag_oem_break_glass} label="OEM break glass (CRITICAL)" />
            <FlagPill on={!!row.request_floor_flag_data_export_popia} label="POPIA data export (MATERIAL)" />
            <FlagPill on={!!row.request_floor_flag_grid_significant} label="Grid significant (MATERIAL)" />
            <FlagPill on={!!row.request_floor_flag_sla_premium_contract} label="SLA premium contract (MATERIAL)" />
            <FlagPill on={!!row.requires_cab_review} label="Requires CAB review" />
            <FlagPill on={!!row.auto_fulfil_eligible} label="Auto-fulfil eligible" />
            <FlagPill on={!!row.regulator_relevant} label="Regulator relevant" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {row.cab_change_id && <Pair label="CAB change ref" value={row.cab_change_id} />}
            {row.regulator_inbox_ref && <Pair label="Regulator inbox" value={row.regulator_inbox_ref} />}
            {row.regulator_ref && <Pair label="Regulator ref" value={row.regulator_ref} />}
            {row.reject_reason && <Pair label="Reject reason" value={row.reject_reason} />}
            {row.cancelled_reason && <Pair label="Cancelled reason" value={row.cancelled_reason} />}
            {row.reopen_reason_text && <Pair label="Reopen reason" value={row.reopen_reason_text} />}
            {row.reason_code && <Pair label="Reason code" value={row.reason_code} />}
            {row.failure_reason_code && <Pair label="Failure code" value={row.failure_reason_code} />}
          </div>

          {row.source_wave && (
            <Pair label="Provenance" value={`${row.source_wave}${row.source_entity_id ? ` - ${row.source_entity_id}` : ''}${row.source_event ? ` (${row.source_event})` : ''}`} />
          )}

          {row.sla_deadline_at && !row.is_terminal && (
            <Pair label="Next SLA" value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` - ${row.escalation_level} breach(es)` : ''}`} />
          )}

          {transitionable && (
            <div className="border-t border-[#eef2f6] pt-4">
              <div className="text-[11px] uppercase tracking-wide text-[var(--ink-2, #6b7685)] mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                {cs === 'submitted' && (
                  <ActionBtn label="Check entitlement (service desk)" onClick={() => {
                    const status = window.prompt('Entitlement status (entitled | not_entitled | contract_expired | overage):') ?? undefined;
                    const contract = window.prompt('Service contract id (optional):') ?? undefined;
                    const over = window.prompt('Overage units (optional):') ?? undefined;
                    void doAction('check-entitlement', {
                      entitlement_status: status,
                      entitlement_contract_id: contract,
                      entitlement_overage_units: over ? Number(over) : undefined,
                    });
                  }} />
                )}
                {cs === 'entitlement_checked' && (
                  <ActionBtn label="Request approval (service desk)" onClick={() => {
                    const approver = window.prompt('Approver actor id:') ?? undefined;
                    const cab = window.confirm('Requires CAB review (change enablement)?');
                    void doAction('request-approval', {
                      approver_actor_id: approver,
                      requires_cab_review: cab,
                    });
                  }} />
                )}
                {cs === 'approval_pending' && (
                  <>
                    <ActionBtn label="Approve (approver)" tone="good" onClick={() => {
                      const conds = window.prompt('Approval conditions (optional):') ?? undefined;
                      const cabRef = window.prompt('CAB change ref (optional):') ?? undefined;
                      void doAction('approve', {
                        approval_conditions_text: conds,
                        cab_change_id: cabRef,
                      });
                    }} />
                    <ActionBtn label="Reject (approver)" tone="bad" onClick={() => {
                      const reason = window.prompt('Reject reason:') ?? undefined;
                      void doAction('reject', { reject_reason: reason });
                    }} />
                  </>
                )}
                {cs === 'approved' && (
                  <ActionBtn label="Assign fulfiller (service desk)" onClick={() => {
                    const fulfiller = window.prompt('Fulfiller actor id:') ?? undefined;
                    const team = window.prompt('Assignee team (optional):') ?? undefined;
                    void doAction('assign', {
                      fulfiller_actor_id: fulfiller,
                      assignee_team: team,
                    });
                  }} />
                )}
                {cs === 'assigned' && (
                  <ActionBtn label="Start fulfilment (fulfiller)" onClick={() => { void doAction('start-fulfilment', {}); }} />
                )}
                {cs === 'fulfilment_in_progress' && (
                  <>
                    <ActionBtn label="Request user info (fulfiller)" onClick={() => {
                      const note = window.prompt('What info is needed from the user?') ?? undefined;
                      void doAction('request-user-info', { notes: note });
                    }} />
                    <ActionBtn label="Mark fulfilled (fulfiller)" tone="good" onClick={() => {
                      const result = window.prompt('Result text (optional):') ?? undefined;
                      void doAction('mark-fulfilled', { result_text: result });
                    }} />
                  </>
                )}
                {cs === 'awaiting_user' && (
                  <ActionBtn label="Receive user response (requester)" onClick={() => {
                    const note = window.prompt('Response notes:') ?? undefined;
                    void doAction('receive-user-response', { notes: note });
                  }} />
                )}
                {cs === 'user_responded' && (
                  <ActionBtn label="Mark fulfilled (fulfiller)" tone="good" onClick={() => {
                    const result = window.prompt('Result text (optional):') ?? undefined;
                    void doAction('mark-fulfilled', { result_text: result });
                  }} />
                )}
                {cs === 'fulfilled' && (
                  <>
                    <ActionBtn label="Verify (verifier)" tone="good" onClick={() => {
                      const csat = window.prompt('CSAT 1-5 (optional):') ?? undefined;
                      void doAction('verify', { customer_satisfaction_csat: csat ? Number(csat) : undefined });
                    }} />
                    {reopenable && (
                      <ActionBtn label="Reopen (verifier)" tone="bad" onClick={() => {
                        const reason = window.prompt('Reopen reason:') ?? undefined;
                        void doAction('reopen-request', { reopen_reason_text: reason });
                      }} />
                    )}
                  </>
                )}
                {cs === 'verified' && (
                  <ActionBtn label="Close (service desk)" tone="good" onClick={() => { void doAction('close', {}); }} />
                )}
                {cs === 'closed' && (
                  <ActionBtn label="Archive (archiver)" onClick={() => { void doAction('archive-request', {}); }} />
                )}
                {cancellable && (
                  <ActionBtn label="Cancel request" onClick={() => {
                    const reason = window.prompt('Cancellation reason:') ?? undefined;
                    void doAction('cancel-request', { cancelled_reason: reason });
                  }} />
                )}
              </div>
            </div>
          )}

          <div className="border-t border-[#eef2f6] pt-4">
            <div className="text-[11px] uppercase tracking-wide text-[var(--ink-2, #6b7685)] mb-2">Timeline</div>
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-[12px] text-[var(--ink-2, #6b7685)]">No events yet.</div>
              ) : events.map((e) => {
                const partyTone = PARTY_TONE[e.actor_party ?? 'system'] ?? PARTY_TONE.system;
                return (
                  <div key={e.id} className="flex gap-3 text-[12px] border-l-2 border-[var(--border-subtle, #e5ebf2)] pl-3 py-1">
                    <span className="font-mono text-[11px] text-[var(--ink-2, #6b7685)] whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</span>
                    <div>
                      <span className="font-semibold text-[var(--ink, #0f1c2e)]">{e.event_type}</span>
                      {e.actor_party && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase" style={{ background: partyTone.bg, color: partyTone.fg }}>
                          {e.actor_party}
                        </span>
                      )}
                      {e.from_status && e.to_status && e.from_status !== e.to_status && (
                        <span className="text-[var(--ink-2, #6b7685)]"> {'· '}{e.from_status} {'→'} {e.to_status}</span>
                      )}
                      {e.notes && <div className="text-[var(--ink-2, #4a5568)] mt-0.5">{e.notes}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--ink-2, #6b7685)]">{label}</div>
      <div className="text-[var(--ink, #0f1c2e)] mt-0.5">{value}</div>
    </div>
  );
}

function FlagPill({ on, label }: { on: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-md text-[12px] ${on ? 'bg-[color-mix(in oklab, var(--warn) 15%, var(--s1))] text-[#a06200] border border-[#f4d68f]' : 'bg-[var(--s1, #f7f9fb)] text-[var(--ink-2, #6b7685)] border border-[var(--border-subtle, #e5ebf2)]'}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${on ? 'bg-[#a06200]' : 'bg-[#cbd5e0]'}`} />
      <span>{label}</span>
    </div>
  );
}

function ActionBtn({ label, onClick, tone = 'neutral' }: { label: string; onClick: () => void; tone?: 'neutral' | 'good' | 'bad' }) {
  const bg = tone === 'good' ? 'bg-emerald-700' : tone === 'bad' ? 'bg-red-700' : 'bg-[#c2873a]';
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 ${bg} text-white text-[12px] rounded-md hover:opacity-90`}>
      {label}
    </button>
  );
}
