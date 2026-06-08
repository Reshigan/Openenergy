// Wave 105 - Grid Wholesale Imbalance Settlement & MTU Pricing chain tab.
// The financial settlement engine of the SO balancing mechanism. Sister
// of W13 dispatch nominations (the PRE side) and W50 reserve activation
// (the SUPPLY side). W105 is the post-fact per-MTU (market time unit /
// settlement period) settlement: actual vs nominated imbalance MWh times
// imbalance price times penalty multiplier, posted to BRPs, with dispute
// window, settled. 12-state P6 lifecycle (period_open ->
// meter_data_received -> nominations_reconciled -> imbalance_computed
// -> priced -> invoice_issued -> invoice_acknowledged ->
// dispute_window_open -> payment_pending -> settled -> archived) plus
// disputed / resolved_dispute / invoice_revised / aged_arrears branches
// and cancelled. Tier RE-DERIVED on every transition from
// imbalance_quantum_zar (minor<100k / standard<1m / material<10m /
// systemic>=10m), FLOOR-AT-MATERIAL on any one of 5 floor flags,
// FLOOR-AT-SYSTEMIC on high_voltage_brp OR system_critical_period.
// URGENT SLA polarity (higher tier = TIGHTER, systemic 12h on
// period_open, minor 14d). 4-step authority ladder (BRP_back_office ->
// BRP_finance_manager -> BRP_treasurer -> MO_settlement_admin).
//
// Beats PJM iMM Imbalance Settlement, ERCOT QSE Real-Time Settlement,
// CAISO Imbalance Settlement, NEM AEMO Settlement Statements, Nord Pool
// Imbalance Settlement, ENTSO-E Imbalance Settlement, National Grid ESO
// BSC Settlement, Hitachi Lumada Market Operations, Open Access
// Technology, Powel Pulse via LIVE coverage battery (imbalance direction,
// charge ZAR, penalty ZAR, total owed, completeness 0-130, urgency band,
// breach-imminent flag, days to dispute window close, authority required,
// regulator filing window hours, bridges to W13 dispatch chain + W50
// reserve chain, aged arrears bucket) composed every fetch from raw
// inputs.
//
// SIGNATURE regulator crossings:
//   raise_dispute   -> regulator EVERY tier when high_voltage_brp=TRUE
//   mark_settled    -> regulator on material + systemic when penalty_zar>0
//   aged_arrears    -> regulator EVERY tier when arrears_days >= 60
//   cancel_period   -> regulator EVERY tier when imbalance_mwh != 0
//   sla_breached    -> regulator on material + systemic
//
// Mounted on Grid workstation (primary write {admin,grid_operator}); READ
// all 9 personas.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'period_open' | 'meter_data_received' | 'nominations_reconciled'
  | 'imbalance_computed' | 'priced' | 'invoice_issued' | 'invoice_acknowledged'
  | 'dispute_window_open' | 'payment_pending' | 'settled' | 'archived' | 'cancelled'
  | 'disputed' | 'resolved_dispute' | 'invoice_revised' | 'aged_arrears';

type Tier = 'minor' | 'standard' | 'material' | 'systemic';

type UrgencyBand = 'critical' | 'high' | 'medium' | 'low';

type Authority = 'BRP_back_office' | 'BRP_finance_manager' | 'BRP_treasurer' | 'MO_settlement_admin';

type Party =
  | 'system_operator' | 'settlement_admin' | 'brp'
  | 'reviewer' | 'archiver' | 'system';

