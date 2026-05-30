// Wave 110 - Grid Transmission Network Outage Coordination & N-1 Security
// Assessment chain tab. 11th Grid chain. SO-initiated EHV / HV
// transmission line + substation outage windows with N-1 contingency
// security assessment + reliability-committee approval + real-time
// supervision + return-to-service verification. Distinct from W18
// (asset-owner driven planned outage on IPP generators).
//
// 12-state P6 lifecycle (outage_requested -> security_assessment ->
// n1_contingency_run -> reliability_committee_review -> outage_approved
// -> outage_window_open -> outage_in_progress -> outage_completed ->
// return_to_service -> post_outage_review -> archived) plus 5 branch
// states (rejected / withdrawn / suspended / emergency_cancelled /
// extended). Tier RE-DERIVED on every transition from
// transmission_voltage_kv (low_sub132kv<132 / medium_132kv=132 /
// high_275kv>=275<400 / critical_400kv_plus>=400), FLOOR-AT-HIGH on any
// one of 5 floor flags (peak_demand_period, single_circuit_radial,
// cross_border_interconnector, black_start_path, national_grid_backbone),
// FLOOR-AT-CRITICAL on 2+ flags OR national_grid_backbone OR
// black_start_path. URGENT SLA polarity stored in HOURS (critical
// 400kV+ has SHORTEST runway, low <132 kV has LONGEST).
//
// 4-step authority ladder (outage_planner -> system_operator ->
// reliability_committee_chair -> SO_CEO).
//
// Beats Hitachi Energy Lumada / ABB Network Manager / Siemens Spectrum /
// GE PowerOn / OSI monarch / OATI WebTrans / Eskom NCC / PowerWorld /
// Schneider EcoStruxure ADMS via LIVE coverage battery (sla hours
// remaining, urgency band, authority required, regulator filing window,
// security margin pct, hours to / in / past outage window, extension
// imminent flag, emergency cancel risk flag, returned-to-service clean,
// floor flag count, completeness 0-130, bridges to W18 / W34 / W50)
// composed every fetch.
//
// SIGNATURE regulator crossings:
//   emergency_cancel  -> regulator EVERY tier (W110 SIGNATURE)
//   extend_outage     -> regulator high + critical
//   approve_outage    -> regulator critical only when national_grid_backbone
//   suspend_outage    -> regulator high + critical
//   sla_breached      -> regulator high + critical
//
// Mounted on Grid workstation (primary write {admin,grid_operator}); READ
// all 9 personas.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'outage_requested' | 'security_assessment' | 'n1_contingency_run'
  | 'reliability_committee_review' | 'outage_approved' | 'outage_window_open'
  | 'outage_in_progress' | 'outage_completed' | 'return_to_service'
  | 'post_outage_review' | 'archived'
  | 'rejected' | 'withdrawn' | 'suspended' | 'emergency_cancelled' | 'extended';

type Tier = 'low_sub132kv' | 'medium_132kv' | 'high_275kv' | 'critical_400kv_plus';

type UrgencyBand = 'critical' | 'high' | 'medium' | 'low';

type Authority = 'outage_planner' | 'system_operator' | 'reliability_committee_chair' | 'SO_CEO';

interface TxoRow {
  id: string;
  outage_number: string;
  asset_id: string;
  asset_label: string | null;
  transmission_voltage_kv: number;
  corridor_name: string | null;
  substation_a: string | null;
  substation_b: string | null;
  affected_circuits_count: number;
  planned_outage_ref: string | null;
  curtailment_ref: string | null;
  reserve_activation_ref: string | null;
  outage_type: string | null;
  outage_reason: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  n1_pass_count: number;
  n1_fail_count: number;
  n1_summary: string | null;
  security_margin_pct: number;
  thermal_limit_mw: number | null;
  actual_load_mw: number | null;
  rts_test_passed: number;
  extension_requested: number;
  extension_hours_granted: number;
  suspension_count: number;
  peak_demand_period: number;
  single_circuit_radial: number;
  cross_border_interconnector: number;
  black_start_path: number;
  national_grid_backbone: number;
  current_tier: Tier;
  authority_required: Authority | null;
  urgency_band: string | null;
  outage_completeness_index: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  withdraw_reason: string | null;
  emergency_cancel_reason: string | null;
  suspend_reason: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  outage_requested_at: string | null;
  security_assessment_at: string | null;
  n1_contingency_run_at: string | null;
  reliability_committee_review_at: string | null;
  outage_approved_at: string | null;
  outage_window_open_at: string | null;
  outage_in_progress_at: string | null;
  outage_completed_at: string | null;
  return_to_service_at: string | null;
  post_outage_review_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  suspended_at: string | null;
  emergency_cancelled_at: string | null;
  extended_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_hours: number;
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
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: UrgencyBand;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  security_margin_pct_live?: number;
  hours_to_outage_window_live?: number | null;
  hours_in_outage_live?: number;
  hours_to_planned_completion_live?: number | null;
  extension_imminent_live?: boolean;
  emergency_cancel_risk_live?: boolean;
  returned_to_service_clean_live?: boolean;
  floor_flag_count_live?: number;
  outage_completeness_index_live?: number;
  bridges_to_planned_outage_chain_live?: boolean;
  bridges_to_curtailment_chain_live?: boolean;
  bridges_to_reserve_activation_chain_live?: boolean;
}