interface ImbRow {
  id: string;
  settlement_number: string;
  brp_id: string;
  brp_label: string | null;
  brp_voltage_class: string | null;
  market_zone: string | null;
  market_time_unit_minutes: number;
  settlement_period_start_at: string;
  settlement_period_end_at: string;
  nominated_mwh: number;
  metered_mwh: number;
  imbalance_mwh: number;
  imbalance_direction: string | null;
  long_price_zar_per_mwh: number;
  short_price_zar_per_mwh: number;
  price_applied_zar_per_mwh: number;
  penalty_multiplier: number;
  imbalance_charge_zar: number;
  penalty_zar: number;
  total_owed_zar: number;
  amount_paid_zar: number;
  amount_outstanding_zar: number;
  imbalance_quantum_zar: number;
  dispatch_nomination_ref: string | null;
  reserve_activation_ref: string | null;
  invoice_number: string | null;
  invoice_issued_at: string | null;
  invoice_due_at: string | null;
  invoice_revised_count: number;
  dispute_window_close_at: string | null;
  dispute_reason_code: string | null;
  dispute_narrative: string | null;
  dispute_resolution_text: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  payment_received_at: string | null;
  arrears_days: number;
  arrears_bucket: string | null;
  aged_arrears_at: string | null;
  imbalance_floor_flag_high_voltage_brp: number;
  imbalance_floor_flag_system_critical_period: number;
  imbalance_floor_flag_regulator_audit_period: number;
  imbalance_floor_flag_market_suspension_active: number;
  imbalance_floor_flag_repeated_breach_5plus: number;
  current_tier: Tier;
  authority_required: Authority | null;
  urgency_band: string | null;
  title: string | null;
  narrative: string | null;
  cancel_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  period_opened_at: string | null;
  meter_data_received_at: string | null;
  nominations_reconciled_at: string | null;
  imbalance_computed_at: string | null;
  priced_at: string | null;
  invoice_acknowledged_at: string | null;
  dispute_window_opened_at: string | null;
  disputed_at: string | null;
  resolved_dispute_at: string | null;
  invoice_revised_at: string | null;
  payment_pending_at: string | null;
  settled_at: string | null;
  archived_at: string | null;
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
  imbalance_direction_live?: 'long' | 'short' | 'balanced';
  price_applied_zar_per_mwh_live?: number;
  imbalance_charge_zar_live?: number;
  penalty_zar_live?: number;
  total_owed_zar_live?: number;
  arrears_days_live?: number;
  arrears_bucket_live?: string;
  settlement_completeness_index_live?: number;
  sla_days_remaining_live?: number | null;
  urgency_band_live?: UrgencyBand;
  breach_imminent_flag_live?: boolean;
  regulator_filing_window_hours_live?: number | null;
  authority_required_live?: Authority;
  days_to_dispute_window_close_live?: number | null;
  bridges_to_dispatch_chain_live?: boolean;
  bridges_to_reserve_activation_chain_live?: boolean;
}

interface ImbEvent {
  id: string;
  settlement_id: string;
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
  dispute_open_count: number;
  aged_arrears_count: number;
  systemic_count: number;
  breached: number;
  reportable_total: number;
  dispatch_bridged_count: number;
  reserve_bridged_count: number;
  total_owed_zar: number;
  total_outstanding_zar: number;
  avg_settlement_hours: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  period_open:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'Period open' },
  meter_data_received:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Meter data' },
  nominations_reconciled: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Reconciled' },
  imbalance_computed:     { bg: '#fff4d6', fg: '#a06200', label: 'Computed' },
  priced:                 { bg: '#fff4d6', fg: '#a06200', label: 'Priced' },
  invoice_issued:         { bg: '#fff4d6', fg: '#a06200', label: 'Invoiced' },
  invoice_acknowledged:   { bg: '#fff4d6', fg: '#a06200', label: 'Acknowledged' },
  dispute_window_open:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Window open' },
  disputed:               { bg: '#fbd0d0', fg: '#7a1414', label: 'Disputed' },
  resolved_dispute:       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Dispute resolved' },
  invoice_revised:        { bg: '#fff4d6', fg: '#a06200', label: 'Revised' },
  payment_pending:        { bg: '#fde0e0', fg: '#9b1f1f', label: 'Payment pending' },
  aged_arrears:           { bg: '#fbd0d0', fg: '#7a1414', label: 'Aged arrears' },
  settled:                { bg: '#daf5e2', fg: '#1f6b3a', label: 'Settled' },
  archived:               { bg: '#e3e7ec', fg: '#557',    label: 'Archived' },
  cancelled:              { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material' },
  systemic: { bg: '#fbd0d0', fg: '#7a1414', label: 'Systemic' },
};

const URGENCY_TONE: Record<UrgencyBand, { bg: string; fg: string; label: string }> = {
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
  medium:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Medium' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical: { bg: '#fbd0d0', fg: '#7a1414', label: 'Critical' },
};

const AUTH_LABEL: Record<Authority, string> = {
  BRP_back_office:    'BRP back office',
  BRP_finance_manager:'BRP finance manager',
  BRP_treasurer:      'BRP treasurer',
  MO_settlement_admin:'MO settlement admin',
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  system_operator:  { bg: '#dbecfb', fg: '#1a3a5c' },
  settlement_admin: { bg: '#e8defc', fg: '#5320a3' },
  brp:              { bg: '#fff4d6', fg: '#a06200' },
  reviewer:         { bg: '#daf5e2', fg: '#1f6b3a' },
  archiver:         { bg: '#e3e7ec', fg: '#557' },
  system:           { bg: '#e3e7ec', fg: '#557' },
};

// UX revisit 2026-05-30 - pills grouped action-first then state. The
// settlement admin opens for SLA breach, disputes, aged arrears, and
// systemic-tier exposure first. Action row carries those plus tier slicers
// and bridge filters to W13/W50; state row enumerates the lifecycle.
const FILTER_ROW_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',           label: 'Active (pre-terminal)' },
  { key: 'all',              label: 'All' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'critical_urgency', label: 'Critical urgency' },
  { key: 'dispute_open',     label: 'Dispute open' },
  { key: 'arrears',          label: 'Aged arrears' },
  { key: 'dispatch_bridged', label: 'Bridged to W13' },
  { key: 'reserve_bridged',  label: 'Bridged to W50' },
  { key: 'systemic',         label: 'Systemic' },
  { key: 'material',         label: 'Material' },
  { key: 'standard',         label: 'Standard' },
  { key: 'minor',            label: 'Minor' },
];

const FILTER_ROW_STATE: Array<{ key: string; label: string }> = [
  { key: 'period_open',            label: 'Period open' },
  { key: 'meter_data_received',    label: 'Meter data' },
  { key: 'nominations_reconciled', label: 'Reconciled' },
  { key: 'imbalance_computed',     label: 'Computed' },
  { key: 'priced',                 label: 'Priced' },
  { key: 'invoice_issued',         label: 'Invoiced' },
  { key: 'invoice_acknowledged',   label: 'Acknowledged' },
  { key: 'dispute_window_open',    label: 'Window open' },
  { key: 'disputed',               label: 'Disputed' },
  { key: 'resolved_dispute',       label: 'Resolved' },
  { key: 'invoice_revised',        label: 'Revised' },
  { key: 'payment_pending',        label: 'Payment pending' },
  { key: 'aged_arrears',           label: 'Aged arrears' },
  { key: 'settled',                label: 'Settled' },
];

const TIERS = new Set<string>(['minor', 'standard', 'material', 'systemic']);

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '-';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  const abs = Math.abs(v);
  if (abs >= 1000000) return `R${(v / 1000000).toFixed(2)}m`;
  if (abs >= 1000)    return `R${(v / 1000).toFixed(0)}k`;
  return `R${v.toFixed(0)}`;
}

function fmtMwh(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(1)} MWh`;
}

function fmtDays(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(digits)}d`;
}