interface TxoEvent {
  id: string;
  outage_id: string;
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
  in_progress_count: number;
  suspended_count: number;
  emergency_count: number;
  critical_tier_count: number;
  breached: number;
  reportable_total: number;
  planned_bridged_count: number;
  curtailment_bridged_count: number;
  reserve_bridged_count: number;
  total_circuits_offline: number;
  avg_lifecycle_hours: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  outage_requested:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Requested' },
  security_assessment:          { bg: '#dbecfb', fg: '#1a3a5c', label: 'Security assess' },
  n1_contingency_run:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'N-1 run' },
  reliability_committee_review: { bg: '#fff4d6', fg: '#a06200', label: 'Committee' },
  outage_approved:              { bg: '#fff4d6', fg: '#a06200', label: 'Approved' },
  outage_window_open:           { bg: '#fff4d6', fg: '#a06200', label: 'Window open' },
  outage_in_progress:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'In progress' },
  extended:                     { bg: '#fbd0d0', fg: '#7a1414', label: 'Extended' },
  suspended:                    { bg: '#fbd0d0', fg: '#7a1414', label: 'Suspended' },
  outage_completed:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Completed' },
  return_to_service:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'RTS' },
  post_outage_review:           { bg: '#daf5e2', fg: '#1f6b3a', label: 'Post-review' },
  archived:                     { bg: '#e3e7ec', fg: '#557',    label: 'Archived' },
  rejected:                     { bg: '#e3e7ec', fg: '#557',    label: 'Rejected' },
  withdrawn:                    { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
  emergency_cancelled:          { bg: '#fbd0d0', fg: '#7a1414', label: 'Emergency cancel' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  low_sub132kv:        { bg: '#e3e7ec', fg: '#557',    label: 'Low <132kV' },
  medium_132kv:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Medium 132kV' },
  high_275kv:          { bg: '#fff4d6', fg: '#a06200', label: 'High 275kV' },
  critical_400kv_plus: { bg: '#fbd0d0', fg: '#7a1414', label: 'Critical 400kV+' },
};

const URGENCY_TONE: Record<UrgencyBand, { bg: string; fg: string; label: string }> = {
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
  medium:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Medium' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical: { bg: '#fbd0d0', fg: '#7a1414', label: 'Critical' },
};

const AUTH_LABEL: Record<Authority, string> = {
  outage_planner:              'Outage planner',
  system_operator:             'System operator',
  reliability_committee_chair: 'Reliability cmte chair',
  SO_CEO:                      'SO CEO',
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  outage_planner:        { bg: '#dbecfb', fg: '#1a3a5c' },
  system_operator:       { bg: '#e8defc', fg: '#5320a3' },
  reliability_committee: { bg: '#fff4d6', fg: '#a06200' },
  archive_clerk:         { bg: '#e3e7ec', fg: '#557' },
  system:                { bg: '#e3e7ec', fg: '#557' },
};

// UX revisit 2026-05-30 - pills grouped action-first then state. The SO
// dispatcher opens for in-progress outages, emergency cancellations,
// suspensions, critical-tier exposure, and SLA breach first. Action row
// carries those plus tier slicers and bridges to W18/W34/W50; state row
// enumerates the 11 lifecycle states.
const FILTER_ROW_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',            label: 'Active (pre-terminal)' },
  { key: 'all',               label: 'All' },
  { key: 'in_progress',       label: 'In progress' },
  { key: 'suspended',         label: 'Suspended' },
  { key: 'emergency',         label: 'Emergency cancelled' },
  { key: 'extended',          label: 'Extended' },
  { key: 'breached',          label: 'SLA breached' },
  { key: 'reportable',        label: 'Reportable' },
  { key: 'critical_urgency',  label: 'Critical urgency' },
  { key: 'planned_bridged',   label: 'Bridged to W18' },
  { key: 'curtail_bridged',   label: 'Bridged to W34' },
  { key: 'reserve_bridged',   label: 'Bridged to W50' },
  { key: 'critical_400kv_plus', label: 'Critical 400kV+' },
  { key: 'high_275kv',        label: 'High 275kV' },
  { key: 'medium_132kv',      label: 'Medium 132kV' },
  { key: 'low_sub132kv',      label: 'Low <132kV' },
];

const FILTER_ROW_STATE: Array<{ key: string; label: string }> = [
  { key: 'outage_requested',             label: 'Requested' },
  { key: 'security_assessment',          label: 'Security assess' },
  { key: 'n1_contingency_run',           label: 'N-1 run' },
  { key: 'reliability_committee_review', label: 'Committee' },
  { key: 'outage_approved',              label: 'Approved' },
  { key: 'outage_window_open',           label: 'Window open' },
  { key: 'outage_in_progress',           label: 'In progress' },
  { key: 'outage_completed',             label: 'Completed' },
  { key: 'return_to_service',            label: 'RTS' },
  { key: 'post_outage_review',           label: 'Post-review' },
  { key: 'archived',                     label: 'Archived' },
];

const TIERS = new Set<string>(['low_sub132kv', 'medium_132kv', 'high_275kv', 'critical_400kv_plus']);

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '-';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

function fmtHours(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '-';
  if (Math.abs(v) >= 24) return `${(v / 24).toFixed(digits)}d`;
  return `${v.toFixed(digits)}h`;
}

function fmtMw(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(0)} MW`;
}

function fmtKv(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(0)} kV`;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(1)}%`;
}

export function TransmissionOutageChainTab() {
  const [rows, setRows] = useState<TxoRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<TxoRow | null>(null);
  const [events, setEvents] = useState<TxoEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: TxoRow[] } }>('/grid/transmission-outage/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d as any;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load transmission outages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: TxoRow; events: TxoEvent[] } }>(`/grid/transmission-outage/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load outage history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')               return true;
      if (filter === 'active')            return !r.is_terminal;
      if (filter === 'in_progress')       return r.chain_status === 'outage_in_progress' || r.chain_status === 'extended';
      if (filter === 'suspended')         return r.chain_status === 'suspended';
      if (filter === 'emergency')         return r.chain_status === 'emergency_cancelled';
      if (filter === 'extended')          return r.chain_status === 'extended';
      if (filter === 'breached')          return r.sla_breached_live;
      if (filter === 'reportable')        return r.is_reportable_flag;
      if (filter === 'critical_urgency')  return r.urgency_band_live === 'critical';
      if (filter === 'planned_bridged')   return r.bridges_to_planned_outage_chain_live;
      if (filter === 'curtail_bridged')   return r.bridges_to_curtailment_chain_live;
      if (filter === 'reserve_bridged')   return r.bridges_to_reserve_activation_chain_live;
      if (TIERS.has(filter))              return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/grid/transmission-outage/chain/${selected.id}/${path}`, body ?? {});
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [selected, load, loadEvents]);

  return (
    <div className="space-y-3">
      {/* UX revisit 2026-05-30 - KPI strip ordered so the four numbers the
          SO dispatcher opens for (SLA breach, in-progress, emergency
          cancel, critical 400kV+ tier) sit left. Total circuits offline,
          bridges to W18/W34/W50, and avg lifecycle hours anchor right
          because those are the brag numbers vs Hitachi Lumada / ABB NMS /
          Siemens Spectrum / GE PowerOn. */}
      <div className="grid grid-cols-8 gap-3">
        <Kpi label="SLA breached"      value={kpis?.breached ?? 0}                tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="In progress"       value={kpis?.in_progress_count ?? 0}       tone={(kpis?.in_progress_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Emergency cancel"  value={kpis?.emergency_count ?? 0}         tone={(kpis?.emergency_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Critical 400kV+"   value={kpis?.critical_tier_count ?? 0}     tone={(kpis?.critical_tier_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Active"            value={kpis?.active_count ?? 0} />
        <Kpi label="Total"             value={kpis?.total ?? 0} />
        <Kpi label="Circuits offline"  value={kpis?.total_circuits_offline ?? 0} />
        <Kpi label="Avg lifecycle"     value={fmtHours(kpis?.avg_lifecycle_hours ?? 0)} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_ROW_ACTION.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]'
                : 'bg-white text-[#4a5568] border-[#dde4ec] hover:bg-gray-50'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_ROW_STATE.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]'
                : 'bg-white text-[#6b7685] border-[#eef2f6] hover:bg-gray-50'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {err && <div className="px-3 py-2 bg-red-50 text-red-700 text-[12px] rounded-md">{err}</div>}

      <div className="bg-white border border-[#e5ebf2] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f7f9fb] text-[11px] uppercase tracking-wide text-[#6b7685]">
            <tr>
              <th className="px-3 py-2 text-left">Outage #</th>
              <th className="px-3 py-2 text-left">Asset / corridor</th>
              <th className="px-3 py-2 text-right">Voltage</th>
              <th className="px-3 py-2 text-right">Circuits</th>
              <th className="px-3 py-2 text-right">Completeness</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">{'Δ'} SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">No transmission outages match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const tierTone  = TIER_TONE[r.current_tier];
              const floored = (r.floor_flag_count_live ?? 0) > 0;
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.outage_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.asset_label ?? r.asset_id} - ${r.corridor_name ?? '-'}`}>
                    {r.asset_label ?? r.asset_id}
                    <span className="text-[#6b7685]"> - {r.corridor_name ?? '-'}</span>
                    {floored && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fff4d6] text-[#a06200]">FLOOR {r.floor_flag_count_live}</span>}
                    {r.bridges_to_planned_outage_chain_live && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#dbecfb] text-[#1a3a5c]">W18</span>}
                    {r.bridges_to_curtailment_chain_live && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fff4d6] text-[#a06200]">W34</span>}
                    {r.bridges_to_reserve_activation_chain_live && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#e8defc] text-[#5320a3]">W50</span>}
                    {r.emergency_cancel_risk_live && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fbd0d0] text-[#7a1414]">EC RISK</span>}
                    {r.extension_imminent_live && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fbd0d0] text-[#7a1414]">EXT IMMINENT</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{fmtKv(r.transmission_voltage_kv)}</td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{r.affected_circuits_count}</td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{(r.outage_completeness_index_live ?? r.outage_completeness_index ?? 0).toFixed(0)}</td>
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
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                    {r.is_terminal ? '-' : fmtMin(r.minutes_until_sla)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <TxoDrawer
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
  const fg = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0f1c2e';
  return (
    <div className="bg-white border border-[#e5ebf2] rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="text-[20px] font-semibold tabular-nums mt-0.5" style={{ color: fg }}>{value}</div>
    </div>
  );
}

function TxoDrawer({
  row, events, onClose, doAction,
}: {
  row: TxoRow;
  events: TxoEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.chain_status;
  const transitionable = !row.is_hard_terminal;
  const urgencyTone = row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live] : null;
  const authorityNow = row.authority_required_live ?? row.authority_required ?? null;
  const floored = (row.floor_flag_count_live ?? 0) > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-stretch justify-end oe-overlay-in" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl shadow-xl overflow-y-auto oe-drawer-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Transmission outage {row.outage_number}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
              {row.asset_label ?? row.asset_id} - {row.corridor_name ?? '-'} {' · '} {fmtKv(row.transmission_voltage_kv)}
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
                <span className="px-2 py-0.5 rounded-full font-bold bg-[#fff4d6] text-[#a06200]">FLOOR ({row.floor_flag_count_live})</span>
              )}
              {row.is_reportable_flag && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Regulator reportable</span>
              )}
              {authorityNow && (
                <span className="px-2 py-0.5 rounded-full bg-[#dbecfb] text-[#1a3a5c] font-medium">Auth: {AUTH_LABEL[authorityNow]}</span>
              )}
              {row.bridges_to_planned_outage_chain_live && (
                <span className="px-2 py-0.5 rounded-full bg-[#dbecfb] text-[#1a3a5c] font-medium">W18 planned outage bridge</span>
              )}
              {row.bridges_to_curtailment_chain_live && (
                <span className="px-2 py-0.5 rounded-full bg-[#fff4d6] text-[#a06200] font-medium">W34 curtailment bridge</span>
              )}
              {row.bridges_to_reserve_activation_chain_live && (
                <span className="px-2 py-0.5 rounded-full bg-[#e8defc] text-[#5320a3] font-medium">W50 reserve bridge</span>
              )}
              {row.emergency_cancel_risk_live && (
                <span className="px-2 py-0.5 rounded-full bg-[#fbd0d0] text-[#7a1414] font-medium">Emergency cancel risk</span>
              )}
              {row.extension_imminent_live && (
                <span className="px-2 py-0.5 rounded-full bg-[#fbd0d0] text-[#7a1414] font-medium">Extension imminent</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">X</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Outage window</div>
            <div className="grid grid-cols-3 gap-3">
              <Pair label="Scheduled start" value={row.scheduled_start_at ? new Date(row.scheduled_start_at).toLocaleString() : '-'} />
              <Pair label="Scheduled end"   value={row.scheduled_end_at ? new Date(row.scheduled_end_at).toLocaleString() : '-'} />
              <Pair label="Affected circuits" value={`${row.affected_circuits_count}`} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Actual start" value={row.actual_start_at ? new Date(row.actual_start_at).toLocaleString() : '-'} />
              <Pair label="Actual end"   value={row.actual_end_at ? new Date(row.actual_end_at).toLocaleString() : '-'} />
              <Pair label="Substations" value={`${row.substation_a ?? '-'} / ${row.substation_b ?? '-'}`} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Hours to window" value={fmtHours(row.hours_to_outage_window_live)} />
              <Pair label="Hours in outage" value={fmtHours(row.hours_in_outage_live)} />
              <Pair label="Hours to completion" value={fmtHours(row.hours_to_planned_completion_live)} />
            </div>
          </div>

          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">N-1 + security battery</div>
            <div className="grid grid-cols-4 gap-3">
              <Pair label="N-1 pass" value={`${row.n1_pass_count}`} />
              <Pair label="N-1 fail" value={`${row.n1_fail_count}`} />
              <Pair label="Security margin" value={fmtPct(row.security_margin_pct_live ?? row.security_margin_pct)} />
              <Pair label="Thermal limit" value={fmtMw(row.thermal_limit_mw)} />
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Actual load" value={fmtMw(row.actual_load_mw)} />
              <Pair label="Suspensions" value={`${row.suspension_count}`} />
              <Pair label="Extension hrs" value={`${row.extension_hours_granted}`} />
              <Pair label="RTS test" value={row.rts_test_passed ? 'PASS' : '-'} />
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Completeness" value={`${(row.outage_completeness_index_live ?? 0).toFixed(0)} / 130`} />
              <Pair label="SLA hrs left" value={row.sla_hours_remaining_live != null ? fmtHours(row.sla_hours_remaining_live) : '-'} />
              <Pair label="Reg filing window" value={row.regulator_filing_window_hours_live != null ? `${row.regulator_filing_window_hours_live}h` : '-'} />
              <Pair label="Escalations" value={`${row.escalation_level}`} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FlagPill on={!!row.peak_demand_period} label="Peak demand period (HIGH)" />
            <FlagPill on={!!row.single_circuit_radial} label="Single-circuit radial (HIGH)" />
            <FlagPill on={!!row.cross_border_interconnector} label="Cross-border interconnector (HIGH)" />
            <FlagPill on={!!row.black_start_path} label="Black-start path (CRITICAL)" />
            <FlagPill on={!!row.national_grid_backbone} label="National grid backbone (CRITICAL)" />
            <FlagPill on={!!row.regulator_relevant} label="Regulator relevant" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {row.planned_outage_ref && <Pair label="W18 planned outage ref" value={row.planned_outage_ref} />}
            {row.curtailment_ref && <Pair label="W34 curtailment ref" value={row.curtailment_ref} />}
            {row.reserve_activation_ref && <Pair label="W50 reserve ref" value={row.reserve_activation_ref} />}
            {row.regulator_inbox_ref && <Pair label="Regulator inbox" value={row.regulator_inbox_ref} />}
            {row.regulator_ref && <Pair label="Regulator ref" value={row.regulator_ref} />}
            {row.n1_summary && <Pair label="N-1 summary" value={row.n1_summary} />}
            {row.reject_reason && <Pair label="Reject reason" value={row.reject_reason} />}
            {row.withdraw_reason && <Pair label="Withdraw reason" value={row.withdraw_reason} />}
            {row.suspend_reason && <Pair label="Suspend reason" value={row.suspend_reason} />}
            {row.emergency_cancel_reason && <Pair label="Emergency cancel reason" value={row.emergency_cancel_reason} />}
            {row.outage_reason && <Pair label="Outage reason" value={row.outage_reason} />}
            {row.outage_type && <Pair label="Outage type" value={row.outage_type} />}
          </div>

          {row.sla_deadline_at && !row.is_terminal && (
            <Pair label="Next SLA" value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` - ${row.escalation_level} breach(es)` : ''}`} />
          )}

          {transitionable && (
            <div className="border-t border-[#eef2f6] pt-4">
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                {cs === 'outage_requested' && (
                  <ActionBtn label="Start security assessment (planner)" onClick={() => {
                    const margin = window.prompt('Initial security margin pct (optional):') ?? undefined;
                    const load = window.prompt('Actual load MW (optional):') ?? undefined;
                    const lim = window.prompt('Thermal limit MW (optional):') ?? undefined;
                    void doAction('start-security-assessment', {
                      security_margin_pct: margin ? Number(margin) : undefined,
                      actual_load_mw: load ? Number(load) : undefined,
                      thermal_limit_mw: lim ? Number(lim) : undefined,
                    });
                  }} />
                )}
                {cs === 'security_assessment' && (
                  <ActionBtn label="Run N-1 contingency (SO)" onClick={() => {
                    const pass = window.prompt('N-1 pass count:') ?? undefined;
                    const fail = window.prompt('N-1 fail count:') ?? undefined;
                    const summary = window.prompt('N-1 summary (optional):') ?? undefined;
                    void doAction('run-n1-contingency', {
                      n1_pass_count: pass ? Number(pass) : undefined,
                      n1_fail_count: fail ? Number(fail) : undefined,
                      n1_summary: summary,
                    });
                  }} />
                )}
                {cs === 'n1_contingency_run' && (
                  <ActionBtn label="Submit to committee (committee)" onClick={() => { void doAction('submit-to-reliability-committee', {}); }} />
                )}
                {cs === 'reliability_committee_review' && (
                  <>
                    <ActionBtn label="Approve outage (committee)" tone="good" onClick={() => { void doAction('approve-outage', {}); }} />
                    <ActionBtn label="Reject outage (committee)" tone="bad" onClick={() => {
                      const reason = window.prompt('Reject reason:') ?? undefined;
                      void doAction('reject-outage', { reject_reason: reason });
                    }} />
                  </>
                )}
                {cs === 'outage_approved' && (
                  <ActionBtn label="Open outage window (SO)" tone="good" onClick={() => {
                    const start = window.prompt('Scheduled start ISO (optional):') ?? undefined;
                    const end = window.prompt('Scheduled end ISO (optional):') ?? undefined;
                    void doAction('open-outage-window', {
                      scheduled_start_at: start,
                      scheduled_end_at: end,
                    });
                  }} />
                )}
                {cs === 'outage_window_open' && (
                  <ActionBtn label="Commence outage (SO)" onClick={() => {
                    const start = window.prompt('Actual start ISO (optional, defaults now):') ?? undefined;
                    void doAction('commence-outage', { actual_start_at: start });
                  }} />
                )}
                {cs === 'outage_in_progress' && (
                  <>
                    <ActionBtn label="Suspend outage (SO)" tone="bad" onClick={() => {
                      const reason = window.prompt('Suspend reason:') ?? undefined;
                      void doAction('suspend-outage', { suspend_reason: reason });
                    }} />
                    <ActionBtn label="Extend outage (committee)" onClick={() => {
                      const hrs = window.prompt('Extension hours granted:') ?? undefined;
                      const end = window.prompt('New scheduled end ISO (optional):') ?? undefined;
                      void doAction('extend-outage', {
                        extension_hours_granted: hrs ? Number(hrs) : undefined,
                        scheduled_end_at: end,
                      });
                    }} />
                    <ActionBtn label="Complete outage (SO)" tone="good" onClick={() => {
                      const end = window.prompt('Actual end ISO (optional, defaults now):') ?? undefined;
                      void doAction('complete-outage', { actual_end_at: end });
                    }} />
                  </>
                )}
                {cs === 'suspended' && (
                  <>
                    <ActionBtn label="Resume outage (SO)" tone="good" onClick={() => { void doAction('resume-outage', {}); }} />
                  </>
                )}
                {cs === 'extended' && (
                  <>
                    <ActionBtn label="Resume outage (SO)" tone="good" onClick={() => { void doAction('resume-outage', {}); }} />
                    <ActionBtn label="Complete outage (SO)" tone="good" onClick={() => {
                      const end = window.prompt('Actual end ISO (optional, defaults now):') ?? undefined;
                      void doAction('complete-outage', { actual_end_at: end });
                    }} />
                  </>
                )}
                {cs === 'outage_completed' && (
                  <ActionBtn label="Verify return to service (SO)" tone="good" onClick={() => {
                    const pass = window.confirm('RTS test passed?');
                    void doAction('verify-return-to-service', { rts_test_passed: pass ? 1 : 0 });
                  }} />
                )}
                {cs === 'return_to_service' && (
                  <ActionBtn label="Close post-outage review (archiver)" onClick={() => { void doAction('close-post-outage-review', {}); }} />
                )}
                {cs === 'post_outage_review' && (
                  <ActionBtn label="Archive outage (archiver)" onClick={() => { void doAction('archive-outage', {}); }} />
                )}

                {/* emergency_cancel — universal, from any non-terminal */}
                {!row.is_terminal && cs !== 'emergency_cancelled' && (
                  <ActionBtn label="Emergency cancel (SO)" tone="bad" onClick={() => {
                    const reason = window.prompt('Emergency cancel reason:') ?? undefined;
                    void doAction('emergency-cancel', { emergency_cancel_reason: reason });
                  }} />
                )}

                {/* withdraw — pre-approval only */}
                {(cs === 'outage_requested' || cs === 'security_assessment'
                  || cs === 'n1_contingency_run' || cs === 'reliability_committee_review') && (
                  <ActionBtn label="Withdraw (planner)" onClick={() => {
                    const reason = window.prompt('Withdraw reason:') ?? undefined;
                    void doAction('withdraw', { withdraw_reason: reason });
                  }} />
                )}
              </div>
            </div>
          )}

          <div className="border-t border-[#eef2f6] pt-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Timeline</div>
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-[12px] text-[#6b7685]">No events yet.</div>
              ) : events.map((e) => {
                const partyTone = PARTY_TONE[e.actor_party ?? 'system'] ?? PARTY_TONE.system;
                return (
                  <div key={e.id} className="flex gap-3 text-[12px] border-l-2 border-[#e5ebf2] pl-3 py-1">
                    <span className="font-mono text-[11px] text-[#6b7685] whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</span>
                    <div>
                      <span className="font-semibold text-[#0f1c2e]">{e.event_type}</span>
                      {e.actor_party && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase" style={{ background: partyTone.bg, color: partyTone.fg }}>
                          {e.actor_party}
                        </span>
                      )}
                      {e.from_status && e.to_status && e.from_status !== e.to_status && (
                        <span className="text-[#6b7685]"> {'· '}{e.from_status} {'→'} {e.to_status}</span>
                      )}
                      {e.notes && <div className="text-[#4a5568] mt-0.5">{e.notes}</div>}
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
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="text-[#0f1c2e] mt-0.5">{value}</div>
    </div>
  );
}

function FlagPill({ on, label }: { on: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-md text-[12px] ${on ? 'bg-[#fff4d6] text-[#a06200] border border-[#f4d68f]' : 'bg-[#f7f9fb] text-[#6b7685] border border-[#e5ebf2]'}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${on ? 'bg-[#a06200]' : 'bg-[#cbd5e0]'}`} />
      <span>{label}</span>
    </div>
  );
}

function ActionBtn({ label, onClick, tone = 'neutral' }: { label: string; onClick: () => void; tone?: 'neutral' | 'good' | 'bad' }) {
  const bg = tone === 'good' ? 'bg-emerald-700' : tone === 'bad' ? 'bg-red-700' : 'bg-[#1a3a5c]';
  return (
    <button onClick={onClick} className={`px-3 py-1.5 ${bg} text-white text-[12px] rounded-md hover:opacity-90`}>
      {label}
    </button>
  );
}