function fmtHours(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(digits)}h`;
}

export function ImbalanceSettlementChainTab() {
  const [rows, setRows] = useState<ImbRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ImbRow | null>(null);
  const [events, setEvents] = useState<ImbEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: ImbRow[] } }>('/grid/imbalance-settlement/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d as any;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load imbalance settlements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ImbRow; events: ImbEvent[] } }>(`/grid/imbalance-settlement/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load settlement history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !r.is_terminal;
      if (filter === 'breached')         return r.sla_breached_live;
      if (filter === 'reportable')       return r.is_reportable_flag;
      if (filter === 'critical_urgency') return r.urgency_band_live === 'critical';
      if (filter === 'dispute_open')     return r.chain_status === 'dispute_window_open' || r.chain_status === 'disputed';
      if (filter === 'arrears')          return r.chain_status === 'aged_arrears' || (r.arrears_days_live ?? 0) >= 30;
      if (filter === 'dispatch_bridged') return r.bridges_to_dispatch_chain_live;
      if (filter === 'reserve_bridged')  return r.bridges_to_reserve_activation_chain_live;
      if (TIERS.has(filter))             return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/grid/imbalance-settlement/chain/${selected.id}/${path}`, body ?? {});
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [selected, load, loadEvents]);

  return (
    <div className="space-y-3">
      {/* UX revisit 2026-05-30 - KPI strip ordered so the four numbers the
          settlement admin opens for (SLA breach, dispute open, aged
          arrears, systemic tier) sit left. Total owed + total
          outstanding ZAR and avg settlement hours anchor right because
          those are the brag numbers vs PJM iMM / ERCOT QSE / CAISO. */}
      <div className="grid grid-cols-8 gap-3">
        <Kpi label="SLA breached"      value={kpis?.breached ?? 0}              tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Dispute open"      value={kpis?.dispute_open_count ?? 0}    tone={(kpis?.dispute_open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Aged arrears"      value={kpis?.aged_arrears_count ?? 0}    tone={(kpis?.aged_arrears_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Systemic tier"     value={kpis?.systemic_count ?? 0}        tone={(kpis?.systemic_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Active"            value={kpis?.active_count ?? 0} />
        <Kpi label="Total"             value={kpis?.total ?? 0} />
        <Kpi label="Total owed"        value={fmtZar(kpis?.total_owed_zar ?? 0)} />
        <Kpi label="Avg settlement"    value={fmtHours(kpis?.avg_settlement_hours ?? 0)} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_ROW_ACTION.map((f) => (
          <button type="button"
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
          <button type="button"
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
              <th className="px-3 py-2 text-left">Settlement #</th>
              <th className="px-3 py-2 text-left">BRP / zone</th>
              <th className="px-3 py-2 text-right">Imbalance</th>
              <th className="px-3 py-2 text-right">Owed</th>
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
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">No settlement periods match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const tierTone  = TIER_TONE[r.current_tier];
              const floored = !!(r.imbalance_floor_flag_high_voltage_brp
                || r.imbalance_floor_flag_system_critical_period
                || r.imbalance_floor_flag_regulator_audit_period
                || r.imbalance_floor_flag_market_suspension_active
                || r.imbalance_floor_flag_repeated_breach_5plus);
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.settlement_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.brp_label ?? r.brp_id} - ${r.market_zone ?? '-'}`}>
                    {r.brp_label ?? r.brp_id}
                    <span className="text-[#6b7685]"> - {r.market_zone ?? '-'} / {r.brp_voltage_class ?? '-'}</span>
                    {floored && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fff4d6] text-[#a06200]">FLOOR</span>}
                    {r.bridges_to_dispatch_chain_live && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#dbecfb] text-[#1a3a5c]">W13</span>}
                    {r.bridges_to_reserve_activation_chain_live && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#e8defc] text-[#5320a3]">W50</span>}
                    {(r.arrears_days_live ?? 0) >= 30 && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fde0e0] text-[#9b1f1f]">ARREARS {r.arrears_days_live}d</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">
                    {fmtMwh(r.imbalance_mwh)}
                    <div className="text-[10px] text-[#6b7685] uppercase">{r.imbalance_direction_live ?? r.imbalance_direction ?? '-'}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{fmtZar(r.total_owed_zar_live ?? r.total_owed_zar)}</td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{(r.settlement_completeness_index_live ?? 0).toFixed(0)}</td>
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
        <ImbDrawer
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

function ImbDrawer({
  row, events, onClose, doAction,
}: {
  row: ImbRow;
  events: ImbEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.chain_status;
  const transitionable = !row.is_hard_terminal;
  const cancellable = !row.is_hard_terminal && cs !== 'settled' && cs !== 'archived';
  const urgencyTone = row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live] : null;
  const authorityNow = row.authority_required_live ?? row.authority_required ?? null;
  const floored = !!(row.imbalance_floor_flag_high_voltage_brp
    || row.imbalance_floor_flag_system_critical_period
    || row.imbalance_floor_flag_regulator_audit_period
    || row.imbalance_floor_flag_market_suspension_active
    || row.imbalance_floor_flag_repeated_breach_5plus);

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
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Imbalance settlement {row.settlement_number}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
              {row.brp_label ?? row.brp_id} - {row.market_zone ?? '-'} {' · '} {new Date(row.settlement_period_start_at).toLocaleString()}
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
                <span className="px-2 py-0.5 rounded-full font-bold bg-[#fff4d6] text-[#a06200]">FLOOR</span>
              )}
              {row.is_reportable_flag && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Regulator reportable</span>
              )}
              {authorityNow && (
                <span className="px-2 py-0.5 rounded-full bg-[#dbecfb] text-[#1a3a5c] font-medium">Auth: {AUTH_LABEL[authorityNow]}</span>
              )}
              {row.bridges_to_dispatch_chain_live && (
                <span className="px-2 py-0.5 rounded-full bg-[#dbecfb] text-[#1a3a5c] font-medium">W13 dispatch bridge</span>
              )}
              {row.bridges_to_reserve_activation_chain_live && (
                <span className="px-2 py-0.5 rounded-full bg-[#e8defc] text-[#5320a3] font-medium">W50 reserve bridge</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">X</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Imbalance position</div>
            <div className="grid grid-cols-3 gap-3">
              <Pair label="Nominated" value={fmtMwh(row.nominated_mwh)} />
              <Pair label="Metered" value={fmtMwh(row.metered_mwh)} />
              <Pair label="Imbalance MWh" value={`${row.imbalance_mwh.toFixed(2)} (${row.imbalance_direction_live ?? row.imbalance_direction ?? '-'})`} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Long price" value={fmtZar(row.long_price_zar_per_mwh) + ' / MWh'} />
              <Pair label="Short price" value={fmtZar(row.short_price_zar_per_mwh) + ' / MWh'} />
              <Pair label="Applied price" value={fmtZar(row.price_applied_zar_per_mwh_live ?? row.price_applied_zar_per_mwh) + ' / MWh'} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Charge" value={fmtZar(row.imbalance_charge_zar_live ?? row.imbalance_charge_zar)} />
              <Pair label="Penalty" value={fmtZar(row.penalty_zar_live ?? row.penalty_zar) + ` (x${row.penalty_multiplier.toFixed(2)})`} />
              <Pair label="Total owed" value={fmtZar(row.total_owed_zar_live ?? row.total_owed_zar)} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Paid" value={fmtZar(row.amount_paid_zar)} />
              <Pair label="Outstanding" value={fmtZar(row.amount_outstanding_zar)} />
              <Pair label="Quantum (tier)" value={fmtZar(row.imbalance_quantum_zar)} />
            </div>
          </div>

          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Settlement battery</div>
            <div className="grid grid-cols-4 gap-3">
              <Pair label="Completeness" value={`${(row.settlement_completeness_index_live ?? 0).toFixed(0)} / 130`} />
              <Pair label="SLA days left" value={row.sla_days_remaining_live != null ? fmtDays(row.sla_days_remaining_live) : '-'} />
              <Pair label="Dispute window" value={row.days_to_dispute_window_close_live != null ? fmtDays(row.days_to_dispute_window_close_live) : '-'} />
              <Pair label="Reg filing window" value={row.regulator_filing_window_hours_live != null ? `${row.regulator_filing_window_hours_live}h` : '-'} />
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Arrears days" value={`${row.arrears_days_live ?? row.arrears_days}`} />
              <Pair label="Arrears bucket" value={row.arrears_bucket_live ?? row.arrears_bucket ?? '-'} />
              <Pair label="Revisions" value={`${row.invoice_revised_count}`} />
              <Pair label="Escalations" value={`${row.escalation_level}`} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Invoice #" value={row.invoice_number ?? '-'} />
              <Pair label="Invoice due" value={row.invoice_due_at ? new Date(row.invoice_due_at).toLocaleDateString() : '-'} />
              <Pair label="Payment ref" value={row.payment_reference ?? '-'} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FlagPill on={!!row.imbalance_floor_flag_high_voltage_brp} label="HV BRP (SYSTEMIC)" />
            <FlagPill on={!!row.imbalance_floor_flag_system_critical_period} label="System-critical period (SYSTEMIC)" />
            <FlagPill on={!!row.imbalance_floor_flag_regulator_audit_period} label="Regulator audit period (MATERIAL)" />
            <FlagPill on={!!row.imbalance_floor_flag_market_suspension_active} label="Market suspension (MATERIAL)" />
            <FlagPill on={!!row.imbalance_floor_flag_repeated_breach_5plus} label="Repeated breach 5+ (MATERIAL)" />
            <FlagPill on={!!row.regulator_relevant} label="Regulator relevant" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {row.dispatch_nomination_ref && <Pair label="W13 dispatch ref" value={row.dispatch_nomination_ref} />}
            {row.reserve_activation_ref && <Pair label="W50 reserve ref" value={row.reserve_activation_ref} />}
            {row.regulator_inbox_ref && <Pair label="Regulator inbox" value={row.regulator_inbox_ref} />}
            {row.regulator_ref && <Pair label="Regulator ref" value={row.regulator_ref} />}
            {row.dispute_reason_code && <Pair label="Dispute reason" value={row.dispute_reason_code} />}
            {row.dispute_resolution_text && <Pair label="Dispute resolution" value={row.dispute_resolution_text} />}
            {row.cancel_reason && <Pair label="Cancel reason" value={row.cancel_reason} />}
            {row.reason_code && <Pair label="Reason code" value={row.reason_code} />}
          </div>

          {row.sla_deadline_at && !row.is_terminal && (
            <Pair label="Next SLA" value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` - ${row.escalation_level} breach(es)` : ''}`} />
          )}

          {transitionable && (
            <div className="border-t border-[#eef2f6] pt-4">
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                {cs === 'period_open' && (
                  <ActionBtn label="Receive meter data (SO)" onClick={() => {
                    const mw = window.prompt('Metered MWh for the period:') ?? undefined;
                    void doAction('receive-meter-data', {
                      metered_mwh: mw ? Number(mw) : undefined,
                    });
                  }} />
                )}
                {cs === 'meter_data_received' && (
                  <ActionBtn label="Reconcile nominations (SO)" onClick={() => { void doAction('reconcile-nominations', {}); }} />
                )}
                {cs === 'nominations_reconciled' && (
                  <ActionBtn label="Compute imbalance (SO)" onClick={() => {
                    const q = window.prompt('Imbalance quantum ZAR (optional, sets tier):') ?? undefined;
                    void doAction('compute-imbalance', { imbalance_quantum_zar: q ? Number(q) : undefined });
                  }} />
                )}
                {cs === 'imbalance_computed' && (
                  <ActionBtn label="Price imbalance (SO)" onClick={() => {
                    const long = window.prompt('Long price ZAR/MWh:') ?? undefined;
                    const short = window.prompt('Short price ZAR/MWh:') ?? undefined;
                    const mult = window.prompt('Penalty multiplier (>=1):') ?? undefined;
                    void doAction('price-imbalance', {
                      long_price_zar_per_mwh: long ? Number(long) : undefined,
                      short_price_zar_per_mwh: short ? Number(short) : undefined,
                      penalty_multiplier: mult ? Number(mult) : undefined,
                    });
                  }} />
                )}
                {(cs === 'priced' || cs === 'invoice_revised') && (
                  <ActionBtn label="Issue invoice (settlement admin)" tone="good" onClick={() => {
                    const num = window.prompt('Invoice number (optional):') ?? undefined;
                    const due = window.prompt('Invoice due ISO (optional, default +14d):') ?? undefined;
                    void doAction('issue-invoice', {
                      invoice_number: num,
                      invoice_due_at: due,
                    });
                  }} />
                )}
                {cs === 'invoice_issued' && (
                  <ActionBtn label="Acknowledge invoice (BRP)" onClick={() => { void doAction('acknowledge-invoice', {}); }} />
                )}
                {cs === 'invoice_acknowledged' && (
                  <ActionBtn label="Open dispute window (settlement admin)" onClick={() => {
                    const close = window.prompt('Dispute window close ISO (optional, default +7d):') ?? undefined;
                    void doAction('open-dispute-window', { dispute_window_close_at: close });
                  }} />
                )}
                {cs === 'dispute_window_open' && (
                  <>
                    <ActionBtn label="Raise dispute (BRP)" tone="bad" onClick={() => {
                      const code = window.prompt('Dispute reason code:') ?? undefined;
                      const narrative = window.prompt('Dispute narrative (optional):') ?? undefined;
                      void doAction('raise-dispute', { dispute_reason_code: code, dispute_narrative: narrative });
                    }} />
                    <ActionBtn label="Record payment (BRP)" tone="good" onClick={() => {
                      const method = window.prompt('Payment method (eft/wire/cheque):') ?? undefined;
                      const ref = window.prompt('Payment reference:') ?? undefined;
                      const amt = window.prompt('Amount paid (ZAR):') ?? undefined;
                      void doAction('record-payment', {
                        payment_method: method,
                        payment_reference: ref,
                        amount_paid_zar: amt ? Number(amt) : undefined,
                      });
                    }} />
                  </>
                )}
                {cs === 'disputed' && (
                  <ActionBtn label="Resolve dispute (reviewer)" tone="good" onClick={() => {
                    const text = window.prompt('Dispute resolution text:') ?? undefined;
                    void doAction('resolve-dispute', { dispute_resolution_text: text });
                  }} />
                )}
                {cs === 'resolved_dispute' && (
                  <ActionBtn label="Revise invoice (settlement admin)" onClick={() => {
                    const long = window.prompt('Revised long price ZAR/MWh (optional):') ?? undefined;
                    const short = window.prompt('Revised short price ZAR/MWh (optional):') ?? undefined;
                    const q = window.prompt('Revised quantum ZAR (optional, sets tier):') ?? undefined;
                    void doAction('revise-invoice', {
                      long_price_zar_per_mwh: long ? Number(long) : undefined,
                      short_price_zar_per_mwh: short ? Number(short) : undefined,
                      imbalance_quantum_zar: q ? Number(q) : undefined,
                    });
                  }} />
                )}
                {(cs === 'payment_pending' || cs === 'aged_arrears') && (
                  <>
                    <ActionBtn label="Record payment (BRP)" tone="good" onClick={() => {
                      const method = window.prompt('Payment method (eft/wire/cheque):') ?? undefined;
                      const ref = window.prompt('Payment reference:') ?? undefined;
                      const amt = window.prompt('Amount paid (ZAR):') ?? undefined;
                      void doAction('record-payment', {
                        payment_method: method,
                        payment_reference: ref,
                        amount_paid_zar: amt ? Number(amt) : undefined,
                      });
                    }} />
                    {cs === 'payment_pending' && (
                      <ActionBtn label="Mark settled (settlement admin)" tone="good" onClick={() => { void doAction('mark-settled', {}); }} />
                    )}
                  </>
                )}
                {cs === 'settled' && (
                  <ActionBtn label="Archive period (archiver)" onClick={() => { void doAction('archive-period', {}); }} />
                )}
                {cancellable && (
                  <ActionBtn label="Cancel period" onClick={() => {
                    const reason = window.prompt('Cancel reason:') ?? undefined;
                    void doAction('cancel-period', { cancel_reason: reason });
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
    <button type="button" onClick={onClick} className={`px-3 py-1.5 ${bg} text-white text-[12px] rounded-md hover:opacity-90`}>
      {label}
    </button>
  );
}
